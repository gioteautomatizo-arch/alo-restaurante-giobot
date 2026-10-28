import assert from 'node:assert/strict';
import {
  publicOrderAttemptKey, publicCartAttemptFingerprint,
  getOrCreatePublicOrderAttempt, clearPublicOrderAttempt,
  discardPublicOrderAttemptAfterReview, PublicOrderAttemptReviewRequiredError,
} from '../src/lib/publicOrderAttempt.ts';
import type { PublicCartLine } from '../src/lib/businessPublicPage.ts';

const storage = new Map<string, string>();
const secondTab = new Map<string, string>();
const sharedStorage = new Map<string, string>();
let activeTab = storage;
const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
const originalLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
  getItem: (key: string) => activeTab.get(key) ?? null,
  setItem: (key: string, value: string) => { activeTab.set(key, value); },
  removeItem: (key: string) => { activeTab.delete(key); },
}});
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => sharedStorage.get(key) ?? null,
  setItem: (key: string, value: string) => { sharedStorage.set(key, value); },
  removeItem: (key: string) => { sharedStorage.delete(key); },
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
  // Dos pestañas comparten referencia sin compartir carrito ni datos personales.
  const sharedId = getOrCreatePublicOrderAttempt('cross-tab', undefined, fp, now);
  const sharedKey = publicOrderAttemptKey('cross-tab');
  assert.equal(JSON.parse(sharedStorage.get(sharedKey)!).id, sharedId);
  activeTab = secondTab;
  assert.equal(getOrCreatePublicOrderAttempt('cross-tab', undefined, fp, now + 100), sharedId,
    'Second tab must reuse the same unresolved Firestore ID');
  assert.equal(JSON.parse(secondTab.get(sharedKey)!).id, sharedId, 'Second tab keeps its own mirror');
  assert.throws(() => getOrCreatePublicOrderAttempt('cross-tab', undefined, changedFingerprint, now + 100),
    PublicOrderAttemptReviewRequiredError, 'Changed cart in second tab must not create a new ID');
  // Si la primera pestaña recibe confirmación, la segunda conserva su ID
  // anterior: no crea un folio diferente al reenviar desde una vista obsoleta.
  activeTab = storage;
  clearPublicOrderAttempt('cross-tab', undefined, sharedId);
  assert.equal(sharedStorage.has(sharedKey), false);
  activeTab = secondTab;
  assert.equal(getOrCreatePublicOrderAttempt('cross-tab', undefined, fp, now + 200), sharedId,
    'Stale second tab must not silently create another ID after first tab confirmed');
  assert.equal(JSON.parse(sharedStorage.get(sharedKey)!).id, sharedId);
  // Referencias distintas (por una carrera o restauración) se bloquean sin escoger una.
  sharedStorage.set(sharedKey, JSON.stringify({id: 'web_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', fingerprint: fp, createdAt: now}));
  assert.throws(() => getOrCreatePublicOrderAttempt('cross-tab', undefined, fp, now + 100),
    /Hay intentos diferentes/, 'Conflicting tab and shared references require explicit review');
  assert.equal(secondTab.get(sharedKey) !== null, true, 'Conflict must not erase either reference');
  discardPublicOrderAttemptAfterReview('cross-tab');
  assert.equal(sharedStorage.has(sharedKey), false, 'Review clears shared reference');
  assert.equal(secondTab.has(sharedKey), false, 'Review clears active tab reference');
  activeTab = storage;
  // Compatibilidad: un intento antiguo de sessionStorage se migra sin cambiar de ID.
  const legacyKey = publicOrderAttemptKey('legacy-tab');
  const legacyId = 'web_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  storage.set(legacyKey, JSON.stringify({id: legacyId, fingerprint: fp, createdAt: now}));
  assert.equal(getOrCreatePublicOrderAttempt('legacy-tab', undefined, fp, now + 100), legacyId);
  assert.equal(JSON.parse(sharedStorage.get(legacyKey)!).id, legacyId);
  clearPublicOrderAttempt('legacy-tab', undefined, legacyId);
  assert.equal(sharedStorage.has(legacyKey), false);
  assert.equal(storage.has(legacyKey), false);
  // Otro tenant no se borra por la revisión o limpieza de uno.
  assert.ok(sharedStorage.has(publicOrderAttemptKey('business-b')));
  storage.set(key, '{corrupt');
  assert.throws(() => getOrCreatePublicOrderAttempt('business-a', undefined, fp, now), /No se pudo conservar/);
  storage.delete(key);
  const workingLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')!;
  const workingSession = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')!;
  // Una limpieza fallida de la pestaña no debe borrar el folio compartido.
  const cleanupId = getOrCreatePublicOrderAttempt('cleanup-fail', undefined, fp, now);
  const cleanupKey = publicOrderAttemptKey('cleanup-fail');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    removeItem: () => { throw new Error('tab remove denied'); },
  }});
  assert.throws(() => discardPublicOrderAttemptAfterReview('cleanup-fail'), /No se pudo iniciar otro intento seguro/);
  assert.equal(JSON.parse(sharedStorage.get(cleanupKey)!).id, cleanupId,
    'Failed tab cleanup must leave shared pending ID untouched');
  Object.defineProperty(globalThis, 'sessionStorage', workingSession);
  discardPublicOrderAttemptAfterReview('cleanup-fail');
  assert.equal(sharedStorage.has(cleanupKey), false);
    // Si localStorage está bloqueado, se mantiene la compatibilidad por pestaña.
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => { throw new Error('shared denied'); },
  }});
  const fallbackId = getOrCreatePublicOrderAttempt('fallback-tab', undefined, fp, now);
  assert.equal(JSON.parse(storage.get(publicOrderAttemptKey('fallback-tab'))!).id, fallbackId);
  discardPublicOrderAttemptAfterReview('fallback-tab');
  assert.equal(storage.has(publicOrderAttemptKey('fallback-tab')), false, 'Review works without shared storage');
  Object.defineProperty(globalThis, 'localStorage', workingLocal);
  // Si solo sessionStorage falla, la referencia compartida permite continuar.
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: () => { throw new Error('tab denied'); },
  }});
  const sharedOnlyId = getOrCreatePublicOrderAttempt('shared-only', undefined, fp, now);
  assert.equal(JSON.parse(sharedStorage.get(publicOrderAttemptKey('shared-only'))!).id, sharedOnlyId);
  discardPublicOrderAttemptAfterReview('shared-only');
  assert.equal(sharedStorage.has(publicOrderAttemptKey('shared-only')), false, 'Review works without tab storage');
  Object.defineProperty(globalThis, 'sessionStorage', workingSession);
  // Una escritura silenciosamente ignorada en localStorage no autoriza un nuevo pedido.
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => sharedStorage.get(key) ?? null,
    setItem: () => {},
    removeItem: () => {},
  }});
  assert.throws(() => getOrCreatePublicOrderAttempt('silent-storage', undefined, fp, now),
    /No se pudo conservar/, 'Silently dropped shared write must fail closed');
  Object.defineProperty(globalThis, 'localStorage', workingLocal);
  for (const storageName of ['sessionStorage', 'localStorage']) {
    Object.defineProperty(globalThis, storageName, { configurable: true, value: {
      getItem: () => { throw new Error('storage disabled'); },
      setItem: () => { throw new Error('storage disabled'); },
      removeItem: () => { throw new Error('storage disabled'); },
    }});
  }
  assert.throws(() => getOrCreatePublicOrderAttempt('business-a', undefined, fp, now), /No se pudo conservar/);
  clearPublicOrderAttempt('business-a', undefined, first);
  assert.throws(() => getOrCreatePublicOrderAttempt('', undefined, fp, now), /inválida/);
  console.log('PASS: intento web compartido entre pestañas, conflicto y migración legacy; carrito cambiado, expiración y reloj bloquean ID nuevo hasta revisión; almacenamiento fail-closed.');
} finally {
  if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
  else Reflect.deleteProperty(globalThis, 'sessionStorage');
  if (originalLocal) Object.defineProperty(globalThis, 'localStorage', originalLocal);
  else Reflect.deleteProperty(globalThis, 'localStorage');
}
