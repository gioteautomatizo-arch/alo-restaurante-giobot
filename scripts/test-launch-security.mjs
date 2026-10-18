import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, getDocs, collection } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
const env=await initializeTestEnvironment({projectId:'gioteautomatizo-launch-security-test',firestore:{rules:readFileSync('docs/firestore.launch-security.STAGED.rules','utf8'),host:'127.0.0.1',port:8080}});
const db=u=>env.authenticatedContext(u).firestore(), guest=()=>env.unauthenticatedContext().firestore();
const order=(id)=>({restaurantId:id,code:'AAA-123',status:'NUEVO',billingStatus:'PENDIENTE',orderType:'pickup',orderSource:'CLIENTE_QR',customerName:'Visitante',paymentMethod:'efectivo',items:[{name:'Prueba',quantity:1,unitPrice:10,totalPrice:10}],subtotal:10,discountAmount:0,deliveryFee:0,total:10,createdAt:'2026-10-18T12:00:00.000Z',updatedAt:'2026-10-18T12:00:00.000Z'});
try{
await env.withSecurityRulesDisabled(async ctx=>{const admin=ctx.firestore();
for(const id of ['business-a','business-b']){await setDoc(doc(admin,'businesses',id),{restaurantId:id,ownerUserId:'owner-'+id.slice(-1)});await setDoc(doc(admin,'publicBusinessProfiles',id),{businessId:id,restaurantId:id,published:id==='business-a'});}
for(const role of ['OWNER','KITCHEN','EMPLOYEE','CASHIER'])await setDoc(doc(admin,'businessMemberships/business-a_'+role.toLowerCase()),{restaurantId:'business-a',userId:role.toLowerCase(),role,active:true});
await setDoc(doc(admin,'businessMemberships/business-a_manager'),{restaurantId:'business-a',userId:'manager',role:'MANAGER',active:true});
await setDoc(doc(admin,'businessMemberships/business-a_admin'),{restaurantId:'business-a',userId:'admin',role:'ADMIN',active:true});
await setDoc(doc(admin,'businessMemberships/business-a_staff'),{restaurantId:'business-a',userId:'staff',role:'EMPLOYEE',active:true});
await setDoc(doc(admin,'restaurant_orders/first'),order('business-a'));
await setDoc(doc(admin,'businesses/business-a/catalog/draft'),{businessId:'business-a',name:'Prueba'});
await setDoc(doc(admin,'businesses/business-b/catalog/draft'),{businessId:'business-b',name:'Oculto'});
});
await assertSucceeds(getDoc(doc(guest(),'businesses/business-a/catalog/draft')));
await assertFails(getDoc(doc(guest(),'businesses/business-b/catalog/draft')));
await assertSucceeds(setDoc(doc(guest(),'restaurant_orders/public'),order('business-a')));
await assertFails(setDoc(doc(guest(),'restaurant_orders/unpublished'),order('business-b')));
await assertFails(setDoc(doc(guest(),'restaurant_orders/fakepaid'),{...order('business-a'),billingStatus:'PAGADO'}));
await assertFails(setDoc(doc(db('employee'),'restaurant_orders/staff'),{...order('business-a'),orderSource:'CAJA'}));
await assertSucceeds(setDoc(doc(db('cashier'),'restaurant_orders/cashier'),{...order('business-a'),orderSource:'CAJA'}));
await assertFails(updateDoc(doc(db('kitchen'),'restaurant_orders/first'),{total:0}));
await assertFails(updateDoc(doc(db('kitchen'),'restaurant_orders/first'),{billingStatus:'PAGADO'}));
await assertFails(updateDoc(doc(db('kitchen'),'restaurant_orders/first'),{restaurantId:'business-b'}));
await assertSucceeds(updateDoc(doc(db('kitchen'),'restaurant_orders/first'),{status:'PREPARANDO'}));
await assertFails(updateDoc(doc(db('employee'),'restaurant_orders/first'),{status:'LISTO'}));
await assertFails(updateDoc(doc(guest(),'restaurant_orders/first'),{status:'LISTO'}));
await assertFails(updateDoc(doc(db('manager'),'businessMemberships/business-a_admin'),{active:false}));
await assertFails(updateDoc(doc(db('manager'),'businessMemberships/business-a_admin'),{role:'EMPLOYEE'}));
await assertFails(updateDoc(doc(db('manager'),'businessMemberships/business-a_manager'),{active:false}));
await assertSucceeds(updateDoc(doc(db('manager'),'businessMemberships/business-a_staff'),{role:'KITCHEN'}));
await assertFails(updateDoc(doc(db('staff'),'businessMemberships/business-a_admin'),{role:'EMPLOYEE'}));
console.log('PASS: pedidos y catálogos separados; cambios financieros no autorizados bloqueados.');
}finally{await env.cleanup();}
