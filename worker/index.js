/* Воркер Schedule: сайт отдаётся статикой, /tg/webhook — Telegram-бот,
   Ticker (Durable Object) раз в минуту рассылает напоминания. */
import { handleUpdate } from "./bot.js";
import { runCron, ensureWebhook } from "./cron.js";
import { tg, webhookSecret } from "./tg.js";
import * as db from "./db.js";

export { Ticker } from "./ticker.js";

const json = (body, status = 200) => new Response(JSON.stringify(body, null, 2),
  { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

async function limited(env, key) {
  if (!env.RL) return false;
  const { success } = await env.RL.limit({ key });
  return !success;
}

/* завести будильник (идемпотентно) */
async function kickTicker(env) {
  if (!env.TICKER) return null;
  const stub = env.TICKER.get(env.TICKER.idFromName("main"));
  return (await stub.fetch("https://ticker/kick")).json();
}
/* если будильник давно не срабатывал — завести заново */
async function tickAge(env) {
  const last = await db.getMeta(env, "tick_last");
  const at = last ? Date.parse(last.split(" ")[0]) : 0;
  return at ? Date.now() - at : Infinity;
}
/* будильник молчит дольше восьми минут (метка пишется раз в пять) — заводим заново */
async function healTicker(env) {
  if (await tickAge(env) > 8 * 60000) await kickTicker(env);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    /* подключить webhook и будильник прямо сейчас; ответ Telegram — без токена */
    if (url.pathname === "/tg/setup") {
      if (!env.TELEGRAM_TOKEN) return json({ ok: false, error: "TELEGRAM_TOKEN не задан" }, 503);
      if (await limited(env, "setup")) return json({ ok: false, error: "слишком часто, подожди минуту" }, 429);
      const result = await ensureWebhook(env, true);
      result.ticker = await kickTicker(env);
      return json(result);
    }

    /* состояние бота — только чтение (будильник при необходимости заводится) */
    if (url.pathname === "/tg/status") {
      if (!env.TELEGRAM_TOKEN) return json({ ok: false, error: "TELEGRAM_TOKEN не задан" }, 503);
      if (await limited(env, "status")) return json({ ok: false, error: "слишком часто, подожди минуту" }, 429);
      const info = await tg(env, "getWebhookInfo");
      const w = info.result || {};
      const rows = (await env.DB.prepare("SELECT status, COUNT(*) AS n FROM users GROUP BY status").all()).results;
      return json({
        ok: !!info.ok,
        webhook: w.url || null,
        pending_updates: w.pending_update_count,
        last_error: w.last_error_message || null,
        last_error_at: w.last_error_date ? new Date(w.last_error_date * 1000).toISOString() : null,
        users: Object.fromEntries(rows.map(r => [r.status, r.n])),
        last_tick: await db.getMeta(env, "tick_last"),
        ticker: await kickTicker(env),
      });
    }

    if (url.pathname === "/tg/webhook") {
      if (request.method !== "POST") return new Response("ok");
      if (!env.TELEGRAM_TOKEN) return new Response("bot token is not set", { status: 503 });
      const secret = await webhookSecret(env.TELEGRAM_TOKEN);
      if (request.headers.get("x-telegram-bot-api-secret-token") !== secret)
        return new Response("forbidden", { status: 403 });

      const update = await request.json().catch(() => null);
      if (update) ctx.waitUntil(Promise.all([
        handleUpdate(env, update).catch(e => console.log("update failed", e && e.stack || e)),
        healTicker(env).catch(e => console.log("ticker heal failed", e && e.stack || e)),
      ]));
      return new Response("ok");                 // Telegram ждёт быстрый ответ
    }

    return env.ASSETS.fetch(request);
  },

  /* Cron — только страховка: всю работу делает будильник Durable Object раз в минуту.
     Делать то же самое дважды значит впустую тратить запросы к базе. */
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      await kickTicker(env).catch(() => {});
      if (await tickAge(env) > 8 * 60000)
        await runCron(env, "cron").catch(e => console.log("cron failed", e && e.stack || e));
    })());
  },
};
