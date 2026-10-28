"""Buduje data.json: wszystkie karty kolekcjonerskie (PL/EN) + zwalidowane decki."""
import json, re, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from decks import DECKS, PROV_2026, POWER_2026, LEADER_BONUS_2026

SRC = sys.argv[1]
OUT = sys.argv[2]
db = json.load(open(SRC))

FAC = {"Nilfgaard":"NG","Monster":"MO","Northern Realms":"NR","Scoiatael":"ST","Skellige":"SK","Syndicate":"SY","Neutral":"NE"}
SCRAP = {"Common":30,"Rare":80,"Epic":200,"Legendary":800}
TYPE_PL = {"Unit":"J","Special":"S","Artifact":"A"}

cards, by_en, leaders = {}, {}, {}
for v in db.values():
    en = v["name"]["en-US"]; pl = v["name"]["pl-PL"]
    if v["type"] == "Ability":
        m = re.search(r"adds (\d+) provisions", v["ability"]["en-US"])
        leaders[en] = dict(pl=pl, bonus=int(m.group(1)) if m else 15, f=FAC[v["faction"]],
                           ab=re.sub(r"\s+"," ",v["ability"]["pl-PL"]).strip())
        continue
    if not v.get("collectible") or v["type"] == "Stratagem":
        continue
    cid = v["cardId"]
    prov = PROV_2026.get(en, v["provision"])  # nadpisywane niżej danymi na żywo
    c = dict(id=cid, en=en, pl=pl, f=FAC[v["faction"]], g=1 if v["color"]=="Gold" else 0,
             p=prov, pw=POWER_2026.get(en, v.get("power",0)), t=TYPE_PL.get(v["type"],"J"),
             r=v["rarity"][0], cat=(v.get("categories") or {}).get("pl-PL",""),
             ab=re.sub(r"\s+"," ",(v.get("ability") or {}).get("pl-PL","") or "").strip())
    cards[cid] = c
    by_en.setdefault(en, []).append(cid)

# Aktualne dane z playgwent.com (po ostatniej Radzie Balansu) nadpisują bazę
LIVE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "live")
RAR = {"5":"C","15":"R","20":"E","25":"L"}
live_n = 0
if os.path.exists(os.path.join(LIVE, "cards.txt")):
    for row in open(os.path.join(LIVE, "cards.txt")).read().strip().split(";"):
        cid, prov, pw, arm, typ, rar, fac, grp, craft = row.split(",")
        if cid in cards:
            c = cards[cid]; c["p"] = int(prov); c["pw"] = int(pw); c["r"] = RAR.get(rar, c["r"]); live_n += 1
    lid = {v["cardId"]: v["name"]["en-US"] for v in db.values() if v["type"] == "Ability"}
    for kv in open(os.path.join(LIVE, "leaders.txt")).read().strip().split(","):
        k, b = kv.split(":")
        if k in lid: leaders[lid[k]]["bonus"] = int(b)
    print("dane na żywo z playgwent.com:", live_n, "kart")
else:
    for k in LEADER_BONUS_2026: leaders[k]["bonus"] = LEADER_BONUS_2026[k]

errors = []
out_decks = []
for d in DECKS:
    lead = leaders[d["leader"]]
    limit = 150 + lead["bonus"]
    lst, total, units, n, tactics = [], 0, 0, 0, 0
    for en, cnt in d["cards"].items():
        ids = by_en.get(en)
        if not ids: errors.append(f"{d['id']}: brak karty '{en}'"); continue
        c = cards[ids[0]]
        if c["f"] not in (d["f"], "NE"): errors.append(f"{d['id']}: {en} z innej frakcji ({c['f']})")
        if c["g"] and cnt > 1: errors.append(f"{d['id']}: złota {en} x{cnt}")
        if cnt > 2: errors.append(f"{d['id']}: {en} x{cnt}")
        lst.append([c["id"], cnt]); total += c["p"]*cnt; n += cnt
        if c["t"] == "J": units += cnt
        if "Taktyka" in c["cat"]: tactics += cnt
    if n != 25: errors.append(f"{d['id']}: {n} kart")
    if units < 13: errors.append(f"{d['id']}: {units} jednostek")
    if total > limit: errors.append(f"{d['id']}: {total}/{limit} prowizji")
    if d["leader"] == "Enslave" and tactics < 12: errors.append(f"{d['id']}: tylko {tactics} Taktyk")
    print(f"{d['id']:8} {n} kart, {units} jedn., {total}/{limit} prow." + (f", Taktyki {tactics}" if d['leader']=='Enslave' else ""))
    out_decks.append(dict(id=d["id"], f=d["f"], t=d["t"], b=1 if d.get("budget") else 0, name=d["name"], leader=lead["pl"], leaderEn=d["leader"],
                          leaderAb=lead["ab"], limit=limit, prov=total, units=units, cards=lst,
                          plan=d["plan"], mull=d["mull"], rounds=d["rounds"]))

# Golden Nekker: brak kart 10+ poza wyjątkami
for d in out_decks:
    ids = [i for i,_ in d["cards"]]
    if any(cards[i]["en"]=="Golden Nekker" for i in ids):
        bad = [cards[i]["en"] for i in ids if cards[i]["p"]>=10 and cards[i]["en"] not in ("Golden Nekker","Ciri: Nova")]
        if bad: errors.append(f"{d['id']}: Złoty Nekker zablokowany przez {bad}")
    if any(cards[i]["en"]=="Renfri" for i in ids) and d["units"] < 25:
        errors.append(f"{d['id']}: Renfri wymaga 25 jednostek ({d['units']})")

if errors:
    print("\nBŁĘDY:"); [print(" -", e) for e in errors]; sys.exit(1)

data = dict(scrap=SCRAP, cards=list(cards.values()), decks=out_decks)
json.dump(data, open(OUT,"w"), ensure_ascii=False, separators=(",",":"))
print(f"\nOK: {len(cards)} kart, {len(out_decks)} decków, {os.path.getsize(OUT)//1024} KB")
