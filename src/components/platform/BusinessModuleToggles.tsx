import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface ToggleItem { capability: string; title: string; description: string; ready: boolean }

const ITEMS: ToggleItem[] = [
  { capability: 'SHIFTS', title: 'Turnos y cortes', description: 'Abrir y cerrar caja, ventas por método de pago y diferencia.', ready: true },
  { capability: 'EXPENSES', title: 'Gastos y comprobantes', description: 'Registra gastos con foto del comprobante.', ready: true },
  { capability: 'AUDIT_LOG', title: 'Bitácora y auditoría', description: 'Quién hizo qué y cuándo.', ready: true },
  { capability: 'CASH_VAULT', title: 'Sobre / resguardo', description: 'Dinero apartado de caja.', ready: false },
  { capability: 'RECEIVABLES', title: 'Cuentas por cobrar', description: 'Lo que te deben.', ready: false },
  { capability: 'PAYABLES', title: 'Cuentas por pagar', description: 'Lo que debes a proveedores.', ready: false },
];

/** El dueño enciende o apaga módulos de su negocio. Un negocio que solo quiere ticket los deja apagados. */
export const BusinessModuleToggles: React.FC<{
  businessId: string;
  enabled: Set<string>;
  isOwner: boolean;
  onChanged: (capabilities: string[]) => void;
}> = ({ businessId, enabled, isOwner, onChanged }) => {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const toggle = async (capability: string) => {
    if (!isOwner) return;
    const next = new Set(enabled);
    if (next.has(capability)) next.delete(capability);
    else next.add(capability);
    setBusy(capability);
    setError('');
    try {
      const list = Array.from(next);
      await updateDoc(doc(db, 'businesses', businessId), { capabilities: list });
      onChanged(list);
    } catch (e) {
      console.warn('[BusinessModuleToggles]', e);
      setError('No pudimos guardar el cambio. Solo el dueño puede activar módulos.');
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="rounded-2xl border border-[#3A3022] bg-[#111111] p-5">
      <h2 className="font-serif text-lg font-black text-[#F7F7F7]">Módulos de tu negocio</h2>
      <p className="mt-1 text-xs text-[#B7B7B7]">Enciende solo lo que necesitas. Si solo quieres ticket y pedidos, déjalos apagados.</p>
      {error && <p role="alert" className="mt-3 text-xs font-semibold text-rose-300">{error}</p>}
      <ul className="mt-4 space-y-3">
        {ITEMS.map((item) => {
          const on = enabled.has(item.capability);
          return (
            <li key={item.capability} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <strong className="block text-sm text-[#F7F7F7]">{item.title}{!item.ready && <span className="ml-2 rounded-full bg-[#1A1A1A] px-2 py-0.5 text-[10px] font-bold text-[#E3BC6B]">Próximamente</span>}</strong>
                <span className="text-xs text-[#B7B7B7]">{item.description}</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={item.title}
                disabled={!isOwner || busy === item.capability}
                onClick={() => void toggle(item.capability)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${on ? 'bg-[#D6A34A]' : 'bg-[#3A3022]'}`}
              >
                <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
