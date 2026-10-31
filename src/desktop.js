// --- aplikacja na komputer (Electron): mecze z logu gry, zadania z gry, auto-synchronizacja kolekcji ---
var DESK=(typeof window!=="undefined"&&window.gwentDesktop)||null;
var DS=null;            // stan z aplikacji: mecze, zadania, synchronizacja
let gqCache=null;
const RELEASES="https://github.com/Karycha/gwent-deck-poradnik/releases/latest";
const CATN={2:"Konstrukt",6:"Ogroid",7:"Relikt",10:"Dziki Gon",11:"Taktyka",12:"Bestia",14:"Czarodziej",16:"Wampir",18:"Insektoid",20:"Zaklęcie",24:"Upiór",25:"Przeklęty",26:"Żołnierz",31:"Wiedźmin",32:"Kultysta",33:"Alchemia",37:"Driada",39:"Elf",40:"Trupojad",41:"Maszyna",46:"Pułapka",47:"Krasnolud",49:"Machina Oblężnicza",53:"Organiczne",63:"Smok",75:"Agent",76:"Korsarz",77:"Okręt",78:"Człowiek",79:"Rycerz",80:"Gnom",81:"Roślina",82:"Demon",83:"Bandyta",85:"Druid",86:"Wojownik",88:"Bomba",89:"Natura",90:"Drzewiec",92:"Zbrodnia",102:"Działania Wojenne",103:"Rejza",104:"Mutant",105:"Salamandra",106:"Arystokrata",107:"Scenariusz",109:"Lokalizacja",110:"Najada"};
const QKIND={daily_quest:"Dzienne",weekly_quest:"Tygodniowe",ouroboros:"Cykl",journey_quest:"Podróż",seasonal_quest:"Sezon"};
const MODEN={ranked:"Rankingowa",friend:"Ze znajomym",arena:"Arena",casual:"Zwykła",inne:"Inna"};
const RARN={Common:"C",Rare:"R",Epic:"E",Legendary:"L"};
const HKEY="gwint-gq-hidden";
function gqHidden(){try{return new Set(JSON.parse(localStorage.getItem(HKEY)||"[]"))}catch(e){return new Set()}}
function gqSetHidden(s){try{localStorage.setItem(HKEY,JSON.stringify([...s]))}catch(e){}gqCache=null}
const plGames=n=>n===1?"grę":(n%10>=2&&n%10<=4&&(n%100<10||n%100>=20))?"gry":"gier";

function gqConvert(g){
  const n=g.value||1;
  const q={src:"game",gid:g.id,defId:g.defId,kind:g.kind||"",f:(g.factions&&g.factions.length===1)?g.factions[0]:"",sets:(g.sets||[]).slice(),kw:"",cat:"",dmg:false,t:g.ctype||"",g:"",n,prog:Math.min(g.cur||0,n),text:"",min:g.minCards||0};
  if(/complete|claim|finish/i.test(g.state||""))q.prog=n;
  if(g.ids&&g.ids.length)q.ids=new Set(g.ids.map(String));
  if(g.cat)q.cat=CATN[g.cat]||"";
  if(g.rarity)q.rar=RARN[g.rarity]||"";
  if(g.type==="finish_game"){const win=(g.results||[]).some(r=>/win/i.test(r));q.k=g.minCards&&q.sets.length?"deck":win?"win":"games"}
  else if(g.type==="play_cards"){
    const known=q.ids||q.sets.length||q.cat||q.t||q.rar||q.f;
    q.k="play";
    if((g.cat&&!q.cat)||(g.cond&&!known)||(!g.cond&&!known&&g.kind!=="daily_quest"))q.k="other";
  }else q.k="other";
  return q;
}
function gameQuests(){
  if(!DS||!DS.quests)return [];
  if(gqCache)return gqCache;
  const h=gqHidden();
  const ord={daily_quest:0,weekly_quest:1,ouroboros:2};
  gqCache=DS.quests.filter(g=>g.kind!=="reward_tree_quest"&&!h.has(g.id)).map(gqConvert)
    .sort((a,b)=>(ord[a.kind]??3)-(ord[b.kind]??3)||(needLeft(a)?0:1)-(needLeft(b)?0:1)||String(a.defId).localeCompare(String(b.defId)));
  return gqCache;
}
function gqDesc(q){
  const fac=q.f?` frakcją ${FAC[q.f].n}`:"";
  if(q.k==="win")return `Wygraj ${q.n} ${plGames(q.n)}`+fac;
  if(q.k==="games")return `Rozegraj ${q.n} ${plGames(q.n)}`+fac;
  if(q.k==="other")return "Zadanie z gry (warunek do sprawdzenia w grze)";
  if(q.ids){
    const cs=[...q.ids].map(i=>CARD[i]).filter(Boolean);
    const cats={};cs.forEach(c=>{if(c.cat)cats[c.cat]=(cats[c.cat]||0)+1});
    const top=Object.entries(cats).sort((a,b)=>b[1]-a[1])[0];
    let what=cs.length<=4&&cs.length?": "+cs.map(c=>c.pl).join(", "):` z listy ${q.ids.size} kart`;
    if(top&&top[1]===cs.length&&cs.length>4)what=` typu ${top[0]}`;
    return `Zagraj ${q.n} ${q.n===1?"kartę":"kart"}${what}`+(q.f?` (${FAC[q.f].n})`:"");
  }
  return qDesc(q)+(q.rar?` (${RAR[q.rar]})`:"");
}

// --- zadania z gry w zakładce Zadania ---
function renderGameQuests(){
  const p=$("#gqPanel");if(!p)return;
  p.hidden=!DESK;if(!DESK)return;
  const all=gameQuests(),h=gqHidden();
  p.innerHTML=`<div class="row" style="justify-content:space-between"><h2>Zadania z gry</h2><span class="small muted">aktualizują się same</span></div>`;
  if(!DS||!DS.quests||!DS.quests.length){p.insertAdjacentHTML("beforeend",'<p class="empty">Uruchom Gwinta. Zadania pojawią się tu po zalogowaniu do gry i będą się odhaczać po każdym meczu.</p>');return}
  const box=document.createElement("div");box.style.cssText="display:grid;gap:10px";
  all.forEach((q,i)=>{
    const left=needLeft(q);
    const el=document.createElement("div");el.className="quest"+(left?"":" done");
    const hasF=q.ids||q.sets.length||q.cat||q.t||q.rar||q.f;
    const own=(q.k==="play"||q.k==="deck")&&hasF?Object.keys(owned).filter(k=>qMatch(CARD[k],q)):[];
    const copies=own.reduce((a,k)=>a+owned[k],0);
    el.innerHTML=`<div class="qhead"><span class="qnum">G${i+1}</span><div class="qtxt"><b></b><span class="small muted"></span></div><button class="btn ghost small qdel">Ukryj</button></div>
      <div class="prog"><div class="bar"><i style="width:${Math.round(q.prog/q.n*100)}%"></i></div><span class="score">${left?q.prog+" / "+q.n:"zrobione"}</span></div>
      ${own.length||(q.k==="play"&&hasF)?`<div class="small ${copies?"":"miss-t"}">Pasujące karty w kolekcji: <b>${own.length}</b> (${copies} kopii)</div><div class="chips qcards"></div>`:""}`;
    el.querySelector("b").textContent=gqDesc(q);
    el.querySelector(".small.muted").textContent=(QKIND[q.kind]||"Zadanie")+(q.k==="other"?" · apka nie zna jeszcze warunku tego zadania":"");
    el.querySelector(".qdel").onclick=()=>{h.add(q.gid);gqSetHidden(h);renderQuests()};
    const ch=el.querySelector(".qcards");
    if(ch){own.sort((a,b)=>CARD[a].f.localeCompare(CARD[b].f)||CARD[b].p-CARD[a].p).slice(0,16).forEach(k=>{const s=document.createElement("span");s.className="qchip";s.style.setProperty("--fc",fcol(CARD[k].f));s.textContent=(owned[k]>1?owned[k]+"× ":"")+CARD[k].pl;ch.appendChild(s)});
      if(own.length>16){const s=document.createElement("span");s.className="small muted";s.textContent=`+${own.length-16} więcej`;ch.appendChild(s)}}
    box.appendChild(el);
  });
  p.appendChild(box);
  if(h.size){const b=document.createElement("button");b.className="btn ghost small";b.textContent=`Pokaż ukryte (${h.size})`;b.onclick=()=>{gqSetHidden(new Set());renderQuests()};p.appendChild(b)}
}

// --- panel synchronizacji w Kolekcji ---
function ago(t){if(!t)return "nigdy";const m=Math.round((Date.now()-t)/60000);if(m<1)return "przed chwilą";if(m<60)return m+" min temu";const h=Math.round(m/60);if(h<24)return h+" godz. temu";return new Date(t).toLocaleString("pl-PL",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}
function renderDeskSync(){
  const p=$("#deskSync");if(!p)return;
  p.hidden=!DESK;const bm=$("#bmPanel");if(bm)bm.hidden=!!DESK;
  if(!DESK)return;
  const s=DS||{};
  const st={ok:`Kolekcja pobiera się sama z Twojego konta (ostatnio ${ago(s.lastSync)}, ${s.syncCount||0} różnych kart). Odświeża się po każdym meczu i co 30 minut.`,
    login:"Zaloguj się raz do GOG w okienku apki. Potem kolekcja będzie się pobierać sama.",
    syncing:"Pobieram kolekcję z playgwent.com…",
    error:"Nie udało się pobrać kolekcji. Sprawdź internet i kliknij „Synchronizuj teraz”.",
    idle:"Za chwilę pobiorę kolekcję."}[s.syncStatus||"idle"];
  p.innerHTML=`<h2>Konto Gwinta</h2><p class="small"></p>
    <div class="row"><button class="btn" id="dsSync">Synchronizuj teraz</button><button class="btn ghost" id="dsLogin">${s.syncStatus==="login"?"Zaloguj do GOG":"Pokaż okno GOG"}</button><button class="btn ghost" id="dsOut">Wyloguj</button></div>
    <p class="small muted" id="dsLog"></p>`;
  p.querySelector("p").textContent=st;
  p.querySelector("#dsLog").textContent=(s.logFound?"Log gry znaleziony, mecze i zadania zapisują się same.":"Nie widzę logu gry. Uruchom Gwinta przynajmniej raz na tym komputerze.")+(s.self?` Gracz: ${s.self}.`:"")+` Hasło wpisujesz tylko na stronie GOG, apka go nie widzi.`;
  p.querySelector("#dsSync").onclick=()=>{DESK.syncNow();manualSync=true;toast("Synchronizuję…")};
  p.querySelector("#dsLogin").onclick=()=>DESK.login();
  p.querySelector("#dsOut").onclick=()=>{DESK.logout();toast("Wylogowano z GOG")};
}
let manualSync=false;

// --- zakładka Mecze ---
const fmtT=t=>new Date(t).toLocaleTimeString("pl-PL",{hour:"2-digit",minute:"2-digit"});
function dayLabel(t){const d=new Date(t);d.setHours(0,0,0,0);const n=new Date();n.setHours(0,0,0,0);const diff=Math.round((n-d)/864e5);if(diff===0)return "Dziś";if(diff===1)return "Wczoraj";return new Date(t).toLocaleDateString("pl-PL",{weekday:"long",day:"numeric",month:"long"})}
function oppNick(m){const n=Object.values(m.players||{});return n.find(x=>x!==(DS&&DS.self))||n[0]||"?"}
const mins=m=>Math.max(1,Math.round((m.end-m.start)/60000));
const RESN={W:"Wygrana",L:"Przegrana",D:"Remis"};
function wl(list){let w=0,l=0;list.forEach(m=>{if(m.result==="W")w++;else if(m.result==="L")l++});return {w,l,n:list.length,pct:list.length?Math.round(w/list.length*100):0}}
function questNames(m){
  if(!m.quests||!m.quests.length)return "";
  const names=m.quests.map(d=>{const g=DS.quests.find(x=>String(x.defId)===String(d));return g?gqDesc(gqConvert(g)):null});
  const known=names.filter(Boolean);
  return known.length?known.join(" · ")+(known.length<names.length?` (+${names.length-known.length})`:""):`${names.length} ${names.length===1?"zadanie":"zadania"}`;
}
function renderMatches(){
  const box=$("#mbox");box.innerHTML="";
  if(!DESK){
    box.innerHTML=`<div class="panel"><h2>Historia meczów</h2><p class="small">Ta zakładka działa w aplikacji na komputer (Windows). Aplikacja czyta plik logu Gwinta (nie dotyka samej gry), więc po każdym meczu zapisuje wynik, rywala, frakcję, czas i zaliczone zadania. Sama też pobiera nowe karty z konta.</p><div class="row"><a class="btn" href="${RELEASES}" target="_blank" rel="noopener">Pobierz aplikację</a></div><p class="small muted">Instalator: Warsztat-Gwinta-Setup.exe. Jeśli Windows pokaże ostrzeżenie, kliknij „Więcej informacji”, potem „Uruchom mimo to”.</p></div>`;
    return;
  }
  const all=(DS&&DS.matches)||[];
  const tags=(DS&&DS.oppTags)||{};
  if(!all.length&&!DS.live){box.innerHTML=`<div class="panel"><h2>Mecze</h2><p class="empty">${DS&&DS.logFound?"Jeszcze nie ma meczów. Zagraj w Gwinta, a wynik pojawi się tu sam.":"Nie widzę logu gry. Uruchom Gwinta na tym komputerze."}</p></div>`;box.appendChild(settingsPanel());return}
  if(DS.live)box.appendChild(liveCard(DS.live,all));
  ui.mper=ui.mper||"7";
  const cut=ui.mper==="all"?0:ui.mper==="1"?new Date().setHours(0,0,0,0):Date.now()-7*864e5;
  const list=all.filter(m=>m.start>=cut);
  if(!all.length)return;
  // ostatni mecz
  const m0=all.find(m=>m.id===ui.mFocus)||all[0];
  const last=document.createElement("div");last.className="panel mlast "+(m0.result||"");
  last.style.setProperty("--fc",fcol(m0.faction||"NE"));
  const vs=all.filter(m=>oppNick(m)===oppNick(m0)),vsS=wl(vs);
  last.innerHTML=`<div class="row" style="justify-content:space-between"><span class="label">${m0===all[0]?"Ostatni mecz":"Mecz"} · ${dayLabel(m0.start)} ${fmtT(m0.start)}</span><span class="small muted">${MODEN[m0.mode]||m0.mode}</span></div>
    <div class="mbig"><span class="mres ${m0.result}">${RESN[m0.result]||"?"}</span><span class="fchip">${FAC[m0.faction]?FAC[m0.faction].n:"?"}</span><span>vs <b class="nick"></b></span></div>
    <div class="sumrow"><span>Czas: <b>${mins(m0)} min</b></span>${m0.roundEnds?`<span>Rundy: <b>${Math.min(3,m0.roundEnds.length+1)}</b></span>`:""}${m0.xp?`<span>Doświadczenie: <b>+${m0.xp}</b></span>`:""}${ratingTxt(m0)}${m0.rank&&!m0.rating?`<span>Ranking: <b>${m0.rank.pieces}/${m0.rank.max}</b> (poziom ${m0.rank.tier})</span>`:""}${vs.length>1?`<span>Z tym graczem: <b>${vsS.w}–${vsS.l}</b></span>`:""}</div>
    <div class="small qline"></div>
    <label class="small">Frakcja rywala: <select class="opp"></select></label>`;
  last.querySelector(".nick").textContent=oppNick(m0);
  const qn=questNames(m0);last.querySelector(".qline").textContent=qn?"Zaliczone zadania: "+qn:"";
  oppSelect(last.querySelector(".opp"),m0,tags);
  box.appendChild(last);
  // statystyki
  const sp=document.createElement("div");sp.className="panel";
  const S=wl(list);
  sp.innerHTML=`<div class="row" style="justify-content:space-between"><h2>Statystyki</h2><div class="filters per"></div></div>
    <div class="sumrow"><span>Mecze: <b>${S.n}</b></span><span>Bilans: <b>${S.w}–${S.l}</b></span><span>Wygrane: <b>${S.pct}%</b></span>${(()=>{const r=all.find(m=>m.rating);return r?`<span>Punkty rankingu: <b>${r.rating.to}</b>${r.srank?` · ranga <b>${r.srank.to}</b>`:""}</span>`:""})()}</div>
    <div class="grid2"><div><div class="label">Moje frakcje</div><div class="mstat my"></div></div><div><div class="label">Frakcje rywali</div><div class="mstat op"></div></div></div>
    <div class="label" style="margin-top:8px">Moje talie</div><div class="mstat dk"></div>`;
  [["1","Dziś"],["7","7 dni"],["all","Wszystko"]].forEach(([k,l])=>{const b=document.createElement("button");b.className="fbtn";b.textContent=l;b.setAttribute("aria-pressed",ui.mper===k);b.onclick=()=>{ui.mper=k;renderMatches()};sp.querySelector(".per").appendChild(b)});
  const statRows=(el,key)=>{const by={};list.forEach(m=>{const f=key(m);if(f)(by[f]=by[f]||[]).push(m)});
    const ks=Object.keys(by).sort((a,b)=>by[b].length-by[a].length);
    if(!ks.length){el.innerHTML='<p class="small muted">'+(el.classList.contains("op")?"Zaznacz frakcję rywala przy meczach, a pojawi się tu bilans.":"Brak danych.")+"</p>";return}
    ks.forEach(f=>{const s=wl(by[f]);const r=document.createElement("div");r.className="mst";r.style.setProperty("--fc",fcol(f));const mm=el.classList.contains("my")?all.find(m=>m.mmr&&m.mmr[f]):null;r.innerHTML=`<span class="sw"></span><span class="nm">${FAC[f].n}${mm?` <span class="small muted mono" title="MMR frakcji">${mm.mmr[f].to}</span>`:""}</span><span class="mono">${s.w}–${s.l}</span><span class="bar"><i style="width:${s.pct}%"></i></span><span class="mono">${s.pct}%</span>`;el.appendChild(r)})};
  statRows(sp.querySelector(".my"),m=>m.faction);
  statRows(sp.querySelector(".op"),m=>tags[m.id]||guessFor(m));
  (()=>{const el=sp.querySelector(".dk");const by={};list.forEach(m=>{const d=matchDeck(m);if(d){(by[d.key]=by[d.key]||{d,ms:[]}).ms.push(m)}});
    const ks=Object.values(by).sort((a,b)=>b.ms.length-a.ms.length);
    if(!ks.length){el.innerHTML='<p class="small muted">Brak danych.</p>';return}
    ks.forEach(({d,ms})=>{const s=wl(ms);const r=document.createElement("div");r.className="mst";r.style.setProperty("--fc",fcol(d.f||"NE"));r.innerHTML=`<span class="sw"></span><span class="nm"></span><span class="mono">${s.w}–${s.l}</span><span class="bar"><i style="width:${s.pct}%"></i></span><span class="mono">${s.pct}%</span>`;r.querySelector(".nm").textContent=d.name;el.appendChild(r)});
    if(!myDecks().length)el.insertAdjacentHTML("beforeend",'<p class="small muted">Talie rozpoznaję po pierwszej złotej karcie. Po synchronizacji z GOG pokażę nazwy Twoich talii, jeśli strona je udostępnia.</p>')})();
  box.appendChild(sp);
  box.appendChild(chartPanel(all));
  // lista
  const lp=document.createElement("div");lp.className="panel";lp.innerHTML="<h2>Historia</h2>";
  let day=null,cl=null;
  list.slice(0,300).forEach(m=>{
    const d=dayLabel(m.start);
    if(d!==day){day=d;const ms=list.filter(x=>dayLabel(x.start)===d),s=wl(ms);const h=document.createElement("div");h.className="rolehead";h.innerHTML=`<b></b> <span class="small muted">${s.w}–${s.l}</span>`;h.querySelector("b").textContent=d;lp.appendChild(h);cl=document.createElement("div");cl.className="mlist";lp.appendChild(cl)}
    const r=document.createElement("div");r.className="mrow"+(m.id===m0.id?" sel":"");r.style.setProperty("--fc",fcol(m.faction||"NE"));
    r.innerHTML=`<span class="mono small muted">${fmtT(m.start)}</span><span class="mres ${m.result}">${m.result==="W"?"W":m.result==="L"?"P":"R"}</span><span class="mwho"><span class="sw"></span><span class="nm"></span></span><span class="small muted mmode">${MODEN[m.mode]||m.mode} · ${mins(m)} min${m.rating?" · "+signed(m.rating.to-m.rating.from)+" pkt":""}${m.quests&&m.quests.length?" · ✓"+m.quests.length:""}</span><select class="opp" aria-label="Frakcja rywala"></select>`;
    r.querySelector(".nm").textContent=(FAC[m.faction]?FAC[m.faction].n:"?")+" vs "+oppNick(m);
    oppSelect(r.querySelector(".opp"),m,tags);
    r.querySelector(".mwho").onclick=()=>{ui.mFocus=m.id;renderMatches();window.scrollTo({top:0,behavior:"smooth"})};
    cl.appendChild(r);
  });
  if(!list.length)lp.insertAdjacentHTML("beforeend",'<p class="empty">Brak meczów w tym okresie.</p>');
  lp.insertAdjacentHTML("beforeend",'<p class="small muted">Gra nie zapisuje w logu, jakie karty były rzucane w rundach, więc apka pokazuje wynik, czas, tryb, rywala i zadania. Frakcję rywala zaznaczasz sam, wtedy statystyki pokażą, z kim przegrywasz najczęściej.</p>');
  box.appendChild(lp);
  box.appendChild(settingsPanel());
}
const signed=n=>(n>0?"+":n<0?"−":"±")+Math.abs(n);
function ratingTxt(m){
  if(!m.rating)return "";
  const d=m.rating.to-m.rating.from;
  const mm=m.mmr&&m.faction&&m.mmr[m.faction];
  return `<span>Punkty rankingu: <b>${m.rating.from} → ${m.rating.to}</b> (${signed(d)})</span>`+(m.srank&&m.srank.from!==m.srank.to?`<span>Ranga: <b>${m.srank.from} → ${m.srank.to}</b></span>`:m.srank?`<span>Ranga: <b>${m.srank.to}</b></span>`:"")+(mm?`<span>MMR frakcji: <b>${mm.from} → ${mm.to}</b></span>`:"");
}
function liveDeck(gold){
  if(!gold)return {};
  const id=BYNAME[norm(gold)];const c=id&&CARD[id];if(!c)return {gold};
  const f=c.f!=="NE"?c.f:"";
  const ds=DATA.decks.filter(d=>d.cards.some(([x])=>String(x)===String(id))).map(d=>({d,s:deckStats(d)})).sort((a,b)=>b.s.pct-a.s.pct||a.d.t-b.d.t);
  return {gold,card:c,f,deck:ds.length?ds[0].d:null};
}
function liveCard(L,all){
  const el=document.createElement("div");el.className="panel mlive";
  const opp=Object.values(L.players||{}).find(x=>x!==(DS&&DS.self))||"";
  const G=liveGuide(L),g={f:G.f,gold:G.gold,card:G.card};el.style.setProperty("--fc",fcol(g.f||"NE"));
  const vs=opp?all.filter(m=>oppNick(m)===opp):[],vsS=wl(vs);
  el.innerHTML=`<div class="row" style="justify-content:space-between"><span class="label"><span class="livedot"></span>Mecz trwa · ${MODEN[L.mode]||L.mode||""}</span><span class="mono ltimer" data-start="${L.start}"></span></div>
    <div class="mbig"><span>vs <b class="nick"></b></span>${g.f?`<span class="fchip">${FAC[g.f].n}</span>`:""}</div>
    <div class="sumrow">${vs.length?`<span>Z tym graczem: <b>${vsS.w}–${vsS.l}</b> (${vs.length} ${vs.length===1?"mecz":"mecze"})</span>`:opp?"<span>Pierwszy mecz z tym graczem</span>":"<span>Czekam na dane rywala…</span>"}${g.gold?`<span>Złota karta w talii: <b class="gold"></b></span>`:""}</div>
    <div class="small lscout">${opp?scoutHTML(opp):""}</div>
    <div class="lq small"></div><div class="lplan"></div>`;
  el.querySelector(".nick").textContent=opp||"…";
  el.querySelector(".label").insertAdjacentHTML("beforeend"," · "+roundTxt(L));
  {const P=opp&&profOf(opp);if(P&&P.guess)el.querySelector(".lscout").insertAdjacentHTML("beforeend",expectHTML(P.guess.f))}
  if(g.gold)el.querySelector(".gold").textContent=g.card?g.card.pl:g.gold;
  const qs=gameQuests().filter(q=>needLeft(q)&&q.k!=="other"&&(!q.f||!g.f||q.f===g.f));
  if(qs.length)el.querySelector(".lq").textContent="Zadania do zrobienia w tej grze: "+qs.map(q=>`${qLabel(q)} ${gqDesc(q)} (${q.prog}/${q.n})`).join(" · ");
  const pl=el.querySelector(".lplan");
  if(G.guide){const d=G.guide;
    pl.innerHTML=`<details${ui.liveOpen===false?"":" open"}><summary><b>Plan gry: </b><span class="dn"></span></summary><div class="grid2"><div><div class="label">Mulligan</div><p class="note"></p></div><div><div class="label">Rundy</div><p class="note"></p></div></div><ol class="small"></ol></details>`;
    pl.querySelector(".dn").textContent=G.own?`${G.name} (Twoja talia; plan z „${d.name}”, wspólnych kart: ${G.overlap})`:d.name+" (najbliższa talia z apki z tą kartą)";const ps=pl.querySelectorAll("p");ps[0].textContent=d.mull;ps[1].textContent=d.rounds;
    (d.steps||[]).forEach(x=>{const li=document.createElement("li");li.textContent=x;pl.querySelector("ol").appendChild(li)});
    pl.querySelector("details").ontoggle=e=>{ui.liveOpen=e.target.open}}
  if(G.cards){const dt=document.createElement("details");dt.open=ui.liveCards!==false;dt.innerHTML='<summary><b>Karty wg kolejności gry</b> <span class="small muted">co grać wcześnie, co trzymać na koniec</span></summary>';dt.appendChild(roleList(G,false));dt.ontoggle=()=>{ui.liveCards=dt.open};pl.appendChild(dt)}
  return el;
}
// --- własne talie z konta (playgwent builder_decks) ---
const OVL=/[?&]overlay=1/.test(location.search);
function facStr(x){x=String(x||"").toLowerCase();if(!x)return "";if(/^monst/.test(x))return "MO";if(/^nilf/.test(x))return "NG";if(/^north/.test(x)||/^nr$/.test(x))return "NR";if(/^scoia/.test(x)||x==="st")return "ST";if(/^skel/.test(x)||x==="sk")return "SK";if(/^synd/.test(x)||x==="sy")return "SY";if(/^(ng|mo)$/.test(x))return x.toUpperCase();return ""}
function cardIdOf(x,depth){
  if(x==null||depth>3)return null;
  if(typeof x==="object"){for(const k of ["card_id","cardId","template_id","templateId","card_template_id","card_definition_id","definition_id","definitionId","card","id"]){if(x[k]!=null){const r=cardIdOf(x[k],(depth||0)+1);if(r)return r}}return null}
  const s=String(x);if(CARD[s])return s;const n=+x;if(!isFinite(n))return null;const t=String(Math.floor(n/100));return CARD[t]?t:null;
}
function bigArray(o,depth){let best=null;if(!o||typeof o!=="object"||depth>3)return null;for(const k in o){const v=o[k];if(Array.isArray(v)){if(v.length>=8&&(!best||v.length>best.length))best=v}else if(v&&typeof v==="object"){const b=bigArray(v,depth+1);if(b&&(!best||b.length>best.length))best=b}}return best}
let mdCache=[],mdSrc=null;
function myDecks(){
  if(!DS||!Array.isArray(DS.decksRaw))return [];
  if(mdSrc===DS.decksRaw)return mdCache;mdSrc=DS.decksRaw;
  mdCache=DS.decksRaw.map((d,i)=>{
    const arr=bigArray(d,0)||[];const cnt={};
    arr.forEach(x=>{const id=cardIdOf(x,0);if(!id)return;const n=(x&&typeof x==="object"&&+(x.count||x.amount||x.quantity||x.copies))||1;cnt[id]=Math.min((cnt[id]||0)+n,maxOf(CARD[id]))});
    const cards=Object.entries(cnt);const fs={};cards.forEach(([id,n])=>{const f=CARD[id].f;if(f!=="NE")fs[f]=(fs[f]||0)+n});
    const f=facStr(d.faction||d.faction_slug||d.factionSlug||(d.leader&&d.leader.faction))||Object.keys(fs).sort((a,b)=>fs[b]-fs[a])[0]||"NE";
    const name=String(d.name||d.title||d.deck_name||d.deckName||("Talia "+(i+1)));
    return {key:"own-"+(d.id||i),name,f,cards,golds:cards.filter(([id])=>CARD[id].g).map(([id])=>id)};
  }).filter(d=>d.cards.length>=10);
  return mdCache;
}
function ownDeckFor(gold,f){
  const id=gold&&BYNAME[norm(gold)];if(!id)return null;
  const c=myDecks().filter(d=>d.golds.includes(id)&&(!f||d.f===f));
  return c.length?c[0]:null;
}
function bestGuide(cards,f){
  // talia z apki, która ma najwięcej wspólnych kart: z niej bierzemy plan i wskazówki
  const ids=new Set(cards.map(([id])=>String(id)));let best=null,bo=0;
  DATA.decks.forEach(d=>{if(f&&d.f!==f)return;const o=d.cards.reduce((a,[id])=>a+(ids.has(String(id))?1:0),0);if(o>bo){bo=o;best=d}});
  return best?{d:best,overlap:bo}:null;
}
function matchDeck(m){
  const own=ownDeckFor(m.gold,m.faction);if(own)return {key:own.key,name:own.name,f:own.f};
  if(!m.gold||!m.faction)return null;const id=BYNAME[norm(m.gold)];
  return {key:m.faction+"|"+m.gold,name:(FAC[m.faction]?FAC[m.faction].n:"")+" · "+(id?CARD[id].pl:m.gold),f:m.faction};
}
// talia i plan na trwający mecz
function liveGuide(L){
  const g=liveDeck(L.gold);
  const own=ownDeckFor(L.gold,g.f);
  if(own){const bg=bestGuide(own.cards,own.f);return {f:own.f,gold:g.gold,card:g.card,name:own.name,own:true,cards:own.cards,guide:bg&&bg.overlap>=6?bg.d:null,overlap:bg?bg.overlap:0}}
  if(g.deck)return {f:g.f||g.deck.f,gold:g.gold,card:g.card,name:g.deck.name,own:false,cards:g.deck.cards,guide:g.deck,overlap:25};
  return {f:g.f,gold:g.gold,card:g.card};
}
const ROLE_ORD=["R1","SIL","COMBO","WYP","ODP","FIN"];
function roleGroups(G){
  const gr={};(G.cards||[]).forEach(([id,n])=>{const t=G.guide&&G.guide.tips&&G.guide.tips[id];const r=t?t[0]:"INNE";(gr[r]=gr[r]||[]).push({id,n,tip:t?t[1]:""})});
  return [...ROLE_ORD,"INNE"].filter(r=>gr[r]).map(r=>({r,label:r==="INNE"?"Pozostałe":ROLE[r][0],hint:r==="INNE"?"Brak wskazówki w apce":ROLE[r][1],cards:gr[r].sort((a,b)=>CARD[b.id].p-CARD[a.id].p)}));
}
function roleList(G,compact){
  const box=document.createElement("div");box.className="rgroups";
  roleGroups(G).forEach(g=>{const h=document.createElement("div");h.className="rg";h.innerHTML=`<div class="rgh">${g.r==="INNE"?"":`<span class="role r-${g.r}">${g.label}</span>`}${g.r==="INNE"?`<b class="small">${g.label}</b>`:""} <span class="small muted">${g.hint}</span></div>`;
    g.cards.forEach(c=>{const d=document.createElement("div");d.className="rc";d.innerHTML=`<span class="pv ${CARD[c.id].g?"g":"b"}">${CARD[c.id].p}</span><span><b></b>${!compact&&c.tip?'<span class="small muted"></span>':""}</span>`;d.querySelector("b").textContent=(c.n>1?c.n+"× ":"")+CARD[c.id].pl;if(!compact&&c.tip)d.querySelector(".small").textContent=" – "+c.tip;else if(c.tip)d.title=c.tip;h.appendChild(d)});
    box.appendChild(h)});
  return box;
}

// --- wykres rankingu ---
function chartSVG(pts,color){
  if(pts.length<2)return '<p class="small muted">Wykres pojawi się po co najmniej 2 meczach rankingowych.</p>';
  const W=600,H=170,P=28;const vs=pts.map(p=>p.v);let lo=Math.min(...vs),hi=Math.max(...vs);if(hi-lo<20){const c=(hi+lo)/2;lo=c-10;hi=c+10}
  const x=i=>P+(W-P*2)*i/(pts.length-1),y=v=>H-P-(H-P*2)*(v-lo)/(hi-lo);
  const line=pts.map((p,i)=>`${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const dots=pts.map((p,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3.2" fill="${p.r==="W"?"var(--ok)":p.r==="L"?"var(--miss)":"var(--muted)"}"><title>${new Date(p.t).toLocaleString("pl-PL",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}: ${p.v}</title></circle>`).join("");
  const last=pts[pts.length-1];
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Wykres: od ${pts[0].v} do ${last.v}">
    <line x1="${P}" x2="${W-P}" y1="${y(hi)}" y2="${y(hi)}" class="gl"/><line x1="${P}" x2="${W-P}" y1="${y(lo)}" y2="${y(lo)}" class="gl"/>
    <text x="${P-4}" y="${y(hi)+4}" text-anchor="end" class="ax">${Math.round(hi)}</text><text x="${P-4}" y="${y(lo)+4}" text-anchor="end" class="ax">${Math.round(lo)}</text>
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/>${dots}
    <text x="${x(pts.length-1)}" y="${y(last.v)-9}" text-anchor="end" class="lv">${last.v}</text></svg>`;
}
function chartPanel(all){
  const rk=all.filter(m=>m.rating).slice(0,120).reverse();
  const p=document.createElement("div");p.className="panel";
  const facs=["NG","MO","NR","ST","SK","SY"].filter(f=>rk.some(m=>m.mmr&&m.mmr[f]&&m.faction===f));
  ui.chart=ui.chart||"pts";if(ui.chart!=="pts"&&!facs.includes(ui.chart))ui.chart="pts";
  let streak=0,sr=all[0]&&all[0].result;for(const m of all){if(m.result===sr)streak++;else break}
  p.innerHTML=`<div class="row" style="justify-content:space-between"><h2>Ranking w czasie</h2><div class="filters ch"></div></div><div class="chbox"></div>
    <p class="small muted">${streak>1?`Seria: <b>${streak} ${sr==="W"?"wygrane":"przegrane"}</b> z rzędu. `:""}Kropki: zielona wygrana, czerwona przegrana. MMR to ocena każdej frakcji. Punkty rankingu rosną też za kolejne gry frakcją (pełny MMR frakcji liczy się po 25 grach).</p>`;
  [["pts","Punkty"],...facs.map(f=>[f,FAC[f].n])].forEach(([k,l])=>{const b=document.createElement("button");b.className="fbtn small";b.textContent=l;b.setAttribute("aria-pressed",ui.chart===k);b.onclick=()=>{ui.chart=k;renderMatches()};p.querySelector(".ch").appendChild(b)});
  const pts=ui.chart==="pts"?rk.map(m=>({t:m.start,v:m.rating.to,r:m.result})):rk.filter(m=>m.faction===ui.chart&&m.mmr&&m.mmr[ui.chart]).map(m=>({t:m.start,v:m.mmr[ui.chart].to,r:m.result}));
  p.querySelector(".chbox").innerHTML=chartSVG(pts,ui.chart==="pts"?"var(--accent)":fcol(ui.chart));
  return p;
}

// --- ustawienia aplikacji ---
function settingsPanel(){
  const p=document.createElement("div");p.className="panel";
  const st=(DS&&DS.settings)||{};
  if(!DESK.setSetting){p.innerHTML='<h2>Okienko na wierzchu gry</h2><p class="small">Zamknij i otwórz aplikację, żeby pobrała nową wersję (1.2). Wtedy włączy się okienko z meczem na żywo i przypomnienia o zadaniach.</p>';return p}
  p.innerHTML=`<h2>Ustawienia</h2>
    <label class="row small"><input type="checkbox" class="s-ovl"${st.overlay!==false?" checked":""}> Okienko na wierzchu gry podczas meczu (rywal, plan, karty, zadania)</label>
    <label class="row small"><input type="checkbox" class="s-rem"${st.remind!==false?" checked":""}> Przypomnienie o niezrobionych zadaniach dziennych (wieczorem)</label>
    <div class="row"><button class="btn ghost small s-show">Pokaż okienko teraz</button></div>
    <p class="small muted">Okienko widać nad grą, gdy Gwint działa w oknie albo w trybie „okno bez ramki”. W pełnym ekranie Windows może je chować. Przeciągnij je za górny pasek, zapamięta miejsce.</p>`;
  p.querySelector(".s-ovl").onchange=e=>DESK.setSetting("overlay",e.target.checked);
  p.querySelector(".s-rem").onchange=e=>DESK.setSetting("remind",e.target.checked);
  p.querySelector(".s-show").onclick=()=>DESK.overlayShow();
  return p;
}

// --- okienko na wierzchu (tryb overlay) ---
function renderOverlay(){
  let box=document.getElementById("ovlbox");
  if(!box){box=document.createElement("div");box.id="ovlbox";document.body.appendChild(box)}
  box.innerHTML="";
  const all=(DS&&DS.matches)||[];const L=DS&&DS.live;
  const head=document.createElement("div");head.className="ovh";
  head.innerHTML=`<span class="ovt"></span><span class="mono ltimer"></span><button class="ovx" title="Schowaj do następnego meczu" aria-label="Schowaj">×</button>`;
  head.querySelector(".ovx").onclick=()=>DESK.overlayHide&&DESK.overlayHide();
  box.appendChild(head);
  const body=document.createElement("div");body.className="ovb";box.appendChild(body);
  if(!L){
    const m=all[0];
    head.querySelector(".ovt").textContent="Koniec meczu";
    if(!m){body.innerHTML='<p class="small muted">Czekam na mecz…</p>';return}
    body.innerHTML=`<div class="mbig"><span class="mres ${m.result}">${RESN[m.result]||"?"}</span><span class="small">vs <b class="nick"></b></span></div><div class="sumrow small">${ratingTxt(m)}${m.xp?`<span>+${m.xp} XP</span>`:""}<span>${mins(m)} min</span></div><div class="small qline"></div>`;
    body.querySelector(".nick").textContent=oppNick(m);const qn=questNames(m);body.querySelector(".qline").textContent=qn?"Zaliczone: "+qn:"";
    return;
  }
  head.querySelector(".ovt").innerHTML='<span class="livedot"></span>'+(MODEN[L.mode]||L.mode||"Mecz")+" · "+roundTxt(L);
  head.querySelector(".ltimer").dataset.start=L.start;
  const opp=Object.values(L.players||{}).find(x=>x!==(DS&&DS.self))||"…";
  const vs=all.filter(m=>oppNick(m)===opp),vsS=wl(vs);
  const G=liveGuide(L);
  const info=document.createElement("div");info.className="ovi";
  info.innerHTML=`<div><b class="nick"></b> <span class="small muted">${vs.length?`bilans ${vsS.w}–${vsS.l}`:"nowy rywal"}</span></div><div class="small dn"></div>`;
  info.querySelector(".nick").textContent="vs "+opp;
  info.querySelector(".dn").textContent=G.name?(G.own?"Twoja talia: ":"Talia: ")+G.name:(G.f?FAC[G.f].n:"Talia nieznana");
  info.insertAdjacentHTML("beforeend",`<div class="small ovs">${opp!=="…"?scoutHTML(opp,true):""}</div>`);
  if(L.round>=3&&G.cards){const fin=roleGroups(G).find(g=>g.r==="FIN");if(fin)info.insertAdjacentHTML("beforeend",`<div class="small ovr3">R3: teraz czas na ${fin.cards.map(c=>CARD[c.id].pl).join(", ")}</div>`)}
  body.appendChild(info);
  const tabs=document.createElement("div");tabs.className="filters ovtabs";
  let tab=null;try{tab=localStorage.getItem("gwint-ovtab")}catch(e){}tab=tab||"plan";
  const qs=gameQuests().filter(q=>needLeft(q)&&q.k!=="other"&&(!q.f||!G.f||q.f===G.f));
  [["plan","Plan"],["karty","Karty"],["rywal","Rywal"],["zad","Zadania"+(qs.length?" ("+qs.length+")":"")]].forEach(([k,l])=>{const b=document.createElement("button");b.className="fbtn small";b.textContent=l;b.setAttribute("aria-pressed",tab===k);b.onclick=()=>{try{localStorage.setItem("gwint-ovtab",k)}catch(e){}renderOverlay()};tabs.appendChild(b)});
  body.appendChild(tabs);
  const c=document.createElement("div");c.className="ovc small";body.appendChild(c);
  if(tab==="plan"){
    if(G.guide){const d=G.guide;c.innerHTML=`<div class="label">Mulligan</div><p></p><div class="label">Rundy</div><p></p><ol></ol>`;const ps=c.querySelectorAll("p");ps[0].textContent=d.mull;ps[1].textContent=d.rounds;(d.steps||[]).forEach(x=>{const li=document.createElement("li");li.textContent=x;c.querySelector("ol").appendChild(li)});
      if(G.own&&G.overlap<25){const n=document.createElement("p");n.className="muted";n.textContent=`Plan z talii „${d.name}” (wspólnych kart: ${G.overlap}).`;c.appendChild(n)}}
    else c.innerHTML='<p class="muted">Nie mam planu dla tej talii. Zsynchronizuj kolekcję, żeby apka znała Twoje talie.</p>';
  }else if(tab==="rywal"){
    const P=profOf(opp);c.innerHTML=scoutHTML(opp)+(P&&P.guess?expectHTML(P.guess.f):"");
    const vsm=all.filter(m=>oppNick(m)===opp);if(vsm.length)c.insertAdjacentHTML("beforeend",`<p class="muted">Wasze mecze: ${vsm.map(m=>(m.result==="W"?"W":"P")+" "+(FAC[m.faction]?FAC[m.faction].n:"")).join(", ")}</p>`);
  }else if(tab==="karty"){
    if(G.cards)c.appendChild(roleList(G,true));else c.innerHTML='<p class="muted">Nie znam jeszcze kart tej talii.</p>';
  }else{
    c.innerHTML=qs.length?"":'<p class="muted">Brak zadań do zrobienia tą frakcją.</p>';
    qs.forEach(q=>{const d=document.createElement("div");d.className="ovq";d.textContent=`${gqDesc(q)} · ${q.prog}/${q.n}`;c.appendChild(d)});
  }
}

// --- profil rywala (jak Porofessor: kto to jest i czym gra) ---
const FACPL={"Nilfgaard":"NG","Potwory":"MO","Królestwa Północy":"NR","Scoia'tael":"ST","Skellige":"SK","Syndykat":"SY"};
const num=x=>+(String(x||"").replace(/[^0-9]/g,""))||0;
const profCache=new Map();
function parseProfile(text){
  if(!text)return null;if(profCache.has(text))return profCache.get(text);
  const P={wins:{},season:{f:{}}};
  let m=text.match(/Pozycja:\s*\n?\s*([\d\s\u00a0]+)\n/);if(m)P.pos=num(m[1]);
  m=text.match(/\n(\d{1,4})\n(\d{1,2})\nDrabinka rankingowa/);if(m){P.level=+m[1];P.rank=+m[2]}
  const iS=text.indexOf("STATYSTYKI"),iC=text.indexOf("Obecny sezon rankingowy"),iK=text.indexOf("KOLEKCJA KART");
  if(iS>=0&&iC>iS){const a=text.slice(iS,iC);m=a.match(/Ogólnie\t([\d\s\u00a0]+?)\n/);if(m)P.total=num(m[1]);
    for(const [n,f] of Object.entries(FACPL)){const r=new RegExp(n.replace(/'/g,"'")+"\\t\\s*\\n([\\d\\s\\u00a0]+?)\\n");const x=a.match(r);if(x)P.wins[f]=num(x[1])}}
  if(iC>=0){const a=text.slice(iC,iK>iC?iK:undefined);m=a.match(/Ogólnie\t([\d\s\u00a0]+) MMR\n([\d\s\u00a0]+) Mecze/);if(m){P.season.mmr=num(m[1]);P.season.n=num(m[2])}
    m=a.match(/Wygrane\t([\d\s\u00a0]+) Mecze/);if(m)P.season.w=num(m[1]);m=a.match(/Przegrane\t([\d\s\u00a0]+) Mecze/);if(m)P.season.l=num(m[1]);
    for(const [n,f] of Object.entries(FACPL)){const r=new RegExp(n+"\\t\\s*\\n([\\d\\s\\u00a0]+) Mecze");const x=a.match(r);if(x)P.season.f[f]=num(x[1])}}
  P.ok=!!(P.total||P.level||P.season.n);
  // najbardziej prawdopodobna frakcja: obecny sezon, a jak pusto, to wygrane ogółem
  const pick=o=>{const e=Object.entries(o).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);const t=e.reduce((a,[,v])=>a+v,0);return e.length?{f:e[0][0],share:Math.round(e[0][1]/t*100),src:o}:null};
  P.guess=pick(P.season.f)||pick(P.wins);if(P.guess)P.guess.season=P.guess.src===P.season.f;
  profCache.set(text,P);return P;
}
function profOf(nick){const c=DS&&DS.scout&&DS.scout[nick];return c?parseProfile(c.text):null}
function guessFor(m){const p=profOf(oppNick(m));return p&&p.guess?p.guess.f:""}
function scoutHTML(nick,compact){
  const P=profOf(nick);
  if(!P)return `<span class="muted">Sprawdzam profil rywala…</span>`;
  if(!P.ok)return `<span class="muted">Profil rywala jest prywatny.</span>`;
  const bits=[];
  if(P.level)bits.push(`poziom <b>${P.level}</b>`);if(P.rank)bits.push(`ranga <b>${P.rank}</b>`);if(P.pos)bits.push(`#${fmt(P.pos)}`);
  if(P.season.n)bits.push(`sezon: <b>${P.season.w||0}–${P.season.l||0}</b>`);if(P.total)bits.push(`${fmt(P.total)} wygranych`);
  let g="";if(P.guess){g=`<div>Pewnie zagra: <b style="color:${fcol(P.guess.f)}">${FAC[P.guess.f].n}</b> <span class="muted">(${P.guess.share}% ${P.guess.season?"gier w sezonie":"wygranych"})</span></div>`}
  if(compact)return g||`<div>${bits.slice(0,2).join(" · ")}</div>`;
  return `<div>${bits.join(" · ")}</div>${g}`;
}
function expectHTML(f){
  if(!f)return "";
  const ds=DATA.decks.filter(d=>d.f===f&&!d.b).sort((a,b)=>a.t-b.t).slice(0,2);
  if(!ds.length)return "";
  return `<div class="label" style="margin-top:6px">Czego się spodziewać (${FAC[f].n})</div>`+ds.map(d=>`<p class="note" style="margin:2px 0 4px"><b>${d.name}:</b> ${d.plan.replace(/</g,"&lt;")}</p>`).join("");
}
function roundTxt(L){return L.round?`Runda ${Math.min(L.round,3)}`:"Runda 1"}

function oppSelect(sel,m,tags){
  const gf=!tags[m.id]&&guessFor(m);
  sel.innerHTML=`<option value="">${gf?"rywal: "+FAC[gf].n+" (?)":"rywal: ?"}</option>`+["NG","MO","NR","ST","SK","SY"].map(f=>`<option value="${f}"${tags[m.id]===f?" selected":""}>${FAC[f].n}</option>`).join("");
  sel.onchange=e=>{const f=e.target.value;if(DS){if(f)DS.oppTags[m.id]=f;else delete DS.oppTags[m.id]}DESK.tagOpp(m.id,f)};
}

if(DESK){
  const css=document.createElement("style");
  css.textContent=`.mbig{display:flex;flex-wrap:wrap;align-items:center;gap:10px;font-size:1.25rem;margin:6px 0}
.mres{font-family:var(--f-display);font-weight:700}.mres.W{color:var(--ok)}.mres.L{color:var(--miss)}.mres.D{color:var(--muted)}
.mlast{border-left:4px solid var(--fc)}.mlast.W{background:linear-gradient(90deg,var(--ok-soft),var(--surface) 60%)}.mlast.L{background:linear-gradient(90deg,var(--miss-soft),var(--surface) 60%)}
.mlist{display:grid;gap:4px;margin-bottom:8px}
.mrow{display:grid;grid-template-columns:auto auto 1fr auto;gap:4px 10px;align-items:center;padding:6px 8px;border-radius:8px;background:var(--sunk)}
.mrow.sel{outline:2px solid var(--accent)}.mrow .mres{font-size:1.05rem;width:1.2em;text-align:center}
.mwho{display:flex;gap:6px;align-items:center;min-width:0;cursor:pointer}.mwho .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sw{display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--fc);flex:none}
.mrow .mmode{grid-column:3;grid-row:2}.mrow .opp{grid-column:4;grid-row:1/3;max-width:9.5em}
.mst{display:grid;grid-template-columns:auto 1fr auto 70px auto;gap:8px;align-items:center;font-size:.92rem;padding:2px 0}
.mlive{border:2px solid var(--accent);border-left-width:6px;border-left-color:var(--fc)}
.livedot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--miss);margin-right:6px;animation:lp 1.2s infinite}
@keyframes lp{50%{opacity:.25}}.mlive details summary{cursor:pointer;margin:6px 0}.mlive ol{margin:6px 0 0;padding-left:1.2em}
.mstat.dk .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chart{width:100%;height:auto;display:block}.chart .gl{stroke:var(--line);stroke-dasharray:3 4}.chart .ax{fill:var(--muted);font:11px var(--f-mono)}.chart .lv{fill:var(--ink);font:600 12px var(--f-mono)}
.rgroups{display:grid;gap:8px;margin-top:6px}.rgh{display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center;margin-bottom:2px}
.rc{display:flex;gap:8px;align-items:baseline;padding:2px 0}.rc .pv{min-width:1.9em;text-align:center;font:600 .8rem var(--f-mono);border-radius:5px;padding:0 3px;background:var(--sunk)}.rc .pv.g{color:var(--gold)}.rc .pv.b{color:var(--bronze)}
.ovl body{padding:0!important;overflow:hidden}.ovl .wrap,.ovl .toast,.ovl #updbar{display:none!important}
#ovlbox{display:flex;flex-direction:column;height:100vh;font-size:14px;background:var(--bg);border:1px solid var(--line)}
.ovh{display:flex;align-items:center;gap:8px;padding:6px 8px 6px 10px;background:var(--surface);border-bottom:1px solid var(--line);-webkit-app-region:drag;user-select:none}
.ovh .ovt{flex:1;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}.ovh .ltimer{font-size:.85rem}
.ovx{-webkit-app-region:no-drag;background:none;border:0;color:var(--muted);font-size:20px;line-height:1;cursor:pointer;padding:0 4px}.ovx:hover{color:var(--ink)}
.ovb{flex:1;overflow:auto;padding:8px 10px;display:grid;gap:6px;align-content:start}.ovb .mbig{font-size:1.1rem}.ovtabs{gap:4px}
.ovc p{margin:2px 0 6px}.ovr3{color:var(--accent);font-weight:600}.ovs{color:var(--muted)}.ovs b{color:var(--ink)}.ovc ol{margin:4px 0;padding-left:1.1em}.ovq{padding:4px 6px;border-radius:6px;background:var(--sunk);margin-bottom:4px}
.mst .bar{height:6px;background:var(--line);border-radius:3px;overflow:hidden}.mst .bar i{display:block;height:100%;background:var(--fc)}
@media(max-width:520px){.mrow{grid-template-columns:auto auto 1fr}.mrow .opp{grid-column:1/-1;grid-row:auto;max-width:none}}`;
  document.head.appendChild(css);
  document.documentElement.classList.add("desktop");
  if(OVL){document.documentElement.classList.add("ovl");try{document.documentElement.setAttribute("data-theme",localStorage.getItem("gwint-theme")==="light"?"light":"dark")}catch(e){}}
  const refresh=()=>{gqCache=null;if(OVL){renderOverlay();return}if(["zadania","mecze","kolekcja"].includes(ui.view))render();else renderDeskSync()};
  let liveStart=null;
  const onState=s=>{const ls=s.live&&s.live.start;DS=s;gqCache=null;if(ls&&ls!==liveStart){liveStart=ls;if(!OVL&&ui.view!=="mecze"){go("mecze");return}}liveStart=ls||null;refresh()};
  DESK.on("state",onState);
  setInterval(()=>{const t=document.querySelector(".ltimer");if(!t||!t.dataset.start)return;const s=Math.max(0,Math.floor((Date.now()-+t.dataset.start)/1000));t.textContent=Math.floor(s/60)+":"+String(s%60).padStart(2,"0")},1000);
  DESK.on("collection",ids=>{
    const cnt={};ids.forEach(x=>{x=String(x);cnt[x]=(cnt[x]||0)+1});
    const before=owned;const next={};let added=0;
    for(const k in cnt){const c=CARD[k];if(!c)continue;next[k]=Math.min(cnt[k],maxOf(c));if((before[k]||0)<next[k])added+=next[k]-(before[k]||0)}
    const first=!Object.keys(before).length;
    const same=!added&&Object.keys(before).length===Object.keys(next).length;
    if(!same){owned=next;changed()}
    if(first)toast(`Wczytano kolekcję z konta: ${Object.keys(next).length} kart`);
    else if(added)toast(`Nowe karty w kolekcji: ${added}`);
    else if(manualSync)toast("Kolekcja aktualna");
    manualSync=false;
  });
  DESK.on("show",d=>{if(d&&d.id)ui.mFocus=d.id;go((d&&d.view)||"mecze")});
  DESK.getState().then(onState).catch(()=>{});
  $("#emptyBtn").onclick=()=>{go("kolekcja");DESK.login()};
}

// --- doradca craftu (działa też na stronie i w telefonie) ---
function craftPlan(budget){
  const ms=((DS&&DS.matches)||[]).filter(m=>m.start>Date.now()-30*864e5);const fw={};ms.forEach(m=>{if(m.faction)fw[m.faction]=(fw[m.faction]||0)+1});
  const wf=f=>ms.length?0.5+3*(fw[f]||0)/ms.length:1;
  const E={};
  DATA.decks.forEach(d=>{const s=deckStats(d);if(!s.missCards)return;const dv=TIER[d.t].w*wf(d.f)*(0.4+s.pct)*(d.b?1.15:1);
    d.cards.forEach(([id,n])=>{const miss=n-Math.min(owned[id]||0,n);if(miss<=0)return;const e=E[id]=E[id]||{id,copies:0,score:0,decks:[],quests:0};e.copies=Math.max(e.copies,miss);e.score+=dv;e.decks.push(d.name)})});
  const act=(typeof allQuests==="function"?allQuests():[]).filter(q=>needLeft(q)>0&&(q.k==="play"||q.k==="deck")&&(q.ids||q.sets.length||q.cat||q.t||q.kw||q.rar||q.dmg||q.g!==""));
  Object.values(E).forEach(e=>{const c=CARD[e.id];act.forEach(q=>{if(qMatch(c,q)){e.score+=0.15;e.quests++}});e.cost=e.copies*SCRAP[c.r];e.rank=e.score/Math.sqrt(e.cost)});
  const list=Object.values(E).sort((a,b)=>b.rank-a.rank);
  let left=budget;list.forEach(e=>{e.fits=e.cost<=left;if(e.fits)left-=e.cost});
  const decks=DATA.decks.map(d=>({d,s:deckStats(d)})).filter(x=>x.s.scrap>0&&x.s.scrap<=budget).sort((a,b)=>a.d.t-b.d.t||a.s.scrap-b.s.scrap);
  return {list,decks,spent:budget-left,fw:ms.length?fw:null};
}
function renderCraft(){
  const p=document.getElementById("craftPanel");if(!p)return;
  let b=0;try{b=+localStorage.getItem("gwint-scraps")||0}catch(e){}
  if(!p.dataset.ready){p.dataset.ready=1;
    p.innerHTML=`<div class="row" style="justify-content:space-between"><h2>Co scraftować</h2><label class="small">Mam skrawków: <input type="number" id="scrapIn" min="0" step="10" style="width:6.5em"></label></div><div id="craftOut"></div>`;
    const inp=p.querySelector("#scrapIn");inp.value=b||"";
    let t=null;inp.oninput=()=>{clearTimeout(t);t=setTimeout(()=>{try{localStorage.setItem("gwint-scraps",String(+inp.value||0))}catch(e){}renderCraft()},250)}}
  const out=p.querySelector("#craftOut");out.innerHTML="";
  if(!Object.keys(owned).length){out.innerHTML='<p class="empty">Najpierw wczytaj kolekcję.</p>';return}
  const P=craftPlan(b);
  const intro=document.createElement("p");intro.className="small muted";
  intro.textContent="Ranking łączy siłę talii, to, jak blisko jesteś jej dokończenia, ile kosztuje karta"+(P.fw?", którymi frakcjami grasz najczęściej (30 dni)":"")+" i Twoje zadania."+(b?"":" Wpisz liczbę skrawków, a zaznaczę, na co Cię stać.");
  out.appendChild(intro);
  if(b&&P.decks.length){const d=document.createElement("p");d.className="small";d.innerHTML="<b>Każdą z tych talii dokończysz od razu:</b> ";d.append(P.decks.slice(0,4).map(x=>`${x.d.name} (${fmt(x.s.scrap)})`).join(" · "));out.appendChild(d)}
  const cl=document.createElement("div");cl.className="clist";
  P.list.slice(0,15).forEach((e,i)=>{const c=CARD[e.id];const r=document.createElement("div");r.className="crow "+(b&&e.fits?"have":"miss");
    r.innerHTML=`<div class="pv ${c.g?"g":"b"}">${c.p}</div><div class="cname"><div><b></b></div><div class="small muted dd"></div></div><div class="own"><span class="need mono">${fmt(e.cost)}</span></div>`;
    r.querySelector("b").textContent=(i+1)+". "+(e.copies>1?"2× ":"")+c.pl;
    const ds=[...new Set(e.decks)];r.querySelector(".dd").textContent=`${RAR[c.r]} · ${FAC[c.f].n} · w taliach: ${ds.slice(0,3).join(", ")}${ds.length>3?` i ${ds.length-3} innych`:""}${e.quests?` · pasuje do ${e.quests} ${e.quests===1?"zadania":"zadań"}`:""}`;
    cl.appendChild(r)});
  out.appendChild(cl);
  if(b){const s=document.createElement("p");s.className="small muted";s.textContent=`Zielone mieszczą się razem w budżecie (${fmt(P.spent)} z ${fmt(b)} skrawków).`;out.appendChild(s)}
}
