/* Dayloom — a private, local-first task manager. No accounts or external services. */
(() => {
  'use strict';
  const STORE_KEY = 'dayloom:data:v1';
  const PALETTE = ['#6457e8','#e99d64','#3ca99b','#e46a8a','#6399dd','#b17ad9','#b3a05d','#65788e'];
  const PRIORITIES = ['none','low','medium','high'];
  const REPEATS = ['none','daily','weekly','monthly'];
  const EVENT_REPEATS = ['none','daily','weekly','monthly','yearly'];
  const validTime = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(v || '');
  const el = id => document.getElementById(id);
  const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uuid = () => crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  const localDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const parseLocalDate = value => { if(!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null; const [y,m,d]=value.split('-').map(Number); const result=new Date(y,m-1,d); return result.getFullYear()===y && result.getMonth()===m-1 && result.getDate()===d ? result : null; };
  const todayKey = () => localDate(new Date());
  const dateLabel = (value,opts={month:'short',day:'numeric'}) => { const d=parseLocalDate(value); return d ? d.toLocaleDateString(undefined,opts) : 'No date'; };
  const defaultData = () => ({lists:[{id:'inbox',name:'Inbox',color:'#6457e8'},{id:'personal',name:'Personal',color:'#3ca99b'},{id:'work',name:'Work',color:'#e99d64'}],tasks:[],events:[],settings:{theme:'system',accent:'#6457e8',weekStart:0,compact:false,showCompleted:true}});
  const safeString = (v,max=160) => typeof v === 'string' ? v.slice(0,max) : '';
  const validColor = v => /^#[0-9a-f]{6}$/i.test(v || '') ? v : '#6457e8';
  const validId = v => typeof v === 'string' && v.length > 0 && v.length < 120 && /^[a-zA-Z0-9_-]+$/.test(v);
  const validIsoDate = v => typeof v === 'string' && v.length===10 && !!parseLocalDate(v);
  const parseData = raw => {
    if(!raw || typeof raw !== 'object' || !Array.isArray(raw.lists) || !Array.isArray(raw.tasks) || raw.lists.length>500 || raw.tasks.length>10000 || (raw.events!==undefined && (!Array.isArray(raw.events) || raw.events.length>10000))) throw new Error('This backup is not a valid Dayloom data file.');
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
      taskMap.set(item.id,{
        id:item.id,title:safeString(item.title,160),notes:safeString(item.notes,4000),dueDate,
        listId:listMap.has(item.listId)?item.listId:'inbox',priority:PRIORITIES.includes(item.priority)?item.priority:'none',
        repeat:REPEATS.includes(item.repeat)?item.repeat:'none',completed:item.completed===true,
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
        createdAt:typeof item.createdAt==='string'?item.createdAt:new Date().toISOString(),
        updatedAt:typeof item.updatedAt==='string'?item.updatedAt:new Date().toISOString()
      });
    }
    const incoming=raw.settings&&typeof raw.settings==='object'?raw.settings:{};
    return {lists:[...listMap.values()],tasks:[...taskMap.values()],events:[...eventMap.values()],settings:{
      theme:['system','light','dark'].includes(incoming.theme)?incoming.theme:base.settings.theme,
      accent:validColor(incoming.accent),weekStart:incoming.weekStart===1?1:0,
      compact:incoming.compact===true,showCompleted:incoming.showCompleted!==false
    }};
  };
  let data=defaultData();
  let storageIssue=false;
  try {const saved=localStorage.getItem(STORE_KEY); if(saved) data=parseData(JSON.parse(saved));}
  catch(e){storageIssue=true;console.warn('Dayloom storage unavailable or corrupt:',e);}
  const ui={view:'today',selectedDate:todayKey(),month:new Date().getMonth(),year:new Date().getFullYear(),search:'',taskStatus:'open',taskPriority:'all',taskList:'all',selectedListColor:PALETTE[0],selectedEventColor:PALETTE[0],pendingImport:null};
  let toastTimer;
  function notify(message,error=false){const node=el('toast'); node.textContent=message;node.classList.toggle('error',error);node.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('visible'),4000);}
  function persist(){try{localStorage.setItem(STORE_KEY,JSON.stringify(data));storageIssue=false;return true;}catch(e){storageIssue=true;notify('Could not save on this device. Check browser storage settings.',true);return false;}}
  function applySettings(){
    const s=data.settings;const dark=s.theme==='dark'||(s.theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme=dark?'dark':'light';document.documentElement.classList.toggle('compact',s.compact);
    document.documentElement.style.setProperty('--accent',validColor(s.accent));
    document.documentElement.style.setProperty('--accent-soft',dark?'#30304a':'color-mix(in srgb, '+validColor(s.accent)+' 11%, white)');
    const themeTag=document.querySelector('meta[name="theme-color"]');if(themeTag)themeTag.content=dark?'#1e2031':'#f6f7fb';
  }
  function navigate(view){location.hash=view==='today'?'#today':'#'+encodeURIComponent(view);ui.view=view;ui.search='';ui.taskStatus='open';ui.taskPriority='all';ui.taskList='all';render();window.scrollTo(0,0);}
  const views=[{id:'today',text:'Today',icon:'grid'},{id:'calendar',text:'Calendar',icon:'calendar'},{id:'tasks',text:'All tasks',icon:'checklist'},{id:'lists',text:'My lists',icon:'layers'},{id:'settings',text:'Settings',icon:'settings'}];
  function getList(id){return data.lists.find(l=>l.id===id)||data.lists.find(l=>l.id==='inbox')||defaultData().lists[0];}
  const activeTasks=() => data.tasks.filter(t=>!t.completed);
  const byDate=(a,b)=> (a.dueDate||'9999').localeCompare(b.dueDate||'9999') || ({high:0,medium:1,low:2,none:3}[a.priority]-{high:0,medium:1,low:2,none:3}[b.priority]) || a.createdAt.localeCompare(b.createdAt);
  const sortTasks=arr=>[...arr].sort(byDate);
  function renderNav(){
    el('sideNav').innerHTML=views.map(v=>`<button class="nav-item ${ui.view===v.id?'active':''}" data-action="nav" data-view="${v.id}">${icon(v.icon)}<span>${v.text}</span>${v.id==='tasks'?`<span class="nav-count">${activeTasks().length}</span>`:''}</button>`).join('')+
      `<div class="side-divider"></div><div class="side-list-label">MY LISTS<button class="text-icon-button" data-action="new-list" aria-label="Add list">+</button></div>`+
      data.lists.map(l=>`<button class="nav-item ${ui.view==='list:'+l.id?'active':''}" data-action="nav" data-view="list:${escapeHtml(l.id)}"><i class="list-dot" style="background:${l.color}"></i><span>${escapeHtml(l.name)}</span><span class="nav-count">${data.tasks.filter(t=>t.listId===l.id&&!t.completed).length}</span></button>`).join('');
    el('mobileNav').innerHTML=views.map(v=>`<button class="${(ui.view===v.id||(v.id==='lists'&&ui.view.startsWith('list:')))?'active':''}" data-action="nav" data-view="${v.id}" aria-label="${v.text}">${icon(v.icon)}<span>${v.id==='tasks'?'Tasks':v.id==='lists'?'Lists':v.text}</span></button>`).join('');
    const titles={today:'Today',calendar:'Calendar',tasks:'All tasks',lists:'My lists',settings:'Settings'};
    el('topTitle').textContent=ui.view.startsWith('list:')?getList(ui.view.slice(5)).name:(titles[ui.view]||'Dayloom');
    el('headerAddEvent').hidden=ui.view!=='calendar';
    el('mobileAdd').setAttribute('aria-label',ui.view==='calendar'?'Add calendar event':'Add task');
  }
  function head(title,subtitle,actions=''){return `<div class="page-head"><div><div class="eyebrow">YOUR DAY, YOUR WAY</div><h1>${title}</h1><p>${subtitle}</p></div>${actions?`<div class="page-actions">${actions}</div>`:''}</div>`;}
  function empty(title,message,action=''){return `<div class="empty-state"><div class="empty-icon">${icon('sparkle')}</div><h3>${title}</h3><p>${message}</p>${action?`<button class="btn btn-primary" data-action="${action}">${icon('plus')} Add task</button>`:''}</div>`;}
  function taskRow(t){
    const list=getList(t.listId);const overdue=t.dueDate&&!t.completed&&t.dueDate<todayKey();
    const meta=[`<span><i class="list-dot" style="height:7px;width:7px;background:${list.color};margin-right:5px"></i>${escapeHtml(list.name)}</span>`];
    if(t.dueDate)meta.push(`<span class="${overdue?'overdue':''}">${icon('calendar')} ${t.dueDate===todayKey()?'Today':dateLabel(t.dueDate)}</span>`);
    if(t.priority!=='none')meta.push(`<span class="priority-${t.priority}">${escapeHtml(t.priority)} priority</span>`);
    if(t.repeat!=='none')meta.push(`<span>↻ ${escapeHtml(t.repeat)}</span>`);
    return `<div class="task-row ${t.completed?'completed':''}"><button class="task-check ${t.completed?'checked':''}" data-action="toggle-task" data-id="${escapeHtml(t.id)}" aria-label="${t.completed?'Mark incomplete':'Complete'}: ${escapeHtml(t.title)}" aria-pressed="${t.completed}">${icon('check')}</button><button class="task-open" data-action="edit-task" data-id="${escapeHtml(t.id)}"><span class="task-name">${escapeHtml(t.title)}</span><span class="task-sub">${meta.join('')}</span></button><button class="task-arrow" data-action="edit-task" data-id="${escapeHtml(t.id)}" aria-label="Edit ${escapeHtml(t.title)}">${icon('chevron-right')}</button></div>`;
  }
  function taskStack(tasks,title='Nothing here yet',message='Your tasks will show up here.',action='new-task'){
    return `<div class="task-stack">${tasks.length?sortTasks(tasks).map(taskRow).join(''):empty(title,message,action)}</div>`;
  }
  function section(title,items,emptyTitle,emptyDesc){return `<div class="section-title"><h2>${title}</h2><span>${items.length} ${items.length===1?'task':'tasks'}</span></div>${taskStack(items,emptyTitle,emptyDesc)}`;}
  function renderToday(){
    const today=todayKey(),all=data.tasks,doneToday=all.filter(t=>t.completed&&t.completedAt&&localDate(new Date(t.completedAt))===today).length;
    const openToday=all.filter(t=>!t.completed&&t.dueDate===today),overdue=all.filter(t=>!t.completed&&t.dueDate&&t.dueDate<today);
    const upcoming=all.filter(t=>!t.completed&&t.dueDate>today).sort(byDate).slice(0,5);
    const events=eventsOnDate(today);
    const pct=(doneToday+openToday.length)?Math.round(doneToday/(doneToday+openToday.length)*100):0;
    const greeting=()=>{const hour=new Date().getHours();return hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';};
    return head('A fresh day, a fresh start.',new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'}))+
      `<div class="hero"><div><div class="eyebrow">HELLO THERE ✨</div><h2>${greeting()}.</h2><p>${openToday.length?'You have '+openToday.length+' task'+(openToday.length===1?'':'s')+' planned for today.':'A clear day is a beautiful thing.'}<br>Make it count, at your own pace.</p></div><div class="progress-ring" style="--progress:${pct}%"><div class="progress-core"><strong>${pct}%</strong><span>TODAY</span></div></div></div>`+
      `<div class="metric-grid"><div class="metric"><span class="metric-icon">${icon('checklist')}</span><small>To do today</small><strong>${openToday.length}</strong><span class="metric-caption">On your list</span></div><div class="metric"><span class="metric-icon">${icon('clock')}</span><small>Overdue</small><strong>${overdue.length}</strong><span class="metric-caption">Needs attention</span></div><div class="metric"><span class="metric-icon">${icon('check')}</span><small>Done today</small><strong>${doneToday}</strong><span class="metric-caption">Small wins</span></div></div>`+
      `<div class="section-title"><h2>Today's events</h2><button class="btn" data-action="new-event" data-date="${today}">${icon('plus')} Add event</button></div>${eventStack(events,'No events today. Add one to your calendar.')}`+
      (overdue.length?section('Needs your attention',overdue,'You’re caught up','Nothing overdue.'):'')+
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
    return `<button class="event-row" data-action="edit-event" data-id="${escapeHtml(e.id)}"><span class="event-marker" style="background:${e.color}"></span><span class="event-copy"><strong>${escapeHtml(e.title)}</strong><span class="event-sub">${icon('clock')} ${escapeHtml(eventWhen(e))} ${repeat}</span>${e.notes?`<small>${escapeHtml(e.notes)}</small>`:''}</span>${icon('chevron-right')}</button>`;
  }
  function eventStack(events,emptyText='No events on this day.'){
    return `<div class="event-stack">${events.length?events.map(eventRow).join(''):`<div class="event-empty">${escapeHtml(emptyText)}</div>`}</div>`;
  }
  function paintEventColors(){el('eventColorPalette').innerHTML=PALETTE.map(c=>`<button class="swatch ${ui.selectedEventColor===c?'selected':''}" type="button" style="background:${c}" data-action="event-color" data-value="${c}" aria-label="Choose ${c}" aria-pressed="${ui.selectedEventColor===c}"></button>`).join('');}
  function toggleEventTimes(){el('eventTimeFields').hidden=el('eventAllDay').checked;}
  function openEvent(id='',date=''){
    const e=data.events.find(x=>x.id===id);
    const selected=date||ui.selectedDate||todayKey();
    el('eventDialogTitle').textContent=e?'Edit event':'New event';el('eventId').value=e?.id||'';
    el('eventTitle').value=e?.title||'';el('eventStart').value=e?.startDate||selected;
    el('eventEnd').value=e?.endDate||selected;
    el('eventAllDay').checked=e?.allDay!==false;
    el('eventStartTime').value=e?.startTime||'09:00';el('eventEndTime').value=e?.endTime||'10:00';
    el('eventRepeat').value=e?.repeat||'none';el('eventNotes').value=e?.notes||'';
    ui.selectedEventColor=e?.color||data.settings.accent;paintEventColors();toggleEventTimes();
    el('eventDelete').hidden=!e;openDialog('eventDialog');setTimeout(()=>el('eventTitle').focus(),25);
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
    const entry={id:old?.id||uuid(),title:title.slice(0,160),notes:el('eventNotes').value.slice(0,4000),startDate,endDate,allDay,startTime:validTime(startTime)?startTime:'09:00',endTime:validTime(endTime)?endTime:'10:00',repeat,color:ui.selectedEventColor,createdAt:old?.createdAt||now,updatedAt:now};
    if(old)data.events[data.events.indexOf(old)]=entry;else data.events.push(entry);
    const targetDate=old&&ui.view==='calendar'&&eventAtDate(entry,ui.selectedDate)?ui.selectedDate:startDate;
    ui.selectedDate=targetDate;const selected=parseLocalDate(targetDate);ui.month=selected.getMonth();ui.year=selected.getFullYear();
    persist();closeDialog('eventDialog');render();notify(old?'Event updated':'Event added to calendar');
  }
  function deleteEvent(){const id=el('eventId').value;if(!id)return;
    if(!confirm('Delete this event? If it repeats, the entire series will be removed.'))return;
    data.events=data.events.filter(e=>e.id!==id);persist();closeDialog('eventDialog');render();notify('Event deleted');
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
  function renderCalendar(){
    const sel=ui.selectedDate,tasks=data.tasks.filter(t=>t.dueDate===sel&&(data.settings.showCompleted||!t.completed));
    const events=eventsOnDate(sel);
    return head('See the bigger picture.','Events and tasks, together in one calendar.',`<button class="btn" data-action="calendar-today">Today</button>`)+
      `<div class="calendar-shell"><div class="calendar-top"><h2>${new Date(ui.year,ui.month,1).toLocaleDateString(undefined,{month:'long',year:'numeric'})}</h2><div class="month-actions"><button class="icon-button" data-action="prev-month" aria-label="Previous month">${icon('chevron-left')}</button><button class="icon-button" data-action="next-month" aria-label="Next month">${icon('chevron-right')}</button></div></div><div class="calendar-grid">${calendarCells()}</div></div>`+
      `<div class="calendar-selection"><div class="calendar-agenda-header"><h2>${dateLabel(sel,{weekday:'long',month:'long',day:'numeric'})}</h2><div class="agenda-actions"><button class="btn btn-primary" data-action="new-event" data-date="${sel}">${icon('plus')} Event</button><button class="btn" data-action="new-task" data-date="${sel}">${icon('plus')} Task</button></div></div><div class="section-title"><h2>Events</h2><span>${events.length}</span></div>${eventStack(events)}<div class="section-title"><h2>Tasks</h2><span>${tasks.length}</span></div>${taskStack(tasks,'No tasks on this day','Add a task to plan this date.','')}</div>`;
  }
  function renderTasks(){
    const selectors=`<select id="statusFilter" aria-label="Task status"><option value="open">Open tasks</option><option value="all">All statuses</option><option value="completed">Completed</option></select><select id="listFilter" aria-label="Filter by list"><option value="all">Every list</option>${data.lists.map(l=>`<option value="${escapeHtml(l.id)}">${escapeHtml(l.name)}</option>`).join('')}</select><select id="priorityFilter" aria-label="Filter by priority"><option value="all">Any priority</option><option value="high">High priority</option><option value="medium">Medium priority</option><option value="low">Low priority</option><option value="none">No priority</option></select>`;
    return head('Everything in one place.','Search, filter, and check things off.')+
      `<div class="toolbar"><div class="search-wrap">${icon('search')}<input id="taskSearch" type="search" placeholder="Search your tasks..." value="${escapeHtml(ui.search)}" aria-label="Search tasks"></div>${selectors}</div><div id="taskResults"></div>`;
  }
  function filteredTasks(){const q=ui.search.trim().toLowerCase();return data.tasks.filter(t=>(ui.taskStatus==='all'||(ui.taskStatus==='open'&&!t.completed)||(ui.taskStatus==='completed'&&t.completed))&&(ui.taskList==='all'||t.listId===ui.taskList)&&(ui.taskPriority==='all'||t.priority===ui.taskPriority)&&(!q||t.title.toLowerCase().includes(q)||t.notes.toLowerCase().includes(q)||getList(t.listId).name.toLowerCase().includes(q)));}
  function updateTaskResults(){const output=el('taskResults');if(!output)return;const arr=filteredTasks();output.innerHTML=`<div class="result-count">${arr.length} ${arr.length===1?'task':'tasks'} found</div>${taskStack(arr,'No matching tasks','Try changing your search or filters.','')}`;}
  function renderLists(){return head('A place for everything.','Organize life into lists that fit you.',`<button class="btn btn-primary" data-action="new-list">${icon('plus')} New list</button>`)+
    `<div class="list-card-grid">${data.lists.map(l=>{const open=data.tasks.filter(t=>t.listId===l.id&&!t.completed).length,done=data.tasks.filter(t=>t.listId===l.id&&t.completed).length;return `<button class="list-card" data-action="nav" data-view="list:${escapeHtml(l.id)}"><span class="list-dot" style="background:${l.color}"></span><h3>${escapeHtml(l.name)}</h3><p>${open} open · ${done} completed</p></button>`;}).join('')}<button class="list-card list-card-add" data-action="new-list">${icon('plus')}<strong>Create a list</strong></button></div>`;}
  function renderList(id){const list=getList(id);const items=data.tasks.filter(t=>t.listId===id&&(data.settings.showCompleted||!t.completed));
    return head(escapeHtml(list.name),`${items.filter(t=>!t.completed).length} remaining · ${items.filter(t=>t.completed).length} completed`,`${id!=='inbox'?`<button class="btn" data-action="edit-list" data-id="${escapeHtml(id)}">${icon('edit')} Edit list</button>`:''}<button class="btn btn-primary" data-action="new-task" data-list="${escapeHtml(id)}">${icon('plus')} New task</button>`)+taskStack(items,'This list is ready','Add your first task here.','new-task');
  }
  function settingsTheme(){return `<div class="theme-choices">${['system','light','dark'].map(x=>`<button class="option-pill ${data.settings.theme===x?'active':''}" data-action="setting" data-setting="theme" data-value="${x}">${x[0].toUpperCase()+x.slice(1)}</button>`).join('')}</div>`;}
  function renderSettings(){return head('Make it feel like yours.','Customize your space and keep your data safe.')+
    `<div class="settings-grid"><div class="setting-panel"><h2>Appearance</h2><p>Set the mood for your workspace.</p><label>Color theme</label>${settingsTheme()}<label>Accent color</label><div class="color-palette">${PALETTE.map(c=>`<button class="swatch ${data.settings.accent===c?'selected':''}" style="background:${c}" data-action="setting" data-setting="accent" data-value="${c}" aria-label="Use accent ${c}" aria-pressed="${data.settings.accent===c}"></button>`).join('')}</div><label for="weekStart">Week starts on</label><select id="weekStart"><option value="0" ${data.settings.weekStart===0?'selected':''}>Sunday</option><option value="1" ${data.settings.weekStart===1?'selected':''}>Monday</option></select><div class="setting-row"><div><span>Compact task rows</span><small>Fit more on the screen</small></div><input type="checkbox" id="settingCompact" ${data.settings.compact?'checked':''}></div><div class="setting-row"><div><span>Show completed on calendar</span><small>See past wins on their dates</small></div><input type="checkbox" id="settingCompleted" ${data.settings.showCompleted?'checked':''}></div></div>
    <div class="setting-panel"><h2>Your data, your rules.</h2><p>Dayloom saves only in this browser. Export a JSON backup regularly—especially before clearing browser data or switching phones.</p><div class="setting-action"><button class="btn btn-primary" data-action="export">${icon('download')} Download backup</button><button class="btn" data-action="import">${icon('upload')} Import backup</button></div><div class="setting-row"><div><span>Saved locally</span><small>No account or automatic device sync.</small></div><span class="status-dot"></span></div><div class="setting-row"><div><span>Tasks</span><small>Total stored here</small></div><strong>${data.tasks.length}</strong></div><div class="setting-row"><div><span>Events</span><small>Calendar entries stored here</small></div><strong>${data.events.length}</strong></div><div class="setting-row"><div><span>Lists</span><small>Custom categories</small></div><strong>${data.lists.length}</strong></div><div style="border-top:1px solid var(--line);margin-top:12px;padding-top:19px"><h2>Start over</h2><p>Erase all tasks and customizations from this browser. Export a backup first—this cannot be undone.</p><button class="btn btn-danger-soft" data-action="clear-all">${icon('trash')} Erase local data</button></div></div></div>`;
  }
  function render(){applySettings();renderNav();const m=el('mainContent');
    m.innerHTML=ui.view==='today'?renderToday():ui.view==='calendar'?renderCalendar():ui.view==='tasks'?renderTasks():ui.view==='lists'?renderLists():ui.view==='settings'?renderSettings():ui.view.startsWith('list:')?renderList(ui.view.slice(5)):renderToday();
    if(ui.view==='tasks'){el('statusFilter').value=ui.taskStatus;el('listFilter').value=ui.taskList;el('priorityFilter').value=ui.taskPriority;updateTaskResults();}
  }
  function openDialog(id){const d=el(id);if(typeof d.showModal==='function')d.showModal();else d.setAttribute('open','');}
  function closeDialog(id){const d=el(id);if(d.open&&typeof d.close==='function')d.close();else d.removeAttribute('open');}
  function openTask(id='',selectedDate='',listId=''){
    const task=data.tasks.find(t=>t.id===id);
    el('taskDialogTitle').textContent=task?'Edit task':'New task';el('taskId').value=task?.id||'';
    el('taskTitle').value=task?.title||'';el('taskDue').value=task?.dueDate||selectedDate||'';
    el('taskList').innerHTML=data.lists.map(l=>`<option value="${escapeHtml(l.id)}">${escapeHtml(l.name)}</option>`).join('');
    el('taskList').value=task?.listId||listId||(ui.view.startsWith('list:')?ui.view.slice(5):'inbox');
    if(!el('taskList').value)el('taskList').value='inbox';
    el('taskPriority').value=task?.priority||'none';el('taskRepeat').value=task?.repeat||'none';el('taskNotes').value=task?.notes||'';
    el('taskDelete').hidden=!task;openDialog('taskDialog');setTimeout(()=>el('taskTitle').focus(),25);
  }
  function saveTask(event){event.preventDefault();
    const title=el('taskTitle').value.trim();if(!title){el('taskTitle').reportValidity();el('taskTitle').focus();return;}
    const old=data.tasks.find(t=>t.id===el('taskId').value),now=new Date().toISOString();
    const task={id:old?.id||uuid(),title:title.slice(0,160),notes:el('taskNotes').value.slice(0,4000),dueDate:validIsoDate(el('taskDue').value)?el('taskDue').value:'',listId:getList(el('taskList').value).id,priority:el('taskPriority').value,repeat:el('taskRepeat').value,completed:old?.completed||false,completedAt:old?.completedAt||'',createdAt:old?.createdAt||now,updatedAt:now};
    if(old) data.tasks[data.tasks.indexOf(old)]=task;else data.tasks.push(task);
    persist();closeDialog('taskDialog');render();notify(old?'Task updated':'Task added');
  }
  function nextRepeatDate(t){const start=parseLocalDate(t.dueDate)||parseLocalDate(todayKey());const d=new Date(start);const current=parseLocalDate(todayKey());if(d<current)d.setTime(current.getTime());
    const anchorDay=d.getDate();if(t.repeat==='daily')d.setDate(d.getDate()+1);else if(t.repeat==='weekly')d.setDate(d.getDate()+7);else if(t.repeat==='monthly'){d.setDate(1);d.setMonth(d.getMonth()+1);const max=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(anchorDay,max));}return localDate(d);
  }
  function toggleTask(id){const t=data.tasks.find(x=>x.id===id);if(!t)return;
    const wasCompleted=t.completed;t.completed=!t.completed;t.completedAt=t.completed?new Date().toISOString():'';t.updatedAt=new Date().toISOString();
    if(!wasCompleted&&t.completed&&t.repeat!=='none'){
      const nextDate=nextRepeatDate(t);const now=new Date().toISOString();
      data.tasks.push({...t,id:uuid(),dueDate:nextDate,completed:false,completedAt:'',createdAt:now,updatedAt:now});
      notify(`Done! Next ${t.repeat} task: ${dateLabel(nextDate)}`);
    } else notify(t.completed?'Task completed ✨':'Task marked active');
    persist();render();
  }
  function deleteTask(){const id=el('taskId').value;if(!id)return;if(!confirm('Delete this task? This cannot be undone.'))return;
    data.tasks=data.tasks.filter(t=>t.id!==id);persist();closeDialog('taskDialog');render();notify('Task deleted');
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
  function exportBackup(){const contents={format:'dayloom-backup',version:2,exportedAt:new Date().toISOString(),data};
    const blob=new Blob([JSON.stringify(contents,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`dayloom-backup-${todayKey()}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);notify('Backup downloaded. Keep it somewhere safe.');
  }
  async function importSelected(file){if(!file)return;if(file.size>5_000_000){notify('Backup too large (5 MB maximum).',true);return;}
    try{const backup=JSON.parse(await file.text());if(backup.format!=='dayloom-backup'||![1,2].includes(backup.version))throw new Error('Choose a Dayloom JSON backup (version 1 or 2).');
      const parsed=parseData(backup.data);ui.pendingImport=parsed;el('importSummary').textContent=`Backup contains ${parsed.tasks.length} tasks, ${parsed.events.length} events and ${parsed.lists.length} lists. Choose how to restore it.`;
      document.querySelector('input[name="importMode"][value="merge"]').checked=true;openDialog('importDialog');
    }catch(e){notify(e.message||'Unable to read the backup.',true);}finally{el('importFile').value='';}
  }
  function confirmImport(){if(!ui.pendingImport)return;const mode=document.querySelector('input[name="importMode"]:checked')?.value;
    if(mode==='replace'){if(!confirm('Replace all local Dayloom data with the imported backup? Export your current data first if needed.'))return;data=ui.pendingImport;}
    else {
      const lists=new Map(data.lists.map(l=>[l.id,l]));for(const l of ui.pendingImport.lists)if(!lists.has(l.id))lists.set(l.id,l);
      const tasks=new Map(data.tasks.map(t=>[t.id,t]));for(const t of ui.pendingImport.tasks){const old=tasks.get(t.id);if(!old||t.updatedAt>old.updatedAt)tasks.set(t.id,t);}
      const events=new Map(data.events.map(e=>[e.id,e]));for(const e of ui.pendingImport.events){const old=events.get(e.id);if(!old||e.updatedAt>old.updatedAt)events.set(e.id,e);}
      data={...data,lists:[...lists.values()],tasks:[...tasks.values()].map(t=>({...t,listId:lists.has(t.listId)?t.listId:'inbox'})),events:[...events.values()]};
    }
    ui.pendingImport=null;persist();closeDialog('importDialog');render();notify('Backup imported successfully');
  }
  function setSetting(key,value){data.settings[key]=value;persist();render();}
  function handleAction(button){const a=button.dataset.action,id=button.dataset.id||'';
    if(a==='nav')navigate(button.dataset.view);
    else if(a==='new-task')openTask('',button.dataset.date||'',button.dataset.list||'');
    else if(a==='edit-task')openTask(id);
    else if(a==='new-event')openEvent('',button.dataset.date||todayKey());
    else if(a==='edit-event')openEvent(id);
    else if(a==='event-color'){ui.selectedEventColor=button.dataset.value;paintEventColors();}
    else if(a==='toggle-task')toggleTask(id);
    else if(a==='new-list')openList();
    else if(a==='edit-list')openList(id);
    else if(a==='list-color'){ui.selectedListColor=button.dataset.value;paintListColors();}
    else if(a==='calendar-today'){ui.selectedDate=todayKey();const d=parseLocalDate(ui.selectedDate);ui.month=d.getMonth();ui.year=d.getFullYear();render();}
    else if(a==='prev-month'||a==='next-month'){const d=new Date(ui.year,ui.month+(a==='next-month'?1:-1),1);ui.year=d.getFullYear();ui.month=d.getMonth();ui.selectedDate=localDate(d);render();}
    else if(a==='select-day'){ui.selectedDate=button.dataset.date;const d=parseLocalDate(ui.selectedDate);ui.month=d.getMonth();ui.year=d.getFullYear();render();}
    else if(a==='setting'){setSetting(button.dataset.setting,button.dataset.value);}
    else if(a==='export')exportBackup();
    else if(a==='import')el('importFile').click();
    else if(a==='clear-all'){if(confirm('Erase all Dayloom data on this device? This cannot be undone.')&&prompt('Type ERASE to confirm:')==='ERASE'){data=defaultData();ui.selectedDate=todayKey();persist();navigate('today');notify('Your local data has been erased.');}}
  }
  document.addEventListener('click',e=>{const close=e.target.closest('[data-close]');if(close){closeDialog(close.dataset.close);return;}const action=e.target.closest('[data-action]');if(action)handleAction(action);});
  document.addEventListener('input',e=>{if(e.target.id==='taskSearch'){ui.search=e.target.value;updateTaskResults();}});
  document.addEventListener('change',e=>{const id=e.target.id,value=e.target.value;
    if(id==='statusFilter'){ui.taskStatus=value;updateTaskResults();}
    else if(id==='listFilter'){ui.taskList=value;updateTaskResults();}
    else if(id==='priorityFilter'){ui.taskPriority=value;updateTaskResults();}
    else if(id==='weekStart')setSetting('weekStart',Number(value)===1?1:0);
    else if(id==='settingCompact')setSetting('compact',e.target.checked);
    else if(id==='settingCompleted')setSetting('showCompleted',e.target.checked);
    else if(id==='importFile')importSelected(e.target.files?.[0]);
    else if(id==='eventAllDay')toggleEventTimes();
    else if(id==='eventStart'&&!el('eventId').value&&(!el('eventEnd').value||el('eventEnd').value<value))el('eventEnd').value=value;
  });
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',e=>{if(e.target===dialog)closeDialog(dialog.id);}));
  el('eventForm').addEventListener('submit',saveEvent);el('eventDelete').addEventListener('click',deleteEvent);
  el('taskForm').addEventListener('submit',saveTask);el('taskDelete').addEventListener('click',deleteTask);
  el('listForm').addEventListener('submit',saveList);el('listDelete').addEventListener('click',deleteList);
  el('importConfirm').addEventListener('click',confirmImport);
  el('headerAdd').addEventListener('click',()=>openTask());el('headerAddEvent').addEventListener('click',()=>openEvent('',ui.view==='calendar'?ui.selectedDate:todayKey()));
  el('mobileAdd').addEventListener('click',()=>ui.view==='calendar'?openEvent('',ui.selectedDate):openTask());
  el('searchFocusBtn').addEventListener('click',()=>{navigate('tasks');el('taskSearch')?.focus();});
  el('brandLink').addEventListener('click',e=>{e.preventDefault();navigate('today');});
  window.addEventListener('hashchange',()=>{const next=decodeURIComponent(location.hash.slice(1))||'today';if(next!==ui.view){ui.view=next;render();}});
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(data.settings.theme==='system')applySettings();});
  const initial=decodeURIComponent(location.hash.slice(1));if(views.some(v=>v.id===initial)||(initial.startsWith('list:')&&data.lists.some(l=>'list:'+l.id===initial)))ui.view=initial;
  render();if(storageIssue)notify('Saved data could not be loaded. Export backups regularly.',true);
  if('serviceWorker' in navigator&&location.protocol.startsWith('http'))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
