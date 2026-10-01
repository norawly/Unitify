/* Дедлайны из Moodle: личная ссылка на экспорт календаря (iCalendar) проверяется раз в минуту.
   Ссылка приватная — лежит только в базе бота и никуда не уходит. */

export const CAL_HOST = "lms.astanait.edu.kz";

export function validCalUrl(text) {
  let u;
  try { u = new URL(String(text).trim()); } catch { return null; }
  if (u.protocol !== "https:" || u.hostname !== CAL_HOST) return null;
  if (!/\/calendar\/export_execute\.php$/.test(u.pathname)) return null;
  if (!u.searchParams.get("authtoken")) return null;
  return u.toString();
}

const unescape = s => String(s).replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();
const stamp = v => {
  const m = String(v).match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);   // Moodle отдаёт UTC
};

/* iCalendar → события */
export function parseIcs(text) {
  const lines = String(text).replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const out = [];
  let cur = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT") { if (cur && cur.uid) out.push(cur); cur = null; continue; }
    if (!cur) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const name = line.slice(0, i).split(";")[0].toUpperCase(), value = line.slice(i + 1);
    if (name === "UID") cur.uid = value.trim();
    else if (name === "SUMMARY") cur.title = unescape(value);
    else if (name === "DESCRIPTION") cur.descr = unescape(value);
    else if (name === "CATEGORIES") cur.subject = unescape(value).split("|")[0].trim();
    else if (name === "DTSTART") cur.due = stamp(value);
    else if (name === "LAST-MODIFIED") cur.modified = value.trim();
  }
  return out.filter(e => e.due);
}

/* сдача задания, а не занятие: Moodle пишет «… is due» */
export const isDeadline = e => /\bis due\b/i.test(e.title || "");
export const isClass = e => /attendance/i.test((e.title || "") + " " + (e.descr || ""));

async function hashOf(text) {
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

/* Отпечаток берём только по самим заданиям: Moodle в каждом ответе меняет служебные
   метки времени, и отпечаток всего файла был бы новым каждую минуту — база переписывалась зря. */
const fingerprint = events => events.filter(isDeadline)
  .map(e => `${e.uid}|${e.due}|${e.title}|${e.descr || ""}`).sort().join("\n");

export async function fetchCalendar(url) {
  const res = await fetch(url, { headers: { accept: "text/calendar" }, cf: { cacheTtl: 0 } });
  if (!res.ok) return { ok: false, status: res.status };
  const text = await res.text();
  if (!/BEGIN:VCALENDAR/.test(text)) return { ok: false, status: res.status };
  const events = parseIcs(text);
  return { ok: true, events, hash: await hashOf(fingerprint(events)) };
}

/* сверяем с тем, что уже знаем: что появилось и что перенесли */
export async function syncUser(env, user) {
  if (!user.cal_url) return null;
  const got = await fetchCalendar(user.cal_url);
  /* отметку о проверке обновляем раз в десять минут: она нужна только для порядка обхода */
  if (!user.cal_checked || Date.now() - user.cal_checked > 10 * 60000)
    await env.DB.prepare("UPDATE users SET cal_checked = ? WHERE chat_id = ?").bind(Date.now(), user.chat_id).run();
  if (!got.ok) return { ok: false, status: got.status };
  if (got.hash === user.cal_hash) return { ok: true, same: true, added: [], moved: [] };

  const rows = (await env.DB.prepare("SELECT uid, due, title, descr FROM deadlines WHERE chat_id = ?")
    .bind(user.chat_id).all()).results;
  const known = new Map(rows.map(r => [r.uid, r]));
  const fresh = got.events.filter(isDeadline);
  const added = [], moved = [], writes = [];

  for (const e of fresh) {
    const was = known.get(e.uid);
    const descr = (e.descr || "").slice(0, 3000);
    if (!was) added.push(e);
    else if (Math.abs(was.due - e.due) > 60000) moved.push({ ...e, was: was.due });
    known.delete(e.uid);
    /* пишем только то, что правда изменилось — иначе база переписывалась бы каждую минуту */
    if (was && was.due === e.due && was.title === e.title && (was.descr || "") === descr) continue;
    writes.push(env.DB.prepare(
      "INSERT INTO deadlines (chat_id, uid, title, subject, due, descr, modified) VALUES (?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(chat_id, uid) DO UPDATE SET title = excluded.title, subject = excluded.subject, " +
      "due = excluded.due, descr = excluded.descr, modified = excluded.modified")
      .bind(user.chat_id, e.uid, e.title, e.subject || "", e.due, descr, e.modified || ""));
  }
  for (const uid of known.keys())                        // задание убрали из Moodle
    writes.push(env.DB.prepare("DELETE FROM deadlines WHERE chat_id = ? AND uid = ?").bind(user.chat_id, uid));
  writes.push(env.DB.prepare("UPDATE users SET cal_hash = ? WHERE chat_id = ?").bind(got.hash, user.chat_id));
  await env.DB.batch(writes);

  return { ok: true, count: fresh.length, added, moved, events: got.events };
}

export const upcoming = (env, chatId, from, limit = 10) =>
  env.DB.prepare("SELECT * FROM deadlines WHERE chat_id = ? AND due >= ? ORDER BY due LIMIT ?")
    .bind(chatId, from, limit).all().then(r => r.results);

export const oneDeadline = (env, chatId, uid) =>
  env.DB.prepare("SELECT * FROM deadlines WHERE chat_id = ? AND uid = ?").bind(chatId, uid).first();
