// Tab switching logic
const tabs = document.querySelectorAll('.tab-btn');
const contents = document.querySelectorAll('.tab-content');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    contents.forEach(c => c.style.display = 'none');
    
    tab.classList.add('active');
    const targetId = `tab-${tab.dataset.tab}`;
    const target = document.getElementById(targetId);
    if (target) target.style.display = 'block';
  });
});

// Listen for navigation requests from child iframes (e.g. migration finish button)
window.addEventListener("message", (event) => {
  if (event.data && event.data.type === "AISTOS_NAVIGATE") {
    const url = event.data.url;
    if (url.includes("options.html")) {
      const optTab = document.querySelector('[data-tab="options"]');
      if (optTab) optTab.click();
    } else if (url.includes("dashboard.html")) {
      const dashTab = document.querySelector('[data-tab="dashboard"]');
      if (dashTab) dashTab.click();
    }
  }
});

// Live URL Sanitizer interactive workbench
let trackingParams = [];
fetch('/rules/tracking_params.json')
  .then(r => r.json())
  .then(params => { trackingParams = params; })
  .catch(() => {
    trackingParams = ["utm_source","utm_medium","utm_campaign","utm_term","utm_content","fbclid","gclid","msclkid","mc_eid","igshid","twclid","yclid","hsmi","tag","_encoding","spm"];
  });

// Load DNR rules
fetch('/rules/dnr_rules.json')
  .then(r => r.json())
  .then(rules => {
    document.getElementById('dnr-rules-dump').textContent = JSON.stringify(rules, null, 2);
  })
  .catch(err => {
    document.getElementById('dnr-rules-dump').textContent = "Failed to load rules: " + err.message;
  });

const dirtyInput = document.getElementById('dirty-url-input');
const cleanOutput = document.getElementById('clean-url-result');
const scrubBadge = document.getElementById('scrub-count-badge');
const scrubBtn = document.getElementById('btn-clean-url');

function cleanUrl() {
  const raw = dirtyInput.value.trim();
  try {
    const parsed = new URL(raw);
    let removedCount = 0;
    for (const p of trackingParams) {
      if (parsed.searchParams.has(p)) {
        parsed.searchParams.delete(p);
        removedCount++;
      }
    }
    cleanOutput.textContent = parsed.toString();
    scrubBadge.textContent = `✓ Scrubbed ${removedCount} tracking parameter(s)`;
  } catch (e) {
    cleanOutput.textContent = "Invalid URL format";
    scrubBadge.textContent = "";
  }
}

if (scrubBtn) scrubBtn.addEventListener('click', cleanUrl);
if (dirtyInput) dirtyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') cleanUrl(); });