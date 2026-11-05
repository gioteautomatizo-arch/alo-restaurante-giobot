// Prueba de contrato estático: la navegación pública no ofrece administración.
// No demuestra autorización de backend; no utiliza Firebase ni datos reales.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const router = read('src/main.tsx');
const app = read('src/App.tsx');
const footer = read('src/components/Footer.tsx');
const publicPage = read('src/components/platform/BusinessPublicPage.tsx');
const portal = read('src/components/platform/BusinessPortal.tsx');
assert.ok(router.includes("publicId === 'alo-restaurante'") && router.includes('<App publicBusinessPage />'), 'Calientito debe recibir contexto público');
assert.ok(app.includes('<Footer onOpenAdmin={publicBusinessPage ? undefined : handleOpenAdminClick} />'), 'El pie público de Calientito no debe ofrecer administración');
assert.ok(footer.includes('{onOpenAdmin && ('), 'El botón del pie debe ser condicional');
assert.ok(!publicPage.includes('Acceso del negocio'), 'La página pública multinegocio no debe ofrecer acceso administrativo');
assert.ok(portal.includes('adminResolvedFor === authUser.uid && isSuperAdmin'), 'El acceso heredado debe depender de la autorización Super Admin de la sesión');
assert.ok(portal.includes('{showSuperAdmin && <section'), 'La tarjeta de Calientito debe conservar su control de visibilidad');
console.log('PASS: contrato de navegación pública Calientito/Giomero y acceso privado (estático, sin autorización de servidor).');
