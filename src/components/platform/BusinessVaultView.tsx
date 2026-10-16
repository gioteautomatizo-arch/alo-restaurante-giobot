import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Trash2 } from 'lucide-react';
import { deleteModuleDoc, saveModuleDoc, subscribeToModule } from '../../lib/tenantModules';

const money = (v: number) => v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' });
};

export interface VaultMovement {
  id: string;
  kind: 'deposito' | 'retiro';
  amount: number;
  concept: string;
  createdAt: string;
  createdByName?: string;
}

const card = 'rounded-2xl border border-[#3A3022] bg-[#111111] p-4';
const input = 'w-full rounded-xl border border-[#3A3022] bg-[#0B0B0B] px-3 py-3 text-sm text-[#F7F7F7] outline-none focus:border-[#D6A34A]';

/** Sobre / resguardo: dinero que sale de la caja para guardarse, y lo que se regresa o se usa. */
export const BusinessVaultView: React.FC<{ businessId: string; canDelete: boolean; userName: string }> = ({ businessId, canDelete, userName }) => {
  const [rows, setRows] = useState<VaultMovement[]>([]);
  const [kind, setKind] = useState<'deposito' | 'retiro'>('deposito');
  const [amount, setAmount] = useState('');
  const [concept, setConcept] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => subscribeToModule<VaultMovement>(businessId, 'vault', setRows), [businessId]);

  const balance = useMemo(
    () => Math.round(rows.reduce((s, r) => s + (r.kind === 'deposito' ? 1 : -1) * Number(r.amount || 0), 0) * 100) / 100,
    [rows],
  );

  const save = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setError('Escribe un monto mayor a cero.');
    if (!concept.trim()) return setError('Escribe el motivo (ej. "Resguardo de la tarde").');
    if (kind === 'retiro' && value > balance) return setError('El resguardo no tiene tanto dinero.');
    setBusy(true);
    setError('');
    try {
      await saveModuleDoc(
        businessId,
        'vault',
        { kind, amount: Math.round(value * 100) / 100, concept: concept.trim(), createdByName: userName },
        { action: `vault.${kind}`, summary: `${kind === 'deposito' ? 'Guardó en resguardo' : 'Sacó del resguardo'} ${money(value)} · ${concept.trim()}` },
      );
      setAmount('');
      setConcept('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos guardar el movimiento.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: VaultMovement) => {
    if (!window.confirm(`¿Eliminar este movimiento de ${money(m.amount)}?`)) return;
    try {
      await deleteModuleDoc(businessId, 'vault', m.id, { action: 'vault.delete', summary: `Eliminó movimiento de resguardo ${money(m.amount)} · ${m.concept}` });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos eliminarlo.');
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-xl font-black text-[#F7F7F7]">Sobre / resguardo</h2>
        <p className="text-xs text-[#B7B7B7]">Lo que guardas aquí sale del efectivo esperado de tu turno.</p>
      </div>

      <div className={card}>
        <div className="text-[11px] text-[#B7B7B7]">Dinero en resguardo</div>
        <div className="font-serif text-3xl font-black text-[#E3BC6B]">{money(balance)}</div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs font-semibold text-rose-200">{error}</div>}

      <section className={`${card} space-y-3`}>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setKind('deposito')} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-xs font-black ${kind === 'deposito' ? 'bg-[#D6A34A] text-[#050505]' : 'border border-[#3A3022] text-[#F7F7F7]'}`}><ArrowDownToLine className="h-4 w-4" /> Guardar de caja</button>
          <button type="button" onClick={() => setKind('retiro')} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-xs font-black ${kind === 'retiro' ? 'bg-[#D6A34A] text-[#050505]' : 'border border-[#3A3022] text-[#F7F7F7]'}`}><ArrowUpFromLine className="h-4 w-4" /> Sacar del resguardo</button>
        </div>
        <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Monto ($)" className={input} />
        <input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Motivo" className={input} />
        <button type="button" disabled={busy} onClick={() => void save()} className="rounded-xl bg-[#D6A34A] px-5 py-3 text-sm font-black text-[#050505] disabled:opacity-50">{busy ? 'Guardando…' : 'Registrar movimiento'}</button>
      </section>

      <section>
        <h3 className="mb-2 font-serif text-lg font-black">Movimientos</h3>
        {rows.length === 0 ? (
          <div className={`${card} text-sm text-[#C8C8C8]`}>Aún no hay movimientos.</div>
        ) : (
          <ul className="space-y-2">
            {rows.map((m) => (
              <li key={m.id} className={`${card} flex items-center justify-between gap-3`}>
                <div className="min-w-0">
                  <strong className="block truncate text-sm">{m.concept}</strong>
                  <span className="text-xs text-[#B7B7B7]">{when(m.createdAt)}{m.createdByName ? ` · ${m.createdByName}` : ''}</span>
                </div>
                <div className="flex items-center gap-3">
                  <b className={m.kind === 'deposito' ? 'text-emerald-300' : 'text-amber-300'}>{m.kind === 'deposito' ? '+' : '−'}{money(m.amount)}</b>
                  {canDelete && <button type="button" onClick={() => void remove(m)} aria-label="Eliminar" className="text-[#B7B7B7] hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
