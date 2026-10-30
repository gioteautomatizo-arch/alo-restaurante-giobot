// Servicio REAL de invitaciones con Auth y fetch simulados: sin Firebase ni datos reales.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const qa = { user: null, tokenWaiters: [], requests: [] };
globalThis.inviteSessionQa = qa;
const originalFetch = globalThis.fetch;
const bundle = await build({
  absWorkingDir: root,
  entryPoints: ['src/lib/businessInvitesService.ts'],
  bundle: true, write: false, format: 'esm', platform: 'node',
  define: { 'import.meta.env.VITE_BUSINESS_INVITES': '"true"' },
  plugins: [{
    name: 'mock-invite-auth',
    setup(builder) {
      builder.onResolve({ filter: /^\.\/firebase$/ }, args =>
        args.importer.endsWith('/businessInvitesService.ts')
          ? { path: 'auth', namespace: 'mock' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({
        contents: 'export const auth = { get currentUser() { return globalThis.inviteSessionQa.user; } };',
        loader: 'js',
      }));
    },
  }],
});
const lib = await import('data:text/javascript;base64,' +
  Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const makeUser = (uid, holdToken = false) => ({
  uid,
  getIdToken: () => holdToken
    ? new Promise(resolve => qa.tokenWaiters.push(resolve))
    : Promise.resolve('token-' + uid),
});
const response = (body, ok = true) => ({ ok, json: async () => body });
const waitFor = async (predicate, label) => {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('No llegó la petición: ' + label);
};
const actions = [
  { name: 'crear', call: () => lib.createBusinessInvite('tenant-a', 'Persona A', 'a@example.test', 'WAITER'),
    data: { token: 'secreto-a', expiresAt: 2000000000000 } },
  { name: 'aceptar', call: () => lib.acceptBusinessInvite('invitacion-a'),
    data: { businessId: 'tenant-a' } },
  { name: 'revocar', call: () => lib.revokeBusinessInvite('tenant-a', 'invite-a'),
    data: { revoked: true } },
  { name: 'listar', call: () => lib.listBusinessInvites('tenant-a'),
    data: { invites: [{ id: 'invite-a', name: 'Persona A', email: 'a@example.test',
      role: 'WAITER', status: 'PENDING', createdAt: 1, expiresAt: 2000000000000 }] } },
];
const reset = (user) => {
  qa.user = user;
  qa.tokenWaiters.length = 0;
  qa.requests.length = 0;
};
globalThis.fetch = (url, options = {}) => new Promise(resolve => {
  qa.requests.push({ url: String(url), options, resolve });
});

try {
  for (const action of actions) {
    // El UID cambia mientras getIdToken está pendiente: no emitir la petición.
    reset(makeUser('owner-a', true));
    const beforeToken = action.call();
    assert.equal(qa.tokenWaiters.length, 1, action.name + ': espera de token');
    qa.user = makeUser('owner-b');
    qa.tokenWaiters.shift()('token-owner-a');
    await assert.rejects(beforeToken, /La sesión cambió/, action.name + ': token obsoleto');
    assert.equal(qa.requests.length, 0, action.name + ': no enviar con UID antiguo');

    // La petición pudo llegar al servidor: no entregar al UID B el resultado A.
    reset(makeUser('owner-a'));
    const beforeResponse = action.call();
    await waitFor(() => qa.requests.length === 1, action.name + ': fetch');
    assert.equal(qa.requests[0].options.headers.Authorization, 'Bearer token-owner-a');
    qa.user = makeUser('owner-b');
    qa.requests[0].resolve(response(action.data));
    await assert.rejects(beforeResponse, /La sesión cambió/, action.name + ': respuesta obsoleta');

    // Sin cambio de cuenta, el servicio conserva el contrato normal.
    reset(makeUser('owner-a'));
    const valid = action.call();
    await waitFor(() => qa.requests.length === 1, action.name + ': respuesta válida');
    qa.requests[0].resolve(response(action.data));
    const result = await valid;
    assert.deepEqual(result, action.name === 'listar' ? action.data.invites : action.data,
      action.name + ': contrato válido');
  }

  // Cambiar de UID mientras se decodifica JSON tampoco expone la lista anterior.
  reset(makeUser('owner-a'));
  const pendingJson = lib.listBusinessInvites('tenant-a');
  await waitFor(() => qa.requests.length === 1, 'JSON diferido');
  let resolveJson;
  const delayedJson = new Promise(resolve => { resolveJson = resolve; });
  qa.requests[0].resolve({ ok: true, json: () => delayedJson });
  await new Promise(resolve => setTimeout(resolve, 0));
  qa.user = makeUser('owner-b');
  resolveJson({ invites: actions[3].data.invites });
  await assert.rejects(pendingJson, /La sesión cambió/, 'JSON de UID anterior');

  // Una respuesta 200 malformada no equivale a «sin invitaciones».
  reset(makeUser('owner-a'));
  const malformed = lib.listBusinessInvites('tenant-a');
  await waitFor(() => qa.requests.length === 1, 'lista malformada');
  qa.requests[0].resolve(response({}));
  await assert.rejects(malformed, /lista inválida/, 'Lista faltante debe permitir reintento');

  reset(makeUser('owner-a'));
  const empty = lib.listBusinessInvites('tenant-a');
  await waitFor(() => qa.requests.length === 1, 'lista vacía');
  qa.requests[0].resolve(response({ invites: [] }));
  assert.deepEqual(await empty, [], 'Lista vacía explícita sí es válida');

  // Vista previa es pública: no necesita sesión ni envía Authorization.
  reset(null);
  const preview = lib.previewBusinessInvite('preview-a');
  await waitFor(() => qa.requests.length === 1, 'vista previa pública');
  assert.equal(qa.requests[0].options.headers.Authorization, undefined);
  const publicPreview = { businessName: 'Negocio A', role: 'WAITER',
    emailHint: 'a***@example.test', expiresAt: 2000000000000 };
  qa.requests[0].resolve(response(publicPreview));
  assert.deepEqual(await preview, publicPreview);
  await assert.rejects(lib.createBusinessInvite('tenant-a', 'A', 'a@example.test', 'WAITER'),
    /Inicia sesión/);
  await assert.rejects(lib.listBusinessInvites('tenant-a'), /Inicia sesión/);
  assert.equal(qa.requests.length, 1, 'Sin sesión no se envían peticiones privadas');

  console.log('PASS: crear, aceptar, revocar y listar fail-closed ante cambio de UID antes/después de fetch; JSON diferido, respuesta malformada, recuperación y preview pública (Auth/API simulados).');
} finally {
  globalThis.fetch = originalFetch;
  delete globalThis.inviteSessionQa;
}
