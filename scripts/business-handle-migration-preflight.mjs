/**
 * Auditoría conservadora de inventario histórico (SIN Firebase ni escrituras).
 * Un candidato NO autoriza backfill: exige inventario exhaustivo, respaldo,
 * revisión humana independiente y un proceso privilegiado auditado.
 */
const SCOPE = 'business-identifier-inventory';

const validId = id => typeof id === 'string'
  && id.length > 0 && id.length <= 200
  && !id.includes('/') && id !== '.' && id !== '..';

function entryFor(map, id) {
  if (!map.has(id)) map.set(id, { id, roots: [], memberships: [], reservations: [],
    profiles: [], residual: [], problems: [] });
  return map.get(id);
}

function classifyRecord(record, map, globalProblems) {
  if (!record || typeof record.path !== 'string' || !record.data
      || typeof record.data !== 'object' || Array.isArray(record.data)) {
    globalProblems.push('RECORD_MALFORMED');
    return;
  }
  const parts = record.path.split('/');
  const [collection, id] = parts;
  if (!validId(id) || parts.some(p => !p)) {
    globalProblems.push('INVALID_PATH');
    return;
  }
  if (collection === 'businesses' && parts.length >= 2) {
    const entry = entryFor(map, id);
    if (parts.length === 2) entry.roots.push(record);
    else if (parts.length >= 4 && parts.length % 2 === 0) entry.residual.push(record);
    else entry.problems.push('INVALID_BUSINESS_SUBPATH');
    return;
  }
  if (collection === 'businessMemberships' && parts.length === 2) {
    const tenantId = record.data.restaurantId;
    if (!validId(tenantId)) {
      globalProblems.push('MEMBERSHIP_WITHOUT_TENANT');
      return;
    }
    // Un ID de documento que apunta a otro tenant no permite conocer el
    // inventario completo de ninguno: bloquear globalmente, sin inferir dueño.
    if (!validId(record.data.userId)
        || id !== tenantId + '_' + record.data.userId) {
      globalProblems.push('MEMBERSHIP_PATH_TENANT_MISMATCH');
    }
    const entry = entryFor(map, tenantId);
    entry.memberships.push(record);
    return;
  }
  if (collection === 'businessHandleReservations' && parts.length === 2) {
    entryFor(map, id).reservations.push(record);
    return;
  }
  if (collection === 'publicBusinessProfiles' && parts.length === 2) {
    entryFor(map, id).profiles.push(record);
    return;
  }
  // Un inventario que omite colecciones o contiene rutas desconocidas no
  // puede considerarse exhaustivo ni usarse para asignar reservas.
  globalProblems.push('UNKNOWN_PATH_SCOPE');
}

function inspectEntry(entry, globallyBlocked) {
  const problems = [...entry.problems];
  if (entry.roots.length > 1 || entry.reservations.length > 1
      || entry.profiles.length > 1
      || new Set(entry.memberships.map(m => m.path)).size !== entry.memberships.length
      || new Set(entry.residual.map(m => m.path)).size !== entry.residual.length)
    problems.push('DUPLICATE_DOCUMENT_PATH');
  const root = entry.roots[0]?.data;
  const reserve = entry.reservations[0]?.data;
  const id = entry.id;
  if (!root) problems.push('MISSING_BUSINESS_ROOT');
  if (root && (root.restaurantId !== id || !validId(root.ownerUserId)))
    problems.push('INVALID_ROOT_OWNER_OR_ID');
  const owner = root?.ownerUserId;
  const ownerMembers = [];
  for (const record of entry.memberships) {
    const data = record.data;
    if (!validId(data.userId) || record.path !== 'businessMemberships/' + id + '_' + data.userId
        || data.restaurantId !== id) {
      problems.push('MALFORMED_MEMBERSHIP');
      continue;
    }
    if (data.role === 'OWNER' && data.active === true) ownerMembers.push(data.userId);
    if (data.role === 'OWNER' && data.userId !== owner)
      problems.push('FOREIGN_OWNER_MEMBERSHIP');
  }
  if (root && (!ownerMembers.includes(owner) || ownerMembers.length !== 1))
    problems.push('OWNER_MEMBERSHIP_NOT_UNIQUE_AND_ACTIVE');
  if (reserve && (reserve.businessId !== id || !validId(reserve.ownerUserId)
      || Object.keys(reserve).sort().join(',') !== 'businessId,ownerUserId'))
    problems.push('INVALID_RESERVATION');
  if (reserve && root && reserve.ownerUserId !== owner)
    problems.push('RESERVATION_OWNER_CONFLICT');
  // Ambos identificadores del perfil público deben coincidir con la ruta.
  // Con && se ignoraba un perfil que apuntaba a A en un campo y a B en otro.
  if (entry.profiles.some(p => p.data.businessId !== id || p.data.restaurantId !== id))
    problems.push('PROFILE_TENANT_MISMATCH');
  // Los documentos históricos pueden carecer de estos metadatos. Si existen,
  // no pueden referir a otro tenant: retener el inventario para revisión.
  if (entry.residual.some(record =>
    (Object.hasOwn(record.data, 'businessId') && record.data.businessId !== id)
    || (Object.hasOwn(record.data, 'restaurantId') && record.data.restaurantId !== id)))
    problems.push('RESIDUAL_TENANT_MISMATCH');
  const unique = [...new Set(problems)].sort();
  const status = globallyBlocked ? 'BLOCKED_INCOMPLETE_INVENTORY'
    : unique.length ? 'HOLD_MANUAL_REVIEW'
    : reserve ? 'EXISTING_RESERVATION_REVIEW'
    : 'CANDIDATE_FOR_MANUAL_BACKFILL_REVIEW';
  return { businessId: id, status, reasons: unique,
    hasReservation: Boolean(reserve), hasResidualData: entry.residual.length > 0 };
}

/** @param {{scope:string, complete:boolean, records:Array<{path:string,data:object}>}} inventory */
export function auditHistoricalHandles(inventory) {
  if (!inventory || !Array.isArray(inventory.records))
    throw new TypeError('Se requiere inventario con records[]; no se consultan servicios externos.');
  const map = new Map();
  const globalProblems = [];
  if (inventory.scope !== SCOPE || inventory.complete !== true)
    globalProblems.push('INVENTORY_NOT_CERTIFIED_COMPLETE');
  for (const record of inventory.records) classifyRecord(record, map, globalProblems);
  if (inventory.records.length === 0) globalProblems.push('EMPTY_INVENTORY_NOT_PROOF_OF_UNUSED_IDS');

  // Un cruce compromete ambos extremos: tampoco proponer el tenant destino
  // para backfill si otro documento lo identifica como propietario de datos.
  // Un destino ausente invalida la exhaustividad del inventario.
  for (const entry of map.values()) {
    const references = [
      ...entry.roots.map(record => record.data.restaurantId),
      ...entry.reservations.map(record => record.data.businessId),
      ...entry.profiles.flatMap(record => [record.data.businessId, record.data.restaurantId]),
      ...entry.residual.flatMap(record => [record.data.businessId, record.data.restaurantId]),
    ];
    for (const target of references) {
      if (!validId(target) || target === entry.id) continue;
      const destination = map.get(target);
      if (destination) destination.problems.push('REFERENCED_BY_FOREIGN_TENANT');
      else globalProblems.push('REFERENCE_TO_UNINVENTORIED_TENANT');
    }
  }
  const blockers = [...new Set(globalProblems)].sort();
  const businesses = [...map.values()].sort((a,b)=>a.id.localeCompare(b.id))
    .map(entry => inspectEntry(entry, blockers.length > 0));
  return {
    mode: 'READ_ONLY_NO_FIREBASE_NO_WRITES',
    safeToApplyAutomatically: false,
    globalBlockers: blockers,
    businesses,
    counts: {
      total: businesses.length,
      manualCandidates: businesses.filter(b => b.status === 'CANDIDATE_FOR_MANUAL_BACKFILL_REVIEW').length,
      blockedOrHeld: businesses.filter(b => b.status.startsWith('HOLD') || b.status.startsWith('BLOCKED')).length,
    },
  };
}
