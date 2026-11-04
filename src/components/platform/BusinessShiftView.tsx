import { BusinessTableReconciliation } from './BusinessTableReconciliation';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, History, Lock, Play } from 'lucide-react';
import type { RestaurantOrder } from '../../types';
import { subscribeToBusinessRestaurantOrders } from '../../lib/ordersService';
import { saveModuleDoc, subscribeToModule } from '../../lib/tenantModules';
import { auditUnclassifiedPaidOrders, auditUnreconciledTableOrders, computeShiftSalesFromOrders, isOffTableOrder } from '../../lib/shiftSales';
import { getCurrentAuthUser } from '../../lib/firebase';
import { countHistoricalPaidOrdersMissingPaymentDate, countPaidOrdersMissingPaymentDate, getShiftReadiness, initialShiftFeedStates, parseShiftCashAmount, previewShiftCashDifference, type ShiftFeedName } from '../../lib/businessShiftReadiness';

const money = (v: number) => v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const when = (iso?: string) => {
  const d = new Date(iso || '');
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' });
};

interface ShiftDoc {
  id: string;
  status: 'abierto' | 'cerrado';
  shiftType: 'AM' | 'PM';
  openedAt: string;
  openedByName: string;
  initialCashFund: number;
  closedAt?: string;
  closedByName?: string;
  salesCash?: number;
  salesCard?: number;
  salesPlatforms?: number;
  totalSales?: number;
  cashExpenses?: number;
  expectedCash?: number;
  countedCash?: number;
  cashDifference?: number;
  notes?: string;
}
interface ExpenseDoc { amount: number; paidWith?: string; createdAt: string }

const card = 'rounded-2xl border border-[#3A3022] bg-[#111111] p-4';
const input = 'w-full rounded-xl border border-[#3A3022] bg-[#0B0B0B] px-3 py-3 text-sm text-[#F7F7F7] outline-none focus:border-[#D6A34A]';

/** Cada negocio/cuenta conserva su propia operación y formulario. */
export const BusinessShiftView: React.FC<{ businessId: string }> = ({ businessId }) => (
  <BusinessShiftSession key={`${businessId}:${getCurrentAuthUser()?.uid ?? ''}`} businessId={businessId} />
);

const BusinessShiftSession: React.FC<{ businessId: string }> = ({ businessId }) => {
  const [shifts, setShifts] = useState<ShiftDoc[]>([]);
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [expenses, setExpenses] = useState<ExpenseDoc[]>([]);
  const [vault, setVault] = useState<Array<{ kind: 'deposito' | 'retiro'; amount: number; createdAt: string }>>([]);
  const [fund, setFund] = useState('');
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedStates, setFeedStates] = useState(() => initialShiftFeedStates(businessId));
  const [readAttempt, setReadAttempt] = useState(0);
  const savingRef = useRef(false);
  const mountedRef = useRef(false);
  const sessionUid = useRef(getCurrentAuthUser()?.uid);
  const isCurrentSession = () => mountedRef.current && !!sessionUid.current && getCurrentAuthUser()?.uid === sessionUid.current;
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Reintentar solo lecturas: nunca repetir apertura/cierre automáticamente.
  const retryReads = () => {
    if (savingRef.current) return;
    setFeedStates(initialShiftFeedStates(businessId));
    setReadAttempt((attempt) => attempt + 1);
  };

  // Una lectura denegada NO significa ventas/gastos = 0.
  // Aislar cada suscripción impide utilizar datos del negocio anterior al navegar.
  useEffect(() => {
    let alive = true;
    setFeedStates(initialShiftFeedStates(businessId));
    // El componente se remonta al cambiar de negocio/cuenta; un reintento conserva la captura.
    const mark = (key: ShiftFeedName, status: 'ready' | 'error') => {
      if (alive) setFeedStates((previous) => ({
        ...previous,
        [key]: { businessId, status },
      }));
    };
    const subs = [
      subscribeToModule<ShiftDoc>(businessId, 'shifts', (rows) => {
        if (alive) { setShifts(rows); mark('shifts', 'ready'); }
      }, 'openedAt', () => mark('shifts', 'error')),
      subscribeToModule<ExpenseDoc>(businessId, 'expenses', (rows) => {
        if (alive) { setExpenses(rows); mark('expenses', 'ready'); }
      }, 'createdAt', () => mark('expenses', 'error')),
      subscribeToModule<{ kind: 'deposito' | 'retiro'; amount: number; createdAt: string }>(businessId, 'vault', (rows) => {
        if (alive) { setVault(rows); mark('vault', 'ready'); }
      }, 'createdAt', () => mark('vault', 'error')),
      subscribeToBusinessRestaurantOrders(businessId, (rows) => {
        if (alive) { setOrders(rows); mark('orders', 'ready'); }
      }, () => mark('orders', 'error')),
    ];
    return () => { alive = false; subs.forEach((stop) => stop()); };
  }, [businessId, readAttempt]);

  const currentShifts = feedStates.shifts.businessId === businessId && feedStates.shifts.status === 'ready' ? shifts : [];
  const openShifts = currentShifts.filter((s) => s.status === 'abierto');
  const readiness = getShiftReadiness(businessId, feedStates, openShifts.length, openShifts[0]?.openedAt);
  const active = readiness.ready && openShifts.length === 1 ? openShifts[0] : null;
  const history = readiness.ready ? currentShifts.filter((s) => s.status === 'cerrado') : [];
  const missingPaymentDates = active && readiness.ready ? countPaidOrdersMissingPaymentDate(orders, active.openedAt) : 0;
  const historicalMissingPaymentDates = active && readiness.ready ? countHistoricalPaidOrdersMissingPaymentDate(orders, active.openedAt) : 0;
  const unclassifiedPaid = active && readiness.ready ? auditUnclassifiedPaidOrders(orders, active.openedAt) : { count: 0, positiveAmount: 0 };
  const unverifiedTable = active && readiness.ready ? auditUnreconciledTableOrders(orders, active.openedAt) : { inWindow: 0, undated: 0 };
  const tableCloseBlocked = unverifiedTable.inWindow > 0 || unverifiedTable.undated > 0;

  const live = useMemo(() => {
    if (!active || !readiness.ready) return null;
    // Sin feed de pagos de mesa conciliado, nunca atribuir pedidos de mesa al total provisional.
    const sales = computeShiftSalesFromOrders(orders.filter(isOffTableOrder), active.openedAt);
    const start = Date.parse(active.openedAt) || 0;
    const cashExpenses = expenses
      .filter((e) => e.paidWith === 'efectivo_caja' && (Date.parse(e.createdAt) || 0) >= start)
      .reduce((s, e) => s + Number(e.amount || 0), 0);
    const cashToVault = vault
      .filter((m) => (Date.parse(m.createdAt) || 0) >= start)
      .reduce((sum, m) => sum + (m.kind === 'deposito' ? 1 : -1) * Number(m.amount || 0), 0);
    const expectedCash = Math.round((Number(active.initialCashFund || 0) + sales.cash - cashExpenses - cashToVault) * 100) / 100;
    return { sales, cashExpenses, cashToVault, expectedCash };
  }, [active, orders, expenses, vault, readiness.ready]);

  // Vista previa con la misma precisión en centavos que el cierre; no altera el cálculo guardado.
  const cashDifferencePreview = live ? previewShiftCashDifference(counted, live.expectedCash) : null;

  const user = getCurrentAuthUser();
  const userName = user?.displayName || user?.email || 'Usuario';

  const openShift = async () => {
    if (!readiness.ready || openShifts.length !== 0 || savingRef.current || !isCurrentSession()) return;
    savingRef.current = true;
    setBusy(true);
    setError('');
    try {
      const fundAmount = parseShiftCashAmount(fund);
      if (fundAmount === null) throw new Error('Escribe el fondo real de caja: cero o una cantidad válida con hasta dos decimales.');
      const hour = Number(new Date().toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/Mexico_City' }));
      await saveModuleDoc(
        businessId,
        'shifts',
        { status: 'abierto', shiftType: hour < 15 ? 'AM' : 'PM', openedAt: new Date().toISOString(), openedByName: userName, initialCashFund: fundAmount },
        { action: 'shift.open', summary: `Abrió turno con fondo de ${money(fundAmount)}` },
      );
    } catch (e) {
      if (isCurrentSession()) setError(e instanceof Error ? e.message : 'No pudimos abrir el turno.');
    } finally {
      savingRef.current = false;
      if (isCurrentSession()) setBusy(false);
    }
  };

  const closeShift = async () => {
    if (!readiness.ready || !active || !live || savingRef.current || !isCurrentSession()) return;
    if (missingPaymentDates > 0) {
      setError('Hay pedidos pagados sin fecha de cobro verificable. Revisa esos pedidos antes de cerrar el turno.');
      return;
    }
    if (unclassifiedPaid.count > 0) {
      setError('Hay pedidos pagados con método desconocido o importe no positivo. Concílialos antes de cerrar el turno.');
      return;
    }
    if (tableCloseBlocked) {
      setError('Hay pedidos de mesa pagados o sin origen verificable pendientes de conciliación. No se puede cerrar Caja con esos importes.');
      return;
    }
    savingRef.current = true;
    setBusy(true);
    setError('');
    try {
      const countedCash = parseShiftCashAmount(counted);
      if (countedCash === null) throw new Error('Escribe el efectivo contado: cero o una cantidad válida con hasta dos decimales.');
      const difference = Math.round((countedCash - live.expectedCash) * 100) / 100;
      await saveModuleDoc(
        businessId,
        'shifts',
        {
          ...active,
          status: 'cerrado',
          closedAt: new Date().toISOString(),
          closedByName: userName,
          salesCash: live.sales.cash,
          salesCard: live.sales.card,
          salesPlatforms: live.sales.platforms,
          totalSales: live.sales.total,
          cashExpenses: live.cashExpenses,
          expectedCash: live.expectedCash,
          countedCash,
          cashDifference: difference,
          notes: notes.trim(),
        },
        { action: 'shift.close', summary: `Cerró turno · ventas ${money(live.sales.total)} · diferencia ${money(difference)}` },
      );
      if (isCurrentSession()) {
        setClosing(false);
        setCounted('');
        setNotes('');
      }
    } catch (e) {
      if (isCurrentSession()) setError(e instanceof Error ? e.message : 'No pudimos cerrar el turno.');
    } finally {
      savingRef.current = false;
      if (isCurrentSession()) setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-xl font-black text-[#F7F7F7]">Control de turno</h2>
        <p className="text-xs text-[#B7B7B7]">Vista provisional: solo pedidos para llevar y domicilio con cobro verificable. Los pagos de mesa requieren conciliación independiente antes del cierre.</p>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs font-semibold text-rose-200">{error}</div>}
      {readiness.errors.length > 0 && <div role="alert" className={card}>
        <strong className="text-sm text-red-300">No se puede conciliar la Caja todavía</strong>
        <p className="mt-2 text-xs text-[#C8C8C8]">No se pudieron consultar: {readiness.errors.join(', ')}. No significa que el saldo sea cero. Se bloquearon apertura y cierre de turno para evitar cortes incorrectos. Revisa permisos o conexión.</p>
        <button type="button" disabled={busy} onClick={retryReads} className="mt-3 rounded-xl border border-[#D6A34A] px-4 py-2 text-sm font-bold text-[#E3BC6B] disabled:opacity-50">Reintentar consulta</button>
      </div>}
      {readiness.loading.length > 0 && readiness.errors.length === 0 && <div role="status" className={card}>
        <p className="text-xs text-[#C8C8C8]">Consultando turnos, pedidos, gastos y resguardo. No se permite operar Caja antes de obtener todos los datos.</p>
      </div>}
      {readiness.duplicateOpenShifts && readiness.errors.length === 0 && <div role="alert" className={card}>
        <strong className="text-sm text-red-300">Hay más de un turno abierto</strong>
        <p className="mt-2 text-xs text-[#C8C8C8]">No abras ni cierres turnos hasta revisar los registros existentes. Se evitó elegir automáticamente un turno incorrecto.</p>
      </div>}
      {readiness.invalidActiveShiftStart && readiness.errors.length === 0 && <div role="alert" className={card}>
        <strong className="text-sm text-red-300">El turno abierto no tiene una fecha de apertura válida</strong>
        <p className="mt-2 text-xs text-[#C8C8C8]">No se puede calcular ni cerrar Caja con seguridad. Revisa el registro del turno; no se modificó automáticamente ningún dato.</p>
      </div>}

      {readiness.ready && (!active ? (
        <section className={card}>
          <div className="flex items-center gap-2 text-sm font-bold text-[#E3BC6B]"><Clock className="h-4 w-4" /> No hay turno abierto</div>
          <p className="mt-2 text-xs text-[#C8C8C8]">Los pedidos de clientes siguen entrando y quedan pendientes de pago aunque no haya turno. Abrir turno no los cobra automáticamente; las ventas se cuentan cuando se registra el pago confirmado.</p>
          <label className="mt-4 block text-xs font-bold text-[#C8C8C8]">Fondo inicial de caja ($)</label>
          <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="Ingresa el fondo real (ej. 0.00)" disabled={busy} value={fund} onChange={(e) => setFund(e.target.value)} className={`${input} mt-1 max-w-xs`} />
          <p className="mt-2 text-xs text-[#C8C8C8]">Ingresa el efectivo real antes de abrir, incluso si son $0. No se asigna un fondo automáticamente.</p>
          <button type="button" disabled={busy || parseShiftCashAmount(fund) === null} onClick={() => void openShift()} className="mt-4 flex items-center gap-2 rounded-xl bg-[#D6A34A] px-5 py-3 text-sm font-black text-[#050505] disabled:opacity-50">
            <Play className="h-4 w-4" /> {busy ? 'Abriendo…' : 'Abrir turno'}
          </button>
        </section>
      ) : live && (
        <>
          <section className={card}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-bold"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Turno {active.shiftType} abierto</span>
              <span className="text-xs text-[#B7B7B7]">{active.openedByName} · desde {when(active.openedAt)}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div><div className="text-[11px] text-[#B7B7B7]">Efectivo</div><div className="font-serif text-lg font-black">{money(live.sales.cash)}</div></div>
              <div><div className="text-[11px] text-[#B7B7B7]">Tarjeta</div><div className="font-serif text-lg font-black">{money(live.sales.card)}</div></div>
              <div><div className="text-[11px] text-[#B7B7B7]">Transferencia / apps</div><div className="font-serif text-lg font-black">{money(live.sales.platforms)}</div></div>
              <div><div className="text-[11px] text-[#B7B7B7]">Venta total ({live.sales.count})</div><div className="font-serif text-lg font-black text-[#E3BC6B]">{money(live.sales.total)}</div></div>
            </div>
            <div className="mt-4 space-y-1 border-t border-[#3A3022] pt-3 text-sm">
              <div className="flex justify-between"><span className="text-[#C8C8C8]">Fondo inicial</span><span>{money(active.initialCashFund)}</span></div>
              <div className="flex justify-between"><span className="text-[#C8C8C8]">+ Ventas en efectivo</span><span>{money(live.sales.cash)}</span></div>
              <div className="flex justify-between"><span className="text-[#C8C8C8]">− Gastos pagados de caja</span><span>{money(live.cashExpenses)}</span></div>
              <div className="flex justify-between"><span className="text-[#C8C8C8]">− Guardado en resguardo</span><span>{money(live.cashToVault)}</span></div>
              <div className="flex justify-between border-t border-[#3A3022] pt-2 font-black"><span>Efectivo esperado en caja</span><span className="text-[#E3BC6B]">{money(live.expectedCash)}</span></div>
            </div>
            {missingPaymentDates > 0 && (
              <div role="alert" className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                {missingPaymentDates} pedido(s) pagado(s) creados durante este turno no tienen fecha de cobro válida. El cierre queda bloqueado hasta conciliarlos; no se debe asumir que fueron pagados al crearse.
              </div>
            )}
            {historicalMissingPaymentDates > 0 && (
              <div role="status" className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                {historicalMissingPaymentDates} pedido(s) pagado(s) anteriores al turno o sin fecha de creación tampoco tienen fecha de cobro verificable. No se puede confirmar a qué turno pertenecen; revisa el historial antes de considerar definitivo el corte. No se les asigna una fecha automáticamente.
              </div>
            )}
            {unclassifiedPaid.count > 0 && (
              <div role="alert" className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                {unclassifiedPaid.count} pedido(s) pagado(s) del turno tienen método desconocido o importe no positivo; {money(unclassifiedPaid.positiveAmount)} requieren clasificación documental. El cierre queda bloqueado; no se asigna transferencia ni se inventa un cobro.
              </div>
            )}
            {tableCloseBlocked && (
              <div role="alert" className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                Caja sin conciliación de mesa: {unverifiedTable.inWindow} pedido(s) pagado(s) durante el turno y {unverifiedTable.undated} sin fecha de cobro verificable. No se suman al total provisional ni se permite cerrar hasta comprobar pagos de mesa, referencias y permisos. No se alteró ningún cobro.
              </div>
            )}
            <BusinessTableReconciliation businessId={businessId} shiftStart={active.openedAt} />
            {!closing ? (
              <button type="button" disabled={missingPaymentDates > 0 || unclassifiedPaid.count > 0 || tableCloseBlocked} onClick={() => setClosing(true)} className="mt-4 flex items-center gap-2 rounded-xl border border-[#D6A34A] px-5 py-3 text-sm font-black text-[#E3BC6B] disabled:cursor-not-allowed disabled:opacity-50">
                <Lock className="h-4 w-4" /> Cerrar turno
              </button>
            ) : (
              <div className="mt-4 space-y-3 rounded-xl border border-[#3A3022] bg-[#0B0B0B] p-4">
                <label className="block text-xs font-bold text-[#C8C8C8]">Efectivo contado en caja ($)</label>
                <input type="number" min="0" step="0.01" inputMode="decimal" disabled={busy} value={counted} onChange={(e) => setCounted(e.target.value)} className={`${input} max-w-xs`} autoFocus />
                {cashDifferencePreview !== null && (
                  <p className="text-xs text-[#C8C8C8]">Diferencia: <strong className={cashDifferencePreview === 0 ? 'text-emerald-300' : 'text-amber-300'}>{money(cashDifferencePreview)}</strong></p>
                )}
                <textarea disabled={busy} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas del corte (opcional)" rows={2} className={input} />
                <div className="flex gap-2">
                  <button type="button" disabled={busy || missingPaymentDates > 0 || unclassifiedPaid.count > 0 || tableCloseBlocked || parseShiftCashAmount(counted) === null} onClick={() => void closeShift()} className="rounded-xl bg-[#D6A34A] px-5 py-3 text-sm font-black text-[#050505] disabled:opacity-50">{busy ? 'Cerrando…' : 'Confirmar cierre'}</button>
                  <button type="button" disabled={busy} onClick={() => setClosing(false)} className="rounded-xl border border-[#3A3022] px-4 py-3 text-sm font-bold">Cancelar</button>
                </div>
              </div>
            )}
          </section>
        </>
      ))}
      
      {readiness.ready && <section>
        <h3 className="mb-2 flex items-center gap-2 font-serif text-lg font-black"><History className="h-4 w-4 text-[#E3BC6B]" /> Historial de cortes</h3>
        {history.length === 0 ? (
          <div className={`${card} text-sm text-[#C8C8C8]`}>Aún no hay cortes cerrados.</div>
        ) : (
          <ul className="space-y-2">
            {history.map((s) => (
              <li key={s.id} className={card}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm">Turno {s.shiftType} · {when(s.openedAt)} → {when(s.closedAt)}</strong>
                  <span className="text-xs text-[#B7B7B7]">{s.closedByName}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <span>Ventas: <b>{money(s.totalSales || 0)}</b></span>
                  <span>Efectivo: <b>{money(s.salesCash || 0)}</b></span>
                  <span>Esperado: <b>{money(s.expectedCash || 0)}</b></span>
                  <span>Diferencia: <b className={(s.cashDifference || 0) === 0 ? 'text-emerald-300' : 'text-amber-300'}>{money(s.cashDifference || 0)}</b></span>
                </div>
                {s.notes && <p className="mt-2 text-xs text-[#C8C8C8]">{s.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>}
    </div>
  );
};
