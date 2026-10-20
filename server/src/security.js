import { AUTO_LOCK_MINUTES, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_SECONDS } from './config.js';

export class SessionManager {
  constructor(autoLockMinutes = null) {
    this.sessions = new Map(); // token -> last activity epoch seconds
    this.autoLockMinutes = autoLockMinutes !== null ? autoLockMinutes : AUTO_LOCK_MINUTES;
    this.vaultKey = null; // Buffer or null
  }

  setKey(key) {
    this._wipeKey();
    this.vaultKey = key;
  }

  getKey() {
    return this.vaultKey;
  }

  isUnlocked() {
    return this.vaultKey !== null;
  }

  lockVault() {
    this._wipeKey();
    this.sessions.clear();
  }

  _wipeKey() {
    if (this.vaultKey !== null) {
      try {
        this.vaultKey.fill(0);
      } catch {
        // ignore
      }
      this.vaultKey = null;
    }
  }

  createSession(token) {
    this.sessions.set(token, Date.now() / 1000);
  }

  touch(token) {
    if (this.sessions.has(token)) {
      this.sessions.set(token, Date.now() / 1000);
    }
  }

  validate(token) {
    if (!token || !this.sessions.has(token)) {return false;}
    if (this.vaultKey === null) {return false;}
    if (this.autoLockMinutes > 0) {
      const last = this.sessions.get(token);
      if (Date.now() / 1000 - last > this.autoLockMinutes * 60) {
        this.sessions.delete(token);
        return false;
      }
    }
    this.sessions.set(token, Date.now() / 1000);
    return true;
  }

  destroy(token) {
    this.sessions.delete(token);
  }
}

export class LoginRateLimiter {
  constructor(maxAttempts = LOGIN_MAX_ATTEMPTS, windowSeconds = LOGIN_WINDOW_SECONDS) {
    this.maxAttempts = maxAttempts;
    this.window = windowSeconds;
    this.attempts = new Map(); // ip -> [timestamps]
  }

  allow(clientIp) {
    const now = Date.now() / 1000;
    const hits = (this.attempts.get(clientIp) || []).filter((t) => now - t < this.window);
    if (hits.length >= this.maxAttempts) {
      this.attempts.set(clientIp, hits);
      return false;
    }
    hits.push(now);
    this.attempts.set(clientIp, hits);
    return true;
  }

  reset(clientIp) {
    this.attempts.delete(clientIp);
  }
}
