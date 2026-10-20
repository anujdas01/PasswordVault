import { Router } from 'express';
import { requireUnlocked } from '../middleware/auth.js';
import { HttpError } from '../utils/httpError.js';

export function tagsRouter({ store, sessions }) {
  const router = Router();
  const unlock = requireUnlocked(sessions);

  router.get('/', unlock, (req, res) => {
    res.json(store.listTags());
  });

  router.post('/', unlock, (req, res) => {
    const body = req.body || {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {throw new HttpError(400, 'name is required');}
    const [tagId] = store.getOrCreateTag(name);
    res.status(201).json(store.getTag(tagId));
  });

  router.delete('/:tag_id', unlock, (req, res) => {
    const tagId = Number(req.params.tag_id);
    if (!store.getTag(tagId)) {throw new HttpError(404, 'Not found');}
    store.deleteTag(tagId);
    res.json({ ok: true });
  });

  return router;
}
