import React, { useState } from 'react';
import { ShiftRecord } from '../../types';
import {
  getShiftsHistory,
  getExpenses,
  formatLocalDate,
  getShiftDisplayDate,
  getShiftDisplayTime,
} from '../../lib/adminStorage';
import {
  Calendar,
  Clock,
  User,
  DollarSign,
  TrendingUp,
  CreditCard,
  Smartphone,
  Wallet,
  Receipt,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

export const ShiftHistoryView: React.FC = () => {
  const [history, setHistory] = useState<ShiftRecord[]>(getShiftsHistory());
  const [selectedShift, setSelectedShift] = useState<ShiftRecord | null>(null);

  React.useEffect(() => {
    const handleDataChange = () => {
      setHistory(getShiftsHistory());
    };
    window.addEventListener('alo_admin_data_updated', handleDataChange);
    window.addEventListener('storage', handleDataChange);
    return () => {
      window.removeEventListener('alo_admin_data_updated', handleDataChange);
      window.removeEventListener('storage', handleDataChange);
    };
  }, []);

  const totalSalesAllHistory = history.reduce((sum, s) => sum + s.totalSales, 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#F4E3C8] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFF7EA] text-[#A86B3D] text-xs font-bold uppercase tracking-wider mb-1 font-serif border border-[#F4E3C8]">
            <Calendar className="w-3.5 h-3.5" />
            <span>Archivo Contable</span>
          </div>
          <h2 className="font-serif font-bold text-xl sm:text-2xl text-[#2B1B13]">
            Historial de Turnos & Cortes de Caja
          </h2>
          <p className="text-xs text-[#6B4028] mt-0.5">
            Registro acumulado de jornadas anteriores, arqueos de caja y ventas por método.
          </p>
        </div>

        <div className="bg-[#3A2418] text-[#FFF7EA] px-5 py-3 rounded-2xl border border-[#4E3222] flex flex-col items-end shrink-0">
          <span className="text-[10px] uppercase font-bold text-[#C9974D] font-serif">Ventas Totales Registradas</span>
          <span className="font-serif font-black text-xl text-white">
            ${totalSalesAllHistory.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {history.length === 0 ? (
        <div className="bg-white rounded-3xl border border-[#F4E3C8] p-12 text-center text-[#A86B3D] space-y-2">
          <Clock className="w-10 h-10 mx-auto text-[#C9974D]" />
          <p className="text-sm font-medium text-[#2B1B13]">No hay turnos cerrados en el historial aún.</p>
          <p className="text-xs text-[#6B4028]">Cuando cierres un turno activo, su corte oficial se guardará aquí.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {history.map((shift) => {
            const isSelected = selectedShift?.id === shift.id;
            const diff = shift.cashDifference || 0;
            const isExact = Math.abs(diff) < 0.01;
            const isPositive = diff > 0;

            return (
              <div
                key={shift.id}
                className={`bg-white rounded-3xl border transition-all overflow-hidden ${
                  isSelected
                    ? 'border-[#C9974D] shadow-md ring-2 ring-[#C9974D]/20'
                    : 'border-[#F4E3C8] hover:border-[#A86B3D]'
                }`}
              >
                <div
                  onClick={() => setSelectedShift(isSelected ? null : shift)}
                  className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-[#3A2418] text-[#C9974D] flex flex-col items-center justify-center font-bold shrink-0">
                      <span className="text-xs uppercase">{shift.shiftType}</span>
                      <span className="text-[9px] text-[#F4E3C8] font-light font-serif">TURNO</span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-serif font-bold text-base text-[#2B1B13]">
                          {getShiftDisplayDate(shift)}
                        </span>
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#FFF7EA] text-[#6B4028] font-medium border border-[#F4E3C8]">
                          {getShiftDisplayTime(shift)} - {shift.closedAt || 'En curso'}
                        </span>
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                            isExact
                              ? 'bg-emerald-100 text-emerald-800'
                              : isPositive
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {isExact ? 'Caja Cuadrada' : `Dif: ${isPositive ? '+' : ''}$${diff.toFixed(2)}`}
                        </span>
                      </div>

                      <p className="text-xs text-[#6B4028] mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span>Responsable: <strong>{shift.openedByName || shift.responsibleUser}</strong></span>
                        {shift.closedByName && shift.closedByName !== (shift.openedByName || shift.responsibleUser) && (
                          <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            Cerrado por: <strong>{shift.closedByName}</strong>
                            {shift.closedByReason && ` (${shift.closedByReason})`}
                          </span>
                        )}
                        {shift.notes && <span>• Nota: "{shift.notes}"</span>}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-6 pt-2 sm:pt-0 border-t sm:border-0 border-[#F4E3C8]/60">
                    <div className="text-left sm:text-right">
                      <span className="text-[10px] uppercase font-bold text-[#A86B3D] block font-serif">Venta Total</span>
                      <span className="font-serif font-black text-lg text-[#3A2418]">
                        ${shift.totalSales.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <span className="text-xs font-bold text-[#C9974D]">
                      {isSelected ? 'Ocultar ▲' : 'Detalles ▼'}
                    </span>
                  </div>
                </div>

                {/* Desglose Expandido del Corte */}
                {isSelected && (
                  <div className="bg-[#FFF7EA] p-5 sm:p-6 border-t border-[#F4E3C8] space-y-4 animate-in fade-in">
                    <h4 className="font-serif font-bold text-xs uppercase tracking-wider text-[#6B4028]">
                      Desglose Financiero del Corte
                    </h4>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="bg-white p-3 rounded-xl border border-[#F4E3C8]">
                        <span className="text-[#A86B3D] block text-[10px] uppercase font-bold font-serif">Efectivo</span>
                        <span className="font-bold text-[#2B1B13] text-sm">
                          ${shift.salesCash.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="bg-white p-3 rounded-xl border border-[#F4E3C8]">
                        <span className="text-[#A86B3D] block text-[10px] uppercase font-bold font-serif">Tarjetas TPV</span>
                        <span className="font-bold text-[#2B1B13] text-sm">
                          ${shift.salesCard.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="bg-white p-3 rounded-xl border border-[#F4E3C8]">
                        <span className="text-[#A86B3D] block text-[10px] uppercase font-bold font-serif">Plataformas</span>
                        <span className="font-bold text-[#2B1B13] text-sm">
                          ${shift.salesPlatforms.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="bg-white p-3 rounded-xl border border-[#F4E3C8]">
                        <span className="text-[#A86B3D] block text-[10px] uppercase font-bold font-serif">Gastos Efectivo</span>
                        <span className="font-bold text-rose-700 text-sm">
                          -${shift.cashExpenses.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-[#F4E3C8] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                      <div>
                        <span className="text-[#6B4028]">Fondo Inicial: <strong>${shift.initialCashFund}</strong></span>
                        <span className="mx-2">•</span>
                        <span className="text-[#6B4028]">Esperado en Caja: <strong>${shift.expectedCash.toFixed(2)}</strong></span>
                      </div>

                      <div>
                        <span className="text-[#2B1B13] font-bold">
                          Efectivo Físico Contado: ${shift.countedCashAtClose?.toFixed(2) || '0.00'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
