import { parseCADExport } from "./cad_parser.js";

document.addEventListener("DOMContentLoaded", () => {
  setupInteractiveScanner();
  setupDragAndDrop();
  
  const finishBtn = document.getElementById("btn-finish");
  if (finishBtn) {
    finishBtn.addEventListener("click", () => {
      browser.tabs.create({ url: browser.runtime.getURL("ui/dashboard/dashboard.html") });
    });
  }
});

function setupInteractiveScanner() {
  const btnScan = document.getElementById("btn-scan");
  const resultsDiv = document.getElementById("scan-results");
  const listEl = document.getElementById("detected-logins-list");
  const btnCommit = document.getElementById("btn-commit-logins");
  const btnSelectAll = document.getElementById("btn-select-all");
  const btnDeselectAll = document.getElementById("btn-deselect-all");

  btnScan.addEventListener("click", async () => {
    btnScan.disabled = true;
    btnScan.textContent = "Scanning Browser Storage...";
    
    const thirtyDaysFromNow = (Date.now() / 1000) + (30 * 24 * 60 * 60);
    const cookies = await browser.cookies.getAll({ storeId: "firefox-default" });
    
    const persistentDomains = new Set();
    for (const cookie of cookies) {
      if (cookie.expirationDate && cookie.expirationDate > thirtyDaysFromNow) {
        const domain = cookie.domain.startsWith(".") ? cookie.domain.substring(1) : cookie.domain;
        persistentDomains.add(domain);
      }
    }

    // Safely clear previous scan results
    listEl.replaceChildren();

    if (persistentDomains.size === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.style.color = "var(--text-muted)";
      emptyDiv.style.padding = "1rem";
      emptyDiv.textContent = "No persistent authentication cookies detected.";
      listEl.appendChild(emptyDiv);
      btnCommit.style.display = "none";
    } else {
      persistentDomains.forEach(domain => {
        const chip = document.createElement("label");
        chip.className = "domain-chip-item";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = domain;
        checkbox.checked = true;

        const span = document.createElement("span");
        span.textContent = domain;

        chip.appendChild(checkbox);
        chip.appendChild(span);
        listEl.appendChild(chip);
      });
      btnCommit.style.display = "inline-flex";
    }

    resultsDiv.style.display = "block";
    btnScan.disabled = false;
    btnScan.textContent = "✓ Scan Complete (Rescan)";
  });

  if (btnSelectAll) {
    btnSelectAll.addEventListener("click", () => {
      listEl.querySelectorAll("input[type=checkbox]").forEach(cb => { cb.checked = true; });
    });
  }

  if (btnDeselectAll) {
    btnDeselectAll.addEventListener("click", () => {
      listEl.querySelectorAll("input[type=checkbox]").forEach(cb => { cb.checked = false; });
    });
  }

  btnCommit.addEventListener("click", async () => {
    const checkboxes = listEl.querySelectorAll("input[type=checkbox]:checked");
    const data = await browser.storage.local.get("domainVaults");
    let domainVaults = data.domainVaults || {};
    
    if (Array.isArray(domainVaults)) {
      const existingMap = new Map(domainVaults.map(r => [r.domain, r.containerId]));
      checkboxes.forEach(cb => {
        existingMap.set(cb.value, "personal");
      });
      domainVaults = Array.from(existingMap.entries()).map(([domain, containerId]) => ({ domain, containerId }));
    } else {
      checkboxes.forEach(cb => {
        domainVaults[cb.value] = "personal"; 
      });
    }

    await browser.storage.local.set({ domainVaults });
    btnCommit.textContent = `✓ Committed ${checkboxes.length} Sites to Personal Vault!`;
    btnCommit.disabled = true;
  });
}

function setupDragAndDrop() {
  const dropzone = document.getElementById("cad-dropzone");
  const fileInput = document.getElementById("cad-file-input");
  const statusEl = document.getElementById("cad-status");

  dropzone.addEventListener("click", () => fileInput.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });

  function handleFile(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const result = parseCADExport(e.target.result);
      if (result.success) {
        const data = await browser.storage.local.get("domainVaults");
        let domainVaults = data.domainVaults || {};

        if (Array.isArray(domainVaults)) {
          const map = new Map(domainVaults.map(r => [r.domain, r.containerId]));
          for (const [d, c] of Object.entries(result.domainVaults)) {
            map.set(d, c);
          }
          domainVaults = Array.from(map.entries()).map(([domain, containerId]) => ({ domain, containerId }));
        } else {
          domainVaults = { ...domainVaults, ...result.domainVaults };
        }

        await browser.storage.local.set({ domainVaults });
        
        statusEl.style.color = "var(--accent-success)";
        statusEl.textContent = `✓ Successfully imported ${result.importedCount} expressions into Domain Vaults!`;
      } else {
        statusEl.style.color = "var(--danger)";
        statusEl.textContent = result.error;
      }
    };
    reader.readAsText(file);
  }
}