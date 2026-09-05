import React, { useState } from 'react';
import { StaffUser, ExpenseRecord, ExpenseCategory } from '../../types';
import { getExpenses, addExpense, deleteExpense, getCurrentShift, formatLocalDate } from '../../lib/adminStorage';
import {
  DollarSign,
  Plus,
  Trash2,
  Receipt,
  Tag,
  Filter,
  CheckCircle2,
  Calendar,
  Clock,
  User,
  Coffee,
  Utensils,
  Wrench,
  Sparkles,
  Truck,
  HelpCircle,
} from 'lucide-react';

interface ExpensesViewProps {
  currentUser: StaffUser;
  onRefreshStats: () => void;
}

const CATEGORIES: { label: ExpenseCategory; icon: any; color: string }[] = [
  { label: 'Cafetería', icon: Coffee, color: 'text-amber-700 bg-amber-50 border-amber-200' },
  { label: 'Cocina', icon: Utensils, color: 'text-orange-700 bg-orange-50 border-orange-200' },
  { label: 'Taller / mantenimiento', icon: Wrench, color: 'text-blue-700 bg-blue-50 border-blue-200' },
  { label: 'Limpieza', icon: Sparkles, color: 'text-teal-700 bg-teal-50 border-teal-200' },
  { label: 'Proveedores', icon: Truck, color: 'text-purple-700 bg-purple-50 border-purple-200' },
  { label: 'Otros', icon: HelpCircle, color: 'text-stone-700 bg-stone-50 border-stone-200' },
];

export const ExpensesView: React.FC<ExpensesViewProps> = ({ currentUser, onRefreshStats }) => {
  const [expenses, setExpenses] = useState<ExpenseRecord[]>(getExpenses());
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);

  // Campos de formulario
  const [concept, setConcept] = useState<string>('');
  const [category, setCategory] = useState<ExpenseCategory>('Cafetería');
  const [amount, setAmount] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [paidWith, setPaidWith] = useState<'efectivo_caja' | 'otro'>('efectivo_caja');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const refreshList = () => {
    setExpenses(getExpenses());
  };

  React.useEffect(() => {
    const handleDataChange = () => {
      refreshList();
    };
    window.addEventListener('alo_admin_data_updated', handleDataChange);
    window.addEventListener('storage', handleDataChange);
    return () => {
      window.removeEventListener('alo_admin_data_updated', handleDataChange);
      window.removeEventListener('storage', handleDataChange);
    };
  }, []);

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!concept.trim() || !amount || Number(amount) <= 0) {
      alert('Por favor indica un concepto y un monto válido.');
      return;
    }

    try {
      await addExpense(
        {
          concept,
          category,
          amount: Number(amount),
          paidWith,
          note,
        },
        currentUser
      );

      setConcept('');
      setAmount('');
      setNote('');
      setIsFormOpen(false);
      setSuccessMsg('¡Gasto registrado en la bitácora del turno!');
      setTimeout(() => setSuccessMsg(null), 3000);
      refreshList();
      onRefreshStats();
    } catch (err: any) {
      alert(err.message || 'Error al registrar el gasto en la nube.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Seguro que deseas eliminar este registro de gasto?')) return;
    try {
      await deleteExpense(id, currentUser);
      refreshList();
      onRefreshStats();
    } catch (err: any) {
      alert(err.message || 'No se pudo eliminar el gasto.');
    }
  };

  const currentShift = getCurrentShift();
  const filteredExpenses = expenses.filter((e) => {
    if (selectedFilter === 'all') return true;
    if (selectedFilter === 'current_shift') return currentShift ? e.shiftId === currentShift.id : false;
    return e.category === selectedFilter;
  });

  const totalExpenseSum = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs sm:text-sm font-medium flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Header & Acciones Rápidas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-3xl border border-[#F4E3C8] shadow-xs">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFF7EA] text-[#A86B3D] text-xs font-bold uppercase tracking-wider mb-1 font-serif border border-[#F4E3C8]">
            <Receipt className="w-3.5 h-3.5" />
            <span>Control de Egresos</span>
          </div>
          <h2 className="font-serif font-bold text-xl sm:text-2xl text-[#2B1B13]">
            Gastos & Salidas de Caja
          </h2>
          <p className="text-xs text-[#6B4028] mt-0.5">
            Registra compras de insumos, proveedores, refacciones y pagos del turno.
          </p>
        </div>

        <button
          onClick={() => setIsFormOpen(!isFormOpen)}
          className="px-5 py-3 rounded-2xl bg-[#3A2418] hover:bg-[#4A2E1F] text-[#FFF7EA] font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4 text-[#C9974D]" />
          <span>Registrar Nuevo Gasto</span>
        </button>
      </div>

      {/* Formulario de Registro Táctil Desplegable */}
      {isFormOpen && (
        <form
          onSubmit={handleCreateExpense}
          className="bg-white rounded-3xl border-2 border-[#C9974D]/60 p-5 sm:p-7 shadow-lg space-y-4 animate-in slide-in-from-top-2"
        >
          <div className="flex items-center justify-between border-b border-[#F4E3C8]/60 pb-3">
            <h3 className="font-serif font-bold text-base text-[#2B1B13] flex items-center gap-2">
              <Receipt className="w-4 h-4 text-[#C9974D]" />
              <span>Nuevo Comprobante de Gasto</span>
            </h3>
            <span className="text-xs text-[#A86B3D]">Registrado por: <strong>{currentUser.name}</strong></span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Concepto */}
            <div>
              <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                Concepto / Insumo *
              </label>
              <input
                type="text"
                required
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                placeholder="Ej. Mayonesa, Garrafones de agua, Gas, Hielo..."
                className="w-full px-4 py-2.5 bg-[#FFF7EA]/50 focus:bg-white rounded-xl border border-[#F4E3C8] text-xs sm:text-sm font-medium text-[#2B1B13] focus:border-[#3A2418] focus:outline-hidden"
              />
            </div>

            {/* Cantidad ($) */}
            <div>
              <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                Monto Pagado ($) *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A86B3D] font-bold">$</span>
                <input
                  type="number"
                  step="any"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-8 pr-4 py-2.5 bg-[#FFF7EA]/50 focus:bg-white rounded-xl border border-[#F4E3C8] text-[#2B1B13] font-bold text-base focus:border-[#3A2418] focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Categoría Selector Visual */}
          <div>
            <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1.5 font-serif">
              Categoría
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isSel = category === cat.label;
                return (
                  <button
                    key={cat.label}
                    type="button"
                    onClick={() => setCategory(cat.label)}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                      isSel
                        ? 'bg-[#3A2418] text-white border-[#C9974D] shadow-2xs'
                        : 'bg-[#FFF7EA]/50 hover:bg-[#FFF7EA] text-[#6B4028] border-[#F4E3C8]'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isSel ? 'text-[#C9974D]' : 'text-[#A86B3D]'}`} />
                    <span className="text-[11px] truncate">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            {/* Método de Pago */}
            <div>
              <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                ¿De dónde salió el dinero?
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaidWith('efectivo_caja')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    paidWith === 'efectivo_caja'
                      ? 'bg-emerald-800 text-white border-emerald-600 shadow-2xs'
                      : 'bg-[#FFF7EA]/50 text-[#6B4028] border-[#F4E3C8]'
                  }`}
                >
                  💵 Efectivo de Caja
                </button>
                <button
                  type="button"
                  onClick={() => setPaidWith('otro')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    paidWith === 'otro'
                      ? 'bg-[#3A2418] text-white border-[#4E3222] shadow-2xs'
                      : 'bg-[#FFF7EA]/50 text-[#6B4028] border-[#F4E3C8]'
                  }`}
                >
                  💳 Tarjeta / Otro
                </button>
              </div>
            </div>

            {/* Nota opcional */}
            <div>
              <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                Nota / Proveedor (Opcional)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ej. Tiendita de la esquina, ticket #42"
                className="w-full px-4 py-2.5 bg-[#FFF7EA]/50 focus:bg-white rounded-xl border border-[#F4E3C8] text-xs sm:text-sm text-[#2B1B13] focus:border-[#3A2418] focus:outline-hidden"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#F4E3C8]">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-4 py-2.5 rounded-xl border border-[#F4E3C8] text-[#6B4028] font-bold text-xs hover:bg-[#FAF5ED] cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-[#3A2418] hover:bg-[#4A2E1F] text-[#FFF7EA] font-bold text-xs shadow-md cursor-pointer"
            >
              Guardar Gasto
            </button>
          </div>
        </form>
      )}

      {/* Filtros por Categoría */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <span className="font-bold text-[#A86B3D] uppercase text-[10px] shrink-0 flex items-center gap-1 font-serif">
          <Filter className="w-3 h-3" /> Filtrar:
        </span>

        <button
          onClick={() => setSelectedFilter('all')}
          className={`px-3 py-1.5 rounded-full font-bold transition-all shrink-0 cursor-pointer ${
            selectedFilter === 'all'
              ? 'bg-[#3A2418] text-white'
              : 'bg-white text-[#6B4028] border border-[#F4E3C8] hover:bg-[#FFF7EA]'
          }`}
        >
          Todos ({expenses.length})
        </button>

        {currentShift && (
          <button
            onClick={() => setSelectedFilter('current_shift')}
            className={`px-3 py-1.5 rounded-full font-bold transition-all shrink-0 cursor-pointer ${
              selectedFilter === 'current_shift'
                ? 'bg-[#3A2418] text-white'
                : 'bg-white text-[#6B4028] border border-[#F4E3C8] hover:bg-[#FFF7EA]'
            }`}
          >
            ⚡ Turno Actual
          </button>
        )}

        {CATEGORIES.map((c) => (
          <button
            key={c.label}
            onClick={() => setSelectedFilter(c.label)}
            className={`px-3 py-1.5 rounded-full font-bold transition-all shrink-0 cursor-pointer ${
              selectedFilter === c.label
                ? 'bg-[#3A2418] text-white'
                : 'bg-white text-[#6B4028] border border-[#F4E3C8] hover:bg-[#FFF7EA]'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Resumen Total & Listado */}
      <div className="bg-white rounded-3xl border border-[#F4E3C8] shadow-xs overflow-hidden">
        <div className="bg-[#FFF7EA] px-6 py-4 border-b border-[#F4E3C8] flex items-center justify-between">
          <span className="font-bold text-xs text-[#6B4028] uppercase tracking-wider font-serif">
            Total en gastos filtrados:
          </span>
          <span className="font-serif font-black text-xl text-rose-700">
            ${totalExpenseSum.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </span>
        </div>

        {filteredExpenses.length === 0 ? (
          <div className="p-12 text-center text-[#A86B3D] space-y-2">
            <Receipt className="w-8 h-8 mx-auto text-[#C9974D]" />
            <p className="text-xs">No hay gastos registrados en esta categoría.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#F4E3C8]/40">
            {filteredExpenses.map((exp) => (
              <div
                key={exp.id}
                className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#FFF7EA]/40 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#FFF7EA] text-[#3A2418] border border-[#F4E3C8] flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    ${exp.amount.toFixed(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-[#2B1B13]">{exp.concept}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFF7EA] text-[#6B4028] border border-[#F4E3C8]">
                        {exp.category}
                      </span>
                      {exp.paidWith === 'efectivo_caja' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Efectivo Caja
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FAF5ED] text-[#A86B3D]">
                          Otro
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-[#6B4028] mt-1">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3 text-[#A86B3D]" /> {exp.registeredBy}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[#A86B3D]" /> {exp.time} ({formatLocalDate(exp.date)})
                      </span>
                      {exp.note && (
                        <>
                          <span>•</span>
                          <span className="italic text-[#6B4028] font-light">"{exp.note}"</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <span className="font-mono font-bold text-base text-[#2B1B13]">
                    ${exp.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </span>

                  {currentUser.role !== 'EMPLEADO' && (
                    <button
                      onClick={() => handleDelete(exp.id)}
                      className="p-2 text-[#A86B3D] hover:text-rose-600 rounded-xl hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Eliminar gasto"
                      aria-label="Eliminar gasto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
