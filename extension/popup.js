const $ = s => document.querySelector(s);
const api = message => chrome.runtime.sendMessage(message);
let state = {};
const time = value => value ? new Date(value).toLocaleString("ru-RU", { timeZone: "Asia/Almaty", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "ещё не было";
async function refresh() {
  state = await api({ type: "STATE" });
  $("#enabled").checked = state.connected && !state.paused;
  $("#enabled").disabled = !state.connected;
  $("#sync").disabled = !state.connected || state.paused;
  $("#pair").hidden = state.connected;
  $("#unpair").hidden = !state.connected;
  $("#status").textContent = !state.connected ? "Введите код из Telegram." : state.paused ? "Синхронизация приостановлена." : state.status || "Готов к синхронизации.";
  $("#timestamps").textContent = "База в Telegram: " + time(state.cloudAt);
  $("#notice").textContent = state.cloudError || "";
  $("#notice").hidden = !state.cloudError;
  const latest = state.syncContext?.version;
  const version = chrome.runtime.getManifest().version;
  const newer = latest && /^\d+\.\d+\.\d+$/.test(latest) && latest.split(".").reduce((result, n, i) => result || Math.sign(+n - +(version.split(".")[i] || 0)), 0) > 0;
  $("#update").hidden = !newer;
  $("#update").textContent = "Скачать обновление " + (newer ? latest : "");
}
async function act(message) {
  try { const result = await api(message); if (result?.error) throw Error(result.error); await refresh(); }
  catch (e) { $("#notice").textContent = e.message; $("#notice").hidden = false; }
}
$("#pair").onsubmit = e => { e.preventDefault(); void act({ type: "PAIR", code: $("#code").value }); };
$("#sync").onclick = () => act({ type: "SYNC" });
$("#update").onclick = () => chrome.tabs.create({ url: "https://s.zhengisbay.com/downloads/unitify-moodle-reader.zip?v=" + encodeURIComponent(state.syncContext.version) });
$("#enabled").onchange = () => act({ type: "PAUSE", paused: !$("#enabled").checked });
$("#unpair").onclick = () => act({ type: "UNPAIR" });
$("#clear").onclick = () => { if (confirm("Очистить локальную копию? База бота сохранится.")) void act({ type: "CLEAR" }); };
$("#preferences").onclick = () => { $("#options").hidden = !$("#options").hidden; $("#preferences").setAttribute("aria-expanded", String(!$("#options").hidden)); };
$("#diagnostics").onclick = async () => {
  const report = await api({ type: "DIAGNOSTICS" });
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = "unitify-reader-diagnostics.json"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
chrome.storage.onChanged.addListener(() => { void refresh(); });
void refresh();
