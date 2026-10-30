/**
 * Paso 2: auditoría OFFLINE de compatibilidad de catálogos y lectura pública.
 * No importa Firebase, no consulta cuentas y no escribe ni migra registros.
 * La cobertura es una DECLARACIÓN del operador, no prueba de exhaustividad.
 * El resultado omite IDs de negocios, UID, nombres y datos de productos.
 */
const SCOPE = 'business-catalog-cutover-inventory';
const COLLECTIONS = ['businesses', 'businessMemberships', 'publicBusinessProfiles', 'businessCatalogs'];
const ID = /^[a-z0-9][a-z0-9-]{1,63}$/;
const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const isId = x => typeof x === 'string' && ID.test(x);
const isUid = x => typeof x === 'string' && x.trim() === x && x.length > 0 && !x.includes('/');
const nonEmpty = x => typeof x === 'string' && x.trim() === x && x.length > 0;

export function auditBusinessCatalogCutover(input) {
  const issues = [];
  const counts = { roots: 0, memberships: 0, profiles: 0, catalogs: 0, published: 0, historicalHold: 0 };
  const issue = (code, source, index) => issues.push({ code, source, ...(index === undefined ? {} : { index }) });
  const coverage = isObject(input?.coverage) ? input.coverage : {};
  if (input?.scope !== SCOPE) issue('INVALID_SCOPE', 'inventory');
  for (const key of COLLECTIONS) {
    const rows = input?.[key];
    const scan = coverage[key];
    if (!Array.isArray(rows)) issue('MISSING_DOCUMENT_INVENTORY', key);
    if (!isObject(scan)) issue('MISSING_COLLECTION_COVERAGE', key);
    else {
      if (scan.complete !== true) issue('INCOMPLETE_COLLECTION_SCAN', key);
      if (!Number.isSafeInteger(scan.documentCount) || scan.documentCount < 0
          || !Array.isArray(rows) || scan.documentCount !== rows.length)
        issue('DECLARED_COUNT_MISMATCH', key);
      if (!Number.isSafeInteger(scan.pagesRead) || scan.pagesRead < 1)
        issue('INVALID_PAGINATION_EVIDENCE', key);
    }
  }
  const roots = new Map();
  const owners = new Map();
  const profiles = new Map();
  const catalogs = new Map();
  const seen = Object.fromEntries(COLLECTIONS.map(key => [key, new Set()]));
  const duplicate = (key, docId, index) => {
    if (!nonEmpty(docId)) return;
    if (seen[key].has(docId)) issue('DUPLICATE_DOCUMENT_PATH', key, index);
    seen[key].add(docId);
  };

  if (Array.isArray(input?.businesses)) input.businesses.forEach((root, index) => {
    counts.roots++;
    duplicate('businesses', root?.docId, index);
    if (!isObject(root) || !isId(root.docId) || root.restaurantId !== root.docId
        || !isUid(root.ownerUserId)) {
      issue('ROOT_IDENTITY_OR_OWNER_INVALID', 'businesses', index);
      return;
    }
    roots.set(root.docId, root);
  });
  if (counts.roots === 0) issue('EMPTY_BUSINESS_INVENTORY_NOT_PROOF', 'businesses');

  if (Array.isArray(input?.businessMemberships)) input.businessMemberships.forEach((membership, index) => {
    counts.memberships++;
    duplicate('businessMemberships', membership?.docId, index);
    if (!isObject(membership) || !isId(membership.restaurantId)
        || !isUid(membership.userId)
        || membership.docId !== membership.restaurantId + '_' + membership.userId
        || typeof membership.active !== 'boolean'
        || !['OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN', 'EMPLOYEE', 'CLIENT'].includes(membership.role)) {
      issue('MEMBERSHIP_IDENTITY_OR_ROLE_INVALID', 'businessMemberships', index);
      return;
    }
    if (!roots.has(membership.restaurantId)) issue('MEMBERSHIP_WITHOUT_ROOT', 'businessMemberships', index);
    if (membership.role === 'OWNER' && membership.active) {
      const list = owners.get(membership.restaurantId) || [];
      list.push(membership.userId);
      owners.set(membership.restaurantId, list);
    }
  });

  if (Array.isArray(input?.publicBusinessProfiles)) input.publicBusinessProfiles.forEach((profile, index) => {
    counts.profiles++;
    duplicate('publicBusinessProfiles', profile?.docId, index);
    if (!isObject(profile) || !isId(profile.docId)
        || profile.businessId !== profile.docId || profile.restaurantId !== profile.docId
        || typeof profile.published !== 'boolean') {
      issue('PROFILE_IDENTITY_OR_PUBLICATION_INVALID', 'publicBusinessProfiles', index);
      return;
    }
    if (!roots.has(profile.docId)) issue('PROFILE_WITHOUT_ROOT', 'publicBusinessProfiles', index);
    if (profile.published) counts.published++;
    profiles.set(profile.docId, profile);
  });

  if (Array.isArray(input?.businessCatalogs)) input.businessCatalogs.forEach((catalog, index) => {
    counts.catalogs++;
    duplicate('businessCatalogs', catalog?.path, index);
    const match = typeof catalog?.path === 'string'
      ? /^businesses\/([a-z0-9][a-z0-9-]{1,63})\/catalog\/([^/]+)$/.exec(catalog.path) : null;
    if (!match || match[2] !== 'menu_catalog') {
      issue('UNKNOWN_OR_INVALID_CATALOG_PATH', 'businessCatalogs', index);
      return;
    }
    const id = match[1];
    if (!roots.has(id)) issue('CATALOG_WITHOUT_ROOT', 'businessCatalogs', index);
    if (catalog.businessId !== id) issue('CATALOG_TENANT_IDENTITY_MISMATCH', 'businessCatalogs', index);
    if (!Array.isArray(catalog.items)) issue('CATALOG_ITEMS_INVALID', 'businessCatalogs', index);
    else {
      const ids = new Set();
      for (const item of catalog.items) {
        if (!isObject(item) || !nonEmpty(item.id) || !nonEmpty(item.name)
            || (item.price !== null && !(typeof item.price === 'number' && Number.isFinite(item.price) && item.price >= 0))
            || typeof item.available !== 'boolean' || ids.has(item.id)) {
          issue('CATALOG_ITEM_INCOMPATIBLE', 'businessCatalogs', index);
          break;
        }
        ids.add(item.id);
      }
    }
    // Contrato actual: revision o updatedAt deben ser cadenas no vacías.
    // No se inventan revisiones ni fechas para un catálogo legado.
    if (!nonEmpty(catalog.revision) && !nonEmpty(catalog.updatedAt)) {
      counts.historicalHold++;
      issue('CATALOG_HISTORICAL_REVISION_HOLD', 'businessCatalogs', index);
    }
    catalogs.set(id, catalog);
  });

  for (const [id, root] of roots) {
    const ownerIds = owners.get(id) || [];
    if (ownerIds.length !== 1 || ownerIds[0] !== root.ownerUserId)
      issue('ROOT_OWNER_MEMBERSHIP_UNVERIFIED', 'businesses');
    if (profiles.get(id)?.published && !catalogs.has(id))
      issue('PUBLISHED_BUSINESS_WITHOUT_CATALOG', 'publicBusinessProfiles');
  }
  return {
    mode: 'OFFLINE_NO_FIREBASE_NO_WRITE',
    status: issues.length ? 'BLOCKED' : 'CANDIDATE_FOR_INDEPENDENT_REVIEW',
    safeToDeploy: false,
    counts, issues,
    caveat: 'Cobertura y conteos declarados, no verificados contra producción. Un resultado limpio NO autoriza migración, backfill, publicación ni despliegue de reglas.',
  };
}
