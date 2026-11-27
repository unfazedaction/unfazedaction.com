import {firebaseConfig} from './firebase-config.js';
import {createSessionGuard,workspaceError} from '/assets/auth/session-guard.js';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getFirestore,collection,query,orderBy,onSnapshot,addDoc,updateDoc,deleteDoc,doc,serverTimestamp,runTransaction} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

// ThoughtForge Batch 3 — compatible with Batch 1/2 records and Firebase account.
const $=id=>document.getElementById(id);
const tagsIn=value=>[...new Set((value.match(/#[\p{L}\p{N}_-]+/gu)||[]).map(t=>t.toLowerCase()))].slice(0,50);
const show=id=>{document.querySelectorAll('.state').forEach(panel=>panel.hidden=true);$('app').hidden=id!=='app';if(id!=='app')$(id).hidden=false;};
const configured=Object.values(firebaseConfig).every(value=>typeof value==='string'&&!value.includes('REPLACE_ME'));
if(!configured)show('setup');else import('/assets/auth/ua-auth.js').then(start).catch(()=>show('authUnavailable'));

function start(api){
 const firebase=initializeApp(firebaseConfig),db=getFirestore(firebase),session=createSessionGuard();
 let departing=false;
 const current=ticket=>!departing&&session.current(ticket);
 let user=null,records=[],lists=[],stopEntries=null,stopLists=null,filter='all',selectedTag=null,editingId=null,editingListId=null,actionBusy=false;
 const error=(id,message)=>{$(id).hidden=!message;if(message)$(id).textContent=message;};
 const itemsRef=()=>collection(db,'thoughtforgeUsers',user.uid,'items');
 const entryRef=id=>doc(db,'thoughtforgeUsers',user.uid,'items',id);
 const listsRef=()=>collection(db,'thoughtforgeUsers',user.uid,'lists');
 const listRef=id=>doc(db,'thoughtforgeUsers',user.uid,'lists',id);
 const friendlyDate=iso=>{const d=new Date(iso);return Number.isNaN(d.getTime())?'Invalid date':d.toLocaleString();};
 const newButton=(label,cls='small-button')=>{const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=label;return b;};
 const repeatLabel=item=>({daily:'Daily',weekly:'Weekly',monthly:'Monthly',weekdays:'Selected weekdays'})[item.repeat]||'';
 const isoFromLocal=value=>{const d=new Date(value);return Number.isFinite(d.getTime())?d.toISOString():null;};
 function nextOccurrence(item){
  const date=new Date(item.dueAt);if(!Number.isFinite(date.getTime()))throw Error('This reminder has no valid date.');
  const mode=item.repeat||'none';
  if(mode==='daily')date.setDate(date.getDate()+1);
  else if(mode==='weekly')date.setDate(date.getDate()+7);
  else if(mode==='monthly'){
   const day=date.getDate();date.setDate(1);date.setMonth(date.getMonth()+1);
   const lastDay=new Date(date.getFullYear(),date.getMonth()+1,0).getDate();date.setDate(Math.min(day,lastDay));
  }else if(mode==='weekdays'){
   const days=(item.repeatDays||[]).map(Number);
   if(!days.length||!days.some(day=>Number.isInteger(day)&&day>=0&&day<=6))throw Error('This reminder needs at least one valid weekday.');
   do{date.setDate(date.getDate()+1);}while(!days.includes(date.getDay()));
  }else throw Error('Not a repeating reminder.');
  return date.toISOString();
 }
 function resetSession(){
  session.clear();actionBusy=false;
  if(stopEntries){stopEntries();stopEntries=null;}if(stopLists){stopLists();stopLists=null;}
  records=[];lists=[];editingId=null;editingListId=null;filter='all';selectedTag=null;
  $('captureForm').reset();$('newListForm').reset();$('captureOptions').open=false;repeatUI();reflectKind();
  $('save').disabled=false;$('save').textContent='Save to Second Brain ↗';$('createList').disabled=false;
  $('search').value='';$('items').replaceChildren();$('lists').replaceChildren();$('tagFilters').replaceChildren();$('count').textContent='0';$('summary').textContent='';$('syncStatus').textContent='Connecting…';
  for(const id of ['captureError','feedError','listError']){$(id).textContent='';$(id).hidden=true;}
  $('empty').hidden=true;$('listsEmpty').hidden=true;
  document.querySelectorAll('.filter').forEach(b=>b.classList.toggle('active',b.dataset.filter==='all'));
 }
 let signingOut=false;
 function hideAccount(){
  $('signOut').hidden=true;$('memberLink').hidden=true;show('loading');
 }
 function authUnavailable(){
  hideAccount();resetSession();user=null;show('authUnavailable');
 }
 $('signOut').onclick=async()=>{
  if(!user||signingOut)return;
  signingOut=true;$('signOut').disabled=true;
  try{await api.signOutOfUA();hideAccount();resetSession();user=null;window.location.replace('/signin/');}
  catch(e){if(user){error('feedError',api.accountErrorMessage(e));signingOut=false;$('signOut').disabled=false;}}
 };
 window.addEventListener('pagehide',()=>{departing=true;hideAccount();resetSession();user=null;});
 window.addEventListener('pageshow',event=>{if(event.persisted)window.location.reload();});
 api.observeAccount(next=>{
  if(departing)return;
  // Never let callbacks or unsaved input from one account carry into another.
  if(user&&next&&user.uid!==next.uid){departing=true;hideAccount();resetSession();user=null;window.location.reload();return;}
  if(user&&next&&user.uid===next.uid)return;
  hideAccount();resetSession();user=next;
  if(!user){show('signedOut');window.location.replace(signingOut?'/signin/':'/signin/?continue=secondbrain');return;}
  const ticket=session.start(user.uid);
  $('signOut').hidden=false;$('memberLink').hidden=false;
  show('app');$('syncStatus').textContent='Connecting…';error('feedError','');error('listError','');
  stopEntries=onSnapshot(query(itemsRef(),orderBy('createdAt','desc')),snapshot=>{
   if(!current(ticket))return;
   records=snapshot.docs.map(entry=>({id:entry.id,...entry.data()}));
   $('syncStatus').textContent=snapshot.metadata.fromCache?'Offline / cached':'Synced';error('feedError','');
   if(editingId&&!records.some(item=>item.id===editingId))editingId=null;
   render();
  },e=>{if(!current(ticket))return;$('syncStatus').textContent='Sync unavailable';error('feedError',workspaceError(e,'Unable to load thoughts.'));});
  stopLists=onSnapshot(query(listsRef(),orderBy('createdAt','desc')),snapshot=>{
   if(!current(ticket))return;
   lists=snapshot.docs.map(entry=>({id:entry.id,...entry.data()}));
   if(editingListId&&!lists.some(item=>item.id===editingListId))editingListId=null;
   renderLists();
  },e=>{if(current(ticket))error('listError',workspaceError(e,'Unable to load checklists.'));});
 },authUnavailable);
 function repeatUI(){
  const mode=$('repeat').value;
  $('repeatDaysBox').hidden=mode!=='weekdays';
  $('dueAt').required=mode!=='none';
  if(mode!=='none')$('kind').value='reminder';
 }
 // Batch 4: lighter capture and navigation UI; no Firestore schema changes.
 const typeChips=[...document.querySelectorAll('.type-chip')];
 function reflectKind(){typeChips.forEach(chip=>{const active=chip.dataset.kind===$('kind').value;chip.classList.toggle('selected',active);chip.setAttribute('aria-pressed',String(active));});}
 typeChips.forEach(chip=>chip.addEventListener('click',()=>{
  $('kind').value=chip.dataset.kind;
  if(chip.dataset.kind!=='reminder')$('repeat').value='none';
  if(chip.dataset.kind==='reminder')$('captureOptions').open=true;
  repeatUI();reflectKind();$('body').focus();
 }));
 $('focusSearch').onclick=()=>{$('feed').scrollIntoView({behavior:'smooth',block:'start'});$('search').focus({preventScroll:true});};
 $('jumpLists').onclick=()=>$('checklists').scrollIntoView({behavior:'smooth',block:'start'});
 $('jumpCapture').onclick=()=>{$('captureForm').scrollIntoView({behavior:'smooth',block:'start'});$('body').focus({preventScroll:true});};
 document.addEventListener('keydown',event=>{
  if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.target.closest('input, textarea, select, [contenteditable="true"]')){
   event.preventDefault();$('search').focus();
  }
 });
 $('repeat').onchange=()=>{repeatUI();reflectKind();};
 $('kind').onchange=()=>{if($('kind').value!=='reminder'&&$('repeat').value!=='none')$('repeat').value='none';repeatUI();reflectKind();};
 $('captureForm').onsubmit=async event=>{
  event.preventDefault();const ticket=session.ticket();if(!current(ticket))return;
  const content=$('body').value.trim(),due=$('dueAt').value,repeat=$('repeat').value;
  const repeatDays=[...$('repeatDaysBox').querySelectorAll('input:checked')].map(input=>Number(input.value));
  if(!content)return;
  if(repeat!=='none'&&!due){error('captureError','Choose the first reminder date and time.');return;}
  if(repeat==='weekdays'&&!repeatDays.length){error('captureError','Select at least one day.');return;}
  const iso=due?isoFromLocal(due):null;
  if(due&&!iso){error('captureError','Choose a valid date and time.');return;}
  $('save').disabled=true;$('save').textContent='Saving…';error('captureError','');
  try{
   await addDoc(itemsRef(),{content,kind:$('kind').value,tags:tagsIn(content),dueAt:iso,
    done:false,starred:false,repeat,repeatDays:repeat==='weekdays'?repeatDays:[],createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
   if(!current(ticket))return;
   $('body').value='';$('dueAt').value='';$('repeat').value='none';$('kind').value='note';
   $('repeatDaysBox').querySelectorAll('input').forEach(input=>input.checked=false);repeatUI();reflectKind();$('captureOptions').open=false;$('body').focus();
  }catch(e){if(current(ticket))error('captureError',workspaceError(e,'Could not save thought.'));}
  finally{if(current(ticket)){$('save').disabled=false;$('save').textContent='Save thought';}}
 };
 $('body').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();$('captureForm').requestSubmit();}});
 document.querySelectorAll('.filter').forEach(button=>button.onclick=()=>{filter=button.dataset.filter;document.querySelectorAll('.filter').forEach(other=>other.classList.toggle('active',other===button));render();});
 $('search').oninput=render;
 $('clearFilters').onclick=()=>{filter='all';selectedTag=null;$('search').value='';document.querySelectorAll('.filter').forEach(b=>b.classList.toggle('active',b.dataset.filter==='all'));render();};
 function toggleTag(tag){selectedTag=selectedTag===tag?null:tag;if(selectedTag){filter='all';document.querySelectorAll('.filter').forEach(b=>b.classList.toggle('active',b.dataset.filter==='all'));}render();}
 $('tagFilters').onclick=e=>{const b=e.target.closest('button[data-tag]');if(b)toggleTag(b.dataset.tag);};
 $('items').addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b||!user||actionBusy)return;
  if(b.dataset.tag){toggleTag(b.dataset.tag);return;}
  const id=b.dataset.id,action=b.dataset.action;if(!id||!action)return;
  const item=records.find(record=>record.id===id);if(!item)return;
  if(action==='edit'){openEditor(item);return;}
  if(action==='delete'&&!confirm('Permanently delete this item?'))return;
  const ticket=session.ticket();if(!current(ticket))return;
  actionBusy=true;b.disabled=true;error('feedError','');
  try{
   if(action==='star')await updateDoc(entryRef(id),{starred:!item.starred,updatedAt:serverTimestamp()});
   else if(action==='done'){
    if(item.kind==='reminder'&&!item.done&&item.repeat&&item.repeat!=='none'){
     // A repeating reminder remains open and advances only when explicitly completed.
     await updateDoc(entryRef(id),{dueAt:nextOccurrence(item),done:false,updatedAt:serverTimestamp()});
    }else await updateDoc(entryRef(id),{done:!item.done,updatedAt:serverTimestamp()});
   }else if(action==='delete')await deleteDoc(entryRef(id));
  }catch(err){if(current(ticket))error('feedError',workspaceError(err,'Change failed.'));}
  finally{if(current(ticket)){actionBusy=false;b.disabled=false;}}
 });
 $('export').onclick=()=>{
  if(!current(session.ticket()))return;
  const serializeTimestamp=value=>value?.toDate?.()?.toISOString()??null;
  const output={version:3,exportedAt:new Date().toISOString(),entries:records.map(item=>({
   ...item,createdAt:serializeTimestamp(item.createdAt),updatedAt:serializeTimestamp(item.updatedAt)
  })),lists:lists.map(list=>({...list,createdAt:serializeTimestamp(list.createdAt),updatedAt:serializeTimestamp(list.updatedAt)}))};
  const blob=new Blob([JSON.stringify(output,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='thoughtforge-export-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 function openEditor(item){
  const ticket=session.ticket();if(editingId||!current(ticket))return;
  const card=[...$('items').children].find(element=>element.dataset.id===item.id);if(!card)return;
  editingId=item.id;
  const body=card.querySelector('.item-body'),controls=card.querySelector('.item-controls');
  const field=document.createElement('textarea');field.className='inline-editor';field.value=item.content||'';field.setAttribute('aria-label','Edit thought');
  const row=document.createElement('div');row.className='inline-edit-actions';
  const save=newButton('Save Changes','primary'),cancel=newButton('Cancel');
  const localError=document.createElement('p');localError.className='error';localError.hidden=true;
  const extra=document.createElement('div');extra.className='editor-reminder-settings';
  let dateInput=null,repeatSelect=null,weekdayBox=null;
  if(item.kind==='reminder'){
   const dateLabel=document.createElement('label');dateLabel.textContent='Remind me';
   dateInput=document.createElement('input');dateInput.type='datetime-local';dateInput.required=true;
   if(item.dueAt){const date=new Date(item.dueAt);if(Number.isFinite(date.getTime())){
    const localDate=new Date(date.getTime()-date.getTimezoneOffset()*60000);dateInput.value=localDate.toISOString().slice(0,16);
   }}dateLabel.append(dateInput);
   const repeatLabel=document.createElement('label');repeatLabel.textContent='Repeat';
   repeatSelect=document.createElement('select');
   for(const [value,label] of [['none','Does not repeat'],['daily','Daily'],['weekly','Weekly'],['monthly','Monthly'],['weekdays','Selected days']]){
    const option=document.createElement('option');option.value=value;option.textContent=label;repeatSelect.append(option);
   }repeatSelect.value=item.repeat||'none';repeatLabel.append(repeatSelect);
   weekdayBox=document.createElement('div');weekdayBox.className='editor-weekdays';
   ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach((name,index)=>{
    const label=document.createElement('label');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=String(index);
    checkbox.checked=(item.repeatDays||[]).includes(index);label.append(checkbox,document.createTextNode(' '+name));weekdayBox.append(label);
   });
   const updateDays=()=>weekdayBox.hidden=repeatSelect.value!=='weekdays';repeatSelect.onchange=updateDays;updateDays();
   extra.append(dateLabel,repeatLabel,weekdayBox);
  }
  row.append(save,cancel);body.hidden=true;controls.hidden=true;body.after(field,extra,row,localError);field.focus();
  const close=()=>{if(current(ticket)){editingId=null;render();}};cancel.onclick=close;
  save.onclick=async()=>{
   if(!current(ticket))return;
   const text=field.value.trim();if(!text){localError.hidden=false;localError.textContent='A thought cannot be empty.';return;}
   const change={content:text,tags:tagsIn(text),updatedAt:serverTimestamp()};
   if(item.kind==='reminder'){
    const date=dateInput.value?isoFromLocal(dateInput.value):null;
    const days=[...weekdayBox.querySelectorAll('input:checked')].map(checkbox=>Number(checkbox.value));
    if(!date){localError.hidden=false;localError.textContent='Choose a valid reminder date.';return;}
    if(repeatSelect.value==='weekdays'&&!days.length){localError.hidden=false;localError.textContent='Select at least one weekday.';return;}
    change.dueAt=date;change.repeat=repeatSelect.value;change.repeatDays=repeatSelect.value==='weekdays'?days:[];
   }
   save.disabled=true;cancel.disabled=true;localError.hidden=true;
   try{await updateDoc(entryRef(item.id),change);close();}
   catch(e){if(current(ticket)){localError.hidden=false;localError.textContent=workspaceError(e,'Could not save changes.');save.disabled=false;cancel.disabled=false;}}
  };
 }
 function render(){
  const queryText=$('search').value.trim().toLowerCase();
  const visible=records.filter(item=>{
   // Completed tasks live only in Completed; they are never deleted from Firestore.
   const isCompletedTask=item.kind==='task'&&item.done===true;
   const matchesFilter=filter==='completed'
    ? isCompletedTask
    : !isCompletedTask&&(filter==='all'
      ||(filter==='starred'&&item.starred===true)
      ||(filter==='open'&&item.kind==='task')
      ||item.kind===filter);
   const matchesTag=!selectedTag||(item.tags||[]).includes(selectedTag);
   const haystack=[item.content,item.kind,...(item.tags||[]),item.dueAt||'',repeatLabel(item)].join(' ').toLowerCase();
   return matchesFilter&&matchesTag&&(!queryText||haystack.includes(queryText));
  });
  visible.sort((a,b)=>Number(!!b.starred)-Number(!!a.starred));
  $('count').textContent=String(visible.length);$('empty').hidden=visible.length>0;
  const openTasks=records.filter(item=>item.kind==='task'&&!item.done).length;
  $('summary').textContent=`${records.length} saved · ${openTasks} open task${openTasks===1?'':'s'} · ${lists.length} checklist${lists.length===1?'':'s'} · Changes sync between devices.`;
  renderTags();
  const existingEditor=editingId?$('items').querySelector('.inline-editor'):null;
  const editingCard=existingEditor?.closest('.item')||null;
  const fragment=document.createDocumentFragment();
  for(const item of visible){
   if(item.id===editingId&&editingCard){fragment.append(editingCard);continue;}
   const card=document.createElement('article');card.className='item'+(item.done?' done-item':'');card.dataset.id=item.id;
   const meta=document.createElement('div');meta.className='item-meta';
   const kind=document.createElement('span');kind.textContent=({note:'THOUGHT',task:'TASK',reminder:'REMINDER'})[item.kind]||'NOTE';meta.append(kind);
   if(item.dueAt){const due=document.createElement('span');due.textContent='Due '+friendlyDate(item.dueAt);if(new Date(item.dueAt)<new Date()&&!item.done)due.className='overdue';meta.append(due);}
   if(repeatLabel(item)){const rep=document.createElement('span');rep.className='repeat-pill';rep.textContent='↻ '+repeatLabel(item);meta.append(rep);}
   for(const tag of item.tags||[]){const b=newButton(tag,'item-tag');b.dataset.tag=tag;meta.append(b);}
   const body=document.createElement('p');body.className='item-body'+(item.done?' done':'');
   const content=item.content||'',pattern=/#[\p{L}\p{N}_-]+/gu;let position=0;
   for(const match of content.matchAll(pattern)){
    body.append(document.createTextNode(content.slice(position,match.index)));
    const b=newButton(match[0],'item-tag inline-tag');b.dataset.tag=match[0].toLowerCase();b.setAttribute('aria-label',`Filter by ${match[0]}`);body.append(b);position=match.index+match[0].length;
   }
   body.append(document.createTextNode(content.slice(position)));
   const controls=document.createElement('div');controls.className='item-controls';
   const add=(action,label)=>{const b=newButton(label);b.dataset.action=action;b.dataset.id=item.id;controls.append(b);return b;};
   add('star',item.starred?'★ Starred':'☆ Star').setAttribute('aria-pressed',String(!!item.starred));
   if(item.kind!=='note')add('done',item.kind==='reminder'&&!item.done&&item.repeat&&item.repeat!=='none'?'✓ Complete & advance':item.done?'↶ Reopen':'✓ Complete');
   add('edit','Edit');add('delete','Delete');card.append(meta,body,controls);fragment.append(card);
  }
  $('items').replaceChildren(fragment);
 }
 function renderTags(){
  const totals=new Map();for(const item of records)for(const tag of item.tags||[])totals.set(tag,(totals.get(tag)||0)+1);
  const target=$('tagFilters');target.replaceChildren();
  if(!totals.size){const note=document.createElement('span');note.className='small muted';note.textContent='Add #tags to organize saved items.';target.append(note);return;}
  for(const [tag,total] of [...totals].sort((a,b)=>a[0].localeCompare(b[0]))){
   const b=newButton(`${tag} (${total})`,'tag-chip'+(tag===selectedTag?' active':''));b.dataset.tag=tag;b.setAttribute('aria-pressed',String(tag===selectedTag));target.append(b);
  }
 }

 // Named checklists are separate private Firestore documents, not hashtag-based task groupings.
 $('newListForm').onsubmit=async e=>{
  e.preventDefault();const ticket=session.ticket();if(!current(ticket))return;
  const title=$('newListTitle').value.trim();if(!title)return;
  $('createList').disabled=true;error('listError','');
  try{await addDoc(listsRef(),{title,items:[],createdAt:serverTimestamp(),updatedAt:serverTimestamp()});if(current(ticket))$('newListTitle').value='';}
  catch(err){if(current(ticket))error('listError',workspaceError(err,'Could not create list.'));}
  finally{if(current(ticket))$('createList').disabled=false;}
 };
 $('lists').addEventListener('submit',async e=>{
  if(!e.target.matches('.list-add'))return;
  e.preventDefault();const form=e.target,id=form.closest('.list-card')?.dataset.id;
  const input=form.querySelector('input'),text=input?.value.trim();const ticket=session.ticket();if(!id||!text||!current(ticket))return;
  const ref=listRef(id),newItemId=doc(listsRef()).id;
  const button=form.querySelector('button');button.disabled=true;error('listError','');
  try{
   await runTransaction(db,async transaction=>{
    if(!current(ticket))throw Error('Session changed.');
    const snapshot=await transaction.get(ref);if(!current(ticket)||!snapshot.exists())throw Error('List unavailable.');
    const data=snapshot.data(),items=data.items||[];if(items.length>=100)throw Error('A list can contain at most 100 items.');
    transaction.update(ref,{items:[...items,{id:newItemId,text,done:false}],updatedAt:serverTimestamp()});
   });if(current(ticket))input.value='';
  }catch(err){if(current(ticket))error('listError',workspaceError(err,'Could not add list item. A list can contain at most 100 items.'));}
  finally{if(current(ticket))button.disabled=false;}
 });
 $('lists').addEventListener('click',async e=>{
  const b=e.target.closest('button[data-action]');if(!b||!user)return;
  const card=b.closest('.list-card'),id=card?.dataset.id,action=b.dataset.action;
  const ticket=session.ticket();if(!id||!current(ticket))return;
  if(action==='rename'){
   if(editingListId)return;editingListId=id;
   const header=card.querySelector('.list-header'),form=document.createElement('form');form.className='list-rename';
   const input=document.createElement('input');input.value=lists.find(l=>l.id===id)?.title||'';input.maxLength=120;input.required=true;
   const save=document.createElement('button');save.type='submit';save.className='primary';save.textContent='Save';
   const cancel=newButton('Cancel');form.append(input,save,cancel);header.after(form);input.focus();
   cancel.onclick=()=>{if(current(ticket)){editingListId=null;form.remove();}};
   form.onsubmit=async event=>{event.preventDefault();if(!current(ticket))return;const title=input.value.trim();if(!title)return;
    save.disabled=true;try{await updateDoc(listRef(id),{title,updatedAt:serverTimestamp()});if(current(ticket)){editingListId=null;form.remove();}}
    catch(err){if(current(ticket)){error('listError',workspaceError(err,'Could not rename list.'));save.disabled=false;}}
   };return;
  }
  if(action==='delete-list'&&!confirm('Permanently delete this checklist and all its items?'))return;
  if(action==='delete-item'&&!confirm('Remove this checklist item?'))return;
  b.disabled=true;error('listError','');
  try{
   if(action==='delete-list'){await deleteDoc(listRef(id));return;}
   const itemId=b.dataset.item,ref=listRef(id);
   await runTransaction(db,async transaction=>{
    if(!current(ticket))throw Error('Session changed.');
    const snapshot=await transaction.get(ref);if(!current(ticket)||!snapshot.exists())throw Error('Checklist unavailable.');
    const data=snapshot.data();let items=data.items||[];
    if(action==='delete-item')items=items.filter(item=>item.id!==itemId);
    else if(action==='toggle-item')items=items.map(item=>item.id===itemId?{...item,done:!item.done}:item);
    transaction.update(ref,{items,updatedAt:serverTimestamp()});
   });
  }catch(err){if(current(ticket))error('listError',workspaceError(err,'Could not update checklist.'));}
  finally{if(current(ticket))b.disabled=false;}
 });
 function renderLists(){
  const target=$('lists');target.replaceChildren();$('listsEmpty').hidden=lists.length>0;
  for(const list of lists){
   const card=document.createElement('article');card.className='list-card';card.dataset.id=list.id;
   const header=document.createElement('div');header.className='list-header';
   const info=document.createElement('div'),title=document.createElement('h3');title.textContent=list.title;info.append(title);
   const count=document.createElement('p');count.className='small muted';const items=list.items||[];
   count.textContent=`${items.filter(item=>item.done).length} of ${items.length} complete`;info.append(count);
   const actions=document.createElement('div');actions.className='list-actions';
   const rename=newButton('Rename');rename.dataset.action='rename';
   const del=newButton('Delete');del.dataset.action='delete-list';actions.append(rename,del);header.append(info,actions);card.append(header);
   const ul=document.createElement('ul');ul.className='list-items';
   for(const item of items){
    const li=document.createElement('li');
    const toggle=newButton(item.done?'☑':'☐','list-toggle');toggle.dataset.action='toggle-item';toggle.dataset.item=item.id;toggle.setAttribute('aria-pressed',String(!!item.done));
    toggle.setAttribute('aria-label',`Mark ${item.text} ${item.done?'incomplete':'complete'}`);
    const text=document.createElement('span');text.className='list-text'+(item.done?' checked':'');text.textContent=item.text;
    const remove=newButton('Remove');remove.dataset.action='delete-item';remove.dataset.item=item.id;
    li.append(toggle,text,remove);ul.append(li);
   }
   card.append(ul);
   const add=document.createElement('form');add.className='list-add';
   const input=document.createElement('input');input.required=true;input.maxLength=300;input.placeholder='Add an item';input.setAttribute('aria-label',`Add item to ${list.title}`);
   const button=document.createElement('button');button.type='submit';button.className='primary';button.textContent='Add item';add.append(input,button);card.append(add);target.append(card);
  }
 }
}
