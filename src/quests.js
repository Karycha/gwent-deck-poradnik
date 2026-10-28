// ===== ZADANIA =====
const SETNAME={pod:"Podstawowy",nov:"Novigrad",rop:"Przeklęta Ropucha",krw:"Krwawa Klątwa",zel:"Żelazny Osąd",cen:"Cena Władzy",uro:"Uroboros",lus:"Pan Lusterko",wie:"Droga Wiedźmina",ofi:"Kupcy z Ofiru",woj:"Wojna Krwi",inne:"Inne"};
const FACRX=[["ST",/scoia/i],["NG",/nilfgaard/i],["MO",/potwor/i],["NR",/królestw|północ/i],["SK",/skellige/i],["SY",/syndykat/i]];
const plZad=n=>n===1?"zadanie":(n%10>=2&&n%10<=4&&(n%100<10||n%100>=20))?"zadania":"zadań";
const KWS=["Adrenalina","Zasadzka","Pancerz","Asymilacja","Wygnaj","Barykada","Szał","Krwawienie","Więź","Nagroda","Ładunek","Starcie","Spisek","Pochłoń","Odnowienie","Utwórz","Załoga","Śmiertelny cios","Zemsta","Obrońca","Rozmieszczenie","Lojalność","Odrzuć","Zdrada","Dominacja","Fatum","Kradzież","Pojedynek","Echo","Wrażliwość","Opłata","Flanka","Formacja","Łaska","Harmonia","Uzdrów","Kapitał","Odporność","Inicjatywa","Amok","Inspiracja","Zastraszenie","Rodowód","Zablokuj","Potęga","Rozkaz","Cierpliwość","Trucizna","Drapieżnik","Zysk","Oczyść","Wytrzymałość","Zaopatrzenie","Ujawnij","Skaza","Sabat","Przechwycenie","Tarcza","Stwórz","Uruchomienie","Szpieg","Wezwij","Symbioza","Pokrzepienie","Odliczanie","Haracz","Zasłona","Weteran","Występek","Witalność","Zapał"];
const SETRX=[["pod",/podstawow|startow/i],["nov",/novigrad/i],["rop",/ropuch/i],["krw",/krwaw\S* klątw/i],["zel",/żelazn/i],["cen",/cen\S* władzy/i],["uro",/uroboros/i],["lus",/lusterk/i],["wie",/drog\S* wiedźmin/i],["ofi",/ofir/i],["woj",/wojn\S* krwi/i]];
const CATRX=[["Zaklęcie",/zaklę/i],["Taktyka",/taktyk/i],["Alchemia",/alchemi/i],["Bomba",/bomb/i],["Rejza",/rejz/i],["Zbrodnia",/zbrodni/i],["Natura",/natur/i],["Organiczne",/organiczn/i],["Działania Wojenne",/działa\S* wojenn/i],["Żołnierz",/żołnierz/i],["Wiedźmin",/wiedźmin/i],["Smok",/smok/i],["Krasnolud",/krasnolud/i],["Elf",/(^|\s)elf/i],["Driada",/driad/i],["Wampir",/wampir/i],["Insektoid",/insektoid/i],["Kultysta",/kultyst/i],["Korsarz",/korsarz/i],["Wojownik",/wojownik/i],["Okręt",/okręt/i],["Maszyna",/maszyn/i],["Czarodziej",/czarodziej/i],["Bestia",/besti/i],["Ogroid",/ogroid/i],["Relikt",/relikt/i],["Rycerz",/rycerz/i],["Agent",/agent/i],["Arystokrata",/arystokrat/i],["Pułapka",/pułapk/i],["Lokalizacja",/lokalizacj/i]];
const NOAUTO=new Set(["Renfri","Golden Nekker","Shupe's Day Off","Radeyah","Ciri: Nova","Renfri's Gang","Tatterwing","Musicians of Blaviken"]);
let quests=[];
const isDmg=c=>/obrażeń|obrażenia/i.test(c.ab)&&/zadaj/i.test(c.ab);

function parseQuest(text){
  const q={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),text:text.trim(),k:"play",n:5,f:"",sets:[],kw:"",cat:"",dmg:false,t:"",g:"",prog:0};
  const t=q.text;
  if(/wygraj/i.test(t))q.k="win";
  const dm=t.match(/co najmniej\s*(\d+)\s*kart/i);if(dm){q.k="deck";q.min=+dm[1]}
  const n=t.match(/^\s*(\d+)\s*raz/i)||t.match(/(\d+)\s*szt/i)||t.match(/liczbie\s*(\d+)/i)||t.match(/\((\d+)\)/)||t.match(/(?:zagraj|wygraj)\D{0,12}(\d+)/i);if(n)q.n=+n[1];
  const setPart=(t.match(/z zestaw\S*(.*)$/i)||[,""])[1];
  const head=setPart?t.slice(0,t.toLowerCase().indexOf("z zestaw")):t;
  for(const[f,rx]of FACRX)if(rx.test(head)){q.f=f;break}
  if(setPart)for(const[s,rx]of SETRX)if(rx.test(setPart))q.sets.push(s);
  if(q.k==="play"){
    const ki=head.search(/kluczow/i);let kw=null;
    if(ki>=0){const after=head.slice(ki,ki+70).toLowerCase();let best=1e9;for(const k of KWS){const j=after.indexOf(k.toLowerCase());if(j>=0&&j<best){best=j;kw=k}}if(kw)q.kw=kw.toLowerCase().slice(0,5)}
    if(/obrażeń|obrażenia/i.test(head))q.dmg=true;
    const rest=ki>=0?head.slice(0,ki):head;
    for(const[c,rx]of CATRX)if(rx.test(rest.replace(/zadania obrażeń/i,""))){q.cat=c;break}
    if(/jednost/i.test(head))q.t="J";else if(/specjaln/i.test(head))q.t="S";else if(/artefakt/i.test(head))q.t="A";
    if(/złot/i.test(head))q.g="1";else if(/brązow/i.test(head))q.g="0";
  }
  return q;
}
function qMatch(c,q){
  if(q.k==="win")return false;
  if(q.f&&c.f!==q.f)return false;
  if(q.sets.length&&!q.sets.includes(c.s))return false;
  if(q.kw&&!c.ab.toLowerCase().includes(q.kw))return false;
  if(q.cat&&!c.cat.includes(q.cat))return false;
  if(q.dmg&&!isDmg(c))return false;
  if(q.t&&c.t!==q.t)return false;
  if(q.g!==""&&String(c.g)!==q.g)return false;
  return true;
}
function qDesc(q){
  const p=[];
  if(q.k==="win")return `Wygraj ${q.n} ${q.n===1?"grę":"gry"}`+(q.f?` frakcją ${FAC[q.f].n}`:"");
  if(q.k==="deck")return `Wygraj ${q.n} ${q.n===1?"grę":"gry"} z co najmniej ${q.min} kartami z zestawu: `+q.sets.map(s=>SETNAME[s]).join(", ")+(q.f?` (${FAC[q.f].n})`:"");
  p.push(`Zagraj ${q.n}`);
  if(q.g==="1")p.push("złotych");if(q.g==="0")p.push("brązowych");
  p.push(q.t==="J"?"jednostek":q.t==="S"?"kart specjalnych":q.t==="A"?"artefaktów":"kart");
  if(q.f)p.push(FAC[q.f].n);
  if(q.cat)p.push(`(${q.cat})`);
  if(q.kw)p.push(`ze słowem „${q.kw}…”`);
  if(q.dmg)p.push("zadających obrażenia");
  if(q.sets.length)p.push("z zestawu: "+q.sets.map(s=>SETNAME[s]).join(", "));
  return p.join(" ");
}
function needLeft(q){return Math.max(0,q.n-(q.prog||0))}
function bestLeader(f){return DATA.leaders.filter(l=>l.f===f).sort((a,b)=>b.bonus-a.bonus)[0]}
function buildQuestDeck(f,qs){
  const L=bestLeader(f);const limit=150+L.bonus;
  const pool=[];for(const k in owned){const c=CARD[k];if((c.f===f||c.f==="NE")&&!NOAUTO.has(c.en))pool.push(c)}
  const qm=c=>qs.reduce((a,q)=>a+(qMatch(c,q)?1:0),0);
  pool.sort((a,b)=>qm(b)-qm(a)||b.p-a.p||(b.t==="J")-(a.t==="J"));
  const deck={};let n=0,tot=0,units=0;
  const tryAdd=c=>{const left=25-n-1,uNeed=13-units-(c.t==="J"?1:0);if(n>=25||left<uNeed||tot+c.p>limit-left*4)return false;deck[c.id]=(deck[c.id]||0)+1;n++;tot+=c.p;if(c.t==="J")units++;return true};
  for(const pass of [1,0])for(const c of pool){if(pass&&!qm(c))continue;const have=Math.min(owned[c.id],maxOf(c));while((deck[c.id]||0)<have&&tryAdd(c));}
  if(n<25){const cheap=[...pool].sort((a,b)=>a.p-b.p);for(const c of cheap){const have=Math.min(owned[c.id],maxOf(c));while((deck[c.id]||0)<have&&tryAdd(c));}}
  const cards=Object.entries(deck);
  return {f,leader:L,limit,tot,units,n,cards,hits:qs.map(q=>cards.reduce((a,[id,k])=>a+(qMatch(CARD[id],q)?k:0),0))};
}
function questPlan(){
  const act=quests.filter(q=>needLeft(q)>0);
  return ["NG","MO","NR","ST","SK","SY"].map(f=>{
    const qs=act.filter(q=>(q.k==="play"||q.k==="deck")&&(!q.f||q.f===f));
    const d=buildQuestDeck(f,qs);
    const done=[];
    act.forEach(q=>{if(q.k==="win"){if(!q.f||q.f===f)done.push(q)}else{const i=qs.indexOf(q);if(i>=0&&d.hits[i]>=(q.k==="deck"?q.min:Math.min(needLeft(q),3)))done.push(q)}});
    return {f,d,qs,done};
  }).filter(p=>p.done.length&&p.d.n===25).sort((a,b)=>b.done.length-a.done.length||b.d.tot-a.d.tot);
}
function renderQuests(){
  const box=$("#qlist");box.innerHTML="";
  if(!quests.length){box.innerHTML='<p class="empty">Nie masz jeszcze zadań. Wklej treść zadania z gry powyżej.</p>'}
  quests.forEach((q,i)=>{
    const el=document.createElement("div");el.className="quest"+(needLeft(q)?"":" done");
    const own=q.k!=="win"?Object.keys(owned).filter(k=>qMatch(CARD[k],q)):[];
    const copies=own.reduce((a,k)=>a+owned[k],0);
    el.innerHTML=`<div class="qhead"><span class="qnum">Z${i+1}</span><div class="qtxt"><b></b><span class="small muted"></span></div><button class="btn ghost small qdel" aria-label="Usuń zadanie">Usuń</button></div>
      <div class="row small"><label>Postęp <input type="number" min="0" max="${q.n}" value="${q.prog||0}" class="qprog" style="width:4.2em"> / ${q.n}</label>
      <label>Frakcja <select class="qfac"><option value="">dowolna</option>${["NG","MO","NR","ST","SK","SY"].map(f=>`<option value="${f}"${q.f===f?" selected":""}>${FAC[f].n}</option>`).join("")}</select></label></div>
      ${q.k!=="win"?`<div class="small ${copies?"":"miss-t"}">Pasujące karty w kolekcji: <b>${own.length}</b> (${copies} kopii)</div><div class="chips qcards"></div>`:""}`;
    el.querySelector("b").textContent=qDesc(q);el.querySelector(".small.muted").textContent=q.text;
    el.querySelector(".qdel").onclick=()=>{quests.splice(i,1);changed()};
    el.querySelector(".qprog").onchange=e=>{q.prog=Math.max(0,Math.min(q.n,+e.target.value||0));changed()};
    el.querySelector(".qfac").onchange=e=>{q.f=e.target.value;changed()};
    if(q.k!=="win"){const ch=el.querySelector(".qcards");own.sort((a,b)=>CARD[a].f.localeCompare(CARD[b].f)||CARD[b].p-CARD[a].p).slice(0,24).forEach(k=>{const s=document.createElement("span");s.className="qchip";s.style.setProperty("--fc",fcol(CARD[k].f));s.textContent=(owned[k]>1?owned[k]+"× ":"")+CARD[k].pl;ch.appendChild(s)});if(own.length>24){const s=document.createElement("span");s.className="small muted";s.textContent=`+${own.length-24} więcej`;ch.appendChild(s)}}
    box.appendChild(el);
  });
  const pb=$("#qplan");pb.innerHTML="";
  const act=quests.filter(q=>needLeft(q)>0);
  if(!act.length){pb.innerHTML='<p class="empty">Plan pojawi się, gdy dodasz zadania.</p>';return}
  const plan=questPlan();
  if(!plan.length){pb.innerHTML='<p class="empty">Z obecnej kolekcji nie da się złożyć talii pod te zadania.</p>';return}
  const covered=new Set();
  plan.forEach((p,pi)=>{
    const newOnes=p.done.filter(q=>!covered.has(q));if(!newOnes.length&&pi>0)return;p.done.forEach(q=>covered.add(q));
    const art=document.createElement("article");art.className="deck"+(ui.open.has("q-"+p.f)?" open":"");art.style.setProperty("--fc",fcol(p.f));
    const head=document.createElement("button");head.className="deck-head";
    const ids=p.done.map(q=>"Z"+(quests.indexOf(q)+1)).join(", ");
    head.innerHTML=`<div class="deck-title"><span class="fchip">${FAC[p.f].n}</span><h3>Talia na zadania</h3><span class="tier bud">${ids}</span></div><span class="chev" aria-hidden="true">›</span>
      <div class="deck-meta"><span>Przywódca: <b></b></span><span class="mono">${p.d.tot}/${p.d.limit} prowizji · ${p.d.units} jedn.</span></div>`;
    head.querySelector("b").textContent=p.d.leader.pl;
    head.onclick=()=>{const k="q-"+p.f;ui.open.has(k)?ui.open.delete(k):ui.open.add(k);renderQuests()};
    art.appendChild(head);
    if(ui.open.has("q-"+p.f)){
      const body=document.createElement("div");body.className="deck-body";
      const info=document.createElement("div");info.className="small";
      info.innerHTML=p.qs.map((q,i)=>`Z${quests.indexOf(q)+1}: <b>${p.d.hits[i]}</b> pasujących kart w talii`+(q.k==="deck"?` (wymagane ${q.min})`:"")).join(" · ")||"Ta talia służy do wygrywania gier tą frakcją.";
      body.appendChild(info);
      const cl=document.createElement("div");cl.className="clist";
      p.d.cards.sort((a,b)=>CARD[b[0]].p-CARD[a[0]].p).forEach(([id,k])=>{const r=cardRow(id,k);if(p.qs.some(q=>qMatch(CARD[id],q)))r.classList.add("qhit");cl.appendChild(r)});
      body.appendChild(cl);
      const btn=document.createElement("button");btn.className="btn ghost";btn.textContent="Kopiuj listę kart";
      btn.onclick=()=>copyText("Talia na zadania – "+FAC[p.f].n+"\nPrzywódca: "+p.d.leader.pl+"\n"+p.d.cards.map(([id,k])=>`${k}× ${CARD[id].pl} (${CARD[id].p})`).join("\n"),"Lista skopiowana");
      body.appendChild(btn);
      art.appendChild(body);
    }
    pb.appendChild(art);
  });
  const left=act.filter(q=>!covered.has(q));
  if(left.length){const p=document.createElement("p");p.className="small muted";p.textContent="Bez talii z Twoich kart: "+left.map(q=>"Z"+(quests.indexOf(q)+1)).join(", ")+". Zobacz, czego brakuje, w liście pasujących kart.";pb.appendChild(p)}
  const wins=act.filter(q=>q.k==="win"&&q.f);
  if(wins.length){const w=document.createElement("div");w.className="small";
    w.innerHTML="<b>Najlepsze gotowe talie do wygranych:</b> "+wins.map(q=>{const best=DATA.decks.filter(d=>d.f===q.f).map(d=>({d,s:deckStats(d)})).sort((a,b)=>a.s.scrap-b.s.scrap||a.d.t-b.d.t)[0];return best?`${FAC[q.f].n}: ${best.d.name} (${best.s.scrap?fmt(best.s.scrap)+" skr. brakuje":"masz komplet"})`:""}).join(" · ");pb.appendChild(w)}
}
// --- rozpoznawanie zadań ze zrzutu ekranu ---
function questsFromText(raw){
  const t=raw.replace(/[|©®"“”„]/g," ").replace(/\s+/g," ").replace(/Nowe zadani.*$/i,"");
  const parts=t.split(/(?=\b\d+\s*razy\s+wygraj|\bZagraj\s+\d|\bZagraj\s+[A-ZŻŹĆĄŚĘŁÓŃ]|(?<!razy\s)\bWygraj\b)/i).map(x=>x.trim());
  const out=[];let carry=null;
  parts.forEach(p=>{
    const fr=p.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\S{0,3}\s*$/);
    if(/^(\d+\s*razy\s+wygraj|zagraj|wygraj)/i.test(p)){
      let txt=p.replace(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\S{0,3}\s*$/,"");
      const rx=/(Ropuchy|Novigradu|Krwi|podstawowego|startowego|Klątwy|Osądu|Władzy|Lusterka|Wiedźmina|Ofiru|Uroborosa|liczbie \d+|frakcj\S*\s+\S+)/gi;let m,last=null;while((m=rx.exec(txt)))last=m;
      if(last)txt=txt.slice(0,last.index+last[0].length);
      txt=txt.replace(/\s+[^\sA-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż0-9]{1,3}(?=\s|$)/g," ").replace(/\s+/g," ").trim();
      const q=parseQuest(txt);if(carry&&+carry[2]===q.n)q.prog=Math.min(+carry[1],q.n);out.push(q);
    }
    carry=fr;
  });
  return out.filter(q=>q.k!=="play"||q.f||q.sets.length||q.kw||q.cat||q.dmg);
}
function prepCanvas(img){const sc=Math.min(2,2400/img.width);const c=document.createElement("canvas");c.width=img.width*sc;c.height=img.height*sc;const x=c.getContext("2d");x.drawImage(img,0,0,c.width,c.height);
  const d=x.getImageData(0,0,c.width,c.height),a=d.data;for(let i=0;i<a.length;i+=4){const r=a[i],g=a[i+1],b=a[i+2],l=(r*299+g*587+b*114)/1000;const v=(l<120&&r-b>8)?0:255;a[i]=a[i+1]=a[i+2]=v}x.putImageData(d,0,0);return c}
let tessP=null;
function loadTess(){if(window.Tesseract)return Promise.resolve();if(tessP)return tessP;tessP=new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";s.onload=res;s.onerror=rej;document.head.appendChild(s)});return tessP}
let ocrFound=[];
async function ocrFiles(files){
  const st=$("#ocrStatus");ocrFound=[];renderOcr();
  if(!standalonePage){st.textContent="Rozpoznawanie screenów działa w wersji na telefonie (GitHub Pages). Tutaj wklej treść zadań ręcznie.";return}
  try{
    st.textContent="Ładuję rozpoznawanie tekstu (pierwszy raz może potrwać chwilę)…";await loadTess();
    const w=await Tesseract.createWorker("pol",1,{langPath:"https://cdn.jsdelivr.net/npm/@tesseract.js-data/pol@1.0.0/4.0.0_best_int",logger:m=>{if(m.status==="recognizing text")st.textContent=`Czytam screena… ${Math.round(m.progress*100)}%`}});
    for(const f of files){const img=await createImageBitmap(f);const r=await w.recognize(prepCanvas(img));ocrFound.push(...questsFromText(r.data.text))}
    await w.terminate();
    const have=new Set(quests.map(q=>qDesc(q)));ocrFound=ocrFound.filter((q,i,a)=>!have.has(qDesc(q))&&a.findIndex(x=>qDesc(x)===qDesc(q))===i);
    st.textContent=ocrFound.length?`Znalazłem ${ocrFound.length} ${plZad(ocrFound.length)}. Sprawdź i dodaj:`:"Nie znalazłem nowych zadań na screenie. Spróbuj przyciąć screena do samych zadań.";
    renderOcr();
  }catch(e){st.textContent="Nie udało się odczytać screena. Sprawdź internet albo wklej treść zadań ręcznie."}
}
function renderOcr(){const box=$("#ocrList");box.innerHTML="";if(!ocrFound.length){$("#ocrAdd").hidden=true;return}
  ocrFound.forEach((q,i)=>{const l=document.createElement("label");l.className="ocrrow";const cb=document.createElement("input");cb.type="checkbox";cb.checked=true;cb.id="ocr-"+i;cb.dataset.i=i;const sp=document.createElement("span");sp.textContent=qDesc(q)+(q.prog?` (postęp ${q.prog}/${q.n})`:"");l.append(cb,sp);box.appendChild(l)});$("#ocrAdd").hidden=false}
$("#ocrBtn").onclick=()=>$("#ocrFile").click();
$("#ocrFile").onchange=e=>{const f=[...e.target.files];e.target.value="";if(f.length)ocrFiles(f)};
$("#ocrAdd").onclick=()=>{const sel=[...document.querySelectorAll("#ocrList input:checked")].map(c=>ocrFound[+c.dataset.i]);quests.push(...sel);ocrFound=[];renderOcr();$("#ocrStatus").textContent=`Dodano ${sel.length} ${plZad(sel.length)}.`;changed()};
$("#qClear").onclick=function(){if(this.dataset.armed){quests=[];changed();delete this.dataset.armed;this.textContent="Usuń wszystkie zadania"}else{this.dataset.armed=1;this.textContent="Na pewno? Kliknij jeszcze raz";setTimeout(()=>{if(this.dataset.armed){delete this.dataset.armed;this.textContent="Usuń wszystkie zadania"}},4000)}};
$("#qClearDone").onclick=()=>{quests=quests.filter(q=>needLeft(q)>0);changed()};
document.addEventListener("paste",e=>{if(ui.view!=="zadania")return;const it=[...(e.clipboardData||{}).items||[]].filter(i=>i.type.startsWith("image/")).map(i=>i.getAsFile());if(it.length){e.preventDefault();ocrFiles(it)}});
$("#qAdd").onclick=()=>{const lines=$("#qText").value.split(/\n+/).map(s=>s.trim()).filter(s=>s.length>8);lines.forEach(l=>quests.push(parseQuest(l)));if(lines.length){$("#qText").value="";changed()}};
