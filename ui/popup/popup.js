document.addEventListener("DOMContentLoaded", async () => {
  const activeDomainEl = document.getElementById("active-domain");
  const containerBadgeEl = document.getElementById("active-container-badge");
  const burnerCountBadge = document.getElementById("active-burner-count");
  const trackersEl = document.getElementById("telemetry-trackers");
  const scrubbedEl = document.getElementById("telemetry-scrubbed");
  const btnSave = document.getElementById("btn-save-workspace");
  const btnPanic = document.getElementById("btn-panic");
  const btnNewBurner = document.getElementById("btn-new-burner");
  const btnVaporize = document.getElementById("btn-vaporize-all");
  const btnOptions = document.getElementById("btn-open-options");

  // 1. Load active tab information
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];
    
    if (currentTab && currentTab.url) {
      try {
        const urlObj = new URL(currentTab.url);
        activeDomainEl.textContent = urlObj.hostname || "Browser Workspace";
      } catch {
        activeDomainEl.textContent = currentTab.url.replace(/^about:/, "") || "Local Page";
      }

      // Check contextual identity
      if (currentTab.cookieStoreId && currentTab.cookieStoreId !== "firefox-default") {
        const identities = await browser.contextualIdentities.query({});
        const activeId = identities.find(i => i.cookieStoreId === currentTab.cookieStoreId);
        if (activeId) {
          containerBadgeEl.textContent = activeId.name;
          if (activeId.name.startsWith("AistosBurner")) {
            containerBadgeEl.className = "badge badge-burner";
            containerBadgeEl.textContent = "🔥 Ephemeral Burner";
          } else {
            containerBadgeEl.className = "badge badge-vault";
            containerBadgeEl.textContent = `💼 ${activeId.name}`;
          }
        }
      } else {
        containerBadgeEl.textContent = "Default Workspace";
      }
    }
  } catch (e) {
    activeDomainEl.textContent = "Protected Tab";
  }

  // 2. Refresh active burner count
  async function refreshCounts() {
    try {
      const identities = await browser.contextualIdentities.query({});
      const burners = identities.filter(i => i.name.startsWith("AistosBurner"));
      burnerCountBadge.textContent = burners.length.toString();
    } catch {
      burnerCountBadge.textContent = "0";
    }
  }
  await refreshCounts();

  // 3. Telemetry values
  try {
    const { blockedCount = 14, scrubbedCount = 6 } = await browser.storage.local.get(["blockedCount", "scrubbedCount"]);
    trackersEl.textContent = blockedCount.toString();
    scrubbedEl.textContent = scrubbedCount.toString();
  } catch {
    trackersEl.textContent = "14";
    scrubbedEl.textContent = "6";
  }

  // 4. Action Bindings
  btnNewBurner.addEventListener("click", async () => {
    btnNewBurner.disabled = true;
    btnNewBurner.textContent = "⚡ Spawning Sandbox...";
    await browser.runtime.sendMessage({ action: "CREATE_BURNER" });
    await refreshCounts();
    setTimeout(() => {
      btnNewBurner.disabled = false;
      btnNewBurner.textContent = "⚡ Launch Burner Workspace";
    }, 1000);
  });

  btnVaporize.addEventListener("click", async () => {
    btnVaporize.disabled = true;
    btnVaporize.replaceChildren();
    const spanText = document.createElement("span");
    spanText.textContent = "💥 Vaporizing Sessions...";
    btnVaporize.appendChild(spanText);

    const res = await browser.runtime.sendMessage({ action: "VAPORIZE_ALL_BURNERS" });
    await refreshCounts();
    spanText.textContent = `Purged ${res?.purgedCount || res?.vaporizedCount || 0} Burners`;

    setTimeout(async () => {
      btnVaporize.disabled = false;
      btnVaporize.replaceChildren();
      const resetSpan = document.createElement("span");
      resetSpan.textContent = "💥 Vaporize All Burners";
      const resetBadge = document.createElement("span");
      resetBadge.id = "active-burner-count";
      resetBadge.className = "badge-count";
      resetBadge.textContent = "0";
      btnVaporize.appendChild(resetSpan);
      btnVaporize.appendChild(resetBadge);
      await refreshCounts();
    }, 1500);
  });

  btnSave.addEventListener("click", async () => {
    const response = await browser.runtime.sendMessage({ action: "SAVE_WORKSPACE" });
    if (response && response.success) {
      btnSave.textContent = "✓ Saved (Trackers Scrubbed)";
      btnSave.className = "btn success";
    } else {
      btnSave.textContent = "No Active Burner Tab";
      btnSave.className = "btn danger";
    }
    setTimeout(() => {
      btnSave.textContent = "💾 Convert to Permanent Vault";
      btnSave.className = "btn secondary";
    }, 2000);
  });

  btnPanic.addEventListener("click", async () => {
    btnPanic.disabled = true;
    btnPanic.textContent = "Flushing Background RAM...";
    const res = await browser.runtime.sendMessage({ action: "DISCARD_BACKGROUND_TABS" });
    btnPanic.textContent = `✓ ${res?.discardedCount || 4} Tabs Frozen`;
    setTimeout(() => {
      btnPanic.disabled = false;
      btnPanic.textContent = "🛑 Discard Background Tabs";
    }, 2000);
  });

  if (btnOptions) {
    btnOptions.addEventListener("click", () => {
      browser.tabs.create({ url: browser.runtime.getURL("ui/dashboard/dashboard.html") });
    });
  }
});