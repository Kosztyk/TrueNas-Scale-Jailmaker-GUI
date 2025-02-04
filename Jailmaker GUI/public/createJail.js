function openCreateJailPopup() {
    // Remove any existing popup
    const existingPopup = document.getElementById("createJailPopup");
    if (existingPopup) existingPopup.remove();

    // Create the overlay background
    const overlay = document.createElement("div");
    overlay.id = "createJailOverlay";
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    overlay.style.zIndex = "9999";

    // Create the popup container
    const popup = document.createElement("div");
    popup.id = "createJailPopup";
    popup.style.position = "absolute";
    popup.style.top = "10%";
    popup.style.left = "30%";
    popup.style.width = "60%";
    popup.style.height = "80%";
    popup.style.backgroundColor = "rgba(255, 255, 255, 0.8)";
    popup.style.borderRadius = "8px";
    popup.style.boxShadow = "0 0 10px rgba(0, 0, 0, 0.3)";
    popup.style.display = "flex";
    popup.style.flexDirection = "column";
    popup.style.padding = "10px";
    popup.style.resize = "both";
    popup.style.overflow = "auto";

    // Add title to the popup
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

    // Insert the form HTML without overwriting the title.
    // Note: The text inputs and select fields use "required" so that they must be filled.
    // The checkboxes in each group do not use required; custom validation will enforce that exactly one is selected.
    const formHTML = `
        <form id="createJailForm">
            <!-- Docker selection (checkbox group validation will enforce one selection) -->
            <div style="display: flex; align-items: center; margin-bottom: 10px;">
                <label class="bold-label" style="min-width: 180px;">Jail with Docker or without Docker:</label>
                <div class="checkbox-group" style="display: flex; align-items: center; gap: 10px; margin-left: 20px;">
                    <label for="jailWithDockerYes">Yes</label><input type="checkbox" id="jailWithDockerYes">
                    <label for="jailWithDockerNo">No</label><input type="checkbox" id="jailWithDockerNo">
                </div>
            </div>
            <!-- Jail Name (required) -->
            <div style="display: flex; align-items: center; margin-bottom: 10px;">
                <label for="jailName" style="min-width: 180px;">Jail Name:</label>
                <input type="text" id="jailName" placeholder="Enter Jail Name" required style="flex: 1;">
            </div>
            <!-- Distro (required) -->
            <div style="display: flex; align-items: center; margin-bottom: 10px;">
                <label for="distro" style="min-width: 180px;">Distro:</label>
                <select id="distro" style="flex: 1; min-width:200px;" required></select>
            </div>
            <!-- Release (required) -->
            <div style="display: flex; align-items: center; margin-bottom: 10px;">
                <label for="release" style="min-width: 180px;">Release:</label>
                <select id="release" style="flex: 1; min-width:200px;" required></select>
            </div>
            <!-- Intel GPU (checkbox group validation will enforce one selection) -->
            <div style="display: flex; align-items: center; margin-bottom: 10px;">
                <label class="bold-label" style="min-width: 180px;" for="intelGpuYes">Intel GPU:</label>
                <div class="checkbox-group" style="display: flex; align-items: center; gap: 10px; margin-left: 20px;">
                    <label for="intelGpuYes">Yes</label><input type="checkbox" id="intelGpuYes">
                    <label for="intelGpuNo">No</label><input type="checkbox" id="intelGpuNo">
                </div>
            </div>
            <!-- Nvidia GPU (checkbox group validation will enforce one selection) -->
            <div style="display: flex; align-items: center; margin-bottom: 10px;">
                <label class="bold-label" style="min-width: 180px;" for="nvidiaGpuYes">Nvidia GPU:</label>
                <div class="checkbox-group" style="display: flex; align-items: center; gap: 10px; margin-left: 20px;">
                    <label for="nvidiaGpuYes">Yes</label><input type="checkbox" id="nvidiaGpuYes">
                    <label for="nvidiaGpuNo">No</label><input type="checkbox" id="nvidiaGpuNo">
                </div>
            </div>
            <!-- Macvlan Setup and Note (checkbox group validation will enforce one selection) -->
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
            <!-- Bind drives to your Jail (checkbox group validation will enforce one selection) -->
            <div style="display: flex; align-items: center; margin-bottom: 10px;">
                <label class="bold-label" style="min-width: 180px;">Bind drives to your Jail:</label>
                <div class="checkbox-group" style="display: flex; align-items: center; gap: 10px; margin-left: 20px;">
                    <label for="bindDrivesYes">Yes</label><input type="checkbox" id="bindDrivesYes">
                    <label for="bindDrivesNo">No</label><input type="checkbox" id="bindDrivesNo">
                </div>
            </div>
            <!-- Host Path (not required) -->
            <div style="display: flex; align-items: center; margin-bottom: 10px;">
                <label for="hostPath" style="min-width: 180px;">Host Path:</label>
                <input type="text" id="hostPath" placeholder="Enter Host Path" style="flex: 1; min-width:400px;">
            </div>
            <!-- Jail Path (not required) -->
            <div style="display: flex; align-items: center; margin-bottom: 10px;">
                <label for="jailPath" style="min-width: 180px;">Jail Path:</label>
                <input type="text" id="jailPath" placeholder="Enter Jail Path" style="flex: 1; min-width:400px;">
            </div>
            <!-- Buttons -->
            <div class="popup-buttons" style="display: flex; justify-content: center; gap: 10px;">
                <button type="submit">Create Jail</button>
                <button type="button" id="closePopupBtn">Cancel</button>
            </div>
        </form>
    `;
    popup.insertAdjacentHTML("beforeend", formHTML);

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    // Close popup event
    document.getElementById("closePopupBtn").addEventListener("click", () => {
        overlay.remove();
    });

    // Load distros and releases
    loadDistros();

    // Setup checkbox mutual exclusions and additional logic
    setupCheckboxLogic();
    setupAdditionalLogic();

    // Reverse the logic for "Jail with Docker":
    // When "Yes" is selected, disable the extra fields.
    // When "No" is selected, enable the extra fields.
    document.getElementById("jailWithDockerYes").addEventListener("change", () => toggleFields(true));
    document.getElementById("jailWithDockerNo").addEventListener("change", () => toggleFields(false));

    // Attach form submission validation
    document.getElementById("createJailForm").addEventListener("submit", function(e) {
        let errorMessages = [];

        // Helper function for XOR check: returns true if exactly one is checked.
        function isOneChecked(id1, id2) {
            const a = document.getElementById(id1).checked;
            const b = document.getElementById(id2).checked;
            return (a || b) && !(a && b);
        }

        if (!isOneChecked("jailWithDockerYes", "jailWithDockerNo")) {
            errorMessages.push("Please select either Yes or No for 'Jail with Docker or without Docker'.");
        }
        if (!isOneChecked("intelGpuYes", "intelGpuNo")) {
            errorMessages.push("Please select either Yes or No for 'Intel GPU'.");
        }
        if (!isOneChecked("nvidiaGpuYes", "nvidiaGpuNo")) {
            errorMessages.push("Please select either Yes or No for 'Nvidia GPU'.");
        }
        if (!isOneChecked("macvlanYes", "macvlanNo")) {
            errorMessages.push("Please select either Yes or No for 'Macvlan Setup'.");
        }
        if (!isOneChecked("bindDrivesYes", "bindDrivesNo")) {
            errorMessages.push("Please select either Yes or No for 'Bind drives to your Jail'.");
        }

        if (errorMessages.length > 0) {
            e.preventDefault();
            alert(errorMessages.join("\n"));
        }
    });

    // --- Make the popup draggable using the title as the handle ---
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
            popup.style.top = `${popup.offsetTop - pos2}px`;
            popup.style.left = `${popup.offsetLeft - pos1}px`;
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }
}

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

    // Checkbox mutual exclusions for each group
    toggleCheckbox([
        document.getElementById("jailWithDockerYes"),
        document.getElementById("jailWithDockerNo")
    ]);
    toggleCheckbox([
        document.getElementById("intelGpuYes"),
        document.getElementById("intelGpuNo")
    ]);
    toggleCheckbox([
        document.getElementById("nvidiaGpuYes"),
        document.getElementById("nvidiaGpuNo")
    ]);
    toggleCheckbox([
        document.getElementById("macvlanYes"),
        document.getElementById("macvlanNo")
    ]);
    toggleCheckbox([
        document.getElementById("bindDrivesYes"),
        document.getElementById("bindDrivesNo")
    ]);
}

function setupAdditionalLogic() {
    // Get references to the Bind drives checkboxes and Host/Jail fields.
    const bindYes = document.getElementById("bindDrivesYes");
    const bindNo = document.getElementById("bindDrivesNo");
    const hostPath = document.getElementById("hostPath");
    const jailPath = document.getElementById("jailPath");

    // Disable Host Path and Jail Path by default.
    hostPath.disabled = true;
    jailPath.disabled = true;

    // When Bind drives Yes is checked, enable the fields; when Bind drives No is checked, disable them.
    bindYes.addEventListener("change", function() {
        if (this.checked) {
            hostPath.disabled = false;
            jailPath.disabled = false;
        }
    });
    bindNo.addEventListener("change", function() {
        if (this.checked) {
            hostPath.disabled = true;
            jailPath.disabled = true;
        }
    });
}

function toggleFields(disable) {
    const fields = [
        "distro", "release",
        "intelGpuYes", "intelGpuNo",
        "nvidiaGpuYes", "nvidiaGpuNo",
        "macvlanYes", "macvlanNo"
    ];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = disable;
    });
}

window.openCreateJailPopup = openCreateJailPopup;

