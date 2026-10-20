import { Router } from 'express';
import crypto from 'node:crypto';
import {
  SESSION_COOKIE,
  COOKIE_SECURE,
  CSRF_SECRET,
  MIN_PASSWORD_STRENGTH_RATING,
  TWO_FACTOR_ENABLED,
} from '../config.js';
import * as vaultCrypto from '../crypto.js';
import { clientIp } from '../utils/ip.js';
import { requireUnlocked } from '../middleware/auth.js';
import { HttpError } from '../utils/httpError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { string } from '../validation.js';

const newSessionToken = () => crypto.randomBytes(48).toString('base64url');
const CSRF_HEADER = 'x-csrf-token';
const CSRF_COOKIE = 'pv_csrf';

function setCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: COOKIE_SECURE,
    maxAge: 24 * 3600 * 1000,
    path: '/',
  });
}

function clearCookie(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
}

function newCsrfToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function validateCsrf(req) {
  if (!CSRF_SECRET) {return true;}
  const token = req.headers[CSRF_HEADER] || req.body?._csrf;
  if (!token) {return false;}
  try {
    const expected = crypto
      .createHmac('sha256', CSRF_SECRET)
      .update(req.cookies?.[CSRF_COOKIE] || '')
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function authRouter({ store, sessions, rateLimiter }) {
  const router = Router();

  // Pending two-factor challenges: token -> { key, ip, expiresAt }
  const pendingTwoFactor = new Map();
  const TWO_FACTOR_WINDOW_MS = 5 * 60 * 1000;

  // CSRF protection for state-changing requests (when CSRF_SECRET is configured).
  router.use((req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !validateCsrf(req)) {
      return res.status(403).json({ detail: 'CSRF token missing or invalid' });
    }
    next();
  });

  router.post('/setup', asyncHandler(async (req, res) => {
    const body = req.body || {};
    const password = string(body.password, { field: 'password' });
    const confirm = string(body.confirm_password, { field: 'confirm_password' });
    if (store.getConfig() !== null) {
      throw new HttpError(400, 'Vault is already set up');
    }
    if (password !== confirm) {
      throw new HttpError(400, 'Passwords do not match');
    }
    if (password.length < 8) {
      throw new HttpError(400, 'Master password must be at least 8 characters');
    }
    vaultCrypto.requireStrength(password, MIN_PASSWORD_STRENGTH_RATING);

    const salt = vaultCrypto.newSalt();
    const pwHash = await vaultCrypto.hashPassword(password, salt);
    store.setConfig(pwHash, salt);

    const key = await vaultCrypto.deriveKey(password, salt);
    sessions.setKey(key);

    const token = newSessionToken();
    sessions.createSession(token);
    setCookie(res, token);
    res.cookie(CSRF_COOKIE, newCsrfToken(), {
      httpOnly: false,
      sameSite: 'strict',
      secure: COOKIE_SECURE,
      maxAge: 24 * 3600 * 1000,
      path: '/',
    });

    store.log('setup', 'vault', null, 'vault created', clientIp(req));
    res.json({ ok: true });
  }));

  router.post('/login', asyncHandler(async (req, res) => {
    const body = req.body || {};
    const password = string(body.password, { field: 'password', allowEmpty: true });
    const cfg = store.getConfig();
    if (cfg === null) {
      throw new HttpError(400, 'Vault is not set up yet');
    }
    const ip = clientIp(req);
    if (!rateLimiter.allow(ip)) {
      throw new HttpError(429, 'Too many login attempts. Try again later.');
    }
    const ok = await vaultCrypto.verifyPassword(password, cfg.salt, cfg.password_hash);
    if (!ok) {
      throw new HttpError(401, 'Incorrect master password');
    }
    rateLimiter.reset(ip);

    const key = await vaultCrypto.deriveKey(password, cfg.salt);

    // Two-factor: if enabled, issue a challenge instead of creating the session.
    if (TWO_FACTOR_ENABLED) {
      const challenge = crypto.randomBytes(24).toString('base64url');
      pendingTwoFactor.set(challenge, {
        key,
        ip,
        expiresAt: Date.now() + TWO_FACTOR_WINDOW_MS,
      });
      store.log('login', 'vault', null, '2fa challenge issued', ip);
      return res.json({ ok: true, requires_2fa: true, challenge });
    }

    sessions.setKey(key);
    const token = newSessionToken();
    sessions.createSession(token);
    setCookie(res, token);
    res.cookie(CSRF_COOKIE, newCsrfToken(), {
      httpOnly: false,
      sameSite: 'strict',
      secure: COOKIE_SECURE,
      maxAge: 24 * 3600 * 1000,
      path: '/',
    });

    store.log('login', 'vault', null, 'vault unlocked', ip);
    res.json({ ok: true });
  }));

  router.post('/login/totp', asyncHandler(async (req, res) => {
    const body = req.body || {};
    const challenge = string(body.challenge, { field: 'challenge' });
    const totpCode = string(body.totp_code, { field: 'totp_code' });

    const pending = pendingTwoFactor.get(challenge);
    if (!pending) {
      throw new HttpError(401, 'Invalid or expired 2fa challenge');
    }
    if (Date.now() > pending.expiresAt) {
      pendingTwoFactor.delete(challenge);
      throw new HttpError(401, '2fa challenge expired');
    }

    // Find the TOTP entry configured for 2fa (first entry, or any valid one).
    const totpRows = store.listTotp();
    if (totpRows.length === 0) {
      throw new HttpError(400, 'No totp entries configured for 2fa');
    }

    let verified = false;
    for (const row of totpRows) {
      try {
        const secret = vaultCrypto.decryptBytes(pending.key, row.encrypted_secret);
        const code = vaultCrypto.totpCode(secret, {
          period: row.period,
          digits: row.digits,
          algorithm: row.algorithm,
        });
        if (code === totpCode) {
          verified = true;
          break;
        }
      } catch {
        // continue trying other entries
      }
    }

    if (!verified) {
      throw new HttpError(401, 'Invalid totp code');
    }

    pendingTwoFactor.delete(challenge);
    sessions.setKey(pending.key);
    const token = newSessionToken();
    sessions.createSession(token);
    setCookie(res, token);
    res.cookie(CSRF_COOKIE, newCsrfToken(), {
      httpOnly: false,
      sameSite: 'strict',
      secure: COOKIE_SECURE,
      maxAge: 24 * 3600 * 1000,
      path: '/',
    });

    store.log('login', 'vault', null, 'vault unlocked (2fa)', pending.ip);
    res.json({ ok: true });
  }));

  router.post('/change', asyncHandler(async (req, res) => {
    const body = req.body || {};
    const current = string(body.current_password, { field: 'current_password', allowEmpty: true });
    const next = string(body.new_password, { field: 'new_password' });
    const cfg = store.getConfig();
    if (cfg === null) {
      throw new HttpError(400, 'Vault is not set up');
    }
    const ok = await vaultCrypto.verifyPassword(current, cfg.salt, cfg.password_hash);
    if (!ok) {
      throw new HttpError(401, 'Current password is incorrect');
    }
    vaultCrypto.requireStrength(next, MIN_PASSWORD_STRENGTH_RATING);
    const oldKey = await vaultCrypto.deriveKey(current, cfg.salt);
    const newSalt = vaultCrypto.newSalt();
    const newKey = await vaultCrypto.deriveKey(next, newSalt);
    const newHash = await vaultCrypto.hashPassword(next, newSalt);

    await reencryptAll(store, oldKey, newKey);

    store.setConfig(newHash, newSalt);
    sessions.setKey(newKey);
    store.log('update', 'vault', null, 'master password changed', clientIp(req));
    res.json({ ok: true });
  }));

  router.post('/clear', requireUnlocked(sessions), (req, res) => {
    const body = req.body || {};
    const mode = typeof body.mode === 'string' ? body.mode : req.query.mode || 'data';
    if (store.getConfig() === null) {
      throw new HttpError(400, 'Vault is not set up');
    }
    if (mode === 'factory') {
      store.resetVault();
      sessions.lockVault();
      clearCookie(res);
      store.log('clear', 'vault', null, 'vault factory reset', clientIp(req));
      return res.json({ ok: true, mode: 'factory', setup_required: true });
    }
    store.clearAllData();
    store.log('clear', 'vault', null, 'all vault data cleared', clientIp(req));
    res.json({ ok: true, mode: 'data', setup_required: false });
  });

  router.post('/lock', (req, res) => {
    sessions.lockVault();
    clearCookie(res);
    store.log('lock', 'vault', null, 'vault locked', clientIp(req));
    res.json({ ok: true });
  });

  router.get('/status', (req, res) => {
    res.json({
      setup_required: store.getConfig() === null,
      unlocked: sessions.isUnlocked(),
      auto_lock_minutes: sessions.autoLockMinutes,
    });
  });

  return router;
}

const reEn = (oldKey, newKey, data) => {
  const plain = vaultCrypto.decryptBytes(oldKey, data);
  return vaultCrypto.encryptBytes(newKey, plain);
};

async function reencryptAll(store, oldKey, newKey) {
  const failures = [];
  const reencrypt = (fieldName, encValue, updater, label) => {
    try {
      updater(reEn(oldKey, newKey, encValue));
    } catch (err) {
      failures.push(`${label}: ${err.message}`);
    }
  };

  for (const row of store.listPasswords()) {
    reencrypt(
      'encrypted_password',
      row.encrypted_password,
      (enc) => store.updatePassword(row.id, row.title, row.username, enc, row.url, row.notes, row.category_id),
      `password id=${row.id}`
    );
  }
  for (const row of store.listNotes()) {
    reencrypt(
      'encrypted_content',
      row.encrypted_content,
      (enc) => store.updateNote(row.id, row.title, enc),
      `note id=${row.id}`
    );
  }
  for (const row of store.listTotp()) {
    reencrypt(
      'encrypted_secret',
      row.encrypted_secret,
      (enc) => store.db.prepare('UPDATE totp_entries SET encrypted_secret=? WHERE id=?').run(enc, row.id),
      `totp id=${row.id}`
    );
  }
  for (const note of store.listNotes()) {
    for (const att of store.listAttachments(note.id)) {
      reencrypt(
        'encrypted_data',
        att.encrypted_data,
        (enc) => store.db.prepare('UPDATE attachments SET encrypted_data=? WHERE id=?').run(enc, att.id),
        `attachment id=${att.id}`
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(`Re-encryption failed for ${failures.length} item(s): ${failures.join('; ')}`);
  }
}
