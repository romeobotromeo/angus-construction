const express = require('express');
const router = express.Router();
const db = require('../db');
const { getBrief } = require('../ai');
const multer = require('multer');

const upload = multer({ dest: 'public/uploads/' });

function requireAuth(req, res, next) {
  if (req.session.role) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

function requireOwner(req, res, next) {
  if (req.session.role === 'owner') return next();
  res.status(403).json({ error: 'Forbidden' });
}

// ── Updates ──────────────────────────────────────────
router.get('/updates', requireAuth, async (req, res) => {
  const result = await db.query(`SELECT * FROM updates ORDER BY created_at DESC`);
  res.json(result.rows);
});

router.post('/updates', requireOwner, async (req, res) => {
  const { body } = req.body;
  if (!body) return res.status(400).json({ error: 'body required' });
  const result = await db.query(
    `INSERT INTO updates (body, source) VALUES ($1, 'web') RETURNING *`,
    [body]
  );
  res.json(result.rows[0]);
});

// ── Photos ────────────────────────────────────────────
router.get('/photos', requireAuth, async (req, res) => {
  const result = await db.query(`SELECT * FROM photos ORDER BY created_at DESC`);
  res.json(result.rows);
});

// ── Budget ────────────────────────────────────────────
router.get('/budget', requireOwner, async (req, res) => {
  const result = await db.query(`SELECT * FROM budget_items ORDER BY id`);
  res.json(result.rows);
});

router.patch('/budget/:id', requireOwner, async (req, res) => {
  const { spent } = req.body;
  const result = await db.query(
    `UPDATE budget_items SET spent = $1 WHERE id = $2 RETURNING *`,
    [spent, req.params.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
  res.json(result.rows[0]);
});

// ── Phases ────────────────────────────────────────────
router.get('/phases', requireAuth, async (req, res) => {
  const result = await db.query(`SELECT * FROM phases ORDER BY order_index`);
  res.json(result.rows);
});

router.patch('/phases/:id', requireOwner, async (req, res) => {
  const { status, completed_date } = req.body;
  const result = await db.query(
    `UPDATE phases SET status = $1, completed_date = $2 WHERE id = $3 RETURNING *`,
    [status, completed_date || null, req.params.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
  res.json(result.rows[0]);
});

// ── Inspections ───────────────────────────────────────
router.get('/inspections', requireOwner, async (req, res) => {
  const result = await db.query(`SELECT * FROM inspections ORDER BY date DESC`);
  res.json(result.rows);
});

// ── Subs ──────────────────────────────────────────────
router.get('/subs', requireOwner, async (req, res) => {
  const result = await db.query(`SELECT * FROM subs ORDER BY trade, name`);
  res.json(result.rows);
});

router.post('/subs', requireOwner, async (req, res) => {
  const { name, trade, typical_lead_days, phone } = req.body;
  const result = await db.query(
    `INSERT INTO subs (name, trade, typical_lead_days, phone) VALUES ($1, $2, $3, $4) RETURNING *`,
    [name, trade, typical_lead_days || null, phone || null]
  );
  res.json(result.rows[0]);
});

// ── Config ────────────────────────────────────────────
router.get('/config/:key', requireAuth, async (req, res) => {
  const result = await db.query(`SELECT value FROM config WHERE key = $1`, [req.params.key]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ key: req.params.key, value: result.rows[0].value });
});

router.get('/config', requireAuth, async (req, res) => {
  const result = await db.query(`SELECT key, value FROM config`);
  const config = {};
  result.rows.forEach(r => { config[r.key] = r.value; });
  res.json(config);
});

router.patch('/config/:key', requireOwner, async (req, res) => {
  const { value } = req.body;
  await db.query(
    `INSERT INTO config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2`,
    [req.params.key, value]
  );
  res.json({ key: req.params.key, value });
});

// ── AI Brief ──────────────────────────────────────────
router.get('/ai-brief', requireOwner, async (req, res) => {
  try {
    const brief = await getBrief(false);
    if (!brief) return res.json(null);
    res.json(brief);
  } catch (err) {
    console.error('AI brief error:', err);
    res.status(500).json({ error: 'Failed to generate brief' });
  }
});

router.post('/ai-brief/refresh', requireOwner, async (req, res) => {
  try {
    const brief = await getBrief(true);
    res.json(brief);
  } catch (err) {
    console.error('AI brief refresh error:', err);
    res.status(500).json({ error: 'Failed to refresh brief' });
  }
});

// ── Architect Plans ───────────────────────────────────
router.get('/architect-plans', requireOwner, async (req, res) => {
  const result = await db.query(`SELECT * FROM architect_plans ORDER BY uploaded_at DESC`);
  res.json(result.rows);
});

router.post('/architect-plans', requireOwner, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const fileUrl = `/uploads/${req.file.filename}`;
  const label = req.body.label || req.file.originalname;
  const result = await db.query(
    `INSERT INTO architect_plans (file_url, label) VALUES ($1, $2) RETURNING *`,
    [fileUrl, label]
  );
  res.json(result.rows[0]);
});

module.exports = router;
