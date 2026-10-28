/**
 * Candidato de corte de escrituras públicas para Firestore Emulator, NO desplegado.
 * Deriva reglas STAGED en memoria; NO escribe archivos de reglas ni activa endpoint.
 * El SDK Admin del backend confiable evita reglas, por lo que su protección
 * requiere autenticación/limitación de abuso y despliegue coordinado posterior.
 */
import assert from 'node:assert/strict';

function replaceOnce(source, anchor, replacement, label) {
  assert.equal(source.split(anchor).length, 2, 'ALTO: cambió el bloque ' + label + '; revisar antes de continuar.');
  return source.replace(anchor, replacement);
}

export function buildPublicOrderWriteGateProposalRules(staged) {
  // La vía de POS solo es para personal autorizado; no debe servir de bypass
  // de la vía CLIENTE_QR si el usuario también pertenece al negocio.
  const staffAnchor = "            && request.resource.data.billingStatus == 'PENDIENTE'\n          )\n          // Pedido web anónimo:";
  let rules = replaceOnce(
    staged,
    staffAnchor,
    "            && request.resource.data.billingStatus == 'PENDIENTE'\n" +
    "            && request.resource.data.get('orderSource', '') != 'CLIENTE_QR'\n" +
    "          )\n          // Pedido web anónimo:",
    'POS/CLIENTE_QR',
  );

  const publicStart = '          // Pedido web anónimo: solo para un negocio publicado y con campos públicos permitidos.\n          || (';
  const publicEnd = '\n          )\n        )\n      );\n\n      // Calientito conserva compatibilidad';
  const start = rules.indexOf(publicStart);
  assert(start >= 0 && rules.indexOf(publicStart, start + 1) < 0,
    'ALTO: no se encontró un único inicio de la vía pública.');
  const end = rules.indexOf(publicEnd, start);
  assert(end > start && rules.indexOf(publicEnd, end + 1) < 0,
    'ALTO: no se encontró un único cierre de la vía pública.');
  const removed = rules.slice(start, end + '\n          )'.length);
  assert(removed.includes("request.resource.data.orderSource == 'CLIENTE_QR'") &&
         removed.includes('isPublishedBusiness(request.resource.data.restaurantId)') &&
         removed.includes('request.resource.data.keys().hasOnly(['),
    'ALTO: cambió el contrato de pedidos públicos; revisar el corte.');
  rules = rules.slice(0, start) +
    '          // CANDIDATO: no crear pedidos CLIENTE_QR desde SDK cliente multinegocio.\n' +
    '          // El backend Admin confiable deberá crear esos pedidos; NO está activado.' +
    rules.slice(end + '\n          )'.length);

  // No dejar abierta la segunda escritura pública (resumen de mesa).
  // Para POS autenticado, el resumen debe coincidir con el pedido del mismo
  // tenant tras el batch; Calientito conserva su flujo heredado sin cambios.
  const mirrorStart = '    match /public_table_orders/{orderId} {';
  const mirrorEnd = '\n    match /table_sessions/{sessionId} {';
  const mStart = rules.indexOf(mirrorStart);
  const mEnd = rules.indexOf(mirrorEnd, mStart);
  assert(mStart >= 0 && mEnd > mStart, 'ALTO: cambió el bloque de resúmenes.');
  const original = rules.slice(mStart, mEnd);
  const mirrorAnchor = '        && request.resource.data.updatedAt is string\n      );';
  const hardened = replaceOnce(original, mirrorAnchor,
    "        && request.resource.data.updatedAt is string\n" +
    "        && (\n" +
    "          request.resource.data.restaurantId == 'alo-restaurante'\n" +
    "          || (\n" +
    "            isSignedIn()\n" +
    "            && getCallerMembershipRole(request.resource.data.restaurantId)\n" +
    "              in ['OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'SUPER_ADMIN']\n" +
    "            && existsAfter(/databases/$(database)/documents/restaurant_orders/$(orderId))\n" +
    "            && getAfter(/databases/$(database)/documents/restaurant_orders/$(orderId)).data.restaurantId == request.resource.data.restaurantId\n" +
    "            && getAfter(/databases/$(database)/documents/restaurant_orders/$(orderId)).data.code == request.resource.data.code\n" +
    "            && getAfter(/databases/$(database)/documents/restaurant_orders/$(orderId)).data.total == request.resource.data.total\n" +
    "          )\n" +
    "        )\n" +
    "      );", 'creación de resumen público');
  rules = rules.slice(0, mStart) + hardened + rules.slice(mEnd);
  assert.notEqual(rules, staged);
  return rules;
}
