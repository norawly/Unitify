import test from "node:test";
import assert from "node:assert/strict";
import { nextClass } from "../worker/sched.js";
import { visibleDeadline } from "../worker/moodle.js";
import { menuKeyboard } from "../worker/bot.js";

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
