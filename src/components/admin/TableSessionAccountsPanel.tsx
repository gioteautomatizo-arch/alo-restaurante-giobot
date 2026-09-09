import React, { useEffect, useState } from 'react';
import { ExternalLink, ReceiptText, Users } from 'lucide-react';
import { StaffUser, TableRecord, TableSession } from '../../types';
import {
  ensureStaffTableSession,
  getSessionPersons,
  setTableSessionAccountModeByStaff,
  subscribeToTableSession,
} from '../../lib/tableSessionsService';

interface TableSessionAccountsPanelProps {
  table: TableRecord;
  currentUser: StaffUser;
}

export const TableSessionAccountsPanel: React.FC<TableSessionAccountsPanelProps> = ({
  table,
  currentUser,
}) => {
  const [session, setSession] = useState<TableSession | null>(null);
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
