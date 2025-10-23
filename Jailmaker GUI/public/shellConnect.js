/**********************************************
 * shellConnect.js
 * Permanent SSH shell via WebSocket + xterm.js
 * Unified modal look + fit/resize support
 **********************************************/

function openSandboxShell(sandboxName, sandboxPath, username) {
  let ws;

  // Overlay & modal
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `<h3>Sandbox Shell: ${sandboxName}</h3>`;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Drag
  const h3 = modal.querySelector('h3');
  h3.addEventListener('mousedown', e => dragModal(e, modal));

  // Terminal container
  const termContainer = document.createElement('div');
  termContainer.style.flex = '1';
  termContainer.style.overflow = 'hidden';
  termContainer.style.width = '100%';
  termContainer.style.height = '60vh';
  modal.appendChild(termContainer);

  // Input row
  const inputRow = document.createElement('div');
  inputRow.style.display = 'flex';
  inputRow.style.marginTop = '10px';
  const cmdInput = document.createElement('input');
  cmdInput.type = 'text';
  cmdInput.placeholder = 'Type command...';
  cmdInput.style.flex = '1';
  const sendBtn = document.createElement('button');
  sendBtn.textContent = 'Send';
  sendBtn.style.marginLeft = '8px';
  inputRow.appendChild(cmdInput);
  inputRow.appendChild(sendBtn);
  modal.appendChild(inputRow);

  // Close button
  const closeRow = document.createElement('div');
  closeRow.className = 'topbar actions';
  closeRow.style.justifyContent = 'flex-end';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-button';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => { if (ws) ws.close(); overlay.remove(); });
  closeRow.appendChild(closeBtn);
  modal.appendChild(closeRow);

  // xterm.js
  const term = new Terminal({
    convertEol: false,
    cursorBlink: true,
    scrollback: 1500,
    fontSize: 14,
    theme: { background: '#1e1e1e', foreground: '#cccccc' }
  });
  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(termContainer);
  fitAddon.fit();

  window.addEventListener('resize', () => {
    fitAddon.fit();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    }
  });

  // WS
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${proto}://${location.host}/ws/permanentSsh?username=${encodeURIComponent(username)}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    term.write('\r\n[Connected to permanent SSH session]\r\n');
    // set erase key & window size
    ws.send("stty erase '^?'\n");
    ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    // enter jail shell
    setTimeout(() => {
      const cmd = `cd ${sandboxPath.replace(/\/$/, '')} && sudo ./jlmkr.py shell ${sandboxName}\n`;
      ws.send(cmd);
    }, 300);
  };
  ws.onmessage = (evt) => term.write(evt.data);
  ws.onclose = () => term.write('\r\n[SSH session closed]\r\n');
  ws.onerror = () => term.write(`\r\n[WebSocket error]\r\n`);

  term.onData(data => { if (ws.readyState === WebSocket.OPEN) ws.send(data); });

  function send() {
    const v = cmdInput.value;
    if (!v) return;
    cmdInput.value = '';
    if (ws.readyState === WebSocket.OPEN) ws.send(v + '\n');
    else term.write('\r\n[WebSocket not open]\r\n');
  }
  sendBtn.addEventListener('click', send);
  cmdInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); send(); } });

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

window.openSandboxShell = openSandboxShell;

