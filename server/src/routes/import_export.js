import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as vaultCrypto from '../crypto.js';
import { requireUnlocked } from '../middleware/auth.js';
import { clientIp } from '../utils/ip.js';
import { HttpError } from '../utils/httpError.js';
import { resolveTags } from './passwords.js';
import { UPLOAD_DIR, MAX_FILE_SIZE } from '../config.js';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const EDGE_COLUMN_ALIASES = {
  name: 'title',
  title: 'title',
  nickname: 'title',
  entry: 'title',
  url: 'url',
  'login url': 'url',
  login_url: 'url',
  website: 'url',
  'web site': 'url',
  'website url': 'url',
  origin: 'url',
  username: 'username',
  'user name': 'username',
  user_name: 'username',
  user: 'username',
  login: 'username',
  'login name': 'username',
  password: 'password',
  pass: 'password',
  note: 'notes',
  notes: 'notes',
  comment: 'notes',
  comments: 'notes',
  category: 'category',
  folder: 'category',
  group: 'category',
  tags: 'tags',
  tag: 'tags',
  labels: 'tags',
};

function parseCsv(text) {
  // Robust CSV parser handling quoted fields with embedded delimiters/newlines.
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') {i++;}
      row.push(field);
      field = '';
      if (row.some((x) => x !== '')) {rows.push(row);}
      row = [];
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // last field/row
  row.push(field);
  if (row.some((x) => x !== '')) {rows.push(row);}
  return rows;
}

function parseCsvRecords(raw) {
  if (raw.startsWith('\ufeff')) {raw = raw.slice(1);}
  const rows = parseCsv(raw);
  if (!rows.length) {return [];}
  const header = rows[0].map((h) => (h || '').trim().toLowerCase());
  const fieldMap = new Map(); // column index -> alias
  header.forEach((h, idx) => {
    fieldMap.set(idx, EDGE_COLUMN_ALIASES[h] || '');
  });

  const valueAt = (row, alias) => {
    for (const [idx, mapped] of fieldMap) {
      if (mapped === alias) {return String(row[idx] !== undefined ? row[idx] : '').trim();}
    }
    return '';
  };

  const result = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const url = valueAt(row, 'url');
    const title = valueAt(row, 'title') || hostname(url);
    if (!title && !url) {continue;}
    const tags = valueAt(row, 'tags');
    result.push({
      title,
      username: valueAt(row, 'username'),
      password: valueAt(row, 'password'),
      url,
      notes: valueAt(row, 'notes'),
      category: valueAt(row, 'category'),
      tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    });
  }
  return result;
}

function hostname(url) {
  url = (url || '').trim();
  if (!url) {return '';}
  let body = url;
  if (body.includes('://')) {
    const parts = body.split('://');
    body = parts[1];
  }
  const slashIdx = body.indexOf('/');
  if (slashIdx !== -1) {body = body.slice(0, slashIdx);}
  const qIdx = body.indexOf('?');
  if (qIdx !== -1) {body = body.slice(0, qIdx);}
  const hIdx = body.indexOf('#');
  if (hIdx !== -1) {body = body.slice(0, hIdx);}
  body = body.replace(/[.:]+$/, '');
  if (body.startsWith('www.')) {body = body.slice(4);}
  return body;
}

function parseJson(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new HttpError(400, `Invalid JSON: ${err.message}`);
  }
  const items = data && !Array.isArray(data) ? data.passwords : data;
  if (!Array.isArray(items)) {
    throw new HttpError(400, "JSON must contain a 'passwords' array or be a list");
  }
  return items;
}

function resolveCategory(store, name) {
  name = (name || '').trim();
  if (!name) {return null;}
  for (const c of store.listCategories()) {
    if (c.name === name) {return c.id;}
  }
  return store.createCategory(name, '📁', '#888', 0);
}

export function importExportRouter({ store, sessions }) {
  const router = Router();
  const unlock = requireUnlocked(sessions);
  const upload = multer({
    storage: multer.diskStorage({
      destination: UPLOAD_DIR,
      filename: (_req, file, cb) => {
        cb(null, `${crypto.randomUUID()}-${file.originalname}`);
      },
    }),
    limits: { fileSize: MAX_FILE_SIZE },
  });

  router.get('/export', unlock, (req, res) => {
    const format = typeof req.query.format === 'string' ? req.query.format : 'json';
    const data = [];
    for (const r of store.allPasswordsForExport()) {
      let password = '';
      try {
        password = vaultCrypto.decryptText(req.vaultKey, r.encrypted_password);
      } catch {
        password = '';
      }
      const tags = store.passwordTags(r.id).map((t) => t.name);
      data.push({
        title: r.title,
        username: r.username,
        password,
        url: r.url,
        notes: r.notes,
        category: r.category_name || '',
        tags,
      });
    }
    if (format === 'csv') {
      const lines = [];
      lines.push(['title', 'username', 'password', 'url', 'notes', 'category', 'tags'].join(','));
      for (const item of data) {
        lines.push(
          [
            csvField(item.title),
            csvField(item.username),
            csvField(item.password),
            csvField(item.url),
            csvField(item.notes),
            csvField(item.category),
            csvField(item.tags.join(',')),
          ].join(',')
        );
      }
      const text = lines.join('\n') + '\n';
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="vault-export.csv"');
      return res.send(text);
    }
    const payload = {
      category: 'PasswordVault export',
      exported_at: null,
      passwords: data,
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="vault-export.json"');
    res.send(JSON.stringify(payload, null, 2));
  });

  router.post('/import', unlock, upload.single('file'), (req, res) => {
    if (!req.file || !req.file.path) {throw new HttpError(400, 'No file provided');}
    if (!fs.existsSync(req.file.path)) {
      throw new HttpError(400, 'Uploaded file not found');
    }
    let raw;
    try {
      raw = fs.readFileSync(req.file.path, 'utf-8');
    } finally {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        // ignore cleanup errors
      }
    }
    let fmt = typeof req.query.format === 'string' ? req.query.format.toLowerCase() : '';
    if (!fmt) {
      const fn = req.file.originalname || '';
      fmt = fn.includes('.') ? fn.split('.').pop().toLowerCase() : '';
    }
    const skipDuplicates = String(req.query.skip_duplicates) === 'true' || req.query.skip_duplicates === true;

    let records = [];
    if (['edge', 'chrome', 'chromium', 'browser', 'csv'].includes(fmt)) {
      records = parseCsvRecords(raw);
    } else if (fmt === 'json') {
      records = parseJson(raw);
    } else {
      if (raw.replace(/^\s+/, '').startsWith('{')) {
        records = parseJson(raw);
      } else {
        records = parseCsvRecords(raw);
      }
    }

    const existingTitles = new Set(store.listPasswords().map((r) => r.title));
    let created = 0;
    let skipped = 0;
    for (const rec of records) {
      const title = rec.title || '';
      if (!title) {continue;}
      if (skipDuplicates && existingTitles.has(title)) {
        skipped++;
        continue;
      }
      const categoryId = resolveCategory(store, rec.category);
      const encrypted = vaultCrypto.encrypt(req.vaultKey, rec.password || '');
      const pwdId = store.createPassword(
        title,
        rec.username || '',
        encrypted,
        rec.url || '',
        rec.notes || '',
        categoryId
      );
      let tagNames = rec.tags || [];
      if (typeof tagNames === 'string') {
        tagNames = tagNames.split(',').map((t) => t.trim()).filter(Boolean);
      }
      if (tagNames && tagNames.length) {
        store.setPasswordTags(pwdId, resolveTags(store, tagNames));
      }
      existingTitles.add(title);
      created++;
      store.log('import', 'password', pwdId, `imported '${title}'`, clientIp(req));
    }

    store.log('import', 'vault', null, `imported ${created} items (${skipped} skipped)`, clientIp(req));
    res.json({ imported: created, skipped });
  });

  return router;
}

const csvField = (v) => {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) {return '"' + s.replace(/"/g, '""') + '"';}
  return s;
};
