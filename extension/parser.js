/* DOM only: no course names, account IDs or activity IDs are hardcoded. */
(() => {
  const ORIGIN = "https://lms.astanait.edu.kz";
  const text = el => {
    if (!el) return "";
    const copy = el.cloneNode(true);
    copy.querySelectorAll(".accesshide,.sr-only,.visually-hidden,script,style").forEach(n => n.remove());
    return copy.textContent.replace(/\s+/g, " ").trim();
  };
  function link(href, paths) {
    try {
      const u = new URL(href, ORIGIN), id = u.searchParams.get("id");
      if (u.origin !== ORIGIN || !paths.includes(u.pathname) || !/^\d+$/.test(id || "")) return null;
      return { id, url: `${ORIGIN}${u.pathname}?id=${id}` };
    } catch { return null; }
  }
  function identity(doc) {
    const candidates = doc.querySelectorAll('.logininfo a[href*="/user/profile.php"],.usermenu a[href*="/user/profile.php"]');
    for (const a of candidates) {
      const u = new URL(a.getAttribute("href"), ORIGIN);
      if (u.origin === ORIGIN && /^\d+$/.test(u.searchParams.get("id") || "")) return u.searchParams.get("id");
    }
    return null;
  }
  function courses(doc) {
    const found = new Map();
    for (const a of doc.querySelectorAll('.block_course_list a[href*="/course/view.php"],.block_myoverview a[href*="/course/view.php"],[data-block="myoverview"] a[href*="/course/view.php"],.block_navigation li.type_course a[href*="/course/view.php"]')) {
      const l = link(a.getAttribute("href"), ["/course/view.php"]);
      const title = text(a) || a.getAttribute("title") || "";
      if (l && title && (!found.has(l.id) || found.get(l.id).name.length < title.length)) found.set(l.id, { ...l, name: title });
    }
    return [...found.values()];
  }
  const months = ["jan|january|января", "feb|february|февраля", "mar|march|марта", "apr|april|апреля", "may|мая", "jun|june|июня", "jul|july|июля", "aug|august|августа", "sep|sept|september|сентября", "oct|october|октября", "nov|november|ноября", "dec|december|декабря"];
  function date(value, offset = 300) {
    const s = String(value).toLowerCase();
    let m = s.match(/(\d{1,2})\s+([a-zа-яё]+)\.?\s+(\d{4})/u);
    let day, month, year;
    if (m) { day = +m[1]; month = months.findIndex(names => names.split("|").includes(m[2])); year = +m[3]; }
    else {
      m = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
      if (!m) return null;
      day = +m[1]; month = +m[2] - 1; year = +m[3];
    }
    let time = s.match(/(\d{1,2}):(\d{2})(?:\s*([ap])\.?m\.?)?/);
    if (!time) {
      const short = s.match(/\b(\d{1,2})\s*([ap])\.?m\.?/);
      if (short) time = [short[0], short[1], "00", short[2]];
    }
    if (month < 0 || month > 11 || day < 1 || day > 31 || !time) return null;
    let h = +time[1]; const min = +time[2];
    if (time[3]) h = h % 12 + (time[3] === "p" ? 12 : 0);
    if (h > 23 || min > 59) return null;
    const check = new Date(Date.UTC(year, month, day));
    if (check.getUTCDate() !== day) return null;
    return Date.UTC(year, month, day, h, min) - offset * 60000;
  }
  function activities(doc) {
    const assignments = new Map(), attendance = new Map();
    for (const a of doc.querySelectorAll('a[href*="/mod/assign/view.php"],a[href*="/mod/attendance/view.php"]')) {
      const l = link(a.getAttribute("href"), ["/mod/assign/view.php", "/mod/attendance/view.php"]);
      if (!l) continue;
      const row = a.closest(".activity") || a.parentElement;
      const dates = [...row.querySelectorAll('[data-region="activity-dates"] .date-item')];
      const dueRow = dates.find(el => /^(due|срок сдачи|последний срок)/iu.test(text(el)));
      const item = { ...l, title: text(a), dueText: text(dueRow).replace(/^[^:]+:\s*/, "") };
      (l.url.includes("/assign/") ? assignments : attendance).set(l.id, item);
    }
    return { assignments: [...assignments.values()], attendance: [...attendance.values()] };
  }
  function assignment(doc, course, item) {
    const table = doc.querySelector("#region-main .submissionstatustable table, #region-main table.generaltable");
    if (!table || !table.querySelector('[class*="submissionstatus"]')) throw Error("Assignment status table unavailable");
    const rows = [...table.querySelectorAll("tr")];
    const value = regex => text(rows.find(r => regex.test(text(r.querySelector("th"))))?.querySelector("td"));
    const statusCell = table.querySelector('[class*="submissionstatus"]');
    const cls = statusCell.className, statusText = text(statusCell);
    let status = "unknown";
    if (/submissionstatussubmitted/.test(cls)) status = "submitted";
    else if (/submissionstatusdraft/.test(cls)) status = "draft";
    else if (/submissionstatusnew|submissionstatusnosubmission/.test(cls)) status = "not_submitted";
    else if (/^submitted for grading|^сдано для оценивания/iu.test(statusText)) status = "submitted";
    const dueRow = [...doc.querySelectorAll('[data-region="activity-dates"] .date-item')].find(el => /^(due|срок сдачи|последний срок)/iu.test(text(el)));
    const dueText = text(dueRow).replace(/^[^:]+:\s*/, "") || value(/due date|срок сдачи/iu) || item.dueText;
    return { kind: "assignment", id: `assignment:${item.id}`, courseId: course.id, course: course.name,
      title: item.title, url: item.url, status, grading: value(/grading status|состояние оценивания/iu),
      due: date(dueText), dueText, modified: value(/last modified|последнее изменение/iu) };
  }
  function grades(doc, course) {
    const table = doc.querySelector("table.user-grade");
    if (!table || !table.querySelector(".column-grade")) throw Error("Grade report unavailable");
    return [...table.querySelectorAll("tbody tr, tr")].filter((r, i, a) => a.indexOf(r) === i).flatMap(row => {
      const name = row.querySelector(".column-itemname"), grade = row.querySelector("td.column-grade");
      if (!name || !grade) return [];
      const id = name.id?.match(/^row_(\d+)_\d+$/)?.[1];
      if (!id || !text(name)) return [];
      return [{ kind: "grade", id: `grade:${id}`, courseId: course.id, course: course.name, title: text(name),
        url: `${ORIGIN}/grade/report/user/index.php?id=${course.id}`, value: text(grade),
        range: text(row.querySelector(".column-range")), feedback: text(row.querySelector(".column-feedback")) }];
    });
  }
  function hash(s) {
    let h = 2166136261;
    for (const char of s) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }
  function attendance(doc, course, item) {
    const table = [...doc.querySelectorAll("table")].find(t => t.querySelector(".datecol") && t.querySelector(".statuscol"));
    if (!table) throw Error("Attendance report unavailable");
    return [...table.querySelectorAll("tr")].flatMap(row => {
      const dateText = text(row.querySelector("td.datecol"));
      if (!dateText) return [];
      const title = text(row.querySelector("td.desccol")) || item.title;
      const start = date(dateText), sessionKey = start ? start.toString(36) : hash(dateText);
      return [{ kind: "attendance", id: `attendance:${item.id}:${sessionKey}`, courseId: course.id,
        course: course.name, title, url: item.url, dateText, status: text(row.querySelector("td.statuscol")),
        points: text(row.querySelector("td.pointscol")), remarks: text(row.querySelector("td.remarkscol")) }];
    });
  }
  globalThis.UnitifyParser = { text, identity, courses, date, activities, assignment, grades, attendance, link };
})();
