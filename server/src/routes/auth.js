import { Router } from 'express';
import crypto from 'node:crypto';
import { SESSION_COOKIE } from '../config.js';
import * as vaultCrypto from '../crypto.js';
import { clientIp } from '../utils/ip.js';
import { requireUnlocked } from '../middleware/auth.js';
import { HttpError } from '../utils/httpError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const newSessionToken = () => crypto.randomBytes(48).toString('base64url');

function setCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: false,
    maxAge: 24 * 3600 * 1000,
    path: '/',
  });
}

function clearCookie(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function authRouter({ store, sessions, rateLimiter }) {
  const router = Router();

  router.post('/setup', asyncHandler(async (req, res) => {
    const body = req.body || {};
    const password = typeof body.password === 'string' ? body.password : '';
    const confirm = typeof body.confirm_password === 'string' ? body.confirm_password : '';
    if (store.getConfig() !== null) {
      throw new HttpError(400, 'Vault is already set up');
    }
    if (password !== confirm) {
      throw new HttpError(400, 'Passwords do not match');
    }
    if (password.length < 8) {
      throw new HttpError(400, 'Master password must be at least 8 characters');
    }

    const salt = vaultCrypto.newSalt();
    const pwHash = await vaultCrypto.hashPassword(password, salt);
    store.setConfig(pwHash, salt);

    const key = await vaultCrypto.deriveKey(password, salt);
    sessions.setKey(key);

    const token = newSessionToken();
    sessions.createSession(token);
    setCookie(res, token);

    store.log('setup', 'vault', null, 'vault created', clientIp(req));
    res.json({ ok: true });
  }));

  router.post('/login', asyncHandler(async (req, res) => {
    const body = req.body || {};
    const password = typeof body.password === 'string' ? body.password : '';
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
    sessions.setKey(key);

    const token = newSessionToken();
    sessions.createSession(token);
    setCookie(res, token);

    store.log('login', 'vault', null, 'vault unlocked', ip);
    res.json({ ok: true });
  }));

  router.post('/change', asyncHandler(async (req, res) => {
    const body = req.body || {};
    const current = typeof body.current_password === 'string' ? body.current_password : '';
    const next = typeof body.new_password === 'string' ? body.new_password : '';
    const cfg = store.getConfig();
    if (cfg === null) {
      throw new HttpError(400, 'Vault is not set up');
    }
    const ok = await vaultCrypto.verifyPassword(current, cfg.salt, cfg.password_hash);
    if (!ok) {
      throw new HttpError(401, 'Current password is incorrect');
    }
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
  try {
    const plain = vaultCrypto.decryptBytes(oldKey, data);
    return vaultCrypto.encryptBytes(newKey, plain);
  } catch {
    return data;
  }
};

async function reencryptAll(store, oldKey, newKey) {
  for (const row of store.listPasswords()) {
    try {
      store.updatePassword(
        row.id,
        row.title,
        row.username,
        reEn(oldKey, newKey, row.encrypted_password),
        row.url,
        row.notes,
        row.category_id
      );
    } catch {
      // skip
    }
  }
  for (const row of store.listNotes()) {
    try {
      store.updateNote(row.id, row.title, reEn(oldKey, newKey, row.encrypted_content));
    } catch {
      // skip
    }
  }
  for (const row of store.listTotp()) {
    try {
      const enc = reEn(oldKey, newKey, row.encrypted_secret);
      store.db.prepare('UPDATE totp_entries SET encrypted_secret=? WHERE id=?').run(enc, row.id);
    } catch {
      // skip
    }
  }
  for (const note of store.listNotes()) {
    for (const att of store.listAttachments(note.id)) {
      try {
        const enc = reEn(oldKey, newKey, att.encrypted_data);
        store.db.prepare('UPDATE attachments SET encrypted_data=? WHERE id=?').run(enc, att.id);
      } catch {
        // skip
      }
    }
  }
}
