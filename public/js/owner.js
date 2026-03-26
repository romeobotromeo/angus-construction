// ── Helpers ────────────────────────────────────────────────
function usd(n) {
  const num = parseFloat(n) || 0;
  if (num >= 1000000) return '$' + (num/1000000).toFixed(1).replace(/\.0$/,'') + 'M';
  if (num >= 1000) return '$' + Math.round(num/1000) + 'K';
  return '$' + Math.round(num).toLocaleString();
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function daysUntil(iso) {
  if (!iso) return null;
  const diff = new Date(iso) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json();
}

// ── Load Config ─────────────────────────────────────────────
async function loadConfig() {
  const config = await api('/config');

  document.getElementById('project-address').textContent = config.project_address || '—';
  document.getElementById('sidebar-project-name').textContent = '· ' + (config.project_name || 'Gibson House');
  document.getElementById('sidebar-user').textContent = config.owner_name || 'Naomi';
  document.getElementById('last-updated').textContent = 'Last updated ' + fmtDate(new Date().toISOString());

  // Target date metric
  const target = config.target_end_date;
  const days = daysUntil(target);
  const targetEl = document.getElementById('m-target');
  targetEl.dataset.iso = target || '';
  targetEl.textContent = target ? fmtDateShort(target) : '—';
  document.getElementById('m-days').textContent = days !== null ? `${days} days` : '—';

  // List price
  const price = parseFloat(config.target_list_price) || 0;
  document.getElementById('m-list').textContent = price ? usd(price) : '—';
  const be = parseFloat(config.break_even_price) || 0;
  document.getElementById('m-breakeven').textContent = be ? `Break even ${usd(be)}` : '';

  // SMS number
  const smsEl = document.getElementById('sms-number');
  if (smsEl && config.sms_number) smsEl.textContent = config.sms_number;

  // Webcam
  if (config.webcam_url) {
    document.getElementById('cam-container').innerHTML = `<iframe src="${config.webcam_url}" allowfullscreen></iframe>`;
  }

  return config;
}

// ── Load Phases ─────────────────────────────────────────────
async function loadPhases() {
  const phases = await api('/phases');
  const done = phases.filter(p => p.status === 'done').length;
  const pct = phases.length > 0 ? Math.round((done / phases.length) * 100) : 0;

  document.getElementById('m-pct').textContent = pct + '%';
  document.getElementById('phases-bar').style.width = pct + '%';
  document.getElementById('phases-meta').textContent = `${pct}% complete · ${done}/${phases.length} phases`;

  const html = phases.map(p => {
    const dotClass = p.status === 'done' ? 'dot-done' : p.status === 'active' ? 'dot-active' : 'dot-pending';
    const statusText = p.status === 'done' ? `Done · ${fmtDateShort(p.completed_date)}` : p.status === 'active' ? 'In progress' : 'Upcoming';
    return `<div class="phase-row">
      <div class="phase-dot ${dotClass}"></div>
      <div class="phase-name">${p.name}</div>
      <div class="phase-status">${statusText}</div>
    </div>`;
  }).join('');
  document.getElementById('phases-list').innerHTML = html || '<div class="empty-state">No phases yet.</div>';
}

// ── Load Updates ─────────────────────────────────────────────
async function loadUpdates() {
  const updates = await api('/updates');
  const html = updates.slice(0, 10).map(u => `
    <div class="update-item">
      <div class="update-meta">
        ${fmtDate(u.created_at)}
        ${u.source === 'sms' ? '<span class="update-source">SMS</span>' : '<span class="update-source">Web</span>'}
      </div>
      <div class="update-text">${u.body}</div>
    </div>`).join('');
  document.getElementById('updates-list').innerHTML = html || '<div class="empty-state">No updates yet. Send UPDATE via SMS.</div>';
}

async function addUpdate() {
  const el = document.getElementById('new-update');
  const body = el.value.trim();
  if (!body) return;
  try {
    await api('/updates', { method: 'POST', body: JSON.stringify({ body }) });
    el.value = '';
    loadUpdates();
  } catch (err) {
    alert('Failed to save update. Try again.');
  }
}

// ── Load Budget ──────────────────────────────────────────────
async function loadBudget() {
  const items = await api('/budget');
  const totalBudgeted = items.reduce((s, i) => s + parseFloat(i.budgeted || 0), 0);
  const totalSpent = items.reduce((s, i) => s + parseFloat(i.spent || 0), 0);

  document.getElementById('m-spent').textContent = usd(totalSpent);
  document.getElementById('m-budgeted').textContent = `of ${usd(totalBudgeted)} budgeted`;

  const html = items.map(item => {
    const budgeted = parseFloat(item.budgeted) || 0;
    const spent = parseFloat(item.spent) || 0;
    const pct = budgeted > 0 ? Math.min((spent / budgeted) * 100, 100) : 0;
    const overBudget = spent > budgeted;
    const barColor = overBudget ? 'var(--amber-bar)' : 'var(--green-bar)';
    return `<div class="budget-row" data-id="${item.id}">
      <div class="budget-label">${item.label}</div>
      <div class="budget-bar-wrap"><div class="budget-bar-fill" style="width:${pct}%;background:${barColor};"></div></div>
      <div class="budget-amount" onclick="startBudgetEdit(this, ${item.id}, ${spent})">${usd(spent)} / ${usd(budgeted)}</div>
      <div class="budget-edit">
        <input type="number" value="${spent}" onblur="saveBudgetEdit(this, ${item.id})" onkeydown="if(event.key==='Enter')this.blur()">
      </div>
    </div>`;
  }).join('');
  document.getElementById('budget-list').innerHTML = html || '<div class="empty-state">No budget items.</div>';
}

function startBudgetEdit(el, id, current) {
  const row = el.closest('.budget-row');
  row.querySelector('.budget-amount').style.display = 'none';
  const editEl = row.querySelector('.budget-edit');
  editEl.style.display = 'block';
  editEl.querySelector('input').focus();
}

async function saveBudgetEdit(input, id) {
  const spent = parseFloat(input.value);
  try {
    if (!isNaN(spent)) {
      await api(`/budget/${id}`, { method: 'PATCH', body: JSON.stringify({ spent }) });
    }
  } catch (err) {
    alert('Failed to save. Try again.');
  }
  loadBudget();
}

// ── Load Inspections ─────────────────────────────────────────
async function loadInspections() {
  const items = await api('/inspections');
  const html = items.map(item => {
    const statusClass = item.status === 'passed' ? 'badge-green' : item.status === 'failed' ? 'badge-red' : 'badge-amber';
    const statusLabel = item.status === 'passed' ? 'Passed' : item.status === 'failed' ? 'Failed' : 'Pending';
    const audioBtn = item.audio_url
      ? `<div class="audio-btn" onclick="window.open('${item.audio_url}')"><div class="play-tri"></div></div>`
      : `<div class="audio-btn" style="opacity:0.3;cursor:default;"><div class="play-tri"></div></div>`;
    return `<div class="inspection-item">
      ${audioBtn}
      <div class="insp-info">
        <div class="insp-title">${item.title}</div>
        <div class="insp-meta">${item.date ? fmtDate(item.date) : '—'}${item.duration_label ? ' · ' + item.duration_label : ''}</div>
      </div>
      <div class="badge ${statusClass}">${statusLabel}</div>
    </div>`;
  }).join('');
  document.getElementById('inspections-list').innerHTML = html || '<div class="empty-state">No inspections yet.</div>';
}

// ── Load Photos ───────────────────────────────────────────────
async function loadPhotos() {
  const photos = await api('/photos');
  const html = photos.map(p => `
    <div class="photo-thumb" onclick="window.open('${p.url}','_blank')">
      <img src="${p.url}" alt="${p.caption || ''}" onerror="this.parentNode.innerHTML='<div class=\\'photo-thumb-label\\'>${p.caption || fmtDate(p.created_at)}</div>'">
    </div>`).join('');
  document.getElementById('photos-grid').innerHTML = html || '<div class="empty-state">No photos yet. Send PHOTO via SMS.</div>';
}

// ── Load Plans ────────────────────────────────────────────────
async function loadPlans() {
  const plans = await api('/architect-plans');
  const html = plans.map(p => `
    <div class="plan-row">
      <div class="plan-icon">📄</div>
      <div class="plan-label">${p.label}</div>
      <div class="plan-date">${fmtDate(p.uploaded_at)}</div>
      <a class="plan-link" href="${p.file_url}" target="_blank">Open</a>
    </div>`).join('');
  document.getElementById('plans-list').innerHTML = html || '<div class="empty-state">No plans uploaded yet.</div>';
}

async function uploadPlan(input) {
  if (!input.files.length) return;
  const file = input.files[0];
  const form = new FormData();
  form.append('file', file);
  form.append('label', file.name.replace(/\.[^.]+$/, ''));
  await fetch('/api/architect-plans', { method: 'POST', body: form });
  input.value = '';
  loadPlans();
}

// ── Load Subs ──────────────────────────────────────────────────
async function loadSubs() {
  const subs = await api('/subs');
  const html = subs.map(s => `
    <div class="sub-row">
      <div>
        <div class="sub-name">${s.name}</div>
        <div class="sub-trade">${s.trade}</div>
      </div>
      <div class="sub-lead">${s.typical_lead_days != null ? s.typical_lead_days + ' day lead' : '—'}</div>
      ${s.phone ? `<a class="sub-phone" href="tel:${s.phone}">${s.phone}</a>` : '<span class="sub-lead">—</span>'}
    </div>`).join('');
  document.getElementById('subs-list').innerHTML = html || '<div class="empty-state">No subs yet. Send SUB via SMS.</div>';
}

// ── AI Brief ───────────────────────────────────────────────────
async function loadBrief() {
  try {
    const brief = await api('/ai-brief');
    renderBrief(brief);
  } catch (err) {
    document.getElementById('brief-content').innerHTML = '<div class="empty-state">Brief unavailable. Check API key.</div>';
  }
}

async function refreshBrief() {
  const btn = document.getElementById('refresh-btn');
  btn.disabled = true;
  btn.textContent = 'Refreshing...';
  document.getElementById('brief-content').innerHTML = '<div class="loading-state">Generating brief...</div>';
  try {
    const brief = await api('/ai-brief/refresh', { method: 'POST' });
    renderBrief(brief);
  } catch (err) {
    document.getElementById('brief-content').innerHTML = '<div class="empty-state">Failed to refresh. Try again.</div>';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Refresh';
  }
}

function renderBrief(brief) {
  if (!brief) {
    document.getElementById('brief-content').innerHTML = '<div class="empty-state">No brief available. Click Refresh to generate.</div>';
    document.getElementById('brief-meta').textContent = 'Not yet generated';
    return;
  }

  const genDate = brief.generated_at ? fmtDate(brief.generated_at) : 'Today';
  const days = brief.days_to_target;
  const trackBadge = document.getElementById('brief-track-badge');
  trackBadge.style.display = 'inline-flex';
  trackBadge.className = brief.on_track ? 'ai-on-track' : 'ai-off-track';
  trackBadge.textContent = brief.on_track ? 'On track' : 'At risk';

  document.getElementById('brief-meta').innerHTML = `Generated ${genDate} · ${days != null ? `<span class="${brief.on_track ? 'on-track' : ''}" style="color:var(--green-text)">${days} days remaining</span>` : ''}`;

  const urgentHtml = (brief.urgent || []).map(a =>
    `<div class="ai-action-item urgent"><div class="ai-bullet">!</div><div>${a}</div></div>`
  ).join('');
  const weekHtml = (brief.this_week || []).map(a =>
    `<div class="ai-action-item week"><div class="ai-bullet">·</div><div>${a}</div></div>`
  ).join('');
  const watchHtml = (brief.watching || []).map(a =>
    `<div class="ai-action-item watch"><div class="ai-bullet">~</div><div>${a}</div></div>`
  ).join('');

  document.getElementById('brief-content').innerHTML = `
    ${urgentHtml ? `<div class="ai-section"><div class="ai-section-label">Urgent — act within 48 hours</div>${urgentHtml}</div>` : ''}
    ${weekHtml ? `<div class="ai-section"><div class="ai-section-label">This week</div>${weekHtml}</div>` : ''}
    ${watchHtml ? `<div class="ai-section" style="margin-bottom:0"><div class="ai-section-label">Watching</div>${watchHtml}</div>` : ''}
  `;
}

// ── Inline target date edit ─────────────────────────────────────
async function editTargetDate() {
  const el = document.getElementById('m-target');
  const currentVal = el.dataset.iso || '';
  const input = document.createElement('input');
  input.type = 'date';
  input.value = currentVal;
  input.style.cssText = 'font-size:18px;font-weight:500;border:none;background:transparent;outline:none;width:120px;';
  el.replaceWith(input);
  input.focus();
  input.onblur = async () => {
    const newDate = input.value;
    if (newDate && newDate !== currentVal) {
      await api('/config/target_end_date', { method: 'PATCH', body: JSON.stringify({ value: newDate }) });
      loadConfig();
    } else {
      loadConfig();
    }
  };
}

// ── Init ────────────────────────────────────────────────────────
async function init() {
  await Promise.all([
    loadConfig(),
    loadPhases(),
    loadUpdates(),
    loadBudget(),
    loadInspections(),
    loadPhotos(),
    loadPlans(),
    loadSubs(),
    loadBrief(),
  ]);
}

init();
