/**********************************************
 * manage.js
 * 
 * - Fetch sandboxes
 * - Display them
 * - Start/Stop/Restart
 * - NEW: Remove with a single call, 
 *   but only after the user confirms in the popup
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
  let serverPassword = null; // Will hold the dynamically retrieved server password

  /**
   * Fetch sandboxes data from the server for the logged-in user and populate the UI.
   */
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
        allPaths = [...new Set(allSandboxes.map((sandbox) => sandbox.path))];

        // Populate the left pane with paths
        allPaths.forEach((path, index) => {
          const pathBox = document.createElement('div');
          pathBox.classList.add('path-box');
          pathBox.textContent = `Path: ${path}`;
          pathBox.dataset.path = path;
          if (index === 0) pathBox.classList.add('active');
          pathBox.addEventListener('click', () => filterSandboxes(path, pathBox));
          pathsList.appendChild(pathBox);
        });

        displaySandboxes(allSandboxes);
      } else {
        sandboxesContainer.textContent = 'Error: ' + data.message;
      }
    } catch (err) {
      sandboxesContainer.textContent = 'Error loading sandboxes: ' + err.toString();
    }
  }

  /**
   * Refresh the sandbox container by re-fetching data.
   */
  async function refreshSandboxes() {
    await fetchSandboxes();
  }

  /**
   * Cleans lines to remove ANSI codes, blank lines, etc.
   */
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

  /**
   * Temporary popup message
   */
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

  /**
   * Renders the sandboxes on the right pane
   */
  function displaySandboxes(sandboxes) {
    sandboxesContainer.innerHTML = '';

    sandboxes.forEach((sandbox) => {
      const outputLines = sandbox.output.split('\n').map(cleanOutputLine).filter(Boolean);

      outputLines.forEach((line) => {
        const sandboxCard = document.createElement('div');
        sandboxCard.classList.add('sandbox-card');

        const [name, running, startup, gpuIntel, gpuNvidia, os, version, ...addresses] =
          line.split(/\s+/);

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

            <!-- Revised: "Remove" => single call after popup "Yes" -->
            <button class="control-btn" data-action="remove" data-name="${name}" data-path="${sandbox.path}">Remove</button>
          </div>
        `;
        sandboxesContainer.appendChild(sandboxCard);
      });
    });

    // Attach action handlers
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
            // Show the popup BEFORE calling the server
            showRemoveConfirmationPopup(name, async (userConfirmed) => {
              if (!userConfirmed) {
                // User clicked NO => do nothing
                return;
              }

              // user clicked YES => do the remove call
              const removeRes = await fetch('/api/controlSandbox', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  action: 'remove', 
                  name,
                  path,
                  username
                }),
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
            // Start/stop/restart
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

  /**
   * Filter by path
   */
  function filterSandboxes(path, activeElement) {
    Array.from(pathsList.children).forEach((item) => item.classList.remove('active'));
    activeElement.classList.add('active');

    const filteredSandboxes = allSandboxes.filter((sandbox) => sandbox.path === path);
    displaySandboxes(filteredSandboxes);
  }

  // Show all
  showAllBtn.addEventListener('click', () => {
    Array.from(pathsList.children).forEach((item) => item.classList.remove('active'));
    displaySandboxes(allSandboxes);
  });

  /**
   * Open settings popup
   */
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

  /**
   * Save updated user details
   */
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

  /**
   * Logout
   */
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

  /**
   * Popup for removing a sandbox
   */
  function showRemoveConfirmationPopup(sandboxName, callback) {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
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

    // YES => callback(true)
    const yesBtn = document.createElement('button');
    yesBtn.textContent = 'Yes';
    yesBtn.style.marginRight = '10px';
    yesBtn.addEventListener('click', () => {
      document.body.removeChild(overlay);
      callback(true);
    });
    popup.appendChild(yesBtn);

    // NO => callback(false)
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

  // Initially fetch sandboxes on load
  fetchSandboxes();
}

