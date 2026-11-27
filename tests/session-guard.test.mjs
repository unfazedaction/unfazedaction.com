import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSessionGuard,workspaceError} from '../assets/auth/session-guard.js';
test('signed out has no valid ticket',()=>{const g=createSessionGuard();assert.equal(g.ticket(),null);assert.equal(g.current(null),false);});
test('account transition invalidates pending callbacks',()=>{const g=createSessionGuard(),a=g.start('a'),b=g.start('b');assert.ok(!g.current(a));assert.ok(g.current(b));});
test('sign out then same UID still invalidates old requests',()=>{const g=createSessionGuard(),a=g.start('a');g.clear();assert.ok(!g.current(a));const b=g.start('a');assert.ok(!g.current(a));assert.ok(g.current(b));});
test('ticket immutable and errors sanitized',()=>{const g=createSessionGuard();assert.ok(Object.isFrozen(g.start('a')));assert.equal(workspaceError({message:'private detail'},'Safe fallback'),'Safe fallback');assert.equal(workspaceError({code:'permission-denied',message:'private detail'}),'Access is unavailable. Check your account and try again.');});
