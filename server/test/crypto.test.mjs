import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as vaultCrypto from '../src/crypto.js';

describe('crypto', () => {
  describe('encrypt/decrypt roundtrip', () => {
    it('roundtrips text', async () => {
      const key = await vaultCrypto.deriveKey('test-password', Buffer.alloc(16, 0));
      const blob = vaultCrypto.encrypt(key, 'hello world');
      const out = vaultCrypto.decryptText(key, blob);
      assert.equal(out, 'hello world');
    });

    it('roundtrips bytes', async () => {
      const key = await vaultCrypto.deriveKey('test-password', Buffer.alloc(16, 0));
      const data = Buffer.from([1, 2, 3, 4, 5]);
      const blob = vaultCrypto.encryptBytes(key, data);
      const out = vaultCrypto.decryptBytes(key, blob);
      assert.deepEqual(out, data);
    });

    it('rejects tampered ciphertext', async () => {
      const key = await vaultCrypto.deriveKey('test-password', Buffer.alloc(16, 0));
      const blob = vaultCrypto.encrypt(key, 'hello world');
      const tampered = blob.slice(0, -1) + (blob[blob.length - 1] === 'A' ? 'B' : 'A');
      assert.throws(() => vaultCrypto.decryptText(key, tampered));
    });

    it('rejects invalid base64', async () => {
      const key = await vaultCrypto.deriveKey('test-password', Buffer.alloc(16, 0));
      assert.throws(() => vaultCrypto.decryptText(key, '!!!not-base64!!!'));
    });
  });

  describe('password strength', () => {
    it('rates empty as empty', () => {
      const [label] = vaultCrypto.strengthRating('');
      assert.equal(label, 'Empty');
    });

    it('rates short password as weak', () => {
      const [label] = vaultCrypto.strengthRating('abc');
      assert.equal(label, 'Very Weak');
    });

    it('rates long complex password as strong', () => {
      const [label] = vaultCrypto.strengthRating('Tr0ub4dor&3');
      assert.notEqual(label, 'Empty');
      assert.notEqual(label, 'Very Weak');
    });
  });

  describe('TOTP', () => {
    it('base32 decode roundtrip', () => {
      const bytes = vaultCrypto.base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
      assert.ok(bytes.length > 0);
    });

    it('rejects invalid base32', () => {
      assert.throws(() => vaultCrypto.base32Decode(' @#$%'));
    });

    it('totpCode returns 6-digit string', () => {
      const secret = vaultCrypto.base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
      const code = vaultCrypto.totpCode(secret, { at: 59 });
      assert.equal(code.length, 6);
      assert.ok(/^\d{6}$/.test(code));
    });
  });
});
