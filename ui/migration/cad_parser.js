/**
 * Aistos CAD (Cookie AutoDelete) Parser
 * Converts legacy CAD backups into Aistos Vault mappings.
 */

export function parseCADExport(jsonString) {
  try {
    const cadData = JSON.parse(jsonString);
    const domainVaults = {};
    let importedCount = 0;

    // CAD organizes expressions by Container ID (e.g., "default", "firefox-container-1")
    for (const [containerId, expressions] of Object.entries(cadData)) {
      if (!Array.isArray(expressions)) continue;

      // Map CAD's "default" to Mozilla's internal naming
      const mappedContainer = containerId === "default" ? "firefox-default" : containerId;

      for (const rule of expressions) {
        // We only care about explicit Keep/Whitelist rules
        if (rule.listType === "WHITE" || rule.listType === "GREY") {
          
          // Translate CAD's glob syntax (e.g., *.github.com -> github.com)
          let cleanDomain = rule.expression.trim();
          if (cleanDomain.startsWith("*.")) {
            cleanDomain = cleanDomain.substring(2);
          }

          // Ignore empty or invalid expressions
          if (cleanDomain.length < 3) continue;

          domainVaults[cleanDomain] = mappedContainer;
          importedCount++;
        }
      }
    }

    return { success: true, domainVaults, importedCount };
  } catch (err) {
    return { success: false, error: "Invalid CAD backup file structure." };
  }
}