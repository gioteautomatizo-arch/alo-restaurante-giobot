import React, { useState } from 'react';
import { StaffUser, CxcRecord, CxcStatus } from '../../types';
import {
  getCxcList,
  addCxc,
  markCxcAsPaid,
  toggleCxcStatus,
  cancelCxc,
  getHTMLInputDateToday,
  formatLocalDate,
} from '../../lib/adminStorage';
import {
  CreditCard,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  User,
  DollarSign,
  Calendar,
  FileText,
  Ban,
  AlertTriangle,
  XCircle,
} from 'lucide-react';

interface CxcViewProps {
  currentUser: StaffUser;
  onRefreshStats?: () => void;
}

export const CxcView: React.FC<CxcViewProps> = ({
  currentUser,
  onRefreshStats,
}) => {
  const [cxcList, setCxcList] = useState<CxcRecord[]>(getCxcList());
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | CxcStatus>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states for New CXC
  const [person, setPerson] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [concept, setConcept] = useState<string>('');
  const [date, setDate] = useState<string>(getHTMLInputDateToday());
  const [notes, setNotes] = useState<string>('');

  // Form states for Cancel CXC (Anulación)
  const [isCancelModalOpen, setIsCancelModalOpen] = useState<boolean>(false);
  const [cxcToCancel, setCxcToCancel] = useState<CxcRecord | null>(null);
  const [cancellationReason, setCancellationReason] = useState<string>('');
  const [cancelError, setCancelError] = useState<string | null>(null);

  const refreshData = () => {
    setCxcList(getCxcList());
    if (onRefreshStats) onRefreshStats();
  };

  React.useEffect(() => {
    const handleDataChange = () => {
      setCxcList(getCxcList());
    };
    window.addEventListener('alo_admin_data_updated', handleDataChange);
    window.addEventListener('storage', handleDataChange);
    return () => {
      window.removeEventListener('alo_admin_data_updated', handleDataChange);
      window.removeEventListener('storage', handleDataChange);
    };
  }, []);

  const showNotification = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  const handleCreateCxc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!person.trim() || !amount || Number(amount) <= 0 || !concept.trim()) {
      alert('Por favor completa todos los campos requeridos con datos válidos.');
      return;
    }

    try {
      await addCxc(
        {
          person: person.trim(),
          amount: Number(amount),
          concept: concept.trim(),
          date: date ? formatLocalDate(date) : formatLocalDate(new Date()),
          notes: notes.trim() || undefined,
        },
        currentUser
      );

      // Reset form
      setPerson('');
      setAmount('');
      setConcept('');
      setDate(getHTMLInputDateToday());
      setNotes('');
      setIsAddModalOpen(false);

      showNotification('¡Cuenta por cobrar (CXC) registrada exitosamente en Bitácora!');
      refreshData();
    } catch (err: any) {
      alert(err.message || 'Error al registrar CXC.');
    }
  };

  const handleMarkAsPaid = async (cxc: CxcRecord) => {
    try {
      await markCxcAsPaid(cxc.id, currentUser);
      showNotification(`¡CXC de "${cxc.person}" marcada como Pagada!`);
      refreshData();
    } catch (err: any) {
      alert(err.message || 'Error al actualizar CXC.');
    }
  };

  const handleToggleStatus = async (cxc: CxcRecord) => {
    if (cxc.status === 'Anulado') return;
    try {
      const updated = await toggleCxcStatus(cxc.id, currentUser);
      if (updated) {
        showNotification(`Estado de "${cxc.person}" actualizado a: ${updated.status}`);
        refreshData();
      }
    } catch (err: any) {
      alert(err.message || 'Error al cambiar estado.');
    }
  };

  const openCancelModal = (cxc: CxcRecord) => {
    if (currentUser.role !== 'DUEÑA' && currentUser.role !== 'ADMINISTRADOR') {
      alert('Encargados y empleados no pueden anular CXC. Se requiere rol de DUEÑA o ADMINISTRADOR.');
      return;
    }
    setCxcToCancel(cxc);
    setCancellationReason('');
    setCancelError(null);
    setIsCancelModalOpen(true);
  };

  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cxcToCancel) return;

    if (!cancellationReason.trim()) {
      setCancelError('Debes indicar el motivo de la anulación.');
      return;
    }

    try {
      await cancelCxc(cxcToCancel.id, cancellationReason.trim(), currentUser);
      setIsCancelModalOpen(false);
      setCxcToCancel(null);
      setCancellationReason('');
      setCancelError(null);
      showNotification(`¡CXC de "${cxcToCancel.person}" anulada correctamente y registrada en Bitácora!`);
      refreshData();
    } catch (err: any) {
      setCancelError(err.message || 'Error al anular CXC.');
    }
  };

  // Metrics
  const pendingRecords = cxcList.filter((c) => c.status === 'Pendiente');
  const paidRecords = cxcList.filter((c) => c.status === 'Pagado');
  const cancelledRecords = cxcList.filter((c) => c.status === 'Anulado');
  const totalPendingAmount = pendingRecords.reduce((sum, c) => sum + c.amount, 0);
  const totalPaidAmount = paidRecords.reduce((sum, c) => sum + c.amount, 0);

  // Filtered List
  const filteredList = cxcList.filter((item) => {
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchesSearch =
      !searchTerm ||
      item.person.toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
      item.concept.toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
      (item.notes && item.notes.toLowerCase().includes(searchTerm.toLowerCase().trim())) ||
      (item.cancellationReason && item.cancellationReason.toLowerCase().includes(searchTerm.toLowerCase().trim()));
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs sm:text-sm font-medium flex items-center gap-2 animate-in fade-in shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Header & Main Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-3xl border border-[#F4E3C8] shadow-xs">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFF7EA] text-[#A86B3D] text-xs font-bold uppercase tracking-wider mb-1 font-serif border border-[#F4E3C8]">
            <CreditCard className="w-3.5 h-3.5" />
            <span>Módulo Independiente</span>
          </div>
          <h2 className="font-serif font-bold text-xl sm:text-2xl text-[#2B1B13]">
            Cuentas por Cobrar (CXC)
          </h2>
          <p className="text-xs text-[#6B4028] mt-0.5">
            Registro y control de consumos, pedidos de confianza y deudas pendientes de cobro con trazabilidad en Bitácora.
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-5 py-3 rounded-2xl bg-[#3A2418] hover:bg-[#4A2E1F] text-[#FFF7EA] font-serif font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4 text-[#C9974D]" />
          <span>Nueva CXC</span>
        </button>
      </div>

      {/* Tarjetas Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Pendientes (Tarjeta Principal Destacada) */}
        <div className="bg-[#3A2418] text-[#FFF7EA] p-5 rounded-3xl border border-[#4E3222] shadow-md relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#C9974D] uppercase tracking-wider font-serif">
              Total de CXC Pendientes
            </span>
            <div className="w-8 h-8 rounded-xl bg-[#4A2E1F] border border-[#C9974D]/40 text-[#C9974D] flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="font-serif font-black text-2xl sm:text-3xl text-white block">
              ${totalPendingAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-[#F4E3C8] block mt-1">
              {pendingRecords.length} {pendingRecords.length === 1 ? 'cuenta por cobrar' : 'cuentas por cobrar'} por liquidar
            </span>
          </div>
        </div>

        {/* Total Pagadas */}
        <div className="bg-white p-5 rounded-3xl border border-[#F4E3C8] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider font-serif">
              Total Pagadas / Cobradas
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="font-serif font-black text-2xl text-emerald-900 block">
              ${totalPaidAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-[#6B4028] block mt-1">
              {paidRecords.length} {paidRecords.length === 1 ? 'cuenta saldada' : 'cuentas saldadas'}
            </span>
          </div>
        </div>

        {/* Total de Registros */}
        <div className="bg-white p-5 rounded-3xl border border-[#F4E3C8] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#A86B3D] uppercase tracking-wider font-serif">
              Historial Total
            </span>
            <div className="w-8 h-8 rounded-xl bg-[#FFF7EA] text-[#3A2418] border border-[#F4E3C8] flex items-center justify-center">
              <FileText className="w-4 h-4 text-[#A86B3D]" />
            </div>
          </div>
          <div className="mt-3">
            <span className="font-serif font-black text-2xl text-[#2B1B13] block">
              {cxcList.length} <span className="text-sm font-normal text-[#6B4028]">registros</span>
            </span>
            <span className="text-xs text-[#6B4028] block mt-1">
              {pendingRecords.length} pendientes • {paidRecords.length} pagadas
              {cancelledRecords.length > 0 && ` • ${cancelledRecords.length} anuladas`}
            </span>
          </div>
        </div>
      </div>

      {/* Búsqueda y Filtros de Estado */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A86B3D]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por persona, oficina, concepto o motivo de anulación..."
            className="w-full pl-9 pr-4 py-2.5 bg-white rounded-2xl border border-[#F4E3C8] text-xs sm:text-sm text-[#2B1B13] focus:border-[#3A2418] focus:outline-hidden shadow-2xs"
          />
        </div>

        <div className="inline-flex p-1 bg-white rounded-2xl border border-[#F4E3C8] shadow-2xs shrink-0 self-start sm:self-auto overflow-x-auto">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-serif font-bold transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-[#3A2418] text-white shadow-xs'
                : 'text-[#6B4028] hover:bg-[#FFF7EA]'
            }`}
          >
            Todos ({cxcList.length})
          </button>
          <button
            onClick={() => setStatusFilter('Pendiente')}
            className={`px-3 py-1.5 rounded-xl text-xs font-serif font-bold transition-all flex items-center gap-1 cursor-pointer ${
              statusFilter === 'Pendiente'
                ? 'bg-amber-800 text-white shadow-xs'
                : 'text-[#6B4028] hover:bg-[#FFF7EA]'
            }`}
          >
            <Clock className="w-3 h-3 text-[#C9974D]" />
            <span>Pendientes ({pendingRecords.length})</span>
          </button>
          <button
            onClick={() => setStatusFilter('Pagado')}
            className={`px-3 py-1.5 rounded-xl text-xs font-serif font-bold transition-all flex items-center gap-1 cursor-pointer ${
              statusFilter === 'Pagado'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'text-[#6B4028] hover:bg-[#FFF7EA]'
            }`}
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>Pagadas ({paidRecords.length})</span>
          </button>
          <button
            onClick={() => setStatusFilter('Anulado')}
            className={`px-3 py-1.5 rounded-xl text-xs font-serif font-bold transition-all flex items-center gap-1 cursor-pointer ${
              statusFilter === 'Anulado'
                ? 'bg-rose-900 text-white shadow-xs'
                : 'text-[#6B4028] hover:bg-[#FFF7EA]'
            }`}
          >
            <Ban className="w-3 h-3 text-rose-300" />
            <span>Anuladas ({cancelledRecords.length})</span>
          </button>
        </div>
      </div>

      {/* Listado / Tabla de CXC */}
      <div className="bg-white rounded-3xl border border-[#F4E3C8] shadow-xs overflow-hidden">
        {/* Table Header (Desktop) */}
        <div className="hidden md:grid grid-cols-12 gap-3 bg-[#3A2418] text-[#FFF7EA] px-6 py-3.5 text-xs font-bold uppercase tracking-wider border-b border-[#4E3222] font-serif items-center">
          <div className="col-span-3">Persona / Cliente</div>
          <div className="col-span-3">Concepto</div>
          <div className="col-span-2 text-center">Fecha</div>
          <div className="col-span-2 text-right">Monto</div>
          <div className="col-span-2 text-center">Estado / Acción</div>
        </div>

        {filteredList.length === 0 ? (
          <div className="py-12 text-center p-6 space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#FFF7EA] text-[#A86B3D] flex items-center justify-center text-xl mx-auto border border-[#F4E3C8]">
              🔍
            </div>
            <h3 className="font-serif font-bold text-base text-[#2B1B13]">No se encontraron cuentas por cobrar</h3>
            <p className="text-xs text-[#6B4028] max-w-xs mx-auto">
              No hay registros que coincidan con la búsqueda o filtro seleccionado.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#F4E3C8]/50">
            {filteredList.map((item) => {
              const isPending = item.status === 'Pendiente';
              const isPaid = item.status === 'Pagado';
              const isCancelled = item.status === 'Anulado';

              return (
                <div
                  key={item.id}
                  className={`p-4 sm:p-5 transition-colors flex flex-col md:grid md:grid-cols-12 md:gap-3 md:items-center space-y-3 md:space-y-0 ${
                    isCancelled
                      ? 'bg-stone-50/80 opacity-85 hover:bg-stone-100/60'
                      : isPending
                      ? 'bg-[#FFFDF9] hover:bg-[#FFF7EA]/30'
                      : 'hover:bg-[#FFF7EA]/30'
                  }`}
                >
                  {/* Persona */}
                  <div className="md:col-span-3">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          isCancelled
                            ? 'bg-rose-100 text-rose-900 border border-rose-200'
                            : isPending
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                        }`}
                      >
                        {isCancelled ? <Ban className="w-4 h-4 text-rose-700" /> : <User className="w-4 h-4" />}
                      </div>
                      <div>
                        <span
                          className={`font-serif font-bold text-sm block ${
                            isCancelled ? 'text-stone-600 line-through' : 'text-[#2B1B13]'
                          }`}
                        >
                          {item.person}
                        </span>
                        {item.registeredBy && (
                          <span className="text-[10px] text-[#A86B3D]">
                            Reg: {item.registeredBy}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Concepto */}
                  <div className="md:col-span-3">
                    <span
                      className={`text-xs sm:text-sm font-medium block ${
                        isCancelled ? 'text-stone-500' : 'text-[#2B1B13]'
                      }`}
                    >
                      {item.concept}
                    </span>
                    {item.notes && (
                      <span className="text-[11px] text-stone-500 italic block mt-0.5" title={item.notes}>
                        Nota: {item.notes}
                      </span>
                    )}
                    {isCancelled && item.cancellationReason && (
                      <div className="mt-1 p-1.5 bg-rose-50 rounded-lg border border-rose-200 text-[11px] text-rose-900 flex items-start gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <strong>Anulado por {item.cancelledBy || 'Administrador'}:</strong> {item.cancellationReason}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Fecha */}
                  <div className="md:col-span-2 flex items-center md:justify-center gap-1.5 text-xs text-[#6B4028]">
                    <Calendar className="w-3.5 h-3.5 text-[#A86B3D]" />
                    <span>{formatLocalDate(item.date)}</span>
                  </div>

                  {/* Monto */}
                  <div className="md:col-span-2 flex items-center justify-between md:justify-end gap-1">
                    <span className="text-xs text-[#6B4028] md:hidden font-serif font-bold uppercase">
                      Monto:
                    </span>
                    <span
                      className={`font-serif font-black text-base sm:text-lg ${
                        isCancelled ? 'text-stone-400 line-through' : 'text-[#2B1B13]'
                      }`}
                    >
                      ${item.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  {/* Estado y Acciones */}
                  <div className="md:col-span-2 flex items-center justify-between md:justify-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-[#F4E3C8]">
                    {/* Badge de Estado */}
                    {isCancelled ? (
                      <span
                        className="inline-flex items-center gap-1 text-xs font-serif font-bold px-2.5 py-1 rounded-xl bg-rose-100 text-rose-900 border border-rose-300 cursor-default"
                        title={item.cancellationReason ? `Anulado: ${item.cancellationReason}` : 'Cuenta anulada'}
                      >
                        <Ban className="w-3 h-3 text-rose-700" />
                        <span>Anulado</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(item)}
                        className={`inline-flex items-center gap-1 text-xs font-serif font-bold px-2.5 py-1 rounded-xl border transition-all cursor-pointer ${
                          isPending
                            ? 'bg-amber-100 text-amber-950 border-amber-300 hover:bg-amber-200'
                            : 'bg-emerald-100 text-emerald-950 border-emerald-300 hover:bg-emerald-200'
                        }`}
                        title="Clic para cambiar entre Pendiente y Pagado"
                      >
                        {isPending ? (
                          <>
                            <Clock className="w-3 h-3 text-amber-700" />
                            <span>Pendiente</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                            <span>Pagado</span>
                          </>
                        )}
                      </button>
                    )}

                    {/* Botón rápido "Marcar como pagada" si está pendiente */}
                    {isPending && (
                      <button
                        type="button"
                        onClick={() => handleMarkAsPaid(item)}
                        className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-serif font-bold shadow-2xs transition-all active:scale-95 cursor-pointer flex items-center gap-1 shrink-0"
                        title="Marcar como pagada"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span className="hidden sm:inline">Pagada</span>
                      </button>
                    )}

                    {/* Botón Anular CXC (DUEÑA o ADMINISTRADOR; Encargados y empleados no pueden anular CXC) */}
                    {!isCancelled && (currentUser.role === 'DUEÑA' || currentUser.role === 'ADMINISTRADOR') && (
                      <button
                        type="button"
                        onClick={() => openCancelModal(item)}
                        className="p-1.5 text-stone-400 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
                        title="Anular CXC (DUEÑA o Administrador - Registra en Bitácora)"
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Formulario "Nueva CXC" */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2B1B13]/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-lg bg-[#FFF7EA] text-[#2B1B13] rounded-3xl shadow-2xl border border-[#F4E3C8] overflow-hidden">
            <div className="bg-[#3A2418] text-white p-5 border-b border-[#4E3222] flex items-center justify-between">
              <h3 className="font-serif font-bold text-lg flex items-center gap-2 text-[#FFF7EA]">
                <Plus className="w-5 h-5 text-[#C9974D]" />
                <span>Nueva Cuenta por Cobrar (CXC)</span>
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-[#F4E3C8] hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCxc} className="p-6 space-y-4">
              {/* Persona */}
              <div>
                <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                  Persona / Cliente / Oficina *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A86B3D]" />
                  <input
                    type="text"
                    required
                    value={person}
                    onChange={(e) => setPerson(e.target.value)}
                    placeholder="Ej. Fernanda, Monys, Lic. Morales..."
                    className="w-full pl-9 pr-4 py-2.5 bg-white rounded-xl border border-[#F4E3C8] text-[#2B1B13] text-xs sm:text-sm font-medium focus:border-[#3A2418] focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Monto y Fecha */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                    Monto ($ MXN) *
                  </label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A86B3D]" />
                    <input
                      type="number"
                      step="0.50"
                      min="1"
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-9 pr-4 py-2.5 bg-white rounded-xl border border-[#F4E3C8] text-[#2B1B13] font-bold text-sm focus:border-[#3A2418] focus:outline-hidden"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                    Fecha *
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A86B3D]" />
                    <input
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 bg-white rounded-xl border border-[#F4E3C8] text-[#2B1B13] text-xs sm:text-sm font-medium focus:border-[#3A2418] focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Concepto */}
              <div>
                <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                  Concepto *
                </label>
                <input
                  type="text"
                  required
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  placeholder="Ej. Comida corrida, frappé, consumo..."
                  className="w-full px-4 py-2.5 bg-white rounded-xl border border-[#F4E3C8] text-[#2B1B13] text-xs sm:text-sm font-medium focus:border-[#3A2418] focus:outline-hidden"
                />
              </div>

              {/* Notas opcionales */}
              <div>
                <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                  Notas / Observaciones (Opcional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej. Liquidación prometida para el fin de semana..."
                  className="w-full px-4 py-2.5 bg-white rounded-xl border border-[#F4E3C8] text-[#2B1B13] text-xs focus:border-[#3A2418] focus:outline-hidden"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="w-1/2 py-3 rounded-xl border border-[#F4E3C8] text-[#6B4028] font-serif font-bold text-xs hover:bg-[#FAF5ED] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-3 rounded-xl bg-[#3A2418] hover:bg-[#4A2E1F] text-white font-serif font-bold text-xs shadow-md cursor-pointer"
                >
                  Registrar CXC
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal "Anular CXC" (Solo Administrador) */}
      {isCancelModalOpen && cxcToCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2B1B13]/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-lg bg-[#FFF7EA] text-[#2B1B13] rounded-3xl shadow-2xl border border-[#F4E3C8] overflow-hidden">
            <div className="bg-rose-950 text-white p-5 border-b border-rose-900 flex items-center justify-between">
              <h3 className="font-serif font-bold text-lg flex items-center gap-2 text-rose-100">
                <Ban className="w-5 h-5 text-rose-400" />
                <span>Anular Cuenta por Cobrar</span>
              </h3>
              <button
                onClick={() => {
                  setIsCancelModalOpen(false);
                  setCxcToCancel(null);
                }}
                className="text-rose-200 hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmCancel} className="p-6 space-y-4">
              {cancelError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs font-medium flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{cancelError}</span>
                </div>
              )}

              {/* Resumen del registro a anular */}
              <div className="p-4 bg-white rounded-2xl border border-[#F4E3C8] space-y-2">
                <div className="flex justify-between items-center text-xs text-[#6B4028]">
                  <span>Persona / Cliente:</span>
                  <strong className="text-[#2B1B13] font-serif text-sm">{cxcToCancel.person}</strong>
                </div>
                <div className="flex justify-between items-center text-xs text-[#6B4028]">
                  <span>Monto:</span>
                  <strong className="text-[#2B1B13] font-serif text-sm">
                    ${cxcToCancel.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </strong>
                </div>
                <div className="flex justify-between items-center text-xs text-[#6B4028]">
                  <span>Concepto:</span>
                  <span className="text-[#2B1B13] font-medium">{cxcToCancel.concept}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-[#6B4028]">
                  <span>Fecha de registro:</span>
                  <span>{formatLocalDate(cxcToCancel.date)}</span>
                </div>
              </div>

              {/* Advertencia */}
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-950 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  Esta cuenta se conservará en el historial pero <strong>dejará de sumar al total pendiente</strong>. Se registrará la anulación con tu usuario (<strong>{currentUser.name}</strong>), fecha, hora y motivo en la <strong>Bitácora de Auditoría</strong>.
                </div>
              </div>

              {/* Motivo de Anulación */}
              <div>
                <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                  Motivo de Anulación *
                </label>
                <textarea
                  required
                  rows={3}
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  placeholder="Ej. Registro duplicado por error, consumo cancelado por el cliente, condonación autorizada..."
                  className="w-full p-3 bg-white rounded-xl border border-[#F4E3C8] text-[#2B1B13] text-xs sm:text-sm font-medium focus:border-rose-800 focus:outline-hidden"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCancelModalOpen(false);
                    setCxcToCancel(null);
                  }}
                  className="w-1/2 py-3 rounded-xl border border-[#F4E3C8] text-[#6B4028] font-serif font-bold text-xs hover:bg-[#FAF5ED] cursor-pointer"
                >
                  Regresar
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-3 rounded-xl bg-rose-800 hover:bg-rose-900 text-white font-serif font-bold text-xs shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>Confirmar Anulación</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
