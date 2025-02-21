// In manage.js (or a separate file loaded after manage.js)
// Enhanced WebSocket + xterm.js integration for a more "real terminal" experience

// Utility: Create a new terminal popup with draggable/resizable features.
function createTerminalPopup(titleText) {
  // Create overlay and container
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 9999;
  `;

  const popup = document.createElement('div');
  popup.style.cssText = `
    position: absolute;
    top: 10%; left: 30%;
    width: 60%; height: 80%;
    background-color: rgba(255, 255, 255, 0.9);
    border-radius: 8px;
    box-shadow: 0 0 10px rgba(0,0,0,0.3);
    display: flex;
    flex-direction: column;
    padding: 10px;
    resize: both;
    overflow: auto;
  `;

  // Title bar (draggable)
  const title = document.createElement('h3');
  title.textContent = titleText;
  title.style.cursor = 'move';
  popup.appendChild(title);

  // Simple draggable implementation using the title bar as the handle.
  title.addEventListener('mousedown', function drag(e) {
    e.preventDefault();
    let startX = e.clientX, startY = e.clientY;
    const origTop = popup.offsetTop, origLeft = popup.offsetLeft;

    function onMouseMove(e) {
      const diffX = e.clientX - startX;
      const diffY = e.clientY - startY;
      popup.style.top = (origTop + diffY) + "px";
      popup.style.left = (origLeft + diffX) + "px";
    }
    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  // Terminal container
  const termContainer = document.createElement('div');
  termContainer.style.flex = '1';
  termContainer.style.overflow = 'hidden';
  termContainer.style.width = '100%';
  termContainer.style.height = '100%';
  popup.appendChild(termContainer);

  // Optional command input row
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

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.marginTop = '10px';
  closeBtn.addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    overlay.remove();
  });
  popup.appendChild(closeBtn);

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  return { overlay, termContainer, cmdInput, sendBtn };
}

// Function to initialize the xterm.js terminal and WebSocket connection
function openSSHTerminalPopup(username, serverPassword, sandboxPath, sandboxName) {
  // Create a popup with a title (e.g., "Permanent SSH Terminal")
  const { overlay, termContainer, cmdInput, sendBtn } = createTerminalPopup(`Sandbox Shell: ${sandboxName}`);

  // Initialize the xterm.js terminal with desired options
  const term = new Terminal({
    convertEol: true,
    cursorBlink: true,
    fontFamily: '"Ubuntu Mono", monospace',
    fontSize: 14,
    theme: {
      background: "#1e1e1e",
      foreground: "#cccccc"
    }
  });
  term.open(termContainer);

  // Initialize the FitAddon to auto-resize the terminal to its container
  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  fitAddon.fit();

  // Refit the terminal on window resize
  window.addEventListener('resize', () => {
    fitAddon.fit();
  });

  // Build the WebSocket URL based on your server (using your permanentSsh endpoint)
  const wsUrl = `ws://${location.hostname}:${location.port}/ws/permanentSsh?username=${encodeURIComponent(username)}`;
  console.log("Connecting to WebSocket URL:", wsUrl);
  const ws = new WebSocket(wsUrl);

  // When the connection is open, send any initialization commands
  ws.onopen = () => {
    console.log("WebSocket connection opened");
    term.write('\r\n[Connected: Starting SSH session...]\r\n');
    // Optionally set the remote shell’s erase key
    ws.send("stty erase '^?'\n");

    // Send the commands to change directory and start the shell
    // (You might not need to send the cd command if the remote environment is preconfigured)
    ws.send(`cd ${sandboxPath}\n`);
    // Send the command to start the jail shell
    ws.send(`sudo ./jlmkr.py shell ${sandboxName}\n`);
    // Then send the password for sudo (if required)
    // Note: In a real-world scenario, you’d avoid sending plaintext passwords.
    ws.send(`echo ${serverPassword}\n`);
  };

  ws.onmessage = (evt) => {
    // Write incoming data to the terminal
    term.write(evt.data);
  };

  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
    term.write(`\r\n[WebSocket error]\r\n`);
  };

  ws.onclose = () => {
    term.write('\r\n[SSH session closed]\r\n');
  };

  // Forward keystrokes from the terminal to the WebSocket
  term.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });

  // Also allow sending commands from the input field
  function sendInputCommand() {
    const cmd = cmdInput.value + '\n';
    cmdInput.value = '';
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(cmd);
    } else {
      term.write('\r\n[Error: WebSocket not open]\r\n');
    }
  }
  sendBtn.addEventListener('click', sendInputCommand);
  cmdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendInputCommand();
    }
  });
}

// Example usage (you can call this from your Connect SSH button handler)
function openSandboxShell(sandboxName, sandboxPath, username, serverPassword) {
  // Ensure sandboxPath has no trailing slash
  sandboxPath = sandboxPath.replace(/\/$/, "");
  console.log("openSandboxShell() called with:", { sandboxName, sandboxPath, username, serverPassword });
  openSSHTerminalPopup(username, serverPassword, sandboxPath, sandboxName);
}

// Make the function available globally
window.openSandboxShell = openSandboxShell;

