import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { parseHTML } from "linkedom";
import { VERSION, normalizeRecord, changes } from "../extension/lib/model.mjs";

const source = name => readFileSync(new URL("../extension/" + name, import.meta.url), "utf8");
const ID = "a".repeat(32), LMS = "https://lms.astanait.edu.kz";
const own = '<div class="logininfo"><a href="/user/profile.php?id=999">Me</a></div>';
const html = body => parseHTML(`<html><body>${own}${body}</body></html>`).document;

test("content scanner reads arbitrary course names with GET and no session export", async () => {
  const dashboard = `<div class="block_course_list"><a href="/course/view.php?id=42">Физика | Преподаватель</a></div>`;
  const course = '<div id="page-header"><h1>Physics | Person</h1></div><li class="activity"><a href="/mod/assign/view.php?id=123">Homework A</a></li><a href="/mod/attendance/view.php?id=456">Presence</a>';
  const assign = '<div id="region-main"><table class="generaltable"><tr><th>Status</th><td class="submissionstatussubmitted">Submitted</td></tr></table></div>';
  const grades = '<table class="user-grade"><tr><th class="column-itemname" id="row_77_999">Lab A</th><td class="column-grade">90</td></tr></table>';
  const attendance = '<table><tr><th class="datecol">Date</th><th class="statuscol">Status</th></tr><tr><td class="datecol">Mon 19 Oct 2026 12PM</td><td class="statuscol">Present</td></tr></table>';
  const pages = new Map([["/my/", dashboard], ["/course/view.php?id=42", course], ["/mod/assign/view.php?id=123", assign], ["/grade/report/user/index.php?id=42", grades], ["/mod/attendance/view.php?id=456&view=5", attendance]]);
  const calls = []; let receiver, finish, fetching = 0, peak = 0;
  const done = new Promise(resolve => { finish = resolve; });
  const context = { URL, AbortSignal, Date, document: html(dashboard), location: { origin: LMS, pathname: "/my/", href: LMS + "/my/" },
    DOMParser: class { parseFromString(text) { return html(text); } },
    structuredClone, setTimeout(resolve) { resolve(); },
    chrome: { runtime: { onMessage: { addListener(fn) { receiver = fn; } }, async sendMessage(message) {
      if (["RESULT", "SCAN_ERROR"].includes(message.type)) finish(message); return { ok: true };
    } } },
    async fetch(url, options) {
      fetching++; peak = Math.max(peak, fetching);
      await new Promise(resolve => setImmediate(resolve)); fetching--;
      const u = new URL(url); calls.push({ path: u.pathname + u.search, options });
      const body = pages.get(u.pathname + u.search); assert.ok(body, "unexpected URL " + u);
      return { ok: true, status: 200, async text() { return body; } };
    },
  };
  runInNewContext(source("parser.js"), context); runInNewContext(source("content.js"), context);
  receiver({ type: "SCAN" }, {}, () => {});
  const result = await done;
  assert.equal(result.type, "RESULT"); assert.equal(result.account, "999"); assert.equal(result.errors.length, 0);
  const records = result.groups.flatMap(g => g.records);
  assert.equal(records.length, 3); assert.ok(records.every(r => r.course === "Physics | Person"));
  assert.equal(records.find(r => r.kind === "assignment").status, "submitted");
  assert.ok(calls.every(c => c.options.method === "GET" && c.options.credentials === "same-origin"));
  assert.ok(calls.every(c => !c.path.includes("action=") && !c.options.body));
  assert.ok(peak > 1 && peak <= 8, `parallel requests: ${peak}`);
  assert.equal(result.catalog.courses.length, 1);
  // Repeat: direct grade/activity reads; course discovery still checks for new tasks.
  calls.length = 0;
  const again = new Promise(resolve => { finish = resolve; });
  const nextContext = { ...context };
  runInNewContext(source("parser.js"), nextContext); runInNewContext(source("content.js"), nextContext);
  receiver({ type: "SCAN", catalog: result.catalog }, {}, () => {});
  const second = await again;
  assert.equal(second.groups.flatMap(g => g.records).length, 3);
  assert.equal(calls.length, 4);
  assert.ok(calls.every(c => !c.path.startsWith("/my/")));
});

function background(seed = {}, open = []) {
  const data = structuredClone(seed), actions = []; let handler;
  const chrome = {
    storage: { local: { async setAccessLevel(v) { actions.push(v); }, async get() { return structuredClone(data); }, async set(v) { Object.assign(data, structuredClone(v)); }, async remove(keys) { for (const k of [keys].flat()) delete data[k]; } } },
    runtime: { id: ID, getURL: path => `chrome-extension://${ID}/${path}`, onMessage: { addListener(fn) { handler = fn; } } },
    tabs: { async query() { return open; }, async sendMessage(id, message) { actions.push({ id, message }); return message.type === "CHECK" ? { account: "999", unsafe: false } : { accepted: true }; }, async create() {} },
    alarms: { async create() {}, onAlarm: { addListener() {} } }, action: { onClicked: { addListener() {} } },
  };
  runInNewContext(source("background.js").replace(/^import .*;\s*/m, ""), { chrome, VERSION, normalizeRecord, changes, URL, Date, AbortSignal, setTimeout, fetch: async () => { throw Error("Network must not be used by this test"); } });
  const ui = { id: ID, url: `chrome-extension://${ID}/popup.html` };
  const content = { id: ID, url: LMS + "/my/", tab: { id: 7 } };
  const send = (message, sender = ui) => new Promise(resolve => handler(message, sender, resolve));
  return { data, actions, send, ui, content };
}
test("device token stays in trusted extension storage, never in content-script responses", async () => {
  const b = background({ token: "test-secret", pending: { fake: true } });
  const state = await b.send({ type: "STATE" }); assert.equal(state.connected, true); assert.equal(state.token, undefined); assert.equal(state.pending, undefined);
  const denied = await b.send({ type: "STATE" }, b.content);
  assert.equal(denied.token, undefined); assert.equal(denied.stop, true);
  assert.ok((await b.send({ type: "STATE" }, { ...b.ui, id: "other" })).error);
  assert.equal(b.actions[0].accessLevel, "TRUSTED_CONTEXTS");
  const report = await b.send({ type: "DIAGNOSTICS" });
  assert.equal(report.connected, true); assert.ok(!JSON.stringify(report).includes("test-secret"));
});
test("any active quiz attempt prevents scanning in all Moodle tabs", async () => {
  const b = background({ token: "fixture" }, [{ id: 7, url: LMS + "/my/" }, { id: 8, url: LMS + "/mod/quiz/attempt.php?attempt=1" }]);
  await b.send({ type: "SYNC" });
  assert.match(b.data.status, /Пауза/); assert.ok(!b.actions.some(v => v.message?.type === "SCAN"));
});
test("pause or a newly opened quiz stops further scan requests at the next progress boundary", async () => {
  const b = background({ activeTab: 7, paused: true });
  assert.equal((await b.send({ type: "PROGRESS", pages: 1, groups: 1, errors: 0 }, b.content)).stop, true);
});
test("pause is persistent, prevents manual collection and can be resumed", async () => {
  const b = background({ token: "fixture" }, [{ id: 7, url: LMS + "/my/" }]);
  await b.send({ type: "PAUSE", paused: true });
  assert.equal(b.data.paused, true);
  await b.send({ type: "SYNC" });
  assert.ok(!b.actions.some(v => v.message?.type === "SCAN"));
  await b.send({ type: "PAUSE", paused: false });
  assert.equal(b.data.paused, false);
  assert.ok(b.actions.some(v => v.message?.type === "SCAN"));
});
test("visiting Moodle before pairing cannot trigger academic reads", async () => {
  const b = background({}, [{ id: 7, url: LMS + "/my/" }]);
  await b.send({ type: "READY", account: "999" }, b.content);
  await b.send({ type: "SYNC" });
  assert.ok(!b.actions.some(v => v.message)); assert.match(b.data.status, /До привязки сбор отключён/);
});
test("server-requested backoff cannot be bypassed by the manual refresh button", async () => {
  const b = background({ token: "fixture", backoffUntil: Date.now() + 900000 }, [{ id: 7, url: LMS + "/my/" }]);
  await b.send({ type: "SYNC" }); assert.ok(!b.actions.some(v => v.message)); assert.match(b.data.status, /отложена/);
});
test("an unsolicited content result cannot overwrite the selected scanner tab", async () => {
  const b = background({ activeTab: 8 });
  const response = await b.send({ type: "RESULT", account: "123", groups: [], errors: [], capturedAt: Date.now() }, b.content);
  assert.equal(response.stop, true); assert.equal(b.data.accounts, undefined);
});

test("partial results survive a bad record and remain available before the scan ends", async () => {
  const b = background({ token: "fixture", paused: false, activeTab: 7, runId: "scan", scanUploaded: true });
  await b.send({ type: "CHECKPOINT", runId: "scan", account: "999", final: false, pages: 3, capturedAt: Date.now(), errors: [{ scope: "42:course", message: "Synthetic parser failure" }], groups: [{ scope: "42:grade", records: [
    { kind: "grade", id: "grade:1", courseId: "42", course: "Course", title: "Lab", url: LMS + "/grade/report/user/index.php?id=42", value: "90" },
    { kind: "grade", id: "grade:2", courseId: "42", course: "Course", title: "", url: LMS + "/grade/report/user/index.php?id=42", value: "80" },
  ] }] }, b.content);
  assert.equal(Object.keys(b.data.accounts["999"].records).length, 1);
  assert.equal(b.data.activeTab, 7); assert.equal(b.data.errors.length, 2);
  const report = await b.send({ type: "DIAGNOSTICS" }); assert.equal(report.counts.grade, 1); assert.equal(report.errors.length, 2);
});
