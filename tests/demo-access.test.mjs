import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { demoAccess, demoChatIds, demoSource, dataChatId, isPrivateUpdate, retireOtherUsers } from "../worker/access.js";
import { getUser, activeUsers, calendarUsers, updateUser } from "../worker/db.js";
import { academicCourses } from "../worker/academic.js";
import { attendanceSnapshot } from "../worker/attendance.js";
import { handleUpdate, allowed } from "../worker/bot.js";
import { createPairCode, recordsText, notifyChanges, handleLms } from "../worker/lms-extension.js";
import { upcoming, setDone, syncUser } from "../worker/moodle.js";
import { runCron } from "../worker/cron.js";
import { webhookSecret } from "../worker/tg.js";

const S = { group: "CS-2411", term: { study: ["2026-09-07", "2026-11-14"], exams: ["2026-11-16", "2026-11-28"], vacation: ["2026-11-30", "2026-12-05"] },
  days: { tue: [{ subject: "Computer Networks Security", start: "12:00", end: "13:55", room: "C1.2.232P", type: "practice" }] } };
const grade = { kind: "grade", id: "grade:7", courseId: "42", course: "Computer Networks Security", title: "Assignment 1", value: "91", range: "0–100", url: "" };
const assignment = { kind: "assignment", id: "assignment:123", courseId: "42", course: grade.course, title: "Assignment 1", status: "not_submitted", url: "https://lms.astanait.edu.kz/mod/assign/view.php?id=123" };
const mark = { kind: "attendance", id: "attendance:456:abc", courseId: "42", course: grade.course, title: "Session", status: "Present", points: "2 / 2", dateText: "Mon 19 Oct 2026 12PM" };
function fixture() {
  const sql = new DatabaseSync(":memory:"), migrations = new URL("../migrations/", import.meta.url);
  for (const file of readdirSync(migrations).filter(x => x.endsWith(".sql")).sort()) sql.exec(readFileSync(new URL(file, migrations), "utf8"));
  sql.exec(`INSERT INTO users(chat_id,status,person,lang,lead_min,created_at,cal_url,cal_hash) VALUES
    (101,'admin','nurali','en',20,0,'https://lms.astanait.edu.kz/calendar/export_execute.php?authtoken=SYNTHETIC','old'),
    (202,'approved','nurbek','ru',20,0,NULL,NULL), (303,'approved','nurali','ru',20,0,NULL,NULL), (404,'approved','nurali','ru',20,0,NULL,NULL);
    INSERT INTO owners VALUES ('nurali',101,0),('nurbek',202,0);
    INSERT INTO lms_scope_reads VALUES (101,'42:attendance:456',12345);
    INSERT INTO lms_grade_cards VALUES (101,'42',0,2,'test','/9j/AA==',9999999999999,3,'CS-2411'),(101,'42',1,2,'test','/9j/AA==',9999999999999,3,'CS-2411');`);
  for (const record of [grade, assignment, mark]) sql.prepare("INSERT INTO lms_records VALUES (?,?,?,?,?)").run(101, record.id, "42:" + record.kind, JSON.stringify(record), 100);
  sql.prepare("INSERT INTO lms_records VALUES (?,?,?,?,?)").run(202, "grade:8", "99:grade", JSON.stringify({...grade, id:"grade:8", courseId:"99", course:"Other private course"}), 100);
  sql.prepare("INSERT INTO deadlines(chat_id,uid,title,subject,due,descr) VALUES (101,'due','Assignment 1 is due',?,?,'')").run(grade.course, Date.now() + 86400000);
  const DB = { prepare(query) { let values = []; return {
    bind(...args) { values = args; return this; },
    async first() { return sql.prepare(query).get(...values) || null; },
    async all() { return { results: sql.prepare(query).all(...values) }; },
    async run() { return { meta: sql.prepare(query).run(...values) }; },
  }; }, async batch(statements) {
    sql.exec("BEGIN"); try { const out = []; for (const statement of statements) out.push(await statement.run()); sql.exec("COMMIT"); return out; }
    catch (e) { sql.exec("ROLLBACK"); throw e; }
  } };
  let mid = 1; const calls = [], oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("https://lms.astanait.edu.kz/")) throw Error("Unexpected Moodle request");
    const body = options.body instanceof FormData ? Object.fromEntries(options.body.entries()) : JSON.parse(options.body);
    calls.push({ method: String(url).split("/").at(-1), body });
    return Response.json({ ok: true, result: { message_id: mid++ } });
  };
  const env = { DB, TELEGRAM_TOKEN: "test", TG_API: "https://telegram.example.invalid", PUBLIC_URL: "https://s.zhengisbay.com", BOT_ALLOWED_CHAT_IDS: "101,202",
    BOT_DEMO_ACCESS: JSON.stringify({source:101,viewers:[303,404]}), DEV_NOW: "2026-10-20T06:01:00Z",
    ASSETS: { async fetch(request) {
      const p = new URL(request.url).pathname;
      if (p === "/people.json") return Response.json([{slug:"nurali",private:true},{slug:"nurbek",private:true}]);
      if (p === "/map/rooms/index.json") return Response.json({rooms:{}});
      if (p === "/map/days/index.json") return Response.json({cards:{}});
      return Response.json(S);
    } },
  };
  const send = (text, id=303) => handleUpdate(env, { message: { message_id:9999,chat:{id,type:"private"},from:{id,is_bot:false},text } });
  const click = (data,id=303) => handleUpdate(env, { callback_query: { id:"cb",data,from:{id,is_bot:false},message:{message_id:777,chat:{id,type:"private"}} } });
  return { env, sql, calls, send, click, close() {globalThis.fetch=oldFetch;sql.close();} };
}

test("demo grants are explicit, bounded, private, revocable and do not promote owners", () => {
  const env = {BOT_ALLOWED_CHAT_IDS:"101,202",BOT_DEMO_ACCESS:JSON.stringify({source:101,viewers:[303,404]})};
  assert.deepEqual(demoChatIds(env), [303,404]); assert.equal(demoSource(env,303),101); assert.equal(dataChatId(env,202),202);
  const update = id => ({message:{chat:{id,type:"private"},from:{id,is_bot:false}}});
  assert.equal(isPrivateUpdate(env,update(303)),true); assert.equal(isPrivateUpdate(env,update(999)),false);
  const group=update(303);group.message.chat.type="group";assert.equal(isPrivateUpdate(env,group),false);
  const spoof=update(303);spoof.message.from.id=999;assert.equal(isPrivateUpdate(env,spoof),false);
  for (const config of ["{", {source:999,viewers:[303]}, {source:101,viewers:[101]}, {source:101,viewers:[303,303]}, {source:101,viewers:[303,404,505]}, {source:101,viewers:["303"]}])
    assert.equal(demoAccess({...env,BOT_DEMO_ACCESS:typeof config === "string"?config:JSON.stringify(config)}),null);
  assert.equal(isPrivateUpdate({...env,BOT_DEMO_ACCESS:""},update(303)),false);
});

test("both viewers read the live owner data, never another owner's data or calendar credential", async () => {
  const f=fixture();try {
    for (const id of [303,404]) {
      const u=await getUser(f.env,id);assert.equal(u.person,"nurali");assert.equal(u.status,"approved");assert.equal(u.lang,"en");assert.equal(u.demo,true);
      assert.equal(u.cal_url,"linked-read-only");assert.equal(await allowed(f.env,"nurali",id),true);assert.equal(await allowed(f.env,"nurbek",id),false);
      const courses=await academicCourses(f.env,id);assert.deepEqual(courses.map(c=>c.name),[grade.course]);
      assert.equal((await attendanceSnapshot(f.env,id)).reads[0].checked_at,12345);
      assert.equal((await upcoming(f.env,id,0))[0].uid,"due");assert.match(await recordsText(f.env,id,"assignment","en"),/not_submitted/);
      assert.equal(await syncUser(f.env,u),null);
    }
    f.sql.prepare("UPDATE lms_records SET data=? WHERE chat_id=101 AND id='grade:7'").run(JSON.stringify({...grade,value:"97"}));
    assert.equal((await academicCourses(f.env,303))[0].grades[0].value,"97");
    assert.deepEqual((await calendarUsers(f.env)).map(u=>u.chat_id),[101]);
    assert.deepEqual((await activeUsers(f.env)).map(u=>u.chat_id),[101,202,303,404]);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM lms_records WHERE chat_id IN (303,404)").get().n,0);
  }finally{f.close();}
});

test("settings, old callbacks, barcode and calendar inputs cannot mutate a demo or its source", async () => {
  const f=fixture();try {
    const before=JSON.stringify(f.sql.prepare("SELECT * FROM users ORDER BY chat_id").all());
    for(const action of ["s:lang","s:caloff","s:person","s:extoff","s:lead","lx:pair","a:ban:101","hd:1","hu:1"]) await f.click(action);
    for(const text of ["/settings","/extension","240854","https://lms.astanait.edu.kz/calendar/export_execute.php?authtoken=SYNTHETIC"]) await f.send(text);
    assert.equal(JSON.stringify(f.sql.prepare("SELECT * FROM users ORDER BY chat_id").all()),before);
    assert.equal(f.sql.prepare("SELECT done_at FROM deadlines WHERE chat_id=101").get().done_at,null);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM lms_pair_codes").get().n,0);
    assert.ok(f.calls.filter(c=>["sendMessage","editMessageText"].includes(c.method) && !c.body.reply_markup?.keyboard).every(c=>/Read-only demonstration/.test(c.body.text)));
    assert.ok(f.calls.every(c=>!JSON.stringify(c.body).includes("SYNTHETIC")));
    await assert.rejects(updateUser(f.env,303,{person:"nurbek"}),/read-only/);
    assert.throws(()=>setDone(f.env,303,1,true),/read-only/);
    await assert.rejects(createPairCode(f.env,303),/Access denied/);
  }finally{f.close();}
});

test("all read screens, grade photos and page navigation work for both viewers without Moodle", async () => {
  const f=fixture();try {
    for(const id of [303,404]) {
      await f.send("/start",id);await f.send("/today",id);await f.send("/next",id);await f.send("/deadlines",id);
      await f.send("/grades",id);await f.click("lg:42:0",id);await f.click("lg:42:1",id);await f.send("/attendance",id);await f.send("/homework",id);
      const messages=f.calls.filter(c=>+c.body.chat_id===id);
      assert.ok(messages.some(c=>c.method==="setChatMenuButton"));
      assert.ok(messages.some(c=>String(c.body.caption).includes("Page 2/2")));
      assert.ok(messages.some(c=>String(c.body.text).includes("📍 Attendance")));
      assert.ok(messages.some(c=>String(c.body.text).includes("Assignment 1")));
      assert.ok(!messages.some(c=>JSON.stringify(c.body).includes("Other private course")));
      assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM msgs WHERE chat_id=? AND kind='menu'").get(id).n,1);
      const menuId=f.sql.prepare("SELECT message_id FROM msgs WHERE chat_id=? AND kind='menu'").get(id).message_id;
      assert.ok(!messages.some(c=>c.method==="deleteMessage" && c.body.message_id===menuId));
    }
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM owners").get().n,2);
  }finally{f.close();}
});

test("source changes notify both viewers independently without consuming the owner's outbox", async () => {
  const f=fixture();try {
    await notifyChanges(f.env,await getUser(f.env,303));await notifyChanges(f.env,await getUser(f.env,404));
    const event={before:grade,after:{...grade,value:"96"}};
    f.sql.prepare("INSERT INTO lms_events(chat_id,at,payload) VALUES (101,?,?)").run(Date.now(),JSON.stringify(event));
    for(const id of [303,404]) await notifyChanges(f.env,await getUser(f.env,id));
    assert.equal(f.sql.prepare("SELECT notified FROM lms_events").get().notified,0);
    await notifyChanges(f.env,await getUser(f.env,101));
    assert.equal(f.sql.prepare("SELECT notified FROM lms_events").get().notified,1);
    for(const id of [303,404]) await notifyChanges(f.env,await getUser(f.env,id));
    assert.deepEqual(f.calls.filter(c=>c.method==="sendMessage").map(c=>c.body.chat_id),[303,404,101]);
  }finally{f.close();}
});

test("cleanup preserves explicitly invited viewers; disabling a grant blocks immediately", async () => {
  const f=fixture();try {
    await retireOtherUsers(f.env);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM users").get().n,4);
    f.env.BOT_DEMO_ACCESS="";
    f.env.DB={get prepare(){throw Error("Unexpected DB");}};
    await f.send("/grades");await f.click("lg:42:0");assert.equal(f.calls.length,0);
  }finally{f.close();}
});

test("a viewer cannot use a pre-existing extension token to overwrite academic records", async () => {
  const f=fixture();try {
    const token="a".repeat(64),hash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token)))].map(v=>v.toString(16).padStart(2,"0")).join("");
    f.sql.prepare("INSERT INTO lms_devices(chat_id,token_hash,created_at) VALUES (303,?,0)").run(hash);
    const response=await handleLms(new Request("https://s.zhengisbay.com/api/lms/sync",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+token},body:"{}"}),f.env);
    assert.equal(response.status,401);
  }finally{f.close();}
});

test("deadline fan-out fetches Moodle once and gives no completion buttons to viewers", async () => {
  const f=fixture();try {
    const setMeta=(key,value)=>f.sql.prepare("INSERT INTO meta VALUES (?,?)").run(key,value);
    setMeta("private_access_cleanup_v1",JSON.stringify({complete:true}));
    setMeta("webhook",`${f.env.PUBLIC_URL}/tg/webhook|${(await webhookSecret("test")).slice(0,16)}|v6`);
    for(const id of [101,202,303,404]) f.sql.prepare("INSERT INTO sent VALUES (?,'reply-keyboard-persistent-v3',?)").run(id,Date.now());
    const due=new Date(Date.now()+30*60000).toISOString().replace(/[-:]/g,"").replace(/\.\d+Z$/,"Z");
    const telegram=globalThis.fetch;let polls=0;
    globalThis.fetch=async(url,options)=>String(url).startsWith("https://lms.astanait.edu.kz/")
      ? (++polls,new Response(`BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:demo-due\nSUMMARY:Homework is due\nCATEGORIES:Computer Networks Security\nDTSTART:${due}\nEND:VEVENT\nEND:VCALENDAR`)) : telegram(url,options);
    await runCron(f.env);
    assert.equal(polls,1);
    const notifications=f.calls.filter(c=>c.method==="sendMessage" && c.body.text.includes("Homework"));
    for(const id of [101,303,404]) assert.ok(notifications.some(c=>c.body.chat_id===id));
    assert.ok(notifications.filter(c=>c.body.chat_id!==101).every(c=>!c.body.reply_markup));
    assert.ok(notifications.some(c=>c.body.chat_id===101 && c.body.reply_markup));
  }finally{f.close();}
});
