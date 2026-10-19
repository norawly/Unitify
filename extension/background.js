import { VERSION, normalizeRecord, changes } from "./lib/model.mjs";

const API = "https://s.zhengisbay.com/api/lms/";
const LMS = "https://lms.astanait.edu.kz";
const store = chrome.storage.local;
const trusted = store.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
let busy = false, syncing = false;
async function get() { await trusted; return store.get(null); }
async function tabs() { return chrome.tabs.query({ url: LMS + "/*" }); }
const danger = t => /\/mod\/quiz\/(attempt|processattempt|startattempt|summary)\.php|action=(editsubmission|submit|submitassignment)/.test(t.url || "");
const extensionSender = sender => sender.id === chrome.runtime.id && !sender.tab && sender.url?.startsWith(chrome.runtime.getURL(""));
const contentSender = sender => sender.id === chrome.runtime.id && sender.tab?.id && sender.url?.startsWith(LMS + "/");
async function api(path, body, token) {
  const response = await fetch(API + path, { method: "POST", credentials: "omit", redirect: "error",
    headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  if (!response.ok) {
    const error = Error(data.error || "Ошибка синхронизации"); error.status = response.status; throw error;
  }
  return data;
}
async function run(force = false, preferredTab = null) {
  const state = await get(), open = await tabs();
  if (!state.token) return store.set({ status: "Подключите Telegram кодом из /extension. До привязки сбор отключён." });
  if (state.paused || busy || (state.scanStarted && open.some(t => t.id === state.activeTab) && Date.now() - (state.scanHeartbeat || state.scanStarted) < 90000)) return;
  if (state.backoffUntil > Date.now()) return store.set({ status: "Moodle ограничил запросы. Проверка отложена до " + new Date(state.backoffUntil).toLocaleTimeString("ru-RU") });
  if (state.lastStart && Date.now() - state.lastStart < 5000) return;
  if (!force && state.lastScan && Date.now() - state.lastScan < 10 * 60000) return;
  if (open.some(danger)) return store.set({ status: "Пауза: открыта попытка теста или редактируется ответ." });
  if (!open.length) return store.set({ status: "Откройте Moodle и войдите в аккаунт для обновления." });
  busy = true;
  try {
    const tab = open.find(t => t.id === preferredTab) || open.find(t => t.active) || open[0];
    const check = await chrome.tabs.sendMessage(tab.id, { type: "CHECK" });
    if (!check?.account || check.unsafe) return store.set({ status: "Сначала войдите в Moodle. Во время теста сбор отключён." });
    if (state.boundAccount && check.account !== state.boundAccount) return store.set({ status: "Открыт другой Moodle-аккаунт. Сбор остановлен." });
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await store.set({ runId, scanUploaded: false, lastStart: Date.now(), scanStarted: Date.now(), scanHeartbeat: Date.now(), activeTab: tab.id, activeDocument: check.documentKey, errors: [], status: "Обновляю базу Moodle…" });
    const result = await chrome.tabs.sendMessage(tab.id, { type: "SCAN", runId, catalog: state.catalogs?.[check.account], gradeSignatures: state.gradeSignatures?.[check.account] || {} });
    if (!result?.accepted) await store.set({ scanStarted: null, activeTab: null, status: "Обновите вкладку Moodle, затем повторите сбор." });
  } catch { await store.set({ scanStarted: null, activeTab: null, status: "Обновите вкладку Moodle, затем повторите сбор." }); }
  finally { busy = false; }
}
async function cloudSync(final = false) {
  if (syncing) {
    if (final) { await new Promise(resolve => setTimeout(resolve, 250)); return cloudSync(true); }
    return;
  }
  syncing = true;
  try {
  let state = await get();
  if (!state.token || !state.pending || state.paused) return;
  if (state.cloudRetryAt > Date.now()) return;
  const wait = state.cloudAt ? 8500 - (Date.now() - state.cloudAt) : 0;
  if (wait > 0) {
    if (!final) return;
    await new Promise(resolve => setTimeout(resolve, wait));
    state = await get();
    if (!state.token || !state.pending || state.paused) return;
  }
  const pending = state.pending;
  try {
    if (state.boundAccount && pending.account !== state.boundAccount) throw Error("Другой аккаунт Moodle. Передача остановлена; используйте свой исходный аккаунт.");
    const response = await api("sync", { version: VERSION, account: pending.account, groups: pending.groups, gradeCards: pending.gradeCards || [] }, state.token);
    const gradeSignatures = { ...(state.gradeSignatures || {}) };
    gradeSignatures[pending.account] = { ...(gradeSignatures[pending.account] || {}) };
    for (const card of pending.gradeCards || []) gradeSignatures[pending.account][card.courseId] = card.signature;
    await store.set({ cloudAt: Date.now(), scanUploaded: true, gradeSignatures, boundAccount: pending.account, manualDone: response.manualDone, cloudError: null });
    // Do not erase a newer scan if it completed while the previous request was in flight.
    const fresh = await get();
    if (fresh.pending?.runId === pending.runId && fresh.pending?.revision === pending.revision) await store.remove("pending");
  } catch (e) {
    await store.set({ cloudError: e.message });
    if (e.status === 429) await store.set({ cloudRetryAt: Date.now() + 60000 });
    if ([401, 403].includes(e.status)) await store.remove("token");
  }
  } finally { syncing = false; }
}
async function receive(result) {
  if (!/^\d+$/.test(result.account || "") || !Array.isArray(result.groups)) throw Error("Некорректный результат Moodle");
  const state = await get();
  const accounts = state.accounts || {}, previous = accounts[result.account] || { records: {}, scopes: [], history: [] };
  const records = { ...previous.records }, scopes = new Set(previous.scopes), history = [...previous.history];
  const invalid = [], groups = result.groups.flatMap(group => {
    if (!/^\d+:(grade|assignment|attendance:\d+)$/.test(group.scope)) throw Error("Некорректная область данных");
    const items = [];
    for (const raw of group.records) {
      try { items.push(normalizeRecord(raw)); }
      catch (e) { invalid.push({ scope: group.scope, message: e.message }); }
    }
    if (group.records.length && !items.length) return [];
    for (const item of items) {
      const old = records[item.id];
      if (item.kind === "assignment" && item.status === "unknown" && old) item.status = old.status;
      const change = changes(old, item);
      if (scopes.has(group.scope) && change) history.unshift({ at: result.capturedAt, change, before: old || null, after: item });
      records[item.id] = item;
    }
    scopes.add(group.scope);
    return [{ scope: group.scope, records: items }];
  });
  accounts[result.account] = { records, scopes: [...scopes], history: history.slice(0, 500) };
  const catalogs = { ...(state.catalogs || {}) };
  if (result.catalog?.account === result.account) catalogs[result.account] = result.catalog;
  const errors = [...(result.errors || []), ...invalid];
  const update = { accounts, catalogs, account: result.account, scanHeartbeat: Date.now(), backoffUntil: result.retryAt || null,
    pending: { ...result, groups }, errors, pages: result.pages || 0,
    status: `${result.final ? "Обновлено" : "Получено"}: ${Object.keys(records).length} записей · ${result.pages || 0} страниц${errors.length ? ` · ошибок: ${errors.length}` : ""}` };
  if (result.final) Object.assign(update, { lastScan: result.capturedAt, scanStarted: null, activeTab: null, activeDocument: null });
  await store.set(update);
  if (groups.length && (result.final || !state.scanUploaded)) await cloudSync(!!result.final);
}
async function message(msg, sender) {
  const ui = extensionSender(sender), content = contentSender(sender);
  if (!ui && !content) return { error: "Forbidden" };
  if (ui) {
    if (msg.type === "STATE") {
      const { token, pending, catalogs, accounts, ...safe } = await get();
      return { ...safe, connected: !!token };
    }
    if (msg.type === "DIAGNOSTICS") {
      const s = await get(), records = Object.values(s.accounts?.[s.account]?.records || {});
      return { protocol: VERSION, extensionVersion: "0.2.0", connected: !!s.token, paused: !!s.paused, lastScan: s.lastScan || null, pages: s.pages || 0,
        cloudAt: s.cloudAt || null, status: s.status || null, cloudError: s.cloudError || null,
        backoffUntil: s.backoffUntil || null, pendingGroups: s.pending?.groups?.length || 0,
        counts: Object.fromEntries(["assignment", "grade", "attendance"].map(kind => [kind, records.filter(r => r.kind === kind).length])),
        errors: (s.errors || []).map(e => ({ scope: String(e.scope).replace(/\d+/g, "*"), message: String(e.message).slice(0, 180) })) };
    }
    if (msg.type === "PAIR") {
      const response = await api("pair", { code: String(msg.code).toUpperCase().replace(/[^A-Z2-9]/g, "") });
      await store.set({ token: response.token, boundAccount: response.account || null, cloudError: null, cloudAt: null });
      await cloudSync(); await run(true); return { ok: true };
    }
    if (msg.type === "UNPAIR") {
      const state = await get();
      if (state.token) await api("revoke", {}, state.token);
      await store.remove(["token", "boundAccount", "pending", "manualDone", "cloudAt", "gradeSignatures"]); return { ok: true };
    }
    if (msg.type === "CLEAR") { await store.remove(["accounts", "account", "pending", "errors", "catalogs"]); return { ok: true }; }
    if (msg.type === "PAUSE") {
      await store.set({ paused: !!msg.paused });
      if (!msg.paused) { await cloudSync(); await run(true); }
      return { ok: true };
    }
    if (msg.type === "SYNC") { await cloudSync(); await run(true); return { ok: true }; }
  }
  if (content) {
    if (msg.type === "READY") {
      const state = await get();
      if (state.activeTab === sender.tab.id && state.activeDocument && state.activeDocument !== msg.documentKey)
        await store.set({ scanStarted: null, activeTab: null, runId: null, lastStart: null });
      if (!msg.unsafe && msg.account) await run(true, sender.tab.id);
      return { ok: true };
    }
    const state = await get();
    if (!state.token || state.activeTab !== sender.tab.id || (state.runId && msg.runId !== state.runId)) return { stop: true };
    if (msg.type === "PROGRESS") {
      const stop = !state.token || state.paused || (await tabs()).some(danger);
      await store.set({ scanHeartbeat: Date.now(), status: stop ? "Сбор приостановлен." : `Читаю Moodle · страниц ${msg.pages}, разделов ${msg.groups}, ошибок ${msg.errors}` });
      return { stop };
    }
    if (msg.type === "RESULT" || msg.type === "CHECKPOINT") {
      if (state.paused || (await tabs()).some(danger)) return { stop: true };
      await receive(msg); return { ok: true };
    }
    if (msg.type === "SCAN_ERROR") { await store.set({ scanStarted: null, scanHeartbeat: null, activeTab: null, backoffUntil: msg.retryAt || null, status: String(msg.message).slice(0, 200) }); return { ok: true }; }
  }
  return { error: "Unknown action" };
}
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  message(msg, sender).then(reply).catch(e => reply({ error: e.message })); return true;
});
chrome.alarms.create("reader", { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === "reader") void cloudSync().then(() => run()).catch(() => {}); });
