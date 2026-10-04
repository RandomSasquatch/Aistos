import { setupContainerManager } from './modules/container_manager.js';
import { setupHistoryScrubber } from './modules/history_scrubber.js';
import { setupFirewallManager } from './modules/firewall_manager.js';
import { setupTabDiscardManager } from './modules/tab_discard_manager.js';
import { setupUrlSanitizer } from './modules/url_sanitizer.js';

// Initialize the zero-trust modules
setupContainerManager();
setupHistoryScrubber();
setupFirewallManager();
setupTabDiscardManager();
setupUrlSanitizer();

console.log("Aistos Zero-Trust Engine Initialized.");