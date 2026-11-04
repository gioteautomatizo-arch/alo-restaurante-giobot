// React real; consultas y escrituras simuladas. No usa cuentas ni dinero reales.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const mocks = {
  './BusinessTableReconciliation': 'export const BusinessTableReconciliation = () => null;',
  '../../lib/firebase': 'export const getCurrentAuthUser = () => window.qa.user;',
  '../../lib/ordersService': `export const subscribeToBusinessRestaurantOrders = (id, next, error) => window.qa.subscribe(id, 'orders', next, error);`,
  '../../lib/tenantModules': `
    export const subscribeToModule = (id, name, next, sort, error) => window.qa.subscribe(id, name, next, error);
    export const saveModuleDoc = (id, name, data, audit) => new Promise((resolve, reject) => window.qa.writes.push({id, name, data, audit, resolve, reject}));
  `,
};
const bundle = await build({
  absWorkingDir: rootDir, bundle: true, write: false, format: 'iife', platform: 'browser',
  define: { 'process.env.NODE_ENV': '"development"' },
  stdin: { resolveDir: rootDir, loader: 'jsx', contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {BusinessShiftView} from './src/components/platform/BusinessShiftView';
    const root = createRoot(document.getElementById('root'));
    window.qa.render = id => root.render(<BusinessShiftView businessId={id} />);
    window.qa.unmount = () => root.unmount();
  ` },
  plugins: [{ name: 'shift-data-boundary', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => {
      if (args.importer.endsWith('/BusinessShiftView.tsx') && Object.hasOwn(mocks, args.path)) {
        return { path: args.path, namespace: 'mock' };
      }
    });
    plugin.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], loader: 'js' }));
  } }],
});
const dom = new JSDOM('<div id="root"></div>', {
  url: 'https://example.test/', runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
});
const { window } = dom, document = window.document;
const errors = [];
window.addEventListener('error', event => errors.push(event.error));
window.qa = {
  user: { uid: 'owner-a', displayName: 'Persona A' }, writes: [], subscriptions: [],
  subscribe(id, name, next, error) {
    const sub = { id, name, next, error, stopped: false };
    this.subscriptions.push(sub);
    return () => { sub.stopped = true; };
  },
};
const qa = window.qa;
const waitFor = async (predicate, label) => {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(label);
};
const button = label => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === label);
const input = () => document.querySelector('input');
function enter(value) {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input(), value);
  input().dispatchEvent(new window.Event('input', { bubbles: true }));
}
const active = (id, name) => qa.subscriptions.findLast(s => s.id === id && s.name === name && !s.stopped);
const shift = id => ({ id, status: 'abierto', shiftType: 'AM', openedAt: '2026-10-31T15:00:00Z', openedByName: id, initialCashFund: 100 });
function feed(id, shifts = []) {
  for (const name of ['shifts', 'orders', 'expenses', 'vault']) active(id, name).next(name === 'shifts' ? shifts : []);
}
try {
  window.eval(bundle.outputFiles[0].text);
  qa.render('tenant-a');
  await waitFor(() => active('tenant-a', 'orders'), 'Suscripciones A');
  assert(!button('Abrir turno'), 'No operar con consultas incompletas');
  feed('tenant-a');
  await waitFor(() => button('Abrir turno'), 'A listo');
  enter('100');
  await waitFor(() => !button('Abrir turno').disabled, 'Fondo válido');
  const open = button('Abrir turno');
  open.click(); open.click();
  assert.equal(qa.writes.length, 1, 'Dos clics en el mismo turno de JS solo envían una apertura');
  await waitFor(() => button('Abriendo…')?.disabled, 'Bloqueo mientras guarda');
  assert(input().disabled, 'No editar fondo durante apertura');
  qa.writes[0].reject(new window.Error('No se pudo guardar'));
  await waitFor(() => button('Abrir turno') && document.body.textContent.includes('No se pudo guardar'), 'Error recuperable');
  assert.equal(input().value, '100');

  // Error de lectura: reconsultar no escribe, cancela listeners anteriores y
  // conserva el importe capturado. Un callback viejo no habilita la pantalla.
  const oldSubscriptions = qa.subscriptions.slice();
  active('tenant-a', 'orders').error(new Error('Sin permiso'));
  await waitFor(() => button('Reintentar consulta'), 'Reintento visible');
  assert(!button('Abrir turno'));
  button('Reintentar consulta').click();
  await waitFor(() => oldSubscriptions.every(s => s.stopped) && qa.subscriptions.length === 8, 'Renovar los cuatro feeds');
  oldSubscriptions.forEach(s => s.next([]));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert(!button('Abrir turno'), 'Callback cancelado no habilita Caja');
  assert.equal(qa.writes.length, 1, 'Reintentar lecturas nunca repite escritura');
  feed('tenant-a');
  await waitFor(() => button('Abrir turno'), 'Lectura recuperada');
  assert.equal(input().value, '100', 'Reintento conserva captura propia');
  button('Abrir turno').click();
  assert.equal(qa.writes.length, 2, 'Reintento explícito tras rechazo');

  // Navegar mientras sigue guardando: no compartir busy, importes ni errores.
  qa.render('tenant-b');
  await waitFor(() => active('tenant-b', 'orders'), 'Suscripciones B');
  feed('tenant-b');
  await waitFor(() => button('Abrir turno'), 'B listo');
  assert.equal(input().value, '');
  qa.writes[1].reject(new window.Error('Error tardío del negocio A'));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert(!document.body.textContent.includes('Error tardío'));
  assert(!button('Abriendo…'));

  // Cierre: dos clics solo envían uno; un error permite corregir y reintentar.
  active('tenant-b', 'shifts').next([shift('turno-b')]);
  await waitFor(() => button('Cerrar turno'), 'Turno B abierto');
  const paidOrder = (orderType, paidAt, total) => ({
    orderType, paidAt, total, billingStatus: 'PAGADO', status: 'ENTREGADO', paymentMethod: 'efectivo',
    createdAt: '2026-10-31T15:01:00Z',
  });
  active('tenant-b', 'orders').next([
    paidOrder('dine_in', '2026-10-31T15:05:00Z', 40),
    paidOrder('pickup', '2026-10-31T15:06:00Z', 50),
  ]);
  await waitFor(() => button('Cerrar turno')?.disabled && document.body.textContent.includes('Caja sin conciliación de mesa'), 'Bloqueo por pago de mesa');
  assert(document.body.textContent.includes('$50.00'), 'El total provisional solo incluye pickup, no los $40 de mesa');
  assert.equal(qa.writes.length, 2, 'Un pago de mesa no provoca escrituras');
  active('tenant-b', 'orders').next([paidOrder('dine_in', undefined, 40)]);
  await waitFor(() => document.body.textContent.includes('1 sin fecha de cobro verificable'), 'Bloqueo histórico de mesa');
  assert(button('Cerrar turno').disabled, 'No cerrar mesa sin fecha de pago');
  active('tenant-b', 'orders').next([]);
  await waitFor(() => !button('Cerrar turno')?.disabled, 'Se recupera el cierre al retirar anomalías ficticias');
  button('Cerrar turno').click();
  await waitFor(() => button('Confirmar cierre'), 'Formulario de cierre');
  enter('100');
  await waitFor(() => !button('Confirmar cierre').disabled, 'Conteo válido');
  const close = button('Confirmar cierre');
  close.click(); close.click();
  assert.equal(qa.writes.length, 3, 'Un único cierre');
  assert.equal(qa.writes[2].id, 'tenant-b');
  assert.equal(qa.writes[2].data.id, 'turno-b');
  assert.equal(qa.writes[2].data.cashDifference, 0);
  await waitFor(() => button('Cerrando…'), 'Guardando cierre');
  assert(input().disabled && document.querySelector('textarea').disabled && button('Cancelar').disabled);
  qa.writes[2].reject(new window.Error('Cierre rechazado'));
  await waitFor(() => button('Confirmar cierre') && document.body.textContent.includes('Cierre rechazado'), 'Reintento de cierre');
  assert.equal(input().value, '100');
  button('Confirmar cierre').click();
  assert.equal(qa.writes.length, 4);

  // Misma empresa, otra cuenta: remonta y no comparte formulario ni resultado.
  qa.user = { uid: 'owner-b', displayName: 'Persona B' };
  const oldB = active('tenant-b', 'shifts');
  qa.render('tenant-b');
  await waitFor(() => oldB.stopped && active('tenant-b', 'orders'), 'Cambio de cuenta reinicia consultas');
  feed('tenant-b', [shift('turno-b')]);
  await waitFor(() => button('Cerrar turno'), 'Nueva cuenta sin formulario viejo');
  button('Cerrar turno').click();
  await waitFor(() => input(), 'Nuevo conteo');
  enter('80');
  await waitFor(() => input().value === '80', 'Captura nueva');
  qa.writes[3].resolve('turno-b');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(input().value, '80', 'El éxito tardío no limpia la nueva captura');
  assert(button('Confirmar cierre'), 'El éxito viejo no cierra el formulario actual');

  // La sesión puede desaparecer antes de que el contenedor vuelva a renderizar.
  qa.user = null;
  button('Confirmar cierre').click();
  assert.equal(qa.writes.length, 4, 'No escribir desde una sesión ya cerrada');
  assert.deepEqual(errors, []);
  console.log('PASS: Caja React evita doble envío, conserva captura al reconsultar, cancela callbacks viejos y aísla negocio/cuenta y respuestas tardías. Backend simulado; no certifica concurrencia entre dispositivos.');
} finally {
  qa.unmount?.();
  dom.window.close();
}
