/**
 * Solo emulador: propuesta de lectura privada de borradores y catálogos
 * identificados por negocio. No modifica ni despliega reglas versionadas.
 * Compartir esta transformación entre pruebas evita divergencia de contratos.
 */
import assert from 'node:assert/strict';

export function buildPrivateCatalogReadProposalRules(baseRules) {
const original=[
  '      allow read: if isPublishedBusiness(businessId)',
  '        || hasActiveMembership(businessId)',
  '        || isPlatformSuperAdmin();',
].join('\n');
assert.equal(baseRules.split(original).length,2,'El bloque staged de catálogo cambió: revisar manualmente, no aplicar sustitución silenciosa');
// Contrato fail-closed SOLO en memoria. El acceso privado exige que los campos
// internos de la membresía coincidan con su ruta. Los históricos incompletos
// requieren auditoría y migración explícita antes de cualquier corte.
const membershipHelper=[
  "    function hasIdentifiedCatalogMembership(businessId) {",
  "      return isSignedIn()",
  "        && exists(/databases/$(database)/documents/businessMemberships/$(businessId + '_' + request.auth.uid))",
  "        && get(/databases/$(database)/documents/businessMemberships/$(businessId + '_' + request.auth.uid)).data.active == true",
  "        && get(/databases/$(database)/documents/businessMemberships/$(businessId + '_' + request.auth.uid)).data.get('restaurantId', null) == businessId",
  "        && get(/databases/$(database)/documents/businessMemberships/$(businessId + '_' + request.auth.uid)).data.get('userId', null) == request.auth.uid;",
  "    }",
].join('\n');
// Un perfil publicado no debe hacer público el menú de una raíz ausente o
// discordante. Contrato candidato: requiere identidad explícita en ambos docs.
const publicCatalogHelper=[
  "    function isIdentifiedPublishedCatalog(businessId) {",
  "      return exists(/databases/$(database)/documents/businesses/$(businessId))",
  "        && get(/databases/$(database)/documents/businesses/$(businessId)).data.get('restaurantId', null) == businessId",
  "        && exists(/databases/$(database)/documents/publicBusinessProfiles/$(businessId))",
  "        && get(/databases/$(database)/documents/publicBusinessProfiles/$(businessId)).data.published == true",
  "        && get(/databases/$(database)/documents/publicBusinessProfiles/$(businessId)).data.get('businessId', null) == businessId",
  "        && get(/databases/$(database)/documents/publicBusinessProfiles/$(businessId)).data.get('restaurantId', null) == businessId;",
  "    }",
].join('\n');

const catalogMatch='    match /businesses/{businessId}/catalog/{catalogDoc} {';
assert.equal(baseRules.split(catalogMatch).length,2,'La ubicación de reglas del catálogo cambió; revisar propuesta manualmente');
const proposed=baseRules.replace(catalogMatch,membershipHelper+'\n\n'+publicCatalogHelper+'\n\n'+catalogMatch).replace(original,[
  "      // Únicamente menu_catalog es público si la página está publicada.",
  "      // Borradores requieren identidad y rol; otros IDs fallan cerrados.",
  "      allow read: if isPlatformSuperAdmin()",
  "        || (catalogDoc == 'menu_catalog'",
  "          && (",
  "            // El editor lee el menú antes de sembrarlo: el documento aún",
  "            // puede no existir. Solo miembros verificados pueden observar",
  "            // esa ausencia; un visitante no obtiene acceso por publicación.",
  "            (resource == null && hasIdentifiedCatalogMembership(businessId))",
  "            || (resource != null",
  "              && resource.data.get('businessId', null) == businessId",
  "              && (isIdentifiedPublishedCatalog(businessId) || hasIdentifiedCatalogMembership(businessId)))",
  "          ))",
  "        || (catalogDoc == 'menu_import_draft'",
  "          && hasIdentifiedCatalogMembership(businessId)",
  "          && getCallerMembershipRole(businessId) in ['OWNER', 'ADMIN', 'MANAGER', 'SUPER_ADMIN']);",
].join('\n'));
  return proposed;
}
