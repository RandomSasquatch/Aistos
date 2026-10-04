/**
 * Aistos URL Sanitizer Engine
 * Recursive unwrapping, embedded redirect stripping, query and hash cleaning.
 */

let TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "fbclid", "gclid", "msclkid", "mc_eid", "igshid", "twclid", "yclid"
]);

const REDIRECT_PARAMS = [
  "url", "dest", "destination", "target", "redirect", "redirect_uri", "q", "u", "link"
];

export async function initUrlSanitizer() {
  try {
    const res = await fetch(browser.runtime.getURL("rules/tracking_params.json"));
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list)) {
        TRACKING_PARAMS = new Set(list);
      }
    }
  } catch (err) {
    console.warn("[Aistos] Failed to load external tracking dictionary, using embedded defaults.", err);
  }
}

export function sanitizeUrl(rawUrl, options = { recursive: true, cleanHash: true }) {
  if (!rawUrl || typeof rawUrl !== "string") return rawUrl;
  if (rawUrl.startsWith("about:") || rawUrl.startsWith("moz-extension:") || rawUrl.startsWith("data:")) {
    return rawUrl;
  }

  let currentUrl = rawUrl;
  let iterations = 0;
  const maxIterations = options.recursive ? 5 : 1;

  while (iterations < maxIterations) {
    let nextUrl = cleanSinglePass(currentUrl, options.cleanHash);
    
    // Check for nested redirect wrappers (e.g. google.com/url?q=https://real.site)
    const unwrapped = extractEmbeddedRedirect(nextUrl);
    if (unwrapped && unwrapped !== nextUrl) {
      nextUrl = unwrapped;
    }

    if (nextUrl === currentUrl) break;
    currentUrl = nextUrl;
    iterations++;
  }

  return currentUrl;
}

function cleanSinglePass(urlStr, cleanHash) {
  try {
    const parsed = new URL(urlStr);
    let dirty = false;

    // 1. Scrub Search Params
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) {
        parsed.searchParams.delete(key);
        dirty = true;
      }
    }

    // 2. Scrub Hash Fragments (e.g. #access_token=...&utm_source=...)
    if (cleanHash && parsed.hash && parsed.hash.length > 1) {
      const hashContent = parsed.hash.substring(1);
      if (hashContent.includes("=") || hashContent.includes("&")) {
        const queryLike = hashContent.startsWith("?") ? hashContent.substring(1) : hashContent;
        const hashParams = new URLSearchParams(queryLike);
        let hashDirty = false;

        for (const hKey of Array.from(hashParams.keys())) {
          if (TRACKING_PARAMS.has(hKey.toLowerCase()) || hKey.toLowerCase().startsWith("utm_")) {
            hashParams.delete(hKey);
            hashDirty = true;
          }
        }

        if (hashDirty) {
          const newHash = hashParams.toString();
          parsed.hash = newHash ? (hashContent.startsWith("?") ? `?${newHash}` : newHash) : "";
          dirty = true;
        }
      }
    }

    return dirty ? parsed.toString() : urlStr;
  } catch {
    return urlStr;
  }
}

function extractEmbeddedRedirect(urlStr) {
  try {
    const parsed = new URL(urlStr);
    for (const param of REDIRECT_PARAMS) {
      if (parsed.searchParams.has(param)) {
        const target = parsed.searchParams.get(param);
        if (target && (target.startsWith("http://") || target.startsWith("https://"))) {
          return decodeURIComponent(target);
        }
      }
    }
  } catch {
    // Return original if malformed
  }
  return urlStr;
}