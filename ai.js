const Anthropic = require('@anthropic-ai/sdk');
const db = require('./db');

const client = new Anthropic();

async function generateBrief() {
  // Gather all inputs
  const [updates, phases, budget, subs, configRows] = await Promise.all([
    db.query(`SELECT * FROM updates WHERE created_at > NOW() - INTERVAL '30 days' ORDER BY created_at DESC`),
    db.query(`SELECT * FROM phases ORDER BY order_index`),
    db.query(`SELECT * FROM budget_items`),
    db.query(`SELECT * FROM subs`),
    db.query(`SELECT key, value FROM config`),
  ]);

  const config = {};
  configRows.rows.forEach(r => { config[r.key] = r.value; });

  const photos = await db.query(`SELECT * FROM photos ORDER BY created_at DESC LIMIT 5`);
  const plans = await db.query(`SELECT * FROM architect_plans ORDER BY uploaded_at DESC`);

  const targetDate = config.target_end_date || 'unknown';
  const today = new Date();
  const target = new Date(targetDate);
  const daysToTarget = Math.ceil((target - today) / (1000 * 60 * 60 * 24));

  const systemPrompt = `You are a construction project manager. Your only job is to tell the owner what to do TODAY and THIS WEEK to finish by ${targetDate}. Be specific. Name trades. Give deadlines. Flag anything that will cause a delay if not acted on in the next 48 hours. Do not summarize what has already happened. Do not explain your reasoning. Output only a prioritized action list.

Respond ONLY with valid JSON matching this exact schema:
{
  "urgent": ["action 1", "action 2"],
  "this_week": ["action 3", "action 4"],
  "watching": ["potential delay 1"],
  "days_to_target": ${daysToTarget},
  "on_track": true
}`;

  const userContent = `Project context:
Target end date: ${targetDate}
Days remaining: ${daysToTarget}
Project address: ${config.project_address}

PHASES:
${phases.rows.map(p => `- ${p.name}: ${p.status}${p.completed_date ? ` (completed ${p.completed_date})` : ''}`).join('\n')}

RECENT UPDATES (last 30 days):
${updates.rows.map(u => `[${u.created_at.toISOString().slice(0,10)}] ${u.body}`).join('\n') || 'No recent updates.'}

BUDGET:
${budget.rows.map(b => `- ${b.label}: $${b.spent} spent of $${b.budgeted} budgeted`).join('\n')}

SUBS:
${subs.rows.map(s => `- ${s.name} (${s.trade}): ${s.typical_lead_days} day lead time, ${s.phone}`).join('\n') || 'No subs on record.'}

PHOTOS: ${photos.rows.length} recent photos on file.
PLANS: ${plans.rows.length} architect plan files on file.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  const text = response.content[0].text.trim();
  // Extract JSON from response (handle potential markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI did not return valid JSON');
  const parsed = JSON.parse(jsonMatch[0]);

  // Cache to DB
  await db.query(
    `INSERT INTO ai_daily_brief (content_json, generated_at) VALUES ($1, NOW())`,
    [JSON.stringify(parsed)]
  );

  return parsed;
}

async function getCachedBrief() {
  const result = await db.query(
    `SELECT content_json, generated_at FROM ai_daily_brief ORDER BY generated_at DESC LIMIT 1`
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  const ageHours = (Date.now() - new Date(row.generated_at).getTime()) / (1000 * 60 * 60);
  if (ageHours > 23) return null; // stale
  return { ...row.content_json, generated_at: row.generated_at };
}

async function getBrief(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = await getCachedBrief();
    if (cached) return cached;
  }
  return generateBrief();
}

module.exports = { getBrief, generateBrief };
