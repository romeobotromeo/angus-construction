# Project: Angus Construction Dashboard

**Owner:** Josh / Naomi
**Subdomain:** angus.textmarco.com
**Stack:** Node.js/Express + PostgreSQL + Vanilla JS (matches TextMarco/marco-clean)
**Deployed on:** Render (separate service from marco-clean)
**Status:** MVP in development

---

## Architecture Overview

Two dashboards, one codebase, one Express server.

| Route | Dashboard | Access |
|---|---|---|
| `/login` | Single login page | Public |
| `/owner` | Naomi's Command Center | OWNER_PASS |
| `/investor` | Investor View | INVESTOR_PASS |

Auth via env vars — password routes user to correct dashboard. No user accounts, no JWT. Simple session cookie.

---

## Tech Stack

Same as marco-clean:
- **Runtime:** Node.js
- **Framework:** Express
- **Database:** PostgreSQL (Render, same or new DB)
- **Frontend:** Vanilla JS (no React, no bundler)
- **AI:** `@anthropic-ai/sdk` — Claude API (owner dashboard only)
- **SMS:** Twilio webhook (same pattern as marco-clean)
- **Cron:** `node-cron`
- **Deployment:** Render web service

---

## Database Tables

All created via migration file (`migrations/001_init.sql`).

```sql
-- Project updates (from SMS or web)
CREATE TABLE updates (
  id SERIAL PRIMARY KEY,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  source TEXT DEFAULT 'web' -- 'sms' | 'web'
);

-- Photos
CREATE TABLE photos (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Budget line items
CREATE TABLE budget_items (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  budgeted NUMERIC(12,2) DEFAULT 0,
  spent NUMERIC(12,2) DEFAULT 0
);

-- Inspections
CREATE TABLE inspections (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  date DATE,
  duration_label TEXT,
  status TEXT DEFAULT 'pending', -- 'pending' | 'scheduled' | 'passed' | 'failed'
  audio_url TEXT
);

-- Project phases
CREATE TABLE phases (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- 'done' | 'active' | 'pending'
  completed_date DATE,
  order_index INTEGER NOT NULL
);

-- Subcontractors
CREATE TABLE subs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  trade TEXT NOT NULL,
  typical_lead_days INTEGER,
  phone TEXT
);

-- Config key/value store
CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT
);
-- Seeds:
-- INSERT INTO config (key, value) VALUES ('target_end_date', '2026-09-01');
-- INSERT INTO config (key, value) VALUES ('project_address', '123 Main St');
-- INSERT INTO config (key, value) VALUES ('project_name', 'Angus Construction');
-- INSERT INTO config (key, value) VALUES ('target_list_price', '1200000');
-- INSERT INTO config (key, value) VALUES ('webcam_url', ''); -- empty until Reolink installed

-- AI daily brief cache
CREATE TABLE ai_daily_brief (
  id SERIAL PRIMARY KEY,
  content_json JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Architect plans / reference docs
CREATE TABLE architect_plans (
  id SERIAL PRIMARY KEY,
  file_url TEXT NOT NULL,
  label TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Environment Variables

```
DATABASE_URL          — Render PostgreSQL connection string
ANTHROPIC_API_KEY     — Claude API key (from marco-clean env)
TWILIO_ACCOUNT_SID    — Twilio (from marco-clean env)
TWILIO_AUTH_TOKEN     — Twilio (from marco-clean env)
TWILIO_PHONE_NUMBER   — Twilio number for this project
OWNER_PASS            — Password → /owner dashboard
INVESTOR_PASS         — Password → /investor dashboard
SESSION_SECRET        — Express session secret
PORT                  — Render sets this automatically
```

---

## Server Structure

```
angus-construction/
  server.js              ← Main Express app
  db.js                  ← PostgreSQL pool (same pattern as marco-clean)
  ai.js                  ← AI brief generation logic
  routes/
    auth.js              ← Login + session
    owner.js             ← Owner dashboard routes
    investor.js          ← Investor dashboard routes
    sms.js               ← Twilio webhook
    api.js               ← JSON API endpoints (data mutations)
  public/
    owner.html           ← Naomi's Command Center
    investor.html        ← Investor View
    login.html           ← Login page
    css/
      shared.css         ← Design system (shared between dashboards)
      owner.css
      investor.css
    js/
      owner.js           ← Owner dashboard JS
      investor.js        ← Investor dashboard JS
  migrations/
    001_init.sql         ← All table definitions
  package.json
  CLAUDE.md
```

---

## Auth Flow

1. User visits any protected route → redirected to `/login` if no session
2. `/login` POST — checks password against `OWNER_PASS` or `INVESTOR_PASS`
3. Sets session: `{ role: 'owner' }` or `{ role: 'investor' }`
4. Redirects to `/owner` or `/investor`
5. Middleware checks `req.session.role` on protected routes

Use `express-session` with a simple in-memory store (fine for single-user internal tool).

---

## SMS Commands (Twilio Webhook → POST /sms)

| Command | Action |
|---|---|
| `UPDATE <text>` | Insert into `updates` (source: 'sms') |
| `PHOTO` + MMS | Download image, store URL in `photos` |
| `BUDGET <label> <amount>` | Update `budget_items.spent` where label matches |
| `PHASE <name> done` | Set phase status to 'done', set completed_date to today |
| `SUB <name> <trade> <lead_days> <phone>` | Insert into `subs` |

Reply with confirmation SMS for each command. Unknown command → reply with help list.

---

## Dashboard 1 — Naomi's Command Center (`/owner`)

### Modules (top to bottom)
1. **AI Daily Brief** — urgent / this_week / watching / days_to_target (see AI section)
2. **Project Header** — name, address, target end date (inline editable)
3. **Phase Tracker** — progress bar + phase list with status badges
4. **Budget Summary** — table: label / budgeted / spent / remaining / % used
5. **Updates Feed** — reverse chron, source badge (SMS/web), add update form
6. **Inspections** — list with status, date, audio link
7. **Photo Stream** — grid with captions
8. **Architect Plans** — file list with labels, upload button
9. **Subs List** — name, trade, lead time, phone (click to call)
10. **Webcam** — embed if `webcam_url` set in config, else stub card

### Inline Editing
- Target end date: click to edit, saves to `config` table via PATCH `/api/config/target_end_date`
- Budget items: click spent amount to edit inline

---

## Dashboard 2 — Investor View (`/investor`)

### Modules (read-only, no financials)
1. **Project Header** — name, address, status badge
2. **3 Metric Cards** — % complete (phases done/total), est. completion (from config), target list price
3. **Phase Tracker** — progress bar + phase list (same component, read-only)
4. **Webcam Embed** — live stream or stub
5. **Updates Feed** — reverse chron, read-only
6. **Photo Stream** — grid

No budget. No subs. No architect plans. No AI. Clean and confident.

---

## AI Daily Brief

### Trigger
- **Cron:** Daily at 6 AM PT (`0 6 * * * America/Los_Angeles`)
- **On-demand:** "Refresh" button on owner dashboard → POST `/api/ai-brief/refresh`
- **Cache:** Stored in `ai_daily_brief` table. Serve cached unless stale (> 23 hours) or manual refresh.

### Inputs to Claude
```js
{
  updates: [...],           // last 30 days
  phases: [...],            // all phases with status + order
  budget: [...],            // all budget_items
  target_end_date: "",      // from config
  subs: [...],              // all subs with lead_times
  photos: [...],            // most recent 5 (base64 encoded)
  plans: [...]              // architect plans (base64)
}
```

### System Prompt
```
You are a construction project manager. Your only job is to tell the owner what to do TODAY and THIS WEEK to finish by [target_end_date]. Be specific. Name trades. Give deadlines. Flag anything that will cause a delay if not acted on in the next 48 hours. Do not summarize what has already happened. Do not explain your reasoning. Output only a prioritized action list.
```

### Response Schema (JSON)
```json
{
  "urgent": ["action 1", "action 2"],
  "this_week": ["action 3", "action 4"],
  "watching": ["potential delay 1"],
  "days_to_target": 112,
  "on_track": true
}
```

### Rendering (owner dashboard top card)
- **Urgent** items → amber background, bold
- **This week** → default styling
- **Watching** → muted/gray
- **Days to target** + **on_track** badge → shown in card header

---

## API Endpoints

```
POST /login                    — auth
POST /logout                   — clear session

GET  /owner                    — owner dashboard HTML
GET  /investor                 — investor dashboard HTML

GET  /api/updates              — all updates (reverse chron)
POST /api/updates              — add update (web)
GET  /api/photos               — all photos
GET  /api/budget               — all budget items
PATCH /api/budget/:id          — update spent amount
GET  /api/phases               — all phases (ordered)
PATCH /api/phases/:id          — update phase status
GET  /api/inspections          — all inspections
GET  /api/subs                 — all subs
POST /api/subs                 — add sub
GET  /api/config/:key          — get config value
PATCH /api/config/:key         — set config value
GET  /api/ai-brief             — get latest brief (cached)
POST /api/ai-brief/refresh     — regenerate brief now
GET  /api/architect-plans      — list plans
POST /api/architect-plans      — upload plan (multipart)

POST /sms                      — Twilio webhook
```

---

## Webcam

Field stubbed. When Reolink is installed:
1. Set `webcam_url` in config table via PATCH `/api/config/webcam_url`
2. Dashboard reads it on load and embeds `<iframe>` or `<img>` tag automatically
3. No code change needed — config-driven

---

## Design System

- Match the mockup HTML (to be pasted) for visual reference
- Dark or neutral professional palette
- Shared CSS design tokens across both dashboards
- Mobile-friendly — owner uses this in the field
- No external CSS frameworks — vanilla CSS only (matching TextMarco pattern)

---

## Deployment (Render)

1. New Render web service: `angus-construction`
2. Start command: `node server.js`
3. Set all env vars in Render dashboard
4. Add custom domain: `angus.textmarco.com` → Render URL
5. Run `001_init.sql` against the DB manually after first deploy
6. Seed `config` table with project defaults

---

## Post-MVP
- Multiple projects (multi-tenant with project_id on all tables)
- Photo upload directly from owner dashboard (not just SMS)
- Inspection audio transcription via Whisper
- Auth upgrade: proper user accounts + JWT
- Stripe paywall if productized
