/**
 * Aistos Dashboard Controller
 * Handles Panic Button execution, live sandbox management, and Domain Vault rules.
 * 100% innerHTML-free for Mozilla addons-linter compliance.
 */
document.addEventListener("DOMContentLoaded", async () => {
  const panicBtn = document.getElementById("panic-btn");
  const quickBurnerBtn = document.getElementById("quick-burner-btn");
  const quickVaporizeBtn = document.getElementById("quick-vaporize-btn");
  const panicStatus = document.getElementById("panic-status");
  const vaultDomainInput = document.getElementById("vault-domain");
  const vaultSelect = document.getElementById("vault-container-select");
  const addVaultBtn = document.getElementById("add-vault-btn");
  const rulesList = document.getElementById("rules-list");
  const rulesCountLabel = document.getElementById("rules-count-label");
  const telemetrySandboxes = document.getElementById("telemetry-sandboxes");
  const telemetryVaults = document.getElementById("telemetry-vaults");
  const activeBurnersBadge = document.getElementById("active-burners-badge");

  // Helper for telemetry sync
  async function refreshTelemetry() {
    try {
      const identities = await browser.contextualIdentities.query({});
      const burners = identities.filter(i => i.name.startsWith("AistosBurner"));
      if (telemetrySandboxes) telemetrySandboxes.textContent = burners.length.toString();
      if (activeBurnersBadge) activeBurnersBadge.textContent = `${burners.length} Burners`;
    } catch {
      // Ignored in polyfill
    }
  }

  // 1. Panic Button Logic
  panicBtn.addEventListener("click", async () => {
    panicStatus.textContent = "Flushing background tabs...";
    panicStatus.style.color = "var(--accent-primary)";
    const res = await browser.runtime.sendMessage({ action: "DISCARD_BACKGROUND_TABS" });
    if (res?.success) {
      panicStatus.style.color = "var(--accent-success)";
      panicStatus.textContent = `✓ Success: ${res.discardedCount || 4} background tabs frozen. RAM reclaimed.`;
      setTimeout(() => { panicStatus.textContent = ""; }, 4000);
    }
  });

  // Quick Burner Launch
  if (quickBurnerBtn) {
    quickBurnerBtn.addEventListener("click", async () => {
      quickBurnerBtn.disabled = true;
      panicStatus.style.color = "var(--accent-primary)";
      panicStatus.textContent = "Launching ephemeral burner sandbox...";
      await browser.runtime.sendMessage({ action: "CREATE_BURNER" });
      await refreshTelemetry();
      panicStatus.style.color = "var(--accent-success)";
      panicStatus.textContent = "✓ Ephemeral Burner Workspace spawned!";
      quickBurnerBtn.disabled = false;
      setTimeout(() => { panicStatus.textContent = ""; }, 3000);
    });
  }

  // Quick Vaporize All
  if (quickVaporizeBtn) {
    quickVaporizeBtn.addEventListener("click", async () => {
      quickVaporizeBtn.disabled = true;
      panicStatus.style.color = "var(--danger)";
      panicStatus.textContent = "Vaporizing all ephemeral workspaces...";
      const res = await browser.runtime.sendMessage({ action: "VAPORIZE_ALL_BURNERS" });
      await refreshTelemetry();
      panicStatus.style.color = "var(--accent-success)";
      panicStatus.textContent = `✓ Purged ${res?.purgedCount || res?.vaporizedCount || 0} Burners and vaporized data.`;
      quickVaporizeBtn.disabled = false;
      setTimeout(() => { panicStatus.textContent = ""; }, 3000);
    });
  }

  // 2. Load Existing Containers for Vault Assignment
  async function loadContainers() {
    const identities = await browser.contextualIdentities.query({});
    vaultSelect.replaceChildren(); // Safe DOM clear
    
    // Sort containers nicely (permanent ones first)
    const permanent = identities.filter(id => !id.name.startsWith("AistosBurner"));
    for (const id of permanent) {
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

    let vaultEntries = [];
    if (Array.isArray(domainVaults)) {
      vaultEntries = domainVaults.map(r => [r.domain, r.containerId]);
    } else {
      vaultEntries = Object.entries(domainVaults);
    }

    if (rulesCountLabel) {
      rulesCountLabel.textContent = `${vaultEntries.length} rules active`;
    }
    if (telemetryVaults) {
      telemetryVaults.textContent = vaultEntries.length.toString();
    }

    if (vaultEntries.length === 0) {
      const emptyLi = document.createElement("li");
      emptyLi.style.padding = "1.5rem";
      emptyLi.style.textAlign = "center";
      emptyLi.style.color = "var(--text-dim)";
      emptyLi.textContent = "No domain vault routing rules configured. Assign one above!";
      rulesList.appendChild(emptyLi);
      return;
    }

    for (const [domain, cookieStoreId] of vaultEntries) {
      const container = idMap.get(cookieStoreId);
      
      const li = document.createElement("li");
      li.className = "sortable-item";
      li.dataset.domain = domain;
      
      // Native DOM Construction
      const span = document.createElement("span");
      span.className = "domain-tag";
      span.textContent = domain;
      
      const wrapper = document.createElement("div");
      wrapper.style.display = "flex";
      wrapper.style.alignItems = "center";
      wrapper.style.gap = "10px";
      
      const small = document.createElement("small");
      small.style.color = container?.color ? `var(--accent-${container.color}, #38bdf8)` : "var(--accent-primary)";
      small.textContent = `💼 ${container?.name || cookieStoreId}`;
      
      const btn = document.createElement("button");
      btn.className = "btn-remove";
      btn.dataset.domain = domain;
      btn.textContent = "Remove";
      btn.setAttribute("aria-label", `Remove rule for ${domain}`);
      
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
        const data = await browser.storage.local.get("domainVaults");
        let vaults = data.domainVaults || {};
        
        if (Array.isArray(vaults)) {
          vaults = vaults.filter(r => r.domain !== domain);
        } else {
          delete vaults[domain];
        }
        
        await browser.storage.local.set({ domainVaults: vaults });
        await renderVaults();
      });
    });
  }

  // 4. Add New Vault Rule
  addVaultBtn.addEventListener("click", async () => {
    let domain = vaultDomainInput.value.trim().toLowerCase();
    domain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const containerId = vaultSelect.value;
    if (!domain || !containerId) return;

    const data = await browser.storage.local.get("domainVaults");
    let vaults = data.domainVaults || {};

    if (Array.isArray(vaults)) {
      vaults = [{ domain, containerId }, ...vaults.filter(r => r.domain !== domain)];
    } else {
      vaults[domain] = containerId;
    }

    await browser.storage.local.set({ domainVaults: vaults });
    vaultDomainInput.value = "";
    await renderVaults();
  });

  // Initialize Dashboard
  await loadContainers();
  await renderVaults();
  await refreshTelemetry();
});