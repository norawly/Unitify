/* Обработка сообщений и кнопок бота. Лимиты сообщений раздельны по видам
   (worker/msgs.js): дедлайны не вытесняют карточки пар. */
import * as T from "./sched.js";
import * as X from "./text.js";
import * as db from "./db.js";
import * as M from "./msgs.js";
import * as moodle from "./moodle.js";
import { tg } from "./tg.js";
import { t as dict, subject as subjectName, durIn } from "./i18n.js";

/* за сколько напоминать, решает расписание (worker/sched.js: leadOf) — в настройках только вкл/выкл */
const RATE = 7;                                // обращений в минуту с одного аккаунта
const BARCODE = /^\d{5,8}$/;                   // баркод студента
const langOf = u => (u && u.lang === "en") ? "en" : "ru";

/* ---------- данные из статики ---------- */
const cache = new Map();
async function asset(e, key, path) {
  if (cache.has(key)) return cache.get(key);
  const r = await e.ASSETS.fetch(new Request(e.PUBLIC_URL + path));
  const v = r.ok ? await r.json() : null;
  if (v) cache.set(key, v);
  return v;
}
export const loadPeople = async e => (await asset(e, "people", "/people.json")) || [];
export const loadSchedule = (e, slug) => slug ? asset(e, "s:" + slug, `/${slug}/schedule.json`) : null;
const loadRoomMaps = async e => (await asset(e, "maps", "/map/rooms/index.json")) || { rooms: {} };
const loadDayCards = async e => (await asset(e, "days", "/map/days/index.json")) || { cards: {} };
const site = (e, slug, query = "") => `${e.PUBLIC_URL}/${slug}/${query}`;
export const loader = e => slug => loadSchedule(e, slug);

/* ---------- отправка ---------- */
export const post = (e, chatId, msg) => M.post(e, chatId, msg, loader(e));
export const send = (e, chatId, text, markup) => post(e, chatId, { text, markup });

/* правим сообщение под кнопкой, если не вышло — присылаем новое */
async function show(c, text, markup, edit, kind = "info") {
  if (edit && c.mid) {
    const r = await M.edit(c.env, c.chatId, c.mid, { text, markup, kind });
    if (r) return r;
  }
  return post(c.env, c.chatId, { text, markup, kind });
}

/* ---------- клавиатуры ---------- */
export const menuKeyboard = (e, user) => {
  const L = dict(langOf(user));
  return {
    keyboard: [
      [{ text: L.menu_next }, { text: L.menu_today }],
      [{ text: L.menu_deadlines }, { text: L.menu_settings }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
};

function classButtons(e, user, it) {
  const L = dict(langOf(user));
  if (it.online) return [{ text: L.btn_lms, url: "https://lms.astanait.edu.kz" }];
  if (T.bldg(it) || !/^\d/.test(T.roomShort(it.room))) return [];
  return [{ text: L.btn_map, web_app: { url: site(e, user.person, "?room=" + encodeURIComponent(T.roomShort(it.room))) } }];
}

/* карточка пары: картинка карты, сколько осталось, время, предмет и кабинет */
export async function sendClassCard(e, chatId, user, g, iso, state, extraRows = []) {
  const it = g.it, lang = langOf(user);
  const maps = await loadRoomMaps(e);
  const info = (!it.online && !T.bldg(it)) ? (maps.rooms || {})[T.mapKey(it.room)] : null;
  const text = X.classCard(g, info, state, lang);
  const btn = classButtons(e, user, it);
  const rows = [...(btn.length ? [btn] : []), ...extraRows];
  const markup = rows.length ? { inline_keyboard: rows } : undefined;
  const ref = { slug: user.person, iso, rs: g.rs, state: state.kind, lang, info, photo: !!info };

  /* та же пара уже висит последним сообщением — обновляем её, а не плодим дубли */
  const last = await M.newest(e, chatId);
  if (last && last.kind === "class" && last.data && last.data.slug === ref.slug &&
      last.data.iso === ref.iso && last.data.rs === ref.rs && !!last.data.photo === !!info) {
    const r = await M.replace(e, chatId, last.message_id, { photo: !!info, text, markup, ref });
    if (r) return r;
  }

  if (info) {
    const photo = `${e.PUBLIC_URL}/map/rooms/${info.file}?v=${maps.version}`;
    const r = await post(e, chatId, { kind: "class", photo, text, markup, ref });
    if (r.ok) return r;
    ref.photo = false;
  }
  return post(e, chatId, { kind: "class", text, markup, ref });
}

/* Личное расписание открывается только со своего аккаунта.
   Кто привязался первым (а это уже сделано), тот и владелец — остальным отказ. */
export async function allowed(e, slug, chatId) {
  const p = (await loadPeople(e)).find(x => x.slug === slug);
  if (!p || !p.private) return true;
  const row = await db.ownerOf(e, slug);
  if (!row) { await db.claimOwner(e, slug, chatId); return true; }
  return row.chat_id === chatId;
}

/* ---------- вход ---------- */
export async function handleUpdate(e, update) {
  const msg = update.message, cb = update.callback_query;
  const chat = msg ? msg.chat : cb && cb.message && cb.message.chat;
  const from = msg ? msg.from : cb && cb.from;
  if (!chat || chat.type !== "private" || !from || from.is_bot) return;

  /* защита от спама: не больше RATE действий в минуту с одного аккаунта.
     Про превышение сообщаем прямо, но не чаще раза в минуту — иначе ответы сами станут спамом. */
  if (e.RL) {
    const { success } = await e.RL.limit({ key: "chat:" + chat.id });
    if (!success) {
      const notice = !e.RLN || (await e.RLN.limit({ key: "warn:" + chat.id })).success;
      const known = await db.getUser(e, chat.id);
      if (notice && known && known.status !== "banned")
        await post(e, chat.id, { text: dict(langOf(known)).too_fast(RATE) });
      return;
    }
  }

  const user = await db.getUser(e, chat.id);
  if (user && user.status === "banned") return;
  /* незнакомец, перебиравший баркоды, сидит в тишине — ни одной функции бота */
  if (!user && await db.guestQuiet(e, chat.id)) return;

  /* привязан к чужому личному расписанию — отвязываем и просим свой баркод */
  if (user && user.person && !(await allowed(e, user.person, chat.id))) {
    await db.updateUser(e, chat.id, { person: null });
    user.person = null;
    const L = dict(langOf(user));
    await post(e, chat.id, { text: `${L.locked}\n\n${L.ask_barcode}` });
    return;
  }

  const c = { env: e, chatId: chat.id, from, user, now: T.localNow(e), lang: langOf(user) };
  if (cb) return onCallback(c, cb);
  if (!msg.text) return;
  await onText(c, msg.text.trim());
  /* свои сообщения тоже убираем — чат остаётся чистым */
  if (c.user) await tg(e, "deleteMessage", { chat_id: chat.id, message_id: msg.message_id });
}

/* ---------- текст ---------- */
const isBtn = (text, key) => text === dict("ru")[key] || text === dict("en")[key];
async function onText(c, text) {
  const L = dict(c.lang);
  const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@\w+$/, "");
  if (cmd === "/start") return start(c);
  if (BARCODE.test(text)) return byBarcode(c, text);
  if (!c.user) return stranger(c);
  if (c.user.status === "pending") return pendingNotice(c);

  const cal = moodle.validCalUrl(text);
  if (cal) return saveCalendar(c, cal);
  if (/lms\.astanait\.edu\.kz\/calendar/.test(text)) return send(c.env, c.chatId, L.cal_bad);

  if (cmd === "/next" || isBtn(text, "menu_next")) return nextCard(c.env, c.chatId, c.user, c.now);
  if (cmd === "/settings" || isBtn(text, "menu_settings")) return settings(c, "open");
  if (isBtn(text, "menu_today")) return todayCard(c);
  if (isBtn(text, "menu_deadlines")) return deadlines(c);
  if (cmd === "/test") return preview(c);
  if (cmd === "/today") return todayCard(c);
  if (cmd === "/day") return showDay(c, c.now.iso);
  if (cmd === "/tomorrow") return showDay(c, T.isoAdd(c.now.iso, 1));
  if (cmd === "/week") return showWeek(c, T.weekStart(c.now.iso));
  if (cmd === "/deadlines") return deadlines(c);
  if (cmd === "/where") return where(c, text.split(/\s+/).slice(1).join(" "));
  if (cmd === "/menu") return help(c);
  if (cmd === "/id") return send(c.env, c.chatId, `<code>${c.chatId}</code>`);
  if (cmd === "/users" && c.user.status === "admin") return usersList(c);
  if (T.parseRoom(text)) return where(c, text);
  return help(c);
}

const help = c => post(c.env, c.chatId,
  { kind: "menu", text: dict(c.lang).welcome(c.user.lead_min || 20), markup: menuKeyboard(c.env, c.user) });

/* незнакомец без баркода: подсказываем один раз, а спам уводим в тишину */
async function stranger(c) {
  const { silenced } = await db.guestStrike(c.env, c.chatId);
  if (silenced) return;
  return send(c.env, c.chatId, dict(c.lang).ask_barcode);
}

/* ---------- регистрация ---------- */
async function start(c) {
  if (c.user) {
    if (c.user.status === "pending") return pendingNotice(c, true);
    return welcome(c.env, c.chatId, c.user, c.now);
  }
  if (await db.guestQuiet(c.env, c.chatId)) return;
  const L = dict(c.lang);
  return send(c.env, c.chatId,
    `👋 ${L.hi}, ${X.esc(c.from.first_name || "")}!\n\n${L.start_intro}\n\n${L.start_ask}`);
}

/* вход по баркоду: есть такой — сразу расписание; нет — ни одной функции, а за перебор тишина */
async function byBarcode(c, code) {
  const L = dict(c.lang);
  const people = await loadPeople(c.env);
  const p = people.find(x => x.barcode && x.barcode === code);

  if (!p) {
    if (c.user) return send(c.env, c.chatId, `🤔 <b>${X.esc(code)}</b> — ${L.ask_barcode}`);
    const { silenced } = await db.guestStrike(c.env, c.chatId);
    if (silenced) return;
    return send(c.env, c.chatId,
      `🤔 Баркода <b>${X.esc(code)}</b> у меня нет.\n\n` +
      `Напиши ${X.esc(c.env.ADMIN_CONTACT || "админу")} — он добавит твоё расписание, и всё заработает.`);
  }

  if (!(await allowed(c.env, p.slug, c.chatId)))   // чужое личное расписание
    return send(c.env, c.chatId, L.locked);

  if (c.user) {                                   // смена расписания у своих
    await db.updateUser(c.env, c.chatId, { person: p.slug });
    c.user.person = p.slug;
    await setMenuButton(c.env, c.chatId, c.user);
    await post(c.env, c.chatId, { kind: "menu", text: L.switched(code), markup: menuKeyboard(c.env, c.user) });
    return nextCard(c.env, c.chatId, c.user, c.now);
  }
  if (await db.countUsers(c.env) >= +(c.env.MAX_USERS || 60))
    return send(c.env, c.chatId, L.no_places);

  const first = !(await db.adminExists(c.env));
  const name = [c.from.first_name, c.from.last_name].filter(Boolean).join(" ");
  await db.createUser(c.env, { chat_id: c.chatId, name, username: c.from.username,
                               person: p.slug, status: first ? "admin" : "approved" });
  await db.guestClear(c.env, c.chatId);
  const user = await db.getUser(c.env, c.chatId);
  c.user = user;
  return welcome(c.env, c.chatId, user, c.now);
}

async function welcome(e, chatId, user, now) {
  const L = dict(langOf(user));
  await setMenuButton(e, chatId, user);
  await post(e, chatId, { kind: "menu", text: L.welcome(user.lead_min || 20), markup: menuKeyboard(e, user) });
  return nextCard(e, chatId, user, now);
}

const setMenuButton = (e, chatId, user) =>
  tg(e, "setChatMenuButton", { chat_id: chatId, menu_button: { type: "web_app",
    text: dict(langOf(user)).menu_site, web_app: { url: site(e, user.person) } } });

async function pendingNotice(c, force) {
  if (!force && Date.now() - (c.user.notified_at || 0) < 10 * 60000) return;
  await db.updateUser(c.env, c.chatId, { notified_at: Date.now() });
  return send(c.env, c.chatId, "⏳ Заявка ещё на рассмотрении — напишу, как только пустят.");
}

async function admin(c, act, id) {
  if (c.user.status !== "admin") return "—";
  const target = await db.getUser(c.env, +id);
  if (!target) { await show(c, "Этой заявки уже нет", null, true); return ""; }
  if (act === "ok") {
    await db.updateUser(c.env, target.chat_id, { status: "approved" });
    await show(c, `✅ Пустил: ${X.who(target)}`, null, true);
    target.status = "approved";
    await welcome(c.env, target.chat_id, target, c.now);
    return "Пустил";
  }
  if (act === "no") {
    await db.deleteUser(c.env, target.chat_id);
    await show(c, `❌ Отклонил: ${X.who(target)}`, null, true);
    return "Отклонил";
  }
  if (act === "ban") {
    await db.updateUser(c.env, target.chat_id, { status: "banned" });
    await show(c, `🚫 Заблокирован: ${X.who(target)}`, null, true);
    return "Заблокирован";
  }
  return "";
}

async function usersList(c) {
  const list = await db.allUsers(c.env);
  const icon = { admin: "👑", approved: "✅", pending: "⏳", banned: "🚫" };
  return send(c.env, c.chatId, `👥 <b>Пользователи: ${list.length}</b>\n\n` +
    list.map(u => `${icon[u.status] || "•"} ${X.who(u)} — ${X.esc(u.person || "")}`).join("\n"));
}

/* ---------- кнопки ---------- */
async function onCallback(c, cb) {
  c.mid = cb.message && cb.message.message_id;
  const [kind, a, b] = String(cb.data || "").split(":");
  let toast = "";
  if (!c.user || c.user.status === "pending") toast = "Сначала баркод — /start";
  else if (kind === "n") await nextCard(c.env, c.chatId, c.user, c.now);
  else if (kind === "t") await preview(c);
  else if (kind === "d") await showDay(c, a, true);
  else if (kind === "w") await showWeek(c, a, true);
  else if (kind === "s") toast = await settings(c, a, true);
  else if (kind === "dl") await deadlines(c, a, true);
  else if (kind === "c" && /^\d{4}-\d{2}-\d{2}$/.test(a) && /^\d+$/.test(b)) {
    const S = await loadSchedule(c.env, c.user.person);
    const g = S && T.dayBlocks(S, a).find(x => x.rs === +b);
    if (g) await sendClassCard(c.env, c.chatId, c.user, g, a, X.stateOf(g, a, c.now));
  }
  else if ((kind === "hd" || kind === "hu") && /^\d+$/.test(a)) {
    const d = await moodle.deadlineById(c.env, c.chatId, +a);
    if (d) {
      await moodle.setDone(c.env, c.chatId, d.id, kind === "hd");
      toast = dict(c.lang)[kind === "hd" ? "done_saved" : "done_restored"];
      if (kind === "hd" && c.mid) await tg(c.env, "editMessageReplyMarkup", {
        chat_id: c.chatId, message_id: c.mid, reply_markup: { inline_keyboard: [] },
      });
      if (kind === "hu") await deadlines(c, null, true);
    }
  }
  else if (kind === "a") toast = await admin(c, a, b);
  await tg(c.env, "answerCallbackQuery", { callback_query_id: cb.id, ...(toast ? { text: toast } : {}) });
  /* даже при заходе в настройки прошлая карточка пары пересчитывается по времени */
  await M.tidy(c.env, c.chatId, loader(c.env));
}

/* ---------- экраны ---------- */
export async function nextCard(e, chatId, user, now, force) {
  const L = dict(langOf(user));
  const S = await loadSchedule(e, user.person);
  if (!S) return send(e, chatId, L.ask_barcode);
  const n = T.nextClass(S, now, false);
  if (!n) return send(e, chatId, L.no_more);
  const state = force || X.stateOf(n.g, n.iso, now);
  return sendClassCard(e, chatId, user, n.g, n.iso, state, [[{ text: L.btn_refresh, callback_data: "n" },
                                                             { text: L.btn_day, callback_data: "s:today" }]]);
}

const preview = c => nextCard(c.env, c.chatId, c.user, c.now,
  { kind: "soon", mins: c.user.lead_min || 20 });

/* весь сегодняшний день — одной картинкой */
export async function dayPhoto(e, user, iso) {
  const cards = await loadDayCards(e);
  const file = (cards.cards || {})[`${user.person}|${T.keyOf(iso)}|${user.lang === "en" ? "en" : "ru"}`];
  return file ? `${e.PUBLIC_URL}/map/days/${file}?v=${cards.version}` : null;
}

async function todayCard(c, iso) {
  const L = dict(c.lang);
  iso = iso || c.now.iso;
  const S = await loadSchedule(c.env, c.user.person);
  if (!S) return;
  const key = T.keyOf(iso), list = T.dayBlocks(S, iso);
  if (!list.length) return show(c, X.dayText(S, iso, c.now, c.lang), null, false);

  const photo = await dayPhoto(c.env, c.user, iso);
  const day = L.days[T.KEYS.indexOf(key)];
  const now = T.nextClass(S, c.now);
  const hint = (now && now.iso === iso)
    ? (now.live ? `🟢 ${L.live_now(durIn(now.left, c.lang))}` : `⏭ ${L.next_in(durIn(now.wait, c.lang))} · ${T.hhmm(now.g.rs)}`)
    : "";
  const caption = `📅 <b>${day}, ${X.fmtDate(iso, c.lang)}</b>` + (hint ? `\n${hint}` : "");
  const markup = { inline_keyboard: list.map(g => [{
    text: `${T.hhmm(g.rs)}  ${subjectName(g.it.subject, c.lang).slice(0, 28)}`,
    callback_data: `c:${iso}:${g.rs}`,
  }]) };
  if (!photo) return show(c, X.dayText(S, iso, c.now, c.lang), markup, false, "day");
  return post(c.env, c.chatId, { kind: "day", photo, text: caption, markup });
}

async function showDay(c, iso, edit) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) iso = c.now.iso;
  const S = await loadSchedule(c.env, c.user.person); if (!S) return;
  const prev = T.stepDay(iso, -1), next = T.stepDay(iso, 1);
  const kb = { inline_keyboard: [[
    { text: "◀️ " + T.dayLabel(prev), callback_data: "d:" + prev },
    { text: T.dayLabel(next) + " ▶️", callback_data: "d:" + next },
  ]] };
  return show(c, X.dayText(S, iso, c.now, c.lang), kb, edit);
}

async function showWeek(c, ws, edit) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ws || "")) ws = c.now.iso;
  ws = T.weekStart(ws);
  const S = await loadSchedule(c.env, c.user.person); if (!S) return;
  const kb = { inline_keyboard: [[
    { text: "◀️", callback_data: "w:" + T.isoAdd(ws, -7) },
    { text: "▶️", callback_data: "w:" + T.isoAdd(ws, 7) },
  ]] };
  return show(c, X.weekText(S, ws, c.now, c.lang), kb, edit);
}

async function where(c, query) {
  const L = dict(c.lang);
  const r = T.parseRoom(query);
  if (!r) return send(c.env, c.chatId, `📍 <code>2.232P</code>`);
  const S = await loadSchedule(c.env, c.user.person);
  const mine = [];
  if (S) for (const k of T.KEYS) for (const g of T.blocks(S, k))
    if (!g.it.online && T.mapKey(g.it.room) === T.mapKey(r.room))
      mine.push(`• ${L.daysShort[T.KEYS.indexOf(k)]} ${T.hhmm(g.rs)} — ${X.esc(subjectName(g.it.subject, c.lang))}`);
  const mineText = mine.length ? `\n\n${mine.join("\n")}` : "";

  const maps = await loadRoomMaps(c.env);
  const info = r.main ? (maps.rooms || {})[T.mapKey(r.room)] : null;
  const floor = info ? info.floor : T.floorOf(r.room), block = info ? info.block : T.blockOf(r.room);
  const caption = `🚪 ${L.room} <b>${X.esc(T.roomShort(r.room))}</b>` +
    (info ? ` — ${L.floorAt(floor)}, ${L.blockAt(block)}` : "") + mineText;
  const markup = info ? { inline_keyboard: [[{ text: L.btn_map,
    web_app: { url: site(c.env, c.user.person, "?room=" + encodeURIComponent(T.roomShort(r.room))) } }]] } : undefined;
  if (!info) return send(c.env, c.chatId, caption, markup);
  return post(c.env, c.chatId, { photo: `${c.env.PUBLIC_URL}/map/rooms/${info.file}?v=${maps.version}`,
                                 text: caption, markup });
}

/* ---------- дедлайны Moodle ---------- */
async function saveCalendar(c, url) {
  const L = dict(c.lang);
  await db.updateUser(c.env, c.chatId, { cal_url: url, cal_hash: null, cal_checked: null });
  c.user.cal_url = url; c.user.cal_hash = null;
  const r = await moodle.syncUser(c.env, c.user);
  if (!r || !r.ok) {
    await db.updateUser(c.env, c.chatId, { cal_url: null });
    return send(c.env, c.chatId, L.cal_fail);
  }
  await send(c.env, c.chatId, L.cal_ok(r.count || 0));
  return deadlines(c);
}

async function deadlines(c, _which, edit) {
  const L = dict(c.lang), off = +(c.env.TZ_OFFSET_MIN || 300);
  if (!c.user.cal_url) return show(c, L.cal_how, null, edit);
  const S = await loadSchedule(c.env, c.user.person);
  const list = await moodle.visibleUpcoming(c.env, c.chatId, S, Date.now(), 20, off);
  const undo = list.filter(d => d.done_at).slice(0, 8).map(d => [{
    text: `${L.btn_undo} · ${String(d.title).replace(/ is due$/i, "").slice(0, 24)}`,
    callback_data: `hu:${d.id}`,
  }]);
  return show(c, X.deadlinesText(list, Date.now(), c.lang, off),
    undo.length ? { inline_keyboard: undo } : null, edit);
}

/* ---------- настройки ---------- */
async function settings(c, what, edit) {
  const u = c.user;
  const L0 = dict(c.lang);
  if (what === "today") { await todayCard(c); return ""; }
  if (what === "cal") {
    if (!u.cal_url) { await show(c, L0.cal_how, null, edit); return ""; }
    await show(c, `${L0.s_moodle}: <b>${L0.s_moodle_on}</b>\n\n${L0.cal_note}`, { inline_keyboard: [
      [{ text: L0.menu_deadlines, callback_data: "dl" }],
      [{ text: L0.btn_cal_off, callback_data: "s:caloff" }]] }, edit);
    return "";
  }
  if (what === "caloff") {
    await db.updateUser(c.env, c.chatId, { cal_url: null, cal_hash: null });
    await c.env.DB.prepare("DELETE FROM deadlines WHERE chat_id = ?").bind(c.chatId).run();
    u.cal_url = null;
    await show(c, L0.cal_off, null, edit);
    return "";
  }
  if (what === "person") {
    await show(c, `🎫 ${L0.ask_barcode}`, null, edit);
    return "";
  }

  let toast = "";
  if (what === "lead") {
    u.lead_min = u.lead_min > 0 ? 0 : 20;
    await db.updateUser(c.env, c.chatId, { lead_min: u.lead_min });
    toast = u.lead_min ? dict(c.lang).s_remind_on : dict(c.lang).s_remind_off;
  }
  if (what === "lang") {
    c.lang = u.lang = c.lang === "en" ? "ru" : "en";
    await db.updateUser(c.env, c.chatId, { lang: u.lang });
    await setMenuButton(c.env, c.chatId, u);
    await post(c.env, c.chatId, { kind: "menu", text: dict(c.lang).welcome(u.lead_min || 20), markup: menuKeyboard(c.env, u) });
    edit = false;                                   // настройки придут новым сообщением, со свежим меню
  }

  const L = dict(c.lang);
  const people = await loadPeople(c.env);
  const owner = (people.find(p => p.slug === u.person) || {}).owner || u.person;
  await show(c, X.settingsText(u, owner, c.lang), { inline_keyboard: [
    [{ text: "🔔 " + (u.lead_min ? L.s_remind_on : L.s_remind_off), callback_data: "s:lead" }],
    [{ text: L.btn_today, callback_data: "s:today" }, { text: L.btn_preview, callback_data: "t" }],
    [{ text: L.btn_moodle, callback_data: "s:cal" }],
    [{ text: L.btn_lang, callback_data: "s:lang" }, { text: L.btn_barcode, callback_data: "s:person" }],
  ] }, edit);
  return toast;
}
