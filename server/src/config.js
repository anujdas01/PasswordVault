import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const SERVER_HOST = process.env.PASSWORDVAULT_HOST || '127.0.0.1';
export const SERVER_PORT = parseInt(process.env.PASSWORDVAULT_PORT || '8080', 10);
export const DB_PATH = process.env.PASSWORDVAULT_DB || path.resolve(__dirname, '..', 'vault.db');

export const AUTO_LOCK_MINUTES = parseInt(process.env.PASSWORDVAULT_AUTOLOCK || '5', 10);
export const DEFAULT_AUTO_LOCK_MINUTES = 5;

export const ARGON2_MEMORY_KIB = parseInt(process.env.PASSWORDVAULT_ARGON2_MEM || String(64 * 1024), 10);
export const ARGON2_TIME = parseInt(process.env.PASSWORDVAULT_ARGON2_TIME || '3', 10);
export const ARGON2_PARALLELISM = parseInt(process.env.PASSWORDVAULT_ARGON2_PARALLEL || '4', 10);

export const SALT_LEN = 16;
export const KEY_LEN = 32;
export const NONCE_LEN = 12;

export const LOGIN_MAX_ATTEMPTS = parseInt(process.env.PASSWORDVAULT_LOGIN_MAX || '5', 10);
export const LOGIN_WINDOW_SECONDS = 60;

export const SESSION_COOKIE = 'pv_session';

export const COOKIE_SECURE = process.env.PASSWORDVAULT_COOKIE_SECURE === 'true';
export const TRUST_PROXY = process.env.PASSWORDVAULT_TRUST_PROXY === 'true';
export const ENFORCE_HTTPS = process.env.PASSWORDVAULT_ENFORCE_HTTPS === 'true';
export const CSRF_SECRET = process.env.PASSWORDVAULT_CSRF_SECRET;

export const WEB_DIST = path.resolve(__dirname, '..', '..', 'web', 'dist');

export const UPLOAD_DIR = process.env.PASSWORDVAULT_UPLOAD_DIR || path.resolve(__dirname, '..', '..', 'uploads');
export const MAX_FILE_SIZE = parseInt(process.env.PASSWORDVAULT_MAX_FILE_SIZE || String(20 * 1024 * 1024), 10);

export const MIN_PASSWORD_STRENGTH_RATING = parseInt(process.env.PASSWORDVAULT_MIN_STRENGTH || '2', 10);
export const TWO_FACTOR_ENABLED = process.env.PASSWORDVAULT_2FA === 'true';
