import crypto from 'node:crypto';
import { argon2id } from 'hash-wasm';
import {
  ARGON2_MEMORY_KIB,
  ARGON2_TIME,
  ARGON2_PARALLELISM,
  KEY_LEN,
  NONCE_LEN,
} from './config.js';

export class CryptoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CryptoError';
  }
}

const _secureRandom = (n) => crypto.randomBytes(n);

export async function deriveKey(password, salt) {
  const out = await argon2id({
    password,
    salt,
    iterations: ARGON2_TIME,
    parallelism: ARGON2_PARALLELISM,
    memorySize: ARGON2_MEMORY_KIB,
    hashLength: KEY_LEN,
    outputType: 'binary',
  });
  return out;
}

export async function hashPassword(password, salt) {
  const out = await argon2id({
    password,
    salt,
    iterations: ARGON2_TIME,
    parallelism: ARGON2_PARALLELISM,
    memorySize: ARGON2_MEMORY_KIB,
    hashLength: 32,
    outputType: 'binary',
  });
  return out;
}

export async function verifyPassword(password, salt, expected) {
  const actual = await hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function newSalt() {
  return _secureRandom(16);
}

export function encrypt(key, plaintext) {
  const data = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(String(plaintext), 'utf-8');
  const nonce = _secureRandom(NONCE_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, enc, tag]).toString('base64');
}

export function decrypt(key, blob) {
  let raw;
  try {
    raw = Buffer.from(blob, 'base64');
  } catch {
    throw new CryptoError('invalid encrypted blob');
  }
  if (raw.length < NONCE_LEN) {
    throw new CryptoError('invalid encrypted blob');
  }
  const nonce = raw.subarray(0, NONCE_LEN);
  const rest = raw.subarray(NONCE_LEN);
  const tag = rest.subarray(rest.length - 16);
  const data = rest.subarray(0, rest.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(data), decipher.final()]);
  } catch {
    throw new CryptoError('decryption failed');
  }
}

export function decryptText(key, blob) {
  return decrypt(key, blob).toString('utf-8');
}

export function encryptBytes(key, data) {
  return encrypt(key, data);
}

export function decryptBytes(key, blob) {
  return decrypt(key, blob);
}

// ---------------------------------------------------------------------------
// Password generation
// ---------------------------------------------------------------------------

const _LOWER = 'abcdefghijklmnopqrstuvwxyz';
const _UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const _DIGITS = '0123456789';
const _SYMBOLS = '!@#$%^&*()-_=+[]{};:,.<>?/~';
const _AMBIGUOUS = "Il1O0o`'\"";

const _randChar = (charset) => charset[crypto.randomInt(charset.length)];

function secureShuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
}

export function generatePassword({
  length = 20,
  use_lower = true,
  use_upper = true,
  use_digits = true,
  use_symbols = true,
  exclude_ambiguous = false,
} = {}) {
  if (length < 1) throw new Error('length must be >= 1');
  length = Math.min(length, 128);

  const pools = [];
  if (use_lower) pools.push(_LOWER);
  if (use_upper) pools.push(_UPPER);
  if (use_digits) pools.push(_DIGITS);
  if (use_symbols) pools.push(_SYMBOLS);
  if (pools.length === 0) throw new Error('at least one character set is required');

  const clean = (pool) =>
    exclude_ambiguous ? pool.split('').filter((c) => !_AMBIGUOUS.includes(c)).join('') : pool;
  const cleanedPools = pools.map(clean);
  const charset = cleanedPools.join('');
  if (!charset) throw new Error('character set is empty after filtering');

  const chars = [];
  for (const pool of cleanedPools) {
    if (pool) chars.push(_randChar(pool));
  }
  while (chars.length < length) chars.push(_randChar(charset));

  secureShuffle(chars);
  return chars.join('');
}

export function estimateEntropy(password) {
  if (!password) return 0.0;
  const freq = {};
  for (const ch of password) freq[ch] = (freq[ch] || 0) + 1;
  const length = password.length;
  let perChar = 0.0;
  for (const count of Object.values(freq)) {
    const p = count / length;
    perChar -= p * Math.log2(p);
  }
  return perChar * length;
}

export function strengthRating(password) {
  if (!password) return ['Empty', 0];
  const entropy = estimateEntropy(password);
  if (password.length < 8) return ['Very Weak', 1];
  if (entropy < 35) return ['Weak', 1];
  if (entropy < 60) return ['Fair', 2];
  if (entropy < 90) return ['Strong', 3];
  return ['Very Strong', 4];
}

// ---------------------------------------------------------------------------
// TOTP (RFC 6238)
// ---------------------------------------------------------------------------

const _TOTP_HASH = { SHA1: 'sha1', SHA256: 'sha256', SHA512: 'sha512' };

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(secret) {
  let cleaned = '';
  for (const ch of secret.toUpperCase()) {
    if (BASE32_ALPHABET.includes(ch)) cleaned += ch;
  }
  if (!cleaned) throw new CryptoError('invalid base32 secret');

  const bits = [];
  for (const ch of cleaned) {
    const val = BASE32_ALPHABET.indexOf(ch);
    for (let i = 4; i >= 0; i--) bits.push((val >> i) & 1);
  }
  // Only whole bytes from complete 8-bit groups; leftover bits are discarded.
  const byteCount = Math.floor(bits.length / 8);
  const bytes = [];
  for (let i = 0; i < byteCount; i++) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i * 8 + j];
    bytes.push(byte);
  }
  if (bytes.length === 0) throw new CryptoError('invalid base32 secret');
  return Buffer.from(bytes);
}

export function totpCode(secretBytes, { period = 30, digits = 6, algorithm = 'SHA1', at = null } = {}) {
  if (at === null) at = Math.floor(Date.now() / 1000);
  const algo = _TOTP_HASH[String(algorithm).toUpperCase()];
  if (!algo) throw new CryptoError(`unsupported TOTP algorithm: ${algorithm}`);
  if (digits < 6 || digits > 8) throw new Error('TOTP digits must be 6-8');

  const counter = Math.floor(at / period);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac(algo, secretBytes).update(msg).digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  const otp = binary % Math.pow(10, digits);
  return String(otp).padStart(digits, '0');
}

export function totpRemaining(period = 30) {
  return period - (Math.floor(Date.now() / 1000) % period);
}

export function sha1Hex(data) {
  return crypto.createHash('sha1').update(data, 'utf-8').digest('hex').toUpperCase();
}

export function parseOtpauthUri(uri) {
  if (!uri.toLowerCase().startsWith('otpauth://')) {
    throw new CryptoError('not an otpauth:// URI');
  }
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new CryptoError('invalid otpauth URI');
  }
  if (parsed.protocol !== 'otpauth:' || parsed.hostname.toLowerCase() !== 'totp') {
    throw new CryptoError('only otpauth://totp URIs are supported');
  }
  const label = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!label) throw new CryptoError('missing label in otpauth URI');

  let account = label;
  let issuerFromLabel = null;
  const colonIdx = label.indexOf(':');
  if (colonIdx !== -1) {
    issuerFromLabel = label.slice(0, colonIdx);
    account = label.slice(colonIdx + 1);
  }

  const query = {};
  parsed.searchParams.forEach((v, k) => {
    query[k] = v;
  });

  const secret = query.secret;
  if (!secret) throw new CryptoError('otpauth URI missing secret');

  const issuer = query.issuer || issuerFromLabel || 'Unknown';
  const _intQuery = (key, def) => {
    const v = parseInt(query[key], 10);
    return Number.isNaN(v) ? def : v;
  };

  const period = _intQuery('period', 30);
  const digits = _intQuery('digits', 6);
  const algorithm = (query.algorithm || 'SHA1').toUpperCase();

  if (period <= 0) throw new CryptoError('invalid period');
  if (digits < 6 || digits > 8) throw new CryptoError('invalid digits');
  if (!_TOTP_HASH[algorithm]) throw new CryptoError(`unsupported algorithm: ${algorithm}`);

  return {
    account: account || 'Unknown',
    issuer: issuer || 'Unknown',
    secret,
    period,
    digits,
    algorithm,
  };
}
