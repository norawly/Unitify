// Data-only policy. No remote selectors, scripts or executable configuration.
export const RELEASE = "0.3.2";
export const DEFAULT_POLICY = { intervalMinutes: 30, discoveryHours: 6, spacingMs: 900 };
const MIN = 60000;
const clamp = (n, min, max, fallback) => Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
export function policyOf(context) {
  const p = context?.policy || {};
  return { intervalMinutes: clamp(p.intervalMinutes, 20, 120, 30),
    discoveryHours: clamp(p.discoveryHours, 6, 48, 6), spacingMs: clamp(p.spacingMs, 750, 5000, 900) };
}
export function localClock(now) {
  const d = new Date(now + 300 * MIN);
  return { iso: d.toISOString().slice(0, 10), minute: d.getUTCHours() * 60 + d.getUTCMinutes(),
    key: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][d.getUTCDay()] };
}
export const courseName = s => String(s || "").split("|")[0].normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function nextAllowed(state, now = Date.now()) {
  const interval = policyOf(state.syncContext).intervalMinutes * MIN;
  return Math.max(state.backoffUntil || 0, Math.max(state.lastStart || 0, state.lastScan || 0) + interval);
}
export function assignmentNeeded(item, records, now) {
  const old = records?.["assignment:" + item.id];
  if (!old) return true;
  // The page currently being used is always included by the caller. A daily
  // audit below also catches resubmissions of older/completed assignments.
  if (old.status === "submitted") return false;
  return !old.due || old.due >= now - 7 * 86400000;
}
export function makePlan(state, account, now = Date.now()) {
  const context = state.syncContext, p = policyOf(context), clock = localClock(now);
  const daytime = clock.minute >= 9 * 60 && clock.minute < 23 * 60;
  const previous = state.accounts?.[account] || {}, at = previous.scopeAt || {};
  const catalog = state.catalogs?.[account];
  const courses = catalog?.courses || [];
  const timetable = context?.timetable;
  const study = timetable?.study;
  const teaching = study?.length === 2 && clock.iso >= study[0] && clock.iso <= study[1] && !(timetable.holidays || []).includes(clock.iso);
  const today = teaching ? timetable.days?.[clock.key] || [] : [];
  const daily = daytime && previous.attendanceDay !== clock.iso;
  const attendanceCourses = courses.filter(c => {
    if (!daytime) return false;
    if (daily) return true;
    return today.some(g => (g.names || []).some(n => courseName(n) === courseName(c.name)) && clock.minute >= g.start - 30 && clock.minute <= g.end + 90);
  }).map(c => c.id);
  return { daytime, dailyAttendance: daily, spacingMs: p.spacingMs,
    discoveryBefore: now - p.discoveryHours * 3600000,
    auditAssignments: !previous.assignmentAuditAt || now - previous.assignmentAuditAt >= 86400000,
    grades: daytime, attendance: daytime && (daily || attendanceCourses.length > 0), attendanceCourses,
    scopeAt: at, freshAfter: now - p.intervalMinutes * MIN,
    // Unknown catalog: discover first; initial daytime attendance is permitted.
    initialAttendance: daily && !courses.length,
  };
}
