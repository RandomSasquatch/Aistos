import { parseCADExport } from "./cad_parser.js";

document.addEventListener("DOMContentLoaded", () => {
  setupInteractiveScanner();
  setupDragAndDrop();
  
  document.getElementById("btn-finish").addEventListener("click", () => {
    browser.tabs.create({ url: browser.runtime.getURL("ui/options/options.html") });
    window.close();
  });
});

function setupInteractiveScanner() {
  const btnScan = document.getElementById("btn-scan");
  const resultsDiv = document.getElementById("scan-results");
  const listEl = document.getElementById("detected-logins-list");
  const btnCommit = document.getElementById("btn-commit-logins");

  btnScan.addEventListener("click", async () => {
    btnScan.disabled = true;
    btnScan.textContent = "Scanning...";
    
    // Scan default container for cookies expiring > 30 days from now (typically auth tokens)
    const thirtyDaysFromNow = (Date.now() / 1000) + (30 * 24 * 60 * 60);
    const cookies = await browser.cookies.getAll({ storeId: "firefox-default" });
    
    const persistentDomains = new Set();
    for (const cookie of cookies) {
      if (cookie.expirationDate && cookie.expirationDate > thirtyDaysFromNow) {
        let domain = cookie.domain.startsWith(".") ? cookie.domain.substring(1) : cookie.domain;
        persistentDomains.add(domain);
      }
    }

    listEl.innerHTML = "";
    if (persistentDomains.size === 0) {
      listEl.innerHTML = "<li>No persistent logins detected.</li>";
      btnCommit.style.display = "none";
    } else {
      persistentDomains.forEach(domain => {
        const li = document.createElement("li");
        li.innerHTML = `<label><input type="checkbox" value="${domain}" checked> ${domain}</label>`;
        listEl.appendChild(li);
      });
      btnCommit.style.display = "block";
    }

    resultsDiv.style.display = "block";
    btnScan.textContent = "Scan Complete";
  });

  btnCommit.addEventListener("click", async () => {
    const checkboxes = listEl.querySelectorAll("input[type=checkbox]:checked");
    const { domainVaults = {} } = await browser.storage.local.get("domainVaults");
    
    checkboxes.forEach(cb => {
      domainVaults[cb.value] = "firefox-default"; // Map to default persistent vault
    });

    await browser.storage.local.set({ domainVaults });
    btnCommit.textContent = "Committed!";
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
        const { domainVaults = {} } = await browser.storage.local.get("domainVaults");
        const mergedVaults = { ...domainVaults, ...result.domainVaults };
        await browser.storage.local.set({ domainVaults: mergedVaults });
        
        statusEl.style.color = "green";
        statusEl.textContent = `Successfully imported ${result.importedCount} expressions!`;
      } else {
        statusEl.style.color = "red";
        statusEl.textContent = result.error;
      }
    };
    reader.readAsText(file);
  }
}