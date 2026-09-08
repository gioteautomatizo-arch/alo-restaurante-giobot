import React, { useState, useEffect } from 'react';
import { StaffUser, DailyMenuConfig, ServiceMode } from '../../types';
import { getDailyMenuConfig, saveDailyMenuConfig, getEffectiveService, setServiceMode } from '../../lib/adminStorage';
import {
  Utensils,
  Save,
  CheckCircle2,
  Sparkles,
  DollarSign,
  Coffee,
  Soup,
  GlassWater,
  Cake,
  AlertCircle,
} from 'lucide-react';

interface DailyMenuEditorViewProps {
  currentUser: StaffUser;
  onRefreshStats: () => void;
}

export const DailyMenuEditorView: React.FC<DailyMenuEditorViewProps> = ({
  currentUser,
  onRefreshStats,
}) => {
  const [config, setConfig] = useState<DailyMenuConfig>(getDailyMenuConfig());
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [isAvailable, setIsAvailable] = useState<boolean>(config.isAvailable);
  const [price, setPrice] = useState<number>(config.price);
  const [entrada, setEntrada] = useState<string>(config.entrada);
  const [platoFuerte, setPlatoFuerte] = useState<string>(config.platoFuerte);
  const [guarnicion1, setGuarnicion1] = useState<string>(config.guarniciones[0] || '');
  const [guarnicion2, setGuarnicion2] = useState<string>(config.guarniciones[1] || '');
  const [aguaDelDia, setAguaDelDia] = useState<string>(config.aguaDelDia);
  const [postreDelDia, setPostreDelDia] = useState<string>(config.postreDelDia);

  useEffect(() => {
    const handleDataChange = () => {
      const latest = getDailyMenuConfig();
      setConfig(latest);
      setIsAvailable(latest.isAvailable);
      setPrice(latest.price);
      setEntrada(latest.entrada);
      setPlatoFuerte(latest.platoFuerte);
      setGuarnicion1(latest.guarniciones[0] || '');
      setGuarnicion2(latest.guarniciones[1] || '');
      setAguaDelDia(latest.aguaDelDia);
      setPostreDelDia(latest.postreDelDia);
    };
    window.addEventListener('alo_admin_data_updated', handleDataChange);
    window.addEventListener('storage', handleDataChange);
    return () => {
      window.removeEventListener('alo_admin_data_updated', handleDataChange);
      window.removeEventListener('storage', handleDataChange);
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentUser.role === 'EMPLEADO') {
      alert('Solo los Encargados o Administradores pueden actualizar el Menú del Día.');
      return;
    }

    try {
      const updated = await saveDailyMenuConfig(
        {
          isAvailable,
          price: Number(price),
          entrada: entrada.trim(),
          platoFuerte: platoFuerte.trim(),
          guarniciones: [guarnicion1.trim(), guarnicion2.trim()].filter(Boolean),
          aguaDelDia: aguaDelDia.trim(),
          postreDelDia: postreDelDia.trim(),
          opcionesAlternativas: config.opcionesAlternativas,
          serviceMode: config.serviceMode || 'AUTO',
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser.name,
        },
        currentUser
      );

      setConfig(updated);
      setSuccessMsg('¡Menú del Día publicado en tiempo real para clientes y Tita!');
      setTimeout(() => setSuccessMsg(null), 3500);
      onRefreshStats();
    } catch (err: any) {
      alert(err.message || 'Error al guardar el Menú del Día.');
    }
  };

  const handleServiceModeSelect = async (mode: ServiceMode) => {
    try {
      const updated = await setServiceMode(mode, currentUser);
      setConfig(updated);
      onRefreshStats();
    } catch (err: any) {
      console.warn('Error al cambiar modo de servicio:', err);
    }
  };

  const effectiveService = getEffectiveService();

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs sm:text-sm font-medium flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#F4E3C8] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFF7EA] text-[#A86B3D] text-xs font-bold uppercase tracking-wider mb-1 font-serif border border-[#F4E3C8]">
            <Utensils className="w-3.5 h-3.5" />
            <span>Configuración de Cocina</span>
          </div>
          <h2 className="font-serif font-bold text-xl sm:text-2xl text-[#2B1B13]">
            Publicador del Menú del Día
          </h2>
          <p className="text-xs text-[#6B4028] mt-0.5">
            Lo que configures aquí se actualiza inmediatamente en el menú web y en las respuestas de Tita.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-[#FFF7EA] px-3.5 py-2 rounded-2xl border border-[#F4E3C8]">
            <span className="text-xs font-bold text-[#2B1B13]">Servicio:</span>
            <div className="inline-flex p-0.5 bg-white rounded-xl border border-[#DEC8AE] gap-1">
              <button
                type="button"
                onClick={() => handleServiceModeSelect('AUTO')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  (config.serviceMode || 'AUTO') === 'AUTO'
                    ? 'bg-[#3A2418] text-[#FFF7EA] shadow-xs'
                    : 'text-[#6B4028] hover:text-[#2B1B13]'
                }`}
                title="Modo automático: antes de las 12:00 CDMX es DESAYUNO, a las 12:00 o después COMIDA"
              >
                {(config.serviceMode || 'AUTO') === 'AUTO'
                  ? `AUTO · Ahora: ${effectiveService}`
                  : 'AUTO'}
              </button>
              <button
                type="button"
                onClick={() => handleServiceModeSelect('DESAYUNO')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  config.serviceMode === 'DESAYUNO'
                    ? 'bg-[#3A2418] text-[#FFF7EA] shadow-xs'
                    : 'text-[#6B4028] hover:text-[#2B1B13]'
                }`}
              >
                DESAYUNO
              </button>
              <button
                type="button"
                onClick={() => handleServiceModeSelect('COMIDA')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  config.serviceMode === 'COMIDA'
                    ? 'bg-[#3A2418] text-[#FFF7EA] shadow-xs'
                    : 'text-[#6B4028] hover:text-[#2B1B13]'
                }`}
              >
                COMIDA
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-[#FFF7EA] px-4 py-2.5 rounded-2xl border border-[#F4E3C8]">
            <span className="text-xs font-bold text-[#2B1B13]">Estado del Menú:</span>
            <button
              type="button"
              onClick={() => setIsAvailable(!isAvailable)}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isAvailable
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-rose-600 text-white shadow-xs'
              }`}
            >
              {isAvailable ? '✅ Disponible' : '❌ Agotado / Inactivo'}
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="bg-white rounded-3xl border border-[#F4E3C8] p-6 sm:p-8 shadow-xs space-y-5">
        {/* Precio & Plato Fuerte */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-1">
            <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider mb-1.5 flex items-center gap-1.5 font-serif">
              <DollarSign className="w-3.5 h-3.5 text-[#C9974D]" />
              <span>Precio Menú Completo ($)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A86B3D] font-bold">$</span>
              <input
                type="number"
                required
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-full pl-8 pr-4 py-2.5 bg-[#FFF7EA] focus:bg-white rounded-xl border border-[#F4E3C8] text-[#2B1B13] font-bold text-lg focus:border-[#C9974D] focus:outline-hidden"
              />
            </div>
            <p className="text-[10px] text-[#A86B3D] mt-1">Incluye entrada, plato fuerte, guarniciones, agua y postre.</p>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider mb-1.5 flex items-center gap-1.5 font-serif">
              <Utensils className="w-3.5 h-3.5 text-[#C9974D]" />
              <span>Plato Fuerte / Guisados del Día *</span>
            </label>
            <textarea
              required
              rows={2}
              value={platoFuerte}
              onChange={(e) => setPlatoFuerte(e.target.value)}
              placeholder="Ej. Pechuga a la plancha con finas hierbas / Enchiladas verdes / Bistec en pasilla"
              className="w-full px-4 py-2.5 bg-[#FFF7EA] focus:bg-white rounded-xl border border-[#F4E3C8] text-xs sm:text-sm text-[#2B1B13] focus:border-[#C9974D] focus:outline-hidden"
            />
          </div>
        </div>

        {/* Entrada y Sopa */}
        <div>
          <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider mb-1.5 flex items-center gap-1.5 font-serif">
            <Soup className="w-3.5 h-3.5 text-[#C9974D]" />
            <span>Entrada / Sopa del Día</span>
          </label>
          <input
            type="text"
            required
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
            placeholder="Ej. Sopa de fideo casera o Consomé de pollo con verduras"
            className="w-full px-4 py-2.5 bg-[#FFF7EA] focus:bg-white rounded-xl border border-[#F4E3C8] text-xs sm:text-sm text-[#2B1B13] focus:border-[#C9974D] focus:outline-hidden"
          />
        </div>

        {/* Guarniciones */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider mb-1.5 font-serif">
              Guarnición 1
            </label>
            <input
              type="text"
              value={guarnicion1}
              onChange={(e) => setGuarnicion1(e.target.value)}
              placeholder="Ej. Arroz a la mexicana con chícharos"
              className="w-full px-4 py-2.5 bg-[#FFF7EA] focus:bg-white rounded-xl border border-[#F4E3C8] text-xs text-[#2B1B13] focus:border-[#C9974D] focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider mb-1.5 font-serif">
              Guarnición 2
            </label>
            <input
              type="text"
              value={guarnicion2}
              onChange={(e) => setGuarnicion2(e.target.value)}
              placeholder="Ej. Pasta a la mantequilla o Frijolitos refritos"
              className="w-full px-4 py-2.5 bg-[#FFF7EA] focus:bg-white rounded-xl border border-[#F4E3C8] text-xs text-[#2B1B13] focus:border-[#C9974D] focus:outline-hidden"
            />
          </div>
        </div>

        {/* Bebida & Postre */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider mb-1.5 flex items-center gap-1.5 font-serif">
              <GlassWater className="w-3.5 h-3.5 text-[#C9974D]" />
              <span>Agua Fresca del Día</span>
            </label>
            <input
              type="text"
              value={aguaDelDia}
              onChange={(e) => setAguaDelDia(e.target.value)}
              placeholder="Ej. Jamaica fresca con canela / Horchata con nuez"
              className="w-full px-4 py-2.5 bg-[#FFF7EA] focus:bg-white rounded-xl border border-[#F4E3C8] text-xs text-[#2B1B13] focus:border-[#C9974D] focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider mb-1.5 flex items-center gap-1.5 font-serif">
              <Cake className="w-3.5 h-3.5 text-[#C9974D]" />
              <span>Postre Casero del Día</span>
            </label>
            <input
              type="text"
              value={postreDelDia}
              onChange={(e) => setPostreDelDia(e.target.value)}
              placeholder="Ej. Flan napolitano / Arroz con leche tradicional"
              className="w-full px-4 py-2.5 bg-[#FFF7EA] focus:bg-white rounded-xl border border-[#F4E3C8] text-xs text-[#2B1B13] focus:border-[#C9974D] focus:outline-hidden"
            />
          </div>
        </div>

        {/* Botón de Guardado */}
        <div className="pt-4 border-t border-[#F4E3C8]/60 flex items-center justify-between">
          <span className="text-xs text-[#6B4028]">
            Última edición por: <strong className="text-[#2B1B13]">{config.updatedBy || 'Administración'}</strong>
          </span>

          <button
            type="submit"
            className="px-6 py-3 bg-[#3A2418] hover:bg-[#6B4028] text-[#FFF7EA] rounded-2xl font-bold text-xs sm:text-sm shadow-md flex items-center gap-2 cursor-pointer transition-all active:scale-95 border border-[#C9974D]/40"
          >
            <Save className="w-4 h-4 text-[#C9974D]" />
            <span>Publicar Menú del Día</span>
          </button>
        </div>
      </form>
    </div>
  );
};
