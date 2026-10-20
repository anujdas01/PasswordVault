import { Router } from 'express';
import { requireUnlocked } from '../middleware/auth.js';
import { HttpError } from '../utils/httpError.js';

const rowToPayload = (r) => ({
  id: r.id,
  name: r.name,
  icon: r.icon,
  color: r.color,
  sort_order: r.sort_order,
  count: typeof r.count === 'number' ? r.count : 0,
  created_at: r.created_at,
});

export function categoriesRouter({ store, sessions }) {
  const router = Router();
  const unlock = requireUnlocked(sessions);

  router.get('/', unlock, (req, res) => {
    res.json(store.listCategories().map(rowToPayload));
  });

  router.post('/', unlock, (req, res) => {
    const body = req.body || {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {throw new HttpError(400, 'name is required');}
    if (name.length > 128) {throw new HttpError(400, 'name too long');}
    const icon = typeof body.icon === 'string' ? body.icon : '📁';
    const color = typeof body.color === 'string' ? body.color : '#888';
    const sortOrder = typeof body.sort_order === 'number' ? body.sort_order : 0;
    const catId = store.createCategory(name, icon, color, sortOrder);
    res.status(201).json(rowToPayload(store.getCategory(catId)));
  });

  router.put('/:cat_id', unlock, (req, res) => {
    const catId = Number(req.params.cat_id);
    if (!store.getCategory(catId)) {throw new HttpError(404, 'Not found');}
    const body = req.body || {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {throw new HttpError(400, 'name is required');}
    const icon = typeof body.icon === 'string' ? body.icon : '📁';
    const color = typeof body.color === 'string' ? body.color : '#888';
    const sortOrder = typeof body.sort_order === 'number' ? body.sort_order : 0;
    store.updateCategory(catId, name, icon, color, sortOrder);
    res.json(rowToPayload(store.getCategory(catId)));
  });

  router.delete('/:cat_id', unlock, (req, res) => {
    const catId = Number(req.params.cat_id);
    if (!store.getCategory(catId)) {throw new HttpError(404, 'Not found');}
    store.deleteCategory(catId);
    res.json({ ok: true });
  });

  return router;
}
