/* Русский и английский. Названия предметов — настоящие, как в Moodle и в учебном плане,
   а не машинный перевод. */

export const SUBJECT_EN = {
  "Безопасность компьютерных сетей": "Computer Networks Security",
  "Этический хакинг": "Ethical Hacking",
  "Веб-безопасность": "Web Security",
  "Методы и инструменты исследования": "Research Methods and Tools",
  "Введение в анализ компьютерных вредоносных программ": "Introduction to Computer Malware Analysis",
  "Введение в анализ вредоносных программ": "Introduction to Computer Malware Analysis",
  "Технологическое предпринимательство": "Technological Entrepreneurship",
  "Предпринимательство": "Entrepreneurship",
  "Введение в поиск угроз": "Introduction to Threat Hunting",
  "Облачные вычисления": "Cloud Computing",
  "Компьютерные сети": "Computer Networks",
  "Управление проектами": "Project Management",
  "Основы компьютерной графики": "Computer Graphics Fundamentals",
  "Философия": "Philosophy",
};

export const PLACE_EN = {
  "Главный корпус": "Main building",
  "Корпус Коркем": "Korkem building",
  "Корпус IEC": "IEC building",
  "Актовый зал": "Assembly Hall",
  "Кибер-лаборатория": "Cyber lab",
};

const DICT = {
  ru: {
    lecture: "лекция", practice: "практика", lab: "лаб. работа", seminar: "семинар", other: "занятие",
    days: ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"],
    daysShort: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
    months: ["января", "февраля", "марта", "апреля", "мая", "июня",
             "июля", "августа", "сентября", "октября", "ноября", "декабря"],
    monthsShort: ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
    when: ["в понедельник", "во вторник", "в среду", "в четверг", "в пятницу", "в субботу", "в воскресенье"],

    online: "Онлайн", room: "Кабинет", window: "окно", floorAt: n => `${n} этаж`, blockAt: b => `блок ${b}`,
    today: "сегодня", tomorrow: "завтра", now: "сейчас",
    d: "д", h: "ч", min: "мин",

    hi: "Привет", start_intro:
      "Я <b>Schedule</b> — напоминаю о парах за 20 минут и показываю, где кабинет.",
    start_ask: "🎫 Отправь свой <b>баркод</b> — найду твоё расписание.",
    ask_barcode: "🎫 Отправь свой баркод — найду расписание. Или нажми /start",
    found: code => `✅ Нашёл расписание по баркоду <b>${code}</b>.`,
    switched: code => `✅ Переключил на баркод <b>${code}</b>.`,
    no_places: "😔 Мест больше нет — бот только для своих.",
    locked: "🔒 <b>Это расписание закрыто.</b>\n\nОно личное и привязано к другому аккаунту.",
    welcome: lead =>
      `🔔 Буду напоминать о каждой паре <b>за ${lead} мин</b>: предмет, время и кабинет на карте.\n\n` +
      "🌐 Расписание целиком — кнопка «Расписание». Остальное — в ⚙️ Настройках.\n" +
      "📍 Напиши номер кабинета, например <code>2.232P</code>, — покажу, где он.",

    menu_next: "⏭ Следующая пара", menu_settings: "⚙️ Настройки", menu_site: "🌐 Расписание",
    btn_map: "🗺 Открыть на карте", btn_lms: "💻 Открыть LMS", btn_refresh: "🔄 Обновить",
    btn_day: "📅 Весь день", btn_back: "◀️ Назад", btn_task: "📄 Показать задание",

    in_time: t => `Пара через ${t}`,
    live_now: t => `Идёт сейчас · ещё ${t}`,
    next_in: t => `Следующая пара · через ${t}`,
    passed: "Пара прошла",
    no_more: "🏁 Пар больше нет — триместр позади",
    no_classes: "😌 Пар нет",

    settings: "⚙️ <b>Настройки</b>",
    s_schedule: "Расписание", s_remind: "Напоминания", s_lang: "Язык",
    s_remind_off: "выключены", s_remind_on: "включены", s_remind_at: n => `за ${n} мин до пары`,
    cal_note: "Проверяю раз в минуту. Утром пришлю то, что сдавать в ближайшие два дня, вечером — весь список.",
    s_moodle: "Дедлайны из Moodle", s_moodle_on: "подключены", s_moodle_off: "не подключены",
    btn_today: "📅 Календарь на сегодня", btn_preview: "👀 Пример напоминания",
    btn_barcode: "🎫 Другой баркод", btn_lang: "🌐 English", btn_moodle: "📚 Дедлайны Moodle",

    deadlines: "📚 <b>Дедлайны</b>", no_deadlines: "Ближайших дедлайнов нет 🎉",
    due_in: t => `через ${t}`, due_today: "сегодня", overdue: "просрочено",
    cal_how:
      "📚 <b>Дедлайны из Moodle</b>\n\nЧтобы бот видел твои задания:\n\n" +
      "1. Открой <a href=\"https://lms.astanait.edu.kz\">lms.astanait.edu.kz</a> и нажми на себя справа сверху → <b>Календарь</b>\n" +
      "2. Пролистай вниз → <b>Import or export calendars</b>\n" +
      "3. <b>Export</b> → выбери <b>All events</b> и <b>Custom range</b>\n" +
      "4. Нажми <b>Get calendar URL</b> и пришли ссылку сюда\n\n" +
      "<i>Ссылка личная — храню её только для твоих напоминаний. В Moodle её можно в любой момент сгенерировать заново.</i>",
    cal_bad: "Это не похоже на ссылку календаря Moodle. Она начинается с https://lms.astanait.edu.kz/calendar/export_execute.php",
    cal_fail: "Не смог открыть эту ссылку. Проверь, что скопировал её целиком.",
    cal_ok: n => `✅ Календарь подключён. Нашёл дедлайнов: ${n}.`,
    cal_off: "🔌 Календарь отключён, дедлайны больше не проверяю.",
    btn_cal_off: "🔌 Отключить календарь",
    new_deadline: "🆕 <b>Новое задание</b>",
    moved_deadline: "♻️ <b>Дедлайн перенесли</b>",
    due_soon: t => `⏳ <b>Дедлайн через ${t}</b>`,
    too_fast: n => `⏳ <b>Превышен лимит запросов</b>\n\nДопустимо ${n} обращений в минуту. ` +
      "Бот временно не отвечает — подождите минуту и повторите.",
    morning: "☀️ <b>Доброе утро!</b>",
    morning_none: "☀️ <b>Доброе утро!</b>\n\nСегодня пар нет — отдыхай.",
    due_soon_head: "📚 <b>Сдать в ближайшие два дня</b>",
    due_none_soon: "📚 На ближайшие два дня дедлайнов нет 🎉",
    evening: "🌙 <b>Пары на сегодня закончились</b>",
    menu_today: "📅 Сегодня", menu_deadlines: "📚 Дедлайны", menu_hint: "Меню внизу 👇",
    s_geo: "Геолокация", s_geo_on: "включена", s_geo_off: "выключена", btn_geo: "📍 Геолокация",
    geo_title: "📍 <b>Напоминания по геолокации</b>",
    geo_how:
      "Не в университете напомню заранее, в университете — перед самой парой.\n\n" +
      "Самое удобное — <b>транслировать геопозицию</b>: 📎 → Геопозиция → «Транслировать геопозицию» → «Пока не выключу». " +
      "Бот видит только последнюю точку и ничего не хранит в истории.\n\n" +
      "Если трансляции нет, перед первой парой спрошу, где ты.",
    geo_now: p => `Сейчас: <b>${p}</b>`,
    place_campus: "в университете", place_away: "не в университете", place_unknown: "неизвестно",
    btn_geo_on: "✅ Включить", btn_geo_off: "⏸ Выключить",
    geo_home: n => `🏠 Не в универе: за ${n} мин`, geo_campus: n => `🎓 В универе: за ${n} мин`,
    btn_send_loc: "📍 Отправить геопозицию",
    geo_got: (p, d) => `📍 Получил: ты <b>${p}</b>` + (d != null ? ` (${d < 1000 ? d + " м" : (d / 1000).toFixed(1) + " км"} до корпуса)` : ""),
    btn_set_campus: "🎓 Я в университете — запомнить точку",
    campus_saved: "✅ Запомнил: это университет.",
    campus_wrong: "Если ты сейчас в университете, а я ошибся — нажми, и я запомню это место.",
    geo_ask: "📍 <b>Скоро пары.</b> Ты где? Отправь геопозицию — подстрою, когда напомнить.",
    moodle_diff: "🔍 <b>В Moodle расписание другое</b>",
    moodle_diff_note: "Проверь на сайте университета — возможно, пару перенесли.",
  },

  en: {
    lecture: "lecture", practice: "practice", lab: "lab", seminar: "seminar", other: "activity",
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    daysShort: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    months: ["January", "February", "March", "April", "May", "June",
             "July", "August", "September", "October", "November", "December"],
    monthsShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    when: ["on Monday", "on Tuesday", "on Wednesday", "on Thursday", "on Friday", "on Saturday", "on Sunday"],

    online: "Online", room: "Room", window: "break", floorAt: n => `floor ${n}`, blockAt: b => `block ${b}`,
    today: "today", tomorrow: "tomorrow", now: "now",
    d: "d", h: "h", min: "min",

    hi: "Hi", start_intro:
      "I'm <b>Schedule</b> — I remind you 20 minutes before each class and show where the room is.",
    start_ask: "🎫 Send your <b>barcode</b> and I'll find your timetable.",
    ask_barcode: "🎫 Send your barcode to get your timetable. Or press /start",
    found: code => `✅ Found the timetable for barcode <b>${code}</b>.`,
    switched: code => `✅ Switched to barcode <b>${code}</b>.`,
    no_places: "😔 No seats left — this bot is for friends only.",
    locked: "🔒 <b>This timetable is private.</b>\n\nIt is locked to its owner's Telegram account.",
    welcome: lead =>
      `🔔 I'll remind you <b>${lead} min</b> before every class: subject, time and the room on the map.\n\n` +
      "🌐 Full timetable — the «Timetable» button. Everything else is in ⚙️ Settings.\n" +
      "📍 Send a room number, e.g. <code>2.232P</code>, and I'll show where it is.",

    menu_next: "⏭ Next class", menu_settings: "⚙️ Settings", menu_site: "🌐 Timetable",
    btn_map: "🗺 Show on map", btn_lms: "💻 Open LMS", btn_refresh: "🔄 Refresh",
    btn_day: "📅 Whole day", btn_back: "◀️ Back", btn_task: "📄 Show task",

    in_time: t => `Class in ${t}`,
    live_now: t => `In progress · ${t} left`,
    next_in: t => `Next class · in ${t}`,
    passed: "Class finished",
    no_more: "🏁 No more classes — the term is over",
    no_classes: "😌 No classes",

    settings: "⚙️ <b>Settings</b>",
    s_schedule: "Timetable", s_remind: "Reminders", s_lang: "Language",
    s_remind_off: "off", s_remind_on: "on", s_remind_at: n => `${n} min before class`,
    cal_note: "Checked every minute. In the morning I send what is due within two days, in the evening — the full list.",
    s_moodle: "Moodle deadlines", s_moodle_on: "connected", s_moodle_off: "not connected",
    btn_today: "📅 Today's calendar", btn_preview: "👀 Reminder preview",
    btn_barcode: "🎫 Another barcode", btn_lang: "🌐 Русский", btn_moodle: "📚 Moodle deadlines",

    deadlines: "📚 <b>Deadlines</b>", no_deadlines: "No upcoming deadlines 🎉",
    due_in: t => `in ${t}`, due_today: "today", overdue: "overdue",
    cal_how:
      "📚 <b>Moodle deadlines</b>\n\nTo let the bot see your assignments:\n\n" +
      "1. Open <a href=\"https://lms.astanait.edu.kz\">lms.astanait.edu.kz</a>, click your avatar (top right) → <b>Calendar</b>\n" +
      "2. Scroll down → <b>Import or export calendars</b>\n" +
      "3. <b>Export</b> → pick <b>All events</b> and <b>Custom range</b>\n" +
      "4. Press <b>Get calendar URL</b> and send the link here\n\n" +
      "<i>The link is private — I keep it only for your reminders. You can regenerate it in Moodle anytime.</i>",
    cal_bad: "That doesn't look like a Moodle calendar link. It starts with https://lms.astanait.edu.kz/calendar/export_execute.php",
    cal_fail: "Couldn't open that link. Make sure you copied all of it.",
    cal_ok: n => `✅ Calendar connected. Deadlines found: ${n}.`,
    cal_off: "🔌 Calendar disconnected, deadlines are no longer checked.",
    btn_cal_off: "🔌 Disconnect calendar",
    new_deadline: "🆕 <b>New assignment</b>",
    moved_deadline: "♻️ <b>Deadline moved</b>",
    due_soon: t => `⏳ <b>Deadline in ${t}</b>`,
    too_fast: n => `⏳ <b>Rate limit exceeded</b>\n\nThe limit is ${n} requests per minute. ` +
      "The bot is paused for you — please wait a minute and try again.",
    morning: "☀️ <b>Good morning!</b>",
    morning_none: "☀️ <b>Good morning!</b>\n\nNo classes today — enjoy.",
    due_soon_head: "📚 <b>Due in the next two days</b>",
    due_none_soon: "📚 Nothing due in the next two days 🎉",
    evening: "🌙 <b>Classes are over for today</b>",
    menu_today: "📅 Today", menu_deadlines: "📚 Deadlines", menu_hint: "Menu is below 👇",
    s_geo: "Location", s_geo_on: "on", s_geo_off: "off", btn_geo: "📍 Location",
    geo_title: "📍 <b>Location-based reminders</b>",
    geo_how:
      "Away from campus I'll remind you early, on campus — right before class.\n\n" +
      "Best option: <b>share live location</b>: 📎 → Location → «Share My Live Location» → «Until I turn it off». " +
      "The bot only sees your latest point and keeps no history.\n\n" +
      "Without live sharing I'll ask where you are before your first class.",
    geo_now: p => `Now: <b>${p}</b>`,
    place_campus: "on campus", place_away: "away from campus", place_unknown: "unknown",
    btn_geo_on: "✅ Turn on", btn_geo_off: "⏸ Turn off",
    geo_home: n => `🏠 Away: ${n} min before`, geo_campus: n => `🎓 On campus: ${n} min before`,
    btn_send_loc: "📍 Send location",
    geo_got: (p, d) => `📍 Got it: you are <b>${p}</b>` + (d != null ? ` (${d < 1000 ? d + " m" : (d / 1000).toFixed(1) + " km"} to campus)` : ""),
    btn_set_campus: "🎓 I'm on campus — remember this spot",
    campus_saved: "✅ Saved: this is campus.",
    campus_wrong: "If you are on campus right now and I got it wrong, tap to remember this spot.",
    geo_ask: "📍 <b>Classes soon.</b> Where are you? Send your location and I'll time the reminder.",
    moodle_diff: "🔍 <b>Moodle shows a different timetable</b>",
    moodle_diff_note: "Check the university site — the class may have been moved.",
  },
};

export const t = lang => DICT[lang === "en" ? "en" : "ru"];
export const subject = (name, lang) => (lang === "en" && SUBJECT_EN[name]) || name;
export const placeName = (name, lang) => (lang === "en" && PLACE_EN[name]) || name;

/* «2 ч 30 мин» / «2 h 30 min» */
export function durIn(m, lang) {
  const L = t(lang), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), r = m % 60;
  if (d) return `${d} ${L.d}` + (h ? ` ${h} ${L.h}` : "");
  if (h) return `${h} ${L.h}` + (r ? ` ${r} ${L.min}` : "");
  return `${r} ${L.min}`;
}
