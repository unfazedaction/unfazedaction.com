// A session ticket is invalid after any account transition, even back to the same UID.
export function createSessionGuard(){
 let generation=0,uid=null;
 return Object.freeze({
  start(value){generation++;uid=value;return this.ticket();},
  clear(){generation++;uid=null;},
  ticket(){return uid?Object.freeze({uid,generation}):null;},
  current(ticket){return !!ticket&&uid===ticket.uid&&generation===ticket.generation;}
 });
}
export function workspaceError(error,fallback='Unable to complete this action. Please try again.'){
 switch(error?.code){
  case 'permission-denied':return 'Access is unavailable. Check your account and try again.';
  case 'unavailable':case 'deadline-exceeded':return 'Connection unavailable. Please try again.';
  case 'unauthenticated':return 'Your session is unavailable. Please sign in again.';
  default:return fallback;
 }
}
