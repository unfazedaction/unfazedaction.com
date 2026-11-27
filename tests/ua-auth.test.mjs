import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAccountClient,accountErrorMessage} from '../assets/auth/auth-client.js';

const user={uid:'test-uid',email:'test@example.invalid',displayName:null,emailVerified:false};
function fixture(overrides={}){
  const calls=[];let observer;
  const adapter={
    observe:(fn)=>{observer=fn;return ()=>{observer=null;};},
    persist:async value=>{calls.push(['persist',value]);},
    login:async (email,password)=>{calls.push(['login',email,password]);return {user};},
    logout:async()=>{calls.push(['logout']);},
    ...overrides
  };
  return {client:createAccountClient(adapter),calls,emit:value=>observer?.(value)};
}
test('default session persistence is requested before login; password is not trimmed',async()=>{
  const {client,calls}=fixture();
  const account=await client.signInToUA(' test@example.invalid ',' password ');
  assert.deepEqual(calls,[['persist',false],['login','test@example.invalid',' password ']]);
  assert.equal(account.uid,user.uid);assert.ok(Object.isFrozen(account));
});
test('remember option requests local persistence',async()=>{
  const {client,calls}=fixture();await client.signInToUA('a@b.invalid','x',{remember:true});
  assert.deepEqual(calls[0],['persist',true]);
});
test('persistence failure prevents credential submission',async()=>{
  const {client,calls}=fixture({persist:async()=>{throw Error('blocked');}});
  await assert.rejects(client.signInToUA('a@b.invalid','x'));assert.equal(calls.length,0);
});
test('observer exposes only non-anonymous account identity and can unsubscribe',()=>{
  const {client,emit}=fixture();const seen=[];const stop=client.observeAccount(a=>seen.push(a));
  emit(null);emit({...user,isAnonymous:true});emit({...user,secret:'not exposed'});stop();emit(user);
  assert.deepEqual(seen,[null,null,user]);
});
test('sign out delegates to Firebase adapter',async()=>{
  const {client,calls}=fixture();await client.signOutOfUA();assert.deepEqual(calls,[['logout']]);
});
test('concurrent account actions are rejected and lock resets',async()=>{
  let release;const {client}=fixture({persist:()=>new Promise(resolve=>{release=resolve;})});
  const first=client.signInToUA('a@b.invalid','x');await assert.rejects(client.signOutOfUA());release();await first;await client.signOutOfUA();
});
test('invalid credentials and unknown errors never expose raw error text',()=>{
  assert.equal(accountErrorMessage({code:'auth/user-not-found'}),accountErrorMessage({code:'auth/wrong-password'}));
  assert.equal(accountErrorMessage({message:'private detail'}),'Unable to complete your account request. Please try again.');
});
test('blank credentials do not reach adapter',async()=>{
  const {client,calls}=fixture();await assert.rejects(client.signInToUA(' ','x'));assert.equal(calls.length,0);
});
