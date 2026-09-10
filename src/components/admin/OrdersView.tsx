import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChefHat,
  CheckCircle2,
  Clock3,
  PackageCheck,
  RefreshCw,
  Truck,
  UtensilsCrossed,
  XCircle,
} from 'lucide-react';
import { RestaurantOrder, RestaurantOrderStatus, StaffUser } from '../../types';
import {
  subscribeToRestaurantOrders,
  updateRestaurantOrderStatus,
} from '../../lib/ordersService';

interface OrdersViewProps {
  currentUser: StaffUser;
}

type Filter = 'ACTIVAS' | RestaurantOrderStatus;

const statusMeta: Record<RestaurantOrderStatus, { label: string; className: string }> = {
  NUEVO: { label: 'Nuevo', className: 'bg-rose-100 text-rose-900 border-rose-200' },
  PREPARANDO: { label: 'Preparando', className: 'bg-amber-100 text-amber-900 border-amber-200' },
  LISTO: { label: 'Listo', className: 'bg-emerald-100 text-emerald-900 border-emerald-200' },
  ENTREGADO: { label: 'Entregado', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  CANCELADO: { label: 'Cancelado', className: 'bg-stone-100 text-stone-600 border-stone-200' },
};

function formatAge(iso: string): string {
  const ms = Date.now() - (Date.parse(iso) || Date.now());
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `hace ${hours} h ${minutes % 60} min`;
}

function orderOriginLabel(order: RestaurantOrder) {
  if (order.orderType === 'dine_in') return order.tableNumber ? `MESA ${order.tableNumber}` : 'EN SUCURSAL';
  if (order.orderType === 'pickup') return 'PARA LLEVAR';
  return 'DOMICILIO';
}

function sourceLabel(order: RestaurantOrder): string {
  if (order.orderSource === 'CLIENTE_QR') return 'QR CLIENTE';
  if (order.orderSource === 'MESERO') return 'MESERO';
  if (order.orderSource === 'CAJA') return 'CAJA';
  return order.orderType === 'delivery' ? 'DOMICILIO' : 'APP';
}

function kitchenOptionParts(value?: string): { sauce?: string; preparation?: string; raw?: string } {
  if (!value) return {};
  const sauce = value.match(/Salsa:\s*([^·]+)/i)?.[1]?.trim();
  const preparation = value.match(/Preparación:\s*(.+)$/i)?.[1]?.trim();
  if (sauce || preparation) return { sauce, preparation };
  return { raw: value };
}

function kitchenCourseParts(value?: string): {
  first?: string;
  second?: string;
  third?: string;
  extra?: string;
} {
  if (!value) return {};

  const parts = value
    .split('·')
    .map((part) => part.trim())
    .filter(Boolean);

  const first = parts.find((part) => /^1er\s+tiempo\s*:/i.test(part))?.replace(/^1er\s+tiempo\s*:\s*/i, '').trim();
  const second = parts.find((part) => /^2do\s+tiempo\s*:/i.test(part))?.replace(/^2do\s+tiempo\s*:\s*/i, '').trim();
  const third = parts.find((part) => /^3er\s+tiempo\s*:/i.test(part))?.replace(/^3er\s+tiempo\s*:\s*/i, '').trim();
  const extra = parts.find((part) => !/^[123](?:er|do)?\s+tiempo\s*:/i.test(part));

  return { first, second, third, extra };
}

function sortOldestFirst(list: RestaurantOrder[]): RestaurantOrder[] {
  return [...list].sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0));
}

export const OrdersView: React.FC<OrdersViewProps> = ({ currentUser }) => {
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [filter, setFilter] = useState<Filter>('ACTIVAS');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setClockTick] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeToRestaurantOrders(setOrders);
    const timer = window.setInterval(() => setClockTick((v) => v + 1), 30000);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, []);

  const normalizedRole = String(currentUser.role || '').trim().toUpperCase();
  const kitchenMode = normalizedRole === 'COCINA';

  const visibleOrders = useMemo(() => {
    if (filter === 'ACTIVAS') {
      return sortOldestFirst(orders.filter((o) => ['NUEVO', 'PREPARANDO', 'LISTO'].includes(o.status)));
    }
    const matching = sortOldestFirst(orders.filter((o) => o.status === filter));
    return matching.slice(0, filter === 'ENTREGADO' ? 40 : 100);
  }, [orders, filter]);

  const counts = useMemo(() => ({
    NUEVO: orders.filter((o) => o.status === 'NUEVO').length,
    PREPARANDO: orders.filter((o) => o.status === 'PREPARANDO').length,
    LISTO: orders.filter((o) => o.status === 'LISTO').length,
  }), [orders]);

  const canKitchen = ['DUEÑA', 'ADMINISTRADOR', 'ENCARGADO', 'COCINA', 'EMPLEADO'].includes(normalizedRole);
  const canDeliver = ['DUEÑA', 'ADMINISTRADOR', 'ENCARGADO', 'CAJA', 'MESERO', 'EMPLEADO'].includes(normalizedRole);
  const canCancel = ['DUEÑA', 'ADMINISTRADOR', 'ENCARGADO', 'CAJA'].includes(normalizedRole);

  const changeStatus = async (order: RestaurantOrder, status: RestaurantOrderStatus) => {
    if (!order.id) return;
    setBusyId(order.id);
    setError(null);
    try {
      await updateRestaurantOrderStatus(order.id, status, currentUser);
      if (status === 'CANCELADO') setCancelConfirmId(null);
    } catch (err: any) {
      setError(err?.message || 'No se pudo actualizar la comanda. Revisa la conexión a Firebase.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className={`space-y-5 pb-20 ${kitchenMode ? 'max-w-[1500px] mx-auto' : ''}`}>
      <div className="bg-[#3A2418] text-[#FFF7EA] rounded-3xl p-5 sm:p-6 border border-[#C9974D]/30 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-[#C9974D] text-[11px] font-bold uppercase tracking-wider mb-1">
              <ChefHat className="w-4 h-4" /> Cocina en tiempo real
            </div>
            <h2 className={`${kitchenMode ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl'} font-serif font-bold`}>Comandas</h2>
            <p className={`${kitchenMode ? 'text-sm sm:text-base' : 'text-xs sm:text-sm'} text-[#F4E3C8]/80 mt-1`}>
              Lectura rápida para cocina: mesa, platillo, preparación y notas primero.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 min-w-[260px]">
            <div className="rounded-2xl bg-rose-950/40 border border-rose-400/30 px-3 py-2 text-center">
              <span className="block text-[10px] text-rose-200">Nuevas</span>
              <strong className={`${kitchenMode ? 'text-2xl' : 'text-xl'} text-rose-300`}>{counts.NUEVO}</strong>
            </div>
            <div className="rounded-2xl bg-amber-950/40 border border-amber-400/30 px-3 py-2 text-center">
              <span className="block text-[10px] text-amber-200">Preparando</span>
              <strong className={`${kitchenMode ? 'text-2xl' : 'text-xl'} text-amber-300`}>{counts.PREPARANDO}</strong>
            </div>
            <div className="rounded-2xl bg-emerald-950/40 border border-emerald-400/30 px-3 py-2 text-center">
              <span className="block text-[10px] text-emerald-200">Listas</span>
              <strong className={`${kitchenMode ? 'text-2xl' : 'text-xl'} text-emerald-300`}>{counts.LISTO}</strong>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 text-xs font-medium">{error}</div>}

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {([
          ['ACTIVAS', 'Activas'],
          ['NUEVO', 'Nuevas'],
          ['PREPARANDO', 'Preparando'],
          ['LISTO', 'Listas'],
          ['ENTREGADO', 'Entregadas'],
          ['CANCELADO', 'Canceladas'],
        ] as [Filter, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`${kitchenMode ? 'px-4 py-2.5 text-sm' : 'px-3.5 py-2 text-xs'} rounded-xl font-bold whitespace-nowrap border transition-all cursor-pointer ${
              filter === id ? 'bg-[#3A2418] text-[#FFF7EA] border-[#3A2418]' : 'bg-white text-[#5C3825] border-[#DEC8AE] hover:bg-[#FFF7EA]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {visibleOrders.length === 0 ? (
        <div className="bg-white border border-[#F4E3C8] rounded-3xl p-10 text-center text-[#6B4028]">
          <UtensilsCrossed className="w-10 h-10 mx-auto mb-3 text-[#C9974D]" />
          <h3 className="font-serif font-bold text-[#2B1B13]">No hay comandas en esta vista</h3>
          <p className="text-xs mt-1">Las nuevas órdenes aparecerán aquí automáticamente.</p>
        </div>
      ) : (
        <div className={`grid grid-cols-1 ${kitchenMode ? 'lg:grid-cols-2' : 'lg:grid-cols-2 xl:grid-cols-3'} gap-5`}>
          {visibleOrders.map((order) => {
            const meta = statusMeta[order.status];
            const busy = busyId === order.id;
            const confirmingCancel = cancelConfirmId === order.id;
            return (
              <article key={order.id} className="bg-white border-2 border-[#D7B995] rounded-3xl shadow-sm overflow-hidden">
                <div className={`${kitchenMode ? 'p-5' : 'p-4'} border-b border-[#E8D4BE] bg-[#FFF9F0] flex items-start justify-between gap-3`}>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`${kitchenMode ? 'text-3xl sm:text-4xl' : 'text-2xl'} font-serif font-black text-[#2B1B13] leading-none`}>
                        {orderOriginLabel(order)}
                      </span>
                      <span className={`${kitchenMode ? 'text-xs px-3 py-1.5' : 'text-[11px] px-2.5 py-1'} rounded-full border font-black ${meta.className}`}>
                        {meta.label}
                      </span>
                    </div>
                    <div className={`flex items-center gap-2 mt-2 ${kitchenMode ? 'text-sm' : 'text-[11px]'} text-[#6B4028] flex-wrap`}>
                      <span className="font-mono font-bold">#{order.code}</span>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1 font-bold"><Clock3 className="w-4 h-4" /> {formatAge(order.createdAt)}</span>
                      <span>•</span>
                      <span className="font-black uppercase tracking-wide text-[#A86B3D]">{sourceLabel(order)}</span>
                    </div>
                  </div>
                  {!kitchenMode && <strong className="text-base text-[#2B1B13]">${order.total}</strong>}
                </div>

                <div className={`${kitchenMode ? 'p-5' : 'p-4'} space-y-4`}>
                  <div className="space-y-4">
                    {order.items.map((item, idx) => {
                      const option = kitchenOptionParts(item.selectedOption);
                      const courses = kitchenCourseParts(item.customizationSummary);
                      const hasCourses = Boolean(courses.first || courses.second || courses.third);

                      return (
                        <div key={`${order.id}-${idx}`} className={`rounded-2xl bg-white border-2 border-[#E8D4BE] ${kitchenMode ? 'px-5 py-4' : 'px-4 py-3'}`}>
                          <div className="flex items-start justify-between gap-3">
                            <span className={`${kitchenMode ? 'text-2xl sm:text-3xl' : 'text-lg sm:text-xl'} font-black text-[#2B1B13] leading-tight`}>
                              {item.quantity}× {item.name}
                            </span>
                            {!kitchenMode && <span className="text-xs font-bold text-[#8A624C]">${item.totalPrice}</span>}
                          </div>

                          {item.personLabel && (
                            <p className={`${kitchenMode ? 'text-base sm:text-lg' : 'text-sm'} font-black text-emerald-800 mt-2`}>
                              👤 {item.personLabel}
                            </p>
                          )}

                          {(option.sauce || option.preparation || (!hasCourses && option.raw) || item.selectedSize || (item.extras && item.extras.length > 0) || item.customizationSummary) && (
                            <div className="mt-4 grid gap-3">
                              {option.sauce && (
                                <div className={`rounded-2xl bg-emerald-50 border-2 border-emerald-300 ${kitchenMode ? 'px-4 py-3.5' : 'px-3 py-2'}`}>
                                  <span className={`${kitchenMode ? 'text-xs sm:text-sm' : 'text-[10px]'} block uppercase tracking-wider font-black text-emerald-700`}>SALSA</span>
                                  <strong className={`${kitchenMode ? 'text-2xl sm:text-3xl' : 'text-base sm:text-lg'} block mt-0.5 text-emerald-950 leading-none`}>
                                    {option.sauce.toUpperCase()}
                                  </strong>
                                </div>
                              )}

                              {option.preparation && (
                                <div className={`rounded-2xl bg-amber-50 border-2 border-amber-300 ${kitchenMode ? 'px-4 py-3.5' : 'px-3 py-2'}`}>
                                  <span className={`${kitchenMode ? 'text-xs sm:text-sm' : 'text-[10px]'} block uppercase tracking-wider font-black text-amber-700`}>PREPARACIÓN</span>
                                  <strong className={`${kitchenMode ? 'text-2xl sm:text-3xl' : 'text-base sm:text-lg'} block mt-0.5 text-amber-950 leading-tight`}>
                                    {option.preparation}
                                  </strong>
                                </div>
                              )}

                              {hasCourses && (
                                <div className="grid gap-2.5">
                                  {courses.first && (
                                    <div className={`rounded-2xl bg-[#FFF7EA] border-2 border-[#E8D4BE] ${kitchenMode ? 'px-4 py-3.5' : 'px-3 py-2'}`}>
                                      <span className={`${kitchenMode ? 'text-xs sm:text-sm' : 'text-[10px]'} block uppercase tracking-wider font-black text-[#A86B3D]`}>1ER TIEMPO</span>
                                      <strong className={`${kitchenMode ? 'text-2xl sm:text-3xl' : 'text-base sm:text-lg'} block mt-0.5 text-[#2B1B13] leading-tight`}>{courses.first}</strong>
                                    </div>
                                  )}
                                  {courses.second && (
                                    <div className={`rounded-2xl bg-amber-50 border-2 border-amber-200 ${kitchenMode ? 'px-4 py-3.5' : 'px-3 py-2'}`}>
                                      <span className={`${kitchenMode ? 'text-xs sm:text-sm' : 'text-[10px]'} block uppercase tracking-wider font-black text-amber-700`}>2DO TIEMPO</span>
                                      <strong className={`${kitchenMode ? 'text-2xl sm:text-3xl' : 'text-base sm:text-lg'} block mt-0.5 text-amber-950 leading-tight`}>{courses.second}</strong>
                                    </div>
                                  )}
                                  {courses.third && (
                                    <div className={`rounded-2xl bg-orange-50 border-2 border-orange-300 ${kitchenMode ? 'px-4 py-3.5' : 'px-3 py-2'}`}>
                                      <span className={`${kitchenMode ? 'text-xs sm:text-sm' : 'text-[10px]'} block uppercase tracking-wider font-black text-orange-700`}>3ER TIEMPO</span>
                                      <strong className={`${kitchenMode ? 'text-2xl sm:text-3xl' : 'text-base sm:text-lg'} block mt-0.5 text-orange-950 leading-tight`}>{courses.third}</strong>
                                    </div>
                                  )}
                                  {courses.extra && (
                                    <div className={`rounded-xl bg-[#FFF7EA] border border-[#DEC8AE] ${kitchenMode ? 'px-4 py-3 text-lg' : 'px-3 py-2 text-sm'} font-bold text-[#7A4A27]`}>
                                      EXTRA: <strong>{courses.extra}</strong>
                                    </div>
                                  )}
                                </div>
                              )}

                              {!hasCourses && option.raw && (
                                <div className={`rounded-2xl bg-[#FFF7EA] border-2 border-[#DEC8AE] ${kitchenMode ? 'px-4 py-3.5' : 'px-3 py-2'}`}>
                                  <span className={`${kitchenMode ? 'text-xs sm:text-sm' : 'text-[10px]'} block uppercase tracking-wider font-black text-[#A86B3D]`}>OPCIÓN</span>
                                  <strong className={`${kitchenMode ? 'text-xl sm:text-2xl' : 'text-sm sm:text-base'} block mt-0.5 text-[#3A2418] leading-tight`}>
                                    {option.raw}
                                  </strong>
                                </div>
                              )}

                              {item.selectedSize && (
                                <p className={`${kitchenMode ? 'text-lg' : 'text-sm'} font-bold text-[#5C3825]`}>
                                  TAMAÑO: <strong>{item.selectedSize}</strong>
                                </p>
                              )}

                              {item.extras && item.extras.length > 0 && (
                                <div className={`rounded-xl bg-[#FFF7EA] border border-[#DEC8AE] ${kitchenMode ? 'px-4 py-3 text-lg' : 'px-3 py-2 text-sm'} font-bold text-[#7A4A27]`}>
                                  EXTRAS: <strong>{item.extras.join(', ')}</strong>
                                </div>
                              )}

                              {!hasCourses && item.customizationSummary && (
                                <p className={`${kitchenMode ? 'text-lg' : 'text-sm'} font-bold text-[#5C3825]`}>
                                  {item.customizationSummary}
                                </p>
                              )}
                            </div>
                          )}

                          {item.specialInstructions && (
                            <div className={`mt-4 rounded-2xl bg-rose-50 border-[3px] border-rose-400 ${kitchenMode ? 'px-4 py-4' : 'px-3 py-3'} flex items-start gap-3`}>
                              <AlertTriangle className={`${kitchenMode ? 'w-7 h-7' : 'w-5 h-5'} text-rose-700 shrink-0 mt-0.5`} />
                              <div>
                                <span className={`${kitchenMode ? 'text-sm' : 'text-[10px]'} block uppercase tracking-wider font-black text-rose-700`}>⚠ ATENCIÓN</span>
                                <strong className={`${kitchenMode ? 'text-2xl sm:text-3xl' : 'text-base sm:text-lg'} block mt-1 leading-tight text-rose-950`}>
                                  {item.specialInstructions}
                                </strong>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {order.notes && (
                    <div className={`${kitchenMode ? 'text-lg px-4 py-3' : 'text-sm px-3 py-2.5'} text-[#5C3825] bg-[#FFF7EA] rounded-2xl border border-[#F4E3C8]`}>
                      <strong>NOTA GENERAL:</strong> <span className="font-bold">{order.notes}</span>
                    </div>
                  )}

                  {!kitchenMode && order.customerName && !order.notes && (
                    <div className="text-sm text-[#5C3825] bg-[#FFF7EA] rounded-2xl px-3 py-2.5 border border-[#F4E3C8]">
                      <strong>{order.customerName}</strong>
                    </div>
                  )}

                  {order.claimedByName && (
                    <p className={`${kitchenMode ? 'text-sm' : 'text-xs'} text-[#6B4028]`}>
                      Tomada por: <strong>{order.claimedByName}</strong>
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {order.status === 'NUEVO' && canKitchen && (
                      <button
                        disabled={busy}
                        onClick={() => changeStatus(order, 'PREPARANDO')}
                        className={`col-span-2 ${kitchenMode ? 'py-5 text-xl sm:text-2xl' : 'py-4 text-base'} rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-black flex items-center justify-center gap-3 disabled:opacity-50 cursor-pointer`}
                      >
                        {busy ? <RefreshCw className="w-6 h-6 animate-spin" /> : <ChefHat className="w-6 h-6" />} PREPARAR
                      </button>
                    )}

                    {order.status === 'PREPARANDO' && canKitchen && (
                      <button
                        disabled={busy}
                        onClick={() => changeStatus(order, 'LISTO')}
                        className={`col-span-2 ${kitchenMode ? 'py-5 text-xl sm:text-2xl' : 'py-4 text-base'} rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black flex items-center justify-center gap-3 disabled:opacity-50 cursor-pointer`}
                      >
                        <PackageCheck className="w-6 h-6" /> LISTO
                      </button>
                    )}

                    {order.status === 'LISTO' && canDeliver && (
                      <button
                        disabled={busy}
                        onClick={() => changeStatus(order, 'ENTREGADO')}
                        className={`col-span-2 ${kitchenMode ? 'py-5 text-xl sm:text-2xl' : 'py-4 text-base'} rounded-2xl bg-[#3A2418] hover:bg-[#5C3825] text-[#FFF7EA] font-black flex items-center justify-center gap-3 disabled:opacity-50 cursor-pointer`}
                      >
                        <CheckCircle2 className="w-6 h-6" /> ENTREGADO
                      </button>
                    )}

                    {order.status === 'ENTREGADO' && (
                      <div className="col-span-2 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs font-bold flex items-center justify-center gap-2">
                        {order.orderType === 'delivery' ? <Truck className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />} Finalizada
                      </div>
                    )}

                    {canCancel && !['ENTREGADO', 'CANCELADO'].includes(order.status) && !confirmingCancel && (
                      <button
                        disabled={busy}
                        onClick={() => setCancelConfirmId(order.id || null)}
                        className="col-span-2 py-2 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-[11px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Cancelar comanda
                      </button>
                    )}

                    {canCancel && !['ENTREGADO', 'CANCELADO'].includes(order.status) && confirmingCancel && (
                      <div className="col-span-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 space-y-2">
                        <p className="text-[11px] font-bold text-rose-800 text-center">¿Confirmas cancelar la comanda #{order.code}?</p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setCancelConfirmId(null)}
                            className="py-2 rounded-lg border border-rose-200 bg-white text-rose-700 text-[11px] font-bold disabled:opacity-50 cursor-pointer"
                          >
                            No cancelar
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => changeStatus(order, 'CANCELADO')}
                            className="py-2 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-[11px] font-bold disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1"
                          >
                            {busy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />} Sí, cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};