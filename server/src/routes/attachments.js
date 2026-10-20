import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as vaultCrypto from '../crypto.js';
import { requireUnlocked } from '../middleware/auth.js';
import { HttpError } from '../utils/httpError.js';
import { UPLOAD_DIR, MAX_FILE_SIZE } from '../config.js';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_SIZE = MAX_FILE_SIZE;

export function attachmentsRouter({ store, sessions }) {
  const router = Router();
  const unlock = requireUnlocked(sessions);
  const upload = multer({
    storage: multer.diskStorage({
      destination: UPLOAD_DIR,
      filename: (_req, file, cb) => {
        cb(null, `${crypto.randomUUID()}-${file.originalname}`);
      },
    }),
    limits: { fileSize: MAX_SIZE },
  });

  router.post('/', unlock, upload.single('file'), (req, res) => {
    const noteId = Number(req.query.note_id);
    if (!req.file) {throw new HttpError(400, 'No file provided');}
    if (!req.file.path || !fs.existsSync(req.file.path)) {
      throw new HttpError(400, 'Empty file');
    }
    if (Number.isNaN(noteId) || !store.getNote(noteId)) {
      throw new HttpError(404, 'Note not found');
    }
    const filename = req.file.originalname || 'attachment';
    const mime = req.file.mimetype || 'application/octet-stream';
    const data = fs.readFileSync(req.file.path);
    try {
      fs.unlinkSync(req.file.path);
    } catch {
      // ignore cleanup errors
    }
    const encrypted = vaultCrypto.encryptBytes(req.vaultKey, data);
    const attId = store.createAttachment(noteId, filename, encrypted, mime, data.length);
    const rows = store.listAttachments(noteId);
    for (const r of rows) {
      if (r.id === attId) {
        return res.status(201).json({
          id: r.id,
          filename: r.filename,
          mime_type: r.mime_type,
          size: r.size,
          created_at: r.created_at,
        });
      }
    }
    res.status(201).json({ id: attId });
  });

  router.get('/:att_id', unlock, (req, res) => {
    const attId = Number(req.params.att_id);
    const row = store.getAttachment(attId);
    if (!row) {throw new HttpError(404, 'Not found');}
    let data;
    try {
      data = vaultCrypto.decryptBytes(req.vaultKey, row.encrypted_data);
    } catch {
      throw new HttpError(500, 'Decryption failed');
    }
    res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${row.filename}"`);
    res.setHeader('Content-Length', String(data.length));
    res.send(Buffer.from(data));
  });

  router.delete('/:att_id', unlock, (req, res) => {
    const attId = Number(req.params.att_id);
    if (!store.getAttachment(attId)) {throw new HttpError(404, 'Not found');}
    store.deleteAttachment(attId);
    res.json({ ok: true });
  });

  return router;
}
