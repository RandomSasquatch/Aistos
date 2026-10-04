/**
 * Aistos Options Controller
 * Native Drag & Drop and debounced local storage writes.
 */

let vaultRules = []; // Stored as array to preserve priority order

document.addEventListener("DOMContentLoaded", async () => {
  await loadState();
  await loadContainerOptions();
  setupUI();
});

async function loadState() {
  // Convert legacy object map to ordered array if needed
  const data = await browser.storage.local.get("domainVaults");
  if (data.domainVaults && !Array.isArray(data.domainVaults)) {
    vaultRules = Object.entries(data.domainVaults).map(([domain, containerId]) => ({ domain, containerId }));
  } else if (Array.isArray(data.domainVaults)) {
    vaultRules = data.domainVaults;
  }
  renderList();
}

async function loadContainerOptions() {
  const select = document.getElementById("new-container");
  const containers = await browser.contextualIdentities.query({});
  // Only allow routing to permanent containers, hide Burners
  const permanent = containers.filter(c => !c.name.startsWith("AistosBurner"));
  
  for (const c of permanent) {
    const opt = document.createElement("option");
    opt.value = c.cookieStoreId;
    opt.textContent = c.name;
    select.appendChild(opt);
  }
}

// Memory-safe debounce to prevent UI thread blocking
let saveTimeout;
function debouncedSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    browser.storage.local.set({ domainVaults: vaultRules });
  }, 500);
}

function renderList() {
  const list = document.getElementById("rules-list");
  list.innerHTML = "";

  vaultRules.forEach((rule, index) => {
    const li = document.createElement("li");
    li.className = "sortable-item";
    li.draggable = true;
    li.dataset.index = index;
    
    li.innerHTML = `
      <span><strong>${rule.domain}</strong> &rarr; <small>${rule.containerId}</small></span>
      <button class="btn danger btn-remove" data-index="${index}">X</button>
    `;

    // Native Drag and Drop Listeners
    li.addEventListener("dragstart", handleDragStart);
    li.addEventListener("dragover", handleDragOver);
    li.addEventListener("drop", handleDrop);
    
    list.appendChild(li);
  });

  document.querySelectorAll(".btn-remove").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      vaultRules.splice(idx, 1);
      renderList();
      debouncedSave();
    });
  });
}

function setupUI() {
  document.getElementById("btn-add-rule").addEventListener("click", () => {
    const domainInput = document.getElementById("new-domain");
    const containerSelect = document.getElementById("new-container");
    
    const domain = domainInput.value.trim();
    if (domain.length < 3) return;

    // Unshift adds to the top of the priority list
    vaultRules.unshift({ domain, containerId: containerSelect.value });
    domainInput.value = "";
    
    renderList();
    debouncedSave();
  });
}

/* Native HTML5 Drag & Drop Logistics */
let draggedIndex = null;

function handleDragStart(e) {
  draggedIndex = parseInt(e.target.dataset.index, 10);
  e.dataTransfer.effectAllowed = "move";
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}

function handleDrop(e) {
  e.preventDefault();
  const targetLi = e.target.closest("li.sortable-item");
  if (!targetLi || draggedIndex === null) return;

  const targetIndex = parseInt(targetLi.dataset.index, 10);
  if (draggedIndex === targetIndex) return;

  // Reorder array
  const [movedItem] = vaultRules.splice(draggedIndex, 1);
  vaultRules.splice(targetIndex, 0, movedItem);
  
  draggedIndex = null;
  renderList();
  debouncedSave();
}