import assert from 'node:assert/strict';
import {
  publicOrderAttemptKey, publicCartAttemptFingerprint,
  getOrCreatePublicOrderAttempt, clearPublicOrderAttempt,
  discardPublicOrderAttemptAfterReview, PublicOrderAttemptReviewRequiredError,
} from '../src/lib/publicOrderAttempt.ts';
import type { PublicCartLine } from '../src/lib/businessPublicPage.ts';

const storage = new Map<string, string>();
const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
  removeItem: (key: string) => { storage.delete(key); },
}});
const cart = [{ key: 'taco', item: { id: 'taco', name: 'Taco', price: 25, available: true }, quantity: 1 }] as PublicCartLine[];
const now = Date.now();
try {
  const fp = publicCartAttemptFingerprint(cart, null);
  assert.match(fp, /^[a-f0-9]{16}$/);
  assert.equal(fp, publicCartAttemptFingerprint([...cart], null));
  assert.notEqual(fp, publicCartAttemptFingerprint([{ ...cart[0], quantity: 2 }], null));
  assert.notEqual(fp, publicCartAttemptFingerprint(cart, 4));
  const first = getOrCreatePublicOrderAttempt('business-a', undefined, fp, now);
  assert.match(first, /^web_[a-f0-9]{32}$/);
  assert.equal(getOrCreatePublicOrderAttempt('business-a', undefined, fp, now + 1000), first);
  assert.notEqual(getOrCreatePublicOrderAttempt('business-b', undefined, fp, now), first);
  assert.notEqual(getOrCreatePublicOrderAttempt('business-a', 3, fp, now), first);
  assert.equal(getOrCreatePublicOrderAttempt('business-a', undefined, fp, now + 2000), first, 'Retry after simulated reload');
  const key = publicOrderAttemptKey('business-a');
  assert.ok(!storage.get(key)?.includes('Taco') && !storage.get(key)?.includes('nombre'), 'No personal/cart data stored');
  clearPublicOrderAttempt('business-a', undefined, 'web_ffffffffffffffffffffffffffffffff');
  assert.equal(getOrCreatePublicOrderAttempt('business-a', undefined, fp, now + 2000), first, 'Wrong completion must not clear');
  clearPublicOrderAttempt('business-a', undefined, first);
  assert.notEqual(getOrCreatePublicOrderAttempt('business-a', undefined, fp, now + 2000), first, 'Confirmed attempt cleared');
  const unresolved = getOrCreatePublicOrderAttempt('business-a', undefined, fp, now + 2000);
  const changedFingerprint = publicCartAttemptFingerprint([{ ...cart[0], quantity: 2 }], null);
  assert.throws(() => getOrCreatePublicOrderAttempt('business-a', undefined, changedFingerprint, now + 3000), PublicOrderAttemptReviewRequiredError, 'Changed cart cannot silently create a second order');
  assert.throws(() => getOrCreatePublicOrderAttempt('business-a', undefined, fp, now + 13 * 60 * 60 * 1000), /más de 12 horas/, 'Expired uncertain attempt cannot silently rotate');
  assert.throws(() => getOrCreatePublicOrderAttempt('business-a', undefined, fp, now - 1), /fecha del intento/, 'Clock reversal cannot silently rotate');
  assert.equal(getOrCreatePublicOrderAttempt('business-a', undefined, fp, now + 4000), unresolved, 'Uncertain attempt remains intact after blocked changes');
  assert.equal(JSON.parse(storage.get(key)!).id, unresolved, 'Blocked attempts never overwrite stored ID');
  discardPublicOrderAttemptAfterReview('business-a', undefined);
  const reviewed = getOrCreatePublicOrderAttempt('business-a', undefined, changedFingerprint, now + 4000);
  assert.notEqual(reviewed, unresolved, 'Only explicit review allows a new order ID');
  assert.equal(getOrCreatePublicOrderAttempt('business-b', undefined, fp, now + 4000), getOrCreatePublicOrderAttempt('business-b', undefined, fp, now + 4000), 'Review does not clear another tenant');
  storage.set(key, '{corrupt');
  assert.throws(() => getOrCreatePublicOrderAttempt('business-a', undefined, fp, now), /No se pudo conservar/);
  storage.delete(key);
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: () => { throw new Error('storage disabled'); },
    setItem: () => { throw new Error('storage disabled'); },
    removeItem: () => { throw new Error('storage disabled'); },
  }});
  assert.throws(() => getOrCreatePublicOrderAttempt('business-a', undefined, fp, now), /No se pudo conservar/);
  clearPublicOrderAttempt('business-a', undefined, first);
  assert.throws(() => getOrCreatePublicOrderAttempt('', undefined, fp, now), /inválida/);
  console.log('PASS: intento web estable y aislado; carrito cambiado, expiración y reloj bloquean ID nuevo hasta revisión explícita; almacenamiento fail-closed.');
} finally {
  if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
  else Reflect.deleteProperty(globalThis, 'sessionStorage');
}
