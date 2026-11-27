// Read-only display interpretation; never used for authorization.
export function entitlementState(record,now=Date.now()){
 if(!record)return 'missing';
 if(record.entitlementId!=='ua_plus'||typeof record.status!=='string')return 'unknown';
 if(record.status!=='ACTIVE')return 'inactive';
 if(record.expiresAt===null)return 'active';
 const expiry=record.expiresAt?.toMillis?.();
 if(!Number.isFinite(expiry))return 'unknown';
 return expiry>now?'active':'expired';
}
export function validMembership(record,id,uid){
 return !!record&&record.familyId===id&&record.userId===uid&&record.status==='ACTIVE'&&['OWNER','ADULT'].includes(record.role);
}
export function validFamily(record,id,uid,role){
 return !!record&&record.familyId===id&&record.status==='ACTIVE'&&typeof record.name==='string'&&typeof record.ownerUserId==='string'&&(role==='OWNER'?record.ownerUserId===uid:record.ownerUserId!==uid);
}
export function validMember(record,uid,role){
 return !!record&&record.userId===uid&&record.role===role&&record.status==='ACTIVE';
}
