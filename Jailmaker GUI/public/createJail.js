// createJail.js

function openCreateJailPopup() {
    // Remove any existing popup
    const existingPopup = document.getElementById("createJailPopup");
    if (existingPopup) existingPopup.remove();

    // Create the overlay
    const overlay = document.createElement("div");
    overlay.id = "createJailOverlay";
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    overlay.style.zIndex = "9999";

    // Center the popup with flex
    overlay.style.display = "flex";
    overlay.style.justifyContent = "center";
    overlay.style.alignItems = "center";

    // Create the popup container
    const popup = document.createElement("div");
    popup.id = "createJailPopup";
    
    // Remove the old absolute top/left so it starts truly centered
    // Let flex handle initial centering. 
    // We'll only switch to absolute if the user starts dragging.
    popup.style.width = "80%";
    popup.style.height = "80%";
    popup.style.maxWidth = "1200px";  // optional limit
    popup.style.maxHeight = "800px";  // optional limit

    // Remaining styling
    popup.style.backgroundColor = "rgba(255, 255, 255, 0.8)";
    popup.style.borderRadius = "8px";
    popup.style.boxShadow = "0 0 10px rgba(0, 0, 0, 0.3)";
    popup.style.display = "flex";
    popup.style.flexDirection = "column";
    popup.style.padding = "10px";
    popup.style.resize = "both";
    popup.style.overflow = "auto";

    // Title
    const title = document.createElement("h3");
    title.textContent = "Create Jail";
    title.style.margin = "0 0 20px 0";
    title.style.padding = "10px";
    title.style.cursor = "move";
    title.style.textAlign = "center";
    title.style.fontWeight = "bold";
    title.style.backgroundColor = "#f3f4f6";
    title.style.borderBottom = "1px solid #ccc";
    popup.appendChild(title);

    // Insert the form HTML (including "Jail Installation Path" and a spinner)
    const formHTML = `
      <form id="createJailForm">
          <!-- Docker selection -->
          <div style="display: flex; align-items: center; margin-bottom: 10px;">
              <label class="bold-label" style="min-width: 180px;">Jail with Docker or without Docker:</label>
              <div class="checkbox-group" style="display: flex; align-items: center; gap: 10px; margin-left: 20px;">
                  <label for="jailWithDockerYes">Yes</label><input type="checkbox" id="jailWithDockerYes">
                  <label for="jailWithDockerNo">No</label><input type="checkbox" id="jailWithDockerNo">
              </div>
          </div>
          <!-- Install Jail from custom config file -->
          <div style="display: flex; align-items: center; margin-bottom: 10px;">
               <label class="bold-label" style="min-width: 180px;">Install Jail from custom config file:</label>
               <div style="display: flex; align-items: center; gap: 10px; margin-left: 20px;">
                   <input type="checkbox" id="customConfigCheck" 
                          style="transform: scale(1.1); transform-origin: left center; margin-left: 5px;">
               </div>
          </div>
          <!-- Config file name + note -->
          <div style="display: flex; align-items: center; margin-bottom: 5px;">
              <label for="configFileName" style="min-width: 180px;">Config file name:</label>
              <input type="text" id="configFileName" placeholder="Enter config file name" style="flex: 1;">
          </div>
          <p class="note" id="configFileNote" style="margin: 0 0 10px 200px; font-size: 12px; color: gray;">
              Manually place the config file on same path where jail will be installed.
          </p> 
          <!-- Jail Name -->
          <div style="display: flex; align-items: center; margin-bottom: 10px;">
              <label for="jailName" style="min-width: 180px;">Jail Name:</label>
              <input type="text" id="jailName" placeholder="Enter Jail Name" required style="flex: 1;">
          </div>
          <!-- Jail Installation Path -->
          <div style="display: flex; align-items: center; margin-bottom: 10px;">
              <label for="jailInstallPath" style="min-width: 180px;">Jail Installation Path:</label>
              <select id="jailInstallPath" style="flex: 1; min-width:200px;" required></select>
          </div>
          <!-- Distro -->
          <div style="display: flex; align-items: center; margin-bottom: 10px;">
              <label for="distro" style="min-width: 180px;">Distro:</label>
              <select id="distro" style="flex: 1; min-width:200px;" required></select>
          </div>
          <!-- Release -->
          <div style="display: flex; align-items: center; margin-bottom: 10px;">
              <label for="release" style="min-width: 180px;">Release:</label>
              <select id="release" style="flex: 1; min-width:200px;" required></select>
          </div>
          <!-- Intel GPU -->
          <div style="display: flex; align-items: center; margin-bottom: 10px;">
              <label class="bold-label" style="min-width: 180px;" for="intelGpuYes">Intel GPU:</label>
              <div class="checkbox-group" style="display: flex; align-items: center; gap: 10px; margin-left: 20px;">
                  <label for="intelGpuYes">Yes</label><input type="checkbox" id="intelGpuYes">
                  <label for="intelGpuNo">No</label><input type="checkbox" id="intelGpuNo">
              </div>
          </div>
          <!-- Nvidia GPU -->
          <div style="display: flex; align-items: center; margin-bottom: 10px;">
              <label class="bold-label" style="min-width: 180px;" for="nvidiaGpuYes">Nvidia GPU:</label>
              <div class="checkbox-group" style="display: flex; align-items: center; gap: 10px; margin-left: 20px;">
                  <label for="nvidiaGpuYes">Yes</label><input type="checkbox" id="nvidiaGpuYes">
                  <label for="nvidiaGpuNo">No</label><input type="checkbox" id="nvidiaGpuNo">
              </div>
          </div>
          <!-- Macvlan Setup and Note -->
          <div style="margin-bottom: 10px;">
              <div style="display: flex; align-items: center; margin-left: 40px;">
                  <label class="bold-label" style="min-width: 180px;" for="macvlanYes">Macvlan Setup:</label>
                  <div class="checkbox-group" style="display: flex; align-items: center; gap: 10px; margin-left: 20px;">
                      <label for="macvlanYes">Yes</label><input type="checkbox" id="macvlanYes">
                      <label for="macvlanNo">No</label><input type="checkbox" id="macvlanNo">
                  </div>
              </div>
              <p class="note" style="margin: 5px 0 10px 200px;">To be used if a static IP is wanted.</p>
          </div>
          <!-- Bind drives -->
          <div style="display: flex; align-items: center; margin-bottom: 10px;">
              <label class="bold-label" style="min-width: 180px;">Bind drives to your Jail:</label>
              <div class="checkbox-group" style="display: flex; align-items: center; gap: 10px; margin-left: 20px;">
                  <label for="bindDrivesYes">Yes</label><input type="checkbox" id="bindDrivesYes">
                  <label for="bindDrivesNo">No</label><input type="checkbox" id="bindDrivesNo">
              </div>
          </div>
          <!-- Host Path -->
          <div style="display: flex; align-items: center; margin-bottom: 10px;">
              <label for="hostPath" style="min-width: 180px;">Host Path:</label>
              <input type="text" id="hostPath" placeholder="Enter Host Path" style="flex: 1; min-width:400px;">
          </div>
          <!-- Jail Path -->
          <div style="display: flex; align-items: center; margin-bottom: 10px;">
              <label for="jailPath" style="min-width: 180px;">Jail Path:</label>
              <input type="text" id="jailPath" placeholder="Enter Jail Path" style="flex: 1; min-width:400px;">
          </div>

          <!-- Buttons -->
          <div class="popup-buttons" style="display: flex; justify-content: center; gap: 10px;">
              <button type="submit" id="createSubmitBtn">Create Jail</button>
              <button type="button" id="closePopupBtn">Cancel</button>
          </div>

          <!-- Spinner or "please wait" message, hidden by default -->
          <div id="creatingSpinner" style="display: none; margin-top: 10px; color: blue; font-weight: bold;">
            Please wait, your jail is being created...
          </div>
      </form>
    `;
    popup.insertAdjacentHTML("beforeend", formHTML);

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    // Close on "Cancel"
    document.getElementById("closePopupBtn").addEventListener("click", () => {
        overlay.remove();
    });

    // Function: isOneChecked
    function isOneChecked(idYes, idNo) {
        const a = document.getElementById(idYes).checked;
        const b = document.getElementById(idNo).checked;
        return (a || b) && !(a && b);
    }

    // 1. Load distros
    loadDistros();

    // 2. Setup checkboxes
    setupCheckboxLogic();

    // 3. Additional logic
    setupAdditionalLogic();

    // 4. Custom config logic
    setupCustomConfigLogic();

    // 5. Reverse logic for "Jail with Docker"
    document.getElementById("jailWithDockerYes").addEventListener("change", () => toggleFields(true));
    document.getElementById("jailWithDockerNo").addEventListener("change", () => toggleFields(false));

    // 6. Populate "Jail Installation Path" from DB
    populateJailInstallationPaths();

    // 7. On form submit => ephemeral SSH
    const form = document.getElementById("createJailForm");
    form.addEventListener("submit", async function(e) {
        e.preventDefault();

        // Basic validation
        const dockerYes  = document.getElementById("jailWithDockerYes").checked;
        const dockerNo   = document.getElementById("jailWithDockerNo").checked;
        const bindYes    = document.getElementById("bindDrivesYes").checked;
        const bindNo     = document.getElementById("bindDrivesNo").checked;
        const customConfigChecked = document.getElementById("customConfigCheck").checked;
        const configFileNameVal   = document.getElementById("configFileName").value.trim();

        let errorMessages = [];

        // Only require Docker or Bind if NOT using custom config
        if (!customConfigChecked) {
            if (!isOneChecked("jailWithDockerYes", "jailWithDockerNo")) {
                errorMessages.push("Please select either Yes or No for 'Jail with Docker'.");
            }
            if (!isOneChecked("bindDrivesYes", "bindDrivesNo")) {
                errorMessages.push("Please select either Yes or No for 'Bind drives to your Jail'.");
            }
        }

        // If custom config is checked => require configFileName
        if (customConfigChecked && !configFileNameVal) {
            errorMessages.push("Please provide a config file name if 'Install from custom config file' is selected.");
        }

        if (errorMessages.length > 0) {
            alert(errorMessages.join("\n"));
            return;
        }

        // Gather form data
        const jailName     = document.getElementById("jailName").value.trim();
        const installPath  = document.getElementById("jailInstallPath").value.trim();
        const distro       = document.getElementById("distro").value.trim();
        const release      = document.getElementById("release").value.trim();
        const hostPathVal  = document.getElementById("hostPath").value.trim();
        const jailPathVal  = document.getElementById("jailPath").value.trim();

        // Intel GPU => -gi=1 or 0
        const intelGpuYes = document.getElementById("intelGpuYes").checked;
        const giValue = intelGpuYes ? 1 : 0;

        // Nvidia GPU => -gn=1 or 0
        const nvidiaGpuYes = document.getElementById("nvidiaGpuYes").checked;
        const gnValue = nvidiaGpuYes ? 1 : 0;

        // Macvlan => yes => --network-macvlan=eno1; no => --network-bridge=br1
        const macvlanYes = document.getElementById("macvlanYes").checked;
        const networkArg = macvlanYes ? `--network-macvlan=eno1` : ``;

        // Build ephemeral SSH command
        let command = "";

        // CASE 1: If using custom config
        if (customConfigChecked) {
            // e.g. cd <installPath> && ./jlmkr.py create --start --config <installPath>/<configFileName> "jailName"
            command = `cd ${installPath} && ./jlmkr.py create --start --config ${installPath}${configFileNameVal} "${jailName}"`;

        } else {
            // Not using custom config => check if Docker=Yes or No
            if (dockerYes) {
                // Docker = YES => old logic with a downloaded config
                command = `cd ${installPath} && curl -L -O https://raw.githubusercontent.com/kosztyk/TrueNas-Scale-Jailmaker-GUI/main/config `
                        + `&& ./jlmkr.py create --start --config ${installPath}config "${jailName}"`;

                if (bindYes && hostPathVal && jailPathVal) {
                    command += ` --network-macvlan=eno1 --bind='${hostPathVal}:${jailPathVal}' --resolv-conf=bind-host --system-call-filter='add_key keyctl bpf'`;
                }

            } else {
                // Docker = NO => standard create command with distro, release, etc.
                // e.g.: cd <installPath> && ./jlmkr.py create --start --distro=<d> --release=<r> ...
                command = `cd ${installPath} && ./jlmkr.py create --start `
                        + `--distro=${distro} --release=${release} `
                        + `--startup=1 --seccomp=1 -gi=${giValue} -gn=${gnValue} `
                        + `"${jailName}" `
                        + networkArg;  

                // If Bind=Yes => add
                if (bindYes && hostPathVal && jailPathVal) {
                    command += ` --bind='${hostPathVal}:${jailPathVal}'`;
                }

                command += ` --system-call-filter='add_key keyctl bpf' --resolv-conf=bind-host`;
            }
        }

        // Now do ephemeral SSH
        const submitBtn   = document.getElementById("createSubmitBtn");
        const cancelBtn   = document.getElementById("closePopupBtn");
        const spinnerDiv  = document.getElementById("creatingSpinner");

        // Disable buttons, show spinner
        submitBtn.disabled = true;
        cancelBtn.disabled = true;
        spinnerDiv.style.display = "block";

        try {
            const username = localStorage.getItem("username");
            const body = { username, command };
            const response = await fetch("/api/runSSHCommand", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });

            const data = await response.json();
            if (data.success) {
                alert(`Jail creation successful!\n\nOutput:\n${data.output}`);
                overlay.remove(); // close popup

                // ADD: refresh the sandbox listing
                if (window.refreshSandboxes) {
                  window.refreshSandboxes();
                }

            } else {
                alert(`Error creating jail:\n${data.message}`);
                submitBtn.disabled = false;
                cancelBtn.disabled = false;
                spinnerDiv.style.display = "none";
            }
        } catch (err) {
            alert(`Error creating jail:\n${err}`);
            submitBtn.disabled = false;
            cancelBtn.disabled = false;
            spinnerDiv.style.display = "none";
        }
    });

    // Draggable logic
    title.addEventListener("mousedown", dragMouseDown);
    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        let pos3 = e.clientX;
        let pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            const pos1 = pos3 - e.clientX;
            const pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            // The first time user drags, set the popup to absolute
            popup.style.position = "absolute";
            // Adjust top/left by how far the mouse has moved
            popup.style.top = (popup.offsetTop - pos2) + "px";
            popup.style.left = (popup.offsetLeft - pos1) + "px";
        }
        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }
}

// Load user paths => fill #jailInstallPath
async function populateJailInstallationPaths() {
    const username = localStorage.getItem("username"); 
    if (!username) {
      console.error("No username found in localStorage. Cannot fetch user details.");
      return;
    }

    try {
        const res = await fetch(`/api/getUserDetails?username=${encodeURIComponent(username)}`);
        const data = await res.json();
        if (!data.success) {
            console.error("Failed to get user details for jail paths:", data.message);
            return;
        }

        const userPaths = data.details.paths || [];
        const selectEl  = document.getElementById("jailInstallPath");
        selectEl.innerHTML = "";

        if (userPaths.length === 0) {
            const opt = document.createElement("option");
            opt.value = "";
            opt.textContent = "No paths found";
            selectEl.appendChild(opt);
            return;
        }

        userPaths.forEach((pathVal) => {
            const opt = document.createElement("option");
            opt.value = pathVal;
            opt.textContent = pathVal;
            selectEl.appendChild(opt);
        });
    } catch (err) {
        console.error("Error fetching user details for jail paths:", err);
    }
}

// Setup pairs of yes/no checkboxes to be mutually exclusive
function setupCheckboxLogic() {
    function toggleCheckbox(group) {
        group.forEach((checkbox) => {
            checkbox.addEventListener("change", function() {
                if (this.checked) {
                    group.forEach((other) => {
                        if (other !== this) other.checked = false;
                    });
                }
            });
        });
    }
    toggleCheckbox([document.getElementById("jailWithDockerYes"), document.getElementById("jailWithDockerNo")]);
    toggleCheckbox([document.getElementById("intelGpuYes"),      document.getElementById("intelGpuNo")]);
    toggleCheckbox([document.getElementById("nvidiaGpuYes"),     document.getElementById("nvidiaGpuNo")]);
    toggleCheckbox([document.getElementById("macvlanYes"),       document.getElementById("macvlanNo")]);
    toggleCheckbox([document.getElementById("bindDrivesYes"),    document.getElementById("bindDrivesNo")]);
}

// Enable/disable host/jail path fields if "Bind drives" = yes/no
function setupAdditionalLogic() {
    const bindYes = document.getElementById("bindDrivesYes");
    const bindNo  = document.getElementById("bindDrivesNo");
    const hostPath = document.getElementById("hostPath");
    const jailPath = document.getElementById("jailPath");

    hostPath.disabled = true;
    jailPath.disabled = true;

    bindYes.addEventListener("change", () => {
        if (bindYes.checked) {
            hostPath.disabled = false;
            jailPath.disabled = false;
        }
    });
    bindNo.addEventListener("change", () => {
        if (bindNo.checked) {
            hostPath.disabled = true;
            jailPath.disabled = true;
        }
    });
}

// If "Docker"=Yes => disable certain fields, else enable them
function toggleFields(disable) {
    const fields = [
      "distro", "release", 
      "intelGpuYes", "intelGpuNo", 
      "nvidiaGpuYes", "nvidiaGpuNo", 
      "macvlanYes",  "macvlanNo"
    ];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = disable;
    });
}

// Setup logic for "Install Jail from custom config file"
function setupCustomConfigLogic() {
    const customConfigCheckbox = document.getElementById("customConfigCheck");
    const configFileNameInput  = document.getElementById("configFileName");
    const dockerYes = document.getElementById("jailWithDockerYes");
    const dockerNo  = document.getElementById("jailWithDockerNo");

    function updateCustomConfigFields() {
        // If Docker is selected => disable custom config
        const dockerSelected = (dockerYes.checked || dockerNo.checked);
        if (dockerSelected) {
            customConfigCheckbox.checked = false;
            customConfigCheckbox.disabled = true;
            configFileNameInput.value = "";
            configFileNameInput.disabled = true;
        } else {
            // If Docker not chosen => allow custom config
            customConfigCheckbox.disabled = false;
        }
    }

    function updateFieldsForCustomConfig() {
        const customChecked = customConfigCheckbox.checked;

        // Disable the Docker checkboxes if custom config is checked
        dockerYes.disabled = customChecked;
        dockerNo.disabled  = customChecked;

        // Also disable distro/release, GPU, Macvlan, Bind, Host/Jail path
        const fieldsToDisable = [
            "distro", "release",
            "intelGpuYes", "intelGpuNo",
            "nvidiaGpuYes", "nvidiaGpuNo",
            "macvlanYes",  "macvlanNo",
            "bindDrivesYes", "bindDrivesNo",
            "hostPath", "jailPath"
        ];
        fieldsToDisable.forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.disabled = customChecked;
        });

        // Enable configFileName only if customConfig is checked
        configFileNameInput.disabled = !customChecked;
    }

    // Listen for changes
    dockerYes.addEventListener("change", updateCustomConfigFields);
    dockerNo.addEventListener("change",  updateCustomConfigFields);
    customConfigCheckbox.addEventListener("change", updateFieldsForCustomConfig);

    // Initialize states
    updateCustomConfigFields();
    updateFieldsForCustomConfig();
}

// Expose the function globally
window.openCreateJailPopup = openCreateJailPopup;

