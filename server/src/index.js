import { createApp } from './app.js';
import { SERVER_HOST, SERVER_PORT } from './config.js';

const app = createApp();

app.listen(SERVER_PORT, SERVER_HOST, () => {
  console.log(`PasswordVault running at http://${SERVER_HOST}:${SERVER_PORT}`);
});
