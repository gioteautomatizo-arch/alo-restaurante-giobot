import {
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  StaffUser,
  TableAccountMode,
  TableSession,
  TableSessionAccount,
  TableSessionStatus,
} from '../types';
import { sanitizeFirestorePayload } from './firestoreService';

export const TABLE_SESSIONS_COLLECTION = 'table_sessions';
export const TABLE_SESSIONS_EVENT = 'alo_table_sessions_updated';
export const RESTAURANT_ID = 'alo-restaurante' as const;

const VALID_TABLES = new Set([1, 2, 4, 5, 6, 7, 8, 9]);
const ACCOUNT_SELECTION_KEY_PREFIX = 'alo_table_account_selection_v1';

export function isValidOperationalTableNumber(tableNumber: number): boolean {
  return Number.isInteger(tableNumber) && VALID_TABLES.has(tableNumber);
}

export function tableSessionDocId(tableNumber: number): string {
  return `table-${tableNumber}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildGeneralAccount(createdAt = nowIso()): TableSessionAccount {
  return {
    id: 'general',
    label: 'Cuenta general',
    createdAt,
  };
}

function buildSeparateAccounts(guestCount: number, createdAt = nowIso()): TableSessionAccount[] {
  return Array.from({ length: Math.max(1, guestCount) }, (_, index) => ({
    id: `cuenta-${index + 1}`,
    label: `Cuenta ${index + 1}`,
    createdAt,
  }));
}

function normalizeSession(id: string, data: Partial<TableSession>): TableSession | null {
  const tableNumber = Number(data.tableNumber || 0);
  if (!isValidOperationalTableNumber(tableNumber)) return null;

  const openedAt = data.openedAt || nowIso();
  const accountMode: TableAccountMode = data.accountMode === 'SEPARADAS' ? 'SEPARADAS' : 'GENERAL';
  const accounts = Array.isArray(data.accounts) && data.accounts.length > 0
    ? data.accounts
    : accountMode === 'SEPARADAS'
      ? buildSeparateAccounts(Math.max(1, Number(data.guestCount || 1)), openedAt)
      : [buildGeneralAccount(openedAt)];

  return {
    id,
    restaurantId: RESTAURANT_ID,
    tableNumber,
    guestCount: Math.max(1, Number(data.guestCount || 1)),
    accountMode,
    accounts,
    status: data.status === 'CUENTA' || data.status === 'CERRADA' ? data.status : 'ACTIVA',
    openedBy: data.openedBy === 'MESERO' ? 'MESERO' : 'QR',
    openedAt,
    updatedAt: data.updatedAt || openedAt,
    updatedById: data.updatedById,
    updatedByName: data.updatedByName,
  };
}

export async function getTableSession(tableNumber: number): Promise<TableSession | null> {
  if (!isValidOperationalTableNumber(tableNumber)) return null;
  const ref = doc(db, TABLE_SESSIONS_COLLECTION, tableSessionDocId(tableNumber));
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return normalizeSession(snap.id, snap.data() as Partial<TableSession>);
}

export function subscribeToTableSession(
  tableNumber: number,
  callback: (session: TableSession | null) => void
): () => void {
  if (!isValidOperationalTableNumber(tableNumber)) {
    callback(null);
    return () => {};
  }

  const ref = doc(db, TABLE_SESSIONS_COLLECTION, tableSessionDocId(tableNumber));
  return onSnapshot(
    ref,
    (snap) => {
      callback(snap.exists() ? normalizeSession(snap.id, snap.data() as Partial<TableSession>) : null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(TABLE_SESSIONS_EVENT));
      }
    },
    (error) => {
      console.warn('[tableSessionsService] listener error:', error);
      callback(null);
    }
  );
}

/**
 * Primer escaneo: crea una sesión pública en Cuenta general.
 * Si la mesa ya tiene sesión activa, la reutiliza y NO la duplica.
 */
export async function activatePublicTableSession(
  tableNumber: number,
  guestCount: number
): Promise<{ session: TableSession; alreadyActive: boolean }> {
  if (!isValidOperationalTableNumber(tableNumber)) {
    throw new Error('Número de mesa no válido.');
  }

  const existing = await getTableSession(tableNumber);
  if (existing && existing.status !== 'CERRADA') {
    return { session: existing, alreadyActive: true };
  }

  const createdAt = nowIso();
  const payload: Omit<TableSession, 'id'> = {
    restaurantId: RESTAURANT_ID,
    tableNumber,
    guestCount: Math.max(1, Math.min(20, Math.round(guestCount || 1))),
    accountMode: 'GENERAL',
    accounts: [buildGeneralAccount(createdAt)],
    status: 'ACTIVA',
    openedBy: 'QR',
    openedAt: createdAt,
    updatedAt: createdAt,
  };

  const ref = doc(db, TABLE_SESSIONS_COLLECTION, tableSessionDocId(tableNumber));
  await setDoc(ref, sanitizeFirestorePayload(payload));
  return { session: { ...payload, id: ref.id }, alreadyActive: false };
}

/** Personal: garantiza que una mesa ocupada manualmente también tenga sesión digital. */
export async function ensureStaffTableSession(
  tableNumber: number,
  guestCount: number,
  user?: Pick<StaffUser, 'id' | 'name'>
): Promise<TableSession> {
  if (!isValidOperationalTableNumber(tableNumber)) {
    throw new Error('Número de mesa no válido.');
  }

  const existing = await getTableSession(tableNumber);
  if (existing && existing.status !== 'CERRADA') {
    if (existing.guestCount !== guestCount && user) {
      await updateTableSessionGuestCountByStaff(tableNumber, guestCount, user);
      return { ...existing, guestCount: Math.max(1, guestCount) };
    }
    return existing;
  }

  const createdAt = nowIso();
  const payload: Omit<TableSession, 'id'> = {
    restaurantId: RESTAURANT_ID,
    tableNumber,
    guestCount: Math.max(1, Math.min(20, Math.round(guestCount || 1))),
    accountMode: 'GENERAL',
    accounts: [buildGeneralAccount(createdAt)],
    status: 'ACTIVA',
    openedBy: 'MESERO',
    openedAt: createdAt,
    updatedAt: createdAt,
    updatedById: user?.id,
    updatedByName: user?.name,
  };

  const ref = doc(db, TABLE_SESSIONS_COLLECTION, tableSessionDocId(tableNumber));
  await setDoc(ref, sanitizeFirestorePayload(payload));
  return { ...payload, id: ref.id };
}

export async function setTableSessionAccountModeByStaff(
  tableNumber: number,
  mode: TableAccountMode,
  guestCount: number,
  user: Pick<StaffUser, 'id' | 'name'>
): Promise<void> {
  const session = await ensureStaffTableSession(tableNumber, guestCount, user);
  const createdAt = nowIso();
  const accounts = mode === 'SEPARADAS'
    ? buildSeparateAccounts(Math.max(1, guestCount), createdAt)
    : [buildGeneralAccount(createdAt)];

  await updateDoc(
    doc(db, TABLE_SESSIONS_COLLECTION, session.id || tableSessionDocId(tableNumber)),
    sanitizeFirestorePayload({
      accountMode: mode,
      accounts,
      guestCount: Math.max(1, guestCount),
      updatedAt: createdAt,
      updatedById: user.id,
      updatedByName: user.name,
    })
  );

  clearTableAccountSelection(tableNumber);
}

export async function updateTableSessionGuestCountByStaff(
  tableNumber: number,
  guestCount: number,
  user: Pick<StaffUser, 'id' | 'name'>
): Promise<void> {
  const session = await getTableSession(tableNumber);
  if (!session) return;

  const nextGuestCount = Math.max(1, Math.min(20, Math.round(guestCount || 1)));
  const patch: Record<string, unknown> = {
    guestCount: nextGuestCount,
    updatedAt: nowIso(),
    updatedById: user.id,
    updatedByName: user.name,
  };

  // Si ya existen cuentas separadas, mantener el número de cuentas alineado con comensales.
  if (session.accountMode === 'SEPARADAS') {
    patch.accounts = buildSeparateAccounts(nextGuestCount);
  }

  await updateDoc(
    doc(db, TABLE_SESSIONS_COLLECTION, session.id || tableSessionDocId(tableNumber)),
    sanitizeFirestorePayload(patch)
  );
}

export async function setTableSessionStatusByStaff(
  tableNumber: number,
  status: TableSessionStatus,
  user: Pick<StaffUser, 'id' | 'name'>
): Promise<void> {
  const session = await getTableSession(tableNumber);
  if (!session) return;
  await updateDoc(
    doc(db, TABLE_SESSIONS_COLLECTION, session.id || tableSessionDocId(tableNumber)),
    sanitizeFirestorePayload({
      status,
      updatedAt: nowIso(),
      updatedById: user.id,
      updatedByName: user.name,
    })
  );
}

export async function deleteTableSessionByStaff(tableNumber: number): Promise<void> {
  if (!isValidOperationalTableNumber(tableNumber)) return;
  await deleteDoc(doc(db, TABLE_SESSIONS_COLLECTION, tableSessionDocId(tableNumber)));
  clearTableAccountSelection(tableNumber);
}

function selectionKey(tableNumber: number): string {
  return `${ACCOUNT_SELECTION_KEY_PREFIX}_${tableNumber}`;
}

export function setTableAccountSelection(tableNumber: number, accountId: string): void {
  try {
    localStorage.setItem(selectionKey(tableNumber), accountId);
  } catch {
    // ignore
  }
}

export function getTableAccountSelection(tableNumber: number): string | null {
  try {
    return localStorage.getItem(selectionKey(tableNumber));
  } catch {
    return null;
  }
}

export function clearTableAccountSelection(tableNumber: number): void {
  try {
    localStorage.removeItem(selectionKey(tableNumber));
  } catch {
    // ignore
  }
}

export async function getTableOrderContext(tableNumber: number): Promise<{
  tableSessionId: string;
  accountId: string;
  accountLabel: string;
}> {
  const session = await getTableSession(tableNumber);
  if (!session || session.status === 'CERRADA') {
    throw new Error('La sesión de esta mesa ya no está activa.');
  }

  if (session.accountMode === 'GENERAL') {
    const account = session.accounts[0] || buildGeneralAccount(session.openedAt);
    return {
      tableSessionId: session.id || tableSessionDocId(tableNumber),
      accountId: account.id,
      accountLabel: account.label,
    };
  }

  const selectedId = getTableAccountSelection(tableNumber);
  const selectedAccount = session.accounts.find((account) => account.id === selectedId);
  if (!selectedAccount) {
    throw new Error('Selecciona tu cuenta antes de enviar el pedido.');
  }

  return {
    tableSessionId: session.id || tableSessionDocId(tableNumber),
    accountId: selectedAccount.id,
    accountLabel: selectedAccount.label,
  };
}
