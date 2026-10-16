import React, { useEffect, useMemo, useState } from 'react';
import { Camera, Plus, Trash2, X } from 'lucide-react';
import { deleteModuleDoc, saveModuleDoc, subscribeToModule } from '../../lib/tenantModules';
import { uploadMenuImage } from '../../lib/menuImagesService';

const money = (v: number) => v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const TZ = 'America/Mexico_City';
const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
const dayLabel = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

const CATEGORIES = ['Insumos', 'Servicios', 'Renta', 'Nómina', 'Mantenimiento', 'Transporte', 'Otro'];

interface ExpenseDoc {
  id: string;
  concept: string;
  amount: number;
  category: string;
  paidWith: 'efectivo_caja' | 'otro';
  supplier?: string;
  receiptUrl?: string;
  notes?: string;
  createdAt: string;
  createdByName?: string;
}

const card = 'rounded-2xl border border-[#3A3022] bg-[#111111] p-4';
const input = 'w-full rounded-xl border border-[#3A3022] bg-[#0B0B0B] px-3 py-3 text-sm text-[#F7F7F7] outline-none focus:border-[#D6A34A]';

/** Gastos y comprobantes. Los pagados con efectivo de caja se restan solos en Control de turno. */
export const BusinessExpensesView: React.FC<{ businessId: string; canDelete: boolean; userName: string }> = ({ businessId, canDelete, userName }) => {
  const [expenses, setExpenses] = useState<ExpenseDoc[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [paidWith, setPaidWith] = useState<'efectivo_caja' | 'otro'>('efectivo_caja');
  const [supplier, setSupplier] = useState('');
  const [notes, setNotes] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => subscribeToModule<ExpenseDoc>(businessId, 'expenses', setExpenses), [businessId]);

  const groups = useMemo(() => {
    const map = new Map<string, ExpenseDoc[]>();
    for (const e of expenses) {
      const k = dayKey(e.createdAt);
      map.set(k, [...(map.get(k) || []), e]);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [expenses]);

  const todayTotal = useMemo(() => {
    const today = dayKey(new Date().toISOString());
    return expenses.filter((e) => dayKey(e.createdAt) === today).reduce((s, e) => s + Number(e.amount || 0), 0);
  }, [expenses]);

  const reset = () => {
    setConcept(''); setAmount(''); setSupplier(''); setNotes(''); setReceiptUrl(''); setCategory(CATEGORIES[0]); setPaidWith('efectivo_caja'); setError('');
  };

  const attach = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      setReceiptUrl(await uploadMenuImage(`receipt-${Date.now()}`, file));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos subir la foto del comprobante.');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const value = Number(amount);
    if (!concept.trim()) return setError('Escribe en qué se gastó.');
    if (!Number.isFinite(value) || value <= 0) return setError('Escribe un monto mayor a cero.');
    setBusy(true);
    setError('');
    try {
      await saveModuleDoc(
        businessId,
        'expenses',
        { concept: concept.trim(), amount: Math.round(value * 100) / 100, category, paidWith, supplier: supplier.trim(), receiptUrl, notes: notes.trim(), createdByName: userName },
        { action: 'expense.create', summary: `Gasto ${money(value)} · ${concept.trim()}` },
      );
      reset();
      setShowForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos guardar el gasto.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (e: ExpenseDoc) => {
    if (!window.confirm(`¿Eliminar el gasto "${e.concept}" por ${money(e.amount)}?`)) return;
    try {
      await deleteModuleDoc(businessId, 'expenses', e.id, { action: 'expense.delete', summary: `Eliminó gasto ${money(e.amount)} · ${e.concept}` });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos eliminar el gasto.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-black text-[#F7F7F7]">Gastos y comprobantes</h2>
          <p className="text-xs text-[#B7B7B7]">Hoy llevas {money(todayTotal)}. Lo pagado con efectivo de caja se resta solo en Turno.</p>
        </div>
        <button type="button" onClick={() => setShowForm((v) => !v)} className="flex items-center gap-2 rounded-xl bg-[#D6A34A] px-4 py-2.5 text-xs font-black text-[#050505]">
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {showForm ? 'Cerrar' : 'Nuevo gasto'}
        </button>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs font-semibold text-rose-200">{error}</div>}

      {showForm && (
        <section className={`${card} space-y-3`}>
          <input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="¿En qué se gastó? (ej. Tortillas, gas, renta)" className={input} />
          <div className="grid grid-cols-2 gap-3">
            <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Monto ($)" className={input} />
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={input}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select value={paidWith} onChange={(e) => setPaidWith(e.target.value as 'efectivo_caja' | 'otro')} className={input}>
              <option value="efectivo_caja">Pagado con efectivo de caja</option>
              <option value="otro">Otro medio (tarjeta, transferencia, dueño)</option>
            </select>
            <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Proveedor (opcional)" className={input} />
          </div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas (opcional)" rows={2} className={input} />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#3A3022] px-4 py-3 text-xs font-bold text-[#E3BC6B]">
              <Camera className="h-4 w-4" /> {uploading ? 'Subiendo…' : receiptUrl ? 'Cambiar foto del comprobante' : 'Foto del comprobante'}
              <input type="file" accept="image/*" capture="environment" className="hidden" disabled={uploading} onChange={(e) => void attach(e.target.files?.[0])} />
            </label>
            {receiptUrl && <img src={receiptUrl} alt="Comprobante" className="h-14 w-14 rounded-lg object-cover" />}
          </div>
          <button type="button" disabled={busy || uploading} onClick={() => void save()} className="rounded-xl bg-[#D6A34A] px-5 py-3 text-sm font-black text-[#050505] disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar gasto'}</button>
        </section>
      )}

      {groups.length === 0 ? (
        <div className={`${card} text-sm text-[#C8C8C8]`}>Aún no hay gastos registrados.</div>
      ) : (
        groups.map(([key, rows]) => (
          <section key={key}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-serif text-base font-black capitalize">{dayLabel(key)}</h3>
              <span className="text-xs font-bold text-[#E3BC6B]">{money(rows.reduce((s, e) => s + Number(e.amount || 0), 0))}</span>
            </div>
            <ul className="space-y-2">
              {rows.map((e) => (
                <li key={e.id} className={`${card} flex items-start gap-3`}>
                  {e.receiptUrl && (
                    <a href={e.receiptUrl} target="_blank" rel="noreferrer"><img src={e.receiptUrl} alt="Comprobante" className="h-14 w-14 shrink-0 rounded-lg object-cover" /></a>
                  )}
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm">{e.concept}</strong>
                    <span className="text-xs text-[#B7B7B7]">{e.category}{e.supplier ? ` · ${e.supplier}` : ''} · {e.paidWith === 'efectivo_caja' ? 'Caja' : 'Otro medio'}{e.createdByName ? ` · ${e.createdByName}` : ''}</span>
                    {e.notes && <p className="mt-1 text-xs text-[#C8C8C8]">{e.notes}</p>}
                  </div>
                  <div className="text-right">
                    <div className="font-black">{money(e.amount)}</div>
                    {canDelete && (
                      <button type="button" onClick={() => void remove(e)} className="mt-1 text-[#B7B7B7] hover:text-rose-300" aria-label="Eliminar gasto"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
};
