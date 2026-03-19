// ── Helpers ─────────────────────────────────────────────────
function usd(n) {
  const num = parseFloat(n) || 0;
  if (num >= 1000000) return '$' + (num/1000000).toFixed(1).replace(/\.0$/,'') + 'M';
  if (num >= 1000) return '$' + Math.round(num/1000) + 'K';
  return '$' + Math.round(num).toLocaleString();
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateShort(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
function daysUntil(iso) {
  if (!iso) return null;
  return Math.ceil((new Date(iso) - new Date()) / (1000 * 60 * 60 * 24));
}

async function api(path) {
  const res = await fetch('/api' + path);
  if (!res.ok) throw new Error(`API ${path} failed`);
  return res.json();
}

// ── Config ───────────────────────────────────────────────────
async function loadConfig() {
  const config = await api('/config');
  document.getElementById('project-address').textContent = config.project_address || '2961 W Angus St';
  document.getElementById('project-sub').innerHTML = `Los Angeles, CA · Last updated ${fmtDate(new Date().toISOString())}`;

  const target = config.target_end_date;
  const days = daysUntil(target);
  document.getElementById('m-target').textContent = target ? fmtDateShort(target) : '—';
  document.getElementById('m-days').textContent = days !== null ? `${days} days out` : '—';

  const price = parseFloat(config.target_list_price) || 0;
  document.getElementById('m-list').textContent = price ? usd(price) : '—';

  if (config.webcam_url) {
    document.getElementById('cam-container').innerHTML = `<iframe src="${config.webcam_url}" allowfullscreen style="width:100%;height:160px;border:none;border-radius:8px;"></iframe>`;
  }
}

// ── Phases ───────────────────────────────────────────────────
async function loadPhases() {
  const phases = await api('/phases');
  const done = phases.filter(p => p.status === 'done').length;
  const pct = phases.length > 0 ? Math.round((done / phases.length) * 100) : 0;

  document.getElementById('m-pct').textContent = pct + '%';
  document.getElementById('phases-bar').style.width = pct + '%';
  document.getElementById('phases-meta').textContent = `${pct}% complete`;

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

// ── Updates ──────────────────────────────────────────────────
async function loadUpdates() {
  const updates = await api('/updates');
  const html = updates.slice(0, 8).map(u => `
    <div class="update-item">
      <div class="update-meta">${fmtDate(u.created_at)}</div>
      <div class="update-text">${u.body}</div>
    </div>`).join('');
  document.getElementById('updates-list').innerHTML = html || '<div class="empty-state">No updates yet.</div>';
}

// ── Photos ───────────────────────────────────────────────────
async function loadPhotos() {
  const photos = await api('/photos');
  const html = photos.map(p => `
    <div class="photo-thumb" onclick="window.open('${p.url}','_blank')" title="${p.caption || ''}">
      <img src="${p.url}" alt="${p.caption || ''}" onerror="this.parentNode.innerHTML='<div class=\\'photo-thumb-label\\'>${p.caption || fmtDate(p.created_at)}</div>'">
    </div>`).join('');
  document.getElementById('photos-grid').innerHTML = html || '<div class="empty-state">No photos yet.</div>';
}

// ── Init ─────────────────────────────────────────────────────
async function init() {
  await Promise.all([loadConfig(), loadPhases(), loadUpdates(), loadPhotos()]);
}

init();
