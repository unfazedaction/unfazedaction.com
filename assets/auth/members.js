// Private member presentation. Account identity is not an authorization grant.
const $=id=>document.getElementById(id);
const panels=['loading','unavailable','memberContent'];
const show=id=>panels.forEach(name=>{$(name).hidden=name!==id;});
let api=null,ready=false,busy=false,active=false;
function clearIdentity(){
 for(const id of ['accountEmail','accountName','verification']){const node=$(id);if(node)node.textContent='';}
 if($('nameRow'))$('nameRow').hidden=true;
 $('signOutError').textContent='';$('signOutError').hidden=true;$('signOut').hidden=true;active=false;
}
function unavailable(){
 ready=false;clearIdentity();show('unavailable');
}
function handleAccount(account){
 clearIdentity();
 if(!account){ready=false;show('loading');window.location.replace('/signin/');return;}
 ready=true;active=true;
 if($('accountEmail'))$('accountEmail').textContent=account.email||'Not available';
 if(account.displayName&&$('accountName')){$('accountName').textContent=account.displayName;$('nameRow').hidden=false;}
 if($('verification'))$('verification').textContent=account.emailVerified?'Verified':'Not verified';
 $('signOut').hidden=false;$('signOut').disabled=busy;show('memberContent');
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
window.addEventListener('pagehide',()=>{ready=false;clearIdentity();show('loading');});
window.addEventListener('pageshow',event=>{if(event.persisted)window.location.reload();});
async function start(){
 try{api=await import('./ua-auth.js');api.observeAccount(handleAccount,unavailable);}
 catch{unavailable();}
}
start();
