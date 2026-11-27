# UA web authentication foundation (009A)
This module is not loaded by any production HTML page yet. It reuses the existing Firebase web configuration and SDK 11.10.0. No Firestore access, new accounts, password recovery, tokens, entitlement decisions or server rules are introduced.

API: observeAccount(next,onError) returns an unsubscribe function; signInToUA(email,password,{remember:false}) defaults to browser-session persistence, with opt-in local persistence; signOutOfUA() signs out the shared Firebase instance. accountErrorMessage(error) maps SDK errors to safe public text. Observer identity is a display snapshot, never an authorization grant. Do not cache it as proof of permission.

The current Second Brain implementation is unchanged. Same-origin session sharing and cross-tab behavior depend on actual Firebase persistence and must be tested before routing users to the new member area. Changing persistence can affect existing same-origin sessions; integration must be deliberately tested. Never log credentials or tokens. No automatic fallback if persistence fails. No live Firebase settings or rules have been verified or changed.

Run adapter tests with Node 22+: node --experimental-default-type=module --test tests/ua-auth.test.mjs
Tests use synthetic identities and mock adapters, not the live Firebase project. Live authentication, restoration, sign-out and user isolation are later acceptance gates.
