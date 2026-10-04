/**
 * Aistos Options Controller
 * Native Drag & Drop and debounced local storage writes.
 * 100% innerHTML-free for Mozilla addons-linter compliance.
 */

let vaultRules = [];

document.addEventListener("DOMContentLoaded", async () => {
  await loadState();
  await loadContainerOptions();
  setupUI();
});

async function loadState() {
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
  const permanent = containers.filter(c => !c.name.startsWith("AistosBurner"));
  
  for (const c of permanent) {
    const opt = document.createElement("option");
    opt.value = c.cookieStoreId;
    opt.textContent = c.name;
    select.appendChild(opt);
  }
}

let saveTimeout;
function debouncedSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    browser.storage.local.set({ domainVaults: vaultRules });
  }, 500);
}

function renderList() {
  const list = document.getElementById("rules-list");
  // Safely clear the list without using innerHTML
  list.replaceChildren(); 

  vaultRules.forEach((rule, index) => {
    const li = document.createElement("li");
    li.className = "sortable-item";
    li.draggable = true;
    li.dataset.index = index;
    
    // Construct text nodes safely
    const span = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = rule.domain;
    
    const small = document.createElement("small");
    small.textContent = rule.containerId;
    
    span.appendChild(strong);
    span.appendChild(document.createTextNode(" \u2192 ")); // Safe arrow rendering
    span.appendChild(small);

    // Construct button safely
    const btn = document.createElement("button");
    btn.className = "btn danger btn-remove";
    btn.dataset.index = index;
    btn.textContent = "X";
    btn.setAttribute("aria-label", `Remove rule for ${rule.domain}`);

    li.appendChild(span);
    li.appendChild(btn);

    // Bind Drag and Drop Listeners
    li.addEventListener("dragstart", handleDragStart);
    li.addEventListener("dragover", handleDragOver);
    li.addEventListener("drop", handleDrop);
    
    list.appendChild(li);
  });

  // Rebind remove buttons natively
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

  const [movedItem] = vaultRules.splice(draggedIndex, 1);
  vaultRules.splice(targetIndex, 0, movedItem);
  
  draggedIndex = null;
  renderList();
  debouncedSave();
}