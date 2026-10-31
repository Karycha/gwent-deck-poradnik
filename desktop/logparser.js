// Parser logów klienta Gwinta (GwentClient-*.log). Tylko odczyt pliku, gra nie jest dotykana.
'use strict';
const LINE = /^(\d\d):(\d\d):(\d\d)\.(\d+) \[(\w+)\]\[\d+\]\[(\w+)\] (.*)$/;

function fileDate(name) {
  const m = name.match(/GwentClient-(\d{4})(\d\d)(\d\d)/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
}

class GwentLogParser {
  constructor(fileName, sink) {
    this.base = fileDate(fileName);
    this.day = 0; this.lastSec = -1;
    this.sink = sink;            // {match(m), quest(q), activeQuest(q), self(nick)}
    this.mode = null; this.cur = null; this.lastEnded = null; this.partial = '';
  }
  ts(h, mi, s, ms) {
    const sec = h * 3600 + mi * 60 + s;
    if (this.lastSec >= 0 && sec + 3600 < this.lastSec) this.day++;   // przejście przez północ
    this.lastSec = sec;
    const d = new Date(this.base); d.setDate(d.getDate() + this.day); d.setHours(h, mi, s, +String(ms).slice(0, 3));
    return d.getTime();
  }
  feed(text) {
    const lines = (this.partial + text).split(/\r?\n/);
    this.partial = lines.pop();
    for (const l of lines) this.line(l.replace(/^﻿/, ''));
  }
  line(l) {
    const m = l.match(LINE);
    if (!m) {
      const pq = this.pendingQuest; this.pendingQuest = null;
      const k = l.indexOf(' of type {');
      if (pq && l.startsWith('progress') && k > 0) { try { const def = JSON.parse(l.slice(k + 9)); const q = questFromDef(def, pq); this.sink.activeQuest && this.sink.activeQuest(q); } catch (e) {} }
      return;
    }
    if (this.pendingQuest) { const pq = this.pendingQuest; this.pendingQuest = null; this.sink.activeQuest && this.sink.activeQuest(questFromDef({ id: pq.defId, type: pq.type, value: pq.value, filters: {} }, pq)); }
    const t = this.ts(+m[1], +m[2], +m[3], m[4]); const msg = m[7];
    let x;
    if ((x = msg.match(/"player_name":"([^"]+)"/))) this.sink.self && this.sink.self(x[1]);
    if ((x = msg.match(/\[RedLog\] Searching a (\S+) match/))) { this.mode = x[1]; return; }
    if (msg.includes('[BattleHandler] Game Initialized')) {
      this.cur = { start: t, mode: normMode(this.mode), players: {}, quests: [] }; this.mode = null; return;
    }
    if (this.cur && (x = msg.match(/\[PlayerInfoFetcher\]\[(P[12])\] Player info obtained ([^,]+),/))) { this.cur.players[x[1]] = x[2].trim(); return; }
    if ((x = msg.match(/End Game Data Received\. ProcessingEndGameData id: (\d+)/))) {
      if (this.cur) { this.cur.id = x[1]; this.cur.end = t; } return;
    }
    if (this.cur && (x = msg.match(/\[MatchOutcome\] \[OUTCOME\] current: pieces: (\d+) tier: (\d+) max: (\d+)/))) {
      this.cur.rank = { pieces: +x[1], tier: +x[2], max: +x[3] }; return;
    }
    if ((x = msg.match(/GogNoti: (\{.*\})/))) {
      let j; try { j = JSON.parse(x[1]); } catch (e) { return; }
      const target = this.cur || (this.lastEnded && t - this.lastEnded.end < 60000 ? this.lastEnded : null);
      if (j.type === 'profile_progress' && target && j.payload && j.payload.experience_change) {
        target.xp = j.payload.experience_change.details ? j.payload.experience_change.details.total : null;
        target.level = j.payload.level_change ? j.payload.level_change.to : null;
        if (target === this.lastEnded) this.sink.match(target);
      }
      if (j.type === 'quest_updated' && j.payload && j.payload.user_quest) {
        const q = questFromNoti(j.payload.user_quest, t);
        if (q) { this.sink.quest(q); if (target && q.state === 'complete') { target.quests.push(q.defId); if (target === this.lastEnded) this.sink.match(target); } }
      }
      return;
    }
    if ((x = msg.match(/DecisionPoint=matchEnded, parameters\[faction\]=(\w+), parameters\[result\]=(\w+)/))) {
      const c = this.cur || { start: t, mode: 'inne', players: {}, quests: [] };
      c.faction = normFaction(x[1]); c.result = x[2] === 'Win' ? 'W' : x[2] === 'Lose' ? 'L' : 'D';
      if (!c.end) c.end = t;
      if (!c.id) c.id = 't' + c.start;
      this.sink.match(c); this.lastEnded = c; this.cur = null; return;
    }
    if ((x = msg.match(/\[QuestManager\] Add quest Quest (\d+): objective: (\w+) (\d+)\/(\d+)(?: faction: (\w+))?; UserQuest (\w+) id: (\d+), (\w+)/))) {
      this.pendingQuest = { id: x[1], type: x[2], cur: +x[3], value: +x[4], faction: x[5] ? normFaction(x[5]) : '', kind: x[6], defId: x[7], state: x[8], modified: t };
    }
  }
}

function normMode(m) {
  if (!m) return 'inne';
  if (m.startsWith('ranked')) return 'ranked';
  if (m.startsWith('friend')) return 'friend';
  if (m.startsWith('arena')) return 'arena';
  if (m.startsWith('quick') || m.startsWith('casual')) return 'casual';
  return m.split('/')[0];
}
function normFaction(f) {
  f = (f || '').toLowerCase();
  if (f.startsWith('monster')) return 'MO';
  if (f.startsWith('nilf')) return 'NG';
  if (f.startsWith('northern')) return 'NR';
  if (f.startsWith('scoia')) return 'ST';
  if (f.startsWith('skell')) return 'SK';
  if (f.startsWith('synd')) return 'SY';
  return '';
}
const EXP = { BaseSet: 'pod', Expansion1: 'krw', Expansion2: 'nov', Expansion3: 'zel', Expansion4: 'ofi', Expansion5: 'lus', Expansion6: 'wie', Expansion7: 'cen', Expansion8: 'rop', Expansion9: 'uro' };
function questFromNoti(uq, t) {
  const o = (uq.user_quest_objectives || [])[0]; if (!o) return null;
  const d = o.quest_objective_definition || {};
  return questFromDef(d, { id: String(uq.id), defId: String((uq.quest_definition || {}).id || ''), kind: (uq.quest_definition || {}).type || '',
    state: uq.state, cur: o.current_value, modified: Date.parse(uq.date_modified) || t });
}
function questFromDef(d, meta) {
  const f = d.filters || {};
  let type = d.type || meta.type; if (type === 'win_matches') type = 'finish_game';
  const q = { id: String(meta.id), defId: String(meta.defId || d.id || ''), kind: meta.kind || '', state: meta.state, type, value: d.value || meta.value, cur: meta.cur, modified: meta.modified,
    gameTypes: f.game_types || [], results: f.player_results || (meta.type === 'win_matches' ? ['Win'] : []),
    factions: (f.deck_factions || []).map(normFaction).filter(Boolean) };
  if (!q.factions.length && meta.faction) q.factions = [meta.faction];
  if (Array.isArray(f.card_definition_ids)) q.ids = [...new Set(f.card_definition_ids.map(i => String(Math.floor(i / 100))))];
  const c = f.condition || '';
  let m;
  if ((m = c.match(/getFaction\(\)\.toString\(\) == '(\w+)'/))) q.factions = [normFaction(m[1])];
  if ((m = c.match(/getAvailability\(\)\.toString\(\) == '(\w+)'/)) && EXP[m[1]]) q.sets = [EXP[m[1]]];
  if ((m = c.match(/getPrimaryCategoryId\(\) == '?(\d+)'?/))) q.cat = +m[1];
  if ((m = c.match(/getType\(\)\.toString\(\) == '(\w+)'/))) q.ctype = { unit: 'J', special: 'S', artifact: 'A' }[m[1].toLowerCase()] || '';
  if ((m = c.match(/getRarity\(\)\.toString\(\) == '(\w+)'/))) q.rarity = m[1];
  if (f.expansion_filter) { q.minCards = f.expansion_filter.min_cards_number; q.sets = (f.expansion_filter.expansions || []).map(e => EXP[e]).filter(Boolean); }
  q.cond = c;
  return q;
}

module.exports = { GwentLogParser, questFromNoti, questFromDef, normFaction, EXP };
