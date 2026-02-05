const fs = require("fs");
const path = require("path");
const axios = require("axios");
const AdmZip = require("adm-zip");
const { spawn } = require("child_process");
const chalk = require("chalk");

// === TEMP DIRECTORY ===
const TEMP_DIR = path.join(__dirname, ".guruh-temp");

// === GIT CONFIG ===
const DOWNLOAD_URL = "https://github.com/itsguruu/GURUH/archive/refs/heads/main.zip";
const EXTRACT_DIR = path.join(TEMP_DIR, "GURUH-main");
const LOCAL_SETTINGS = path.join(__dirname, "config.js");
const EXTRACTED_SETTINGS = path.join(EXTRACT_DIR, "config.js");

// === HELPERS ===
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// === RECURSIVELY RENAME ALL .js → .cjs ===
function renameJsToCjs(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      renameJsToCjs(fullPath);
    } else if (entry.name.endsWith(".js")) {
      const newPath = fullPath.replace(/\.js$/, ".cjs");
      fs.renameSync(fullPath, newPath);
      console.log(chalk.dim(`Renamed: ${entry.name} → ${path.basename(newPath)}`));
    }
  });
}

// === FIX require('./something.js') → require('./something.cjs') in a file ===
function fixRequiresInFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, "utf8");
  // Simple regex replace - looks for require('./...js') or require("../...js")
  content = content.replace(
    /require\(['"]([\.\/]+[^'"]+\.js)['"]\)/g,
    (match, p1) => `require('\( {p1.replace(/\.js \)/, ".cjs")}')`
  );
  fs.writeFileSync(filePath, content, "utf8");
  console.log(chalk.dim(`Fixed requires in: ${path.basename(filePath)}`));
}

// === MAIN LOGIC ===
async function downloadAndExtract() {
  try {
    if (fs.existsSync(TEMP_DIR)) {
      console.log(chalk.yellow("🧹 Cleaning previous cache..."));
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }

    fs.mkdirSync(TEMP_DIR, { recursive: true });

    const zipPath = path.join(TEMP_DIR, "guruh.zip");
    console.log(chalk.blue("⬇️ Downloading GURU MD PREMIUM from GitHub..."));

    const response = await axios({
      url: DOWNLOAD_URL,
      method: "GET",
      responseType: "stream",
      timeout: 60000,
    });

    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(zipPath);
      response.data.pipe(writer);
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    console.log(chalk.green("📦 ZIP download complete."));

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(TEMP_DIR, true);
    console.log(chalk.green("📂 Extraction completed."));

    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

    // Remove "type": "module" from package.json
    const pkgPath = path.join(EXTRACT_DIR, "package.json");
    if (fs.existsSync(pkgPath)) {
      let pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (pkg.type === "module") {
        delete pkg.type;
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
        console.log(chalk.yellow("Removed 'type: module' from package.json → forcing CommonJS"));
      }
    }

    // Rename EVERY .js → .cjs in the entire extracted folder
    renameJsToCjs(EXTRACT_DIR);
    console.log(chalk.yellow("All .js files renamed to .cjs"));

    // Fix require paths in the main index.cjs
    const entryPoint = path.join(EXTRACT_DIR, "index.cjs");
    if (fs.existsSync(entryPoint)) {
      fixRequiresInFile(entryPoint);
    }

    // Optionally fix other important files (e.g. command loader, lib files)
    // You can add more paths here if needed
  } catch (err) {
    console.error(chalk.red("❌ Download/Extract failed:"), err.message);
    throw err;
  }
}

async function applyLocalSettings() {
  if (!fs.existsSync(LOCAL_SETTINGS)) {
    console.log(chalk.yellow("⚠️ No local config.js found → skipping."));
    return;
  }

  try {
    fs.mkdirSync(EXTRACT_DIR, { recursive: true });
    fs.copyFileSync(LOCAL_SETTINGS, EXTRACTED_SETTINGS);
    console.log(chalk.green("🛠️ Local config.js applied."));
  } catch (err) {
    console.error(chalk.red("❌ Failed to apply config:"), err.message);
  }

  await delay(400);
}

function startBot() {
  console.log(chalk.cyan("🚀 Launching GURU MD WhatsApp Bot..."));

  if (!fs.existsSync(EXTRACT_DIR)) {
    console.error(chalk.red("❌ Extracted directory not found."));
    return;
  }

  const commonJsEntry = path.join(EXTRACT_DIR, "index.cjs");

  if (!fs.existsSync(commonJsEntry)) {
    console.error(chalk.red("❌ index.cjs not found after renaming."));
    return;
  }

  const bot = spawn("node", [commonJsEntry], {
    cwd: EXTRACT_DIR,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" },
  });

  bot.on("close", (code) => {
    console.log(chalk.red(`Bot terminated with code: ${code}`));
  });

  bot.on("error", (err) => {
    console.error(chalk.red("Spawn error:"), err.message);
  });
}

// === RUN ===
(async () => {
  try {
    await downloadAndExtract();
    await applyLocalSettings();
    startBot();
  } catch (err) {
    console.error(chalk.red("Fatal error:"), err.message);
    process.exitCode = 1;
  }
})();
