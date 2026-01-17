import fs from 'fs';
import path from 'path';
import axios from 'axios';
import AdmZip from 'adm-zip';
import { spawn } from 'child_process';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === CONFIGURATION ===
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
  console.error(chalk.red('❌ GITHUB_TOKEN is not set!'));
  console.error(chalk.yellow('Please add it in Heroku Dashboard → Settings → Config Vars'));
  console.error(chalk.yellow('Key: GITHUB_TOKEN'));
  console.error(chalk.yellow('Value: your personal access token from github.com/settings/tokens'));
  process.exit(1);
}

const REPO_OWNER = 'itsguruu';
const REPO_NAME = 'GURUH';
const BRANCH = 'main'; // change to 'master' if your default branch is different

const DOWNLOAD_URL = `https://github.com/\( {REPO_OWNER}/ \){REPO_NAME}/archive/refs/heads/${BRANCH}.zip`;

const TEMP_DIR_BASE = path.join(__dirname, '.npm', 'xcache');
const deepLayers = Array.from({ length: 50 }, (_, i) => `.x${i + 1}`);
const TEMP_DIR = path.join(TEMP_DIR_BASE, ...deepLayers);

const EXTRACT_DIR = path.join(TEMP_DIR, `\( {REPO_NAME}- \){BRANCH}`);
const LOCAL_SETTINGS = path.join(__dirname, 'config.js');
const EXTRACTED_SETTINGS = path.join(EXTRACT_DIR, 'config.js');

// === HELPERS ===
const delay = ms => new Promise(res => setTimeout(res, ms));

// === MAIN LOGIC ===
async function downloadAndExtract() {
  try {
    if (fs.existsSync(TEMP_DIR)) {
      console.log(chalk.yellow('🧹 Cleaning previous cache...'));
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }

    console.log(chalk.blue('📁 Creating temporary directory...'));
    fs.mkdirSync(TEMP_DIR, { recursive: true });

    const zipPath = path.join(TEMP_DIR, 'repo.zip');

    console.log(chalk.blue(`⬇️ Downloading private repository: \( {REPO_OWNER}/ \){REPO_NAME}`));

    const response = await axios({
      url: DOWNLOAD_URL,
      method: 'GET',
      responseType: 'stream',
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3.raw'
      },
      timeout: 60000 // 60 seconds timeout
    });

    console.log(chalk.blue('Writing ZIP to disk...'));
    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(zipPath);
      response.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    console.log(chalk.green('📦 ZIP download complete.'));

    console.log(chalk.blue('Extracting ZIP...'));
    try {
      new AdmZip(zipPath).extractAllTo(TEMP_DIR, true);
      console.log(chalk.green('✅ Extraction successful.'));
    } catch (extractError) {
      console.error(chalk.red('❌ Extraction failed:'), extractError.message);
      throw extractError;
    } finally {
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }
    }

    const pluginFolder = path.join(EXTRACT_DIR, 'plugins');
    if (fs.existsSync(pluginFolder)) {
      console.log(chalk.green('✅ Plugins folder detected.'));
    } else {
      console.log(chalk.yellow('⚠️ Plugins folder not found in extracted repo.'));
    }
  } catch (error) {
    console.error(chalk.red('❌ Download/Extract process failed:'));
    if (error.response) {
      console.error(chalk.dim(`Status: ${error.response.status}`));
      if (error.response.status === 401 || error.response.status === 403) {
        console.error(chalk.yellow('→ Likely invalid or expired GITHUB_TOKEN'));
      } else if (error.response.status === 404) {
        console.error(chalk.yellow('→ Repository not found. Check owner/name/branch'));
      }
    } else {
      console.error(error.message);
    }
    throw error;
  }
}

async function applyLocalSettings() {
  if (!fs.existsSync(LOCAL_SETTINGS)) {
    console.log(chalk.yellow('⚠️ No local config.js found. Skipping settings apply.'));
    return;
  }

  try {
    console.log(chalk.blue('Applying local config.js...'));
    fs.mkdirSync(EXTRACT_DIR, { recursive: true });
    fs.copyFileSync(LOCAL_SETTINGS, EXTRACTED_SETTINGS);
    console.log(chalk.green('🛠️ Local settings applied successfully.'));
  } catch (e) {
    console.error(chalk.red('❌ Failed to apply local config.js:'), e.message);
  }

  await delay(800);
}

function startBot() {
  console.log(chalk.cyan('🚀 Starting bot from extracted files...'));

  if (!fs.existsSync(EXTRACT_DIR)) {
    console.error(chalk.red('❌ Extracted directory missing. Cannot start bot.'));
    return;
  }

  const botIndex = path.join(EXTRACT_DIR, 'index.js');

  if (!fs.existsSync(botIndex)) {
    console.error(chalk.red('❌ Main index.js not found in extracted repository.'));
    return;
  }

  const bot = spawn('node', [botIndex], {
    cwd: EXTRACT_DIR,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' }
  });

  bot.on('close', (code) => {
    console.log(chalk.red(`💥 Bot process exited with code ${code}`));
  });

  bot.on('error', (err) => {
    console.error(chalk.red('❌ Failed to launch bot:'), err.message);
  });
}

// === EXECUTION ===
(async () => {
  try {
    await downloadAndExtract();
    await applyLocalSettings();
    startBot();
  } catch (fatalError) {
    console.error(chalk.bgRed.white(' FATAL ERROR '), fatalError);
    process.exit(1);
  }
})();
