/***********************************************************
 * Utility: getQueryParam
 * Parse ?username=... from the current page's URL
 ***********************************************************/
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

/***********************************************************
 * Page 1: index.html
 * Login or register application user
 ***********************************************************/
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const responseBox = document.getElementById('response');

// Handle login
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    responseBox.textContent = 'Logging in...';

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (data.success) {
        localStorage.setItem('username', username);
        responseBox.textContent = 'Login successful! Redirecting...';
        setTimeout(() => {
          window.location.href = '/manage.html';
        }, 1000);
      } else {
        responseBox.textContent = 'Error: ' + data.message;
      }
    } catch (err) {
      responseBox.textContent = 'Error: ' + err.toString();
    }
  });
}

// Handle registration
if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('newPassword').value.trim();

    responseBox.textContent = 'Registering user...';

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (data.success) {
        localStorage.setItem('username', username);
        responseBox.textContent = 'User registered! Redirecting...';
        setTimeout(() => {
          window.location.href = '/serverdetails.html';
        }, 1000);
      } else {
        responseBox.textContent = 'Error: ' + data.message;
      }
    } catch (err) {
      responseBox.textContent = 'Error: ' + err.toString();
    }
  });
}

/***********************************************************
 * Page 2: serverdetails.html
 * Save server details with SSH validation
 ***********************************************************/
const serverDetailsForm = document.getElementById('serverDetailsForm');

if (serverDetailsForm) {
  serverDetailsForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const serverIp = document.getElementById('serverIp').value.trim();
    const serverPort = document.getElementById('serverPort').value.trim();
    const serverUser = document.getElementById('serverUser').value.trim();
    const serverPassword = document.getElementById('serverPassword').value.trim();
    const username = localStorage.getItem('username');

    const responseBox = document.getElementById('response');
    responseBox.textContent = 'Validating server credentials...';

    try {
      const res = await fetch('/api/setServerDetails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, serverIp, serverPort, serverUser, serverPassword }),
      });

      const data = await res.json();
      if (data.success) {
        responseBox.textContent = 'Server details saved! Redirecting...';
        setTimeout(() => {
          window.location.href = '/paths.html';
        }, 1000);
      } else {
        responseBox.textContent = 'Error: ' + data.message;
      }
    } catch (err) {
      responseBox.textContent = 'Error: ' + err.toString();
    }
  });
}

/***********************************************************
 * Page 3: paths.html
 * Save Jailmaker paths
 ***********************************************************/
const pathsForm = document.getElementById('pathsForm');

if (pathsForm) {
  pathsForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const path1 = document.getElementById('path1').value.trim();
    const path2 = document.getElementById('path2').value.trim();
    const path3 = document.getElementById('path3').value.trim();
    const username = localStorage.getItem('username');

    const responseBox = document.getElementById('response');
    responseBox.textContent = 'Saving paths...';

    try {
      const res = await fetch('/api/setPaths', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, paths: [path1, path2, path3] }),
      });

      const data = await res.json();
      if (data.success) {
        responseBox.textContent = 'Paths saved! Redirecting...';
        setTimeout(() => {
          window.location.href = '/manage.html';
        }, 1000);
      } else {
        responseBox.textContent = 'Error: ' + data.message;
      }
    } catch (err) {
      responseBox.textContent = 'Error: ' + err.toString();
    }
  });
}

/***********************************************************
 * Page 4: manage.html
 * Display sandboxes and manage them
 ***********************************************************/
/***********************************************************
 * Page 4: manage.html
 * 1) Fetch and display sandbox details
 * 2) Provide "Create Jail" button functionality
 ***********************************************************/
const sandboxesContainer = document.getElementById('sandboxesContainer');
const btnCreateJail = document.getElementById('btnCreateJail');
const createOutput = document.getElementById('createOutput');

if (sandboxesContainer) {
  const username = localStorage.getItem('username'); // Retrieve logged-in user's username

  // Fetch sandboxes from the server
  async function fetchSandboxes() {
    sandboxesContainer.textContent = 'Loading sandboxes...';

    try {
      const res = await fetch(`/api/getSandboxes?username=${encodeURIComponent(username)}`);
      const data = await res.json();

      if (data.success) {
        sandboxesContainer.innerHTML = ''; // Clear container

        // Render each sandbox as a card
        data.sandboxes.forEach((sandbox) => {
          const sandboxCard = document.createElement('div');
          sandboxCard.classList.add('sandbox-card');

          sandboxCard.innerHTML = `
            <h3>Path: ${sandbox.path}</h3>
            <pre>${sandbox.output}</pre>
          `;

          sandboxesContainer.appendChild(sandboxCard);
        });
      } else {
        sandboxesContainer.textContent = `Error: ${data.message}`;
      }
    } catch (err) {
      sandboxesContainer.textContent = `Error loading sandboxes: ${err.toString()}`;
    }
  }

  // Fetch sandboxes on page load
  fetchSandboxes();

  // Handle "Create Jail" button functionality
  if (btnCreateJail) {
    btnCreateJail.addEventListener('click', async () => {
      createOutput.textContent = '';
      const jailName = document.getElementById('newJailName').value.trim();

      if (!jailName) {
        alert('Please enter a jail name.');
        return;
      }

      try {
        const res = await fetch('/api/createJail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, jailName }),
        });
        const data = await res.json();

        if (data.success) {
          createOutput.textContent = `Jail created successfully:\n${data.output}`;
          fetchSandboxes(); // Refresh sandbox list
        } else {
          createOutput.textContent = `Error: ${data.message}`;
        }
      } catch (err) {
        createOutput.textContent = `Error: ${err.toString()}`;
      }
    });
  }
}

