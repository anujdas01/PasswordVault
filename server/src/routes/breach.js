import { Router } from 'express';
import * as vaultCrypto from '../crypto.js';
import { requireUnlocked } from '../middleware/auth.js';
import { HttpError } from '../utils/httpError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const HIBP_ENDPOINT = 'https://api.pwnedpasswords.com/range/';
const USER_AGENT = 'PasswordVault/1.0 (local password manager)';

async function checkPwned(password, timeout = 10000) {
  const fullHash = vaultCrypto.sha1Hex(password);
  const prefix = fullHash.slice(0, 5);
  const suffix = fullHash.slice(5);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let body;
  try {
    const resp = await fetch(HIBP_ENDPOINT + prefix, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    body = await resp.text();
  } finally {
    clearTimeout(timer);
  }
  for (const line of body.split('\n')) {
    const parts = line.split(':');
    if (parts.length === 2 && parts[0].trim().toUpperCase() === suffix) {
      return parseInt(parts[1].trim(), 10) || 0;
    }
  }
  return 0;
}

export function breachRouter({ store, sessions }) {
  const router = Router();
  const unlock = requireUnlocked(sessions);

  router.post('/check', unlock, asyncHandler(async (req, res) => {
    const body = req.body || {};
    const password = typeof body.password === 'string' ? body.password : '';
    if (!password || password.length > 1024) {
      throw new HttpError(400, 'password is required');
    }
    let count;
    try {
      count = await checkPwned(password);
    } catch (err) {
      throw new HttpError(502, `Could not reach breach service: ${err.message}`);
    }
    res.json({
      hash_prefix: vaultCrypto.sha1Hex(password).slice(0, 5).toLowerCase(),
      pwned: count > 0,
      count,
    });
  }));

  router.post('/audit-all', unlock, asyncHandler(async (req, res) => {
    const rows = store.allPasswordsForExport();
    const results = [];
    for (const r of rows) {
      try {
        const plain = vaultCrypto.decryptText(req.vaultKey, r.encrypted_password);
        const count = await checkPwned(plain);
        results.push({ id: r.id, title: r.title, pwned: count > 0, count });
      } catch {
        results.push({ id: r.id, title: r.title, pwned: false, count: 0 });
      }
    }
    res.json({ results });
  }));

  return router;
}
