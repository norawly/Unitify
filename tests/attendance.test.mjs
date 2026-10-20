import test from "node:test";
import assert from "node:assert/strict";
import { attendanceTotals, attendanceForecast, classAttendance, sessionStart } from "../worker/attendance.js";
import { dayBlocks } from "../worker/sched.js";
const ms = (day, time = "15:00") => Date.parse(`${day}T${time}:00+05:00`);
const now = (iso, time = "15:00") => ({ iso, min: +time.slice(0, 2) * 60 + +time.slice(3), ms: ms(iso, time) });
let id = 100;
const row = (day, time, status = "Present", points = "2 / 2") => ({ id: `attendance:${++id}:${ms(day, time).toString(36)}`, courseId: "42", course: "Web Security | Teacher", status, points });
const course = records => ({ name: "Web Security", attendance: records });
const S = { term: { study: ["2026-10-05", "2026-11-02"], exams: ["2026-10-26", "2026-11-02"] }, days: {
  mon: [{ start: "12:00", end: "12:50", subject: "Веб-безопасность", type: "lecture" }, { start: "13:05", end: "13:55", subject: "Веб-безопасность", type: "lecture" }],
} };
test("Present, ?, Absent, Present is exactly 4/6, with ? excluded from both totals", () => {
  const records = [row("2026-10-05", "12:00"), row("2026-10-05", "13:05", "?", "0 / 2"), row("2026-10-06", "12:00", "Absent", "0 / 2"), row("2026-10-06", "13:05")];
  const t = attendanceTotals(records, ms("2026-10-12"));
  assert.equal(t.earned, 4); assert.equal(t.possible, 6); assert.equal(t.taken, 3);
  assert.equal(t.percent.toFixed(2), "66.67");
  const future = row("2026-10-19", "12:00");
  assert.equal(attendanceTotals([...records, future, records[0]], ms("2026-10-12")).possible, 6);
});
test("one mark per merged class is inferred; final-exam weeks never add opportunities", () => {
  const records = [row("2026-10-05", "12:00"), row("2026-10-12", "12:00", "Absent", "0 / 2")];
  const f = attendanceForecast(course(records), S, now("2026-10-12"));
  assert.equal(f.cutoff, "2026-10-25"); assert.equal(f.remainingBlocks, 1);
  assert.equal(f.low.remaining, 1); assert.equal(f.high.remaining, 1);
  assert.equal(f.low.maxPercent.toFixed(2), "66.67");
  const holiday = structuredClone(S); holiday.term.holidays = { "2026-10-19": "Holiday" };
  assert.equal(attendanceForecast(course(records), holiday, now("2026-10-12")).high.remaining, 0);
});
test("hourly marks count twice; pre-created future rows do not inflate the current percentage", () => {
  const records = [row("2026-10-05", "12:00"), row("2026-10-05", "13:05", "Absent", "0 / 2"), row("2026-10-12", "12:00"), row("2026-10-12", "13:05")];
  const f = attendanceForecast(course(records), S, now("2026-10-12"));
  assert.equal(f.percent, 75); assert.equal(f.low.remaining, 2); assert.equal(f.high.remaining, 2);
  assert.equal(f.low.maxPercent.toFixed(2), "83.33"); assert.equal(f.low.skipMarks, 0);
  const prefilled = attendanceForecast(course([...records, row("2026-10-19", "12:00", "?", "? / 2"), row("2026-10-19", "13:05", "?", "? / 2"), row("2026-10-26", "12:00")]), S, now("2026-10-12"));
  assert.equal(prefilled.percent, 75); assert.equal(prefilled.low.remaining, 2);
});
test("lecture and practice cadence are inferred independently, with uncertain cadence shown as a range", () => {
  const mixed = structuredClone(S); mixed.days.wed = mixed.days.mon.map(p => ({ ...p, type: "practice" }));
  const records = [row("2026-10-05", "12:00"), row("2026-10-07", "12:00"), row("2026-10-07", "13:05")];
  const f = attendanceForecast(course(records), mixed, now("2026-10-08"));
  assert.equal(f.remainingBlocks, 4); assert.equal(f.low.remaining, 6); assert.equal(f.high.remaining, 6);
  const unknown = attendanceForecast(course([]), S, now("2026-10-12"));
  assert.equal(unknown.low.remaining, 1); assert.equal(unknown.high.remaining, 2); assert.equal(unknown.uncertain, true);
});
test("absence allowance stays strictly above 70%, including the exact-70 boundary", () => {
  const records = [row("2026-10-05", "12:00", "Present", "2.8 / 4")];
  const f = attendanceForecast(course(records), S, now("2026-10-12"));
  assert.equal(f.percent, 70); assert.equal(f.low.skipMarks, 0); assert.equal(f.low.skipBlocks, 0);
  assert.ok(f.low.maxPercent > 70);
  const finished = attendanceForecast(course(records), S, now("2026-10-26"));
  assert.equal(finished.low.remaining, 0); assert.equal(finished.low.skipMarks, 0);
});
test("lesson status distinguishes real marks, waiting data, missing data, and mixed hourly results", () => {
  const g = dayBlocks(S, "2026-10-12")[0];
  const records = [row("2026-10-12", "12:00", "?", "? / 2")];
  const snapshot = { records, reads: [] };
  assert.equal(classAttendance(snapshot, g, "2026-10-12", now("2026-10-12", "12:10")), "Waiting for Moodle");
  assert.equal(classAttendance(snapshot, g, "2026-10-12", now("2026-10-12")), "NA");
  snapshot.reads.push({ scope: "42:attendance:1", checked_at: ms("2026-10-12", "12:30") });
  assert.equal(classAttendance(snapshot, g, "2026-10-12", now("2026-10-12")), "Waiting for Moodle");
  snapshot.records = [row("2026-10-12", "12:00"), row("2026-10-12", "13:05", "Absent", "0 / 2")];
  assert.equal(classAttendance(snapshot, g, "2026-10-12", now("2026-10-12")), "Present / Absent");
  assert.equal(sessionStart(snapshot.records[0]), ms("2026-10-12", "12:00"));
});
