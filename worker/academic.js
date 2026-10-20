import * as M from "./msgs.js";
import { esc } from "./text.js";
import { gradeView, CARD_FORMAT } from "../extension/lib/grade-view.mjs";
import { syncContext, linkedSchedule } from "./lms-policy.js";
import { attendanceTotals, attendanceForecast } from "./attendance.js";
import { localNow } from "./sched.js";
import { RELEASE } from "../extension/lib/sync-policy.mjs";

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
export function attendanceLine(course, forecast, lang = "ru") {
  const f = forecast || attendanceTotals(course.attendance), en = lang === "en";
  const pct = n => n === null ? "—" : +n.toFixed(2) + "%";
  const icon = f.percent === null ? "⚪" : f.percent < 70 ? "🔴" : f.percent > 70 ? "🟢" : "🟡";
  let text = `<b>${esc(course.name)}</b>\n${icon} <b>${pct(f.percent)}</b> · ${f.earned}/${f.possible} · ${f.taken} ${en ? "marks" : "отметок"}`;
  if (!f.available) return text + (f.unmatched ? `\n<i>${en ? "No matching course in the timetable" : "Нет совпадения с расписанием для прогноза"}</i>` : "");
  if (f.low.maxPercent === null && f.high.maxPercent === null) text += `\n${en ? "No marked sessions to calculate a percentage" : "Нет выставленных отметок для расчёта процента"}`;
  else if (Math.max(f.low.maxPercent || 0, f.high.maxPercent || 0) <= 70) text += `\n⚠️ ${en ? "Above 70% is not reachable with remaining marks" : "По оставшимся отметкам выше 70% уже не набрать"}`;
  else text += `\n${en ? "Can miss" : "Запас пропусков"}: ${Math.min(f.low.skipBlocks, f.high.skipBlocks)} ${en ? "whole classes or" : "целых пар или"} ${Math.min(f.low.skipMarks, f.high.skipMarks)} ${en ? "marks" : "отметок"}`;
  return text;
}
export function attendanceSummary(courses, S, now, lang) {
  if (!courses.length) return lang === "en" ? "No data. Open Moodle with Unitify Bridge." : "Нет данных. Обновите Moodle с Unitify Bridge.";
  const forecasts = courses.map(c => attendanceForecast(c, S, now));
  const lines = courses.map((c, i) => attendanceLine(c, forecasts[i], lang));
  const footer = lang === "en" ? "? is excluded. Absence allowance assumes you attend all other classes and stay strictly above 70%." : "? не учитывается. Запас — при посещении всех остальных пар, строго выше 70%.";
  const note = forecasts.some(f => f.uncertain) ? "\n<i>" + (lang === "en" ? "Estimate: marking frequency/scale may vary" : "Прогноз: частота/шкала отметок может отличаться") + "</i>" : "";
  return "📍 Attendance\n\n" + lines.join("\n\n") + "\n\n" + footer + note;
}
export async function attendanceReport(env, chatId, lang) {
  const courses = (await academicCourses(env, chatId)).filter(c => c.attendance.length);
  const S = courses.length ? await linkedSchedule(env, chatId) : null, now = localNow(env);
  const text = attendanceSummary(courses, S, now, lang);
  return M.post(env, chatId, { kind: "academic", text });
}
export async function gradePhoto(env, chatId, courseId, page = 0) {
  const courses = await academicCourses(env, chatId), course = courses.find(c => c.id === courseId);
  if (!course) return;
  const { group } = await syncContext(env, chatId);
  const first = await env.DB.prepare("SELECT pages,updated_at,format,student_group FROM lms_grade_cards WHERE chat_id=? AND course_id=? AND page=0").bind(chatId, courseId).first();
  if (!first || first.format !== CARD_FORMAT || first.student_group !== group || first.updated_at < course.gradesUpdatedAt || page < 0 || page >= first.pages) {
    const view = gradeView(course.grades, group);
    const labels = { registry: "Register / totals", attendance: "Attendance", exams: "Exams & checkpoints", assignments: "Assignments & practice" };
    let text = `<b>${esc(course.name)}</b>\n`;
    for (const [key, records] of Object.entries(view.sections)) {
      if (!records.length) continue;
      text += `\n<b>${labels[key]}</b>\n`;
      for (const r of records) {
        const line = `${esc(r.title.slice(0, 75))} — <b>${esc(r.value)}</b>\n`;
        if (text.length + line.length > 3400) { text += "…\n"; break; }
        text += line;
      }
    }
    return M.post(env, chatId, { kind: "academic", text: text + `\nНовая карточка появится после синхронизации Unitify Bridge ${RELEASE}.` });
  }
  const card = await env.DB.prepare("SELECT image FROM lms_grade_cards WHERE chat_id=? AND course_id=? AND page=?").bind(chatId, courseId, page).first();
  if (!card) return;
  const bytes = Uint8Array.from(atob(card.image), c => c.charCodeAt(0));
  const buttons = [];
  if (page > 0) buttons.push({ text: `← Page ${page}/${first.pages}`, callback_data: `lg:${courseId}:${page - 1}` });
  if (page + 1 < first.pages) buttons.push({ text: `Page ${page + 2}/${first.pages} →`, callback_data: `lg:${courseId}:${page + 1}` });
  buttons.push({ text: "Предметы", callback_data: "lg:menu" });
  return M.postImage(env, chatId, { kind: "academic", bytes, text: `${esc(course.name)} · <b>Page ${page + 1}/${first.pages}</b>`, markup: { inline_keyboard: [buttons] } });
}
