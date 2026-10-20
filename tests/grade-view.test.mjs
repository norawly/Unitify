import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as V from "../extension/lib/grade-view.mjs";
import { changes } from "../extension/lib/model.mjs";
const row = (id, title, value = "-", extra = {}) => ({ id: "grade:" + id, courseId: "42", title, value, range: "0–100", weight: "-", ...extra });

test("legacy icon descriptions and grade-analysis links are not assessment names or scores", () => {
  for (const [raw, expected] of [["AssignmentAssignment 1", "Assignment 1"], ["AttendanceAttendance", "Attendance"], ["Calculated gradeRegister Midterm", "Register Midterm"], ["AssignmentPractice 1 - CNS", "Practice 1 - CNS"], ["QuizFinal Test", "Final Test"]]) assert.equal(V.gradeTitle(raw), expected);
  assert.equal(V.gradeValue("100.00 Grade analysis"), "100.00");
  assert.equal(V.gradeValue("-Grade analysis"), "-");
  assert.equal(changes({ kind: "grade", value: "100.00 Grade analysis", feedback: "" }, { kind: "grade", value: "100.00", feedback: "" }), null);
  assert.equal(V.gradeValue("0.00"), "0.00");
});
test("registers, exam checkpoints, attendance and numbered homework are separate", () => {
  const view = V.gradeView([row(1, "AssignmentAssignment 10"), row(2, "Calculated gradeRegister Midterm", "94.55"), row(3, "AttendanceAttendance", "82.35"), row(4, "AssignmentAssignment 2"), row(5, "AssignmentROS"), row(6, "AssignmentMidterm 5_10,11", "90"), row(7, "AssignmentFinal Exam FX"), row(8, "Calculated gradeCourse total", "0.00"), row(9, "QuizMidExam", "86.67")]);
  assert.equal(view.sections.registry.length, 2); assert.equal(view.sections.attendance.length, 1);
  assert.equal(view.sections.exams.length, 3);
  assert.deepEqual(view.sections.assignments.map(r => r.title), ["Assignment 2", "Assignment 10", "ROS"]);
  assert.equal(view.sections.registry.at(-1).title, "Course total");
});
test("group filtering hides only explicitly foreign, empty homework and preserves actual marks", () => {
  const records = [row(1, "Practice 1 - CNS"), row(2, "Practice 1 (CS-2410)"), row(3, "Week 5 CS 24-11"), row(4, "Week 5 CS-2410 / 2411"), row(5, "Week 5 CS-2410", "0.00"), row(6, "Week 5 CS-2410", "—"), row(7, "Week 5 CS-2410, 11")];
  const view = V.gradeView(records, "CS-2411");
  assert.equal(view.hidden, 2); assert.equal(view.records.length, 5);
  assert.ok(view.records.some(r => r.value === "0.00"));
  assert.equal(V.gradeView(records, "").hidden, 0);
  assert.equal(V.gradeView(records, "SE-2411").hidden, 4);
});
test("pagination retains every grade ID and labels continued sections", () => {
  const records = Array.from({ length: 80 }, (_, i) => row(i + 1, `Assignment ${i + 1}`));
  const pages = V.gradePages(V.gradeView(records));
  assert.equal(pages.flat().flatMap(s => s.records).length, 80);
  assert.equal(new Set(pages.flat().flatMap(s => s.records.map(r => r.id))).size, 80);
  assert.ok(pages.at(-1)[0].continued);
});
test("private canvas cards use the grouped view and their cache key includes layout and group", async () => {
  const drawings = []; const source = readFileSync(new URL("../extension/grade-card.js", import.meta.url), "utf8");
  class Canvas {
    constructor(w, h) { this.width = w; this.height = h; }
    getContext() { return { measureText(text) { return { width: text.length * 10 }; }, fillRect() {}, beginPath() {}, roundRect() {}, fill() {}, stroke() {}, fillText: (text, x, y) => { assert.ok(y <= this.height); drawings.push(text); } }; }
    async convertToBlob() { return new Blob([Uint8Array.of(255, 216, 255)]); }
  }
  const context = { UnitifyGradeView: V, OffscreenCanvas: Canvas, crypto, TextEncoder, Uint8Array, btoa };
  runInNewContext(source, context);
  const records = [row(1, "Calculated gradeRegister Midterm", "95.00"), row(2, "AttendanceAttendance", "82.35"), row(3, "AssignmentFinal Exam"), row(4, "AssignmentAssignment 1", "100.00 Grade analysis"), row(5, "AssignmentPractice CS-2410")];
  const [card] = await context.UnitifyGradeCards.render({ id: "42", name: "Synthetic course" }, records, null, "CS-2411");
  assert.equal(card.format, 3); assert.equal(card.group, "CS-2411");
  assert.ok(drawings.includes("Page 1/1"));
  assert.ok(drawings.includes("REGISTER / TOTALS")); assert.ok(drawings.includes("EXAMS & CHECKPOINTS"));
  assert.ok(drawings.includes("82.35%")); assert.ok(drawings.includes("Assignment 1"));
  assert.ok(!drawings.some(s => /Grade analysis|AssignmentAssignment|Practice CS-2410/.test(s)));
  assert.equal((await context.UnitifyGradeCards.render({ id: "42", name: "Synthetic course" }, records, card.signature, "CS-2411")).length, 0);
  assert.equal((await context.UnitifyGradeCards.render({ id: "42", name: "Synthetic course" }, records, card.signature, "CS-2410")).length, 1);
});
