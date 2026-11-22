import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from './db.js';
import { validateLead, STATUSES, SOURCES } from './validation.js';
import { registerAuthRoutes, requireAuth } from './auth.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export function createApp({ db = createDatabase() } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '32kb' }));
  registerAuthRoutes(app, db);
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/meta', (_req, res) => res.json({ statuses: STATUSES, sources: SOURCES }));
  app.use('/api/leads', requireAuth(db));
  app.use('/api/stats', requireAuth(db));
  app.get('/api/stats', (req, res) => {
    const rows = db.prepare('SELECT status, COUNT(*) AS count FROM leads WHERE owner_id = ? GROUP BY status').all(req.user.id);
    const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
    for (const row of rows) counts[row.status] = row.count;
    res.json({ total: Object.values(counts).reduce((sum, count) => sum + count, 0), counts });
  });
  app.get('/api/leads', (req, res) => {
    const q = String(req.query.q || '').trim();
    const status = String(req.query.status || '').trim();
    if (status && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status filter.' });
    const rows = db.prepare(`SELECT * FROM leads WHERE owner_id = ? AND (? = '' OR name LIKE ? ESCAPE '\\' COLLATE NOCASE) AND (? = '' OR status = ?) ORDER BY created_at DESC, id DESC`)
      .all(req.user.id, q, `%${q.replace(/[\\%_]/g, '\\$&')}%`, status, status);
    res.json({ leads: rows });
  });
  app.get('/api/leads/:id', (req, res) => {
    const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND owner_id = ?').get(Number(req.params.id), req.user.id);
    return lead ? res.json({ lead }) : res.status(404).json({ error: 'Lead not found.' });
  });
  app.post('/api/leads', (req, res) => {
    const { errors, values } = validateLead(req.body);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please check the highlighted fields.', errors });
    const result = db.prepare('INSERT INTO leads (owner_id,name,email,phone,company,source,status) VALUES (@owner_id,@name,@email,@phone,@company,@source,@status)').run({ ...values, owner_id: req.user.id });
    return res.status(201).json({ lead: db.prepare('SELECT * FROM leads WHERE id = ? AND owner_id = ?').get(result.lastInsertRowid, req.user.id) });
  });
  app.put('/api/leads/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid lead id.' });
    if (!db.prepare('SELECT id FROM leads WHERE id = ? AND owner_id = ?').get(id, req.user.id)) return res.status(404).json({ error: 'Lead not found.' });
    const { errors, values } = validateLead(req.body);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please check the highlighted fields.', errors });
    db.prepare('UPDATE leads SET name=@name,email=@email,phone=@phone,company=@company,source=@source,status=@status,updated_at=datetime(\'now\') WHERE id=@id AND owner_id=@owner_id').run({ ...values, id, owner_id: req.user.id });
    return res.json({ lead: db.prepare('SELECT * FROM leads WHERE id = ? AND owner_id = ?').get(id, req.user.id) });
  });
  app.delete('/api/leads/:id', (req, res) => {
    const result = db.prepare('DELETE FROM leads WHERE id = ? AND owner_id = ?').run(Number(req.params.id), req.user.id);
    return result.changes ? res.status(204).end() : res.status(404).json({ error: 'Lead not found.' });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
  const clientDist = path.resolve(here, '../dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html'), (err) => { if (err) res.status(404).send('Build the frontend with npm run build.'); }));
  app.use((err, _req, res, _next) => {
    if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'Request body must be valid JSON.' });
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });
  return app;
}
