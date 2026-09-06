# PasswordVault

A re-implementation of [PasswordVault](../PasswordVault) on the MyPortfolio tech stack:
**Node.js / Express** (backend) + **React 18 / Vite / Tailwind** (frontend), built with the
**same security model** as the original Python/FastAPI app.

This is a faithful feature-for-feature port:

- In-memory AES-256-GCM vault key derived from your master password via **Argon2id**
- The key lives only in server memory and is **wiped on lock** (locks every session out)
- Every sensitive field (passwords, note contents, TOTP secrets, attachment bytes) is
  encrypted **before** it touches SQLite — the DB never sees plaintext

## Project layout

```
PasswordVault/
├── server/               # Node.js / Express backend
│   ├── src/
│   │   ├── index.js      # entry: starts the HTTP server
│   │   ├── app.js        # Express app factory (createApp)
│   │   ├── config.js     # settings (env-overridable)
│   │   ├── crypto.js     # Argon2id, AES-256-GCM, TOTP (RFC 6238), generator
│   │   ├── security.js   # SessionManager (in-memory key) + login rate limiter
│   │   ├── db/           # node:sqlite schema + Store
│   │   ├── middleware/   # requireUnlocked, error handler
│   │   ├── routes/       # auth, passwords, categories, tags, notes, attachments,
│   │   │                 #   generator, totp, breach, audit, import_export
│   │   └── utils/
│   └── smoke_test.mjs    # end-to-end API smoke test (55 checks)
└── client/               # React + Vite + Tailwind SPA
    └── src/
        ├── api/client.js # axios wrapper (cookie session, 401 -> lock)
        ├── context/      # Auth, Toast
        ├── lib/          # theme, strength
        ├── components/   # Layout, Modal
        └── pages/        # LockScreen, Vault, Generator, Totp, Notes, Settings
```

## Requirements

- Node.js **22.5+** (for the built-in `node:sqlite` module; tested on Node 24)

## How to run

```bash
# 1. Install backend deps and build the frontend
npm install --prefix server
npm install --prefix client
npm run build --prefix client

# 2. Start the server (serves both the API and the built SPA at http://127.0.0.1:8080)
node server/src/index.js

# or, with overrides
node server/src/index.js            # uses env: PASSWORDVAULT_HOST, PASSWORDVAULT_PORT, PASSWORDVAULT_DB
```

Config is read from environment variables (same names as the original):
`PASSWORDVAULT_HOST`, `PASSWORDVAULT_PORT` (default 8080), `PASSWORDVAULT_DB` (default `vault.db`),
`PASSWORDVAULT_AUTOLOCK` (minutes, default 5), `PASSWORDVAULT_ARGON2_MEM`/`_TIME`/`_PARALLEL`,
`PASSWORDVAULT_LOGIN_MAX`.

## Frontend dev mode

```bash
npm run dev --prefix client        # Vite dev server on :5173, proxies /api -> :8080
```

## Tests

```bash
node server/smoke_test.mjs
```

Runs an end-to-end test against the real HTTP API on an ephemeral database
(setup, login, rate limiting, all CRUD, attachments, TOTP, generator,
import/export, breach, audit, password change + re-encryption, lock, clear, factory reset).

## Security model (unchanged from the original)

- **Transport**: cookie `pv_session`, `HttpOnly`, `SameSite=Strict`, 24h, on every protected call.
- **Key derivation**: Argon2id — memory 64 MiB (`64*1024` KiB), time 3, parallelism 4,
  salt 16 bytes → 32-byte AES-256 key. Same parameters as `config.py`.
- **Encryption**: AES-256-GCM; blob format `base64(nonce(12) || ciphertext || tag)`.
- **Lock**: `SessionManager.lockVault()` zeroes the key buffer in memory and clears all sessions.
- **Auto-lock**: global idle timeout (default 5 min) invalidates sessions server-side.
- **Rate limiting**: 5 failed logins / 60s / IP.
- **Breach check**: k-anonymity — only the first 5 hex chars of the SHA-1 hash are sent to
  HIBP (`api.pwnedpasswords.com`); the full hash never leaves the machine.
- **Change password**: re-encrypts every stored field with the new key; undecryptable rows
  are left untouched rather than lost.

## Notes / deviations from the original

- Uses Node's built-in `node:sqlite` (`DatabaseSync`) instead of `sqlite3` — no native build,
  no ORM. Synchronous, single-threaded, so the original `threading.RLock` is not needed.
- Uses `hash-wasm` (pure WASM) for Argon2id to avoid native compilation on Windows.
- UI is a React rewrite (was vanilla JS). All AJAX is via `axios` with
  `withCredentials: true`; a 401 response triggers the lock transition.
