import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { readFileSync, readdirSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { createPairCode, handleLms, ingest, applySubmissions, notifyChanges, saveGradeCards, validateGradeCards } from "../worker/lms-extension.js";
import { academicCourses, attendanceLine, gradesMenu, gradePhoto } from "../worker/academic.js";
import { normalizeRecord, safeUrl, changes } from "../extension/lib/model.mjs";
import { completed } from "../worker/moodle.js";
import * as M from "../worker/msgs.js";

const parserContext = {};
runInNewContext(readFileSync(new URL("../extension/parser.js", import.meta.url), "utf8"), { globalThis: parserContext, URL });
const P = parserContext.UnitifyParser;
const doc = html => parseHTML(`<html><body>${html}</body></html>`).document;
const course = { id: "42", name: "Different Course | Different Teacher" };
const assignment = { kind: "assignment", id: "assignment:123", courseId: "42", course: course.name, title: "Task X", url: "https://lms.astanait.edu.kz/mod/assign/view.php?id=123", status: "not_submitted", due: 2000000000000 };
const grade = { kind: "grade", id: "grade:12", courseId: "42", course: course.name, title: "Lab X", url: "https://lms.astanait.edu.kz/grade/report/user/index.php?id=42", value: "80", range: "0–100", feedback: "" };
const attendance = { kind: "attendance", id: "attendance:456:abc", courseId: "42", course: course.name, title: "Session", url: "https://lms.astanait.edu.kz/mod/attendance/view.php?id=456", dateText: "Mon 19 Oct 2026 12PM - 2PM", status: "Present", points: "2 / 2" };
function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  const migrations = new URL("../migrations/", import.meta.url);
  for (const name of readdirSync(migrations).filter(f => f.endsWith(".sql")).sort()) sqlite.exec(readFileSync(new URL(name, migrations), "utf8"));
  sqlite.exec("INSERT INTO users(chat_id,status,person,created_at) VALUES (101,'admin','nurali',0),(202,'approved','nurbek',0),(303,'approved','other',0)");
  const DB = {
    prepare(sql) { let values = []; return {
      bind(...args) { values = args; return this; },
      async first() { return sqlite.prepare(sql).get(...values) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...values) }; },
      async run() { return { meta: sqlite.prepare(sql).run(...values) }; },
    }; },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try { const out = []; for (const s of statements) out.push(await s.run()); sqlite.exec("COMMIT"); return out; }
      catch (e) { sqlite.exec("ROLLBACK"); throw e; }
    },
  };
  const env = { DB, BOT_ALLOWED_CHAT_IDS: "101,202" };
  const request = (path, body, token, origin) => handleLms(new Request("https://s.zhengisbay.com/api/lms/" + path, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}), ...(origin ? { origin } : {}) }, body: JSON.stringify(body) }), env);
  async function pair(id = 101) { const code = await createPairCode(env, id); const response = await request("pair", { code }); assert.equal(response.status, 200); return (await response.json()).token; }
  const device = () => env.DB.prepare("SELECT * FROM lms_devices WHERE chat_id=101").first();
  const payload = records => ({ version: 1, account: "999", groups: [
    { scope: "42:assignment", records: records.filter(r => r.kind === "assignment") },
    { scope: "42:grade", records: records.filter(r => r.kind === "grade") },
    { scope: "42:attendance:456", records: records.filter(r => r.kind === "attendance") },
  ] });
  return { env, sqlite, request, pair, device, payload };
}
test("generic course discovery deduplicates and never trusts another host", () => {
  const d = doc(`<div class="logininfo"><a href="/user/profile.php?id=888">Me</a></div><div class="block_course_list"><a href="/course/view.php?id=42">Physics</a><a href="/course/view.php?id=42">Physics | New Teacher</a><a href="https://evil.test/course/view.php?id=43">Bad</a><a href="/course/view.php?id=43">Химия</a></div><a href="/course/view.php?id=666">Not enrolled</a>`);
  assert.equal(P.identity(d), "888");
  assert.deepEqual(Array.from(P.courses(d), r => r.name), ["Physics | New Teacher", "Химия"]);
  assert.equal(P.identity(doc('<a href="/user/profile.php?id=555">Other student</a>')), null);
});
test("assignment discovery is structural and strips hidden activity labels", () => {
  const d = doc(`<li class="activity"><a href="/mod/assign/view.php?id=123&amp;action=editsubmission">New Subject <span class="accesshide">Assignment</span></a><div data-region="activity-dates"><div class="date-item">Due: Monday, 19 October 2026, 8:00 PM</div></div></li>`);
  const found = P.activities(d).assignments[0];
  assert.equal(found.title, "New Subject"); assert.equal(found.url, assignment.url);
  assert.equal(P.date(found.dueText), Date.UTC(2026, 9, 19, 15));
});
test("dates are explicitly Astana time, not the browser's timezone", () => {
  assert.equal(P.date("Monday, 19 October 2026, 12:00 AM"), Date.UTC(2026, 9, 18, 19));
  assert.equal(P.date("19 октября 2026, 20:00"), Date.UTC(2026, 9, 19, 15));
  assert.equal(P.date("19.10.2026, 20:00"), Date.UTC(2026, 9, 19, 15));
  assert.equal(P.date("Mon 19 Oct 2026 12PM - 2PM"), Date.UTC(2026, 9, 19, 7));
  assert.equal(P.date("30 February 2026, 12:00 PM"), null);
  assert.equal(P.date("Unknown date"), null);
});
test("submission states use Moodle classes and work with renamed/localized titles", () => {
  for (const [cls, expected] of [["submitted", "submitted"], ["draft", "draft"], ["new", "not_submitted"]]) {
    const d = doc(`<main id="region-main"><table class="generaltable"><tr><th>Состояние ответа</th><td class="submissionstatus${cls}">Different UI text</td></tr></table></main>`);
    const record = P.assignment(d, course, { id: "123", title: "Любой предмет", url: assignment.url });
    assert.equal(record.status, expected);
  }
  assert.throws(() => P.assignment(doc("<h1>Login</h1>"), course, {}), /unavailable/);
});
test("grade parsing keeps zero, old calculated totals and real item IDs", () => {
  const d = doc(`<table class="user-grade"><tr><th class="column-grade">Grade</th></tr><tr><th class="column-itemname" id="row_777_999"><span class="accesshide">Calculated grade</span>Unusual Course Total</th><td class="column-grade">0.00</td><td class="column-range">0–100</td><td class="column-feedback">Checked</td></tr></table>`);
  const [g] = P.grades(d, course); assert.equal(g.id, "grade:777"); assert.equal(g.value, "0.00");
  assert.equal(g.title, "Unusual Course Total"); assert.equal(g.feedback, "Checked");
  assert.throws(() => P.grades(doc("<table></table>"), course), /unavailable/);
});
test("grade parser separates activity-type descriptions and grade-analysis UI from real values", () => {
  const d = doc(`<table class="user-grade"><tr><th class="column-itemname" id="row_91_999"><img class="icon" alt="Assignment"><span class="gradeitemdescription">Assignment</span><a href="/mod/assign/view.php?id=123">Assignment 1</a></th><td class="column-grade">100.00 <a class="gradeanalysislink">Grade analysis</a></td></tr><tr><th class="column-itemname" id="row_92_999"><img alt="Attendance"><span class="gradeitemdescription">Attendance</span>Attendance</th><td class="column-grade">82.35</td></tr></table>`);
  const [a, b] = P.grades(d, course);
  assert.equal(a.title, "Assignment 1"); assert.equal(a.value, "100.00"); assert.equal(a.activityType, "assignment");
  assert.equal(b.title, "Attendance"); assert.equal(b.activityType, "attendance");
});
test("attendance keys survive reorder and distinguish same-day sessions", () => {
  const row = (date, status) => `<tr><td class="datecol">${date}</td><td class="desccol">Lab</td><td class="statuscol">${status}</td><td class="pointscol">2 / 2</td></tr>`;
  const table = rows => doc(`<table><tr><th class="datecol">Date</th><th class="statuscol">Status</th></tr>${rows}</table>`);
  const a = row("Mon 19 Oct 2026 12PM - 2PM", "Present"), b = row("Mon 19 Oct 2026 3PM - 5PM", "Absent");
  const one = P.attendance(table(a + b), course, { id: "456", url: attendance.url });
  const two = P.attendance(table(b + a), course, { id: "456", url: attendance.url });
  assert.equal(one[0].id, two[1].id); assert.notEqual(one[0].id, one[1].id);
  const translated = P.attendance(table(row("19 октября 2026 12:00 - 14:00", "Присутствовал")), course, { id: "456", url: attendance.url });
  assert.equal(one[0].id, translated[0].id);
});
test("wire format removes unknown fields and session query parameters", () => {
  const item = normalizeRecord({ ...assignment, cookie: "not-a-real-cookie", password: "discard", url: assignment.url + "&sesskey=discard" });
  assert.equal(item.cookie, undefined); assert.equal(item.password, undefined); assert.equal(item.url, assignment.url);
  assert.equal(safeUrl("https://evil.test/?id=123"), "");
  assert.equal(safeUrl("https://lms.astanait.edu.kz/mod/assign/submission.php?id=123"), "");
  assert.equal(changes(grade, { ...grade, value: "90" }), "changed");
});
test("pairing is single-use, expiring, private and stores only a token hash", async () => {
  const f = fixture();
  try {
    await assert.rejects(createPairCode(f.env, 303), /Access denied/);
    const code = await createPairCode(f.env, 101);
    const response = await f.request("pair", { code }); assert.equal(response.status, 200);
    const { token } = await response.json(); assert.match(token, /^[a-f0-9]{64}$/);
    assert.notEqual((await f.device()).token_hash, token);
    assert.equal((await f.request("pair", { code })).status, 403);
    const expired = await createPairCode(f.env, 101); f.sqlite.exec("UPDATE lms_pair_codes SET expires=1");
    assert.equal((await f.request("pair", { code: expired })).status, 403);
  } finally { f.sqlite.close(); }
});
test("API blocks web origins, missing tokens, revoked users and rate-limit excess", async () => {
  const f = fixture();
  try {
    assert.equal((await f.request("sync", {})).status, 401);
    assert.equal((await f.request("pair", {}, null, "https://evil.test")).status, 403);
    const token = await f.pair(); f.sqlite.exec("UPDATE users SET status='banned' WHERE chat_id=101");
    assert.equal((await f.request("sync", {}, token)).status, 401);
    f.env.RL = { async limit() { return { success: false }; } };
    assert.equal((await f.request("pair", {})).status, 429);
  } finally { f.sqlite.close(); }
});
test("first scan is silent; later new/changed grades and attendance have an outbox", async () => {
  const f = fixture();
  try {
    await f.pair(); const d = await f.device();
    await ingest(f.env, d, f.payload([grade, assignment, attendance]));
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM lms_events").get().n, 0);
    await ingest(f.env, await f.device(), f.payload([{ ...grade, value: "90" }, { ...assignment, status: "submitted" }, { ...attendance, status: "Absent" }]));
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM lms_events").get().n, 3);
    await ingest(f.env, await f.device(), f.payload([{ ...grade, value: "90" }, { ...assignment, status: "submitted" }, { ...attendance, status: "Absent" }]));
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM lms_events").get().n, 3);
    await ingest(f.env, await f.device(), f.payload([{ ...grade, id: "grade:13", value: "70" }]));
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM lms_events").get().n, 4);
  } finally { f.sqlite.close(); }
});
test("partial scans never erase records; unknown statuses do not reset submitted", async () => {
  const f = fixture();
  try {
    await f.pair(); await ingest(f.env, await f.device(), f.payload([{ ...assignment, status: "submitted" }, grade]));
    await ingest(f.env, await f.device(), f.payload([{ ...assignment, status: "unknown" }]));
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM lms_records").get().n, 2);
    assert.equal(JSON.parse(f.sqlite.prepare("SELECT data FROM lms_records WHERE id='assignment:123'").get().data).status, "submitted");
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM lms_events").get().n, 0);
  } finally { f.sqlite.close(); }
});
test("identity switch and scope spoofing cannot mix student records", async () => {
  const f = fixture();
  try {
    await f.pair(); await ingest(f.env, await f.device(), f.payload([grade]));
    await assert.rejects(ingest(f.env, await f.device(), { ...f.payload([grade]), account: "111" }), /Сменился/);
    await f.pair(); assert.equal((await f.device()).account, "999");
    const payload = f.payload([{ ...grade, courseId: "43" }]);
    await assert.rejects(ingest(f.env, await f.device(), payload), /разделу|запись/);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM lms_records").get().n, 1);
  } finally { f.sqlite.close(); }
});
test("matching assignment ID suppresses ICS reminders without erasing manual completion", async () => {
  const f = fixture();
  try {
    await f.pair(); f.sqlite.prepare("INSERT INTO deadlines(chat_id,uid,due,descr,done_at) VALUES (101,'ical',2000000000000,?,55)").run(assignment.url);
    await ingest(f.env, await f.device(), f.payload([{ ...assignment, status: "submitted" }]));
    let d = f.sqlite.prepare("SELECT * FROM deadlines").get(); assert.equal(completed(d), true); assert.equal(d.done_at, 55);
    f.sqlite.exec("UPDATE deadlines SET done_at=NULL");
    await ingest(f.env, await f.device(), f.payload([{ ...assignment, status: "draft" }]));
    d = f.sqlite.prepare("SELECT * FROM deadlines").get(); assert.equal(completed(d), false);
    f.sqlite.prepare("INSERT INTO deadlines(chat_id,uid,due,descr) VALUES (101,'new-ical',2000000000000,?)").run(assignment.url);
    await applySubmissions(f.env, 101); assert.equal(f.sqlite.prepare("SELECT submission_state FROM deadlines WHERE uid='new-ical'").get().submission_state, "draft");
  } finally { f.sqlite.close(); }
});
test("notification failure retains outbox, success acknowledges only delivered records", async () => {
  const f = fixture(), original = globalThis.fetch;
  try {
    await f.pair(); await ingest(f.env, await f.device(), f.payload([grade]));
    await ingest(f.env, await f.device(), f.payload([{ ...grade, value: "90" }]));
    f.env.TELEGRAM_TOKEN = "test"; f.env.TG_API = "https://example.invalid";
    globalThis.fetch = async () => Response.json({ ok: false, error_code: 429, description: "test" });
    await notifyChanges(f.env, { chat_id: 101 }); assert.equal(f.sqlite.prepare("SELECT notified FROM lms_events").get().notified, 0);
    globalThis.fetch = async () => Response.json({ ok: true, result: { message_id: 999 } });
    await notifyChanges(f.env, { chat_id: 101 }); assert.equal(f.sqlite.prepare("SELECT notified FROM lms_events").get().notified, 1);
    assert.equal(f.sqlite.prepare("SELECT kind FROM msgs").get().kind, "lms");
  } finally { globalThis.fetch = original; f.sqlite.close(); }
});
test("revoking and pairing again cannot silently merge a second student's history", async () => {
  const f = fixture();
  try {
    const token = await f.pair(); await ingest(f.env, await f.device(), f.payload([grade]));
    assert.equal((await f.request("revoke", {}, token)).status, 200);
    await f.pair();
    await assert.rejects(ingest(f.env, await f.device(), { ...f.payload([grade]), account: "12345" }), /изначально/);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM lms_records").get().n, 1);
  } finally { f.sqlite.close(); }
});
test("bulk JSON queries handle a large baseline without one SQL write per grade", async () => {
  const f = fixture();
  try {
    await f.pair(); let queries = 0;
    const prepare = f.env.DB.prepare;
    f.env.DB.prepare = sql => { queries++; return prepare(sql); };
    const many = Array.from({ length: 1000 }, (_, i) => ({ ...grade, id: `grade:${i + 1}`, title: `Item ${i}` }));
    await ingest(f.env, await f.device(), f.payload(many));
    assert.ok(queries < 30, `SQL statements: ${queries}`);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM lms_records").get().n, 1000);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM lms_events").get().n, 0);
  } finally { f.sqlite.close(); }
});
test("manifest is narrowly scoped, with no cookie permission, injection or write URL", () => {
  const manifest = JSON.parse(readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.permissions, ["storage", "alarms"]);
  assert.equal(manifest.host_permissions.length, 2);
  assert.equal(manifest.action.default_popup, "popup.html");
  const content = readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
  assert.ok(!content.includes("document.cookie" + "("));
  assert.ok(content.includes('method: "GET"'));
});

test("grade selection and private photo work from the database without a Moodle request", async () => {
  const f = fixture(), original = globalThis.fetch, calls = [];
  try {
    await f.pair(); await ingest(f.env, await f.device(), f.payload([grade, attendance]));
    const cards = [{ courseId: "42", page: 0, pages: 1, signature: "a".repeat(64), format: 3, group: "", image: "/9j/AA==" }];
    validateGradeCards(cards); await saveGradeCards(f.env, 101, cards);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM lms_grade_cards WHERE chat_id=202").get().n, 0);
    f.env.TELEGRAM_TOKEN = "test"; f.env.TG_API = "https://example.invalid";
    globalThis.fetch = async (url, options) => {
      assert.ok(!String(url).includes("astanait"));
      calls.push(options.body instanceof FormData ? options.body : JSON.parse(options.body));
      return Response.json({ ok: true, result: { message_id: calls.length + 100 } });
    };
    await gradesMenu(f.env, 101, "ru");
    assert.equal(calls[0].reply_markup.inline_keyboard[0][0].callback_data, "lg:42:0");
    await gradePhoto(f.env, 101, "42");
    assert.ok(calls[1] instanceof FormData); assert.ok(calls[1].get("photo").size > 0);
    f.sqlite.exec("UPDATE lms_grade_cards SET format=1");
    await gradePhoto(f.env, 101, "42");
    assert.match(calls.filter(c => typeof c.text === "string").at(-1).text, /Assignments &amp; practice|Assignments & practice/);
    const [c] = await academicCourses(f.env, 101); assert.match(attendanceLine(c), /100%/);
    assert.deepEqual(await academicCourses(f.env, 202), []);
  } finally { globalThis.fetch = original; f.sqlite.close(); }
});

test("switching screens removes old grade menus and retains class/deadline notifications", async () => {
  const f = fixture(), original = globalThis.fetch, deleted = []; let next = 100;
  f.env.TELEGRAM_TOKEN = "test"; f.env.TG_API = "https://example.invalid";
  try {
    f.sqlite.exec("INSERT INTO msgs(chat_id,message_id,kind,at) VALUES (101,1,'academic',1),(101,2,'class',2),(101,3,'deadline',3)");
    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      if (String(url).endsWith("/deleteMessage")) { deleted.push(body.message_id); return Response.json({ ok: true, result: true }); }
      return Response.json({ ok: true, result: { message_id: ++next } });
    };
    await M.post(f.env, 101, { kind: "info", text: "Deadlines" });
    assert.ok(deleted.includes(1));
    assert.equal(f.sqlite.prepare("SELECT count(*) n FROM msgs WHERE chat_id=101 AND kind='class'").get().n, 1);
    assert.equal(f.sqlite.prepare("SELECT count(*) n FROM msgs WHERE chat_id=101 AND kind='deadline'").get().n, 1);
    await M.post(f.env, 101, { kind: "academic", text: "Attendance" });
    assert.equal(f.sqlite.prepare("SELECT count(*) n FROM msgs WHERE chat_id=101 AND kind='screen'").get().n, 1);
  } finally { globalThis.fetch = original; f.sqlite.close(); }
});

test("a successful unchanged attendance read updates evidence without changing the mark", async () => {
  const f = fixture();
  try {
    await f.pair(); const p = f.payload([attendance]);
    p.groups.find(g => g.scope.includes('attendance')).checkedAt = Date.now() - 60000;
    await ingest(f.env, await f.device(), p);
    const a = f.sqlite.prepare("SELECT checked_at FROM lms_scope_reads WHERE chat_id=101 AND scope='42:attendance:456'").get().checked_at;
    p.groups.find(g => g.scope.includes('attendance')).checkedAt = a + 1000;
    await ingest(f.env, await f.device(), p);
    const b = f.sqlite.prepare("SELECT checked_at FROM lms_scope_reads WHERE chat_id=101 AND scope='42:attendance:456'").get().checked_at;
    assert.equal(b, a + 1000);
    assert.equal(f.sqlite.prepare("SELECT count(*) n FROM lms_events").get().n, 0);
  } finally { f.sqlite.close(); }
});
