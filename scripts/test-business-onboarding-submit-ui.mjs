// Prueba de la pantalla real de alta (React/jsdom). Registro y formulario hijo simulados.
// No crea cuentas, no usa Firebase ni escribe datos de producción.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const mocks = {
  './BusinessOnboarding': [
    'export function BusinessOnboarding({onComplete}) {',
    '  window.qa.complete = onComplete;',
    '  return null;',
    '}',
  ].join('\n'),
  '../../lib/businessAuthService': [
    'export function registerBusiness(input) {',
    '  window.qa.calls.push(input);',
    '  return new Promise((resolve, reject) => window.qa.pending.push({resolve, reject}));',
    '}',
  ].join('\n'),
  '../../data/businessTemplates': 'export const getBusinessTemplateConfig = () => ({capabilities:["CATALOG","POS"]});',
};
const bundle = await build({
  absWorkingDir: rootDir, bundle: true, write: false, format: 'iife', platform: 'browser',
  define: {'process.env.NODE_ENV': '"development"'},
  stdin: {resolveDir: rootDir, loader: 'jsx', contents: [
    "import React from 'react';",
    "import {createRoot} from 'react-dom/client';",
    "import {BusinessOnboardingDemo} from './src/components/platform/BusinessOnboardingDemo';",
    "const root = createRoot(document.getElementById('root'));",
    "window.qa.render = key => root.render(<BusinessOnboardingDemo key={key} />);",
    "window.qa.unmount = () => root.unmount();",
  ].join('\n')},
  plugins: [{name: 'mock-onboarding-boundaries', setup(build) {
    build.onResolve({filter: /.*/}, args => {
      if (args.importer.endsWith('/BusinessOnboardingDemo.tsx') && Object.hasOwn(mocks, args.path)) {
        return {path: args.path, namespace: 'mock'};
      }
    });
    build.onLoad({filter: /.*/, namespace: 'mock'}, args => ({contents: mocks[args.path], loader: 'js'}));
  }}],
});
const dom = new JSDOM('<div id="root"></div>', {
  url: 'https://example.test/#business-new', runScripts: 'outside-only',
  virtualConsole: new VirtualConsole(),
});
const {window} = dom;
const errors = [];
window.addEventListener('error', event => errors.push(event.error));
window.qa = {
  calls: [], pending: [], complete: null,
  profile: {
    name: 'Negocio ficticio A', handle: 'beta-a', businessType: 'restaurant',
    type: 'restaurant', email: 'owner-a@example.test', password: 'solo-prueba',
    assistantMode: 'GIOBOT_BASE', assistantName: 'Giobot',
  },
};
const visible = value => window.document.body.textContent.includes(value);
const waitFor = async (predicate, message) => {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(message);
};
const remount = async key => {
  const previous = window.qa.complete;
  window.location.hash = '#business-new';
  window.qa.render(key);
  await waitFor(() => window.qa.complete && window.qa.complete !== previous, 'No se remontó el formulario');
};
try {
  window.eval(bundle.outputFiles[0].text);
  await remount('primero');

  // Dos callbacks dentro del mismo turno de React solo pueden registrar una vez.
  window.qa.complete(window.qa.profile);
  window.qa.complete(window.qa.profile);
  await waitFor(() => window.qa.calls.length === 1, 'Falta el primer intento');
  assert.equal(window.qa.calls[0].handle, 'beta-a');
  assert.equal(window.qa.calls[0].capabilities.includes('POS'), true);
  assert.equal(visible('Creando tu negocio…'), true);
  window.qa.pending[0].resolve({});
  await waitFor(() => window.location.hash === '#business', 'El alta confirmada debe volver al portal');

  // Error recuperable: no dejar la pantalla bloqueada ni iniciar un segundo
  // registro antes de que termine el primero.
  await remount('segundo');
  window.qa.complete(window.qa.profile);
  await waitFor(() => window.qa.calls.length === 2, 'Falta intento con error');
  window.qa.pending[1].reject(new Error('Error de conexión simulado'));
  await waitFor(() => visible('Error de conexión simulado'), 'Mostrar fallo recuperable');
  await waitFor(() => !visible('Creando tu negocio…'), 'Liberar bloqueo tras fallo');
  window.qa.complete(window.qa.profile);
  await waitFor(() => window.qa.calls.length === 3, 'El reintento debe ser posible');
  window.qa.pending[2].resolve({});
  await waitFor(() => window.location.hash === '#business', 'Reintento confirmado');

  // Si el usuario cambia de ruta mientras la petición está en vuelo, una
  // respuesta tardía no debe enviarlo a otro negocio ni al portal.
  await remount('tercero');
  window.qa.complete(window.qa.profile);
  await waitFor(() => window.qa.calls.length === 4, 'Falta intento con cambio de ruta');
  window.location.hash = '#business/otro-negocio';
  window.qa.pending[3].resolve({});
  await waitFor(() => !visible('Creando tu negocio…'), 'Finalizar petición tardía');
  assert.equal(window.location.hash, '#business/otro-negocio', 'No secuestrar navegación posterior');

  // Desmontar durante un fallo no debe producir errores React ni redirección.
  await remount('cuarto');
  window.qa.complete(window.qa.profile);
  await waitFor(() => window.qa.calls.length === 5, 'Falta intento antes de desmontar');
  window.qa.unmount();
  window.qa.pending[4].reject(new Error('Fallo después de salir'));
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(window.location.hash, '#business-new');
  assert.deepEqual(errors, [], 'Sin errores no controlados de React');
  console.log('PASS: doble envío síncrono, fallo/reintento, cambio de ruta y desmontaje en alta (React/jsdom, sin Firebase).');
} finally {
  window.close();
}
