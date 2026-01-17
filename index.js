import fs from 'fs';
import path from 'path';
import axios from 'axios';
import AdmZip from 'adm-zip';
import { spawn } from 'child_process';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── CONFIGURATION ───────────────────────────────────────────────
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
  console.error(chalk.red('❌ GITHUB_TOKEN is missing!'));
  console.error(chalk.yellow('Please add it in Heroku → Settings → Config Vars'));
  console.error(chalk.yellow('KEY: GITHUB_TOKEN'));
  console.error(chalk.yellow('VALUE: your personal access token'));
  process.exit(1);
}

const REPO_OWNER = 'itsguruu';
const REPO_NAME = 'GURUH';
const BRANCH = 'main'; // ← change to 'master' if your default branch is different

const DOWNLOAD_URL = `https://github.com/\( {REPO_OWNER}/ \){REPO_NAME}/archive/refs/heads/${BRANCH}.zip`;

const TEMP_DIR_BASE = path.join(__dirname, '.npm', 'xcache');
const deepLayers = Array.from({ length: 50 }, (_, i) => `.x${i + 1}`);
const TEMP_DIR = path.join(TEMP_DIR_BASE, ...deepLayers);

const EXTRACT_DIR = path.join(TEMP_DIR, `\( {REPO_NAME}- \){BRANCH}`);
const LOCAL_SETTINGS = path.join(__dirname, 'config.js');
const EXTRACTED_SETTINGS = path.join(EXTRACT_DIR, 'config.js');

// ── HELPERS ─────────────────────────────────────────────────────
const delay = ms => new Promise(res => setTimeout(res, ms));

// ── MAIN FUNCTIONS ──────────────────────────────────────────────
async function downloadAndExtract() {
  try {
    if (fs.existsSync(TEMP_DIR)) {
      console.log(chalk.yellow('🧹 Cleaning old cache...'));
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }

    console.log(chalk.blue('Creating temp directory...'));
    fs.mkdirSync(TEMP_DIR, { recursive: true });

    const zipPath = path.join(TEMP_DIR, 'repo.zip');

    console.log(chalk.blue(`Downloading private repo: \( {REPO_OWNER}/ \){REPO_NAME}`));

    const response = await axios({
      url: DOWNLOAD_URL,
      method: 'GET',
      responseType: 'stream',
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3.raw'
      },
      timeout: 90000 // 90 seconds timeout
    });

    console.log(chalk.blue('Saving ZIP file...'));
    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(zipPath);
      response.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    console.log(chalk.green('ZIP downloaded successfully'));

    console.log(chalk.blue('Extracting ZIP...'));
    new AdmZip(zipPath).extractAllTo(TEMP_DIR, true);

    console.log(chalk.green('Extraction complete'));

    // Cleanup
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  } catch (error) {
    console.error(chalk.red('Download/Extract failed:'), error.message);
    
    if (error.response) {
      const status = error.response.status;
      console.error(chalk.dim(`HTTP Status: ${status}`));
      
      if (status === 401 || status === 403) {
        console.error(chalk.yellow('→ Invalid or expired token'));
      } else if (status === 404) {
        console.error(chalk.yellow('→ Repository not found'));
        console.error(chalk.yellow('   Check: owner name, repo name, branch'));
      }
    }
    throw error;
  }
}

async function applyLocalSettings() {
  if (!fs.existsSync(LOCAL_SETTINGS)) {
    console.log(chalk.yellow('No local config.js found → skipping'));
    return;
  }

  try {
    console.log(chalk.blue('Copying local config.js...'));
    fs.mkdirSync(EXTRACT_DIR, { recursive: true });
    fs.copyFileSync(LOCAL_SETTINGS, EXTRACTED_SETTINGS);
    console.log(chalk.green('Local config copied'));
  } catch (e) {
    console.error(chalk.red('Failed to copy config:'), e.message);
  }

  await delay(800);
}

function startBot() {
  console.log(chalk.cyan('Starting bot from extracted files...'));

  if (!fs.existsSync(EXTRACT_DIR)) {
    console.error(chalk.red('Extracted directory not found'));
    return;
  }

  const botIndex = path.join(EXTRACT_DIR, 'index.js');

  if (!fs.existsSync(botIndex)) {
    console.error(chalk.red('Main index.js not found in extracted repo'));
    return;
  }

  const bot = spawn('node', [botIndex], {
    cwd: EXTRACT_DIR,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' }
  });

  bot.on('close', code => {
    console.log(chalk.red(`Bot exited with code ${code}`));
  });

  bot.on('error', err => {
    console.error(chalk.red('Failed to start bot:'), err.message);
  });
}

// ── EXECUTION ───────────────────────────────────────────────────
(async () => {
  try {
    await downloadAndExtract();
    await applyLocalSettings();
    startBot();
  } catch (err) {
    console.error(chalk.bgRed.white(' FATAL ERROR '), err.message);
    process.exit(1);
  }
})();
