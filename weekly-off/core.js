(function(root){
  'use strict';
  var DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  var THAI_DAYS = ['วันจันทร์','วันอังคาร','วันพุธ','วันพฤหัสบดี','วันศุกร์','วันเสาร์','วันอาทิตย์'];

  function dayIndex(value){
    var raw = String(value == null ? '' : value).trim().toLowerCase();
    return DAYS.findIndex(function(day){ return day.toLowerCase() === raw; });
  }
  function summarize(fleet, ops){
    var days = DAYS.map(function(day){ return {day:day, fleet:0, ops:0, total:0}; });
    var unknown = Object.create(null);
    function add(records, group){
      records.forEach(function(person){
        var index = dayIndex(person.weekly_off);
        if(index < 0){ var label = String(person.weekly_off == null ? '' : person.weekly_off); unknown[label] = (unknown[label] || 0) + 1; return; }
        days[index][group] += 1;
        days[index].total += 1;
      });
    }
    add(fleet, 'fleet');
    add(ops, 'ops');
    return {
      days:days,
      totalFleet:fleet.length,
      totalOps:ops.length,
      total:fleet.length + ops.length,
      unknown:Object.keys(unknown).map(function(value){ return {value:value, count:unknown[value]}; })
    };
  }
  function forDay(fleet, ops, day){
    var target = dayIndex(day);
    if(target < 0) return {fleet:[], ops:[]};
    function select(records){ return records.filter(function(person){ return dayIndex(person.weekly_off) === target; }); }
    return {fleet:select(fleet), ops:select(ops)};
  }
  function search(records, query, fields){
    var needle = String(query == null ? '' : query).trim().toLocaleLowerCase();
    if(!needle) return records.slice();
    return records.filter(function(record){
      return fields.some(function(field){ return String(record[field] == null ? '' : record[field]).toLocaleLowerCase().indexOf(needle) >= 0; });
    });
  }
  root.WeeklyOffCore = {DAYS:DAYS, THAI_DAYS:THAI_DAYS, dayIndex:dayIndex, summarize:summarize, forDay:forDay, search:search};
})(typeof window !== 'undefined' ? window : globalThis);
