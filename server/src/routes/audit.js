import { Router } from 'express';
import { requireUnlocked } from '../middleware/auth.js';

export function auditRouter({ store, sessions }) {
  const router = Router();
  const unlock = requireUnlocked(sessions);

  router.get('/', unlock, (req, res) => {
    const action = typeof req.query.action === 'string' ? req.query.action : '';
    const entityType = typeof req.query.entity_type === 'string' ? req.query.entity_type : '';
    const fromTs = typeof req.query.from_ts === 'string' ? req.query.from_ts : '';
    const toTs = typeof req.query.to_ts === 'string' ? req.query.to_ts : '';
    res.json(store.listAudit(action, entityType, fromTs, toTs));
  });

  return router;
}
