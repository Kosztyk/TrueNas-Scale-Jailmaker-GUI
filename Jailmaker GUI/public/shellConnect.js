/**********************************************
 * shellConnect.js
 *
 * Provides the openSandboxShell function that opens a permanent SSH shell
 * in a draggable, resizable popup using a WebSocket connection and xterm.js.
 **********************************************/

function openSandboxShell(sandboxName, sandboxPath, username) { // Removed serverPassword parameter as it's not securely used here
  // Declare the WebSocket variable at the top so it's accessible in all handlers.
  let ws;

  // 1. Create an overlay (unchanged)
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
  overlay.style.zIndex = '9999';

  // 2. Create a popup container (unchanged)
  const popup = document.createElement('div');
  popup.style.position = 'absolute';
  popup.style.top = '10%';
  popup.style.left = '30%';
  popup.style.width = '60%';
  popup.style.height = '80%';
  popup.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
  popup.style.borderRadius = '8px';
  popup.style.boxShadow = '0 0 10px rgba(0,0,0,0.3)';
  popup.style.display = 'flex';
  popup.style.flexDirection = 'column';
  popup.style.padding = '10px';
  popup.style.resize = 'both';
  popup.style.overflow = 'auto';

  // Draggable title (unchanged)
  const title = document.createElement('h3');
  title.textContent = `Sandbox Shell: ${sandboxName}`;
  title.style.cursor = 'move';
  popup.appendChild(title);

  title.addEventListener('mousedown', dragPopup);
  function dragPopup(e) {
    e.preventDefault();
    let prevX = e.clientX;
    let prevY = e.clientY;
    document.onmouseup = () => {
      document.onmouseup = null;
      document.onmousemove = null;
    };
    document.onmousemove = (ev) => {
      ev.preventDefault();
      const deltaX = prevX - ev.clientX;
      const deltaY = prevY - ev.clientY;
      prevX = ev.clientX;
      prevY = ev.clientY;
      popup.style.top = `${popup.offsetTop - deltaY}px`;
      popup.style.left = `${popup.offsetLeft - deltaX}px`;
    };
  }

  // Terminal container (unchanged)
  const termContainer = document.createElement('div');
  termContainer.style.flex = '1';
  termContainer.style.overflow = 'hidden';
  termContainer.style.width = '100%';
  termContainer.style.height = '100%';
  popup.appendChild(termContainer);

  // Optional input row for sending commands (unchanged)
  const inputRow = document.createElement('div');
  inputRow.style.display = 'flex';
  inputRow.style.marginTop = '10px';
  const cmdInput = document.createElement('input');
  cmdInput.type = 'text';
  cmdInput.placeholder = 'Type command...';
  cmdInput.style.flex = '1';
  const sendBtn = document.createElement('button');
  sendBtn.textContent = 'Send';
  sendBtn.style.marginLeft = '5px';
  sendBtn.style.padding = '5px 10px';
  inputRow.appendChild(cmdInput);
  inputRow.appendChild(sendBtn);
  popup.appendChild(inputRow);

  // Close button (unchanged)
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.marginTop = '10px';
  closeBtn.addEventListener('click', () => {
    if (ws) ws.close();
    if (document.body.contains(overlay)) {
      document.body.removeChild(overlay);
    }
  });
  popup.appendChild(closeBtn);

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  // Initialize xterm.js (unchanged)
  const term = new Terminal({ convertEol: true });
  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(termContainer);
  fitAddon.fit();

  window.addEventListener('resize', () => fitAddon.fit());

  // Create WebSocket connection to the permanent SSH endpoint. (unchanged)
  const wsUrl = `ws://${location.hostname}:${location.port}/ws/permanentSsh?username=${encodeURIComponent(username)}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("WebSocket connection opened");
    term.write('\r\n[Connected: Starting sandbox shell...]\r\n');

    // Delay sending commands to allow channel setup.
    setTimeout(() => {
      // Simplified command assuming passwordless sudo is configured
      const cmd = `cd ${sandboxPath} && sudo ./jlmkr.py shell ${sandboxName}\n`;
      console.log("Sending jail shell command:", cmd);
      ws.send(cmd);
    }, 500);
  };

  ws.onmessage = (evt) => {
    term.write(evt.data);
  };

  ws.onerror = (err) => {
    term.write(`\r\n[WebSocket error: ${err.message}]\r\n`);
  };

  ws.onclose = () => {
    term.write('\r\n[Connection closed.]\r\n');
  };

  // Forward keystrokes from terminal to the server. (unchanged)
  term.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });

  // Optional: send commands typed in the text input. (unchanged)
  function sendInputCommand() {
    const cmdValue = cmdInput.value.trim();
    if (!cmdValue) return;
    cmdInput.value = '';
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(cmdValue + '\n');
    } else {
      term.write('\r\n[WebSocket not open]\r\n');
    }
  }
  sendBtn.addEventListener('click', sendInputCommand);
  cmdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendCommand();
    }
  });
}

// Make the function globally available. (unchanged)
window.openSandboxShell = openSandboxShell;
