let state = {}, view = "assignment";
const $ = s => document.querySelector(s);
const api = msg => chrome.runtime.sendMessage(msg);
const time = v => v ? new Date(v).toLocaleString("ru-RU", { timeZone: "Asia/Almaty", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "ещё не было";
const status = { submitted: "Сдано в Moodle", draft: "Черновик", not_submitted: "Не сдано", unknown: "Статус не определён" };
const node = (tag, value, cls) => { const e = document.createElement(tag); e.textContent = value; if (cls) e.className = cls; return e; };
function draw() {
  $("#connection").textContent = state.connected ? `Telegram подключён${state.boundAccount ? " · Moodle ID " + state.boundAccount : " · ожидаю первый сбор"}` : "Telegram не подключён. Получите код командой /extension в боте.";
  $("#pairing").hidden = !!state.connected; $("#unpair").hidden = !state.connected;
  $("#mode").textContent = !state.connected ? "Не подключено" : state.paused ? "На паузе" : "Сбор включён";
  $("#modeHint").textContent = !state.connected ? "Введите код из Telegram для запуска" : state.paused ? "Новые проверки и передача отключены" : "Автопроверка через открытый Moodle";
  $("#enabled").checked = !!state.connected && !state.paused; $("#enabled").disabled = !state.connected; $("#dot").classList.toggle("paused", !!state.paused || !state.connected);
  $("#sync").disabled = !!state.paused || !state.connected;
  $("#status").textContent = !state.connected ? "Автосбор начнётся после привязки и входа в Moodle." : state.paused ? "Продолжите сбор переключателем выше." : state.status || "Откройте Moodle для первой проверки.";
  $("#timestamps").textContent = `Проверка: ${time(state.lastScan)} · Telegram: ${time(state.cloudAt)}`;
  const notice = state.cloudError || (state.errors?.length ? `${state.errors.length} разделов недоступны. Старые данные сохранены.` : "");
  $("#notice").textContent = notice; $("#notice").hidden = !notice;
  const data = state.accounts?.[state.account] || { records: {}, history: [] }, query = $("#search").value.toLowerCase();
  const records = view === "history" ? data.history : Object.values(data.records).filter(r => r.kind === view).sort((a, b) => a.course.localeCompare(b.course) || (a.due || Infinity) - (b.due || Infinity));
  const list = records.filter(r => JSON.stringify(view === "history" ? r.after : r).toLowerCase().includes(query));
  $("#count").textContent = String(list.length); const host = $("#content"); host.replaceChildren();
  if (!list.length) host.append(node("div", state.lastScan ? "Записей пока нет." : "Откройте Moodle и нажмите ↻. Первый сбор может занять несколько минут.", "empty"));
  for (const value of list) {
    const r = view === "history" ? value.after : value, card = node("article", "");
    const h = node("h3", ""), a = node("a", r.title); a.href = r.url; a.target = "_blank"; a.rel = "noreferrer"; h.append(a); card.append(h, node("div", r.course, "meta"));
    if (view === "history") card.append(node("div", `${time(value.at)} · ${value.change === "new" ? "Новая запись" : "Изменение"}`, "meta"));
    if (r.kind === "assignment") {
      card.append(node("div", status[r.status], "value" + (r.status === "submitted" ? " submitted" : "")));
      if (r.due || r.dueText) card.append(node("div", "Срок: " + (r.due ? time(r.due) : r.dueText), "meta"));
      if (r.grading) card.append(node("div", r.grading, "meta"));
      if (state.manualDone?.some(d => d.assignmentId === r.id.split(":")[1])) card.append(node("div", "В боте отмечено «Сделал»", "meta"));
    } else if (r.kind === "grade") {
      card.append(node("div", `${view === "history" && value.before ? value.before.value + " → " : ""}${r.value} · ${r.range}`, "value"));
      if (r.feedback) card.append(node("p", r.feedback));
    } else card.append(node("div", r.dateText, "meta"), node("div", `${r.status || "Нет отметки"} · ${r.points}`, "value"));
    host.append(card);
  }
}
async function refresh() { state = await api({ type: "STATE" }); draw(); }
async function act(message) {
  try { const r = await api(message); if (r?.error) throw Error(r.error); await refresh(); }
  catch (e) { $("#notice").textContent = e.message; $("#notice").hidden = false; }
}
$("#pair").addEventListener("submit", e => { e.preventDefault(); void act({ type: "PAIR", code: $("#code").value }); });
$("#sync").onclick = () => act({ type: "SYNC" });
$("#enabled").onchange = () => act({ type: "PAUSE", paused: !$("#enabled").checked });
$("#unpair").onclick = () => act({ type: "UNPAIR" });
$("#clear").onclick = () => { if (confirm("Удалить локальные данные? Данные в Telegram останутся.")) void act({ type: "CLEAR" }); };
$("#diagnostics").onclick = async () => {
  const report = await api({ type: "DIAGNOSTICS" });
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = "unitify-reader-diagnostics.json"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("#preferences").onclick = () => { $("#options").hidden = !$("#options").hidden; $("#preferences").setAttribute("aria-expanded", String(!$("#options").hidden)); };
$("#search").oninput = draw;
document.querySelectorAll("[data-view]").forEach(button => button.onclick = () => {
  view = button.dataset.view; document.querySelectorAll("[data-view]").forEach(b => b.classList.toggle("active", b === button)); draw();
});
chrome.storage.onChanged.addListener(() => { void refresh(); });
void refresh();
