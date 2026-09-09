import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, Check, Copy, CreditCard, Landmark, Loader2, ReceiptText, Upload, X } from 'lucide-react';
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
import {
  EMPTY_PAYMENT_SETTINGS,
  isTransferConfigured,
  PaymentSettings,
  subscribeToPaymentSettings,
} from '../../lib/paymentSettingsService';
import {
  createTransferPaymentIntent,
  prepareTransferReceipt,
} from '../../lib/tablePaymentIntentsService';

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
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(EMPTY_PAYMENT_SETTINGS);
  const [dismissed, setDismissed] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<CheckoutMethod>('EFECTIVO');
  const [terminalRequested, setTerminalRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptFileName, setReceiptFileName] = useState<string | null>(null);
  const [receiptDataUrl, setReceiptDataUrl] = useState<string | null>(null);
  const [transferSubmitted, setTransferSubmitted] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => subscribeToTableSession(tableNumber, setSession), [tableNumber]);
  useEffect(() => subscribeToTableOrders(tableNumber, setOrders), [tableNumber]);
  useEffect(() => subscribeToTableRequestsForTable(tableNumber, setRequests), [tableNumber]);
  useEffect(() => subscribeToPaymentSettings(setPaymentSettings), []);

  const billRequested = requests.some((request) => request.requestType === 'PEDIR_CUENTA');

  useEffect(() => {
    if (!billRequested) {
      setDismissed(false);
      setPaymentMethod('EFECTIVO');
      setTerminalRequested(false);
      setReceiptFileName(null);
      setReceiptDataUrl(null);
      setTransferSubmitted(false);
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
  const transferReady = isTransferConfigured(paymentSettings);

  const requestTerminal = async () => {
    if (terminalRequested || busy) return;
    setBusy(true);
    setMessage(null);
    try {
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

  const copyValue = async (label: string, value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(label);
      window.setTimeout(() => setCopiedField(null), 1800);
    } catch {
      setMessage(`Copia manualmente: ${value}`);
    }
  };

  const handleReceiptFile = async (file?: File) => {
    if (!file) return;
    setReceiptBusy(true);
    setMessage(null);
    try {
      const prepared = await prepareTransferReceipt(file);
      setReceiptDataUrl(prepared);
      setReceiptFileName(file.name);
      setMessage('Comprobante listo ✓ Revisa el total y envíalo para validación.');
    } catch (error: any) {
      setReceiptDataUrl(null);
      setReceiptFileName(null);
      setMessage(error?.message || 'No pudimos preparar el comprobante.');
    } finally {
      setReceiptBusy(false);
    }
  };

  const submitTransfer = async () => {
    if (!session || !receiptDataUrl || !transferReady || subtotal <= 0 || transferSubmitted) return;
    setBusy(true);
    setMessage(null);
    try {
      await createTransferPaymentIntent({
        tableNumber,
        tableSessionId: session.id || `table-${tableNumber}`,
        accountId: session.accountMode === 'SEPARADAS' ? selectedAccountId || undefined : undefined,
        accountLabel: session.accountMode === 'SEPARADAS' ? accountLabel : undefined,
        amount: subtotal,
        receiptDataUrl,
      });
      setTransferSubmitted(true);
      setMessage('Comprobante enviado ✓ Tu transferencia quedó pendiente de confirmar por Caja.');
    } catch (error: any) {
      setMessage(error?.message || 'No pudimos enviar el comprobante. Intenta otra vez.');
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
          <button type="button" onClick={() => setDismissed(true)} className="p-1.5 rounded-xl bg-white/10 hover:bg-white/15" aria-label="Cerrar cuenta">
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
              <div className="px-4 py-6 text-center text-xs text-[#8A624C]">Todavía no encontramos consumos pendientes en esta sesión.</div>
            ) : (
              <div className="divide-y divide-[#F4E3C8]">
                {currentOrders.flatMap((order) => order.items.map((item, index) => (
                  <div key={`${order.id || order.code}-${index}`} className="px-3.5 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#2B1B13]">{item.quantity}× {item.name}</p>
                        {item.personLabel && <span className="inline-block mt-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-1.5 py-0.5">{item.personLabel}</span>}
                        {item.selectedOption && <p className="text-[10px] text-[#8A624C] mt-0.5">Opción: {item.selectedOption}</p>}
                        {item.extras && item.extras.length > 0 && <p className="text-[10px] text-[#8A624C]">Extras: {item.extras.join(', ')}</p>}
                        {item.specialInstructions && <p className="text-[10px] italic text-[#8A624C]">Nota: {item.specialInstructions}</p>}
                      </div>
                      <strong className="text-xs text-[#3A2418] shrink-0">{money(item.totalPrice)}</strong>
                    </div>
                  </div>
                )))}
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
              <button type="button" onClick={() => { setPaymentMethod('EFECTIVO'); setMessage('El mesero ya sabe que pediste la cuenta. Puedes pagar en efectivo cuando se acerque.'); }} className={`rounded-xl border px-2 py-2.5 text-[10px] font-bold flex flex-col items-center gap-1 ${paymentMethod === 'EFECTIVO' ? 'bg-[#3A2418] text-white border-[#3A2418]' : 'bg-white text-[#6B4028] border-[#DEC8AE]'}`}>
                <Banknote className="w-4 h-4" /> Efectivo
              </button>
              <button type="button" onClick={() => { setPaymentMethod('TARJETA'); requestTerminal(); }} className={`rounded-xl border px-2 py-2.5 text-[10px] font-bold flex flex-col items-center gap-1 ${paymentMethod === 'TARJETA' ? 'bg-[#3A2418] text-white border-[#3A2418]' : 'bg-white text-[#6B4028] border-[#DEC8AE]'}`}>
                <CreditCard className="w-4 h-4" /> Tarjeta
              </button>
              <button type="button" onClick={() => { setPaymentMethod('TRANSFERENCIA'); setMessage(transferReady ? 'Transfiere el total exacto y sube tu comprobante.' : 'Transferencia aún no configurada por el restaurante.'); }} className={`rounded-xl border px-2 py-2.5 text-[10px] font-bold flex flex-col items-center gap-1 ${paymentMethod === 'TRANSFERENCIA' ? 'bg-[#3A2418] text-white border-[#3A2418]' : 'bg-white text-[#6B4028] border-[#DEC8AE]'}`}>
                <Landmark className="w-4 h-4" /> Transferencia
              </button>
            </div>
          </div>

          {paymentMethod === 'EFECTIVO' && (
            <div className="rounded-2xl bg-[#FFF7EA] border border-[#DEC8AE] p-3 text-xs text-[#6B4028]">Conserva este ticket en pantalla. El mesero ya recibió tu solicitud de cuenta.</div>
          )}

          {paymentMethod === 'TARJETA' && (
            <div className="rounded-2xl bg-sky-50 border border-sky-200 p-3 text-xs text-sky-900">{terminalRequested ? '✓ Terminal solicitada. El personal se acercará a tu mesa.' : busy ? 'Solicitando terminal…' : 'Toca Tarjeta para solicitar la terminal.'}</div>
          )}

          {paymentMethod === 'TRANSFERENCIA' && (
            <div className="rounded-2xl bg-violet-50 border border-violet-200 p-3 text-xs text-violet-950 space-y-3">
              {!transferReady ? (
                <div>
                  <strong className="block">Transferencia no disponible todavía</strong>
                  <p className="mt-1 text-violet-800">El restaurante aún no ha configurado una cuenta bancaria para mostrarla en el QR.</p>
                </div>
              ) : (
                <>
                  <div>
                    <strong className="block text-sm">Transfiere {money(subtotal)}</strong>
                    <p className="mt-1 text-violet-800">{paymentSettings.transferInstructions}</p>
                  </div>

                  <div className="rounded-xl bg-white border border-violet-200 overflow-hidden">
                    <div className="px-3 py-2 border-b border-violet-100"><span className="text-[9px] uppercase tracking-wider font-bold text-violet-600">Banco</span><strong className="block text-xs">{paymentSettings.bankName}</strong></div>
                    <div className="px-3 py-2 border-b border-violet-100"><span className="text-[9px] uppercase tracking-wider font-bold text-violet-600">Titular</span><strong className="block text-xs">{paymentSettings.accountHolder}</strong></div>
                    {paymentSettings.clabe && (
                      <button type="button" onClick={() => copyValue('clabe', paymentSettings.clabe)} className="w-full px-3 py-2 border-b border-violet-100 flex items-center justify-between gap-2 text-left">
                        <span><span className="block text-[9px] uppercase tracking-wider font-bold text-violet-600">CLABE</span><strong className="text-xs tracking-wide">{paymentSettings.clabe}</strong></span>
                        {copiedField === 'clabe' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-violet-600" />}
                      </button>
                    )}
                    {paymentSettings.accountNumber && (
                      <button type="button" onClick={() => copyValue('cuenta', paymentSettings.accountNumber)} className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left">
                        <span><span className="block text-[9px] uppercase tracking-wider font-bold text-violet-600">Cuenta</span><strong className="text-xs tracking-wide">{paymentSettings.accountNumber}</strong></span>
                        {copiedField === 'cuenta' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-violet-600" />}
                      </button>
                    )}
                  </div>

                  {!transferSubmitted ? (
                    <>
                      <label className="block rounded-xl border border-dashed border-violet-300 bg-white px-3 py-3 text-center cursor-pointer">
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={receiptBusy || busy} onChange={(event) => handleReceiptFile(event.target.files?.[0])} />
                        <span className="flex items-center justify-center gap-2 font-bold text-violet-800">
                          {receiptBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                          {receiptBusy ? 'Preparando comprobante…' : receiptFileName ? 'Cambiar comprobante' : 'Subir comprobante'}
                        </span>
                        {receiptFileName && <span className="block mt-1 text-[10px] text-violet-600 truncate">{receiptFileName}</span>}
                      </label>

                      {receiptDataUrl && (
                        <div className="rounded-xl bg-white border border-violet-200 p-2 flex items-center gap-3">
                          <img src={receiptDataUrl} alt="Vista previa del comprobante" className="w-14 h-14 object-cover rounded-lg border border-violet-100" />
                          <div className="min-w-0"><strong className="block text-[11px]">Comprobante listo</strong><span className="text-[10px] text-violet-700">Se enviará para validación de Caja.</span></div>
                        </div>
                      )}

                      <button type="button" onClick={submitTransfer} disabled={!receiptDataUrl || busy || subtotal <= 0} className="w-full rounded-xl bg-violet-700 hover:bg-violet-800 disabled:opacity-40 text-white py-2.5 text-xs font-bold flex items-center justify-center gap-2">
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        {busy ? 'Enviando…' : `Enviar comprobante · ${money(subtotal)}`}
                      </button>
                    </>
                  ) : (
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-emerald-900">
                      <strong className="block">✓ Comprobante recibido</strong>
                      <span className="text-[10px]">Pago pendiente de confirmar por Caja. No cierres la mesa hasta que el personal confirme el pago.</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {message && <div className="rounded-xl border border-[#DEC8AE] bg-white px-3 py-2 text-[11px] text-[#5C3825]">{message}</div>}
        </div>
      </section>
    </div>
  );
};
