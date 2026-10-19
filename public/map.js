/* Один поток Pointer Events для мыши и всех касаний. Начало нового жеста
   берёт текущее положение карты: второй палец и его отпускание не дают скачка. */
function attachMapGestures(svg, getBox, setBox, maxWidth){
  "use strict";
  var pointers=new Map(), gesture=null, moved=false;
  function middle(points){
    var a=points[0], b=points[1]||a;
    return {x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  }
  function distance(points){
    return Math.max(1,Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y));
  }
  function rebase(){
    var points=Array.from(pointers.values()).slice(0,2), box=getBox();
    if(!points.length || !box){ gesture=null; return; }
    var r=svg.getBoundingClientRect(), center=middle(points);
    gesture={box:box.slice(), center:center, rect:r, distance:points.length===2?distance(points):null,
      anchor:{x:box[0]+(center.x-r.left)/r.width*box[2],
              y:box[1]+(center.y-r.top)/r.height*box[3]}};
  }
  function zoom(box, anchor, center, width){
    var r=svg.getBoundingClientRect(), w=Math.max(24,Math.min(maxWidth(),width));
    var h=box[3]*w/box[2];
    setBox([anchor.x-(center.x-r.left)/r.width*w,
            anchor.y-(center.y-r.top)/r.height*h,w,h]);
  }
  svg.addEventListener("pointerdown",function(e){
    if(!getBox() || (e.pointerType==="mouse" && e.button!==0)) return;
    if(!pointers.size) moved=false;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,target:e.target});
    if(pointers.size>1) moved=true;
    // Сохраняем исходную цель: обычное нажатие на кабинет по-прежнему выбирает его.
    try { e.target.setPointerCapture(e.pointerId); } catch(ignore){}
    rebase();
  });
  svg.addEventListener("pointermove",function(e){
    var point=pointers.get(e.pointerId);
    if(!point || !gesture) return;
    point.x=e.clientX; point.y=e.clientY;
    var points=Array.from(pointers.values()).slice(0,2), center=middle(points), box=gesture.box;
    if(points.length===2){
      moved=true;
      zoom(box,gesture.anchor,center,box[2]*gesture.distance/distance(points));
    } else {
      var dx=center.x-gesture.center.x, dy=center.y-gesture.center.y;
      if(Math.hypot(dx,dy)>5) moved=true;
      setBox([box[0]-dx/gesture.rect.width*box[2],
              box[1]-dy/gesture.rect.height*box[3],box[2],box[3]]);
    }
  });
  function end(e){
    var point=pointers.get(e.pointerId);
    if(!point) return;
    pointers.delete(e.pointerId);
    rebase();
    try {
      if(point.target.hasPointerCapture(e.pointerId)) point.target.releasePointerCapture(e.pointerId);
    } catch(ignore){}
  }
  svg.addEventListener("pointerup",end);
  svg.addEventListener("pointercancel",end);
  svg.addEventListener("lostpointercapture",end);
  svg.addEventListener("click",function(e){
    if(moved){ e.preventDefault(); e.stopPropagation(); }
  },true);
  svg.addEventListener("wheel",function(e){
    e.preventDefault();
    var box=getBox();
    if(!box || pointers.size || !e.deltaY) return;
    var r=svg.getBoundingClientRect(), center={x:e.clientX,y:e.clientY};
    var units=e.deltaMode===1?16:e.deltaMode===2?r.height:1;
    var k=Math.exp(Math.max(-1,Math.min(1,e.deltaY*units*(e.ctrlKey?0.01:0.002))));
    zoom(box,{x:box[0]+(center.x-r.left)/r.width*box[2],
              y:box[1]+(center.y-r.top)/r.height*box[3]},center,box[2]*k);
  },{passive:false});
  return function reset(){
    var active=Array.from(pointers.entries());
    pointers.clear(); gesture=null; moved=false;
    active.forEach(function(entry){
      try { entry[1].target.releasePointerCapture(entry[0]); } catch(ignore){}
    });
  };
}

/* Карта корпуса: планы этажей из aitumap. Ищет кабинет по номеру и показывает,
   где он находится — мини-картой в карточке пары и на весь экран. */
window.CampusMap = (function(){
"use strict";

var BASE=(document.currentScript&&document.currentScript.src)
  ? new URL(".",document.currentScript.src).href : "./";

var DATA=null, loading=null;
var KIND_COLOR={
  rooms:"#4c8dff", lab:"#a855f7", club:"#ec4899", office:"#14b8a6", hall:"#f59e0b",
  dining:"#f97316", library:"#eab308", wcs:"#64748b", techs:"#475569",
  stairs:"#22c55e", escapes:"#16a34a", gym:"#0ea5e9", other:"#94a3b8"
};
var SVGNS="http://www.w3.org/2000/svg";

function load(){
  if(DATA) return Promise.resolve(DATA);
  if(!loading) loading=fetch(BASE+"map/floors.json").then(function(r){ return r.json(); })
    .then(function(d){ DATA=d; return d; });
  return loading;
}
/* тихо подгружаем данные, пока пользователь смотрит расписание */
if(window.requestIdleCallback) requestIdleCallback(function(){ load().catch(function(){}); });
else setTimeout(function(){ load().catch(function(){}); }, 2500);

function el(tag,cls,html){ var n=document.createElement(tag); if(cls)n.className=cls;
  if(html!=null)n.innerHTML=html; return n; }
function s(tag,attrs){ var n=document.createElementNS(SVGNS,tag);
  for(var k in attrs) if(attrs[k]!=null) n.setAttribute(k,attrs[k]); return n; }
function esc(x){ return String(x==null?"":x).replace(/[&<>"]/g,function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]; }); }
function norm(x){ return String(x||"").toLowerCase().replace(/\s+/g,"").replace(/^c1\./,""); }
/* ключ кабинета без хвостовой буквы: C1.2.221K → «2.221», 302P → «302».
   Буква на конце (L/P/K) обозначает тип аудитории, номер и так уникален. */
function keyOf(x){
  var t=String(x||"").trim().replace(/\s+/g,"");
  var m=t.match(/^(?:C1\.)?(\d)\.(\d{2,4})[A-Za-zА-Яа-я]?$/);
  if(m) return m[1]+"."+m[2];
  m=t.match(/^(\d{2,4})[A-Za-zА-Яа-я]?$/);
  return m?m[1]:null;
}
function color(k){ return KIND_COLOR[k]||KIND_COLOR.other; }

function bbox(poly){
  var x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
  poly.forEach(function(p){ x1=Math.min(x1,p[0]); y1=Math.min(y1,p[1]);
                            x2=Math.max(x2,p[0]); y2=Math.max(y2,p[1]); });
  return {x:x1,y:y1,w:x2-x1,h:y2-y1,cx:(x1+x2)/2,cy:(y1+y2)/2};
}
/* поиск кабинета по номеру, названию или синониму */
function find(query){
  if(!DATA||!query) return null;
  var q=norm(query);
  for(var i=0;i<DATA.floors.length;i++){
    var f=DATA.floors[i];
    for(var j=0;j<f.rooms.length;j++){
      var r=f.rooms[j];
      if(norm(r.id)===q || norm(r.title)===q ||
         (r.alt||[]).some(function(a){ return norm(a)===q; })) return {room:r,floor:f};
    }
  }
  var key=keyOf(query);                              /* по номеру без буквы */
  if(key) for(i=0;i<DATA.floors.length;i++){
    var fk=DATA.floors[i];
    for(j=0;j<fk.rooms.length;j++)
      if(keyOf(fk.rooms[j].id)===key) return {room:fk.rooms[j],floor:fk};
  }
  for(i=0;i<DATA.floors.length;i++){                 /* мягкое совпадение */
    var f2=DATA.floors[i];
    for(j=0;j<f2.rooms.length;j++)
      if(norm(f2.rooms[j].id).indexOf(q)>=0) return {room:f2.rooms[j],floor:f2};
  }
  return null;
}
function search(query,limit){
  if(!DATA) return [];
  var q=norm(query), key=keyOf(query), out=[];
  DATA.floors.forEach(function(f){
    f.rooms.forEach(function(r){
      var hay=norm(r.id)+" "+norm(r.title)+" "+(r.alt||[]).map(norm).join(" ");
      if(!q || hay.indexOf(q)>=0 || (key && keyOf(r.id)===key)) out.push({room:r,floor:f});
    });
  });
  out.sort(function(a,b){ return norm(a.room.id).indexOf(q)-norm(b.room.id).indexOf(q); });
  return out.slice(0,limit||40);
}
function label(r){ return r.title || r.id.replace(/^C1\./,""); }

/* ---------- отрисовка плана ---------- */
function drawFloor(floor, opts){
  opts=opts||{};
  var g=s("g",null);

  /* контур здания */
  (DATA.common && DATA.common.building || []).forEach(function(b){
    g.appendChild(s("path",{d:b.d, transform:b.t, "class":"mp-bg"}));
  });

  /* зоны: стены, техпомещения, санузлы, лестницы, выходы, спортзал, коворкинг */
  floor.zones.forEach(function(z){
    g.appendChild(s(z.closed?"polygon":"polyline",{
      points:z.p.map(function(p){return p.join(",");}).join(" "),
      "class":"mp-zone z-"+(z.k||"walls")}));
  });

  /* кабинеты */
  floor.rooms.forEach(function(r){
    var on=opts.highlight && r===opts.highlight;
    var p=s("polygon",{points:r.poly.map(function(q){return q.join(",");}).join(" "),
      "class":"mp-room"+(on?" hl":""), fill:color(r.kind)+(on?"":"33"),
      stroke:color(r.kind), "data-id":r.id});
    if(opts.onPick) p.addEventListener("click",function(e){ e.stopPropagation(); opts.onPick(r,floor); });
    g.appendChild(p);
  });

  /* иконки: санузел, лестница, выход */
  (floor.icons||[]).forEach(function(ic){
    var gi=s("g",{"class":"mp-ic i-"+(ic.k||"")});
    ic.paths.forEach(function(pp){ gi.appendChild(s("path",{d:pp.d, transform:pp.t})); });
    g.appendChild(gi);
  });

  /* подписи кабинетов и зон */
  if(opts.labels!==false){
    floor.rooms.forEach(function(r){
      var b=bbox(r.poly), on=opts.highlight===r;
      if(b.w<14 && b.h<14 && !on) return;
      var name=r.title || r.id.replace(/^C1\.\d\./,"").replace(/^C1\./,"");
      var t=s("text",{x:b.cx, y:b.cy+1.4, "class":"mp-txt"+(on?" hl":"")+(r.title?" zone":"")});
      t.textContent=name;
      g.appendChild(t);
    });
  }

  /* крупные подписи блоков C1.1 / C1.2 / C1.3 */
  (DATA.common && DATA.common.labels || []).forEach(function(l){
    g.appendChild(s("path",{d:l.d, transform:l.t, "class":"mp-blk"}));
  });

  if(opts.highlight){
    var b2=bbox(opts.highlight.poly);
    g.appendChild(s("circle",{cx:b2.cx, cy:b2.cy, r:Math.max(b2.w,b2.h)/2+5, "class":"mp-ring"}));
  }
  return g;
}

/* ---------- мини-карта в карточке пары ---------- */
function mini(host, roomQuery){
  host.innerHTML='<div class="mp-load">Загружаю карту…</div>';
  load().then(function(){
    var hit=find(roomQuery);
    if(!hit){
      host.innerHTML='<div class="mp-none">Кабинета <b>'+esc(roomQuery)+
        "</b> нет на плане корпуса C1</div>";
      return;
    }
    /* берём заметный кусок этажа: видно соседний блок и подпись C1.x — так понятно, где это */
    var b=bbox(hit.room.poly);
    var W=Math.max(300, b.w*7), H=W*0.5;
    var vb=[b.cx-W/2, b.cy-H/2, W, H];
    var lim=DATA.viewBox;                                  /* не выходим за план */
    if(vb[0]<lim[0]-20) vb[0]=lim[0]-20;
    if(vb[0]+vb[2]>lim[0]+lim[2]+20) vb[0]=lim[0]+lim[2]+20-vb[2];
    var svg=s("svg",{viewBox:vb.join(" "), "class":"mp-svg",
      preserveAspectRatio:"xMidYMid slice"});
    svg.appendChild(drawFloor(hit.floor,{highlight:hit.room}));
    host.innerHTML="";
    host.appendChild(svg);
    host.appendChild(overview(hit.room));
    host.appendChild(el("div","mp-cap","Нажми, чтобы открыть карту"));
    host.classList.add("ready","clickable");
    host.onclick=function(){ open(roomQuery); };
  }).catch(function(e){
    host.innerHTML='<div class="mp-none">Карта недоступна</div>';
  });
}

/* обзорная схема здания целиком с точкой «вы здесь» */
function overview(room){
  var vb=DATA.viewBox, b=bbox(room.poly);
  var o=s("svg",{viewBox:vb.join(" "), "class":"mp-ov", preserveAspectRatio:"xMidYMid meet"});
  (DATA.common && DATA.common.building || []).forEach(function(x){
    o.appendChild(s("path",{d:x.d, transform:x.t, "class":"ov-bg"}));
  });
  o.appendChild(s("circle",{cx:b.cx, cy:b.cy, r:40, "class":"ov-halo"}));
  o.appendChild(s("circle",{cx:b.cx, cy:b.cy, r:17, "class":"ov-dot"}));
  var w=el("div","mp-ovwrap");
  w.appendChild(o);
  return w;
}

/* ---------- карта на весь экран ---------- */
var view=null, resetGestures=null, state={floor:1, sel:null, vb:null};

function build(){
  if(view) return view;
  view=el("div","mapview");
  view.innerHTML=
    '<div class="mv-top">'+
      '<div class="mv-search"><input id="mvq" type="search" placeholder="Кабинет: 2.232P, актовый зал…" autocomplete="off"></div>'+
      '<div class="mv-floors" id="mvFloors"></div>'+
      '<button class="mv-x" id="mvClose" aria-label="Закрыть">'+
        '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>'+
    "</div>"+
    '<div class="mv-body"><svg id="mvSvg"></svg>'+
      '<div class="mv-results" id="mvRes" hidden></div>'+
      '<div class="mv-info" id="mvInfo" hidden></div>'+
      '<div class="mv-hint">Колесо или щипок — масштаб, перетаскивание — сдвиг</div>'+
    "</div>";
  document.body.appendChild(view);

  view.querySelector("#mvClose").onclick=close;
  var q=view.querySelector("#mvq");
  q.addEventListener("input",function(){ results(q.value); });
  q.addEventListener("keydown",function(e){
    if(e.key==="Enter"){ var r=search(q.value,1)[0]; if(r) pick(r.room,r.floor,true); }
    if(e.key==="Escape"){ q.value=""; results(""); q.blur(); }
  });
  document.addEventListener("keydown",function(e){
    if(e.key==="Escape" && view && view.classList.contains("open")) close();
  });
  resetGestures=panzoom(view.querySelector("#mvSvg"));
  window.addEventListener("resize",function(){
    if(view.classList.contains("open")) render(true);
  });
  return view;
}
function floorsBar(){
  var host=view.querySelector("#mvFloors"); host.innerHTML="";
  DATA.floors.forEach(function(f){
    var b=el("button",f.level===state.floor?"on":"",f.level+" этаж");
    b.onclick=function(){ state.floor=f.level; state.sel=null; render(true); };
    host.appendChild(b);
  });
}
/* приводим область просмотра к пропорциям экрана, чтобы не было пустых полей */
function fitAspect(box){
  var r=view.querySelector("#mvSvg").getBoundingClientRect();
  var ar=(r.width||1)/(r.height||1);
  var x=box[0], y=box[1], w=box[2], h=box[3];
  if(w/h > ar){ var nh=w/ar; y-=(nh-h)/2; h=nh; }
  else        { var nw=h*ar; x-=(nw-w)/2; w=nw; }
  return [x,y,w,h];
}
function render(fit){
  if(fit && resetGestures) resetGestures();
  var svg=view.querySelector("#mvSvg");
  var f=DATA.floors.filter(function(x){ return x.level===state.floor; })[0];
  svg.innerHTML="";
  svg.appendChild(drawFloor(f,{highlight:state.sel, onPick:function(r){ pick(r,f,false); }}));
  floorsBar();
  if(fit){
    var vb=DATA.viewBox;
    if(state.sel){
      var b=bbox(state.sel.poly), pad=Math.max(b.w,b.h)*1.9+34;
      state.vb=fitAspect([b.cx-b.w/2-pad, b.cy-b.h/2-pad, b.w+pad*2, b.h+pad*2]);
    } else state.vb=fitAspect([vb[0]-8, vb[1]-8, vb[2]+16, vb[3]+16]);
    apply();
  }
  info();
}
function apply(){
  var svg=view.querySelector("#mvSvg");
  svg.setAttribute("viewBox", state.vb.join(" "));
}
function info(){
  var host=view.querySelector("#mvInfo");
  if(!state.sel){ host.hidden=true; return; }
  var r=state.sel;
  host.hidden=false;
  host.innerHTML='<b>'+esc(r.id.replace(/^C1\./,""))+"</b>"+
    (r.title?"<span>"+esc(r.title)+"</span>":"")+
    "<i>"+state.floor+" этаж · Главный корпус</i>";
}
function results(q){
  var host=view.querySelector("#mvRes");
  if(!q || !q.trim()){ host.hidden=true; return; }
  var list=search(q,24);
  host.hidden=false;
  if(!list.length){ host.innerHTML='<div class="mv-empty">Ничего не найдено</div>'; return; }
  host.innerHTML="";
  list.forEach(function(x){
    var b=el("button",null,
      '<b>'+esc(x.room.id.replace(/^C1\./,""))+"</b>"+
      (x.room.title?"<span>"+esc(x.room.title)+"</span>":"")+
      "<i>"+x.floor.level+" эт.</i>");
    b.onclick=function(){ pick(x.room,x.floor,true); host.hidden=true; };
    host.appendChild(b);
  });
}
function pick(room,floor,zoom){
  state.floor=floor.level; state.sel=room;
  render(!!zoom);
  if(!zoom){ info(); }
}
function panzoom(svg){
  return attachMapGestures(svg,function(){ return state.vb; },function(box){
    state.vb=box; apply();
  },function(){ return Math.max(DATA.viewBox[2],fitAspect(DATA.viewBox)[2])*1.6; });
}
function open(roomQuery){
  load().then(function(){
    build();
    var hit=roomQuery?find(roomQuery):null;
    state.sel=hit?hit.room:null;
    state.floor=hit?hit.floor.level:(state.floor||1);
    view.classList.add("open");
    document.body.classList.add("locked");
    var q=view.querySelector("#mvq");
    q.value=""; view.querySelector("#mvRes").hidden=true;
    render(true);
    if(!hit && roomQuery){
      var host=view.querySelector("#mvInfo");
      host.hidden=false;
      host.innerHTML='<b>'+esc(roomQuery)+"</b><span>нет на плане корпуса C1</span>";
    }
  });
}
function close(){
  if(!view) return;
  if(resetGestures) resetGestures();
  view.classList.remove("open");
  document.body.classList.remove("locked");
}

/* «C1.2» по номеру кабинета — чтобы подписать, в каком блоке искать */
function blockOf(id){
  var m=String(id||"").match(/^C1\.(\d)\./i);
  return m ? "блок C1."+m[1] : "";
}
return {open:open, close:close, mini:mini, load:load, find:find, blockOf:blockOf};
})();
