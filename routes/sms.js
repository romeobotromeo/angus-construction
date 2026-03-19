const express = require('express');
const router = express.Router();
const db = require('../db');
const axios = require('axios');

const ALLOWED_PHONES = () => [
  process.env.OWNER_PHONE,
  process.env.NAOMI_PHONE,
].filter(Boolean);

async function sendSMS(to, body) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  try {
    await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      new URLSearchParams({ To: to, From: from, Body: body }),
      { auth: { username: accountSid, password: authToken } }
    );
  } catch (err) {
    console.error('SMS send error:', err.message);
  }
}

function twimlResponse(body) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${body}</Message></Response>`;
}

function normalize(phone) {
  return phone ? phone.replace(/\D/g, '') : '';
}

router.post('/', express.urlencoded({ extended: false }), async (req, res) => {
  const from = req.body.From || '';
  const body = (req.body.Body || '').trim();
  const mediaUrl = req.body.MediaUrl0 || null;

  res.set('Content-Type', 'text/xml');

  // Whitelist check
  const allowed = ALLOWED_PHONES();
  if (allowed.length > 0 && !allowed.some(p => normalize(p) === normalize(from))) {
    console.log(`Rejected SMS from unknown number: ${from}`);
    return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
  }

  try {
    const upper = body.toUpperCase();

    // UPDATE <text>
    if (upper.startsWith('UPDATE ')) {
      const text = body.slice(7).trim();
      await db.query(`INSERT INTO updates (body, source) VALUES ($1, 'sms')`, [text]);
      return res.send(twimlResponse('Got it. Update posted to dashboard.'));
    }

    // PHOTO [caption] + MMS
    if (mediaUrl) {
      const caption = body.toUpperCase().startsWith('PHOTO ')
        ? body.slice(6).trim()
        : body.startsWith('PHOTO') ? null : body || null;
      const finalCaption = caption || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      await db.query(`INSERT INTO photos (url, caption) VALUES ($1, $2)`, [mediaUrl, finalCaption]);
      return res.send(twimlResponse('Got it. Photo saved to dashboard.'));
    }

    // BUDGET <label> <amount>
    if (upper.startsWith('BUDGET ')) {
      const parts = body.slice(7).trim().split(' ');
      const amount = parseFloat(parts[parts.length - 1]);
      const label = parts.slice(0, -1).join(' ');
      if (isNaN(amount)) return res.send(twimlResponse('Format: BUDGET <label> <amount>'));
      const result = await db.query(
        `UPDATE budget_items SET spent = $1 WHERE LOWER(label) = LOWER($2) RETURNING label`,
        [amount, label]
      );
      if (result.rowCount === 0) return res.send(twimlResponse(`No budget item found for "${label}". Check spelling.`));
      return res.send(twimlResponse(`Got it. ${result.rows[0].label} updated to $${Number(amount).toLocaleString()} spent.`));
    }

    // PHASE <name> DONE
    if (upper.startsWith('PHASE ')) {
      const rest = body.slice(6).trim();
      const doneMatch = rest.match(/^(.+?)\s+done$/i);
      if (!doneMatch) return res.send(twimlResponse('Format: PHASE <name> DONE'));
      const phaseName = doneMatch[1];
      const result = await db.query(
        `UPDATE phases SET status = 'done', completed_date = CURRENT_DATE WHERE LOWER(name) LIKE LOWER($1) RETURNING name`,
        [`%${phaseName}%`]
      );
      if (result.rowCount === 0) return res.send(twimlResponse(`No phase found matching "${phaseName}".`));
      return res.send(twimlResponse(`Got it. ${result.rows[0].name} marked complete.`));
    }

    // INSPECT <title> PASS or INSPECT <title> PENDING
    if (upper.startsWith('INSPECT ')) {
      const rest = body.slice(8).trim();
      const passMatch = rest.match(/^(.+?)\s+(pass|passed|pending|fail|failed)$/i);
      if (!passMatch) return res.send(twimlResponse('Format: INSPECT <title> PASS or INSPECT <title> PENDING'));
      const title = passMatch[1];
      const rawStatus = passMatch[2].toLowerCase();
      const status = rawStatus === 'pass' || rawStatus === 'passed' ? 'passed'
        : rawStatus === 'fail' || rawStatus === 'failed' ? 'failed'
        : 'pending';
      // Try to update existing, else insert
      const existing = await db.query(
        `SELECT id FROM inspections WHERE LOWER(title) LIKE LOWER($1) ORDER BY id DESC LIMIT 1`,
        [`%${title}%`]
      );
      if (existing.rowCount > 0) {
        await db.query(`UPDATE inspections SET status = $1 WHERE id = $2`, [status, existing.rows[0].id]);
      } else {
        await db.query(
          `INSERT INTO inspections (title, date, status) VALUES ($1, CURRENT_DATE, $2)`,
          [title, status]
        );
      }
      return res.send(twimlResponse(`Got it. Inspection "${title}" marked ${status}.`));
    }

    // SUB <name> <trade> <lead_days> <phone>
    if (upper.startsWith('SUB ')) {
      const parts = body.slice(4).trim().split(' ');
      if (parts.length < 4) return res.send(twimlResponse('Format: SUB <name> <trade> <lead_days> <phone>'));
      const phone = parts[parts.length - 1];
      const leadDays = parseInt(parts[parts.length - 2]);
      const trade = parts[parts.length - 3];
      const name = parts.slice(0, -3).join(' ');
      await db.query(
        `INSERT INTO subs (name, trade, typical_lead_days, phone) VALUES ($1, $2, $3, $4)`,
        [name, trade, isNaN(leadDays) ? null : leadDays, phone]
      );
      return res.send(twimlResponse(`Got it. ${name} (${trade}) added to subs list.`));
    }

    // Unknown
    return res.send(twimlResponse(
      'Unrecognized command. Try UPDATE, PHOTO, BUDGET, PHASE, INSPECT, or SUB.'
    ));

  } catch (err) {
    console.error('SMS handler error:', err);
    res.send(twimlResponse('Error processing command. Try again.'));
  }
});

module.exports = router;
