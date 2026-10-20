import { Router } from 'express';
import * as vaultCrypto from '../crypto.js';
import { requireUnlocked } from '../middleware/auth.js';
import { HttpError } from '../utils/httpError.js';

export function totpRouter({ store, sessions }) {
  const router = Router();
  const unlock = requireUnlocked(sessions);

  router.get('/', unlock, (req, res) => {
    const result = store.listTotp().map((r) => {
      const { encrypted_secret: _encrypted_secret, ...item } = r;
      return item;
    });
    res.json(result);
  });

  router.post('/', unlock, (req, res) => {
    const body = req.body || {};
    let secret = typeof body.secret === 'string' ? body.secret : '';
    let name = typeof body.name === 'string' ? body.name : '';
    let issuer = typeof body.issuer === 'string' ? body.issuer : '';
    let account = typeof body.account === 'string' ? body.account : '';
    let period = body.period !== null && body.period !== undefined ? Number(body.period) : 30;
    let digits = body.digits !== null && body.digits !== undefined ? Number(body.digits) : 6;
    let algorithm = String(body.algorithm || 'SHA1').toUpperCase();

    if (secret.toLowerCase().startsWith('otpauth://')) {
      const parsed = vaultCrypto.parseOtpauthUri(secret);
      secret = parsed.secret;
      name = name || parsed.account;
      issuer = issuer || parsed.issuer;
      account = account || parsed.account;
      period = parsed.period;
      digits = parsed.digits;
      algorithm = parsed.algorithm;
    }

    let secretBytes;
    try {
      secretBytes = vaultCrypto.base32Decode(secret);
    } catch (err) {
      throw new HttpError(400, err.message);
    }
    if (!['SHA1', 'SHA256', 'SHA512'].includes(algorithm)) {
      throw new HttpError(400, 'algorithm must be SHA1/SHA256/SHA512');
    }
    if (!Number.isInteger(digits) || digits < 6 || digits > 8) {
      throw new HttpError(400, 'digits must be 6-8');
    }
    if (!Number.isInteger(period) || period <= 0) {
      throw new HttpError(400, 'invalid period');
    }
    if (!name.trim()) {throw new HttpError(400, 'name is required');}

    const encrypted = vaultCrypto.encryptBytes(req.vaultKey, secretBytes);
    const totpId = store.createTotp(name, encrypted, issuer, account, period, digits, algorithm);
    const { encrypted_secret: _encrypted_secret, ...item } = store.getTotp(totpId);
    res.status(201).json(item);
  });

  router.get('/:totp_id/code', unlock, (req, res) => {
    const totpId = Number(req.params.totp_id);
    const row = store.getTotp(totpId);
    if (!row) {throw new HttpError(404, 'Not found');}
    let code;
    try {
      const secret = vaultCrypto.decryptBytes(req.vaultKey, row.encrypted_secret);
      code = vaultCrypto.totpCode(secret, {
        period: row.period,
        digits: row.digits,
        algorithm: row.algorithm,
      });
    } catch {
      throw new HttpError(500, 'Decryption failed');
    }
    res.json({
      code,
      period: row.period,
      remaining: vaultCrypto.totpRemaining(row.period),
      digits: row.digits,
      algorithm: row.algorithm,
    });
  });

  router.delete('/:totp_id', unlock, (req, res) => {
    const totpId = Number(req.params.totp_id);
    if (!store.getTotp(totpId)) {throw new HttpError(404, 'Not found');}
    store.deleteTotp(totpId);
    res.json({ ok: true });
  });

  return router;
}
