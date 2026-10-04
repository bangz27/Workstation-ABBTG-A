'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'apps-script','Sync.gs'),'utf8');
const context={console,Date,JSON,Math,String,Number,Array,Object,isFinite};
vm.runInNewContext(source,context,{filename:'apps-script/Sync.gs'});
const count=context.SpxSync_.planHCFromAK;
assert.equal(typeof count,'function','Plan HC helper is exposed for verification');
function row(id,name,position){
  const r=Array(37).fill('');r[0]=id;r[1]=name;r[36]=position;return r;
}
const display=[
  Array(37).fill('header'),
  Array(37).fill('meta'),
  Array(37).fill('date'),
  row('e1','Alice','2WH'),
  row('e2','Bob',' 4wh '),
  row('e3','Cara','4W FM'),
  row('','','2WH'),
  row('total','รวม','4WH'),
  row('e4','Dan','2wh'),
  row('e5','Eve','unknown'),
];
const result=count(display,{id:0,name:1},2);
assert.equal(result.source,'dayoff fleet!AK4:AK','AK source is explicit');
assert.equal(result.two,2,'AK 2W values are normalized and counted by real employee rows only');
assert.equal(result.four,1,'AK 4W values are normalized and counted by real employee rows only');
const example=[];
for(let i=0;i<14;i++)example.push(row('2w-'+i,'2W '+i,i===0?' 2wh ':'2WH'));
for(let i=0;i<6;i++)example.push(row('4w-'+i,'4W '+i,'4WH'));
for(let i=0;i<5;i++)example.push(row('fm-'+i,'FM '+i,'4W FM'));
example.push(row('','','2WH'));
const expected=count([Array(37).fill('h'),Array(37).fill('h'),Array(37).fill('h'),...example],{id:0,name:1},2);
assert.equal(expected.two,14,'2W HC example');
assert.equal(expected.four,6,'4W HC example');
assert.equal(expected.two+expected.four,20,'Plan HC total example');
assert.equal(expected.source,'dayoff fleet!AK4:AK','source is explicit');
console.log('PASS: Plan HC uses dayoff fleet!AK4:AK with whitespace/case normalization, invalid-row filtering, and 4W FM exclusion');
