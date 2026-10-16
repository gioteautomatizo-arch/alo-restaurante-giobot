import React, { useEffect, useMemo, useState } from 'react';
import { Download, MessageCircle, Search } from 'lucide-react';
import type { RestaurantOrder } from '../../types';
import { subscribeToBusinessRestaurantOrders } from '../../lib/ordersService';
import { buildCustomers, customersToCsv } from '../../lib/businessCustomers';

const money = (v: number) => v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const dateLabel = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Mexico_City' });
};

/**
 * Clientes del negocio. Se arma solo con los pedidos que ya existen
 * (POS, página pública y mesas): sin costo extra y sin guardar datos nuevos.
 */
export const BusinessCustomersView: React.FC<{ businessId: string }> = ({ businessId }) => {
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [ready, setReady] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(
    () => subscribeToBusinessRestaurantOrders(businessId, (data) => { setOrders(data); setReady(true); }),
    [businessId],
  );

  const customers = useMemo(() => buildCustomers(orders), [orders]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(q) || (c.phone || '').includes(q.replace(/\D/g, '') || '\u0000'));
  }, [customers, search]);

  const exportCsv = () => {
    const blob = new Blob([customersToCsv(filtered)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'clientes.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const card = 'rounded-2xl border border-[#3A3022] bg-[#111111] p-4';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-black text-[#F7F7F7]">Clientes</h2>
          <p className="text-xs text-[#B7B7B7]">Se arma solo con tus pedidos. Para que aparezcan, captura nombre y teléfono al vender.</p>
        </div>
        <button type="button" onClick={exportCsv} disabled={filtered.length === 0} className="flex items-center gap-2 rounded-xl bg-[#D6A34A] px-4 py-2.5 text-xs font-black text-[#050505] disabled:opacity-50">
          <Download className="h-4 w-4" /> Descargar CSV
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className={card}><div className="text-[11px] text-[#B7B7B7]">Clientes</div><div className="font-serif text-xl font-black">{customers.length}</div></div>
        <div className={card}><div className="text-[11px] text-[#B7B7B7]">Recurrentes (2+)</div><div className="font-serif text-xl font-black">{customers.filter((c) => c.orders >= 2).length}</div></div>
        <div className={card}><div className="text-[11px] text-[#B7B7B7]">Venta de clientes</div><div className="font-serif text-xl font-black">{money(customers.reduce((s, c) => s + c.totalSpent, 0))}</div></div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B7B7B7]" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o teléfono" className="w-full rounded-xl border border-[#3A3022] bg-[#0B0B0B] py-3 pl-9 pr-3 text-sm text-[#F7F7F7] placeholder:text-[#B7B7B7]/70 outline-none focus:border-[#D6A34A]" />
      </div>

      {!ready ? (
        <p className="text-sm text-[#B7B7B7]">Cargando clientes…</p>
      ) : filtered.length === 0 ? (
        <div className={`${card} text-center text-sm text-[#C8C8C8]`}>
          {customers.length === 0 ? 'Aún no hay clientes. Cuando captures un pedido con nombre y teléfono, aparecerá aquí.' : 'Nadie coincide con tu búsqueda.'}
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((c) => (
            <li key={c.key} className={card}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <strong className="block truncate font-serif text-base text-[#F7F7F7]">{c.name}</strong>
                  <span className="text-xs text-[#B7B7B7]">{c.phone || 'Sin teléfono'} · Último pedido {dateLabel(c.lastOrderAt)}</span>
                </div>
                {c.phone && (
                  <a href={`https://wa.me/52${c.phone}`} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1.5 rounded-xl border border-[#3A3022] px-3 py-2 text-xs font-bold text-[#E3BC6B]">
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </a>
                )}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div><div className="text-[10px] text-[#B7B7B7]">Pedidos</div><div className="font-black">{c.orders}</div></div>
                <div><div className="text-[10px] text-[#B7B7B7]">Total</div><div className="font-black">{money(c.totalSpent)}</div></div>
                <div><div className="text-[10px] text-[#B7B7B7]">Ticket prom.</div><div className="font-black">{money(c.averageTicket)}</div></div>
              </div>
              {c.favorites.length > 0 && (
                <p className="mt-3 text-xs text-[#C8C8C8]">Pide seguido: {c.favorites.map((f) => `${f.name} (${f.quantity})`).join(', ')}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
