import React, { useRef, useState } from 'react';
import { Minus, Plus, ReceiptText } from 'lucide-react';
import { StaffUser } from '../../types';
import { createRestaurantOrder, chargeOffTableOrder } from '../../lib/ordersService';
import { createOffTableSaleReceipt, retryPaidOffTableSaleReceipt } from '../../lib/saleReceiptsService';
import { getActiveRestaurantId } from '../../lib/restaurantContext';
import { getCurrentAuthUser } from '../../lib/firebase';
import { OffTableOrderModal } from './OffTableOrderModal';

const money = (value: number) => '$' + Number(value || 0).toLocaleString('es-MX', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Captura de pedidos fuera de mesa, separada de Caja:
 * - Pedidos por WhatsApp/teléfono/domicilio se registran PENDIENTES.
 * - Venta rápida de mostrador se registra y cobra en dos pasos, sin abrir mesa.
 * Los cobros pendientes se procesan en Caja & Cobro.
 */
export const QuickOrdersView: React.FC<{ currentUser: StaffUser }> = ({ currentUser }) => {
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [quickItemName, setQuickItemName] = useState('');
  const [quickItemPrice, setQuickItemPrice] = useState('');
  const [quickItemQuantity, setQuickItemQuantity] = useState('1');
  const [quickCustomerName, setQuickCustomerName] = useState('Pedido WhatsApp');
  const [quickPaymentMethod, setQuickPaymentMethod] = useState<'efectivo' | 'tarjeta' | 'transferencia'>('efectivo');
  const [quickLines, setQuickLines] = useState<Array<{ id: string; name: string; unitPrice: number; quantity: number }>>([]);
  const [savingQuickSale, setSavingQuickSale] = useState(false);
  // Bloquea doble clic incluso durante la validación asíncrona de Google.
  const quickSaleLock = useRef(false);
  const [pendingTicketOrder, setPendingTicketOrder] = useState<{ id: string; code: string } | null>(null);
  const [retryingTicket, setRetryingTicket] = useState(false);
  const quickTotal = quickLines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);

  const addQuickLine = () => {
    const name = quickItemName.trim();
    const price = Number(quickItemPrice);
    const quantity = Math.floor(Number(quickItemQuantity));
    if (!name || !Number.isFinite(price) || price <= 0 || !Number.isFinite(quantity) || quantity < 1) {
      setError('Escribe el producto, un precio mayor a cero y una cantidad válida.');
      return;
    }
    setQuickLines((lines) => [...lines, { id: `${Date.now()}-${lines.length}`, name, unitPrice: price, quantity }]);
    setQuickItemName('');
    setQuickItemPrice('');
    setQuickItemQuantity('1');
    setError(null);
  };

  const updateQuickLineQuantity = (id: string, delta: number) => {
    setQuickLines((lines) => lines
      .map((line) => line.id === id ? { ...line, quantity: line.quantity + delta } : line)
      .filter((line) => line.quantity > 0));
  };

  const submitQuickSale = async () => {
    if (quickSaleLock.current || savingQuickSale || quickLines.length === 0) return;
    quickSaleLock.current = true;
    // Evitar crear un pedido nuevo si no se podrá registrar el cobro.
    // No afecta el flujo separado para guardar pedidos PENDIENTES.
    const googleUser = getCurrentAuthUser();
    if (!googleUser) {
      setError('No estás conectado con Google. Inicia sesión antes de registrar y cobrar una venta rápida.');
      quickSaleLock.current = false;
      return;
    }
    try {
      await googleUser.getIdToken();
    } catch {
      setError('Tu sesión de Google venció. Vuelve a iniciar sesión antes de cobrar.');
      quickSaleLock.current = false;
      return;
    }
    setSavingQuickSale(true);
    setError(null);
    setSuccess(null);
    setPendingTicketOrder(null);
    const total = Math.round(quickTotal * 100) / 100;
    try {
      const order = await createRestaurantOrder({
        orderType: 'pickup',
        orderSource: 'CAJA',
        orderOrigin: 'DIRECTO',
        capturedById: currentUser.id,
        capturedByName: currentUser.name,
        customerName: quickCustomerName.trim() || 'Pedido WhatsApp',
        paymentMethod: quickPaymentMethod,
        bringOwnContainer: false,
        items: quickLines.map((line) => ({
          productId: `manual-${line.id}`,
          name: line.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          totalPrice: Math.round(line.unitPrice * line.quantity * 100) / 100,
        })),
        subtotal: total,
        discountAmount: 0,
        deliveryFee: 0,
        total,
        notes: 'Venta rápida registrada desde Caja para pedido de WhatsApp/mostrador.',
      });
      try {
        const charge = await chargeOffTableOrder(order, quickPaymentMethod, currentUser);
        try {
          await createOffTableSaleReceipt(charge.order, currentUser);
          setSuccess(charge.alreadyPaid
            ? `El pedido ${charge.order.code} ya estaba pagado. Ticket recuperado sin otro cobro.`
            : `Venta rápida cobrada y ticket creado · ${order.code} · ${money(total)}.`);
        } catch (ticketError: any) {
          setPendingTicketOrder({ id: order.id!, code: order.code });
          setSuccess(`Venta ${order.code} cobrada y registrada, pero falta el ticket. No vuelvas a cobrarla. Puedes reintentar SOLO el ticket.`);
        }
      } catch (chargeError: any) {
        setSuccess(`Pedido ${order.code} registrado, pero no se confirmó el cobro. Revisa su estado en Caja antes de cobrarlo de nuevo. ${chargeError?.message || ''}`);
      }
      setQuickLines([]);
      setQuickCustomerName('Pedido WhatsApp');
    } catch (err: any) {
      setError(err?.message || 'No se pudo registrar la venta rápida.');
    } finally {
      setSavingQuickSale(false);
      quickSaleLock.current = false;
    }
  };

  const retryTicketOnly = async () => {
    if (!pendingTicketOrder || retryingTicket) return;
    setRetryingTicket(true);
    try {
      await retryPaidOffTableSaleReceipt(pendingTicketOrder.id, getActiveRestaurantId(), currentUser);
      setSuccess(`Ticket generado para ${pendingTicketOrder.code}. La venta NO se cobró otra vez.`);
      setPendingTicketOrder(null);
    } catch (err: any) {
      setSuccess(`La venta ${pendingTicketOrder.code} sigue cobrada. No se pudo crear el ticket: ${err?.message || 'permisos o conexión'}. No vuelvas a cobrarla.`);
    } finally {
      setRetryingTicket(false);
    }
  };

  return (
    <div className="space-y-5 pb-20">
      <header className="rounded-3xl bg-[#3A2418] px-5 py-6 text-[#FFF7EA] shadow-md">
        <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#C9974D]">
          <ReceiptText className="h-4 w-4" /> Captura rápida
        </div>
        <h2 className="font-serif text-2xl font-bold">Pedidos rápidos</h2>
        <p className="mt-1 text-sm text-[#F4E3C8]">
          Registra pedidos de WhatsApp, teléfono y mostrador sin ocupar una mesa.
          Los pedidos pendientes se cobran en Caja & Cobro.
        </p>
      </header>

      {error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
      {success && <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{success}</div>}
      {pendingTicketOrder && <button type="button" disabled={retryingTicket} onClick={() => void retryTicketOnly()} className="rounded-xl border border-amber-700 bg-amber-100 px-4 py-3 text-sm font-bold text-amber-950 disabled:opacity-50">{retryingTicket ? 'Verificando el pago…' : `Reintentar solo ticket · ${pendingTicketOrder.code}`}</button>}

      <section className="rounded-3xl border border-[#E7D7C4] bg-white px-5 py-5">
        <h3 className="font-serif text-lg font-bold text-[#2B1B13]">Pedido para cobrar después</h3>
        <p className="mt-1 text-xs text-[#6B4028]">
          Úsalo para pedidos por WhatsApp, teléfono, para llevar o domicilio.
          Puedes agregar productos del catálogo y registrar al cliente. No cobra automáticamente.
        </p>
        <button type="button" onClick={() => setOrderModalOpen(true)} className="mt-4 rounded-xl bg-[#3A2418] px-5 py-3 text-sm font-black text-[#FFF7EA]">
          + Crear pedido pendiente
        </button>
      </section>

      <div className="px-1 text-xs font-semibold text-[#6B4028]">
        ¿Ya te pagaron en mostrador? Registra la venta aquí. Se contabilizará una sola vez en Caja.
      </div>
      <section className="overflow-hidden rounded-3xl border border-[#C9974D]/50 bg-white shadow-xs">
        <div className="border-b border-[#F4E3C8] bg-[#FFF7EA] px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider text-[#A86B3D]">Sin abrir mesa</div>
              <h3 className="font-serif text-xl font-black text-[#2B1B13]">Venta rápida · WhatsApp / mostrador</h3>
              <p className="mt-1 text-xs text-[#6B4028]">Agrega café, pan, refresco u otros productos, elige cómo pagaron y registra la venta directo a Caja.</p>
            </div>
            <strong className="font-serif text-2xl text-[#2B1B13]">{money(quickTotal)}</strong>
          </div>
        </div>
        <div className="space-y-4 p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-[#6B4028]">Nombre / referencia
              <input value={quickCustomerName} onChange={(e) => setQuickCustomerName(e.target.value)} placeholder="Pedido WhatsApp" className="mt-1 w-full rounded-xl border border-[#DEC8AE] bg-[#FFFDF8] px-3 py-3 text-sm font-normal text-[#2B1B13]" />
            </label>
            <label className="text-xs font-bold text-[#6B4028]">Forma de pago
              <select value={quickPaymentMethod} onChange={(e) => setQuickPaymentMethod(e.target.value as 'efectivo' | 'tarjeta' | 'transferencia')} className="mt-1 w-full rounded-xl border border-[#DEC8AE] bg-[#FFFDF8] px-3 py-3 text-sm text-[#2B1B13]">
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="transferencia">Transferencia</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_120px_90px_auto]">
            <label className="text-xs font-bold text-[#6B4028]">Producto
              <input value={quickItemName} onChange={(e) => setQuickItemName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addQuickLine(); } }} placeholder="Ej. Café americano" className="mt-1 w-full rounded-xl border border-[#DEC8AE] px-3 py-3 text-sm font-normal text-[#2B1B13]" />
            </label>
            <label className="text-xs font-bold text-[#6B4028]">Precio unitario ($)
              <input type="number" min="0.01" step="0.01" value={quickItemPrice} onChange={(e) => setQuickItemPrice(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addQuickLine(); } }} placeholder="35.00" className="mt-1 w-full rounded-xl border border-[#DEC8AE] px-3 py-3 text-sm font-normal text-[#2B1B13]" />
            </label>
            <label className="text-xs font-bold text-[#6B4028]">Cantidad
              <input type="number" min="1" step="1" value={quickItemQuantity} onChange={(e) => setQuickItemQuantity(e.target.value)} className="mt-1 w-full rounded-xl border border-[#DEC8AE] px-3 py-3 text-sm font-normal text-[#2B1B13]" />
            </label>
            <button type="button" onClick={addQuickLine} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#F4E3C8] px-4 py-3 text-xs font-black text-[#3A2418]"><Plus className="h-4 w-4" /> Agregar</button>
          </div>
          {quickLines.length > 0 && (
            <div className="divide-y divide-[#F4E3C8] rounded-2xl border border-[#F4E3C8]">
              {quickLines.map((line) => (
                <div key={line.id} className="flex items-center justify-between gap-3 px-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-[#2B1B13]">{line.name}</div>
                    <div className="text-[11px] text-[#7A5A45]">{line.quantity} × {money(line.unitPrice)} = {money(line.quantity * line.unitPrice)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" aria-label={`Quitar una unidad de ${line.name}`} onClick={() => updateQuickLineQuantity(line.id, -1)} className="rounded-lg border border-[#DEC8AE] p-2 text-[#5C3825]"><Minus className="h-3.5 w-3.5" /></button>
                    <button type="button" aria-label={`Agregar una unidad de ${line.name}`} onClick={() => updateQuickLineQuantity(line.id, 1)} className="rounded-lg border border-[#DEC8AE] p-2 text-[#5C3825]"><Plus className="h-3.5 w-3.5" /></button>
                    <strong className="min-w-[76px] text-right text-sm text-[#2B1B13]">{money(line.quantity * line.unitPrice)}</strong>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <span className="text-xs text-[#7A5A45]">{quickLines.length} producto(s) · El pedido queda registrado sin asignar mesa.</span>
            <button type="button" disabled={savingQuickSale || quickLines.length === 0} onClick={submitQuickSale} className="rounded-xl bg-[#3A2418] px-5 py-3 text-sm font-black text-[#FFF7EA] disabled:cursor-not-allowed disabled:opacity-40">
              {savingQuickSale ? 'Registrando y cobrando…' : `Registrar y cobrar · ${money(quickTotal)}`}
            </button>
          </div>
        </div>
      </section>


      {orderModalOpen && (
        <OffTableOrderModal
          currentUser={currentUser}
          onClose={() => setOrderModalOpen(false)}
          onDone={(message) => { setSuccess(message); setError(null); }}
        />
      )}
    </div>
  );
};
