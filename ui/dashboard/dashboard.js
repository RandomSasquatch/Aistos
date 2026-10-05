/**
 * Aistos Dashboard Controller
 * Handles Panic Button execution and Domain Vault management.
 * 100% innerHTML-free for Mozilla addons-linter compliance.
 */
document.addEventListener("DOMContentLoaded", async () => {
  const panicBtn = document.getElementById("panic-btn");
  const panicStatus = document.getElementById("panic-status");
  const vaultDomainInput = document.getElementById("vault-domain");
  const vaultSelect = document.getElementById("vault-container-select");
  const addVaultBtn = document.getElementById("add-vault-btn");
  const rulesList = document.getElementById("rules-list");

  // 1. Panic Button Logic
  panicBtn.addEventListener("click", async () => {
    panicStatus.textContent = "Flushing background tabs...";
    const res = await browser.runtime.sendMessage({ action: "DISCARD_BACKGROUND_TABS" });
    if (res?.success) {
      panicStatus.textContent = `Success: ${res.discardedCount} tabs frozen.`;
      setTimeout(() => { panicStatus.textContent = ""; }, 3000);
    }
  });

  // 2. Load Existing Containers for Vault Assignment
  async function loadContainers() {
    const identities = await browser.contextualIdentities.query({});
    vaultSelect.replaceChildren(); // Safe DOM clear
    
    for (const id of identities) {
      const opt = document.createElement("option");
      opt.value = id.cookieStoreId;
      opt.textContent = id.name;
      vaultSelect.appendChild(opt);
    }
  }

  // 3. Load and Render Domain Vaults
  async function renderVaults() {
    const { domainVaults = {} } = await browser.storage.local.get("domainVaults");
    rulesList.replaceChildren(); // Safe DOM clear
    
    const identities = await browser.contextualIdentities.query({});
    const idMap = new Map(identities.map(i => [i.cookieStoreId, i]));

    for (const [domain, cookieStoreId] of Object.entries(domainVaults)) {
      const container = idMap.get(cookieStoreId);
      
      const li = document.createElement("li");
      li.className = "sortable-item";
      li.dataset.domain = domain;
      
      // Native DOM Construction
      const span = document.createElement("span");
      span.textContent = domain;
      
      const wrapper = document.createElement("div");
      
      const small = document.createElement("small");
      small.style.color = container?.color || "var(--text-muted)";
      small.textContent = container?.name || "Unknown";
      small.style.marginRight = "10px";
      
      const btn = document.createElement("button");
      btn.className = "btn-remove";
      btn.dataset.domain = domain;
      btn.textContent = "Remove";
      
      wrapper.appendChild(small);
      wrapper.appendChild(btn);
      
      li.appendChild(span);
      li.appendChild(wrapper);
      rulesList.appendChild(li);
    }

    // Bind remove buttons
    rulesList.querySelectorAll(".btn-remove").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const domain = e.target.dataset.domain;
        delete domainVaults[domain];
        await browser.storage.local.set({ domainVaults });
        renderVaults();
      });
    });
  }

  // 4. Add New Vault Rule
  addVaultBtn.addEventListener("click", async () => {
    const domain = vaultDomainInput.value.trim().toLowerCase();
    const containerId = vaultSelect.value;
    if (!domain || !containerId) return;

    const { domainVaults = {} } = await browser.storage.local.get("domainVaults");
    domainVaults[domain] = containerId;
    await browser.storage.local.set({ domainVaults });
    
    vaultDomainInput.value = "";
    renderVaults();
  });

  // Initialize Dashboard
  await loadContainers();
  await renderVaults();
});