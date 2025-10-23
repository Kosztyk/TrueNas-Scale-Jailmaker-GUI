/****************************************************
 * server.js  —  Jailmaker GUI Backend (Full)
 *
 * Node/Express + PostgreSQL + ssh2 + WebSocket (ws)
 *
 * Features:
 * - Register / Login
 * - Store & fetch user/server details (PostgreSQL)
 * - Distros/Releases file endpoints
 * - List sandboxes (jlmkr.py list on each path)
 * - Control actions: start/stop/restart/remove
 *   - Legacy REST: /api/controlSandbox  (REMOVE fixed: pipes name)
 *   - Streaming: /api/controlSandboxStream + WS /ws/actionLogs (REMOVE fixed: pipes name)
 * - Run arbitrary SSH command
 *   - Legacy REST: /api/runSSHCommand
 *   - Streaming: /api/runSSHCommandStream + WS /ws/actionLogs
 * - Permanent SSH shell over WebSocket: /ws/permanentSsh
 * - Optional Jail Shell over WebSocket: /ws/jailShell
 ****************************************************/

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { Client: SSHClient } = require('ssh2');
const WebSocket = require('ws');
const { EventEmitter } = require('events');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* -----------------------------
   PostgreSQL connection
----------------------------- */
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'jailmaker',
  password: process.env.DB_PASS || 'somepassword',
  database: process.env.DB_NAME || 'jailmakerdb',
});

(async function initDB() {
  const createUsersTable = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      passwordhash TEXT NOT NULL
    );
  `;
  const createDetailsTable = `
    CREATE TABLE IF NOT EXISTS details (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id),
      serverip TEXT,
      serverport INT,
      serveruser TEXT,
      serverpass TEXT,
      paths TEXT
    );
  `;
  try {
    await pool.query(createUsersTable);
    await pool.query(createDetailsTable);
    console.log('[DB] Initialized.');
  } catch (err) {
    console.error('[DB] Init error:', err);
    process.exit(1);
  }
})();

/* -----------------------------
   Helpers (DB + SSH)
----------------------------- */
async function getServerDetailsFor(username) {
  const q = `
    SELECT d.serverip, d.serverport, d.serveruser, d.serverpass
    FROM details d
    INNER JOIN users u ON d.user_id = u.id
    WHERE u.username = $1
  `;
  const r = await pool.query(q, [username]);
  return r.rows[0];
}

/** Run a command over SSH and STREAM stdout/stderr to an EventEmitter.
 *  Emits: 'data' (chunk), 'error' (err), 'done'(success:boolean)
 */
async function runSSHStreaming(username, command, emitter) {
  const details = await getServerDetailsFor(username);
  if (!details) throw new Error('User details not found for SSH.');
  const { serverip, serverport, serveruser, serverpass } = details;

  return new Promise((resolve, reject) => {
    const conn = new SSHClient();

    conn
      .on('ready', () => {
        // sudo + bash -lc with proper quoting
        const su = `echo ${serverpass} | sudo -S -p '' /usr/bin/bash -lc ${JSON.stringify(command)}`;
        conn.exec(su, { pty: true }, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }
          stream.on('close', (code) => {
            conn.end();
            resolve(code);
          });
          stream.on('data', (d) => emitter.emit('data', d.toString()));
          stream.stderr.on('data', (d) => emitter.emit('data', d.toString()));
        });
      })
      .on('keyboard-interactive', (name, instr, lang, prompts, finish) => finish([serverpass]))
      .on('error', (err) => {
        emitter.emit('error', err);
        reject(err);
      })
      .connect({
        host: serverip,
        port: Number(serverport) || 22,
        username: serveruser,
        password: serverpass,
        tryKeyboard: true,
      });
  });
}

/** Convenience: simple (non-streaming) command exec returning output */
async function runSSHEphemeral(username, command) {
  const details = await getServerDetailsFor(username);
  if (!details) throw new Error('User details not found for SSH.');
  const { serverip, serverport, serveruser, serverpass } = details;

  return new Promise((resolve, reject) => {
    const conn = new SSHClient();
    conn
      .on('ready', () => {
        const su = `echo ${serverpass} | sudo -S -p '' /usr/bin/bash -lc ${JSON.stringify(command)}`;
        conn.exec(su, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }
          let out = '';
          let errOut = '';
          stream
            .on('data', (d) => (out += d.toString()))
            .stderr.on('data', (d) => (errOut += d.toString()))
            .on('close', () => {
              conn.end();
              resolve((out + (errOut ? '\n' + errOut : '')).trim());
            });
        });
      })
      .on('error', reject)
      .connect({
        host: serverip,
        port: Number(serverport) || 22,
        username: serveruser,
        password: serverpass,
      });
  });
}

/* -----------------------------
   Static + distros/releases
----------------------------- */
app.use(express.static('public'));

app.get('/', (req, res) => res.redirect('/index.html'));

app.get('/distros', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'distros', 'distros');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Failed to load distros' });
    res.json(data.split('\n').map((s) => s.trim()).filter(Boolean));
  });
});

app.get('/releases/:distro', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'distros', req.params.distro.toLowerCase());
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(404).json({ error: `No releases found for ${req.params.distro}` });
    res.json(data.split('\n').map((s) => s.trim()).filter(Boolean));
  });
});

/* -----------------------------
   Auth + details + paths
----------------------------- */
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.json({ success: false, message: 'Username and password are required.' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const u = await pool.query(`INSERT INTO users (username, passwordhash) VALUES ($1,$2) RETURNING id`, [username, hash]);
    await pool.query(`INSERT INTO details (user_id) VALUES ($1)`, [u.rows[0].id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[register]', err);
    res.json({ success: false, message: 'Error registering user.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.json({ success: false, message: 'Username and password are required.' });
  try {
    const r = await pool.query(`SELECT * FROM users WHERE username=$1`, [username]);
    const user = r.rows[0];
    if (!user) return res.json({ success: false, message: 'Invalid username or password.' });
    const ok = await bcrypt.compare(password, user.passwordhash);
    if (!ok) return res.json({ success: false, message: 'Invalid username or password.' });
    const d = await pool.query(`SELECT serverip,serverport,serveruser,serverpass,paths FROM details WHERE user_id=$1`, [user.id]);
    res.json({ success: true, details: d.rows[0] || null });
  } catch (err) {
    console.error('[login]', err);
    res.json({ success: false, message: 'Error during login.' });
  }
});

app.post('/api/setServerDetails', async (req, res) => {
  const { username, serverIp, serverPort, serverUser, serverPassword } = req.body || {};
  if (!username || !serverIp || !serverPort || !serverUser || !serverPassword) {
    return res.json({ success: false, message: 'All fields are required.' });
  }
  try {
    const u = await pool.query(`SELECT id FROM users WHERE username=$1`, [username]);
    const userId = u.rows[0]?.id;
    if (!userId) return res.json({ success: false, message: 'User not found.' });
    await pool.query(
      `UPDATE details SET serverip=$1, serverport=$2, serveruser=$3, serverpass=$4 WHERE user_id=$5`,
      [serverIp, serverPort, serverUser, serverPassword, userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[setServerDetails]', err);
    res.json({ success: false, message: 'Error saving server details.' });
  }
});

app.post('/api/setPaths', async (req, res) => {
  const { username, paths } = req.body || {};
  if (!username || !paths?.length) return res.json({ success: false, message: 'Username and paths are required.' });
  try {
    const u = await pool.query(`SELECT id FROM users WHERE username=$1`, [username]);
    const userId = u.rows[0]?.id;
    if (!userId) return res.json({ success: false, message: 'User not found.' });
    await pool.query(`UPDATE details SET paths=$1 WHERE user_id=$2`, [JSON.stringify(paths), userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('[setPaths]', err);
    res.json({ success: false, message: 'Error saving paths.' });
  }
});

app.get('/api/getUserDetails', async (req, res) => {
  const { username } = req.query || {};
  if (!username) return res.json({ success: false, message: 'Username is required.' });
  try {
    const r = await pool.query(
      `SELECT u.username, d.serverip, d.serverport, d.serveruser, d.serverpass, d.paths
       FROM users u INNER JOIN details d ON u.id=d.user_id WHERE u.username=$1`,
      [username]
    );
    const d = r.rows[0];
    if (!d) return res.json({ success: false, message: 'User not found.' });
    res.json({
      success: true,
      details: {
        username: d.username,
        serverip: d.serverip,
        serverport: d.serverport,
        serveruser: d.serveruser,
        serverpass: d.serverpass,
        paths: d.paths ? JSON.parse(d.paths) : [],
      },
    });
  } catch (err) {
    console.error('[getUserDetails]', err);
    res.json({ success: false, message: 'Error fetching user details.' });
  }
});

/* -----------------------------
   Listing & control (legacy)
----------------------------- */
app.get('/api/getSandboxes', async (req, res) => {
  const { username } = req.query || {};
  if (!username) return res.json({ success: false, message: 'Username is required.' });
  try {
    const details = await pool.query(
      `SELECT d.serverip, d.serverport, d.serveruser, d.serverpass, d.paths
       FROM details d INNER JOIN users u ON d.user_id = u.id WHERE u.username=$1`,
      [username]
    );
    const det = details.rows[0];
    if (!det) return res.json({ success: false, message: 'User not found or no details.' });

    const paths = det.paths ? JSON.parse(det.paths) : [];
    if (!paths.length) return res.json({ success: false, message: 'No paths configured for this user.' });

    const ssh = new SSHClient();
    const results = [];
    ssh
      .on('ready', () => {
        let done = 0;
        paths.forEach((p) => {
          const cmd = `sudo -S sh -c "cd ${p} && ./jlmkr.py list"`;
          ssh.exec(cmd, { pty: true }, (err, stream) => {
            if (err) {
              results.push({ path: p, output: `Error: ${err.message}` });
              if (++done === paths.length) {
                ssh.end();
                res.json({ success: true, sandboxes: results, details: det });
              }
              return;
            }
            let out = '';
            stream
              .on('data', (d) => (out += d.toString()))
              .stderr.on('data', (d) => (out += d.toString()))
              .on('close', () => {
                results.push({ path: p, output: out.trim() || 'No output available.' });
                if (++done === paths.length) {
                  ssh.end();
                  res.json({ success: true, sandboxes: results, details: det });
                }
              });
            stream.write(`${det.serverpass}\n`);
          });
        });
      })
      .on('error', (e) => res.json({ success: false, message: `SSH connection error: ${e.message}` }))
      .connect({
        host: det.serverip,
        port: det.serverport,
        username: det.serveruser,
        password: det.serverpass,
      });
  } catch (err) {
    console.error('[getSandboxes]', err);
    res.json({ success: false, message: 'Error fetching sandboxes.' });
  }
});

app.post('/api/controlSandbox', async (req, res) => {
  const { action, name, path: jailPath, username } = req.body || {};
  if (!action || !name || !jailPath || !username) {
    return res.json({ success: false, message: 'Action, sandbox name, path, and username are required.' });
  }
  try {
    // robust single-quote escaping for POSIX shell
    const safeName = String(name).replace(/'/g, `'\"'\"'`);
    const safePath = String(jailPath).replace(/'/g, `'\"'\"'`);
    let cmd;

    if (action === 'remove') {
      // FIX: pipe the jail name to satisfy input() confirmation
      cmd = `cd '${safePath}' && printf '%s\\n' '${safeName}' | ./jlmkr.py remove '${safeName}'`;
    } else {
      cmd = `cd '${safePath}' && ./jlmkr.py ${action} '${safeName}'`;
    }

    const out = await runSSHEphemeral(username, cmd);
    res.json({ success: true, output: out });
  } catch (err) {
    console.error('[controlSandbox]', err);
    res.json({ success: false, message: String(err?.message || err) });
  }
});

app.post('/api/runSSHCommand', async (req, res) => {
  const { username, command } = req.body || {};
  if (!username || !command) return res.json({ success: false, message: 'Username and command are required.' });
  try {
    const out = await runSSHEphemeral(username, command);
    res.json({ success: true, output: out });
  } catch (err) {
    console.error('[runSSHCommand]', err);
    res.json({ success: false, message: String(err?.message || err) });
  }
});

/* -----------------------------
   NEW: Streaming APIs
----------------------------- */
const actionStreams = new Map(); // actionId => EventEmitter
function getActionEmitter(actionId) {
  let em = actionStreams.get(actionId);
  if (!em) {
    em = new EventEmitter();
    actionStreams.set(actionId, em);
  }
  return em;
}

app.post('/api/controlSandboxStream', async (req, res) => {
  const { action, name, path: jailPath, username, actionId } = req.body || {};
  if (!action || !name || !jailPath || !username || !actionId) {
    return res.json({ success: false, message: 'Missing parameters' });
  }
  const em = getActionEmitter(actionId);
  try {
    const safeName = String(name).replace(/'/g, `'\"'\"'`);
    const safePath = String(jailPath).replace(/'/g, `'\"'\"'`);
    let cmd;

    if (action === 'remove') {
      // FIX: pipe the jail name to satisfy input() confirmation
      cmd = `cd '${safePath}' && printf '%s\\n' '${safeName}' | ./jlmkr.py remove '${safeName}'`;
    } else {
      cmd = `cd '${safePath}' && ./jlmkr.py ${action} '${safeName}'`;
    }

    runSSHStreaming(username, cmd, em)
      .then((code) => {
        em.emit('done', code === 0);
        setTimeout(() => actionStreams.delete(actionId), 60 * 1000);
      })
      .catch((err) => {
        em.emit('error', err);
        em.emit('done', false);
        setTimeout(() => actionStreams.delete(actionId), 60 * 1000);
      });
    res.json({ success: true });
  } catch (err) {
    em.emit('error', err);
    em.emit('done', false);
    setTimeout(() => actionStreams.delete(actionId), 60 * 1000);
    res.json({ success: false, message: String(err?.message || err) });
  }
});

app.post('/api/runSSHCommandStream', async (req, res) => {
  const { username, command, actionId } = req.body || {};
  if (!username || !command || !actionId) {
    return res.json({ success: false, message: 'Missing parameters' });
  }
  const em = getActionEmitter(actionId);
  try {
    runSSHStreaming(username, command, em)
      .then((code) => {
        em.emit('done', code === 0);
        setTimeout(() => actionStreams.delete(actionId), 60 * 1000);
      })
      .catch((err) => {
        em.emit('error', err);
        em.emit('done', false);
        setTimeout(() => actionStreams.delete(actionId), 60 * 1000);
      });
    res.json({ success: true });
  } catch (err) {
    em.emit('error', err);
    em.emit('done', false);
    setTimeout(() => actionStreams.delete(actionId), 60 * 1000);
    res.json({ success: false, message: String(err?.message || err) });
  }
});

// POST /api/saveUserDetails
// Body: { username, serverIp, serverPort, serverUser, serverPassword, paths: [] }
app.post('/api/saveUserDetails', async (req, res) => {
  try {
    const { username, serverIp, serverPort, serverUser, serverPassword, paths } = req.body || {};
    if (!username) return res.json({ success: false, message: 'Username is required.' });

    // find user id
    const u = await pool.query(`SELECT id FROM users WHERE username=$1`, [username]);
    const userId = u.rows[0]?.id;
    if (!userId) return res.json({ success: false, message: 'User not found.' });

    // update details (only if values provided)
    const toSet = {};
    if (serverIp !== undefined) toSet.serverip = serverIp;
    if (serverPort !== undefined) toSet.serverport = Number(serverPort) || null;
    if (serverUser !== undefined) toSet.serveruser = serverUser;
    if (serverPassword !== undefined) toSet.serverpass = serverPassword;
    if (paths !== undefined) toSet.paths = JSON.stringify(Array.isArray(paths) ? paths : []);

    const keys = Object.keys(toSet);
    if (!keys.length) {
      return res.json({ success: false, message: 'No fields to update.' });
    }

    const sets = keys.map((k, i) => `${k}=$${i+1}`).join(', ');
    const values = keys.map(k => toSet[k]);
    values.push(userId);

    await pool.query(`UPDATE details SET ${sets} WHERE user_id=$${values.length}`, values);

    res.json({ success: true });
  } catch (err) {
    console.error('[saveUserDetails]', err);
    res.json({ success: false, message: String(err?.message || err) });
  }
});


/* -----------------------------
   Disconnect SSH (if pooled)
----------------------------- */
const activeSSHConnections = new Map();
app.post('/api/disconnectSSH', async (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ success: false, message: 'Username is required.' });
  try {
    const ssh = activeSSHConnections.get(username);
    if (ssh) {
      ssh.end();
      activeSSHConnections.delete(username);
    }
    res.json({ success: true, message: 'Logout successful. SSH connection closed.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error during SSH disconnect.' });
  }
});

/* -----------------------------
   HTTP server + WebSockets
----------------------------- */
const server = http.createServer(app);
const PORT = Number(process.env.PORT || 8080);
server.listen(PORT, () => console.log(`HTTP listening on http://localhost:${PORT}`));

const wss = new WebSocket.Server({ server });

wss.on('connection', async (ws, req) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    /* -------- Action Logs: /ws/actionLogs?actionId=... -------- */
    if (pathname === '/ws/actionLogs') {
      const actionId = url.searchParams.get('actionId');
      if (!actionId) {
        ws.send(JSON.stringify({ type: 'error', message: 'Missing actionId' }));
        ws.close();
        return;
      }
      const emitter = getActionEmitter(actionId);

      const onData = (chunk) => {
        try { ws.send(typeof chunk === 'string' ? chunk : chunk.toString()); } catch {}
      };
      const onError = (err) => {
        try { ws.send(JSON.stringify({ type: 'error', message: String(err?.message || err) })); } catch {}
      };
      const onDone = (success) => {
        try { ws.send(JSON.stringify({ type: 'done', success: !!success })); } catch {}
      };

      emitter.on('data', onData);
      emitter.on('error', onError);
      emitter.once('done', onDone);

      ws.on('close', () => {
        emitter.removeListener('data', onData);
        emitter.removeListener('error', onError);
      });
      return;
    }

    /* -------- Permanent SSH shell: /ws/permanentSsh?username=... -------- */
    if (pathname === '/ws/permanentSsh') {
      const username = url.searchParams.get('username');
      if (!username) {
        ws.send('No username specified');
        ws.close();
        return;
      }
      const det = await getServerDetailsFor(username);
      if (!det) {
        ws.send('User details not found for SSH');
        ws.close();
        return;
      }
      const { serverip, serverport, serveruser, serverpass } = det;
      const ssh = new SSHClient();
      ssh
        .on('ready', () => {
          ssh.shell({ term: 'xterm-256color', cols: 120, rows: 40 }, (err, stream) => {
            if (err) {
              ws.send(`Shell error: ${err.message}`);
              ws.close();
              ssh.end();
              return;
            }
            stream.on('data', (d) => ws.send(d.toString('utf-8')));
            stream.stderr.on('data', (d) => ws.send(d.toString('utf-8')));
            stream.on('close', () => { ws.close(); ssh.end(); });

            ws.on('message', (msg) => {
              try {
                const data = JSON.parse(msg);
                if (data.type === 'resize') {
                  stream.setWindow(data.rows, data.cols, 0, 0);
                  return;
                }
              } catch (_) { /* not JSON */ }
              stream.write(msg);
            });
            ws.on('close', () => ssh.end());
          });
        })
        .on('error', (e) => { try { ws.send(`SSH error: ${e.message}`); } catch {} ws.close(); })
        .connect({ host: serverip, port: Number(serverport) || 22, username: serveruser, password: serverpass });
      return;
    }

    /* -------- Optional: Jail Shell: /ws/jailShell?username=..&jailPath=..&sandboxName=.. -------- */
    if (pathname === '/ws/jailShell') {
      const username = url.searchParams.get('username');
      const jailPath = url.searchParams.get('jailPath');
      const sandboxName = url.searchParams.get('sandboxName');
      if (!username || !jailPath || !sandboxName) {
        ws.send('Missing params (username, jailPath, sandboxName)');
        ws.close();
        return;
      }
      const det = await getServerDetailsFor(username);
      if (!det) {
        ws.send('User details not found for SSH');
        ws.close();
        return;
      }
      const { serverip, serverport, serveruser, serverpass } = det;
      const ssh = new SSHClient();
      ssh
        .on('ready', () => {
          ssh.shell({ term: 'xterm-256color', cols: 120, rows: 40 }, (err, stream) => {
            if (err) {
              ws.send(`Shell error: ${err.message}`);
              ws.close();
              ssh.end();
              return;
            }
            stream.on('data', (d) => ws.send(d.toString('utf-8')));
            stream.stderr.on('data', (d) => ws.send(d.toString('utf-8')));
            stream.on('close', () => { ws.close(); ssh.end(); });

            // enter jail
            setTimeout(() => {
              stream.write(`stty erase '^?'\n`);
              stream.write(`cd ${jailPath.replace(/\/$/, '')} && sudo ./jlmkr.py shell ${sandboxName}\n`);
            }, 250);

            ws.on('message', (msg) => {
              try {
                const data = JSON.parse(msg);
                if (data.type === 'resize') {
                  stream.setWindow(data.rows, data.cols, 0, 0);
                  return;
                }
              } catch (_) {}
              stream.write(msg);
            });
            ws.on('close', () => ssh.end());
          });
        })
        .on('error', (e) => { try { ws.send(`SSH error: ${e.message}`); } catch {} ws.close(); })
        .connect({ host: serverip, port: Number(serverport) || 22, username: serveruser, password: serverpass });
      return;
    }

    // Unknown WS route
    ws.send('Unknown WebSocket endpoint');
    ws.close();
  } catch (err) {
    try { ws.send(`WS error: ${String(err?.message || err)}`); } catch {}
    ws.close();
  }
});

