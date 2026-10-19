import * as M from "./msgs.js";
import { esc } from "./text.js";

const short = name => String(name).split("|")[0].trim();
export async function academicCourses(env, chatId) {
  const rows = (await env.DB.prepare("SELECT data,changed_at FROM lms_records WHERE chat_id=?").bind(chatId).all()).results;
  const courses = new Map();
  for (const row of rows) {
    const record = JSON.parse(row.data);
    if (!courses.has(record.courseId)) courses.set(record.courseId, { id: record.courseId, name: short(record.course), grades: [], attendance: [] });
    const c = courses.get(record.courseId);
    if (record.kind === "grade") { c.grades.push(record); c.gradesUpdatedAt = Math.max(c.gradesUpdatedAt || 0, row.changed_at); }
    if (record.kind === "attendance") c.attendance.push(record);
  }
  return [...courses.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export async function gradesMenu(env, chatId, lang) {
  const courses = (await academicCourses(env, chatId)).filter(c => c.grades.length);
  return M.post(env, chatId, { kind: "academic", text: courses.length ? (lang === "en" ? "📊 Grades" : "📊 Оценки") : "Нет данных. Обновите Moodle с Unitify Bridge.",
    markup: { inline_keyboard: courses.map(c => [{ text: c.name.slice(0, 48), callback_data: `lg:${c.id}:0` }]) } });
}
export function attendanceLine(course) {
  let earned = 0, possible = 0, taken = 0, present = 0;
  for (const r of course.attendance) {
    if (!r.status || /^[?–—-]$/.test(r.status)) continue;
    taken++;
    const p = r.points.match(/(-?\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/);
    if (p) { earned += +p[1].replace(",", "."); possible += +p[2].replace(",", "."); }
    if (/^present|^присутств/iu.test(r.status)) present++;
  }
  const percent = possible ? Math.round(1000 * earned / possible) / 10 : taken ? Math.round(1000 * present / taken) / 10 : null;
  return `<b>${esc(course.name)}</b>\n${percent === null ? "—" : `${percent}%`} · ${earned}/${possible} баллов · ${taken} занятий`;
}
export async function attendanceReport(env, chatId, lang) {
  const courses = (await academicCourses(env, chatId)).filter(c => c.attendance.length);
  const text = courses.length ? "📍 Attendance\n\n" + courses.map(attendanceLine).join("\n\n") : "Нет данных. Обновите Moodle с Unitify Bridge.";
  return M.post(env, chatId, { kind: "academic", text });
}
export async function gradePhoto(env, chatId, courseId, page = 0) {
  const courses = await academicCourses(env, chatId), course = courses.find(c => c.id === courseId);
  if (!course) return;
  const first = await env.DB.prepare("SELECT pages,updated_at FROM lms_grade_cards WHERE chat_id=? AND course_id=? AND page=0").bind(chatId, courseId).first();
  if (!first || first.updated_at < course.gradesUpdatedAt || page < 0 || page >= first.pages) return M.post(env, chatId, { kind: "academic", text: `<b>${esc(course.name)}</b>\n\n` + course.grades.slice(0, 25).map(r => `${esc(r.title.slice(0, 65))} — <b>${esc(r.value)}</b>`).join("\n") + "\n\nКарточка появится после обновления Unitify Bridge." });
  const card = await env.DB.prepare("SELECT image FROM lms_grade_cards WHERE chat_id=? AND course_id=? AND page=?").bind(chatId, courseId, page).first();
  if (!card) return;
  const bytes = Uint8Array.from(atob(card.image), c => c.charCodeAt(0));
  const buttons = [];
  if (page > 0) buttons.push({ text: "←", callback_data: `lg:${courseId}:${page - 1}` });
  if (page + 1 < first.pages) buttons.push({ text: "→", callback_data: `lg:${courseId}:${page + 1}` });
  buttons.push({ text: "Предметы", callback_data: "lg:menu" });
  return M.postImage(env, chatId, { kind: "academic", bytes, text: `${esc(course.name)}${first.pages > 1 ? ` · ${page + 1}/${first.pages}` : ""}`, markup: { inline_keyboard: [buttons] } });
}
