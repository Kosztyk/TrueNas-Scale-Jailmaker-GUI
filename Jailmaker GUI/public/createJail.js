// createJail.js — Create popup + streaming logs for creation

function ensure(fn, name){
  if (typeof fn !== 'function') {
    console.error(`[${name}] is not available.`);
    return false;
  }
  return true;
}

async function openCreateJailPopup() {
  document.querySelectorAll('.modal-overlay[data-kind="create-jail"]').forEach(n => n.remove());

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.dataset.kind = 'create-jail';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'createJailModal';
  modal.innerHTML = `<h3>Create Jail</h3>`;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  modal.querySelector('h3').addEventListener('mousedown', e => dragModal(e, modal));
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

  const formWrap = document.createElement('form');
  formWrap.id = 'createJailForm';
  formWrap.style.display = 'flex';
  formWrap.style.flexDirection = 'column';
  formWrap.style.gap = '12px';
  modal.appendChild(formWrap);

  const row = (labelHtml, inputHtml, noteHtml='') => `
    <div class="form-row">
      <label>${labelHtml}</label>
      <div>${inputHtml}</div>
    </div>
    ${noteHtml ? `<div class="form-note">${noteHtml}</div>` : ''}
  `;

  const formHTML = `
    ${row(
      'Jail with Docker?',
      `
      <div class="segmented">
        <input type="radio" id="dockerYes" name="docker" value="yes"/>
        <label for="dockerYes">Yes</label>
        <input type="radio" id="dockerNo" name="docker" value="no"/>
        <label for="dockerNo">No</label>
      </div>
      `
    )}
    ${row('Jail Name', `<input type="text" id="jailName" required placeholder="Enter Jail Name"/>`)}
    ${row('Jail Installation Path', `<select id="jailInstallPath" required></select>`)}
    ${row('Distro', `<select id="distro" required></select>`)}
    ${row('Release', `<select id="release" required></select>`)}
    ${row(
      'Intel GPU',
      `
      <div class="segmented">
        <input type="radio" id="intelYes" name="intel" value="1"/>
        <label for="intelYes">Yes</label>
        <input type="radio" id="intelNo" name="intel" value="0" checked/>
        <label for="intelNo">No</label>
      </div>
      `
    )}
    ${row(
      'NVIDIA GPU',
      `
      <div class="segmented">
        <input type="radio" id="nvidiaYes" name="nvidia" value="1"/>
        <label for="nvidiaYes">Yes</label>
        <input type="radio" id="nvidiaNo" name="nvidia" value="0" checked/>
        <label for="nvidiaNo">No</label>
      </div>
      `
    )}
    ${row(
      'Macvlan Setup',
      `
      <div class="segmented">
        <input type="radio" id="macvlanYes" name="macvlan" value="yes"/>
        <label for="macvlanYes">Yes</label>
        <input type="radio" id="macvlanNo" name="macvlan" value="no" checked/>
        <label for="macvlanNo">No</label>
      </div>
      `,
      'Use if a static IP is desired.'
    )}
    ${row(
      'Bind drives?',
      `
      <div class="segmented">
        <input type="radio" id="bindYes" name="bind" value="yes"/>
        <label for="bindYes">Yes</label>
        <input type="radio" id="bindNo" name="bind" value="no" checked/>
        <label for="bindNo">No</label>
      </div>
      `
    )}
    ${row('Host Path', `<input type="text" id="hostPath" placeholder="/mnt/tank/data" disabled/>`)}
    ${row('Jail Path', `<input type="text" id="jailPath" placeholder="/data" disabled/>`)}
    <div class="topbar actions" style="justify-content:center;">
      <button type="submit" id="createSubmitBtn">Create Jail</button>
      <button type="button" class="close-button" id="closePopupBtn">Cancel</button>
    </div>
  `;
  formWrap.insertAdjacentHTML('beforeend', formHTML);

  document.getElementById('closePopupBtn').addEventListener('click', () => overlay.remove());

  // load dynamic data
  if (typeof loadDistros === 'function') loadDistros();
  populateJailInstallationPaths();

  // bind toggles
  const bindYes = document.getElementById('bindYes');
  const bindNo = document.getElementById('bindNo');
  const hostPath = document.getElementById('hostPath');
  const jailPath = document.getElementById('jailPath');
  function updateBindFields() {
    const on = bindYes.checked;
    hostPath.disabled = !on;
    jailPath.disabled = !on;
  }
  bindYes.addEventListener('change', updateBindFields);
  bindNo.addEventListener('change', updateBindFields);
  updateBindFields();

  formWrap.addEventListener('submit', async (e) => {
    e.preventDefault();

    const jailName     = document.getElementById('jailName').value.trim();
    const installPath  = document.getElementById('jailInstallPath').value.trim();
    const distroVal    = document.getElementById('distro').value.trim();
    const releaseVal   = document.getElementById('release').value.trim();
    const intelVal     = (document.getElementById('intelYes').checked ? 1 : 0);
    const nvidiaVal    = (document.getElementById('nvidiaYes').checked ? 1 : 0);
    const macvlanYes   = document.getElementById('macvlanYes').checked;
    const bindOn       = bindYes.checked;
    const hostVal      = hostPath.value.trim();
    const jailVal      = jailPath.value.trim();
    const dockerYesSel = document.getElementById('dockerYes').checked;

    if (!jailName) return alert('Please enter a jail name.');
    if (!installPath) return alert('Please pick an installation path.');

    const networkArg = macvlanYes ? `--network-macvlan=eno1` : ``;

    let command = '';
    if (dockerYesSel) {
      command = `cd ${installPath} && curl -L -O https://raw.githubusercontent.com/kosztyk/TrueNas-Scale-Jailmaker-GUI/main/config && ./jlmkr.py create --start --config ${installPath}config "${jailName}"`;
      if (bindOn && hostVal && jailVal) {
        command += ` --network-macvlan=eno1 --bind='${hostVal}:${jailVal}' --resolv-conf=bind-host --system-call-filter='add_key keyctl bpf'`;
      }
    } else {
      if (!distroVal || !releaseVal) return alert('Please select Distro and Release.');
      command = `cd ${installPath} && ./jlmkr.py create --start --distro=${distroVal} --release=${releaseVal} --startup=1 --seccomp=1 -gi=${intelVal} -gn=${nvidiaVal} "${jailName}" ${networkArg}`;
      if (bindOn && hostVal && jailVal) {
        command += ` --bind='${hostVal}:${jailVal}'`;
      }
      command += ` --system-call-filter='add_key keyctl bpf' --resolv-conf=bind-host`;
    }

    const actionId = (crypto?.randomUUID?.() || (Math.random().toString(36).slice(2) + Date.now().toString(36)));

    // Ensure log modal exists
    if (!ensure(window.openLogStreamModal, 'openLogStreamModal')) {
      alert('Could not open log window. Please refresh the page.');
      return;
    }
    const logModal = window.openLogStreamModal(`Create Jail: ${jailName}`, actionId);

    try {
      const username = localStorage.getItem('username');
      const response = await fetch('/api/runSSHCommandStream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, command, actionId })
      });
      const data = await response.json();
      if (!data.success) {
        alert(`Error starting creation:\n${data.message}`);
        logModal.close();
      } else {
        // Optionally close the form overlay immediately so only logs remain
        overlay.remove();
      }
    } catch (err) {
      alert(`Error starting creation:\n${err}`);
      logModal.close();
    }
  });
}

async function populateJailInstallationPaths() {
  const username = localStorage.getItem("username");
  if (!username) return;
  try {
    const res = await fetch(`/api/getUserDetails?username=${encodeURIComponent(username)}`);
    const data = await res.json();
    const selectEl  = document.getElementById("jailInstallPath");
    selectEl.innerHTML = "";
    if (!data.success) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No paths found";
      selectEl.appendChild(opt);
      return;
    }
    const userPaths = data.details.paths || [];
    if (!userPaths.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No paths found";
      selectEl.appendChild(opt);
      return;
    }
    userPaths.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      selectEl.appendChild(opt);
    });
  } catch (err) {
    console.error("Error fetching user details for jail paths:", err);
  }
}

// EXPOSE so manage.js buttons can call it
window.openCreateJailPopup = openCreateJailPopup;

