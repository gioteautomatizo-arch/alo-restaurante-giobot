import assert from 'node:assert/strict';
import { addPublicReceipt, readPublicReceipts, publicReceiptKey, type PublicOrderReceipt } from '../src/lib/publicOrderReceipts.ts';
const storage = new Map<string, string>();
Object.assign(globalThis, { sessionStorage: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
}});
const now = Date.now();
const receipt: PublicOrderReceipt = { id: 'order-1', businessId: 'giomero', tableNumber: 2, guestCount: 4, code: 'GIO-001', sentAt: new Date(now).toISOString(), total: 50, items: [{ name: 'Taco', quantity: 2, totalPrice: 50 }] };
const current = addPublicReceipt([], receipt);
assert.deepEqual(readPublicReceipts('giomero', 2, now), [receipt]);
assert.deepEqual(readPublicReceipts('giomero', 3, now), []);
assert.deepEqual(readPublicReceipts('otro-negocio', 2, now), []);
assert.deepEqual(readPublicReceipts('giomero', undefined, now), []);
assert.equal(addPublicReceipt(current, receipt).length, 1, 'No duplicate receipt');
assert.deepEqual(readPublicReceipts('giomero', 2, now + 13 * 60 * 60 * 1000), [], 'Old receipts expire');
assert.deepEqual(readPublicReceipts('giomero', 2, now - 1), [], 'No future dates');
const key = publicReceiptKey('giomero', 2);
for (const raw of ['invalid-json', '{}', JSON.stringify([{ ...receipt, businessId: 'other' }]), JSON.stringify([{ ...receipt, total: -1 }]), JSON.stringify([{ ...receipt, items: [{ name: 'Taco', quantity: 0, totalPrice: 50 }] }])]) {
  storage.set(key, raw); assert.deepEqual(readPublicReceipts('giomero', 2, now), []);
}
let receipts: PublicOrderReceipt[] = [];
for (let i = 0; i < 15; i++) receipts = addPublicReceipt(receipts, { ...receipt, id: `order-${i}` });
assert.equal(readPublicReceipts('giomero', 2, now).length, 10);
Object.assign(globalThis, { sessionStorage: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } });
assert.deepEqual(readPublicReceipts('giomero', 2), []);
assert.deepEqual(addPublicReceipt([], receipt), [receipt], 'Storage failure does not lose the in-memory receipt');
console.log('PASS: sent receipts restore, isolate tenant/table, expire, deduplicate and survive unavailable storage.');
