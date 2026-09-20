import React, { useMemo } from 'react';
import { PublicTableOrder, TableSession } from '../../types';
import { ReceiptText, UserRound } from 'lucide-react';

interface Props {
  session: TableSession;
  orders: PublicTableOrder[];
  selectedPersonId?: string | null;
  showSelectedPersonSummary?: boolean;
}

function money(value: number): string {
  return `$${Number(value || 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function isCurrentSessionOrder(order: PublicTableOrder, session: TableSession): boolean {
  if (order.status === 'CANCELADO') return false;
  const openedAt = Date.parse(session.openedAt || '') || 0;
  const createdAt = Date.parse(order.createdAt || '') || 0;
  if (!createdAt || createdAt < openedAt) return false;
  if (order.tableSessionId && session.id && order.tableSessionId !== session.id) return false;
  return true;
}

export const TableSessionConsumption: React.FC<Props> = ({
  session,
  orders,
  selectedPersonId = null,
  showSelectedPersonSummary = true,
}) => {
  const sessionOrders = useMemo(
    () => orders.filter((order) => isCurrentSessionOrder(order, session)),
    [orders, session]
  );

  const tableTotal = sessionOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);

  const selectedPersonTotal = selectedPersonId
    ? sessionOrders.reduce(
        (sum, order) =>
          sum +
          order.items
            .filter((item) => item.personId === selectedPersonId)
            .reduce((itemSum, item) => itemSum + Number(item.totalPrice || 0), 0),
        0
      )
    : 0;

  if (sessionOrders.length === 0) {
    return (
      <div className="rounded-2xl border border-[#DEC8AE] bg-white p-5 text-center">
        <ReceiptText className="w-7 h-7 mx-auto text-[#C9974D] mb-2" />
        <h3 className="font-serif font-black text-[#2B1B13]">Aún no hay consumo registrado</h3>
        <p className="text-xs text-[#7A5A45] mt-1">En cuanto envíen una comanda aparecerá aquí.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-2xl bg-[#3A2418] text-[#FFF7EA] p-4">
          <span className="text-[10px] uppercase tracking-wider font-black text-[#C9974D]">Total de la mesa</span>
          <strong className="block text-2xl font-serif mt-1">{money(tableTotal)}</strong>
          <span className="text-[10px] text-[#F4E3C8]">{sessionOrders.length} comanda(s) en esta visita</span>
        </div>

        {showSelectedPersonSummary && selectedPersonId && (
          <div className="rounded-2xl bg-white border border-[#DEC8AE] p-4">
            <span className="text-[10px] uppercase tracking-wider font-black text-[#A86B3D] flex items-center gap-1.5">
              <UserRound className="w-3.5 h-3.5" /> Tu consumo
            </span>
            <strong className="block text-2xl font-serif text-[#2B1B13] mt-1">{money(selectedPersonTotal)}</strong>
            <span className="text-[10px] text-[#7A5A45]">Según los productos asignados a esta persona</span>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {sessionOrders.map((order, orderIndex) => (
          <div key={order.id || order.orderId} className="rounded-2xl border border-[#E8D4BE] bg-white overflow-hidden">
            <div className="px-3.5 py-3 bg-[#FFF9F0] border-b border-[#E8D4BE] flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider font-black text-[#A86B3D]">Comanda {orderIndex + 1}</div>
                <div className="text-xs font-bold text-[#2B1B13]">#{order.code}</div>
              </div>
              <strong className="font-serif text-[#2B1B13]">{money(order.total)}</strong>
            </div>

            <div className="p-3.5 space-y-2">
              {order.items.map((item, index) => (
                <div key={`${order.orderId}-${item.productId}-${index}`} className="flex justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-bold text-[#2B1B13]">{item.quantity}× {item.name}</div>
                    {item.personLabel && <div className="text-[10px] font-bold text-emerald-700 mt-0.5">👤 {item.personLabel}</div>}
                    {item.selectedSize && <div className="text-[10px] text-[#7A5A45]">Tamaño: {item.selectedSize}</div>}
                    {item.selectedOption && <div className="text-[10px] text-[#7A5A45]">Opción: {item.selectedOption}</div>}
                    {item.extras?.length ? <div className="text-[10px] text-[#7A5A45]">Extras: {item.extras.join(', ')}</div> : null}
                    {item.customizationSummary && <div className="text-[10px] text-[#7A5A45]">{item.customizationSummary}</div>}
                  </div>
                  <span className="font-bold text-[#5C3825] shrink-0">{money(item.totalPrice)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-[#FFF7EA] border border-[#DEC8AE] px-3 py-2 text-[10px] text-[#6B4028]">
        El total mostrado corresponde a las comandas activas de esta sesión. El total final puede cambiar por descuentos, propina o ajustes en caja.
      </div>
    </div>
  );
};
