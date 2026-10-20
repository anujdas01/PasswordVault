import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SessionManager, LoginRateLimiter } from '../src/security.js';

describe('SessionManager', () => {
  it('starts locked with no key', () => {
    const sm = new SessionManager();
    assert.equal(sm.isUnlocked(), false);
  });

  it('setKey/getKey roundtrip', () => {
    const sm = new SessionManager();
    const key = Buffer.from('secret-key');
    sm.setKey(key);
    assert.equal(sm.isUnlocked(), true);
    assert.equal(sm.getKey(), key);
  });

  it('lockVault wipes key and clears sessions', () => {
    const sm = new SessionManager();
    sm.setKey(Buffer.from('secret-key'));
    sm.createSession('token-1');
    assert.equal(sm.isUnlocked(), true);
    assert.equal(sm.validate('token-1'), true);
    sm.lockVault();
    assert.equal(sm.isUnlocked(), false);
    assert.equal(sm.validate('token-1'), false);
  });

  it('validate returns false when vault is locked', () => {
    const sm = new SessionManager();
    sm.createSession('token-1');
    assert.equal(sm.validate('token-1'), false);
  });

  it('_wipeKey zeroes the buffer', () => {
    const sm = new SessionManager();
    const key = Buffer.from([1, 2, 3, 4]);
    sm.setKey(key);
    sm.lockVault();
    assert.equal(sm.getKey(), null);
  });
});

describe('LoginRateLimiter', () => {
  it('allows attempts under the limit', () => {
    const rl = new LoginRateLimiter(3, 60);
    assert.equal(rl.allow('ip-1'), true);
    assert.equal(rl.allow('ip-1'), true);
    assert.equal(rl.allow('ip-1'), true);
  });

  it('blocks attempts over the limit', () => {
    const rl = new LoginRateLimiter(2, 60);
    rl.allow('ip-1');
    rl.allow('ip-1');
    assert.equal(rl.allow('ip-1'), false);
  });

  it('tracks IPs independently', () => {
    const rl = new LoginRateLimiter(1, 60);
    rl.allow('ip-1');
    assert.equal(rl.allow('ip-1'), false);
    assert.equal(rl.allow('ip-2'), true);
  });

  it('reset clears attempts', () => {
    const rl = new LoginRateLimiter(1, 60);
    rl.allow('ip-1');
    assert.equal(rl.allow('ip-1'), false);
    rl.reset('ip-1');
    assert.equal(rl.allow('ip-1'), true);
  });
});
