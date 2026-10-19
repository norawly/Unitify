import test from "node:test";
import assert from "node:assert/strict";
import { makePlan, assignmentNeeded, policyOf, nextAllowed } from "../extension/lib/sync-policy.mjs";
import { syncContext } from "../worker/lms-policy.js";

const at = time => Date.parse(`2026-10-19T${time}:00+05:00`);
const state = {
  catalogs: { "999": { courses: [{ id: "42", name: "Computer Networks Security | Teacher" }, { id: "43", name: "Other course" }] } },
  syncContext: { timetable: { study: ["2026-09-07", "2026-11-14"], days: { mon: [{ start: 720, end: 840, names: ["Computer Networks Security"] }] } } },
  accounts: { "999": { attendanceDay: "2026-10-19" } },
};
test("night scans retain homework but disable grades and attendance, including initial baseline", () => {
  for (const time of ["00:15", "08:59", "23:00", "23:59"]) {
    const plan = makePlan(state, "999", at(time));
    assert.equal(plan.grades, false); assert.equal(plan.attendance, false);
    assert.equal(plan.dailyAttendance, false);
  }
  assert.equal(makePlan(state, "999", at("09:00")).grades, true);
});
test("daytime attendance has one daily baseline then checks only relevant class windows", () => {
  const first = makePlan({ ...state, accounts: {} }, "999", at("09:00"));
  assert.deepEqual(first.attendanceCourses, ["42", "43"]);
  assert.deepEqual(makePlan(state, "999", at("12:30")).attendanceCourses, ["42"]);
  assert.equal(makePlan(state, "999", at("10:00")).attendance, false);
  assert.equal(makePlan(state, "999", at("16:00")).attendance, false);
  assert.deepEqual(makePlan(state, "999", at("15:30")).attendanceCourses, ["42"]);
  const vacation = structuredClone(state); vacation.syncContext.timetable.study[1] = "2026-10-18";
  assert.equal(makePlan(vacation, "999", at("12:30")).attendance, false);
});
test("completed/old homework is skipped between daily audits; unknown and active work stays", () => {
  const now = at("12:00");
  const records = { "assignment:1": { status: "submitted" }, "assignment:2": { status: "draft", due: now + 1000 }, "assignment:3": { status: "not_submitted", due: now - 8 * 86400000 } };
  assert.equal(assignmentNeeded({ id: "1" }, records, now), false);
  assert.equal(assignmentNeeded({ id: "2" }, records, now), true);
  assert.equal(assignmentNeeded({ id: "3" }, records, now), false);
  assert.equal(assignmentNeeded({ id: "4" }, records, now), true);
  const saved = structuredClone(state); saved.accounts["999"].assignmentAuditAt = now;
  assert.equal(makePlan(saved, "999", now + 1800000).auditAssignments, false);
  assert.equal(makePlan(saved, "999", now + 86400001).auditAssignments, true);
});
test("remote numeric configuration is bounded and cooldown honors Retry-After", () => {
  const p = policyOf({ policy: { intervalMinutes: 0, discoveryHours: 0, spacingMs: 1 } });
  assert.equal(p.intervalMinutes, 20); assert.equal(p.discoveryHours, 6); assert.equal(p.spacingMs, 750);
  assert.equal(nextAllowed({ lastStart: at("12:00"), backoffUntil: at("14:00") }), at("14:00"));
});
test("server returns the linked person's schedule and real English subject aliases, not another student's", async () => {
  let requested;
  const env = { DB: { prepare() { return { bind(id) { assert.equal(id, 123); return this; }, async first() { return { person: "fixture" }; } }; } },
    ASSETS: { async fetch(req) { requested = req.url; return Response.json({ term: { study: ["2026-09-07", "2026-11-14"] }, days: { mon: [{ start: "12:00", end: "12:50", subject: "Безопасность компьютерных сетей", type: "lecture" }] } }); } } };
  const context = await syncContext(env, 123);
  assert.match(requested, /\/fixture\/schedule.json$/);
  assert.equal(context.policy.intervalMinutes, 30);
  assert.deepEqual(context.timetable.days.mon[0].names, ["Безопасность компьютерных сетей", "Computer Networks Security"]);
  assert.ok(!JSON.stringify(context).includes("token"));
});
