import React, { useState } from 'react';
import { ActivityLog, StaffUser } from '../../types';
import { getActivityLogs, formatLocalDate, formatLocalTime } from '../../lib/adminStorage';
import {
  FileText,
  User,
  Clock,
  Filter,
  Shield,
  Search,
  CheckCircle,
  AlertCircle,
  Tag,
} from 'lucide-react';

interface ActivityLogsViewProps {
  currentUser: StaffUser;
}

export const ActivityLogsView: React.FC<ActivityLogsViewProps> = ({ currentUser }) => {
  const [logs, setLogs] = useState<ActivityLog[]>(getActivityLogs());
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  React.useEffect(() => {
    const handleDataChange = () => {
      setLogs(getActivityLogs());
    };
    window.addEventListener('alo_admin_data_updated', handleDataChange);
    window.addEventListener('storage', handleDataChange);
    return () => {
      window.removeEventListener('alo_admin_data_updated', handleDataChange);
      window.removeEventListener('storage', handleDataChange);
    };
  }, []);

  const filteredLogs = logs.filter((log) => {
    const matchCat = filterCategory === 'all' || log.category === filterCategory;
    const matchSearch =
      !searchTerm ||
      log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.details && log.details.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchCat && matchSearch;
  });

  const getCategoryBadge = (cat: ActivityLog['category']) => {
    switch (cat) {
      case 'sesion':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">Sesión</span>;
      case 'turno':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">Turno & Caja</span>;
      case 'gasto':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">Gastos</span>;
      case 'cxc':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFF7EA] text-[#A86B3D] border border-[#F4E3C8]">CXC</span>;
      case 'sobre':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">✉️ Sobre</span>;
      case 'inventario':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">Inventario</span>;
      case 'menu':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">Menú del Día</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-700">General</span>;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#F4E3C8] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFF7EA] text-[#A86B3D] text-xs font-bold uppercase tracking-wider mb-1 font-serif border border-[#F4E3C8]">
            <Shield className="w-3.5 h-3.5" />
            <span>Auditoría & Trazabilidad</span>
          </div>
          <h2 className="font-serif font-bold text-xl sm:text-2xl text-[#2B1B13]">
            Bitácora de Movimientos
          </h2>
          <p className="text-xs text-[#6B4028] mt-0.5">
            Registro cronológico inmutable de aperturas, cierres, gastos, sobre/resguardo, CXC e inventario.
          </p>
        </div>

        <div className="text-xs bg-[#FFF7EA] px-4 py-2 rounded-2xl border border-[#F4E3C8] text-[#6B4028]">
          Total de registros: <strong className="text-[#2B1B13]">{logs.length}</strong>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A86B3D]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por colaborador o acción (ej. Gio, sobre, apertura, gasto, retiro...)"
            className="w-full pl-9 pr-4 py-2.5 bg-white rounded-2xl border border-[#F4E3C8] text-xs sm:text-sm text-[#2B1B13] focus:border-[#C9974D] focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {['all', 'sesion', 'turno', 'gasto', 'sobre', 'cxc', 'inventario', 'menu'].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-2 rounded-xl font-bold transition-all shrink-0 cursor-pointer font-serif ${
                filterCategory === cat
                  ? 'bg-[#3A2418] text-[#FFF7EA] shadow-xs'
                  : 'bg-white text-[#6B4028] border border-[#F4E3C8] hover:bg-[#FFF7EA]'
              }`}
            >
              {cat === 'all'
                ? 'Todos'
                : cat === 'sesion'
                ? 'Sesión'
                : cat === 'turno'
                ? 'Turnos'
                : cat === 'gasto'
                ? 'Gastos'
                : cat === 'sobre'
                ? 'Sobre'
                : cat === 'cxc'
                ? 'CXC'
                : cat === 'inventario'
                ? 'Inventario'
                : 'Menú'}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Registros */}
      <div className="bg-white rounded-3xl border border-[#F4E3C8] shadow-xs divide-y divide-[#F4E3C8]/50 overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-[#A86B3D]">
            <FileText className="w-8 h-8 mx-auto text-[#C9974D] mb-2" />
            <p className="text-xs">No se encontraron movimientos con los filtros actuales.</p>
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="p-4 sm:p-5 hover:bg-[#FFF7EA] transition-colors flex items-start justify-between gap-3">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {getCategoryBadge(log.category)}
                  <span className="font-bold text-xs sm:text-sm text-[#2B1B13]">{log.action}</span>
                </div>

                <div className="flex items-center gap-3 text-[11px] text-[#6B4028] flex-wrap">
                  <span className="flex items-center gap-1 font-medium text-[#2B1B13]">
                    <User className="w-3 h-3 text-[#C9974D]" /> {log.userName} ({log.userRole})
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-[#A86B3D]" /> {log.timestamp ? formatLocalTime(log.timestamp) : log.timeFormatted} ({log.timestamp ? formatLocalDate(log.timestamp) : formatLocalDate(log.dateFormatted)})
                  </span>
                  {log.details && (
                    <>
                      <span>•</span>
                      <span className="text-[#6B4028]">{log.details}</span>
                    </>
                  )}
                </div>

                {(log.previousValue || log.newValue) && (
                  <div className="mt-1.5 p-2 bg-[#FFF7EA] rounded-xl border border-[#F4E3C8] text-[11px] text-[#6B4028] font-mono flex items-center gap-2 flex-wrap">
                    {log.previousValue && (
                      <span>
                        <strong className="text-[#A86B3D]">Antes:</strong> {log.previousValue}
                      </span>
                    )}
                    {log.previousValue && log.newValue && <span>➜</span>}
                    {log.newValue && (
                      <span className="text-[#3A2418] font-bold">
                        <strong className="text-[#A86B3D] font-normal">Nuevo:</strong> {log.newValue}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
