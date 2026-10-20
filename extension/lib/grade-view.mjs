// Shared presentation of current and legacy snapshots. Never changes Moodle data.
export const CARD_FORMAT = 3;
const tidy = value => String(value ?? "").replace(/\s+/g, " ").trim();
export function gradeTitle(value) {
  return tidy(value).replace(/^Calculated\s*grade\s*/iu, "")
    .replace(/^(Assignment|Attendance|Quiz)\s*\1/iu, "$1")
    .replace(/^(?:Assignment|Quiz)(?=[A-ZА-Я])/u, "").trim();
}
export function gradeValue(value) {
  return tidy(value).replace(/\s*(?:Grade\s*analysis|Анализ\s+оценки)[\s\S]*$/iu, "").trim() || "—";
}
export const hasGrade = value => !/^(?:|[-–—?])$/.test(gradeValue(value));
export function gradeSection(record) {
  const title = gradeTitle(record.title);
  if (record.activityType === "calculated" || /^(?:regist(?:er|ry)|course\s+total)\b/iu.test(title)) return "registry";
  if (record.activityType === "attendance" || /^attendance\b/iu.test(title)) return "attendance";
  if (/(?:^|[^a-z])(?:mid[\s_-]*term|end[\s_-]*term|interim|final|mid[\s_-]*exam|exam)(?=$|[^a-z])/iu.test(title)) return "exams";
  return "assignments";
}
export function groupCodes(value) {
  const text = String(value || "").toUpperCase(), out = new Set();
  // CS-2411, CS 24-11, CS_24_11. Only explicit cohort codes, never bare task numbers.
  const re = /\b([A-Z]{1,5})[\s_-]*(\d{2})[\s_-]*(\d{2})(?!\d)/g;
  for (const m of text.matchAll(re)) {
    const prefix = m[1]; out.add(prefix + m[2] + m[3]);
    const rest = text.slice(m.index + m[0].length);
    const shared = rest.match(/^(?:\s*(?:[,/&]|AND)\s*\d{4}\b)+/);
    if (shared) for (const code of shared[0].matchAll(/\d{4}/g)) out.add(prefix + code[0]);
    // A shortened shared-group list is ambiguous: keep it rather than hide it.
    if (/^\s*[,/&]\s*\d{2}\b/.test(rest)) out.add("ambiguous");
  }
  return [...out];
}
const registryOrder = title => {
  const t = title.toLowerCase();
  if (/midterm/.test(t)) return 0;
  if (/interim|endterm/.test(t)) return 1;
  if (/\bterm\b/.test(t)) return 2;
  if (/final/.test(t)) return 3;
  if (/^course/.test(t)) return 5;
  return 4;
};
const examOrder = title => {
  const t = title.toLowerCase();
  const stage = /mid[\s_-]*(?:term|exam)/.test(t) ? 0 : /interim|endterm/.test(t) ? 1 : 2;
  return stage + (/\bfx\b/.test(t) ? 10 : 0);
};
export function gradeView(records, group = "") {
  const own = groupCodes(group), unique = new Map();
  for (const raw of records) {
    const record = { ...raw, title: gradeTitle(raw.title), value: gradeValue(raw.value),
      range: gradeValue(raw.range), weight: gradeValue(raw.weight) };
    if (!unique.has(record.id)) unique.set(record.id, record);
  }
  const sections = { registry: [], attendance: [], exams: [], assignments: [] };
  let hidden = 0;
  for (const record of unique.values()) {
    const section = gradeSection(record), groups = groupCodes(record.title);
    if (section === "assignments" && own.length && groups.length && !groups.includes("ambiguous") && !groups.some(g => own.includes(g)) && !hasGrade(record.value)) { hidden++; continue; }
    sections[section].push(record);
  }
  const natural = (a, b) => a.title.localeCompare(b.title, "en", { numeric: true, sensitivity: "base" }) || a.id.localeCompare(b.id);
  for (const [key, items] of Object.entries(sections)) items.sort(key === "registry" ? (a, b) => registryOrder(a.title) - registryOrder(b.title) || natural(a, b) : key === "exams" ? (a, b) => examOrder(a.title) - examOrder(b.title) || natural(a, b) : natural);
  return { sections, hidden, records: Object.values(sections).flat(), group: tidy(group) };
}

// Whole sections when possible; long sections continue with an explicit heading.
export function gradePages(view) {
  const pages = []; let page = [], cost = 0;
  const add = (item, size) => { if (cost + size > 22 && page.length) { pages.push(page); page = []; cost = 0; } page.push(item); cost += size; };
  for (const [section, records] of Object.entries(view.sections)) {
    if (!records.length) continue;
    if (section === "registry") { add({ section, records }, 1 + Math.ceil(records.length / 3) * 1.5); continue; }
    const chunks = [];
    for (let i = 0; i < records.length; i += 16) chunks.push(records.slice(i, i + 16));
    for (let i = 0; i < chunks.length; i++) add({ section, records: chunks[i], continued: i > 0 }, 1 + chunks[i].length);
  }
  if (page.length || !pages.length) pages.push(page);
  return pages;
}
