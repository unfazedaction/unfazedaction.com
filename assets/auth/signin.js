// Dedicated sign-in UI. No credential persistence outside Firebase Auth.
const $=id=>document.getElementById(id);
const panels=['loading','unavailable','signedOut','signedIn'];
const show=id=>panels.forEach(name=>{$(name).hidden=name!==id;});
const error=(id,message='')=>{const node=$(id);node.textContent=message;node.hidden=!message;};
const clearPassword=()=>{$('password').value='';$('password').type='password';$('togglePassword').textContent='Show';$('togglePassword').setAttribute('aria-pressed','false');};
let api=null,busy=false,ready=false;
function setBusy(value){busy=value;$('submit').disabled=value||!ready;$('email').disabled=value;$('password').disabled=value;$('remember').disabled=value;$('togglePassword').disabled=value;}
function startupFailed(){ready=false;setBusy(false);clearPassword();show('unavailable');}
$('togglePassword').addEventListener('click',()=>{const visible=$('password').type==='password';$('password').type=visible?'text':'password';$('togglePassword').textContent=visible?'Hide':'Show';$('togglePassword').setAttribute('aria-pressed',String(visible));});
$('signInForm').addEventListener('submit',async event=>{
 event.preventDefault();
 if(!ready||busy||!api)return;
 if(!$('signInForm').reportValidity())return;
 setBusy(true);error('signInError');$('submit').textContent='Signing in…';
 try{await api.signInToUA($('email').value,$('password').value,{remember:$('remember').checked});}
 catch(e){error('signInError',api.accountErrorMessage(e));}
 finally{clearPassword();$('submit').textContent='Sign In';setBusy(false);}
});
async function start(){
 try{
  api=await import('./ua-auth.js');
  api.observeAccount(account=>{
   ready=true;clearPassword();error('signInError');
   if(account){$('email').value='';$('remember').checked=false;show('signedIn');window.location.replace(new URLSearchParams(window.location.search).get('continue')==='secondbrain'?'/secondbrain/':'/members/');return;}
   else{show('signedOut');}
   setBusy(busy);
  },startupFailed);
 }catch{startupFailed();}
}
start();
