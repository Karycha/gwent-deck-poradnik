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
  if(!all.length&&!DS.live){box.innerHTML=`<div class="panel"><h2>Mecze</h2><p class="empty">${DS&&DS.logFound?"Jeszcze nie ma meczów. Zagraj w Gwinta, a wynik pojawi się tu sam.":"Nie widzę logu gry. Uruchom Gwinta na tym komputerze."}</p></div>`;return}
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
    <div class="sumrow"><span>Czas: <b>${mins(m0)} min</b></span>${m0.xp?`<span>Doświadczenie: <b>+${m0.xp}</b></span>`:""}${ratingTxt(m0)}${m0.rank&&!m0.rating?`<span>Ranking: <b>${m0.rank.pieces}/${m0.rank.max}</b> (poziom ${m0.rank.tier})</span>`:""}${vs.length>1?`<span>Z tym graczem: <b>${vsS.w}–${vsS.l}</b></span>`:""}</div>
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
    <div class="grid2"><div><div class="label">Moje frakcje</div><div class="mstat my"></div></div><div><div class="label">Frakcje rywali</div><div class="mstat op"></div></div></div>`;
  [["1","Dziś"],["7","7 dni"],["all","Wszystko"]].forEach(([k,l])=>{const b=document.createElement("button");b.className="fbtn";b.textContent=l;b.setAttribute("aria-pressed",ui.mper===k);b.onclick=()=>{ui.mper=k;renderMatches()};sp.querySelector(".per").appendChild(b)});
  const statRows=(el,key)=>{const by={};list.forEach(m=>{const f=key(m);if(f)(by[f]=by[f]||[]).push(m)});
    const ks=Object.keys(by).sort((a,b)=>by[b].length-by[a].length);
    if(!ks.length){el.innerHTML='<p class="small muted">'+(el.classList.contains("op")?"Zaznacz frakcję rywala przy meczach, a pojawi się tu bilans.":"Brak danych.")+"</p>";return}
    ks.forEach(f=>{const s=wl(by[f]);const r=document.createElement("div");r.className="mst";r.style.setProperty("--fc",fcol(f));const mm=el.classList.contains("my")?all.find(m=>m.mmr&&m.mmr[f]):null;r.innerHTML=`<span class="sw"></span><span class="nm">${FAC[f].n}${mm?` <span class="small muted mono" title="MMR frakcji">${mm.mmr[f].to}</span>`:""}</span><span class="mono">${s.w}–${s.l}</span><span class="bar"><i style="width:${s.pct}%"></i></span><span class="mono">${s.pct}%</span>`;el.appendChild(r)})};
  statRows(sp.querySelector(".my"),m=>m.faction);
  statRows(sp.querySelector(".op"),m=>tags[m.id]);
  box.appendChild(sp);
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
  const g=liveDeck(L.gold);el.style.setProperty("--fc",fcol(g.f||"NE"));
  const vs=opp?all.filter(m=>oppNick(m)===opp):[],vsS=wl(vs);
  el.innerHTML=`<div class="row" style="justify-content:space-between"><span class="label"><span class="livedot"></span>Mecz trwa · ${MODEN[L.mode]||L.mode||""}</span><span class="mono ltimer" data-start="${L.start}"></span></div>
    <div class="mbig"><span>vs <b class="nick"></b></span>${g.f?`<span class="fchip">${FAC[g.f].n}</span>`:""}</div>
    <div class="sumrow">${vs.length?`<span>Z tym graczem: <b>${vsS.w}–${vsS.l}</b> (${vs.length} ${vs.length===1?"mecz":"mecze"})</span>`:opp?"<span>Pierwszy mecz z tym graczem</span>":"<span>Czekam na dane rywala…</span>"}${g.gold?`<span>Złota karta w talii: <b class="gold"></b></span>`:""}</div>
    <div class="lq small"></div><div class="lplan"></div>`;
  el.querySelector(".nick").textContent=opp||"…";
  if(g.gold)el.querySelector(".gold").textContent=g.card?g.card.pl:g.gold;
  const qs=gameQuests().filter(q=>needLeft(q)&&q.k!=="other"&&(!q.f||!g.f||q.f===g.f));
  if(qs.length)el.querySelector(".lq").textContent="Zadania do zrobienia w tej grze: "+qs.map(q=>`${qLabel(q)} ${gqDesc(q)} (${q.prog}/${q.n})`).join(" · ");
  if(g.deck){const d=g.deck,pl=el.querySelector(".lplan");
    pl.innerHTML=`<details${ui.liveOpen===false?"":" open"}><summary><b>Plan gry: </b><span class="dn"></span></summary><div class="grid2"><div><div class="label">Mulligan</div><p class="note"></p></div><div><div class="label">Rundy</div><p class="note"></p></div></div><ol class="small"></ol></details>`;
    pl.querySelector(".dn").textContent=d.name+" (najbliższa talia z apki z tą kartą)";const ps=pl.querySelectorAll("p");ps[0].textContent=d.mull;ps[1].textContent=d.rounds;
    (d.steps||[]).forEach(x=>{const li=document.createElement("li");li.textContent=x;pl.querySelector("ol").appendChild(li)});
    pl.querySelector("details").ontoggle=e=>{ui.liveOpen=e.target.open}}
  return el;
}
function oppSelect(sel,m,tags){
  sel.innerHTML='<option value="">rywal: ?</option>'+["NG","MO","NR","ST","SK","SY"].map(f=>`<option value="${f}"${tags[m.id]===f?" selected":""}>${FAC[f].n}</option>`).join("");
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
.mst .bar{height:6px;background:var(--line);border-radius:3px;overflow:hidden}.mst .bar i{display:block;height:100%;background:var(--fc)}
@media(max-width:520px){.mrow{grid-template-columns:auto auto 1fr}.mrow .opp{grid-column:1/-1;grid-row:auto;max-width:none}}`;
  document.head.appendChild(css);
  document.documentElement.classList.add("desktop");
  const refresh=()=>{gqCache=null;if(["zadania","mecze","kolekcja"].includes(ui.view))render();else renderDeskSync()};
  let liveStart=null;
  const onState=s=>{const ls=s.live&&s.live.start;DS=s;gqCache=null;if(ls&&ls!==liveStart){liveStart=ls;if(ui.view!=="mecze"){go("mecze");return}}liveStart=ls||null;refresh()};
  DESK.on("state",onState);
  setInterval(()=>{const t=document.querySelector(".ltimer");if(!t)return;const s=Math.max(0,Math.floor((Date.now()-+t.dataset.start)/1000));t.textContent=Math.floor(s/60)+":"+String(s%60).padStart(2,"0")},1000);
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
