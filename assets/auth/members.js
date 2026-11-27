// Private member presentation. Account identity is not an authorization grant.
const $=id=>document.getElementById(id);
const panels=['loading','unavailable','memberContent'];
const show=id=>panels.forEach(name=>{$(name).hidden=name!==id;});
let api=null,ready=false,busy=false,active=false,generation=0,currentAccount=null,departing=false,lastRefresh=0;
const REFRESH_MS=60000;
const dataSlots=['profileData','membershipData','familyData'];
function clearData(){generation++;for(const id of dataSlots){const el=$(id);if(el)el.replaceChildren();}}
function displayRows(id,rows){const el=$(id);if(!el)return;el.replaceChildren(...rows.map(value=>{const p=document.createElement('p');p.textContent=value;return p;}));}
async function loadData(account){
 const ticket=++generation;lastRefresh=Date.now();
 const current=()=>ticket===generation&&active&&ready;
 const slots=dataSlots.filter(id=>$(id));
 if(!slots.length)return;
 for(const id of slots)displayRows(id,['Loading…']);
 try{
  const data=await import('./member-data.js');
  if(!current())return;
  const jobs={profileData:()=>data.profile(account.uid),membershipData:()=>data.membership(account.uid),familyData:()=>data.families(account.uid,window.location.pathname==='/members/family/')};
  await Promise.all(slots.map(async id=>{
   try{const rows=await jobs[id]();if(current())displayRows(id,rows);}
   catch{if(current())displayRows(id,['Information unavailable. Please reload to try again.']);}
  }));
 }catch{if(current())for(const id of slots)displayRows(id,['Information unavailable. Please reload to try again.']);}
}
function clearIdentity(){
 currentAccount=null;clearData();
 for(const id of ['accountEmail','accountName','verification']){const node=$(id);if(node)node.textContent='';}
 if($('nameRow'))$('nameRow').hidden=true;
 $('signOutError').textContent='';$('signOutError').hidden=true;$('signOut').hidden=true;active=false;
}
function unavailable(){
 ready=false;clearIdentity();show('unavailable');
}
function handleAccount(account){
 if(departing)return;
 clearIdentity();
 if(!account){ready=false;show('loading');window.location.replace('/signin/');return;}
 ready=true;active=true;currentAccount=account;
 if($('accountEmail'))$('accountEmail').textContent=account.email||'Not available';
 if(account.displayName&&$('accountName')){$('accountName').textContent=account.displayName;$('nameRow').hidden=false;}
 if($('verification'))$('verification').textContent=account.emailVerified?'Verified':'Not verified';
 $('signOut').hidden=false;$('signOut').disabled=busy;show('memberContent');loadData(account);
}
$('signOut').addEventListener('click',async()=>{
 if(!api||!ready||!active||busy)return;
 busy=true;$('signOut').disabled=true;$('signOut').textContent='Signing out…';
 $('signOutError').hidden=true;$('signOutError').textContent='';
 try{await api.signOutOfUA();ready=false;clearIdentity();show('loading');window.location.replace('/signin/');}
 catch(e){if(active){$('signOutError').textContent=api.accountErrorMessage(e);$('signOutError').hidden=false;}}
 finally{busy=false;$('signOut').textContent='Sign Out';$('signOut').disabled=false;}
});
// A restored history entry must not reveal a stale account snapshot.
window.addEventListener('pagehide',()=>{departing=true;ready=false;clearIdentity();show('loading');});
function refreshVisible(){if(!departing&&ready&&active&&!busy&&currentAccount&&document.visibilityState==='visible'&&Date.now()-lastRefresh>=REFRESH_MS)loadData(currentAccount);}
window.addEventListener('focus',refreshVisible);
document.addEventListener('visibilitychange',refreshVisible);
setInterval(refreshVisible,REFRESH_MS);
window.addEventListener('pageshow',event=>{if(event.persisted)window.location.reload();});
async function start(){
 try{api=await import('./ua-auth.js');api.observeAccount(handleAccount,unavailable);}
 catch{unavailable();}
}
start();
