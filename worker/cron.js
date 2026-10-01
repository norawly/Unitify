/* Раз в минуту (Ticker): напоминания перед парами, календарь Moodle, настройка webhook */
import * as T from "./sched.js";
import * as X from "./text.js";
import * as db from "./db.js";
import * as M from "./msgs.js";
import * as moodle from "./moodle.js";
import { tg, webhookSecret } from "./tg.js";
import { loadSchedule, loader, sendClassCard, post, dayPhoto, menuKeyboard } from "./bot.js";
import { t as dict, durIn, SUBJECT_EN } from "./i18n.js";

const BUDGET = 40;            // бесплатный план — до 50 запросов наружу за запуск
const DUE_LEADS = [24 * 60, 2 * 60];   // о дедлайне напоминаем за сутки и за два часа

export async function runCron(env, source = "cron") {
  if (!env.TELEGRAM_TOKEN || !env.DB) return;
  /* метку времени пишем раз в пять минут: на бесплатном D1 важен каждый лишний запрос на запись */
  const nowMin = Math.floor(Date.now() / 60000);
  if (nowMin % 5 === 0) await db.setMeta(env, "tick_last", `${new Date().toISOString()} ${source}`);
  const hook = await ensureWebhook(env);
  if (!hook.ok) console.log("webhook не настроен:", hook.step, hook.error_code, hook.description);

  const now = T.localNow(env);
  const load = loader(env);
  let budget = BUDGET;

  for (const u of await db.activeUsers(env)) {
    if (budget <= 0) break;
    const S = await loadSchedule(env, u.person);
    const today = S ? T.dayBlocks(S, now.iso) : [];
    const on = u.lead_min > 0;                       // напоминания включены

    /* 01:00 — чат чистый, ни одного сообщения */
    if (at(now, WIPE) && await db.markSent(env, u.chat_id, `${now.iso}:wipe`)) {
      budget -= await M.wipe(env, u.chat_id);
      continue;
    }

    /* 08:00 — доброе утро: расписание дня и то, что сдавать в ближайшие два дня */
    if (on && at(now, MORNING) && await db.markSent(env, u.chat_id, `${now.iso}:morning`)) {
      await morning(env, u, S, today, now);
      budget -= 4;
    }

    /* напоминание перед парой: первая — за 40 минут, дальше — по окну перед ней */
    if (on) for (let i = 0; i < today.length; i++) {
      const g = today[i], lead = T.leadOf(today, i), t = g.rs - lead;
      if (now.min >= t && now.min < t + 5 && now.min < g.rs &&
          await db.markSent(env, u.chat_id, `${now.iso}:r:${g.rs}`)) {
        await M.dropKind(env, u.chat_id, "day");     // расписание дня уступает место парам
        await sendClassCard(env, u.chat_id, u, g, now.iso, { kind: "soon", mins: g.rs - now.min });
        budget -= 3;
      }
    }

    /* последняя пара закончилась: убираем напоминания и показываем все дедлайны заново */
    if (on && today.length) {
      const end = today[today.length - 1].re;
      if (now.min >= end && now.min < end + 5 && await db.markSent(env, u.chat_id, `${now.iso}:evening`)) {
        await M.dropKind(env, u.chat_id, "class");
        await evening(env, u);
        budget -= 3;
      }
    }

    /* карточки пересчитываем не каждую минуту, а когда пара началась или закончилась */
    if (today.some(g => now.min - g.rs === 1 || now.min - g.re === 1))
      await M.tidy(env, u.chat_id, load).catch(() => {});
  }

  /* календари Moodle — по кругу, не чаще раза в минуту на человека */
  for (const u of await db.calendarUsers(env)) {
    if (budget <= 0) break;
    budget -= 2;
    await checkCalendar(env, u, now).catch(e => console.log("moodle", u.chat_id, String(e)));
  }

  /* раз в сутки чистим старые отметки */
  if (now.min >= 180 && now.min < 190 && await db.markSent(env, 0, `${now.iso}:cleanup`))
    await db.cleanupSent(env, now.ms - 3 * 86400000);
}

const WIPE = 60, MORNING = 8 * 60;                   // 01:00 и 08:00 по Астане
const at = (now, minute) => now.min >= minute && now.min < minute + 5;

/* утро: картинка с расписанием дня (с окнами) и ближайшие дедлайны */
async function morning(env, u, S, today, now) {
  const lang = u.lang === "en" ? "en" : "ru", L = dict(lang), off = +(env.TZ_OFFSET_MIN || 300);

  if (!today.length) {
    await post(env, u.chat_id, { kind: "day", text: L.morning_none, markup: menuKeyboard(env, u) });
  } else {
    const span = `${T.hhmm(today[0].rs)} – ${T.hhmm(today[today.length - 1].re)}`;
    const caption = `${L.morning}\n\n📅 <b>${L.days[T.KEYS.indexOf(T.keyOf(now.iso))]}, ${X.fmtDate(now.iso, lang)}</b> · ${span}`;
    const card = await dayPhoto(env, u, now.iso);
    await post(env, u.chat_id, card
      ? { kind: "day", photo: card, text: caption, markup: menuKeyboard(env, u) }
      : { kind: "day", text: `${L.morning}\n\n${X.dayText(S, now.iso, now, lang)}`, markup: menuKeyboard(env, u) });
  }

  if (!u.cal_url) return;
  const soon = (await moodle.upcoming(env, u.chat_id, Date.now(), 20))
    .filter(d => d.due < Date.now() + 2 * 86400000);
  await post(env, u.chat_id, { kind: "due", markup: menuKeyboard(env, u), text: soon.length
    ? X.deadlinesText(soon, Date.now(), lang, off, L.due_soon_head)
    : L.due_none_soon });
}

/* вечер: пары кончились — показываем всё, что впереди */
async function evening(env, u) {
  const lang = u.lang === "en" ? "en" : "ru", L = dict(lang), off = +(env.TZ_OFFSET_MIN || 300);
  const markup = menuKeyboard(env, u);
  if (!u.cal_url) return post(env, u.chat_id, { kind: "due", text: L.evening, markup });
  const list = await moodle.upcoming(env, u.chat_id, Date.now(), 20);
  return post(env, u.chat_id, { kind: "due", markup,
    text: `${L.evening}\n\n${X.deadlinesText(list, Date.now(), lang, off)}` });
}

/* новые и перенесённые задания + напоминания о скором дедлайне */
async function checkCalendar(env, u, now) {
  const lang = u.lang === "en" ? "en" : "ru", L = dict(lang), off = +(env.TZ_OFFSET_MIN || 300);
  const initial = !u.cal_hash;                     // первое подключение: список и так покажем, молчим
  const r = await moodle.syncUser(env, u);
  if (!r || !r.ok) return;

  if (!initial) {
    const soon = list => list.filter(d => d.due > Date.now()).sort((a, b) => a.due - b.due).slice(0, 2);
    for (const d of soon(r.added || []))
      if (await db.markSent(env, u.chat_id, `dl:new:${d.uid}:${d.due}`))
        await post(env, u.chat_id, { kind: "deadline", text: deadlineText(L.new_deadline, d, lang, off) });
    for (const d of soon(r.moved || []))
      if (await db.markSent(env, u.chat_id, `dl:mv:${d.uid}:${d.due}`))
        await post(env, u.chat_id, { kind: "deadline", text: deadlineText(L.moved_deadline, d, lang, off) });
  }

  /* расхождение с нашим расписанием — не чаще раза в сутки */
  if (r.events && await db.markSent(env, u.chat_id, `${now.iso}:cmp`)) {
    const S = await loadSchedule(env, u.person);
    const diff = S ? compare(S, r.events, now, off, lang) : [];
    if (diff.length)
      await post(env, u.chat_id, { text: `${L.moodle_diff}\n\n${diff.slice(0, 5).join("\n")}\n\n<i>${L.moodle_diff_note}</i>` });
  }

  /* за сутки и за два часа до сдачи */
  for (const d of await moodle.upcoming(env, u.chat_id, Date.now(), 10)) {
    const left = Math.round((d.due - Date.now()) / 60000);
    for (const lead of DUE_LEADS)
      if (left > lead - 5 && left <= lead && await db.markSent(env, u.chat_id, `dl:${lead}:${d.uid}:${d.due}`))
        await post(env, u.chat_id, { kind: "deadline",
          text: deadlineText(L.due_soon(durIn(left, lang)), d, lang, off) });
  }
}

function deadlineText(head, d, lang, off) {
  const at = new Date(d.due + off * 60000), L = dict(lang);
  const when = `${at.getUTCDate()} ${L.monthsShort[at.getUTCMonth()]}, ` +
    `${String(at.getUTCHours()).padStart(2, "0")}:${String(at.getUTCMinutes()).padStart(2, "0")}`;
  return `${head}\n\n📌 <b>${X.esc(String(d.title).replace(/ is due$/i, ""))}</b>\n` +
         `<i>${X.esc(d.subject || "")}</i>\n🕐 ${when}`;
}

/* занятия из Moodle против нашего расписания на ближайшую неделю */
function compare(S, events, now, off, lang) {
  const out = [];
  const ours = new Set();                          // сверяем только предметы, которые есть у нас
  for (const k of T.KEYS) for (const g of T.blocks(S, k)) {
    ours.add(g.it.subject.toLowerCase());
    const en = SUBJECT_EN[g.it.subject];
    if (en) ours.add(en.toLowerCase());
  }
  for (const e of events) {
    if (!moodle.isClass(e) || !ours.has(String(e.subject || "").toLowerCase())) continue;
    const local = new Date(e.due + off * 60000);
    const iso = local.toISOString().slice(0, 10);
    const min = local.getUTCHours() * 60 + local.getUTCMinutes();
    if (iso < now.iso || iso > T.isoAdd(now.iso, 7)) continue;
    const list = T.dayBlocks(S, iso);
    if (!list.length) continue;                               // выходной или каникулы — не наше дело
    if (list.some(g => Math.abs(g.rs - min) <= 20)) continue;
    out.push(`• ${X.fmtShort(iso, lang)} ${T.hhmm(min)} — ${X.esc(e.subject || e.title)}`);
  }
  return out;
}

/* webhook, команды и описание — один раз и заново при смене токена или версии. */
export async function ensureWebhook(env, force = false) {
  const secret = await webhookSecret(env.TELEGRAM_TOKEN);
  const url = env.PUBLIC_URL + "/tg/webhook";
  const want = `${url}|${secret.slice(0, 16)}|v5`;
  const prev = await db.getMeta(env, "webhook");
  if (!force && prev === want) return { ok: true, cached: true };

  const me = await tg(env, "getMe");
  if (!me.ok) {
    await db.setMeta(env, "last_error", `getMe ${me.error_code || ""} ${me.description || "нет ответа"}`);
    return { ok: false, step: "getMe", error_code: me.error_code, description: me.description };
  }
  const r = await tg(env, "setWebhook", {
    url, secret_token: secret, max_connections: 10,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: !force && !prev,
  });
  if (!r.ok) {
    await db.setMeta(env, "last_error", `setWebhook ${r.error_code || ""} ${r.description || ""}`);
    return { ok: false, step: "setWebhook", error_code: r.error_code, description: r.description };
  }
  await tg(env, "setMyCommands", { commands: [
    { command: "next", description: "Следующая пара и кабинет на карте" },
    { command: "today", description: "Весь сегодняшний день одной картинкой" },
    { command: "deadlines", description: "Дедлайны из Moodle" },
    { command: "menu", description: "Вернуть кнопки меню" },
    { command: "settings", description: "Напоминания, язык, расписание" },
    { command: "start", description: "Вход по баркоду" },
  ] });
  await tg(env, "setMyDescription", { description:
    "Schedule — напоминания о парах AITU.\n\n🔔 Перед парой: предмет, время и кабинет на карте корпуса.\n📚 Дедлайны из Moodle.\n🌐 Расписание целиком — на сайте." });
  await tg(env, "setMyShortDescription", { short_description: "Напоминания о парах с картой кабинета" });
  await db.setMeta(env, "webhook", want);
  await db.setMeta(env, "last_error", "");
  const info = await tg(env, "getWebhookInfo");
  const w = info.result || {};
  return { ok: true, bot: "@" + me.result.username, webhook: w.url,
           pending_updates: w.pending_update_count, last_error: w.last_error_message || null };
}
