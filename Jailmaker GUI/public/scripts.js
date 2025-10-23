/***********************************************************
 * scripts.js — unified page logic (no inline scripts)
 ***********************************************************/

/* utils */
function $(id){ return document.getElementById(id); }

/* ---------- Page: index.html ---------- */
const loginForm = $('loginForm');
const registerForm = $('registerForm');
const responseBox = $('response');

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('username').value.trim();
    const password = $('password').value.trim();
    responseBox.textContent = 'Logging in...';
    try {
      const res = await fetch('/api/login', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('username', username);
        responseBox.textContent = 'Login successful! Redirecting...';
        setTimeout(() => window.location.href = '/manage.html', 700);
      } else {
        responseBox.textContent = 'Error: ' + data.message;
      }
    } catch (err) {
      responseBox.textContent = 'Error: ' + err.toString();
    }
  });
}

if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('newUsername').value.trim();
    const password = $('newPassword').value.trim();
    responseBox.textContent = 'Registering user...';
    try {
      const res = await fetch('/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('username', username);
        responseBox.textContent = 'User registered! Redirecting...';
        setTimeout(() => window.location.href = '/serverdetails.html', 700);
      } else {
        responseBox.textContent = 'Error: ' + data.message;
      }
    } catch (err) {
      responseBox.textContent = 'Error: ' + err.toString();
    }
  });
}

/* ---------- Page: serverdetails.html ---------- */
const serverDetailsForm = $('serverDetailsForm');
if (serverDetailsForm) {
  serverDetailsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const serverIp = $('serverIp').value.trim();
    const serverPort = $('serverPort').value.trim();
    const serverUser = $('serverUser').value.trim();
    const serverPassword = $('serverPassword').value.trim();
    const username = localStorage.getItem('username');
    const resp = $('response');
    resp.textContent = 'Saving server details...';
    try {
      const res = await fetch('/api/setServerDetails', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, serverIp, serverPort, serverUser, serverPassword }),
      });
      const data = await res.json();
      if (data.success) {
        resp.textContent = 'Details saved! Redirecting...';
        setTimeout(() => window.location.href = '/paths.html', 700);
      } else {
        resp.textContent = 'Error: ' + data.message;
      }
    } catch (err) {
      resp.textContent = 'Error: ' + err.toString();
    }
  });
}

/* ---------- Page: paths.html ---------- */
const pathsForm = $('pathsForm');
if (pathsForm) {
  pathsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const p1 = $('path1').value.trim();
    const p2 = $('path2').value.trim();
    const p3 = $('path3').value.trim();
    const username = localStorage.getItem('username');
    const resp = $('response');
    resp.textContent = 'Saving paths...';
    try {
      const res = await fetch('/api/setPaths', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, paths: [p1, p2, p3].filter(Boolean) }),
      });
      const data = await res.json();
      if (data.success) {
        resp.textContent = 'Paths saved! Redirecting...';
        setTimeout(() => window.location.href = '/manage.html', 700);
      } else {
        resp.textContent = 'Error: ' + data.message;
      }
    } catch (err) {
      resp.textContent = 'Error: ' + err.toString();
    }
  });
}

