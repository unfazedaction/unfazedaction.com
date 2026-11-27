// Dependency-injected adapter for unit testing without Firebase or real credentials.
export function accountErrorMessage(error){
  switch(error?.code){
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/user-disabled':
    case 'auth/invalid-email':
      return 'Email or password not recognized. Check your details and try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Unable to connect. Check your internet connection and try again.';
    case 'auth/web-storage-unsupported':
    case 'auth/operation-not-supported-in-this-environment':
      return 'Sign-in is unavailable in this browser. Check your browser settings.';
    default:
      return 'Unable to complete your account request. Please try again.';
  }
}

export function createAccountClient(adapter){
  let pending=false;
  const identity=user=>user && !user.isAnonymous ? Object.freeze({
    uid:user.uid,email:user.email??null,displayName:user.displayName??null,emailVerified:user.emailVerified===true
  }):null;
  const exclusive=async action=>{
    if(pending)throw new Error('An account request is already in progress.');
    pending=true;
    try{return await action();}finally{pending=false;}
  };
  return Object.freeze({
    observeAccount(next,onError=()=>{}){
      return adapter.observe(user=>next(identity(user)),onError);
    },
    async signInToUA(email,password,{remember=false}={}){
      if(typeof email!=='string'||!email.trim()||typeof password!=='string'||!password)throw new Error('Email and password are required.');
      if(typeof remember!=='boolean')throw new Error('Invalid session preference.');
      return exclusive(async()=>{
        // Fail closed if persistence cannot be set. Do not silently fall back to a longer session.
        await adapter.persist(remember);
        const result=await adapter.login(email.trim(),password);
        const account=identity(result.user);
        if(!account){await adapter.logout();throw new Error('UA account required.');}
        return account;
      });
    },
    signOutOfUA(){return exclusive(()=>adapter.logout());}
  });
}
