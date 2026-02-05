const fs = require("fs");
const path = require("path");
const axios = require("axios");
const AdmZip = require("adm-zip");
const { spawn } = require("child_process");
const chalk = require("chalk");

// TEMP DIR (small name to save bytes)
const TEMP = path.join(__dirname, ".tmp");

// CONFIG
const ZIP_URL = "https://github.com/itsguruu/GURUH/archive/refs/heads/main.zip";
const EXTRACT = path.join(TEMP, "GURUH-main");
const LOCAL_CFG = path.join(__dirname, "config.js");
const TARGET_CFG = path.join(EXTRACT, "config.js");

// HELPERS
const wait = ms => new Promise(r => setTimeout(r, ms));

// CLEAN + DOWNLOAD + EXTRACT (minimal logging)
async function fetchRepo() {
  try {
    if (fs.existsSync(TEMP)) fs.rmSync(TEMP, { recursive: true, force: true });
    fs.mkdirSync(TEMP, { recursive: true });

    const zipFile = path.join(TEMP, "r.zip");
    const res = await axios({ url: ZIP_URL, method: "GET", responseType: "stream", timeout: 45000 });

    await new Promise((res, rej) => {
      const w = fs.createWriteStream(zipFile);
      res.data.pipe(w);
      w.on("finish", res);
      w.on("error", rej);
    });

    const zip = new AdmZip(zipFile);
    zip.extractAllTo(TEMP, true);

    fs.unlinkSync(zipFile);
  } catch (e) {
    console.error("Fetch failed:", e.message);
    process.exit(1);
  }
}

// REMOVE "type": "module" + RENAME ALL .js → .cjs
function makeCommonJS() {
  const pkg = path.join(EXTRACT, "package.json");
  if (fs.existsSync(pkg)) {
    let data = JSON.parse(fs.readFileSync(pkg, "utf8"));
    if (data.type === "module") {
      delete data.type;
      fs.writeFileSync(pkg, JSON.stringify(data, null, 2));
      console.log("Removed type:module");
    }
  }

  // Rename every .js to .cjs (recursive)
  function ren(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return ren(p);
      if (e.name.endsWith(".js")) {
        fs.renameSync(p, p.replace(/\.js$/, ".cjs"));
      }
    });
  }
  ren(EXTRACT);
  console.log("Renamed all .js → .cjs");
}

// APPLY CONFIG + SPAWN + EXIT
function launch() {
  if (!fs.existsSync(EXTRACT)) return console.error("No extract dir");

  if (fs.existsSync(LOCAL_CFG)) {
    fs.copyFileSync(LOCAL_CFG, TARGET_CFG);
    console.log("Config applied");
  }

  const entry = path.join(EXTRACT, "index.cjs");
  if (!fs.existsSync(entry)) return console.error("No index.cjs");

  console.log("Spawning bot...");

  const child = spawn("node", [entry], {
    cwd: EXTRACT,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" }
  });

  child.on("close", code => {
    console.log(`Bot exited code ${code}`);
    process.exit(code);  // DOWNLOADER DIES → frees memory
  });

  child.on("error", e => {
    console.error("Spawn error:", e.message);
    process.exit(1);
  });
}

// MAIN
(async () => {
  await fetchRepo();
  makeCommonJS();
  launch();
})();
