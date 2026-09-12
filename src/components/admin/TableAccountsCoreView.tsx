import React, { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Landmark,
  Loader2,
  ReceiptText,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';
import {
  RestaurantOrder,
  StaffUser,
  TablePayment,
  TablePaymentMethod,
  TableRecord,
  TableServiceRequest,
  TableSession,
} from '../../types';
import { subscribeToRestaurantOrders } from '../../lib/ordersService';
import {
  initTablesRealtimeSync,
  setTableStatus,
  subscribeToTables,
} from '../../lib/tablesService';
import {
  clearAllPendingRequestsForTable,
  subscribeToPendingTableRequests,
} from '../../lib/tableRequestsService';
import {
  CheckoutPaymentMethod,
  PaymentBreakdownItem,
  settleTableAccount,
  subscribeToTablePayments,
} from '../../lib/paymentsService';
import { subscribeToTableSession } from '../../lib/tableSessionsService';
import { addActivityLog } from '../../lib/adminStorage';

interface TableAccountsViewProps {
  currentUser: StaffUser;
}

const OPERATIONAL_TABLE_NUMBERS = [1, 2, 4, 5, 6, 7, 8, 9] as const;

const METHODS: Array<{
  id: TablePaymentMethod;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'EFECTIVO', label: 'Efectivo', icon: Banknote },
  { id: 'TARJETA', label: 'Tarjeta', icon: CreditCard },
  { id: 'TRANSFERENCIA', label: 'Transferencia', icon: Landmark },
];

function money(value: number): string {
  return `$${Number(value || 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function paymentAmountByMethod(payment: TablePayment, method: TablePaymentMethod): number {
  if (payment.paymentMethod === method) return Number(payment.total || 0);
  if (payment.paymentMethod !== 'MIXTO') return 0;
  return (payment.paymentBreakdown || [])
    .filter((item) => item.method === method)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function getUnpaidOrdersForTable(
  orders: RestaurantOrder[],
  tableNumber: number,
  session?: TableSession | null
): RestaurantOrder[] {
  if (!session || session.status === 'CERRADA') return [];

  const openedAt = Date.parse(session.openedAt || '');
  if (!openedAt) return [];

  return orders.filter((order) => {
    if (
      order.orderType !== 'dine_in' ||
      order.tableNumber !== tableNumber ||
      order.status === 'CANCELADO' ||
      order.billingStatus === 'PAGADO'
    ) {
      return false;
    }

    const createdAt = Date.parse(order.createdAt || '');
    return Boolean(createdAt && createdAt >= openedAt);
  });
}

function orderAccountId(order: RestaurantOrder): string {
  return order.accountId || 'general';
}

function orderAccountLabel(order: RestaurantOrder): string {
  if (order.accountLabel) return order.accountLabel;
  return orderAccountId(order) === 'general' ? 'Cuenta general' : orderAccountId(order);
}

export const TableAccountsView: React.FC<TableAccountsViewProps> = ({ currentUser }) => {
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [tables, setTables] = useState<TableRecord[]>([]);
  const [sessionsByNumber, setSessionsByNumber] = useState<Record<number, TableSession | null>>({});
  const [payments, setPayments] = useState<TablePayment[]>([]);
  const [requests, setRequests] = useState<TableServiceRequest[]>([]);
  const [selectedTable, setSelectedTable] = useState<TableRecord | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');
  const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>('EFECTIVO');
  const [discountAmount, setDiscountAmount] = useState('0');
  const [tipAmount, setTipAmount] = useState('0');
  const [cashReceived, setCashReceived] = useState('');
  const [mixedTransferAmount, setMixedTransferAmount] = useState('');
  const [mixedCardAmount, setMixedCardAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const stopTablesSync = initTablesRealtimeSync();
    const unsubTables = subscribeToTables(setTables);
    const sessionUnsubs = OPERATIONAL_TABLE_NUMBERS.map((tableNumber) =>
      subscribeToTableSession(tableNumber, (session) => {
        setSessionsByNumber((prev) => ({ ...prev, [tableNumber]: session }));
      })
    );
    const unsubOrders = subscribeToRestaurantOrders(setOrders);
    const unsubPayments = subscribeToTablePayments(setPayments);
    const unsubRequests = subscribeToPendingTableRequests(setRequests);

    return () => {
      stopTablesSync();
      unsubTables();
      sessionUnsubs.forEach((unsubscribe) => unsubscribe());
      unsubOrders();
      unsubPayments();
      unsubRequests();
    };
  }, []);

  const operationalTables = useMemo(
    () => tables.filter((t) => t.tableNumber !== 3).sort((a, b) => a.tableNumber - b.tableNumber),
    [tables]
  );

  const todayPayments = useMemo(() => payments.filter((p) => p.status === 'PAGADO' && isToday(p.createdAt)), [payments]);
  const todayTotal = todayPayments.reduce((sum, p) => sum + p.total, 0);
  const todayCash = todayPayments.reduce((sum, p) => sum + paymentAmountByMethod(p, 'EFECTIVO'), 0);
  const todayCard = todayPayments.reduce((sum, p) => sum + paymentAmountByMethod(p, 'TARJETA'), 0);
  const todayTransfer = todayPayments.reduce((sum, p) => sum + paymentAmountByMethod(p, 'TRANSFERENCIA'), 0);

  const selectedAllOrders = selectedTable
    ? getUnpaidOrdersForTable(
        orders,
        selectedTable.tableNumber,
        sessionsByNumber[selectedTable.tableNumber]
      )
    : [];
  const selectedAccountGroups = Array.from(
    selectedAllOrders.reduce((map, order) => {
      const id = orderAccountId(order);
      if (!map.has(id)) {
        map.set(id, { id, label: orderAccountLabel(order), total: 0, count: 0 });
      }
      const group = map.get(id)!;
      group.total += Number(order.total || 0);
      group.count += 1;
      return map;
    }, new Map<string, { id: string; label: string; total: number; count: number }>()).values()
  );
  const selectedOrders = selectedAccountId === 'ALL'
    ? selectedAllOrders
    : selectedAllOrders.filter((order) => orderAccountId(order) === selectedAccountId);
  const selectedAccountLabel = selectedAccountId === 'ALL'
    ? 'Mesa completa'
    : selectedAccountGroups.find((group) => group.id === selectedAccountId)?.label || 'Cuenta';
  const selectedSubtotal = selectedOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const selectedDiscount = Math.max(0, Math.min(Number(discountAmount || 0), selectedSubtotal));
  const selectedTip = Math.max(0, Number(tipAmount || 0));
  const selectedTotal = Math.max(0, selectedSubtotal - selectedDiscount + selectedTip);
  const mixedTransfer = Math.max(0, Number(mixedTransferAmount || 0));
  const mixedCard = Math.max(0, Number(mixedCardAmount || 0));
  const mixedDigitalTotal = mixedTransfer + mixedCard;
  const mixedCash = Math.max(0, selectedTotal - mixedDigitalTotal);
  const mixedOverage = Math.max(0, mixedDigitalTotal - selectedTotal);
  const mixedMethodCount =
    (mixedTransfer > 0 ? 1 : 0) +
    (mixedCard > 0 ? 1 : 0) +
    (mixedCash > 0 ? 1 : 0);
  const mixedIsValid = mixedOverage <= 0.009 && mixedMethodCount >= 2;
  const changeDue = paymentMethod === 'EFECTIVO'
    ? Math.max(0, Number(cashReceived || 0) - selectedTotal)
    : 0;

  const resetMixedPayment = () => {
    setMixedTransferAmount('');
    setMixedCardAmount('');
  };

  const openCheckout = (table: TableRecord) => {
    const tableOrders = getUnpaidOrdersForTable(
      orders,
      table.tableNumber,
      sessionsByNumber[table.tableNumber]
    );
    const accountIds = Array.from(new Set(tableOrders.map(orderAccountId)));
    setSelectedTable(table);
    setSelectedAccountId(accountIds.length > 1 ? accountIds[0] : 'ALL');
    setPaymentMethod('EFECTIVO');
    setDiscountAmount('0');
    setTipAmount('0');
    setCashReceived('');
    resetMixedPayment();
    setError(null);
    setSuccess(null);
  };

  const closeCheckout = () => {
    if (busy) return;
    setSelectedTable(null);
    setSelectedAccountId('ALL');
    setError(null);
  };

  const markAsBill = async (table: TableRecord) => {
    setError(null);
    try {
      await setTableStatus(table.tableId, 'CUENTA', { id: currentUser.id, name: currentUser.name });
    } catch (err: any) {
      setError(err?.message || 'No se pudo marcar la mesa como cuenta.');
    }
  };

  const handleCharge = async () => {
    if (!selectedTable || selectedOrders.length === 0) return;
    if (paymentMethod === 'EFECTIVO' && Number(cashReceived || 0) < selectedTotal) {
      setError('El efectivo recibido es menor al total a cobrar.');
      return;
    }

    let paymentBreakdown: PaymentBreakdownItem[] | undefined;
    if (paymentMethod === 'MIXTO') {
      if (mixedOverage > 0.009) {
        setError(`La suma de transferencia y tarjeta excede el total por ${money(mixedOverage)}.`);
        return;
      }
      paymentBreakdown = [
        ...(mixedTransfer > 0 ? [{ method: 'TRANSFERENCIA' as TablePaymentMethod, amount: mixedTransfer }] : []),
        ...(mixedCard > 0 ? [{ method: 'TARJETA' as TablePaymentMethod, amount: mixedCard }] : []),
        ...(mixedCash > 0 ? [{ method: 'EFECTIVO' as TablePaymentMethod, amount: mixedCash }] : []),
      ];
      if (paymentBreakdown.length < 2) {
        setError('Para pago mixto combina al menos dos métodos. Captura una parte por transferencia o tarjeta y el resto se calculará en efectivo.');
        return;
      }
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const payment = await settleTableAccount({
        tableNumber: selectedTable.tableNumber,
        tableSessionId: selectedOrders[0]?.tableSessionId,
        accountId: selectedAccountId === 'ALL' ? undefined : selectedAccountId,
        accountLabel: selectedAccountId === 'ALL' ? undefined : selectedAccountLabel,
        orders: selectedOrders,
        paymentMethod,
        paymentBreakdown,
        discountAmount: selectedDiscount,
        tipAmount: selectedTip,
        cashReceived: paymentMethod === 'EFECTIVO' ? Number(cashReceived || 0) : undefined,
        user: currentUser,
      });

      const paidIds = new Set(selectedOrders.map((order) => order.id).filter(Boolean));
      const remainingOrders = selectedAllOrders.filter((order) => !order.id || !paidIds.has(order.id));
      try {
        if (remainingOrders.length === 0) {
          await setTableStatus(selectedTable.tableId, 'LIMPIEZA', {
            id: currentUser.id,
            name: currentUser.name,
          });
          await clearAllPendingRequestsForTable(selectedTable.tableNumber, {
            id: currentUser.id,
            name: currentUser.name,
          });
        } else {
          await setTableStatus(selectedTable.tableId, 'OCUPADA', {
            id: currentUser.id,
            name: currentUser.name,
          });
        }
      } catch (tableErr) {
        console.warn('[TableAccountsView] pago guardado, no se pudo cambiar estado de mesa:', tableErr);
      }

      const mixedDetails = paymentMethod === 'MIXTO' && paymentBreakdown
        ? ` · ${paymentBreakdown.map((part) => `${part.method} ${money(part.amount)}`).join(' + ')}`
        : '';
      addActivityLog({
        userName: currentUser.name,
        userId: currentUser.id,
        userRole: currentUser.role,
        action: `${currentUser.name} cobró Mesa ${selectedTable.tableNumber} · ${selectedAccountLabel}: ${money(payment.total)} (${payment.paymentMethod})`,
        category: 'turno',
        details: `Folio ${payment.code}. Subtotal ${money(payment.subtotal)} · Descuento ${money(payment.discountAmount)} · Propina ${money(payment.tipAmount)}${mixedDetails}`,
      });

      setSuccess(
        paymentMethod === 'MIXTO'
          ? `Pago mixto registrado · ${selectedAccountLabel} · ${payment.code}`
          : payment.paymentMethod === 'EFECTIVO'
          ? `Pago registrado · ${selectedAccountLabel} · Cambio: ${money(payment.changeDue)}`
          : `Pago registrado · ${selectedAccountLabel} · ${payment.code}`
      );

      window.setTimeout(() => {
        setSelectedTable(null);
        setSelectedAccountId('ALL');
        setSuccess(null);
      }, 1600);
    } catch (err: any) {
      setError(err?.message || 'No se pudo registrar el cobro. Revisa Firebase y vuelve a intentar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 pb-20">
      <div className="bg-[#3A2418] text-[#FFF7EA] rounded-3xl p-5 sm:p-6 border border-[#C9974D]/30 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-[#C9974D] text-[11px] font-bold uppercase tracking-wider mb-1">
              <ReceiptText className="w-4 h-4" /> POS · Cuenta por mesa
            </div>
            <h2 className="text-2xl sm:text-3xl font-serif font-bold">Caja & Cobro</h2>
            <p className="text-xs sm:text-sm text-[#F4E3C8]/80 mt-1">
              Los pedidos de cada mesa se acumulan automáticamente hasta que Caja registra el pago.
            </p>
          </div>
          <div className="rounded-2xl bg-[#4A2E1F] border border-[#C9974D]/30 px-4 py-3 min-w-[180px]">
            <span className="text-[10px] uppercase tracking-wider text-[#C9974D] font-bold">Cobrado hoy</span>
            <strong className="block text-2xl font-serif mt-0.5">{money(todayTotal)}</strong>
            <span className="text-[10px] text-[#F4E3C8]/70">{todayPayments.length} pago(s)</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-[#F4E3C8] p-4">
          <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-700">Efectivo</span>
          <strong className="block text-xl font-serif text-[#2B1B13] mt-1">{money(todayCash)}</strong>
        </div>
        <div className="bg-white rounded-2xl border border-[#F4E3C8] p-4">
          <span className="text-[10px] uppercase tracking-wider font-bold text-sky-700">Tarjeta</span>
          <strong className="block text-xl font-serif text-[#2B1B13] mt-1">{money(todayCard)}</strong>
        </div>
        <div className="bg-white rounded-2xl border border-[#F4E3C8] p-4">
          <span className="text-[10px] uppercase tracking-wider font-bold text-violet-700">Transferencia</span>
          <strong className="block text-xl font-serif text-[#2B1B13] mt-1">{money(todayTransfer)}</strong>
        </div>
      </div>

      {error && !selectedTable && (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {operationalTables.map((table) => {
          const tableOrders = getUnpaidOrdersForTable(
            orders,
            table.tableNumber,
            sessionsByNumber[table.tableNumber]
          );
          const tableTotal = tableOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
          const billRequested = table.needsBill || requests.some(
            (r) => r.tableNumber === table.tableNumber && r.requestType === 'PEDIR_CUENTA' && r.status === 'PENDIENTE'
          );

          return (
            <div
              key={table.tableId}
              className={`rounded-3xl border p-4 bg-white shadow-xs ${
                billRequested ? 'border-amber-400 ring-2 ring-amber-100' : 'border-[#F4E3C8]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[10px] uppercase tracking-wider font-bold text-[#A86B3D]">Mesa</span>
                  <h3 className="font-serif font-black text-2xl text-[#2B1B13]">{table.tableNumber}</h3>
                </div>
                <span className={`px-2 py-1 rounded-full text-[9px] font-bold border ${
                  table.status === 'OCUPADA'
                    ? 'bg-rose-50 border-rose-200 text-rose-700'
                    : table.status === 'CUENTA'
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : table.status === 'LIMPIEZA'
                    ? 'bg-violet-50 border-violet-200 text-violet-700'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                }`}>
                  {table.status}
                </span>
              </div>

              {billRequested && (
                <div className="mt-3 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-bold flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5" /> Cuenta solicitada
                </div>
              )}

              <div className="mt-4 rounded-2xl bg-[#FFF7EA] border border-[#F4E3C8] p-3">
                <span className="text-[10px] uppercase tracking-wider text-[#A86B3D] font-bold">Consumo pendiente</span>
                <strong className="block text-2xl font-serif text-[#2B1B13] mt-1">{money(tableTotal)}</strong>
                <span className="text-[10px] text-[#6B4028]">{tableOrders.length} comanda(s)</span>
              </div>

              <div className="mt-3 text-[11px] text-[#6B4028] min-h-[32px]">
                {table.waiterName ? `Mesero: ${table.waiterName}` : 'Sin mesero asignado'}
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3">
                <button
                  onClick={() => markAsBill(table)}
                  disabled={table.status === 'CUENTA' || tableTotal <= 0}
                  className="px-3 py-2.5 rounded-xl border border-[#F4E3C8] text-[#6B4028] text-[11px] font-bold disabled:opacity-40"
                >
                  Marcar cuenta
                </button>
                <button
                  onClick={() => openCheckout(table)}
                  disabled={tableTotal <= 0}
                  className="px-3 py-2.5 rounded-xl bg-[#3A2418] text-[#FFF7EA] text-[11px] font-bold disabled:opacity-40"
                >
                  Cobrar
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {selectedTable && (
        <div className="fixed inset-0 z-[100] bg-black/55 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-[#FFF7EA] w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-[#F4E3C8] shadow-2xl">
            <div className="sticky top-0 bg-[#3A2418] text-[#FFF7EA] px-5 py-4 flex items-center justify-between z-10">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[#C9974D] font-bold">Cobro de mesa</span>
                <h3 className="font-serif font-bold text-xl">Mesa {selectedTable.tableNumber}</h3>
              </div>
              <button onClick={closeCheckout} className="p-2 rounded-xl bg-[#4A2E1F]" aria-label="Cerrar">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {selectedAccountGroups.length > 1 && (
                <div className="rounded-2xl bg-white border border-[#F4E3C8] p-3">
                  <span className="text-[10px] uppercase tracking-wider text-[#A86B3D] font-bold">¿Qué cuenta vas a cobrar?</span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setSelectedAccountId('ALL')}
                      className={`px-3 py-2 rounded-xl border text-[11px] font-bold ${
                        selectedAccountId === 'ALL'
                          ? 'bg-[#3A2418] border-[#3A2418] text-[#FFF7EA]'
                          : 'bg-[#FFF7EA] border-[#DEC8AE] text-[#5C3825]'
                      }`}
                    >
                      Mesa completa · {money(selectedAllOrders.reduce((sum, order) => sum + Number(order.total || 0), 0))}
                    </button>
                    {selectedAccountGroups.map((group) => (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => setSelectedAccountId(group.id)}
                        className={`px-3 py-2 rounded-xl border text-[11px] font-bold ${
                          selectedAccountId === group.id
                            ? 'bg-[#3A2418] border-[#3A2418] text-[#FFF7EA]'
                            : 'bg-[#FFF7EA] border-[#DEC8AE] text-[#5C3825]'
                        }`}
                      >
                        {group.label} · {money(group.total)}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-[#8A624C] mt-2">Cobrar una cuenta no cierra la mesa mientras existan otras cuentas pendientes.</p>
                </div>
              )}

              <div className="space-y-3">
                {selectedOrders.map((order) => (
                  <div key={order.id || order.code} className="bg-white rounded-2xl border border-[#F4E3C8] p-4">
                    <div className="flex justify-between gap-3 mb-2">
                      <div>
                        <span className="text-[10px] text-[#A86B3D] font-bold">{order.code}</span>
                        <div className="text-xs font-bold text-[#2B1B13]">{order.customerName}</div>
                        {order.accountLabel && (
                          <div className="text-[10px] font-bold text-[#A86B3D]">{order.accountLabel}</div>
                        )}
                      </div>
                      <strong className="font-serif text-[#2B1B13]">{money(order.total)}</strong>
                    </div>
                    <div className="space-y-1">
                      {order.items.map((item, idx) => (
                        <div key={`${order.id}-${item.productId}-${idx}`} className="flex justify-between gap-3 text-[11px] text-[#6B4028]">
                          <span>
                            {item.quantity}× {item.name}
                            {item.personLabel && <span className="block text-[10px] font-bold text-emerald-700">👤 {item.personLabel}</span>}
                          </span>
                          <span>{money(item.totalPrice)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <span className="text-[10px] uppercase tracking-wider text-[#A86B3D] font-bold">Método de pago</span>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {METHODS.map((method) => {
                    const Icon = method.icon;
                    const active = paymentMethod === method.id;
                    return (
                      <button
                        key={method.id}
                        onClick={() => {
                          setPaymentMethod(method.id);
                          setError(null);
                        }}
                        className={`min-h-[54px] p-3 rounded-2xl border text-left flex items-center gap-2 text-xs font-bold ${
                          active
                            ? 'bg-[#3A2418] border-[#3A2418] text-[#FFF7EA]'
                            : 'bg-white border-[#F4E3C8] text-[#6B4028]'
                        }`}
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#C9974D]' : 'text-[#A86B3D]'}`} />
                        {method.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod('MIXTO');
                      setCashReceived('');
                      setError(null);
                    }}
                    className={`min-h-[54px] p-3 rounded-2xl border text-left flex items-center gap-2 text-xs font-bold ${
                      paymentMethod === 'MIXTO'
                        ? 'bg-[#3A2418] border-[#3A2418] text-[#FFF7EA]'
                        : 'bg-white border-[#F4E3C8] text-[#6B4028]'
                    }`}
                  >
                    <Wallet className={`w-4 h-4 shrink-0 ${paymentMethod === 'MIXTO' ? 'text-[#C9974D]' : 'text-[#A86B3D]'}`} />
                    <span className="min-w-0">
                      <span className="block">Pago mixto</span>
                      <span className={`block text-[9px] font-medium mt-0.5 ${paymentMethod === 'MIXTO' ? 'text-[#F4E3C8]' : 'text-[#8A624C]'}`}>
                        Combinar métodos
                      </span>
                    </span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-bold text-[#6B4028]">
                  Descuento $
                  <input
                    type="number"
                    min="0"
                    max={selectedSubtotal}
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl border border-[#F4E3C8] bg-white outline-none"
                  />
                </label>
                <label className="text-xs font-bold text-[#6B4028]">
                  Propina $
                  <input
                    type="number"
                    min="0"
                    value={tipAmount}
                    onChange={(e) => setTipAmount(e.target.value)}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl border border-[#F4E3C8] bg-white outline-none"
                  />
                </label>
              </div>

              {paymentMethod === 'EFECTIVO' && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-bold text-[#6B4028]">
                    Recibido $
                    <input
                      type="number"
                      min="0"
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      className="mt-1 w-full px-3 py-2.5 rounded-xl border border-[#F4E3C8] bg-white outline-none"
                      placeholder={selectedTotal.toFixed(2)}
                    />
                  </label>
                  <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3 flex flex-col justify-center">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-700">Cambio</span>
                    <strong className="font-serif text-xl text-emerald-900">{money(changeDue)}</strong>
                  </div>
                </div>
              )}

              {paymentMethod === 'MIXTO' && (
                <div className="rounded-3xl border border-[#DEC8AE] bg-white p-4 space-y-4 shadow-xs">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-[#3A2418]">
                        <Wallet className="w-4 h-4 text-[#A86B3D]" />
                        <span className="text-xs font-black">Distribuir pago</span>
                      </div>
                      <p className="text-[10px] text-[#8A624C] mt-1">
                        Escribe lo que pagarán por transferencia o tarjeta. El efectivo restante se calcula solo.
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[#FFF7EA] border border-[#F4E3C8] px-2.5 py-1 text-[10px] font-bold text-[#6B4028]">
                      Total {money(selectedTotal)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="rounded-2xl border border-violet-200 bg-violet-50/60 p-3 text-[11px] font-bold text-violet-900">
                      <span className="flex items-center gap-1.5">
                        <Landmark className="w-3.5 h-3.5" /> Transferencia
                      </span>
                      <div className="relative mt-2">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-violet-700">$</span>
                        <input
                          type="number"
                          min="0"
                          max={selectedTotal}
                          step="0.01"
                          value={mixedTransferAmount}
                          onChange={(e) => setMixedTransferAmount(e.target.value)}
                          className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-violet-200 bg-white outline-none text-[#2B1B13]"
                          placeholder="0.00"
                        />
                      </div>
                    </label>

                    <label className="rounded-2xl border border-sky-200 bg-sky-50/60 p-3 text-[11px] font-bold text-sky-900">
                      <span className="flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5" /> Tarjeta
                      </span>
                      <div className="relative mt-2">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-700">$</span>
                        <input
                          type="number"
                          min="0"
                          max={selectedTotal}
                          step="0.01"
                          value={mixedCardAmount}
                          onChange={(e) => setMixedCardAmount(e.target.value)}
                          className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-sky-200 bg-white outline-none text-[#2B1B13]"
                          placeholder="0.00"
                        />
                      </div>
                    </label>
                  </div>

                  <div className={`rounded-2xl border p-3 ${
                    mixedOverage > 0
                      ? 'bg-rose-50 border-rose-200'
                      : mixedIsValid
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-[#FFF7EA] border-[#F4E3C8]'
                  }`}>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <span className="block text-[9px] uppercase tracking-wider font-bold text-[#8A624C]">Transferencia</span>
                        <strong className="block mt-1 text-sm font-serif text-[#3A2418]">{money(mixedTransfer)}</strong>
                      </div>
                      <div className="border-x border-[#DEC8AE]/70 px-2">
                        <span className="block text-[9px] uppercase tracking-wider font-bold text-[#8A624C]">Tarjeta</span>
                        <strong className="block mt-1 text-sm font-serif text-[#3A2418]">{money(mixedCard)}</strong>
                      </div>
                      <div>
                        <span className="block text-[9px] uppercase tracking-wider font-bold text-[#8A624C]">Efectivo</span>
                        <strong className={`block mt-1 text-sm font-serif ${mixedOverage > 0 ? 'text-rose-800' : 'text-emerald-900'}`}>
                          {money(mixedCash)}
                        </strong>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-current/10 flex items-center justify-between gap-3">
                      <div>
                        <span className={`block text-[10px] uppercase tracking-wider font-black ${
                          mixedOverage > 0
                            ? 'text-rose-700'
                            : mixedIsValid
                            ? 'text-emerald-700'
                            : 'text-[#A86B3D]'
                        }`}>
                          {mixedOverage > 0
                            ? 'Exceso capturado'
                            : mixedIsValid
                            ? 'Listo para cobrar'
                            : 'Combina al menos 2 métodos'}
                        </span>
                        <span className={`block text-[10px] mt-0.5 ${
                          mixedOverage > 0
                            ? 'text-rose-800'
                            : mixedIsValid
                            ? 'text-emerald-800'
                            : 'text-[#8A624C]'
                        }`}>
                          {mixedOverage > 0
                            ? 'Reduce transferencia o tarjeta.'
                            : mixedIsValid
                            ? `La cuenta queda cubierta por ${money(selectedTotal)}.`
                            : 'Ejemplo: transferencia + efectivo.'}
                        </span>
                      </div>
                      <strong className={`font-serif text-xl ${
                        mixedOverage > 0 ? 'text-rose-900' : mixedIsValid ? 'text-emerald-900' : 'text-[#3A2418]'
                      }`}>
                        {mixedOverage > 0 ? money(mixedOverage) : money(mixedCash)}
                      </strong>
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-3xl bg-white border border-[#F4E3C8] p-4 space-y-2">
                <div className="flex justify-between text-xs text-[#6B4028]"><span>Subtotal</span><span>{money(selectedSubtotal)}</span></div>
                <div className="flex justify-between text-xs text-[#6B4028]"><span>Descuento</span><span>-{money(selectedDiscount)}</span></div>
                <div className="flex justify-between text-xs text-[#6B4028]"><span>Propina</span><span>+{money(selectedTip)}</span></div>
                <div className="border-t border-[#F4E3C8] pt-2 flex justify-between items-center">
                  <span className="font-serif font-bold text-lg">Total</span>
                  <strong className="font-serif text-2xl text-[#2B1B13]">{money(selectedTotal)}</strong>
                </div>
              </div>

              {error && (
                <div className="rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 text-sm">{error}</div>
              )}
              {success && (
                <div className="rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> {success}
                </div>
              )}

              <button
                onClick={handleCharge}
                disabled={
                  busy ||
                  selectedOrders.length === 0 ||
                  (paymentMethod === 'MIXTO' && !mixedIsValid)
                }
                className="w-full py-4 rounded-2xl bg-[#3A2418] text-[#FFF7EA] font-serif font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wallet className="w-5 h-5 text-[#C9974D]" />}
                {busy
                  ? 'Registrando cobro…'
                  : paymentMethod === 'MIXTO'
                  ? `Confirmar cobro mixto · ${money(selectedTotal)}`
                  : `Confirmar cobro · ${money(selectedTotal)}`}
              </button>

              <p className="text-[10px] text-center text-[#8A624C]">
                Las comandas cobradas quedan marcadas como pagadas. La mesa pasa a LIMPIEZA sólo al terminar todas sus cuentas.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};