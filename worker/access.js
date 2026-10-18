/* Доступ только двум владельцам. ID хранятся в серверном секрете, не в Git и не в сайте. */
import { tg } from "./tg.js";

export function privateChatIds(env) {
  const values = String(env.BOT_ALLOWED_CHAT_IDS || "").split(",").map(s => s.trim());
  if (values.length !== 2 || values.some(s => !/^[1-9]\d*$/.test(s))) return [];
  const ids = values.map(Number);
  return ids.every(Number.isSafeInteger) && ids[0] !== ids[1] ? ids : [];
}

export function isPrivateUpdate(env, update) {
  const message = update?.message || update?.callback_query?.message;
  const from = update?.message?.from || update?.callback_query?.from;
  return message?.chat?.type === "private" && !from?.is_bot &&
    from?.id === message.chat.id && privateChatIds(env).includes(from.id);
}

const CLEANUP_KEY = "private_access_cleanup_v1";
const NOTICE_KEY = "private_access_notice_v1";
const NOTICE = "Спасибо, что пользовались ботом!\n\n" +
  "Ресурсы сервера перераспределяются на другой проект, поэтому доступ к сервису для вашего аккаунта завершён. " +
  "Уведомления отключены. Данные вашего аккаунта будут удалены.";

/* Разовая смена режима: сначала уведомление, затем удаление данных аккаунта.
   При временном отказе Telegram повторяем доставку в следующем цикле. */
export async function retireOtherUsers(env) {
  const ids = privateChatIds(env);
  if (ids.length !== 2) return;
  const saved = await env.DB.prepare("SELECT value FROM meta WHERE key = ?").bind(CLEANUP_KEY).first();
  const audit = saved ? JSON.parse(saved.value) : { removed: 0, notified: 0, unreachable: 0 };
  if (audit.complete) return;
  const owners = (await env.DB.prepare("SELECT person, chat_id FROM owners WHERE person IN ('nurali', 'nurbek')").all()).results;
  if (owners.length !== 2 || new Set(owners.map(o => o.chat_id)).size !== 2 || owners.some(o => !ids.includes(o.chat_id)))
    throw new Error("Private access IDs do not match the two confirmed owners; cleanup stopped");
  const users = (await env.DB.prepare("SELECT chat_id FROM users WHERE chat_id NOT IN (?, ?)")
    .bind(...ids).all()).results;
  let pending = false;
  for (const user of users) {
    const sent = await env.DB.prepare("SELECT key FROM sent WHERE chat_id = ? AND key IN (?, ?)")
      .bind(user.chat_id, NOTICE_KEY, NOTICE_KEY + ":unreachable").first();
    let unreachable = sent?.key === NOTICE_KEY + ":unreachable";
    if (!sent) {
      const r = await tg(env, "sendMessage", { chat_id: user.chat_id, text: NOTICE,
        reply_markup: { remove_keyboard: true } });
      unreachable = r.error_code === 403;
      if (!r.ok && !unreachable) { pending = true; continue; }
      await env.DB.prepare("INSERT OR IGNORE INTO sent (chat_id, key, at) VALUES (?, ?, ?)")
        .bind(user.chat_id, NOTICE_KEY + (unreachable ? ":unreachable" : ""), Date.now()).run();
    }
    await tg(env, "setChatMenuButton", { chat_id: user.chat_id, menu_button: { type: "commands" } });
    const next = { removed: audit.removed + 1, notified: audit.notified + (unreachable ? 0 : 1),
      unreachable: audit.unreachable + (unreachable ? 1 : 0) };
    // Параметры получены из точного списка исключённых аккаунтов; владельцев в нём нет.
    await env.DB.batch([
      ...["deadlines", "msgs", "sent", "guests", "owners", "users"].map(table =>
        env.DB.prepare(`DELETE FROM ${table} WHERE chat_id = ?`).bind(user.chat_id)),
      env.DB.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .bind(CLEANUP_KEY, JSON.stringify(next)),
    ]);
    Object.assign(audit, next);
  }
  if (pending) return;
  // Убираем также осиротевшие записи старых аккаунтов. chat_id=0 — системные отметки.
  audit.complete = true;
  await env.DB.batch([
    ...["deadlines", "msgs", "guests", "owners", "users"].map(table =>
      env.DB.prepare(`DELETE FROM ${table} WHERE chat_id NOT IN (?, ?)`).bind(...ids)),
    env.DB.prepare("DELETE FROM sent WHERE chat_id NOT IN (?, ?, 0)").bind(...ids),
    env.DB.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .bind(CLEANUP_KEY, JSON.stringify(audit)),
  ]);
}
