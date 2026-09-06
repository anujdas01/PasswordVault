import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const SERVER_HOST = process.env.PASSWORDVAULT_HOST || '127.0.0.1';
export const SERVER_PORT = parseInt(process.env.PASSWORDVAULT_PORT || '8080', 10);
export const DB_PATH = process.env.PASSWORDVAULT_DB || 'vault.db';

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

export const WEB_DIR = path.resolve(__dirname, '..', '..', 'web');
export const CLIENT_DIST = path.resolve(__dirname, '..', '..', 'client', 'dist');
