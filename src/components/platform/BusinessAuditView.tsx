import React, { useEffect, useMemo, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { subscribeToModule } from '../../lib/tenantModules';
import type { AuditEntry } from '../../lib/tenantModules';

const MODULE_LABELS: Record<string, string> = {
  shifts: 'Turnos', expenses: 'Gastos', vault: 'Resguardo', receivables: 'Por cobrar', payables: 'Por pagar', vip: 'VIP',
};
const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' });
};

/** Bitácora: lista quién hizo qué y cuándo. Solo lectura. */
export const BusinessAuditView: React.FC<{ businessId: string }> = ({ businessId }) => {
  const [entries, setEntries] = useState<Array<AuditEntry & { id: string }>>([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => subscribeToModule<AuditEntry>(businessId, 'auditLog', setEntries, 'at'), [businessId]);

  const shown = useMemo(() => (filter === 'all' ? entries : entries.filter((e) => e.module === filter)), [entries, filter]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-serif text-xl font-black text-[#F7F7F7]"><ScrollText className="h-5 w-5 text-[#E3BC6B]" /> Bitácora y auditoría</h2>
        <p className="text-xs text-[#B7B7B7]">Registro de lo que se hace en turnos y gastos. No se puede editar ni borrar.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {['all', ...Object.keys(MODULE_LABELS)].map((key) => (
          <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${filter === key ? 'bg-[#D6A34A] text-[#050505]' : 'border border-[#3A3022] text-[#F7F7F7]'}`}>
            {key === 'all' ? 'Todo' : MODULE_LABELS[key]}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="rounded-2xl border border-[#3A3022] bg-[#111111] p-4 text-sm text-[#C8C8C8]">Todavía no hay movimientos registrados.</div>
      ) : (
        <ul className="space-y-2">
          {shown.map((e) => (
            <li key={e.id} className="rounded-2xl border border-[#3A3022] bg-[#111111] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#B7B7B7]">
                <span>{when(e.at)} · {e.actorName}</span>
                <span className="rounded-full bg-[#1A1A1A] px-2 py-0.5 font-bold text-[#E3BC6B]">{MODULE_LABELS[e.module] || e.module}</span>
              </div>
              <p className="mt-1 text-sm text-[#F7F7F7]">{e.summary}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
