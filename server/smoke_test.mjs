// End-to-end smoke test for the PasswordVault backend.
// Usage: node --input-type=module smoke_test.mjs
// (DB is ephemeral, no real data touched.)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDb = path.join(os.tmpdir(), `pv-smoke-${Date.now()}.db`);
process.env.PASSWORDVAULT_DB = tmpDb;

const { createApp } = await import('./src/app.js');

const app = createApp();
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.on('listening', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

let cookie = '';
let pass = 0;
let fail = 0;
const results = [];

function check(name, cond, extra = '') {
  if (cond) {
    pass++;
    results.push(`[OK] ${name}`);
  } else {
    fail++;
    results.push(`[FAIL] ${name} ${extra}`);
  }
}

async function req(method, pathName, { body, headers = {}, isForm = false, raw = false } = {}) {
  const opts = { method, headers: { ...headers } };
  if (cookie) opts.headers.Cookie = cookie;
  if (body !== undefined && !isForm) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (isForm && body) {
    opts.body = body;
  }
  const res = await fetch(base + pathName, opts);
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  let data = null;
  if (raw) {
    data = await res.arrayBuffer();
  } else {
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
  }
  return { status: res.status, data, headers: res.headers };
}

// --- Status before setup ---
let r = await req('GET', '/api/auth/status');
check('status: setup required before setup', r.status === 200 && r.data.setup_required === true);

// --- Setup ---
r = await req('POST', '/api/auth/setup', { body: { password: 'password123', confirm_password: 'password123' } });
check('setup ok', r.status === 200 && r.data.ok === true);
check('setup sets cookie', cookie !== '');

r = await req('POST', '/api/auth/setup', { body: { password: 'password123', confirm_password: 'password123' } });
check('setup already set up -> 400', r.status === 400);

r = await req('POST', '/api/auth/setup', { body: { password: 'short', confirm_password: 'short' } });
check('setup too short -> 400', r.status === 400);

r = await req('GET', '/api/auth/status');
check('status: unlocked after setup', r.data.unlocked === true && r.data.setup_required === false);

// --- Categories ---
r = await req('POST', '/api/categories', { body: { name: 'Work', icon: '💼', color: '#333' } });
check('create category 201', r.status === 201 && r.data.name === 'Work');
const workCatId = r.data.id;

r = await req('GET', '/api/categories');
check('list categories', r.status === 200 && Array.isArray(r.data) && r.data.length === 1);

// --- Tags ---
r = await req('POST', '/api/tags', { body: { name: 'social' } });
check('create tag 201', r.status === 201 && r.data.name === 'social');

r = await req('GET', '/api/tags');
check('list tags', Array.isArray(r.data) && r.data.length === 1);

// --- Passwords ---
r = await req('POST', '/api/passwords', {
  body: { title: 'Gmail', username: 'alice', password: 's3cret!', url: 'https://gmail.com', notes: 'my mail', category_id: workCatId, tags: ['social'] },
});
check('create password 201', r.status === 201 && r.data.title === 'Gmail' && r.data.category_name === 'Work');
const pwdId = r.data.id;
check('password tags linked', Array.isArray(r.data.tags) && r.data.tags.includes('social'));
check('password stores password cipher', typeof r.data.notes_cipher === 'string' && !r.data.password);

r = await req('GET', `/api/passwords/${pwdId}`);
check('get password single (decrypted)', r.status === 200 && r.data.password === 's3cret!');

r = await req('GET', '/api/passwords?q=gmail');
check('search passwords', Array.isArray(r.data) && r.data.length === 1);

r = await req('POST', `/api/passwords/${pwdId}/favorite`, { body: { favorite: true } });
check('favorite on', r.data.favorite === true);

r = await req('PUT', `/api/passwords/${pwdId}`, {
  body: { title: 'Gmail 2', username: 'alice', password: 'newpass', url: 'https://gmail.com', notes: 'notes here', category_id: workCatId, tags: [] },
});
check('update password', r.status === 200 && r.data.title === 'Gmail 2');

// --- Notes ---
r = await req('POST', '/api/notes', { body: { title: 'Secret', content: 'encrypt me please' } });
check('create note 201', r.status === 201 && r.data.title === 'Secret');
const noteId = r.data.id;

r = await req('GET', `/api/notes/${noteId}`);
check('get note decrypted', r.status === 200 && r.data.content === 'encrypt me please');

// --- Attachments (multipart) ---
const form = new FormData();
form.append('file', new Blob(['file-bytes-content'], { type: 'text/plain' }), 'test.txt');
r = await req('POST', `/api/attachments?note_id=${noteId}`, { body: form, isForm: true });
check('upload attachment 201', r.status === 201 && r.data.size === 'file-bytes-content'.length);
const attId = r.data.id;

r = await req('GET', `/api/attachments/${attId}`, { raw: true });
check('download attachment', r.status === 200 && new TextDecoder().decode(r.data) === 'file-bytes-content');

// --- TOTP ---
r = await req('POST', '/api/totp', { body: { name: 'GitHub', secret: 'JBSWY3DPEHPK3PXP', account: 'alice', issuer: 'GitHub' } });
check('create totp 201', r.status === 201 && r.data.name === 'GitHub' && !r.data.encrypted_secret);

r = await req('POST', '/api/totp', { body: { name: 'URI', secret: 'otpauth://totp/Example:alice@google.com?secret=JBSWY3DPEHPK3PXP&issuer=Example' } });
check('create totp from URI', r.status === 201 && r.data.issuer === 'Example');

r = await req('GET', '/api/totp');
check('list totp', Array.isArray(r.data) && r.data.length === 2);
const totpId = r.data[0].id;

r = await req('GET', `/api/totp/${totpId}/code`);
check('totp code', r.status === 200 && /^\d{6}$/.test(r.data.code) && r.data.remaining > 0 && r.data.remaining <= 30);

// --- Generator ---
r = await req('POST', '/api/generate', { body: { length: 20, count: 3 } });
check('generate 3 passwords', r.status === 200 && r.data.results.length === 3 && r.data.results[0].password.length === 20);

r = await req('POST', '/api/generate/strength', { body: { password: 'Tr0ub4douR&3' } });
check('strength endpoint', r.status === 200 && typeof r.data.rating === 'number');

// --- Import/Export ---
const csvContent = 'name,url,username,password\nEdgeSite,https://edge.com,edgeuser,edgepass\n';
const importForm = new FormData();
importForm.append('file', new Blob([csvContent], { type: 'text/csv' }), 'edges.csv');
r = await req('POST', '/api/import?format=edge', { body: importForm, isForm: true });
check('import edge csv', r.status === 200 && r.data.imported === 1);

r = await req('GET', '/api/export?format=json');
check('export json', r.status === 200 && r.data.passwords.length >= 1);

r = await req('GET', '/api/export?format=csv');
check('export csv', r.status === 200 && r.headers.get('content-type').includes('text/csv'));

// --- Breach (may be offline; expect 200 or 502) ---
r = await req('POST', '/api/breach/check', { body: { password: 'password' } });
check('breach check (200 or 502)', [200, 502].includes(r.status));

// --- Audit ---
r = await req('GET', '/api/audit');
check('audit log populated', Array.isArray(r.data) && r.data.length > 0);

// --- Unauthorized: no cookie ---
cookie = '';
r = await req('GET', '/api/passwords');
check('no cookie -> 401', r.status === 401);

// --- Change master password (re-auth) ---
r = await req('POST', '/api/auth/login', { body: { password: 'password123' } });
check('login before change', r.status === 200);
r = await req('POST', '/api/auth/change', { body: { current_password: 'password123', new_password: 'newpassword45' } });
check('change master password', r.status === 200 && r.data.ok === true);
check('change password keeps session', cookie !== '');

// Verify data still decrypts with new key
r = await req('GET', `/api/passwords/${pwdId}`);
check('data decrypts after password change', r.status === 200 && r.data.password === 'newpass');

// --- Lock ---
r = await req('POST', '/api/auth/lock');
check('lock ok', r.status === 200 && r.data.ok === true);

r = await req('GET', '/api/passwords');
check('locked -> 401', r.status === 401);

r = await req('GET', '/api/auth/status');
check('status unlocked false after lock', r.data.unlocked === false);

// --- Login with new password ---
r = await req('POST', '/api/auth/login', { body: { password: 'newpassword45' } });
check('login with new password', r.status === 200 && r.data.ok === true);

r = await req('GET', '/api/auth/status');
check('unlocked after login', r.data.unlocked === true);

// --- Clear data ---
cookie = '';
await req('POST', '/api/auth/login', { body: { password: 'newpassword45' } });
r = await req('POST', '/api/auth/clear?mode=data');
check('clear data mode=data', r.status === 200 && r.data.mode === 'data');
r = await req('GET', '/api/passwords');
check('passwords empty after clear', Array.isArray(r.data) && r.data.length === 0);

// --- Factory reset ---
await req('POST', '/api/auth/login', { body: { password: 'newpassword45' } });
r = await req('POST', '/api/auth/clear?mode=factory');
check('factory reset -> setup_required', r.status === 200 && r.data.mode === 'factory' && r.data.setup_required === true);
r = await req('GET', '/api/auth/status');
check('status: setup required after factory reset', r.status === 200 && r.data.setup_required === true);

// --- Re-setup a fresh vault, then test login rate limit (needs a set-up vault) ---
r = await req('POST', '/api/auth/setup', { body: { password: 'password123', confirm_password: 'password123' } });
check('re-setup after reset', r.status === 200);
cookie = '';
let lastStatus = 0;
for (let i = 0; i < 6; i++) {
  r = await req('POST', '/api/auth/login', { body: { password: 'wrongpassword' } });
  lastStatus = r.status;
  if (i < 5) check(`wrong login #${i + 1} -> 401`, r.status === 401);
}
check('rate limited -> 429', lastStatus === 429);

// --- 404 for unknown API ---
r = await req('GET', '/api/does-not-exist');
check('api 404 json', r.status === 404 && r.data.detail === 'Not found');

// --- Security headers ---
r = await req('GET', '/api/auth/status');
check('security headers present', r.headers.get('x-content-type-options') === 'nosniff');

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
server.close();
try {
  fs.unlinkSync(tmpDb);
} catch {}
process.exit(fail === 0 ? 0 : 1);
