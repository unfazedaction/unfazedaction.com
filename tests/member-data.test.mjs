import {test} from 'node:test';
import assert from 'node:assert/strict';
import {entitlementState,validMembership,validFamily,validMember} from '../assets/auth/member-data-model.js';
const e={entitlementId:'ua_plus',status:'ACTIVE',expiresAt:null};
test('direct nonexpiring entitlement',()=>assert.equal(entitlementState(e,100),'active'));
test('expiration and malformed expiration fail closed',()=>{assert.equal(entitlementState({...e,expiresAt:{toMillis:()=>100}},100),'expired');assert.equal(entitlementState({...e,expiresAt:'bad'},100),'unknown');assert.equal(entitlementState({...e,expiresAt:undefined},100),'unknown');});
test('missing and inactive are not active',()=>{assert.equal(entitlementState(null),'missing');assert.equal(entitlementState({...e,status:'REVOKED'}),'inactive');assert.equal(entitlementState({...e,entitlementId:'unknown'}),'unknown');});
test('family membership must match identity and active role',()=>{const m={familyId:'f',userId:'u',status:'ACTIVE',role:'OWNER'};assert.ok(validMembership(m,'f','u'));assert.ok(!validMembership(m,'f','other'));assert.ok(!validMembership({...m,status:'INACTIVE'},'f','u'));});
test('canonical family and self member checks',()=>{assert.ok(validFamily({familyId:'f',ownerUserId:'u',status:'ACTIVE',name:'Example'},'f','u','OWNER'));assert.ok(!validFamily({familyId:'f',ownerUserId:'other',status:'ACTIVE',name:'Example'},'f','u','OWNER'));assert.ok(!validMember({userId:'u',role:'OWNER',status:'INACTIVE'},'u','OWNER'));});
