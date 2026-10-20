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
├── package.json          # root commands for development, build, and production start
├── scripts/
│   └── dev.js            # starts the API and Vite development servers together
├── Dockerfile            # multi-stage production image
├── docker-compose.yml    # app service and persistent data volume
├── start.bat             # Windows production launcher
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
│   ├── test/             # unit tests
│   └── smoke_test.mjs    # end-to-end API smoke test
└── web/                  # React + Vite + Tailwind SPA
    └── src/
        ├── api/client.js # axios wrapper (cookie session, 401 -> lock)
        ├── context/      # Auth, Toast
        ├── lib/          # theme, strength
        ├── components/   # Layout, Modal
        └── pages/        # LockScreen, Vault, Generator, Totp, Notes, Settings
```

## Requirements

- Node.js **22.5+** (for the built-in `node:sqlite` module; the Docker image uses Node 24)
- npm

## How to run

Install the server and frontend dependencies once from the project root:

```bash
npm install --prefix server
npm install --prefix web
```

### Development

Start both the API and frontend together from the project root:

```bash
npm run dev
```

Open `http://localhost:5173`. Vite serves the frontend and proxies `/api` requests to the
backend on `http://127.0.0.1:8080`. Press **Ctrl+C** to stop both servers.

### Production

Build the frontend and start the server from the project root:

```bash
npm run build
npm start
```

The production server serves the API and built frontend at `http://127.0.0.1:8080`.
On Windows, `start.bat` is also available; it builds the frontend if needed, opens the browser,
and starts the server. Install dependencies before using it.

The root npm scripts are `dev` (run both development servers), `build` (build the frontend),
and `start` (run the production server). Run `npm run build` after frontend changes before
restarting the production server.

## Configuration

Settings can be provided through environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PASSWORDVAULT_HOST` | `127.0.0.1` | Address the server listens on |
| `PASSWORDVAULT_PORT` | `8080` | Server port |
| `PASSWORDVAULT_DB` | `server/vault.db` | SQLite database path; this default is independent of the current working directory |
| `PASSWORDVAULT_AUTOLOCK` | `5` | Vault idle timeout in minutes |
| `PASSWORDVAULT_ARGON2_MEM` | `65536` | Argon2id memory in KiB |
| `PASSWORDVAULT_ARGON2_TIME` | `3` | Argon2id time cost |
| `PASSWORDVAULT_ARGON2_PARALLEL` | `4` | Argon2id parallelism |
| `PASSWORDVAULT_LOGIN_MAX` | `5` | Failed login attempts per IP in the rate-limit window |
| `PASSWORDVAULT_COOKIE_SECURE` | `false` | Set to `true` when serving over HTTPS |
| `PASSWORDVAULT_ENFORCE_HTTPS` | `false` | Require HTTPS behind a TLS-terminating proxy; requires secure cookies |
| `PASSWORDVAULT_TRUST_PROXY` | `false` | Trust `X-Forwarded-For` when behind a known reverse proxy |
| `PASSWORDVAULT_CSRF_SECRET` | unset | Enables CSRF protection when set |
| `PASSWORDVAULT_UPLOAD_DIR` | `uploads/` in the project | Temporary upload directory |
| `PASSWORDVAULT_MAX_FILE_SIZE` | `20971520` | Maximum attachment/import size in bytes |
| `PASSWORDVAULT_MIN_STRENGTH` | `2` | Minimum password strength rating (0–4) |
| `PASSWORDVAULT_2FA` | `false` | Require TOTP during login when enabled |

When CSRF protection is enabled, the client must send an `x-csrf-token` header matching the
`pv_csrf` cookie. For production deployments, use HTTPS and set
`PASSWORDVAULT_COOKIE_SECURE=true`.

## Docker

```powershell
$env:PASSWORDVAULT_CSRF_SECRET = (node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")
docker compose up --build
```

Open `http://localhost:8080`. Compose builds the production image, publishes port `8080`, and
stores the database and uploads in the persistent `vault-data` volume mounted at `/data`.
The Compose configuration enables secure cookies; use HTTPS when deploying beyond local
testing. Stop the foreground service with **Ctrl+C**; run `docker compose up` to start it
again, or `docker compose up --build` to rebuild after code or configuration changes.

Do not run `docker compose down -v` unless you intend to delete the persistent vault data.

## Tests

```bash
npm --prefix server test
npm --prefix server run lint
```

The test command runs the API smoke test against an ephemeral database along with the
server's unit tests.

## Security model (unchanged from the original)

- **Transport**: cookie `pv_session`, `HttpOnly`, `SameSite=Strict`, 24h, on every protected call.
- **Key derivation**: Argon2id — memory 64 MiB (`64*1024` KiB), time 3, parallelism 4,
  salt 16 bytes → 32-byte AES-256 key by default; the Argon2id parameters can be overridden
  with environment variables.
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
