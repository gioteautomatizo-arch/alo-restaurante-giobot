import assert from 'node:assert/strict';
import { assertMatchingOffTableReceipt } from '../src/lib/offTableReceiptGuards.ts';
import type { RestaurantOrder, SaleReceipt } from '../src/types';

const order = {
 id:'paid-order-1',code:'CAL-123',restaurantId:'alo-restaurante',
 orderType:'pickup',status:'NUEVO',billingStatus:'PAGADO',total:35,
} as RestaurantOrder;
const receipt = {
 receiptType:'OFF_TABLE', code:order.code,restaurantId:order.restaurantId,
 tableNumber:0,status:'PAGADO',totalPaid:35,orderIds:[order.id],
 orders:[{orderId:order.id,code:order.code,total:35,createdAt:'2026-10-22T12:00:00Z',items:[]}],
} as SaleReceipt;
assert.doesNotThrow(()=>assertMatchingOffTableReceipt(receipt,order));
const bad=[
 {...receipt,code:'CAL-999'},
 {...receipt,totalPaid:70},
 {...receipt,restaurantId:'other-business'},
 {...receipt,orderIds:['other-order']},
 {...receipt,orderIds:[order.id,'other-order']},
 {...receipt,orders:[{...receipt.orders[0],total:90}]},
 {...receipt,orders:[]},
 {...receipt,receiptType:'TABLE'},
 {...receipt,status:'PENDIENTE'},
];
for(const candidate of bad)assert.throws(()=>assertMatchingOffTableReceipt(candidate as SaleReceipt,order),/no coincide/);
assert.throws(()=>assertMatchingOffTableReceipt(receipt,{...order,billingStatus:'PENDIENTE'}),/no coincide/);
console.log('PASS: ticket válido y rechazos por folio, importe, negocio, identidad y pago.');
