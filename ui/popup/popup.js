document.getElementById('btn-new-burner').addEventListener('click', async () => {
  await browser.runtime.sendMessage({ action: "CREATE_BURNER" });
  window.close();
});

document.getElementById('btn-vaporize-all').addEventListener('click', async () => {
  await browser.runtime.sendMessage({ action: "VAPORIZE_ALL_BURNERS" });
  window.close();
});

document.getElementById('btn-save-workspace').addEventListener('click', async () => {
  const response = await browser.runtime.sendMessage({ action: "SAVE_WORKSPACE" });
  if (response && response.success) {
    document.getElementById('btn-save-workspace').textContent = "Saved (Trackers Scrubbed)";
    document.getElementById('btn-save-workspace').style.backgroundColor = "#10b981";
  } else {
    document.getElementById('btn-save-workspace').textContent = "Not in a Burner Tab";
    document.getElementById('btn-save-workspace').style.backgroundColor = "#ef4444";
  }
  
  setTimeout(() => { window.close(); }, 1500);
});