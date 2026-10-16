import React, { useEffect, useMemo, useState } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { deleteModuleDoc, saveModuleDoc, subscribeToModule } from '../../lib/tenantModules';

const money = (v: number) => v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const TZ = 'America/Mexico_City';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const dateLabel = (key?: string) => (key ? new Date(`${key}T12:00:00Z`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');

interface LedgerDoc {
  id: string;
  counterparty: string;
  concept: string;
  amount: number;
  dueDate?: string;
  status: 'Pendiente' | 'Pagado' | 'Anulado';
  paidAt?: string;
  createdAt: string;
  createdByName?: string;
}

const CONFIG = {
  receivables: { title: 'Cuentas por cobrar', who: 'Quién te debe', paid: 'Cobrada', action: 'Marcar cobrada', pending: 'Por cobrar', code: 'receivable' },
  payables: { title: 'Cuentas por pagar', who: 'A quién le debes', paid: 'Pagada', action: 'Marcar pagada', pending: 'Por pagar', code: 'payable' },
} as const;

const card = 'rounded-2xl border border-[#3A3022] bg-[#111111] p-4';
const input = 'w-full rounded-xl border border-[#3A3022] bg-[#0B0B0B] px-3 py-3 text-sm text-[#F7F7F7] outline-none focus:border-[#D6A34A]';

/** Una sola pantalla para cuentas por cobrar y por pagar. */
export const BusinessLedgerView: React.FC<{ businessId: string; kind: 'receivables' | 'payables'; canDelete: boolean; userName: string }> = ({ businessId, kind, canDelete, userName }) => {
  const cfg = CONFIG[kind];
  const [rows, setRows] = useState<LedgerDoc[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [counterparty, setCounterparty] = useState('');
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [filter, setFilter] = useState<'Pendiente' | 'Pagado'>('Pendiente');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => subscribeToModule<LedgerDoc>(businessId, kind, setRows), [businessId, kind]);

  const pendingTotal = useMemo(() => rows.filter((r) => r.status === 'Pendiente').reduce((s, r) => s + Number(r.amount || 0), 0), [rows]);
  const overdue = useMemo(() => rows.filter((r) => r.status === 'Pendiente' && r.dueDate && r.dueDate < today()).length, [rows]);
  const shown = rows.filter((r) => (filter === 'Pendiente' ? r.status === 'Pendiente' : r.status === 'Pagado'));

  const add = async () => {
    const value = Number(amount);
    if (!counterparty.trim()) return setError(`Escribe ${kind === 'receivables' ? 'quién te debe' : 'a quién le debes'}.`);
    if (!Number.isFinite(value) || value <= 0) return setError('Escribe un monto mayor a cero.');
    setBusy(true);
    setError('');
    try {
      await saveModuleDoc(
        businessId,
        kind,
        { counterparty: counterparty.trim(), concept: concept.trim(), amount: Math.round(value * 100) / 100, dueDate, status: 'Pendiente', createdByName: userName },
        { action: `${cfg.code}.create`, summary: `${cfg.title}: ${money(value)} · ${counterparty.trim()}` },
      );
      setCounterparty(''); setConcept(''); setAmount(''); setDueDate(''); setShowForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos guardar.');
    } finally {
      setBusy(false);
    }
  };

  const markPaid = async (r: LedgerDoc) => {
    try {
      await saveModuleDoc(businessId, kind, { ...r, status: 'Pagado', paidAt: new Date().toISOString() }, { action: `${cfg.code}.paid`, summary: `${cfg.paid} ${money(r.amount)} · ${r.counterparty}` });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos actualizar.');
    }
  };

  const remove = async (r: LedgerDoc) => {
    if (!window.confirm(`¿Eliminar la cuenta de ${r.counterparty} por ${money(r.amount)}?`)) return;
    try {
      await deleteModuleDoc(businessId, kind, r.id, { action: `${cfg.code}.delete`, summary: `Eliminó cuenta ${money(r.amount)} · ${r.counterparty}` });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos eliminar.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-black text-[#F7F7F7]">{cfg.title}</h2>
          <p className="text-xs text-[#B7B7B7]">{cfg.pending}: <b className="text-[#E3BC6B]">{money(pendingTotal)}</b>{overdue > 0 && <span className="text-amber-300"> · {overdue} vencida{overdue > 1 ? 's' : ''}</span>}</p>
        </div>
        <button type="button" onClick={() => setShowForm((v) => !v)} className="flex items-center gap-2 rounded-xl bg-[#D6A34A] px-4 py-2.5 text-xs font-black text-[#050505]">
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {showForm ? 'Cerrar' : 'Nueva cuenta'}
        </button>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs font-semibold text-rose-200">{error}</div>}

      {showForm && (
        <section className={`${card} space-y-3`}>
          <input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder={cfg.who} className={input} />
          <input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Concepto (opcional)" className={input} />
          <div className="grid grid-cols-2 gap-3">
            <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Monto ($)" className={input} />
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Fecha límite" className={input} />
          </div>
          <button type="button" disabled={busy} onClick={() => void add()} className="rounded-xl bg-[#D6A34A] px-5 py-3 text-sm font-black text-[#050505] disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar cuenta'}</button>
        </section>
      )}

      <div className="flex gap-2">
        {(['Pendiente', 'Pagado'] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full px-4 py-1.5 text-xs font-bold ${filter === f ? 'bg-[#D6A34A] text-[#050505]' : 'border border-[#3A3022] text-[#F7F7F7]'}`}>{f === 'Pendiente' ? 'Pendientes' : `${cfg.paid}s`}</button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className={`${card} text-sm text-[#C8C8C8]`}>{filter === 'Pendiente' ? 'No hay cuentas pendientes.' : 'Todavía no hay cuentas cerradas.'}</div>
      ) : (
        <ul className="space-y-2">
          {shown.map((r) => {
            const late = r.status === 'Pendiente' && r.dueDate && r.dueDate < today();
            return (
              <li key={r.id} className={card}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <strong className="block truncate text-sm">{r.counterparty}</strong>
                    <span className="text-xs text-[#B7B7B7]">{r.concept || 'Sin concepto'} · Límite: <span className={late ? 'font-bold text-amber-300' : ''}>{dateLabel(r.dueDate)}</span></span>
                  </div>
                  <b className="text-base">{money(r.amount)}</b>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  {r.status === 'Pendiente' && (
                    <button type="button" onClick={() => void markPaid(r)} className="flex items-center gap-1.5 rounded-xl border border-[#D6A34A] px-3 py-2 text-xs font-black text-[#E3BC6B]"><Check className="h-4 w-4" /> {cfg.action}</button>
                  )}
                  {canDelete && <button type="button" onClick={() => void remove(r)} aria-label="Eliminar" className="ml-auto text-[#B7B7B7] hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
