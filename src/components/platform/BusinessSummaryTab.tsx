import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, ClipboardList, DollarSign, Package, ShoppingBag } from 'lucide-react';
import type { RestaurantTenant } from '../../lib/restaurantCore';
import { subscribeToBusinessCatalog } from '../../lib/businessCatalogService';
import type { BusinessCatalogItem } from '../../lib/businessCatalogService';
import { subscribeToBusinessRestaurantOrders } from '../../lib/ordersService';
import type { RestaurantOrder } from '../../types';

const money = (v: number) => v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

export type SummaryGoTo = 'catalog' | 'operations' | 'branding' | 'employees';

export const BusinessSummaryTab: React.FC<{
  businessId: string;
  business: RestaurantTenant;
  isPublished: boolean;
  onGo: (target: SummaryGoTo) => void;
}> = ({ businessId, business, isPublished, onGo }) => {
  const [items, setItems] = useState<BusinessCatalogItem[]>([]);
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);

  useEffect(() => subscribeToBusinessCatalog(businessId, (d) => setItems(d?.items || []), () => setItems([])), [businessId]);
  useEffect(() => subscribeToBusinessRestaurantOrders(businessId, setOrders), [businessId]);

  const stats = useMemo(() => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
    const todays = orders.filter((o) => o.createdAt?.startsWith(today) && o.status !== 'CANCELADO');
    return {
      ordersToday: todays.length,
      salesToday: todays.reduce((s, o) => s + Number(o.total || 0), 0),
      active: orders.filter((o) => o.status === 'NUEVO' || o.status === 'PREPARANDO' || o.status === 'LISTO').length,
    };
  }, [orders]);

  const b = business.branding;
  const withPhoto = items.filter((i) => i.imageUrl).length;
  const steps: Array<{ done: boolean; label: string; go?: SummaryGoTo }> = [
    { done: !!b.logoUrl, label: 'Sube tu logo', go: 'branding' },
    { done: !!(b.whatsapp && b.address), label: 'Agrega WhatsApp y dirección', go: 'branding' },
    { done: items.length > 0, label: 'Carga tu menú o productos', go: 'catalog' },
    { done: items.length > 0 && withPhoto >= Math.ceil(items.length / 2), label: 'Ponle foto a tus productos', go: 'catalog' },
    { done: isPublished, label: 'Publica tu página en el directorio' },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  const cards = [
    { icon: ClipboardList, label: 'Pedidos de hoy', value: String(stats.ordersToday) },
    { icon: DollarSign, label: 'Ventas de hoy', value: money(stats.salesToday) },
    { icon: ShoppingBag, label: 'Pedidos activos', value: String(stats.active) },
    { icon: Package, label: 'Productos en menú', value: String(items.length) },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border p-4" style={{ background: 'var(--biz-surface, #111111)', borderColor: 'color-mix(in srgb, var(--biz-primary, #D6A34A) 35%, transparent)' }}>
            <c.icon className="h-5 w-5" style={{ color: 'var(--biz-primary, #D6A34A)' }} />
            <div className="mt-2 font-serif text-xl font-black sm:text-2xl">{c.value}</div>
            <div className="text-[11px] opacity-70">{c.label}</div>
          </div>
        ))}
      </div>

      {doneCount < steps.length && (
        <section className="rounded-2xl border p-5" style={{ background: 'var(--biz-surface, #111111)', borderColor: 'color-mix(in srgb, var(--biz-primary, #D6A34A) 35%, transparent)' }}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-serif text-lg font-black">Deja tu negocio listo</h2>
            <span className="text-xs font-bold" style={{ color: 'var(--biz-primary, #D6A34A)' }}>{doneCount}/{steps.length}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full" style={{ width: `${(doneCount / steps.length) * 100}%`, background: 'var(--biz-primary, #D6A34A)' }} />
          </div>
          <ul className="mt-4 space-y-2">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center justify-between gap-3 text-sm">
                <span className={`flex items-center gap-2 ${s.done ? 'opacity-60 line-through' : ''}`}>
                  {s.done ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Circle className="h-4 w-4 opacity-50" />}
                  {s.label}
                </span>
                {!s.done && s.go && (
                  <button type="button" onClick={() => onGo(s.go!)} className="rounded-lg px-3 py-1.5 text-xs font-black" style={{ background: 'var(--biz-primary, #D6A34A)', color: 'var(--biz-bg, #050505)' }}>Ir</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
