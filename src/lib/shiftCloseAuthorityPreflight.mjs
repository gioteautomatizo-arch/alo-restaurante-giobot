/**
 * PRE-FLIGHT AISLADO de cierre: Firebase Admin + Firestore Emulator únicamente.
 * NO es endpoint ni está conectado a Caja. Las reglas STAGED permiten escrituras
 * directas de cliente: NO usar como autorización real hasta migración revisada.
 *
 * Cierre deliberadamente conservador: admite pedidos externos verificables,
 * gastos y movimientos de resguardo íntegros. Ante cualquier pago de mesa
 * (incluido MIXTO) rechaza el cierre hasta conciliación autoritativa.
 */
const validBusiness = (x) => typeof x === 'string' && /^[a-z0-9][a-z0-9-]{1,63}$/.test(x);
const validUid = (x) => typeof x === 'string' && x.length > 0 && x.length <= 128 && !x.includes('/');
const validRequest = (x) => typeof x === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(x);
const validShift = (x) => typeof x === 'string' && /^srv-[0-9a-f]{32}$/.test(x);
const validIso = (x) => typeof x === 'string' && Number.isFinite(Date.parse(x)) &&
  Date.parse(x) > 0 && new Date(x).toISOString() === x;
const roles = new Set(['OWNER', 'ADMIN', 'MANAGER', 'CASHIER']);

export class ShiftCloseDenied extends Error {
  constructor(code) { super(code); this.name = 'ShiftCloseDenied'; this.code = code; }
}
const deny = (code) => { throw new ShiftCloseDenied(code); };
const cents = (value, positive = false) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (positive && value === 0)) {
    deny('INVALID_MONEY');
  }
  const n = Math.round(value * 100);
  if (!Number.isSafeInteger(n) || Math.abs(value * 100 - n) > 0.000001) deny('INVALID_MONEY');
  return n;
};
const add = (a, b) => {
  const n = a + b;
  if (!Number.isSafeInteger(n)) deny('INVALID_MONEY');
  return n;
};
const readRows = (snap, businessId, field) => {
  if (snap.size > 200) deny('HISTORY_REVIEW_REQUIRED');
  return snap.docs.map((d) => {
    const value = d.data();
    if (value?.[field] !== businessId) deny('TENANT_MISMATCH');
    return { id: d.id, ...value };
  });
};
const dateMs = (value) => {
  if (!validIso(value)) deny('UNVERIFIED_DATE');
  return Date.parse(value);
};

/**
 * actorUid DEBE proceder de verifyIdToken(token, true) en futuro servidor,
 * nunca de body. closedAt y closedByName también deberán venir del servidor.
 * Todas las lecturas y la transición/candado/recibo ocurren en una transacción.
 */
export async function closeShiftPreflight({
  db, businessId, actorUid, shiftId, requestId, closedAt,
  closedByName, countedCash, notes = '',
}) {
  if (!db || typeof db.runTransaction !== 'function' || !validBusiness(businessId) ||
      !validUid(actorUid) || !validShift(shiftId) || !validRequest(requestId) ||
      !validIso(closedAt) || typeof closedByName !== 'string' ||
      !closedByName.trim() || closedByName.trim().length > 100 ||
      typeof notes !== 'string' || notes.length > 500) deny('INVALID_INPUT');
  const countedCents = cents(countedCash);
  const root = db.collection('businesses').doc(businessId);
  const member = db.collection('businessMemberships').doc(businessId + '_' + actorUid);
  const shiftCollection = root.collection('shifts');
  const shift = shiftCollection.doc(shiftId);
  const authority = root.collection('shiftAuthority');
  const lock = authority.doc('current');
  const receipt = authority.doc('closed-' + shiftId);
  const cap = (q) => q.limit(201);
  return db.runTransaction(async (tx) => {
    const [rootSnap, memberSnap, shiftSnap, lockSnap, receiptSnap, shiftsSnap,
      ordersSnap, paymentsSnap, expensesSnap, vaultSnap] = await Promise.all([
      tx.get(root), tx.get(member), tx.get(shift), tx.get(lock), tx.get(receipt),
      tx.get(cap(shiftCollection)),
      tx.get(cap(db.collection('restaurant_orders').where('restaurantId', '==', businessId))),
      tx.get(cap(db.collection('table_payments').where('restaurantId', '==', businessId))),
      tx.get(cap(root.collection('expenses'))),
      tx.get(cap(root.collection('vault'))),
    ]);
    const tenant = rootSnap.data();
    const membership = memberSnap.data();
    if (!rootSnap.exists || tenant?.restaurantId !== businessId ||
        !memberSnap.exists || membership?.restaurantId !== businessId ||
        membership?.userId !== actorUid || membership?.active !== true ||
        !roles.has(membership?.role) ||
        (membership.role === 'OWNER' && tenant.ownerUserId !== undefined && tenant.ownerUserId !== actorUid)) {
      deny('FORBIDDEN');
    }
    const current = shiftSnap.data();
    if (!shiftSnap.exists || current?.businessId !== businessId) deny('SHIFT_NOT_FOUND');
    if (current.status === 'cerrado') {
      const r = receiptSnap.data();
      if (receiptSnap.exists && r?.businessId === businessId && r?.shiftId === shiftId &&
          r?.actorUid === actorUid && r?.requestId === requestId &&
          current.closeRequestId === requestId && current.closedByUid === actorUid) {
        return { shiftId, status: 'already_closed' };
      }
      deny('SHIFT_ALREADY_CLOSED');
    }
    if (receiptSnap.exists) deny('CLOSE_RECEIPT_CONFLICT');
    if (current.status !== 'abierto') deny('SHIFT_STATE_INVALID');
    const lockData = lockSnap.data();
    if (!lockSnap.exists || lockData?.businessId !== businessId ||
        lockData?.shiftId !== shiftId || lockData?.status !== 'abierto' ||
        !validUid(lockData?.actorUid) || current.openedByUid !== lockData.actorUid ||
        current.openRequestId !== lockData.requestId) deny('LOCK_UNVERIFIED');
    const shifts = readRows(shiftsSnap, businessId, 'businessId');
    if (shifts.some((s) => !['abierto', 'cerrado'].includes(s.status)) ||
        shifts.filter((s) => s.status === 'abierto').length !== 1 ||
        shifts.find((s) => s.status === 'abierto')?.id !== shiftId) deny('HISTORY_REVIEW_REQUIRED');
    const start = dateMs(current.openedAt);
    const end = dateMs(closedAt);
    if (end < start) deny('INVALID_CLOSE_TIME');
    const initial = cents(current.initialCashFund);
    const orders = readRows(ordersSnap, businessId, 'restaurantId');
    const payments = readRows(paymentsSnap, businessId, 'restaurantId');
    const expenses = readRows(expensesSnap, businessId, 'businessId');
    const vault = readRows(vaultSnap, businessId, 'businessId');
    // No se permite una falsa conciliación de mesas ni una suma parcial.
    if (payments.length) deny('TABLE_PAYMENTS_REVIEW_REQUIRED');
    let cash = 0, card = 0, platforms = 0, count = 0;
    for (const order of orders) {
      if (order.billingStatus !== 'PAGADO') {
        if (order.billingStatus !== 'PENDIENTE') deny('ORDER_REVIEW_REQUIRED');
        continue;
      }
      if (order.status === 'CANCELADO') deny('ORDER_REVIEW_REQUIRED');
      const at = dateMs(order.paidAt);
      if (at < start) continue;
      if (at > end) deny('UNVERIFIED_DATE');
      if (!['pickup', 'delivery'].includes(order.orderType)) deny('TABLE_ORDERS_REVIEW_REQUIRED');
      const amount = cents(order.total, true);
      if (order.paymentMethod === 'efectivo') cash = add(cash, amount);
      else if (order.paymentMethod === 'tarjeta') card = add(card, amount);
      else if (order.paymentMethod === 'transferencia') platforms = add(platforms, amount);
      else deny('PAYMENT_METHOD_REVIEW_REQUIRED');
      count++;
    }
    let cashExpenses = 0;
    for (const expense of expenses) {
      const at = dateMs(expense.createdAt);
      const amount = cents(expense.amount, true);
      if (!['efectivo_caja', 'otro'].includes(expense.paidWith)) deny('EXPENSE_REVIEW_REQUIRED');
      if (at > end) deny('UNVERIFIED_DATE');
      if (at >= start && expense.paidWith === 'efectivo_caja') cashExpenses = add(cashExpenses, amount);
    }
    let vaultNet = 0;
    for (const movement of vault) {
      const at = dateMs(movement.createdAt);
      const amount = cents(movement.amount, true);
      if (!['deposito', 'retiro'].includes(movement.kind)) deny('VAULT_REVIEW_REQUIRED');
      if (at > end) deny('UNVERIFIED_DATE');
      if (at >= start) vaultNet = add(vaultNet, movement.kind === 'deposito' ? amount : -amount);
    }
    const total = add(add(cash, card), platforms);
    const expected = add(add(initial, cash), add(-cashExpenses, -vaultNet));
    if (expected < 0) deny('NEGATIVE_EXPECTED_CASH');
    const difference = add(countedCents, -expected);
    const money = (n) => n / 100;
    const closing = {
      status: 'cerrado', closedAt, closedByName: closedByName.trim(),
      closedByUid: actorUid, closeRequestId: requestId,
      salesCash: money(cash), salesCard: money(card), salesPlatforms: money(platforms),
      totalSales: money(total), cashExpenses: money(cashExpenses),
      expectedCash: money(expected), countedCash: money(countedCents),
      cashDifference: money(difference), notes: notes.trim(), updatedAt: closedAt,
    };
    tx.update(shift, closing);
    tx.delete(lock);
    tx.create(receipt, { businessId, shiftId, actorUid, requestId, closedAt, totalSales: money(total) });
    return { shiftId, status: 'closed', totalSales: money(total), expectedCash: money(expected), cashDifference: money(difference), count };
  });
}
