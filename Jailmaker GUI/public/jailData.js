async function loadDistros() {
    try {
        const response = await fetch("/distros");
        const distros = await response.json();

        const distroSelect = document.getElementById("distro");
        distroSelect.innerHTML = '<option value="">Select Distro</option>';

        distros.forEach(distro => {
            const option = document.createElement("option");
            option.value = distro;
            option.textContent = distro;
            distroSelect.appendChild(option);
        });

        distroSelect.addEventListener("change", loadReleases);
    } catch (error) {
        console.error("Error loading distros:", error);
    }
}

async function loadReleases() {
    const selectedDistro = document.getElementById("distro").value;
    if (!selectedDistro) return;

    try {
        const response = await fetch(`/releases/${encodeURIComponent(selectedDistro)}`);
        const releases = await response.json();

        const releaseSelect = document.getElementById("release");
        releaseSelect.innerHTML = '<option value="">Select Release</option>';

        releases.forEach(release => {
            const option = document.createElement("option");
            option.value = release;
            option.textContent = release;
            releaseSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading releases:", error);
    }
}

