/* Чистота чата. У каждого вида сообщений свой лимит, и виды не вытесняют друг друга:
   карточки пар — две последние (старая переписывается на «идёт»/«прошла»),
   уведомления о дедлайнах — две, экраны (настройки, списки) — один, сообщение с меню — одно.
   Поэтому новый дедлайн больше не уносит карточку пары. */
import * as T from "./sched.js";
import * as X from "./text.js";
import { tg } from "./tg.js";

const LIMIT = { class: 2, deadline: 2, lms: 2, academic: 1, day: 1, due: 1, info: 1, menu: 1 };
const OPTS = { parse_mode: "HTML", link_preview_options: { is_disabled: true } };

const rows = (e, chatId, kind) =>
  e.DB.prepare("SELECT * FROM msgs WHERE chat_id = ? AND kind = ? ORDER BY at DESC").bind(chatId, kind).all().then(r => r.results);
const forget = (e, chatId, id) =>
  e.DB.prepare("DELETE FROM msgs WHERE chat_id = ? AND message_id = ?").bind(chatId, id).run();
const remember = (e, chatId, id, kind, ref) =>
  e.DB.prepare("INSERT OR REPLACE INTO msgs (chat_id, message_id, kind, at, ref) VALUES (?, ?, ?, ?, ?)")
    .bind(chatId, id, kind, Date.now(), ref ? JSON.stringify(ref) : null).run();

/* последняя карточка пары — чтобы не слать дубль той же пары */
export async function newest(e, chatId, kind = "class") {
  const r = await e.DB.prepare("SELECT * FROM msgs WHERE chat_id = ? AND kind = ? ORDER BY at DESC LIMIT 1").bind(chatId, kind).first();
  if (!r) return null;
  try { r.data = JSON.parse(r.ref || "null"); } catch { r.data = null; }
  return r;
}

/* убрать все сообщения одного вида (например, расписание дня перед первой парой) */
export async function dropKind(e, chatId, kind) {
  for (const row of await rows(e, chatId, kind)) await drop(e, chatId, row.message_id).catch(() => {});
}

/* ночная уборка: в чате не остаётся ничего */
export async function wipe(e, chatId) {
  const list = (await e.DB.prepare("SELECT message_id FROM msgs WHERE chat_id = ?").bind(chatId).all()).results;
  let removed = 0;
  for (const row of list) if (await drop(e, chatId, row.message_id).catch(() => false)) removed++;
  return removed;
}

export async function drop(e, chatId, id) {
  const r = await tg(e, "deleteMessage", { chat_id: chatId, message_id: id });
  // Telegram может отказать в удалении (в частности, если сообщению >48 часов).
  // Не теряем ID: иначе бот ошибочно считает чат пустым и больше не может повторить уборку.
  if (!r.ok && !/message to delete not found/i.test(r.description || "")) return false;
  await forget(e, chatId, id);
  return true;
}

/* карточку пары переписываем под текущее время: ещё будет → идёт → прошла */
async function refresh(e, chatId, row, load) {
  let ref; try { ref = JSON.parse(row.ref || "null"); } catch { ref = null; }
  if (!ref) return;
  const S = await load(ref.slug);
  if (!S) return;
  const g = T.dayBlocks(S, ref.iso).find(x => x.rs === ref.rs);
  if (!g) return;
  const state = X.stateOf(g, ref.iso, T.localNow(e));
  if (state.kind === ref.state || state.kind === "soon" || state.kind === "next") return;  // обратный отсчёт не дёргаем
  const text = X.classCard(g, ref.info, state, ref.lang);
  const markup = { inline_keyboard: [] };
  const r = ref.photo
    ? await tg(e, "editMessageCaption", { chat_id: chatId, message_id: row.message_id, caption: text, parse_mode: "HTML", reply_markup: markup })
    : await tg(e, "editMessageText", { chat_id: chatId, message_id: row.message_id, text, ...OPTS, reply_markup: markup });
  if (r.ok) await e.DB.prepare("UPDATE msgs SET ref = ? WHERE chat_id = ? AND message_id = ?")
    .bind(JSON.stringify({ ...ref, state: state.kind }), chatId, row.message_id).run();
}

async function prune(e, chatId, kind) {
  for (const row of (await rows(e, chatId, kind)).slice(LIMIT[kind] || 1))
    await drop(e, chatId, row.message_id).catch(() => {});
}

/* пересчитать карточки пар по времени и убрать лишнее */
export async function tidy(e, chatId, load) {
  for (const row of await rows(e, chatId, "class")) await refresh(e, chatId, row, load).catch(() => {});
  await prune(e, chatId, "class");
}

/* убрать старые inline-кнопки, оставшиеся под уже отправленными карточками */
export async function clearClassButtons(e, chatId) {
  for (const row of (await rows(e, chatId, "class")).slice(0, 2))
    await tg(e, "editMessageReplyMarkup", {
      chat_id: chatId, message_id: row.message_id, reply_markup: { inline_keyboard: [] },
    });
}

/* отправить и прибрать за собой — только среди сообщений того же вида */
export async function post(e, chatId, { kind = "info", photo, text, markup, ref }, load) {
  if (kind === "class") for (const row of await rows(e, chatId, "class")) await refresh(e, chatId, row, load).catch(() => {});
  const r = photo
    ? await tg(e, "sendPhoto", { chat_id: chatId, photo, caption: text, parse_mode: "HTML", ...(markup ? { reply_markup: markup } : {}) })
    : await tg(e, "sendMessage", { chat_id: chatId, text, ...OPTS, ...(markup ? { reply_markup: markup } : {}) });
  if (r.ok && r.result) {
    await remember(e, chatId, r.result.message_id, kind, ref);
    await prune(e, chatId, kind);
  }
  return r;
}

export async function postImage(e, chatId, { kind, bytes, text, markup }) {
  const form = new FormData();
  form.set("chat_id", String(chatId)); form.set("caption", text); form.set("parse_mode", "HTML");
  form.set("photo", new Blob([bytes], { type: "image/jpeg" }), "grades.jpg");
  if (markup) form.set("reply_markup", JSON.stringify(markup));
  const result = await tg(e, "sendPhoto", form);
  if (result.ok && result.result) { await remember(e, chatId, result.result.message_id, kind); await prune(e, chatId, kind); }
  return result;
}

/* правка своего сообщения (кнопки экранов) */
export async function edit(e, chatId, mid, { text, markup, kind = "info", ref }) {
  const r = await tg(e, "editMessageText",
    { chat_id: chatId, message_id: mid, text, ...OPTS, reply_markup: markup || { inline_keyboard: [] } });
  if (r.ok) { await remember(e, chatId, mid, kind, ref); return r; }
  return /not modified/i.test(r.description || "") ? r : null;
}

export async function replace(e, chatId, mid, { photo, text, markup, kind = "class", ref }) {
  const r = photo
    ? await tg(e, "editMessageCaption", { chat_id: chatId, message_id: mid, caption: text, parse_mode: "HTML", reply_markup: markup || { inline_keyboard: [] } })
    : await tg(e, "editMessageText", { chat_id: chatId, message_id: mid, text, ...OPTS, reply_markup: markup || { inline_keyboard: [] } });
  if (!r.ok && !/not modified/i.test(r.description || "")) return null;
  await remember(e, chatId, mid, kind, ref);
  return r;
}
