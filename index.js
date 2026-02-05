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

    const pluginFolder = path.join(EXTRACT_DIR, "plugins");
    console.log(
      fs.existsSync(pluginFolder)
        ? chalk.green("✅ Plugins folder found.")
        : chalk.yellow("⚠️ Plugins folder not found.")
    );
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

  const originalEntry = path.join(EXTRACT_DIR, "index.js");
  const commonJsEntry = path.join(EXTRACT_DIR, "index.cjs");

  if (!fs.existsSync(originalEntry)) {
    console.error(chalk.red("❌ index.js not found in extracted folder."));
    return;
  }

  // Rename to .cjs to force CommonJS mode (bypasses "type": "module")
  fs.renameSync(originalEntry, commonJsEntry);
  console.log(chalk.yellow("Renamed index.js → index.cjs to force CommonJS"));

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
