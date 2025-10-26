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
let allPaths = [];
let selectedPath = null;
let serverPassword = null; // <-- used by Connect SSH terminal

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

  // recompute status for ALL paths
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

    // keep server password for Connect SSH sudo
    serverPassword = (data.details && data.details.serverpass) ? data.details.serverpass : null;

    const oldChoice = selectedPath;
    pathsList.innerHTML = '';
    allSandboxes = data.sandboxes;

    allSandboxes.sort((a, b) => {
      const aN = (a.output.split(/\s+/)[0] || '').toLowerCase();
      const bN = (b.output.split(/\s+/)[0] || '').toLowerCase();
      return aN.localeCompare(bN);
    });

    allPaths = [...new Set(allSandboxes.map(s => s.path))];

    // path boxes
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

    // ------- Left-pane "Connect SSH" (green) -------
    const sshBtn = document.createElement('div');
    sshBtn.className = 'path-box ssh-connect-btn';
    sshBtn.textContent = 'Connect SSH';
    Object.assign(sshBtn.style, {
      backgroundColor: 'green', color: 'white', fontWeight: 'bold',
      marginTop: '10px', cursor: 'pointer'
    });
    sshBtn.addEventListener('click', createSSHConsolePopup);
    pathsList.appendChild(sshBtn);

    // status bar (all)
    const jailList = flattenJails(allSandboxes);
    renderStatusBar(jailList, allPaths.length);

    // restore selection
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

  const sorted = Object.entries(byDistro)
    .sort((a,b) => b[1]-a[1])
    .slice(0, 6);

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
        // Provided elsewhere (e.g., enhancedTerminal.js)
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

/* ---------- Permanent SSH: Connect SSH popup ---------- */
function createSSHConsolePopup() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;';
  const popup = document.createElement('div');
  Object.assign(popup.style, {
    position: 'absolute', top: '10%', left: '30%', width: '60%', height: '80%',
    // default (will be updated to match theme right after)
    background: 'rgba(255,255,255,.9)',
    borderRadius: '8px',
    boxShadow: '0 0 10px rgba(0,0,0,0.3)', display: 'flex',
    flexDirection: 'column', padding: '10px', resize: 'both', overflow: 'auto'
  });

  const title = document.createElement('h3');
  title.textContent = 'Permanent SSH Terminal';
  title.style.cursor = 'move';

  const termWrap = document.createElement('div');
  termWrap.style.cssText = 'flex:1;overflow:hidden;width:100%;height:100%';

  const inputWrap = document.createElement('div');
  inputWrap.style.cssText = 'display:flex;margin-top:10px';
  const cmdInput = document.createElement('input');
  cmdInput.type = 'text'; cmdInput.placeholder = 'Type your command...'; cmdInput.style.flex = '1';
  const sendBtn = document.createElement('button'); sendBtn.textContent = 'Send'; sendBtn.style.marginLeft = '5px';
  inputWrap.appendChild(cmdInput); inputWrap.appendChild(sendBtn);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close'; closeBtn.style.marginTop = '10px';

  popup.appendChild(title);
  popup.appendChild(termWrap);
  popup.appendChild(inputWrap);
  popup.appendChild(closeBtn);
  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  // draggable (unchanged)
  title.addEventListener('mousedown', (e) => {
    e.preventDefault(); let lx=e.clientX, ly=e.clientY;
    const mm = (ev) => { const dx=ev.clientX-lx, dy=ev.clientY-ly; lx=ev.clientX; ly=ev.clientY;
      popup.style.top = (popup.offsetTop+dy)+'px'; popup.style.left=(popup.offsetLeft+dx)+'px'; };
    const mu = () => { document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); };
    document.addEventListener('mousemove', mm); document.addEventListener('mouseup', mu);
  });

  // Theme once (no observers, no API footguns)
  const light = document.body.classList.contains('theme-light');
  const termThemeLight = { background:'#ffffff', foreground:'#111827' };
  const termThemeDark  = { background:'#1e1e1e', foreground:'#cccccc' };
  if (light) {
    popup.style.background = 'rgba(255,255,255,.95)';
    popup.style.color = '#111827';
  } else {
    popup.style.background = 'rgba(15,23,42,.95)';
    popup.style.color = '#e5e7eb';
  }

  // WS
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${proto}://${location.host}/ws/permanentSsh?username=${encodeURIComponent(username)}`;
  const ws = new WebSocket(wsUrl);

  // xterm.js (unchanged visuals; theme applied below safely)
  const term = new Terminal({ convertEol:false, scrollback:1000, cursorBlink:true, theme: light ? termThemeLight : termThemeDark });
  term.open(termWrap);
  let fitAddon;
  try {
    fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    fitAddon.fit();
  } catch (e) {
    // If FitAddon is not available, keep going without it
  }

  // Safe theme setter (works on new & old xterm)
  try {
    if (term.options) {
      term.options.theme = light ? termThemeLight : termThemeDark;
    }
  } catch (_) {}

  const sendResize = () => {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type:'resize', cols:term.cols, rows:term.rows }));
      }
    } catch (_){}
  };
  window.addEventListener('resize', () => { try { fitAddon && fitAddon.fit(); } catch(_){} sendResize(); });

  // Never freeze: if WS doesn't open in time, show a note and keep close working
  const wsOpenTimeout = setTimeout(() => {
    try { term.write('\r\n[Connection timeout: server did not open the session]\r\n'); } catch(_){}
  }, 8000);

  let closed = false;
  function safeClose() {
    if (closed) return;
    closed = true;
    clearTimeout(wsOpenTimeout);
    try { ws.close(); } catch {}
    try { overlay.remove(); } catch {}
  }

  term.onData(d => { if (ws.readyState===WebSocket.OPEN) { try { ws.send(d); } catch(_){} } });

  ws.onopen = () => {
    clearTimeout(wsOpenTimeout);
    term.write('\r\n[Connected to permanent SSH session]\r\n');
    sendResize();
    try { ws.send("stty erase '^?'\n"); } catch(_){}
    if (typeof serverPassword !== 'undefined' && serverPassword) {
      try { ws.send(`echo ${serverPassword} | sudo -S -p '' /bin/bash -i\n`); } catch(_){}
    }
  };
  ws.onmessage = (e) => { try { term.write(e.data); } catch(_){} };
  ws.onclose   = () => { try { term.write('\r\n[SSH session closed]\r\n'); } catch(_){} };
  ws.onerror   = (err) => { try { term.write(`\r\n[WebSocket error]\r\n`); } catch(_){} };

  const sendCommand = () => {
    const cmd = cmdInput.value + '\r\n'; cmdInput.value = '';
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(cmd); } catch(_) { term.write('\r\n[Error: WebSocket send failed]\r\n'); }
    } else {
      term.write('\r\n[Error: WebSocket not open]\r\n');
    }
  };
  cmdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendCommand(); } });
  sendBtn.addEventListener('click', sendCommand);

  // Always closable (even if WS is stuck connecting)
  closeBtn.addEventListener('click', safeClose);
  // Escape to close
  const onKey = (e) => { if (e.key === 'Escape') safeClose(); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) safeClose(); });
}


/* kick off */
fetchSandboxes();


