'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'apps-script','Sync.gs'),'utf8');
const context={console,Date,JSON,Math,String,Number,Array,Object,isFinite,Utilities:{formatDate:function(date,tz,pattern){return pattern==='yyyy'?'2026':'2026-10-05 12:00:00';}}};
vm.runInNewContext(source,context,{filename:'apps-script/Sync.gs'});
function sheet(name,values,display,rangeValues){
  const ranges=[];
  return {
    name:name,
    getName:function(){return name;},
    getDataRange:function(){return {getValues:function(){return values;},getDisplayValues:function(){return display;}};},
    getRange:function(a1){ranges.push(a1);return {getValues:function(){return rangeValues;}};},
    ranges:ranges
  };
}
const dailyValues=[['Driver ID','Name','First Del','Assign','Delivered','On-hold','Position']];
const daily=sheet('Daily Report',dailyValues,dailyValues,[[9876],[4321]]);
const fleetValues=Array.from({length:5},function(){return Array(37).fill('');});
fleetValues[3][0]='ID';fleetValues[3][1]='Name';fleetValues[3][2]='Function';
fleetValues[3][35]='2026-10-04';fleetValues[3][36]='2026-10-05';
fleetValues[4][0]='staff-1';fleetValues[4][1]='Worker';fleetValues[4][2]='2WH';
fleetValues[4][35]='WORK';fleetValues[4][36]='2WH';
const fleet=sheet('Dayoff Fleet',fleetValues,fleetValues,[]);
const sheets=[daily,fleet];
const ss={
  getSpreadsheetTimeZone:function(){return 'Asia/Bangkok';},
  getName:function(){return 'Workstation ABBTG-A';},
  getSheetByName:function(name){return sheets.find(function(item){return item.name===name;})||null;},
  getSheets:function(){return sheets;}
};
const result=context.SpxSync_.buildPayload(ss);
assert.deepEqual(Array.from(daily.ranges),['L2:L3'],'Apps Script reads the exact contiguous Daily Report cells');
assert.deepEqual(JSON.parse(JSON.stringify(result.payload.fleet.cols.homeKpis)),{todayVolume:9876,inbound:4321},'L2 maps to Today\'s Volume and L3 maps to Inbound through existing roster cols');
assert.equal(result.payload.fleet.cols.planHC.source,'dayoff fleet!AK4:AK','existing Plan HC source remains unchanged');
console.log('PASS: Apps Script maps Daily Report!L2 to Today\'s Volume and L3 to Inbound via the existing fleet cols payload');
