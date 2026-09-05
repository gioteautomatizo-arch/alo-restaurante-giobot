import React, { useState, useEffect } from 'react';
import { StaffUser, ShiftRecord, UserRole } from '../../types';
import {
  getCurrentShift,
  openNewShift,
  updateShiftSales,
  closeShift,
  getExpenses,
  getFormattedTime,
  canCloseShift,
  canCorrectInitialFund,
  correctShiftInitialFund,
  formatLocalDate,
  getLocalShiftType,
  getShiftDisplayDate,
  getShiftDisplayTime,
} from '../../lib/adminStorage';
import {
  Clock,
  DollarSign,
  CreditCard,
  Smartphone,
  Wallet,
  Receipt,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Play,
  Save,
  FileSpreadsheet,
  Edit3,
  ShieldAlert,
} from 'lucide-react';

interface ShiftControlViewProps {
  currentUser: StaffUser;
  onRefreshStats: () => void;
}

export const ShiftControlView: React.FC<ShiftControlViewProps> = ({
  currentUser,
  onRefreshStats,
}) => {
  const [currentShift, setCurrentShift] = useState<ShiftRecord | null>(null);
  const [salesCash, setSalesCash] = useState<number>(0);
  const [salesCard, setSalesCard] = useState<number>(0);
  const [salesPlatforms, setSalesPlatforms] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [initialFundInput, setInitialFundInput] = useState<number>(500);
  const [shiftTypeSelect, setShiftTypeSelect] = useState<'AM' | 'PM'>(
    getLocalShiftType()
  );

  // Modal de Cierre de Turno
  const [isCloseModalOpen, setIsCloseModalOpen] = useState<boolean>(false);
  const [countedCash, setCountedCash] = useState<number>(0);
  const [closeNotes, setCloseNotes] = useState<string>('');
  const [thirdPartyCloseReason, setThirdPartyCloseReason] = useState<string>('');
  const [closeError, setCloseError] = useState<string | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Modal de Corrección de Fondo Inicial (Exclusivo Administrador)
  const [isCorrectFundModalOpen, setIsCorrectFundModalOpen] = useState<boolean>(false);
  const [correctedFundInput, setCorrectedFundInput] = useState<number>(500);
  const [correctReasonInput, setCorrectReasonInput] = useState<string>(
    'Corrección de configuración inicial. Fondo real del restaurante: $500.'
  );
  const [correctFundError, setCorrectFundError] = useState<string | null>(null);

  const loadShift = () => {
    const shift = getCurrentShift();
    setCurrentShift(shift);
    if (shift) {
      setSalesCash(shift.salesCash);
      setSalesCard(shift.salesCard);
      setSalesPlatforms(shift.salesPlatforms);
      setNotes(shift.notes || '');
    }
  };

  useEffect(() => {
    loadShift();
    const handleDataChange = () => {
      loadShift();
    };
    window.addEventListener('alo_admin_data_updated', handleDataChange);
    window.addEventListener('storage', handleDataChange);
    return () => {
      window.removeEventListener('alo_admin_data_updated', handleDataChange);
      window.removeEventListener('storage', handleDataChange);
    };
  }, []);

  const totalSales = Number(salesCash || 0) + Number(salesCard || 0) + Number(salesPlatforms || 0);
  const shiftExpenses = currentShift ? getExpenses(currentShift.id) : [];
  const totalCashExpenses = shiftExpenses
    .filter((e) => e.paidWith === 'efectivo_caja')
    .reduce((sum, e) => sum + e.amount, 0);

  const expectedCash = currentShift
    ? Number(salesCash || 0) - totalCashExpenses + currentShift.initialCashFund
    : 0;

  const handleOpenShift = async () => {
    try {
      const newShift = await openNewShift(currentUser, Number(initialFundInput), shiftTypeSelect);
      setCurrentShift(newShift);
      setSalesCash(0);
      setSalesCard(0);
      setSalesPlatforms(0);
      onRefreshStats();
    } catch (err: any) {
      alert(err.message || 'Error al abrir el turno en la nube.');
    }
  };

  const handleSaveSales = async () => {
    if (!currentShift) return;
    try {
      const updated = await updateShiftSales(
        Number(salesCash || 0),
        Number(salesCard || 0),
        Number(salesPlatforms || 0),
        notes,
        currentUser
      );
      if (updated) {
        setCurrentShift(updated);
        setSaveSuccessMsg('¡Ventas y datos del turno actualizados con éxito!');
        setTimeout(() => setSaveSuccessMsg(null), 3000);
        onRefreshStats();
      }
    } catch (err: any) {
      alert(err.message || 'Error al guardar ventas.');
    }
  };

  const handleOpenCorrectFundModal = () => {
    if (!currentShift) return;
    setCorrectedFundInput(500);
    setCorrectReasonInput('Corrección de configuración inicial. Fondo real del restaurante: $500.');
    setCorrectFundError(null);
    setIsCorrectFundModalOpen(true);
  };

  const handleExecuteFundCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentShift) return;

    if (currentUser.role !== 'ADMINISTRADOR' && currentUser.role !== 'DUEÑA') {
      setCorrectFundError('Solo DUEÑA o Administrador pueden corregir el fondo inicial.');
      return;
    }

    if (correctedFundInput < 0 || isNaN(correctedFundInput)) {
      setCorrectFundError('Ingresa un monto válido mayor o igual a $0.');
      return;
    }

    if (!correctReasonInput.trim()) {
      setCorrectFundError('El motivo de corrección es obligatorio.');
      return;
    }

    try {
      const updated = await correctShiftInitialFund(
        currentUser,
        Number(correctedFundInput),
        correctReasonInput.trim()
      );
      setCurrentShift(updated);
      setIsCorrectFundModalOpen(false);
      setSaveSuccessMsg(`¡Fondo Inicial corregido a $${Number(correctedFundInput).toLocaleString('es-MX')} y registrado en Bitácora!`);
      setTimeout(() => setSaveSuccessMsg(null), 4000);
      onRefreshStats();
    } catch (err: any) {
      setCorrectFundError(err.message || 'Error al corregir el fondo inicial.');
    }
  };

  const handleExecuteClose = async () => {
    if (!currentShift) return;
    setCloseError(null);

    const isDifferentUser =
      currentUser.id !== (currentShift.openedByUserId || currentShift.responsibleUserId) &&
      currentUser.name !== (currentShift.openedByName || currentShift.responsibleUser);

    if (isDifferentUser && !thirdPartyCloseReason.trim()) {
      setCloseError('Debes ingresar el motivo por el cual estás cerrando el turno de otra persona.');
      return;
    }

    try {
      await closeShift(
        Number(countedCash || 0),
        closeNotes,
        currentUser,
        isDifferentUser ? thirdPartyCloseReason.trim() : undefined
      );
      setIsCloseModalOpen(false);
      setThirdPartyCloseReason('');
      setCloseNotes('');
      loadShift();
      onRefreshStats();
    } catch (err: any) {
      setCloseError(err.message || 'Error al cerrar el turno.');
    }
  };

  if (!currentShift) {
    return (
      <div className="bg-white rounded-3xl border border-[#F4E3C8] p-6 sm:p-8 max-w-2xl mx-auto shadow-sm text-center space-y-6">
        <div className="w-16 h-16 rounded-3xl bg-[#FFF7EA] text-[#3A2418] border border-[#C9974D]/40 flex items-center justify-center mx-auto shadow-inner">
          <Clock className="w-8 h-8 text-[#C9974D]" />
        </div>

        <div>
          <h2 className="font-serif font-bold text-xl sm:text-2xl text-[#2B1B13]">
            No hay turno abierto en este momento
          </h2>
          <p className="text-xs sm:text-sm text-[#6B4028] max-w-md mx-auto mt-1">
            Inicia la jornada para comenzar a registrar ventas, gastos, pedidos en caja y control de inventario.
          </p>
        </div>

        <div className="bg-[#FFF7EA] p-5 rounded-2xl border border-[#F4E3C8] text-left space-y-4 max-w-md mx-auto">
          <div>
            <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1.5 font-serif">
              Turno del día
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShiftTypeSelect('AM')}
                className={`py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  shiftTypeSelect === 'AM'
                    ? 'bg-[#3A2418] text-[#FFF7EA] border-[#C9974D] shadow-2xs'
                    : 'bg-white text-[#6B4028] border-[#F4E3C8]'
                }`}
              >
                ☀️ Matutino (AM)
              </button>
              <button
                type="button"
                onClick={() => setShiftTypeSelect('PM')}
                className={`py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  shiftTypeSelect === 'PM'
                    ? 'bg-[#3A2418] text-[#FFF7EA] border-[#C9974D] shadow-2xs'
                    : 'bg-white text-[#6B4028] border-[#F4E3C8]'
                }`}
              >
                🌙 Vespertino (PM)
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1.5 font-serif">
              Fondo inicial en efectivo ($)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A86B3D] font-bold">$</span>
              <input
                type="number"
                value={initialFundInput}
                onChange={(e) => setInitialFundInput(Math.max(0, Number(e.target.value)))}
                className="w-full pl-8 pr-4 py-2.5 bg-white rounded-xl border border-[#F4E3C8] text-[#2B1B13] font-bold text-base focus:border-[#3A2418] focus:outline-hidden"
                placeholder="500"
              />
            </div>
            <p className="text-[10px] text-[#6B4028] mt-1">Fondo estándar sugerido: $500 MXN para cambio en caja.</p>
          </div>

          <div className="p-3 bg-[#FAF5ED] rounded-xl border border-[#F4E3C8] text-xs text-[#3A2418] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Responsable: <strong>{currentUser.name}</strong> ({currentUser.role})</span>
          </div>
        </div>

        <button
          onClick={handleOpenShift}
          className="px-8 py-3.5 bg-gradient-to-r from-[#3A2418] via-[#4A2E1F] to-[#2B1B13] text-[#FFF7EA] hover:from-[#4A2E1F] hover:to-[#3A2418] rounded-2xl font-bold text-sm sm:text-base shadow-lg hover:shadow-xl transition-all active:scale-98 cursor-pointer inline-flex items-center gap-2 border border-[#C9974D]/40"
        >
          <Play className="w-4 h-4 text-[#C9974D] fill-[#C9974D]" />
          <span>Aperturar Turno {shiftTypeSelect}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {saveSuccessMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs sm:text-sm font-medium flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* Tarjeta de Encabezado de Turno */}
      <div className="bg-[#3A2418] text-[#FFF7EA] rounded-3xl p-5 sm:p-7 border border-[#4E3222] shadow-md relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#4A2E1F] border border-[#C9974D]/40 text-[#C9974D] text-xs font-bold uppercase tracking-wider mb-2">
              <Clock className="w-3.5 h-3.5" />
              <span>Turno {currentShift.shiftType} • Activo</span>
            </div>
            <h2 className="font-serif font-bold text-xl sm:text-2xl text-white">
              Control de Turno • Restaurante Calientito
            </h2>
            <p className="text-xs text-[#F4E3C8] font-light mt-1">
              Responsable de apertura: <strong>{currentShift.openedByName || currentShift.responsibleUser}</strong> • Apertura: <strong>{getShiftDisplayTime(currentShift)}</strong> ({getShiftDisplayDate(currentShift)})
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {canCorrectInitialFund(currentUser.role) && (
              <button
                type="button"
                onClick={handleOpenCorrectFundModal}
                className="px-3.5 py-2.5 rounded-xl bg-[#4A2E1F] hover:bg-[#5A3826] text-[#F4E3C8] hover:text-white border border-[#C9974D]/40 font-medium text-xs shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                title="Corregir Fondo Inicial como DUEÑA o Administrador"
              >
                <Edit3 className="w-3.5 h-3.5 text-[#C9974D]" />
                <span>Corregir Fondo Inicial</span>
              </button>
            )}

            {canCloseShift(currentUser.role) && (
              <button
                onClick={() => {
                  setCountedCash(expectedCash);
                  setCloseError(null);
                  setIsCloseModalOpen(true);
                }}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#C9974D] to-[#b5883d] hover:from-[#d6aa5f] hover:to-[#C9974D] text-[#3A2418] font-bold text-xs sm:text-sm shadow-md active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>Cerrar Turno</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Aviso si el usuario actual no es quien abrió el turno */}
      {(currentUser.id !== (currentShift.openedByUserId || currentShift.responsibleUserId) &&
        currentUser.name !== (currentShift.openedByName || currentShift.responsibleUser)) && (
        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start sm:items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <span className="font-bold block">
                Hay un turno activo abierto por {currentShift.openedByName || currentShift.responsibleUser} desde las {getShiftDisplayTime(currentShift)}.
              </span>
              <span className="text-amber-800 text-[11px]">
                Sesión actual: <strong>{currentUser.name}</strong> ({currentUser.role}). Las ventas, gastos y operaciones continuarán registrándose en este turno activo.
              </span>
            </div>
          </div>
          {canCloseShift(currentUser.role) && (
            <button
              onClick={() => {
                setCountedCash(expectedCash);
                setCloseError(null);
                setIsCloseModalOpen(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition-all shrink-0 cursor-pointer flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Cerrar este turno</span>
            </button>
          )}
        </div>
      )}

      {/* Grid de Registro de Ventas & Fondo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Columna 1: Ventas por Método */}
        <div className="bg-white rounded-3xl border border-[#F4E3C8] p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#F4E3C8]/60 pb-3">
            <h3 className="font-serif font-bold text-base text-[#2B1B13] flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-[#C9974D]" />
              <span>1. Registro de Ventas</span>
            </h3>
            <span className="text-xs text-[#A86B3D]">Captura de montos</span>
          </div>

          {/* Venta en Efectivo */}
          <div>
            <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 flex items-center gap-1.5 font-serif">
              <Wallet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Venta en Efectivo ($)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A86B3D] font-bold">$</span>
              <input
                type="number"
                value={salesCash === 0 ? '' : salesCash}
                onChange={(e) => setSalesCash(Math.max(0, Number(e.target.value)))}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-2.5 bg-[#FFF7EA]/50 focus:bg-white rounded-xl border border-[#F4E3C8] text-[#2B1B13] font-bold text-base focus:border-[#3A2418] focus:outline-hidden"
              />
            </div>
          </div>

          {/* Venta con Tarjeta */}
          <div>
            <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 flex items-center gap-1.5 font-serif">
              <CreditCard className="w-3.5 h-3.5 text-blue-600" />
              <span>Venta con Tarjeta (TPV / Terminal) ($)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A86B3D] font-bold">$</span>
              <input
                type="number"
                value={salesCard === 0 ? '' : salesCard}
                onChange={(e) => setSalesCard(Math.max(0, Number(e.target.value)))}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-2.5 bg-[#FFF7EA]/50 focus:bg-white rounded-xl border border-[#F4E3C8] text-[#2B1B13] font-bold text-base focus:border-[#3A2418] focus:outline-hidden"
              />
            </div>
          </div>

          {/* Venta en Plataformas */}
          <div>
            <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 flex items-center gap-1.5 font-serif">
              <Smartphone className="w-3.5 h-3.5 text-[#C77B4A]" />
              <span>Venta en Plataformas / Apps ($)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A86B3D] font-bold">$</span>
              <input
                type="number"
                value={salesPlatforms === 0 ? '' : salesPlatforms}
                onChange={(e) => setSalesPlatforms(Math.max(0, Number(e.target.value)))}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-2.5 bg-[#FFF7EA]/50 focus:bg-white rounded-xl border border-[#F4E3C8] text-[#2B1B13] font-bold text-base focus:border-[#3A2418] focus:outline-hidden"
              />
            </div>
          </div>

          {/* Total de Ventas Calculado Automáticamente */}
          <div className="pt-3 border-t border-[#F4E3C8]/60 flex items-center justify-between bg-[#FFF7EA] p-3.5 rounded-2xl border border-[#F4E3C8]">
            <div>
              <span className="text-[11px] font-bold text-[#6B4028] uppercase tracking-wider block font-serif">
                Venta Total del Turno
              </span>
              <span className="text-xs text-[#A86B3D]">Efectivo + Tarjeta + Apps</span>
            </div>
            <span className="font-serif font-black text-2xl text-[#2B1B13]">
              ${totalSales.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Columna 2: Arqueo y Cuadre de Caja */}
        <div className="bg-white rounded-3xl border border-[#F4E3C8] p-5 sm:p-6 shadow-xs space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#F4E3C8]/60 pb-3">
              <h3 className="font-serif font-bold text-base text-[#2B1B13] flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#C9974D]" />
                <span>2. Fondo & Efectivo Esperado</span>
              </h3>
              <span className="text-xs text-[#A86B3D]">Fórmula de caja</span>
            </div>

            {/* Desglose de Fórmula */}
            <div className="space-y-2.5 text-xs text-[#2B1B13] bg-[#FFF7EA] p-4 rounded-2xl border border-[#F4E3C8]">
              <div className="flex items-center justify-between py-1 border-b border-[#F4E3C8]">
                <div className="flex items-center gap-2">
                  <span className="text-[#6B4028]">(+) Fondo Inicial de Caja:</span>
                  {canCorrectInitialFund(currentUser.role) && (
                    <button
                      type="button"
                      onClick={handleOpenCorrectFundModal}
                      className="text-[10px] text-[#C77B4A] hover:text-[#3A2418] font-bold underline cursor-pointer inline-flex items-center gap-0.5"
                    >
                      <Edit3 className="w-2.5 h-2.5" />
                      <span>Corregir</span>
                    </button>
                  )}
                </div>
                <span className="font-bold text-[#2B1B13]">
                  ${currentShift.initialCashFund.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-[#F4E3C8]">
                <span className="text-emerald-700">(+) Venta en Efectivo:</span>
                <span className="font-bold text-emerald-700">
                  +${Number(salesCash || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-[#F4E3C8]">
                <span className="text-rose-700">(-) Gastos Pagados en Efectivo:</span>
                <span className="font-bold text-rose-700">
                  -${totalCashExpenses.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex items-center justify-between pt-2 text-sm font-bold text-[#2B1B13]">
                <span>(=) Efectivo Esperado en Caja:</span>
                <span className="font-serif font-black text-lg text-[#3A2418]">
                  ${expectedCash.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Notas del Turno */}
            <div>
              <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                Notas / Observaciones del Turno
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Ej. Se pagó garrafón con cambio de caja..."
                className="w-full p-3 bg-[#FFF7EA]/50 focus:bg-white rounded-xl border border-[#F4E3C8] text-xs text-[#2B1B13] focus:border-[#3A2418] focus:outline-hidden"
              />
            </div>
          </div>

          {/* Botón Guardar Avance */}
          <button
            onClick={handleSaveSales}
            className="w-full py-3.5 bg-[#3A2418] hover:bg-[#4A2E1F] text-[#FFF7EA] rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-98 cursor-pointer mt-2"
          >
            <Save className="w-4 h-4 text-[#C9974D]" />
            <span>Guardar Avance del Turno</span>
          </button>
        </div>
      </div>

      {/* Modal de Corrección de Fondo Inicial (Exclusivo Administrador) */}
      {isCorrectFundModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2B1B13]/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md bg-[#FFF7EA] text-[#2B1B13] rounded-3xl shadow-2xl border border-[#F4E3C8] overflow-hidden">
            <div className="bg-[#3A2418] text-white p-5 border-b border-[#4E3222] flex items-center justify-between">
              <h3 className="font-serif font-bold text-lg flex items-center gap-2 text-[#FFF7EA]">
                <Edit3 className="w-5 h-5 text-[#C9974D]" />
                <span>Corregir Fondo Inicial</span>
              </h3>
              <button
                onClick={() => setIsCorrectFundModalOpen(false)}
                className="text-[#F4E3C8] hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleExecuteFundCorrection} className="p-6 space-y-4">
              {correctFundError && (
                <div className="p-3 bg-rose-50 rounded-2xl border border-rose-200 text-xs text-rose-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{correctFundError}</span>
                </div>
              )}

              <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Acción de Auditoría Administrativa</p>
                  <p className="mt-0.5 text-[#6B4028]">
                    {currentShift.salesCash === 0 && currentShift.cashExpenses === 0
                      ? 'El turno actual no tiene ventas ni gastos registrados. La corrección actualizará el fondo inicial directamente a $500 y quedará registrada en Bitácora.'
                      : 'El turno actual ya tiene movimientos registrados. La corrección recalculará el efectivo esperado con el nuevo fondo y quedará registrada con su motivo.'}
                  </p>
                </div>
              </div>

              <div className="space-y-3 bg-white p-4 rounded-2xl border border-[#F4E3C8]">
                <div className="flex items-center justify-between text-xs text-[#6B4028] pb-2 border-b border-[#F4E3C8]">
                  <span>Fondo Inicial Actual:</span>
                  <span className="font-mono font-bold text-rose-700">
                    ${currentShift.initialCashFund.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                    Nuevo Fondo Inicial ($ MXN) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A86B3D] font-bold">$</span>
                    <input
                      type="number"
                      value={correctedFundInput}
                      onChange={(e) => setCorrectedFundInput(Math.max(0, Number(e.target.value)))}
                      className="w-full pl-8 pr-4 py-2.5 bg-[#FFF7EA]/50 rounded-xl border border-[#F4E3C8] text-[#2B1B13] font-bold text-lg focus:border-[#3A2418] focus:outline-hidden"
                      placeholder="500"
                      required
                      min={0}
                    />
                  </div>
                  <p className="text-[10px] text-[#6B4028] mt-1">Monto estándar del restaurante: $500 MXN</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                    Motivo de la Corrección *
                  </label>
                  <textarea
                    value={correctReasonInput}
                    onChange={(e) => setCorrectReasonInput(e.target.value)}
                    rows={2}
                    placeholder="Ej. Corrección de configuración inicial. Fondo real del restaurante: $500."
                    className="w-full p-3 bg-[#FFF7EA]/40 rounded-xl border border-[#F4E3C8] text-xs text-[#2B1B13] focus:border-[#3A2418] focus:outline-hidden"
                    required
                  />
                  <p className="text-[10px] text-[#A86B3D] mt-1">Este motivo quedará auditado en la Bitácora con tu usuario y fecha.</p>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCorrectFundModalOpen(false)}
                  className="w-1/2 py-3 rounded-xl border border-[#F4E3C8] text-[#6B4028] font-bold text-xs hover:bg-[#FAF5ED] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-3 rounded-xl bg-gradient-to-r from-[#C9974D] to-[#b5883d] hover:from-[#d6aa5f] hover:to-[#C9974D] text-[#3A2418] font-bold text-xs shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Aplicar Corrección</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Cierre de Turno con Arqueo */}
      {isCloseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2B1B13]/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md bg-[#FFF7EA] text-[#2B1B13] rounded-3xl shadow-2xl border border-[#F4E3C8] overflow-hidden">
            <div className="bg-[#3A2418] text-white p-5 border-b border-[#4E3222] flex items-center justify-between">
              <h3 className="font-serif font-bold text-lg flex items-center gap-2 text-[#FFF7EA]">
                <Lock className="w-5 h-5 text-[#C9974D]" />
                <span>Cierre Oficial de Turno</span>
              </h3>
              <button
                onClick={() => setIsCloseModalOpen(false)}
                className="text-[#F4E3C8] hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Cuenta todo el dinero físico en la caja registradora para verificar si coincide con el esperado.
                </span>
              </div>

              <div className="space-y-3 bg-white p-4 rounded-2xl border border-[#F4E3C8]">
                <div className="flex items-center justify-between text-xs text-[#6B4028]">
                  <span>Efectivo Esperado:</span>
                  <span className="font-bold text-[#2B1B13]">
                    ${expectedCash.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                    Efectivo Contado al Cierre ($)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A86B3D] font-bold">$</span>
                    <input
                      type="number"
                      value={countedCash}
                      onChange={(e) => setCountedCash(Number(e.target.value))}
                      className="w-full pl-8 pr-4 py-2.5 bg-[#FFF7EA]/50 rounded-xl border border-[#F4E3C8] text-[#2B1B13] font-bold text-lg focus:border-[#3A2418] focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Diferencia Calculada */}
                {(() => {
                  const diff = countedCash - expectedCash;
                  const isExact = Math.abs(diff) < 0.01;
                  const isPositive = diff > 0;
                  return (
                    <div
                      className={`p-3 rounded-xl border text-xs flex items-center justify-between font-bold ${
                        isExact
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                          : isPositive
                          ? 'bg-blue-50 text-blue-900 border-blue-200'
                          : 'bg-rose-50 text-rose-900 border-rose-200'
                      }`}
                    >
                      <span>Diferencia en Caja:</span>
                      <span className="text-sm font-mono">
                        {isExact ? '$0.00 (Exacto)' : `${isPositive ? '+' : ''}$${diff.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Aviso si quien cierra es un tercero (DUEÑA o ADMINISTRADOR) */}
              {(() => {
                const originalResp = currentShift.openedByName || currentShift.responsibleUser;
                const isDifferent =
                  currentUser.id !== (currentShift.openedByUserId || currentShift.responsibleUserId) &&
                  currentUser.name !== originalResp;
                if (!isDifferent) return null;

                return (
                  <div className="p-3 bg-amber-50 rounded-2xl border border-amber-300 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-950 font-serif">
                      <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
                      <span>Cierre de turno ajeno</span>
                    </div>
                    <p className="text-[11px] text-amber-900 leading-tight">
                      Estás cerrando el turno abierto por <strong>{originalResp}</strong>. El registro conservará a <strong>{originalResp}</strong> como responsable original de apertura y te registrará a ti (<strong>{currentUser.name}</strong>) como quien ejecutó el cierre.
                    </p>
                    <div>
                      <label className="block text-[11px] font-bold text-amber-950 uppercase tracking-wider mb-1 font-serif">
                        Motivo del cierre *
                      </label>
                      <input
                        type="text"
                        required
                        value={thirdPartyCloseReason}
                        onChange={(e) => setThirdPartyCloseReason(e.target.value)}
                        placeholder="Ej. Fin de jornada / Salida anticipada autorizada..."
                        className="w-full px-3 py-2 bg-white rounded-xl border border-amber-300 text-xs text-[#2B1B13] font-medium focus:outline-hidden"
                      />
                    </div>
                  </div>
                );
              })()}

              {closeError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs font-medium flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{closeError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                  Observaciones de Cierre
                </label>
                <textarea
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  rows={2}
                  placeholder="Ej. Todo cuadrado en orden..."
                  className="w-full p-3 bg-white rounded-xl border border-[#F4E3C8] text-xs text-[#2B1B13] focus:outline-hidden"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCloseModalOpen(false)}
                  className="w-1/2 py-3 rounded-xl border border-[#F4E3C8] text-[#6B4028] font-bold text-xs hover:bg-[#FAF5ED] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleExecuteClose}
                  className="w-1/2 py-3 rounded-xl bg-[#3A2418] hover:bg-[#4A2E1F] text-white font-bold text-xs shadow-md cursor-pointer"
                >
                  Confirmar Cierre
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
