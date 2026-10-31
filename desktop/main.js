'use strict';
// Warsztat Gwinta – aplikacja na komputer.
// - pokazuje apkę z GitHub Pages (aktualizuje się sama),
// - czyta log klienta Gwinta (tylko odczyt pliku) i zapisuje mecze oraz zadania,
// - synchronizuje kolekcję z playgwent.com po zalogowaniu w oknie GOG.
const { app, BrowserWindow, ipcMain, Notification, shell, Menu, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { GwentLogParser } = require('./logparser');

const APP_URL = 'https://karycha.github.io/gwent-deck-poradnik/';
const BUILDER_URL = 'https://www.playgwent.com/pl/decks/builder';
const LOG_DIR = path.join(os.homedir(), 'AppData', 'LocalLow', 'CDProjektRED', 'Gwent');
const FAC = { NG: 'Nilfgaard', MO: 'Potwory', NR: 'Królestwa Północy', ST: "Scoia'tael", SK: 'Skellige', SY: 'Syndykat' };

if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null;
let store = { matches: {}, quests: {}, defs: {}, oppTags: {}, self: null, lastLogin: 0, lastSync: 0, syncCount: 0, syncStatus: 'idle' };
const storeFile = () => path.join(app.getPath('userData'), 'store.json');
function loadStore() {
  try { store = Object.assign(store, JSON.parse(fs.readFileSync(storeFile(), 'utf8'))); } catch (e) {}
  try { const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'quest-defs.json'), 'utf8')); for (const k in seed) if (!store.defs[k]) store.defs[k] = seed[k]; } catch (e) {}
}
let saveT = null;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { fs.writeFileSync(storeFile(), JSON.stringify(store)); } catch (e) {} }, 500); }

// ---------- zadania ----------
function defScore(q) { return (q.ids ? 4 : 0) + (q.sets && q.sets.length ? 2 : 0) + (q.factions && q.factions.length ? 1 : 0) + (q.cat ? 1 : 0) + (q.ctype ? 1 : 0) + (q.minCards ? 2 : 0); }
function upsertQuest(q, fromLogin) {
  if (!q || q.kind === 'reward_tree_quest') return;
  if (q.defId) {
    const d = store.defs[q.defId];
    if (!d || defScore(q) > defScore(d)) { const { id, state, cur, modified, seen, ...def } = q; store.defs[q.defId] = def; }
  }
  const old = store.quests[q.id];
  if (old && old.modified > q.modified && !fromLogin) return;
  const n = Object.assign({}, old || {}, { id: q.id, defId: q.defId, kind: q.kind, state: q.state, type: q.type, value: q.value, cur: q.cur, modified: Math.max(q.modified || 0, (old && old.modified) || 0) });
  if (fromLogin) { n.seen = q.modified; if (q.modified > store.lastLogin) store.lastLogin = q.modified; }
  store.quests[q.id] = n;
}
function currentQuests() {
  const out = [];
  for (const q of Object.values(store.quests)) {
    const current = (q.seen && q.seen >= store.lastLogin - 120000) || q.modified > store.lastLogin;
    if (!current) continue;
    const d = store.defs[q.defId] || {};
    out.push(Object.assign({}, d, q));
  }
  return out;
}

// ---------- log ----------
const parsers = {};       // nazwa pliku -> {parser, offset}
let initialScan = true;
const appStart = Date.now();
function onMatch(m) {
  if (!m.id) return;
  const isNew = !store.matches[m.id] || !store.matches[m.id].result;
  store.matches[m.id] = { id: m.id, start: m.start, end: m.end, mode: m.mode, players: m.players, faction: m.faction, result: m.result, xp: m.xp, level: m.level, rank: m.rank, quests: m.quests || [], rating: m.rating, srank: m.srank, mmr: m.mmr, gold: m.gold };
  save();
  if (!initialScan && isNew && m.end > appStart && m.result) {
    notifyMatch(store.matches[m.id]);
    setTimeout(() => syncCollection(false), 20000);   // nowe karty po meczu
  }
  pushState();
}
let live = null;
function onLive(d) {
  if (d.phase === 'end') { live = null; }
  else { live = Object.assign({}, live && live.start === d.start ? live : {}, d); }
  if (!initialScan) pushState();
}
function oppOf(m) { const n = Object.values(m.players || {}); return n.find(x => x !== store.self) || n[0] || '?'; }
function notifyMatch(m) {
  if (!Notification.isSupported()) return;
  const res = m.result === 'W' ? 'Wygrana' : m.result === 'L' ? 'Przegrana' : 'Remis';
  const mins = Math.max(1, Math.round((m.end - m.start) / 60000));
  const n = new Notification({ title: `${res} · ${FAC[m.faction] || ''} vs ${oppOf(m)}`, body: `${mins} min${m.xp ? ' · +' + m.xp + ' XP' : ''}${m.quests && m.quests.length ? ' · zaliczone zadania: ' + m.quests.length : ''}\nKliknij, żeby zobaczyć podsumowanie.` });
  n.on('click', () => { if (win) { win.show(); win.focus(); win.webContents.send('show', { view: 'mecze', id: m.id }); } });
  n.show();
}
function scanLogs() {
  let files = [];
  try { files = fs.readdirSync(LOG_DIR).filter(f => /^GwentClient-.*\.log$/i.test(f)); } catch (e) { store.logFound = false; return; }
  store.logFound = true;
  files.sort((a, b) => fs.statSync(path.join(LOG_DIR, a)).mtimeMs - fs.statSync(path.join(LOG_DIR, b)).mtimeMs);
  for (const f of files) {
    const p = path.join(LOG_DIR, f);
    let size; try { size = fs.statSync(p).size; } catch (e) { continue; }
    let st = parsers[f];
    if (!st) {
      st = parsers[f] = { offset: 0, parser: new GwentLogParser(f, {
        match: onMatch,
        quest: q => { upsertQuest(q, false); save(); pushState(); },
        activeQuest: q => { upsertQuest(q, true); save(); },
        self: n => { if (store.self !== n) { store.self = n; save(); } },
        live: onLive,
      }) };
    }
    if (size < st.offset) st.offset = 0;
    if (size > st.offset) {
      try {
        const fd = fs.openSync(p, 'r'); const len = size - st.offset; const buf = Buffer.alloc(len);
        fs.readSync(fd, buf, 0, len, st.offset); fs.closeSync(fd);
        st.offset = size; st.parser.feed(buf.toString('utf8'));
      } catch (e) {}
    }
  }
  if (live && Date.now() - live.start > 45 * 60000) { live = null; pushState(); }
  if (initialScan) { initialScan = false; pushState(); }
}

// ---------- synchronizacja kolekcji ----------
let syncWin = null;
function syncCollection(show) {
  if (syncWin && !syncWin.isDestroyed()) { if (show) { syncWin.show(); syncWin.focus(); } return; }
  store.syncStatus = 'syncing'; pushState();
  syncWin = new BrowserWindow({ show: !!show, width: 1100, height: 820, title: 'Zaloguj się do GOG – Warsztat Gwinta', autoHideMenuBar: true,
    webPreferences: { partition: 'persist:gog', contextIsolation: true, nodeIntegration: false } });
  const w = syncWin;
  const timeout = setTimeout(() => { if (!w.isDestroyed() && !w.isVisible()) { store.syncStatus = 'error'; pushState(); w.close(); } }, 60000);
  w.webContents.setWindowOpenHandler(({ url }) => { w.loadURL(url); return { action: 'deny' }; });
  w.webContents.on('did-finish-load', async () => {
    const url = w.webContents.getURL();
    if (!/playgwent\.com\/[a-z-]+\/decks\/builder/.test(url)) return;
    let ids = null;
    try { ids = await w.webContents.executeJavaScript(`(()=>{const r=document.getElementById('root');if(!r||!r.dataset.state)return null;const s=JSON.parse(r.dataset.state);return s.user_cards||null})()`); } catch (e) {}
    if (ids && ids.length) {
      clearTimeout(timeout);
      store.lastSync = Date.now(); store.syncCount = new Set(ids).size; store.syncStatus = 'ok'; save();
      if (win) win.webContents.send('collection', ids);
      pushState(); w.close();
    } else if (!w.isVisible()) {
      clearTimeout(timeout); store.syncStatus = 'login'; pushState(); w.close();
    }
  });
  w.on('closed', () => { if (syncWin === w) syncWin = null; if (store.syncStatus === 'syncing') { store.syncStatus = store.lastSync ? 'ok' : 'login'; pushState(); } });
  w.loadURL(BUILDER_URL);
}

// ---------- okno ----------
function statePayload() {
  return { version: app.getVersion(), self: store.self, logFound: !!store.logFound, logDir: LOG_DIR,
    matches: Object.values(store.matches).filter(m => m.result).sort((a, b) => b.start - a.start).slice(0, 500),
    oppTags: store.oppTags, quests: currentQuests(), live, lastSync: store.lastSync, syncCount: store.syncCount, syncStatus: store.syncStatus };
}
let pushT = null;
function pushState() { clearTimeout(pushT); pushT = setTimeout(() => { if (win && !win.isDestroyed()) win.webContents.send('state', statePayload()); }, 150); }

function createWindow() {
  win = new BrowserWindow({ width: 1200, height: 900, minWidth: 420, title: 'Warsztat Gwinta', backgroundColor: '#11141A', autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, partition: 'persist:app' } });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(APP_URL) && !url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); } });
  let failed = false;
  win.webContents.on('did-fail-load', (e, code, desc, url, isMain) => { if (isMain && !failed) { failed = true; win.loadFile(path.join(__dirname, 'app', 'index.html')); } });
  win.loadURL(APP_URL + '?desktop=1');
  win.on('closed', () => { win = null; });
}

ipcMain.handle('state', () => statePayload());
ipcMain.on('sync', (e, opts) => syncCollection(!!(opts && opts.show)));
ipcMain.handle('tagOpp', (e, id, f) => { if (f) store.oppTags[id] = f; else delete store.oppTags[id]; save(); pushState(); return true; });
ipcMain.on('openLogDir', () => shell.openPath(LOG_DIR));
ipcMain.on('logout', async () => {
  const { session } = require('electron');
  await session.fromPartition('persist:gog').clearStorageData();
  store.lastSync = 0; store.syncStatus = 'login'; save(); pushState();
});

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  nativeTheme.themeSource = 'dark';
  app.setAppUserModelId('pl.karys.warsztatgwinta');
  loadStore();
  createWindow();
  scanLogs();
  setInterval(scanLogs, 3000);
  setTimeout(() => syncCollection(false), 4000);
  setInterval(() => syncCollection(false), 30 * 60 * 1000);
  if (app.isPackaged) {
    try { const { autoUpdater } = require('electron-updater'); autoUpdater.checkForUpdatesAndNotify().catch(() => {}); setInterval(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 6 * 3600 * 1000); } catch (e) {}
  }
});
app.on('window-all-closed', () => app.quit());
