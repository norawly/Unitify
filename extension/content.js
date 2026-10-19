/* Same Chrome session, GET only. No cookies, forms or separate login. */
(() => {
  const P = globalThis.UnitifyParser, ORIGIN = location.origin;
  const documentKey = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let running = false;
  const unsafe = () => /\/mod\/quiz\/(attempt|processattempt|startattempt|summary)\.php/.test(location.pathname) ||
    /(?:action=(?:editsubmission|submit|submitassignment)|\/mod\/assign\/submission)/.test(location.href);
  const send = message => chrome.runtime.sendMessage(message).catch(() => ({ stop: true }));
  async function scan(options) {
    if (running || unsafe()) return;
    running = true;
    const account = P.identity(document), runId = options.runId;
    let requests = 0, completed = 0, stopped = false, retryAt = null, active = 0, revision = 0, lastReport = 0;
    const groups = [], gradeCards = [], errors = [], waiters = [], urls = new Map();
    const previous = options.catalog?.account === account ? options.catalog : null;
    const catalog = { account, coursesAt: Date.now(), courses: [] };
    let reporting = Promise.resolve();
    function report(final = false) {
      if (!final && Date.now() - lastReport < 750) return reporting;
      lastReport = Date.now();
      reporting = reporting.then(async () => {
        const response = await send({ type: final ? "RESULT" : "CHECKPOINT", runId, documentKey, account,
          groups: structuredClone(groups), gradeCards: structuredClone(gradeCards), errors: structuredClone(errors), catalog: structuredClone(catalog),
          retryAt, pages: completed, requested: requests, revision: ++revision, capturedAt: Date.now(), final });
        if (response?.stop || response?.error) stopped = true;
      });
      return reporting;
    }
    async function slot(job) {
      if (active >= 8) await new Promise(resolve => waiters.push(resolve));
      active++;
      try { return await job(); }
      finally { active--; waiters.shift()?.(); }
    }
    async function page(href) {
      const u = new URL(href, ORIGIN);
      if (u.origin !== ORIGIN || !/^\/(my\/|course\/view\.php|mod\/(assign|attendance)\/view\.php|grade\/report\/user\/index\.php)$/.test(u.pathname) ||
          [...u.searchParams.keys()].some(k => !["id", "view"].includes(k))) throw Error("Запрещённый адрес чтения");
      if (urls.has(u.href)) return urls.get(u.href);
      const promise = slot(async () => {
        if (stopped || unsafe() || P.identity(document) !== account) throw Error("Сбор остановлен");
        if (++requests > 400) throw Error("Достигнут лимит 400 страниц за проход");
        let response;
        try { response = await fetch(u, { method: "GET", credentials: "same-origin", cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(20000) }); }
        catch { stopped = true; retryAt = Date.now() + 60000; throw Error("Moodle не отвечает; повторная проверка позже"); }
        completed++;
        if (response.status === 429 || response.status >= 500) {
          stopped = true;
          const retry = response.headers?.get("retry-after");
          const wait = /^\d+$/.test(retry || "") ? +retry * 1000 : retry ? Date.parse(retry) - Date.now() : 0;
          retryAt = Date.now() + Math.max(response.status === 429 ? 5 * 60000 : 60000, Number.isFinite(wait) ? wait : 0);
        }
        if (!response.ok) throw Error(`Moodle HTTP ${response.status}`);
        if (response.url && new URL(response.url).origin !== ORIGIN) throw Error("Moodle перенаправил на другой сайт");
        const doc = new DOMParser().parseFromString(await response.text(), "text/html");
        if (P.identity(doc) !== account) { stopped = true; throw Error("Сессия истекла или сменился аккаунт Moodle"); }
        return doc;
      });
      urls.set(u.href, promise);
      return promise;
    }
    function error(scope, e) {
      if (e.message !== "Сбор остановлен") errors.push({ scope, message: String(e.message).slice(0, 180) });
    }
    async function collect(scope, job) {
      try { groups.push({ scope, records: await job() }); }
      catch (e) { error(scope, e); }
      await report();
    }
    try {
      if (!account) throw Error("Сначала войдите в Moodle");
      let courses = P.courses(document);
      if (!courses.length) courses = previous?.courses || P.courses(await page("/my/"));
      if (!courses.length) throw Error("Курсы не найдены");
      const visibleCourse = new URL(location.href).pathname === "/course/view.php" ? new URL(location.href).searchParams.get("id") : null;
      await Promise.all(courses.map(async course => {
        const known = previous?.courses.find(c => c.id === course.id);
        if (known?.name && known.name.length > course.name.length) course.name = known.name;
        const entry = { ...course, assignments: [], attendance: [], discoveredAt: 0 };
        catalog.courses.push(entry);
        const assignments = new Map(), attendanceJobs = new Map();
        const gradeJob = collect(`${course.id}:grade`, async () => {
          const records = P.grades(await page(`/grade/report/user/index.php?id=${course.id}`), course);
          try {
            if (globalThis.UnitifyGradeCards) {
              const cards = await globalThis.UnitifyGradeCards.render(course, records, options.gradeSignatures?.[course.id]);
              if (gradeCards.reduce((sum, c) => sum + c.image.length, 0) + cards.reduce((sum, c) => sum + c.image.length, 0) <= 1400000) gradeCards.push(...cards);
              else error(`${course.id}:image`, Error("Карточка отложена до следующей синхронизации: достигнут размер пакета"));
            }
          }
          catch (e) { error(`${course.id}:image`, e); }
          return records;
        });
        function enqueue(activities) {
          for (const item of activities.assignments || []) if (!assignments.has(item.id))
            assignments.set(item.id, (async () => {
              try { return P.assignment(await page(item.url), course, item); }
              catch (e) { error(`${course.id}:assignment:${item.id}`, e); return null; }
              finally { void report(); }
            })());
          for (const item of activities.attendance || []) if (!attendanceJobs.has(item.id))
            attendanceJobs.set(item.id, collect(`${course.id}:attendance:${item.id}`, async () => P.attendance(await page(item.url + "&view=5"), course, item)));
        }
        if (known) enqueue(known);
        try {
          const doc = visibleCourse === course.id ? document : await page(course.url);
          const name = P.text(doc.querySelector("#page-header h1, #page h1"));
          if (name) course.name = name;
          const activities = P.activities(doc);
          Object.assign(entry, { ...course, ...activities, discoveredAt: Date.now() });
          enqueue(activities);
        } catch (e) { error(`${course.id}:course`, e); if (known) Object.assign(entry, known); }
        const results = await Promise.all([...assignments.values()]);
        if (results.some(Boolean)) groups.push({ scope: `${course.id}:assignment`, records: results.filter(Boolean) });
        await Promise.all([gradeJob, ...attendanceJobs.values()]);
        for (const group of groups) for (const record of group.records) if (record.courseId === course.id) record.course = course.name;
        await report();
      }));
      await report(true);
    } catch (e) {
      error("scan", e);
      await report(true);
    } finally { running = false; }
  }
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message.type === "CHECK") reply({ account: P.identity(document), unsafe: unsafe(), documentKey });
    if (message.type === "SCAN") {
      const accepted = !running && !unsafe(); reply({ accepted });
      if (accepted) void scan(message);
    }
  });
  void send({ type: "READY", account: P.identity(document), unsafe: unsafe(), documentKey });
})();
