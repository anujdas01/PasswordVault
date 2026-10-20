import { Router } from 'express';
import * as vaultCrypto from '../crypto.js';
import { requireUnlocked } from '../middleware/auth.js';
import { HttpError } from '../utils/httpError.js';

const rowToPayload = (store, r) => {
  const atts = store.listAttachments(r.id);
  return {
    id: r.id,
    title: r.title,
    content_cipher: r.encrypted_content,
    attachment_count: typeof r.att_count === 'number' && r.id !== undefined ? r.att_count : atts.length,
    attachments: atts.map((a) => ({
      id: a.id,
      filename: a.filename,
      mime_type: a.mime_type,
      size: a.size,
      created_at: a.created_at,
    })),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
};

export function notesRouter({ store, sessions }) {
  const router = Router();
  const unlock = requireUnlocked(sessions);

  router.get('/', unlock, (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json(store.listNotes(q).map((r) => rowToPayload(store, r)));
  });

  router.get('/:note_id', unlock, (req, res) => {
    const noteId = Number(req.params.note_id);
    const row = store.getNote(noteId);
    if (!row) {throw new HttpError(404, 'Not found');}
    const payload = rowToPayload(store, row);
    try {
      payload.content = vaultCrypto.decryptText(req.vaultKey, row.encrypted_content);
    } catch {
      payload.content = '';
    }
    res.json(payload);
  });

  router.post('/', unlock, (req, res) => {
    const body = req.body || {};
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {throw new HttpError(400, 'title is required');}
    if (title.length > 512) {throw new HttpError(400, 'title too long');}
    const content = typeof body.content === 'string' ? body.content : '';
    const encrypted = vaultCrypto.encrypt(req.vaultKey, content);
    const noteId = store.createNote(title, encrypted);
    res.status(201).json(rowToPayload(store, store.getNote(noteId)));
  });

  router.put('/:note_id', unlock, (req, res) => {
    const noteId = Number(req.params.note_id);
    if (!store.getNote(noteId)) {throw new HttpError(404, 'Not found');}
    const body = req.body || {};
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {throw new HttpError(400, 'title is required');}
    const content = typeof body.content === 'string' ? body.content : '';
    const encrypted = vaultCrypto.encrypt(req.vaultKey, content);
    store.updateNote(noteId, title, encrypted);
    res.json(rowToPayload(store, store.getNote(noteId)));
  });

  router.delete('/:note_id', unlock, (req, res) => {
    const noteId = Number(req.params.note_id);
    if (!store.getNote(noteId)) {throw new HttpError(404, 'Not found');}
    store.deleteNote(noteId);
    res.json({ ok: true });
  });

  return router;
}
