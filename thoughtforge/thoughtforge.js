import {firebaseConfig} from './firebase-config.js';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,signInWithEmailAndPassword,signOut,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,collection,query,orderBy,onSnapshot,addDoc,updateDoc,deleteDoc,doc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
const $ = id=>document.getElementById(id);
const show = id=>{for (const x of document.querySelectorAll('.state')) x.hidden=true; $('app').hidden=id!=='app'; if(id!=='app') $(id).hidden=false;};
const ready = Object.values(firebaseConfig).every(v=>typeof v==='string'&&!v.includes('REPLACE_ME'));
if(!ready){show('setup');} else {start();}
function start(){
 const firebase=initializeApp(firebaseConfig), auth=getAuth(firebase), db=getFirestore(firebase);
 let unsubscribe=null, currentUser=null, records=[], filter='all';
 $('signInForm').onsubmit=async e=>{
  e.preventDefault();
  const email=$('email').value.trim(), password=$('password').value;
  $('signIn').disabled=true; $('signInError').hidden=true;
  try { await signInWithEmailAndPassword(auth,email,password); $('password').value=''; }
  catch(err){ $('signInError').hidden=false; $('signInError').textContent='Sign-in failed. Check your email and password.'; }
  finally { $('signIn').disabled=false; }
 };
 $('signOut').onclick=async()=>{await signOut(auth);};
 onAuthStateChanged(auth,user=>{
  if(unsubscribe){unsubscribe();unsubscribe=null;} currentUser=user; records=[]; $('items').replaceChildren(); $('count').textContent='0'; $('signOut').hidden=!user;
  if(!user){show('signedOut');return;} show('app');$('syncStatus').textContent='Connecting…';
  const ref=collection(db,'thoughtforgeUsers',user.uid,'items');
  unsubscribe=onSnapshot(query(ref,orderBy('createdAt','desc')),snap=>{
   records=snap.docs.map(d=>({id:d.id,...d.data()}));$('syncStatus').textContent=snap.metadata.fromCache?'Offline / cached':'Synced';$('feedError').hidden=true;render();
  },err=>{$('syncStatus').textContent='Sync unavailable';$('feedError').hidden=false;$('feedError').textContent='Unable to load your data: '+err.message;});
 });
 $('captureForm').onsubmit=async e=>{
  e.preventDefault();if(!currentUser)return;const content=$('body').value.trim();if(!content)return;
  $('save').disabled=true;$('captureError').hidden=true;
  try{await addDoc(collection(db,'thoughtforgeUsers',currentUser.uid,'items'),{
   content,kind:$('kind').value, tags:[...new Set((content.match(/#[\p{L}\p{N}_-]+/gu)||[]).map(t=>t.toLowerCase()))],
   dueAt:$('dueAt').value?new Date($('dueAt').value).toISOString():null,done:false,starred:false,createdAt:serverTimestamp(),updatedAt:serverTimestamp()
  });$('body').value='';$('dueAt').value='';$('kind').value='note';}
  catch(err){$('captureError').hidden=false;$('captureError').textContent='Could not save: '+err.message;}
  finally{$('save').disabled=false;}
 };
 document.querySelectorAll('.filter').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('.filter').forEach(x=>x.classList.toggle('active',x===b));render();});
 $('search').oninput=render;
 $('items').addEventListener('click',async e=>{
  const btn=e.target.closest('button[data-action]');if(!btn||!currentUser)return;
  const record=records.find(r=>r.id===btn.dataset.id);if(!record)return;
  const action=btn.dataset.action,ref=doc(db,'thoughtforgeUsers',currentUser.uid,'items',record.id);
  try{
   if(action==='delete'){if(!confirm('Delete this item permanently?'))return;await deleteDoc(ref);}
   if(action==='star'){await updateDoc(ref,{starred:!record.starred,updatedAt:serverTimestamp()});}
   if(action==='done'){await updateDoc(ref,{done:!record.done,updatedAt:serverTimestamp()});}
   if(action==='edit'){
    const card=btn.closest('.item');
    if(!card||card.querySelector('.inline-editor'))return;
    const body=card.querySelector('.item-body');
    const controls=card.querySelector('.item-controls');
    const editor=document.createElement('textarea');
    editor.className='inline-editor';
    editor.value=record.content||'';
    editor.setAttribute('aria-label','Edit thought');
    const actions=document.createElement('div');
    actions.className='inline-edit-actions';
    const saveButton=document.createElement('button');
    saveButton.type='button';saveButton.className='primary';saveButton.textContent='Save Changes';
    const cancelButton=document.createElement('button');
    cancelButton.type='button';cancelButton.className='small-button';cancelButton.textContent='Cancel';
    const error=document.createElement('p');error.className='error';error.hidden=true;
    actions.append(saveButton,cancelButton);
    body.hidden=true;controls.hidden=true;
    body.after(editor,actions,error);
    const close=()=>{editor.remove();actions.remove();error.remove();body.hidden=false;controls.hidden=false;};
    cancelButton.onclick=close;
    saveButton.onclick=async()=>{
     const text=editor.value.trim();
     if(!text){error.hidden=false;error.textContent='A thought cannot be empty.';editor.focus();return;}
     saveButton.disabled=true;cancelButton.disabled=true;error.hidden=true;
     try{
      await updateDoc(ref,{content:text,tags:[...new Set((text.match(/#[\p{L}\p{N}_-]+/gu)||[]).map(t=>t.toLowerCase()))],updatedAt:serverTimestamp()});
      close();
     }catch(err){error.hidden=false;error.textContent='Could not save changes: '+err.message;saveButton.disabled=false;cancelButton.disabled=false;}
    };
    editor.focus();editor.setSelectionRange(editor.value.length,editor.value.length);
   }
  }catch(err){$('feedError').hidden=false;$('feedError').textContent='Change failed: '+err.message;}
 });
 $('export').onclick=()=>{
  const output=records.map(({id,content,kind,tags,dueAt,done,starred,createdAt,updatedAt})=>({id,content,kind,tags,dueAt,done,starred,createdAt:createdAt?.toDate?.()?.toISOString()??null,updatedAt:updatedAt?.toDate?.()?.toISOString()??null}));
  const blob=new Blob([JSON.stringify(output,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='thoughtforge-export-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(url);
 };
 function render(){
  const q=$('search').value.trim().toLowerCase();const visible=records.filter(r=>(filter==='all'||(filter==='starred'?r.starred:r.kind===filter))&&(!q||((r.content||'')+' '+(r.tags||[]).join(' ')).toLowerCase().includes(q)));
  $('count').textContent=visible.length;$('items').replaceChildren();$('empty').hidden=visible.length>0;
  for(const r of visible){const article=document.createElement('article');article.className='item';
   const meta=document.createElement('div');meta.className='item-meta';const label=document.createElement('span');label.textContent=(r.kind||'note').toUpperCase();meta.append(label);
   if(r.dueAt){const due=document.createElement('span');const d=new Date(r.dueAt);due.textContent='Due '+(Number.isNaN(d.getTime())?'(invalid date)':d.toLocaleString());meta.append(due);}
   const body=document.createElement('p');body.className=r.done?'item-body done':'item-body';body.textContent=r.content;
   const controls=document.createElement('div');controls.className='item-controls';
   const action=(id,text)=>{const b=document.createElement('button');b.type='button';b.className='small-button';b.dataset.action=id;b.dataset.id=r.id;b.textContent=text;controls.append(b);};
   action('star',r.starred?'★ Starred':'☆ Star');if(r.kind!=='note')action('done',r.done?'↶ Reopen':'✓ Complete');action('edit','Edit');action('delete','Delete');
   article.append(meta,body,controls);$('items').append(article);
  }
 }
}
