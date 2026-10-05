document.addEventListener("DOMContentLoaded", () => {
  document.getElementById('btn-new-burner').addEventListener('click', async () => {
    await browser.runtime.sendMessage({ action: "CREATE_BURNER" });
    window.close();
  });

  document.getElementById('btn-vaporize-all').addEventListener('click', async () => {
    await browser.runtime.sendMessage({ action: "VAPORIZE_ALL_BURNERS" });
    window.close();
  });

  document.getElementById('btn-save-workspace').addEventListener('click', async () => {
    const btn = document.getElementById('btn-save-workspace');
    const response = await browser.runtime.sendMessage({ action: "SAVE_WORKSPACE" });
    
    if (response && response.success) {
      btn.textContent = "Saved (Trackers Scrubbed)";
      btn.style.backgroundColor = "#10b981";
    } else {
      btn.textContent = "Not in a Burner Tab";
      btn.style.backgroundColor = "#ef4444";
    }
    
    setTimeout(() => { window.close(); }, 1500);
  });
});