import React, { useEffect, useMemo, useState } from 'react';
import { Clock, History, Lock, Play } from 'lucide-react';
import type { RestaurantOrder } from '../../types';
import { subscribeToBusinessRestaurantOrders } from '../../lib/ordersService';
import { saveModuleDoc, subscribeToModule } from '../../lib/tenantModules';
import { computeShiftSalesFromOrders } from '../../lib/shiftSales';
import { getCurrentAuthUser } from '../../lib/firebase';

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

/** Control de turno: abre, suma ventas solo desde los pedidos cobrados y cierra con diferencia. */
export const BusinessShiftView: React.FC<{ businessId: string }> = ({ businessId }) => {
  const [shifts, setShifts] = useState<ShiftDoc[]>([]);
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [expenses, setExpenses] = useState<ExpenseDoc[]>([]);
  const [fund, setFund] = useState('500');
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => subscribeToModule<ShiftDoc>(businessId, 'shifts', setShifts, 'openedAt'), [businessId]);
  useEffect(() => subscribeToModule<ExpenseDoc>(businessId, 'expenses', setExpenses), [businessId]);
  useEffect(() => subscribeToBusinessRestaurantOrders(businessId, setOrders), [businessId]);

  const active = shifts.find((s) => s.status === 'abierto') || null;
  const history = shifts.filter((s) => s.status === 'cerrado');

  const live = useMemo(() => {
    if (!active) return null;
    const sales = computeShiftSalesFromOrders(orders, active.openedAt);
    const start = Date.parse(active.openedAt) || 0;
    const cashExpenses = expenses
      .filter((e) => e.paidWith === 'efectivo_caja' && (Date.parse(e.createdAt) || 0) >= start)
      .reduce((s, e) => s + Number(e.amount || 0), 0);
    const expectedCash = Math.round((Number(active.initialCashFund || 0) + sales.cash - cashExpenses) * 100) / 100;
    return { sales, cashExpenses, expectedCash };
  }, [active, orders, expenses]);

  const user = getCurrentAuthUser();
  const userName = user?.displayName || user?.email || 'Usuario';

  const openShift = async () => {
    setBusy(true);
    setError('');
    try {
      const hour = Number(new Date().toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/Mexico_City' }));
      await saveModuleDoc(
        businessId,
        'shifts',
        { status: 'abierto', shiftType: hour < 15 ? 'AM' : 'PM', openedAt: new Date().toISOString(), openedByName: userName, initialCashFund: Math.max(0, Number(fund) || 0) },
        { action: 'shift.open', summary: `Abrió turno con fondo de ${money(Number(fund) || 0)}` },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos abrir el turno.');
    } finally {
      setBusy(false);
    }
  };

  const closeShift = async () => {
    if (!active || !live) return;
    setBusy(true);
    setError('');
    try {
      const countedCash = Number(counted);
      if (!Number.isFinite(countedCash) || counted.trim() === '') throw new Error('Escribe cuánto efectivo contaste en caja.');
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
      setClosing(false);
      setCounted('');
      setNotes('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos cerrar el turno.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-xl font-black text-[#F7F7F7]">Control de turno</h2>
        <p className="text-xs text-[#B7B7B7]">Las ventas se suman solas con los pedidos cobrados desde que abres el turno.</p>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs font-semibold text-rose-200">{error}</div>}

      {!active ? (
        <section className={card}>
          <div className="flex items-center gap-2 text-sm font-bold text-[#E3BC6B]"><Clock className="h-4 w-4" /> No hay turno abierto</div>
          <label className="mt-4 block text-xs font-bold text-[#C8C8C8]">Fondo inicial de caja ($)</label>
          <input type="number" inputMode="decimal" value={fund} onChange={(e) => setFund(e.target.value)} className={`${input} mt-1 max-w-xs`} />
          <button type="button" disabled={busy} onClick={() => void openShift()} className="mt-4 flex items-center gap-2 rounded-xl bg-[#D6A34A] px-5 py-3 text-sm font-black text-[#050505] disabled:opacity-50">
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
              <div className="flex justify-between border-t border-[#3A3022] pt-2 font-black"><span>Efectivo esperado en caja</span><span className="text-[#E3BC6B]">{money(live.expectedCash)}</span></div>
            </div>
            {!closing ? (
              <button type="button" onClick={() => setClosing(true)} className="mt-4 flex items-center gap-2 rounded-xl border border-[#D6A34A] px-5 py-3 text-sm font-black text-[#E3BC6B]">
                <Lock className="h-4 w-4" /> Cerrar turno
              </button>
            ) : (
              <div className="mt-4 space-y-3 rounded-xl border border-[#3A3022] bg-[#0B0B0B] p-4">
                <label className="block text-xs font-bold text-[#C8C8C8]">Efectivo contado en caja ($)</label>
                <input type="number" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} className={`${input} max-w-xs`} autoFocus />
                {counted.trim() !== '' && Number.isFinite(Number(counted)) && (
                  <p className="text-xs text-[#C8C8C8]">Diferencia: <strong className={Number(counted) - live.expectedCash === 0 ? 'text-emerald-300' : 'text-amber-300'}>{money(Number(counted) - live.expectedCash)}</strong></p>
                )}
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas del corte (opcional)" rows={2} className={input} />
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={() => void closeShift()} className="rounded-xl bg-[#D6A34A] px-5 py-3 text-sm font-black text-[#050505] disabled:opacity-50">{busy ? 'Cerrando…' : 'Confirmar cierre'}</button>
                  <button type="button" onClick={() => setClosing(false)} className="rounded-xl border border-[#3A3022] px-4 py-3 text-sm font-bold">Cancelar</button>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      <section>
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
      </section>
    </div>
  );
};
