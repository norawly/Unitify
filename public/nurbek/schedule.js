/* ============================================================
   РАСПИСАНИЕ НУРБЕКА — s.zhengisbay.com/nurbek
   Формат полей — как в public/nurali/schedule.js.
   ============================================================ */
window.SCHEDULE = {
  private: true,          // закрыто: только свой аккаунт в Telegram
  owner: "Нурбек",
  group: "",
  year: "2026–2027",
  period: "Осенний триместр",
  updated: "2026-10-18",

  /* Границы триместра — из академического календаря 2026–2027 */
  term: {
    name:     "Осенний триместр",
    study:    ["2026-09-07", "2026-11-14"],
    exams:    ["2026-11-16", "2026-11-28"],
    vacation: ["2026-11-30", "2026-12-05"],
    holidays: { "2026-10-25": "День Республики" }
  },

  subjects: {
    "Cloud Computing":              "CC",
    "Computer Networks":            "CN",
    "Project Management":           "PM",
    "Research Methods and Tools":   "RMT",
    "Computer Graphics Fundamentals": "CGF",
    "Philosophy":                   "PHIL"
  },

  days: {
    mon: [
      { start:"14:00", end:"14:50", subject:"Cloud Computing", type:"practice", code:"CC53-EN-P62", room:"302P", building:"Корпус Коркем", teacher:"Бакиева А.М." },
      { start:"15:00", end:"15:50", subject:"Cloud Computing", type:"practice", code:"CC53-EN-P62", room:"302P", building:"Корпус Коркем", teacher:"Бакиева А.М." },
      { start:"16:00", end:"16:50", subject:"Computer Networks", type:"practice", code:"CN52-EN-P63", room:"309K", building:"Корпус Коркем", teacher:"" },
      { start:"17:00", end:"17:50", subject:"Computer Networks", type:"practice", code:"CN52-EN-P63", room:"309K", building:"Корпус Коркем", teacher:"" },
      { start:"18:00", end:"18:50", subject:"Computer Networks", type:"lecture",  code:"CN52-EN-L84", room:"303L", building:"Корпус Коркем", teacher:"" },
      { start:"19:00", end:"19:50", subject:"Computer Networks", type:"lecture",  code:"CN52-EN-L84", room:"303L", building:"Корпус Коркем", teacher:"" }
    ],

    tue: [
      { start:"12:00", end:"12:50", subject:"Project Management", type:"lecture",  code:"PM43-EN-L211",  online:true, teacher:"Ибадильдин Н.А." },
      { start:"13:05", end:"13:55", subject:"Project Management", type:"lecture",  code:"PM43-EN-L211",  online:true, teacher:"Ибадильдин Н.А." },
      { start:"14:00", end:"14:50", subject:"Research Methods and Tools", type:"lecture",  code:"RMT53-EN-L241", room:"C1.3.366L", building:"Главный корпус", teacher:"Орынбек Ә.С." },
      { start:"15:00", end:"15:50", subject:"Research Methods and Tools", type:"lecture",  code:"RMT53-EN-L241", room:"C1.3.366L", building:"Главный корпус", teacher:"Орынбек Ә.С." },
      { start:"16:00", end:"16:50", subject:"Computer Networks", type:"practice", code:"CN52-EN-P63",   room:"C1.2.221K", building:"Главный корпус", teacher:"" },
      { start:"18:00", end:"18:50", subject:"Project Management", type:"practice", code:"PM43-EN-P436",  room:"IEC-305",   building:"Корпус IEC",     teacher:"Балтабаева К.А." },
      { start:"19:00", end:"19:50", subject:"Project Management", type:"practice", code:"PM43-EN-P436",  room:"IEC-305",   building:"Корпус IEC",     teacher:"Балтабаева К.А." }
    ],

    wed: [
      { start:"13:05", end:"13:55", subject:"Cloud Computing", type:"lecture",  code:"CC53-EN-L59",  online:true, teacher:"Amazon L." },
      { start:"14:00", end:"14:50", subject:"Cloud Computing", type:"lecture",  code:"CC53-EN-L59",  online:true, teacher:"Amazon L." },
      { start:"16:00", end:"16:50", subject:"Computer Graphics Fundamentals", type:"practice", code:"CGF53-EN-P49", room:"C1.1.355P", building:"Главный корпус", teacher:"Шаймерденова Н.Б." },
      { start:"18:00", end:"18:50", subject:"Computer Graphics Fundamentals", type:"lecture",  code:"CGF53-EN-L24", room:"C1.3.365L", building:"Главный корпус", teacher:"Баткульдинова К.К." },
      { start:"19:00", end:"19:50", subject:"Computer Graphics Fundamentals", type:"lecture",  code:"CGF53-EN-L24", room:"C1.3.365L", building:"Главный корпус", teacher:"Баткульдинова К.К." }
    ],

    thu: [
      { start:"12:00", end:"12:50", subject:"Philosophy", type:"lecture", code:"PHIL51-EN-L223", online:true, teacher:"Шерьязданова Г.Р." },
      { start:"13:05", end:"13:55", subject:"Philosophy", type:"lecture", code:"PHIL51-EN-L223", online:true, teacher:"Шерьязданова Г.Р." },
      { start:"14:00", end:"14:50", subject:"Philosophy", type:"lecture", code:"PHIL51-EN-L223", online:true, teacher:"Шерьязданова Г.Р." }
    ],

    fri: [
      { start:"13:00", end:"13:50", subject:"Research Methods and Tools", type:"practice", code:"RMT53-EN-P175",  room:"106P", building:"Корпус Коркем", teacher:"Нургалиев К.С." },
      { start:"14:00", end:"14:50", subject:"Research Methods and Tools", type:"practice", code:"RMT53-EN-P175",  room:"106P", building:"Корпус Коркем", teacher:"Нургалиев К.С." },
      { start:"15:00", end:"15:50", subject:"Research Methods and Tools", type:"practice", code:"RMT53-EN-P175",  room:"106P", building:"Корпус Коркем", teacher:"Нургалиев К.С." },
      { start:"16:00", end:"16:50", subject:"Philosophy", type:"practice", code:"PHIL51-EN-P514", room:"300P", building:"Корпус Коркем", teacher:"Джубатчанова И.Т." },
      { start:"17:00", end:"17:50", subject:"Philosophy", type:"practice", code:"PHIL51-EN-P514", room:"300P", building:"Корпус Коркем", teacher:"Джубатчанова И.Т." }
    ],

    sat: [
      { start:"12:00", end:"12:50", subject:"Computer Graphics Fundamentals", type:"practice", code:"CGF53-EN-P49",  room:"307K", building:"Корпус Коркем", teacher:"Шаймерденова Н.Б." },
      { start:"13:05", end:"13:55", subject:"Computer Graphics Fundamentals", type:"practice", code:"CGF53-EN-P49",  room:"307K", building:"Корпус Коркем", teacher:"Шаймерденова Н.Б." },
      { start:"15:00", end:"15:50", subject:"Cloud Computing", type:"practice", code:"CC53-EN-P62",   room:"107K", building:"Корпус Коркем", teacher:"Бакиева А.М." }
    ],

    sun: []
  }
};
