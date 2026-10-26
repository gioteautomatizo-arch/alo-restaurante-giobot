// Puente de integración: formulario React REAL → servicio registerBusiness REAL.
// Únicamente se simula la subida de logotipo (no se selecciona archivo).
// Auth y Firestore se conectan a emuladores desde el proceso llamador.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
let bundlePromise;
function getBundle() {
  bundlePromise ??= build({
    absWorkingDir: rootDir,
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    define: { 'process.env.NODE_ENV': '"development"' },
    stdin: {
      resolveDir: rootDir,
      loader: 'jsx',
      contents: [
        "import React from 'react';",
        "import {createRoot} from 'react-dom/client';",
        "import {BusinessOnboarding} from './src/components/platform/BusinessOnboarding';",
        "const root = createRoot(document.getElementById('root'));",
        "window.qa.mount = () => root.render(<BusinessOnboarding onCancel={() => window.qa.cancels++} onComplete={async profile => {window.qa.submissions.push(profile); try {window.qa.result = await window.qa.register(profile);} catch (error) {window.qa.failure = error; throw error;}}} />);",
        "window.qa.unmount = () => root.unmount();",
      ].join('\n'),
    },
    plugins: [{
      name: 'no-real-logo-upload',
      setup(plugin) {
        plugin.onResolve({ filter: /^\.\.\/\.\.\/lib\/menuImagesService$/ }, args => {
          if (args.importer.endsWith('/BusinessOnboarding.tsx')) {
            return { path: 'logo-upload-disabled', namespace: 'qa' };
          }
        });
        plugin.onLoad({ filter: /.*/, namespace: 'qa' }, () => ({
          contents: 'export async function uploadBusinessLogo() {throw new Error("Logo upload disabled in emulator UI test");}',
          loader: 'js',
        }));
      },
    }],
  });
  return bundlePromise;
}

const waitFor = async (predicate, message) => {
  for (let attempt = 0; attempt < 300; attempt++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(message);
};

export async function registerThroughOnboardingUI({ name, handle, email, businessType, onRegister }) {
  assert(['restaurant', 'ghost-kitchen'].includes(businessType), 'Tipo de negocio ficticio');
  const bundle = await getBundle();
  const dom = new JSDOM('<div id="root"></div>', {
    url: 'https://example.test/#business-new',
    runScripts: 'outside-only',
    virtualConsole: new VirtualConsole(),
  });
  const { window } = dom;
  const document = window.document;
  const errors = [];
  window.addEventListener('error', event => errors.push(event.error));
  window.qa = {
    submissions: [],
    result: null,
    failure: null,
    cancels: 0,
    register: profile => onRegister({
      businessName: profile.name,
      handle: profile.handle,
      businessType: profile.businessType,
      email: profile.email,
      password: profile.password,
      assistantName: profile.assistantName,
      assistantMode: profile.assistantMode,
      logoUrl: profile.logoDataUrl,
    }),
  };
  const visible = text => document.body.textContent.includes(text);
  const button = label => [...document.querySelectorAll('button')]
    .find(element => element.textContent.trim() === label);
  const setInput = (selector, value) => {
    const input = document.querySelector(selector);
    assert(input, 'Falta campo ' + selector);
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
  };
  const next = async expected => {
    const nextButton = button('Siguiente');
    assert(nextButton && !nextButton.disabled, 'Siguiente habilitado');
    nextButton.click();
    await waitFor(() => visible(expected), 'No llegó a ' + expected);
  };
  try {
    window.eval(bundle.outputFiles[0].text);
    window.qa.mount();
    await waitFor(() => visible('Crea el espacio digital de tu negocio.'), 'Falta portada');
    await next('¿Qué tipo de negocio quieres abrir?');
    if (businessType === 'ghost-kitchen') {
      const ghost = [...document.querySelectorAll('button')]
        .find(element => element.textContent.includes('Ghost Kitchen'));
      assert(ghost, 'Falta plantilla Ghost Kitchen');
      ghost.click();
    }
    await next('Dale identidad a tu negocio.');
    setInput('input[placeholder="Ej. Pizzería Luna"]', name);
    setInput('input[placeholder="pizzeria-luna"]', handle);
    await waitFor(() => !button('Siguiente').disabled, 'Nombre y handle no aceptados');
    await next('Crea tu acceso.');
    setInput('input[type="email"]', email);
    setInput('input[type="password"]', 'EmulatorOnlyPass123!');
    await waitFor(() => !button('Siguiente').disabled, 'Credenciales ficticias no aceptadas');
    await next('Agrega la imagen de tu negocio.');
    assert(button('Omitir por ahora'), 'Logo debe ser opcional');
    button('Omitir por ahora').click();
    await waitFor(() => visible('Elige quién atenderá con IA.'), 'Falta asistente');
    await next('Tu negocio ya tiene identidad.');
    const submit = button('Crear mi negocio');
    assert(submit, 'Falta confirmación');
    submit.click();
    submit.click();
    await waitFor(() => window.qa.submissions.length === 1, 'Doble pulsación duplicó el alta');
    await waitFor(() => window.qa.result || window.qa.failure, 'Registro emulado no terminó');
    if (window.qa.failure) throw window.qa.failure;
    const result = window.qa.result;
    assert.equal(window.qa.submissions[0].handle, handle);
    assert.equal(window.qa.submissions[0].businessType, businessType);
    assert.equal(result.tenant.restaurantId, handle);
    assert.equal(result.membership.role, 'OWNER');
    assert.equal(window.qa.cancels, 0);
    assert.deepEqual(errors, [], 'Errores de React');
    return result;
  } finally {
    window.qa.unmount?.();
    window.close();
  }
}
