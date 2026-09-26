(function(){
"use strict";

var DAYS=["mon","tue","wed","thu","fri","sat","sun"];
function minutes(s){ var p=String(s||"0:0").split(":"); return (+p[0])*60+(+p[1]||0); }
function same(a,b){
  return a.subject===b.subject && a.type===b.type && !!a.online===!!b.online &&
    (a.room||"")===(b.room||"") && (a.teacher||"")===(b.teacher||"");
}
function format(it){
  var type=it.type==="lecture"?"lecture":it.type==="practice"?"practice":"other";
  return type+(it.online?"-online":"");
}
function calculate(schedule){
  var dayStats=[], subjects=new Map(), formats=new Map(), rooms=new Map(), total=0, sessions=0, rawLessons=0;
  DAYS.forEach(function(key){
    var list=((schedule.days||{})[key]||[]).slice().sort(function(a,b){ return minutes(a.start)-minutes(b.start); });
    var groups=[];
    list.forEach(function(it){
      var prev=groups[groups.length-1];
      if(prev && same(prev.last,it) && minutes(it.start)-minutes(prev.last.end)<=20){
        prev.parts.push(it); prev.last=it;
      }else groups.push({it:it,last:it,parts:[it]});
    });
    var day={key:key,minutes:0,sessions:groups.length,lessons:list.length,window:0,windows:0,
      online:0,offline:0,first:null,last:null};
    groups.forEach(function(g,i){
      var start=minutes(g.parts[0].start), end=minutes(g.last.end);
      if(i){ var gap=start-minutes(groups[i-1].last.end);
        if(gap>=60){day.window+=gap;day.windows++;} }
      if(day.first===null) day.first=start;
      day.last=end;
      var dur=0;
      g.parts.forEach(function(p){dur+=Math.max(0,minutes(p.end)-minutes(p.start));});
      day.minutes+=dur;
      if(g.it.online) day.online+=dur; else day.offline+=dur;
      if(!g.it.online && g.it.room){
        var roomKey=(g.it.building||"")+"|"+g.it.room;
        var room=rooms.get(roomKey)||{name:g.it.room,building:g.it.building||"",minutes:0,sessions:0};
        room.minutes+=dur; room.sessions++;
        rooms.set(roomKey,room);
      }
      var f=format(g.it); formats.set(f,(formats.get(f)||0)+dur);
      var s=subjects.get(g.it.subject)||{name:g.it.subject,minutes:0,sessions:0,online:0,offline:0,days:new Set()};
      s.minutes+=dur; s.sessions++; s.days.add(key);
      if(g.it.online) s.online+=dur; else s.offline+=dur;
      subjects.set(g.it.subject,s);
    });
    total+=day.minutes; sessions+=day.sessions; rawLessons+=day.lessons;
    dayStats.push(day);
  });
  return {days:dayStats,subjects:Array.from(subjects.values()).sort(function(a,b){return b.minutes-a.minutes||a.name.localeCompare(b.name);}),
    formats:formats,rooms:Array.from(rooms.values()).sort(function(a,b){return b.minutes-a.minutes||a.name.localeCompare(b.name);}),
    total:total,sessions:sessions,rawLessons:rawLessons,
    online:dayStats.reduce(function(a,d){return a+d.online;},0),
    offline:dayStats.reduce(function(a,d){return a+d.offline;},0),
    window:dayStats.reduce(function(a,d){return a+d.window;},0),
    windows:dayStats.reduce(function(a,d){return a+d.windows;},0),
    activeDays:dayStats.filter(function(d){return d.sessions>0;}).length};
}
window.ScheduleStats={calculate:calculate};
})();
