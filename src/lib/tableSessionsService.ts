import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  StaffUser,
  TableAccountMode,
  TableSession,
  TableSessionAccount,
  TableSessionPerson,
  TableSessionStatus,
} from '../types';
import { sanitizeFirestorePayload } from './firestoreService';
import { occupyTableFromPublicQR } from './tablesService';

export const TABLE_SESSIONS_COLLECTION = 'table_sessions';
export const TABLE_SESSIONS_EVENT = 'alo_table_sessions_updated';
export const RESTAURANT_ID = 'alo-restaurante' as const;

const VALID_TABLES = new Set([1, 2, 4, 5, 6, 7, 8, 9]);
const ACCOUNT_SELECTION_KEY_PREFIX = 'alo_table_account_selection_v1';
const PERSON_SELECTION_KEY_PREFIX = 'alo_table_person_selection_v1';

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


/**
 * V4.3A - Las personas se derivan de guestCount en vez de guardarse como una
 * segunda fuente de verdad en Firestore. El id person-N es estable durante la
 * sesión y la cuenta sigue siendo un concepto independiente.
 */
export function getSessionPersons(
  session: Pick<TableSession, 'guestCount' | 'accountMode' | 'accounts'>
): TableSessionPerson[] {
  const count = Math.max(1, Math.min(20, Math.round(Number(session.guestCount || 1))));
  const generalAccountId = session.accounts[0]?.id || 'general';

  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const mappedAccountId = session.accountMode === 'SEPARADAS'
      ? (session.accounts[index]?.id || generalAccountId)
      : generalAccountId;

    return {
      id: `person-${number}`,
      index: number,
      label: `Persona ${number}`,
      accountId: mappedAccountId,
    };
  });
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
    waiterId: data.waiterId || '',
    waiterName: data.waiterName || '',
  };
}

export async function getTableSession(tableNumber: number): Promise<TableSession | null> {
  if (!isValidOperationalTableNumber(tableNumber)) return null;
  const ref = doc(db, TABLE_SESSIONS_COLLECTION, tableSessionDocId(tableNumber));
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return normalizeSession(snap.id, snap.data() as Partial<TableSession>);
}

export function subscribeToRestaurantTableSessions(
  callback: (sessionsByNumber: Record<number, TableSession>) => void
): () => void {
  const sessionsQuery = query(
    collection(db, TABLE_SESSIONS_COLLECTION),
    where('restaurantId', '==', RESTAURANT_ID)
  );

  return onSnapshot(
    sessionsQuery,
    (snapshot) => {
      const sessionsByNumber: Record<number, TableSession> = {};

      snapshot.forEach((sessionDoc) => {
        const session = normalizeSession(
          sessionDoc.id,
          sessionDoc.data() as Partial<TableSession>
        );
        if (session) {
          sessionsByNumber[session.tableNumber] = session;
        }
      });

      callback(sessionsByNumber);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(TABLE_SESSIONS_EVENT));
      }
    },
    (error) => {
      console.warn('[tableSessionsService] restaurant listener error:', error);
      callback({});
    }
  );
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
  const safeGuestCount = Math.max(1, Math.min(20, Math.round(guestCount || 1)));
  const payload: Omit<TableSession, 'id'> = {
    restaurantId: RESTAURANT_ID,
    tableNumber,
    guestCount: safeGuestCount,
    accountMode: 'GENERAL',
    accounts: [buildGeneralAccount(createdAt)],
    status: 'ACTIVA',
    openedBy: 'QR',
    openedAt: createdAt,
    updatedAt: createdAt,
  };

  const ref = doc(db, TABLE_SESSIONS_COLLECTION, tableSessionDocId(tableNumber));
  await setDoc(ref, sanitizeFirestorePayload(payload));

  // Ocupar la mesa operativamente
  try {
    await occupyTableFromPublicQR(tableNumber, safeGuestCount);
  } catch (err) {
    console.warn('[tableSessionsService] no se pudo ocupar mesa desde activatePublicTableSession:', err);
  }

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

/**
 * Asigna o cambia el mesero responsable de la sesión activa de la mesa
 */
export async function assignWaiterToTableSession(
  tableNumber: number,
  waiter: { id: string; name: string },
  user: Pick<StaffUser, 'id' | 'name'>
): Promise<void> {
  if (!isValidOperationalTableNumber(tableNumber)) return;
  const session = await getTableSession(tableNumber);
  if (!session) return;

  const patch: Record<string, unknown> = {
    waiterId: waiter.id,
    waiterName: waiter.name,
    updatedAt: nowIso(),
    updatedById: user.id,
    updatedByName: user.name,
  };

  await updateDoc(
    doc(db, TABLE_SESSIONS_COLLECTION, session.id || tableSessionDocId(tableNumber)),
    sanitizeFirestorePayload(patch)
  );

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(TABLE_SESSIONS_EVENT));
  }
}

export const TABLE_SESSIONS_HISTORY_KEY = 'alo_table_sessions_history_v1';
export const TABLE_SESSIONS_HISTORY_COLLECTION = 'table_sessions_history';

export function getLocalTableSessionsHistory(): TableSession[] {
  try {
    const raw = localStorage.getItem(TABLE_SESSIONS_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalTableSessionsHistory(history: TableSession[]): void {
  try {
    localStorage.setItem(TABLE_SESSIONS_HISTORY_KEY, JSON.stringify(history.slice(0, 100)));
  } catch (err) {
    console.warn('Error saving table session history locally:', err);
  }
}

/**
 * Cierra la sesión activa de la mesa, guarda copia completa en el historial,
 * elimina asignación de comensales/cuentas del estado activo y deja la mesa lista.
 */
export async function closeAndArchiveTableSession(
  tableNumber: number,
  user: Pick<StaffUser, 'id' | 'name'>
): Promise<void> {
  if (!isValidOperationalTableNumber(tableNumber)) return;

  const session = await getTableSession(tableNumber);
  const now = nowIso();

  // 1. Archivar sesión en historial si existe y no estaba cerrada
  if (session && session.status !== 'CERRADA') {
    const archived: TableSession = {
      ...session,
      status: 'CERRADA',
      updatedAt: now,
      updatedById: user.id,
      updatedByName: user.name,
    };

    const localHistory = getLocalTableSessionsHistory();
    saveLocalTableSessionsHistory([archived, ...localHistory]);

    try {
      const historyDocId = `${session.id || tableSessionDocId(tableNumber)}_${Date.now()}`;
      await setDoc(doc(db, TABLE_SESSIONS_HISTORY_COLLECTION, historyDocId), sanitizeFirestorePayload(archived));
    } catch (histErr) {
      console.warn('[tableSessionsService] no se pudo archivar en Firestore:', histErr);
    }
  }

  // 2. Limpiar selecciones locales de cuenta y persona de esta mesa
  clearTableAccountSelection(tableNumber);
  clearTablePersonSelection(tableNumber);

  // 3. Dejar el documento de sesión en CERRADA y vaciar clientes de la sesión activa
  try {
    const ref = doc(db, TABLE_SESSIONS_COLLECTION, tableSessionDocId(tableNumber));
    await setDoc(
      ref,
      sanitizeFirestorePayload({
        restaurantId: RESTAURANT_ID,
        tableNumber,
        guestCount: 0,
        accountMode: 'GENERAL',
        accounts: [],
        status: 'CERRADA',
        waiterId: '',
        waiterName: '',
        openedBy: session?.openedBy || 'MESERO',
        openedAt: session?.openedAt || now,
        updatedAt: now,
        updatedById: user.id,
        updatedByName: user.name,
      }),
      { merge: true }
    );
  } catch (err) {
    console.warn('[tableSessionsService] error al cerrar sesión en Firestore:', err);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(TABLE_SESSIONS_EVENT));
  }
}

export async function setTableSessionStatusByStaff(
  tableNumber: number,
  status: TableSessionStatus,
  user: Pick<StaffUser, 'id' | 'name'>
): Promise<void> {
  if (status === 'CERRADA') {
    await closeAndArchiveTableSession(tableNumber, user);
    return;
  }

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

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(TABLE_SESSIONS_EVENT));
  }
}

export async function deleteTableSessionByStaff(tableNumber: number): Promise<void> {
  if (!isValidOperationalTableNumber(tableNumber)) return;
  await deleteDoc(doc(db, TABLE_SESSIONS_COLLECTION, tableSessionDocId(tableNumber)));
  clearTableAccountSelection(tableNumber);
  clearTablePersonSelection(tableNumber);
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


function personSelectionKey(tableNumber: number): string {
  return `${PERSON_SELECTION_KEY_PREFIX}_${tableNumber}`;
}

export function setTablePersonSelection(tableNumber: number, personId: string): void {
  try {
    localStorage.setItem(personSelectionKey(tableNumber), personId);
  } catch {
    // ignore
  }
}

export function getTablePersonSelection(tableNumber: number): string | null {
  try {
    return localStorage.getItem(personSelectionKey(tableNumber));
  } catch {
    return null;
  }
}

export function clearTablePersonSelection(tableNumber: number): void {
  try {
    localStorage.removeItem(personSelectionKey(tableNumber));
  } catch {
    // ignore
  }
}

export async function getTableOrderContext(tableNumber: number): Promise<{
  tableSessionId: string;
  accountId: string;
  accountLabel: string;
  personId: string;
  personIndex: number;
  personLabel: string;
}> {
  const session = await getTableSession(tableNumber);
  if (!session || session.status === 'CERRADA') {
    throw new Error('La sesión de esta mesa ya no está activa.');
  }

  const persons = getSessionPersons(session);
  const storedPersonId = getTablePersonSelection(tableNumber);
  const selectedPerson = persons.find((person) => person.id === storedPersonId) || persons[0];
  setTablePersonSelection(tableNumber, selectedPerson.id);

  if (session.accountMode === 'GENERAL') {
    const account = session.accounts[0] || buildGeneralAccount(session.openedAt);
    return {
      tableSessionId: session.id || tableSessionDocId(tableNumber),
      accountId: account.id,
      accountLabel: account.label,
      personId: selectedPerson.id,
      personIndex: selectedPerson.index,
      personLabel: selectedPerson.label,
    };
  }

  const selectedId = getTableAccountSelection(tableNumber);
  const selectedAccount = session.accounts.find((account) => account.id === selectedId)
    || session.accounts.find((account) => account.id === selectedPerson.accountId);

  if (!selectedAccount) {
    throw new Error('Selecciona tu cuenta antes de enviar el pedido.');
  }

  setTableAccountSelection(tableNumber, selectedAccount.id);

  return {
    tableSessionId: session.id || tableSessionDocId(tableNumber),
    accountId: selectedAccount.id,
    accountLabel: selectedAccount.label,
    personId: selectedPerson.id,
    personIndex: selectedPerson.index,
    personLabel: selectedPerson.label,
  };
}

