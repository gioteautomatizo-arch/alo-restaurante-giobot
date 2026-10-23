import assert from 'node:assert/strict';
import { clearQuickSaleReview, listQuickSaleReviews, rememberQuickSaleForReview } from '../src/lib/quickSaleRecoveryJournal.ts';

const store = new Map<string,string>();
globalThis.localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key,value) => { store.set(key,String(value)); },
  removeItem: key => store.delete(key),
  clear: () => store.clear(),
  key: index => [...store.keys()][index] ?? null,
  get length() { return store.size; },
};
const id1='a'.repeat(20),id2='b'.repeat(20);
const one={orderId:id1,businessId:'restaurant-a',recordedAt:'2026-10-22T12:00:00Z'};
const two={orderId:id2,businessId:'restaurant-b',recordedAt:'2026-10-22T12:01:00Z'};
assert.equal(rememberQuickSaleForReview(one),true);
assert.equal(rememberQuickSaleForReview(two),true);
assert.equal(rememberQuickSaleForReview(one),true);
assert.equal(listQuickSaleReviews('restaurant-a').length,1);
assert.equal(listQuickSaleReviews('restaurant-b').length,1);
assert.equal(listQuickSaleReviews('restaurant-a')[0].orderId,id1);
assert.equal(rememberQuickSaleForReview({...one,orderId:'not-valid'}),false);
store.set('gioteautomatizo_quick_sale_review_v1_restaurant-a','invalid json');
assert.deepEqual(listQuickSaleReviews('restaurant-a'),[]);
assert.equal(rememberQuickSaleForReview(one),false);
assert.equal(clearQuickSaleReview('restaurant-a',id1),false);
assert.equal(store.get('gioteautomatizo_quick_sale_review_v1_restaurant-a'),'invalid json');
store.delete('gioteautomatizo_quick_sale_review_v1_restaurant-a');
assert.equal(rememberQuickSaleForReview(one),true);
assert.equal(clearQuickSaleReview('restaurant-a',id1),true);
assert.deepEqual(listQuickSaleReviews('restaurant-a'),[]);
assert.equal(listQuickSaleReviews('restaurant-b')[0].orderId,id2);
console.log('PASS: referencias locales separadas por tenant, sin duplicados y recuperables tras JSON corrupto.');
