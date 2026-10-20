import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cookieParser from 'cookie-parser';

import { DB_PATH, WEB_DIST, TRUST_PROXY, ENFORCE_HTTPS } from './config.js';
import { Store } from './db/database.js';
import { SessionManager, LoginRateLimiter } from './security.js';
import { HttpError } from './utils/httpError.js';
import { authRouter } from './routes/auth.js';
import { passwordsRouter } from './routes/passwords.js';
import { categoriesRouter } from './routes/categories.js';
import { tagsRouter } from './routes/tags.js';
import { notesRouter } from './routes/notes.js';
import { attachmentsRouter } from './routes/attachments.js';
import { generatorRouter } from './routes/generator.js';
import { totpRouter } from './routes/totp.js';
import { breachRouter } from './routes/breach.js';
import { auditRouter } from './routes/audit.js';
import { importExportRouter } from './routes/import_export.js';

export function createApp() {
  const store = new Store(DB_PATH);
  const sessions = new SessionManager();
  const rateLimiter = new LoginRateLimiter();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', TRUST_PROXY);

  app.state = { store, sessions, rateLimiter };

  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));

  // HTTPS enforcement (when configured behind a TLS-terminating proxy).
  if (ENFORCE_HTTPS) {
    app.use((req, res, next) => {
      if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
        return next();
      }
      return res.status(426).json({ detail: 'HTTPS required' });
    });
  }

  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  // CSRF token endpoint (frontend reads the pv_csrf cookie and sends x-csrf-token header).
  app.get('/api/csrf-token', (_req, res) => {
    res.json({ ok: true });
  });

  const ctx = { store, sessions, rateLimiter, app };

  const api = express.Router();
  api.use('/auth', authRouter(ctx));
  api.use('/passwords', passwordsRouter(ctx));
  api.use('/categories', categoriesRouter(ctx));
  api.use('/tags', tagsRouter(ctx));
  api.use('/notes', notesRouter(ctx));
  api.use('/attachments', attachmentsRouter(ctx));
  api.use('/generate', generatorRouter(ctx));
  api.use('/totp', totpRouter(ctx));
  api.use('/breach', breachRouter(ctx));
  api.use('/audit', auditRouter(ctx));
  api.use('/', importExportRouter(ctx));
  app.use('/api', api);

  // Serve the built frontend when available.
  if (fs.existsSync(path.join(WEB_DIST, 'index.html'))) {
    app.use(express.static(WEB_DIST));
    app.use((req, res, next) => {
      if (req.path.startsWith('/api/')) {return next();}
      res.sendFile(path.join(WEB_DIST, 'index.html'));
    });
  }

  // 404 for unmatched API routes.
  app.use('/api', (req, res) => {
    res.status(404).json({ detail: 'Not found' });
  });

  // Final fallback for any non-API path (609: no page is fine in API-only mode).

  // Error handler.
  app.use((err, req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ detail: err.message });
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ detail: 'Payload too large' });
    }
    if (err && err.name === 'MulterError') {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ detail: 'File too large (max 20 MB)' });
      }
      return res.status(400).json({ detail: err.message });
    }
    console.error(err);
    res.status(500).json({ detail: 'Internal server error' });
  });

  return app;
}
