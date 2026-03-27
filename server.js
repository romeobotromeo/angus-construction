const express = require('express');
const session = require('express-session');
const cron = require('node-cron');
const path = require('path');
const { generateBrief } = require('./ai');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Render's proxy so secure cookies work over HTTPS
app.set('trust proxy', 1);

// ── Middleware ──────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'angus-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

// ── Routes ──────────────────────────────────────────────────
app.use('/', require('./routes/auth'));
app.use('/owner', require('./routes/owner'));
app.use('/investor', require('./routes/investor'));
app.use('/api', require('./routes/api'));
app.use('/sms', require('./routes/sms'));  // Twilio webhook: POST /sms

// Temp: verify env vars + DB connection
app.get('/debug-env', async (req, res) => {
  const db = require('./db');
  let dbOk = false;
  let dbError = null;
  try {
    await db.query('SELECT 1');
    dbOk = true;
  } catch (e) {
    dbError = e.message;
  }
  res.json({
    DATABASE_URL_SET: !!process.env.DATABASE_URL,
    OWNER_PASS_SET: !!process.env.OWNER_PASS,
    INVESTOR_PASS_SET: !!process.env.INVESTOR_PASS,
    SESSION_SECRET_SET: !!process.env.SESSION_SECRET,
    db_connected: dbOk,
    db_error: dbError,
  });
});

// Root redirect
app.get('/', (req, res) => {
  if (req.session.role === 'owner') return res.redirect('/owner');
  if (req.session.role === 'investor') return res.redirect('/investor');
  res.redirect('/login');
});

// ── Cron — AI daily brief at 6 AM PT ───────────────────────
cron.schedule('0 6 * * *', async () => {
  console.log('[cron] Generating daily AI brief...');
  try {
    await generateBrief();
    console.log('[cron] AI brief generated successfully.');
  } catch (err) {
    console.error('[cron] AI brief failed:', err.message);
  }
}, { timezone: 'America/Los_Angeles' });

// ── Start ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Angus dashboard running on port ${PORT}`);
});
