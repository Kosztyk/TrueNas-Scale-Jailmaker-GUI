/**********************************************
 * manage.js
 *
 * - Fetch sandboxes
 * - Display them
 * - Start/Stop/Restart
 * - Remove with confirmation
 * - Ephemeral route => /api/runSSHCommand
 * - NEW: "Connect SSH" => permanent WebSocket
 **********************************************/

const sandboxesContainer = document.getElementById('sandboxesContainer');
const pathsList = document.getElementById('paths-list');
const showAllBtn = document.getElementById('showAllBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPopup = document.getElementById('settingsPopup');
const settingsForm = document.getElementById('settingsForm');

if (sandboxesContainer && pathsList && showAllBtn && settingsBtn && settingsPopup) {
  const username = localStorage.getItem('username');

  let allSandboxes = [];
  let allPaths = [];
  let serverPassword = null;

  // 1) Fetch sandboxes
  async function fetchSandboxes() {
    sandboxesContainer.textContent = 'Loading sandboxes...';
    try {
      const res = await fetch(`/api/getSandboxes?username=${encodeURIComponent(username)}`);
      const data = await res.json();
      if (data.success) {
        sandboxesContainer.innerHTML = '';
        pathsList.innerHTML = '';

        const userDetails = data.details || {};
        serverPassword = userDetails.serverpass || null;

        allSandboxes = data.sandboxes;
        allPaths = [...new Set(allSandboxes.map((s) => s.path))];

        // left pane
        allPaths.forEach((path, index) => {
          const pathBox = document.createElement('div');
          pathBox.classList.add('path-box');
          pathBox.textContent = `Path: ${path}`;
          if (index === 0) pathBox.classList.add('active');
          pathBox.dataset.path = path;
          pathBox.addEventListener('click', () => filterSandboxes(path, pathBox));
          pathsList.appendChild(pathBox);
        });

        // connect SSH button
        const sshConnectBtn = document.createElement('div');
        sshConnectBtn.classList.add('path-box');
        sshConnectBtn.textContent = 'Connect SSH';
        sshConnectBtn.style.backgroundColor = 'green';
        sshConnectBtn.style.color = 'white';
        sshConnectBtn.style.fontWeight = 'bold';
        sshConnectBtn.style.marginTop = '10px';
        sshConnectBtn.style.cursor = 'pointer';
        sshConnectBtn.addEventListener('click', createSSHConsolePopup);
        pathsList.appendChild(sshConnectBtn);

        displaySandboxes(allSandboxes);
      } else {
        sandboxesContainer.textContent = 'Error: ' + data.message;
      }
    } catch (err) {
      sandboxesContainer.textContent = 'Error loading sandboxes: ' + err.toString();
    }
  }

  async function refreshSandboxes() {
    await fetchSandboxes();
  }

  function cleanOutputLine(line) {
    const cleanedLine = line
      .replace(
        /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
        ''
      )
      .trim();
    if (
      cleanedLine.startsWith('NAME') ||
      cleanedLine.startsWith('[sudo]') ||
      cleanedLine === '' ||
      cleanedLine.startsWith('/mnt/') ||
      (serverPassword && cleanedLine.startsWith(serverPassword))
    ) {
      return null;
    }
    return cleanedLine;
  }

  function displayPopupMessage(message, isSuccess) {
    const popup = document.createElement('div');
    popup.classList.add('popup-message');
    popup.style.cssText = `
      position: fixed;
      top: 10%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: ${isSuccess ? '#d4edda' : '#f8d7da'};
      color: ${isSuccess ? '#155724' : '#721c24'};
      border: 1px solid ${isSuccess ? '#c3e6cb' : '#f5c6cb'};
      border-radius: 5px;
      padding: 15px;
      z-index: 1000;
      text-align: center;
      font-size: 16px;
    `;
    popup.textContent = message;
    document.body.appendChild(popup);
    setTimeout(() => {
      popup.remove();
    }, 5000);
  }

  function displaySandboxes(sandboxes) {
    sandboxesContainer.innerHTML = '';
  
    sandboxes.forEach((sandbox) => {
      const outputLines = sandbox.output.split('\n').map(cleanOutputLine).filter(Boolean);
  
      outputLines.forEach((line) => {
        // Split the line into tokens; if not as expected, skip it.
        const parts = line.split(/\s+/);
        if (parts.length < 7) return;
        
        const [name, running, startup, gpuIntel, gpuNvidia, os, version, ...addresses] = parts;
        
        // Build the icon path. If "os" is defined, use images/<os>.png (all lower-case);
        // otherwise, default to images/linux.png.
        const iconPath = os ? "images/" + os.toLowerCase() + ".png" : "images/linux.png";
  
        // Create a sandbox card.
        const sandboxCard = document.createElement('div');
        sandboxCard.classList.add('sandbox-card');
  
        // IMPORTANT: Force the sandbox card to be the positioning context.
        // (If your CSS doesn't already do this, you can set it inline as shown.)
        sandboxCard.style.position = 'relative';
        sandboxCard.style.paddingRight = '60px'; // Adjust as needed for the icon
  
        sandboxCard.innerHTML = `
          <h4>${name} (${os} ${version})</h4>
          <p><strong>IP:</strong> ${addresses.join(' ') || 'N/A'}</p>
          <p>
            <strong>Running:</strong> ${running || 'N/A'}, 
            <strong>Startup:</strong> ${startup || 'N/A'}, 
            <strong>GPU_Intel:</strong> ${gpuIntel || 'N/A'}, 
            <strong>GPU_Nvidia:</strong> ${gpuNvidia || 'N/A'}
          </p>
          <div class="sandbox-controls">
            <button class="control-btn" data-action="start" data-name="${name}" data-path="${sandbox.path}">Start</button>
            <button class="control-btn" data-action="stop" data-name="${name}" data-path="${sandbox.path}">Stop</button>
            <button class="control-btn" data-action="restart" data-name="${name}" data-path="${sandbox.path}">Restart</button>
            <button class="control-btn" data-action="remove" data-name="${name}" data-path="${sandbox.path}">Remove</button>
          </div>
          <!-- OS Icon: if the specific icon is not found, fallback to images/linux.png -->
          <img src="${iconPath}" onerror="this.onerror=null; this.src='images/linux.png'" class="os-icon" alt="${os ? os : 'Linux'} Icon" />
        `;
        sandboxesContainer.appendChild(sandboxCard);
      });
    });
  
    const controlButtons = document.querySelectorAll('.control-btn');
    controlButtons.forEach((button) => {
      button.addEventListener('click', async () => {
        const action = button.dataset.action;
        const name = button.dataset.name;
        const path = button.dataset.path;
        if (!action || !name || !path || !username) {
          alert('Action, sandbox name, path, and username are required.');
          return;
        }
        try {
          if (action === 'remove') {
            showRemoveConfirmationPopup(name, async (userConfirmed) => {
              if (!userConfirmed) return;
              const removeRes = await fetch('/api/controlSandbox', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'remove', name, path, username }),
              });
              const removeData = await removeRes.json();
              displayPopupMessage(
                removeData.success
                  ? `Sandbox "${name}" was removed successfully!`
                  : `Failed to remove "${name}": ${removeData.message}`,
                removeData.success
              );
              if (removeData.success) {
                await refreshSandboxes();
              }
            });
          } else {
            const res = await fetch('/api/controlSandbox', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action, name, path, username }),
            });
            const data = await res.json();
            displayPopupMessage(
              data.success
                ? `Action "${action}" executed successfully!`
                : `Failed to execute action "${action}": ${data.message}`,
              data.success
            );
            if (data.success) {
              await refreshSandboxes();
            }
          }
        } catch (err) {
          displayPopupMessage(`Error executing "${action}": ${err}`, false);
        }
      });
    });
  }  

  function filterSandboxes(path, activeElement) {
    Array.from(pathsList.children).forEach((item) => item.classList.remove('active'));
    activeElement.classList.add('active');
    const filtered = allSandboxes.filter((s) => s.path === path);
    displaySandboxes(filtered);
  }

  showAllBtn.addEventListener('click', () => {
    Array.from(pathsList.children).forEach((item) => item.classList.remove('active'));
    displaySandboxes(allSandboxes);
  });

  // settings
  settingsBtn.addEventListener('click', async () => {
    settingsPopup.classList.remove('hidden');
    try {
      const res = await fetch(`/api/getUserDetails?username=${encodeURIComponent(username)}`);
      const data = await res.json();
      if (data.success) {
        const { username, serverip, serverport, serveruser, serverpass, paths } = data.details;
        settingsForm.username.value = username || '';
        settingsForm.serverIp.value = serverip || '';
        settingsForm.serverPort.value = serverport || '';
        settingsForm.serverUser.value = serveruser || '';
        settingsForm.serverPassword.value = serverpass || '';
        settingsForm.paths.value = Array.isArray(paths) ? paths.join(', ') : '';
      } else {
        alert('Error fetching user details: ' + data.message);
      }
    } catch (err) {
      alert('Error fetching user details: ' + err.toString());
    }
  });

  window.closePopup = () => {
    settingsPopup.classList.add('hidden');
  };

  settingsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const updatedDetails = {
      username: settingsForm.username.value,
      serverIp: settingsForm.serverIp.value,
      serverPort: settingsForm.serverPort.value,
      serverUser: settingsForm.serverUser.value,
      serverPassword: settingsForm.serverPassword.value,
      paths: settingsForm.paths.value.split(',').map((p) => p.trim()),
    };
    try {
      const res = await fetch('/api/saveUserDetails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedDetails),
      });
      const data = await res.json();
      if (data.success) {
        alert('Details saved successfully!');
        settingsPopup.classList.add('hidden');
      } else {
        alert('Error saving details: ' + data.message);
      }
    } catch (err) {
      alert('Error saving details: ' + err.toString());
    }
  });

  // logout
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
          alert(`Error during logout: ${data.message}`);
        }
      } catch (err) {
        alert(`Error during logout: ${err}`);
      }
    });
  }

  function showRemoveConfirmationPopup(sandboxName, callback) {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
    overlay.style.zIndex = '9999';

    const popup = document.createElement('div');
    popup.style.position = 'absolute';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.background = '#fff';
    popup.style.padding = '20px';
    popup.style.borderRadius = '5px';
    popup.style.textAlign = 'center';

    const message = document.createElement('p');
    message.textContent = `Are you sure you want to delete "${sandboxName}"?`;
    popup.appendChild(message);

    const yesBtn = document.createElement('button');
    yesBtn.textContent = 'Yes';
    yesBtn.style.marginRight = '10px';
    yesBtn.addEventListener('click', () => {
      document.body.removeChild(overlay);
      callback(true);
    });
    popup.appendChild(yesBtn);

    const noBtn = document.createElement('button');
    noBtn.textContent = 'No';
    noBtn.addEventListener('click', () => {
      document.body.removeChild(overlay);
      callback(false);
    });
    popup.appendChild(noBtn);

    overlay.appendChild(popup);
    document.body.appendChild(overlay);
  }

  // =============================================
  // NEW: Permanent SSH terminal via WebSocket
  // =============================================
  function createSSHConsolePopup() {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
    overlay.style.zIndex = '9999';
  
    // Create popup container (positioned so it doesn't cover the left pane)
    const popup = document.createElement('div');
    popup.style.position = 'absolute';
    popup.style.top = '10%';
    popup.style.left = '30%';
    popup.style.width = '60%';
    popup.style.height = '80%';
    popup.style.backgroundColor = 'rgba(255,255,255,0.8)'; // 20% transparent
    popup.style.borderRadius = '8px';
    popup.style.boxShadow = '0 0 10px rgba(0,0,0,0.3)';
    popup.style.display = 'flex';
    popup.style.flexDirection = 'column';
    popup.style.padding = '10px';
  
    const title = document.createElement('h3');
    title.textContent = 'Permanent SSH Terminal';
    popup.appendChild(title);
  
    // Create container for the xterm.js terminal
    const terminalContainer = document.createElement('div');
    terminalContainer.style.flex = '1';
    terminalContainer.style.overflow = 'hidden';
    terminalContainer.style.width = '100%';
    terminalContainer.style.height = '100%';
    popup.appendChild(terminalContainer);
  
    // (Optional) Input field for sending commands via button
    const inputWrapper = document.createElement('div');
    inputWrapper.style.display = 'flex';
    inputWrapper.style.marginTop = '10px';
    const cmdInput = document.createElement('input');
    cmdInput.type = 'text';
    cmdInput.placeholder = 'Type your command...';
    cmdInput.style.flex = '1';
    const sendBtn = document.createElement('button');
    sendBtn.textContent = 'Send';
    sendBtn.style.marginLeft = '5px';
    inputWrapper.appendChild(cmdInput);
    inputWrapper.appendChild(sendBtn);
    popup.appendChild(inputWrapper);
  
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.marginTop = '10px';
    closeBtn.addEventListener('click', () => {
      if (ws) ws.close();
      document.body.removeChild(overlay);
    });
    popup.appendChild(closeBtn);
  
    overlay.appendChild(popup);
    document.body.appendChild(overlay);
  
    // Establish WebSocket connection for permanent SSH
    const wsUrl = `ws://${location.hostname}:${location.port}/ws/permanentSsh?username=${encodeURIComponent(username)}`;
    const ws = new WebSocket(wsUrl);
  
    // ===== Begin xterm.js integration with xterm-fit addon =====
  
    // Initialize the xterm.js terminal
    const term = new Terminal({
      convertEol: true
    });
    term.open(terminalContainer);
  
    // Initialize the xterm-fit addon for auto-resizing
    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    fitAddon.fit();
  
    // Listen to window resize events and adjust terminal size
    window.addEventListener('resize', () => {
      fitAddon.fit();
    });
  
    // Updated stripAnsi function to remove unwanted escape sequences while preserving newlines and basic formatting
    function stripAnsi(str) {
      // Remove ANSI escape sequences
      str = str.replace(/[\u001B\u009B][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
      // Remove control characters except newline (\n), carriage return (\r), and tab (\t)
      str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');
      // Remove trailing prompt markers (e.g. extra "#" at the end of lines)
      return str.replace(/\s*#\s*$/gm, '');
    }
  
    // Let xterm.js handle keys naturally (via onData)
    term.onData(data => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  
    // Setup WebSocket message handler to write data to the terminal (without stripping ANSI for interactive apps)
    ws.onopen = () => {
      term.write('\r\n[Connected to permanent SSH session]\r\n');
      // Immediately send command to set the remote shell's erase character to '^?'
      ws.send("stty erase '^?'\n");
    };
    ws.onmessage = (evt) => {
      // For interactive editors like nano, do not strip ANSI sequences.
      // Uncomment the line below if you want raw output:
      term.write(evt.data);
      // If you want to try stripping, use:
      // const text = stripAnsi(evt.data);
      // term.write(text);
    };
    ws.onclose = () => {
      term.write('\r\n[SSH session closed]\r\n');
    };
    ws.onerror = (err) => {
      term.write(`\r\n[WebSocket error: ${err}]\r\n`);
    };
  
    // Additionally, allow sending commands via the input field (optional)
    cmdInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendCommand();
      }
    });
    sendBtn.addEventListener('click', sendCommand);
    function sendCommand() {
      const cmd = cmdInput.value + '\r\n';
      cmdInput.value = '';
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(cmd);
      } else {
        term.write('\r\n[Error: WebSocket not open]\r\n');
      }
    }
    // ===== End xterm.js integration with xterm-fit addon =====
  }   

  // fetch sandboxes on load
  fetchSandboxes();
}


