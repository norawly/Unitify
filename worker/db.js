/* D1: пользователи, отправленные напоминания, служебные ключи */
import { privateChatIds, botChatIds, demoSource } from "./access.js";

async function effectiveUser(env, row, known = []) {
  if (!row || row.status === "banned") return row;
  const sourceId = demoSource(env, row.chat_id);
  if (!sourceId) return row;
  const source = known.find(u => u.chat_id === sourceId) ||
    await env.DB.prepare("SELECT * FROM users WHERE chat_id = ?").bind(sourceId).first();
  if (!source || !["admin", "approved"].includes(source.status)) return null;
  return { ...row, status: "approved", person: source.person, lang: source.lang,
    lead_min: source.lead_min, demo: true,
    // A presence marker only. The private Moodle calendar URL stays with its owner.
    cal_url: source.cal_url ? "linked-read-only" : null };
}
export const getUser = async (env, id) =>
  effectiveUser(env, await env.DB.prepare("SELECT * FROM users WHERE chat_id = ?").bind(id).first());

export const createUser = (env, u) =>
  env.DB.prepare(
    "INSERT OR IGNORE INTO users (chat_id, name, username, person, status, lead_min, morning, evening, created_at) " +
    "VALUES (?, ?, ?, ?, ?, 20, -1, -1, ?)"
  ).bind(u.chat_id, u.name || null, u.username || null, u.person, u.status, Date.now()).run();

const EDITABLE = new Set(["person", "status", "lead_min", "morning", "evening", "notified_at", "name", "username",
                          "lang", "cal_url", "cal_hash", "cal_checked",
                          "geo", "lead_home", "lead_campus", "lat", "lon", "loc_at", "loc_until", "campus_lat", "campus_lon"]);
export async function updateUser(env, id, fields) {
  if (demoSource(env, id)) throw new Error("Demo account is read-only");
  const keys = Object.keys(fields).filter(k => EDITABLE.has(k));
  if (!keys.length) return;
  await env.DB.prepare(`UPDATE users SET ${keys.map(k => k + " = ?").join(", ")} WHERE chat_id = ?`)
    .bind(...keys.map(k => fields[k]), id).run();
}

export const deleteUser = (env, id) => env.DB.prepare("DELETE FROM users WHERE chat_id = ?").bind(id).run();

export async function countUsers(env) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE status != 'banned'").first();
  return r ? r.n : 0;
}
export async function adminExists(env) {
  return !!(await env.DB.prepare("SELECT 1 FROM users WHERE status = 'admin' LIMIT 1").first());
}
export async function admins(env) {
  return (await env.DB.prepare("SELECT chat_id FROM users WHERE status = 'admin'").all()).results;
}
export async function activeUsers(env) {
  if (privateChatIds(env).length !== 2) return [];
  const ids = botChatIds(env), marks = ids.map(() => "?").join(",");
  const users = (await env.DB.prepare(`SELECT * FROM users WHERE status IN ('admin', 'approved') AND chat_id IN (${marks})`)
    .bind(...ids).all()).results;
  return (await Promise.all(users.map(row => effectiveUser(env, row, users)))).filter(Boolean);
}
export async function allUsers(env) {
  return (await env.DB.prepare("SELECT * FROM users ORDER BY created_at DESC LIMIT 50").all()).results;
}

/* true — если отметка новая (значит, сообщение ещё не отправляли) */
export async function markSent(env, id, key) {
  const r = await env.DB.prepare("INSERT OR IGNORE INTO sent (chat_id, key, at) VALUES (?, ?, ?)")
    .bind(id, key, Date.now()).run();
  return (r.meta && r.meta.changes) > 0;
}
export const cleanupSent = (env, before) => env.DB.prepare("DELETE FROM sent WHERE at < ?").bind(before).run();

export async function getMeta(env, key) {
  const r = await env.DB.prepare("SELECT value FROM meta WHERE key = ?").bind(key).first();
  return r ? r.value : null;
}
export const setMeta = (env, key, value) =>
  env.DB.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(key, String(value)).run();

/* незнакомцы: перебор баркодов уводит в тишину, чтобы не жечь лимиты Cloudflare */
export async function guestStrike(env, id, limit = 5, cooldown = 1800000) {
  const r = await env.DB.prepare(
    "INSERT INTO guests (chat_id, fails, until) VALUES (?, 1, NULL) " +
    "ON CONFLICT(chat_id) DO UPDATE SET fails = fails + 1, " +
    "until = CASE WHEN fails + 1 >= ? THEN ? ELSE until END RETURNING fails, until")
    .bind(id, limit, Date.now() + cooldown).first();
  return { fails: r ? r.fails : 1, silenced: !!(r && r.until && r.until > Date.now()) };
}
export async function guestQuiet(env, id) {
  const r = await env.DB.prepare("SELECT until FROM guests WHERE chat_id = ?").bind(id).first();
  return !!(r && r.until && r.until > Date.now());
}
export const guestClear = (env, id) => env.DB.prepare("DELETE FROM guests WHERE chat_id = ?").bind(id).run();

/* у кого подключён календарь Moodle и кого пора проверить */
export async function calendarUsers(env) {
  const ids = privateChatIds(env);
  if (ids.length !== 2) return [];
  return (await env.DB.prepare("SELECT * FROM users WHERE cal_url IS NOT NULL AND status IN ('admin','approved') " +
    "AND chat_id IN (?, ?) ORDER BY cal_checked LIMIT 2").bind(...ids).all()).results;
}

/* личные расписания: первый привязавшийся становится владельцем, остальным вход закрыт */
export const ownerOf = (env, person) =>
  env.DB.prepare("SELECT chat_id FROM owners WHERE person = ?").bind(person).first();
export const claimOwner = (env, person, chatId) =>
  env.DB.prepare("INSERT OR IGNORE INTO owners (person, chat_id, since) VALUES (?, ?, ?)")
    .bind(person, chatId, Date.now()).run();
