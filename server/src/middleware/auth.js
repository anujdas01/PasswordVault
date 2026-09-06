import { SESSION_COOKIE } from '../config.js';

export function requireUnlocked(sessions) {
  return (req, res, next) => {
    const token = req.cookies?.[SESSION_COOKIE] || null;
    if (!token || !sessions.validate(token)) {
      return res.status(401).json({ detail: 'Not authenticated' });
    }
    req.vaultKey = sessions.getKey();
    next();
  };
}
