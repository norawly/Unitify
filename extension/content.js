/* Runs in the user's existing tab/session. Never reads document.cookie or calls a write endpoint. */
(() => {
  const P = globalThis.UnitifyParser, ORIGIN = location.origin;
  let running = false;
  const unsafe = () => /\/mod\/quiz\/(attempt|processattempt|startattempt|summary)\.php/.test(location.pathname) ||
    /(?:action=(?:editsubmission|submit|submitassignment)|\/mod\/assign\/submission)/.test(location.href);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const send = message => chrome.runtime.sendMessage(message).catch(() => null);
  async function scan(options = {}) {
    if (running || unsafe()) return;
    running = true;
    const account = P.identity(document);
    let requests = 0, stopped = false, retryAt = null;
    const groups = [], errors = [];
    try {
      if (!account) throw Error("Войдите в Moodle в этой вкладке.");
      async function page(url) {
        if (++requests > 180) throw Error("Лимит страниц за один сбор. Остальное — при следующей проверке.");
        if (stopped || unsafe() || P.identity(document) !== account) throw Error("Сбор остановлен: страница или аккаунт изменились.");
        const u = new URL(url, ORIGIN);
        if (u.origin !== ORIGIN || !/^\/(my\/|course\/view\.php|mod\/(assign|attendance)\/view\.php|grade\/report\/user\/index\.php)$/.test(u.pathname) ||
            [...u.searchParams.keys()].some(k => !["id", "view"].includes(k))) throw Error("Запрещённый адрес чтения");
        // At most 20 read requests/minute, sequentially; never navigate through UI tabs.
        await sleep(3000);
        let r;
        try { r = await fetch(u, { method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(25000) }); }
        catch { stopped = true; retryAt = Date.now() + 5 * 60000; throw Error("Moodle не отвечает. Следующая проверка будет позже."); }
        if (r.status === 429 || r.status >= 500) {
          stopped = true;
          const retry = r.headers?.get("retry-after");
          const wait = /^\d+$/.test(retry || "") ? +retry * 1000 : retry ? Date.parse(retry) - Date.now() : 0;
          retryAt = Date.now() + Math.max(r.status === 429 ? 15 * 60000 : 5 * 60000, Number.isFinite(wait) ? wait : 0);
        }
        if (!r.ok) throw Error(`Moodle: ${r.status}`);
        const doc = new DOMParser().parseFromString(await r.text(), "text/html");
        if (P.identity(doc) !== account) { stopped = true; throw Error("Сессия Moodle истекла или сменился аккаунт."); }
        return doc;
      }
      async function collect(scope, job) {
        try { groups.push({ scope, records: await job() }); }
        catch (e) { errors.push({ scope, message: String(e.message).slice(0, 180) }); }
        const control = await send({ type: "PROGRESS", account, pages: requests, groups: groups.length, errors: errors.length });
        if (control?.stop) stopped = true;
      }
      const previous = options.catalog?.account === account ? options.catalog : null;
      const refreshCourses = !previous?.coursesAt || Date.now() - previous.coursesAt > 86400000;
      const courses = refreshCourses ? P.courses(await page("/my/")) : previous.courses;
      if (!courses.length) throw Error("Курсы не найдены. Сохранённые данные не изменены.");
      const catalog = { account, coursesAt: refreshCourses ? Date.now() : previous.coursesAt, courses: [] };
      for (const course of courses) {
        let activities;
        try {
          const known = previous?.courses.find(c => c.id === course.id);
          if (known?.discoveredAt && Date.now() - known.discoveredAt < 60 * 60000) {
            activities = { assignments: known.assignments, attendance: known.attendance };
            course.discoveredAt = known.discoveredAt;
          } else {
            const doc = await page(course.url);
            const name = P.text(doc.querySelector("#page-header h1, #page h1"));
            if (name) course.name = name;
            activities = P.activities(doc);
            course.discoveredAt = Date.now();
          }
          catalog.courses.push({ ...course, ...activities });
        } catch (e) { errors.push({ scope: `${course.id}:course`, message: e.message }); continue; }
        await collect(`${course.id}:grade`, async () => P.grades(await page(`/grade/report/user/index.php?id=${course.id}`), course));
        const assignments = [];
        for (const item of activities.assignments) {
          if (stopped || requests >= 180) break;
          try { assignments.push(P.assignment(await page(item.url), course, item)); }
          catch (e) { errors.push({ scope: `${course.id}:assignment:${item.id}`, message: e.message }); }
          const control = await send({ type: "PROGRESS", account, pages: requests, groups: groups.length, errors: errors.length });
          if (control?.stop) stopped = true;
        }
        if (assignments.length) groups.push({ scope: `${course.id}:assignment`, records: assignments });
        for (const item of activities.attendance)
          if (!stopped && requests < 180) await collect(`${course.id}:attendance:${item.id}`, async () => P.attendance(await page(item.url + "&view=5"), course, item));
        if (requests >= 180) errors.push({ scope: "scan", message: "Достигнут лимит 180 страниц; часть разделов не проверена." });
        if (requests >= 180 || stopped) break;
      }
      // Preserve any courses not reached in a partial/paused scan.
      for (const known of courses) if (!catalog.courses.some(c => c.id === known.id)) catalog.courses.push(
        previous?.courses.find(c => c.id === known.id) || { ...known, discoveredAt: 0, assignments: [], attendance: [] });
      await send({ type: "RESULT", account, groups, errors, catalog, retryAt, capturedAt: Date.now() });
    } catch (e) { await send({ type: "SCAN_ERROR", message: e.message, retryAt }); }
    finally { running = false; }
  }
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message.type === "CHECK") reply({ account: P.identity(document), unsafe: unsafe() });
    if (message.type === "SCAN") { reply({ accepted: !running && !unsafe() }); void scan(message); }
  });
  void send({ type: "READY", account: P.identity(document), unsafe: unsafe() });
})();
