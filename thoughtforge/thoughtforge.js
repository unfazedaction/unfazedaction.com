import {firebaseConfig} from './firebase-config.js';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,signInWithEmailAndPassword,signOut,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,collection,query,orderBy,onSnapshot,addDoc,updateDoc,deleteDoc,doc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

// ThoughtForge Batch 2. Keep Firestore document fields and paths compatible with Batch 1.
const $ = id => document.getElementById(id);
const tagsIn = value => [...new Set((value.match(/#[\p{L}\p{N}_-]+/gu)||[]).map(tag=>tag.toLowerCase()))].slice(0,50);
const show = id => {for(const panel of document.querySelectorAll('.state'))panel.hidden=true;$('app').hidden=id!=='app';if(id!=='app')$(id).hidden=false;};
const configured=Object.values(firebaseConfig).every(value=>typeof value==='string'&&!value.includes('REPLACE_ME'));
if(!configured)show('setup');else start();

function start(){
 const firebase=initializeApp(firebaseConfig),auth=getAuth(firebase),db=getFirestore(firebase);
 let stopListening=null,user=null,records=[],filter='all',selectedTag=null,editingId=null,actionBusy=false;
 const error=(id,message)=>{$(id).hidden=!message;if(message)$(id).textContent=message;};
 const itemsRef=()=>collection(db,'thoughtforgeUsers',user.uid,'items');
 const entryRef=id=>doc(db,'thoughtforgeUsers',user.uid,'items',id);
 const friendlyDate=iso=>{const date=new Date(iso);return Number.isNaN(date.getTime())?'Invalid date':date.toLocaleString();};

 $('signInForm').onsubmit=async event=>{
  event.preventDefault();$('signIn').disabled=true;error('signInError','');
  try{await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value);$('password').value='';}
  catch(e){error('signInError',e.code==='auth/invalid-credential'?'Email or password not recognized.':`Sign-in failed (${e.code||'unknown error'}).`);}
  finally{$('signIn').disabled=false;}
 };
 $('signOut').onclick=()=>signOut(auth).catch(e=>error('feedError','Sign-out failed: '+e.message));
 onAuthStateChanged(auth,next=>{
  if(stopListening){stopListening();stopListening=null;}
  user=next;records=[];selectedTag=null;filter='all';editingId=null;
  $('search').value='';document.querySelectorAll('.filter').forEach(button=>button.classList.toggle('active',button.dataset.filter==='all'));
  $('items').replaceChildren();$('count').textContent='0';$('signOut').hidden=!user;
  if(!user){show('signedOut');return;}
  show('app');$('syncStatus').textContent='Connecting…';error('feedError','');
  stopListening=onSnapshot(query(itemsRef(),orderBy('createdAt','desc')),snapshot=>{
   records=snapshot.docs.map(entry=>({id:entry.id,...entry.data()}));
   $('syncStatus').textContent=snapshot.metadata.fromCache?'Offline / cached':'Synced';error('feedError','');
   // Preserve an active inline editor while a snapshot arrives from another device.
   if(editingId && !records.some(item=>item.id===editingId))editingId=null;
   render();
  },e=>{$('syncStatus').textContent='Sync unavailable';error('feedError','Unable to load your data: '+e.message);});
 });
 $('captureForm').onsubmit=async event=>{
  event.preventDefault();if(!user)return;
  const content=$('body').value.trim();if(!content)return;
  const due=$('dueAt').value;
  $('save').disabled=true;$('save').textContent='Saving…';error('captureError','');
  try{
   await addDoc(itemsRef(),{content,kind:$('kind').value,tags:tagsIn(content),dueAt:due?new Date(due).toISOString():null,
     done:false,starred:false,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
   $('body').value='';$('dueAt').value='';$('kind').value='note';$('body').focus();
  }catch(e){error('captureError','Could not save: '+e.message);}
  finally{$('save').disabled=false;$('save').textContent='Save thought';}
 };
 $('body').addEventListener('keydown',event=>{
  if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){
   event.preventDefault();$('captureForm').requestSubmit();
  }
 });
 document.querySelectorAll('.filter').forEach(button=>button.onclick=()=>{
  filter=button.dataset.filter;document.querySelectorAll('.filter').forEach(other=>other.classList.toggle('active',other===button));render();
 });
 $('search').oninput=render;
 $('clearFilters').onclick=()=>{
  filter='all';selectedTag=null;$('search').value='';
  document.querySelectorAll('.filter').forEach(button=>button.classList.toggle('active',button.dataset.filter==='all'));render();
 };
 $('tagFilters').onclick=event=>{
  const button=event.target.closest('button[data-tag]');if(!button)return;
  selectedTag=selectedTag===button.dataset.tag?null:button.dataset.tag;render();
 };
 $('items').addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button||!user||actionBusy)return;
  if(button.dataset.tag){selectedTag=selectedTag===button.dataset.tag?null:button.dataset.tag;render();return;}
  const id=button.dataset.id,action=button.dataset.action;
  if(!id||!action)return;
  const record=records.find(item=>item.id===id);if(!record)return;
  if(action==='edit'){openEditor(record);return;}
  if(action==='delete'&&!confirm('Permanently delete this item?'))return;
  actionBusy=true;button.disabled=true;error('feedError','');
  try{
   if(action==='star')await updateDoc(entryRef(id),{starred:!record.starred,updatedAt:serverTimestamp()});
   else if(action==='done')await updateDoc(entryRef(id),{done:!record.done,updatedAt:serverTimestamp()});
   else if(action==='delete')await deleteDoc(entryRef(id));
  }catch(e){error('feedError','Change failed: '+e.message);}
  finally{actionBusy=false;button.disabled=false;}
 });
 $('export').onclick=()=>{
  const output=records.map(({id,content,kind,tags,dueAt,done,starred,createdAt,updatedAt})=>({id,content,kind,tags,dueAt,done,starred,
   createdAt:createdAt?.toDate?.()?.toISOString()??null,updatedAt:updatedAt?.toDate?.()?.toISOString()??null}));
  const blob=new Blob([JSON.stringify(output,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='thoughtforge-export-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };

 function openEditor(record){
  if(editingId)return;
  const card=[...$('items').children].find(element=>element.dataset.id===record.id);if(!card)return;
  editingId=record.id;
  const body=card.querySelector('.item-body'),controls=card.querySelector('.item-controls');
  const field=document.createElement('textarea');field.className='inline-editor';field.value=record.content||'';field.setAttribute('aria-label','Edit thought');
  const row=document.createElement('div');row.className='inline-edit-actions';
  const save=document.createElement('button');save.className='primary';save.type='button';save.textContent='Save Changes';
  const cancel=document.createElement('button');cancel.className='small-button';cancel.type='button';cancel.textContent='Cancel';
  const localError=document.createElement('p');localError.className='error';localError.hidden=true;
  row.append(save,cancel);body.hidden=true;controls.hidden=true;body.after(field,row,localError);field.focus();field.setSelectionRange(field.value.length,field.value.length);
  const close=()=>{editingId=null;render();};cancel.onclick=close;
  save.onclick=async()=>{
   const text=field.value.trim();if(!text){localError.hidden=false;localError.textContent='A thought cannot be empty.';return;}
   save.disabled=true;cancel.disabled=true;localError.hidden=true;
   try{await updateDoc(entryRef(record.id),{content:text,tags:tagsIn(text),updatedAt:serverTimestamp()});close();}
   catch(e){localError.hidden=false;localError.textContent='Could not save: '+e.message;save.disabled=false;cancel.disabled=false;}
  };
 }

 function render(){
  const queryText=$('search').value.trim().toLowerCase();
  const visible=records.filter(item=>{
   const matchesFilter=filter==='all'||(filter==='starred'&&item.starred)||(filter==='open'&&item.kind==='task'&&!item.done)
    ||(filter==='completed'&&item.kind==='task'&&item.done)||item.kind===filter;
   const matchesTag=!selectedTag||(item.tags||[]).includes(selectedTag);
   const haystack=[item.content,item.kind,...(item.tags||[]),item.dueAt||''].join(' ').toLowerCase();
   return matchesFilter&&matchesTag&&(!queryText||haystack.includes(queryText));
  });
  visible.sort((a,b)=>Number(!!b.starred)-Number(!!a.starred));
  $('count').textContent=String(visible.length);$('empty').hidden=visible.length>0;
  const openTasks=records.filter(item=>item.kind==='task'&&!item.done).length;
  $('summary').textContent=`${records.length} saved · ${openTasks} open task${openTasks===1?'':'s'} · Changes sync between devices.`;
  renderTags();
  const existingEditor=editingId?$('items').querySelector('.inline-editor'):null;
  const editingCard=existingEditor?.closest('.item')||null;
  const fragment=document.createDocumentFragment();
  for(const item of visible){
   if(item.id===editingId&&editingCard){fragment.append(editingCard);continue;}
   const card=document.createElement('article');card.className='item'+(item.done?' done-item':'');card.dataset.id=item.id;
   const meta=document.createElement('div');meta.className='item-meta';
   const kind=document.createElement('span');kind.textContent=({note:'THOUGHT',task:'TASK',reminder:'REMINDER'})[item.kind]||'NOTE';meta.append(kind);
   if(item.dueAt){const due=document.createElement('span');due.textContent='Due '+friendlyDate(item.dueAt);meta.append(due);}
   for(const tag of (item.tags||[])){
    const tagButton=document.createElement('button');tagButton.type='button';tagButton.className='item-tag';tagButton.dataset.tag=tag;tagButton.textContent=tag;meta.append(tagButton);
   }
   const body=document.createElement('p');body.className='item-body'+(item.done?' done':'');body.textContent=item.content||'';
   const controls=document.createElement('div');controls.className='item-controls';
   const add=(action,label)=>{const button=document.createElement('button');button.type='button';button.className='small-button';button.dataset.action=action;button.dataset.id=item.id;button.textContent=label;controls.append(button);return button;};
   add('star',item.starred?'★ Starred':'☆ Star').setAttribute('aria-pressed',String(!!item.starred));
   if(item.kind!=='note')add('done',item.done?'↶ Reopen':'✓ Complete');
   add('edit','Edit');add('delete','Delete');
   card.append(meta,body,controls);fragment.append(card);
  }
  $('items').replaceChildren(fragment);
 }
 function renderTags(){
  const totals=new Map();for(const item of records)for(const tag of item.tags||[])totals.set(tag,(totals.get(tag)||0)+1);
  const target=$('tagFilters');target.replaceChildren();
  if(!totals.size){const note=document.createElement('span');note.className='small muted';note.textContent='Add #tags to organize saved items.';target.append(note);return;}
  for(const [tag,total] of [...totals].sort((a,b)=>a[0].localeCompare(b[0]))){
   const button=document.createElement('button');button.type='button';button.className='tag-chip'+(tag===selectedTag?' active':'');
   button.dataset.tag=tag;button.setAttribute('aria-pressed',String(tag===selectedTag));button.textContent=`${tag} (${total})`;target.append(button);
  }
 }
}
