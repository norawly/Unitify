import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { privateChatIds, isPrivateUpdate, retireOtherUsers } from "../worker/access.js";
import { handleUpdate } from "../worker/bot.js";
import { activeUsers, calendarUsers } from "../worker/db.js";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  const migrations = new URL("../migrations/", import.meta.url);
  for (const file of readdirSync(migrations).filter(s => s.endsWith(".sql")).sort())
    sqlite.exec(readFileSync(new URL(file, migrations), "utf8"));
  for (const [id, person] of [[101, "nurali"], [202, "nurbek"], [303, "240614"], [404, "240854"], [505, "676767"]]) {
    sqlite.prepare("INSERT INTO users (chat_id, person, status, created_at, cal_url) VALUES (?, ?, 'approved', 0, 'test-calendar')").run(id, person);
    sqlite.prepare("INSERT INTO deadlines (chat_id, uid, due) VALUES (?, 'test', 1)").run(id);
    sqlite.prepare("INSERT INTO msgs (chat_id, message_id, kind, at) VALUES (?, 1, 'info', 1)").run(id);
    sqlite.prepare("INSERT INTO sent (chat_id, key, at) VALUES (?, 'test', 1)").run(id);
    sqlite.prepare("INSERT INTO guests (chat_id) VALUES (?)").run(id);
  }
  sqlite.exec("INSERT INTO owners VALUES ('nurali', 101, 0), ('nurbek', 202, 0); INSERT INTO guests (chat_id) VALUES (909); INSERT INTO sent VALUES (0, 'system', 1)");
  const DB = {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() { return sqlite.prepare(sql).get(...values) || null; },
        async all() { return { results: sqlite.prepare(sql).all(...values) }; },
        async run() { return { meta: sqlite.prepare(sql).run(...values) }; },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  return { env: { DB, BOT_ALLOWED_CHAT_IDS: "101,202", TELEGRAM_TOKEN: "test", TG_API: "https://example.invalid" }, sqlite };
}

const update = id => ({ message: { chat: { id, type: "private" }, from: { id, is_bot: false }, text: "/start" } });

test("only the two configured private accounts pass; invalid settings deny access", () => {
  const env = { BOT_ALLOWED_CHAT_IDS: "101,202" };
  assert.equal(isPrivateUpdate(env, update(101)), true);
  assert.equal(isPrivateUpdate(env, update(202)), true);
  assert.equal(isPrivateUpdate(env, update(303)), false);
  for (const value of [undefined, "101", "101,101", "101,202,303", "x,202"])
    assert.deepEqual(privateChatIds({ BOT_ALLOWED_CHAT_IDS: value }), []);
  const spoofed = update(101);
  spoofed.message.from.id = 303;
  assert.equal(isPrivateUpdate(env, spoofed), false);
});

test("excluded users cannot consume DB, rate limiter or Telegram calls", async () => {
  const env = { BOT_ALLOWED_CHAT_IDS: "101,202",
    get DB() { throw new Error("unexpected DB access"); },
    get RL() { throw new Error("unexpected rate limiter access"); },
  };
  await handleUpdate(env, update(303));
  await handleUpdate(env, { callback_query: { id: "test", data: "s:cal", from: { id: 303 }, message: update(303).message } });
});

test("scheduled jobs only select the two owners even before account cleanup", async () => {
  const { env, sqlite } = fixture();
  try {
    assert.deepEqual((await activeUsers(env)).map(u => u.chat_id), [101, 202]);
    assert.deepEqual((await calendarUsers(env)).map(u => u.chat_id), [101, 202]);
  } finally { sqlite.close(); }
});

test("cleanup refuses to delete anything when configured IDs differ from confirmed owners", async () => {
  const { env, sqlite } = fixture();
  env.BOT_ALLOWED_CHAT_IDS = "101,303";
  try {
    await assert.rejects(retireOtherUsers(env), /do not match/);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM users").get().n, 5);
  } finally { sqlite.close(); }
});

test("retirement notifies three accounts once and removes their data while preserving owners", async () => {
  const { env, sqlite } = fixture();
  const oldFetch = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ method: String(url).split("/").pop(), body: JSON.parse(options.body) });
    return Response.json({ ok: true, result: true });
  };
  try {
    await retireOtherUsers(env);
    const messages = calls.filter(c => c.method === "sendMessage");
    assert.deepEqual(messages.map(c => c.body.chat_id), [303, 404, 505]);
    assert.ok(messages.every(c => c.body.reply_markup.remove_keyboard));
    for (const table of ["users", "deadlines", "msgs", "guests", "owners"])
      assert.deepEqual(sqlite.prepare(`SELECT DISTINCT chat_id FROM ${table} ORDER BY chat_id`).all().map(r => r.chat_id), [101, 202]);
    assert.deepEqual(sqlite.prepare("SELECT DISTINCT chat_id FROM sent ORDER BY chat_id").all().map(r => r.chat_id), [0, 101, 202]);
    assert.equal(sqlite.prepare("SELECT cal_url FROM users WHERE chat_id = 101").get().cal_url, "test-calendar");
    const audit = JSON.parse(sqlite.prepare("SELECT value FROM meta WHERE key = 'private_access_cleanup_v1'").get().value);
    assert.deepEqual(audit, { removed: 3, notified: 3, unreachable: 0, complete: true });
    await retireOtherUsers(env);
    assert.equal(calls.filter(c => c.method === "sendMessage").length, 3);
  } finally { globalThis.fetch = oldFetch; sqlite.close(); }
});

test("a temporary Telegram failure preserves that account until notification can be retried", async () => {
  const { env, sqlite } = fixture();
  const oldFetch = globalThis.fetch;
  let unavailable = true;
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    return Response.json(String(url).endsWith("/sendMessage") && body.chat_id === 303 && unavailable
      ? { ok: false, error_code: 429, description: "test retry" } : { ok: true, result: true });
  };
  try {
    await retireOtherUsers(env);
    assert.deepEqual(sqlite.prepare("SELECT chat_id FROM users ORDER BY chat_id").all().map(r => r.chat_id), [101, 202, 303]);
    unavailable = false;
    await retireOtherUsers(env);
    assert.deepEqual(sqlite.prepare("SELECT chat_id FROM users ORDER BY chat_id").all().map(r => r.chat_id), [101, 202]);
  } finally { globalThis.fetch = oldFetch; sqlite.close(); }
});
