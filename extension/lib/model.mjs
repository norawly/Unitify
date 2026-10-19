// Shared, bounded wire format. Cookies, HTML, session keys and files are never fields.
export const VERSION = 1;
export const clean = (s, max = 500) => String(s ?? "").replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, max);
export function safeUrl(value) {
  try {
    const u = new URL(value);
    if (u.origin !== "https://lms.astanait.edu.kz") return "";
    if (!/^\/(?:mod\/(?:assign|attendance)\/view|grade\/report\/user\/index|course\/view)\.php$/.test(u.pathname)) return "";
    const id = u.searchParams.get("id");
    return /^\d+$/.test(id || "") ? `${u.origin}${u.pathname}?id=${id}` : "";
  } catch { return ""; }
}
export function normalizeRecord(r) {
  if (!r || !["assignment", "grade", "attendance"].includes(r.kind) || !/^\d+$/.test(String(r.courseId))) throw Error("Invalid academic record");
  if (!/^[a-z]+:[\d:a-z-]{1,100}$/.test(r.id || "") || !r.id.startsWith(r.kind + ":")) throw Error("Invalid record ID");
  const out = { kind: r.kind, id: r.id, courseId: String(r.courseId), course: clean(r.course, 220), title: clean(r.title, 300), url: safeUrl(r.url) };
  if (!out.course || !out.title || !out.url) throw Error("Incomplete academic record");
  const url = new URL(out.url), cmid = out.id.split(":")[1];
  const expectedPath = out.kind === "grade" ? "/grade/report/user/index.php" : `/mod/${out.kind === "assignment" ? "assign" : "attendance"}/view.php`;
  if (url.pathname !== expectedPath || url.searchParams.get("id") !== (out.kind === "grade" ? out.courseId : cmid)) throw Error("Record URL does not match its ID");
  if (r.kind === "assignment") {
    out.status = ["submitted", "draft", "not_submitted", "unknown"].includes(r.status) ? r.status : "unknown";
    out.grading = clean(r.grading, 150);
    out.due = Number.isSafeInteger(r.due) && r.due > 0 ? r.due : null;
    out.dueText = clean(r.dueText, 200);
    out.modified = clean(r.modified, 200);
    out.description = clean(r.description, 8000);
    out.submissionText = clean(r.submissionText, 300);
  } else if (r.kind === "grade") {
    out.value = clean(r.value, 100); out.range = clean(r.range, 100);
    out.feedback = clean(r.feedback, 1000);
    out.weight = clean(r.weight, 100); out.percentage = clean(r.percentage, 100);
  } else {
    out.status = clean(r.status, 100); out.points = clean(r.points, 100);
    out.dateText = clean(r.dateText, 200); out.remarks = clean(r.remarks, 500);
  }
  return out;
}
export function changes(before, after) {
  if (!before) return "new";
  if (after.kind === "grade") return ["value", "feedback"].some(k => before[k] !== after[k]) ? "changed" : null;
  if (after.kind === "assignment") return ["status", "due"].some(k => before[k] !== after[k]) ? "changed" : null;
  return ["status", "points", "remarks"].some(k => before[k] !== after[k]) ? "changed" : null;
}
