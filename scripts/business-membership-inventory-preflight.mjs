/**
 * Paso 2: preflight OFFLINE de identidad histórica en businesses y
 * businessMemberships. No conecta a Firebase, no escribe ni migra.
 *
 * El llamador es responsable de un inventario autorizado y exhaustivo.
 * No aceptar conteos sin confirmación explícita de todas las páginas.
 * La salida NO contiene IDs, UID, nombres ni datos de documentos.
 */
// SUPER_ADMIN se acredita por platformAdmins/{uid}; una membresía tenant
// con ese rol es anómala, aunque el tipo global BusinessRole lo contemple.
const EMPLOYEE_ROLES = new Set(['ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN', 'EMPLOYEE']);
const VALID_ROLES = new Set([
  'OWNER', 'ADMIN', 'MANAGER', 'CASHIER',
  'WAITER', 'KITCHEN', 'EMPLOYEE', 'CLIENT',
]);
const BUSINESS_ID = /^[a-z0-9][a-z0-9-]{1,63}$/;
const isNonEmpty = value => typeof value === 'string'
  && value.trim().length > 0 && value === value.trim();
const isBusinessId = value => isNonEmpty(value) && BUSINESS_ID.test(value);
const isUid = value => isNonEmpty(value) && !value.includes('/');
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function auditBusinessMembershipInventory({ coverage, businesses, memberships } = {}) {
  const issues = [];
  const counts = {
    businesses: Array.isArray(businesses) ? businesses.length : 0,
    memberships: Array.isArray(memberships) ? memberships.length : 0,
    activeMemberships: 0,
    activeOwners: 0,
    rootsWithoutActiveOwner: 0,
    legacyRootsWithoutOwnerId: 0,
    orphanMemberships: 0,
    invalidIdentity: 0,
    duplicateDocuments: 0,
    unindexedMemberships: 0,
    staleEmployeeIndexEntries: 0,
    invalidEmployeeIndexEntries: 0,
  };
  const issue = (code, collection, index) => {
    // No exponer identificadores o contenido de registros históricos.
    issues.push({ code, ...(collection ? { collection } : {}),
      ...(index !== undefined ? { index } : {}) });
  };

  for (const [name, docs] of [['businesses', businesses], ['businessMemberships', memberships]]) {
    const scan = isObject(coverage) ? coverage[name] : undefined;
    if (!Array.isArray(docs)) issue('MISSING_DOCUMENT_INVENTORY', name);
    if (!isObject(scan)) {
      issue('MISSING_COLLECTION_COVERAGE', name);
    } else {
      if (scan.complete !== true) issue('INCOMPLETE_COLLECTION_SCAN', name);
      if (!Number.isSafeInteger(scan.documentCount) || scan.documentCount < 0
          || !Array.isArray(docs) || scan.documentCount !== docs.length) {
        issue('DECLARED_COUNT_MISMATCH', name);
      }
      // Un número de páginas sin confirmación de exhaustividad no certifica el escaneo.
      if (!Number.isSafeInteger(scan.pagesRead) || scan.pagesRead < 1) {
        issue('INVALID_PAGINATION_EVIDENCE', name);
      }
    }
  }
  if (counts.businesses === 0) issue('EMPTY_BUSINESS_INVENTORY_REVIEW');

  const roots = new Map();
  const seenRootDocs = new Set();
  if (Array.isArray(businesses)) for (const [index, root] of businesses.entries()) {
    const validDocId = isObject(root) && isBusinessId(root.docId);
    if (!validDocId || !isBusinessId(root.restaurantId) || root.docId !== root.restaurantId) {
      counts.invalidIdentity++;
      issue('ROOT_DOCUMENT_IDENTITY_MISMATCH', 'businesses', index);
    }
    if (validDocId) {
      if (seenRootDocs.has(root.docId)) {
        counts.duplicateDocuments++;
        issue('DUPLICATE_ROOT_DOCUMENT', 'businesses', index);
      }
      seenRootDocs.add(root.docId);
      if (root.docId === root.restaurantId && !roots.has(root.docId)) {
        roots.set(root.docId, { ownerUserId: root.ownerUserId, owners: [],
          employeeIds: undefined, membershipByUid: new Map() });
      }
    }
    // El índice es la única barrera actual contra un alta de empleado duplicada
    // desde Web SDK. No inferir ausencia de membresías a partir de su ausencia.
    if (validDocId && root.docId === root.restaurantId) {
      const entry = roots.get(root.docId);
      if (entry && entry.employeeIds === undefined && root.employeeUserIds !== undefined) {
        if (!Array.isArray(root.employeeUserIds)) {
          counts.invalidEmployeeIndexEntries++;
          issue('INVALID_EMPLOYEE_INDEX_SHAPE', 'businesses', index);
        } else {
          entry.employeeIds = new Set();
          for (const uid of root.employeeUserIds) {
            if (!isUid(uid)) {
              counts.invalidEmployeeIndexEntries++;
              issue('INVALID_EMPLOYEE_INDEX_UID', 'businesses', index);
            } else if (entry.employeeIds.has(uid)) {
              counts.invalidEmployeeIndexEntries++;
              issue('DUPLICATE_EMPLOYEE_INDEX_UID', 'businesses', index);
            } else {
              entry.employeeIds.add(uid);
            }
          }
        }
      }
    }
    if (isObject(root) && root.ownerUserId === undefined) {
      counts.legacyRootsWithoutOwnerId++;
      issue('LEGACY_ROOT_OWNER_UNVERIFIED', 'businesses', index);
    } else if (!isObject(root) || !isUid(root.ownerUserId)) {
      counts.invalidIdentity++;
      issue('INVALID_ROOT_OWNER_ID', 'businesses', index);
    }
  }

  const seenMembershipDocs = new Set();
  if (Array.isArray(memberships)) for (const [index, member] of memberships.entries()) {
    const valid = isObject(member) && isBusinessId(member.restaurantId)
      && isUid(member.userId) && isNonEmpty(member.docId)
      && member.docId === member.restaurantId + '_' + member.userId;
    if (!valid) {
      counts.invalidIdentity++;
      issue('MEMBERSHIP_DOCUMENT_IDENTITY_MISMATCH', 'businessMemberships', index);
    }
    if (isObject(member) && isNonEmpty(member.docId)) {
      if (seenMembershipDocs.has(member.docId)) {
        counts.duplicateDocuments++;
        issue('DUPLICATE_MEMBERSHIP_DOCUMENT', 'businessMemberships', index);
      }
      seenMembershipDocs.add(member.docId);
    }
    if (!isObject(member) || !VALID_ROLES.has(member.role)) {
      issue('UNKNOWN_MEMBERSHIP_ROLE', 'businessMemberships', index);
    }
    if (!isObject(member) || typeof member.active !== 'boolean') {
      issue('INVALID_MEMBERSHIP_ACTIVE_STATE', 'businessMemberships', index);
    }
    if (!isObject(member) || !isBusinessId(member.restaurantId)
        || !roots.has(member.restaurantId)) {
      counts.orphanMemberships++;
      issue('MEMBERSHIP_WITHOUT_VALID_ROOT', 'businessMemberships', index);
    }
    if (valid && roots.has(member.restaurantId)) {
      const root = roots.get(member.restaurantId);
      // Incluir inactivos: un documento revocado sigue existiendo y puede
      // ser sobrescrito por set() aunque no aparezca en la lista activa.
      root.membershipByUid.set(member.userId, member);
      if (member.role !== 'OWNER' && !root.employeeIds?.has(member.userId)) {
        counts.unindexedMemberships++;
        issue('UNINDEXED_MEMBERSHIP_COLLISION_REVIEW', 'businessMemberships', index);
      }
    }
    if (isObject(member) && member.active === true) {
      counts.activeMemberships++;
      if (member.role === 'OWNER') {
        counts.activeOwners++;
        const root = roots.get(member.restaurantId);
        if (root && valid) root.owners.push(member.userId);
      }
    }
  }

  for (const root of roots.values()) {
    if (root.employeeIds) for (const uid of root.employeeIds) {
      const member = root.membershipByUid.get(uid);
      if (!member) {
        counts.staleEmployeeIndexEntries++;
        issue('EMPLOYEE_INDEX_WITHOUT_MEMBERSHIP', 'businesses');
      } else if (!EMPLOYEE_ROLES.has(member.role)) {
        counts.invalidEmployeeIndexEntries++;
        issue('NON_EMPLOYEE_ROLE_IN_INDEX', 'businesses');
      }
    }
    if (root.owners.length === 0) {
      counts.rootsWithoutActiveOwner++;
      issue('ROOT_WITHOUT_ACTIVE_OWNER', 'businesses');
    } else {
      if (root.owners.length > 1) issue('MULTIPLE_ACTIVE_OWNERS_REVIEW', 'businesses');
      if (root.ownerUserId !== undefined && !root.owners.includes(root.ownerUserId)) {
        issue('ROOT_OWNER_MEMBERSHIP_MISMATCH', 'businesses');
      }
    }
  }
  return {
    mode: 'OFFLINE_NO_FIREBASE_NO_WRITE',
    status: issues.length ? 'BLOCKED' : 'READY_FOR_INDEPENDENT_REVIEW',
    safeToDeploy: false,
    counts, issues,
    caveat: 'Los conteos y la cobertura son declarados por el llamador; no prueban acceso a todos los registros reales ni autorizan corte o despliegue.',
  };
}
