// Shared UA website authentication. No Firestore access or entitlement decisions.
import {firebaseConfig} from '/secondbrain/firebase-config.js';
import {initializeApp,getApps} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,signInWithEmailAndPassword,signOut,onAuthStateChanged,setPersistence,browserLocalPersistence,browserSessionPersistence} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {createAccountClient} from './auth-client.js';

const existing=getApps().find(app=>app.name==='[DEFAULT]');
if(existing && (existing.options.projectId!==firebaseConfig.projectId || existing.options.appId!==firebaseConfig.appId || existing.options.apiKey!==firebaseConfig.apiKey)){
  throw new Error('UA authentication configuration mismatch.');
}
const app=existing || initializeApp(firebaseConfig);
const auth=getAuth(app);
const client=createAccountClient({
  observe:(next,error)=>onAuthStateChanged(auth,next,error),
  persist:remember=>setPersistence(auth,remember?browserLocalPersistence:browserSessionPersistence),
  login:(email,password)=>signInWithEmailAndPassword(auth,email,password),
  logout:()=>signOut(auth)
});
export const observeAccount=client.observeAccount;
export const signInToUA=client.signInToUA;
export const signOutOfUA=client.signOutOfUA;
export {accountErrorMessage} from './auth-client.js';
