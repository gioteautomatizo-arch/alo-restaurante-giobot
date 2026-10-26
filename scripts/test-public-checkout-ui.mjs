// Real React component, in-memory DOM and mocked data boundary: no Firebase/network writes.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mocks = {
  '../../lib/ordersService': `export async function createBusinessRestaurantOrder(id, order) {
    window.qa.calls.push({id, order});
    return new Promise((resolve, reject) => {
      window.qa.resolve = () => resolve({code: 'TEST-001'});
      window.qa.reject = () => reject(new Error('simulated offline'));
    });
  }`,
  'firebase/firestore': `export const doc = (_, collection, id) => ({id});
    export async function getDoc(ref) {
      window.qa.reads++;
      if (window.qa.failProfile) throw new Error('simulated offline');
      return {exists: () => !window.qa.missing, data: () => ({published: true,
        branding: {restaurantName: 'Negocio ' + ref.id, whatsapp: ''}})};
    }`,
  '../../lib/firebase': `export const db = {};`,
  '../../lib/businessCatalogService': `export function subscribeToBusinessCatalog(id, callback) {
    callback({items: [{id: 'taco', name: 'Taco de prueba', description: 'Prueba',
      category: 'Comida', price: 25, sortOrder: 1, available: true}]});
    return () => {};
  }`,
  '../../lib/vipStorage': `export const getVipProfile = () => null; export const VIP_DATA_EVENT = 'vip-test';`,
  '../VipCardModal': `export const VipCardModal = () => null;`,
};
const bundle = await build({
  absWorkingDir: root, bundle: true, write: false, format: 'iife', platform: 'browser',
  define: {'process.env.NODE_ENV': '"development"'},
  stdin: {resolveDir: root, loader: 'jsx', contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {BusinessPublicPage} from './src/components/platform/BusinessPublicPage';
    const root = createRoot(document.getElementById('root'));
    window.qa.render = id => root.render(<BusinessPublicPage businessId={id} />);
    window.qa.unmount = () => root.unmount();
    window.qa.render('demo-a');
  `},
  plugins: [{name: 'mock-data-boundary', setup(build) {
    build.onResolve({filter: /.*/}, args => {
      if (args.importer.endsWith('/BusinessPublicPage.tsx') && mocks[args.path]) {
        return {path: args.path, namespace: 'mock'};
      }
    });
    build.onLoad({filter: /.*/, namespace: 'mock'}, args => ({contents: mocks[args.path], loader: 'js'}));
  }}],
});
const dom = new JSDOM('<div id="root"></div>', {url: 'http://localhost/', runScripts: 'outside-only', virtualConsole: new VirtualConsole()});
const {window} = dom;
window.qa = {calls: [], reads: 0, failProfile: true, missing: false};
const errors = [];
window.addEventListener('error', event => errors.push(event.error));
const document = window.document;
const button = text => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === text || (text.startsWith('Ver mi pedido') && el.textContent.trim().startsWith(text)));
const waitFor = async (condition, message) => {
  for (let i = 0; i < 200; i++) {
    if (condition()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(message);
};
try {
  window.eval(bundle.outputFiles[0].text);
  await waitFor(() => button('Reintentar'), 'Profile error needs retry action');
  window.qa.failProfile = false;
  button('Reintentar').click();
  await waitFor(() => button('Agregar'), 'Retry must recover catalog');
  assert.equal(window.qa.reads, 2);
  button('Agregar').click();
  await waitFor(() => button('Ver mi pedido (1)'), 'Product added');
  button('Ver mi pedido (1)').click();
  await waitFor(() => button('Enviar pedido al negocio'), 'Cart open');
  const send = button('Enviar pedido al negocio');
  // Same JS turn: React has not yet rendered disabled=true.
  send.click();
  send.click();
  assert.equal(window.qa.calls.length, 1, 'Two immediate clicks must create only one request');
  await waitFor(() => button('Enviando…'), 'Pending state visible');
  for (const selector of ['[aria-label="Quitar uno"]', '[aria-label="Agregar uno"]', 'input[placeholder="Tu nombre (opcional)"]', 'textarea']) {
    assert.equal(document.querySelector(selector).disabled, true, `${selector} must freeze while saving`);
  }
  assert.equal(button('Vaciar pedido').disabled, true);
  assert.equal(window.qa.calls[0].id, 'demo-a');
  assert.equal(window.qa.calls[0].order.total, 25);
  assert.equal(window.qa.calls[0].order.items[0].quantity, 1);
  window.qa.reject();
  await waitFor(() => document.querySelector('[role="alert"]')?.textContent.includes('Conservamos tu pedido'), 'Failure should explain uncertainty');
  assert.equal(button('Enviar pedido al negocio').disabled, false);
  assert.equal(document.querySelector('[aria-label="Agregar uno"]').disabled, false);
  button('Enviar pedido al negocio').click();
  assert.equal(window.qa.calls.length, 2, 'Explicit retry after failure allowed');
  window.qa.resolve();
  await waitFor(() => button('Seguir viendo el menú'), 'Success confirmation');
  assert.ok(document.body.textContent.includes('TEST-001'));
  button('Seguir viendo el menú').click();
  button('Agregar').click();
  await waitFor(() => button('Ver mi pedido (1)'), 'Fresh cart');
  window.qa.render('demo-b');
  await waitFor(() => document.body.textContent.includes('Negocio demo-b'), 'Second tenant loaded');
  assert.equal(button('Ver mi pedido (1)'), undefined, 'Never reuse another tenant cart');
  window.qa.missing = true;
  window.qa.render('missing-business');
  await waitFor(() => document.body.textContent.includes('Este negocio no existe'), 'Missing state');
  assert.equal(document.querySelector('a').getAttribute('href'), '/#explorar');
  // QR multinegocio: pedir personas antes de mostrar catálogo y no heredar contexto.
  window.qa.missing = false;
  window.history.replaceState(null, '', '/#negocio/demo-table?table=3');
  window.qa.render('demo-table');
  await waitFor(() => button('Ver menú de la mesa'), 'Table arrival screen');
  assert.equal(button('Ver menú de la mesa').disabled, true, 'No default guest count');
  assert.equal(button('Agregar'), undefined, 'Menu is gated until guest choice');
  document.querySelector('[aria-label="4 personas"]').click();
  await waitFor(() => !button('Ver menú de la mesa').disabled, 'Guest selected');
  button('Ver menú de la mesa').click();
  await waitFor(() => button('Agregar'), 'Menu opens for selected table');
  assert.ok(document.querySelector('[aria-label="Tu mesa"]').textContent.includes('Mesa 3 · 4 personas'));
  button('Agregar').click();
  await waitFor(() => button('Ver mi pedido (1)'), 'Table cart');
  button('Ver mi pedido (1)').click();
  await waitFor(() => button('Enviar pedido al negocio'), 'Table checkout');
  button('Enviar pedido al negocio').click();
  await waitFor(() => button('Enviando…'), 'Table sending');
  const tableOrder = window.qa.calls.at(-1);
  assert.equal(tableOrder.id, 'demo-table');
  assert.equal(tableOrder.order.tableNumber, 3);
  assert.equal(tableOrder.order.orderOrigin, 'MESA_QR');
  assert.equal(tableOrder.order.notes, 'Mesa 3 · 4 personas');
  assert.equal(button('Cambiar personas').disabled, true);
  window.qa.resolve();
  await waitFor(() => button('Seguir viendo el menú'), 'Table order confirmed');
  window.history.replaceState(null, '', '/?table=7');
  window.qa.render('demo-table');
  await waitFor(() => button('Ver menú de la mesa'), 'Old query format table route');
  assert.ok(document.body.textContent.includes('Mesa 7'));
  assert.equal(button('Ver menú de la mesa').disabled, true, 'Different table resets guest count');
  window.history.replaceState(null, '', '/#negocio/demo-other?table=7');
  window.qa.render('demo-other');
  await waitFor(() => document.body.textContent.includes('Negocio demo-other'), 'Other tenant same table');
  assert.equal(button('Ver menú de la mesa').disabled, true);
  window.history.replaceState(null, '', '/?table=0');
  window.qa.render('demo-other');
  await waitFor(() => document.body.textContent.includes('El QR no tiene una mesa válida'), 'Invalid table blocked');
  assert.equal(button('Agregar'), undefined);
  assert.deepEqual(errors, [], 'No React errors');
  console.log('PASS: retry profile, same-turn double submit, frozen cart, failure recovery, success, tenant switch and table QR guest selection (React + DOM; mocked backend).');
} finally {
  window.qa.unmount?.();
  window.close();
}
