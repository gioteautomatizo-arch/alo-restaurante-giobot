import React, { useState, useEffect } from 'react';
import { StaffUser } from '../../types';
import {
  inspectLocalStorageData,
  migrateLocalStorageToFirestore,
  LocalDataStats,
} from '../../lib/firestoreService';
import {
  CloudUpload,
  CheckCircle2,
  AlertTriangle,
  X,
  Database,
  Users,
  Clock,
  Receipt,
  CreditCard,
  Package,
  Mail,
  Utensils,
  Shield,
  Loader2,
} from 'lucide-react';

interface LocalDataMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: StaffUser;
  onMigrationComplete?: () => void;
}

export const LocalDataMigrationModal: React.FC<LocalDataMigrationModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onMigrationComplete,
}) => {
  const [stats, setStats] = useState<LocalDataStats | null>(null);
  const [selectedOptions, setSelectedOptions] = useState({
    migrateStaff: true,
    migrateShift: true,
    migrateExpenses: true,
    migrateCxc: true,
    migrateInventory: true,
    migrateSobre: true,
    migrateMenu: true,
    migrateLogs: true,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [migratedCounts, setMigratedCounts] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (isOpen) {
      const data = inspectLocalStorageData();
      setStats(data);
      setResultMessage(null);
      setErrorMessage(null);
      setMigratedCounts(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleOption = (key: keyof typeof selectedOptions) => {
    setSelectedOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleStartMigration = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setResultMessage(null);

    try {
      const result = await migrateLocalStorageToFirestore(currentUser, selectedOptions);
      setResultMessage(result.message);
      setMigratedCounts(result.migratedCounts);
      if (onMigrationComplete) {
        onMigrationComplete();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Ocurrió un error durante la migración.');
    } finally {
      setIsLoading(false);
    }
  };

  const totalLocalItems = stats
    ? stats.staffCount +
      (stats.hasActiveShift ? 1 : 0) +
      stats.shiftsHistoryCount +
      stats.expensesCount +
      stats.cxcCount +
      stats.inventoryCount +
      stats.sobreMovementsCount +
      (stats.hasDailyMenu ? 1 : 0) +
      stats.logsCount
    : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
      <div className="bg-[#FFF7EA] text-[#2B1B13] rounded-3xl border border-[#C9974D]/40 shadow-2xl max-w-2xl w-full p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#F4E3C8] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#3A2418] text-[#C9974D] flex items-center justify-center shadow-md">
              <CloudUpload className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-serif font-bold text-xl sm:text-2xl text-[#2B1B13]">
                Migrar Datos Locales a Firestore
              </h2>
              <p className="text-xs text-[#6B4028]">
                Herramienta oficial de respaldo y unificación para DUEÑA y ADMINISTRADOR
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#6B4028] hover:bg-[#F4E3C8] hover:text-[#2B1B13] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning / Explanation banner */}
        <div className="bg-amber-50 border border-amber-300/80 rounded-2xl p-4 text-xs sm:text-sm text-amber-900 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Transferencia controlada a la Nube Central</p>
            <p className="mt-1 text-amber-800 leading-relaxed">
              Esta función transfiere los datos guardados en el almacenamiento local de este dispositivo hacia Firestore para que estén disponibles sincronizados en el iPad, teléfonos y computadoras.
            </p>
          </div>
        </div>

        {/* Local Data Inspection Stats */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-[#6B4028] uppercase tracking-wider">
            <span>Registros encontrados en este dispositivo ({totalLocalItems} totales)</span>
            <span>Seleccionar</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Staff */}
            <label className="flex items-center justify-between p-3 rounded-2xl bg-white border border-[#F4E3C8] hover:border-[#C9974D] transition-colors cursor-pointer text-xs">
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-[#C9974D]" />
                <span className="font-bold text-[#2B1B13]">Colaboradores & PINs</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-[#FFF7EA] text-[#6B4028] font-bold">
                  {stats?.staffCount || 0}
                </span>
                <input
                  type="checkbox"
                  checked={selectedOptions.migrateStaff}
                  onChange={() => toggleOption('migrateStaff')}
                  className="rounded text-[#3A2418] focus:ring-[#C9974D]"
                />
              </div>
            </label>

            {/* Turnos e Historial */}
            <label className="flex items-center justify-between p-3 rounded-2xl bg-white border border-[#F4E3C8] hover:border-[#C9974D] transition-colors cursor-pointer text-xs">
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-emerald-600" />
                <span className="font-bold text-[#2B1B13]">Turnos & Historial</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-[#FFF7EA] text-[#6B4028] font-bold">
                  {(stats?.hasActiveShift ? 1 : 0) + (stats?.shiftsHistoryCount || 0)}
                </span>
                <input
                  type="checkbox"
                  checked={selectedOptions.migrateShift}
                  onChange={() => toggleOption('migrateShift')}
                  className="rounded text-[#3A2418] focus:ring-[#C9974D]"
                />
              </div>
            </label>

            {/* Gastos */}
            <label className="flex items-center justify-between p-3 rounded-2xl bg-white border border-[#F4E3C8] hover:border-[#C9974D] transition-colors cursor-pointer text-xs">
              <div className="flex items-center gap-2.5">
                <Receipt className="w-4 h-4 text-amber-600" />
                <span className="font-bold text-[#2B1B13]">Gastos Operativos</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-[#FFF7EA] text-[#6B4028] font-bold">
                  {stats?.expensesCount || 0}
                </span>
                <input
                  type="checkbox"
                  checked={selectedOptions.migrateExpenses}
                  onChange={() => toggleOption('migrateExpenses')}
                  className="rounded text-[#3A2418] focus:ring-[#C9974D]"
                />
              </div>
            </label>

            {/* CXC */}
            <label className="flex items-center justify-between p-3 rounded-2xl bg-white border border-[#F4E3C8] hover:border-[#C9974D] transition-colors cursor-pointer text-xs">
              <div className="flex items-center gap-2.5">
                <CreditCard className="w-4 h-4 text-blue-600" />
                <span className="font-bold text-[#2B1B13]">Cuentas por Cobrar (CXC)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-[#FFF7EA] text-[#6B4028] font-bold">
                  {stats?.cxcCount || 0}
                </span>
                <input
                  type="checkbox"
                  checked={selectedOptions.migrateCxc}
                  onChange={() => toggleOption('migrateCxc')}
                  className="rounded text-[#3A2418] focus:ring-[#C9974D]"
                />
              </div>
            </label>

            {/* Inventario */}
            <label className="flex items-center justify-between p-3 rounded-2xl bg-white border border-[#F4E3C8] hover:border-[#C9974D] transition-colors cursor-pointer text-xs">
              <div className="flex items-center gap-2.5">
                <Package className="w-4 h-4 text-purple-600" />
                <span className="font-bold text-[#2B1B13]">Inventario de Papel</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-[#FFF7EA] text-[#6B4028] font-bold">
                  {stats?.inventoryCount || 0}
                </span>
                <input
                  type="checkbox"
                  checked={selectedOptions.migrateInventory}
                  onChange={() => toggleOption('migrateInventory')}
                  className="rounded text-[#3A2418] focus:ring-[#C9974D]"
                />
              </div>
            </label>

            {/* Sobre / Resguardo */}
            <label className="flex items-center justify-between p-3 rounded-2xl bg-white border border-[#F4E3C8] hover:border-[#C9974D] transition-colors cursor-pointer text-xs">
              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-rose-600" />
                <span className="font-bold text-[#2B1B13]">Sobre / Resguardo</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-[#FFF7EA] text-[#6B4028] font-bold">
                  {stats?.sobreMovementsCount || 0}
                </span>
                <input
                  type="checkbox"
                  checked={selectedOptions.migrateSobre}
                  onChange={() => toggleOption('migrateSobre')}
                  className="rounded text-[#3A2418] focus:ring-[#C9974D]"
                />
              </div>
            </label>

            {/* Menú del Día */}
            <label className="flex items-center justify-between p-3 rounded-2xl bg-white border border-[#F4E3C8] hover:border-[#C9974D] transition-colors cursor-pointer text-xs">
              <div className="flex items-center gap-2.5">
                <Utensils className="w-4 h-4 text-[#A86B3D]" />
                <span className="font-bold text-[#2B1B13]">Menú del Día</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-[#FFF7EA] text-[#6B4028] font-bold">
                  {stats?.hasDailyMenu ? 'Configurado' : '0'}
                </span>
                <input
                  type="checkbox"
                  checked={selectedOptions.migrateMenu}
                  onChange={() => toggleOption('migrateMenu')}
                  className="rounded text-[#3A2418] focus:ring-[#C9974D]"
                />
              </div>
            </label>
          </div>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-800 text-xs flex items-center gap-2">
            <X className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Success message */}
        {resultMessage && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs space-y-2">
            <div className="flex items-center gap-2 font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{resultMessage}</span>
            </div>
            {migratedCounts && (
              <div className="flex flex-wrap gap-2 pt-1 text-[11px] text-emerald-800">
                {Object.entries(migratedCounts).map(([key, val]) => (
                  <span key={key} className="px-2 py-0.5 rounded bg-emerald-100 font-semibold">
                    {key}: {val}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#F4E3C8]">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-5 py-2.5 rounded-2xl border border-[#F4E3C8] text-[#6B4028] hover:bg-[#F4E3C8] font-bold text-xs transition-colors cursor-pointer"
          >
            {resultMessage ? 'Cerrar' : 'Cancelar'}
          </button>

          <button
            onClick={handleStartMigration}
            disabled={isLoading || totalLocalItems === 0}
            className="px-6 py-2.5 rounded-2xl bg-[#3A2418] hover:bg-[#4E3222] text-[#FFF7EA] border border-[#C9974D]/60 font-bold text-xs flex items-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 text-[#C9974D] animate-spin" />
                <span>Migrando a Firestore...</span>
              </>
            ) : (
              <>
                <CloudUpload className="w-4 h-4 text-[#C9974D]" />
                <span>Iniciar Migración a Firestore</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
