import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import assert from 'node:assert/strict';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection } from 'firebase/firestore';
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
await setDoc(doc(admin,'businessMemberships/business-a_disabled'),{restaurantId:'business-a',userId:'disabled',role:'MANAGER',active:false});
await setDoc(doc(admin,'restaurant_orders/first'),order('business-a'));
await setDoc(doc(admin,'businesses/business-a/catalog/draft'),{businessId:'business-a',name:'Prueba'});
await setDoc(doc(admin,'businesses/business-b/catalog/draft'),{businessId:'business-b',name:'Oculto'});
});
await assertSucceeds(getDoc(doc(guest(),'businesses/business-a/catalog/draft')));
// Seguridad completa del catálogo: lectura pública solo del publicado;
// crear, editar y eliminar únicamente con roles de administración activos.
await assertFails(setDoc(doc(guest(),'businesses/business-a/catalog/anonymous'),{businessId:'business-a',name:'Producto falso'}));
await assertFails(setDoc(doc(db('cashier'),'businesses/business-a/catalog/unauthorized'),{businessId:'business-a',name:'Precio falso'}));
await assertFails(deleteDoc(doc(db('cashier'),'businesses/business-a/catalog/draft')));
await assertFails(setDoc(doc(db('disabled'),'businesses/business-a/catalog/revoked'),{businessId:'business-a',name:'Sin acceso'}));
await assertFails(setDoc(doc(db('manager'),'businesses/business-b/catalog/cross-tenant'),{businessId:'business-b',name:'Otro negocio'}));
await assertFails(setDoc(doc(db('manager'),'businesses/business-a/catalog/id-injection'),{businessId:'business-b',name:'ID alterado'}));
await assertSucceeds(setDoc(doc(db('owner'),'businesses/business-a/catalog/owner'),{businessId:'business-a',name:'Autorizado propietario'}));
await assertSucceeds(setDoc(doc(db('admin'),'businesses/business-a/catalog/admin'),{businessId:'business-a',name:'Autorizado administrador'}));
await assertSucceeds(setDoc(doc(db('manager'),'businesses/business-a/catalog/manager'),{businessId:'business-a',name:'Autorizado encargado'}));
await assertSucceeds(deleteDoc(doc(db('manager'),'businesses/business-a/catalog/manager')));
await assertFails(updateDoc(doc(db('cashier'),'businesses/business-a/catalog/draft'),{name:'Precio manipulado'}));
await assertFails(updateDoc(doc(db('kitchen'),'businesses/business-a/catalog/draft'),{name:'Precio manipulado'}));
await assertFails(updateDoc(doc(db('employee'),'businesses/business-a/catalog/draft'),{name:'Precio manipulado'}));
await assertSucceeds(updateDoc(doc(db('manager'),'businesses/business-a/catalog/draft'),{name:'Menú actualizado'}));
await assertFails(updateDoc(doc(db('manager'),'businesses/business-b/catalog/draft'),{name:'Negocio ajeno'}));
await assertFails(getDoc(doc(guest(),'businesses/business-b/catalog/draft')));
await assertSucceeds(setDoc(doc(guest(),'restaurant_orders/public'),order('business-a')));
// Reintento anónimo con ID estable: la segunda escritura es update, no otro create.
const webId = 'web_0123456789abcdef0123456789abcdef';
await assertSucceeds(setDoc(doc(guest(),'restaurant_orders',webId),order('business-a')));
await assertFails(setDoc(doc(guest(),'restaurant_orders',webId),{...order('business-a'),code:'RETRY-002'}));
await env.withSecurityRulesDisabled(async ctx=>{
  const saved = await getDoc(doc(ctx.firestore(),'restaurant_orders',webId));
  assert.equal(saved.data().code,'AAA-123','Retry must not overwrite original order');
});
// QR de mesa multinegocio conserva mesa/personas en el pedido sin crear sesión heredada.
await assertSucceeds(setDoc(doc(guest(),'restaurant_orders/table-qr'),{...order('business-a'),orderOrigin:'MESA_QR',tableNumber:3,notes:'Mesa 3 · 4 personas'}));
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
