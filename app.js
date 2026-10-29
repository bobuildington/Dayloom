/* Dayloom — a private, local-first task manager. No accounts or external services. */
(() => {
  'use strict';
  const STORE_KEY = 'dayloom:data:v1';
  const PALETTE = ['#6457e8','#e99d64','#3ca99b','#e46a8a','#6399dd','#b17ad9','#b3a05d','#65788e'];
  const PRIORITIES = ['none','low','medium','high'];
  const REPEATS = ['none','daily','weekly','monthly','custom'];
  const EVENT_REPEATS = ['none','daily','weekly','monthly','yearly'];
  const validTime = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(v || '');
  const el = id => document.getElementById(id);
  const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // Extract safe HTTP(S) addresses; escape all displayed values before inserting HTML.
  function webLinks(values,limit=4){
    const entries=[],seen=new Set(),urlPattern=/(?:https?:\/\/|www\.)[^\s<>"']+/gi;
    for(const text of values){
      for(const match of String(text??'').matchAll(urlPattern)){
        let candidate=match[0].replace(/[.,!?;:\x60]+$/g,'');
        for(const [open,close] of [['(',')'],['[',']'],['{','}']]){
          while(candidate.endsWith(close)&&candidate.split(close).length>candidate.split(open).length)candidate=candidate.slice(0,-1);
        }
        if(!candidate||candidate.length>2048)continue;
        try{
          const url=new URL(/^www\./i.test(candidate)?'https://'+candidate:candidate);
          if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password||seen.has(url.href))continue;
          seen.add(url.href);entries.push({href:url.href,label:candidate});
        }catch{ /* Ignore malformed URLs. */ }
      }
    }
    if(!entries.length)return '';
    return '<div class="item-link-bar" aria-label="Web links">'+entries.slice(0,limit).map(link=>
      '<a class="smart-link" href="'+escapeHtml(link.href)+'" target="_blank" rel="noopener noreferrer" title="'+escapeHtml(link.label)+'" aria-label="Open '+escapeHtml(link.label)+' in a new tab">'+icon('arrow')+'<span>'+escapeHtml(link.label)+'</span></a>'
    ).join('')+(entries.length>limit?'<span class="link-extra">+'+(entries.length-limit)+' more in editor</span>':'')+'</div>';
  }
  function youtubeIds(values){const ids=[],seen=new Set();const re=/(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?[^<>\s]*?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/g;for(const text of values){for(const m of String(text??'').matchAll(re)){const id=m[1];if(!seen.has(id)){seen.add(id);ids.push(id);if(ids.length>=10)break;}}if(ids.length>=10)break;}return ids;}
  function refreshWebLinks(contentId,titleId,previewId,videoId){
    const preview=el(previewId);
    if(preview){preview.innerHTML=webLinks([el(titleId).value,el(contentId).value],16);preview.hidden=!preview.innerHTML;}
    if(!videoId)return;const box=el(videoId);if(!box)return;
    const ids=youtubeIds([el(titleId).value,el(contentId).value]);
    const key=JSON.stringify(ids);if(box.dataset.ytIds===key)return;box.dataset.ytIds=key;
    box.innerHTML=ids.map(id=>`<div class="video-embed"><iframe src="https://www.youtube.com/embed/${id}" title="YouTube video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen" allowfullscreen></iframe></div>`).join('');
  }
  const uuid = () => crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  const localDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const parseLocalDate = value => { if(!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null; const [y,m,d]=value.split('-').map(Number); const result=new Date(y,m-1,d); return result.getFullYear()===y && result.getMonth()===m-1 && result.getDate()===d ? result : null; };
  const todayKey = () => localDate(new Date());
  const dateLabel = (value,opts={month:'short',day:'numeric'}) => { const d=parseLocalDate(value); return d ? d.toLocaleDateString(undefined,opts) : 'No date'; };
  const defaultData = () => ({lists:[{id:'inbox',name:'Inbox',color:'#6457e8'},{id:'personal',name:'Personal',color:'#3ca99b'},{id:'work',name:'Work',color:'#e99d64'}],tasks:[],events:[],notes:[],noteFolders:[],settings:{theme:'system',accent:'#6457e8',weekStart:0,compact:false,showCompleted:true,appLock:null}});
  const safeString = (v,max=160) => typeof v === 'string' ? v.slice(0,max) : '';
  const validColor = v => /^#[0-9a-f]{6}$/i.test(v || '') ? v : '#6457e8';
  const validId = v => typeof v === 'string' && v.length > 0 && v.length < 120 && /^[a-zA-Z0-9_-]+$/.test(v);
  const validIsoDate = v => typeof v === 'string' && v.length===10 && !!parseLocalDate(v);
  function lockFields(item){return {salt:typeof item?.lockSalt==='string'?item.lockSalt.slice(0,128):(typeof item?.salt==='string'?item.salt.slice(0,128):''),hash:typeof item?.lockHash==='string'?item.lockHash.slice(0,128):(typeof item?.hash==='string'?item.hash.slice(0,128):'')};}
  function isLocked(item){return !!lockFields(item).hash;}
  function folderLocked(f){return !!f&&isLocked(f)&&!ui.unlockedFolders.has(f.id);}
  function folderHidden(n){const f=data.noteFolders.find(x=>x.id===n.folderId);return !!f&&folderLocked(f);}
  function noteLocked(n){return isLocked(n)&&!ui.unlockedNotes.has(n.id);}
  function noteHidden(n){return noteLocked(n)||folderHidden(n);}
  function appLocked(){return !!data.settings.appLock&&!ui.appUnlocked;}
  async function hashPassword(salt,password){if(!crypto?.subtle)throw new Error('secure');const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salt+':'+password));return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');}
  function makeSalt(){const a=new Uint8Array(16);crypto.getRandomValues(a);return [...a].map(b=>b.toString(16).padStart(2,'0')).join('');}
  async function makeLock(password){const salt=makeSalt();return {salt,hash:await hashPassword(salt,password)};}
  async function verifyLock(item,password){const l=lockFields(item);if(!l.hash)return false;return (await hashPassword(l.salt,password))===l.hash;}
  const parseData = raw => {
    if(!raw || typeof raw !== 'object' || !Array.isArray(raw.lists) || !Array.isArray(raw.tasks) || raw.lists.length>500 || raw.tasks.length>10000 || (raw.events!==undefined && (!Array.isArray(raw.events) || raw.events.length>10000)) || (raw.notes!==undefined && (!Array.isArray(raw.notes) || raw.notes.length>2500)) || (raw.noteFolders!==undefined && (!Array.isArray(raw.noteFolders) || raw.noteFolders.length>250))) throw new Error('This backup is not a valid Dayloom data file.');
    const base=defaultData();
    const listMap=new Map();
    for(const item of raw.lists){
      if(!item || !validId(item.id) || !safeString(item.name,50).trim()) continue;
      listMap.set(item.id,{id:item.id,name:safeString(item.name,50),color:validColor(item.color)});
    }
    if(!listMap.has('inbox')) listMap.set('inbox',base.lists[0]);
    const taskMap=new Map();
    for(const item of raw.tasks){
      if(!item || !validId(item.id) || !safeString(item.title,160).trim()) continue;
      const dueDate=validIsoDate(item.dueDate)?item.dueDate:'';
      const repeatDays=Array.isArray(item.repeatDays)?item.repeatDays.filter(d=>Number.isInteger(d)&&d>=0&&d<=6).slice(0,7):[];
      const rawRepeat=REPEATS.includes(item.repeat)?item.repeat:'none';
      const finalRepeat=rawRepeat==='custom'&&repeatDays.length===0?'none':rawRepeat;
      taskMap.set(item.id,{
        id:item.id,title:safeString(item.title,160),notes:safeString(item.notes,4000),dueDate,
        listId:listMap.has(item.listId)?item.listId:'inbox',priority:PRIORITIES.includes(item.priority)?item.priority:'none',
        repeat:finalRepeat,repeatDays,repeatUntil:validIsoDate(item.repeatUntil)?item.repeatUntil:'',completed:item.completed===true,
        checklist:Array.isArray(item.checklist)?item.checklist.filter(s=>s&&typeof s.text==='string'&&s.text.trim()).slice(0,50).map(s=>({id:validId(s.id)?s.id:uuid(),text:s.text.slice(0,120),done:s.done===true})):[],
        reminder:validTime(item.reminder)?item.reminder:'',
        reminderNotified:validIsoDate(item.reminderNotified)?item.reminderNotified:'',
        attachments:Array.isArray(item.attachments)?item.attachments.filter(a=>a&&validId(a.id)&&['image','video'].includes(a.type)).map(a=>({id:a.id,type:a.type,loop:a.loop===true})).slice(0,20):[],
        createdAt:typeof item.createdAt==='string'?item.createdAt:new Date().toISOString(),
        updatedAt:typeof item.updatedAt==='string'?item.updatedAt:new Date().toISOString(),
        completedAt:typeof item.completedAt==='string'?item.completedAt:''
      });
    }
    const eventMap=new Map();
    for(const item of raw.events || []){
      if(!item || !validId(item.id) || !safeString(item.title,160).trim() || !validIsoDate(item.startDate)) continue;
      const startDate=item.startDate;
      const endDate=validIsoDate(item.endDate) && item.endDate>=startDate ? item.endDate : startDate;
      const repeat=EVENT_REPEATS.includes(item.repeat) && (endDate===startDate || item.repeat==='none') ? item.repeat : 'none';
      const allDay=item.allDay!==false;
      let startTime=validTime(item.startTime)?item.startTime:'09:00';
      let endTime=validTime(item.endTime)?item.endTime:'10:00';
      if(!allDay && endDate===startDate && endTime<=startTime) endTime='23:59';
      eventMap.set(item.id,{
        id:item.id,title:safeString(item.title,160),notes:safeString(item.notes,4000),
        startDate,endDate,startTime,endTime,allDay,repeat,color:validColor(item.color),
        attachments:Array.isArray(item.attachments)?item.attachments.filter(a=>a&&validId(a.id)&&['image','video'].includes(a.type)).map(a=>({id:a.id,type:a.type,loop:a.loop===true})).slice(0,20):[],
        createdAt:typeof item.createdAt==='string'?item.createdAt:new Date().toISOString(),
        updatedAt:typeof item.updatedAt==='string'?item.updatedAt:new Date().toISOString()
      });
    }
    const folderMap=new Map();
    for(const item of raw.noteFolders || []){
      if(!item || !validId(item.id) || !safeString(item.name,60).trim()) continue;
      folderMap.set(item.id,{id:item.id,name:safeString(item.name,60),color:validColor(item.color),lockSalt:lockFields(item).salt,lockHash:lockFields(item).hash});
    }
    const noteMap=new Map();
    for(const item of raw.notes || []){
      if(!item || !validId(item.id) || !safeString(item.title,160).trim()) continue;
      noteMap.set(item.id,{
        id:item.id,title:safeString(item.title,160),body:safeString(item.body,20000),
        pinned:item.pinned===true,color:validColor(item.color),folderId:folderMap.has(item.folderId)?item.folderId:'',lockSalt:lockFields(item).salt,lockHash:lockFields(item).hash,
        attachments:Array.isArray(item.attachments)?item.attachments.filter(a=>a&&validId(a.id)&&['image','video'].includes(a.type)).map(a=>({id:a.id,type:a.type,loop:a.loop===true})).slice(0,20):[],
        createdAt:typeof item.createdAt==='string'?item.createdAt:new Date().toISOString(),
        updatedAt:typeof item.updatedAt==='string'?item.updatedAt:new Date().toISOString()
      });
    }
    const incoming=raw.settings&&typeof raw.settings==='object'?raw.settings:{};
    return {lists:[...listMap.values()],tasks:[...taskMap.values()],events:[...eventMap.values()],notes:[...noteMap.values()],noteFolders:[...folderMap.values()],settings:{
      theme:['system','light','dark'].includes(incoming.theme)?incoming.theme:base.settings.theme,
      accent:validColor(incoming.accent),weekStart:incoming.weekStart===1?1:0,
      compact:incoming.compact===true,showCompleted:incoming.showCompleted!==false,appLock:lockFields(incoming.appLock||{}).hash?{salt:lockFields(incoming.appLock).salt,hash:lockFields(incoming.appLock).hash}:null
    }};
  };
  let data=defaultData();
  let storageIssue=false;
  try {const saved=localStorage.getItem(STORE_KEY); if(saved) data=parseData(JSON.parse(saved));}
  catch(e){storageIssue=true;console.warn('Dayloom storage unavailable or corrupt:',e);}
  const ui={view:'today',selectedDate:todayKey(),month:new Date().getMonth(),year:new Date().getFullYear(),calendarMode:'month',eventSearch:'',noteSearch:'',selectedNoteColor:PALETTE[0],selectedFolderColor:PALETTE[0],noteFolder:'all',search:'',taskStatus:'open',taskPriority:'all',taskList:'all',selectedListColor:PALETTE[0],selectedEventColor:PALETTE[0],pendingImport:null,pendingMedia:null,converterFile:null,converterBatch:null,converterPreview:null,relockedOnHide:false,selection:null,editChecklist:[],editMedia:null,mediaURLs:[],undo:null,editRepeatDays:[],workoutWeek:0,timer:null,timerTick:null,audioCtx:null,workoutTab:'sessions',player:null,unlockedNotes:new Set(),unlockedFolders:new Set(),appUnlocked:false,pendingUnlock:null};
  let toastTimer;
  function notify(message,error=false){const node=el('toast');ui.undo=null;node.classList.remove('has-action');node.textContent=message;node.classList.toggle('error',error);node.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('visible'),4000);}
  function persist(){try{localStorage.setItem(STORE_KEY,JSON.stringify(data));storageIssue=false;return true;}catch(e){storageIssue=true;notify('Could not save on this device. Check browser storage settings.',true);return false;}}
  function applySettings(){
    const s=data.settings;const dark=s.theme==='dark'||(s.theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme=dark?'dark':'light';document.documentElement.classList.toggle('compact',s.compact);
    document.documentElement.style.setProperty('--accent',validColor(s.accent));
    document.documentElement.style.setProperty('--accent-soft',dark?'#30304a':'color-mix(in srgb, '+validColor(s.accent)+' 11%, white)');
    const themeTag=document.querySelector('meta[name="theme-color"]');if(themeTag)themeTag.content=dark?'#1e2031':'#f6f7fb';
  }
  function navigate(view){location.hash=view==='today'?'#today':'#'+encodeURIComponent(view);ui.view=view;ui.selection=null;ui.search='';ui.taskStatus='open';ui.taskPriority='all';ui.taskList='all';render();window.scrollTo(0,0);}
  const views=[{id:'today',text:'Today',icon:'grid'},{id:'calendar',text:'Calendar',icon:'calendar'},{id:'tasks',text:'All tasks',icon:'checklist'},{id:'workouts',text:'Workouts',icon:'dumbbell'},{id:'lists',text:'My lists',icon:'layers'},{id:'notes',text:'Notes',icon:'note'},{id:'converter',text:'Converter',icon:'swap'},{id:'settings',text:'Settings',icon:'settings'}];
  function getList(id){return data.lists.find(l=>l.id===id)||data.lists.find(l=>l.id==='inbox')||defaultData().lists[0];}
  const activeTasks=() => data.tasks.filter(t=>!t.completed);
  const byDate=(a,b)=> (a.dueDate||'9999').localeCompare(b.dueDate||'9999') || ({high:0,medium:1,low:2,none:3}[a.priority]-{high:0,medium:1,low:2,none:3}[b.priority]) || a.createdAt.localeCompare(b.createdAt);
  const sortTasks=arr=>[...arr].sort(byDate);
  function renderNav(){
    el('sideNav').innerHTML=views.map(v=>`<button class="nav-item ${ui.view===v.id?'active':''}" data-action="nav" data-view="${v.id}">${icon(v.icon)}<span>${v.text}</span>${v.id==='tasks'?`<span class="nav-count">${activeTasks().length}</span>`:''}</button>`).join('')+
      `<div class="side-divider"></div><div class="side-list-label">MY LISTS<button class="text-icon-button" data-action="new-list" aria-label="Add list">+</button></div>`+
      data.lists.map(l=>`<button class="nav-item ${ui.view==='list:'+l.id?'active':''}" data-action="nav" data-view="list:${escapeHtml(l.id)}"><i class="list-dot" style="background:${l.color}"></i><span>${escapeHtml(l.name)}</span><span class="nav-count">${data.tasks.filter(t=>t.listId===l.id&&!t.completed).length}</span></button>`).join('');
    el('mobileNav').innerHTML=views.map(v=>`<button class="${(ui.view===v.id||(v.id==='lists'&&ui.view.startsWith('list:')))?'active':''}" data-action="nav" data-view="${v.id}" aria-label="${v.text}">${icon(v.icon)}<span>${v.id==='tasks'?'Tasks':v.id==='lists'?'Lists':v.text}</span></button>`).join('');
    const titles={today:'Today',calendar:'Calendar',tasks:'All tasks',workouts:'Workouts',lists:'My lists',notes:'Notes',settings:'Settings'};
    el('topTitle').textContent=ui.view.startsWith('list:')?getList(ui.view.slice(5)).name:(titles[ui.view]||'Dayloom');
    el('headerAddEvent').hidden=ui.view!=='calendar';el('headerAdd').hidden=ui.view==='notes';el('headerAddNote').hidden=ui.view!=='notes';
    el('mobileAdd').setAttribute('aria-label',ui.view==='calendar'?'Add calendar event':ui.view==='notes'?'Add note':'Add task');
  }
  function head(title,subtitle,actions=''){return `<div class="page-head"><div><div class="eyebrow">YOUR DAY, YOUR WAY</div><h1>${title}</h1><p>${subtitle}</p></div>${actions?`<div class="page-actions">${actions}</div>`:''}</div>`;}
  function empty(title,message,action=''){return `<div class="empty-state"><div class="empty-icon">${icon('sparkle')}</div><h3>${title}</h3><p>${message}</p>${action?`<button class="btn btn-primary" data-action="${action}">${icon('plus')} Add task</button>`:''}</div>`;}
  function taskRow(t){
    const list=getList(t.listId);const overdue=t.dueDate&&!t.completed&&t.dueDate<todayKey();
    const meta=[`<span><i class="list-dot" style="height:7px;width:7px;background:${list.color};margin-right:5px"></i>${escapeHtml(list.name)}</span>`];
    if(t.dueDate)meta.push(`<span class="${overdue?'overdue':''}">${icon('calendar')} ${t.dueDate===todayKey()?'Today':dateLabel(t.dueDate)}</span>`);
    if(t.priority!=='none')meta.push(`<span class="priority-${t.priority}">${escapeHtml(t.priority)} priority</span>`);
    if(t.repeat!=='none')meta.push(`<span>↻ ${escapeHtml(t.repeat==='custom'&&t.repeatDays&&t.repeatDays.length?t.repeatDays.slice().sort((a,b)=>a-b).map(d=>['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', '):t.repeat)}${t.repeatUntil?` until ${dateLabel(t.repeatUntil)}`:''}</span>`);
    if(t.checklist&&t.checklist.length)meta.push(`<span>✓ ${t.checklist.filter(s=>s.done).length}/${t.checklist.length} steps</span>`);
    if(t.reminder)meta.push(`<span>${icon('clock')} ${t.reminder}</span>`);
    const mediaMeta=mediaCounts(t.attachments);if(mediaMeta)meta.push(`<span>${mediaMeta}</span>`);
    return `<div class="task-row ${t.completed?'completed':''} ${isSelected('task',t.id)?'is-selected':''}">${ui.selection&&ui.selection.kind==='task'?`<span class="select-box ${isSelected('task',t.id)?'checked':''}">${isSelected('task',t.id)?'✓':''}</span>`: '' }<button class="task-check ${t.completed?'checked':''}" data-action="toggle-task" data-id="${escapeHtml(t.id)}" aria-label="${t.completed?'Mark incomplete':'Complete'}: ${escapeHtml(t.title)}" aria-pressed="${t.completed}">${icon('check')}</button><div class="task-main"><button class="task-open" data-action="edit-task" data-id="${escapeHtml(t.id)}"><span class="task-name">${escapeHtml(t.title)}</span><span class="task-sub">${meta.join('')}</span></button>${webLinks([t.title,t.notes])}${subtaskBlock(t)}</div><button class="task-arrow" data-action="edit-task" data-id="${escapeHtml(t.id)}" aria-label="Edit ${escapeHtml(t.title)}">${icon('chevron-right')}</button></div>`;
  }
  function taskStack(tasks,title='Nothing here yet',message='Your tasks will show up here.',action='new-task'){
    return `<div class="task-stack">${tasks.length?sortTasks(tasks).map(taskRow).join(''):empty(title,message,action)}</div>`;
  }
  function section(title,items,emptyTitle,emptyDesc){return `<div class="section-title"><h2>${title}</h2><span>${items.length} ${items.length===1?'task':'tasks'}</span></div>${taskStack(items,emptyTitle,emptyDesc)}`;}
  const mediaCounts=atts=>{if(!atts||!atts.length)return '';const p=atts.filter(a=>a.type==='image').length,v=atts.length-p;return (p?`📷 ${p}`:'')+(p&&v?' · ':'')+(v?`🎬 ${v}`:'');};
  const subtaskBlock=t=>{if(!t.checklist||!t.checklist.length)return '';return `<div class="subtask-list">${t.checklist.map(s=>`<button type="button" class="subtask ${s.done?'done':''}" data-action="toggle-subtask" data-id="${escapeHtml(t.id)}" data-sub="${escapeHtml(s.id)}"><span class="subtask-box">${s.done?'✓':''}</span><span class="subtask-text">${escapeHtml(s.text)}</span></button>`).join('')}</div>`;};
  function mediaDB(){return new Promise((resolve,reject)=>{if(typeof indexedDB==='undefined'){reject(new Error('no indexedDB'));return;}const req=indexedDB.open('dayloom-media',1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('attachments'))req.result.createObjectStore('attachments',{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  function mediaPut(att){return mediaDB().then(db=>new Promise((res,rej)=>{const tx=db.transaction('attachments','readwrite');tx.objectStore('attachments').put(att);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);}));}
  function mediaGet(id){return mediaDB().then(db=>new Promise((res,rej)=>{const req=db.transaction('attachments').objectStore('attachments').get(id);req.onsuccess=()=>res(req.result||null);req.onerror=()=>rej(req.error);}));}
  function mediaDelete(id){return mediaDB().then(db=>new Promise((res,rej)=>{const tx=db.transaction('attachments','readwrite');tx.objectStore('attachments').delete(id);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);})).catch(()=>{});}
  function mediaGetAll(){return mediaDB().then(db=>new Promise((res,rej)=>{const req=db.transaction('attachments').objectStore('attachments').getAll();req.onsuccess=()=>res(req.result||[]);req.onerror=()=>rej(req.error);}));}
  async function blobToBase64(blob){const buf=new Uint8Array(await blob.arrayBuffer());let s='';const CH=0x8000;for(let i=0;i<buf.length;i+=CH){s+=String.fromCharCode.apply(null,buf.subarray(i,i+CH));}return btoa(s);}
  function base64ToBlob(b64,mime){const clean=String(b64).replace(/\s+/g,'');const bin=atob(clean);const bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return new Blob([bytes],{type:mime||''});}
  async function importBackupMedia(entries){const referenced=new Set();for(const coll of [data.tasks,data.events,data.notes])for(const it of coll)for(const a of (it.attachments||[]))referenced.add(a.id);let restored=0;for(const e of (entries||[])){if(!e||!referenced.has(e.id))continue;try{const existing=await mediaGet(e.id);if(existing&&existing.blob)continue;const blob=base64ToBlob(e.data,e.mime||'');await mediaPut({id:e.id,ownerKind:e.ownerKind,ownerId:e.ownerId,type:e.type,name:e.name||'',blob,createdAt:new Date().toISOString()});restored++;}catch(err){}}return restored;}
  function mediaClear(){return mediaDB().then(db=>new Promise((res,rej)=>{const tx=db.transaction('attachments','readwrite');tx.objectStore('attachments').clear();tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);})).catch(()=>{});}
  function deleteMediaFor(item){if(item&&item.attachments)item.attachments.forEach(a=>mediaDelete(a.id));}
  function showLightbox(img){const lb=el('lightboxImg');if(!lb||!img)return;lb.src=img.src;openDialog('mediaLightbox');}
  function fullscreenImage(img){if(!img)return;if(document.fullscreenElement){if(document.exitFullscreen)document.exitFullscreen();return;}const req=img.requestFullscreen?img.requestFullscreen.bind(img):(img.webkitRequestFullscreen?img.webkitRequestFullscreen.bind(img):null);if(req){try{const p=req();if(p&&p.catch)p.catch(()=>showLightbox(img));}catch(e){showLightbox(img);}}else showLightbox(img);}
  function toggleMediaLoop(id){if(!ui.editMedia)return;const it=(ui.editMedia.items||[]).find(x=>x.id===id);if(!it||it.type!=='video')return;it.loop=!it.loop;paintEditorMedia();}
  async function paintEditorMedia(){const kind=ui.editMedia?.kind;if(!kind)return;const box=el(kind+'Media');if(!box)return;(ui.mediaURLs||[]).forEach(u=>URL.revokeObjectURL(u));ui.mediaURLs=[];const items=ui.editMedia.items||[];if(!items.length){box.innerHTML='<p class="form-tip">No photos or videos yet.</p>';return;}const parts=[];const missing=[];for(const ref of items){try{const att=await mediaGet(ref.id);if(!att||!att.blob){missing.push(ref.id);continue;}const url=URL.createObjectURL(att.blob);ui.mediaURLs.push(url);parts.push(att.type==='video'?`<div class="media-item"><video src="${url}" controls preload="metadata"${ref.loop?' loop':''}></video><button type="button" class="media-loop" data-action="media-loop" data-id="${ref.id}" aria-label="Toggle loop">${ref.loop?'↻ Loop on':'↻ Loop off'}</button><button type="button" class="media-remove" data-action="media-remove" data-kind="${kind}" data-id="${ref.id}" aria-label="Remove">×</button></div>`:`<div class="media-item"><img src="${url}" alt="${escapeHtml(att.name||'photo')}" data-action="media-fullscreen"><button type="button" class="media-fullscreen-btn" data-action="media-fullscreen" aria-label="View fullscreen">⛶</button><button type="button" class="media-remove" data-action="media-remove" data-kind="${kind}" data-id="${ref.id}" aria-label="Remove">×</button></div>`);}catch(e){missing.push(ref.id);}}if(missing.length)ui.editMedia.items=ui.editMedia.items.filter(i=>!missing.includes(i.id));box.innerHTML=parts.join('')||'<p class="form-tip">No photos or videos yet.</p>';}
  function addMedia(kind,input){const files=[...input.files];input.value='';if(!ui.editMedia||ui.editMedia.kind!==kind)return;files.forEach(file=>{if(file.size>200*1024*1024){notify(`"${file.name}" is too large to store on this device.`,true);return;}const type=file.type.startsWith('video/')?'video':'image';const id=uuid();mediaPut({id,ownerKind:kind,ownerId:ui.editMedia.ownerId,type,name:file.name.slice(0,120),blob:file,createdAt:new Date().toISOString()}).then(()=>{ui.editMedia.items.push({id,type});paintEditorMedia();}).catch(()=>notify('Could not save that file on this device.',true));});}
  function recordDelete(kind,items){if(!items||!items.length)return;ui.undo={kind,items:JSON.parse(JSON.stringify(items))};showUndoToast(`Deleted ${items.length} ${kind}${items.length===1?'':'s'}.`);}
  function showUndoToast(message){const node=el('toast');if(!node)return;node.innerHTML=`<span>${escapeHtml(message)}</span> <button class="btn btn-primary" data-action="undo-delete">Undo</button>`;node.classList.remove('error');node.classList.add('has-action');node.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>{node.classList.remove('visible');node.classList.remove('has-action');ui.undo=null;},8000);}
  function undoDelete(){if(!ui.undo)return;const {kind,items}=ui.undo;const arr=kind==='task'?data.tasks:kind==='event'?data.events:data.notes;items.forEach(it=>{if(!arr.some(x=>x.id===it.id))arr.push(it);});const n=items.length;ui.undo=null;persist();render();notify(`Restored ${n} ${kind}${n===1?'':'s'}.`);}
  function computeStreak(){const doneDates=new Set(data.tasks.filter(t=>t.completed&&t.completedAt).map(t=>localDate(new Date(t.completedAt))));const today=parseLocalDate(todayKey());let cursor=new Date(today);if(!doneDates.has(localDate(cursor)))cursor.setDate(cursor.getDate()-1);let streak=0;while(doneDates.has(localDate(cursor))){streak++;cursor.setDate(cursor.getDate()-1);}const weekStart=new Date(today);weekStart.setDate(today.getDate()-((today.getDay()-data.settings.weekStart+7)%7));const weekEnd=new Date(weekStart);weekEnd.setDate(weekStart.getDate()+7);const weekCount=data.tasks.filter(t=>t.completed&&t.completedAt&&localDate(new Date(t.completedAt))>=localDate(weekStart)&&localDate(new Date(t.completedAt))<localDate(weekEnd)).length;return {streak,weekCount,totalDone:data.tasks.filter(t=>t.completed).length};}
  function checkReminders(){if(appLocked())return;if(typeof Notification==='undefined')return;const today=todayKey(),now=new Date(),hhmm=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;let changed=false;for(const t of data.tasks){if(t.completed||!t.reminder||t.dueDate!==today||t.reminderNotified===today||t.reminder>hhmm)continue;if(Notification.permission==='granted'){try{const n=new Notification('Dayloom reminder',{body:t.title});n.onclick=()=>window.focus();}catch(e){}}notify(`Reminder: ${t.title} is due now.`);t.reminderNotified=today;t.updatedAt=new Date().toISOString();changed=true;}if(changed)persist();}
  function renderToday(){
    const today=todayKey(),all=data.tasks,doneToday=all.filter(t=>t.completed&&t.completedAt&&localDate(new Date(t.completedAt))===today).length;
    const openToday=all.filter(t=>!t.completed&&t.dueDate===today),overdue=all.filter(t=>!t.completed&&t.dueDate&&t.dueDate<today);
    const upcoming=all.filter(t=>!t.completed&&t.dueDate>today).sort(byDate).slice(0,5);
    const events=eventsOnDate(today);
    const pct=(doneToday+openToday.length)?Math.round(doneToday/(doneToday+openToday.length)*100):0;
    const greeting=()=>{const hour=new Date().getHours();return hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';};
    const stats=computeStreak();
    const streakBanner=`<div class="streak-banner"><span class="streak-flame">🔥</span><div><strong>${stats.streak?stats.streak+'-day streak':'Start your streak'}</strong><small>${stats.streak?'Keep it going — complete a task every day.':'Complete a task to get the chain going.'} · ${stats.weekCount} done this week · ${stats.totalDone} total</small></div></div>`;
    return head('A fresh day, a fresh start.',new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'}))+
      `<div class="hero"><div><div class="eyebrow">HELLO THERE ✨</div><h2>${greeting()}.</h2><p>${openToday.length?'You have '+openToday.length+' task'+(openToday.length===1?'':'s')+' planned for today.':'A clear day is a beautiful thing.'}<br>Make it count, at your own pace.</p></div><div class="progress-ring" style="--progress:${pct}%"><div class="progress-core"><strong>${pct}%</strong><span>TODAY</span></div></div></div>`+
      `<div class="metric-grid"><div class="metric"><span class="metric-icon">${icon('checklist')}</span><small>To do today</small><strong>${openToday.length}</strong><span class="metric-caption">On your list</span></div><div class="metric"><span class="metric-icon">${icon('clock')}</span><small>Overdue</small><strong>${overdue.length}</strong><span class="metric-caption">Needs attention</span></div><div class="metric"><span class="metric-icon">${icon('check')}</span><small>Done today</small><strong>${doneToday}</strong><span class="metric-caption">Small wins</span></div></div>${streakBanner}`+
      `<div class="section-title"><h2>Today's events</h2><button class="btn" data-action="new-event" data-date="${today}">${icon('plus')} Add event</button></div>${eventStack(events,'No events today. Add one to your calendar.')}`+
      (overdue.length?`<div class="section-title"><h2>What you missed</h2><span>${overdue.length} ${overdue.length===1?'task':'tasks'}</span><button class="btn" data-action="missed-to-today">Move all to today</button></div>${taskStack(overdue)}`:section('What you missed',overdue,'You’re all caught up','Nothing missed yet.'))+
      section('On your plate today',openToday,'Your day is wide open','Add a task to give your day some shape.')+
      section('Coming up next',upcoming,'Nothing on the horizon','Future tasks with due dates appear here.');
  }
  const eventAtDate=(event,date)=>{
    if(date<event.startDate) return false;
    if(event.repeat==='none') return date<=event.endDate;
    const start=parseLocalDate(event.startDate),target=parseLocalDate(date);
    const delta=Math.round((target-start)/86400000);
    if(event.repeat==='daily') return true;
    if(event.repeat==='weekly') return delta%7===0;
    if(event.repeat==='monthly') return start.getDate()===target.getDate();
    return start.getMonth()===target.getMonth() && start.getDate()===target.getDate();
  };
  const eventsOnDate=date=>data.events.filter(e=>eventAtDate(e,date)).sort((a,b)=>(a.allDay?0:1)-(b.allDay?0:1)||(a.startTime||'').localeCompare(b.startTime||'')||a.title.localeCompare(b.title));
  const friendlyTime=value=>{const [hours,mins]=value.split(':').map(Number);return new Date(2026,0,1,hours,mins).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});};
  function eventWhen(e){
    if(e.allDay){return e.endDate!==e.startDate?`${dateLabel(e.startDate)} – ${dateLabel(e.endDate)} · All day`:'All day';}
    const range=`${friendlyTime(e.startTime)} – ${friendlyTime(e.endTime)}`;
    return e.endDate!==e.startDate?`${dateLabel(e.startDate)} – ${dateLabel(e.endDate)} · ${range}`:range;
  }
  function eventRow(e){
    const repeat=e.repeat!=='none'?`<span>↻ Every ${escapeHtml(e.repeat==='daily'?'day':e.repeat==='weekly'?'week':e.repeat==='monthly'?'month':'year')}</span>`:'';
    return `<div class="event-row ${isSelected('event',e.id)?'is-selected':''}">${ui.selection&&ui.selection.kind==='event'?`<span class="select-box ${isSelected('event',e.id)?'checked':''}">${isSelected('event',e.id)?'✓':''}</span>`: '' }<button class="event-row-open" data-action="edit-event" data-id="${escapeHtml(e.id)}"><span class="event-marker" style="background:${e.color}"></span><span class="event-copy"><strong>${escapeHtml(e.title)}</strong><span class="event-sub">${icon('clock')} ${escapeHtml(eventWhen(e))} ${repeat}${mediaCounts(e.attachments)?` · ${mediaCounts(e.attachments)}`:''}</span>${e.notes?`<small>${escapeHtml(e.notes)}</small>`:''}</span>${icon('chevron-right')}</button>${webLinks([e.title,e.notes])}</div>`;
  }
  function eventStack(events,emptyText='No events on this day.'){
    return `<div class="event-stack">${events.length?events.map(eventRow).join(''):`<div class="event-empty">${escapeHtml(emptyText)}</div>`}</div>`;
  }
  function paintEventColors(){el('eventColorPalette').innerHTML=PALETTE.map(c=>`<button class="swatch ${ui.selectedEventColor===c?'selected':''}" type="button" style="background:${c}" data-action="event-color" data-value="${c}" aria-label="Choose ${c}" aria-pressed="${ui.selectedEventColor===c}"></button>`).join('');}
  function toggleEventTimes(){el('eventTimeFields').hidden=el('eventAllDay').checked;}
  function openEvent(id='',date=''){
    const e=data.events.find(x=>x.id===id);
    const selected=date||ui.selectedDate||todayKey();
    el('eventDialogTitle').textContent=e?'Edit event':'New event';el('eventId').value=e?.id||uuid();
    ui.editMedia={kind:'event',ownerId:el('eventId').value,original:(e?.attachments||[]).map(a=>({...a})),items:(e?.attachments||[]).map(a=>({...a}))};paintEditorMedia();
    el('eventTitle').value=e?.title||'';el('eventStart').value=e?.startDate||selected;
    el('eventEnd').value=e?.endDate||selected;
    el('eventAllDay').checked=e?.allDay!==false;
    el('eventStartTime').value=e?.startTime||'09:00';el('eventEndTime').value=e?.endTime||'10:00';
    el('eventRepeat').value=e?.repeat||'none';el('eventNotes').value=e?.notes||'';
    ui.selectedEventColor=e?.color||data.settings.accent;paintEventColors();toggleEventTimes();
    el('eventDelete').hidden=!e;refreshWebLinks('eventNotes','eventTitle','eventLinkPreview','eventVideoPreview');openDialog('eventDialog');setTimeout(()=>el('eventTitle').focus(),25);
  }
  function saveEvent(evt){
    evt.preventDefault();const title=el('eventTitle').value.trim();if(!title){el('eventTitle').reportValidity();el('eventTitle').focus();return;}
    const startDate=el('eventStart').value,endDate=el('eventEnd').value;
    if(!validIsoDate(startDate)||!validIsoDate(endDate)||endDate<startDate){notify('Choose valid event dates, with the end on or after the start.',true);return;}
    const repeat=el('eventRepeat').value;
    if(repeat!=='none'&&endDate!==startDate){notify('Repeating events must start and end on the same date.',true);return;}
    const allDay=el('eventAllDay').checked,startTime=el('eventStartTime').value,endTime=el('eventEndTime').value;
    if(!allDay&&(!validTime(startTime)||!validTime(endTime)||(startDate===endDate&&endTime<=startTime))){notify('Enter a valid time range; the end must follow the start.',true);return;}
    const old=data.events.find(e=>e.id===el('eventId').value),now=new Date().toISOString();
    const entry={id:el('eventId').value||old?.id||uuid(),title:title.slice(0,160),notes:el('eventNotes').value.slice(0,4000),startDate,endDate,allDay,startTime:validTime(startTime)?startTime:'09:00',endTime:validTime(endTime)?endTime:'10:00',repeat,color:ui.selectedEventColor,attachments:ui.editMedia&&ui.editMedia.ownerId===el('eventId').value?ui.editMedia.items:(old?.attachments||[]),createdAt:old?.createdAt||now,updatedAt:now};
    if(ui.editMedia&&ui.editMedia.ownerId===el('eventId').value){const keep=new Set(ui.editMedia.items.map(i=>i.id));ui.editMedia.original.forEach(o=>{if(!keep.has(o.id))mediaDelete(o.id);});}
    if(old)data.events[data.events.indexOf(old)]=entry;else data.events.push(entry);
    const targetDate=old&&ui.view==='calendar'&&eventAtDate(entry,ui.selectedDate)?ui.selectedDate:startDate;
    ui.selectedDate=targetDate;const selected=parseLocalDate(targetDate);ui.month=selected.getMonth();ui.year=selected.getFullYear();
    persist();closeDialog('eventDialog');render();notify(old?'Event updated':'Event added to calendar');
  }
  function deleteEvent(){const id=el('eventId').value;if(!id)return;
    if(!confirm('Delete this event? If it repeats, the entire series will be removed.'))return;
    const item=data.events.find(e=>e.id===id);recordDelete('event',item?[item]:[]);deleteMediaFor(item);
    data.events=data.events.filter(e=>e.id!==id);persist();closeDialog('eventDialog');render();
  }
  function calendarCells(){
    const first=new Date(ui.year,ui.month,1);const offset=(first.getDay()-data.settings.weekStart+7)%7;
    const gridStart=new Date(ui.year,ui.month,1-offset);const now=todayKey();
    const weekdays=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];const shifted=[...weekdays.slice(data.settings.weekStart),...weekdays.slice(0,data.settings.weekStart)];
    let html=shifted.map(d=>`<div class="weekday">${d}</div>`).join('');
    for(let i=0;i<42;i++){
      const day=new Date(gridStart.getFullYear(),gridStart.getMonth(),gridStart.getDate()+i);const key=localDate(day);
      const tasks=sortTasks(data.tasks.filter(t=>t.dueDate===key&&(data.settings.showCompleted||!t.completed)));
      const events=eventsOnDate(key);
      const matches=[...events.map(e=>({title:e.title,color:e.color,isEvent:true})),...tasks.map(t=>({title:t.title,completed:t.completed}))];
      html+=`<button class="calendar-day ${day.getMonth()!==ui.month?'muted':''} ${key===now?'today':''} ${key===ui.selectedDate?'selected':''}" data-action="select-day" data-date="${key}" aria-label="${dateLabel(key,{weekday:'long',month:'long',day:'numeric'})}, ${events.length} events, ${tasks.length} tasks" aria-pressed="${key===ui.selectedDate}"><span class="date-num">${day.getDate()}</span><span class="calendar-events">${matches.slice(0,2).map(item=>`<span class="calendar-event ${item.isEvent?'appointment':''} ${item.completed?'done':''}" ${item.isEvent?`style="--event-color:${item.color}"`:''} title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>`).join('')}${matches.length>2?`<span class="calendar-more">+${matches.length-2} more</span>`:''}</span></button>`;
    }
    return html;
  }
  function weekStartDate(date){
    const d=parseLocalDate(date)||parseLocalDate(todayKey());
    d.setDate(d.getDate()-(d.getDay()-data.settings.weekStart+7)%7);
    return d;
  }
  function datePlus(date,days){const d=parseLocalDate(date);d.setDate(d.getDate()+days);return localDate(d);}
  function calendarRangeTitle(){
    if(ui.calendarMode==='month')return new Date(ui.year,ui.month,1).toLocaleDateString(undefined,{month:'long',year:'numeric'});
    if(ui.calendarMode==='day')return dateLabel(ui.selectedDate,{weekday:'long',month:'long',day:'numeric',year:'numeric'});
    const start=localDate(weekStartDate(ui.selectedDate)),end=datePlus(start,6);
    return `${dateLabel(start)} – ${dateLabel(end,{month:'short',day:'numeric',year:'numeric'})}`;
  }
  function weekCalendar(){
    const start=localDate(weekStartDate(ui.selectedDate));
    return `<div class="week-grid">${Array.from({length:7},(_,i)=>{
      const date=datePlus(start,i),items=eventsOnDate(date),tasks=sortTasks(data.tasks.filter(t=>t.dueDate===date&&(data.settings.showCompleted||!t.completed)));
      return `<section class="week-day ${date===todayKey()?'is-today':''} ${date===ui.selectedDate?'is-selected':''}">
        <button class="week-day-head" data-action="select-day" data-date="${date}"><span>${dateLabel(date,{weekday:'short'})}</span><strong>${parseLocalDate(date).getDate()}</strong></button>
        <div class="week-day-items">${items.map(e=>`<button class="week-chip" data-action="edit-event" data-id="${escapeHtml(e.id)}" style="--event-color:${e.color}" title="${escapeHtml(e.title)}"><strong>${escapeHtml(e.title)}</strong><small>${escapeHtml(e.allDay?'All day':friendlyTime(e.startTime))}</small></button>`).join('')}
        ${tasks.map(t=>`<button class="week-chip task" data-action="edit-task" data-id="${escapeHtml(t.id)}" title="${escapeHtml(t.title)}">${t.completed?'✓ ':''}${escapeHtml(t.title)}</button>`).join('')}
        ${!items.length&&!tasks.length?'<span class="week-quiet">Free day</span>':''}</div>
        <button class="week-add" data-action="new-event" data-date="${date}" aria-label="Add event on ${date}">+ Event</button>
      </section>`;
    }).join('')}</div>`;
  }
  function dayCalendar(){
    const date=ui.selectedDate,events=eventsOnDate(date);
    const tasks=sortTasks(data.tasks.filter(t=>t.dueDate===date&&(data.settings.showCompleted||!t.completed)));
    const allDay=events.filter(e=>e.allDay||(e.startDate!==e.endDate&&e.startDate!==date));
    const timed=events.filter(e=>!allDay.includes(e));
    const byHour=Array.from({length:24},(_,i)=>({hour:i,events:timed.filter(e=>Number(e.startTime.slice(0,2))===i)})).filter(x=>x.events.length||(x.hour>=7&&x.hour<=20));
    return `<div class="day-planner"><div class="day-all-day"><div class="day-side-label">All-day &amp; tasks</div><div class="day-all-items">${allDay.map(eventRow).join('')}${tasks.map(taskRow).join('')}${!allDay.length&&!tasks.length?'<p class="day-quiet">Nothing scheduled without a time.</p>':''}</div></div>
      <div class="day-timeline">${byHour.map(({hour,events})=>`<div class="day-hour"><span class="day-hour-time">${friendlyTime(String(hour).padStart(2,'0')+':00')}</span><div class="day-hour-items">${events.map(eventRow).join('')}</div></div>`).join('')}</div></div>`;
  }
  function updateEventSearchResults(){
    const node=el('eventSearchResults');if(!node)return;
    const q=ui.eventSearch.trim().toLowerCase();node.hidden=!q;
    if(!q)return;
    const arr=data.events.filter(e=>e.title.toLowerCase().includes(q)||e.notes.toLowerCase().includes(q)||e.startDate.includes(q)).sort((a,b)=>a.startDate.localeCompare(b.startDate)).slice(0,100);
    node.innerHTML=`<div class="section-title"><h2>Matching events</h2><span>${arr.length}${arr.length===100?'+':''} found</span></div>`+
      (arr.length?`<div class="event-stack">${arr.map(e=>`<div class="found-event"><span class="found-event-date">${dateLabel(e.startDate)}</span>${eventRow(e)}</div>`).join('')}</div>`:empty('No events found','Try another name or date.',''));
  }
  function renderCalendar(){
    const sel=ui.selectedDate,tasks=data.tasks.filter(t=>t.dueDate===sel&&(data.settings.showCompleted||!t.completed));
    const events=eventsOnDate(sel);
    return head('See the bigger picture.','Events and tasks, together in one calendar.',`<button class="btn" data-action="calendar-today">Today</button>`)+
      `<div class="calendar-tools"><div class="mode-switch" role="group" aria-label="Calendar view">${['month','week','day'].map(mode=>`<button class="option-pill ${ui.calendarMode===mode?'active':''}" data-action="calendar-mode" data-mode="${mode}" aria-pressed="${ui.calendarMode===mode}">${mode[0].toUpperCase()+mode.slice(1)}</button>`).join('')}</div><div class="calendar-file-actions"><button class="btn" data-action="ics-export">${icon('download')} Export .ics</button><button class="btn" data-action="ics-import">${icon('upload')} Import .ics</button></div></div>`+
      `<div class="toolbar calendar-search"><div class="search-wrap">${icon('search')}<input id="eventSearch" type="search" placeholder="Find an event by name or date..." value="${escapeHtml(ui.eventSearch)}" aria-label="Search calendar events"></div></div><div id="eventSearchResults" hidden></div>`+
      `<div class="calendar-shell"><div class="calendar-top"><h2>${calendarRangeTitle()}</h2><div class="month-actions"><button class="icon-button" data-action="calendar-prev" aria-label="Previous ${ui.calendarMode}">${icon('chevron-left')}</button><button class="icon-button" data-action="calendar-next" aria-label="Next ${ui.calendarMode}">${icon('chevron-right')}</button></div></div>${ui.calendarMode==='month'?`<div class="calendar-grid">${calendarCells()}</div>`:ui.calendarMode==='week'?weekCalendar():dayCalendar()}</div>`+
      `<div class="calendar-selection"><div class="calendar-agenda-header"><h2>${dateLabel(sel,{weekday:'long',month:'long',day:'numeric'})}</h2><div class="agenda-actions"><button class="btn btn-primary" data-action="new-event" data-date="${sel}">${icon('plus')} Event</button><button class="btn" data-action="new-task" data-date="${sel}">${icon('plus')} Task</button></div></div>${ui.calendarMode==='day'?'':`<div class="section-title"><h2>Events</h2><span>${events.length}</span></div>${eventStack(events)}<div class="section-title"><h2>Tasks</h2><span>${tasks.length}</span></div>${taskStack(tasks,'No tasks on this day','Add a task to plan this date.','')}`}</div>`;
  }
  function renderTasks(){
    const selectors=`<select id="statusFilter" aria-label="Task status"><option value="open">Open tasks</option><option value="missed">Missed</option><option value="all">All statuses</option><option value="completed">Completed</option></select><select id="listFilter" aria-label="Filter by list"><option value="all">Every list</option>${data.lists.map(l=>`<option value="${escapeHtml(l.id)}">${escapeHtml(l.name)}</option>`).join('')}</select><select id="priorityFilter" aria-label="Filter by priority"><option value="all">Any priority</option><option value="high">High priority</option><option value="medium">Medium priority</option><option value="low">Low priority</option><option value="none">No priority</option></select>`;
    return head('Everything in one place.','Search, filter, and check things off.')+
      `<div class="toolbar"><div class="search-wrap">${icon('search')}<input id="taskSearch" type="search" placeholder="Search your tasks..." value="${escapeHtml(ui.search)}" aria-label="Search tasks"></div>${selectors}</div><div id="taskResults"></div>`;
  }
  function filteredTasks(){const q=ui.search.trim().toLowerCase();return data.tasks.filter(t=>(ui.taskStatus==='all'||(ui.taskStatus==='open'&&!t.completed)||(ui.taskStatus==='completed'&&t.completed)||(ui.taskStatus==='missed'&&!t.completed&&t.dueDate&&t.dueDate<todayKey()))&&(ui.taskList==='all'||t.listId===ui.taskList)&&(ui.taskPriority==='all'||t.priority===ui.taskPriority)&&(!q||t.title.toLowerCase().includes(q)||t.notes.toLowerCase().includes(q)||getList(t.listId).name.toLowerCase().includes(q)));}
  function updateTaskResults(){const output=el('taskResults');if(!output)return;const arr=filteredTasks();output.innerHTML=`<div class="result-count">${arr.length} ${arr.length===1?'task':'tasks'} found</div>${taskStack(arr,'No matching tasks','Try changing your search or filters.','')}`;}
  function renderLists(){return head('A place for everything.','Organize life into lists that fit you.',`<button class="btn btn-primary" data-action="new-list">${icon('plus')} New list</button>`)+
    `<div class="list-card-grid">${data.lists.map(l=>{const open=data.tasks.filter(t=>t.listId===l.id&&!t.completed).length,done=data.tasks.filter(t=>t.listId===l.id&&t.completed).length;return `<button class="list-card" data-action="nav" data-view="list:${escapeHtml(l.id)}"><span class="list-dot" style="background:${l.color}"></span><h3>${escapeHtml(l.name)}</h3><p>${open} open · ${done} completed</p></button>`;}).join('')}<button class="list-card list-card-add" data-action="new-list">${icon('plus')}<strong>Create a list</strong></button></div>`;}
  function renderList(id){const list=getList(id);const items=data.tasks.filter(t=>t.listId===id&&(data.settings.showCompleted||!t.completed));
    return head(escapeHtml(list.name),`${items.filter(t=>!t.completed).length} remaining · ${items.filter(t=>t.completed).length} completed`,`${id!=='inbox'?`<button class="btn" data-action="edit-list" data-id="${escapeHtml(id)}">${icon('edit')} Edit list</button>`:''}<button class="btn btn-primary" data-action="new-task" data-list="${escapeHtml(id)}">${icon('plus')} New task</button>`)+taskStack(items,'This list is ready','Add your first task here.','new-task');
  }
  function noteFolderName(folderId){return data.noteFolders.find(f=>f.id===folderId)?.name||'Unfiled';}
  function noteCard(n){
    if(noteLocked(n))return `<article class="note-card is-locked"><button class="note-card-open" data-action="unlock-note" data-id="${escapeHtml(n.id)}" aria-label="Unlock note"><span class="note-lock-icon">🔒</span><strong>Locked note</strong><span class="note-preview">Unlock to view this note.</span></button></article>`;
    const summary=n.body.trim().replace(/\s+/g,' ').slice(0,240);
    const folder=data.noteFolders.find(f=>f.id===n.folderId);
    return `<article class="note-card ${isSelected('note',n.id)?'is-selected':''}" style="--note-color:${n.color}"><button class="note-card-open" data-action="edit-note" data-id="${escapeHtml(n.id)}" aria-label="Edit note: ${escapeHtml(n.title)}"><span class="note-card-top">${ui.selection&&ui.selection.kind==='note'?`<span class="select-box ${isSelected('note',n.id)?'checked':''}">${isSelected('note',n.id)?'✓':''}</span>`: '' }<span class="note-pin">${n.pinned?'★ Pinned':'Note'}</span><span>${dateLabel(localDate(new Date(n.updatedAt)))}</span></span><strong>${escapeHtml(n.title)}</strong><span class="note-preview">${escapeHtml(summary||'No text yet')}</span><span class="note-folder-pill"><i style="background:${folder?.color||'var(--muted)'}"></i>${escapeHtml(folder?.name||'Unfiled')}</span>${mediaCounts(n.attachments)?`<span class="note-media">${mediaCounts(n.attachments)}</span>`:''}</button>${webLinks([n.title,n.body])}</article>`;
  }
  function noteFolderControls(){
    const count=id=>data.notes.filter(n=>!folderHidden(n)&&(id==='all'||(id==='unfiled'?!n.folderId:n.folderId===id))).length;
    const item=(id,name,color)=>{const f=id!=='all'&&id!=='unfiled'?data.noteFolders.find(x=>x.id===id):null;if(f&&folderLocked(f))return `<div class="note-folder-item"><button class="note-folder-select ${ui.noteFolder===id?'active':''}" data-action="note-filter" data-folder="${escapeHtml(id)}" aria-pressed="${ui.noteFolder===id}"><i>🔒</i><span>Locked folder</span></button><button class="note-folder-edit" data-action="unlock-folder" data-id="${escapeHtml(id)}" aria-label="Unlock folder">🔒</button></div>`;return `<div class="note-folder-item"><button class="note-folder-select ${ui.noteFolder===id?'active':''}" data-action="note-filter" data-folder="${escapeHtml(id)}" aria-pressed="${ui.noteFolder===id}"><i style="background:${color}"></i><span>${escapeHtml(name)}</span><small>${count(id)}</small></button>${id!=='all'&&id!=='unfiled'?`<button class="note-folder-edit" data-action="edit-folder" data-id="${escapeHtml(id)}" aria-label="Edit ${escapeHtml(name)} folder">${icon('edit')}</button>`:''}</div>`;};
    return `<aside class="note-folders"><div class="note-folder-top"><strong>Folders</strong><button class="btn btn-subtle" data-action="new-folder" aria-label="Create a notes folder">${icon('plus')} New</button></div><div class="note-folder-list">${item('all','All notes','var(--accent)')}${item('unfiled','Unfiled','var(--muted)')}${data.noteFolders.map(f=>item(f.id,f.name,f.color)).join('')}</div></aside>`;
  }
  function renderNotes(){
    return head('Capture the little things.','Your notes, organized your way.',`<div class="note-head-actions">${(ui.unlockedNotes.size||ui.unlockedFolders.size)?`<button class="btn" data-action="lock-all">🔒 Lock all</button>`:''}<button class="btn" data-action="new-folder">${icon('plus')} Folder</button><button class="btn btn-primary" data-action="new-note">${icon('plus')} New note</button></div>`)+
      `<div class="toolbar"><div class="search-wrap">${icon('search')}<input type="search" id="noteSearch" placeholder="Search all notes and folders..." value="${escapeHtml(ui.noteSearch)}" aria-label="Search all notes and folders"></div></div><div class="notes-workspace">${noteFolderControls()}<section class="notes-content"><div class="notes-content-head"><h2 id="currentNoteFolder">Notes</h2><span id="noteSearchDescription"></span></div><div id="noteResults"></div></section></div>`;
  }
  function updateNoteResults(){
    const output=el('noteResults');if(!output)return;
    const q=ui.noteSearch.trim().toLowerCase();
    // Search always crosses folders; selecting a folder applies when the search is empty.
    const lockedFolder=!q&&ui.noteFolder!=='all'&&ui.noteFolder!=='unfiled'?data.noteFolders.find(f=>f.id===ui.noteFolder):null;
    if(lockedFolder&&folderLocked(lockedFolder)){el('currentNoteFolder').textContent='Locked folder';el('noteSearchDescription').textContent='Unlock to see these notes.';output.innerHTML=`<div class="locked-panel"><span class="note-lock-icon">🔒</span><h3>This folder is locked</h3><p>Unlock it to see its notes.</p><div class="setting-action"><button class="btn btn-primary" data-action="unlock-folder" data-id="${escapeHtml(lockedFolder.id)}">Unlock folder</button></div></div>`;return;}
    const arr=data.notes.filter(n=>{if(folderHidden(n))return false;if(q){if(noteLocked(n))return false;return n.title.toLowerCase().includes(q)||n.body.toLowerCase().includes(q)||noteFolderName(n.folderId).toLowerCase().includes(q);}return (ui.noteFolder==='all'||(ui.noteFolder==='unfiled'?!n.folderId:n.folderId===ui.noteFolder));})
      .sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.updatedAt.localeCompare(a.updatedAt));
    const heading=q?'Search results':ui.noteFolder==='all'?'All notes':ui.noteFolder==='unfiled'?'Unfiled':noteFolderName(ui.noteFolder);
    el('currentNoteFolder').textContent=heading;
    el('noteSearchDescription').textContent=q?'Searching every folder':`${arr.length} ${arr.length===1?'note':'notes'}`;
    output.innerHTML=arr.length?`<div class="notes-grid">${arr.map(noteCard).join('')}</div>`:empty(q?'No matching notes':'No notes here yet',q?'Try another search.':'Create a note to get started.','new-note');
  }
  function paintNoteColors(){el('noteColorPalette').innerHTML=PALETTE.map(c=>`<button class="swatch ${ui.selectedNoteColor===c?'selected':''}" type="button" style="background:${c}" data-action="note-color" data-value="${c}" aria-label="Choose ${c}" aria-pressed="${ui.selectedNoteColor===c}"></button>`).join('');}
  function openNote(id=''){
    const note=data.notes.find(n=>n.id===id);
    if(note&&noteHidden(note)){if(noteLocked(note))openUnlock('note',note.id);else openUnlock('folder',note.folderId);return;}
    el('noteDialogTitle').textContent=note?'Edit note':'New note';el('noteId').value=note?.id||uuid();
    ui.editMedia={kind:'note',ownerId:el('noteId').value,original:(note?.attachments||[]).map(a=>({...a})),items:(note?.attachments||[]).map(a=>({...a}))};paintEditorMedia();
    el('noteTitle').value=note?.title||'';el('noteBody').value=note?.body||'';el('notePinned').checked=note?.pinned||false;
    el('noteFolder').innerHTML='<option value="">Unfiled</option>'+data.noteFolders.filter(f=>!folderLocked(f)).map(f=>`<option value="${escapeHtml(f.id)}">${escapeHtml(f.name)}</option>`).join('');
    el('noteFolder').value=note?.folderId||(ui.noteFolder!=='all'&&ui.noteFolder!=='unfiled'?ui.noteFolder:'');
    ui.selectedNoteColor=note?.color||data.settings.accent;paintNoteColors();el('noteDelete').hidden=!note;el('noteLockPw').value='';el('noteLockPw2').value='';el('noteLockRemove').checked=false;el('noteLockRemoveWrap').hidden=!note?.lockHash;
    refreshWebLinks('noteBody','noteTitle','noteLinkPreview','noteVideoPreview');openDialog('noteDialog');setTimeout(()=>el('noteTitle').focus(),25);
  }
  async function saveNote(e){
    e.preventDefault();const title=el('noteTitle').value.trim();if(!title){el('noteTitle').reportValidity();return;}
    const old=data.notes.find(n=>n.id===el('noteId').value),now=new Date().toISOString();
    const pw=el('noteLockPw').value,pw2=el('noteLockPw2').value;
    let lockSalt=old?.lockSalt||'',lockHash=old?.lockHash||'';
    if(el('noteLockRemove').checked){lockSalt='';lockHash='';}
    else if(pw||pw2){
      if(pw!==pw2){notify('Lock passwords do not match.',true);return;}
      try{const lk=await makeLock(pw);lockSalt=lk.salt;lockHash=lk.hash;}catch(err){notify('Password locking needs a secure (HTTPS) page.',true);return;}
    }
    let folderId=data.noteFolders.some(f=>f.id===el('noteFolder').value)?el('noteFolder').value:'';
    if(folderId){const lf=data.noteFolders.find(f=>f.id===folderId);if(lf&&folderLocked(lf))folderId=old?.folderId||'';}
    const note={id:el('noteId').value||old?.id||uuid(),title:title.slice(0,160),body:el('noteBody').value.slice(0,20000),pinned:el('notePinned').checked,color:ui.selectedNoteColor,folderId,lockSalt,lockHash,attachments:ui.editMedia&&ui.editMedia.ownerId===el('noteId').value?ui.editMedia.items:(old?.attachments||[]),createdAt:old?.createdAt||now,updatedAt:now};
    if(ui.editMedia&&ui.editMedia.ownerId===el('noteId').value){const keep=new Set(ui.editMedia.items.map(i=>i.id));ui.editMedia.original.forEach(o=>{if(!keep.has(o.id))mediaDelete(o.id);});}
    if(old)data.notes[data.notes.indexOf(old)]=note;else data.notes.push(note);
    if(!persist())return;
    closeDialog('noteDialog');render();notify(old?'Note saved':'Note created');
  }
  function deleteNote(){const id=el('noteId').value;if(!id||!confirm('Delete this note? This cannot be undone.'))return;
    const item=data.notes.find(n=>n.id===id);recordDelete('note',item?[item]:[]);deleteMediaFor(item);
    data.notes=data.notes.filter(n=>n.id!==id);persist();closeDialog('noteDialog');render();
  }
  function paintFolderColors(){el('folderColorPalette').innerHTML=PALETTE.map(c=>`<button class="swatch ${ui.selectedFolderColor===c?'selected':''}" type="button" style="background:${c}" data-action="folder-color" data-value="${c}" aria-label="Choose ${c}" aria-pressed="${ui.selectedFolderColor===c}"></button>`).join('');}
  function openFolder(id=''){
    const folder=data.noteFolders.find(f=>f.id===id);
    if(folder&&folderLocked(folder)){openUnlock('folder',folder.id);return;}
    el('folderDialogTitle').textContent=folder?'Edit folder':'New folder';el('folderId').value=folder?.id||'';
    el('folderName').value=folder?.name||'';ui.selectedFolderColor=folder?.color||data.settings.accent;
    el('folderDelete').hidden=!folder;paintFolderColors();el('folderLockPw').value='';el('folderLockPw2').value='';el('folderLockRemove').checked=false;el('folderLockRemoveWrap').hidden=!folder?.lockHash;openDialog('folderDialog');
    setTimeout(()=>el('folderName').focus(),20);
  }
  async function saveFolder(e){
    e.preventDefault();const name=el('folderName').value.trim().slice(0,60);if(!name){el('folderName').reportValidity();return;}
    const old=data.noteFolders.find(f=>f.id===el('folderId').value);
    if(data.noteFolders.length>=250&&!old){notify('Folder limit reached.',true);return;}
    const pw=el('folderLockPw').value,pw2=el('folderLockPw2').value;
    let lockSalt=old?.lockSalt||'',lockHash=old?.lockHash||'';
    if(el('folderLockRemove').checked){lockSalt='';lockHash='';}
    else if(pw||pw2){
      if(pw!==pw2){notify('Lock passwords do not match.',true);return;}
      try{const lk=await makeLock(pw);lockSalt=lk.salt;lockHash=lk.hash;}catch(err){notify('Password locking needs a secure (HTTPS) page.',true);return;}
    }
    const folder={id:old?.id||uuid(),name,color:ui.selectedFolderColor,lockSalt,lockHash};
    if(old)data.noteFolders[data.noteFolders.indexOf(old)]=folder;else data.noteFolders.push(folder);
    if(!persist())return;closeDialog('folderDialog');ui.noteFolder=folder.id;render();notify(old?'Folder updated':'Folder created');
  }
  function deleteFolder(){
    const id=el('folderId').value,folder=data.noteFolders.find(f=>f.id===id);if(!folder)return;
    if(folderLocked(folder)){notify('Unlock this folder first.',true);return;}
    const count=data.notes.filter(n=>n.folderId===id).length;
    if(!confirm(`Delete "${folder.name}"? ${count?`${count} note${count===1?'':'s'} will move to Unfiled.`:'Your notes will not be deleted.'}`))return;
    data.noteFolders=data.noteFolders.filter(f=>f.id!==id);
    data.notes.forEach(n=>{if(n.folderId===id)n.folderId='';});
    if(ui.noteFolder===id)ui.noteFolder='unfiled';
    if(!persist())return;closeDialog('folderDialog');render();notify('Folder deleted. Notes kept in Unfiled.');
  }
  function settingsTheme(){return `<div class="theme-choices">${['system','light','dark'].map(x=>`<button class="option-pill ${data.settings.theme===x?'active':''}" data-action="setting" data-setting="theme" data-value="${x}">${x[0].toUpperCase()+x.slice(1)}</button>`).join('')}</div>`;}
  const fmtSize=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';
  function downloadBlob(blob,filename){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);}
  async function downloadAll(list){for(let i=0;i<list.length;i++){if(i)await new Promise(r=>setTimeout(r,400));downloadBlob(list[i].blob,list[i].filename);}}
  function buildCombinedText(files){return files.map(f=>`=== ${f.name} ===\n${f.b64}`).join('\n');}
  function converterDownloadCombined(){const b=ui.converterBatch;if(!b)return;downloadBlob(new Blob([buildCombinedText(b.files)],{type:'text/plain'}),'converted-files.b64.txt');notify('Combined .txt downloaded.');}
  function wrapPickedTxt(texts){const parts=[];for(const t of texts){const sections=parseCombinedText(t.text);if(sections.length)parts.push(t.text.trim());else{const base=t.name.replace(/\.b64\.txt$/i,'').replace(/\.txt$/i,'')||'converted-file';parts.push(`=== ${base} ===\n${t.text.trim()}`);}}return parts.join('\n');}
  function parseCombinedText(raw){const sections=[];let cur=null;for(const line of raw.split('\n')){const hm=line.match(/^=== (.+?) ===$/);if(hm){if(cur&&cur.b64.replace(/\s+/g,''))sections.push({name:cur.name,b64:cur.b64.replace(/\s+/g,'')});cur={name:hm[1].trim(),b64:''};}else if(cur){cur.b64+=line;}}if(cur&&cur.b64.replace(/\s+/g,''))sections.push({name:cur.name,b64:cur.b64.replace(/\s+/g,'')});return sections;}
  function extMime(name){const ext=name.split('.').pop().toLowerCase();return ext==='png'?'image/png':ext==='jpg'||ext==='jpeg'?'image/jpeg':ext==='gif'?'image/gif':ext==='webp'?'image/webp':ext==='mp4'?'video/mp4':ext==='mov'?'video/quicktime':ext==='webm'?'video/webm':ext==='mp3'?'audio/mpeg':ext==='wav'?'audio/wav':ext==='ogg'?'audio/ogg':ext==='m4a'?'audio/mp4':'';}
  async function converterFileSelected(){const input=el('converterFileInput');const files=[...(input?.files||[])];if(input)input.value='';if(!files.length)return;if(files.some(f=>f.size>100*1024*1024)){notify('Files over 100 MB are too big to convert in the browser.',true);return;}const total=files.reduce((s,f)=>s+f.size,0);if(files.length>1&&total>100*1024*1024){notify('Those files total over 100 MB — convert fewer or smaller files at once.',true);return;}try{const done=[];for(const file of files){done.push({name:file.name,mime:file.type||'',size:file.size,b64:await blobToBase64(file)});}if(done.length===1){ui.converterFile=done[0];ui.converterBatch=null;render();notify('Converted to text.');}else{ui.converterBatch={files:done};ui.converterFile=null;render();notify(`Converted ${done.length} files — choose a download format below.`);}}catch(e){notify('Could not convert those files.',true);}}
  function converterDownloadTxt(){const f=ui.converterFile;if(!f)return;downloadBlob(new Blob([f.b64],{type:'text/plain'}),f.name+'.b64.txt');}
  async function converterDownloadBatch(){const b=ui.converterBatch;if(!b)return;await downloadAll((b.files||[]).map(d=>({blob:new Blob([d.b64],{type:'text/plain'}),filename:d.name+'.b64.txt'})));notify(`${(b.files||[]).length} .txt files downloaded.`);}
  async function converterCopy(){const f=ui.converterFile;if(!f)return;try{await navigator.clipboard.writeText(f.b64);notify('Text copied.');}catch(e){notify('Too large to copy — download the .txt instead.',true);}}
  async function converterTxtSelected(){const input=el('converterTxtInput');const files=[...(input?.files||[])];if(input)input.value='';if(!files.length)return;clearConverterPreview();paintConverterPreview();try{const texts=[];for(const file of files)texts.push({name:file.name,text:await file.text()});if(texts.length===1){const text=texts[0].text;el('converterTextInput').value=text;const base=texts[0].name.replace(/\.b64\.txt$/i,'').replace(/\.txt$/i,'');const nameInput=el('converterFileName');if(base&&nameInput&&!nameInput.value)nameInput.value=base;}else{el('converterTextInput').value=wrapPickedTxt(texts);notify(`${texts.length} .txt files loaded — convert to restore them all.`);}}catch(e){notify('Could not read those files.',true);}}
  function sniffExt(blob){return blob.slice(0,12).arrayBuffer().then(buf=>{const b=new Uint8Array(buf);if(b.length>=8&&b[0]===0x89&&b[1]===0x50&&b[2]===0x4E&&b[3]===0x47)return 'png';if(b.length>=3&&b[0]===0xFF&&b[1]===0xD8&&b[2]===0xFF)return 'jpg';if(b.length>=6&&b[0]===0x47&&b[1]===0x49&&b[2]===0x46&&b[3]===0x38)return 'gif';if(b.length>=12&&b[0]===0x52&&b[1]===0x49&&b[2]===0x46&&b[3]===0x46&&b[8]===0x57&&b[9]===0x45&&b[10]===0x42&&b[11]===0x50)return 'webp';if(b.length>=8&&b[4]===0x66&&b[5]===0x74&&b[6]===0x79&&b[7]===0x70)return 'mp4';return '';});}
  async function converterToFile(){let raw=(el('converterTextInput').value||'').trim();if(!raw){notify('Paste some base64 text or pick a .txt file first.',true);return;}const sections=parseCombinedText(raw);if(sections.length){let ok=0,failed=0;const list=[];for(const s of sections){try{list.push({blob:base64ToBlob(s.b64,extMime(s.name)),filename:s.name});ok++;}catch(e){failed++;}}await downloadAll(list);if(ok)notify(failed?`Downloaded ${ok} files (${failed} skipped — invalid text).`:`Downloaded ${ok} files.`);else notify('That text is not valid base64.',true);return;}let mime='';const dm=raw.match(/^data:([^;,]+)?;base64,([\s\S]*)$/);if(dm){mime=dm[1]||'';raw=dm[2];}raw=raw.replace(/\s+/g,'');let filename=(el('converterFileName').value||'').trim();if(!filename)filename='converted-file';if(!/\.[a-z0-9]{2,5}$/i.test(filename)){const ext=mime==='image/png'?'png':mime==='image/jpeg'?'jpg':mime==='image/gif'?'gif':mime==='image/webp'?'webp':mime==='video/mp4'?'mp4':mime==='video/quicktime'?'mov':mime==='video/webm'?'webm':'';if(ext)filename+='.'+ext;}try{const blob=base64ToBlob(raw,mime);if(!/\.[a-z0-9]{2,5}$/i.test(filename)){const sniff=await sniffExt(blob);if(sniff)filename+='.'+sniff;}downloadBlob(blob,filename);notify(`Downloaded ${filename}.`);}catch(e){notify('That text is not valid base64.',true);}}
  function previewKind(mime,name){if((mime||'').startsWith('image/'))return 'image';if((mime||'').startsWith('video/'))return 'video';if((mime||'').startsWith('audio/'))return 'audio';const m=extMime(name||'');if(m.startsWith('image/'))return 'image';if(m.startsWith('video/'))return 'video';if(m.startsWith('audio/'))return 'audio';return '';}
  function sectionPreviewEntries(sections){const out=[];for(const s of sections){try{const mime=extMime(s.name);const kind=previewKind(mime,s.name);if(!kind)continue;out.push({name:s.name,kind,mime,b64:s.b64});}catch(e){}}return out;}
  function clearConverterPreview(){const p=ui.converterPreview;if(p){(p.files||[]).forEach(f=>{try{URL.revokeObjectURL(f.url);}catch(e){}});}ui.converterPreview=null;}
  function paintConverterPreview(){const box=el('converterPreviewBox');if(!box)return;const p=ui.converterPreview;if(!p||!p.files.length){box.innerHTML='';return;}const cur=p.files[p.index]||p.files[0];const media=cur.kind==='image'?`<img src="${cur.url}" alt="${escapeHtml(cur.name)}">`:cur.kind==='video'?`<video src="${cur.url}" controls${p.loop?' loop':''}></video>`:`<audio src="${cur.url}" controls${p.loop?' loop':''}></audio>`;const filesRow=p.files.length>1?`<div class="convert-preview-files">${p.files.map((f,i)=>`<button type="button" class="btn${i===p.index?' btn-primary':''}" data-action="converter-preview-select" data-index="${i}">${escapeHtml(f.name)}</button>`).join('')}</div>`:'';const loopBtn=(cur.kind==='video'||cur.kind==='audio')?`<button type="button" class="btn" data-action="converter-preview-loop">${p.loop?'↻ Loop on':'↻ Loop off'}</button>`:'';box.innerHTML=`<div class="convert-preview"><p><strong>${escapeHtml(cur.name)}</strong></p>${media}${filesRow}<div class="convert-preview-actions">${loopBtn}<button type="button" class="btn" data-action="converter-preview-close">Close preview</button></div><p class="form-tip">Temporary preview only — nothing is saved to the app.</p></div>`;}
  async function converterPreview(){let raw=(el('converterTextInput').value||'').trim();if(!raw){notify('Paste some base64 text or pick a .txt file first.',true);return;}const sections=parseCombinedText(raw);let files=[],skipped=0;if(sections.length){const entries=sectionPreviewEntries(sections);skipped=sections.length-entries.length;for(const e of entries){try{files.push({name:e.name,kind:e.kind,blob:base64ToBlob(e.b64,e.mime)});}catch(err){skipped++;}}}else{let mime='';const dm=raw.match(/^data:([^;,]+)?;base64,([\s\S]*)$/);if(dm){mime=dm[1]||'';raw=dm[2];}raw=raw.replace(/\s+/g,'');let filename=(el('converterFileName').value||'').trim();if(!filename)filename='converted-file';if(!/\.[a-z0-9]{2,5}$/i.test(filename)){const ext=mime==='image/png'?'png':mime==='image/jpeg'?'jpg':mime==='image/gif'?'gif':mime==='image/webp'?'webp':mime==='video/mp4'?'mp4':mime==='video/quicktime'?'mov':mime==='video/webm'?'webm':'';if(ext)filename+='.'+ext;}try{const blob=base64ToBlob(raw,mime);if(!/\.[a-z0-9]{2,5}$/i.test(filename)){const sniff=await sniffExt(blob);if(sniff)filename+='.'+sniff;}const kind=previewKind(mime,filename);if(!kind){notify('This file type can only be downloaded, not previewed here.',true);return;}files.push({name:filename,kind,blob});}catch(e){notify('That text is not valid base64.',true);return;}}if(!files.length){notify('That text is not valid base64.',true);return;}clearConverterPreview();ui.converterPreview={files:files.map(f=>({...f,url:URL.createObjectURL(f.blob)})),index:0,loop:false};paintConverterPreview();if(skipped)notify(`Previewing ${files.length} file${files.length===1?'':'s'} (${skipped} skipped — not previewable here).`);}
  function renderConverter(){
    const f=ui.converterFile,b=ui.converterBatch;
    const preview=b?`<div class="convert-result"><p><strong>${b.files.length} files</strong> · ${fmtSize(b.files.reduce((s,x)=>s+x.size,0))} → ${fmtSize(b.files.reduce((s,x)=>s+x.b64.length,0))} of text</p><p>${b.files.map(x=>`${escapeHtml(x.name)} · ${fmtSize(x.size)}`).join('<br>')}</p><p class="form-tip">Both formats restore in Text → file.</p><div class="setting-action"><button class="btn btn-primary" data-action="converter-download-combined">Download one combined .txt</button><button class="btn btn-primary" data-action="converter-download-batch">Download .txt files</button></div></div>`:f?`<div class="convert-result"><p><strong>${escapeHtml(f.name)}</strong> · ${fmtSize(f.size)} → ${fmtSize(f.b64.length)} of text</p><textarea class="field" readonly rows="4">${escapeHtml(f.b64.slice(0,500))}${f.b64.length>500?'…':''}</textarea><p class="form-tip">Showing the first 500 characters. The download has the full text.</p><div class="setting-action"><button class="btn btn-primary" data-action="converter-download-txt">Download .txt</button><button class="btn" data-action="converter-copy">Copy text</button></div></div>`:'';
    return head('Convert files to text.','Turn a photo or video into text — and back again.')+
    `<div class="settings-grid"><div class="setting-panel"><h2>File → text</h2><p>Pick one or more photos or videos. One file becomes plain text you can save, copy, or paste anywhere; several can download as one combined .txt or one .txt per file — you choose after picking.</p><div class="setting-action"><button class="btn btn-primary" data-action="converter-pick">Pick photos or videos</button></div><input type="file" id="converterFileInput" accept="image/*,video/*" multiple hidden>${preview}</div>`+
    `<div class="setting-panel"><h2>Text → file</h2><p>Paste base64 text (or a data URL), or pick .txt files made by this converter. Pick several at once to restore them all; an older combined .txt still restores every file in it. Downloads go to your Downloads folder, or Preview shows the file right here without saving anything to the app.</p><textarea id="converterTextInput" class="field" rows="6" placeholder="Paste base64 text here..."></textarea><div class="setting-action"><button class="btn" data-action="converter-pick-txt">Pick .txt files</button></div><input type="file" id="converterTxtInput" accept=".txt,text/plain" multiple hidden><label class="field-label" for="converterFileName">File name (optional)</label><input id="converterFileName" class="field" placeholder="e.g. photo.png — left blank, the name comes from the .txt file or defaults"><div class="setting-action"><button class="btn btn-primary" data-action="converter-to-file">Convert & download</button><button class="btn" data-action="converter-preview">Preview</button></div><div id="converterPreviewBox"></div></div></div><p class="form-tip">Base64 text runs about a third larger than the original file.</p><p class="form-tip">Restoring several files downloads them one after another — if only some appear, your browser may be blocking multiple downloads. Allow them for this site, then convert again.</p>`;
  }
  function renderSettings(){const notifSupported=typeof Notification!=='undefined';const notifState=notifSupported?Notification.permission:'unsupported';const reminderRow=notifState==='granted'?`<div class="setting-row"><div><span>Reminders</span><small>Notifications are on for this browser.</small></div><strong>On</strong></div>`:notifState==='denied'?`<div class="setting-row"><div><span>Reminders</span><small>Blocked — allow notifications in your browser settings to turn them on.</small></div></div>`:notifState==='unsupported'?`<div class="setting-row"><div><span>Reminders</span><small>Notifications are not supported in this browser.</small></div></div>`:`<div class="setting-row"><div><span>Reminders</span><small>Get a ping when a task's reminder time arrives (while Dayloom is open).</small></div><button class="btn" data-action="enable-reminders">Enable notifications</button></div>`;
    const appLockPanel=data.settings.appLock?`<div class="setting-panel"><h2>App lock</h2><p>App lock is on. Dayloom asks for your password every time it opens, until you turn it off here.</p><p class="form-tip">If you forget this password there is no way to reset it — keep it somewhere safe.</p><label class="field-label" for="appLockPw">Change password</label><input id="appLockPw" class="field" type="password" autocomplete="new-password"><label class="field-label" for="appLockPw2">Confirm new password</label><input id="appLockPw2" class="field" type="password" autocomplete="new-password"><div class="setting-action"><button class="btn" data-action="app-lock-change">Change password</button><button class="btn btn-danger-soft" data-action="app-lock-remove">Remove app lock</button></div></div>`:`<div class="setting-panel"><h2>App lock</h2><p>Ask for a password every time Dayloom opens. It stays locked until you turn this off here.</p><p class="form-tip">If you forget this password there is no way to reset it — keep it somewhere safe.</p><label class="field-label" for="appLockPw">Password</label><input id="appLockPw" class="field" type="password" autocomplete="new-password"><label class="field-label" for="appLockPw2">Confirm password</label><input id="appLockPw2" class="field" type="password" autocomplete="new-password"><div class="setting-action"><button class="btn btn-primary" data-action="app-lock-set">Turn on app lock</button></div></div>`;
  return head('Make it feel like yours.','Customize your space and keep your data safe.')+
    `<div class="settings-grid"><div class="setting-panel"><h2>Appearance</h2><p>Set the mood for your workspace.</p><label>Color theme</label>${settingsTheme()}<label>Accent color</label><div class="color-palette">${PALETTE.map(c=>`<button class="swatch ${data.settings.accent===c?'selected':''}" style="background:${c}" data-action="setting" data-setting="accent" data-value="${c}" aria-label="Use accent ${c}" aria-pressed="${data.settings.accent===c}"></button>`).join('')}</div><label for="weekStart">Week starts on</label><select id="weekStart"><option value="0" ${data.settings.weekStart===0?'selected':''}>Sunday</option><option value="1" ${data.settings.weekStart===1?'selected':''}>Monday</option></select><div class="setting-row"><div><span>Compact task rows</span><small>Fit more on the screen</small></div><input type="checkbox" id="settingCompact" ${data.settings.compact?'checked':''}></div><div class="setting-row"><div><span>Show completed on calendar</span><small>See past wins on their dates</small></div><input type="checkbox" id="settingCompleted" ${data.settings.showCompleted?'checked':''}></div></div>
    <div class="setting-panel"><h2>Your data, your rules.</h2><p>Dayloom saves only in this browser. Export a JSON backup regularly—especially before clearing browser data or switching phones. Photos and videos are included in JSON backups, so they come back when you restore.</p><div class="setting-action"><button class="btn btn-primary" data-action="export">${icon('download')} Download backup</button><button class="btn" data-action="import">${icon('upload')} Import backup</button></div><div class="setting-row"><div><span>Saved locally</span><small>No account or automatic device sync.</small></div><span class="status-dot"></span></div>${reminderRow}<div class="setting-row"><div><span>Tasks</span><small>Total stored here</small></div><strong>${data.tasks.length}</strong></div><div class="setting-row"><div><span>Events</span><small>Calendar entries stored here</small></div><strong>${data.events.length}</strong></div><div class="setting-row"><div><span>Notes</span><small>Notebook entries stored here</small></div><strong>${data.notes.length}</strong></div><div class="setting-row"><div><span>Note folders</span><small>Notebook folders stored here</small></div><strong>${data.noteFolders.length}</strong></div><div class="setting-row"><div><span>Lists</span><small>Custom categories</small></div><strong>${data.lists.length}</strong></div><div style="border-top:1px solid var(--line);margin-top:12px;padding-top:19px"><h2>Start over</h2><p>Erase all tasks, events, notes, folders and customizations from this browser. Export a backup first—this cannot be undone.</p><button class="btn btn-danger-soft" data-action="clear-all">${icon('trash')} Erase local data</button></div></div>${appLockPanel}</div>`;
  }
  // Multi-select: long-press a task, event or note to select it, tap more to add them, then move or delete the batch.
  const selectableFromNode=node=>{
    const row=node.closest?.('.task-row,.event-row,.note-card');
    if(!row||row.classList.contains('is-locked'))return null;
    const id=row.querySelector('[data-id]')?.dataset.id;
    if(!id)return null;
    const kind=row.classList.contains('task-row')?'task':row.classList.contains('event-row')?'event':'note';
    return {kind,id};
  };
  const selectionCount=()=>ui.selection?ui.selection.ids.length:0;
  const isSelected=(kind,id)=>!!ui.selection&&ui.selection.kind===kind&&ui.selection.ids.includes(id);
  const paintSelectionBar=()=>{const bar=el('selectionBar');if(!bar)return;if(!ui.selection){bar.hidden=true;bar.innerHTML='';return;}const n=selectionCount(),kind=ui.selection.kind;const label=kind==='task'?'task':kind==='event'?'event':'note';const moveControl=kind==='task'?`<select id="selectionMoveTarget" aria-label="Move to list">${data.lists.map(l=>`<option value="${escapeHtml(l.id)}">${escapeHtml(l.name)}</option>`).join('')}</select><button class="btn btn-primary" data-action="selection-move">Move</button>`:kind==='note'?`<select id="selectionMoveTarget" aria-label="Move to folder"><option value="">Unfiled</option>${data.noteFolders.filter(f=>!folderLocked(f)).map(f=>`<option value="${escapeHtml(f.id)}">${escapeHtml(f.name)}</option>`).join('')}</select><button class="btn btn-primary" data-action="selection-move">Move</button>`:'';bar.innerHTML=`<strong>${n} selected</strong>${moveControl}<button class="btn btn-danger-soft" data-action="selection-delete">Delete</button><button class="btn" data-action="selection-cancel">Cancel</button>`;bar.hidden=false;};
  const startSelection=(kind,id)=>{ui.selection={kind,ids:[id]};render();};
  const toggleSelection=(kind,id)=>{if(!ui.selection||ui.selection.kind!==kind){startSelection(kind,id);return;}const at=ui.selection.ids.indexOf(id);if(at>=0)ui.selection.ids.splice(at,1);else ui.selection.ids.push(id);if(!ui.selection.ids.length)ui.selection=null;render();};
  function bulkDelete(){if(!ui.selection)return;const n=selectionCount(),kind=ui.selection.kind,ids=new Set(ui.selection.ids);const label=kind==='task'?'task':kind==='event'?'event':'note';const srcArr=kind==='task'?data.tasks:kind==='event'?data.events:data.notes;const items=srcArr.filter(x=>ids.has(x.id));if(!confirm(`Delete ${n} ${label}${n===1?'':'s'}? This cannot be undone.`))return;recordDelete(kind,items);items.forEach(deleteMediaFor);if(kind==='task')data.tasks=data.tasks.filter(t=>!ids.has(t.id));else if(kind==='event')data.events=data.events.filter(ev=>!ids.has(ev.id));else data.notes=data.notes.filter(no=>!ids.has(no.id));ui.selection=null;persist();render();}
  function bulkMove(){if(!ui.selection)return;const destEl=el('selectionMoveTarget');if(!destEl)return;const dest=destEl.value,n=selectionCount(),ids=new Set(ui.selection.ids);if(ui.selection.kind==='task'){data.tasks.forEach(t=>{if(ids.has(t.id))t.listId=dest;});const name=(data.lists.find(l=>l.id===dest)||{}).name||'that list';ui.selection=null;persist();render();notify(`Moved ${n} task${n===1?'':'s'} to ${name}.`);}else if(ui.selection.kind==='note'){if(dest){const df=data.noteFolders.find(f=>f.id===dest);if(df&&folderLocked(df)){notify('Unlock that folder first.',true);return;}}data.notes.forEach(no=>{if(ids.has(no.id))no.folderId=dest;});const name=dest?noteFolderName(dest):'Unfiled';ui.selection=null;persist();render();notify(`Moved ${n} note${n===1?'':'s'} to ${name}.`);}}
  function buildTimerPhases(preset){
    if(preset==='rest')return [{label:'Rest',secs:60}];
    if(preset==='plank')return [{label:'Plank',secs:40}];
    if(preset==='walk')return [{label:'Brisk walk',secs:1500}];
    const phases=[{label:'Warm up',secs:300}];
    for(let r=1;r<=8;r++){phases.push({label:`HARD · Round ${r} of 8`,secs:30});phases.push({label:`Easy · Round ${r} of 8`,secs:60});}
    phases.push({label:'Cool down',secs:180});
    return phases;
  }
  function timerLabel(preset){return preset==='rest'?'Rest — 60 sec':preset==='plank'?'Plank — 40 sec':preset==='walk'?'Brisk walk — 25 min':'Cardio intervals — 20 min';}
  function beep(times){try{ui.audioCtx=ui.audioCtx||new (window.AudioContext||window.webkitAudioContext)();if(ui.audioCtx.state==='suspended')ui.audioCtx.resume();const ctx=ui.audioCtx;for(let i=0;i<times;i++){const t=ctx.currentTime+i*0.25;const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=880;g.gain.setValueAtTime(0.001,t);g.gain.exponentialRampToValueAtTime(0.2,t+0.02);g.gain.exponentialRampToValueAtTime(0.001,t+0.2);o.connect(g);g.connect(ctx.destination);o.start(t);o.stop(t+0.22);}}catch(e){}}
  function buzz(pattern){try{if(navigator.vibrate)navigator.vibrate(pattern);}catch(e){}}
  function saveTimerState(){try{if(ui.timer)localStorage.setItem('dayloom:timer',JSON.stringify({preset:ui.timer.preset,phases:ui.timer.phases,index:ui.timer.index,endsAt:ui.timer.endsAt,remaining:ui.timer.remaining,running:ui.timer.running,source:ui.timer.source||null}));else localStorage.removeItem('dayloom:timer');}catch(e){}}
  function paintTimerDisplay(){const box=el('timerDisplay');if(!box)return;if(!ui.timer){box.innerHTML='<p class="form-tip">Pick a timer to begin. It keeps counting if you leave this tab, and it beeps and buzzes when each phase changes.</p>';return;}const t=ui.timer,phase=t.phases[t.index],secs=Math.max(0,Math.ceil((t.running?t.endsAt-Date.now():t.remaining)/1000));const mm=Math.floor(secs/60),ss=String(secs%60).padStart(2,'0');box.innerHTML=`<div class="timer-current"><strong>${escapeHtml(phase.label)}</strong><span class="timer-count" id="timerCountdown">${mm}:${ss}</span><span class="timer-meta">${escapeHtml(t.label)} · Phase ${t.index+1} of ${t.phases.length}</span></div><div class="setting-action"><button class="btn btn-primary" data-action="timer-pause">${t.running?'Pause':'Resume'}</button><button class="btn btn-danger-soft" data-action="timer-stop">Stop</button></div>`;}
  function timerTick(){if(!ui.timer||!ui.timer.running)return;const remain=ui.timer.endsAt-Date.now();if(remain>0){const cd=el('timerCountdown');if(cd){const secs=Math.ceil(remain/1000);cd.textContent=`${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`;}return;}const t=ui.timer;t.index++;if(t.index>=t.phases.length){stopTimer(true);return;}beep(2);buzz(200);t.endsAt=Date.now()+t.phases[t.index].secs*1000;saveTimerState();paintTimerDisplay();}
  function stopTimerSilent(){if(ui.timerTick){clearInterval(ui.timerTick);ui.timerTick=null;}ui.timer=null;}
  function startTimer(preset,source=null){if(!['cardio','rest','plank','walk'].includes(preset))return;stopTimerSilent();const phases=buildTimerPhases(preset);ui.timer={preset,label:timerLabel(preset),phases,index:0,endsAt:Date.now()+phases[0].secs*1000,remaining:phases[0].secs*1000,running:true,source:source||null};beep(1);saveTimerState();ui.timerTick=setInterval(timerTick,200);paintTimerDisplay();}
  function pauseTimer(){if(!ui.timer)return;if(ui.timer.running){ui.timer.remaining=Math.max(0,ui.timer.endsAt-Date.now());ui.timer.running=false;if(ui.timerTick){clearInterval(ui.timerTick);ui.timerTick=null;}}else{ui.timer.endsAt=Date.now()+ui.timer.remaining;ui.timer.running=true;ui.timerTick=setInterval(timerTick,200);}saveTimerState();paintTimerDisplay();}
  function stopTimer(finished){const had=!!ui.timer;stopTimerSilent();saveTimerState();if(finished&&had){beep(3);buzz([300,100,300]);notify('Timer done — nice work.');}paintTimerDisplay();}
  function restoreTimer(){try{const raw=localStorage.getItem('dayloom:timer');if(!raw)return;const s=JSON.parse(raw);if(!s||!Array.isArray(s.phases)||!s.phases.length)return;if(s.running&&s.endsAt>Date.now()){ui.timer={preset:s.preset,label:timerLabel(s.preset),phases:s.phases,index:s.index||0,endsAt:s.endsAt,remaining:s.endsAt-Date.now(),running:true,source:s.source||null};ui.timerTick=setInterval(timerTick,200);}else if(!s.running&&s.remaining>0){ui.timer={preset:s.preset,label:timerLabel(s.preset),phases:s.phases,index:s.index||0,endsAt:0,remaining:s.remaining,running:false,source:s.source||null};}else localStorage.removeItem('dayloom:timer');}catch(e){}}
  const WORKOUT_LIBRARY={
    strength:[
      {name:'Goblet squat',cue:'Hold one 15 lb dumbbell at your chest, squat until your thighs are parallel, then drive up.',video:'NIrcxSkwui8',step:'Goblet squat — 3x12 (one 15)'},
      {name:'Floor press',cue:'Lie on your back, a 15 in each hand, press up from your chest.',video:'_KwWsz38j6M',step:'Floor press — 3x10-12 (a 15 in each hand)'},
      {name:'One-arm row',cue:'Lean on a sturdy chair or bed edge, pull a 15 up to your hip.',video:'ZRSGpBUVcNw',step:'One-arm row — 3x12 each side (15)'},
      {name:'Romanian deadlift',cue:'A 15 in each hand, hinge at the hips, slight bend in the knees, lower to mid-shin, stand tall.',video:'hQgFixeXdZo',step:'Romanian deadlift — 3x12 (a 15 in each hand)'},
      {name:'Overhead press',cue:'Start with the 5s, move to the 15s when 12 reps feels easy.',video:'Did01dFR3Lk',step:'Overhead press — 3x10 (5s)'},
      {name:'Reverse lunge',cue:'Hold the 5s at your sides, step back, both knees to 90 degrees.',video:'Z1HLhIZCjvI',step:'Reverse lunge — 3x10 each side (holding the 5s)'}
    ],
    core:[
      {name:'Crunches',cue:'12-15 reps, slow and controlled, exhale at the top.',video:'',step:'Crunches — 12-15'},
      {name:'Plank',cue:'40 seconds, straight line from head to heels, do not let your hips sag.',video:'iL6F_LAdm-4',step:'Plank — 40 sec'},
      {name:'Dead bug',cue:'10 each side, low back pressed into the floor the whole time.',video:'PLzga2ED328',step:'Dead bugs — 10 each side'}
    ],
    cardio:[
      {name:'Brisk walk in place',cue:'Warm-up pace, knees up, arms swinging.',video:'',step:'Brisk walk in place'},
      {name:'Fast marching',cue:'Quick steps, knees high, stay light on your feet.',video:'',step:'Fast marching'},
      {name:'High knees',cue:'Fast, knees up to hip height.',video:'',step:'High knees'},
      {name:'Jumping jacks',cue:'Full range, arms overhead on every rep.',video:'',step:'Jumping jacks'},
      {name:'Mountain climbers',cue:'Plank position, drive knees to your chest fast, hips level.',video:'',step:'Mountain climbers'}
    ]
  };
  function renderWorkoutKind(kind){
    const kinds={strength:'Strength',core:'Core',cardio:'Cardio'};
    const list=WORKOUT_LIBRARY[kind]||[];
    const cards=list.map(ex=>`<article class="exercise-card" data-name="${escapeHtml(ex.name.toLowerCase())}" data-cue="${escapeHtml(ex.cue.toLowerCase())}"><h3>${escapeHtml(ex.name)}</h3><p>${escapeHtml(ex.cue)}</p>${ex.video?`<div class="video-embed"><iframe src="https://www.youtube.com/embed/${ex.video}" loading="lazy" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" title="${escapeHtml(ex.name)} demo"></iframe></div>`:''}<button class="btn" data-action="workout-add" data-name="${escapeHtml(ex.name)}" data-step="${escapeHtml(ex.step)}">${icon('plus')} Add to today's session</button></article>`).join('');
    return `<div class="toolbar"><div class="search-wrap">${icon('search')}<input id="workoutSearch" placeholder="Search ${kinds[kind]||''} moves..." autocomplete="off"></div></div><div class="exercise-grid">${cards}</div><p class="form-tip" id="workoutNoMatch" hidden>No moves match that search.</p>${kind==='cardio'?`<p class="form-tip">Tip: run these with the Cardio intervals timer on the Sessions tab.</p>`:''}`;
  }
  function filterWorkoutExercises(){const q=(el('workoutSearch')?.value||'').trim().toLowerCase();let shown=0;document.querySelectorAll('.exercise-card').forEach(card=>{const match=!q||card.dataset.name.includes(q)||card.dataset.cue.includes(q);card.hidden=!match;if(match)shown++;});const nm=el('workoutNoMatch');if(nm)nm.hidden=shown>0;}
  function addToTodaySession(name,step){
    const today=todayKey();
    let session=sortTasks(data.tasks.filter(t=>t.listId==='workouts'&&t.dueDate===today&&!t.completed))[0];
    if(session&&(session.checklist||[]).some(s=>s.text===step)){notify('Already in today\'s session.');return;}
    const now=new Date().toISOString();
    if(!session){
      session={id:uuid(),title:'Workout',notes:'',dueDate:today,listId:'workouts',priority:'medium',repeat:'none',repeatDays:[],repeatUntil:'',completed:false,completedAt:'',createdAt:now,updatedAt:now,reminder:'',reminderNotified:'',checklist:[],attachments:[]};
      data.tasks.push(session);
    }
    session.checklist=session.checklist||[];
    session.checklist.push({id:uuid(),text:step,done:false});
    session.updatedAt=now;
    persist();notify(`Added ${name} to today's session.`);
  }
  function presetForTask(t){const name=(t.title||'').toLowerCase();if(name.includes('cardio'))return 'cardio';if(name.includes('walk'))return 'walk';return 'rest';}
  function presetName(preset){return preset==='cardio'?'Cardio intervals':preset==='walk'?'Brisk walk':preset==='plank'?'Plank':'Rest';}
  function timerForStep(step){const s=(step||'').toLowerCase();if(s.includes('plank'))return 'plank';if(s.includes('warm')||s.includes('interval')||s.includes('cool')||s.includes('cardio'))return 'cardio';if(s.includes('walk'))return 'walk';return 'rest';}
  function videoForStep(step){const s=(step||'').toLowerCase();for(const kind of ['strength','core','cardio']){for(const ex of WORKOUT_LIBRARY[kind]){if(ex.video&&s.startsWith(ex.name.toLowerCase()))return ex.video;}}return '';}
  function timerPlacement(timer,playerActive,startKey,endKey,tasks){if(playerActive&&timer&&timer.source==='player')return 'player';if(timer&&timer.source&&timer.source!=='player'){const t=tasks.find(x=>x.id===timer.source);if(t&&t.dueDate>=startKey&&t.dueDate<=endKey)return 'row';}return 'top';}
  function openVideoDialog(title,ids){el('workoutVideoTitle').textContent=title;el('workoutVideoBody').innerHTML=ids.map(id=>`<div class="video-embed"><iframe src="https://www.youtube.com/embed/${id}" loading="lazy" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" title="Workout demo"></iframe></div>`).join('');openDialog('workoutVideoDialog');}
  function playerAdvance(){const p=ui.player;if(!p)return;const t=data.tasks.find(x=>x.id===p.taskId);if(!t){ui.player=null;render();return;}const steps=t.checklist||[];let next=-1;for(let i=p.index+1;i<steps.length;i++){if(!steps[i].done){next=i;break;}}if(next>=0)p.index=next;else p.done=true;render();}
  function renderPlayer(){
    const p=ui.player;if(!p)return '';
    const t=data.tasks.find(x=>x.id===p.taskId);
    if(!t){ui.player=null;return '';}
    const steps=t.checklist||[];
    if(!steps.length)return `<div class="player-panel"><h2>Today's workout</h2><p>This session has no exercises yet — add some from the Strength, Core, or Cardio tabs.</p><div class="setting-action"><button class="btn" data-action="player-finish">Close</button></div></div>`;
    if(p.done){
      const doneCount=steps.filter(s=>s.done).length,remaining=steps.length-doneCount;
      return `<div class="player-panel"><h2>${doneCount===steps.length?'All done — nice work.':'Session finished'}</h2><p>${doneCount} of ${steps.length} exercises checked off${remaining?` · ${remaining} skipped`:''}.</p><div class="setting-action">${remaining?`<button class="btn btn-primary" data-action="player-resume">Do skipped moves</button>`:''}<button class="btn" data-action="player-finish">Finish</button></div></div>`;
    }
    const step=steps[p.index]||{text:''};
    const video=videoForStep(step.text);
    const preset=timerForStep(step.text);
    const timerArea=ui.timer&&ui.timer.source==='player'?'<div id="timerDisplay"></div>':`<div class="setting-action"><button class="btn btn-primary" data-action="player-timer">Start ${presetName(preset)} timer</button></div>`;
    return `<div class="player-panel"><div class="eyebrow">TODAY'S WORKOUT · ${escapeHtml(t.title)}</div><h2>${escapeHtml(step.text)}</h2><p>Exercise ${p.index+1} of ${steps.length}</p>${video?`<div class="setting-action"><button class="btn" data-action="player-video" data-video="${video}">Play video</button></div>`:''}${timerArea}<div class="setting-action"><button class="btn btn-primary" data-action="player-done">Done — next</button><button class="btn" data-action="player-skip">Skip</button><button class="btn" data-action="player-finish">Finish workout</button></div></div>`;
  }
  function workoutWeekRange(){const today=parseLocalDate(todayKey());const start=new Date(today);start.setDate(today.getDate()-((today.getDay()-data.settings.weekStart+7)%7)+(ui.workoutWeek||0)*7);const startKey=localDate(start);return {startKey,endKey:datePlus(startKey,6),label:`Week of ${dateLabel(startKey,{month:'short',day:'numeric'})}` };}
  function renderWorkouts(){
    const today=todayKey(),range=workoutWeekRange();
    const wtasks=data.tasks.filter(t=>t.listId==='workouts');
    const doneInRange=wtasks.filter(t=>t.completed&&t.completedAt&&localDate(new Date(t.completedAt))>=range.startKey&&localDate(new Date(t.completedAt))<=range.endKey).length;
    const totalDone=wtasks.filter(t=>t.completed).length;
    const todayList=sortTasks(wtasks.filter(t=>t.dueDate===today));
    const todaySession=todayList[0];
    const nextSession=!todaySession?sortTasks(wtasks.filter(t=>!t.completed&&t.dueDate>today))[0]:null;
    const session=todaySession||nextSession;
    const days=[];for(let i=0;i<7;i++){const date=datePlus(range.startKey,i);const d=parseLocalDate(date);const name=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];const st=wtasks.filter(t=>t.dueDate===date);const done=st.filter(t=>t.completed);const label=st.length?(done.length===st.length?'Done ✓':date===today?'Today':date<today?'Missed':'Scheduled'):'Rest';days.push({date,name,st,label});}
    const timerPlace=timerPlacement(ui.timer,!!ui.player,range.startKey,range.endKey,wtasks);
    const weekRows=days.map(day=>{const s=day.st[0];if(!s)return `<div class="workout-day ${day.date===today?'is-today':''}"><span class="workout-day-name">${day.name}<small>${dateLabel(day.date,{month:'short',day:'numeric'})}</small></span><span class="workout-day-rest">Rest</span></div>`;const vids=youtubeIds([s.title,s.notes]);const tools=`<span class="workout-day-tools">${vids.length?`<button class="workout-tool-btn" data-action="workout-videos" data-id="${escapeHtml(s.id)}">Videos</button>`:''}<button class="workout-tool-btn" data-action="timer-start-session" data-id="${escapeHtml(s.id)}">Timer</button></span>`;const timerDiv=(timerPlace==='row'&&day.st.some(x=>x.id===ui.timer.source))?'<div id="timerDisplay" class="workout-day-timer"></div>':'';return `<div class="workout-day ${day.date===today?'is-today':''}"><span class="workout-day-name">${day.name}<small>${dateLabel(day.date,{month:'short',day:'numeric'})}</small></span><button class="workout-day-session" data-action="edit-task" data-id="${escapeHtml(s.id)}"><strong>${escapeHtml(s.title)}</strong><span class="${day.label.includes('Missed')?'overdue':''}">${day.label}</span></button>${tools}${timerDiv}</div>`;}).join('');
    const planNotes=data.notes.filter(n=>n.folderId==='workouts'&&!folderHidden(n));
    const tabs=[['sessions','Sessions'],['strength','Strength'],['core','Core'],['cardio','Cardio']];
    const tabBar=`<div class="workout-tabs">${tabs.map(([id,label])=>`<button class="workout-tab-btn ${ui.workoutTab===id?'active':''}" data-action="workout-tab" data-tab="${id}">${label}</button>`).join('')}</div>`;
    const top=head('Workouts','Your training, in one place.',`<button class="btn btn-primary" data-action="new-task" data-list="workouts">${icon('plus')} New workout</button>`)+tabBar;
    if(ui.workoutTab!=='sessions')return top+renderWorkoutKind(ui.workoutTab);
    const startRow=(!ui.player&&todaySession&&(todaySession.checklist||[]).length)?`<div class="player-start-row"><button class="btn btn-primary" data-action="player-start" data-id="${escapeHtml(todaySession.id)}">Start today's workout</button></div>`:'';
    const playerPanel=ui.player?renderPlayer():'';
    const sessionTools=session?`<div class="setting-action">${youtubeIds([session.title,session.notes]).length?`<button class="btn" data-action="workout-videos" data-id="${escapeHtml(session.id)}">Videos</button>`:''}<button class="btn btn-primary" data-action="timer-start-session" data-id="${escapeHtml(session.id)}">Start ${presetName(presetForTask(session))} timer</button></div>`:'';
    return top+startRow+playerPanel+
      `<div class="section-title"><h2>Timers</h2></div><div class="timer-presets"><button class="btn" data-action="timer-start" data-preset="cardio">${icon('clock')} Cardio intervals · 20 min</button><button class="btn" data-action="timer-start" data-preset="rest">${icon('clock')} Rest · 60 sec</button><button class="btn" data-action="timer-start" data-preset="plank">${icon('clock')} Plank · 40 sec</button><button class="btn" data-action="timer-start" data-preset="walk">${icon('clock')} Walk · 25 min</button></div>${timerPlace==='top'?'<div id="timerDisplay"></div>':''}`+
      `<div class="section-title"><h2>${range.label}</h2><span>${doneInRange} done · ${totalDone} total</span><span class="week-nav"><button class="btn" data-action="workout-week" data-dir="-1">‹ Prev</button>${(ui.workoutWeek||0)!==0?`<button class="btn" data-action="workout-week" data-dir="0">This week</button>`:''}<button class="btn" data-action="workout-week" data-dir="1">Next ›</button></span></div><div class="workout-week">${weekRows}</div>`+
      (session?section(todaySession?"Today's session":'Up next',[session],'No session today','Add a workout to get started.'):section("Today's session",[],'No session today','Add a workout to get started.'))+sessionTools+
      (planNotes.length?`<div class="section-title"><h2>Plan & notes</h2></div><div class="notes-grid">${planNotes.map(noteCard).join('')}</div>`:'');
  }
  function updateGlobalSearch(){const q=(el('globalSearchInput')?.value||'').trim().toLowerCase();const box=el('globalSearchResults');if(!box)return;if(!q){box.innerHTML='<p class="form-tip">Type to search tasks, events, and notes.</p>';return;}const taskHits=data.tasks.filter(t=>(t.title+' '+t.notes).toLowerCase().includes(q)).slice(0,5);const eventHits=data.events.filter(e=>(e.title+' '+e.notes).toLowerCase().includes(q)).slice(0,5);const noteHits=data.notes.filter(n=>!noteHidden(n)&&(n.title+' '+n.body).toLowerCase().includes(q)).slice(0,5);const group=(label,hits,kind)=>hits.length?`<div class="global-group"><h3>${label}</h3>${hits.map(h=>`<button class="global-result" data-action="global-open" data-kind="${kind}" data-id="${escapeHtml(h.id)}"><strong>${escapeHtml(h.title)}</strong><span>${kind==='task'?(getList(h.listId).name+(h.dueDate?' · '+dateLabel(h.dueDate):'')):kind==='event'?eventWhen(h):(data.noteFolders.find(f=>f.id===h.folderId)?.name||'Unfiled')}</span></button>`).join('')}</div>`:'';const html=group('Tasks',taskHits,'task')+group('Events',eventHits,'event')+group('Notes',noteHits,'note');box.innerHTML=html||'<p class="form-tip">Nothing found.</p>';}
  function render(){if(appLocked()){showAppLock();return;}applySettings();renderNav();const m=el('mainContent');
    m.innerHTML=ui.view==='today'?renderToday():ui.view==='calendar'?renderCalendar():ui.view==='workouts'?renderWorkouts():ui.view==='tasks'?renderTasks():ui.view==='lists'?renderLists():ui.view==='notes'?renderNotes():ui.view==='converter'?renderConverter():ui.view==='settings'?renderSettings():ui.view.startsWith('list:')?renderList(ui.view.slice(5)):renderToday();
    if(ui.view==='workouts')paintTimerDisplay();
    if(ui.view==='notes')updateNoteResults();
    if(ui.view==='calendar')updateEventSearchResults();
    if(ui.view==='tasks'){el('statusFilter').value=ui.taskStatus;el('listFilter').value=ui.taskList;el('priorityFilter').value=ui.taskPriority;updateTaskResults();}
    paintSelectionBar();
  }
  function openDialog(id){const d=el(id);if(typeof d.showModal==='function')d.showModal();else d.setAttribute('open','');}
  function closeDialog(id){const d=el(id);if(d.open&&typeof d.close==='function')d.close();else d.removeAttribute('open');}
  function closeAllDialogs(){document.querySelectorAll('dialog[open]').forEach(d=>{if(typeof d.close==='function')d.close();else d.removeAttribute('open');});}
  function onVisibilityChange(){
    if(document.hidden){ui.relockedOnHide=ui.unlockedNotes.size>0||ui.unlockedFolders.size>0;ui.unlockedNotes.clear();ui.unlockedFolders.clear();if(data.settings.appLock){ui.appUnlocked=false;showAppLock();}return;}
    if(data.settings.appLock&&!ui.appUnlocked){ui.relockedOnHide=false;closeAllDialogs();showAppLock();return;}
    if(ui.relockedOnHide){ui.relockedOnHide=false;render();}
    const nd=el('noteDialog');
    if(nd&&nd.open){const n=data.notes.find(x=>x.id===el('noteId').value);if(n&&noteHidden(n)){closeDialog('noteDialog');openUnlock(noteLocked(n)?'note':'folder',noteLocked(n)?n.id:n.folderId);return;}}
    const fd=el('folderDialog');
    if(fd&&fd.open){const f=data.noteFolders.find(x=>x.id===el('folderId').value);if(f&&folderLocked(f)){closeDialog('folderDialog');openUnlock('folder',f.id);return;}}
    if(el('globalSearchDialog')&&el('globalSearchDialog').open)updateGlobalSearch();
  }
  function showAppLock(){const s=el('appLockScreen');const m=el('mainContent');if(m)m.innerHTML='';if(!s)return;s.hidden=false;const err=el('appLockError');if(err){err.hidden=true;err.textContent='';}const inp=el('appLockInput');if(inp){inp.value='';setTimeout(()=>inp.focus(),25);}}
  function openUnlock(kind,id){ui.pendingUnlock={kind,id};const err=el('unlockError');if(err){err.hidden=true;err.textContent='';}const inp=el('unlockPassword');if(inp)inp.value='';openDialog('unlockDialog');setTimeout(()=>el('unlockPassword')?.focus(),25);}
  async function submitUnlock(e){e.preventDefault();const p=ui.pendingUnlock;if(!p)return;const pw=el('unlockPassword').value;if(!pw)return;const item=p.kind==='note'?data.notes.find(n=>n.id===p.id):data.noteFolders.find(f=>f.id===p.id);if(!item){closeDialog('unlockDialog');return;}let ok=false;try{ok=await verifyLock(item,pw);}catch(err){const er=el('unlockError');if(er){er.hidden=false;er.textContent='Password unlock needs a secure (HTTPS) page.';}return;}if(!ok){const er=el('unlockError');if(er){er.hidden=false;er.textContent='Wrong password.';}const inp=el('unlockPassword');if(inp){inp.value='';inp.focus();}return;}if(p.kind==='note')ui.unlockedNotes.add(p.id);else ui.unlockedFolders.add(p.id);ui.pendingUnlock=null;closeDialog('unlockDialog');render();if(p.kind==='note')openNote(p.id);}
  async function unlockApp(e){e.preventDefault();const pw=el('appLockInput').value;if(!pw)return;let ok=false;try{ok=await verifyLock(data.settings.appLock,pw);}catch(err){const er=el('appLockError');if(er){er.hidden=false;er.textContent='Password unlock needs a secure (HTTPS) page.';}return;}if(!ok){const er=el('appLockError');if(er){er.hidden=false;er.textContent='Wrong password.';}const inp=el('appLockInput');if(inp){inp.value='';inp.focus();}return;}ui.appUnlocked=true;const s=el('appLockScreen');if(s)s.hidden=true;render();}
  async function saveAppLock(){const pw=el('appLockPw').value,pw2=el('appLockPw2').value;if(!pw||pw!==pw2){notify(pw?'App lock passwords do not match.':'Enter a password for the app lock.',true);return;}try{data.settings.appLock=await makeLock(pw);}catch(err){notify('Password locking needs a secure (HTTPS) page.',true);return;}if(!persist())return;render();notify('App lock on — Dayloom will ask for your password every time it opens.');}
  function removeAppLock(){data.settings.appLock=null;if(!persist())return;render();notify('App lock removed.');}
  const paintTaskChecklist=()=>{const box=el('taskChecklist');if(!box)return;box.innerHTML=(ui.editChecklist||[]).map(s=>`<div class="checklist-edit-row" data-sub="${escapeHtml(s.id)}"><input class="field" maxlength="120" value="${escapeHtml(s.text)}" aria-label="Checklist step"><button type="button" class="btn btn-subtle" data-action="checklist-remove" data-sub="${escapeHtml(s.id)}">Remove</button></div>`).join('')||'<p class="form-tip">No steps yet — add one below.</p>';};
  const readEditorChecklist=()=>{const rows=[...document.querySelectorAll('#taskChecklist .checklist-edit-row')];return rows.map(row=>{const input=row.querySelector('input');const text=input?input.value.trim():'';const orig=(ui.editChecklist||[]).find(s=>s.id===row.dataset.sub);return {id:row.dataset.sub,text:text.slice(0,120),done:orig?orig.done:false};}).filter(s=>s.text);};
  const paintRepeatDays=()=>{const box=el('repeatDaysRow');if(!box)return;const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];box.innerHTML=days.map((d,i)=>`<button type="button" class="day-pill ${(ui.editRepeatDays||[]).includes(i)?'active':''}" data-action="repeat-day" data-day="${i}">${d}</button>`).join('');};
  const toggleRepeatFields=()=>{const r=el('taskRepeat').value;const until=el('repeatUntilWrap'),days=el('repeatDaysWrap');if(until)until.hidden=r==='none';if(days)days.hidden=r!=='custom';};
  function openTask(id='',selectedDate='',listId=''){
    const task=data.tasks.find(t=>t.id===id);
    el('taskDialogTitle').textContent=task?'Edit task':'New task';el('taskId').value=task?.id||uuid();
    el('taskTitle').value=task?.title||'';el('taskDue').value=task?.dueDate||selectedDate||'';
    el('taskList').innerHTML=data.lists.map(l=>`<option value="${escapeHtml(l.id)}">${escapeHtml(l.name)}</option>`).join('');
    el('taskList').value=task?.listId||listId||(ui.view.startsWith('list:')?ui.view.slice(5):ui.view==='workouts'?'workouts':'inbox');
    if(!el('taskList').value)el('taskList').value='inbox';
    el('taskPriority').value=task?.priority||'none';el('taskRepeat').value=task?.repeat||'none';el('taskNotes').value=task?.notes||'';el('taskReminder').value=task?.reminder||'';el('taskRepeatUntil').value=task?.repeatUntil||'';ui.editRepeatDays=(task?.repeatDays||[]).slice();paintRepeatDays();toggleRepeatFields();
    ui.editChecklist=(task?.checklist||[]).map(s=>({...s}));paintTaskChecklist();
    ui.editMedia={kind:'task',ownerId:el('taskId').value,original:(task?.attachments||[]).map(a=>({...a})),items:(task?.attachments||[]).map(a=>({...a}))};paintEditorMedia();
    el('taskDelete').hidden=!task;refreshWebLinks('taskNotes','taskTitle','taskLinkPreview','taskVideoPreview');openDialog('taskDialog');setTimeout(()=>el('taskTitle').focus(),25);
  }
  function saveTask(event){event.preventDefault();
    const title=el('taskTitle').value.trim();if(!title){el('taskTitle').reportValidity();el('taskTitle').focus();return;}
    if(el('taskRepeat').value==='custom'&&(ui.editRepeatDays||[]).length===0){notify('Pick at least one weekday for a custom repeat.',true);return;}
    const old=data.tasks.find(t=>t.id===el('taskId').value),now=new Date().toISOString();
    const task={id:el('taskId').value||old?.id||uuid(),title:title.slice(0,160),notes:el('taskNotes').value.slice(0,4000),dueDate:validIsoDate(el('taskDue').value)?el('taskDue').value:'',listId:getList(el('taskList').value).id,priority:el('taskPriority').value,repeat:el('taskRepeat').value,repeatDays:el('taskRepeat').value==='custom'?(ui.editRepeatDays||[]).slice():[],repeatUntil:el('taskRepeat').value==='none'?'':(validIsoDate(el('taskRepeatUntil').value)?el('taskRepeatUntil').value:''),completed:old?.completed||false,completedAt:old?.completedAt||'',checklist:readEditorChecklist(),reminder:validTime(el('taskReminder').value)?el('taskReminder').value:'',reminderNotified:(old&&old.reminder===el('taskReminder').value)?(old.reminderNotified||''):'' ,attachments:ui.editMedia&&ui.editMedia.ownerId===el('taskId').value?ui.editMedia.items:(old?.attachments||[]),createdAt:old?.createdAt||now,updatedAt:now};
    if(ui.editMedia&&ui.editMedia.ownerId===el('taskId').value){const keep=new Set(ui.editMedia.items.map(i=>i.id));ui.editMedia.original.forEach(o=>{if(!keep.has(o.id))mediaDelete(o.id);});}
    if(old) data.tasks[data.tasks.indexOf(old)]=task;else data.tasks.push(task);
    persist();closeDialog('taskDialog');render();notify(old?'Task updated':'Task added');
  }
  function nextRepeatDate(t){const start=parseLocalDate(t.dueDate)||parseLocalDate(todayKey());const d=new Date(start);const current=parseLocalDate(todayKey());if(d<current)d.setTime(current.getTime());
    const anchorDay=d.getDate();let next='';
    if(t.repeat==='daily'){d.setDate(d.getDate()+1);next=localDate(d);}
    else if(t.repeat==='weekly'){const weekday=start.getDay();const base=new Date(Math.max(start.getTime(),current.getTime()));let add=(weekday-base.getDay()+7)%7;if(add===0)add=7;base.setDate(base.getDate()+add);next=localDate(base);}
    else if(t.repeat==='monthly'){d.setDate(1);d.setMonth(d.getMonth()+1);const max=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(anchorDay,max));next=localDate(d);}
    else if(t.repeat==='custom'&&Array.isArray(t.repeatDays)&&t.repeatDays.length){const base=new Date(Math.max(start.getTime(),current.getTime()));for(let add=1;add<=7;add++){const cand=new Date(base);cand.setDate(base.getDate()+add);if(t.repeatDays.includes(cand.getDay())){next=localDate(cand);break;}}}
    if(!next)return '';
    if(t.repeatUntil&&next>t.repeatUntil)return null;
    return next;
  }
  function toggleTask(id){const t=data.tasks.find(x=>x.id===id);if(!t)return;
    const wasCompleted=t.completed;t.completed=!t.completed;t.completedAt=t.completed?new Date().toISOString():'';t.updatedAt=new Date().toISOString();
    if(!wasCompleted&&t.completed&&t.repeat!=='none'){
      const nextDate=nextRepeatDate(t);const now=new Date().toISOString();
      if(nextDate){
        data.tasks.push({...t,id:uuid(),dueDate:nextDate,completed:false,completedAt:'',createdAt:now,updatedAt:now,checklist:(t.checklist||[]).map(s=>({...s,done:false})),attachments:[],reminderNotified:''});
        notify(`Done! Next ${t.repeat} task: ${dateLabel(nextDate)}`);
      } else notify('Task completed ✨');
    } else notify(t.completed?'Task completed ✨':'Task marked active');
    persist();render();
  }
  function deleteTask(){const id=el('taskId').value;if(!id)return;if(!confirm('Delete this task? This cannot be undone.'))return;
    const item=data.tasks.find(t=>t.id===id);recordDelete('task',item?[item]:[]);deleteMediaFor(item);
    data.tasks=data.tasks.filter(t=>t.id!==id);persist();closeDialog('taskDialog');render();
  }
  function paintListColors(){el('listColorPalette').innerHTML=PALETTE.map(c=>`<button class="swatch ${ui.selectedListColor===c?'selected':''}" type="button" style="background:${c}" data-action="list-color" data-value="${c}" aria-label="Choose ${c}" aria-pressed="${ui.selectedListColor===c}"></button>`).join('');}
  function openList(id=''){const list=data.lists.find(l=>l.id===id);el('listDialogTitle').textContent=list?'Edit list':'New list';el('listId').value=list?.id||'';el('listName').value=list?.name||'';ui.selectedListColor=list?.color||PALETTE[0];el('listDelete').hidden=!list||id==='inbox';paintListColors();openDialog('listDialog');setTimeout(()=>el('listName').focus(),25);}
  function saveList(event){event.preventDefault();const name=el('listName').value.trim();if(!name){el('listName').reportValidity();return;}const id=el('listId').value;
    const old=data.lists.find(l=>l.id===id);if(old){old.name=name.slice(0,50);old.color=ui.selectedListColor;}else data.lists.push({id:uuid(),name:name.slice(0,50),color:ui.selectedListColor});
    persist();closeDialog('listDialog');render();notify(old?'List updated':'List created');}
  function deleteList(){const id=el('listId').value;if(id==='inbox')return;
    if(!confirm('Delete this list? Its tasks will be moved to Inbox.'))return;
    data.tasks.forEach(t=>{if(t.listId===id){t.listId='inbox';t.updatedAt=new Date().toISOString();}});data.lists=data.lists.filter(l=>l.id!==id);
    persist();closeDialog('listDialog');if(ui.view==='list:'+id)navigate('lists');else render();notify('List removed; tasks moved to Inbox');}
  // Calendar interoperability uses local/floating times on export; imported UTC and TZID
  // timestamps are converted to this device's local timezone.
  function downloadFile(contents,filename,mime){
    const blob=new Blob([contents],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
  const icsEscape=v=>String(v||'').replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
  const icsUnescape=v=>String(v||'').replace(/\\([nN,;\\])/g,(_,ch)=>/[nN]/.test(ch)?'\n':ch);
  const icsDay=v=>v.replaceAll('-','');
  const icsStamp=d=>`${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}T${String(d.getUTCHours()).padStart(2,'0')}${String(d.getUTCMinutes()).padStart(2,'0')}${String(d.getUTCSeconds()).padStart(2,'0')}Z`;
  function icsFold(line){
    const encoder=new TextEncoder();let part='',size=0,output=[];
    for(const ch of line){const bytes=encoder.encode(ch).length;if(size+bytes>75){output.push(part);part=' ';size=1;}part+=ch;size+=bytes;}
    output.push(part);return output.join('\r\n');
  }
  function exportICS(){
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Dayloom//Calendar 3.0//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
    for(const e of data.events){
      lines.push('BEGIN:VEVENT',`UID:${e.id}@dayloom.local`,`DTSTAMP:${icsStamp(new Date())}`,`SUMMARY:${icsEscape(e.title)}`);
      if(e.notes)lines.push(`DESCRIPTION:${icsEscape(e.notes)}`);
      if(e.allDay){
        lines.push(`DTSTART;VALUE=DATE:${icsDay(e.startDate)}`,`DTEND;VALUE=DATE:${icsDay(datePlus(e.endDate,1))}`);
      }else{
        lines.push(`DTSTART:${icsDay(e.startDate)}T${e.startTime.replace(':','')}00`,`DTEND:${icsDay(e.endDate)}T${e.endTime.replace(':','')}00`);
      }
      if(e.repeat!=='none')lines.push(`RRULE:FREQ=${e.repeat.toUpperCase()}`);
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR','');
    downloadFile(lines.map(icsFold).join('\r\n'),`dayloom-events-${todayKey()}.ics`,'text/calendar;charset=utf-8');
    notify(`Exported ${data.events.length} calendar events to .ics`);
  }
  function icsTime(value,params){
    const m=/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value||'');
    if(!m)return null;
    const [_,year,month,day,hh='00',mm='00',sec='00',utc]=m;
    const y=+year,mo=+month,d=+day,h=+hh,mi=+mm,s=+sec;
    if(!parseLocalDate(`${year}-${month}-${day}`)||h>23||mi>59||s>59)return null;
    let datetime=new Date(y,mo-1,d,h,mi,s);
    const zone=params.match(/TZID=([^;:]*)/i)?.[1]?.replace(/^"|"$/g,'');
    if(utc) datetime=new Date(Date.UTC(y,mo-1,d,h,mi,s));
    else if(zone){
      try{
        // Iterate to solve timezone wall-clock -> UTC, including daylight-saving offsets.
        let instant=Date.UTC(y,mo-1,d,h,mi,s);
        const df=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
        for(let i=0;i<4;i++){
          const parts=Object.fromEntries(df.formatToParts(new Date(instant)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
          const actual=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second);
          instant+=Date.UTC(y,mo-1,d,h,mi,s)-actual;
        }
        datetime=new Date(instant);
      }catch(e){return null;} // Unknown timezone: skip rather than silently shifting an event.
    }
    return {date:localDate(datetime),time:String(datetime.getHours()).padStart(2,'0')+':'+String(datetime.getMinutes()).padStart(2,'0'),allDay:!value.includes('T')};
  }
  function icsId(uid){
    const own=/^([a-zA-Z0-9_-]+)@dayloom\.local$/.exec(uid||'');if(own&&validId(own[1]))return own[1];
    // Stable identity, so importing the same external calendar twice does not duplicate its events.
    let h1=2166136261,h2=2166136261;
    for(let i=0;i<uid.length;i++){h1=Math.imul(h1^uid.charCodeAt(i),16777619);h2=Math.imul(h2^(uid.charCodeAt(i)+i),16777619);}
    return 'ics_'+(h1>>>0).toString(16).padStart(8,'0')+(h2>>>0).toString(16).padStart(8,'0');
  }
  function parseICS(text){
    const blocks=text.replace(/\r\n/g,'\n').replace(/\n[ \t]/g,'').split('\n');
    if(!blocks.some(s=>s.trim().toUpperCase()==='BEGIN:VCALENDAR'))throw new Error('This is not a valid iCalendar file.');
    const events=[],seen=new Set(),warnings={unsupportedRepeat:0,invalid:0,timezone:0};let block=null,sequence=0;
    for(const raw of blocks){const line=raw.trimEnd();
      if(line.toUpperCase()==='BEGIN:VEVENT'){block=[];continue;}
      if(line.toUpperCase()==='END:VEVENT'){
        if(!block)continue;sequence++;
        const properties=block.map(line=>{const i=line.indexOf(':');return i<1?null:{name:line.slice(0,i).split(';')[0].toUpperCase(),params:line.slice(0,i),value:line.slice(i+1)}}).filter(Boolean);
        const get=name=>properties.find(x=>x.name===name);
        const startProp=get('DTSTART'),endProp=get('DTEND'),summary=get('SUMMARY');
        const start=startProp&&icsTime(startProp.value,startProp.params);
        const end=endProp&&icsTime(endProp.value,endProp.params);
        if(!start||!summary||!icsUnescape(summary.value).trim()||(!end&&endProp)){warnings.invalid++;block=null;continue;}
        const allDay=start.allDay;
        // iCalendar all-day DTEND is exclusive; Dayloom endDate is inclusive.
        const endDate=allDay&&end?datePlus(end.date,-1):end?.date||start.date;
        if(endDate<start.date){warnings.invalid++;block=null;continue;}
        const uid=get('UID')?.value||`anonymous-${sequence}-${startProp.value}-${summary.value}`;
        const id=icsId(uid);
        const recur=get('RRULE')?.value||'';
        let repeat='none';
        if(recur){const bits=recur.toUpperCase().split(';');const freq=bits.find(s=>s.startsWith('FREQ='))?.slice(5).toLowerCase();
          if(['daily','weekly','monthly','yearly'].includes(freq)&&bits.every(b=>b===`FREQ=${freq.toUpperCase()}`||b==='INTERVAL=1')&&endDate===start.date)repeat=freq;
          else warnings.unsupportedRepeat++;
        }
        const now=new Date().toISOString();
        const e={id,title:icsUnescape(summary.value).slice(0,160),notes:icsUnescape(get('DESCRIPTION')?.value||'').slice(0,4000),startDate:start.date,endDate,allDay,
          startTime:start.time,endTime:end?.time|| (allDay?'00:00':'10:00'),repeat,color:PALETTE[4],createdAt:now,updatedAt:now};
        if(!seen.has(id)){events.push(e);seen.add(id);}block=null;continue;
      }
      if(block)block.push(line);
    }
    if(!events.length)throw new Error(`No supported events found (${warnings.invalid} invalid entries).`);
    if(events.length>2500)throw new Error('Import up to 2,500 events at a time.');
    return {events,warnings};
  }
  async function importICSFile(file){
    if(!file)return;
    if(file.size>3_000_000){notify('Calendar file too large (3 MB maximum).',true);return;}
    try{
      const {events,warnings}=parseICS(await file.text());
      const caution=warnings.unsupportedRepeat?`\n${warnings.unsupportedRepeat} complex repeating rules will be imported as single occurrences.`:'';
      const skipped=warnings.invalid?`\n${warnings.invalid} entries could not be read and will be skipped.`:'';
      if(!confirm(`Import ${events.length} events into Dayloom?\nMatching event IDs will be updated; your tasks and notes will stay untouched.${caution}${skipped}`))return;
      const existing=new Map(data.events.map(e=>[e.id,e]));
      for(const e of events){const old=existing.get(e.id);existing.set(e.id,{...e,createdAt:old?.createdAt||e.createdAt,color:old?.color||e.color});}
      if(existing.size>10000)throw new Error('Too many stored calendar events.');
      data.events=[...existing.values()];persist();render();notify(`Imported ${events.length} calendar events${warnings.unsupportedRepeat?' (some recurrence limits omitted)':''}.`);
    }catch(e){notify(e.message||'Unable to import calendar file.',true);}finally{el('icsFile').value='';}
  }
  async function exportBackup(){let media=[];
    try{const all=await mediaGetAll();for(const att of all){try{if(!att||!att.blob)continue;const b64=await blobToBase64(att.blob);if(b64)media.push({id:att.id,ownerKind:att.ownerKind,ownerId:att.ownerId,type:att.type,name:att.name||'',mime:att.blob.type||'',data:b64});}catch(e){}}}catch(e){media=[];}
    const contents={format:'dayloom-backup',version:4,exportedAt:new Date().toISOString(),data,media};
    const blob=new Blob([JSON.stringify(contents,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`dayloom-backup-${todayKey()}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);notify(media.length?`Backup downloaded with ${media.length} photos/videos. Keep it somewhere safe.`:'Backup downloaded. Keep it somewhere safe.');
  }
  async function importSelected(file){if(!file)return;if(file.size>250_000_000){notify('Backup too large (250 MB maximum).',true);return;}
    try{const backup=JSON.parse(await file.text());if(backup.format!=='dayloom-backup'||![1,2,3,4].includes(backup.version))throw new Error('Choose a Dayloom JSON backup (version 1, 2, 3 or 4).');
      const parsed=parseData(backup.data);ui.pendingImport=parsed;const rawMedia=Array.isArray(backup.media)?backup.media.slice(0,1000):[];const media=[];for(const m of rawMedia){if(!m||!validId(m.id)||!['task','event','note'].includes(m.ownerKind)||!validId(m.ownerId)||!['image','video'].includes(m.type)||typeof m.data!=='string'||!m.data)continue;media.push({id:m.id,ownerKind:m.ownerKind,ownerId:m.ownerId,type:m.type,name:typeof m.name==='string'?m.name.slice(0,120):'',mime:typeof m.mime==='string'?m.mime.slice(0,100):'',data:m.data});}ui.pendingMedia=media;el('importSummary').textContent=`Backup contains ${parsed.tasks.length} tasks, ${parsed.events.length} events, ${parsed.notes.length} notes, ${parsed.noteFolders.length} note folders and ${parsed.lists.length} lists${media.length?` and ${media.length} photos/videos`:''}. Choose how to restore it.`;
      document.querySelector('input[name="importMode"][value="merge"]').checked=true;openDialog('importDialog');
    }catch(e){notify(e.message||'Unable to read the backup.',true);}finally{el('importFile').value='';}
  }
  async function confirmImport(){if(!ui.pendingImport)return;const mode=document.querySelector('input[name="importMode"]:checked')?.value;
    if(mode==='replace'){if(!confirm('Replace all local Dayloom data with the imported backup? Export your current data first if needed.'))return;data=ui.pendingImport;await mediaClear();}
    else {
      const lists=new Map(data.lists.map(l=>[l.id,l]));for(const l of ui.pendingImport.lists)if(!lists.has(l.id))lists.set(l.id,l);
      const tasks=new Map(data.tasks.map(t=>[t.id,t]));for(const t of ui.pendingImport.tasks){const old=tasks.get(t.id);if(!old||t.updatedAt>old.updatedAt)tasks.set(t.id,t);}
      const events=new Map(data.events.map(e=>[e.id,e]));for(const e of ui.pendingImport.events){const old=events.get(e.id);if(!old||e.updatedAt>old.updatedAt)events.set(e.id,e);}
      const folderMap=new Map(data.noteFolders.map(f=>[f.id,f]));for(const f of ui.pendingImport.noteFolders)if(!folderMap.has(f.id))folderMap.set(f.id,f);
      const noteMap=new Map(data.notes.map(n=>[n.id,n]));for(const n of ui.pendingImport.notes){const old=noteMap.get(n.id);if(!old||n.updatedAt>old.updatedAt)noteMap.set(n.id,n);}
      data={...data,lists:[...lists.values()],tasks:[...tasks.values()].map(t=>({...t,listId:lists.has(t.listId)?t.listId:'inbox'})),events:[...events.values()],notes:[...noteMap.values()].map(n=>({...n,folderId:folderMap.has(n.folderId)?n.folderId:''})),noteFolders:[...folderMap.values()]};
    }
    const restored=await importBackupMedia(ui.pendingMedia||[]);
    ui.pendingImport=null;ui.pendingMedia=null;persist();closeDialog('importDialog');render();notify(restored?`Backup imported successfully — ${restored} photos/videos restored.`:'Backup imported successfully');
  }
  function setSetting(key,value){data.settings[key]=value;persist();render();}
  function handleAction(button){const a=button.dataset.action,id=button.dataset.id||'';
    if(a==='nav')navigate(button.dataset.view);
    else if(a==='new-task')openTask('',button.dataset.date||'',button.dataset.list||'');
    else if(a==='edit-task')openTask(id);
    else if(a==='new-event')openEvent('',button.dataset.date||todayKey());
    else if(a==='new-note')openNote();
    else if(a==='new-folder')openFolder();
    else if(a==='edit-folder')openFolder(id);
    else if(a==='note-filter'){ui.noteFolder=button.dataset.folder;render();}
    else if(a==='folder-color'){ui.selectedFolderColor=button.dataset.value;paintFolderColors();}
    else if(a==='edit-note')openNote(id);
    else if(a==='unlock-note')openUnlock('note',id);
    else if(a==='unlock-folder')openUnlock('folder',id);
    else if(a==='lock-all'){ui.unlockedNotes.clear();ui.unlockedFolders.clear();render();notify('Everything locked again.');}
    else if(a==='media-fullscreen'){const item=button.closest('.media-item');fullscreenImage(item?.querySelector('img'));}
    else if(a==='app-lock-set')saveAppLock();
    else if(a==='app-lock-change')saveAppLock();
    else if(a==='app-lock-remove')removeAppLock();
    else if(a==='converter-pick'){const i=el('converterFileInput');if(i)i.click();}
    else if(a==='converter-download-txt')converterDownloadTxt();
    else if(a==='converter-download-combined')converterDownloadCombined();
    else if(a==='converter-download-batch')converterDownloadBatch();
    else if(a==='converter-copy')converterCopy();
    else if(a==='converter-pick-txt'){const i=el('converterTxtInput');if(i)i.click();}
    else if(a==='converter-to-file')converterToFile();
    else if(a==='converter-preview')converterPreview();
    else if(a==='converter-preview-select'){if(ui.converterPreview){ui.converterPreview.index=+(button.dataset.index||0);paintConverterPreview();}}
    else if(a==='converter-preview-loop'){if(ui.converterPreview){ui.converterPreview.loop=!ui.converterPreview.loop;paintConverterPreview();}}
    else if(a==='converter-preview-close'){clearConverterPreview();paintConverterPreview();}
    else if(a==='note-color'){ui.selectedNoteColor=button.dataset.value;paintNoteColors();}
    else if(a==='edit-event')openEvent(id);
    else if(a==='event-color'){ui.selectedEventColor=button.dataset.value;paintEventColors();}
    else if(a==='toggle-task')toggleTask(id);
    else if(a==='new-list')openList();
    else if(a==='edit-list')openList(id);
    else if(a==='list-color'){ui.selectedListColor=button.dataset.value;paintListColors();}
    else if(a==='calendar-mode'){ui.calendarMode=button.dataset.mode;render();}
    else if(a==='calendar-prev'||a==='calendar-next'){const step=a==='calendar-next'?1:-1;if(ui.calendarMode==='month'){const d=new Date(ui.year,ui.month+step,1);ui.selectedDate=localDate(d);}else{ui.selectedDate=datePlus(ui.selectedDate,step*(ui.calendarMode==='week'?7:1));}const d=parseLocalDate(ui.selectedDate);ui.month=d.getMonth();ui.year=d.getFullYear();render();}
    else if(a==='calendar-today'){ui.selectedDate=todayKey();const d=parseLocalDate(ui.selectedDate);ui.month=d.getMonth();ui.year=d.getFullYear();render();}
    else if(a==='prev-month'||a==='next-month'){const d=new Date(ui.year,ui.month+(a==='next-month'?1:-1),1);ui.year=d.getFullYear();ui.month=d.getMonth();ui.selectedDate=localDate(d);render();}
    else if(a==='select-day'){ui.selectedDate=button.dataset.date;const d=parseLocalDate(ui.selectedDate);ui.month=d.getMonth();ui.year=d.getFullYear();render();}
    else if(a==='setting'){setSetting(button.dataset.setting,button.dataset.value);}
    else if(a==='export')exportBackup();
    else if(a==='import')el('importFile').click();
    else if(a==='ics-export')exportICS();
    else if(a==='ics-import')el('icsFile').click();
    else if(a==='toggle-subtask'){const task=data.tasks.find(t=>t.id===id);const sub=task?.checklist?.find(s=>s.id===button.dataset.sub);if(sub){sub.done=!sub.done;task.updatedAt=new Date().toISOString();persist();render();}}
    else if(a==='checklist-add'){const input=el('checklistAdd');const text=input?input.value.trim():'';if(!text)return;ui.editChecklist.push({id:uuid(),text:text.slice(0,120),done:false});input.value='';paintTaskChecklist();input.focus();}
    else if(a==='checklist-remove'){ui.editChecklist=(ui.editChecklist||[]).filter(s=>s.id!==button.dataset.sub);paintTaskChecklist();}
    else if(a==='missed-to-today'){const today=todayKey();let n=0;data.tasks.forEach(t=>{if(!t.completed&&t.dueDate&&t.dueDate<today){t.dueDate=today;t.updatedAt=new Date().toISOString();n++;}});if(n){persist();render();notify(`Moved ${n} missed ${n===1?'task':'tasks'} to today.`);}}
    else if(a==='undo-delete'){undoDelete();}
    else if(a==='enable-reminders'){if(typeof Notification==='undefined'){notify('This browser does not support notifications.',true);return;}Notification.requestPermission().then(p=>{notify(p==='granted'?'Reminders on — Dayloom will ping you when a task is due.':p==='denied'?'Notifications are blocked for this site. You can allow them in your browser settings.':'Notifications not enabled.');render();});}
    else if(a==='media-add'){const input=el(button.dataset.kind+'MediaInput');if(input)input.click();}
    else if(a==='media-loop'){toggleMediaLoop(button.dataset.id);}
    else if(a==='media-remove'){if(ui.editMedia){ui.editMedia.items=ui.editMedia.items.filter(i=>i.id!==button.dataset.id);paintEditorMedia();}}
    else if(a==='repeat-day'){const day=Number(button.dataset.day);if(Number.isInteger(day)&&day>=0&&day<=6){ui.editRepeatDays=ui.editRepeatDays||[];const i=ui.editRepeatDays.indexOf(day);if(i>=0)ui.editRepeatDays.splice(i,1);else ui.editRepeatDays.push(day);paintRepeatDays();}}
    else if(a==='workout-week'){const dir=button.dataset.dir;ui.workoutWeek=dir==='0'?0:(ui.workoutWeek||0)+Number(dir);render();}
    else if(a==='workout-tab'){ui.workoutTab=button.dataset.tab||'sessions';render();}
    else if(a==='workout-add'){addToTodaySession(button.dataset.name||'',button.dataset.step||button.dataset.name||'');}
    else if(a==='workout-videos'){const t=data.tasks.find(x=>x.id===button.dataset.id);if(!t)return;const ids=youtubeIds([t.title,t.notes]);if(!ids.length){notify('No videos on this workout.');return;}openVideoDialog(t.title,ids);}
    else if(a==='player-video'){openVideoDialog('Exercise video',[button.dataset.video]);}
    else if(a==='player-start'){const t=data.tasks.find(x=>x.id===button.dataset.id);if(!t)return;const steps=t.checklist||[];const first=steps.findIndex(s=>!s.done);ui.player={taskId:t.id,index:first>=0?first:0,done:first<0};render();}
    else if(a==='player-done'){const p=ui.player;if(!p)return;const t=data.tasks.find(x=>x.id===p.taskId);if(!t){ui.player=null;render();return;}const steps=t.checklist||[];if(steps[p.index])steps[p.index].done=true;t.updatedAt=new Date().toISOString();persist();playerAdvance();}
    else if(a==='player-skip'){playerAdvance();}
    else if(a==='player-finish'){ui.player=null;render();}
    else if(a==='player-resume'){const p=ui.player;if(!p)return;const t=data.tasks.find(x=>x.id===p.taskId);if(!t){ui.player=null;render();return;}const first=(t.checklist||[]).findIndex(s=>!s.done);if(first>=0){p.index=first;p.done=false;}else p.done=true;render();}
    else if(a==='player-timer'){const p=ui.player;if(!p)return;const t=data.tasks.find(x=>x.id===p.taskId);if(!t)return;const steps=t.checklist||[];const step=steps[p.index];if(!step)return;startTimer(timerForStep(step.text),'player');render();}
    else if(a==='timer-start-session'){const t=data.tasks.find(x=>x.id===button.dataset.id);if(t){startTimer(presetForTask(t),t.id);render();}}
    else if(a==='timer-start'){startTimer(button.dataset.preset);}
    else if(a==='timer-pause'){pauseTimer();}
    else if(a==='timer-stop'){stopTimer(false);}
    else if(a==='global-open'){closeDialog('globalSearchDialog');if(button.dataset.kind==='task')openTask(button.dataset.id);else if(button.dataset.kind==='event')openEvent(button.dataset.id);else if(button.dataset.kind==='note')openNote(button.dataset.id);}
    else if(a==='selection-cancel'){ui.selection=null;render();}
    else if(a==='selection-delete'){bulkDelete();}
    else if(a==='selection-move'){bulkMove();}
    else if(a==='clear-all'){if(confirm('Erase all Dayloom data on this device? This cannot be undone.')&&prompt('Type ERASE to confirm:')==='ERASE'){data=defaultData();ui.selectedDate=todayKey();persist();navigate('today');notify('Your local data has been erased.');}}
  }
  document.addEventListener('click',e=>{const close=e.target.closest('[data-close]');if(close){closeDialog(close.dataset.close);return;}if(ui.selection){if(e.target.closest&&e.target.closest('#selectionBar')){const barAction=e.target.closest('[data-action]');if(barAction)handleAction(barAction);return;}const found=selectableFromNode(e.target);if(found){toggleSelection(found.kind,found.id);return;}ui.selection=null;render();}const action=e.target.closest('[data-action]');if(action)handleAction(action);});
  let pressTimer=null,pressTarget=null,pressX=0,pressY=0,pressFiredAt=0,suppressClick=false;
  const clearPress=()=>{if(pressTimer){clearTimeout(pressTimer);pressTimer=null;}pressTarget=null;};
  document.addEventListener('pointerdown',e=>{
    suppressClick=false;
    if(e.button!==undefined&&e.button>0)return;
    const target=e.target;
    if(!target.closest||target.closest('a,.task-check'))return;
    const found=selectableFromNode(target);
    if(!found)return;
    pressTarget=found;pressX=e.clientX;pressY=e.clientY;
    pressTimer=setTimeout(()=>{pressTimer=null;pressFiredAt=Date.now();suppressClick=true;setTimeout(()=>{suppressClick=false;},1000);if(pressTarget&&!isSelected(pressTarget.kind,pressTarget.id))toggleSelection(pressTarget.kind,pressTarget.id);},450);
  });
  document.addEventListener('pointermove',e=>{if(!pressTimer)return;if(Math.abs(e.clientX-pressX)>12||Math.abs(e.clientY-pressY)>12)clearPress();});
  document.addEventListener('pointerup',clearPress);
  document.addEventListener('pointercancel',clearPress);
  document.addEventListener('contextmenu',e=>{if(!pressTimer&&Date.now()-pressFiredAt>600)return;const target=e.target;if(target.closest&&target.closest('.task-row,.event-row,.note-card')&&!target.closest('a'))e.preventDefault();});
  document.addEventListener('click',e=>{if(!suppressClick)return;suppressClick=false;e.stopPropagation();e.preventDefault();},true);
  document.addEventListener('keydown',e=>{if(e.target.id==='checklistAdd'&&e.key==='Enter'){e.preventDefault();handleAction({dataset:{action:'checklist-add'}});}});
  document.addEventListener('input',e=>{const previews={taskNotes:['taskNotes','taskTitle','taskLinkPreview','taskVideoPreview'],taskTitle:['taskNotes','taskTitle','taskLinkPreview','taskVideoPreview'],noteBody:['noteBody','noteTitle','noteLinkPreview','noteVideoPreview'],noteTitle:['noteBody','noteTitle','noteLinkPreview','noteVideoPreview'],eventNotes:['eventNotes','eventTitle','eventLinkPreview','eventVideoPreview'],eventTitle:['eventNotes','eventTitle','eventLinkPreview','eventVideoPreview']};if(previews[e.target.id])refreshWebLinks(...previews[e.target.id]);if(e.target.id==='taskSearch'){ui.search=e.target.value;updateTaskResults();}
    if(e.target.id==='noteSearch'){ui.noteSearch=e.target.value;updateNoteResults();}
    if(e.target.id==='eventSearch'){ui.eventSearch=e.target.value;updateEventSearchResults();}
    if(e.target.id==='globalSearchInput')updateGlobalSearch();
    if(e.target.id==='workoutSearch')filterWorkoutExercises();});
  document.addEventListener('change',e=>{const id=e.target.id,value=e.target.value;
    if(id==='statusFilter'){ui.taskStatus=value;updateTaskResults();}
    else if(id==='listFilter'){ui.taskList=value;updateTaskResults();}
    else if(id==='priorityFilter'){ui.taskPriority=value;updateTaskResults();}
    else if(id==='weekStart')setSetting('weekStart',Number(value)===1?1:0);
    else if(id==='settingCompact')setSetting('compact',e.target.checked);
    else if(id==='settingCompleted')setSetting('showCompleted',e.target.checked);
    else if(id==='converterFileInput')converterFileSelected();
    else if(id==='converterTxtInput')converterTxtSelected();
    else if(id==='importFile')importSelected(e.target.files?.[0]);
    else if(id==='icsFile')importICSFile(e.target.files?.[0]);
    else if(id==='taskMediaInput')addMedia('task',e.target);
    else if(id==='eventMediaInput')addMedia('event',e.target);
    else if(id==='noteMediaInput')addMedia('note',e.target);
    else if(id==='eventAllDay')toggleEventTimes();
    else if(id==='taskRepeat')toggleRepeatFields();
    else if(id==='globalSearchInput')updateGlobalSearch();
    else if(id==='eventStart'&&!el('eventId').value&&(!el('eventEnd').value||el('eventEnd').value<value))el('eventEnd').value=value;
  });
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',e=>{if(e.target===dialog)closeDialog(dialog.id);}));
  el('eventForm').addEventListener('submit',saveEvent);el('eventDelete').addEventListener('click',deleteEvent);
  el('taskForm').addEventListener('submit',saveTask);el('taskDelete').addEventListener('click',deleteTask);
  el('noteForm').addEventListener('submit',saveNote);el('noteDelete').addEventListener('click',deleteNote);
  el('folderForm').addEventListener('submit',saveFolder);el('unlockForm').addEventListener('submit',submitUnlock);el('appLockForm').addEventListener('submit',unlockApp);
  document.addEventListener('visibilitychange',onVisibilityChange);el('folderDelete').addEventListener('click',deleteFolder);
  el('listForm').addEventListener('submit',saveList);el('listDelete').addEventListener('click',deleteList);
  el('importConfirm').addEventListener('click',confirmImport);
  el('headerAdd').addEventListener('click',()=>openTask());el('headerAddNote').addEventListener('click',()=>openNote());el('headerAddEvent').addEventListener('click',()=>openEvent('',ui.view==='calendar'?ui.selectedDate:todayKey()));
  el('mobileAdd').addEventListener('click',()=>ui.view==='calendar'?openEvent('',ui.selectedDate):ui.view==='notes'?openNote():openTask());
  el('searchFocusBtn').addEventListener('click',()=>{el('globalSearchInput').value='';openDialog('globalSearchDialog');updateGlobalSearch();setTimeout(()=>el('globalSearchInput')?.focus(),25);});
  el('brandLink').addEventListener('click',e=>{e.preventDefault();navigate('today');});
  window.addEventListener('hashchange',()=>{const next=decodeURIComponent(location.hash.slice(1))||'today';if(next!==ui.view){ui.view=next;ui.selection=null;render();}});
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(data.settings.theme==='system')applySettings();});
  const initial=decodeURIComponent(location.hash.slice(1));if(views.some(v=>v.id===initial)||(initial.startsWith('list:')&&data.lists.some(l=>'list:'+l.id===initial)))ui.view=initial;
  restoreTimer();render();checkReminders();setInterval(checkReminders,60000);if(storageIssue)notify('Saved data could not be loaded. Export backups regularly.',true);
  if('serviceWorker' in navigator&&location.protocol.startsWith('http'))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
