/* ============================================================
   РАСПИСАНИЕ НУРАЛИ — s.zhengisbay.com/nurali

   Поля пары:
     start, end  — "ЧЧ:ММ"
     subject     — название предмета
     type        — "lecture" | "practice" | "lab" | "seminar"
     online      — true, если пара онлайн (тогда room/building не нужны)
     code        — код курса (CNS53-EN-P359), НЕ кабинет
     room        — кабинет (C1.2.232P, 302P, «Актовый зал»)
     building    — корпус (Главный корпус, Корпус Коркем)
     note        — примечание к кабинету (напр. «Кибер-лаборатория»)
     teacher     — преподаватель ("" — ещё не назначен)
   ============================================================ */
window.SCHEDULE = {
  private: true,          // закрыто: только свой аккаунт в Telegram
  owner: "Нурали",
  barcode: "",            // подставить свой баркод, чтобы бот находил по нему
  group: "CS-2411",
  year: "2026–2027",
  period: "Осенний триместр",
  updated: "2026-10-19",

  /* Границы триместра из академического календаря 3 курса.
     study — идут пары, exams — сессия, vacation — каникулы, дальше календарь кончается. */
  term: {
    name:     "Осенний триместр",
    study:    ["2026-09-07", "2026-11-14"],
    exams:    ["2026-11-16", "2026-11-28"],
    vacation: ["2026-11-30", "2026-12-05"],
    holidays: { "2026-10-25": "День Республики", "2026-10-26": "Выходной — День Республики" }
  },

  // короткие метки предметов (для бейджей в календаре)
  subjects: {
    "Безопасность компьютерных сетей":                     "CNS",
    "Этический хакинг":                                    "EH",
    "Веб-безопасность":                                    "WS",
    "Методы и инструменты исследования":                   "RMT",
    "Введение в анализ компьютерных вредоносных программ":  "ICMA",
    "Технологическое предпринимательство":                 "TE"
  },

  days: {
    mon: [
      { start:"12:00", end:"12:50", subject:"Безопасность компьютерных сетей", type:"lecture",  code:"CNS53-EN-L153", room:"C1.3.370L", building:"Главный корпус", teacher:"Абишев А." },
      { start:"13:05", end:"13:55", subject:"Безопасность компьютерных сетей", type:"lecture",  code:"CNS53-EN-L153", room:"C1.3.370L", building:"Главный корпус", teacher:"Абишев А." },
      { start:"14:00", end:"14:50", subject:"Этический хакинг",                type:"practice", code:"EH53-EN-P215",  online:true, teacher:"Хабиб С." },
      { start:"15:00", end:"15:50", subject:"Этический хакинг",                type:"practice", code:"EH53-EN-P215",  online:true, teacher:"Хабиб С." },
      { start:"18:00", end:"18:50", subject:"Безопасность компьютерных сетей", type:"practice", code:"CNS53-EN-P359", room:"C1.1.355P", building:"Главный корпус", teacher:"Сапаш С.А." },
      { start:"19:00", end:"19:50", subject:"Безопасность компьютерных сетей", type:"practice", code:"CNS53-EN-P359", room:"C1.1.355P", building:"Главный корпус", teacher:"Сапаш С.А." }
    ],

    tue: [
      { start:"12:00", end:"12:50", subject:"Веб-безопасность",                                   type:"practice", code:"WS53-EN-P115",  room:"C1.2.232P", building:"Главный корпус", teacher:"Жумагалиева С." },
      { start:"13:05", end:"13:55", subject:"Веб-безопасность",                                   type:"practice", code:"WS53-EN-P115",  room:"C1.2.232P", building:"Главный корпус", teacher:"Жумагалиева С." },
      { start:"14:00", end:"14:50", subject:"Методы и инструменты исследования",                   type:"practice", code:"RMT53-EN-P334", room:"C1.1.143",  building:"Главный корпус", teacher:"Есентай Н.Т." },
      { start:"15:00", end:"15:50", subject:"Методы и инструменты исследования",                   type:"practice", code:"RMT53-EN-P334", room:"C1.1.143",  building:"Главный корпус", teacher:"Есентай Н.Т." },
      { start:"16:00", end:"16:50", subject:"Введение в анализ компьютерных вредоносных программ", type:"lecture",  code:"ICMA53-EN-L4", room:"C1.1.334L", building:"Главный корпус", teacher:"Рамазанова З.Е." },
      { start:"17:00", end:"17:50", subject:"Введение в анализ компьютерных вредоносных программ", type:"lecture",  code:"ICMA53-EN-L4", room:"C1.1.334L", building:"Главный корпус", teacher:"Рамазанова З.Е." },
      { start:"18:00", end:"18:50", subject:"Веб-безопасность",                                   type:"practice", code:"WS53-EN-P115",  room:"C1.2.221K", building:"Главный корпус", teacher:"Жумагалиева С." },
      { start:"19:00", end:"19:50", subject:"Введение в анализ компьютерных вредоносных программ", type:"practice", code:"ICMA53-EN-P12", room:"C1.1.327",  building:"Главный корпус", note:"Кибер-лаборатория", teacher:"Рамазанова З.Е." }
    ],

    wed: [
      { start:"09:00", end:"09:50", subject:"Этический хакинг",                  type:"lecture",  code:"EH53-EN-L189",  online:true, teacher:"Waleed E." },
      { start:"10:00", end:"10:50", subject:"Этический хакинг",                  type:"lecture",  code:"EH53-EN-L189",  online:true, teacher:"Waleed E." },
      { start:"11:00", end:"11:50", subject:"Веб-безопасность",                  type:"lecture",  code:"WS53-EN-L68",   online:true, teacher:"Almisreb A." },
      { start:"12:00", end:"12:50", subject:"Веб-безопасность",                  type:"lecture",  code:"WS53-EN-L68",   online:true, teacher:"Almisreb A." },
      { start:"16:00", end:"16:50", subject:"Этический хакинг",                  type:"practice", code:"EH53-EN-P215",  online:true, teacher:"Хабиб С." },
      { start:"17:00", end:"17:50", subject:"Методы и инструменты исследования", type:"practice", code:"RMT53-EN-P334", room:"C1.1.225P", building:"Главный корпус", teacher:"Есентай Н.Т." }
    ],

    thu: [
      { start:"09:00", end:"09:50", subject:"Технологическое предпринимательство", type:"lecture",  code:"TE51-EN-L59",  online:true, teacher:"Нургужина А.М." },
      { start:"10:00", end:"10:50", subject:"Технологическое предпринимательство", type:"lecture",  code:"TE51-EN-L59",  online:true, teacher:"Нургужина А.М." },
      { start:"19:00", end:"19:50", subject:"Технологическое предпринимательство", type:"practice", code:"TE51-EN-P178", room:"C1.2.233L", building:"Главный корпус", teacher:"Гарафутдинова Э.Р." }
    ],

    fri: [
      { start:"14:00", end:"14:50", subject:"Методы и инструменты исследования", type:"lecture",  code:"RMT53-EN-L370", room:"C1.3.234L", building:"Главный корпус", teacher:"Канатова А.Т." },
      { start:"15:00", end:"15:50", subject:"Методы и инструменты исследования", type:"lecture",  code:"RMT53-EN-L370", room:"C1.3.234L", building:"Главный корпус", teacher:"Канатова А.Т." },
      { start:"19:00", end:"19:50", subject:"Безопасность компьютерных сетей",   type:"practice", code:"CNS53-EN-P359", room:"C1.1.241K", building:"Главный корпус", teacher:"Сапаш С.А." }
    ],

    sat: [
      { start:"09:00", end:"09:50", subject:"Технологическое предпринимательство",                type:"practice", code:"TE51-EN-P178", room:"302P",     building:"Корпус Коркем",  teacher:"Гарафутдинова Э.Р." },
      { start:"10:00", end:"10:50", subject:"Технологическое предпринимательство",                type:"practice", code:"TE51-EN-P178", room:"302P",     building:"Корпус Коркем",  teacher:"Гарафутдинова Э.Р." },
      { start:"18:00", end:"18:50", subject:"Введение в анализ компьютерных вредоносных программ", type:"practice", code:"ICMA53-EN-P12", room:"C1.1.327", building:"Главный корпус", note:"Кибер-лаборатория", teacher:"Рамазанова З.Е." },
      { start:"19:00", end:"19:50", subject:"Введение в анализ компьютерных вредоносных программ", type:"practice", code:"ICMA53-EN-P12", room:"C1.1.327", building:"Главный корпус", note:"Кибер-лаборатория", teacher:"Рамазанова З.Е." }
    ],

    sun: []
  }
};
