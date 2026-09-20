import React, { useEffect, useState } from 'react';
import { StaffUser, DailyMenuConfig, ServiceMode, ComidaCorridaAvailabilityStatus } from '../../types';
import {
  getDailyMenuConfig,
  saveDailyMenuConfig,
  getEffectiveService,
  setServiceMode,
} from '../../lib/adminStorage';
import { MenuCatalogManagerView } from './MenuCatalogManagerView';
import {
  Cake,
  CheckCircle2,
  DollarSign,
  GlassWater,
  Save,
  Soup,
  Utensils,
} from 'lucide-react';

interface DailyMenuEditorViewProps {
  currentUser: StaffUser;
  onRefreshStats: () => void;
}

type MenuAdminSection = 'menu_dia' | 'catalogo';

type AlternativePriceRow = {
  name: string;
  price: number;
};

const ALT_SURCHARGE_MARKER = '__RECARGO_ESPECIALIDADES_SIN_PRECIO__:';

// Fuente funcional alineada con la carta original de Comida Corrida:
// opciones: Enchiladas verdes o rojas, Milanesa de res o pollo, Tacos dorados.
// cambios con recargo: Bistec o pechuga asada (+$5), Enchiladas suizas (+$10).
const ORIGINAL_ALTERNATIVE_ROWS: AlternativePriceRow[] = [
  { name: 'Enchiladas verdes o rojas', price: 5 },
  { name: 'Milanesa de res o pollo', price: 5 },
  { name: 'Tacos dorados', price: 5 },
  { name: 'Bistec o pechuga asada', price: 5 },
  { name: 'Enchiladas suizas', price: 10 },
];

function readLegacyDefaultSurcharge(options?: string[]): number {
  const marker = (options || []).find((option) => option.startsWith(ALT_SURCHARGE_MARKER));
  if (!marker) return 5;
  const parsed = Number(marker.slice(ALT_SURCHARGE_MARKER.length));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5;
}

function getExplicitSurcharge(option: string): number | null {
  const match = option.match(/\(\s*\+\s*\$?\s*(\d+(?:\.\d+)?)\s*\)\s*$/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function stripExplicitSurcharge(option: string): string {
  return option
    .replace(/\s*\(\s*\+\s*\$?\s*\d+(?:\.\d+)?\s*\)\s*$/i, '')
    .trim();
}

function normalizeAlternativeName(value: string): string {
  return stripExplicitSurcharge(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function configuredPriceForCanonical(
  canonicalName: string,
  options: string[] | undefined,
  fallbackPrice: number
): number {
  const canonicalKey = normalizeAlternativeName(canonicalName);
  const configured = (options || [])
    .filter((option) => !option.startsWith(ALT_SURCHARGE_MARKER))
    .find((option) => {
      const optionKey = normalizeAlternativeName(option);
      if (optionKey === canonicalKey) return true;
      if (canonicalKey === 'tacos dorados' && optionKey.startsWith('tacos dorados')) return true;
      if (canonicalKey === 'enchiladas suizas' && optionKey === 'enchiladas suizas') return true;
      if (canonicalKey === 'bistec o pechuga asada') {
        return optionKey === 'bistec asado' || optionKey === 'pechuga asada' || optionKey === canonicalKey;
      }
      return false;
    });

  return configured ? (getExplicitSurcharge(configured) ?? fallbackPrice) : fallbackPrice;
}

function buildAlternativePriceRows(options?: string[]): AlternativePriceRow[] {
  const legacyFallback = readLegacyDefaultSurcharge(options);
  return ORIGINAL_ALTERNATIVE_ROWS.map((row) => ({
    ...row,
    price: configuredPriceForCanonical(
      row.name,
      options,
      row.price === 10 ? 10 : legacyFallback
    ),
  }));
}

function formatSurcharge(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function serializeAlternativePriceRows(rows: AlternativePriceRow[]): string[] {
  return rows
    .filter((row) => row.name.trim())
    .map((row) => {
      const safePrice = Math.max(0, Number.isFinite(Number(row.price)) ? Number(row.price) : 0);
      return `${row.name.trim()} (+$${formatSurcharge(safePrice)})`;
    });
}

export const DailyMenuEditorView: React.FC<DailyMenuEditorViewProps> = ({
  currentUser,
  onRefreshStats,
}) => {
  const [activeSection, setActiveSection] = useState<MenuAdminSection>('menu_dia');
  const [config, setConfig] = useState<DailyMenuConfig>(getDailyMenuConfig());
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [isAvailable, setIsAvailable] = useState<boolean>(config.isAvailable);
  const [availabilityStatus, setAvailabilityStatus] = useState<ComidaCorridaAvailabilityStatus>(
    config.availabilityStatus || (config.isAvailable === false ? 'AGOTADA' : 'DISPONIBLE')
  );
  const [availableWeekdays, setAvailableWeekdays] = useState<number[]>(
    config.availableWeekdays?.length ? config.availableWeekdays : [1, 2, 3, 4, 5]
  );
  const [quickAlternativesText, setQuickAlternativesText] = useState<string>(
    (config.quickAlternatives || []).join('\n')
  );
  const [price, setPrice] = useState<number>(config.price);
  const [entrada, setEntrada] = useState<string>(config.entrada);
  const [platoFuerte, setPlatoFuerte] = useState<string>(config.platoFuerte);
  const [guarnicion1, setGuarnicion1] = useState<string>(config.guarniciones[0] || '');
  const [guarnicion2, setGuarnicion2] = useState<string>(config.guarniciones[1] || '');
  const [aguaDelDia, setAguaDelDia] = useState<string>(config.aguaDelDia);
  const [postreDelDia, setPostreDelDia] = useState<string>(config.postreDelDia);
  const [alternativePrices, setAlternativePrices] = useState<AlternativePriceRow[]>(
    buildAlternativePriceRows(config.opcionesAlternativas)
  );

  useEffect(() => {
    const handleDataChange = () => {
      const latest = getDailyMenuConfig();
      setConfig(latest);
      setIsAvailable(latest.isAvailable);
      setAvailabilityStatus(latest.availabilityStatus || (latest.isAvailable === false ? 'AGOTADA' : 'DISPONIBLE'));
      setAvailableWeekdays(latest.availableWeekdays?.length ? latest.availableWeekdays : [1, 2, 3, 4, 5]);
      setQuickAlternativesText((latest.quickAlternatives || []).join('\n'));
      setPrice(latest.price);
      setEntrada(latest.entrada);
      setPlatoFuerte(latest.platoFuerte);
      setGuarnicion1(latest.guarniciones[0] || '');
      setGuarnicion2(latest.guarniciones[1] || '');
      setAguaDelDia(latest.aguaDelDia);
      setPostreDelDia(latest.postreDelDia);
      setAlternativePrices(buildAlternativePriceRows(latest.opcionesAlternativas));
    };

    window.addEventListener('alo_admin_data_updated', handleDataChange);
    window.addEventListener('storage', handleDataChange);
    return () => {
      window.removeEventListener('alo_admin_data_updated', handleDataChange);
      window.removeEventListener('storage', handleDataChange);
    };
  }, []);

  const handleAlternativePriceChange = (index: number, value: number) => {
    setAlternativePrices((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index
          ? { ...row, price: Math.max(0, Number.isFinite(value) ? value : 0) }
          : row
      )
    );
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (currentUser.role === 'EMPLEADO') {
      alert('Solo los Encargados o Administradores pueden actualizar el Menú del Día.');
      return;
    }

    try {
      const updated = await saveDailyMenuConfig(
        {
          isAvailable: availabilityStatus === 'DISPONIBLE' || availabilityStatus === 'ULTIMAS_PORCIONES',
          availabilityStatus,
          availableWeekdays,
          quickAlternatives: quickAlternativesText
            .split(/\n|,/)
            .map((value) => value.trim())
            .filter(Boolean)
            .slice(0, 6),
          price: Number(price),
          entrada: entrada.trim(),
          platoFuerte: platoFuerte.trim(),
          guarniciones: [guarnicion1.trim(), guarnicion2.trim()].filter(Boolean),
          aguaDelDia: aguaDelDia.trim(),
          postreDelDia: postreDelDia.trim(),
          opcionesAlternativas: serializeAlternativePriceRows(alternativePrices),
          serviceMode: config.serviceMode || 'AUTO',
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser.name,
        },
        currentUser
      );

      setConfig(updated);
      setIsAvailable(updated.isAvailable);
      setAvailabilityStatus(updated.availabilityStatus || (updated.isAvailable === false ? 'AGOTADA' : 'DISPONIBLE'));
      setAvailableWeekdays(updated.availableWeekdays?.length ? updated.availableWeekdays : [1, 2, 3, 4, 5]);
      setQuickAlternativesText((updated.quickAlternatives || []).join('\n'));
      setAlternativePrices(buildAlternativePriceRows(updated.opcionesAlternativas));
      setSuccessMsg('¡Menú del Día publicado en tiempo real para clientes y Tita!');
      window.setTimeout(() => setSuccessMsg(null), 3500);
      onRefreshStats();
    } catch (err: any) {
      alert(err?.message || 'Error al guardar el Menú del Día.');
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
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="bg-white rounded-3xl border border-[#F4E3C8] p-2 shadow-xs inline-flex gap-1 w-full sm:w-auto">
        <button
          type="button"
          onClick={() => setActiveSection('menu_dia')}
          className={`flex-1 sm:flex-none px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            activeSection === 'menu_dia'
              ? 'bg-[#3A2418] text-[#FFF7EA] shadow-sm'
              : 'text-[#6B4028] hover:bg-[#FFF7EA]'
          }`}
        >
          Menú del Día
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('catalogo')}
          className={`flex-1 sm:flex-none px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            activeSection === 'catalogo'
              ? 'bg-[#3A2418] text-[#FFF7EA] shadow-sm'
              : 'text-[#6B4028] hover:bg-[#FFF7EA]'
          }`}
        >
          Administrar Menú
        </button>
      </div>

      {activeSection === 'catalogo' ? (
        <MenuCatalogManagerView currentUser={currentUser} />
      ) : (
        <>
          {successMsg && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs sm:text-sm font-medium flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

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
                  {(['AUTO', 'DESAYUNO', 'COMIDA'] as ServiceMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleServiceModeSelect(mode)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        (config.serviceMode || 'AUTO') === mode
                          ? 'bg-[#3A2418] text-[#FFF7EA] shadow-xs'
                          : 'text-[#6B4028] hover:text-[#2B1B13]'
                      }`}
                    >
                      {mode === 'AUTO' && (config.serviceMode || 'AUTO') === 'AUTO'
                        ? `AUTO · Ahora: ${effectiveService}`
                        : mode}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 bg-[#FFF7EA] px-4 py-3 rounded-2xl border border-[#F4E3C8] min-w-[260px]">
                <span className="text-xs font-bold text-[#2B1B13]">Estado de la Comida Corrida</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {([
                    ['DISPONIBLE', '✅ Disponible'],
                    ['ULTIMAS_PORCIONES', '⚠️ Últimas'],
                    ['AGOTADA', '❌ Agotada'],
                    ['NO_DISPONIBLE', '🚫 Hoy no hay'],
                  ] as Array<[ComidaCorridaAvailabilityStatus, string]>).map(([status, label]) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => {
                        setAvailabilityStatus(status);
                        setIsAvailable(status === 'DISPONIBLE' || status === 'ULTIMAS_PORCIONES');
                      }}
                      className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black border transition-all ${
                        availabilityStatus === status
                          ? status === 'DISPONIBLE'
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : status === 'ULTIMAS_PORCIONES'
                            ? 'bg-amber-500 border-amber-500 text-white'
                            : 'bg-rose-600 border-rose-600 text-white'
                          : 'bg-white border-[#DEC8AE] text-[#5C3825]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleSave} className="bg-white rounded-3xl border border-[#F4E3C8] p-6 sm:p-8 shadow-xs space-y-5">
            <div className="rounded-2xl border border-[#DEC8AE] bg-[#FFF9F0] p-4 space-y-4">
              <div>
                <h3 className="font-serif font-black text-[#2B1B13]">Disponibilidad semanal</h3>
                <p className="text-[11px] text-[#6B4028] mt-1">
                  Activa sólo los días en que normalmente ofreces comida corrida. El estado de arriba manda en tiempo real durante el servicio.
                </p>
              </div>

              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {[
                  [1, 'Lun'],
                  [2, 'Mar'],
                  [3, 'Mié'],
                  [4, 'Jue'],
                  [5, 'Vie'],
                  [6, 'Sáb'],
                  [0, 'Dom'],
                ].map(([day, label]) => {
                  const active = availableWeekdays.includes(day as number);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() =>
                        setAvailableWeekdays((current) =>
                          active
                            ? current.filter((value) => value !== day)
                            : [...current, day as number].sort((a, b) => a - b)
                        )
                      }
                      className={`py-2 rounded-xl border text-[11px] font-black ${
                        active
                          ? 'bg-[#3A2418] border-[#3A2418] text-[#FFF7EA]'
                          : 'bg-white border-[#DEC8AE] text-[#7A5A45]'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider mb-1.5 font-serif">
                  Alternativas rápidas si se termina
                </label>
                <textarea
                  rows={3}
                  value={quickAlternativesText}
                  onChange={(event) => setQuickAlternativesText(event.target.value)}
                  placeholder={'Ej. Enchiladas Verdes\nPechuga Asada\nArma tu Ensalada'}
                  className="w-full px-4 py-2.5 bg-white rounded-xl border border-[#DEC8AE] text-xs text-[#2B1B13] focus:border-[#C9974D] focus:outline-hidden"
                />
                <p className="text-[10px] text-[#A86B3D] mt-1">
                  Escríbelas una por línea. El cliente las verá cuando la comida corrida esté agotada o no disponible.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider mb-1.5 flex items-center gap-1.5 font-serif">
                  <DollarSign className="w-3.5 h-3.5 text-[#C9974D]" /> Precio Menú Completo ($)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A86B3D] font-bold">$</span>
                  <input
                    type="number"
                    required
                    min="0"
                    value={price}
                    onChange={(event) => setPrice(Number(event.target.value))}
                    className="w-full pl-8 pr-4 py-2.5 bg-[#FFF7EA] focus:bg-white rounded-xl border border-[#F4E3C8] text-[#2B1B13] font-bold text-lg focus:border-[#C9974D] focus:outline-hidden"
                  />
                </div>
                <p className="text-[10px] text-[#A86B3D] mt-1">Incluye entrada, plato fuerte, guarniciones, agua y postre.</p>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider mb-1.5 flex items-center gap-1.5 font-serif">
                  <Utensils className="w-3.5 h-3.5 text-[#C9974D]" /> Plato Fuerte / Guisados del Día *
                </label>
                <textarea
                  required
                  rows={2}
                  value={platoFuerte}
                  onChange={(event) => setPlatoFuerte(event.target.value)}
                  className="w-full px-4 py-2.5 bg-[#FFF7EA] focus:bg-white rounded-xl border border-[#F4E3C8] text-xs sm:text-sm text-[#2B1B13] focus:border-[#C9974D] focus:outline-hidden"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-[#DEC8AE] bg-[#FFF7EA] p-4">
              <div className="mb-3">
                <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider mb-1.5 flex items-center gap-1.5 font-serif">
                  <DollarSign className="w-3.5 h-3.5 text-[#C9974D]" /> Precios de Especialidades y Clásicos
                </label>
                <p className="text-[11px] text-[#6B4028] leading-relaxed">
                  Sólo se muestran las alternativas que existen en la carta original. Cada una puede tener su propio recargo.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {alternativePrices.map((row, index) => (
                  <div key={`${row.name}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-[#F4E3C8] bg-white px-3 py-2.5">
                    <span className="text-[11px] font-bold text-[#3A2418] leading-snug min-w-0">{row.name}</span>
                    <div className="relative w-24 shrink-0">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#A86B3D] text-xs font-bold">+$</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={row.price}
                        onChange={(event) => handleAlternativePriceChange(index, Number(event.target.value))}
                        className="w-full pl-8 pr-2 py-2 bg-[#FFF7EA] rounded-lg border border-[#DEC8AE] text-[#2B1B13] font-bold text-sm focus:border-[#C9974D] focus:outline-hidden"
                        aria-label={`Recargo de ${row.name}`}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-[#A86B3D] mt-2">
                Al publicar se reemplazan alternativas antiguas que no pertenecen a la carta, como “Bistec encebollado”.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider mb-1.5 flex items-center gap-1.5 font-serif">
                <Soup className="w-3.5 h-3.5 text-[#C9974D]" /> Entrada / Sopa del Día
              </label>
              <input
                type="text"
                required
                value={entrada}
                onChange={(event) => setEntrada(event.target.value)}
                className="w-full px-4 py-2.5 bg-[#FFF7EA] focus:bg-white rounded-xl border border-[#F4E3C8] text-xs sm:text-sm text-[#2B1B13] focus:border-[#C9974D] focus:outline-hidden"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider mb-1.5 font-serif">Guarnición 1</label>
                <input
                  type="text"
                  value={guarnicion1}
                  onChange={(event) => setGuarnicion1(event.target.value)}
                  className="w-full px-4 py-2.5 bg-[#FFF7EA] focus:bg-white rounded-xl border border-[#F4E3C8] text-xs text-[#2B1B13] focus:border-[#C9974D] focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider mb-1.5 font-serif">Guarnición 2</label>
                <input
                  type="text"
                  value={guarnicion2}
                  onChange={(event) => setGuarnicion2(event.target.value)}
                  className="w-full px-4 py-2.5 bg-[#FFF7EA] focus:bg-white rounded-xl border border-[#F4E3C8] text-xs text-[#2B1B13] focus:border-[#C9974D] focus:outline-hidden"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider mb-1.5 flex items-center gap-1.5 font-serif">
                  <GlassWater className="w-3.5 h-3.5 text-[#C9974D]" /> Agua Fresca del Día
                </label>
                <input
                  type="text"
                  value={aguaDelDia}
                  onChange={(event) => setAguaDelDia(event.target.value)}
                  className="w-full px-4 py-2.5 bg-[#FFF7EA] focus:bg-white rounded-xl border border-[#F4E3C8] text-xs text-[#2B1B13] focus:border-[#C9974D] focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider mb-1.5 flex items-center gap-1.5 font-serif">
                  <Cake className="w-3.5 h-3.5 text-[#C9974D]" /> Postre Casero del Día
                </label>
                <input
                  type="text"
                  value={postreDelDia}
                  onChange={(event) => setPostreDelDia(event.target.value)}
                  className="w-full px-4 py-2.5 bg-[#FFF7EA] focus:bg-white rounded-xl border border-[#F4E3C8] text-xs text-[#2B1B13] focus:border-[#C9974D] focus:outline-hidden"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-[#F4E3C8]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs text-[#6B4028]">
                Última edición por: <strong className="text-[#2B1B13]">{config.updatedBy || 'Administración'}</strong>
              </span>
              <button
                type="submit"
                className="px-6 py-3 bg-[#3A2418] hover:bg-[#6B4028] text-[#FFF7EA] rounded-2xl font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 border border-[#C9974D]/40"
              >
                <Save className="w-4 h-4 text-[#C9974D]" /> Publicar Menú del Día
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
