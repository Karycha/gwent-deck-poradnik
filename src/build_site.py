"""Składa: artefakt (fragment HTML) + stronę PWA pod GitHub Pages (site/)."""
import json, os, re, hashlib
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tpl = open(os.path.join(ROOT, "tools/template.html"), encoding="utf8").read()
data = open(os.path.join(ROOT, "data.json"), encoding="utf8").read().replace("</", "<\\/")
VERSION = open(os.path.join(ROOT, "tools/VERSION")).read().strip()
quests_js = open(os.path.join(ROOT, "tools/quests.js"), encoding="utf8").read()
desk_js = open(os.path.join(ROOT, "tools/desktop.js"), encoding="utf8").read()
page = tpl.replace("/*__QUESTS__*/", quests_js).replace("/*__DESKTOP__*/", desk_js).replace("__DATA__", data).replace("__VERSION__", VERSION).replace("__BM__", json.dumps(open(os.path.join(ROOT, "tools/bookmarklet.txt")).read()))

# 1) artefakt
open(os.path.join(ROOT, "warsztat-gwinta.html"), "w", encoding="utf8").write(page)

# 2) GitHub Pages
site = os.path.join(ROOT, "site"); os.makedirs(os.path.join(site, "icons"), exist_ok=True)
title = re.search(r"<title>.*?</title>", page).group(0)
body = page.replace(title, "", 1)
head_bits = []
# przenieś <meta>/<link>/<style> do <head>
for m in re.finditer(r"<meta[^>]*>|<link[^>]*>|<style>.*?</style>", body, re.S):
    head_bits.append(m.group(0))
for b in head_bits: body = body.replace(b, "", 1)
doc = ("<!doctype html><html lang=\"pl\"><head><meta charset=\"utf-8\">"
       "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">"
       + title + "".join(head_bits) +
       "<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>"
       "</head><body>" + body.strip() + "</body></html>")
open(os.path.join(site, "index.html"), "w", encoding="utf8").write(doc)

ver = VERSION + "-" + hashlib.sha1(doc.encode()).hexdigest()[:8]
json.dump({"version": VERSION}, open(os.path.join(site, "version.json"), "w"))
manifest = {
  "name": "Warsztat Gwinta", "short_name": "Gwint", "lang": "pl",
  "description": "Kolekcja kart Gwinta, decki z mety, braki i poradnik.",
  "start_url": "./", "scope": "./", "display": "standalone",
  "background_color": "#11141A", "theme_color": "#11141A",
  "icons": [
    {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
    {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
    {"src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}
  ]
}
json.dump(manifest, open(os.path.join(site, "manifest.webmanifest"), "w"), ensure_ascii=False, indent=2)
sw = f"""const CACHE='gwint-{ver}';
const FILES=['./','./index.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',e=>{{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))}});
self.addEventListener('activate',e=>{{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))}});
self.addEventListener('fetch',e=>{{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  if(u.origin===location.origin){{
    if(u.pathname.endsWith('version.json'))return;
    e.respondWith(fetch(e.request,{{cache:'no-store'}}).then(r=>{{const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));return r}}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
  }}else if(u.hostname.endsWith('gstatic.com')||u.hostname.endsWith('googleapis.com')){{
    e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{{const cp=res.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));return res}})));
  }}
}});
"""
open(os.path.join(site, "sw.js"), "w").write(sw)
open(os.path.join(site, ".nojekyll"), "w").write("")
print("artefakt:", os.path.getsize(os.path.join(ROOT, "warsztat-gwinta.html"))//1024, "KB; site/index.html:", os.path.getsize(os.path.join(site, "index.html"))//1024, "KB; wersja", ver)
