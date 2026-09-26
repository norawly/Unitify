(function(){
"use strict";

/* корень сайта — рядом с app.js (страницы людей лежат на уровень ниже) */
var BASE=(document.currentScript&&document.currentScript.src)
  ? new URL(".",document.currentScript.src).href : "./";

/* ============ данные ============ */
var S     = window.SCHEDULE || {days:{}, subjects:{}};
var T     = S.term || {};
/* воскресенье показываем, только если в этот день что-то есть */
var ND    = (S.days&&S.days.sun&&S.days.sun.length)?7:6;
var KEYS  = ["mon","tue","wed","thu","fri","sat","sun"].slice(0,ND);
var SHORT = {mon:"Пн",tue:"Вт",wed:"Ср",thu:"Чт",fri:"Пт",sat:"Сб",sun:"Вс"};
var FULL  = {mon:"Понедельник",tue:"Вторник",wed:"Среда",thu:"Четверг",fri:"Пятница",sat:"Суббота",sun:"Воскресенье"};
var TYPE  = {lecture:"Лекция",practice:"Практика",lab:"Лаб. работа",seminar:"Семинар",other:"Занятие"};
var MON   = ["янв","фев","мар","апр","мая","июн","июл","авг","сен","окт","ноя","дек"];
var MONF  = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
var KIND  = {
  "lecture":         {c:"#3b68e0", label:"Лекция"},
  "practice":        {c:"#1a9e5f", label:"Практика"},
  "lecture-online":  {c:"#7c5cf0", label:"Лекция онлайн"},
  "practice-online": {c:"#c97a10", label:"Практика онлайн"},
  "other":           {c:"#6b7280", label:"Другое"}
};
document.documentElement.style.setProperty("--nd",ND);

/* ============ мелочи ============ */
function $(id){ return document.getElementById(id); }
function el(t,c,h){ var n=document.createElement(t); if(c)n.className=c; if(h!=null)n.innerHTML=h; return n; }
function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]; }); }
function mins(t){ var p=String(t||"0:0").split(":"); return (+p[0])*60+(+p[1]||0); }
function hhmm(m){ var h=Math.floor(m/60)%24, r=m%60; return (h<10?"0":"")+h+":"+(r<10?"0":"")+r; }
function nowMin(){ var d=new Date(); return d.getHours()*60+d.getMinutes(); }
function plural(n,a,b,c){ var x=n%10,y=n%100; return n+" "+(x===1&&y!==11?a:(x>=2&&x<=4&&(y<12||y>14)?b:c)); }
function dur(m){ var d=Math.floor(m/1440),h=Math.floor(m%1440/60),r=m%60;
  if(d) return d+" д "+h+" ч"; if(h) return h+" ч"+(r?" "+r+" мин":""); return r+" мин"; }
function pd(s){ var p=String(s).split("-"); return new Date(+p[0],+p[1]-1,+p[2]); }
function iso(d){ var m=d.getMonth()+1,x=d.getDate();
  return d.getFullYear()+"-"+(m<10?"0":"")+m+"-"+(x<10?"0":"")+x; }
function addDays(d,n){ var x=new Date(d); x.setDate(x.getDate()+n); return x; }
function startOfWeek(d){ var x=new Date(d); x.setHours(0,0,0,0); return addDays(x,-((x.getDay()+6)%7)); }
function sameDate(a,b){ return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
function fmtShort(d){ return d.getDate()+" "+MON[d.getMonth()]; }
function fmtLong(d){ return d.getDate()+" "+MONF[d.getMonth()]; }
function kindKey(it){ if(it.type==="other") return "other"; return (it.type==="lecture"?"lecture":"practice")+(it.online?"-online":""); }
function kindOf(it){ return KIND[kindKey(it)]||KIND.practice; }
function subjShort(n){ return (S.subjects&&S.subjects[n])||""; }

/* кабинет коротко: C1.2.232P → 2.232P, 302P → 302P */
function roomShort(r){ return String(r||"").replace(/^C1\./i,""); }
/* этаж по номеру кабинета: C1.<блок>.<номер>, первая цифра номера — этаж
   (C1.1.355P → 3 этаж, C1.2.232P → 2 этаж, 302P → 3 этаж) */
function floorOf(it){
  if(it.online) return null;
  var num=String(it.room||"").split(/[.\-]/).pop();     /* C1.1.355P, 302P, IEC-305 */
  var m=num.match(/^(\d)\d{2}/);
  return m ? +m[1] : null;
}

/* ============ склейка пар и округление времени ============ */
function rawDay(k){ return ((S.days&&S.days[k])||[]).slice().sort(function(a,b){return mins(a.start)-mins(b.start);}); }
function same(a,b){
  return a.subject===b.subject && a.type===b.type && !!a.online===!!b.online &&
         (a.room||"")===(b.room||"") && (a.teacher||"")===(b.teacher||"");
}
var CACHE={};
function blocks(k){
  if(CACHE[k]) return CACHE[k];
  var arr=rawDay(k), out=[], cur=null;
  arr.forEach(function(it){
    if(cur && same(cur.last,it) && mins(it.start)-mins(cur.last.end)<=20){ cur.parts.push(it); cur.last=it; }
    else { cur={it:it,last:it,parts:[it]}; out.push(cur); }
  });
  out.forEach(function(g,i){
    g.rs=mins(g.parts[0].start); g.re=mins(g.last.end);
    g.s=Math.floor(g.rs/60)*60;  g.e=Math.ceil(g.re/60)*60;
    if(i&&g.s<out[i-1].e) g.s=out[i-1].e;
  });
  CACHE[k]=out; return out;
}
var lo=24*60, hi=0;
KEYS.forEach(function(k){ blocks(k).forEach(function(g){ lo=Math.min(lo,g.s); hi=Math.max(hi,g.e); }); });
if(lo>hi){ lo=9*60; hi=18*60; }
var G0=lo, G1=hi, HOURS=(G1-G0)/60;
function pct(m){ return (m-G0)/(G1-G0)*100; }

/* ============ периоды триместра ============ */
var P_STUDY = (T.study||[]).map(pd), P_EX=(T.exams||[]).map(pd), P_VAC=(T.vacation||[]).map(pd);
var TERM_A  = P_STUDY[0] || startOfWeek(new Date());
var TERM_B  = P_VAC[1] || P_EX[1] || P_STUDY[1] || addDays(TERM_A,90);
function within(d,r){ return r.length===2 && d>=r[0] && d<=r[1]; }
function dayState(d){
  var h=(T.holidays||{})[iso(d)];
  if(h) return {kind:"holiday", label:h};
  if(within(d,P_STUDY)) return {kind:"study"};
  if(within(d,P_EX))    return {kind:"exams", label:"Сессия"};
  if(within(d,P_VAC))   return {kind:"vacation", label:"Каникулы"};
  return {kind:"none", label:d<TERM_A?"До начала":"Триместр окончен"};
}

/* список дней триместра (Пн–Сб) */
var DAYS=[], TODAY=-1;
(function(){
  var today=new Date(); today.setHours(0,0,0,0);
  var first=startOfWeek(TERM_A);
  if(startOfWeek(today)<first) first=startOfWeek(today);
  var d=new Date(first), last=addDays(startOfWeek(TERM_B),6);
  if(startOfWeek(today)>startOfWeek(TERM_B)) last=addDays(startOfWeek(today),6);
  while(d<=last){
    if(d.getDay()!==0||ND===7){
      if(sameDate(d,today)) TODAY=DAYS.length;
      DAYS.push({key:["mon","tue","wed","thu","fri","sat","sun"][(d.getDay()+6)%7], date:new Date(d)});
    }
    d=addDays(d,1);
  }
})();
var WEEKS=Math.ceil(DAYS.length/ND);
var CUR = TODAY>=0 ? TODAY : (function(){
  var t=new Date(); t.setHours(0,0,0,0);
  for(var i=0;i<DAYS.length;i++) if(DAYS[i].date>=t) return i;
  return DAYS.length-1;
})();
/* открываем ближайшую неделю, в которой реально идут занятия */
var week = (function(){
  var w=Math.floor(CUR/ND);
  for(var x=w; x<Math.ceil(DAYS.length/ND); x++)
    for(var c=0;c<ND;c++){
      var d=DAYS[x*ND+c];
      if(d && dayState(d.date).kind==="study" && blocks(d.key).length) return x;
    }
  return w;
})();

/* ============ шапка ============ */
var WHO=S.owner||S.group||"";
document.title="Schedule · "+WHO;
$("gname").innerHTML='<span class="wide">Schedule · </span>'+esc(WHO);
$("gmeta").textContent=[S.group,T.name||S.period,S.year].filter(Boolean).join(" · ");


/* ============ календарь недели (десктоп) ============ */
var body=$("weekBody");

function renderWeek(dir){
  var i0=week*ND;
  body.innerHTML="";
  body.style.setProperty("--hours",HOURS);

  var gut=el("div","gutcol");
  gut.appendChild(el("div","dh gh"));
  var gb=el("div","gbody");
  for(var m=G0;m<G1;m+=60){
    var t=el("div","hr",hhmm(m)); t.style.top=pct(m)+"%"; gb.appendChild(t);
  }
  gut.appendChild(gb); body.appendChild(gut);

  for(var c=0;c<ND;c++){
    var day=DAYS[i0+c];
    var col=el("div","col");
    if(!day){ col.classList.add("empty"); body.appendChild(col); continue; }
    var st=dayState(day.date), isT=(i0+c)===TODAY;
    if(isT) col.classList.add("today");

    col.appendChild(el("div","dh"+(isT?" today":""),
      '<span class="dow">'+SHORT[day.key]+"</span>"+
      '<span class="dnum">'+day.date.getDate()+"</span>"+
      '<span class="dmon">'+MON[day.date.getMonth()]+"</span>"));

    var cb=el("div","cbody");
    if(st.kind!=="study"){
      cb.classList.add("nostudy");
      cb.appendChild(el("div","nomark","<span>"+esc(st.label||"")+"</span>"));
    }else{
      var list=blocks(day.key);
      list.forEach(function(gr,i){
        if(i){
          var gap=gr.s-list[i-1].e;
          if(gap>=60){
            var band=el("div","gapband",'<span>окно '+dur(gap)+"</span>");
            band.style.top=pct(list[i-1].e)+"%";
            band.style.height=(pct(gr.s)-pct(list[i-1].e))+"%";
            cb.appendChild(band);
          }
        }
        var it=gr.it, kd=kindOf(it);
        var b=el("button","ev"+(it.online?" online":""));
        b.style.setProperty("--c",kd.c);
        b.style.top=pct(gr.s)+"%";
        b.style.height=(pct(gr.e)-pct(gr.s))+"%";
        b.innerHTML=
          '<span class="ev-head">'+
            '<span class="ev-time">'+hhmm(gr.s)+"–"+hhmm(gr.e)+"</span>"+
            '<span class="ev-room'+(it.online?" on":"")+
              (!it.online&&roomShort(it.room).length>7?" long":"")+'">'+
              (it.online?"Онлайн":esc(roomShort(it.room)||(it.type==="other"?it.subject:"—")))+"</span>"+
          "</span>"+
          '<span class="ev-sub">'+esc(it.subject)+"</span>";
        b.onclick=(function(g,d){ return function(){ openCard(g,d); }; })(gr,day);
        cb.appendChild(b);
      });
      if(isT) { var n=nowMin(); if(n>=G0&&n<=G1){
        var ln=el("div","nowline"); ln.style.top=pct(n)+"%"; cb.appendChild(ln); } }
    }
    col.appendChild(cb);
    body.appendChild(col);
  }

  body.classList.remove("in-l","in-r");
  if(dir){ void body.offsetWidth; body.classList.add(dir>0?"in-r":"in-l"); }
  fitEvents(); markPast(); weekLabel();
}

/* мало места — прячем название, оставляем время и кабинет */
function fitEvents(){
  var evs=body.querySelectorAll(".ev");
  for(var i=0;i<evs.length;i++){
    var h=evs[i].clientHeight;
    evs[i].classList.toggle("xs",h<46);
    evs[i].classList.toggle("tight",h>=46&&h<74);
  }
}
function weekLabel(){
  var a=DAYS[week*ND], b=DAYS[Math.min(DAYS.length-1,week*ND+ND-1)];
  if(!a){ return; }
  var one=a.date.getMonth()===b.date.getMonth();
  $("weekLabel").textContent=a.date.getDate()+(one?"":" "+MON[a.date.getMonth()])+" – "+fmtShort(b.date);
  var tw=TODAY>=0?Math.floor(TODAY/ND):-1;
  var st=dayState(a.date), stEnd=dayState(b.date);
  /* без «эта неделя» — пишем только то, что не видно по датам */
  var hint = st.kind==="exams"||stEnd.kind==="exams" ? "сессия"
    : (st.kind==="vacation" ? "каникулы"
    : (week===tw||week===tw+1 ? "" : "неделя "+(week+1)+" из "+WEEKS));
  $("weekHint").textContent=hint;
  $("prevWeek").disabled = week<=0;
  $("nextWeek").disabled = week>=WEEKS-1;
}
function goWeek(w,dir){
  w=Math.max(0,Math.min(WEEKS-1,w));
  if(w===week) return;
  var d=dir||(w>week?1:-1); week=w; renderWeek(d);
}
$("prevWeek").onclick=function(){ goWeek(week-1,-1); };
$("nextWeek").onclick=function(){ goWeek(week+1, 1); };
document.addEventListener("keydown",function(e){
  if(e.target&&/input|textarea/i.test(e.target.tagName)) return;
  if(e.key==="ArrowLeft")  goWeek(week-1,-1);
  if(e.key==="ArrowRight") goWeek(week+1, 1);
});
/* горизонтальный жест трекпада = одна неделя; инерция после срабатывания гасится */
var wAcc=0, wAt=0, wLock=false;
body.addEventListener("wheel",function(e){
  if(Math.abs(e.deltaX)<=Math.abs(e.deltaY)*1.2) return;
  e.preventDefault();                        /* иначе браузер уходит на шаг назад */
  var now=Date.now();
  if(now-wAt>320){ wAcc=0; wLock=false; }    /* пауза — жест считается новым */
  wAt=now;
  if(wLock) return;                          /* остаток инерции игнорируем */
  wAcc+=e.deltaX;
  if(Math.abs(wAcc)>60){
    var dir=wAcc>0?1:-1; wAcc=0; wLock=true;
    goWeek(week+dir, dir);
  }
},{passive:false});
(function(){
  var x0=null;
  body.addEventListener("touchstart",function(e){ x0=e.touches[0].clientX; },{passive:true});
  body.addEventListener("touchend",function(e){
    if(x0==null) return; var dx=e.changedTouches[0].clientX-x0; x0=null;
    if(Math.abs(dx)>60) goWeek(week+(dx<0?1:-1), dx<0?1:-1);
  },{passive:true});
})();

/* ============ телефон ============ */
var pager=$("pager");
function buildMobile(){
  pager.innerHTML="";
  DAYS.forEach(function(day,idx){
    var st=dayState(day.date), list=st.kind==="study"?blocks(day.key):[];
    var page=el("div","page"); page.dataset.i=idx;
    page.appendChild(el("div","pday",
      "<h2>"+FULL[day.key]+"</h2><p>"+fmtLong(day.date)+(idx===TODAY?' <b class="istoday">сегодня</b>':"")+"</p>"));
    if(st.kind!=="study"){
      page.appendChild(el("div","free","<b>"+esc(st.label||"Пар нет")+"</b>"+
        (st.kind==="exams"?"<span>Расписание сессии — в LMS</span>":"")));
    }else if(!list.length){
      page.appendChild(el("div","free","<b>Пар нет</b><span>Свободный день</span>"));
    }else{
      var rows=el("div","rows");
      list.forEach(function(gr,i){
        if(i){ var gap=gr.s-list[i-1].e;
          if(gap>=60) rows.appendChild(el("div","mgap","<span>окно "+dur(gap)+"</span>")); }
        var it=gr.it, kd=kindOf(it);
        var r=el("button","row"+(it.online?" online":""));
        r.style.setProperty("--c",kd.c);
        r.innerHTML=
          '<span class="r-time"><b>'+hhmm(gr.s)+"</b><i>"+hhmm(gr.e)+"</i></span>"+
          '<span class="r-main"><span class="r-sub">'+esc(it.subject)+"</span>"+
            '<span class="r-meta">'+esc([bldg(it)?bldgShort(it):"",it.teacher||""].filter(Boolean).join(" · "))+"</span></span>"+
          '<span class="r-room'+(it.online?" on":"")+
            (!it.online&&roomShort(it.room).length>7?" long":"")+'"><b>'+
            (it.online?"Онлайн":esc(roomShort(it.room)||(it.type==="other"?it.subject:"—")))+"</b>"+
            '<i>'+esc((TYPE[it.type]||"Занятие").toLowerCase())+"</i>"+
          "</span>";
        r.onclick=function(){ openCard(gr,day); };
        rows.appendChild(r);
      });
      if(idx===TODAY){                       /* сегодня начинаем с текущей пары — без прокрутки */
        rows.className="rows hide-past";
        var tgl=el("button","showpast"); tgl.type="button"; tgl.hidden=true;
        tgl.onclick=function(){ rows.classList.toggle("hide-past"); markPast(); };
        page.appendChild(tgl);
      }
      page.appendChild(rows);
    }
    pager.appendChild(page);
  });
  var end=el("div","page");
  end.appendChild(el("div","free tail","<b>Конец триместра</b><span>"+
    esc((T.name||"Триместр")+": до "+fmtLong(TERM_B))+"</span>"));
  pager.appendChild(end);
}
function buildTabs(){
  var host=$("dayTabs"); host.innerHTML="";
  for(var i=0;i<ND;i++){
    var b=el("button",null,'<span class="d"></span><span class="n"></span>');
    b.type="button";
    b.onclick=(function(slot){ return function(){ goPage(Math.floor(curPage()/ND)*ND+slot,true); }; })(i);
    host.appendChild(b);
  }
}
function curPage(){ return Math.round(pager.scrollLeft/Math.max(1,pager.clientWidth)); }
function syncTabs(){
  var i=Math.max(0,Math.min(DAYS.length,curPage())), w=Math.min(WEEKS-1,Math.floor(i/ND)), tabs=$("dayTabs").children;
  for(var s=0;s<ND;s++){
    var day=DAYS[w*ND+s], t=tabs[s];
    if(!day){ t.style.visibility="hidden"; continue; }
    t.style.visibility="";
    t.querySelector(".d").textContent=SHORT[day.key];
    t.querySelector(".n").textContent=day.date.getDate();
    t.setAttribute("aria-selected",(w*ND+s)===i?"true":"false");
    t.classList.toggle("today",(w*ND+s)===TODAY);
    t.classList.toggle("off",dayState(day.date).kind!=="study");
  }
}
function goPage(i,smooth){
  i=Math.max(0,Math.min(DAYS.length,i));
  pager.scrollTo({left:i*pager.clientWidth,behavior:smooth?"smooth":"auto"});
  setTimeout(syncTabs,smooth?340:0);
}
pager.addEventListener("scroll",function(){ clearTimeout(pager._t); pager._t=setTimeout(syncTabs,60); },{passive:true});

/* ============ статус ============ */
var timerTo=null;
function findNext(){
  var n=nowMin();
  if(TODAY>=0 && dayState(DAYS[TODAY].date).kind==="study"){
    var l=blocks(DAYS[TODAY].key);
    for(var j=0;j<l.length;j++){
      if(n>=l[j].rs&&n<l[j].re) return {gr:l[j],day:DAYS[TODAY],i:TODAY,live:true};
      if(l[j].rs>n)             return {gr:l[j],day:DAYS[TODAY],i:TODAY,live:false};
    }
  }
  for(var d=(TODAY>=0?TODAY+1:CUR); d<DAYS.length; d++){
    if(dayState(DAYS[d].date).kind!=="study") continue;
    var b=blocks(DAYS[d].key);
    if(b.length) return {gr:b[0],day:DAYS[d],i:d,live:false};
  }
  return null;
}
function renderStatus(){
  var host=$("status"), r=findNext();
  if(!r){
    host.hidden=false; host.className="status plain";
    host.innerHTML='<div class="st-main"><div class="st-lbl">Триместр завершён</div>'+
      '<div class="st-sub">Пар больше нет</div></div>';
    host.onclick=null; timerTo=null; return;
  }
  host.hidden=false;
  var it=r.gr.it, kd=kindOf(it), today0=new Date(); today0.setHours(0,0,0,0);
  var off=Math.round((r.day.date-today0)/86400000);
  host.style.setProperty("--c",kd.c);
  host.className="status"+(r.live?" live":"");
  var when=r.live?"":(off===0?"сегодня":(off===1?"завтра":FULL[r.day.key].toLowerCase()+", "+fmtShort(r.day.date)));
  host.innerHTML=
    '<div class="st-main">'+
      '<div class="st-lbl">'+(r.live?"Сейчас идёт":"Следующая пара")+(when?" · "+esc(when):"")+"</div>"+
      '<div class="st-sub">'+esc(it.subject)+"</div>"+
      '<div class="st-meta">'+hhmm(r.gr.s)+" – "+hhmm(r.gr.e)+" · "+esc(TYPE[it.type]||"")+
        (it.teacher?" · "+esc(it.teacher):"")+"</div>"+
    "</div>"+
    '<div class="st-side">'+
      '<div class="st-room'+(it.online?" on":"")+'">'+(it.online?"Онлайн":esc(roomShort(it.room)||(it.type==="other"?it.subject:"—")))+"</div>"+
      '<div class="st-timer"><span id="tick">--:--</span><small>'+(r.live?"до конца":"до начала")+"</small></div>"+
    "</div>";
  host.onclick=function(){ openCard(r.gr,r.day); };
  timerTo=new Date(today0.getTime()+(off*1440+(r.live?r.gr.re:r.gr.rs))*60000);
}
function tick(){
  var n=$("tick");
  if(n&&timerTo){
    var left=Math.max(0,Math.floor((timerTo-new Date())/1000));
    if(left<=0){ renderStatus(); renderNext(); }
    else n.textContent=clock(left);
  }
  if(nextTo){
    var l2=Math.max(0,Math.floor((nextTo-new Date())/1000));
    if(l2<=0) renderNext();
    else { var nodes=document.querySelectorAll(".nu-t");
      for(var i=0;i<nodes.length;i++) nodes[i].textContent=clock(l2); }
  }
  moveNow();
}
function clock(left){
  var h=Math.floor(left/3600), m=Math.floor(left%3600/60), s=left%60;
  if(h>=10) return h+" ч "+m+" мин";
  return (h?h+":"+(m<10?"0":"")+m:m)+":"+(s<10?"0":"")+s;
}

/* ============ следующая пара (на месте легенды) ============ */
var nextTo=null;
/* пары, которые ещё впереди: сегодня после текущей минуты, дальше — по дням */
function upcomingList(max){
  var out=[], n=nowMin();
  for(var d=(TODAY>=0?TODAY:CUR); d<DAYS.length; d++){
    if(dayState(DAYS[d].date).kind!=="study") continue;
    var b=blocks(DAYS[d].key);
    for(var j=0;j<b.length;j++){
      if(d===TODAY && b[j].rs<=n) continue;
      out.push({gr:b[j],day:DAYS[d],i:d});
      if(out.length>=max) return out;
    }
  }
  return out;
}
function renderNext(){
  var r=findNext(), list=upcomingList(2);
  var pick=(r&&r.live)?list[0]:list[1];          /* не повторяем то, что уже в статусе */
  var hosts=[$("nextUp"),$("nextUpM")];
  if(!pick){
    hosts.forEach(function(h){ if(h){ h.className="nextup empty"; h.innerHTML="<span>Дальше пар нет</span>"; h.onclick=null; } });
    nextTo=null; return;
  }
  var it=pick.gr.it, kd=kindOf(it), today0=new Date(); today0.setHours(0,0,0,0);
  var off=Math.round((pick.day.date-today0)/86400000);
  var when=off===0?"":(off===1?"завтра":SHORT[pick.day.key].toLowerCase()+" "+pick.day.date.getDate());
  var html='<span class="nu-l">'+((r&&r.live)?"Следующая":"Потом")+(when?" · "+esc(when):"")+"</span>"+
    '<span class="nu-s">'+esc(it.subject)+"</span>"+
    '<span class="nu-r'+(it.online?" on":"")+'">'+(it.online?"Онлайн":esc(roomShort(it.room)||(it.type==="other"?it.subject:"—")))+"</span>"+
    '<span class="nu-t">--:--</span>';
  hosts.forEach(function(h){
    if(!h) return;
    h.className="nextup";
    h.style.setProperty("--c",kd.c);
    h.innerHTML=html;
    h.onclick=function(){ openCard(pick.gr,pick.day); };
  });
  nextTo=new Date(today0.getTime()+(off*1440+pick.gr.rs)*60000);
}

/* красная полоска времени едет вниз сама */
function moveNow(){
  var ln=body.querySelector(".nowline");
  if(!ln) return;
  var d=new Date(), m=d.getHours()*60+d.getMinutes()+d.getSeconds()/60;
  if(m<G0||m>G1){ ln.style.display="none"; return; }
  ln.style.display=""; ln.style.top=pct(m)+"%";
}

/* ============ карточка пары + место под карту ============ */
var IC={
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  user:'<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.2-3.6 4-5.2 7-5.2s5.8 1.6 7 5.2"/>',
  hash:'<path d="M5 9h14M5 15h14M10 4l-1.5 16M15.5 4L14 20"/>',
  net:'<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8 20h8M12 16.5V20"/>'
};
function frow(icon,k,v,sub){
  return '<div class="frow"><span class="fi"><svg viewBox="0 0 24 24">'+icon+"</svg></span>"+
    '<span class="fx"><span class="fk">'+esc(k)+'</span><span class="fv">'+esc(v)+
    (sub?"<small>"+esc(sub)+"</small>":"")+"</span></span></div>";
}
/* корпус пишем, только если он не главный — там и так понятно */
function bldg(it){
  var b=it.building||"";
  return (!b || /главный/i.test(b)) ? "" : b;
}
function bldgShort(it){ return bldg(it).replace(/^корпус\s+/i,""); }
function mapBlock(it){
  if(it.online) return "";
  var fl=floorOf(it);
  if(bldg(it))                                  /* на карте пока только главный корпус */
    return '<div class="c-map">'+
      '<div class="mp-head"><span>'+(fl?fl+" этаж":"")+"</span><span>"+esc(bldg(it))+"</span></div>"+
      '<div class="mp-body"><div class="mp-none">План корпуса '+esc(bldgShort(it))+
        " пока не добавлен</div></div></div>";
  var blk=(window.CampusMap&&CampusMap.blockOf) ? CampusMap.blockOf(it.room) : "";
  return '<div class="c-map">'+
    '<div class="mp-head"><span>'+(fl?fl+" этаж":"План")+(blk?" · "+esc(blk):"")+"</span>"+
      "<span>"+esc(bldg(it)||it.note||"")+"</span></div>"+
    '<div class="mp-body" id="cardMap"></div>'+
  "</div>";
}
function openCard(gr,day){
  var it=gr.it, kd=kindOf(it), card=$("card");
  var exact=gr.parts.map(function(p){ return p.start+"–"+p.end; }).join(", ");
  card.style.setProperty("--c",kd.c);
  card.innerHTML=
    '<div class="c-head">'+
      '<button class="c-close" aria-label="Закрыть"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>'+
      '<div class="c-tags"><span class="tag solid">'+esc(TYPE[it.type]||kd.label)+"</span>"+
        (subjShort(it.subject)?'<span class="tag">'+esc(subjShort(it.subject))+"</span>":"")+
        '<span class="tag muted">'+esc(FULL[day.key]+", "+fmtShort(day.date))+"</span></div>"+
      "<h3>"+esc(it.subject)+"</h3>"+
      '<div class="c-room'+(it.online?" on":"")+'">'+
        (it.online?"Онлайн":esc(roomShort(it.room)||(it.type==="other"?it.subject:"—")))+
        (it.online?"<small>ссылка в LMS</small>"
                 :(bldg(it)?"<small>"+esc(bldg(it))+"</small>":""))+
      "</div>"+
    "</div>"+
    '<div class="c-cols">'+
      '<div class="c-body">'+
        frow(IC.clock,"Время",hhmm(gr.s)+" – "+hhmm(gr.e),plural(gr.parts.length,"пара","пары","пар")+" · "+exact)+
        frow(IC.user,"Преподаватель",it.teacher||"Не назначен")+
        (it.code?frow(IC.hash,"Код курса",it.code):"")+
      "</div>"+
      mapBlock(it)+
    "</div>";
  card.querySelector(".c-close").onclick=closeCard;
  var mapHost=card.querySelector("#cardMap");
  if(mapHost && window.CampusMap) CampusMap.mini(mapHost, it.room);
  card.scrollTop=0; card.style.transform="";
  card.classList.add("open"); $("veil").classList.add("open");
  document.body.classList.add("locked");
}
/* свайп вниз по карточке — закрыть */
(function(){
  var card=$("card"), y0=null, moved=0;
  card.addEventListener("touchstart",function(e){
    if(card.scrollTop>4){ y0=null; return; }
    y0=e.touches[0].clientY; moved=0;
  },{passive:true});
  card.addEventListener("touchmove",function(e){
    if(y0==null) return;
    moved=e.touches[0].clientY-y0;
    if(moved>0) card.style.transform="translateY("+moved+"px)";
  },{passive:true});
  card.addEventListener("touchend",function(){
    if(y0==null) return;
    card.style.transform="";
    if(moved>90) closeCard();
    y0=null; moved=0;
  },{passive:true});
})();

function closeCard(){
  $("card").classList.remove("open"); $("veil").classList.remove("open");
  document.body.classList.remove("locked");
}
$("veil").onclick=closeCard;
document.addEventListener("keydown",function(e){ if(e.key==="Escape") closeCard(); });

/* ============ статистика типовой учебной недели ============ */
var statsHost=$("statsView"), statsReturnFocus=null;
function statsTime(m){
  if(!m) return "0 мин";
  var h=Math.floor(m/60), r=m%60;
  return (h?h+" ч":"")+(r?(h?" ":"")+r+" мин":"");
}
function statsPct(part,total){return total?Math.round(part/total*100):0;}
function statsBar(part,total){return part&&total?Math.max(2,part/total*100):0;}
function statsPanel(){
  var a=window.ScheduleStats.calculate(S);
  var maxDay=Math.max.apply(null,a.days.map(function(d){return d.minutes;}))||1;
  var busy=a.days.reduce(function(best,d){return !best||d.minutes>best.minutes?d:best;},null);
  var gap=a.days.reduce(function(best,d){return !best||d.window>best.window?d:best;},null);
  var dayBars=a.days.slice(0,ND).map(function(d){
    var date=FULL[d.key], span=d.first===null?"Свободно":hhmm(d.first)+"–"+hhmm(d.last);
    return '<div class="sb-row" title="'+esc(date+": "+statsTime(d.minutes)+" занятий")+'">'+
      '<span class="sb-name">'+esc(SHORT[d.key])+'</span>'+
      '<div class="sb-track" role="img" aria-label="'+esc(date+": "+statsTime(d.minutes)+", онлайн "+statsTime(d.online))+'">'+
        '<span class="sb-fill offline" style="width:'+statsBar(d.offline,maxDay)+'%"></span>'+
        '<span class="sb-fill online" style="width:'+statsBar(d.online,maxDay)+'%"></span></div>'+
      '<b class="sb-value">'+(d.minutes?statsTime(d.minutes):"—")+'</b>'+
      '<small class="sb-span">'+esc(span)+'</small></div>';
  }).join("");
  var fs=[
    {key:"lecture",name:"Лекции",color:"#3b68e0"},
    {key:"practice",name:"Практика",color:"#1a9e5f"},
    {key:"lecture-online",name:"Лекции онлайн",color:"#7c5cf0"},
    {key:"practice-online",name:"Практика онлайн",color:"#c97a10"},
    {key:"other",name:"Другое",color:"#6b7280"},
    {key:"other-online",name:"Другое онлайн",color:"#9ca3af"}
  ].filter(function(f){return a.formats.get(f.key);});
  var at=0, stops=[];
  fs.forEach(function(f){ var end=at+(a.formats.get(f.key)||0)/Math.max(a.total,1)*100;
    stops.push(f.color+" "+at.toFixed(2)+"% "+end.toFixed(2)+"%"); at=end; });
  var wheel=stops.length?"conic-gradient("+stops.join(",")+")":"var(--line)";
  var types=fs.map(function(f){return '<div class="sf-item"><i style="background:'+f.color+'"></i><span>'+f.name+'</span>'+
    '<b>'+statsTime(a.formats.get(f.key))+'</b></div>';}).join("");
  var subjects=a.subjects.map(function(s){
    var share=statsPct(s.minutes,a.total);
    return '<tr><th scope="row"><span>'+esc(s.name)+'</span><i class="ss-meter"><i style="width:'+share+'%"></i></i></th>'+
      '<td>'+statsTime(s.minutes)+'</td><td>'+s.sessions+'</td><td>'+share+'%</td></tr>';
  }).join("");
  var rooms=a.rooms.slice(0,5).map(function(r,i){return '<li><span class="sr-rank">'+(i+1)+'</span><span class="sr-label"><b>'+esc(roomShort(r.name))+'</b>'+
    (bldg({building:r.building})?'<small>'+esc(r.building)+'</small>':"")+'</span><span class="sr-time">'+statsTime(r.minutes)+'</span></li>';}).join("");
  return '<div class="stats-inner"><p class="stats-lead">'+esc(WHO||S.group||"Расписание")+
    ' · типовая неделя занятий · '+esc(T.name||S.period||"")+'</p>'+
    '<div class="stats-kpis">'+
      '<div class="sk"><small>Время занятий</small><strong>'+statsTime(a.total)+'</strong><span>без коротких перерывов</span></div>'+
      '<div class="sk"><small>Занятия</small><strong>'+a.sessions+'</strong><span>'+a.rawLessons+' академических пар</span></div>'+
      '<div class="sk"><small>Окна от часа</small><strong>'+statsTime(a.window)+'</strong><span>'+a.windows+' за неделю</span></div>'+
      '<div class="sk"><small>Онлайн</small><strong>'+statsPct(a.online,a.total)+'%</strong><span>'+statsTime(a.online)+' занятий</span></div>'+
    '</div>'+
    '<div class="stats-grid">'+
      '<section class="sp sp-days"><div class="sp-title"><div><h3>Загрузка по дням</h3><p>Чистое время занятий · часы начала и конца</p></div></div>'+dayBars+
        '<div class="sp-key"><i class="offline"></i>В университете <i class="online"></i>Онлайн</div></section>'+
      '<section class="sp sp-format"><div class="sp-title"><div><h3>Формат недели</h3><p>Доля по длительности занятий</p></div></div>'+
        '<div class="sf-layout"><div class="sf-ring" role="img" aria-label="Распределение форматов занятий" style="background:'+wheel+'"><div><b>'+statsTime(a.total)+'</b><small>в неделю</small></div></div>'+
        '<div class="sf-list">'+(types||'<span>Занятий нет</span>')+'</div></div></section>'+
      '<section class="sp sp-subjects"><div class="sp-title"><div><h3>Предметы</h3><p>Сколько времени занимает каждый за неделю</p></div></div>'+
        '<div class="ss-scroll"><table class="ss-table"><thead><tr><th scope="col">Предмет</th><th scope="col">Время</th><th scope="col">Занятий</th><th scope="col">Доля</th></tr></thead><tbody>'+subjects+'</tbody></table></div></section>'+
      '<section class="sp sp-rooms"><div class="sp-title"><div><h3>Частые кабинеты</h3><p>Где проходит больше всего времени</p></div></div>'+
        (rooms?'<ol class="sr-list">'+rooms+'</ol>':'<p class="sp-empty">Очных занятий нет</p>')+'</section>'+
    '</div>'+
    '<p class="stats-foot">'+(busy&&busy.minutes?'Самый насыщенный день — '+FULL[busy.key].toLowerCase()+' ('+statsTime(busy.minutes)+'). ':'')+
      (gap&&gap.window?'Больше всего окон — '+FULL[gap.key].toLowerCase()+' ('+statsTime(gap.window)+'). ':'')+
      'Показатели рассчитаны по повторяющемуся расписанию учебной недели; экзамены, каникулы, посещаемость и дедлайны сюда не входят.</p></div>';
}
function openStats(){
  closeCard();
  statsReturnFocus=document.activeElement;
  $("statsContent").innerHTML=statsPanel();
  statsHost.classList.add("open"); statsHost.setAttribute("aria-hidden","false");
  document.body.classList.add("locked");
  $("statsClose").focus();
}
function closeStats(){
  if(!statsHost.classList.contains("open")) return;
  statsHost.classList.remove("open"); statsHost.setAttribute("aria-hidden","true");
  document.body.classList.remove("locked");
  if(statsReturnFocus&&statsReturnFocus.focus) statsReturnFocus.focus();
}
$("statsBtn").onclick=openStats;
$("statsClose").onclick=closeStats;
document.addEventListener("keydown",function(e){ if(e.key==="Escape") closeStats(); });

/* ============ тема ============ */
(function(){
  var btn=$("themeBtn");
  var SUN='<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>';
  var MOON='<path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2z"/>';
  function dark(){ var a=document.documentElement.getAttribute("data-theme");
    return a?a==="dark":matchMedia("(prefers-color-scheme:dark)").matches; }
  function apply(v){
    if(v) document.documentElement.setAttribute("data-theme",v);
    else document.documentElement.removeAttribute("data-theme");
    btn.innerHTML='<svg viewBox="0 0 24 24">'+(dark()?SUN:MOON)+"</svg>";
    var meta=document.querySelector('meta[name="theme-color"]');
    if(meta) meta.setAttribute("content",dark()?"#0e1013":"#f6f6f7");
  }
  var saved=null; try{ saved=localStorage.getItem("theme"); }catch(e){}
  apply(saved);
  btn.onclick=function(){ var v=dark()?"light":"dark";
    try{ localStorage.setItem("theme",v); }catch(e){} apply(v); };
})();

/* ============ прошедшие пары ============ */
function markPast(){
  if(TODAY<0||dayState(DAYS[TODAY].date).kind!=="study") return;
  var n=nowMin(), list=blocks(DAYS[TODAY].key);
  var col=body.querySelectorAll(".col")[TODAY-week*ND];
  var page=pager.children[TODAY];
  var sets=[];
  if(col&&Math.floor(TODAY/ND)===week) sets.push(col.querySelectorAll(".ev"));
  if(page) sets.push(page.querySelectorAll(".row"));
  sets.forEach(function(nodes){
    for(var i=0;i<nodes.length;i++){
      var g=list[i]; if(!g) break;
      nodes[i].classList.toggle("past",n>=g.re);
      nodes[i].classList.toggle("live",n>=g.rs&&n<g.re);
    }
  });
  if(!page) return;
  /* прошедшие пары прячем, чтобы день начинался с текущей; всё можно вернуть кнопкой */
  var rows=page.querySelector(".rows"), tgl=page.querySelector(".showpast");
  if(!rows||!tgl) return;
  var done=rows.querySelectorAll(".row.past").length, hidden=rows.classList.contains("hide-past");
  tgl.hidden=!done;
  tgl.textContent=hidden?("Показать прошедшие · "+done):"Скрыть прошедшие";
  var kids=rows.children;
  for(var j=0;j<kids.length;j++)
    if(kids[j].classList.contains("mgap")){
      var nxt=kids[j+1];
      kids[j].classList.toggle("off",!!(hidden&&nxt&&nxt.classList.contains("past")));
    }
}

/* ============ старт ============ */
buildMobile(); buildTabs(); renderWeek(0); renderStatus(); renderNext();
var START=(function(){
  if(TODAY>=0 && dayState(DAYS[TODAY].date).kind==="study" && blocks(DAYS[TODAY].key).length) return TODAY;
  for(var i=week*ND;i<DAYS.length;i++)
    if(dayState(DAYS[i].date).kind==="study" && blocks(DAYS[i].key).length) return i;
  return CUR;
})();
goPage(START,false);
$("mapBtn").onclick=function(){ if(window.CampusMap) CampusMap.open(null); };
$("todayBtn").onclick=function(){
  var t = TODAY>=0 ? TODAY : START;
  goWeek(Math.floor(t/ND)); goPage(t,true);
};
$("todayBtn").querySelector(".tt").textContent=fmtShort(new Date());

/* ссылки из телеграм-бота: ?day=2026-09-15 открывает день, ?room=2.232P — карту */
(function(){
  var q=new URLSearchParams(location.search), day=q.get("day"), room=q.get("room");
  if(day) for(var i=0;i<DAYS.length;i++) if(iso(DAYS[i].date)===day){ goWeek(Math.floor(i/ND)); goPage(i,false); break; }
  if(room && window.CampusMap) setTimeout(function(){ CampusMap.open(room); },200);
  if(q.get("stats")==="1") openStats();
  /* открыт внутри Telegram как мини-приложение — растягиваем на весь экран */
  if(/tgWebApp/.test(location.hash+location.search)){
    var tgs=document.createElement("script");
    tgs.src="https://telegram.org/js/telegram-web-app.js";
    tgs.onload=function(){ try{ Telegram.WebApp.ready(); Telegram.WebApp.expand(); }catch(e){} };
    document.head.appendChild(tgs);
  }
})();
tick(); setInterval(tick,1000);
setInterval(function(){ renderStatus(); renderNext(); tick(); markPast(); },30000);
var rz;
window.addEventListener("resize",function(){
  clearTimeout(rz); rz=setTimeout(function(){ fitEvents(); goPage(curPage(),false); },140);
});
document.addEventListener("visibilitychange",function(){
  if(!document.hidden){ renderStatus(); renderNext(); tick(); markPast(); }
});
/* офлайн-кэш только на боевом домене, локально он мешает разработке */
/* убираем плашку загрузки, когда всё нарисовано */
(function(){
  var b=$("boot"); if(!b) return;
  var done=false;
  function hide(){                      /* и в фоновой вкладке тоже: там rAF не срабатывает */
    if(done) return; done=true;
    b.classList.add("gone");
    setTimeout(function(){ b.remove(); },320);
  }
  requestAnimationFrame(function(){ setTimeout(hide,80); });
  setTimeout(hide,600);
})();

if("serviceWorker" in navigator){
  if(/^(localhost|127\.0\.0\.1)$/.test(location.hostname)){
    navigator.serviceWorker.getRegistrations().then(function(rs){ rs.forEach(function(r){ r.unregister(); }); });
    if(window.caches) caches.keys().then(function(ks){ ks.forEach(function(k){ caches.delete(k); }); });
  }else{
    window.addEventListener("load",function(){ navigator.serviceWorker.register(BASE+"sw.js",{scope:BASE}); });
  }
}
})();
