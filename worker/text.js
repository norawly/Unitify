/* Тексты сообщений бота (parse_mode HTML), русский и английский */
import * as T from "./sched.js";
import { t as dict, subject as subjectName, placeName, durIn } from "./i18n.js";

export const esc = s => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

/* состояние пары на сейчас: скоро → идёт → прошла; для другого дня — «следующая» */
export function stateOf(g, iso, now) {
  if (iso < now.iso) return { kind: "past" };
  if (iso === now.iso) {
    if (now.min >= g.re) return { kind: "past" };
    if (now.min >= g.rs) return { kind: "live", mins: g.re - now.min };
    return { kind: "soon", mins: g.rs - now.min };
  }
  const days = Math.round((Date.parse(iso) - Date.parse(now.iso)) / 86400000);
  return { kind: "next", mins: days * 1440 - now.min + g.rs, iso, nowIso: now.iso };
}

/* «завтра» или «в среду» — для пары не сегодняшнего дня */
function whenLabel(iso, now, L) {
  if (!iso || iso === now.iso) return "";
  if (iso === T.isoAdd(now.iso, 1)) return L.tomorrow;
  const k = T.keyOf(iso);
  return k ? L.when[T.KEYS.indexOf(k)] : "";
}

/* где идёт пара: кабинет, этаж и блок — или «Онлайн»; info — из /map/rooms/index.json */
export function roomLine(it, info, lang) {
  const L = dict(lang);
  if (it.online) return `💻 ${L.online}`;
  if (!it.room) return "";
  const room = `<b>${esc(placeName(T.roomShort(it.room), lang) || "—")}</b>`;
  const b = T.bldg(it);
  if (b) return `🚪 ${room} — ${esc(placeName(b, lang))}`;
  if (!/^\d/.test(T.roomShort(it.room))) return `🚪 ${room}`;         // «Актовый зал» и прочие названия
  const floor = info ? info.floor : T.floorOf(it.room);
  const block = info ? info.block : T.blockOf(it.room);
  return `🚪 ${L.room} ${room}` + (floor ? ` — ${L.floorAt(floor)}` : "") + (block ? `, ${L.blockAt(block)}` : "");
}

/* карточка пары: сколько осталось и во сколько, время пары, предмет, кабинет */
export function classCard(g, info, state, lang) {
  const L = dict(lang), it = g.it;
  const at = T.hhmm(g.rs);
  const when = state.iso ? whenLabel(state.iso, { iso: state.nowIso || state.iso }, L) : "";
  const head =
    state.kind === "past" ? `✔️ <b>${L.passed}</b>`
    : state.kind === "live" ? `🟢 <b>${L.live_now(durIn(state.mins, lang))}</b>`
    : state.kind === "soon" ? `🔔 <b>${L.in_time(durIn(state.mins, lang))}</b> · ${at}`
    : `⏭ <b>${L.next_in(durIn(state.mins, lang))}</b>${when ? ` · ${when}` : ""} · ${at}`;

  return `${head}\n\n` +
    `🕐 <b>${T.hhmm(g.rs)} – ${T.hhmm(g.re)}</b>\n` +
    `📘 <b>${esc(subjectName(it.subject, lang))}</b> · ${L[it.type] || L.practice}` +
    (roomLine(it, info, lang) ? "\n" + roomLine(it, info, lang) : "");
}

/* строка «где» в списках */
function place(it, lang) {
  const L = dict(lang);
  if (it.online) return `💻 ${L.online.toLowerCase()}`;
  if (!it.room) return "";
  const room = `<code>${esc(placeName(T.roomShort(it.room), lang) || "—")}</code>`;
  const b = T.bldg(it);
  if (b) return `📍 ${room} · ${esc(placeName(b, lang))}`;
  if (!/^\d/.test(T.roomShort(it.room))) return `📍 ${room}`;
  const fl = T.floorOf(it.room), bl = T.blockOf(it.room);
  return `📍 ${room}` + (fl ? ` · ${L.floorAt(fl)}` : "") + (bl ? `, ${L.blockAt(bl)}` : "");
}

/* ---------- день и неделя ---------- */
export function dayText(S, iso, now, lang) {
  const L = dict(lang), k = T.keyOf(iso);
  const rel = iso === now.iso ? L.today : iso === T.isoAdd(now.iso, 1) ? L.tomorrow : "";
  const day = k ? L.days[T.KEYS.indexOf(k)] : L.days[6];
  const head = `<b>${day}, ${fmtDate(iso, lang)}</b>` + (rel ? ` · ${rel}` : "");
  if (!k) return `${head}\n\n😴 ${L.no_classes}`;
  const st = T.dayState(S, iso);
  if (st.kind !== "study") return `${head}\n\n— ${esc(st.label || L.no_classes)}`;
  const list = T.blocks(S, k);
  if (!list.length) return `${head}\n\n${L.no_classes}`;
  const parts = [];
  list.forEach((g, i) => {
    if (i) { const gap = g.s - list[i - 1].e; if (gap >= 60) parts.push(`<i>☕ ${durIn(gap, lang)}</i>`); }
    let mark = "";
    if (iso === now.iso) mark = now.min >= g.re ? "✔️ " : now.min >= g.rs ? "🟢 " : "";
    parts.push(`${mark}<b>${T.hhmm(g.rs)}–${T.hhmm(g.re)}</b>  ${esc(subjectName(g.it.subject, lang))} · ${L[g.it.type] || L.practice}\n${place(g.it, lang)}`);
  });
  return `${head}\n\n${parts.join("\n\n")}`;
}

export function weekText(S, ws, now, lang) {
  const L = dict(lang);
  const lines = [`🗓 <b>${fmtShort(ws, lang)} – ${fmtShort(T.isoAdd(ws, 5), lang)}</b>`];
  for (let i = 0; i < 7; i++) {
    const iso = T.isoAdd(ws, i), k = T.KEYS[i], st = T.dayState(S, iso);
    if (k === "sun" && !T.blocks(S, k).length) continue;
    lines.push("", `<b>${L.daysShort[i]}, ${fmtShort(iso, lang)}</b>${iso === now.iso ? ` · ${L.today}` : ""}`);
    if (st.kind !== "study") { lines.push(`   ${esc(st.label || "")}`); continue; }
    const list = T.blocks(S, k);
    if (!list.length) { lines.push(`   ${L.no_classes}`); continue; }
    for (const g of list)
      lines.push(`   ${T.hhmm(g.s)}–${T.hhmm(g.e)}  ${g.it.online ? "💻" : `<code>${esc(T.roomShort(g.it.room))}</code>`}  ${esc(subjectName(g.it.subject, lang))}`);
  }
  return lines.join("\n");
}

const day = iso => new Date(iso + "T00:00:00Z");
export const fmtDate = (iso, lang) => `${day(iso).getUTCDate()} ${dict(lang).months[day(iso).getUTCMonth()]}`;
export const fmtShort = (iso, lang) => `${day(iso).getUTCDate()} ${dict(lang).monthsShort[day(iso).getUTCMonth()]}`;

/* ---------- настройки ---------- */
export const settingsText = (u, owner, lang) => {
  const L = dict(lang);
  return `${L.settings}\n\n` +
    `👤 ${L.s_schedule}: <b>${esc(owner)}</b>\n` +
    `🔔 ${L.s_remind}: <b>${u.lead_min ? L.s_remind_on : L.s_remind_off}</b>\n` +
    `📚 ${L.s_moodle}: <b>${u.cal_url ? L.s_moodle_on : L.s_moodle_off}</b>\n` +
    `🌐 ${L.s_lang}: <b>${lang === "en" ? "English" : "Русский"}</b>`;
};

/* ---------- дедлайны ---------- */
export function dueIn(due, now, lang) {
  const L = dict(lang), left = Math.round((due - now) / 60000);
  if (left < 0) return L.overdue;
  return L.due_in(durIn(left, lang));
}

/* Дедлайны — списком по времени: первым то, что сдавать раньше всего. */
export function deadlinesText(list, now, lang, off = 300, head = null) {
  const L = dict(lang);
  const title = head || `${L.deadlines} · ${list.length}`;
  if (!list.length) return `${L.deadlines}\n\n${L.no_deadlines}`;

  const today = new Date(now + off * 60000).toISOString().slice(0, 10);
  const body = [...list].sort((a, b) => a.due - b.due).map(d => {
    const at = new Date(d.due + off * 60000);            // Moodle отдаёт UTC, показываем по Астане
    const iso = at.toISOString().slice(0, 10);
    const day = iso === today ? L.today
      : iso === T.isoAdd(today, 1) ? L.tomorrow
      : `${at.getUTCDate()} ${L.monthsShort[at.getUTCMonth()]}`;
    const hhmm = `${String(at.getUTCHours()).padStart(2, "0")}:${String(at.getUTCMinutes()).padStart(2, "0")}`;
    return `⏳ <b>${dueIn(d.due, now, lang)}</b> · ${day}, ${hhmm}\n` +
           `${esc(String(d.title).replace(/ is due$/i, ""))} · <i>${esc(d.subject || "")}</i>`;
  }).join("\n\n");
  return `${title}\n\n${body}`;
}

export const who = u => esc([u.name, u.username ? "@" + u.username : ""].filter(Boolean).join(" ")) || String(u.chat_id);
