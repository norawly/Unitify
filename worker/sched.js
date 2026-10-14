/* Логика расписания для бота — та же, что на сайте (public/app.js):
   склейка пар подряд, округление времени, периоды триместра. Даты — строки "YYYY-MM-DD". */

export const KEYS  = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const SHORT = { mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт", sat: "Сб", sun: "Вс" };
export const FULL  = { mon: "Понедельник", tue: "Вторник", wed: "Среда", thu: "Четверг", fri: "Пятница", sat: "Суббота", sun: "Воскресенье" };
export const WHEN  = { mon: "в понедельник", tue: "во вторник", wed: "в среду", thu: "в четверг", fri: "в пятницу", sat: "в субботу", sun: "в воскресенье" };
export const TYPE  = { lecture: "лекция", practice: "практика", lab: "лабораторная", seminar: "семинар", other: "занятие" };
const MON  = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MONF = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

export const mins = t => { const p = String(t || "0:0").split(":"); return (+p[0]) * 60 + (+p[1] || 0); };
export const hhmm = m => { const h = Math.floor(m / 60) % 24, r = m % 60; return (h < 10 ? "0" : "") + h + ":" + (r < 10 ? "0" : "") + r; };
export function dur(m) {
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), r = m % 60;
  if (d) return `${d} д ${h} ч`;
  if (h) return `${h} ч` + (r ? ` ${r} мин` : "");
  return `${r} мин`;
}

/* ---------- даты ---------- */
const at = iso => new Date(iso + "T00:00:00Z");
export const isoAdd = (iso, n) => { const d = at(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const dowOf = iso => at(iso).getUTCDay();
export const keyOf = iso => KEYS[(dowOf(iso) + 6) % 7];
export const weekStart = iso => isoAdd(iso, -((dowOf(iso) + 6) % 7));
export const fmtDate = iso => { const d = at(iso); return d.getUTCDate() + " " + MONF[d.getUTCMonth()]; };
export const fmtShort = iso => { const d = at(iso); return d.getUTCDate() + " " + MON[d.getUTCMonth()]; };
/* соседний учебный день (воскресенья пропускаем) */
export const stepDay = (iso, dir) => isoAdd(iso, dir);
export const dayLabel = iso => { const k = keyOf(iso); return SHORT[k] + " " + at(iso).getUTCDate(); };

/* текущее время в Астане (UTC+5); DEV_NOW — для локальной проверки */
export function localNow(env) {
  const off = +(env.TZ_OFFSET_MIN || 300);
  const ms = env.DEV_NOW ? Date.parse(env.DEV_NOW) : Date.now();
  const d = new Date(ms + off * 60000);
  return { ms, iso: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

/* ---------- пары ---------- */
function same(a, b) {
  return a.subject === b.subject && a.type === b.type && !!a.online === !!b.online &&
         (a.room || "") === (b.room || "") && (a.teacher || "") === (b.teacher || "");
}
export function blocks(S, key) {
  const arr = ((S.days && S.days[key]) || []).slice().sort((a, b) => mins(a.start) - mins(b.start));
  const out = [];
  let cur = null;
  for (const it of arr) {
    if (cur && same(cur.last, it) && mins(it.start) - mins(cur.last.end) <= 20) { cur.parts.push(it); cur.last = it; }
    else { cur = { it, last: it, parts: [it] }; out.push(cur); }
  }
  out.forEach((g, i) => {
    g.rs = mins(g.parts[0].start); g.re = mins(g.last.end);        // реальное время
    g.s = Math.floor(g.rs / 60) * 60; g.e = Math.ceil(g.re / 60) * 60; // округлённое для показа
    if (i && g.s < out[i - 1].e) g.s = out[i - 1].e;
  });
  return out;
}

export function dayState(S, iso) {
  const T = S.term || {};
  const holiday = (T.holidays || {})[iso];
  if (holiday) return { kind: "holiday", label: holiday };
  const inside = r => Array.isArray(r) && r.length === 2 && iso >= r[0] && iso <= r[1];
  if (inside(T.study)) return { kind: "study" };
  if (inside(T.exams)) return { kind: "exams", label: "сессия" };
  if (inside(T.vacation)) return { kind: "vacation", label: "каникулы" };
  return { kind: "none", label: T.study && iso < T.study[0] ? "занятия ещё не начались" : "триместр закончился" };
}
export function dayBlocks(S, iso) {
  const k = keyOf(iso);
  if (!k || dayState(S, iso).kind !== "study") return [];
  return blocks(S, k);
}

/* ближайшая пара: по умолчанию идущая сейчас; includeLive=false — только будущая */
export function nextClass(S, now, includeLive = true) {
  for (let i = 0; i < 15; i++) {
    const iso = isoAdd(now.iso, i);
    for (const g of dayBlocks(S, iso)) {
      if (i === 0) {
        if (includeLive && now.min >= g.rs && now.min < g.re) return { g, iso, live: true, left: g.re - now.min };
        if (g.rs > now.min) return { g, iso, live: false, wait: g.rs - now.min };
      } else return { g, iso, live: false, wait: i * 1440 - now.min + g.rs };
    }
  }
  return null;
}

/* ---------- кабинеты ---------- */
export const roomShort = r => String(r || "").replace(/^C1\./i, "");
export const bldg = it => { const b = it.building || ""; return (!b || /главный/i.test(b)) ? "" : b; };
export function floorOf(room) {
  const m = String(room || "").split(/[.\-]/).pop().match(/^(\d)\d{2}/);
  return m ? +m[1] : null;
}
export function blockOf(room) {
  const m = String(room || "").match(/^C1\.(\d)\./i);
  return m ? "C1." + m[1] : "";
}
/* номер из сообщения → кабинет главного корпуса: «2.232p» → «C1.2.232P» */
export function parseRoom(text) {
  const t = String(text || "").trim().toUpperCase().replace(/^С1/, "C1").replace(/\s+/g, "");
  let m = t.match(/^(?:C1\.)?(\d)\.(\d{3})([A-ZА-Я]?)$/);
  if (m) return { room: `C1.${m[1]}.${m[2]}${m[3]}`, main: true };
  m = t.match(/^(\d{3})([A-ZА-Я]?)$/);
  if (m) return { room: m[1] + m[2], main: false };
  return null;
}
/* ключ для карты: C1.2.221K → «2.221» (буква не важна), названия — в нижнем регистре */
export function mapKey(room) {
  const t = String(room || "").trim();
  const m = t.match(/^(?:C1\.)?(\d)\.(\d{2,4})[A-Za-zА-Яа-я]?$/i);
  return m ? `${m[1]}.${m[2]}` : t.toLowerCase();
}
/* номер без буквы на конце: C1.2.221K и C1.2.221P — один кабинет */
export const roomKey = r => String(r || "").toUpperCase().replace(/^C1\./, "").replace(/[A-ZА-Я]$/, "");

/* За сколько минут напоминать про пару из списка дня.
   Первая пара дня — за 40 минут (надо собраться и доехать), дальше — по окну перед ней:
   пары подряд — за 5 минут, окно час — за 10, два часа — за 20, три — за 30, больше — за 40. */
export function leadOf(list, i) {
  if (i === 0) return 40;
  const gap = list[i].rs - list[i - 1].re;
  if (gap <= 30) return 5;
  return Math.min(40, Math.max(10, Math.round(gap / 30) * 5));
}
