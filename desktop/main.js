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
const vision = require('./vision');

const APP_URL = 'https://karycha.github.io/gwent-deck-poradnik/';
const BUILDER_URL = 'https://www.playgwent.com/pl/decks/builder';
const LOG_DIR = path.join(os.homedir(), 'AppData', 'LocalLow', 'CDProjektRED', 'Gwent');
const FAC = { NG: 'Nilfgaard', MO: 'Potwory', NR: 'Królestwa Północy', ST: "Scoia'tael", SK: 'Skellige', SY: 'Syndykat' };

if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null;
let store = { matches: {}, quests: {}, defs: {}, oppTags: {}, self: null, lastLogin: 0, lastSync: 0, syncCount: 0, syncStatus: 'idle', decksRaw: null, stateKeys: null, settings: { overlay: true, remind: true, ai: true, aiModel: null }, overlayPos: null, lastRemind: '' };
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
  store.matches[m.id] = { id: m.id, start: m.start, end: m.end, mode: m.mode, players: m.players, faction: m.faction, result: m.result, xp: m.xp, level: m.level, rank: m.rank, quests: m.quests || [], rating: m.rating, srank: m.srank, mmr: m.mmr, gold: m.gold, roundEnds: m.roundEnds };
  save();
  if (!initialScan && isNew && m.end > appStart && m.result) {
    notifyMatch(store.matches[m.id]);
    setTimeout(() => syncCollection(false), 20000);   // nowe karty po meczu
  }
  pushState();
}
let live = null;
let lastEndedId = null;
function onLive(d) {
  if (d.phase === 'end') { live = null; lastEndedId = d.id || null; lastHandKey = ''; }
  else { live = Object.assign({}, live && live.start === d.start ? live : {}, d); if (!initialScan) { scoutLive(); if (d.phase === 'gold' || d.phase === 'start') prewarm(); } }
  if (!initialScan) { pushState(); updateOverlay(d.phase === 'end'); }
}

// ---------- profil rywala (publiczna strona playgwent.com) ----------
let scoutBusy = null;
function scoutLive() {
  if (!live || !live.players) return;
  const opp = Object.values(live.players).find(n => n && n !== store.self);
  if (opp) scout(opp);
}
function scout(nick) {
  store.scout = store.scout || {};
  const c = store.scout[nick];
  if (c && Date.now() - c.t < 3600000) return;
  if (scoutBusy === nick) return; scoutBusy = nick;
  const w = new BrowserWindow({ show: false, webPreferences: { partition: 'persist:scout', contextIsolation: true, nodeIntegration: false, javascript: true } });
  const done = text => {
    clearTimeout(to); if (scoutBusy === nick) scoutBusy = null;
    if (text) {
      store.scout[nick] = { t: Date.now(), text: text.slice(0, 6000) };
      const ks = Object.keys(store.scout).sort((a, b) => store.scout[b].t - store.scout[a].t); ks.slice(80).forEach(k => delete store.scout[k]);
      save(); pushState();
    }
    if (!w.isDestroyed()) w.close();
  };
  const to = setTimeout(() => done(null), 30000);
  w.webContents.on('did-finish-load', async () => { let t = null; try { t = await w.webContents.executeJavaScript('document.body.innerText'); } catch (e) {} done(t); });
  w.webContents.on('did-fail-load', () => done(null));
  w.loadURL('https://www.playgwent.com/pl/profile/' + encodeURIComponent(nick));
}

// ---------- okienko na wierzchu ----------
let ovl = null, ovlHideT = null, ovlDismissed = null;
function updateOverlay(ended) {
  if (!store.settings.overlay) { closeOverlay(); return; }
  if (live) {
    if (ovlDismissed === live.start) return;
    clearTimeout(ovlHideT); openOverlay();
  } else if (ended && ovl && !ovl.isDestroyed()) {
    clearTimeout(ovlHideT); ovlHideT = setTimeout(closeOverlay, 25000);
  }
}
function openOverlay() {
  if (ovl && !ovl.isDestroyed()) { if (!ovl.isVisible()) ovl.showInactive(); return; }
  const { screen } = require('electron');
  const wa = screen.getPrimaryDisplay().workArea;
  const W = 340, H = 300;
  const pos = store.overlayPos || { x: wa.x + wa.width - W - 16, y: wa.y + 80 };
  ovl = new BrowserWindow({ x: pos.x, y: pos.y, width: W, height: H, minWidth: 260, minHeight: 120, frame: false, resizable: true, alwaysOnTop: true, skipTaskbar: true, show: false,
    backgroundColor: '#11141A', title: 'Warsztat Gwinta – mecz', focusable: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, partition: 'persist:app' } });
  ovl.setAlwaysOnTop(true, 'screen-saver');
  ovl.setVisibleOnAllWorkspaces(true);
  ovl.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  ovl.webContents.on('will-navigate', e => e.preventDefault());
  ovl.once('ready-to-show', () => ovl.showInactive());
  ovl.on('moved', () => { if (ovl && !ovl.isDestroyed()) { const b = ovl.getBounds(); store.overlayPos = { x: b.x, y: b.y }; save(); } });
  ovl.on('closed', () => { ovl = null; });
  ovl.loadURL(APP_URL + '?desktop=1&overlay=1');
}
function closeOverlay() { clearTimeout(ovlHideT); if (ovl && !ovl.isDestroyed()) ovl.close(); ovl = null; }

// ---------- czytanie ekranu wymiany kart ----------
let visBusy = false, liveDeckIds = null, liveDeckFor = null, lastHandKey = '';
async function visionTick() {
  if (visBusy || !live || !store.settings.ai) return;
  visBusy = true;
  try {
    const img = await vision.capture();
    if (!img) return;
    const m = vision.findMulligan(img);
    if (m.teal < 200 || m.boxes.length < 3) return;
    let faction = '';
    try { await vision.loadCards(); faction = vision.factionOfEn(live.gold); } catch (e) {}
    const deck = liveDeckFor === live.start ? liveDeckIds : null;
    const hand = await vision.recognize(img, m.boxes, { deck, faction });
    const key = hand.map(h => h.id).join(',');
    if (key !== lastHandKey && live) {
      lastHandKey = key;
      live.hand = hand; live.handAt = Date.now(); live.handRound = live.round || 1;
      pushState();
    }
  } catch (e) {
  } finally { visBusy = false; }
}
async function prewarm() {
  try {
    if (!live) return; await vision.loadCards();
    const deck = liveDeckFor === live.start ? liveDeckIds : null;
    const ids = await vision.candidates({ deck, faction: vision.factionOfEn(live.gold) });
    vision.ensureSigs(ids);
  } catch (e) {}
}

// ---------- przypomnienia o zadaniach ----------
function remindQuests() {
  if (!store.settings.remind || !Notification.isSupported()) return;
  const now = new Date(); const day = now.toISOString().slice(0, 10);
  if (now.getHours() < 19 || store.lastRemind === day) return;
  const left = currentQuests().filter(q => q.kind === 'daily_quest' && (q.cur || 0) < (q.value || 1));
  if (!left.length) return;
  store.lastRemind = day; save();
  const txt = left.map(q => { const n = (q.value || 1) - (q.cur || 0); const f = q.factions && q.factions.length === 1 ? ' ' + (FAC[q.factions[0]] || '') : '';
    return q.type === 'finish_game' ? `${n}× wygrana${f}` : `${n} kart do zagrania`; }).join(', ');
  const n = new Notification({ title: 'Niezrobione zadania dzienne', body: txt + '\nKliknij, żeby zobaczyć plan.' });
  n.on('click', () => { if (win) { win.show(); win.focus(); win.webContents.send('show', { view: 'zadania' }); } });
  n.show();
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
  if (live && Date.now() - live.start > 45 * 60000) { live = null; pushState(); closeOverlay(); }
  if (initialScan) { initialScan = false; pushState(); if (live) { updateOverlay(false); scoutLive(); } }
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
    let res = null;
    try { res = await w.webContents.executeJavaScript(`(()=>{const r=document.getElementById('root');if(!r||!r.dataset.state)return null;const s=JSON.parse(r.dataset.state);const d=s.builder_decks||s.user_decks||null;return {cards:s.user_cards||null,decks:d,keys:Object.keys(s)}})()`); } catch (e) {}
    ids = res && res.cards;
    if (res && res.keys) store.stateKeys = res.keys;
    if (res && Array.isArray(res.decks) && res.decks.length) { const j = JSON.stringify(res.decks); if (j.length < 1500000) store.decksRaw = res.decks; }
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
    oppTags: store.oppTags, quests: currentQuests(), live, lastEnded: lastEndedId, scout: store.scout || {}, decksRaw: store.decksRaw, stateKeys: store.stateKeys, settings: store.settings, lastSync: store.lastSync, syncCount: store.syncCount, syncStatus: store.syncStatus };
}
let pushT = null;
function pushState() { clearTimeout(pushT); pushT = setTimeout(() => { const p = statePayload(); if (win && !win.isDestroyed()) win.webContents.send('state', p); if (ovl && !ovl.isDestroyed()) ovl.webContents.send('state', p); }, 150); }

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
ipcMain.on('liveDeck', (e, ids) => { if (live && Array.isArray(ids)) { liveDeckIds = ids.map(String); liveDeckFor = live.start; prewarm(); } });
ipcMain.handle('aiStatus', async () => { const models = await vision.ollamaModels(); return { models, model: vision.pickModel(models, store.settings.aiModel), ai: store.settings.ai }; });
ipcMain.handle('aiAsk', async (e, req) => { const models = await vision.ollamaModels(); const model = vision.pickModel(models, store.settings.aiModel);
  if (!model) return { error: models ? 'no-model' : 'no-ollama' }; const out = await vision.ask(model, String(req.system || ''), String(req.user || '')); return Object.assign({ model }, out || {}); });
ipcMain.on('setModel', (e, m) => { store.settings.aiModel = m || null; save(); pushState(); });
ipcMain.handle('debugShot', async () => {
  const img = await vision.capture(); if (!img) return { error: 'Nie udało się zrobić zrzutu' };
  const dir = path.join(app.getPath('userData'), 'diagnostyka'); fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(dir, 'zrzut-' + stamp + '.png'), img.toPNG());
  const m = vision.findMulligan(img); let hand = null;
  try { if (m.boxes.length) hand = await vision.recognize(img, m.boxes, { deck: liveDeckFor === (live && live.start) ? liveDeckIds : null, faction: live ? vision.factionOfEn(live.gold) : '' }); } catch (e) {}
  fs.writeFileSync(path.join(dir, 'wynik-' + stamp + '.json'), JSON.stringify({ size: img.getSize(), mulligan: m, hand, live }, null, 1));
  shell.openPath(dir); return { ok: true, teal: m.teal, boxes: m.boxes.length, hand };
});
ipcMain.on('overlayHide', () => { ovlDismissed = live ? live.start : null; closeOverlay(); });
ipcMain.on('overlayShow', () => { ovlDismissed = null; openOverlay(); });
ipcMain.on('setSetting', (e, k, v) => { if (['overlay', 'remind', 'ai'].includes(k)) { store.settings[k] = !!v; save(); if (k === 'overlay') updateOverlay(false); pushState(); } });
ipcMain.on('logout', async () => {
  const { session } = require('electron');
  await session.fromPartition('persist:gog').clearStorageData();
  store.lastSync = 0; store.syncStatus = 'login'; store.decksRaw = null; save(); pushState();
});

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  nativeTheme.themeSource = 'dark';
  app.setAppUserModelId('pl.karys.warsztatgwinta');
  loadStore();
  if (store.settings.ai === undefined) store.settings.ai = true;
  vision.init(app.getPath('userData'));
  createWindow();
  scanLogs();
  setInterval(scanLogs, 3000);
  setInterval(visionTick, 2500);
  setInterval(remindQuests, 10 * 60 * 1000); setTimeout(remindQuests, 60000);
  setTimeout(() => syncCollection(false), 4000);
  setInterval(() => syncCollection(false), 30 * 60 * 1000);
  if (app.isPackaged) {
    try { const { autoUpdater } = require('electron-updater'); autoUpdater.checkForUpdatesAndNotify().catch(() => {}); setInterval(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 6 * 3600 * 1000); } catch (e) {}
  }
});
app.on('window-all-closed', () => app.quit());
