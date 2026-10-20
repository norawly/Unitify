/* ============================================================
   РАСПИСАНИЕ — баркод 240614
   Поля пары — как в public/nurali/schedule.js
   ============================================================ */
window.SCHEDULE = {
  owner: "240614",
  barcode: "240614",
  hidden: true,                 // не показывать на странице выбора
  group: "",
  year: "2026–2027",
  period: "Осенний триместр",
  updated: "2026-09-16",

  term: {
    name:     "Осенний триместр",
    study:    ["2026-09-07", "2026-11-14"],
    exams:    ["2026-11-16", "2026-11-28"],
    vacation: ["2026-11-30", "2026-12-05"],
    holidays: { "2026-10-25": "День Республики", "2026-10-26": "Выходной — День Республики" }
  },

  subjects: {
    "Безопасность компьютерных сетей":    "CNS",
    "Этический хакинг":                   "EH",
    "Предпринимательство":                "ENT",
    "Веб-безопасность":                   "WS",
    "Методы и инструменты исследования":  "RMT",
    "Введение в поиск угроз":             "ITH"
  },

  days: {
    mon: [
      { start:"12:00", end:"12:50", subject:"Безопасность компьютерных сетей", type:"lecture",  code:"CNS53-EN-L153", room:"Актовый зал", building:"Главный корпус", teacher:"Абишев А." },
      { start:"13:05", end:"13:55", subject:"Безопасность компьютерных сетей", type:"lecture",  code:"CNS53-EN-L153", room:"Актовый зал", building:"Главный корпус", teacher:"Абишев А." },
      { start:"14:00", end:"14:50", subject:"Этический хакинг",                type:"practice", code:"EH53-EN-P215",  online:true, teacher:"Хабиб С." },
      { start:"15:00", end:"15:50", subject:"Этический хакинг",                type:"practice", code:"EH53-EN-P215",  online:true, teacher:"Хабиб С." },
      { start:"16:00", end:"16:50", subject:"Предпринимательство",             type:"lecture",  code:"ENT51-EN-L184", room:"C1.3.370L", building:"Главный корпус", teacher:"Салыкова Л.Н." },
      { start:"17:00", end:"17:50", subject:"Предпринимательство",             type:"lecture",  code:"ENT51-EN-L184", room:"C1.3.370L", building:"Главный корпус", teacher:"Салыкова Л.Н." },
      { start:"18:00", end:"18:50", subject:"Безопасность компьютерных сетей", type:"practice", code:"CNS53-EN-P359", room:"C1.1.355P", building:"Главный корпус", teacher:"Сапаш С.А." },
      { start:"19:00", end:"19:50", subject:"Безопасность компьютерных сетей", type:"practice", code:"CNS53-EN-P359", room:"C1.1.355P", building:"Главный корпус", teacher:"Сапаш С.А." }
    ],

    tue: [
      { start:"12:00", end:"12:50", subject:"Веб-безопасность",                   type:"practice", code:"WS53-EN-P115",  room:"C1.2.232P", building:"Главный корпус", teacher:"Жумагалиева С." },
      { start:"13:05", end:"13:55", subject:"Веб-безопасность",                   type:"practice", code:"WS53-EN-P115",  room:"C1.2.232P", building:"Главный корпус", teacher:"Жумагалиева С." },
      { start:"14:00", end:"14:50", subject:"Методы и инструменты исследования",   type:"practice", code:"RMT53-EN-P334", room:"C1.1.143",  building:"Главный корпус", teacher:"Есентай Н.Т." },
      { start:"15:00", end:"15:50", subject:"Методы и инструменты исследования",   type:"practice", code:"RMT53-EN-P334", room:"C1.1.143",  building:"Главный корпус", teacher:"Есентай Н.Т." },
      { start:"18:00", end:"18:50", subject:"Веб-безопасность",                   type:"practice", code:"WS53-EN-P115",  room:"C1.2.221K", building:"Главный корпус", teacher:"Жумагалиева С." },
      { start:"19:00", end:"19:50", subject:"Введение в поиск угроз",             type:"practice", code:"ITH53-EN-P21",  room:"HackCity",  building:"Главный корпус", teacher:"Сағадат Н.Б." }
    ],

    wed: [
      { start:"09:00", end:"09:50", subject:"Этический хакинг",                  type:"lecture",  code:"EH53-EN-L189",  online:true, teacher:"Waleed E." },
      { start:"10:00", end:"10:50", subject:"Этический хакинг",                  type:"lecture",  code:"EH53-EN-L189",  online:true, teacher:"Waleed E." },
      { start:"11:00", end:"11:50", subject:"Веб-безопасность",                  type:"lecture",  code:"WS53-EN-L68",   online:true, teacher:"Almisreb A." },
      { start:"12:00", end:"12:50", subject:"Веб-безопасность",                  type:"lecture",  code:"WS53-EN-L68",   online:true, teacher:"Almisreb A." },
      { start:"16:00", end:"16:50", subject:"Этический хакинг",                  type:"practice", code:"EH53-EN-P215",  online:true, teacher:"Хабиб С." },
      { start:"17:00", end:"17:50", subject:"Методы и инструменты исследования", type:"practice", code:"RMT53-EN-P334", room:"C1.1.225P", building:"Главный корпус", teacher:"Есентай Н.Т." },
      { start:"19:00", end:"19:50", subject:"Предпринимательство",               type:"practice", code:"ENT51-EN-P213", room:"C1.2.232P", building:"Главный корпус", teacher:"Салыкова Л.Н." }
    ],

    thu: [],

    fri: [
      { start:"10:00", end:"10:50", subject:"Предпринимательство",               type:"practice", code:"ENT51-EN-P213", room:"108P",      building:"Корпус Коркем",  teacher:"Салыкова Л.Н." },
      { start:"11:00", end:"11:50", subject:"Предпринимательство",               type:"practice", code:"ENT51-EN-P213", room:"108P",      building:"Корпус Коркем",  teacher:"Салыкова Л.Н." },
      { start:"14:00", end:"14:50", subject:"Методы и инструменты исследования", type:"lecture",  code:"RMT53-EN-L370", room:"C1.3.234L", building:"Главный корпус", teacher:"Канатова А.Т." },
      { start:"15:00", end:"15:50", subject:"Методы и инструменты исследования", type:"lecture",  code:"RMT53-EN-L370", room:"C1.3.234L", building:"Главный корпус", teacher:"Канатова А.Т." },
      { start:"16:00", end:"16:50", subject:"Введение в поиск угроз",            type:"lecture",  code:"ITH53-EN-L3",   room:"C1.1.334L", building:"Главный корпус", teacher:"Рамазанова З.Е." },
      { start:"17:00", end:"17:50", subject:"Введение в поиск угроз",            type:"lecture",  code:"ITH53-EN-L3",   room:"C1.1.334L", building:"Главный корпус", teacher:"Рамазанова З.Е." },
      { start:"19:00", end:"19:50", subject:"Безопасность компьютерных сетей",   type:"practice", code:"CNS53-EN-P359", room:"C1.1.241K", building:"Главный корпус", teacher:"Сапаш С.А." }
    ],

    sat: [
      { start:"18:00", end:"18:50", subject:"Введение в поиск угроз", type:"practice", code:"ITH53-EN-P21", room:"HackCity", building:"Главный корпус", teacher:"Сағадат Н.Б." },
      { start:"19:00", end:"19:50", subject:"Введение в поиск угроз", type:"practice", code:"ITH53-EN-P21", room:"HackCity", building:"Главный корпус", teacher:"Сағадат Н.Б." }
    ],

    sun: []
  }
};
