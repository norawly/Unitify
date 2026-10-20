import * as T from "./sched.js";
import { SUBJECT_EN } from "./i18n.js";
import { courseName } from "../extension/lib/sync-policy.mjs";

const OFFSET = 5 * 3600000;
export function sessionStart(r) {
  if (Number.isSafeInteger(r.startAt) && r.startAt > Date.UTC(2000, 0)) return r.startAt;
  // Reader session IDs already encode the actual UTC start, not the UI language.
  const n = parseInt(String(r.id || "").split(":")[2], 36);
  if (n > Date.UTC(2000, 0) && n < Date.UTC(2100, 0)) return n;
  const s = String(r.dateText || "").toLowerCase();
  const m = s.match(/(\d{1,2})\s+([a-zа-яё]+)\.?\s+(\d{4})/u);
  const months = ["jan|january|января", "feb|february|февраля", "mar|march|марта", "apr|april|апреля", "may|мая", "jun|june|июня", "jul|july|июля", "aug|august|августа", "sep|sept|september|сентября", "oct|october|октября", "nov|november|ноября", "dec|december|декабря"];
  const time = s.match(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])m\b/) || s.match(/\b(\d{1,2}):(\d{2})/);
  if (!m || !time) return null;
  const month = months.findIndex(names => names.split("|").includes(m[2]));
  if (month < 0) return null;
  const h = time[3] ? +time[1] % 12 + (time[3] === "p" ? 12 : 0) : +time[1];
  return Date.UTC(+m[3], month, +m[1], h, +(time[2] || 0)) - OFFSET;
}
const clock = ms => { const d = new Date(ms + OFFSET); return { iso: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() }; };
export const courseMatches = (name, subject) => [subject, SUBJECT_EN[subject]].filter(Boolean).some(n => courseName(name) === courseName(n));
export function attendanceMark(r) {
  const s = String(r.status || "").trim();
  if (!s || /^\?/.test(s) || /^(?:[–—-]|unknown|not (?:taken|marked|set)(?: yet)?|unmarked|не отмечено|не выставлено)$/iu.test(s)) return null;
  const match = String(r.points || "").match(/(-?\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/);
  const possible = match && +match[2].replace(",", ".");
  if (possible > 0) return { earned: +match[1].replace(",", "."), possible,
    label: /^(?:a|absent|отсутств(?:овал|ует)?)$/iu.test(s) ? "Absent" : /^(?:p|present|присутств(?:овал|ует)?)$/iu.test(s) ? "Present" : /^late|опозд/iu.test(s) ? "Present (Late)" : "NA" };
  if (/^(?:p|present|присутств(?:овал|ует)?)$/iu.test(s)) return { earned: 2, possible: 2, label: "Present", assumed: true };
  if (/^(?:a|absent|отсутств(?:овал|ует)?)$/iu.test(s)) return { earned: 0, possible: 2, label: "Absent", assumed: true };
  return null;
}
export function attendanceTotals(records, now = Date.now()) {
  let earned = 0, possible = 0, taken = 0, waiting = 0, assumed = false;
  for (const r of new Map(records.map(r => [r.id, r])).values()) {
    const start = sessionStart(r);
    if (start && start > now) continue;
    const m = attendanceMark(r);
    if (!m) { waiting++; continue; }
    earned += m.earned; possible += m.possible; taken++; assumed ||= !!m.assumed;
  }
  return { earned, possible, taken, waiting, assumed, percent: possible ? earned / possible * 100 : null };
}
const inBlock = (r, iso, g) => { const start = sessionStart(r); if (!start) return false; const c = clock(start); return c.iso === iso && c.min >= g.rs && c.min < g.re; };
export async function attendanceSnapshot(env, chatId) {
  const rows = (await env.DB.prepare("SELECT data FROM lms_records WHERE chat_id=? AND id LIKE 'attendance:%'").bind(chatId).all()).results;
  const reads = (await env.DB.prepare("SELECT scope,checked_at FROM lms_scope_reads WHERE chat_id=? AND scope LIKE '%:attendance:%'").bind(chatId).all()).results;
  return { records: rows.map(r => JSON.parse(r.data)), reads };
}
export function classAttendance(snapshot, g, iso, now) {
  const start = Date.parse(iso + "T00:00:00Z") - OFFSET + g.rs * 60000;
  const end = Date.parse(iso + "T00:00:00Z") - OFFSET + g.re * 60000;
  const records = snapshot.records.filter(r => courseMatches(r.course, g.it.subject));
  const courseIds = new Set(records.map(r => r.courseId));
  const checked = snapshot.reads.some(r => courseIds.has(r.scope.split(":")[0]) && r.checked_at >= start);
  const missing = now.ms < end || checked ? "Waiting for Moodle" : "NA";
  const matched = records.filter(r => inBlock(r, iso, g)).sort((a, b) => sessionStart(a) - sessionStart(b));
  if (!matched.length || now.ms < start) return missing;
  const labels = matched.map(r => sessionStart(r) <= now.ms ? attendanceMark(r)?.label || missing : "Waiting for Moodle");
  return [...new Set(labels)].join(" / ");
}

// Projections come from remaining timetable blocks, not from how many future
// rows a teacher happened to pre-create. Unknown past rows never enter totals.
export function attendanceForecast(course, S, now) {
  const totals = attendanceTotals(course.attendance, now.ms);
  if (!S?.term?.study?.length) return { ...totals, available: false };
  if (!T.KEYS.some(key => T.blocks(S, key).some(g => courseMatches(course.name, g.it.subject)))) return { ...totals, available: false, unmatched: true };
  const cutoff = S.term.exams?.[0] && S.term.exams[0] <= S.term.study[1] ? T.isoAdd(S.term.exams[0], -1) : S.term.study[1];
  const records = [...new Map(course.attendance.map(r => [r.id, r])).values()];
  const byType = new Map(), unitPoints = new Map(), byDate = new Map();
  for (const r of records) {
    const start = sessionStart(r); if (!start) continue;
    const c = clock(start);
    const dateRecords = byDate.get(c.iso) || []; dateRecords.push(r); byDate.set(c.iso, dateRecords);
    const g = T.dayBlocks(S, c.iso).find(g => courseMatches(course.name, g.it.subject) && inBlock(r, c.iso, g));
    if (!g) continue;
    const m = attendanceMark(r);
    if (m) { const list = unitPoints.get(g.it.type) || []; list.push(m.possible); unitPoints.set(g.it.type, list); }
    const end = Date.parse(c.iso + "T00:00:00Z") - OFFSET + g.re * 60000;
    if (end > now.ms) continue; // An unfinished block cannot establish cadence.
    const key = c.iso + ":" + g.rs, samples = byType.get(g.it.type) || new Map();
    const sample = samples.get(key) || { count: 0, hours: g.parts.length };
    sample.count++; samples.set(key, sample); byType.set(g.it.type, samples);
  }
  const low = [], high = []; let remainingBlocks = 0, uncertain = totals.assumed;
  const beginning = now.iso < S.term.study[0] ? S.term.study[0] : now.iso;
  for (let iso = beginning, days = 0; iso <= cutoff && days < 366; iso = T.isoAdd(iso, 1), days++) {
    for (const g of T.dayBlocks(S, iso).filter(g => courseMatches(course.name, g.it.subject))) {
      const base = Date.parse(iso + "T00:00:00Z") - OFFSET;
      if (base + g.re * 60000 <= now.ms) continue;
      const future = (byDate.get(iso) || []).filter(r => inBlock(r, iso, g) && sessionStart(r) > now.ms);
      const current = base + g.rs * 60000 <= now.ms;
      const samples = [...(byType.get(g.it.type)?.values() || [])];
      const once = samples.length && samples.every(s => s.count === 1);
      const hourly = samples.length && samples.every(s => s.count === s.hours);
      const parts = g.parts.filter(p => base + T.mins(p.start) * 60000 > now.ms).length;
      let minCount, maxCount;
      if (future.length) { minCount = maxCount = future.length; }
      else if (once) { minCount = maxCount = current ? 0 : 1; }
      else if (hourly) { minCount = maxCount = parts; }
      else { minCount = current ? 0 : 1; maxCount = Math.max(minCount, parts); uncertain ||= minCount !== maxCount; }
      if (!maxCount) continue;
      if (!current) remainingBlocks++;
      const points = (unitPoints.get(g.it.type) || []).slice().sort((a, b) => a - b);
      const defaultPoints = points.length ? points[Math.floor(points.length / 2)] : 2;
      if (!points.length) uncertain = true;
      const weights = future.map(r => { const m = String(r.points || "").match(/\/\s*(\d+(?:[.,]\d+)?)/); return m && +m[1].replace(",", ".") > 0 ? +m[1].replace(",", ".") : defaultPoints; });
      const key = iso + ":" + g.rs;
      const add = (out, count) => { for (let i = 0; i < count; i++) out.push({ weight: weights[i] || defaultPoints, block: key, whole: !current }); };
      add(low, minCount); add(high, maxCount);
    }
  }
  const project = future => {
    const points = future.reduce((s, r) => s + r.weight, 0), possible = totals.possible + points;
    const earned = totals.earned + points;
    const safe = weights => { let missed = 0, loss = 0; for (const w of weights.sort((a, b) => b - a)) { if (!possible || (earned - loss - w) / possible <= 0.7 + 1e-10) break; loss += w; missed++; } return missed; };
    const blockWeights = new Map();
    for (const r of future) if (r.whole) blockWeights.set(r.block, (blockWeights.get(r.block) || 0) + r.weight);
    return { remaining: future.length, maxPercent: possible ? earned / possible * 100 : null,
      skipMarks: safe(future.map(r => r.weight)), skipBlocks: safe([...blockWeights.values()]) };
  };
  return { ...totals, available: true, low: project(low), high: project(high), remainingBlocks, uncertain, cutoff };
}
