/* ============================================================
   РАСПИСАНИЕ — баркод 676767
   Поля пары — как в public/nurali/schedule.js
   ============================================================ */
window.SCHEDULE = {
  owner: "676767",
  barcode: "676767",
  hidden: true,                 // не показывать на странице выбора
  group: "",
  year: "2026–2027",
  period: "Осенний триместр",
  updated: "2026-09-18",

  term: {
    name:     "Осенний триместр",
    study:    ["2026-09-07", "2026-11-14"],
    exams:    ["2026-11-16", "2026-11-28"],
    vacation: ["2026-11-30", "2026-12-05"],
    holidays: { "2026-10-25": "День Республики", "2026-10-26": "Выходной — День Республики" }
  },

  subjects: {
    "Безопасность компьютерных сетей":       "CNS",
    "Этический хакинг":                      "EH",
    "Предпринимательство":                   "ENT",
    "Веб-безопасность":                      "WS",
    "Методы и инструменты исследования":     "RMT",
    "Введение в анализ вредоносных программ": "ICMA"
  },

  days: {
    mon: [
      { start:"12:00", end:"12:50", subject:"Безопасность компьютерных сетей", type:"lecture",  room:"Актовый зал", building:"Главный корпус", teacher:"Vacancy 1" },
      { start:"13:05", end:"13:55", subject:"Безопасность компьютерных сетей", type:"lecture",  room:"Актовый зал", building:"Главный корпус", teacher:"Vacancy 1" },
      { start:"14:00", end:"14:50", subject:"Этический хакинг",                type:"practice", online:true, teacher:"Хабиб С." },
      { start:"15:00", end:"15:50", subject:"Этический хакинг",                type:"practice", online:true, teacher:"Хабиб С." },
      { start:"16:00", end:"16:50", subject:"Предпринимательство",             type:"lecture",  room:"C1.3.370L", building:"Главный корпус", teacher:"Салыкова Л.Н." },
      { start:"17:00", end:"17:50", subject:"Предпринимательство",             type:"lecture",  room:"C1.3.370L", building:"Главный корпус", teacher:"Салыкова Л.Н." },
      { start:"18:00", end:"18:50", subject:"Безопасность компьютерных сетей", type:"practice", room:"C1.1.355P", building:"Главный корпус", teacher:"Сапаш С.А." },
      { start:"19:00", end:"19:50", subject:"Безопасность компьютерных сетей", type:"practice", room:"C1.1.355P", building:"Главный корпус", teacher:"Сапаш С.А." }
    ],

    tue: [
      { start:"12:00", end:"12:50", subject:"Веб-безопасность",                      type:"practice", room:"C1.2.232P", building:"Главный корпус", teacher:"Vacancy 3" },
      { start:"13:05", end:"13:55", subject:"Веб-безопасность",                      type:"practice", room:"C1.2.232P", building:"Главный корпус", teacher:"Vacancy 3" },
      { start:"14:00", end:"14:50", subject:"Методы и инструменты исследования",     type:"practice", room:"C1.1.143", building:"Главный корпус", teacher:"Есентай Н.Т." },
      { start:"15:00", end:"15:50", subject:"Методы и инструменты исследования",     type:"practice", room:"C1.1.143", building:"Главный корпус", teacher:"Есентай Н.Т." },
      { start:"16:00", end:"16:50", subject:"Введение в анализ вредоносных программ", type:"lecture", room:"C1.1.334L", building:"Главный корпус", teacher:"Vacancy 6" },
      { start:"17:00", end:"17:50", subject:"Введение в анализ вредоносных программ", type:"lecture", room:"C1.1.334L", building:"Главный корпус", teacher:"Vacancy 6" },
      { start:"18:00", end:"18:50", subject:"Веб-безопасность",                      type:"practice", room:"C1.2.221K", building:"Главный корпус", teacher:"Vacancy 3" },
      { start:"19:00", end:"19:50", subject:"Введение в анализ вредоносных программ", type:"practice", room:"C1.1.327", building:"Главный корпус", note:"Кибер-лаборатория", teacher:"Vacancy 6" }
    ],

    wed: [
      { start:"09:00", end:"09:50", subject:"Этический хакинг",                  type:"lecture",  online:true, teacher:"Waleed E." },
      { start:"10:00", end:"10:50", subject:"Этический хакинг",                  type:"lecture",  online:true, teacher:"Waleed E." },
      { start:"11:00", end:"11:50", subject:"Веб-безопасность",                  type:"lecture",  online:true, teacher:"Vacancy 10" },
      { start:"12:00", end:"12:50", subject:"Веб-безопасность",                  type:"lecture",  online:true, teacher:"Vacancy 10" },
      { start:"16:00", end:"16:50", subject:"Этический хакинг",                  type:"practice", online:true, teacher:"Хабиб С." },
      { start:"17:00", end:"17:50", subject:"Методы и инструменты исследования", type:"practice", room:"C1.1.225P", building:"Главный корпус", teacher:"Есентай Н.Т." },
      { start:"19:00", end:"19:50", subject:"Предпринимательство",               type:"practice", room:"C1.2.232P", building:"Главный корпус", teacher:"Салыкова Л.Н." }
    ],

    thu: [],                      // выходной день

    fri: [
      { start:"10:00", end:"10:50", subject:"Предпринимательство",               type:"practice", room:"108P", building:"Корпус Коркем", teacher:"Салыкова Л.Н." },
      { start:"11:00", end:"11:50", subject:"Предпринимательство",               type:"practice", room:"108P", building:"Корпус Коркем", teacher:"Салыкова Л.Н." },
      { start:"14:00", end:"14:50", subject:"Методы и инструменты исследования", type:"lecture",  room:"C1.3.234L", building:"Главный корпус", teacher:"Канатова А.Т." },
      { start:"15:00", end:"15:50", subject:"Методы и инструменты исследования", type:"lecture",  room:"C1.3.234L", building:"Главный корпус", teacher:"Канатова А.Т." },
      { start:"19:00", end:"19:50", subject:"Безопасность компьютерных сетей",   type:"practice", room:"C1.1.241K", building:"Главный корпус", teacher:"Сапаш С.А." }
    ],

    sat: [
      { start:"18:00", end:"18:50", subject:"Введение в анализ вредоносных программ", type:"practice", room:"C1.1.327", building:"Главный корпус", note:"Кибер-лаборатория", teacher:"Vacancy 6" },
      { start:"19:00", end:"19:50", subject:"Введение в анализ вредоносных программ", type:"practice", room:"C1.1.327", building:"Главный корпус", note:"Кибер-лаборатория", teacher:"Vacancy 6" }
    ],

    sun: []
  }
};
