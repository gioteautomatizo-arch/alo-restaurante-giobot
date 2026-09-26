import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, ClipboardList, Minus, PackagePlus, Plus, ShoppingCart, XCircle } from 'lucide-react';
import type { BusinessCatalogItem } from '../../lib/businessCatalogService';
import { subscribeToBusinessCatalog } from '../../lib/businessCatalogService';
import type { RestaurantOrder, RestaurantOrderItem, RestaurantOrderStatus } from '../../types';
import { createRestaurantOrder, subscribeToRestaurantOrders, updateRestaurantOrderStatus } from '../../lib/ordersService';
import { getCurrentAuthUser } from '../../lib/firebase';

const STATUS_LABELS: Record<RestaurantOrderStatus, string> = {
  NUEVO: 'Nueva',
  PREPARANDO: 'Preparando',
  LISTO: 'Lista',
  ENTREGADO: 'Entregada',
  CANCELADO: 'Cancelada',
};

const STATUS_FLOW: RestaurantOrderStatus[] = ['NUEVO', 'PREPARANDO', 'LISTO', 'ENTREGADO'];

type CartLine = {
  item: BusinessCatalogItem;
  quantity: number;
};

const money = (value: number) => value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

export const BusinessOperationsView: React.FC<{
  businessId: string;
  businessName: string;
  onBack: () => void;
}> = ({ businessId, businessName, onBack }) => {
  const [catalog, setCatalog] = useState<BusinessCatalogItem[]>([]);
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'transferencia' | 'tarjeta'>('efectivo');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'pos' | 'orders'>('pos');

  useEffect(() => subscribeToBusinessCatalog(
    businessId,
    (data) => setCatalog(data?.items || []),
    () => setCatalog([])
  ), [businessId]);

  useEffect(() => subscribeToRestaurantOrders(setOrders), []);

  const availableCatalog = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('es-MX');
    return catalog
      .filter((item) => item.available && item.price !== null)
      .filter((item) => (item.name + ' ' + item.category).toLocaleLowerCase('es-MX').includes(normalizedSearch));
  }, [catalog, search]);

  const cartTotal = cart.reduce((sum, line) => sum + Number(line.item.price || 0) * line.quantity, 0);

  const todayOrders = useMemo(() => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
    return orders.filter((order) => order.createdAt?.startsWith(today));
  }, [orders]);

  const activeOrders = orders.filter((order) => ['NUEVO', 'PREPARANDO', 'LISTO'].includes(order.status));
  const paidLikeOrders = todayOrders.filter((order) => order.billingStatus === 'PAGADO');

  const addToCart = (item: BusinessCatalogItem) => {
    setCart((current) => {
      const existing = current.find((line) => line.item.id === item.id);
      if (existing) return current.map((line) => line.item.id === item.id ? { ...line, quantity: line.quantity + 1 } : line);
      return [...current, { item, quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart((current) => current
      .map((line) => line.item.id === id ? { ...line, quantity: line.quantity + delta } : line)
      .filter((line) => line.quantity > 0));
  };

  const submitOrder = async () => {
    if (saving) return;
    if (cart.length === 0) {
      setMessage('Agrega al menos un producto.');
      return;
    }

    const authUser = getCurrentAuthUser();
    if (!authUser) {
      setMessage('La sesión del negocio ya no está disponible. Vuelve a entrar.');
      return;
    }

    setSaving(true);
    setMessage('');

    try {
      const items: RestaurantOrderItem[] = cart.map((line) => {
        const unitPrice = Number(line.item.price || 0);
        return {
          productId: line.item.id,
          name: line.item.name,
          quantity: line.quantity,
          unitPrice,
          totalPrice: unitPrice * line.quantity,
        };
      });

      await createRestaurantOrder({
        orderType: 'pickup',
        orderSource: 'CAJA',
        capturedById: authUser.uid,
        capturedByName: authUser.displayName || authUser.email || 'Caja',
        customerName: customerName.trim() || 'Cliente mostrador',
        paymentMethod,
        bringOwnContainer: false,
        items,
        subtotal: cartTotal,
        discountAmount: 0,
        deliveryFee: 0,
        total: cartTotal,
        notes: 'Venta capturada desde Gioteautomatizo Business',
      });

      setCart([]);
      setCustomerName('');
      setActiveTab('orders');
      setMessage('Pedido registrado correctamente.');
    } catch (error) {
      console.error('[BusinessOperationsView] no se pudo crear el pedido:', error);
      setMessage(error instanceof Error ? error.message : 'No pudimos registrar el pedido.');
    } finally {
      setSaving(false);
    }
  };

  const advanceStatus = async (order: RestaurantOrder) => {
    if (!order.id) return;
    const index = STATUS_FLOW.indexOf(order.status);
    const nextStatus = STATUS_FLOW[index + 1];
    if (!nextStatus) return;

    const authUser = getCurrentAuthUser();
    if (!authUser) {
      setMessage('La sesión del negocio ya no está disponible.');
      return;
    }

    try {
      await updateRestaurantOrderStatus(order.id, nextStatus, {
        id: authUser.uid,
        name: authUser.displayName || authUser.email || 'Usuario',
      });
    } catch (error) {
      console.error('[BusinessOperationsView] no se pudo actualizar el pedido:', error);
      setMessage(error instanceof Error ? error.message : 'No pudimos actualizar el pedido.');
    }
  };

  const cancelOrder = async (order: RestaurantOrder) => {
    if (!order.id || order.status === 'CANCELADO') return;
    const authUser = getCurrentAuthUser();
    if (!authUser) return;

    try {
      await updateRestaurantOrderStatus(order.id, 'CANCELADO', {
        id: authUser.uid,
        name: authUser.displayName || authUser.email || 'Usuario',
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos cancelar el pedido.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F1EA] text-[#201610]">
      <header className="border-b border-[#E5D8C4] bg-white px-4 py-4 sticky top-0 z-20">
        <div className="mx-auto max-w-6xl flex items-center justify-between gap-3">
          <button onClick={onBack} className="rounded-xl border border-[#DEC8AE] bg-white px-3 py-2 text-xs font-bold text-[#6B4028] flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Negocio
          </button>
          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#A86B3D]">Operación</p>
            <strong className="text-sm">{businessName}</strong>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-[#DEC8AE] bg-white p-4"><ClipboardList className="w-5 h-5 text-[#A86B3D]" /><strong className="mt-2 block text-2xl">{todayOrders.length}</strong><span className="text-[10px] font-bold uppercase text-[#6B4028]">Pedidos hoy</span></div>
          <div className="rounded-2xl border border-[#DEC8AE] bg-white p-4"><PackagePlus className="w-5 h-5 text-[#A86B3D]" /><strong className="mt-2 block text-2xl">{activeOrders.length}</strong><span className="text-[10px] font-bold uppercase text-[#6B4028]">En operación</span></div>
          <div className="rounded-2xl border border-[#DEC8AE] bg-white p-4"><ShoppingCart className="w-5 h-5 text-[#A86B3D]" /><strong className="mt-2 block text-2xl">{money(todayOrders.reduce((sum, order) => sum + Number(order.total || 0), 0))}</strong><span className="text-[10px] font-bold uppercase text-[#6B4028]">Venta registrada</span></div>
          <div className="rounded-2xl border border-[#DEC8AE] bg-white p-4"><CheckCircle2 className="w-5 h-5 text-emerald-600" /><strong className="mt-2 block text-2xl">{paidLikeOrders.length}</strong><span className="text-[10px] font-bold uppercase text-[#6B4028]">Pagados</span></div>
        </div>

        <div className="mt-6 flex gap-2 rounded-2xl border border-[#DEC8AE] bg-white p-2 w-fit">
          <button onClick={() => setActiveTab('pos')} className={activeTab === 'pos' ? 'rounded-xl px-4 py-2 text-xs font-black bg-[#3A2418] text-white' : 'rounded-xl px-4 py-2 text-xs font-black text-[#6B4028]'}>Venta rápida</button>
          <button onClick={() => setActiveTab('orders')} className={activeTab === 'orders' ? 'rounded-xl px-4 py-2 text-xs font-black bg-[#3A2418] text-white' : 'rounded-xl px-4 py-2 text-xs font-black text-[#6B4028]'}>Cola de pedidos</button>
        </div>

        {message && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900">{message}</div>}

        {activeTab === 'pos' ? (
          <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px]">
            <section className="rounded-[2rem] border border-[#D9C5AC] bg-white p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row gap-3">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto..." className="flex-1 rounded-xl border border-[#DEC8AE] px-4 py-3 text-sm outline-none focus:border-[#A86B3D]" />
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Cliente (opcional)" className="sm:w-56 rounded-xl border border-[#DEC8AE] px-4 py-3 text-sm outline-none focus:border-[#A86B3D]" />
              </div>
              <div className="mt-5 grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {availableCatalog.map((item) => (
                  <button key={item.id} onClick={() => addToCart(item)} className="rounded-2xl border border-[#E8D8C4] bg-[#FFFDF9] p-4 text-left hover:border-[#C9974D]">
                    <span className="text-[10px] font-bold uppercase text-[#A86B3D]">{item.category}</span>
                    <strong className="mt-1 block text-sm">{item.name}</strong>
                    <span className="mt-2 block font-black text-[#3A2418]">{money(Number(item.price || 0))}</span>
                  </button>
                ))}
              </div>
              {availableCatalog.length === 0 && <div className="py-12 text-center text-sm text-[#6B4028]">El catálogo no tiene productos disponibles. Abre Catálogo y agrega productos primero.</div>}
            </section>

            <aside className="rounded-[2rem] border border-[#D9C5AC] bg-[#111827] text-white p-5 sm:p-6 h-fit lg:sticky lg:top-24">
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-300">Ticket</span>
              <h2 className="mt-1 font-serif text-2xl font-black">Venta rápida</h2>
              <div className="mt-5 space-y-3">
                {cart.length === 0 ? (
                  <p className="rounded-2xl bg-white/5 p-4 text-sm text-slate-400">Selecciona productos para comenzar.</p>
                ) : cart.map((line) => (
                  <div key={line.item.id} className="rounded-2xl bg-white/5 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div><strong className="text-sm">{line.item.name}</strong><div className="text-xs text-slate-400">{money(Number(line.item.price || 0))} c/u</div></div>
                      <button onClick={() => updateQuantity(line.item.id, -line.quantity)} className="text-slate-500 hover:text-white" title="Quitar"><XCircle className="w-4 h-4" /></button>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-2"><button onClick={() => updateQuantity(line.item.id, -1)} className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center"><Minus className="w-3.5 h-3.5" /></button><span className="w-5 text-center text-sm font-black">{line.quantity}</span><button onClick={() => updateQuantity(line.item.id, 1)} className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center"><Plus className="w-3.5 h-3.5" /></button></div>
                      <strong>{money(Number(line.item.price || 0) * line.quantity)}</strong>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 border-t border-white/10 pt-4">
                <label className="text-[10px] font-black uppercase tracking-wide text-slate-400">Método de pago</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)} className="mt-2 w-full rounded-xl bg-white/10 border border-white/10 px-3 py-3 text-sm text-white outline-none">
                  <option value="efectivo" className="text-black">Efectivo</option>
                  <option value="tarjeta" className="text-black">Tarjeta</option>
                  <option value="transferencia" className="text-black">Transferencia</option>
                </select>
                <div className="mt-4 flex items-end justify-between"><span className="text-sm text-slate-400">Total</span><strong className="text-3xl">{money(cartTotal)}</strong></div>
                <button onClick={submitOrder} disabled={saving || cart.length === 0} className="mt-4 w-full rounded-2xl bg-amber-300 px-4 py-4 text-sm font-black text-[#111827] disabled:opacity-50">{saving ? 'Registrando…' : 'Registrar pedido'}</button>
                <p className="mt-2 text-[10px] text-slate-500">Registra la comanda y conserva el método de pago. El cobro conciliado se integra en la siguiente capa del POS.</p>
              </div>
            </aside>
          </div>
        ) : (
          <section className="mt-6 rounded-[2rem] border border-[#D9C5AC] bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E8D8C4]"><h2 className="font-serif text-xl font-black">Pedidos activos</h2></div>
            {activeOrders.length === 0 ? (
              <div className="p-10 text-center text-sm text-[#6B4028]">No hay pedidos activos.</div>
            ) : (
              <div className="divide-y divide-[#F0E5D9]">
                {activeOrders.map((order) => {
                  const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(order.status) + 1];
                  return (
                    <div key={order.id || order.code} className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-base">{order.code}</strong>
                          <span className="rounded-full bg-[#FFF7EA] px-2 py-1 text-[10px] font-black text-[#A86B3D]">{STATUS_LABELS[order.status]}</span>
                        </div>
                        <p className="mt-1 text-sm text-[#6B4028]">{order.customerName} · {order.orderType === 'pickup' ? 'Mostrador' : order.orderType}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {order.items.map((item, index) => (
                            <span key={item.productId + '-' + index} className="rounded-lg bg-[#FFFDF9] border border-[#E8D8C4] px-2 py-1 text-[11px]">{item.quantity}× {item.name}</span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <strong className="text-lg">{money(Number(order.total || 0))}</strong>
                        {nextStatus && <button onClick={() => advanceStatus(order)} className="rounded-xl bg-[#3A2418] px-3 py-2 text-xs font-black text-white">{STATUS_LABELS[nextStatus]}</button>}
                        <button onClick={() => cancelOrder(order)} className="rounded-xl border border-red-200 p-2 text-red-700" title="Cancelar"><XCircle className="w-4 h-4" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
};
