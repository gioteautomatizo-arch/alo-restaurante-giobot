import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, Banknote, CreditCard, Landmark, Receipt, ShoppingBag } from 'lucide-react';
import type { RestaurantOrder } from '../../types';
import { subscribeToBusinessRestaurantOrders } from '../../lib/ordersService';
import { buildSalesReport } from '../../lib/businessReports';
import type { ReportPeriod } from '../../lib/businessReports';

const money = (value: number) => value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

const PERIODS: Array<{ value: ReportPeriod; label: string }> = [
  { value: 1, label: 'Hoy' },
  { value: 7, label: '7 días' },
  { value: 30, label: '30 días' },
];

const card = 'rounded-2xl border border-[#3A3022] bg-[#111111] p-4';

/**
 * Reportes de ventas. Usa los pedidos que el negocio ya registra (POS y pedidos),
 * así que no genera costo extra ni usa IA.
 */
export const BusinessReportsView: React.FC<{ businessId: string; businessName: string; onBack: () => void }> = ({ businessId, businessName, onBack }) => {
  // Vincular los datos al tenant evita mostrar cifras del negocio anterior
  // durante el cambio de interfaz, incluso antes de ejecutar useEffect.
  const [ordersState, setOrdersState] = useState<{
    businessId: string;
    status: 'loading' | 'ready' | 'error';
    orders: RestaurantOrder[];
  }>({ businessId, status: 'loading', orders: [] });
  const [period, setPeriod] = useState<ReportPeriod>(7);

  useEffect(() => {
    let active = true;
    setOrdersState({ businessId, status: 'loading', orders: [] });
    const unsubscribe = subscribeToBusinessRestaurantOrders(
      businessId,
      (data) => {
        if (active) setOrdersState({ businessId, status: 'ready', orders: data });
      },
      () => {
        if (active) setOrdersState({ businessId, status: 'error', orders: [] });
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [businessId]);

  const ready = ordersState.businessId === businessId && ordersState.status === 'ready';
  const failed = ordersState.businessId === businessId && ordersState.status === 'error';
  const orders = ready ? ordersState.orders : [];
  const report = useMemo(() => buildSalesReport(orders, period), [orders, period]);
  const maxDay = Math.max(1, ...report.days.map((day) => day.total));
  const paymentRows = [
    { label: 'Efectivo', value: report.byPayment.efectivo, icon: Banknote },
    { label: 'Transferencia', value: report.byPayment.transferencia, icon: Landmark },
    { label: 'Tarjeta', value: report.byPayment.tarjeta, icon: CreditCard },
  ];

  return (
    <div className="min-h-screen bg-[#050505] text-[#F7F7F7]">
      <header className="sticky top-0 z-20 border-b border-[#3A3022] bg-[#0B0B0B]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <button data-biz-back type="button" onClick={onBack} className="flex items-center gap-2 rounded-xl border border-[#3A3022] px-3 py-2 text-xs font-bold text-[#F7F7F7]">
            <ArrowLeft className="h-4 w-4" /> Negocio
          </button>
          <span className="truncate text-xs font-black text-[#B7B7B7]">Reportes · {businessName}</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <section className="rounded-[1.75rem] border border-[#3A3022] bg-[#111111] p-5">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-[#D6A34A] p-3 text-[#050505]"><BarChart3 className="h-6 w-6" /></div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#E3BC6B]">Reportes</p>
              <h1 className="mt-1 font-serif text-2xl font-black text-[#F7F7F7]">Cómo va tu negocio</h1>
              <p className="mt-1 text-sm text-[#C8C8C8]">Ventas calculadas con los pedidos que registras en Caja. Las canceladas no se cuentan.</p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            {PERIODS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPeriod(option.value)}
                aria-pressed={period === option.value}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-xs font-black ${period === option.value ? 'border-[#D6A34A] bg-[#D6A34A] text-[#050505]' : 'border-[#3A3022] bg-[#0B0B0B] text-[#F7F7F7]'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        {ready && report.unreconciledPaidCount > 0 && (
          <div role="alert" className={`${card} border-amber-500/50 bg-amber-500/10 text-sm text-amber-200`}>
            <strong>Ventas por conciliar: {report.unreconciledPaidCount}</strong>
            <p className="mt-1 text-xs">Hay pedidos marcados como pagados sin fecha de cobro verificable en el historial de este negocio. No se incluyen en los totales del periodo hasta revisar cuándo se cobraron. No se modificó ningún pedido.</p>
          </div>
        )}
        {failed ? (
          <div role="alert" className={`${card} border-red-700 text-center text-sm text-red-200`}>No se pudieron consultar las ventas de este negocio. Revisa la conexión o tus permisos. No significa que las ventas sean cero.</div>
        ) : !ready ? (
          <div role="status" className={`${card} text-center text-sm text-[#C8C8C8]`}>Cargando tus ventas…</div>
        ) : report.orderCount === 0 ? (
          <div className={`${card} text-center`}>
            <ShoppingBag className="mx-auto h-8 w-8 text-[#D6A34A]" />
            <p className="mt-2 font-bold text-[#F7F7F7]">No hay ventas con cobro verificable en este periodo</p>
            <p className="mt-1 text-xs text-[#B7B7B7]">{report.unreconciledPaidCount > 0
              ? 'Hay pedidos pagados por conciliar. Revisa el aviso anterior: sus importes no se incluyen hasta verificar la fecha de cobro.'
              : 'Cuando registres cobros confirmados en Caja, aquí verás tus ventas, tu producto estrella y cómo te pagan.'}</p>
            {report.cancelledCount > 0 && (
              <p className="mt-2 text-xs text-[#B7B7B7]">{report.cancelledCount} pedido{report.cancelledCount === 1 ? '' : 's'} cancelado{report.cancelledCount === 1 ? '' : 's'} en este periodo (no se suman a ventas).</p>
            )}
          </div>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className={`${card} col-span-2 min-w-0 sm:col-span-1`}><span className="text-[10px] font-black uppercase text-[#B7B7B7]">Ventas</span><strong className="mt-1 block break-words text-lg text-[#E3BC6B]">{money(report.totalSales)}</strong></div>
              <div className={`${card} min-w-0`}><span className="text-[10px] font-black uppercase text-[#B7B7B7]">Pedidos</span><strong className="mt-1 block break-words text-lg text-[#F7F7F7]">{report.orderCount}</strong></div>
              <div className={`${card} min-w-0`}><span className="text-[10px] font-black uppercase text-[#B7B7B7]">Ticket prom.</span><strong className="mt-1 block break-words text-lg text-[#F7F7F7]">{money(report.averageTicket)}</strong></div>
            </section>

            {period > 1 && (
              <section className={card}>
                <h2 className="font-serif text-lg font-black text-[#F7F7F7]">Ventas por día</h2>
                <div className="mt-3 space-y-1.5">
                  {report.days.map((day) => (
                    <div key={day.key} className="flex items-center gap-2 text-[11px]">
                      <span className="w-10 shrink-0 text-[#B7B7B7]">{day.label}</span>
                      <div className="h-4 flex-1 overflow-hidden rounded-full bg-[#0B0B0B]">
                        <div className="h-full rounded-full bg-[#D6A34A]" style={{ width: `${Math.max(day.total > 0 ? 3 : 0, (day.total / maxDay) * 100)}%` }} />
                      </div>
                      <span className="w-20 shrink-0 text-right text-[#F7F7F7]">{day.total > 0 ? money(day.total) : '—'}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className={card}>
              <h2 className="font-serif text-lg font-black text-[#F7F7F7]">Lo más vendido</h2>
              <ol className="mt-3 space-y-2">
                {report.topProducts.map((product, index) => (
                  <li key={product.name + index} className="flex items-center justify-between gap-3 rounded-xl bg-[#0B0B0B] px-3 py-2.5 text-sm">
                    <span className="flex min-w-0 items-center gap-2"><span className="font-black text-[#D6A34A]">{index + 1}</span><span className="truncate text-[#F7F7F7]">{product.name}</span></span>
                    <span className="shrink-0 text-xs text-[#B7B7B7]">{product.quantity} · {money(product.revenue)}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section className={card}>
              <h2 className="font-serif text-lg font-black text-[#F7F7F7]">Cómo te pagan</h2>
              <div className="mt-3 space-y-2">
                {paymentRows.map(({ label, value, icon: Icon }) => (
                  <div key={label} className="flex items-center justify-between rounded-xl bg-[#0B0B0B] px-3 py-2.5 text-sm">
                    <span className="flex items-center gap-2 text-[#F7F7F7]"><Icon className="h-4 w-4 text-[#D6A34A]" />{label}</span>
                    <span className="text-[#F7F7F7]">{money(value)}</span>
                  </div>
                ))}
              </div>
              {report.cancelledCount > 0 && (
                <p className="mt-3 flex items-center gap-2 text-xs text-[#B7B7B7]"><Receipt className="h-4 w-4" />{report.cancelledCount} pedido{report.cancelledCount === 1 ? '' : 's'} cancelado{report.cancelledCount === 1 ? '' : 's'} en este periodo (no se suman).</p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
};
