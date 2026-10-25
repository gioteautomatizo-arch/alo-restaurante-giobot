import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasCurrentWorkspaceAccess, isWorkspaceAccessLoaded } from '../src/lib/businessWorkspaceAccess.ts';

const a = 'giomero';
const b = 'dulce-crepa-demo';
const ownerA = 'owner-a';
const ownerB = 'owner-b';
const verified = { businessId: a, userId: ownerA };

// Solo la combinación negocio + usuario + tenant + rol autoriza renderizar contenido.
assert.equal(isWorkspaceAccessLoaded(a, true, ownerA, verified), true);
assert.equal(hasCurrentWorkspaceAccess(a, true, ownerA, verified, a, 'OWNER'), true);
assert.equal(hasCurrentWorkspaceAccess(a, true, ownerA, verified, a, 'WAITER'), true);
assert.equal(hasCurrentWorkspaceAccess(b, true, ownerA, verified, a, 'OWNER'), false);
assert.equal(hasCurrentWorkspaceAccess(b, true, ownerA, verified, b, 'OWNER'), false);
assert.equal(hasCurrentWorkspaceAccess(a, true, ownerB, verified, a, 'OWNER'), false);
assert.equal(hasCurrentWorkspaceAccess(a, true, ownerA, verified, b, 'OWNER'), false);
assert.equal(hasCurrentWorkspaceAccess(a, true, ownerA, verified, a, null), false);
assert.equal(hasCurrentWorkspaceAccess(a, false, ownerA, verified, a, 'OWNER'), false);
assert.equal(hasCurrentWorkspaceAccess(a, true, ownerA, null, a, 'OWNER'), false);
assert.equal(hasCurrentWorkspaceAccess('', true, ownerA, { businessId: '', userId: ownerA }, '', 'OWNER'), false);
assert.equal(isWorkspaceAccessLoaded(a, true, null, { businessId: a, userId: '' }), true);
assert.equal(hasCurrentWorkspaceAccess(a, true, null, { businessId: a, userId: '' }, a, 'OWNER'), false);

// Guardias de integración: no ejecutar escrituras ni usar respuestas atrasadas tras cambiar de tenant.
const router = readFileSync('src/main.tsx', 'utf8');
const workspace = readFileSync('src/components/platform/BusinessWorkspace.tsx', 'utf8');
const publicProfile = readFileSync('src/lib/businessPublicProfileService.ts', 'utf8');
assert.match(router, /<BusinessWorkspace key=\{selectedBusinessId\} businessId=\{selectedBusinessId\}/);
assert.match(workspace, /let cancelled = false;[\s\S]*?Promise\.all\(\[getBusinessForUser/);
assert.match(workspace, /\.then\(\(\[tenant, membership\]\) => \{\s*if \(cancelled\) return;/);
assert.match(workspace, /tenant\.restaurantId !== businessId/);
assert.match(workspace, /membership\.restaurantId !== businessId/);
assert.match(workspace, /membership\.userId !== authUser\.uid/);
assert.match(workspace, /\.finally\(\(\) => \{\s*if \(!cancelled\)/);
assert.match(workspace, /return \(\) => \{ cancelled = true; \};/);
assert.match(workspace, /setView\('workspace'\)/);
assert.match(workspace, /if \(loading \|\| !accessLoaded\)/);
assert.match(workspace, /if \(error \|\| !hasCurrentAccess \|\| !business\)/);
assert.match(workspace, /if \(!hasCurrentAccess \|\| !business \|\| role !== 'OWNER'\) return;/);
assert.match(workspace, /!publicationStatusReady \|\| publicationBusy/);
assert.match(workspace, /isPublished=\{published\}/);
assert.match(publicProfile, /tenant\.restaurantId !== businessId/);
assert.match(publicProfile, /if \(!businessId\.trim\(\) \|\| tenant\.restaurantId !== businessId\) return false;/);

console.log('PASS: acceso por tenant y UID, respuestas obsoletas, publicación y navegación aislados (sin Firebase).');
