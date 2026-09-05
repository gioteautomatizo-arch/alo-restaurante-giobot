import React, { useState, useEffect } from 'react';
import {
  StaffUser,
  SobreMovement,
  SobreMovementType,
  SobreSummary,
  SobreOutflowCategory,
  SobreInflowCategory,
} from '../../types';
import {
  getSobreMovements,
  getSobreSummary,
  addSobreMovement,
  recordSobrePhysicalCount,
  reconcileSobreDifference,
  cancelSobreMovement,
  setSobreTransitionBalance,
  canViewSobreBalance,
  canRegisterSobreMovement,
  canReconcileSobre,
  canVoidSobreMovement,
  canSetSobreTransition,
  getLatestActiveTransition,
  formatLocalDate,
  formatLocalTime,
} from '../../lib/adminStorage';
import {
  Mail,
  PlusCircle,
  Calculator,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  Ban,
  Search,
  CheckCircle2,
  AlertTriangle,
  FileText,
  User,
  Clock,
  DollarSign,
  Lock,
  Sparkles,
  HelpCircle,
  X,
  Scale,
  RotateCcw,
  History,
  BookmarkCheck,
} from 'lucide-react';

interface SobreViewProps {
  currentUser: StaffUser;
  onRefreshStats: () => void;
}

const OUTFLOW_CATEGORIES: SobreOutflowCategory[] = [
  'Retiro dueña',
  'Adelanto',
  'Proveedores',
  'Personal',
  'Mantenimiento',
  'Compra extraordinaria',
  'Otros',
];

const INFLOW_CATEGORIES: SobreInflowCategory[] = [
  'Aportación dueña',
  'Resguardo / Fondo',
  'Reembolso / Devolución',
  'Otros',
];

export const SobreView: React.FC<SobreViewProps> = ({ currentUser, onRefreshStats }) => {
  const [summary, setSummary] = useState<SobreSummary>(getSobreSummary());
  const [movements, setMovements] = useState<SobreMovement[]>(getSobreMovements());
  const [filterType, setFilterType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modales
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isCountModalOpen, setIsCountModalOpen] = useState<boolean>(false);
  const [isReconcileModalOpen, setIsReconcileModalOpen] = useState<boolean>(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState<boolean>(false);
  const [isTransitionModalOpen, setIsTransitionModalOpen] = useState<boolean>(false);
  const [movementToCancel, setMovementToCancel] = useState<SobreMovement | null>(null);

  // Formulario de Registro
  const [formType, setFormType] = useState<'ENTRADA' | 'GASTO' | 'SALDO_INICIAL'>('GASTO');
  const [formAmount, setFormAmount] = useState<string>('');
  const [formConcept, setFormConcept] = useState<string>('');
  const [formCategory, setFormCategory] = useState<string>('Retiro dueña');
  const [formPersonOrVendor, setFormPersonOrVendor] = useState<string>('');
  const [formNotes, setFormNotes] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  // Formulario de Conteo Físico
  const [countPhysicalAmount, setCountPhysicalAmount] = useState<string>('');
  const [countNotes, setCountNotes] = useState<string>('');
  const [countError, setCountError] = useState<string | null>(null);

  // Formulario de Conciliación
  const [reconcileAmount, setReconcileAmount] = useState<string>('');
  const [reconcileReason, setReconcileReason] = useState<string>('');
  const [reconcileError, setReconcileError] = useState<string | null>(null);

  // Formulario de Anulación
  const [cancelReason, setCancelReason] = useState<string>('');
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Formulario de Saldo de Transición (Inicio oficial del control digital)
  const SUGGESTED_TRANSITION_REASON =
    'Inicio oficial del control digital. Existen movimientos de días anteriores no registrados en el sistema.';
  const [transitionPhysicalAmount, setTransitionPhysicalAmount] = useState<string>('');
  const [transitionReason, setTransitionReason] = useState<string>(SUGGESTED_TRANSITION_REASON);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  // Notificación de éxito
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const loadData = () => {
    setSummary(getSobreSummary());
    setMovements(getSobreMovements());
  };

  useEffect(() => {
    loadData();
    const handleDataChange = () => {
      loadData();
    };
    window.addEventListener('alo_admin_data_updated', handleDataChange);
    window.addEventListener('storage', handleDataChange);
    return () => {
      window.removeEventListener('alo_admin_data_updated', handleDataChange);
      window.removeEventListener('storage', handleDataChange);
    };
  }, []);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  // Permisos
  const userCanViewBalance = canViewSobreBalance(currentUser.role);
  const userCanRegister = canRegisterSobreMovement(currentUser.role);
  const userCanReconcile = canReconcileSobre(currentUser.role);
  const userCanVoid = canVoidSobreMovement(currentUser.role);
  const userCanSetTransition = canSetSobreTransition(currentUser.role);

  // Transición activa actual
  const latestActiveTransition = getLatestActiveTransition(movements);

  // Filtrado de movimientos
  const filteredMovements = movements.filter((m) => {
    const isPreTransition = latestActiveTransition
      ? new Date(m.timestamp).getTime() < new Date(latestActiveTransition.timestamp).getTime() &&
        m.id !== latestActiveTransition.id
      : false;

    const matchFilter =
      filterType === 'all'
        ? true
        : filterType === 'anulados'
        ? m.isCancelled === true
        : filterType === 'transicion'
        ? m.type === 'TRANSICION' && !m.isCancelled
        : filterType === 'entradas'
        ? (m.type === 'ENTRADA' || m.type === 'SALDO_INICIAL') && !m.isCancelled
        : filterType === 'gastos'
        ? m.type === 'GASTO' && !m.isCancelled
        : filterType === 'conteos'
        ? m.type === 'CONTEO' && !m.isCancelled
        : filterType === 'ajustes'
        ? m.type === 'AJUSTE' && !m.isCancelled
        : filterType === 'previos'
        ? isPreTransition && !m.isCancelled
        : true;

    const term = searchTerm.toLowerCase().trim();
    const matchSearch =
      !term ||
      m.concept.toLowerCase().includes(term) ||
      (m.category && m.category.toLowerCase().includes(term)) ||
      (m.personOrVendor && m.personOrVendor.toLowerCase().includes(term)) ||
      (m.notes && m.notes.toLowerCase().includes(term)) ||
      m.userName.toLowerCase().includes(term) ||
      m.amount.toString().includes(term);

    return matchFilter && matchSearch;
  });

  // Manejadores de acciones
  const handleOpenAddModal = (defaultType: 'ENTRADA' | 'GASTO' | 'SALDO_INICIAL' = 'GASTO') => {
    setFormType(defaultType);
    setFormAmount('');
    setFormConcept('');
    setFormCategory(defaultType === 'GASTO' ? 'Retiro dueña' : 'Aportación dueña');
    setFormPersonOrVendor('');
    setFormNotes('');
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const handleSaveMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const amountNum = parseFloat(formAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setFormError('Por favor ingresa un monto válido mayor a $0.');
      return;
    }

    if (!formConcept.trim()) {
      setFormError('El concepto es obligatorio.');
      return;
    }

    try {
      await addSobreMovement(
        {
          type: formType,
          amount: amountNum,
          concept: formConcept.trim(),
          category: formType === 'SALDO_INICIAL' ? 'Saldo inicial' : formCategory,
          personOrVendor: formPersonOrVendor.trim() || undefined,
          notes: formNotes.trim() || undefined,
        },
        currentUser
      );

      setIsAddModalOpen(false);
      loadData();
      onRefreshStats();
      showToast(
        formType === 'GASTO'
          ? `Gasto de Sobre por $${amountNum.toLocaleString('es-MX')} registrado con éxito.`
          : formType === 'ENTRADA'
          ? `Entrada al Sobre por $${amountNum.toLocaleString('es-MX')} registrada.`
          : `Saldo inicial establecido en $${amountNum.toLocaleString('es-MX')}.`
      );
    } catch (err: any) {
      setFormError(err.message || 'Error al registrar el movimiento.');
    }
  };

  const handleOpenCountModal = () => {
    setCountPhysicalAmount('');
    setCountNotes('');
    setCountError(null);
    setIsCountModalOpen(true);
  };

  const handleSaveCount = async (e: React.FormEvent) => {
    e.preventDefault();
    setCountError(null);

    const amountNum = parseFloat(countPhysicalAmount);
    if (isNaN(amountNum) || amountNum < 0) {
      setCountError('Ingresa un monto de conteo físico válido.');
      return;
    }

    try {
      const result = await recordSobrePhysicalCount(amountNum, countNotes, currentUser);
      setIsCountModalOpen(false);
      loadData();
      onRefreshStats();

      const diff = result.difference;
      const diffFormatted = diff >= 0 ? `+$${diff.toLocaleString('es-MX')}` : `-$${Math.abs(diff).toLocaleString('es-MX')}`;
      showToast(`Conteo físico registrado: $${amountNum.toLocaleString('es-MX')}. Diferencia: ${diffFormatted}`);
    } catch (err: any) {
      setCountError(err.message || 'Error al registrar el conteo físico.');
    }
  };

  const handleOpenReconcileModal = () => {
    if (!summary.hasPendingDifference && summary.pendingDifference === 0) {
      setReconcileAmount('');
    } else {
      // El monto de ajuste necesario para llevar el saldo teórico al físico
      setReconcileAmount(summary.pendingDifference.toString());
    }
    setReconcileReason(
      summary.lastPhysicalCount
        ? `Ajuste por diferencia de ${summary.pendingDifference >= 0 ? '+' : ''}$${summary.pendingDifference.toLocaleString('es-MX')} detectada en conteo físico`
        : ''
    );
    setReconcileError(null);
    setIsReconcileModalOpen(true);
  };

  const handleSaveReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    setReconcileError(null);

    const amountNum = parseFloat(reconcileAmount);
    if (isNaN(amountNum) || amountNum === 0) {
      setReconcileError('El monto de ajuste no puede ser $0.');
      return;
    }

    if (!reconcileReason.trim()) {
      setReconcileError('El motivo de conciliación es obligatorio para mantener la trazabilidad.');
      return;
    }

    try {
      await reconcileSobreDifference(amountNum, reconcileReason.trim(), currentUser);
      setIsReconcileModalOpen(false);
      loadData();
      onRefreshStats();
      showToast(`Conciliación aplicada: ${amountNum >= 0 ? '+' : ''}$${amountNum.toLocaleString('es-MX')}.`);
    } catch (err: any) {
      setReconcileError(err.message || 'Error al aplicar la conciliación.');
    }
  };

  const handleOpenCancelModal = (mov: SobreMovement) => {
    setMovementToCancel(mov);
    setCancelReason('');
    setCancelError(null);
    setIsCancelModalOpen(true);
  };

  const handleSaveCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movementToCancel) return;
    setCancelError(null);

    if (!cancelReason.trim()) {
      setCancelError('El motivo de anulación es obligatorio.');
      return;
    }

    try {
      await cancelSobreMovement(movementToCancel.id, cancelReason.trim(), currentUser);
      setIsCancelModalOpen(false);
      setMovementToCancel(null);
      loadData();
      onRefreshStats();
      showToast('Movimiento anulado correctamente. Se conservó en historial y se actualizó el saldo.');
    } catch (err: any) {
      setCancelError(err.message || 'Error al anular el movimiento.');
    }
  };

  const handleOpenTransitionModal = () => {
    setTransitionPhysicalAmount('');
    setTransitionReason(SUGGESTED_TRANSITION_REASON);
    setTransitionError(null);
    setIsTransitionModalOpen(true);
  };

  const handleSaveTransition = async (e: React.FormEvent) => {
    e.preventDefault();
    setTransitionError(null);

    const amountNum = parseFloat(transitionPhysicalAmount);
    if (isNaN(amountNum) || amountNum < 0) {
      setTransitionError('Por favor ingresa un monto válido de efectivo físico contado.');
      return;
    }

    if (!transitionReason.trim()) {
      setTransitionError('El motivo es obligatorio para establecer el saldo de transición.');
      return;
    }

    try {
      await setSobreTransitionBalance(amountNum, transitionReason.trim(), currentUser);
      setIsTransitionModalOpen(false);
      loadData();
      onRefreshStats();
      showToast(
        `Saldo de transición establecido en $${amountNum.toLocaleString('es-MX', {
          minimumFractionDigits: 2,
        })}. Control digital iniciado.`
      );
    } catch (err: any) {
      setTransitionError(err.message || 'Error al establecer el saldo de transición.');
    }
  };

  const getMovementTypeBadge = (mov: SobreMovement) => {
    if (mov.isCancelled) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-600 border border-stone-300 line-through">
          <Ban className="w-3 h-3 text-rose-500" />
          <span>Anulado</span>
        </span>
      );
    }

    switch (mov.type) {
      case 'TRANSICION':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
            <Scale className="w-3 h-3 text-amber-700" />
            <span>Saldo Transición</span>
          </span>
        );
      case 'SALDO_INICIAL':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Sparkles className="w-3 h-3" />
            <span>Saldo Inicial</span>
          </span>
        );
      case 'ENTRADA':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <ArrowDownLeft className="w-3 h-3 text-emerald-600" />
            <span>Entrada al Sobre</span>
          </span>
        );
      case 'GASTO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <ArrowUpRight className="w-3 h-3 text-rose-600" />
            <span>Gasto de Sobre</span>
          </span>
        );
      case 'CONTEO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
            <Calculator className="w-3 h-3 text-amber-700" />
            <span>Conteo Físico</span>
          </span>
        );
      case 'AJUSTE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <Scale className="w-3 h-3 text-purple-600" />
            <span>Ajuste Conciliación</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Toast de Éxito */}
      {successToast && (
        <div className="fixed bottom-5 right-5 z-50 p-4 bg-[#3A2418] text-[#FFF7EA] border border-[#C9974D] rounded-2xl shadow-xl flex items-center gap-3 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-[#C9974D] shrink-0" />
          <span className="text-xs sm:text-sm font-medium">{successToast}</span>
        </div>
      )}

      {/* Encabezado Principal */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#F4E3C8] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFF7EA] text-[#A86B3D] text-xs font-bold uppercase tracking-wider font-serif border border-[#F4E3C8]">
            <Mail className="w-3.5 h-3.5" />
            <span>Control de Resguardo Independiente</span>
          </div>
          <h1 className="font-serif font-bold text-2xl sm:text-3xl text-[#2B1B13]">
            Sobre / Resguardo de Efectivo
          </h1>
          <p className="text-xs sm:text-sm text-[#6B4028]">
            Dinero físico administrado y resguardado por la dueña, separado de la caja operativa de turnos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {userCanSetTransition && (
            <button
              type="button"
              onClick={handleOpenTransitionModal}
              title="Establecer saldo base de transición para inicio oficial del control digital"
              className="px-4 py-2.5 rounded-2xl bg-[#FFF7EA] hover:bg-[#F4E3C8] text-[#8C5828] hover:text-[#5A3416] font-bold text-xs sm:text-sm shadow-xs transition-all flex items-center gap-2 cursor-pointer active:scale-95 border border-[#C9974D]"
            >
              <BookmarkCheck className="w-4 h-4 text-[#C9974D]" />
              <span>Establecer saldo de transición</span>
            </button>
          )}

          {userCanRegister && (
            <>
              <button
                type="button"
                onClick={() => handleOpenAddModal('GASTO')}
                className="px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm shadow-sm transition-all flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>Gasto de Sobre</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenAddModal('ENTRADA')}
                className="px-4 py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs sm:text-sm shadow-sm transition-all flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <ArrowDownLeft className="w-4 h-4" />
                <span>Entrada al Sobre</span>
              </button>

              <button
                type="button"
                onClick={handleOpenCountModal}
                className="px-4 py-2.5 rounded-2xl bg-[#3A2418] hover:bg-[#4A2E1F] text-[#F4E3C8] hover:text-white font-bold text-xs sm:text-sm shadow-sm transition-all flex items-center gap-2 cursor-pointer active:scale-95 border border-[#C9974D]/30"
              >
                <Calculator className="w-4 h-4 text-[#C9974D]" />
                <span>Contar Sobre</span>
              </button>
            </>
          )}

          {userCanReconcile && summary.hasPendingDifference && (
            <button
              type="button"
              onClick={handleOpenReconcileModal}
              className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-bold text-xs sm:text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95 animate-pulse"
            >
              <Scale className="w-4 h-4" />
              <span>Conciliar Diferencia</span>
            </button>
          )}
        </div>
      </div>

      {/* Aviso para Empleados si no tienen permiso para ver saldo total */}
      {!userCanViewBalance ? (
        <div className="bg-amber-50 p-6 rounded-3xl border border-amber-200 text-center space-y-2">
          <Lock className="w-8 h-8 text-amber-700 mx-auto" />
          <h3 className="font-serif font-bold text-base text-amber-950">
            Saldo Reservado
          </h3>
          <p className="text-xs text-amber-900 max-w-md mx-auto">
            El saldo total y conciliación del Sobre están reservados para <strong>DUEÑA</strong>, <strong>ADMINISTRADOR</strong> y <strong>ENCARGADOS</strong> autorizados.
          </p>
        </div>
      ) : (
        /* Tarjetas Métricas Clave del Sobre */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Tarjeta Principal: Saldo Actual Teórico */}
          <div className="bg-gradient-to-br from-[#3A2418] to-[#24150E] text-[#FFF7EA] p-5 sm:p-6 rounded-3xl border border-[#4E3222] shadow-md space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#C9974D] font-bold uppercase tracking-wider font-serif">
                Saldo Actual del Sobre
              </span>
              <div className="w-8 h-8 rounded-xl bg-[#4A2E1F] border border-[#C9974D]/40 flex items-center justify-center text-[#C9974D]">
                <Mail className="w-4 h-4" />
              </div>
            </div>

            <div>
              <div className="text-3xl sm:text-4xl font-serif font-bold text-[#FFF7EA]">
                ${summary.currentTheoreticalBalance.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-[11px] text-[#F4E3C8]/80 font-light mt-1">
                Saldo teórico = Inicial + Entradas - Salidas + Ajustes
              </p>
            </div>

            {movements.length === 0 && (
              <button
                onClick={() => handleOpenAddModal('SALDO_INICIAL')}
                className="mt-2 text-xs text-[#C9974D] hover:underline font-bold flex items-center gap-1 cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Establecer Saldo Inicial</span>
              </button>
            )}
          </div>

          {/* Entradas Acumuladas */}
          <div className="bg-white p-5 rounded-3xl border border-[#F4E3C8] shadow-xs space-y-2 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#6B4028] uppercase tracking-wider font-serif">
                Entradas Acumuladas
              </span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center">
                <ArrowDownLeft className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-serif font-bold text-emerald-800">
                +${summary.totalInflows.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </div>
              {summary.initialBalance > 0 && (
                <p className="text-[11px] text-[#6B4028] mt-0.5">
                  Saldo inicial: ${summary.initialBalance.toLocaleString('es-MX')}
                </p>
              )}
            </div>
          </div>

          {/* Salidas Acumuladas */}
          <div className="bg-white p-5 rounded-3xl border border-[#F4E3C8] shadow-xs space-y-2 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#6B4028] uppercase tracking-wider font-serif">
                Salidas Acumuladas
              </span>
              <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 flex items-center justify-center">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-serif font-bold text-rose-700">
                -${summary.totalOutflows.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-[11px] text-[#6B4028] mt-0.5">
                Gastos pagados directo del Sobre
              </p>
            </div>
          </div>

          {/* Último Conteo Físico & Diferencia */}
          <div
            className={`p-5 rounded-3xl border shadow-xs space-y-2 flex flex-col justify-between transition-all ${
              summary.hasPendingDifference
                ? 'bg-amber-50/70 border-amber-300'
                : 'bg-white border-[#F4E3C8]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#6B4028] uppercase tracking-wider font-serif">
                Último Conteo Físico
              </span>
              <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 border border-amber-200 flex items-center justify-center">
                <Calculator className="w-4 h-4" />
              </div>
            </div>

            <div>
              {summary.lastPhysicalCount ? (
                <>
                  <div className="text-xl sm:text-2xl font-serif font-bold text-[#2B1B13]">
                    ${summary.lastPhysicalCount.physicalAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[11px] text-[#6B4028] mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>
                      {summary.lastPhysicalCount.date} {summary.lastPhysicalCount.time}
                    </span>
                    <span>•</span>
                    <span className="font-medium text-[#2B1B13]">
                      Por {summary.lastPhysicalCount.userName}
                    </span>
                  </div>

                  {/* Estado de Diferencia */}
                  {summary.hasPendingDifference ? (
                    <div className="mt-2 pt-2 border-t border-amber-200 flex items-center justify-between gap-1">
                      <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>Diferencia pendiente:</span>
                      </span>
                      <span className="text-xs font-bold font-mono text-amber-950 bg-amber-200/80 px-2 py-0.5 rounded-md">
                        {summary.pendingDifference >= 0 ? '+' : ''}
                        ${summary.pendingDifference.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-2 pt-2 border-t border-emerald-100 text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Cuadrado / Conciliado</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-[#A86B3D] italic py-1">
                  Sin conteos físicos registrados aún.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Banner de Control Digital Activo / Saldo de Transición */}
      {userCanViewBalance && summary.hasActiveTransition && (
        <div className="p-4 sm:p-5 bg-gradient-to-r from-[#FFF7EA] via-amber-50/80 to-[#FFF7EA] rounded-3xl border border-[#C9974D]/40 text-[#2B1B13] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800 shrink-0 mt-0.5">
              <BookmarkCheck className="w-5 h-5 text-amber-700" />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-serif font-bold text-sm sm:text-base text-[#3A2418]">
                  Control Digital Oficial Activo
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-200/90 text-amber-950 border border-amber-300 font-mono">
                  Base Operativa: ${summary.transitionBalance.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <p className="text-xs text-[#6B4028] max-w-2xl">
                Iniciado el <strong>{summary.transitionDate}</strong> a las {summary.transitionTime} por <strong>{summary.transitionUser}</strong>. Los movimientos y pruebas anteriores se conservan íntegros en el historial marcados como previos al inicio oficial.
              </p>
            </div>
          </div>

          {userCanSetTransition && (
            <button
              type="button"
              onClick={handleOpenTransitionModal}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-amber-100/60 text-[#8C5828] border border-[#C9974D]/50 font-bold text-xs shadow-2xs transition-all shrink-0 cursor-pointer flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#C9974D]" />
              <span>Actualizar Saldo de Transición</span>
            </button>
          )}
        </div>
      )}

      {/* Banner de Diferencia Pendiente de Aclarar (Si existe) */}
      {userCanViewBalance && summary.hasPendingDifference && (
        <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-50 via-amber-100/50 to-amber-50 rounded-3xl border-2 border-amber-300 text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-serif font-bold text-sm sm:text-base text-amber-950">
                  Diferencia pendiente de aclarar:{' '}
                  <span className="font-mono underline">
                    {summary.pendingDifference >= 0 ? '+' : ''}
                    ${summary.pendingDifference.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </span>
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900">
                  Requiere revisión
                </span>
              </div>
              <p className="text-xs text-amber-900 max-w-2xl">
                El último conteo físico arrojó una diferencia contra el saldo teórico. El saldo no ha sido alterado automáticamente para preservar la transparencia.
              </p>
            </div>
          </div>

          {userCanReconcile && (
            <button
              type="button"
              onClick={handleOpenReconcileModal}
              className="px-4 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs sm:text-sm shadow-xs transition-all shrink-0 cursor-pointer flex items-center gap-1.5"
            >
              <Scale className="w-4 h-4" />
              <span>Conciliar Ahora</span>
            </button>
          )}
        </div>
      )}

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A86B3D]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por concepto, persona, proveedor, categoría o responsable..."
            className="w-full pl-9 pr-4 py-2.5 bg-white rounded-2xl border border-[#F4E3C8] text-xs sm:text-sm text-[#2B1B13] focus:border-[#C9974D] focus:outline-hidden shadow-2xs"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'transicion', label: 'Transición' },
            { id: 'entradas', label: 'Entradas' },
            { id: 'gastos', label: 'Gastos' },
            { id: 'conteos', label: 'Conteos' },
            { id: 'ajustes', label: 'Ajustes' },
            { id: 'previos', label: 'Previos al inicio' },
            { id: 'anulados', label: 'Anulados' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilterType(f.id)}
              className={`px-3 py-2 rounded-xl font-bold transition-all shrink-0 cursor-pointer font-serif ${
                filterType === f.id
                  ? 'bg-[#3A2418] text-[#FFF7EA] shadow-xs'
                  : 'bg-white text-[#6B4028] border border-[#F4E3C8] hover:bg-[#FFF7EA]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla de Historial Cronológico de Movimientos */}
      <div className="bg-white rounded-3xl border border-[#F4E3C8] shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[#F4E3C8] bg-[#FFF7EA]/60 flex items-center justify-between">
          <h2 className="font-serif font-bold text-base sm:text-lg text-[#2B1B13] flex items-center gap-2">
            <Mail className="w-4 h-4 text-[#C9974D]" />
            <span>Historial de Movimientos del Sobre</span>
          </h2>
          <span className="text-xs text-[#6B4028]">
            {filteredMovements.length} registro{filteredMovements.length !== 1 ? 's' : ''}
          </span>
        </div>

        {filteredMovements.length === 0 ? (
          <div className="p-12 text-center text-[#A86B3D] space-y-3">
            <div className="w-14 h-14 rounded-3xl bg-[#FFF7EA] border border-[#F4E3C8] flex items-center justify-center mx-auto text-[#C9974D]">
              <Mail className="w-7 h-7" />
            </div>
            <div>
              <p className="font-serif font-bold text-base text-[#2B1B13]">
                No hay movimientos registrados
              </p>
              <p className="text-xs text-[#6B4028] max-w-md mx-auto mt-1">
                El módulo inicia limpio para que captures el saldo real y los movimientos del resguardo de efectivo.
              </p>
            </div>
            {userCanRegister && (
              <div className="pt-2 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenAddModal('SALDO_INICIAL')}
                  className="px-4 py-2 rounded-xl bg-[#3A2418] hover:bg-[#4A2E1F] text-[#F4E3C8] text-xs font-bold transition-all"
                >
                  Establecer Saldo Inicial
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenAddModal('GASTO')}
                  className="px-4 py-2 rounded-xl bg-[#C9974D] hover:bg-[#d6aa5f] text-[#3A2418] text-xs font-bold transition-all"
                >
                  + Registrar Gasto
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#F4E3C8] bg-[#FFF7EA]/40 text-[#6B4028] uppercase tracking-wider font-serif font-bold text-[11px]">
                  <th className="py-3.5 px-4">Fecha & Hora</th>
                  <th className="py-3.5 px-4">Tipo</th>
                  <th className="py-3.5 px-4">Concepto / Categoría</th>
                  <th className="py-3.5 px-4 text-right">Entrada</th>
                  <th className="py-3.5 px-4 text-right">Salida</th>
                  <th className="py-3.5 px-4 text-right">Saldo Posterior</th>
                  <th className="py-3.5 px-4">Responsable</th>
                  {userCanVoid && <th className="py-3.5 px-4 text-center">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4E3C8]/50">
                {filteredMovements.map((mov) => {
                  const isVoid = mov.isCancelled;
                  const isPreTransition = latestActiveTransition
                    ? new Date(mov.timestamp).getTime() <
                        new Date(latestActiveTransition.timestamp).getTime() &&
                      mov.id !== latestActiveTransition.id
                    : false;

                  return (
                    <tr
                      key={mov.id}
                      className={`hover:bg-[#FFF7EA]/50 transition-colors ${
                        isVoid
                          ? 'bg-stone-50/60 opacity-60'
                          : isPreTransition
                          ? 'bg-stone-50/40 text-stone-600'
                          : mov.type === 'TRANSICION'
                          ? 'bg-amber-50/40 font-semibold'
                          : ''
                      }`}
                    >
                      {/* Fecha y Hora */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-bold text-[#2B1B13]">{mov.date}</div>
                        <div className="text-[11px] text-[#A86B3D] flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{mov.time}</span>
                        </div>
                      </td>

                      {/* Tipo */}
                      <td className="py-3.5 px-4 whitespace-nowrap space-y-1">
                        <div>{getMovementTypeBadge(mov)}</div>
                        {isPreTransition && !isVoid && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold bg-stone-100 text-stone-600 border border-stone-300">
                            <History className="w-2.5 h-2.5 text-stone-500" />
                            <span>Previo al inicio oficial</span>
                          </span>
                        )}
                      </td>

                      {/* Concepto & Categoría & Persona */}
                      <td className="py-3.5 px-4 max-w-xs sm:max-w-md">
                        <div
                          className={`font-bold text-xs ${
                            isVoid ? 'line-through text-stone-500' : 'text-[#2B1B13]'
                          }`}
                        >
                          {mov.concept}
                        </div>

                        <div className="text-[11px] text-[#6B4028] mt-0.5 flex items-center gap-2 flex-wrap">
                          {mov.category && (
                            <span className="px-2 py-0.5 bg-[#FFF7EA] rounded-md border border-[#F4E3C8] text-[#A86B3D] font-medium">
                              {mov.category}
                            </span>
                          )}
                          {mov.personOrVendor && (
                            <span className="text-[#3A2418]">
                              Persona/Prov: <strong>{mov.personOrVendor}</strong>
                            </span>
                          )}
                        </div>

                        {mov.notes && (
                          <p className="text-[11px] text-[#8C5D3D] italic mt-0.5">
                            "{mov.notes}"
                          </p>
                        )}

                        {/* Detalle si es Conteo Físico */}
                        {mov.type === 'CONTEO' && (
                          <div className="mt-1 p-2 rounded-xl bg-amber-50/80 border border-amber-200 text-[11px] text-amber-950 font-mono">
                            <span>Teórico: ${mov.theoreticalBalanceAtCount?.toLocaleString('es-MX')}</span>
                            <span className="mx-1.5">•</span>
                            <span>Físico: ${mov.physicalCountedAmount?.toLocaleString('es-MX')}</span>
                            <span className="mx-1.5">•</span>
                            <span className="font-bold">
                              Dif: {(mov.countDifference ?? 0) >= 0 ? '+' : ''}$
                              {(mov.countDifference ?? 0).toLocaleString('es-MX')}
                            </span>
                          </div>
                        )}

                        {/* Si fue Anulado */}
                        {isVoid && (
                          <div className="mt-1 p-2 rounded-xl bg-rose-50 border border-rose-200 text-[11px] text-rose-900">
                            <strong>Anulado por {mov.cancelledBy}:</strong> "{mov.cancelReason}"
                          </div>
                        )}
                      </td>

                      {/* Entrada */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono font-bold text-emerald-700">
                        {mov.type === 'ENTRADA' || mov.type === 'SALDO_INICIAL' ? (
                          <span>+${mov.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                        ) : mov.type === 'AJUSTE' && mov.amount > 0 ? (
                          <span className="text-purple-700">+${mov.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                        ) : (
                          <span className="text-stone-300">—</span>
                        )}
                      </td>

                      {/* Salida */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono font-bold text-rose-700">
                        {mov.type === 'GASTO' ? (
                          <span>-${mov.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                        ) : mov.type === 'AJUSTE' && mov.amount < 0 ? (
                          <span className="text-purple-700">-${Math.abs(mov.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                        ) : (
                          <span className="text-stone-300">—</span>
                        )}
                      </td>

                      {/* Saldo Posterior */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono">
                        {userCanViewBalance ? (
                          <span className={`font-bold ${isVoid ? 'line-through text-stone-400' : 'text-[#2B1B13]'}`}>
                            ${mov.resultingBalance.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-stone-400">****</span>
                        )}
                      </td>

                      {/* Responsable */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-medium text-[#2B1B13] flex items-center gap-1">
                          <User className="w-3 h-3 text-[#C9974D]" />
                          <span>{mov.userName}</span>
                        </div>
                        <div className="text-[10px] text-[#A86B3D] uppercase tracking-wider">
                          {mov.userRole}
                        </div>
                      </td>

                      {/* Acciones (Anular) */}
                      {userCanVoid && (
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          {!isVoid && (
                            <button
                              type="button"
                              onClick={() => handleOpenCancelModal(mov)}
                              className="p-1.5 rounded-lg text-[#8C5D3D] hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-all cursor-pointer"
                              title="Anular movimiento (No borra, conserva historial)"
                            >
                              <Ban className="w-3.5 h-3.5 text-rose-500" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: REGISTRAR MOVIMIENTO (ENTRADA / GASTO / SALDO INICIAL) */}
      {/* ========================================================================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-[#F4E3C8] shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-[#3A2418] text-[#FFF7EA] p-5 sm:p-6 flex items-center justify-between border-b border-[#4E3222]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-[#4A2E1F] border border-[#C9974D]/40 flex items-center justify-center text-[#C9974D]">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-lg text-white">
                    Registrar Movimiento en Sobre
                  </h3>
                  <p className="text-xs text-[#F4E3C8]">
                    Afecta exclusivamente el saldo físico en resguardo de la dueña.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 text-[#F4E3C8] hover:text-white hover:bg-[#4A2E1F] rounded-xl transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formulario */}
            <form onSubmit={handleSaveMovement} className="p-5 sm:p-6 space-y-4">
              {/* Selector de Tipo */}
              <div>
                <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1.5 font-serif">
                  Tipo de Movimiento *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormType('GASTO');
                      setFormCategory('Retiro dueña');
                    }}
                    className={`py-2.5 px-3 rounded-2xl font-bold text-xs flex flex-col items-center gap-1 transition-all border cursor-pointer ${
                      formType === 'GASTO'
                        ? 'bg-rose-50 border-rose-300 text-rose-800 shadow-xs'
                        : 'bg-white border-[#F4E3C8] text-[#6B4028] hover:bg-[#FFF7EA]'
                    }`}
                  >
                    <ArrowUpRight className="w-4 h-4 text-rose-600" />
                    <span>Gasto de Sobre</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFormType('ENTRADA');
                      setFormCategory('Aportación dueña');
                    }}
                    className={`py-2.5 px-3 rounded-2xl font-bold text-xs flex flex-col items-center gap-1 transition-all border cursor-pointer ${
                      formType === 'ENTRADA'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-xs'
                        : 'bg-white border-[#F4E3C8] text-[#6B4028] hover:bg-[#FFF7EA]'
                    }`}
                  >
                    <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
                    <span>Entrada al Sobre</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFormType('SALDO_INICIAL');
                      setFormConcept('Saldo inicial del Sobre');
                    }}
                    className={`py-2.5 px-3 rounded-2xl font-bold text-xs flex flex-col items-center gap-1 transition-all border cursor-pointer ${
                      formType === 'SALDO_INICIAL'
                        ? 'bg-blue-50 border-blue-300 text-blue-900 shadow-xs'
                        : 'bg-white border-[#F4E3C8] text-[#6B4028] hover:bg-[#FFF7EA]'
                    }`}
                  >
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    <span>Saldo Inicial</span>
                  </button>
                </div>
              </div>

              {/* Banner Aclaratorio de No Afectación a Turnos */}
              <div className="p-3 bg-[#FFF7EA] rounded-2xl border border-[#F4E3C8] text-[11px] text-[#6B4028] flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-[#C9974D] shrink-0 mt-0.5" />
                <span>
                  <strong>Independencia total:</strong> Este registro no afecta la caja operativa del turno activo ni se contabiliza como gasto operativo de caja.
                </span>
              </div>

              {/* Monto y Categoría */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                    Monto ($ MXN) *
                  </label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#A86B3D]" />
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-9 pr-3 py-2.5 bg-white rounded-xl border border-[#F4E3C8] text-sm text-[#2B1B13] font-bold font-mono focus:border-[#C9974D] focus:outline-hidden"
                    />
                  </div>
                </div>

                {formType !== 'SALDO_INICIAL' && (
                  <div>
                    <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                      Categoría *
                    </label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white rounded-xl border border-[#F4E3C8] text-xs text-[#2B1B13] font-medium focus:border-[#C9974D] focus:outline-hidden"
                    >
                      {formType === 'GASTO'
                        ? OUTFLOW_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))
                        : INFLOW_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Concepto */}
              <div>
                <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                  Concepto *
                </label>
                <input
                  type="text"
                  required
                  value={formConcept}
                  onChange={(e) => setFormConcept(e.target.value)}
                  placeholder={
                    formType === 'GASTO'
                      ? 'Ej. Retiro dueña / Adelanto de nómina a Liz / Pago verduras'
                      : formType === 'ENTRADA'
                      ? 'Ej. Aportación personal dueña / Reembolso / Ingreso resguardo'
                      : 'Ej. Fondo inicial en resguardo'
                  }
                  className="w-full px-3 py-2.5 bg-white rounded-xl border border-[#F4E3C8] text-xs text-[#2B1B13] font-medium focus:border-[#C9974D] focus:outline-hidden"
                />
              </div>

              {/* Persona / Proveedor (Opcional) */}
              <div>
                <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                  Persona o Proveedor <span className="text-stone-400 font-normal">(Opcional)</span>
                </label>
                <input
                  type="text"
                  value={formPersonOrVendor}
                  onChange={(e) => setFormPersonOrVendor(e.target.value)}
                  placeholder="Ej. Alondra / Liz / Don Pancho / Carnicería..."
                  className="w-full px-3 py-2 bg-white rounded-xl border border-[#F4E3C8] text-xs text-[#2B1B13] focus:border-[#C9974D] focus:outline-hidden"
                />
              </div>

              {/* Nota Opcional */}
              <div>
                <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                  Nota / Observaciones <span className="text-stone-400 font-normal">(Opcional)</span>
                </label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Comentarios adicionales..."
                  className="w-full px-3 py-2 bg-white rounded-xl border border-[#F4E3C8] text-xs text-[#2B1B13] focus:border-[#C9974D] focus:outline-hidden"
                />
              </div>

              {/* Error */}
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs font-medium flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Footer con Responsable y Botones */}
              <div className="pt-2 border-t border-[#F4E3C8] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span className="text-[11px] text-[#8C5D3D]">
                  Registra: <strong>{currentUser.name}</strong> ({currentUser.role})
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-[#3A2418] hover:bg-[#4A2E1F] text-[#FFF7EA] font-bold text-xs shadow-md transition-all cursor-pointer"
                  >
                    Guardar Movimiento
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: CONTEO FÍSICO DEL SOBRE */}
      {/* ========================================================================= */}
      {isCountModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-[#F4E3C8] shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-[#3A2418] text-[#FFF7EA] p-5 sm:p-6 flex items-center justify-between border-b border-[#4E3222]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-[#4A2E1F] border border-[#C9974D]/40 flex items-center justify-center text-[#C9974D]">
                  <Calculator className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-lg text-white">
                    Conteo Físico del Sobre
                  </h3>
                  <p className="text-xs text-[#F4E3C8]">
                    Compara el dinero en mano contra el saldo teórico registrado.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCountModalOpen(false)}
                className="p-1.5 text-[#F4E3C8] hover:text-white hover:bg-[#4A2E1F] rounded-xl transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCount} className="p-5 sm:p-6 space-y-4">
              {/* Comparador Visual */}
              <div className="p-4 bg-[#FFF7EA] rounded-2xl border border-[#F4E3C8] space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#6B4028] font-serif font-bold">Saldo Teórico Registrado:</span>
                  <span className="font-mono font-bold text-sm text-[#2B1B13]">
                    ${summary.currentTheoreticalBalance.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                    Efectivo Físico Contado ($ MXN) *
                  </label>
                  <div className="relative">
                    <DollarSign className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-[#A86B3D]" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      autoFocus
                      value={countPhysicalAmount}
                      onChange={(e) => setCountPhysicalAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-10 pr-4 py-3 bg-white rounded-xl border-2 border-[#C9974D] text-base text-[#2B1B13] font-bold font-mono focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Cálculo Dinámico de Diferencia */}
                {countPhysicalAmount !== '' && !isNaN(parseFloat(countPhysicalAmount)) && (
                  (() => {
                    const physical = parseFloat(countPhysicalAmount);
                    const theoretical = summary.currentTheoreticalBalance;
                    const diff = physical - theoretical;
                    const isZero = Math.abs(diff) < 0.001;
                    return (
                      <div
                        className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                          isZero
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : diff > 0
                            ? 'bg-blue-50 border-blue-200 text-blue-900'
                            : 'bg-rose-50 border-rose-200 text-rose-900'
                        }`}
                      >
                        <span className="font-bold">
                          {isZero ? '✓ Cuadre exacto:' : diff > 0 ? 'Sobrante:' : 'Faltante:'}
                        </span>
                        <span className="font-mono font-bold text-sm">
                          {diff >= 0 ? '+' : ''}${diff.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    );
                  })()
                )}
              </div>

              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-[11px] text-stone-600 space-y-1">
                <p>
                  <strong>Importante:</strong> El conteo físico <em>NO</em> modifica automáticamente el saldo teórico ni lo oculta.
                </p>
                <p>
                  Si existe alguna diferencia, quedará registrada como <strong>Diferencia pendiente de aclarar</strong> para auditoría.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                  Observaciones del Conteo <span className="text-stone-400 font-normal">(Opcional)</span>
                </label>
                <input
                  type="text"
                  value={countNotes}
                  onChange={(e) => setCountNotes(e.target.value)}
                  placeholder="Ej. Billetes contados por Alondra en presencia de Gio..."
                  className="w-full px-3 py-2 bg-white rounded-xl border border-[#F4E3C8] text-xs text-[#2B1B13] focus:border-[#C9974D] focus:outline-hidden"
                />
              </div>

              {countError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs font-medium flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{countError}</span>
                </div>
              )}

              <div className="pt-2 border-t border-[#F4E3C8] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCountModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#3A2418] hover:bg-[#4A2E1F] text-[#FFF7EA] font-bold text-xs shadow-md transition-all cursor-pointer"
                >
                  Guardar Conteo Físico
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: CONCILIAR DIFERENCIA (DUEÑA O ADMINISTRADOR) */}
      {/* ========================================================================= */}
      {isReconcileModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-[#F4E3C8] shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-[#3A2418] text-[#FFF7EA] p-5 sm:p-6 flex items-center justify-between border-b border-[#4E3222]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-[#4A2E1F] border border-[#C9974D]/40 flex items-center justify-center text-[#C9974D]">
                  <Scale className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-lg text-white">
                    Conciliar Diferencia de Sobre
                  </h3>
                  <p className="text-xs text-[#F4E3C8]">
                    Ajuste auditado exclusivo para Dueña y Administrador.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsReconcileModalOpen(false)}
                className="p-1.5 text-[#F4E3C8] hover:text-white hover:bg-[#4A2E1F] rounded-xl transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveReconcile} className="p-5 sm:p-6 space-y-4">
              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-950 space-y-2">
                <p>
                  <strong>Regla de Trazabilidad:</strong> Nunca se realizan ajustes silenciosos. Esta acción registrará un movimiento de conciliación en el Sobre y en la Bitácora de Auditoría.
                </p>
                <p>
                  Saldo teórico actual: <strong>${summary.currentTheoreticalBalance.toLocaleString('es-MX')}</strong>
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                  Monto del Ajuste ($ MXN) * <span className="text-stone-400 font-normal">(Positivo para sumar, negativo para restar)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={reconcileAmount}
                  onChange={(e) => setReconcileAmount(e.target.value)}
                  placeholder="Ej. -246.00 o +150.00"
                  className="w-full px-3.5 py-2.5 bg-white rounded-xl border border-[#F4E3C8] text-sm text-[#2B1B13] font-bold font-mono focus:border-[#C9974D] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                  Motivo de la Conciliación *
                </label>
                <textarea
                  required
                  rows={3}
                  value={reconcileReason}
                  onChange={(e) => setReconcileReason(e.target.value)}
                  placeholder="Ej. Diferencia detectada durante conteo físico del sobre por billete no registrado / redondeo aclarado..."
                  className="w-full px-3 py-2.5 bg-white rounded-xl border border-[#F4E3C8] text-xs text-[#2B1B13] focus:border-[#C9974D] focus:outline-hidden"
                />
              </div>

              {reconcileError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs font-medium flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{reconcileError}</span>
                </div>
              )}

              <div className="pt-2 border-t border-[#F4E3C8] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsReconcileModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                >
                  Aplicar Conciliación
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: ANULAR MOVIMIENTO (DUEÑA O ADMINISTRADOR) */}
      {/* ========================================================================= */}
      {isCancelModalOpen && movementToCancel && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-[#F4E3C8] shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-rose-900 text-white p-5 sm:p-6 flex items-center justify-between border-b border-rose-950">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-rose-800 flex items-center justify-center text-white">
                  <Ban className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-lg text-white">
                    Anular Movimiento del Sobre
                  </h3>
                  <p className="text-xs text-rose-200">
                    No se borra: se conserva con estado Anulado y se revierte el saldo.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                className="p-1.5 text-rose-200 hover:text-white rounded-xl transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCancel} className="p-5 sm:p-6 space-y-4">
              <div className="p-3.5 bg-[#FFF7EA] rounded-2xl border border-[#F4E3C8] text-xs text-[#2B1B13] space-y-1">
                <div className="font-bold font-serif">{movementToCancel.concept}</div>
                <div className="text-[11px] text-[#6B4028]">
                  Monto: <strong>${movementToCancel.amount.toLocaleString('es-MX')}</strong> • Tipo: {movementToCancel.type}
                </div>
                <div className="text-[11px] text-[#A86B3D]">
                  Registrado por {movementToCancel.userName} el {movementToCancel.date} {movementToCancel.time}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                  Motivo de Anulación *
                </label>
                <textarea
                  required
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Ej. Captura duplicada / Monto erróneo..."
                  className="w-full px-3 py-2.5 bg-white rounded-xl border border-[#F4E3C8] text-xs text-[#2B1B13] focus:border-rose-500 focus:outline-hidden"
                />
              </div>

              {cancelError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs font-medium flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{cancelError}</span>
                </div>
              )}

              <div className="pt-2 border-t border-[#F4E3C8] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCancelModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                >
                  Confirmar Anulación
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: ESTABLECER SALDO DE TRANSICIÓN (DUEÑA O ADMINISTRADOR) */}
      {/* ========================================================================= */}
      {isTransitionModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-[#F4E3C8] shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-[#3A2418] text-[#FFF7EA] p-5 sm:p-6 flex items-center justify-between border-b border-[#4E3222]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-[#4A2E1F] border border-[#C9974D]/40 flex items-center justify-center text-[#C9974D]">
                  <BookmarkCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-lg text-white">
                    Establecer Saldo de Transición
                  </h3>
                  <p className="text-xs text-[#F4E3C8]">
                    Inicio oficial del control digital del Sobre (Exclusivo Dueña / Admin)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTransitionModalOpen(false)}
                className="p-1.5 text-[#F4E3C8] hover:text-white hover:bg-[#4A2E1F] rounded-xl transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formulario */}
            <form onSubmit={handleSaveTransition} className="p-5 sm:p-6 space-y-4">
              {/* Caja informativa de reglas del saldo de transición */}
              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-950 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>¿Cómo funciona el Saldo de Transición?</span>
                </div>
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-amber-900">
                  <li>
                    Establece el efectivo físico contado como <strong>nuevo saldo base operativo</strong> del Sobre.
                  </li>
                  <li>
                    <strong>NO</strong> se refleja como faltante, sobrante, ingreso ni gasto.
                  </li>
                  <li>
                    Conserva íntegros los movimientos y pruebas anteriores en el historial, marcados como <em>"Previos al inicio oficial"</em>.
                  </li>
                  <li>
                    <strong>No afecta</strong> Caja de turno, Gastos operativos, CXC ni Inventario.
                  </li>
                </ul>
              </div>

              {/* Efectivo Físico Contado */}
              <div>
                <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                  Efectivo Físico Contado Actualmente ($ MXN) *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-bold text-[#A86B3D]">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    autoFocus
                    value={transitionPhysicalAmount}
                    onChange={(e) => setTransitionPhysicalAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-4 py-2.5 bg-white rounded-xl border border-[#F4E3C8] text-base text-[#2B1B13] font-bold font-mono focus:border-[#C9974D] focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Responsable & Fecha/Hora automáticas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-[#FFF7EA] rounded-2xl border border-[#F4E3C8] text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#8C5D3D] block">
                    Responsable
                  </span>
                  <div className="font-bold text-[#2B1B13] flex items-center gap-1 mt-0.5">
                    <User className="w-3.5 h-3.5 text-[#C9974D]" />
                    <span>{currentUser.name} ({currentUser.role})</span>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#8C5D3D] block">
                    Fecha & Hora Automáticas
                  </span>
                  <div className="font-bold text-[#2B1B13] flex items-center gap-1 mt-0.5">
                    <Clock className="w-3.5 h-3.5 text-[#C9974D]" />
                    <span>{formatLocalDate(new Date())} {formatLocalTime(new Date())}</span>
                  </div>
                </div>
              </div>

              {/* Motivo Obligatorio */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-[#6B4028] uppercase tracking-wider font-serif">
                    Motivo de Transición *
                  </label>
                  <button
                    type="button"
                    onClick={() => setTransitionReason(SUGGESTED_TRANSITION_REASON)}
                    className="text-[10px] text-[#A86B3D] hover:text-[#3A2418] underline font-medium cursor-pointer"
                  >
                    Restaurar motivo sugerido
                  </button>
                </div>
                <textarea
                  required
                  rows={3}
                  value={transitionReason}
                  onChange={(e) => setTransitionReason(e.target.value)}
                  placeholder="Motivo obligatorio..."
                  className="w-full px-3 py-2.5 bg-white rounded-xl border border-[#F4E3C8] text-xs text-[#2B1B13] focus:border-[#C9974D] focus:outline-hidden"
                />
              </div>

              {/* Error */}
              {transitionError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs font-medium flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{transitionError}</span>
                </div>
              )}

              {/* Botones de acción */}
              <div className="pt-2 border-t border-[#F4E3C8] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsTransitionModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#3A2418] hover:bg-[#4A2E1F] text-[#FFF7EA] font-bold text-xs shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <BookmarkCheck className="w-4 h-4 text-[#C9974D]" />
                  <span>Establecer Saldo Base Oficial</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
