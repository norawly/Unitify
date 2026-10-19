// Local-only UI fixture. No Moodle requests and no real student data.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../extension");
const samples = [
  { kind: "assignment", id: "assignment:1", course: "Example Course · Demo", title: "Weekly practical task", status: "submitted", due: Date.now() + 86400000, url: "https://lms.astanait.edu.kz/my/" },
  { kind: "assignment", id: "assignment:2", course: "Another Course · Demo", title: "Independent research", status: "draft", due: Date.now() + 2 * 86400000, url: "https://lms.astanait.edu.kz/my/" },
  { kind: "grade", id: "grade:1", course: "Example Course · Demo", title: "Lab report · DEMO", value: "85", range: "0–100", url: "https://lms.astanait.edu.kz/my/" },
  { kind: "attendance", id: "attendance:1:abc", course: "Example Course · Demo", title: "Lecture · DEMO", status: "Present", points: "2 / 2", dateText: "Mon · 12:00–14:00", url: "https://lms.astanait.edu.kz/my/" },
];
const state = { connected: false, status: "Демонстрация интерфейса · синтетические данные", account: "DEMO", lastScan: Date.now(), accounts: { DEMO: { records: Object.fromEntries(samples.map(s => [s.id, s])), history: [] } } };
const mock = `const demo=${JSON.stringify(state)};window.chrome={runtime:{sendMessage:async m=>{if(m.type==='STATE')return demo;if(m.type==='PAUSE')demo.paused=m.paused;return {ok:true}}},storage:{onChanged:{addListener(){}}}};`;
createServer(async (req, res) => {
  try {
    if (req.url === "/mock-chrome.js") { res.setHeader("content-type", "application/javascript"); return res.end(mock); }
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/icons/icon-192.png") { res.setHeader("content-type", "image/png"); return res.end(await readFile(resolve(root, "." + path))); }
    if (!["/popup.html", "/popup.js", "/popup.css"].includes(path)) { res.writeHead(404); return res.end(); }
    let body = await readFile(resolve(root, "." + path), "utf8");
    if (path.endsWith(".html")) body = body.replace('<script type="module"', '<script src="/mock-chrome.js"></script><script type="module"');
    res.setHeader("content-type", path.endsWith(".html") ? "text/html; charset=utf-8" : path.endsWith(".css") ? "text/css" : "application/javascript"); res.end(body);
  } catch { res.writeHead(500); res.end("Preview unavailable"); }
}).listen(8791, "127.0.0.1", () => console.log("Synthetic extension UI: http://127.0.0.1:8791/popup.html"));
