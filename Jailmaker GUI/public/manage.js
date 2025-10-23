/**********************************************
 * manage.js  (modern UI + streaming logs + statusbar + theme)
 **********************************************/

const sandboxesContainer = document.getElementById('sandboxesContainer');
const pathsList = document.getElementById('paths-list');
const showAllBtn = document.getElementById('showAllBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPopup = document.getElementById('settingsPopup');
const settingsForm = document.getElementById('settingsForm');
const settingsCloseBtn = document.getElementById('settingsCloseBtn');
const btnCreateJailTop = document.getElementById('btnCreateJailTop');
const fabCreate = document.getElementById('fabCreate');
const statusBar = document.getElementById('statusBar');
const themeToggle = document.getElementById('themeToggle');
const themeIcon = document.getElementById('themeIcon');
const themeLabel = document.getElementById('themeLabel');

const username = localStorage.getItem('username');
if (!username) {
  window.location.href = '/index.html';
}

let allSandboxes = [];
let allPaths = [];           // NEW: track all paths globally
let selectedPath = null;

/* ---------- theme ---------- */
(function initTheme(){
  const saved = localStorage.getItem('theme') || 'dark';
  if (saved === 'light') document.body.classList.add('theme-light');
  updateThemeLabel();
})();
themeToggle?.addEventListener('click', () => {
  document.body.classList.toggle('theme-light');
  localStorage.setItem('theme', document.body.classList.contains('theme-light') ? 'light' : 'dark');
  updateThemeLabel();
});
function updateThemeLabel(){
  const light = document.body.classList.contains('theme-light');
  themeIcon.textContent = light ? '☀️' : '🌙';
  themeLabel.textContent = light ? 'Light' : 'Dark';
}

/* ---------- helpers ---------- */
function toast(msg, type='ok', ms=3200){
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

function cleanOutputLine(line) {
  const cleanedLine = line
    .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
    .trim();
  if (
    cleanedLine.startsWith('NAME') ||
    cleanedLine.startsWith('[sudo]') ||
    cleanedLine === '' ||
    cleanedLine.startsWith('/mnt/')
  ) {
    return null;
  }
  return cleanedLine;
}

function uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* ---------- log streaming modal ---------- */
function openLogStreamModal(title, actionId) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <h3>${title}</h3>
    <pre id="logView" style="
      background:#0f172a;border:1px solid rgba(255,255,255,.12);
      border-radius:10px; padding:10px; height:50vh; overflow:auto; white-space:pre-wrap;
    ">Connecting...</pre>
    <div class="topbar actions" style="justify-content:flex-end;">
      <button id="closeLogBtn" class="close-button">Close</button>
    </div>
  `;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // drag by header
  const h3 = modal.querySelector('h3');
  h3.addEventListener('mousedown', e => dragModal(e, modal));
  function dragModal(e, el){
    e.preventDefault();
    let startX = e.clientX, startY = e.clientY;
    const rect = el.getBoundingClientRect();
    const origTop = rect.top, origLeft = rect.left;
    function onMove(ev){
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      el.style.position = 'absolute';
      el.style.top = (origTop + dy) + 'px';
      el.style.left = (origLeft + dx) + 'px';
    }
    function onUp(){
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  const logView = modal.querySelector('#logView');
  const closeBtn = modal.querySelector('#closeLogBtn');

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws/actionLogs?actionId=${encodeURIComponent(actionId)}`);

  function append(text) {
    logView.textContent += text;
    logView.scrollTop = logView.scrollHeight;
  }

  ws.onopen = () => {
    logView.textContent = `[${new Date().toLocaleTimeString()}] Connected.\n\n`;
  };
  ws.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      if (msg?.type === 'done') {
        append(`\n\n[${new Date().toLocaleTimeString()}] ${msg.success ? 'Completed successfully.' : 'Finished with errors.'}\n`);
        ws.close();
        if (window.refreshSandboxes) setTimeout(refreshSandboxes, 500);
        return;
      }
      if (msg?.type === 'error' && msg?.message) {
        append(`\n[ERROR] ${msg.message}\n`);
        return;
      }
      append(evt.data + '\n');
    } catch {
      append(evt.data);
    }
  };
  ws.onerror = () => append('\n[WebSocket error]\n');
  ws.onclose = () => append('\n[Connection closed]\n');

  closeBtn.addEventListener('click', () => {
    try { ws.close(); } catch {}
    overlay.remove();
  });

  return {
    close: () => { try { ws.close(); } catch {} overlay.remove(); }
  };
}

/* EXPOSE for createJail.js */
window.openLogStreamModal = openLogStreamModal;

/* ---------- UI actions ---------- */
if (btnCreateJailTop) btnCreateJailTop.addEventListener('click', () => window.openCreateJailPopup && window.openCreateJailPopup());
if (fabCreate) fabCreate.addEventListener('click', () => window.openCreateJailPopup && window.openCreateJailPopup());

/* toggle drawer on mobile */
document.getElementById('toggleLeftPane').addEventListener('click', () => {
  document.getElementById('left-pane').classList.toggle('open');
});

/* swipe gestures (mobile) */
let touchStartX = 0;
let touchEndX = 0;
document.addEventListener('touchstart', e => touchStartX = e.changedTouches[0].screenX, false);
document.addEventListener('touchend', e => { touchEndX = e.changedTouches[0].screenX; handleSwipe(); }, false);
function handleSwipe() {
  if (touchEndX > touchStartX + 50) document.getElementById('left-pane').classList.add('open');
  if (touchEndX < touchStartX - 50) document.getElementById('left-pane').classList.remove('open');
}

/* show all */
showAllBtn.addEventListener('click', () => {
  selectedPath = null;
  document.querySelectorAll('#paths-list .path-box').forEach(b => b.classList.remove('active'));
  showAllBtn.classList.add('active');
  displaySandboxes(allSandboxes);

  // NEW: recompute status for ALL paths
  const allJailsFlat = flattenJails(allSandboxes);
  renderStatusBar(allJailsFlat, allPaths.length);
});

/* ---------- data flow ---------- */
async function fetchSandboxes() {
  sandboxesContainer.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>`;
  try {
    const res = await fetch(`/api/getSandboxes?username=${encodeURIComponent(username)}`);
    const data = await res.json();
    if (!data.success) {
      sandboxesContainer.textContent = 'Error: ' + data.message;
      statusBar.innerHTML = '';
      return;
    }

    const oldChoice = selectedPath;
    pathsList.innerHTML = '';
    allSandboxes = data.sandboxes;

    allSandboxes.sort((a, b) => {
      const aN = (a.output.split(/\s+/)[0] || '').toLowerCase();
      const bN = (b.output.split(/\s+/)[0] || '').toLowerCase();
      return aN.localeCompare(bN);
    });

    // NEW: assign to global
    allPaths = [...new Set(allSandboxes.map(s => s.path))];

    allPaths.forEach(path => {
      const box = document.createElement('div');
      box.className = 'path-box';
      box.textContent = `Path: ${path}`;
      box.dataset.path = path;
      box.addEventListener('click', () => {
        selectedPath = path;
        showAllBtn.classList.remove('active');
        document.querySelectorAll('#paths-list .path-box').forEach(b => b.classList.remove('active'));
        box.classList.add('active');
        filterSandboxes(path, box);
      });
      pathsList.appendChild(box);
    });

    // Build flat jail list for status bar + render
    const jailList = flattenJails(allSandboxes);
    renderStatusBar(jailList, allPaths.length);

    if (oldChoice) {
      const re = [...pathsList.querySelectorAll('.path-box')].find(b => b.dataset.path === oldChoice);
      if (re) {
        re.classList.add('active');
        filterSandboxes(oldChoice, re);
      } else {
        selectedPath = null;
        showAllBtn.classList.add('active');
        displaySandboxes(allSandboxes);
      }
    } else {
      showAllBtn.classList.add('active');
      displaySandboxes(allSandboxes);
    }
  } catch (err) {
    sandboxesContainer.textContent = 'Error loading sandboxes: ' + err.toString();
    statusBar.innerHTML = '';
  }
}

async function refreshSandboxes() {
  const scrollPos = sandboxesContainer.scrollTop;
  await fetchSandboxes();
  sandboxesContainer.scrollTop = scrollPos;
}
window.refreshSandboxes = refreshSandboxes;

/* ---------- helpers for rendering ---------- */
function flattenJails(sandboxes) {
  const jailList = [];
  sandboxes.forEach(sbox => {
    sbox.output
      .split('\n')
      .map(cleanOutputLine)
      .filter(Boolean)
      .forEach(line => {
        const parts = line.split(/\s+/);
        if (parts.length < 7) return;
        const [ name, running, startup, gpuIntel, gpuNvidia, os, version, ...addresses ] = parts;
        jailList.push({
          name, running, startup, gpuIntel, gpuNvidia, os, version,
          addresses, path: sbox.path
        });
      });
  });
  return jailList;
}

function renderStatusBar(jailList, pathCount){
  const total = jailList.length;
  const byDistro = {};
  jailList.forEach(j => {
    const key = (j.os || 'Unknown').toLowerCase();
    byDistro[key] = (byDistro[key] || 0) + 1;
  });

  // sort by count desc, keep top 6
  const sorted = Object.entries(byDistro)
    .sort((a,b) => b[1]-a[1])
    .slice(0, 6);

  // build pills
  const pills = [];
  pills.push(pill('Total Jails', total, '#22d3ee'));
  pills.push(pill('Paths', pathCount, '#f59e0b'));
  sorted.forEach(([distro, count]) => {
    pills.push(pill(cap1(distro), count, '#3b82f6'));
  });

  statusBar.innerHTML = pills.join('');
}

function pill(label, value, color){
  return `
    <span class="stat-pill">
      <span class="dot" style="background:${color}"></span>
      <strong>${label}:</strong> ${value}
    </span>
  `;
}
function cap1(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

/* ---------- render jails ---------- */
function displaySandboxes(sandboxes) {
  sandboxesContainer.innerHTML = '';

  const jailList = flattenJails(sandboxes);
  jailList.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  if (!jailList.length) {
    const blank = document.createElement('div');
    blank.className = 'sandbox-card';
    blank.innerHTML = `
      <h4>No jails found</h4>
      <p class="muted">You can create a new jail using the <strong>Create Jail</strong> button.</p>
    `;
    sandboxesContainer.appendChild(blank);
    return;
  }

  jailList.forEach(jail => {
    const { name, running, startup, gpuIntel, gpuNvidia, os, version, addresses, path } = jail;
    const runningBadge = (running?.toLowerCase() === 'true')
      ? `<span class="badge ok">Running</span>`
      : `<span class="badge err">Stopped</span>`;
    const startupBadge = (startup?.toLowerCase() === 'true')
      ? `<span class="badge neutral">Startup</span>` : ``;

    const card = document.createElement('div');
    card.className = 'sandbox-card';
    card.innerHTML = `
      <div class="card-head" style="display:flex;justify-content:space-between;align-items:center;">
        <h4>${name} <span style="opacity:.6">(${os} ${version})</span></h4>
        <img src="images/${(os||'linux').toLowerCase()}.png"
             onerror="this.onerror=null;this.src='images/linux.png'"
             class="os-icon" alt="${os}"/>
      </div>
      <div class="card-meta" style="display:flex;gap:.5rem;flex-wrap:wrap;margin:.3rem 0 .6rem;">
        ${runningBadge}${startupBadge}
        ${gpuIntel==='1' ? '<span class="badge">Intel GPU</span>' : ''}
        ${gpuNvidia==='1' ? '<span class="badge">NVIDIA GPU</span>' : ''}
        ${addresses?.length ? `<span class="badge">${addresses.join(' ')}</span>` : ''}
      </div>
      <div class="card-actions">
        <button class="control-btn" data-action="start"   data-name="${name}" data-path="${path}">Start</button>
        <button class="control-btn" data-action="stop"    data-name="${name}" data-path="${path}">Stop</button>
        <button class="control-btn" data-action="restart" data-name="${name}" data-path="${path}">Restart</button>
        <button class="control-btn" data-action="remove"  data-name="${name}" data-path="${path}">Remove</button>
        <button class="control-btn" data-action="shell"   data-name="${name}" data-path="${path}">Shell</button>
      </div>
    `;
    sandboxesContainer.appendChild(card);
  });

  // wire actions (with streaming)
  sandboxesContainer.querySelectorAll('.control-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      const name = btn.dataset.name;
      const path = btn.dataset.path;

      if (!action || !name || !path || !username) {
        toast('Missing parameters for action.', 'err');
        return;
      }

      if (action === 'shell') {
        openSandboxShell(name, path, username);
        return;
      }

      if (action === 'remove') {
        confirmRemove(name, (ok) => {
          if (!ok) return;
          runActionStream(action, name, path);
        });
      } else {
        runActionStream(action, name, path);
      }
    });
  });
}

/* ---------- action runner with log stream ---------- */
async function runActionStream(action, name, path) {
  const actionId = uuid();
  const titleMap = { start: 'Start Jail', stop: 'Stop Jail', restart: 'Restart Jail', remove: 'Remove Jail' };
  const modal = openLogStreamModal(`${titleMap[action] || action}: ${name}`, actionId);

  try {
    const r = await fetch('/api/controlSandboxStream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, name, path, username, actionId }),
    });
    const data = await r.json();
    if (!data.success) {
      toast(`"${action}" failed to start: ${data.message}`, 'err');
      modal.close();
    }
  } catch (err) {
    toast(`"${action}" error: ${err}`, 'err');
    modal.close();
  }
}

function filterSandboxes(path, activeElement) {
  Array.from(pathsList.children).forEach(item => item.classList.remove('active'));
  activeElement.classList.add('active');
  const filtered = allSandboxes.filter(s => s.path === path);
  displaySandboxes(filtered);

  // Update status bar to reflect filtered list
  const jailList = flattenJails(filtered);
  renderStatusBar(jailList, 1);
}

/* ---------- settings modal ---------- */
settingsBtn.addEventListener('click', async () => {
  settingsPopup.style.display = 'flex';
  try {
    const res = await fetch(`/api/getUserDetails?username=${encodeURIComponent(username)}`);
    const data = await res.json();
    if (data.success) {
      const { username: un, serverip, serverport, serveruser, serverpass, paths } = data.details;
      settingsForm.username.value = un || '';
      settingsForm.serverIp.value = serverip || '';
      settingsForm.serverPort.value = serverport || '';
      settingsForm.serverUser.value = serveruser || '';
      settingsForm.serverPassword.value = serverpass || '';
      settingsForm.paths.value = Array.isArray(paths) ? paths.join(', ') : '';
    } else {
      toast('Failed to load details: ' + data.message, 'err');
    }
  } catch (err) {
    toast('Failed to load details: ' + err.toString(), 'err');
  }
});
settingsCloseBtn.addEventListener('click', () => settingsPopup.style.display = 'none');

settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    username: settingsForm.username.value,
    serverIp: settingsForm.serverIp.value,
    serverPort: settingsForm.serverPort.value,
    serverUser: settingsForm.serverUser.value,
    serverPassword: settingsForm.serverPassword.value,
    paths: settingsForm.paths.value.split(',').map(p => p.trim()).filter(Boolean),
  };
  try {
    const r = await fetch('/api/saveUserDetails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (data.success) {
      toast('Details saved.', 'ok');
      settingsPopup.style.display = 'none';
      await refreshSandboxes();
    } else {
      toast('Save failed: ' + data.message, 'err');
    }
  } catch (err) {
    toast('Save failed: ' + err.toString(), 'err');
  }
});

/* ---------- logout ---------- */
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/disconnectSSH', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.removeItem('username');
        window.location.href = '/index.html';
      } else {
        toast('Logout error: ' + data.message, 'err');
      }
    } catch (err) {
      toast('Logout error: ' + err, 'err');
    }
  });
}

/* ---------- remove confirmation ---------- */
function confirmRemove(name, cb){
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <h3>Remove Jail</h3>
    <p>Are you sure you want to remove "<strong>${name}</strong>"?</p>
    <div class="topbar actions" style="justify-content:flex-end;">
      <button id="yesBtn">Yes</button>
      <button id="noBtn" class="close-button">No</button>
    </div>
  `;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const yes = modal.querySelector('#yesBtn');
  const no = modal.querySelector('#noBtn');
  yes.addEventListener('click', () => { overlay.remove(); cb(true); });
  no.addEventListener('click', () => { overlay.remove(); cb(false); });

  const h3 = modal.querySelector('h3');
  h3.addEventListener('mousedown', e => dragModal(e, modal));
  function dragModal(e, el){
    e.preventDefault();
    let startX = e.clientX, startY = e.clientY;
    const rect = el.getBoundingClientRect();
    const origTop = rect.top, origLeft = rect.left;
    function onMove(ev){
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      el.style.position = 'absolute';
      el.style.top = (origTop + dy) + 'px';
      el.style.left = (origLeft + dx) + 'px';
    }
    function onUp(){
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
}

/* kick off */
fetchSandboxes();

