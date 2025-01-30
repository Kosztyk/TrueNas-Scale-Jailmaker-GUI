/****************************************************
 * server.js
 *
 * Node/Express + PostgreSQL + ssh2
 * 
 * - Register/Login
 * - Store user/server details in DB
 * - Start/Stop/Restart sandbox via ephemeral commands
 * - Remove sandbox by piping lines: (echo pass; echo sandbox; echo "") | sudo ...
 *   => This avoids EOFError in jlmkr.py because all lines are fed at once
 ****************************************************/

const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { Client } = require('ssh2');

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

// Initialize database tables if needed
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

// Redirect to landing page
app.get('/', (req, res) => {
  res.redirect('/index.html');
});

//---------------------------------------------------
// Register user
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

    // Create an empty details row for that user
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
// controlSandbox: start/stop/restart => single ephemeral
// remove => pipe everything so we don't get EOFError
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

    // handle non-remove actions
    if (action !== 'remove') {
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

    // Action = 'remove' => pipe all lines in one ephemeral command
    console.log(`[REMOVE pipe] for sandbox "${name}"...`);

    const sshClient = new Client();
    sshClient
      .on('ready', () => {
        console.log(`[REMOVE pipe] SSH ready for sandbox "${name}".`);

        // We pipe 3 lines:
        //   line 1: <sudoPassword> => consumed by "sudo -S"
        //   line 2: <sandboxName>  => read by jlmkr.py remove
        //   line 3: empty => optional if script calls a second input
        // If your script only calls input() once, 2 lines is enough. If it calls it twice, add 3 lines, etc.
        // Example:
        //   (echo "mySudoPass"; echo "mySandbox"; echo "") | sudo -S -p '' ...
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

          stream
            .on('data', (data) => {
              output += data.toString();
            })
            .stderr.on('data', (data) => {
              errorOutput += data.toString();
            })
            .on('close', () => {
              sshClient.end();
              console.log(`[REMOVE pipe] Output for sandbox "${name}":\n${output}`);

              // We won't parse for success or fail, just show final output
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
// Start the server
//---------------------------------------------------
const PORT = 8080;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

