const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const PANEL_ID = '4091B6ED260DB71319767EFD24A46F55'; // legacy compatibility only
const PROJECT_ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'adjustment_history.json');
const today = new Date().toISOString().slice(0, 10);
const SNAPSHOTS_DIR = path.join(DATA_DIR, 'snapshots');
const LOG_FILE = path.join(SNAPSHOTS_DIR, 'auto_run_' + today + '.log');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SNAPSHOTS_DIR)) fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });


function findBrowserPageId(predicate, errorMessage) {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const tabs = JSON.parse(data);
          const page = tabs.find(predicate);
          if (!page?.id) {
            reject(new Error(errorMessage));
            return;
          }
          resolve(page.id);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

function findAdPageId() {
  return findBrowserPageId(
    tab => tab.url && tab.url.startsWith('https://adv.yswg.com.cn/'),
    'Cannot find adv.yswg.com.cn page on Chrome debug port 9222. Open the ad backend first.'
  );
}

function findPanelId() {
  return findBrowserPageId(
    tab => tab.url && tab.url.includes('panel.html') && tab.url.includes('chrome-extension'),
    'Cannot find extension panel page. This path is deprecated; use the ad backend page bridge.'
  );
}

async function createPanelWs() {
  const panelId = await findPanelId();
  return new WebSocket(`ws://127.0.0.1:9222/devtools/page/${panelId}`);
}

async function createAdPageWs() {
  const pageId = await findAdPageId();
  return new WebSocket(`ws://127.0.0.1:9222/devtools/page/${pageId}`);
}

function log(msg) {
  const line = '[' + new Date().toISOString() + '] ' + msg;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function loadHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); }
  catch(e) { return []; }
}

function saveHistory(h) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(h, null, 2));
}

function hasRecentOutcome(history, predicate, outcomes, days = 7) {
  const allow = new Set(Array.isArray(outcomes) ? outcomes : [outcomes]);
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return history.some(h => h && h.date >= cutoff && allow.has(h.outcome) && predicate(h));
}

module.exports = {
  log,
  loadHistory,
  saveHistory,
  hasRecentOutcome,
  PANEL_ID,
  LOG_FILE,
  SNAPSHOTS_DIR,
  today,
  findAdPageId,
  findPanelId,
  createAdPageWs,
  createPanelWs,
};

