import assert from 'node:assert/strict';
import express from 'express';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { registerBusinessInviteApi } from '../businessInviteApi.ts';

process.env.ENABLE_BUSINESS_INVITES = 'true';
process.env.FIREBASE_PROJECT_ID = 'gioteautomatizo-invites-test';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
if (!getApps().length) initializeApp({projectId:process.env.FIREBASE_PROJECT_ID});
const auth=getAuth(),db=getFirestore();
const unique=Date.now().toString(36);
const owner=await auth.createUser({email:'owner-'+unique+'@example.test',emailVerified:true});
const employee=await auth.createUser({email:'employee-'+unique+'@example.test',emailVerified:true});
const other=await auth.createUser({email:'other-'+unique+'@example.test',emailVerified:true});
const businessId='invite-test-a',otherBusiness='invite-test-b';
for(const id of [businessId,otherBusiness]){
 await db.collection('businesses').doc(id).set({restaurantId:id,ownerUserId:owner.uid,branding:{restaurantName:id}});
}
await db.collection('businessMemberships').doc(businessId+'_'+owner.uid).set({restaurantId:businessId,userId:owner.uid,role:'OWNER',active:true});
await db.collection('businessMemberships').doc(otherBusiness+'_'+other.uid).set({restaurantId:otherBusiness,userId:other.uid,role:'OWNER',active:true});
const getToken=async user=>{
 const custom=await auth.createCustomToken(user.uid);
 const res=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:custom,returnSecureToken:true})});
 assert.equal(res.ok,true,'Auth Emulator token');return (await res.json()).idToken;
};
const [ownerToken,employeeToken,otherToken]=await Promise.all([getToken(owner),getToken(employee),getToken(other)]);
const app=express();app.use(express.json());registerBusinessInviteApi(app);
const server=app.listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const origin='http://127.0.0.1:'+server.address().port;
async function call(path,body,token,method='POST'){
 const res=await fetch(origin+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(method==='POST'?{body:JSON.stringify(body)}:{})});
 const json=await res.json();return {status:res.status,data:json};
}
async function create(email=employee.email){
 const r=await call('/api/business-invites',{businessId,email,name:'Persona de prueba',role:'KITCHEN'},ownerToken);
 assert.equal(r.status,201,JSON.stringify(r));return r.data.token;
}
try{
 const invalid=await call('/api/business-invites',{businessId,email:employee.email,name:'Invitada',role:'OWNER'},ownerToken);
 assert.equal(invalid.status,400);
 const denied=await call('/api/business-invites',{businessId,email:employee.email,name:'Invitada',role:'KITCHEN'},otherToken);
 assert.equal(denied.status,403);
 const revokedToken=await create();
 const preview=await call('/api/business-invites/preview',{token:revokedToken});
 assert.equal(preview.status,200);
 const list=await call('/api/business-invites?businessId='+businessId,undefined,ownerToken,'GET');
 assert.equal(list.status,200);
 const inviteId=list.data.invites.find(x=>x.email===employee.email).id;
 const revoke=await call('/api/business-invites/revoke',{businessId,inviteId},ownerToken);
 assert.equal(revoke.status,200);
 assert.equal((await call('/api/business-invites/accept',{token:revokedToken},employeeToken)).status,410);
 const consumedToken=await create();
 assert.equal((await call('/api/business-invites/accept',{token:consumedToken},otherToken)).status,403);
 const accepted=await call('/api/business-invites/accept',{token:consumedToken},employeeToken);
 assert.equal(accepted.status,200,JSON.stringify(accepted));
 const replay=await call('/api/business-invites/accept',{token:consumedToken},employeeToken);
 assert.equal(replay.status,410);
 const member=await db.collection('businessMemberships').doc(businessId+'_'+employee.uid).get();
 assert.equal(member.data().role,'KITCHEN');
 const expired=await create('late-'+unique+'@example.test');
 const {createHash}=await import('node:crypto');
 const hash=createHash('sha256').update(expired).digest('hex');
 await db.collection('business_invites').doc(hash).update({expiresAt:Date.now()-1});
 assert.equal((await call('/api/business-invites/preview',{token:expired})).status,410);
 const simultaneous=await Promise.all(Array.from({length:12},(_,i)=>call('/api/business-invites',{businessId,email:'new'+i+'-'+unique+'@example.test',name:'Invitado',role:'EMPLOYEE'},ownerToken)));
 assert(simultaneous.some(x=>x.status===429),'hourly rate limit');
 const attempted=simultaneous.filter(x=>x.status===201).length;
 assert(attempted<=7,'hourly rate cap');
 console.log('PASS: permissions, revoked/expired/consumed links, wrong email and concurrent rate limiting.');
}finally{await new Promise(resolve=>server.close(resolve));}
