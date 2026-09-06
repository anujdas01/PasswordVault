import { Router } from 'express';
import * as vaultCrypto from '../crypto.js';
import { requireUnlocked } from '../middleware/auth.js';
import { HttpError } from '../utils/httpError.js';

const num = (v, def) => {
  const n = Number(v);
  return Number.isNaN(n) ? def : n;
};

const bool = (v, def) => (typeof v === 'boolean' ? v : def);

export function generatorRouter({ sessions }) {
  const router = Router();
  const unlock = requireUnlocked(sessions);

  router.post('/', unlock, (req, res) => {
    const body = req.body || {};
    const length = num(body.length, 20);
    if (!Number.isInteger(length) || length < 1) throw new HttpError(400, 'length must be >= 1');
    if (length > 128) throw new HttpError(400, 'length must be <= 128');
    const count = num(body.count, 3);
    if (!Number.isInteger(count) || count < 1 || count > 10) {
      throw new HttpError(400, 'count must be 1-10');
    }
    const opts = {
      length,
      use_lower: bool(body.use_lower, true),
      use_upper: bool(body.use_upper, true),
      use_digits: bool(body.use_digits, true),
      use_symbols: bool(body.use_symbols, true),
      exclude_ambiguous: bool(body.exclude_ambiguous, false),
    };
    const results = [];
    for (let i = 0; i < count; i++) {
      const pwd = vaultCrypto.generatePassword(opts);
      const [label, rating] = vaultCrypto.strengthRating(pwd);
      results.push({
        password: pwd,
        entropy: Math.round(vaultCrypto.estimateEntropy(pwd) * 10) / 10,
        strength: label,
        rating,
      });
    }
    res.json({ results });
  });

  router.post('/strength', unlock, (req, res) => {
    const body = req.body || {};
    const password = typeof body.password === 'string' ? body.password : '';
    const [label, rating] = vaultCrypto.strengthRating(password);
    res.json({
      password,
      entropy: Math.round(vaultCrypto.estimateEntropy(password) * 10) / 10,
      strength: label,
      rating,
    });
  });

  return router;
}
