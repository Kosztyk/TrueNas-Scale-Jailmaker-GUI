/****************************************************
 * server.js
 *
 * Node/Express + PostgreSQL + ssh2 + WebSocket (ws)
 *
 * - Register/Login
 * - Store user/server details in DB
 * - Start/Stop/Restart/Remove sandbox
 * - Ephemeral route => /api/runSSHCommand
 * - NEW: /ws/permanentSsh => permanent shell session
 ****************************************************/

const express = require('express');
const http = require('http');       // For creating an HTTP server
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { Client } = require('ssh2');
const WebSocket = require('ws');    // For permanent SSH

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'jailmaker',
  password: process.env.DB_PASS || 'somepassword',
  database: process.env.DB_NAME || 'jailmakerdb',
});

// Initialize database
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
    console.log('Database initialized.');
  } catch (err) {
    console.error('Error initializing database:', err);
    process.exit(1);
  }
})();

// Serve static files
app.use(express.static('public'));

//---------------------------------------------------
// Redirect to landing page
//---------------------------------------------------
app.get('/', (req, res) => {
  res.redirect('/index.html');
});

//---------------------------------------------------
// Register
//---------------------------------------------------
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.json({ success: false, message: 'Username and password are required.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const userQuery = `INSERT INTO users (username, passwordhash) VALUES ($1, $2) RETURNING id`;
    const userResult = await pool.query(userQuery, [username, hashedPassword]);

    // Create an empty details row
    const detailsQuery = `INSERT INTO details (user_id) VALUES ($1)`;
    await pool.query(detailsQuery, [userResult.rows[0].id]);

    return res.json({ success: true, message: 'User created successfully.' });
  } catch (err) {
    console.error('Error registering user:', err);
    return res.json({ success: false, message: 'Error registering user.' });
  }
});

//---------------------------------------------------
// Login
//---------------------------------------------------
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.json({ success: false, message: 'Username and password are required.' });
  }

  try {
    const userQuery = `SELECT * FROM users WHERE username = $1`;
    const userResult = await pool.query(userQuery, [username]);
    const user = userResult.rows[0];

    if (!user) {
      return res.json({ success: false, message: 'Invalid username or password.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordhash);
    if (!passwordMatch) {
      return res.json({ success: false, message: 'Invalid username or password.' });
    }

    const detailsQuery = `SELECT serverip, serverport, serveruser, serverpass, paths FROM details WHERE user_id = $1`;
    const detailsResult = await pool.query(detailsQuery, [user.id]);

    return res.json({ success: true, details: detailsResult.rows[0] });
  } catch (err) {
    console.error('Error during login:', err);
    return res.json({ success: false, message: 'Error during login.' });
  }
});

//---------------------------------------------------
// setServerDetails
//---------------------------------------------------
app.post('/api/setServerDetails', async (req, res) => {
  const { username, serverIp, serverPort, serverUser, serverPassword } = req.body;
  if (!username || !serverIp || !serverPort || !serverUser || !serverPassword) {
    return res.json({ success: false, message: 'All fields are required.' });
  }

  try {
    const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    const userId = userResult.rows[0].id;

    const updateQuery = `
      UPDATE details
      SET serverip = $1, serverport = $2, serveruser = $3, serverpass = $4
      WHERE user_id = $5
    `;
    await pool.query(updateQuery, [serverIp, serverPort, serverUser, serverPassword, userId]);

    return res.json({ success: true, message: 'Server details saved successfully.' });
  } catch (err) {
    console.error('Error saving server details:', err);
    return res.json({ success: false, message: 'Error saving server details.' });
  }
});

//---------------------------------------------------
// setPaths
//---------------------------------------------------
app.post('/api/setPaths', async (req, res) => {
  const { username, paths } = req.body;
  if (!username || !paths || paths.length === 0) {
    return res.json({ success: false, message: 'Username and paths are required.' });
  }

  try {
    const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    const userId = userResult.rows[0].id;

    const pathsJson = JSON.stringify(paths);
    const updateQuery = `UPDATE details SET paths = $1 WHERE user_id = $2`;
    await pool.query(updateQuery, [pathsJson, userId]);

    return res.json({ success: true, message: 'Paths saved successfully.' });
  } catch (err) {
    console.error('Error saving paths:', err);
    return res.json({ success: false, message: 'Error saving paths.' });
  }
});

//---------------------------------------------------
// getSandboxes
//---------------------------------------------------
app.get('/api/getSandboxes', async (req, res) => {
  const { username } = req.query;
  if (!username) {
    return res.json({ success: false, message: 'Username is required.' });
  }

  try {
    const userQuery = `
      SELECT details.serverip, details.serverport, details.serveruser, details.serverpass, details.paths 
      FROM details 
      INNER JOIN users ON details.user_id = users.id 
      WHERE users.username = $1
    `;
    const userResult = await pool.query(userQuery, [username]);
    const userDetails = userResult.rows[0];

    if (!userDetails) {
      return res.json({ success: false, message: 'User not found or no details available.' });
    }

    const { serverip, serverport, serveruser, serverpass, paths } = userDetails;
    const pathsArray = JSON.parse(paths || '[]');

    if (pathsArray.length === 0) {
      return res.json({ success: false, message: 'No paths configured for this user.' });
    }

    console.log('User details:', userDetails);
    console.log('Paths to process:', pathsArray);

    const sandboxResults = [];
    const sshClient = new Client();

    sshClient
      .on('ready', () => {
        console.log('SSH connection established for getSandboxes.');
        let processedPaths = 0;

        pathsArray.forEach((path) => {
          const command = `sudo -S sh -c "cd ${path} && ./jlmkr.py list"`;

          sshClient.exec(command, { pty: true }, (err, stream) => {
            if (err) {
              console.error(`Error executing command for path ${path}:`, err.message);
              sandboxResults.push({ path, output: `Error: ${err.message}` });
              if (++processedPaths === pathsArray.length) {
                sshClient.end();
                res.json({ success: true, sandboxes: sandboxResults, details: userDetails });
              }
              return;
            }

            let output = '';
            stream
              .on('data', (data) => {
                output += data.toString();
              })
              .on('stderr', (stderr) => {
                console.error(`Error for path ${path}:`, stderr.toString());
              })
              .on('close', () => {
                sandboxResults.push({ path, output: output.trim() || 'No output available.' });
                console.log(`Output for path ${path}:`, output);
                if (++processedPaths === pathsArray.length) {
                  sshClient.end();
                  res.json({ success: true, sandboxes: sandboxResults, details: userDetails });
                }
              });

            // Provide the sudo password
            stream.write(`${serverpass}\n`);
          });
        });
      })
      .on('error', (err) => {
        console.error('SSH connection error (getSandboxes):', err.message);
        res.json({ success: false, message: `SSH connection error: ${err.message}` });
      })
      .connect({
        host: serverip,
        port: serverport,
        username: serveruser,
        password: serverpass,
      });
  } catch (err) {
    console.error('Error fetching sandboxes:', err);
    return res.json({ success: false, message: 'Error fetching sandboxes.' });
  }
});

//---------------------------------------------------
// getUserDetails
//---------------------------------------------------
app.get('/api/getUserDetails', async (req, res) => {
  const { username } = req.query;
  if (!username) {
    return res.json({ success: false, message: 'Username is required.' });
  }

  try {
    const userQuery = `
      SELECT u.username, d.serverip, d.serverport, d.serveruser, d.serverpass, d.paths
      FROM users u
      INNER JOIN details d ON u.id = d.user_id
      WHERE u.username = $1
    `;
    const userResult = await pool.query(userQuery, [username]);
    const userDetails = userResult.rows[0];

    if (!userDetails) {
      return res.json({ success: false, message: 'User not found.' });
    }

    // parse paths
    const paths = userDetails.paths ? JSON.parse(userDetails.paths) : [];

    res.json({
      success: true,
      details: {
        username: userDetails.username,
        serverip: userDetails.serverip,
        serverport: userDetails.serverport,
        serveruser: userDetails.serveruser,
        serverpass: userDetails.serverpass,
        paths,
      },
    });
  } catch (err) {
    console.error('Error fetching user details:', err);
    res.json({ success: false, message: 'Error fetching user details.' });
  }
});

//---------------------------------------------------
// controlSandbox
//---------------------------------------------------
app.post('/api/controlSandbox', async (req, res) => {
  const { action, name, path, username } = req.body;

  if (!action || !name || !path || !username) {
    return res.json({ success: false, message: 'Action, sandbox name, path, and username are required.' });
  }

  try {
    // Retrieve user details
    const userQuery = `
      SELECT details.serverip, details.serverport, details.serveruser, details.serverpass
      FROM details
      INNER JOIN users ON details.user_id = users.id
      WHERE users.username = $1
    `;
    const userResult = await pool.query(userQuery, [username]);
    const userDetails = userResult.rows[0];

    if (!userDetails) {
      return res.json({ success: false, message: 'User details not found.' });
    }

    const { serverip, serverport, serveruser, serverpass } = userDetails;

    if (action !== 'remove') {
      // Start/Stop/Restart
      const sshClient = new Client();
      sshClient
        .on('ready', () => {
          console.log(`SSH established for "${action}" on sandbox "${name}".`);
          const command = `echo ${serverpass} | sudo -S -p '' sh -c "cd ${path} && ./jlmkr.py ${action} '${name}'"`;
          sshClient.exec(command, (err, stream) => {
            if (err) {
              sshClient.end();
              return res.json({ success: false, message: `Error executing command: ${err.message}` });
            }
            let output = '';
            let errorOutput = '';
            stream
              .on('data', (data) => {
                output += data.toString();
              })
              .stderr.on('data', (data) => {
                errorOutput += data.toString();
              })
              .on('close', () => {
                sshClient.end();
                if (errorOutput && !errorOutput.includes('Running as unit:')) {
                  console.error(`Error: ${errorOutput}`);
                  return res.json({ success: false, message: errorOutput.trim() });
                }
                if (output.includes('Running as unit:') || errorOutput.includes('Running as unit:')) {
                  console.log(`Action "${action}" executed successfully: ${output || errorOutput}`);
                  return res.json({
                    success: true,
                    message: `Action "${action}" executed successfully.`,
                    output: (output + errorOutput).trim(),
                  });
                }
                console.log(`Command output: ${output}`);
                return res.json({ success: true, output: output.trim() });
              });
          });
        })
        .on('error', (err) => {
          console.error('SSH connection error:', err.message);
          res.json({ success: false, message: `SSH connection error: ${err.message}` });
        })
        .connect({
          host: serverip,
          port: serverport,
          username: serveruser,
          password: serverpass,
        });
      return;
    }

    // remove => pipe lines
    console.log(`[REMOVE pipe] for sandbox "${name}"...`);
    const sshClient = new Client();
    sshClient
      .on('ready', () => {
        console.log(`[REMOVE pipe] SSH ready for sandbox "${name}".`);
        const pipeline = `(echo "${serverpass}"; echo "${name}"; echo "")`;
        const removeCmd = `
${pipeline} | sudo -S -p '' sh -c "cd ${path} && ./jlmkr.py remove '${name}'"
`;
        console.log(`[REMOVE pipe] Command:\n${removeCmd}`);
        sshClient.exec(removeCmd, { pty: true }, (err, stream) => {
          if (err) {
            sshClient.end();
            return res.json({ success: false, message: `Error executing remove command: ${err.message}` });
          }
          let output = '';
          let errorOutput = '';
          stream.on('data', (data) => { output += data.toString(); })
            .stderr.on('data', (data) => { errorOutput += data.toString(); })
            .on('close', () => {
              sshClient.end();
              console.log(`[REMOVE pipe] Output for sandbox "${name}":\n${output}`);
              return res.json({
                success: true,
                message: `Sandbox "${name}" remove command executed with piped lines.`,
                output: (output + errorOutput).trim(),
              });
            });
        });
      })
      .on('error', (err) => {
        console.error('[REMOVE pipe] SSH error:', err.message);
        res.json({ success: false, message: `SSH connection error: ${err.message}` });
      })
      .connect({
        host: serverip,
        port: serverport,
        username: serveruser,
        password: serverpass,
      });

  } catch (err) {
    console.error('Error:', err.message);
    return res.json({ success: false, message: `Error: ${err.message}` });
  }
});

//---------------------------------------------------
// updateUserDetails
//---------------------------------------------------
app.post('/api/updateUserDetails', async (req, res) => {
  const {
    username,
    newUsername,
    serverIp,
    serverPort,
    serverUser,
    serverPassword,
    paths
  } = req.body;

  if (!username || !newUsername || !serverIp || !serverPort || !serverUser || !serverPassword) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  try {
    const userQuery = `SELECT id FROM users WHERE username = $1`;
    const userResult = await pool.query(userQuery, [username]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const userId = userResult.rows[0].id;
    const updateUserQuery = `UPDATE users SET username = $1 WHERE id = $2`;
    await pool.query(updateUserQuery, [newUsername, userId]);

    const updateDetailsQuery = `
      UPDATE details
      SET serverip = $1, serverport = $2, serveruser = $3, serverpass = $4, paths = $5
      WHERE user_id = $6
    `;
    await pool.query(updateDetailsQuery, [
      serverIp,
      serverPort,
      serverUser,
      serverPassword,
      JSON.stringify(paths),
      userId,
    ]);

    res.json({ success: true, message: 'Details updated successfully.' });
  } catch (err) {
    console.error('Error updating user details:', err);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

//---------------------------------------------------
// saveUserDetails
//---------------------------------------------------
app.post('/api/saveUserDetails', async (req, res) => {
  const { username, serverIp, serverPort, serverUser, serverPassword, paths } = req.body;
  if (!username || !serverIp || !serverPort || !serverUser || !serverPassword || !paths) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  try {
    const userQuery = 'SELECT id FROM users WHERE username = $1';
    const userResult = await pool.query(userQuery, [username]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const userId = userResult.rows[0].id;
    const updateQuery = `
      UPDATE details
      SET serverip = $1, serverport = $2, serveruser = $3, serverpass = $4, paths = $5
      WHERE user_id = $6
    `;
    await pool.query(updateQuery, [
      serverIp,
      serverPort,
      serverUser,
      serverPassword,
      JSON.stringify(paths),
      userId,
    ]);
    res.json({ success: true, message: 'Details saved successfully.' });
  } catch (err) {
    console.error('Error saving user details:', err);
    res.status(500).json({ success: false, message: 'Error saving user details.' });
  }
});

//---------------------------------------------------
// disconnectSSH
//---------------------------------------------------
const activeSSHConnections = new Map();

app.post('/api/disconnectSSH', async (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ success: false, message: 'Username is required.' });
  }
  try {
    const sshClient = activeSSHConnections.get(username);
    if (sshClient) {
      sshClient.end();
      activeSSHConnections.delete(username);
      console.log(`SSH connection closed for user: ${username}`);
    }
    res.json({ success: true, message: 'Logout successful. SSH connection closed.' });
  } catch (err) {
    console.error('Error during SSH disconnect:', err.message);
    res.status(500).json({ success: false, message: 'Error during SSH disconnect.' });
  }
});

//---------------------------------------------------
// HTTP server + WebSocket server
//---------------------------------------------------
const server = http.createServer(app);
const PORT = 8080;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

//---------------------------------------------------
// Ephemeral route => /api/runSSHCommand (unchanged)
//---------------------------------------------------
app.post('/api/runSSHCommand', async (req, res) => {
  const { username, command } = req.body;
  if (!username || !command) {
    return res.json({ success: false, message: 'Username and command are required.' });
  }

  try {
    const userQuery = `
      SELECT d.serverip, d.serverport, d.serveruser, d.serverpass
      FROM details d
      INNER JOIN users u ON d.user_id = u.id
      WHERE u.username = $1
    `;
    const userResult = await pool.query(userQuery, [username]);
    const userDetails = userResult.rows[0];
    if (!userDetails) {
      return res.json({ success: false, message: 'User details not found for SSH.' });
    }
    const { serverip, serverport, serveruser, serverpass } = userDetails;
    const sshClient = new Client();

    sshClient
      .on('ready', () => {
        console.log(`SSH ephemeral ready. Will run command as root: ${command}`);
        const suCommand = `echo ${serverpass} | sudo -S -p '' /usr/bin/bash -c "${command}"`;

        sshClient.exec(suCommand, (err, stream) => {
          if (err) {
            sshClient.end();
            return res.json({ success: false, message: err.message });
          }
          let output = '';
          let errorOutput = '';
          stream
            .on('data', (data) => {
              output += data.toString();
            })
            .stderr.on('data', (data) => {
              errorOutput += data.toString();
            })
            .on('close', () => {
              sshClient.end();
              const combined = output + (errorOutput ? '\n' + errorOutput : '');
              return res.json({ success: true, output: combined.trim() });
            });
        });
      })
      .on('error', (err) => {
        console.error('Ephemeral SSH error:', err.message);
        res.json({ success: false, message: `SSH error: ${err.message}` });
      })
      .connect({
        host: serverip,
        port: serverport,
        username: serveruser,
        password: serverpass,
      });
  } catch (err) {
    console.error('runSSHCommand error:', err.message);
    return res.json({ success: false, message: err.message });
  }
});

//---------------------------------------------------
// NEW: WebSocket-based permanent SSH => /ws/permanentSsh
//---------------------------------------------------
const wss = new WebSocket.Server({ server });

wss.on('connection', async (ws, req) => {
  // Expect ws://host:8080/ws/permanentSsh?username=someUser
  const urlParams = new URLSearchParams(req.url.split('?')[1] || '');
  const username = urlParams.get('username');
  if (!username) {
    ws.send('No username specified in URL');
    ws.close();
    return;
  }
  let userDetails;
  try {
    const userQuery = `
      SELECT d.serverip, d.serverport, d.serveruser, d.serverpass
      FROM details d
      INNER JOIN users u ON d.user_id = u.id
      WHERE u.username = $1
    `;
    const userResult = await pool.query(userQuery, [username]);
    userDetails = userResult.rows[0];
    if (!userDetails) {
      ws.send('User details not found for SSH');
      ws.close();
      return;
    }
  } catch (err) {
    ws.send(`Error fetching user details: ${err}`);
    ws.close();
    return;
  }
  const { serverip, serverport, serveruser, serverpass } = userDetails;
  const sshClient = new Client();
  sshClient
    .on('ready', () => {
      // Request an interactive shell with a defined terminal type and dimensions.
      sshClient.shell({ term: 'xterm-256color', cols: 120, rows: 40 }, (err, stream) => {
        if (err) {
          ws.send(`Error starting shell: ${err.message}`);
          ws.close();
          sshClient.end();
          return;
        }
        // Immediately configure the remote shell to use the correct erase character.
        stream.write("stty erase '^?'\n");

        // Optionally, if you want to switch to root immediately, uncomment the next line:
        // stream.write(`echo ${serverpass} | sudo -S -p '' su - root\n`);

        stream.on('data', (data) => {
          ws.send(data.toString(), { binary: false });
        });
        stream.stderr.on('data', (data) => {
          ws.send(data.toString(), { binary: false });
        });
        stream.on('close', () => {
          ws.close();
          sshClient.end();
        });
        ws.on('message', (msg) => {
          stream.write(msg);
        });
        ws.on('close', () => {
          sshClient.end();
        });
      });
    })
    .on('error', (err) => {
      ws.send(`SSH error: ${err.message}`);
      ws.close();
    })
    .connect({
      host: serverip,
      port: serverport,
      username: serveruser,
      password: serverpass,
    });

});

