// Prueba React/jsdom del checkout seguro opt-in: cero escrituras Firebase.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mocks = {
  '../../lib/ordersService': "export async function createBusinessRestaurantOrder() { window.qa.legacyWrites++; throw new Error('Fallback prohibido'); }",
  '../../lib/publicOrderClientApi': [
    'export const isSecurePublicCheckoutEnabled = () => true;',
    'export function submitTrustedPublicOrder(draft) {',
    '  window.qa.secureCalls.push(draft);',
    '  return new Promise((resolve, reject) => { window.qa.resolveOrder = resolve; window.qa.rejectOrder = reject; });',
    '}',
  ].join('\n'),
  'firebase/firestore': [
    'export const doc = (_, ...parts) => ({id: parts.at(-1), path: parts.join("/")});',
    'export async function getDocFromServer(ref) {',
    '  if (ref.path.startsWith("publicBusinessProfiles/")) return {exists: () => true, data: () => ({published: true})};',
    '  return {exists: () => true, data: () => ({businessId: ref.path.split("/")[1],',
    '    items: [{id: "taco", name: "Taco demo", description: "Prueba", category: "Tacos",',
    '      price: 25, sortOrder: 1, available: true}]})};',
    '}',
    'export async function getDoc(ref) {',
    '  return {exists: () => true, data: () => ({published: true,',
    '    branding: {restaurantName: "Demo " + ref.id, whatsapp: "5512345678"}})};',
    '}',
  ].join('\n'),
  '../../lib/firebase': 'export const db = {};',
  '../../lib/businessCatalogService': [
    'export function subscribeToBusinessCatalog(id, callback) {',
    '  callback({items: [{id: "taco", name: "Taco demo", description: "Prueba",',
    '    category: "Tacos", price: 25, sortOrder: 1, available: true}]});',
    '  return () => {};',
    '}',
  ].join('\n'),
  '../../lib/vipStorage': "export const getVipProfile = () => null; export const VIP_DATA_EVENT = 'vip-test';",
  '../VipCardModal': 'export const VipCardModal = () => null;',
};
const bundle = await build({
  absWorkingDir: root, bundle: true, write: false, format: 'iife', platform: 'browser',
  define: {'process.env.NODE_ENV': '"development"'},
  stdin: {resolveDir: root, loader: 'jsx', contents: [
    "import React from 'react';",
    "import {createRoot} from 'react-dom/client';",
    "import {BusinessPublicPage} from './src/components/platform/BusinessPublicPage';",
    "let root = createRoot(document.getElementById('root'));",
    'window.qa.render = id => root.render(<BusinessPublicPage businessId={id} />);',
    'window.qa.unmount = () => root.unmount();',
    "window.qa.render('secure-a');",
  ].join('\n')},
  plugins: [{name: 'mock-data-boundary', setup(build) {
    build.onResolve({filter: /.*/}, args => {
      if (args.importer.endsWith('/BusinessPublicPage.tsx') && mocks[args.path]) return {path: args.path, namespace: 'mock'};
    });
    build.onLoad({filter: /.*/, namespace: 'mock'}, args => ({contents: mocks[args.path], loader: 'js'}));
  }}],
});
const dom = new JSDOM('<div id="root"></div>', {
  url: 'http://localhost/#negocio/secure-a',
  runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
});
const {window} = dom;
window.qa = {secureCalls: [], legacyWrites: 0, popups: [], locks: []};
Object.defineProperty(window.navigator, 'locks', {configurable: true, value: {
  request: async (name, options, callback) => { window.qa.locks.push({name, mode: options.mode}); return callback(); },
}});
window.open = (url) => {
  const popup = {location: {href: url}, closed: false, close() { this.closed = true; }};
  window.qa.popups.push(popup);
  return popup;
};
const errors = [];
window.addEventListener('error', event => errors.push(event.error));
const doc = window.document;
const button = label => [...doc.querySelectorAll('button')].find(el =>
  el.textContent.trim() === label || (label.startsWith('Ver mi pedido') && el.textContent.trim().startsWith(label)));
const waitFor = async (condition, reason) => {
  for (let i = 0; i < 250; i++) {
    if (condition()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(reason);
};
try {
  window.eval(bundle.outputFiles[0].text);
  await waitFor(() => button('Agregar'), 'Catalogo visible');
  button('Agregar').click();
  await waitFor(() => button('Ver mi pedido (1)'), 'Producto agregado');
  button('Ver mi pedido (1)').click();
  await waitFor(() => button('Enviar pedido (se registra y abre WhatsApp)'), 'Checkout abierto');
  button('Enviar pedido (se registra y abre WhatsApp)').click();
  await waitFor(() => window.qa.secureCalls.length === 1, 'Primer envio API');
  assert.equal(window.qa.legacyWrites, 0);
  const attempt = window.qa.secureCalls[0].attemptId;
  assert.match(attempt, /^web_[0-9a-f]{32}$/);
  const firstPopup = window.qa.popups[0];
  window.qa.rejectOrder(new Error('API offline'));
  await waitFor(() => firstPopup.closed, 'Fallo cierra WhatsApp');
  assert.equal(firstPopup.location.href, '');
  assert.equal(window.qa.legacyWrites, 0, 'Ningun fallback Firestore');
  await waitFor(() => button('Enviar pedido (se registra y abre WhatsApp)')?.disabled === false, 'Reintento listo');
  button('Enviar pedido (se registra y abre WhatsApp)').click();
  await waitFor(() => window.qa.secureCalls.length === 2, 'Reintento API');
  assert.equal(window.qa.secureCalls[1].attemptId, attempt, 'Mismo ID');
  window.qa.resolveOrder({
    id: 'web_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', code: 'WEB-TEST-01', total: 30, created: true,
    items: [{productId: 'taco', name: 'Taco demo', quantity: 1, totalPrice: 30}],
  });
  await waitFor(() => button('Seguir viendo el menú'), 'Respuesta del servidor confirmada');
  const receipts = doc.querySelector('[aria-label="Pedidos enviados"]')?.textContent || '';
  assert.ok(receipts.includes('$30.00'), 'El comprobante debe usar el precio del servidor');
  await waitFor(() => window.qa.popups[1].location.href.startsWith('https://wa.me/'), 'WhatsApp confirmado');
  const whatsapp = decodeURIComponent(window.qa.popups[1].location.href);
  assert.match(whatsapp, /Total: \$30.00/);
  assert.ok(whatsapp.includes('WEB-TEST-01'));
  assert.equal(window.qa.legacyWrites, 0);
  button('Seguir viendo el menú').click();

  window.history.replaceState(null, '', '/#negocio/secure-table?table=3');
  window.qa.render('secure-table');
  await waitFor(() => button('Ver menú de la mesa'), 'Entrada a mesa');
  doc.querySelector('[aria-label="4 personas"]').click();
  await waitFor(() => !button('Ver menú de la mesa').disabled, 'Personas seleccionadas');
  button('Ver menú de la mesa').click();
  await waitFor(() => button('Agregar'), 'Carta de mesa');
  button('Agregar').click();
  await waitFor(() => button('Ver mi pedido (1)'), 'Carrito mesa');
  button('Ver mi pedido (1)').click();
  button('Enviar pedido (se registra y abre WhatsApp)').click();
  await waitFor(() => window.qa.secureCalls.length === 3, 'Envio de mesa por API');
  assert.equal(window.qa.secureCalls[2].businessId, 'secure-table');
  assert.equal(window.qa.secureCalls[2].tableNumber, 3);
  assert.equal(window.qa.secureCalls[2].guestCount, 4);
  assert.equal(window.qa.legacyWrites, 0);
  window.qa.resolveOrder({
    id: 'web_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', code: 'WEB-TEST-02', total: 25, created: true,
    items: [{productId: 'taco', name: 'Taco demo', quantity: 1, totalPrice: 25}],
  });
  await waitFor(() => button('Seguir viendo el menú'), 'Mesa confirmada');
  assert.deepEqual(errors, [], 'Sin errores React');
  console.log('PASS: checkout React opt-in sin fallback, reintento con mismo ID, recibo/WhatsApp confiables y mesa A/B.');
} finally {
  window.qa.unmount?.();
  window.close();
}
