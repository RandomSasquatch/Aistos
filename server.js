import express from "express";
import path from "node:path";
import fs from "node:fs";

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT_DIR = process.cwd();

// Serve static assets
app.use(express.static(ROOT_DIR, {
  extensions: ["html", "js", "css", "json", "png", "svg"],
  index: "index.html"
}));

// Route fallback for root
app.get("/", (req, res) => {
  const indexPath = path.join(ROOT_DIR, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.redirect("/ui/dashboard/dashboard.html");
  }
});

// Download endpoint for packaged XPI
app.get("/download/aistos.xpi", (req, res) => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "manifest.json"), "utf8"));
  const version = manifest.version || "1.0.0";
  const xpiPath = path.join(ROOT_DIR, "dist", `aistos-${version}.xpi`);
  
  if (fs.existsSync(xpiPath)) {
    res.download(xpiPath, `aistos-${version}.xpi`);
  } else {
    res.status(404).send("Extension XPI package not yet built. Run npm run build.");
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    app: "Aistos",
    version: "1.0.0",
    engine: "Zero-Trust Session Sandbox",
    port: PORT
  });
});

app.listen(PORT, HOST, () => {
  console.log(`\x1b[32m[AISTOS SERVER]\x1b[0m Running on http://${HOST}:${PORT}`);
});
