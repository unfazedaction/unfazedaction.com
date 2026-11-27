import {getApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getFirestore,doc,collection,getDocFromServer,getDocsFromServer} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {entitlementState,validMembership,validFamily,validMember} from './member-data-model.js';
const read=async ref=>{const snap=await getDocFromServer(ref);return snap.exists()?snap.data():null;};
const text=(value)=>typeof value==='string'&&value.trim()?value:'Not available';
const date=value=>{const ms=value?.toMillis?.();return Number.isFinite(ms)?new Date(ms).toLocaleDateString(): 'Not available';};
export async function profile(uid){
 const db=getFirestore(getApp()),p=await read(doc(db,'ua_users',uid));
 if(!p)return ['No UA profile record found.'];
 if(p.uid!==uid)return ['Profile could not be verified.'];
 return ['UA profile name: '+text(p.displayName),'Account status: '+(p.status==='ACTIVE'?'Active':'Not confirmed active'),'Account created: '+date(p.createdAt)];
}
export async function membership(uid){
 const db=getFirestore(getApp()),e=await read(doc(db,'ua_users',uid,'entitlements','ua_plus'));
 const state=entitlementState(e);
 if(state==='missing')return ['No direct UA+ entitlement found.','Overall membership tier and family-derived access are not determined here.'];
 if(state==='unknown')return ['Membership status could not be verified.'];
 if(state!=='active')return ['Direct UA+ entitlement: '+(state==='expired'?'Expired':'Not active'),'Overall membership tier is not determined here.'];
 return ['UA+ — Active','Granted: '+date(e.grantedAt),'Expiration: '+(e.expiresAt===null?'No expiration set':date(e.expiresAt))];
}
export async function families(uid,includeMembers=false){
 const db=getFirestore(getApp()),snap=await getDocsFromServer(collection(db,'ua_users',uid,'family_memberships'));
 if(snap.empty)return ['No family membership records found.'];
 const rows=[];
 for(const entry of snap.docs){
  const id=entry.id,m=entry.data();
  if(!validMembership(m,id,uid))continue;
  try{
   const [family,self]=await Promise.all([read(doc(db,'ua_families',id)),read(doc(db,'ua_families',id,'members',uid))]);
   if(!validFamily(family,id,uid,m.role)||!validMember(self,uid,m.role)){rows.push('A family membership could not be verified.');continue;}
   rows.push(text(family.name)+' — '+(m.role==='OWNER'?'Owner':'Adult member'));
   rows.push('Family membership: Active');
   // Only an owner can independently verify their own direct entitlement.
   // A family marker is not sufficient proof of a commercial tier or inherited access.
   try{
    const e=await read(doc(db,'ua_families',id,'entitlements','ua_plus'));
    if(e&&e.familyId===id&&e.ownerUserId===family.ownerUserId&&e.source==='FAMILY_OWNER'&&entitlementState(e)==='active'){
     if(m.role==='OWNER'){
      const direct=await read(doc(db,'ua_users',uid,'entitlements','ua_plus'));
      rows.push(entitlementState(direct)==='active'?'UA+ family sharing: Active record; direct UA+ active.':'UA+ family sharing: Owner entitlement not active or verified.');
     }else rows.push('UA+ family sharing record present; effective access not independently verified.');
    }else rows.push('UA+ family sharing not confirmed.');
   }catch{rows.push('UA+ family sharing status unavailable.');}
   if(includeMembers&&m.role==='OWNER'){
    try{
     const members=await getDocsFromServer(collection(db,'ua_families',id,'members'));
     for(const member of members.docs){
      const v=member.data();
      if(v.status!=='ACTIVE')continue;
      const role=v.role==='OWNER'?'Owner':v.role==='ADULT'?'Adult member':v.role==='CHILD'&&v.accountMode==='MANAGED_CHILD'?'Managed profile':null;
      if(role&&typeof v.displayName==='string'&&(role!=='Managed profile'||m.role==='OWNER'))rows.push('Member: '+v.displayName+' — '+role);
     }
    }catch{rows.push('Family member list unavailable.');}
   }else if(includeMembers){rows.push('Member list is currently available to the family owner only on the website.');}
  }catch{rows.push('A family membership could not be loaded.');}
 }
 return rows.length?rows:['No verified active family memberships found.'];
}
