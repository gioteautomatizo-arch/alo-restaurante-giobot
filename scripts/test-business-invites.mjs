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
await db.collection('businesses').doc(businessId).set({restaurantId:businessId,ownerUserId:owner.uid,branding:{restaurantName:businessId}});
await db.collection('businesses').doc(otherBusiness).set({restaurantId:otherBusiness,ownerUserId:other.uid,branding:{restaurantName:otherBusiness}});
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
 // Two independent owners: invitation management is never shared across tenants.
 const otherInvite=await call('/api/business-invites',{businessId:otherBusiness,email:employee.email,name:'Persona B',role:'KITCHEN'},otherToken);
 assert.equal(otherInvite.status,201,JSON.stringify(otherInvite));
 const otherList=await call('/api/business-invites?businessId='+otherBusiness,undefined,otherToken,'GET');
 assert.equal(otherList.status,200);
 assert.equal(otherList.data.invites.length,1);
 assert.equal((await call('/api/business-invites?businessId='+otherBusiness,undefined,ownerToken,'GET')).status,403);
 assert.equal((await call('/api/business-invites',{businessId:otherBusiness,email:employee.email,name:'Cruce',role:'KITCHEN'},ownerToken)).status,403);
 assert.equal((await call('/api/business-invites/revoke',{businessId:otherBusiness,inviteId:otherList.data.invites[0].id},ownerToken)).status,403);
 assert.equal((await call('/api/business-invites/revoke',{businessId,inviteId:otherList.data.invites[0].id},ownerToken)).status,404);
 assert.equal((await call('/api/business-invites/revoke',{businessId:otherBusiness,inviteId:otherList.data.invites[0].id},otherToken)).status,200);
 assert.equal((await call('/api/business-invites/accept',{token:otherInvite.data.token},employeeToken)).status,410);

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
 // A membership document with a misleading ID but a foreign tenant/user
 // must not authorize server-side Admin SDK operations or token acceptance.
 const secondEmployee=await auth.createUser({email:'second-'+unique+'@example.test',emailVerified:true});
 const secondToken=await getToken(secondEmployee);
 const pendingToken=await create(secondEmployee.email);
 assert.equal((await call('/api/business-invites/preview',{token:pendingToken})).status,200);
 const ownerMembership=db.collection('businessMemberships').doc(businessId+'_'+owner.uid);
 await ownerMembership.update({restaurantId:otherBusiness});
 assert.equal((await call('/api/business-invites/preview',{token:pendingToken})).status,410,
   'Una invitación de A no debe verse vigente con un invitador vinculado a B');
 assert.equal((await call('/api/business-invites',{businessId,email:employee.email,name:'Cruce',role:'KITCHEN'},ownerToken)).status,403);
 assert.equal((await call('/api/business-invites?businessId='+businessId,undefined,ownerToken,'GET')).status,403);
 const pendingList=await db.collection('business_invites').where('businessId','==',businessId).get();
 const pendingDoc=pendingList.docs.find(x=>x.data().email===secondEmployee.email);
 assert(pendingDoc,'pending invite for tenant mismatch test');
 assert.equal((await call('/api/business-invites/revoke',{businessId,inviteId:pendingDoc.id},ownerToken)).status,403);
 assert.equal((await call('/api/business-invites/accept',{token:pendingToken},secondToken)).status,403);
 await ownerMembership.update({restaurantId:businessId,userId:other.uid});
 assert.equal((await call('/api/business-invites/preview',{token:pendingToken})).status,410,
   'El UID de membresía discordante debe invalidar también la vista previa');
 assert.equal((await call('/api/business-invites?businessId='+businessId,undefined,ownerToken,'GET')).status,403);
 await ownerMembership.update({userId:owner.uid,active:false});
 assert.equal((await call('/api/business-invites/preview',{token:pendingToken})).status,410,
   'Revocar al invitador debe ocultar una invitación pendiente');
 assert.equal((await call('/api/business-invites',{businessId,email:employee.email,name:'Revocado',role:'KITCHEN'},ownerToken)).status,403);
 assert.equal((await call('/api/business-invites/accept',{token:pendingToken},secondToken)).status,403);
 await ownerMembership.update({active:true});
 // Un rol sin capacidad de invitar, o una raíz de tenant discordante,
 // tampoco puede dejar la vista previa en estado engañosamente válido.
 await ownerMembership.update({role:'KITCHEN'});
 assert.equal((await call('/api/business-invites/preview',{token:pendingToken})).status,410);
 await ownerMembership.update({role:'OWNER'});
 const businessRoot=db.collection('businesses').doc(businessId);
 await businessRoot.update({restaurantId:otherBusiness});
 assert.equal((await call('/api/business-invites/preview',{token:pendingToken})).status,410,
   'La vista previa no debe mostrar el nombre de un negocio con raíz discordante');
 await businessRoot.update({restaurantId:businessId});
 await pendingDoc.ref.update({role:'OWNER'});
 assert.equal((await call('/api/business-invites/preview',{token:pendingToken})).status,410,
   'Rol de invitación inválido debe fallar cerrado');
 await pendingDoc.ref.update({role:'KITCHEN',createdBy:other.uid});
 assert.equal((await call('/api/business-invites/preview',{token:pendingToken})).status,410,
   'No aceptar una invitación atribuida a un OWNER de otro tenant');
 await pendingDoc.ref.update({createdBy:owner.uid});
 assert.equal((await call('/api/business-invites/preview',{token:pendingToken})).status,200,
   'Restaurar identidad y permisos debe recuperar la vista previa');
 const recovered=await call('/api/business-invites/accept',{token:pendingToken},secondToken);
 assert.equal(recovered.status,200,JSON.stringify(recovered));
 assert.equal((await db.collection('businessMemberships').doc(businessId+'_'+secondEmployee.uid).get()).data().restaurantId,businessId);
 assert.equal((await db.collection('businessMemberships').doc(otherBusiness+'_'+secondEmployee.uid).get()).exists,false);
 assert.equal((await call('/api/business-invites?businessId='+otherBusiness,undefined,otherToken,'GET')).status,200);

 const expired=await create('late-'+unique+'@example.test');
 const {createHash}=await import('node:crypto');
 const hash=createHash('sha256').update(expired).digest('hex');
 await db.collection('business_invites').doc(hash).update({expiresAt:Date.now()-1});
 assert.equal((await call('/api/business-invites/preview',{token:expired})).status,410);
 const simultaneous=await Promise.all(Array.from({length:12},(_,i)=>call('/api/business-invites',{businessId,email:'new'+i+'-'+unique+'@example.test',name:'Invitado',role:'EMPLOYEE'},ownerToken)));
 assert(simultaneous.some(x=>x.status===429),'hourly rate limit');
 const attempted=simultaneous.filter(x=>x.status===201).length;
 assert(attempted<=7,'hourly rate cap');
 console.log('PASS: two-tenant invite isolation, fail-closed preview on revoked inviter/role/root, recovery, token lifecycle and concurrent rate limiting.');
}finally{await new Promise(resolve=>server.close(resolve));}
