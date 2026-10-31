'use strict';
// Rozpoznawanie kart z ekranu wymiany (mulligan) i podpowiedzi z lokalnej AI (Ollama).
// Tylko zrzut ekranu okna gry – gra nie jest w żaden sposób modyfikowana.
const { desktopCapturer, nativeImage, net } = require('electron');
const fs = require('fs');
const path = require('path');

const API = 'https://www.playgwent.com/pl/decks/builder/api/search?&limit=2000&offset=0';
const ART = [0.15, 0.30, 0.85, 0.90];          // obszar grafiki karty używany do porównania
let cards = null;                               // id -> {id, name, faction, power, armour, img, group, type}
let sigs = {};                                  // id -> podpis (108 liczb, znormalizowany)
let sigFile = null, sigDirty = false;

function init(userData) {
  sigFile = path.join(userData, 'sigs.json');
  try { sigs = JSON.parse(fs.readFileSync(sigFile, 'utf8')); } catch (e) { sigs = {}; }
  setInterval(() => { if (sigDirty) { sigDirty = false; try { fs.writeFileSync(sigFile, JSON.stringify(sigs)); } catch (e) {} } }, 10000);
}

async function loadCards() {
  if (cards) return cards;
  const r = await net.fetch(API, { headers: { 'X-GOG-Cache-Control': 'no-cache' } });
  const j = await r.json();
  cards = {};
  for (const x of j) { const s = x._source; if (!s || !s.preview_img_path) continue;
    cards[String(s.id)] = { id: String(s.id), name: (s.translations && s.translations.pl && s.translations.pl.name) || s.name, faction: s.faction, power: s.power, armour: s.armour, img: s.preview_img_path.big, group: s.card_group, en: s.name }; }
  return cards;
}

// podpis obrazu: wycinek -> 60x60 -> średnie z bloków 6x6 (RGB) -> normalizacja
function signature(img, box) {
  const s = img.getSize();
  const x = Math.round(s.width * box[0]), y = Math.round(s.height * box[1]);
  const w = Math.max(6, Math.round(s.width * (box[2] - box[0]))), h = Math.max(6, Math.round(s.height * (box[3] - box[1])));
  const b = img.crop({ x, y, width: w, height: h }).resize({ width: 60, height: 60, quality: 'better' }).toBitmap();
  const v = new Array(108).fill(0);
  for (let yy = 0; yy < 60; yy++) for (let xx = 0; xx < 60; xx++) {
    const o = (Math.floor(yy / 10) * 6 + Math.floor(xx / 10)) * 3, i = (yy * 60 + xx) * 4;
    v[o] += b[i]; v[o + 1] += b[i + 1]; v[o + 2] += b[i + 2];
  }
  const m = v.reduce((a, c) => a + c, 0) / v.length;
  const d = v.map(t => t - m); const n = Math.sqrt(d.reduce((a, c) => a + c * c, 0)) || 1;
  return d.map(t => Math.round(t / n * 10000) / 10000);
}
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

async function ensureSigs(ids) {
  await loadCards();
  const need = ids.filter(id => cards[id] && !sigs[id]);
  let k = 0;
  async function worker() {
    while (k < need.length) {
      const id = need[k++];
      try { const r = await net.fetch('https://www.playgwent.com' + cards[id].img); const buf = Buffer.from(await r.arrayBuffer());
        const im = nativeImage.createFromBuffer(buf); if (!im.isEmpty()) { sigs[id] = signature(im, ART); sigDirty = true; } } catch (e) {}
    }
  }
  await Promise.all([1, 2, 3, 4, 5, 6].map(worker));
}
// kandydaci: talia gracza albo frakcja (+ neutralne); kod frakcji z API: 0 neutralne
const FACNUM = { NG: 2, MO: 1, NR: 3, ST: 4, SK: 5, SY: 6 };
async function candidates(opts) {
  await loadCards();
  if (opts.deck && opts.deck.length >= 10) return opts.deck.map(String).filter(id => cards[id]);
  const fn = opts.faction && FACNUM[opts.faction];
  return Object.values(cards).filter(c => fn ? (c.faction === fn || c.faction === 0) : true).map(c => c.id);
}

// zrzut okna gry (albo ekranu, gdy okna nie widać)
async function capture() {
  let s = null;
  try {
    const ws = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 1920, height: 1080 }, fetchWindowIcons: false });
    s = ws.find(x => /gwent|gwint/i.test(x.name) && !/warsztat/i.test(x.name));
    if (!s) { const sc = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } }); s = sc[0]; }
  } catch (e) { return null; }
  return s && !s.thumbnail.isEmpty() ? s.thumbnail : null;
}

// ekran wymiany: turkusowe pole po lewej + siatka kart
function findMulligan(img) {
  const S = img.getSize(); const W = 480, H = 270;
  const b = img.resize({ width: W, height: H, quality: 'good' }).toBitmap();
  const px = (x, y) => { const i = (y * W + x) * 4; return [b[i + 2], b[i + 1], b[i]]; }; // BGRA -> RGB
  let teal = 0;
  for (let y = 96; y < 174; y++) for (let x = 70; x < 122; x++) { const [r, g, bl] = px(x, y); if (g > r + 50 && bl > r + 40) teal++; }
  const g = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; g[y * W + x] = (b[i] + b[i + 1] + b[i + 2]) / 3; }
  const E = (x, y) => Math.abs(g[y * W + x + 1] - g[y * W + x]) + Math.abs(g[(y + 1) * W + x] - g[y * W + x]) > 10;
  const x0 = Math.floor(W * 0.33), x1 = Math.floor(W * 0.88), y0 = Math.floor(H * 0.17), y1 = Math.floor(H * 0.83);
  const bands = []; let inb = false, st = 0;
  for (let y = y0; y < y1; y++) { let c = 0; for (let x = x0; x < x1; x++) if (E(x, y)) c++; const on = c / (x1 - x0) > 0.25;
    if (on && !inb) { st = y; inb = true; } if (!on && inb) { bands.push([st, y]); inb = false; } }
  if (inb) bands.push([st, y1]);
  const boxes = [];
  for (const [a, z] of bands) {
    if (z - a < 30) continue;
    let inS = false, sx = 0;
    for (let x = x0; x <= x1; x++) { let c = 0; if (x < x1) for (let y = a; y < z; y++) if (E(x, y)) c++; const on = x < x1 && c / (z - a) > 0.3;
      if (on && !inS) { sx = x; inS = true; } if (!on && inS) { inS = false; const w = x - sx, h = z - a; if (w > 25 && w / h > 0.5 && w / h < 0.85) boxes.push([sx, a, w, h]); } }
  }
  const fx = S.width / W, fy = S.height / H;
  return { teal, boxes: boxes.map(([x, y, w, h]) => ({ x: Math.round(x * fx), y: Math.round(y * fy), width: Math.round(w * fx), height: Math.round(h * fy) })) };
}

async function recognize(img, boxes, opts) {
  const ids = await candidates(opts);
  await ensureSigs(ids);
  const pool = ids.filter(id => sigs[id]);
  return boxes.map(bx => {
    const s = signature(img.crop(bx), ART);
    let best = null, bs = -2, second = -2;
    for (const id of pool) { const v = dot(s, sigs[id]); if (v > bs) { second = bs; bs = v; best = id; } else if (v > second) second = v; }
    return { id: best, name: best && cards[best] ? cards[best].name : '?', score: Math.round(bs * 100) / 100, margin: Math.round((bs - second) * 100) / 100 };
  });
}

// ---------- Ollama ----------
const OLLAMA = 'http://127.0.0.1:11434';
async function ollamaModels() {
  try { const r = await net.fetch(OLLAMA + '/api/tags'); const j = await r.json(); return (j.models || []).map(m => m.name); } catch (e) { return null; }
}
function pickModel(list, pref) {
  if (!list || !list.length) return null;
  if (pref && list.includes(pref)) return pref;
  const order = [/qwen2\.5:(7|14)b/, /qwen3/, /llama3\.1/, /gemma3/, /mistral/, /llama3/, /qwen/];
  for (const re of order) { const m = list.find(n => re.test(n) && !/embed|vision|vl/.test(n)); if (m) return m; }
  return list.find(n => !/embed/.test(n)) || null;
}
async function ask(model, system, user) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 90000);
  try {
    const r = await net.fetch(OLLAMA + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
      body: JSON.stringify({ model, stream: false, format: 'json', options: { temperature: 0.2, num_ctx: 4096 }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
    const j = await r.json(); clearTimeout(t);
    let out = null; try { out = JSON.parse(j.message && j.message.content); } catch (e) { out = { plan: j.message && j.message.content }; }
    return out;
  } catch (e) { clearTimeout(t); return { error: String(e && e.message || e) }; }
}

function factionOfEn(en) { if (!cards || !en) return ''; const c = Object.values(cards).find(x => x.en === en); const m = { 1: 'MO', 2: 'NG', 3: 'NR', 4: 'ST', 5: 'SK', 6: 'SY' }; return c ? (m[c.faction] || '') : ''; }
module.exports = { factionOfEn, init, capture, findMulligan, recognize, ensureSigs, candidates, loadCards, ollamaModels, pickModel, ask, getCards: () => cards };
