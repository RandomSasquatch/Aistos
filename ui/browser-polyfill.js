/**
 * Aistos Web Browser Polyfill
 * Provides in-memory and localStorage-backed WebExtension browser API stubs
 * for previewing and testing Aistos in standalone web environments.
 */

(function () {
  if (typeof window === "undefined") return;

  // Embedded localized messages from _locales/en/messages.json
  const DEFAULT_MESSAGES = {
    extensionName: "Aistos Privacy Sandbox",
    extensionDescription: "Zero-Trust Session Sandbox. Native firewalling, ephemeral workspaces, and instant data vaporization.",
    dashboard_title: "Aistos Command Center",
    panic_title: "Memory & Session Control",
    panic_btn: "Panic Button: Discard Background Tabs",
    panic_desc: "Instantly flushes background workspace tabs from RAM to freeze tracker execution and reclaim memory.",
    vaults_title: "Domain Vaults",
    vaults_desc: "Route specific domains into dedicated, persistent containers.",
    vault_placeholder: "e.g., github.com",
    vault_add: "Assign Vault",
    optionsDashboardTitle: "Aistos Vaults & Firewall",
    optionsDomainVaultsTitle: "Domain Vaults (Rule Priority)",
    optionsDomainVaultsDesc: "Drag and drop rules to set priority. The top-most matching rule wins.",
    optionsInputPlaceholder: "e.g. github.com",
    optionsDefaultContainerOption: "Default (No Container)",
    optionsBtnAddRule: "Add Rule",
    optionsPrivacyTogglesTitle: "Global Privacy Toggles",
    optionsToggleDNR: "Enable Native Ad & Tracker Blocking (DNR)",
    optionsToggleCNAME: "Enable CNAME Uncloaking (DNS Resolution)",
    migrationWindowTitle: "Aistos Setup & Migration",
    migrationHeader: "Aistos Setup & Migration",
    migrationScanTitle: "1. Auto-Detect Active Logins",
    migrationScanDesc: "Aistos can scan your current persistent cookies to securely identify sites where you are currently logged in. We will assign these to your Personal Vault so you don't get logged out.",
    migrationBtnScan: "Scan Active Logins",
    migrationBtnCommit: "Commit Selected to Vault",
    migrationCADTitle: "2. Import from Cookie AutoDelete (CAD)",
    migrationCADDesc: "Migrating from CAD? Drop your \"Expressions Backup\" JSON file here to instantly transfer your Whitelists to Aistos Domain Vaults.",
    migrationDropzoneText: "Drag & Drop CAD Backup.json here or click to select file",
    migrationBtnFinish: "Finish Setup & Open Dashboard",
    popupBtnNewBurner: "Launch Burner Workspace",
    popupBtnSaveWorkspace: "Save Current Workspace",
    popupBtnVaporizeAll: "Vaporize All Sessions",
    contextMenuCleanCopy: "Copy Clean Link (Strip Tracking)",
    contextMenuOpenBurner: "Open Link in New Burner Workspace"
  };

  const STORAGE_KEY = "aistos_storage_v1";

  function getRawStorage() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  function setRawStorage(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("[Aistos Polyfill] Storage save error:", e);
    }
  }

  // Initial seed
  const current = getRawStorage();
  if (!current.domainVaults) {
    current.domainVaults = {
      "github.com": "work",
      "google.com": "personal",
      "chase.com": "banking",
      "amazon.com": "shopping"
    };
    setRawStorage(current);
  }

  // Pre-configured and dynamic contextual identities
  let containers = [
    { cookieStoreId: "firefox-default", name: "Default (No Container)", color: "toolbar", icon: "circle" },
    { cookieStoreId: "personal", name: "Personal Vault", color: "blue", icon: "fingerprint" },
    { cookieStoreId: "work", name: "Work Vault", color: "orange", icon: "briefcase" },
    { cookieStoreId: "banking", name: "Banking Vault", color: "green", icon: "dollar" },
    { cookieStoreId: "shopping", name: "Shopping Vault", color: "pink", icon: "cart" }
  ];

  // Try to load any saved burners
  try {
    const savedBurners = JSON.parse(localStorage.getItem("aistos_active_burners") || "[]");
    for (const b of savedBurners) {
      if (!containers.some(c => c.cookieStoreId === b.cookieStoreId)) {
        containers.push(b);
      }
    }
  } catch {}

  function saveBurners() {
    try {
      const burners = containers.filter(c => c.name.startsWith("AistosBurner_"));
      localStorage.setItem("aistos_active_burners", JSON.stringify(burners));
    } catch {}
  }

  // Simulated browser object
  const polyfillBrowser = {
    i18n: {
      getMessage(key) {
        return DEFAULT_MESSAGES[key] || "";
      }
    },

    storage: {
      local: {
        async get(keys) {
          const store = getRawStorage();
          if (!keys) return { ...store };
          if (typeof keys === "string") {
            return { [keys]: store[keys] };
          }
          if (Array.isArray(keys)) {
            const res = {};
            for (const k of keys) res[k] = store[k];
            return res;
          }
          if (typeof keys === "object") {
            const res = { ...keys };
            for (const k of Object.keys(keys)) {
              if (store[k] !== undefined) res[k] = store[k];
            }
            return res;
          }
          return { ...store };
        },

        async set(items) {
          const store = getRawStorage();
          Object.assign(store, items);
          setRawStorage(store);
          window.dispatchEvent(new CustomEvent("aistos_storage_changed", { detail: store }));
        }
      }
    },

    contextualIdentities: {
      async query(filter = {}) {
        if (filter.name) {
          return containers.filter(c => c.name === filter.name);
        }
        return [...containers];
      },

      async create(details) {
        const id = `firefox-container-${Date.now()}`;
        const newContainer = {
          cookieStoreId: id,
          name: details.name || `Container ${containers.length + 1}`,
          color: details.color || "red",
          icon: details.icon || "fingerprint"
        };
        containers.push(newContainer);
        saveBurners();
        window.dispatchEvent(new CustomEvent("aistos_containers_changed", { detail: containers }));
        return newContainer;
      },

      async remove(cookieStoreId) {
        containers = containers.filter(c => c.cookieStoreId !== cookieStoreId);
        saveBurners();
        window.dispatchEvent(new CustomEvent("aistos_containers_changed", { detail: containers }));
        return true;
      }
    },

    runtime: {
      getURL(path) {
        return `/${path.replace(/^\//, "")}`;
      },

      async sendMessage(message) {
        console.log("[Aistos Engine Dispatch]", message);

        if (!message || !message.action) {
          return { success: false, error: "Missing action" };
        }

        switch (message.action) {
          case "DISCARD_BACKGROUND_TABS": {
            const discarded = Math.floor(Math.random() * 4) + 4;
            return { success: true, discardedCount: discarded };
          }

          case "CREATE_BURNER": {
            const burnerNumber = Date.now().toString().slice(-4);
            const burnerName = `AistosBurner_${burnerNumber}`;
            const burner = await polyfillBrowser.contextualIdentities.create({
              name: burnerName,
              color: "red",
              icon: "fingerprint"
            });
            return { success: true, burner, name: burnerName };
          }

          case "VAPORIZE_ALL_BURNERS": {
            const burners = containers.filter(c => c.name.startsWith("AistosBurner_"));
            const count = burners.length;
            for (const b of burners) {
              await polyfillBrowser.contextualIdentities.remove(b.cookieStoreId);
            }
            return { success: true, purgedCount: count };
          }

          case "SAVE_WORKSPACE": {
            // Check if there are any active burners to convert
            const burners = containers.filter(c => c.name.startsWith("AistosBurner_"));
            if (burners.length > 0) {
              // Convert newest burner to a permanent saved workspace
              const target = burners[burners.length - 1];
              target.name = `Saved Workspace (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
              target.color = "blue";
              saveBurners();
              return { success: true };
            }
            return { success: true };
          }

          default:
            return { success: true, action: message.action };
        }
      },

      onInstalled: {
        addListener(_fn) {
          // No-op in browser client
        }
      }
    },

    cookies: {
      async getAll(_queryInfo = {}) {
        const now = Math.floor(Date.now() / 1000);
        const sixtyDaysFuture = now + (60 * 24 * 60 * 60);

        return [
          { domain: ".github.com", name: "user_session", value: "tok_secure_1", expirationDate: sixtyDaysFuture, storeId: "firefox-default" },
          { domain: ".google.com", name: "SID", value: "tok_secure_2", expirationDate: sixtyDaysFuture, storeId: "firefox-default" },
          { domain: ".reddit.com", name: "token_v2", value: "tok_secure_3", expirationDate: sixtyDaysFuture, storeId: "firefox-default" },
          { domain: ".proton.me", name: "AUTH_KEY", value: "tok_secure_4", expirationDate: sixtyDaysFuture, storeId: "firefox-default" },
          { domain: ".wikipedia.org", name: "session_id", value: "tok_secure_5", expirationDate: sixtyDaysFuture, storeId: "firefox-default" },
          { domain: ".duckduckgo.com", name: "p_token", value: "tok_secure_6", expirationDate: sixtyDaysFuture, storeId: "firefox-default" }
        ];
      }
    },

    tabs: {
      async query(_queryInfo = {}) {
        return [
          { id: 1, active: true, title: "Aistos Sandbox", url: window.location.href, cookieStoreId: "firefox-default" }
        ];
      },

      async create(details) {
        if (details.url) {
          if (window.parent && window.parent !== window && window.parent.postMessage) {
            window.parent.postMessage({ type: "AISTOS_NAVIGATE", url: details.url }, "*");
          }
          window.location.href = details.url;
        }
        return { id: Date.now(), ...details };
      },

      async discard(_tabId) {
        return true;
      }
    },

    alarms: {
      create(_name, _info) {},
      onAlarm: {
        addListener(_cb) {}
      }
    }
  };

  window.browser = polyfillBrowser;
  window.chrome = polyfillBrowser;
})();
