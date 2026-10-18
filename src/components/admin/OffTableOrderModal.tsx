import React, { useEffect, useMemo, useState } from 'react';
import { Minus, Plus, Trash2, X } from 'lucide-react';
import { RestaurantOrder, RestaurantOrderItem, StaffUser } from '../../types';
import { subscribeToMenuCatalog, ManagedMenuItem } from '../../lib/menuCatalogService';
import { createRestaurantOrder, updateOffTableOrderDetails } from '../../lib/ordersService';

interface Props {
  /** Si viene un pedido, se edita; si no, se registra uno nuevo. */
  order?: RestaurantOrder;
  currentUser: StaffUser;
  onClose: () => void;
  onDone: (message: string) => void;
}

const money = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;
const CHANNELS = ['WhatsApp', 'Teléfono', 'Mostrador'] as const;
const inputClass = 'w-full rounded-xl border border-[#DEC8AE] bg-white px-3 py-2 text-sm text-[#2B1B13] outline-none focus:border-[#C9974D]';
const labelClass = 'block text-[10px] font-black uppercase tracking-wide text-[#A86B3D] mb-1';

/** Registrar o corregir pedidos para llevar / domicilio (WhatsApp, teléfono o mostrador). */
export const OffTableOrderModal: React.FC<Props> = ({ order, currentUser, onClose, onDone }) => {
  const editing = Boolean(order);
  const [catalog, setCatalog] = useState<ManagedMenuItem[]>([]);
  const [orderType, setOrderType] = useState<'pickup' | 'delivery'>(order?.orderType === 'delivery' ? 'delivery' : 'pickup');
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>('WhatsApp');
  const [customerName, setCustomerName] = useState(order?.customerName || '');
  const [phone, setPhone] = useState(order?.phone || '');
  const [address, setAddress] = useState(order?.address || '');
  const [reference, setReference] = useState(order?.addressReference || '');
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'transferencia' | 'tarjeta'>(order?.paymentMethod || 'efectivo');
  const [notes, setNotes] = useState(order?.notes || '');
  const [deliveryFee, setDeliveryFee] = useState(String(order?.deliveryFee ?? 0));
  const [items, setItems] = useState<RestaurantOrderItem[]>(order?.items ? order.items.map((i) => ({ ...i })) : []);
  const [search, setSearch] = useState('');
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeToMenuCatalog((doc) => setCatalog(doc?.items || [])), []);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return catalog
      .filter((item) => item.active !== false && item.available !== false && item.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [catalog, search]);

  const setLine = (index: number, patch: Partial<RestaurantOrderItem>) => {
    setItems((prev) => prev.map((line, i) => {
      if (i !== index) return line;
      const next = { ...line, ...patch };
      next.quantity = Math.max(1, Math.floor(Number(next.quantity) || 1));
      next.unitPrice = Math.max(0, Number(next.unitPrice) || 0);
      next.totalPrice = Math.round(next.quantity * next.unitPrice * 100) / 100;
      return next;
    }));
  };

  const addProduct = (item: ManagedMenuItem) => {
    const firstSize = item.sizes && item.sizes.length > 0 ? item.sizes[0] : undefined;
    const unit = Number(firstSize?.price ?? item.price ?? 0) || 0;
    setItems((prev) => [...prev, {
      productId: item.id,
      name: item.name,
      quantity: 1,
      unitPrice: unit,
      totalPrice: unit,
      selectedSize: firstSize?.name,
    }]);
    setSearch('');
  };

  const addCustom = () => {
    const price = Number(customPrice);
    if (!customName.trim() || !(price >= 0)) return;
    setItems((prev) => [...prev, {
      productId: `manual-${Date.now()}`,
      name: customName.trim(),
      quantity: 1,
      unitPrice: price,
      totalPrice: price,
    }]);
    setCustomName('');
    setCustomPrice('');
  };

  const changeSize = (index: number, sizeName: string) => {
    const line = items[index];
    const product = catalog.find((c) => c.id === line.productId);
    const size = product?.sizes?.find((s) => s.name === sizeName);
    setLine(index, { selectedSize: sizeName, unitPrice: Number(size?.price ?? line.unitPrice) || 0 });
  };

  const subtotal = items.reduce((sum, line) => sum + Number(line.totalPrice || 0), 0);
  const fee = orderType === 'delivery' ? Math.max(0, Number(deliveryFee) || 0) : 0;
  const total = Math.round((subtotal + fee) * 100) / 100;

  const validate = (): string | null => {
    if (items.length === 0) return 'Agrega al menos un producto.';
    if (orderType === 'delivery' && !address.trim()) return 'Para domicilio escribe la dirección.';
    return null;
  };

  const save = async () => {
    const problem = validate();
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError(null);
    try {
      const common = {
        orderType,
        customerName: customerName.trim() || 'Cliente',
        phone: phone.trim() || undefined,
        address: orderType === 'delivery' ? address.trim() : undefined,
        addressReference: orderType === 'delivery' ? reference.trim() || undefined : undefined,
        paymentMethod,
        items,
        subtotal,
        discountAmount: order?.discountAmount || 0,
        deliveryFee: fee,
        total: Math.round((subtotal + fee - (order?.discountAmount || 0)) * 100) / 100,
      };
      if (order) {
        await updateOffTableOrderDetails(order, { ...common, notes: notes.trim() || undefined }, currentUser);
        onDone(`Pedido ${order.code} actualizado · ${money(common.total)}`);
      } else {
        const created = await createRestaurantOrder({
          ...common,
          orderSource: 'CAJA',
          orderOrigin: 'DIRECTO',
          capturedById: currentUser.id,
          capturedByName: currentUser.name,
          bringOwnContainer: false,
          notes: [`Pedido por ${channel}`, notes.trim()].filter(Boolean).join(' · '),
        });
        onDone(`Pedido ${created.code} registrado · ${money(common.total)}`);
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar el pedido.');
    } finally {
      setSaving(false);
    }
  };

  const cancelOrder = async () => {
    if (!order) return;
    if (!window.confirm(`¿Cancelar el pedido ${order.code}? Dejará de aparecer por cobrar, pero conservará su historial.`)) return;
    const reason = window.prompt('Motivo de cancelación (obligatorio):', 'Pedido de prueba');
    if (!reason?.trim()) { setError('Indica un motivo para cancelar.'); return; }
    setSaving(true);
    setError(null);
    try {
      await updateOffTableOrderDetails(order, {
        status: 'CANCELADO',
        notes: [order.notes, `CANCELADO: ${reason.trim()}`].filter(Boolean).join(' · '),
      }, currentUser);
      onDone(`Pedido ${order.code} cancelado`);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'No se pudo cancelar el pedido.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl border border-[#F4E3C8] bg-[#FFF7EA] shadow-2xl sm:max-w-2xl sm:rounded-3xl">
        <div className="sticky top-0 z-10 flex items-center justify-between bg-[#3A2418] px-5 py-4 text-[#FFF7EA]">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#C9974D]">{editing ? `Editar pedido ${order!.code}` : 'Registrar pedido'}</span>
            <h3 className="font-serif text-xl font-bold">{editing ? 'Corregir pedido' : 'Pedido por WhatsApp, teléfono o mostrador'}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl bg-[#4A2E1F] p-2" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-2">
            {(['pickup', 'delivery'] as const).map((type) => (
              <button key={type} type="button" onClick={() => setOrderType(type)}
                className={`rounded-xl border px-3 py-2.5 text-xs font-black ${orderType === type ? 'border-[#3A2418] bg-[#3A2418] text-[#FFF7EA]' : 'border-[#DEC8AE] bg-white text-[#5C3825]'}`}>
                {type === 'pickup' ? 'Para llevar' : 'A domicilio'}
              </button>
            ))}
          </div>

          {!editing && (
            <div>
              <label className={labelClass}>¿Cómo lo pidieron?</label>
              <div className="grid grid-cols-3 gap-2">
                {CHANNELS.map((c) => (
                  <button key={c} type="button" onClick={() => setChannel(c)}
                    className={`rounded-xl border px-2 py-2 text-xs font-bold ${channel === c ? 'border-[#C9974D] bg-[#F4E3C8] text-[#2B1B13]' : 'border-[#DEC8AE] bg-white text-[#5C3825]'}`}>{c}</button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className={labelClass}>Nombre del cliente</label><input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={inputClass} placeholder="Ej. Ana" /></div>
            <div><label className={labelClass}>Teléfono</label><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={inputClass} placeholder="55…" /></div>
          </div>

          {orderType === 'delivery' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><label className={labelClass}>Dirección</label><input value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Referencia</label><input value={reference} onChange={(e) => setReference(e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Costo de envío</label><input value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} inputMode="decimal" className={inputClass} /></div>
            </div>
          )}

          <div className="space-y-2 rounded-2xl border border-[#E7D7C4] bg-white p-3">
            <label className={labelClass}>Productos</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} className={inputClass} placeholder="Buscar en el menú (ej. café, chilaquiles)…" />
            {matches.length > 0 && (
              <div className="divide-y divide-[#F4E3C8] overflow-hidden rounded-xl border border-[#E7D7C4]">
                {matches.map((item) => (
                  <button key={item.id} type="button" onClick={() => addProduct(item)} className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-[#FFF7EA]">
                    <span className="font-bold text-[#2B1B13]">{item.name}</span>
                    <span className="text-[#6B4028]">{item.price != null ? money(item.price) : item.sizes && item.sizes[0] ? `desde ${money(Number(item.sizes[0].price || 0))}` : ''}</span>
                  </button>
                ))}
              </div>
            )}
            {search.trim() && matches.length === 0 && <p className="text-[11px] text-[#7A5A45]">Sin resultados. Puedes agregarlo manual abajo.</p>}

            {items.length === 0 ? (
              <p className="py-2 text-center text-xs text-[#7A5A45]">Aún no hay productos.</p>
            ) : (
              <div className="space-y-2">
                {items.map((line, index) => {
                  const product = catalog.find((c) => c.id === line.productId);
                  return (
                    <div key={`${line.productId}-${index}`} className="rounded-xl border border-[#F4E3C8] bg-[#FFFDF9] p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <strong className="text-xs text-[#2B1B13]">{line.name}</strong>
                        <button type="button" onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))} className="text-rose-700" aria-label="Quitar"><Trash2 className="h-4 w-4" /></button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => setLine(index, { quantity: line.quantity - 1 })} className="rounded-lg border border-[#DEC8AE] bg-white p-1.5"><Minus className="h-3.5 w-3.5" /></button>
                          <span className="w-7 text-center text-sm font-black">{line.quantity}</span>
                          <button type="button" onClick={() => setLine(index, { quantity: line.quantity + 1 })} className="rounded-lg border border-[#DEC8AE] bg-white p-1.5"><Plus className="h-3.5 w-3.5" /></button>
                        </div>
                        {product?.sizes && product.sizes.length > 0 && (
                          <select value={line.selectedSize || ''} onChange={(e) => changeSize(index, e.target.value)} className="rounded-lg border border-[#DEC8AE] bg-white px-2 py-1.5 text-xs">
                            {product.sizes.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                          </select>
                        )}
                        {product?.options && product.options.length > 0 && (
                          <select value={line.selectedOption || ''} onChange={(e) => setLine(index, { selectedOption: e.target.value || undefined })} className="rounded-lg border border-[#DEC8AE] bg-white px-2 py-1.5 text-xs">
                            <option value="">Sin opción</option>
                            {product.options.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        )}
                        <label className="ml-auto flex items-center gap-1 text-[10px] font-bold text-[#A86B3D]">Precio
                          <input value={line.unitPrice} onChange={(e) => setLine(index, { unitPrice: Number(e.target.value) })} inputMode="decimal" className="w-20 rounded-lg border border-[#DEC8AE] bg-white px-2 py-1.5 text-xs" />
                        </label>
                        <strong className="w-20 text-right text-sm text-[#2B1B13]">{money(line.totalPrice)}</strong>
                      </div>
                      <input value={line.specialInstructions || ''} onChange={(e) => setLine(index, { specialInstructions: e.target.value || undefined })} className={`${inputClass} mt-2 !py-1.5 !text-xs`} placeholder="Indicaciones (sin cebolla, etc.)" />
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2 border-t border-[#F4E3C8] pt-2">
              <input value={customName} onChange={(e) => setCustomName(e.target.value)} className={inputClass} placeholder="Producto que no está en el menú" />
              <input value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} inputMode="decimal" className={`${inputClass} !w-24`} placeholder="$" />
              <button type="button" onClick={addCustom} className="shrink-0 rounded-xl bg-[#3A2418] px-3 text-xs font-black text-[#FFF7EA]">Agregar</button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Método de pago esperado</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)} className={inputClass}>
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="transferencia">Transferencia</option>
              </select>
            </div>
            <div><label className={labelClass}>Notas</label><input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} placeholder="Hora de entrega, comentarios…" /></div>
          </div>

          <div className="flex items-center justify-between rounded-2xl bg-[#3A2418] px-4 py-3 text-[#FFF7EA]">
            <span className="text-xs">Subtotal {money(subtotal)}{fee > 0 ? ` + envío ${money(fee)}` : ''}</span>
            <strong className="font-serif text-xl">{money(total)}</strong>
          </div>

          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</div>}

          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={saving} onClick={() => void save()} className="flex-1 rounded-xl bg-[#3A2418] px-4 py-3 text-sm font-black text-[#FFF7EA] disabled:opacity-50">
              {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Registrar pedido'}
            </button>
            {editing && (
              <button type="button" disabled={saving} onClick={() => void cancelOrder()} className="rounded-xl border border-rose-300 bg-white px-4 py-3 text-sm font-black text-rose-700 disabled:opacity-50">Cancelar pedido</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
