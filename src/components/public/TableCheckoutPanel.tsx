import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, CreditCard, Landmark, ReceiptText, X } from 'lucide-react';
import { RestaurantOrder, TableServiceRequest, TableSession } from '../../types';
import {
  createPublicServiceRequest,
  subscribeToTableRequestsForTable,
} from '../../lib/tableRequestsService';
import {
  getTableAccountSelection,
  subscribeToTableSession,
} from '../../lib/tableSessionsService';
import { subscribeToTableOrders } from '../../lib/ordersService';

interface TableCheckoutPanelProps {
  tableNumber: number;
}

type CheckoutMethod = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';

function money(value: number): string {
  return `$${Number(value || 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function orderIsFromCurrentSession(order: RestaurantOrder, session: TableSession): boolean {
  if (order.orderType !== 'dine_in' || order.tableNumber !== session.tableNumber) return false;
  if (order.status === 'CANCELADO' || order.billingStatus === 'PAGADO') return false;

  const openedAt = Date.parse(session.openedAt || '');
  const createdAt = Date.parse(order.createdAt || '');
  if (!openedAt || !createdAt) return true;
  return createdAt >= openedAt;
}

export const TableCheckoutPanel: React.FC<TableCheckoutPanelProps> = ({ tableNumber }) => {
  const [session, setSession] = useState<TableSession | null>(null);
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [requests, setRequests] = useState<TableServiceRequest[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<CheckoutMethod>('EFECTIVO');
  const [terminalRequested, setTerminalRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => subscribeToTableSession(tableNumber, setSession), [tableNumber]);
  useEffect(() => subscribeToTableOrders(tableNumber, setOrders), [tableNumber]);
  useEffect(() => subscribeToTableRequestsForTable(tableNumber, setRequests), [tableNumber]);

  const billRequested = requests.some((request) => request.requestType === 'PEDIR_CUENTA');

  useEffect(() => {
    if (!billRequested) {
      setDismissed(false);
      setPaymentMethod('EFECTIVO');
      setTerminalRequested(false);
      setMessage(null);
    }
  }, [billRequested]);

  const selectedAccountId = session?.accountMode === 'SEPARADAS'
    ? (getTableAccountSelection(tableNumber) || session.accounts[0]?.id || null)
    : null;

  const currentOrders = useMemo(() => {
    if (!session || session.status === 'CERRADA') return [];

    return orders.filter((order) => {
      if (!orderIsFromCurrentSession(order, session)) return false;
      if (session.accountMode === 'SEPARADAS' && selectedAccountId) {
        return (order.accountId || 'general') === selectedAccountId;
      }
      return true;
    });
  }, [orders, session, selectedAccountId]);

  const subtotal = currentOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const accountLabel = session?.accountMode === 'SEPARADAS'
    ? (session.accounts.find((account) => account.id === selectedAccountId)?.label || 'Tu cuenta')
    : 'Cuenta de la mesa';

  const requestTerminal = async () => {
    if (terminalRequested || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      // Reutilizamos el llamado operativo público existente para avisar al personal.
      // En la siguiente fase el método de pago viajará también como intención de cobro.
      const result = await createPublicServiceRequest(tableNumber, 'LLAMAR_MESERO');
      if (!result.success) throw new Error(result.message || 'No se pudo solicitar la terminal.');
      setTerminalRequested(true);
      setMessage('Terminal solicitada ✓ El mesero ya fue avisado.');
    } catch (error: any) {
      setMessage(error?.message || 'No pudimos solicitar la terminal. Intenta otra vez.');
    } finally {
      setBusy(false);
    }
  };

  if (!billRequested || dismissed || !session || session.status === 'CERRADA') return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/45 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <section className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-[#FFFDF9] sm:rounded-3xl rounded-t-3xl border border-[#DEC8AE] shadow-2xl">
        <div className="sticky top-0 z-10 bg-[#3A2418] text-[#FFF7EA] px-4 py-3.5 flex items-center justify-between border-b border-[#C9974D]/30">
          <div className="flex items-center gap-2.5">
            <ReceiptText className="w-5 h-5 text-[#C9974D]" />
            <div>
              <p className="font-serif font-bold text-sm">Tu cuenta · Mesa {tableNumber}</p>
              <p className="text-[10px] text-[#F4E3C8]">{accountLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/15"
            aria-label="Cerrar cuenta"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
            <strong>Cuenta solicitada.</strong> El personal ya fue avisado. Revisa tu consumo antes de elegir cómo pagar.
          </div>

          <div className="rounded-2xl border border-[#E8D4BE] bg-white overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-[#F0E2D2] flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider font-bold text-[#8A624C]">Desglose</span>
              <span className="text-[10px] text-[#8A624C]">{currentOrders.length} comanda(s)</span>
            </div>

            {currentOrders.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-[#8A624C]">
                Todavía no encontramos consumos pendientes en esta sesión.
              </div>
            ) : (
              <div className="divide-y divide-[#F4E3C8]">
                {currentOrders.flatMap((order) =>
                  order.items.map((item, index) => (
                    <div key={`${order.id || order.code}-${index}`} className="px-3.5 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#2B1B13]">
                            {item.quantity}× {item.name}
                          </p>
                          {item.personLabel && (
                            <span className="inline-block mt-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-1.5 py-0.5">
                              {item.personLabel}
                            </span>
                          )}
                          {item.selectedOption && (
                            <p className="text-[10px] text-[#8A624C] mt-0.5">Opción: {item.selectedOption}</p>
                          )}
                          {item.extras && item.extras.length > 0 && (
                            <p className="text-[10px] text-[#8A624C]">Extras: {item.extras.join(', ')}</p>
                          )}
                          {item.specialInstructions && (
                            <p className="text-[10px] italic text-[#8A624C]">Nota: {item.specialInstructions}</p>
                          )}
                        </div>
                        <strong className="text-xs text-[#3A2418] shrink-0">{money(item.totalPrice)}</strong>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            <div className="px-3.5 py-3 bg-[#FFF7EA] border-t border-[#E8D4BE] flex items-center justify-between">
              <span className="font-serif font-black text-sm text-[#3A2418]">TOTAL</span>
              <strong className="font-serif font-black text-xl text-[#3A2418]">{money(subtotal)}</strong>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-bold text-[#6B4028]">¿Cómo vas a pagar?</p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPaymentMethod('EFECTIVO');
                  setMessage('El mesero ya sabe que pediste la cuenta. Puedes pagar en efectivo cuando se acerque.');
                }}
                className={`rounded-xl border px-2 py-2.5 text-[10px] font-bold flex flex-col items-center gap-1 ${paymentMethod === 'EFECTIVO' ? 'bg-[#3A2418] text-white border-[#3A2418]' : 'bg-white text-[#6B4028] border-[#DEC8AE]'}`}
              >
                <Banknote className="w-4 h-4" /> Efectivo
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentMethod('TARJETA');
                  requestTerminal();
                }}
                className={`rounded-xl border px-2 py-2.5 text-[10px] font-bold flex flex-col items-center gap-1 ${paymentMethod === 'TARJETA' ? 'bg-[#3A2418] text-white border-[#3A2418]' : 'bg-white text-[#6B4028] border-[#DEC8AE]'}`}
              >
                <CreditCard className="w-4 h-4" /> Tarjeta
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentMethod('TRANSFERENCIA');
                  setMessage('La transferencia quedará habilitada en el siguiente paso cuando configuremos la cuenta bancaria y el comprobante.');
                }}
                className={`rounded-xl border px-2 py-2.5 text-[10px] font-bold flex flex-col items-center gap-1 ${paymentMethod === 'TRANSFERENCIA' ? 'bg-[#3A2418] text-white border-[#3A2418]' : 'bg-white text-[#6B4028] border-[#DEC8AE]'}`}
              >
                <Landmark className="w-4 h-4" /> Transferencia
              </button>
            </div>
          </div>

          {paymentMethod === 'EFECTIVO' && (
            <div className="rounded-2xl bg-[#FFF7EA] border border-[#DEC8AE] p-3 text-xs text-[#6B4028]">
              Conserva este ticket en pantalla. El mesero ya recibió tu solicitud de cuenta.
            </div>
          )}

          {paymentMethod === 'TARJETA' && (
            <div className="rounded-2xl bg-sky-50 border border-sky-200 p-3 text-xs text-sky-900">
              {terminalRequested ? '✓ Terminal solicitada. El personal se acercará a tu mesa.' : busy ? 'Solicitando terminal…' : 'Toca Tarjeta para solicitar la terminal.'}
            </div>
          )}

          {paymentMethod === 'TRANSFERENCIA' && (
            <div className="rounded-2xl bg-violet-50 border border-violet-200 p-3 text-xs text-violet-900">
              <strong className="block">Transferencia</strong>
              En la siguiente fase agregaremos aquí los datos bancarios configurables y el botón para subir comprobante, sin depender del mesero.
            </div>
          )}

          {message && (
            <div className="rounded-xl border border-[#DEC8AE] bg-white px-3 py-2 text-[11px] text-[#5C3825]">
              {message}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
