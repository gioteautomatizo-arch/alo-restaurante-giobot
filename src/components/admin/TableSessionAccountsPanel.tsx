import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, ReceiptText, Users } from 'lucide-react';
import { RestaurantOrder, StaffUser, TableRecord, TableSession } from '../../types';
import {
  ensureStaffTableSession,
  getSessionPersons,
  setTableSessionAccountModeByStaff,
  subscribeToTableSession,
} from '../../lib/tableSessionsService';
import { subscribeToTableOrders } from '../../lib/ordersService';

interface TableSessionAccountsPanelProps {
  table: TableRecord;
  currentUser: StaffUser;
}

function orderSourceLabel(order: RestaurantOrder): string {
  if (order.orderSource === 'CLIENTE_QR') return 'Cliente QR';
  if (order.orderSource === 'MESERO') return order.capturedByName ? `Mesero · ${order.capturedByName}` : 'Mesero';
  if (order.orderSource === 'CAJA') return order.capturedByName ? `Caja · ${order.capturedByName}` : 'Caja';
  return 'Pedido de mesa';
}

function orderStatusLabel(order: RestaurantOrder): string {
  switch (order.status) {
    case 'NUEVO':
      return 'Nuevo';
    case 'PREPARANDO':
      return 'Preparando';
    case 'LISTO':
      return 'Listo';
    case 'ENTREGADO':
      return 'Entregado';
    case 'CANCELADO':
      return 'Cancelado';
    default:
      return order.status;
  }
}

function orderStatusClass(order: RestaurantOrder): string {
  switch (order.status) {
    case 'NUEVO':
      return 'bg-rose-50 border-rose-200 text-rose-700';
    case 'PREPARANDO':
      return 'bg-amber-50 border-amber-200 text-amber-800';
    case 'LISTO':
      return 'bg-emerald-50 border-emerald-200 text-emerald-700';
    case 'ENTREGADO':
      return 'bg-slate-50 border-slate-200 text-slate-700';
    case 'CANCELADO':
      return 'bg-zinc-100 border-zinc-200 text-zinc-500';
    default:
      return 'bg-white border-[#DEC8AE] text-[#6B4028]';
  }
}

function formatOrderTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('es-MX', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export const TableSessionAccountsPanel: React.FC<TableSessionAccountsPanelProps> = ({
  table,
  currentUser,
}) => {
  const [session, setSession] = useState<TableSession | null>(null);
  const [tableOrders, setTableOrders] = useState<RestaurantOrder[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToTableSession(table.tableNumber, setSession);

    if ((table.status === 'OCUPADA' || table.status === 'CUENTA') && !session) {
      ensureStaffTableSession(table.tableNumber, Math.max(1, table.guestCount || 1), {
        id: currentUser.id,
        name: currentUser.name,
      }).catch((err) => {
        console.warn('[TableSessionAccountsPanel] no se pudo garantizar sesión:', err);
      });
    }

    return unsubscribe;
  }, [table.tableNumber, table.status, table.guestCount, currentUser.id, currentUser.name]);

  useEffect(() => {
    if (table.status !== 'OCUPADA' && table.status !== 'CUENTA') {
      setTableOrders([]);
      return;
    }

    return subscribeToTableOrders(table.tableNumber, setTableOrders);
  }, [table.tableNumber, table.status]);

  const currentSessionOrders = useMemo(() => {
    if (!session?.openedAt) return tableOrders;

    const openedAt = Date.parse(session.openedAt);
    if (!openedAt) return tableOrders;

    // El documento de sesión usa un ID estable por mesa, así que el corte correcto
    // entre servicios es la hora de apertura de la sesión actual.
    return tableOrders.filter((order) => {
      const createdAt = Date.parse(order.createdAt || '');
      return !createdAt || createdAt >= openedAt;
    });
  }, [tableOrders, session?.openedAt]);

  const changeMode = async (mode: 'GENERAL' | 'SEPARADAS') => {
    setBusy(true);
    setError(null);
    try {
      await setTableSessionAccountModeByStaff(
        table.tableNumber,
        mode,
        Math.max(1, table.guestCount || 1),
        { id: currentUser.id, name: currentUser.name }
      );
    } catch (err: any) {
      setError(err?.message || 'No se pudo cambiar el tipo de cuenta.');
    } finally {
      setBusy(false);
    }
  };

  const openWaiterOrder = async () => {
    setBusy(true);
    setError(null);
    try {
      await ensureStaffTableSession(table.tableNumber, Math.max(1, table.guestCount || 1), {
        id: currentUser.id,
        name: currentUser.name,
      });
      const url = new URL(window.location.href);
      url.search = '';
      url.searchParams.set('table', String(table.tableNumber));
      url.searchParams.set('staffOrder', '1');
      window.open(url.toString(), '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      setError(err?.message || 'No se pudo abrir la captura de pedido.');
    } finally {
      setBusy(false);
    }
  };

  if (table.status !== 'OCUPADA' && table.status !== 'CUENTA') return null;

  return (
    <div className="bg-white p-4 rounded-2xl border border-[#DEC8AE] space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#5C3825] flex items-center gap-1.5">
            <ReceiptText className="w-4 h-4 text-[#C9974D]" /> Cuentas de la mesa
          </span>
          <p className="text-[11px] text-[#8A624C] mt-1">
            Una sola mesa y una sola cola de comandas; las cuentas pueden separarse al cobrar.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => changeMode('GENERAL')}
          className={`px-3 py-2.5 rounded-xl border text-xs font-bold ${
            !session || session.accountMode === 'GENERAL'
              ? 'bg-[#3A2418] border-[#3A2418] text-[#FFF7EA]'
              : 'bg-[#FFF7EA] border-[#DEC8AE] text-[#5C3825]'
          } disabled:opacity-60`}
        >
          Cuenta general
        </button>
        <button
          type="button"
          disabled={busy || (table.guestCount || 1) < 2}
          onClick={() => changeMode('SEPARADAS')}
          className={`px-3 py-2.5 rounded-xl border text-xs font-bold ${
            session?.accountMode === 'SEPARADAS'
              ? 'bg-[#3A2418] border-[#3A2418] text-[#FFF7EA]'
              : 'bg-[#FFF7EA] border-[#DEC8AE] text-[#5C3825]'
          } disabled:opacity-40`}
        >
          Cuentas separadas
        </button>
      </div>

      {session && (
        <div className="rounded-2xl bg-[#FFF7EA] border border-[#F4E3C8] p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#6B4028] mb-2">
            <Users className="w-3.5 h-3.5 text-[#C9974D]" />
            Personas de la mesa
          </div>
          <div className="flex flex-wrap gap-1.5">
            {getSessionPersons(session).map((person) => (
              <span
                key={person.id}
                className="px-2.5 py-1 rounded-lg bg-white border border-[#DEC8AE] text-[10px] font-bold text-[#5C3825]"
              >
                {person.label}
                {session.accountMode === 'SEPARADAS' && (
                  <span className="text-[#A86B3D]"> · {session.accounts.find((a) => a.id === person.accountId)?.label || 'Cuenta'}</span>
                )}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-[#8A624C] mt-2">
            Los platillos se identifican por persona aunque la mesa use Cuenta general.
          </p>
        </div>
      )}

      {session?.accountMode === 'SEPARADAS' && (
        <div className="rounded-2xl bg-[#FFF7EA] border border-[#F4E3C8] p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#6B4028] mb-2">
            <Users className="w-3.5 h-3.5 text-[#C9974D]" />
            {session.accounts.length} cuentas activas
          </div>
          <div className="flex flex-wrap gap-1.5">
            {session.accounts.map((account) => (
              <span
                key={account.id}
                className="px-2.5 py-1 rounded-lg bg-white border border-[#DEC8AE] text-[10px] font-bold text-[#5C3825]"
              >
                {account.label}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-[#8A624C] mt-2">
            Cada comensal puede escanear el mismo QR de Mesa {table.tableNumber} y elegir su cuenta.
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-[#DEC8AE] bg-[#FFFDF9] p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#5C3825]">
              <ReceiptText className="w-3.5 h-3.5 text-[#C9974D]" />
              Pedidos enviados de esta mesa
            </div>
            <p className="text-[10px] text-[#8A624C] mt-0.5">
              Se actualiza en vivo para que el mesero vea lo que el cliente ya pidió antes de tomar otra orden.
            </p>
          </div>
          <span className="shrink-0 px-2 py-1 rounded-lg bg-[#3A2418] text-[#FFF7EA] text-[10px] font-bold">
            {currentSessionOrders.length}
          </span>
        </div>

        {currentSessionOrders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#DEC8AE] bg-[#FFF7EA] px-3 py-3 text-center text-[10px] text-[#8A624C]">
            Aún no hay comandas enviadas en este servicio.
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
            {currentSessionOrders.slice(0, 8).map((order) => (
              <div key={order.id || order.code} className="rounded-xl border border-[#E8D4BE] bg-white p-2.5 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-bold text-[#3A2418]">#{order.code}</span>
                      <span className="text-[9px] text-[#8A624C]">{formatOrderTime(order.createdAt)}</span>
                    </div>
                    <div className="text-[10px] font-semibold text-[#6B4028] mt-0.5">
                      {orderSourceLabel(order)}
                    </div>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-lg border text-[9px] font-bold ${orderStatusClass(order)}`}>
                    {orderStatusLabel(order)}
                  </span>
                </div>

                <div className="space-y-1">
                  {order.items.map((item, index) => (
                    <div key={`${order.id || order.code}-${item.productId}-${index}`} className="flex items-start justify-between gap-2 text-[10px]">
                      <div className="min-w-0 text-[#5C3825]">
                        <span className="font-bold">{item.quantity}× {item.name}</span>
                        {item.personLabel && (
                          <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold">
                            {item.personLabel}
                          </span>
                        )}
                        {item.specialInstructions && (
                          <span className="block mt-0.5 italic text-[#8A624C]">Nota: {item.specialInstructions}</span>
                        )}
                      </div>
                      <span className="shrink-0 font-bold text-[#3A2418]">${item.totalPrice}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#F0E2D2] text-[10px]">
                  <span className="text-[#8A624C]">Mesa {table.tableNumber}</span>
                  <span className="font-black text-[#3A2418]">${order.total}</span>
                </div>
              </div>
            ))}

            {currentSessionOrders.length > 8 && (
              <p className="text-[9px] text-center text-[#8A624C]">
                Mostrando las 8 comandas más recientes de {currentSessionOrders.length}.
              </p>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={openWaiterOrder}
        className="w-full px-3 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-60"
      >
        <ExternalLink className="w-4 h-4" />
        Tomar pedido desde mi celular
      </button>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-800 px-3 py-2 text-xs">
          {error}
        </div>
      )}
    </div>
  );
};
