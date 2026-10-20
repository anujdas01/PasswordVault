import { Router } from 'express';
import * as vaultCrypto from '../crypto.js';
import { clientIp } from '../utils/ip.js';
import { requireUnlocked } from '../middleware/auth.js';
import { HttpError } from '../utils/httpError.js';
import { string, array } from '../validation.js';

const rowsToPayloads = (store, rows) => {
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    username: r.username,
    url: r.url,
    notes_cipher: r.notes,
    category_id: r.category_id,
    category_name: r.category_name || null,
    category_color: r.category_color || null,
    category_icon: r.category_icon || null,
    favorite: !!r.favorite,
    tags: store.passwordTags(r.id).map((t) => t.name),
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
};

export const resolveTags = (store, tags) => {
  const ids = [];
  for (const name of tags || []) {
    const [tagId] = store.getOrCreateTag(name);
    ids.push(tagId);
  }
  return ids;
};

export function passwordsRouter({ store, sessions }) {
  const router = Router();
  const unlock = requireUnlocked(sessions);

  router.get('/', unlock, (req, res) => {
    const rows = store.listPasswords(
      typeof req.query.q === 'string' ? req.query.q : '',
      req.query.category !== null && req.query.category !== undefined ? Number(req.query.category) : null,
      req.query.tag !== null && req.query.tag !== undefined ? Number(req.query.tag) : null
    );
    res.json(rowsToPayloads(store, rows));
  });

  router.get('/:pwd_id', unlock, (req, res) => {
    const pwdId = Number(req.params.pwd_id);
    const row = store.getPassword(pwdId);
    if (!row) {throw new HttpError(404, 'Not found');}
    const payload = rowsToPayloads(store, [row])[0];
    try {
      payload.password = vaultCrypto.decryptText(req.vaultKey, row.encrypted_password);
    } catch {
      payload.password = '';
    }
    store.log('view', 'password', pwdId, `viewed '${row.title}'`, clientIp(req));
    res.json(payload);
  });

  router.post('/', unlock, (req, res) => {
    const body = req.body || {};
    const title = string(body.title, { field: 'title', max: 512 });
    const username = string(body.username, { field: 'username', allowEmpty: true });
    const password = string(body.password, { field: 'password', allowEmpty: true });
    const url = string(body.url, { field: 'url', allowEmpty: true });
    const notes = string(body.notes, { field: 'notes', allowEmpty: true });
    const categoryId = body.category_id !== null && body.category_id !== undefined ? Number(body.category_id) : null;
    const tags = array(body.tags, { field: 'tags', allowEmpty: true });

    const encrypted = vaultCrypto.encrypt(req.vaultKey, password);
    const pwdId = store.createPassword(title, username, encrypted, url, notes, categoryId);
    if (tags.length) {store.setPasswordTags(pwdId, resolveTags(store, tags));}
    store.log('create', 'password', pwdId, `created '${title}'`, clientIp(req));
    res.status(201).json(rowsToPayloads(store, [store.getPassword(pwdId)])[0]);
  });

  router.put('/:pwd_id', unlock, (req, res) => {
    const pwdId = Number(req.params.pwd_id);
    const existing = store.getPassword(pwdId);
    if (!existing) { throw new HttpError(404, 'Not found'); }
    const body = req.body || {};
    const title = string(body.title, { field: 'title', max: 512 });
    const username = string(body.username, { field: 'username', allowEmpty: true });
    const password = string(body.password, { field: 'password', allowEmpty: true });
    const url = string(body.url, { field: 'url', allowEmpty: true });
    const notes = string(body.notes, { field: 'notes', allowEmpty: true });
    const categoryId = body.category_id !== null && body.category_id !== undefined ? Number(body.category_id) : null;
    const tags = array(body.tags, { field: 'tags', allowEmpty: true });

    const encrypted = vaultCrypto.encrypt(req.vaultKey, password);
    store.updatePassword(pwdId, title, username, encrypted, url, notes, categoryId);
    if (tags.length) {store.setPasswordTags(pwdId, resolveTags(store, tags));}
    store.log('update', 'password', pwdId, `updated '${title}'`, clientIp(req));
    res.json(rowsToPayloads(store, [store.getPassword(pwdId)])[0]);
  });

  router.delete('/:pwd_id', unlock, (req, res) => {
    const pwdId = Number(req.params.pwd_id);
    const existing = store.getPassword(pwdId);
    if (!existing) {throw new HttpError(404, 'Not found');}
    store.deletePassword(pwdId);
    store.log('delete', 'password', pwdId, `deleted '${existing.title}'`, clientIp(req));
    res.json({ ok: true });
  });

  router.post('/:pwd_id/favorite', unlock, (req, res) => {
    const pwdId = Number(req.params.pwd_id);
    const existing = store.getPassword(pwdId);
    if (!existing) {throw new HttpError(404, 'Not found');}
    const favorite = !!(req.body && req.body.favorite);
    store.setFavorite(pwdId, favorite);
    store.log(
      'update',
      'password',
      pwdId,
      `favorite=${favorite ? 'on' : 'off'} '${existing.title}'`,
      clientIp(req)
    );
    res.json(rowsToPayloads(store, [store.getPassword(pwdId)])[0]);
  });

  return router;
}
