import test from "node:test";
import assert from "node:assert/strict";
import { nextClass } from "../worker/sched.js";
import { visibleDeadline } from "../worker/moodle.js";
import { menuKeyboard, sendClassCard } from "../worker/bot.js";
import { drop } from "../worker/msgs.js";

const schedule = {
  term: {
    study: ["2026-09-07", "2026-11-14"],
    exams: ["2026-11-16", "2026-11-28"],
    vacation: ["2026-11-30", "2026-12-05"],
  },
  days: { mon: [
    { start: "12:00", end: "12:50", subject: "A", type: "lecture" },
    { start: "14:00", end: "14:50", subject: "B", type: "practice" },
  ] },
};

const astana = iso => Date.parse(iso) - 5 * 3600000;

test("Next Class skips a class already in progress", () => {
  const now = { iso: "2026-10-12", min: 12 * 60 + 20 };
  assert.equal(nextClass(schedule, now).g.it.subject, "A");
  assert.equal(nextClass(schedule, now, false).g.it.subject, "B");
  assert.equal(nextClass(schedule, { iso: now.iso, min: 12 * 60 }, false).g.it.subject, "B");
});

test("term cutoff includes 16 November and resumes after 5 December", () => {
  const before = astana("2026-10-14T12:00:00Z");
  assert.equal(visibleDeadline({ due: astana("2026-11-16T12:00:00Z") }, schedule, before), true);
  assert.equal(visibleDeadline({ due: astana("2026-11-17T12:00:00Z") }, schedule, before), false);
  assert.equal(visibleDeadline({ due: astana("2026-12-06T12:00:00Z") }, schedule,
    astana("2026-12-05T20:00:00Z")), false);
  assert.equal(visibleDeadline({ due: astana("2026-12-06T12:00:00Z") }, schedule,
    astana("2026-12-06T00:00:00Z")), true);
});

test("profiles without an exam period do not hide deadlines", () => {
  assert.equal(visibleDeadline({ due: astana("2026-12-06T12:00:00Z") }, {},
    astana("2026-10-14T12:00:00Z")), true);
});

test("reply keyboard has four actions; timetable remains in the separate app button", () => {
  const keyboard = menuKeyboard({ PUBLIC_URL: "https://s.zhengisbay.com" },
    { person: "nurali", lang: "en" });
  assert.equal(keyboard.keyboard.flat().length, 4);
  assert.equal(keyboard.keyboard.flat().some(button => button.web_app), false);
});

test("Next Class card has no Open LMS, Refresh or Whole day inline buttons", async () => {
  const oldFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return Response.json({ ok: true, result: { message_id: 123 } });
  };
  const env = {
    PUBLIC_URL: "https://example.invalid", TELEGRAM_TOKEN: "test", TG_API: "https://example.invalid",
    ASSETS: { fetch: async () => Response.json({ rooms: {} }) },
    DB: { prepare: () => ({ bind: () => ({
      first: async () => null, all: async () => ({ results: [] }), run: async () => ({}),
    }) }) },
  };
  try {
    await sendClassCard(env, 1, { person: "nurali", lang: "en" },
      { it: { subject: "A", type: "practice", online: true }, rs: 720, re: 770 },
      "2026-10-12", { kind: "soon", mins: 20 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].reply_markup, undefined);
  } finally { globalThis.fetch = oldFetch; }
});

test("failed Telegram deletion keeps the message tracked for retry", async () => {
  const oldFetch = globalThis.fetch;
  let forgotten = 0;
  const env = { TELEGRAM_TOKEN: "test", TG_API: "https://example.invalid",
    DB: { prepare: () => ({ bind: () => ({ run: async () => { forgotten++; } }) }) } };
  try {
    globalThis.fetch = async () => Response.json({ ok: false, description: "message can't be deleted" });
    assert.equal(await drop(env, 1, 123), false);
    assert.equal(forgotten, 0);
    globalThis.fetch = async () => Response.json({ ok: true, result: true });
    assert.equal(await drop(env, 1, 123), true);
    assert.equal(forgotten, 1);
  } finally { globalThis.fetch = oldFetch; }
});
