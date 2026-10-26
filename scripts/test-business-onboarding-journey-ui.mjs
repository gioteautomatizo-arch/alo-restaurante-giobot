// Recorre el formulario REAL de seis pantallas en React/jsdom con dos negocios ficticios.
// Solo se simulan las fronteras de subida y registro: no hay Firebase ni tráfico externo.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({
  absWorkingDir: rootDir, bundle: true, write: false, format: 'iife', platform: 'browser',
  define: {'process.env.NODE_ENV': '"development"'},
  stdin: {resolveDir: rootDir, loader: 'jsx', contents: [
    "import React from 'react';",
    "import {createRoot} from 'react-dom/client';",
    "import {BusinessOnboarding} from './src/components/platform/BusinessOnboarding';",
    "const root = createRoot(document.getElementById('root'));",
    "window.qa.render = key => root.render(<BusinessOnboarding key={key} onCancel={() => window.qa.cancels++} onComplete={profile => {window.qa.calls.push(profile); return new Promise((resolve,reject) => window.qa.pending.push({resolve,reject}));}} />);",
    "window.qa.unmount = () => root.unmount();",
  ].join('\n')},
  plugins: [{name: 'mock-logo-upload-only', setup(build) {
    build.onResolve({filter: /^\.\.\/\.\.\/lib\/menuImagesService$/}, args => {
      if (args.importer.endsWith('/BusinessOnboarding.tsx')) return {path: 'logo', namespace: 'qa'};
    });
    build.onLoad({filter: /.*/, namespace: 'qa'}, () => ({
      contents: "export async function uploadBusinessLogo(id, file) {window.qa.uploads.push({id, name:file.name}); return 'https://example.test/logo-b.png';}",
      loader: 'js',
    }));
  }}],
});

const dom = new JSDOM('<div id="root"></div>', {
  url: 'https://example.test/#business-new', runScripts: 'outside-only',
  virtualConsole: new VirtualConsole(),
});
const {window} = dom;
const document = window.document;
const errors = [];
window.addEventListener('error', event => errors.push(event.error));
window.qa = {calls: [], pending: [], uploads: [], cancels: 0};
const visible = value => document.body.textContent.includes(value);
const waitFor = async (predicate, message) => {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(message);
};
const button = label => [...document.querySelectorAll('button')]
  .find(el => el.textContent.trim() === label);
const back = () => document.querySelector('button[aria-label="Volver"]');
const clickNext = async (expectedText) => {
  const next = button('Siguiente');
  assert(next && !next.disabled, 'Siguiente debe estar habilitado');
  next.click();
  await waitFor(() => visible(expectedText), 'No avanzó al paso: ' + expectedText);
};
const setInput = (selector, value) => {
  const input = document.querySelector(selector);
  assert(input, 'Falta input ' + selector);
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new window.Event('input', {bubbles: true}));
  input.dispatchEvent(new window.Event('change', {bubbles: true}));
};
const fillIdentity = async (name, handle, email) => {
  await clickNext('¿Qué tipo de negocio quieres abrir?');
  if (handle === 'beta-a') {
    const ghost = [...document.querySelectorAll('button')].find(el => el.textContent.includes('Ghost Kitchen'));
    assert(ghost, 'Debe ofrecer Ghost Kitchen');
    ghost.click();
  }
  await clickNext('Dale identidad a tu negocio.');
  assert(button('Siguiente').disabled, 'Sin nombre no puede avanzar');
  setInput('input[placeholder="Ej. Pizzería Luna"]', name);
  setInput('input[placeholder="pizzeria-luna"]', handle);
  await waitFor(() => !button('Siguiente').disabled, 'Nombre y handle válidos deben habilitar Siguiente');
  await clickNext('Crea tu acceso.');
  assert(button('Siguiente').disabled, 'Sin credenciales no puede avanzar');
  setInput('input[type="email"]', 'incorrecto');
  setInput('input[type="password"]', '123');
  assert(button('Siguiente').disabled, 'Correo y contraseña inválidos deben bloquear avance');
  setInput('input[type="email"]', email);
  setInput('input[type="password"]', 'EmulatorOnlyPass123!');
  await waitFor(() => !button('Siguiente').disabled, 'Credenciales válidas deben habilitar avance');
  await clickNext('Agrega la imagen de tu negocio.');
};
try {
  window.eval(bundle.outputFiles[0].text);
  window.qa.render('tenant-a');
  await waitFor(() => visible('Crea el espacio digital de tu negocio.'), 'No abrió alta A');
  await fillIdentity('Negocio ficticio A', 'beta-a', 'owner-a@example.test');
  const skip = button('Omitir por ahora');
  assert(skip, 'El logo debe ser opcional');
  skip.click();
  await waitFor(() => visible('Elige quién atenderá con IA.'), 'No avanzó a asistente A');
  const custom = [...document.querySelectorAll('button')].find(el => el.textContent.includes('Avatar propio'));
  assert(custom);
  custom.click();
  await waitFor(() => !!document.querySelector('input[placeholder^="Nombre del asistente"]'), 'Falta nombre de avatar');
  setInput('input[placeholder^="Nombre del asistente"]', 'Tita A');
  await clickNext('Tu negocio ya tiene identidad.');
  const submit = button('Crear mi negocio');
  assert(submit);
  submit.click();
  submit.click();
  await waitFor(() => window.qa.calls.length === 1, 'A debe registrar un solo intento');
  assert.equal(window.qa.calls[0].handle, 'beta-a');
  assert.equal(window.qa.calls[0].assistantName, 'Tita A');
  assert.equal(window.qa.calls[0].logoDataUrl, undefined);
  await waitFor(() => back()?.disabled === true, 'Volver debe bloquearse mientras registra');
  back().click();
  assert(visible('Tu negocio ya tiene identidad.'), 'No regresar durante alta pendiente');
  assert.equal(window.qa.calls.length, 1, 'Doble clic no duplica alta');
  window.qa.pending[0].reject(new Error('Fallo de red simulado'));
  await waitFor(() => visible('Fallo de red simulado') && !back().disabled, 'Error debe permitir reintentar');
  button('Crear mi negocio').click();
  await waitFor(() => window.qa.calls.length === 2, 'Reintento A no ejecutado');
  window.qa.pending[1].resolve();
  await waitFor(() => !back().disabled, 'Formulario A debe desbloquearse');

  // Segundo propietario: mismo formulario real, nuevo estado y logo opcional.
  window.qa.render('tenant-b');
  await waitFor(() => visible('Crea el espacio digital de tu negocio.'), 'No abrió alta B limpia');
  assert.equal(visible('Negocio ficticio A'), false, 'No conservar identidad del negocio A');
  await fillIdentity('Negocio ficticio B', 'beta-b', 'owner-b@example.test');
  const logoInput = document.querySelector('input[type="file"]');
  assert(logoInput, 'Falta selector de logo');
  Object.defineProperty(logoInput, 'files', {
    configurable: true, value: [new window.File(['imagen ficticia'], 'logo-b.png', {type: 'image/png'})],
  });
  logoInput.dispatchEvent(new window.Event('change', {bubbles: true}));
  await waitFor(() => visible('Quitar foto'), 'No cargó vista previa de logo B');
  await clickNext('Elige quién atenderá con IA.');
  await clickNext('Tu negocio ya tiene identidad.');
  button('Crear mi negocio').click();
  await waitFor(() => window.qa.calls.length === 3, 'B no registró su intento');
  assert.deepEqual(window.qa.uploads, [{id: 'beta-b', name: 'logo-b.png'}]);
  assert.equal(window.qa.calls[2].handle, 'beta-b');
  assert.equal(window.qa.calls[2].assistantName, 'Giobot');
  assert.equal(window.qa.calls[2].logoDataUrl, 'https://example.test/logo-b.png');
  assert.equal(window.qa.calls[2].email, 'owner-b@example.test');
  window.qa.pending[2].resolve();
  await waitFor(() => !back().disabled, 'Formulario B debe desbloquearse');

  window.qa.render('cancel');
  await waitFor(() => visible('Crea el espacio digital de tu negocio.'), 'No abrió formulario cancelable');
  back().click();
  assert.equal(window.qa.cancels, 1, 'Volver en portada debe cancelar');
  assert.deepEqual(errors, [], 'No debe haber errores React no controlados');
  console.log('PASS: seis pantallas reales, validaciones, dos negocios aislados, logo, doble envío, bloqueo de Volver, fallo/reintento y cancelación (React/jsdom; backend simulado).');
} finally {
  window.qa.unmount?.();
  window.close();
}
