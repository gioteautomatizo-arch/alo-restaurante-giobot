import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, ClipboardList, DollarSign, Package, ShoppingBag } from 'lucide-react';
import type { RestaurantTenant } from '../../lib/restaurantCore';
import { subscribeToBusinessCatalog } from '../../lib/businessCatalogService';
import type { BusinessCatalogItem } from '../../lib/businessCatalogService';
import { subscribeToBusinessRestaurantOrders } from '../../lib/ordersService';
import type { RestaurantOrder } from '../../types';
import { summarizeBusinessOrders } from '../../lib/businessOrderSnapshot';
import { isBusinessSummaryFeedError, isBusinessSummaryFeedReady, type BusinessSummaryFeedStatus } from '../../lib/businessSummaryReadiness';

const money = (v: number) => v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

export type SummaryGoTo = 'catalog' | 'operations' | 'branding' | 'employees';

export const BusinessSummaryTab: React.FC<{
  businessId: string;
  business: RestaurantTenant;
  isPublished: boolean;
  onGo: (target: SummaryGoTo) => void;
}> = ({ businessId, business, isPublished, onGo }) => {
  // Cada fuente conserva el tenant de su última respuesta. No interpretar fallos como cero.
  const [catalogState, setCatalogState] = useState<{
    businessId: string; status: BusinessSummaryFeedStatus; items: BusinessCatalogItem[];
  }>({ businessId, status: 'loading', items: [] });
  const [ordersState, setOrdersState] = useState<{
    businessId: string; status: BusinessSummaryFeedStatus; orders: RestaurantOrder[];
  }>({ businessId, status: 'loading', orders: [] });

  useEffect(() => {
    let active = true;
    setCatalogState({ businessId, status: 'loading', items: [] });
    const stop = subscribeToBusinessCatalog(
      businessId,
      (data) => { if (active) setCatalogState({ businessId, status: 'ready', items: data?.items || [] }); },
      () => { if (active) setCatalogState({ businessId, status: 'error', items: [] }); },
    );
    return () => { active = false; stop(); };
  }, [businessId]);

  useEffect(() => {
    let active = true;
    setOrdersState({ businessId, status: 'loading', orders: [] });
    const stop = subscribeToBusinessRestaurantOrders(
      businessId,
      (data) => { if (active) setOrdersState({ businessId, status: 'ready', orders: data }); },
      () => { if (active) setOrdersState({ businessId, status: 'error', orders: [] }); },
    );
    return () => { active = false; stop(); };
  }, [businessId]);

  const catalogReady = isBusinessSummaryFeedReady(businessId, catalogState);
  const ordersReady = isBusinessSummaryFeedReady(businessId, ordersState);
  const catalogError = isBusinessSummaryFeedError(businessId, catalogState);
  const ordersError = isBusinessSummaryFeedError(businessId, ordersState);
  const items = catalogReady ? catalogState.items : [];
  const orders = ordersReady ? ordersState.orders : [];

  // Resumen y Pedidos/Caja deben compartir los mismos criterios de cobro.
  // No atribuir un pago a la fecha del pedido si falta paidAt.
  const snapshot = useMemo(() => summarizeBusinessOrders(orders), [orders]);

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
    { icon: ClipboardList, label: 'Pedidos de hoy', value: ordersReady ? String(snapshot.ordersToday) : '—' },
    { icon: DollarSign, label: 'Ventas de hoy', value: ordersReady ? money(snapshot.paidTodayTotal) : '—' },
    { icon: ShoppingBag, label: 'Pedidos activos', value: ordersReady ? String(snapshot.activeOrders) : '—' },
    { icon: Package, label: 'Productos en menú', value: catalogReady ? String(items.length) : '—' },
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

      {!ordersReady && (
        <p role={ordersError ? 'alert' : 'status'} className="rounded-xl border border-amber-400/40 bg-amber-950/40 px-4 py-3 text-xs text-amber-200">
          {ordersError
            ? 'No se pudieron consultar los pedidos de este negocio. Las ventas están ocultas; no significa que sean cero. Revisa la conexión o permisos.'
            : 'Consultando pedidos y ventas de este negocio…'}
        </p>
      )}
      {!catalogReady && (
        <p role={catalogError ? 'alert' : 'status'} className="rounded-xl border border-amber-400/40 bg-amber-950/40 px-4 py-3 text-xs text-amber-200">
          {catalogError
            ? 'No se pudo consultar el catálogo de este negocio. No se puede confirmar cuántos productos hay ni su avance de configuración.'
            : 'Consultando productos y configuración del catálogo…'}
        </p>
      )}

      {ordersReady && snapshot.paidMissingDateCount > 0 && (
        <p role="alert" className="rounded-xl border border-amber-400/40 bg-amber-950/40 px-4 py-3 text-xs text-amber-200">
          Hay {snapshot.paidMissingDateCount} pago(s) sin fecha de cobro válida. No se incluyen en las ventas de hoy; revísalos en Pedidos y Caja.
        </p>
      )}

      {catalogReady && doneCount < steps.length && (
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
