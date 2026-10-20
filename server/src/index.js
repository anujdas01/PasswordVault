import { createApp } from './app.js';
import { SERVER_HOST, SERVER_PORT, COOKIE_SECURE, ENFORCE_HTTPS, CSRF_SECRET } from './config.js';

// Validate required production settings.
if (ENFORCE_HTTPS && !COOKIE_SECURE) {
  console.error('[fatal] PASSWORDVAULT_ENFORCE_HTTPS requires PASSWORDVAULT_COOKIE_SECURE=true');
  process.exit(1);
}
if (!CSRF_SECRET) {
  console.warn('[warn] PASSWORDVAULT_CSRF_SECRET not set; CSRF protection disabled');
}

const app = createApp();

const server = app.listen(SERVER_PORT, SERVER_HOST, () => {
  console.log(`PasswordVault running at http://${SERVER_HOST}:${SERVER_PORT}`);
});

const store = app.state.store;

function shutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(() => {
    try {
      store.close();
      console.log('Database closed.');
    } catch (err) {
      console.error('Error closing database:', err.message);
    }
    process.exit(0);
  });
  // Force exit after 10s if graceful shutdown hangs.
  setTimeout(() => {
    console.error('Graceful shutdown timed out, forcing exit.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
