import { normalizeRecord, changes } from "../extension/lib/model.mjs";
import { privateChatIds, dataChatId, demoSource } from "./access.js";
import * as M from "./msgs.js";
import { esc } from "./text.js";
import { syncContext, linkedSchedule } from "./lms-policy.js";

const hash = async text => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map(v => v.toString(16).padStart(2, "0")).join("");
const random = () => [...crypto.getRandomValues(new Uint8Array(32))].map(v => v.toString(16).padStart(2, "0")).join("");
const permitted = (env, id) => privateChatIds(env).includes(id);
const registered = (env, id) => env.DB.prepare("SELECT chat_id FROM users WHERE chat_id = ? AND status IN ('admin','approved')").bind(id).first();

export async function createPairCode(env, chatId) {
  if (!permitted(env, chatId) || !await registered(env, chatId)) throw Error("Access denied");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code = [...crypto.getRandomValues(new Uint8Array(8))].map(n => alphabet[n % alphabet.length]).join("");
  await env.DB.prepare("INSERT INTO lms_pair_codes (chat_id, code_hash, expires) VALUES (?, ?, ?) ON CONFLICT(chat_id) DO UPDATE SET code_hash=excluded.code_hash, expires=excluded.expires")
    .bind(chatId, await hash(code), Date.now() + 10 * 60000).run();
  return code.slice(0, 4) + "-" + code.slice(4);
}
export async function revokeDevice(env, chatId) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM lms_devices WHERE chat_id = ?").bind(chatId),
    env.DB.prepare("DELETE FROM lms_pair_codes WHERE chat_id = ?").bind(chatId),
  ]);
}
function cors(request) {
  const origin = request.headers.get("origin");
  if (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return null;
  return { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "vary": "Origin",
    ...(origin ? { "access-control-allow-origin": origin } : {}),
    "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "authorization, content-type", "access-control-max-age": "600" };
}
async function boundedJson(request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw Error("JSON required");
  if (+request.headers.get("content-length") > 2400000) throw Error("Request too large");
  const reader = request.body?.getReader();
  if (!reader) throw Error("Empty request");
  const chunks = []; let length = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > 2400000) { await reader.cancel(); throw Error("Request too large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function handleLms(request, env) {
  const headers = cors(request);
  if (!headers) return new Response("Forbidden origin", { status: 403 });
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply({ error: "Use POST" }, 405);
  const path = new URL(request.url).pathname;
  if (!["/api/lms/pair", "/api/lms/sync", "/api/lms/revoke", "/api/lms/context"].includes(path)) return reply({ error: "Not found" }, 404);
  if (env.RL && !(await env.RL.limit({ key: "lms-ip:" + (request.headers.get("cf-connecting-ip") || "unknown") })).success)
    return reply({ error: "Лимит — 7 запросов в минуту. Повторите через минуту." }, 429);
  if (privateChatIds(env).length !== 2) return reply({ error: "Access unavailable" }, 503);
  try {
    if (path.endsWith("/pair")) {
      const body = await boundedJson(request);
      const code = String(body.code || "").toUpperCase().replace(/-/g, "");
      if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) return reply({ error: "Код неверен или истёк." }, 403);
      const codeHash = await hash(code), token = random(), tokenHash = await hash(token), now = Date.now();
      const ids = privateChatIds(env);
      // Transaction: concurrent claims cannot reuse one code. Only token hashes persist.
      const result = await env.DB.batch([
        env.DB.prepare("INSERT INTO lms_devices (chat_id,token_hash,created_at) SELECT p.chat_id,?,? FROM lms_pair_codes p JOIN users u ON u.chat_id=p.chat_id WHERE p.code_hash=? AND p.expires>? AND p.chat_id IN (?,?) AND u.status IN ('admin','approved') ON CONFLICT(chat_id) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at,last_sync=NULL")
          .bind(tokenHash, now, codeHash, now, ...ids),
        env.DB.prepare("DELETE FROM lms_pair_codes WHERE code_hash=?").bind(codeHash),
      ]);
      if (!result[0].meta.changes) return reply({ error: "Код неверен или истёк. Получите новый: /extension." }, 403);
      const paired = await env.DB.prepare("SELECT d.chat_id,a.account FROM lms_devices d LEFT JOIN lms_accounts a ON a.chat_id=d.chat_id WHERE d.token_hash=?").bind(tokenHash).first();
      return reply({ ok: true, token, account: paired?.account || null, syncContext: await syncContext(env, paired.chat_id) });
    }
    const token = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!token) return reply({ error: "Unauthorized" }, 401);
    const device = await env.DB.prepare("SELECT * FROM lms_devices WHERE token_hash=?").bind(await hash(token)).first();
    if (!device || !permitted(env, device.chat_id) || !await registered(env, device.chat_id)) return reply({ error: "Unauthorized" }, 401);
    if (path.endsWith("/revoke")) { await revokeDevice(env, device.chat_id); return reply({ ok: true }); }
    if (path.endsWith("/context")) return reply({ ok: true, syncContext: await syncContext(env, device.chat_id) });
    if (device.last_sync && Date.now() - device.last_sync < 8000) return reply({ error: "Слишком частая синхронизация. Подождите 8 секунд." }, 429);
    const payload = await boundedJson(request);
    const cards = validateGradeCards(payload?.gradeCards);
    const result = await ingest(env, device, payload);
    if (cards.length) await saveGradeCards(env, device.chat_id, cards);
    if (env.TELEGRAM_TOKEN && payload.groups.some(g => g.scope.includes(":attendance:"))) {
      const S = await linkedSchedule(env, device.chat_id);
      if (S) await M.tidy(env, device.chat_id, async () => S).catch(() => console.log("attendance card refresh postponed"));
    }
    return reply({ ok: true, ...result, syncContext: await syncContext(env, device.chat_id) });
  } catch (e) {
    // Never log request bodies, tokens or private academic snapshots.
    if (e instanceof InputError) return reply({ error: e.message }, e.status);
    if (e instanceof SyntaxError || /JSON required|Request too large|Empty request/.test(e.message)) return reply({ error: "Некорректный запрос." }, 400);
    console.log("lms sync failed", e.name);
    return reply({ error: "Не удалось сохранить данные. Повторите позже." }, 503);
  }
}
class InputError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
export function validateGradeCards(cards = []) {
  if (!Array.isArray(cards) || cards.length > 30) throw new InputError("Неверные карточки оценок.");
  const unique = new Set(); let length = 0;
  for (const c of cards) {
    if (!c || !/^\d+$/.test(c.courseId) || !Number.isInteger(c.page) || !Number.isInteger(c.pages) || c.pages < 1 || c.pages > 10 || c.page < 0 || c.page >= c.pages ||
      ![1, 2, 3].includes(c.format ?? 1) || (c.group !== undefined && (typeof c.group !== "string" || c.group.length > 40)) ||
      !/^[a-f0-9]{64}$/.test(c.signature) || typeof c.image !== "string" || c.image.length > 300000 || !/^\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(c.image)) throw new InputError("Неверная карточка оценок.");
    const key = `${c.courseId}:${c.page}`;
    if (unique.has(key)) throw new InputError("Повтор карточки.");
    unique.add(key); length += c.image.length;
  }
  if (length > 1600000) throw new InputError("Карточки слишком большие.");
  return cards;
}
export async function saveGradeCards(env, chatId, cards) {
  const rows = (await env.DB.prepare("SELECT DISTINCT json_extract(data,'$.courseId') id FROM lms_records WHERE chat_id=? AND id LIKE 'grade:%'").bind(chatId).all()).results;
  const courses = new Set(rows.map(r => r.id));
  const allowed = cards.filter(c => courses.has(c.courseId));
  if (!allowed.length) return;
  // One bounded JSON parameter and two SQL statements, not one subrequest per image.
  const packed = JSON.stringify(allowed.map(c => ({ ...c, format: c.format ?? 1, group: c.group || "" })));
  await env.DB.batch([
    env.DB.prepare("DELETE FROM lms_grade_cards WHERE chat_id=? AND EXISTS (SELECT 1 FROM json_each(?) j WHERE json_extract(j.value,'$.courseId')=course_id AND json_extract(j.value,'$.signature')<>signature)").bind(chatId, packed),
    env.DB.prepare("INSERT INTO lms_grade_cards(chat_id,course_id,page,pages,signature,image,updated_at,format,student_group) SELECT ?,json_extract(value,'$.courseId'),json_extract(value,'$.page'),json_extract(value,'$.pages'),json_extract(value,'$.signature'),json_extract(value,'$.image'),?,json_extract(value,'$.format'),json_extract(value,'$.group') FROM json_each(?) WHERE true ON CONFLICT(chat_id,course_id,page) DO UPDATE SET pages=excluded.pages,signature=excluded.signature,image=excluded.image,updated_at=excluded.updated_at,format=excluded.format,student_group=excluded.student_group")
      .bind(chatId, Date.now(), packed),
  ]);
}
export async function ingest(env, device, payload) {
  if (!payload || payload.version !== 1 || typeof payload.account !== "string" || !/^\d{1,15}$/.test(payload.account) || !Array.isArray(payload.groups) || payload.groups.length > 250)
    throw new InputError("Неверный формат данных.");
  if (device.account && device.account !== payload.account) throw new InputError("Сменился аккаунт Moodle. Передача остановлена; привяжите расширение заново.", 409);
  const groups = [], unique = new Set(), uniqueScopes = new Set(); let count = 0;
  for (const group of payload.groups) {
    if (!group || !/^\d+:(grade|assignment|attendance:\d+)$/.test(group.scope || "") || !Array.isArray(group.records)) throw new InputError("Неверный раздел.");
    if (uniqueScopes.has(group.scope)) throw new InputError("Повтор раздела.");
    uniqueScopes.add(group.scope);
    const [course, kind, cmid] = group.scope.split(":"), records = [];
    for (const raw of group.records) {
      if (++count > 3000) throw new InputError("Слишком много записей.");
      let record; try { record = normalizeRecord(raw); } catch { throw new InputError("Неверная учебная запись."); }
      if (record.courseId !== course || record.kind !== kind || unique.has(record.id) ||
        (cmid && record.id.split(":")[1] !== cmid)) throw new InputError("Запись не соответствует разделу.");
      unique.add(record.id); records.push(record);
    }
    const checkedAt = Number.isSafeInteger(group.checkedAt) && group.checkedAt > Date.UTC(2000, 0) && group.checkedAt <= Date.now() + 60000 ? Math.min(group.checkedAt, Date.now()) : Date.now();
    groups.push({ scope: group.scope, records, checkedAt });
  }
  const chatId = device.chat_id, now = Math.max(Date.now(), (device.last_sync || 0) + 1);
  const account = await env.DB.prepare("INSERT INTO lms_accounts(chat_id,account) VALUES (?,?) ON CONFLICT(chat_id) DO UPDATE SET account=excluded.account WHERE lms_accounts.account=excluded.account RETURNING account")
    .bind(chatId, payload.account).first();
  if (!account) throw new InputError("Используйте изначально привязанный Moodle-аккаунт. Данные разных студентов не объединяются.", 409);
  // Bind identity atomically, before writes; racing scans for different accounts cannot mix records.
  const bound = await env.DB.prepare("UPDATE lms_devices SET account=?,last_sync=? WHERE chat_id=? AND token_hash=? AND (account IS NULL OR account=?) AND last_sync IS ? RETURNING chat_id")
    .bind(payload.account, now, chatId, device.token_hash, payload.account, device.last_sync).first();
  if (!bound) throw new InputError("Сменился аккаунт Moodle или подключение отозвано.", 409);
  const oldRows = (await env.DB.prepare("SELECT * FROM lms_records WHERE chat_id=?").bind(chatId).all()).results;
  const old = new Map(oldRows.map(r => [r.id, JSON.parse(r.data)]));
  const scopes = new Set((await env.DB.prepare("SELECT scope FROM lms_scopes WHERE chat_id=?").bind(chatId).all()).results.map(r => r.scope));
  const updates = [], events = [];
  for (const group of groups) {
    for (const record of group.records) {
      const before = old.get(record.id);
      if (record.kind === "assignment" && record.status === "unknown" && before) record.status = before.status;
      const serialized = JSON.stringify(record);
      if (before && JSON.stringify(before) === serialized) continue;
      updates.push({ id: record.id, scope: group.scope, data: record });
      const change = changes(before, record);
      const meaningful = record.kind === "grade" ? !/^(?:-|–|—|)$/.test(record.value) : record.kind === "attendance" ? !/^(?:-|–|—|\?|)$/.test(record.status) : true;
      if (scopes.has(group.scope) && change && meaningful) events.push({ change, before: before || null, after: record });
    }
  }
  // Bulk JSON SQL uses only a handful of queries even for hundreds of records.
  // The entire snapshot, its baselines and its outbox commit atomically.
  const writes = [];
  for (let i = 0; i < updates.length; i += 250)
    writes.push(env.DB.prepare("INSERT INTO lms_records(chat_id,id,scope,data,changed_at) SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.scope'),json_extract(value,'$.data'),? FROM json_each(?) WHERE true ON CONFLICT(chat_id,id) DO UPDATE SET scope=excluded.scope,data=excluded.data,changed_at=excluded.changed_at")
      .bind(chatId, now, JSON.stringify(updates.slice(i, i + 250))));
  for (let i = 0; i < events.length; i += 250)
    writes.push(env.DB.prepare("INSERT INTO lms_events(chat_id,at,payload) SELECT ?,?,value FROM json_each(?)")
      .bind(chatId, now, JSON.stringify(events.slice(i, i + 250))));
  writes.push(env.DB.prepare("INSERT OR IGNORE INTO lms_scopes(chat_id,scope) SELECT ?,value FROM json_each(?)")
    .bind(chatId, JSON.stringify([...uniqueScopes])));
  writes.push(env.DB.prepare("INSERT INTO lms_scope_reads(chat_id,scope,checked_at) SELECT ?,json_extract(value,'$.scope'),json_extract(value,'$.checkedAt') FROM json_each(?) WHERE true ON CONFLICT(chat_id,scope) DO UPDATE SET checked_at=max(lms_scope_reads.checked_at,excluded.checked_at)")
    .bind(chatId, JSON.stringify(groups.map(({ scope, checkedAt }) => ({ scope, checkedAt })))));
  await env.DB.batch(writes);
  await applySubmissions(env, chatId);
  await env.DB.prepare("DELETE FROM lms_events WHERE chat_id=? AND (at<? OR id NOT IN (SELECT id FROM lms_events WHERE chat_id=? ORDER BY id DESC LIMIT 500))")
    .bind(chatId, now - 90 * 86400000, chatId).run();
  const manualDone = (await env.DB.prepare("SELECT uid,descr FROM deadlines WHERE chat_id=? AND done_at IS NOT NULL").bind(chatId).all()).results.map(r => ({
    uid: r.uid, assignmentId: String(r.descr || "").replace(/&amp;/g, "&").match(/\/mod\/assign\/view\.php\?id=(\d+)/)?.[1] || null,
  }));
  return { updated: updates.length, manualDone };
}
export async function applySubmissions(env, chatId) {
  const assignments = (await env.DB.prepare("SELECT data,changed_at FROM lms_records WHERE chat_id=? AND id LIKE 'assignment:%'").bind(chatId).all()).results;
  if (!assignments.length) return;
  const states = new Map(assignments.map(row => { const r = JSON.parse(row.data); return [r.id.split(":")[1], { status: r.status, at: row.changed_at }]; }));
  const deadlines = (await env.DB.prepare("SELECT uid,descr,submission_state FROM deadlines WHERE chat_id=?").bind(chatId).all()).results;
  const updates = [];
  for (const d of deadlines) {
    const id = String(d.descr || "").replace(/&amp;/g, "&").match(/\/mod\/assign\/view\.php\?id=(\d+)/)?.[1];
    const state = states.get(id);
    if (state && state.status !== "unknown" && d.submission_state !== state.status)
      updates.push({ uid: d.uid, status: state.status, at: state.at });
  }
  if (updates.length) await env.DB.prepare("WITH updates AS (SELECT json_extract(value,'$.uid') uid,json_extract(value,'$.status') status,json_extract(value,'$.at') at FROM json_each(?)) UPDATE deadlines SET submission_state=(SELECT status FROM updates WHERE updates.uid=deadlines.uid),submission_checked=(SELECT at FROM updates WHERE updates.uid=deadlines.uid) WHERE chat_id=? AND uid IN (SELECT uid FROM updates)")
    .bind(JSON.stringify(updates), chatId).run();
}
export async function notifyChanges(env, user) {
  const source = dataChatId(env, user.chat_id), demo = !!demoSource(env, user.chat_id);
  if (!permitted(env, user.chat_id) && !demo) return;
  const cursorKey = `demo-lms-cursor:${user.chat_id}`;
  let events;
  if (demo) {
    const saved = await env.DB.prepare("SELECT value FROM meta WHERE key=?").bind(cursorKey).first();
    if (!saved) {
      const latest = await env.DB.prepare("SELECT COALESCE(MAX(id),0) id FROM lms_events WHERE chat_id=?").bind(source).first();
      await env.DB.prepare("INSERT OR IGNORE INTO meta(key,value) VALUES (?,?)").bind(cursorKey, String(latest.id)).run();
      return; // Do not flood a newly invited viewer with the owner's entire history.
    }
    events = (await env.DB.prepare("SELECT * FROM lms_events WHERE chat_id=? AND id>? ORDER BY id LIMIT 8").bind(source, +saved.value).all()).results;
  } else {
    events = (await env.DB.prepare("SELECT * FROM lms_events WHERE chat_id=? AND notified=0 ORDER BY id LIMIT 8").bind(source).all()).results;
  }
  if (!events.length) return;
  const en = user.lang === "en";
  const lines = events.map(e => {
    const { before, after: r } = JSON.parse(e.payload);
    const label = r.kind === "grade" ? (en ? "Grade" : "Оценка") : r.kind === "attendance" ? "Attendance" : (en ? "Homework" : "Задание");
    const value = r.kind === "grade" ? `${before?.value ? before.value + " → " : ""}${r.value}` : r.kind === "attendance" ? `${before?.status ? before.status + " → " : ""}${r.status} · ${r.points}` : r.status;
    return `<b>${label}: ${esc(value.slice(0, 150))}</b>\n${esc(r.title.slice(0, 100))}\n<i>${esc(r.course.slice(0, 90))}</i>`;
  });
  const result = await M.post(env, user.chat_id, { kind: "lms", text: (en ? "📚 Moodle updates" : "📚 Изменения в Moodle") + "\n\n" + lines.join("\n\n") });
  if (result.ok) {
    if (demo) await env.DB.prepare("UPDATE meta SET value=? WHERE key=?").bind(String(events.at(-1).id), cursorKey).run();
    else await env.DB.batch(events.map(e => env.DB.prepare("UPDATE lms_events SET notified=1 WHERE id=? AND chat_id=?").bind(e.id, user.chat_id)));
  }
}
export async function recordsText(env, chatId, kind, lang) {
  const rows = (await env.DB.prepare("SELECT data FROM lms_records WHERE chat_id=? AND id LIKE ? ORDER BY changed_at DESC LIMIT 8").bind(dataChatId(env, chatId), kind + ":%").all()).results;
  const en = lang === "en";
  if (!rows.length) return en ? "No synced data yet. Connect the extension: /extension" : "Данных пока нет. Подключите расширение: /extension";
  const lines = rows.map(row => {
    const r = JSON.parse(row.data), value = kind === "grade" ? r.value : kind === "attendance" ? `${r.status} · ${r.points}` : r.status;
    return `<b>${esc(r.title.slice(0, 100))}</b> · ${esc(value.slice(0, 110))}\n<i>${esc(r.course.slice(0, 90))}</i>${r.dateText ? "\n" + esc(r.dateText.slice(0, 100)) : ""}`;
  });
  return (en ? "📚 Last synced records (up to 8)" : "📚 Последние записи (до 8)") + "\n\n" + lines.join("\n\n") + "\n\n" + (en ? "Full history is in the extension." : "Вся история — в расширении.");
}
