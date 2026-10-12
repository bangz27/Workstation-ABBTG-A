(function(){
  'use strict';
  var C = window.SPX_CONFIG;
  var Core = window.WeeklyOffCore;
  var OfflineStore = window.WeeklyOffOfflineStore;
  var sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, {
    auth: {persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, flowType:'implicit', storageKey:'abbtga-ws-auth'}
  });
  var state = {fleet:[], ops:[], selected:'Monday', session:null, lastUpdated:null, months:{}, monthOffset:0};
  var PAGE_SIZE = 500;
  var WEEKDAY_LABELS = ['จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์','อาทิตย์'];
  var isAuthenticated = false;
  var loadVersion = 0;
  function $(id){ return document.getElementById(id); }
  function esc(value){ return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]; }); }
  function allowed(session){ return !!(session && session.user && session.user.is_anonymous !== true); }
  function selectedMonthKey(){ return Core.relativeMonthKey(state.monthOffset); }
  function setMonthTab(offset){ state.monthOffset=offset; state.selected='Monday'; renderAll(); }
  function renderMonthHeader(){ var key=selectedMonthKey(); $('source-month').textContent=(state.monthOffset===0?'M0':'M+1')+' · '+Core.monthLabel(key); Array.prototype.forEach.call(document.querySelectorAll('.month-tab'),function(btn){var active=Number(btn.getAttribute('data-month-offset'))===state.monthOffset;btn.classList.toggle('active',active);btn.setAttribute('aria-selected',active?'true':'false');}); }
  function showGate(message){
    loadVersion++;
    if(state.session && OfflineStore) OfflineStore.clear(state.session);
    isAuthenticated=false; state.session=null; state.fleet=[]; state.ops=[];
    state.lastUpdated=null;
    $('weekly-app').hidden=true; $('auth-gate').hidden=false;
    $('login-message').textContent=message||'';
  }
  function showApp(session){
    if(!allowed(session)){showGate('กรุณาเข้าสู่ระบบด้วยบัญชี Supabase ที่ยืนยันตัวตนแล้ว');return;}
    state.session=session; isAuthenticated=true;
    $('auth-gate').hidden=true; $('weekly-app').hidden=false;
    load();
  }
  function setStatus(text, kind){ var el=$('source-state'); el.textContent=text; el.className='source-state'+(kind?' '+kind:''); }
  function currentLoad(version, user){
    return isAuthenticated && version===loadVersion && OfflineStore.userId(state.session)===user;
  }
  function showSnapshot(snapshot, label){
    state.months=snapshot.months||{}; state.lastUpdated=snapshot.savedAt;
    renderAll();
    $('load-error').hidden=true;
    setStatus(label+' · ข้อมูลล่าสุด '+OfflineStore.formatTimestamp(snapshot.savedAt),'offline');
  }
  function restUrl(table, columns, order){
    return C.SUPABASE_URL.replace(/\/+$/,'')+'/rest/v1/'+table+'?select='+encodeURIComponent(columns)+'&order='+encodeURIComponent(order+'.asc');
  }
  async function fetchAll(table, columns, order){
    var url=restUrl(table, columns, order), rows=[], start=0;
    while(true){
      if(!state.session || !state.session.access_token){var authError=new Error('ไม่พบ session สำหรับอ่านข้อมูล');authError.status=401;throw authError;}
      var response;
      try{response=await fetch(url,{method:'GET',headers:{apikey:C.SUPABASE_KEY,Authorization:'Bearer '+state.session.access_token,Range:start+'-'+(start+PAGE_SIZE-1)},cache:'no-store'});}
      catch(networkError){networkError.network=true;throw networkError;}
      if(!response.ok){ var body=''; try{body=await response.text();}catch(e){} var error=new Error('อ่านข้อมูลไม่สำเร็จ ('+response.status+')'+(body?': '+body:'')); error.status=response.status; throw error; }
      var batch=await response.json();
      if(!Array.isArray(batch)) throw new Error('รูปแบบข้อมูลไม่ถูกต้อง');
      rows=rows.concat(batch);
      if(batch.length<PAGE_SIZE) break;
      start+=batch.length;
    }
    return rows;
  }
  function personCard(person, group){
    var id=group==='fleet'?person.driver_id:person.ops_id;
    var emp=group==='fleet'?person.employee_id:'';
    var dept=group==='ops'?person.department:'';
    var compensatory= ['compensatory_1','compensatory_2','compensatory_3'].map(function(key,i){return person[key]?'<span>วันหยุดชดเชย#'+(i+1)+' <strong>'+esc(person[key])+'</strong></span>':'';}).join(''); return '<article class="person-card" role="button" tabindex="0" data-person-group="'+group+'" data-person-id="'+esc(id||'')+'" data-person-name="'+esc(person.staff_name||'')+'" aria-label="ดูรายละเอียด '+esc(person.staff_name||'')+'"><div class="person-top"><div><div class="person-name">'+esc(person.staff_name)+'</div><div class="person-id">'+(group==='fleet'?'Driver ID':'Ops ID')+': '+esc(id||'—')+'</div></div><span class="tag '+group+'">'+(group==='fleet'?'Fleet':'Ops')+'</span></div><div class="person-meta">'+(emp?'<span>Employee ID <strong>'+esc(emp)+'</strong></span>':'')+(dept?'<span>แผนก <strong>'+esc(dept)+'</strong></span>':'')+'<span>กะ <strong>'+esc(person.shift||'—')+'</strong></span><span>Weekly Off <strong>'+esc(person.weekly_off||'—')+'</strong></span>'+compensatory+'</div></article>';
  }
  function detailRow(label,value){ return '<div class="reference-row"><dt>'+esc(label)+'</dt><dd>'+esc(value||'—')+'</dd></div>'; }
  function compDateKey(raw){
    var s=String(raw==null?'':raw).trim(),m,months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
    m=/^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if(m)return m[1]+'-'+('0'+m[2]).slice(-2)+'-'+('0'+m[3]).slice(-2);
    m=/^(\d{1,2})[\/. -](\d{1,2})[\/. -](\d{4})$/.exec(s);
    if(m)return m[3]+'-'+('0'+m[2]).slice(-2)+'-'+('0'+m[1]).slice(-2);
    m=/^(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{4})$/.exec(s);
    if(m){var mo=months[m[2].slice(0,3).toLowerCase()];if(mo)return m[3]+'-'+('0'+mo).slice(-2)+'-'+('0'+m[1]).slice(-2);}
    return '';
  }
  function renderReferenceCalendar(person){
    var key=selectedMonthKey(),parts=/^(\d{4})-(\d{2})-/.exec(key);
    if(!parts){$('person-reference-calendar').innerHTML='';return;}
    var year=Number(parts[1]),month=Number(parts[2]),first=new Date(Date.UTC(year,month-1,1)),daysInMonth=new Date(Date.UTC(year,month,0)).getUTCDate();
    var offset=(first.getUTCDay()+6)%7,weeklyIndex=Core.dayIndex(person.weekly_off),compensatory={};
    ['compensatory_1','compensatory_2','compensatory_3'].forEach(function(k){var d=compDateKey(person[k]);if(d)compensatory[d]=true;});
    var cells=[];
    for(var blank=0;blank<offset;blank++)cells.push('<span class="reference-calendar-empty" aria-hidden="true"></span>');
    for(var day=1;day<=daysInMonth;day++){
      var dateKey=year+'-'+('0'+month).slice(-2)+'-'+('0'+day).slice(-2),weekday=(new Date(Date.UTC(year,month-1,day)).getUTCDay()+6)%7;
      var isWeekly=weekday===weeklyIndex,isComp=!!compensatory[dateKey],classes='reference-calendar-day'+(isWeekly?' weekly-off-day':'')+(isComp?' compensatory-day':'');
      var labels=[];if(isWeekly)labels.push('Weekly Off');if(isComp)labels.push('วันหยุดชดเชย');
      cells.push('<span class="'+classes+'"'+(labels.length?' aria-label="'+esc(day+' '+labels.join(' และ '))+'" title="'+esc(labels.join(' · '))+'"':' aria-label="'+day+'"')+'>'+day+'</span>');
    }
    $('person-reference-calendar').innerHTML='<div class="reference-calendar-heading"><b>ปฏิทิน '+esc(Core.monthLabel(key))+'</b><small>อ้างอิงจากวันหยุดประจำสัปดาห์และวันหยุดชดเชยที่บันทึกไว้</small></div><div class="reference-calendar-grid">'+['จ','อ','พ','พฤ','ศ','ส','อา'].map(function(d){return '<span class="reference-calendar-weekday">'+d+'</span>';}).join('')+cells.join('')+'</div>';
  }
  function openPersonReference(group,id,name){
    var records=group==='fleet'?state.fleet:state.ops;
    var person=records.find(function(p){
      var personId=String(group==='fleet'?p.driver_id:p.ops_id||'');
      return personId===String(id||'') && String(p.staff_name||'')===String(name||'');
    });
    if(!person)return;
    var rows=[];
    rows.push(detailRow('ชื่อ-นามสกุล',person.staff_name));
    if(group==='fleet'){
      rows.push(detailRow('Driver ID',person.driver_id));
      rows.push(detailRow('Employee ID',person.employee_id));
    }else{
      rows.push(detailRow('Ops ID',person.ops_id));
      rows.push(detailRow('แผนก',person.department));
    }
    rows.push(detailRow('กะ',person.shift));
    rows.push(detailRow('Weekly Off',person.weekly_off));
    ['compensatory_1','compensatory_2','compensatory_3'].forEach(function(key,index){
      if(person[key])rows.push(detailRow('วันหยุดชดเชย #'+(index+1),person[key]));
    });
    rows.push(detailRow('เดือนอ้างอิง',Core.monthLabel(selectedMonthKey())));
    renderReferenceCalendar(person);
    $('person-reference-title').textContent=person.staff_name||'รายละเอียดรายชื่อ';
    $('person-reference-subtitle').textContent=(group==='fleet'?'Fleet':'Ops')+' · ข้อมูลอ้างอิงจาก Owner Source';
    $('person-reference-content').innerHTML=rows.join('');
    $('person-reference-modal').hidden=false;
    document.body.classList.add('reference-modal-open');
    $('person-reference-close').focus();
  }
  function closePersonReference(){
    $('person-reference-modal').hidden=true;
    document.body.classList.remove('reference-modal-open');
  }
  document.addEventListener('click',function(event){
    var card=event.target.closest('.person-card[data-person-group]');
    if(card){openPersonReference(card.getAttribute('data-person-group'),card.getAttribute('data-person-id'),card.getAttribute('data-person-name'));return;}
    if(event.target.closest('#person-reference-close')||event.target.id==='person-reference-modal')closePersonReference();
  });
  document.addEventListener('keydown',function(event){
    var card=event.target.closest&&event.target.closest('.person-card[data-person-group]');
    if(card&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openPersonReference(card.getAttribute('data-person-group'),card.getAttribute('data-person-id'),card.getAttribute('data-person-name'));return;}
    if(event.key==='Escape'&&!$('person-reference-modal').hidden)closePersonReference();
  });
  function renderCalendar(){
    var summary=Core.summarize(state.fleet,state.ops);
    $('fleet-total').textContent=summary.totalFleet;
    $('ops-total').textContent=summary.totalOps;
    $('all-total').textContent=summary.total;
    $('week-grid').innerHTML=summary.days.map(function(item,index){
      return '<button class="day-card" type="button" data-day="'+esc(item.day)+'" aria-pressed="'+(state.selected===item.day?'true':'false')+'"><span class="day-name">'+WEEKDAY_LABELS[index]+'</span><span class="day-en">'+item.day.toUpperCase()+'</span><strong class="day-total">'+item.total+'</strong><span class="day-breakdown"><span>Fleet <b>'+item.fleet+'</b></span><span>Ops <b>'+item.ops+'</b></span></span></button>';
    }).join('');
    var note=$('weekday-note');
    if(summary.unknown.length){ note.hidden=false; note.textContent='ค่า Weekly Off ที่ไม่ตรงกับชื่อวันในปฏิทิน (แสดงในผลค้นหาได้): '+summary.unknown.map(function(x){return '“'+x.value+'” ('+x.count+')';}).join(', ')+'.'; }
    else { note.hidden=true; note.textContent=''; }
    renderDayDetail();
  }
  function renderDayDetail(){
    var people=Core.forDay(state.fleet,state.ops,state.selected);
    var index=Core.DAYS.indexOf(state.selected);
    var total=people.fleet.length+people.ops.length;
    $('detail-title').textContent='วัน'+WEEKDAY_LABELS[index]+' · รายชื่อ';
    $('detail-total').textContent=total+' คน';
    $('fleet-day-count').textContent=people.fleet.length+' คน';
    $('ops-day-count').textContent=people.ops.length+' คน';
    $('fleet-day-list').innerHTML=people.fleet.length?people.fleet.map(function(p){return personCard(p,'fleet');}).join(''):'<div class="empty-state">ไม่มีรายชื่อ Fleet ในวันนี้</div>';
    $('ops-day-list').innerHTML=people.ops.length?people.ops.map(function(p){return personCard(p,'ops');}).join(''):'<div class="empty-state">ไม่มีรายชื่อ Ops ในวันนี้</div>';
    Array.prototype.forEach.call(document.querySelectorAll('.day-card'),function(button){button.setAttribute('aria-pressed',button.getAttribute('data-day')===state.selected?'true':'false');});
  }
  function renderSearch(group){
    var isFleet=group==='fleet';
    var records=isFleet?state.fleet:state.ops;
    var query=$(group+'-search-input').value;
    var fields=isFleet?['driver_id','employee_id','staff_name']:['ops_id','staff_name','department'];
    var hits=Core.search(records,query,fields).slice().sort(function(a,b){return String(a.staff_name||'').localeCompare(String(b.staff_name||''),'th');});
    $(group+'-search-count').textContent=query.trim()?'พบ '+hits.length+' รายการ':'ทั้งหมด '+records.length+' รายการ';
    $(group+'-search-results').innerHTML=hits.length?hits.map(function(p){return personCard(p,group);}).join(''):'<div class="empty-state">ไม่พบรายชื่อที่ตรงกัน</div>';
  }
  function renderAll(){ var key=selectedMonthKey(); var month=state.months[key]||{fleet:[],ops:[]}; state.fleet=month.fleet; state.ops=month.ops; renderMonthHeader(); renderCalendar(); renderSearch('fleet'); renderSearch('ops'); }
  async function load(){
    var session=state.session;
    var user=OfflineStore.userId(session);
    if(!isAuthenticated || !user) return;
    var version=++loadVersion;
    if(!session.access_token){
      setStatus('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่','error');
      $('error-message').textContent='ไม่พบ session สำหรับอ่านข้อมูล';
      $('load-error').hidden=false;
      return;
    }
    if(navigator.onLine===false){
      var offlineSnapshot=OfflineStore.load(session);
      if(offlineSnapshot){if(currentLoad(version,user))showSnapshot(offlineSnapshot,'ออฟไลน์');return;}
      setStatus('ออฟไลน์ · ไม่มีข้อมูลที่บันทึกไว้','offline');
      $('error-message').textContent='ออฟไลน์และยังไม่มีข้อมูลที่บันทึกไว้สำหรับบัญชีนี้';
      $('load-error').hidden=false;
      return;
    }
    $('load-error').hidden=true;
    setStatus('กำลังโหลดข้อมูล…','');
    try{
      var result=await Promise.all([
        fetchAll('fleet_weekly_off','month_key,driver_id,employee_id,staff_name,shift,weekly_off,compensatory_1,compensatory_2,compensatory_3','month_key,driver_id'),
        fetchAll('ops_weekly_off','month_key,ops_id,staff_name,department,shift,weekly_off,compensatory_1,compensatory_2,compensatory_3','month_key,ops_id')
      ]);
      if(!currentLoad(version,user)) return;
      var savedAt=new Date().toISOString(), months={};
      result[0].forEach(function(row){var key=String(row.month_key||'').slice(0,10);if(!months[key])months[key]={fleet:[],ops:[]};months[key].fleet.push(row);});
      result[1].forEach(function(row){var key=String(row.month_key||'').slice(0,10);if(!months[key])months[key]={fleet:[],ops:[]};months[key].ops.push(row);});
      state.months=months;
      state.lastUpdated=savedAt;
      renderAll();
      var activeKey=selectedMonthKey(), active=months[activeKey];
      setStatus(active?'ออนไลน์ · '+(state.monthOffset===0?'M0':'M+1')+' · อัปเดตล่าสุด '+OfflineStore.formatTimestamp(savedAt):(state.monthOffset===0?'M0 ยังไม่มีข้อมูล':'M+1 ยังไม่มีข้อมูล'),'ready');
      OfflineStore.save(session,months,savedAt);
    }catch(error){
      if(!currentLoad(version,user)) return;
      var denied=error&&(error.status===401||error.status===403);
      if(denied){
        OfflineStore.clear(session);
        state.fleet=[]; state.ops=[]; state.months={}; state.lastUpdated=null;
        renderAll();
      }
      var snapshot=!denied&&(navigator.onLine===false||error.network===true)?OfflineStore.load(session):null;
      if(snapshot&&currentLoad(version,user)){showSnapshot(snapshot,navigator.onLine===false?'ออฟไลน์':'เชื่อมต่อไม่ได้');return;}
      setStatus(navigator.onLine===false?'ออฟไลน์ · ไม่มีข้อมูลที่บันทึกไว้':'โหลดข้อมูลไม่สำเร็จ','error');
      $('error-message').textContent=error&&error.status===401?'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่':(error&&error.status===403?'บัญชีนี้ไม่มีสิทธิ์อ่านข้อมูล Weekly Off':(error&&error.message?error.message:'เกิดข้อผิดพลาด'));
      $('load-error').hidden=false;
    }
  }
  $('login-form').addEventListener('submit',async function(event){
    event.preventDefault();
    var email=$('login-email').value.trim(), password=$('login-password').value, button=$('login-button');
    if(!email||!password){$('login-message').textContent='กรุณากรอกอีเมลและรหัสผ่าน';return;}
    button.disabled=true; button.textContent='กำลังเข้าสู่ระบบ…'; $('login-message').textContent='';
    try{
      var result=await sb.auth.signInWithPassword({email:email,password:password});
      if(result.error) throw result.error;
      $('login-password').value='';
      if(!allowed(result.data.session)) throw new Error('บัญชีนี้ไม่มีสิทธิ์เข้าสู่ระบบ');
      showApp(result.data.session);
    }catch(error){
      var message=String(error&&(error.message||error)||'');
      $('login-message').textContent=/invalid login credentials/i.test(message)?'อีเมลหรือรหัสผ่านไม่ถูกต้อง':(message||'เข้าสู่ระบบไม่สำเร็จ');
    }finally{button.disabled=false;button.textContent='เข้าสู่ระบบ';}
  });
  Array.prototype.forEach.call(document.querySelectorAll('.month-tab'),function(button){button.addEventListener('click',function(){setMonthTab(Number(button.getAttribute('data-month-offset')));});});
  $('week-grid').addEventListener('click',function(event){
    var button=event.target.closest('[data-day]');
    if(!button) return;
    state.selected=button.getAttribute('data-day');
    renderDayDetail();
  });
  $('fleet-search-input').addEventListener('input',function(){renderSearch('fleet');});
  $('ops-search-input').addEventListener('input',function(){renderSearch('ops');});
  $('retry-button').addEventListener('click',load);
  window.addEventListener('offline',function(){
    if(isAuthenticated&&state.lastUpdated)setStatus('ออฟไลน์ · ข้อมูลล่าสุด '+OfflineStore.formatTimestamp(state.lastUpdated),'offline');
  });
  window.addEventListener('online',function(){
    if(isAuthenticated){setStatus('ออนไลน์ · กำลังโหลดข้อมูลล่าสุด…','');load();}
  });
  sb.auth.onAuthStateChange(function(event,session){
    if(session&&allowed(session)){
      var previous=state.session;
      if(previous&&OfflineStore.userId(previous)!==OfflineStore.userId(session)){
        OfflineStore.clear(previous);loadVersion++;state.fleet=[];state.ops=[];state.lastUpdated=null;
      }
      state.session=session;
    }
    if(event==='SIGNED_OUT') showGate('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  });
  sb.auth.getSession().then(function(result){
    if(result.error){showGate('ตรวจสอบการเข้าสู่ระบบไม่สำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง');return;}
    if(allowed(result.data.session)) showApp(result.data.session);
    else showGate('');
  }).catch(function(){showGate('ตรวจสอบการเข้าสู่ระบบไม่สำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง');});
})();
