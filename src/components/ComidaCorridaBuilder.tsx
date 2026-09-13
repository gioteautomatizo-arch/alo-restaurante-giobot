import React, { useEffect, useMemo, useState } from 'react';
import { MENU_ITEMS } from '../data/menu';
import { CartItem, ComidaCorridaCustomization, DailyMenuConfig } from '../types';
import { getDailyMenuConfig } from '../lib/adminStorage';
import { subscribeToCache } from '../lib/firestoreService';
import { AlertCircle, Cake, Check, ChevronDown, Flame, GlassWater, Soup, Sparkles, Utensils, X } from 'lucide-react';

interface ComidaCorridaBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (cartItem: CartItem) => void;
}

type AlternativeChoice = {
  label: string;
  value: string;
};

type AlternativeGroup = {
  id: string;
  label: string;
  surcharge: number;
  choices: AlternativeChoice[];
  directValue?: string;
};

const ALT_SURCHARGE_MARKER = '__RECARGO_ESPECIALIDADES_SIN_PRECIO__:';

const normalizeDishKey = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*\(\+?\$?\d+(?:\.\d+)?\)\s*/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const getExplicitSurcharge = (name: string): number | null => {
  const match = name.match(/\(\s*\+\s*\$?\s*(\d+(?:\.\d+)?)\s*\)/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const formatSurcharge = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(2);

const stripSurcharge = (value: string): string =>
  value.replace(/\s*\(\s*\+\s*\$?\s*\d+(?:\.\d+)?\s*\)\s*$/i, '').trim();

const withSurcharge = (name: string, surcharge: number): string =>
  `${name} (+$${formatSurcharge(surcharge)})`;

const splitMenuChoices = (value: string): string[] =>
  value
    .split(/\s*\/\s*|\n+|\s+(?:o|u)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);

const getAlternativeDefaultSurcharge = (options?: string[]): number => {
  const marker = (options || []).find((option) => option.startsWith(ALT_SURCHARGE_MARKER));
  const parsed = marker ? Number(marker.slice(ALT_SURCHARGE_MARKER.length)) : 5;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5;
};

const buildAlternativeGroup = (rawOption: string, defaultSurcharge: number): AlternativeGroup => {
  const explicit = getExplicitSurcharge(rawOption);
  const surcharge = explicit ?? defaultSurcharge;
  const base = stripSurcharge(rawOption);
  const key = normalizeDishKey(base);

  if (key === 'milanesa de res o pollo' || key === 'milanesa res o pollo') {
    return {
      id: 'milanesa',
      label: 'Milanesa',
      surcharge,
      choices: [
        { label: 'Res', value: withSurcharge('Milanesa de Res', surcharge) },
        { label: 'Pollo', value: withSurcharge('Milanesa de Pollo', surcharge) },
      ],
    };
  }

  if (
    key === 'bistec o pechuga asada' ||
    key === 'bistec asado o pechuga asada' ||
    key === 'asada de res o pollo' ||
    key === 'asada res o pollo'
  ) {
    return {
      id: 'asada',
      label: 'Asada',
      surcharge,
      choices: [
        { label: 'Res', value: withSurcharge('Bistec Asado', surcharge) },
        { label: 'Pollo', value: withSurcharge('Pechuga Asada', surcharge) },
      ],
    };
  }

  if (key === 'enchiladas verdes o rojas' || key === 'enchiladas verde o roja') {
    return {
      id: 'enchiladas',
      label: 'Enchiladas',
      surcharge,
      choices: [
        { label: 'Verdes', value: withSurcharge('Enchiladas Verdes', surcharge) },
        { label: 'Rojas', value: withSurcharge('Enchiladas Rojas', surcharge) },
      ],
    };
  }

  if (key === 'chilaquiles verdes o rojos' || key === 'chilaquiles verde o rojo') {
    return {
      id: 'chilaquiles',
      label: 'Chilaquiles',
      surcharge,
      choices: [
        { label: 'Verdes', value: withSurcharge('Chilaquiles Verdes', surcharge) },
        { label: 'Rojos', value: withSurcharge('Chilaquiles Rojos', surcharge) },
      ],
    };
  }

  return {
    id: normalizeDishKey(base).replace(/\s+/g, '-') || `especialidad-${Math.random()}`,
    label: base,
    surcharge,
    choices: [],
    directValue: explicit !== null ? rawOption.trim() : withSurcharge(base, surcharge),
  };
};

const ChoiceButton: React.FC<{
  active: boolean;
  label: string;
  onClick: () => void;
}> = ({ active, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`p-3 rounded-xl border text-xs font-bold text-left transition-all flex items-center justify-between cursor-pointer ${
      active
        ? 'bg-[#C77B4A]/15 border-[#A86B3D] text-[#3A2418] ring-1 ring-[#A86B3D]'
        : 'bg-[#FFF7EA] border-[#F4E3C8] text-[#3A2418] hover:bg-[#F4E3C8]/50'
    }`}
  >
    <span className="leading-snug">{label}</span>
    {active && <Check className="w-4 h-4 text-[#A86B3D] shrink-0 ml-2" />}
  </button>
);

export const ComidaCorridaBuilder: React.FC<ComidaCorridaBuilderProps> = ({ isOpen, onClose, onAddToCart }) => {
  const [dailyMenu, setDailyMenu] = useState<DailyMenuConfig>(getDailyMenuConfig());
  const [primerTiempo, setPrimerTiempo] = useState('');
  const [segundoTiempo, setSegundoTiempo] = useState('');
  const [tercerTiempo, setTercerTiempo] = useState('');
  const [extraAgrega, setExtraAgrega] = useState('Sin extra');
  const [expandedAlternativeId, setExpandedAlternativeId] = useState<string | null>(null);

  useEffect(() => {
    setDailyMenu(getDailyMenuConfig());
    const unsubCache = subscribeToCache((cache) => cache.dailyMenu && setDailyMenu(cache.dailyMenu));
    const refresh = () => setDailyMenu(getDailyMenuConfig());
    window.addEventListener('alo_admin_data_updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      unsubCache();
      window.removeEventListener('alo_admin_data_updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setExtraAgrega('Sin extra');
      setExpandedAlternativeId(null);
    }
  }, [isOpen]);

  const primerTiempoOptions = useMemo(() => {
    if (!dailyMenu.entrada?.trim()) {
      return ['Consomé de pollo con menudencias o verduras', 'Sopa de verduras', 'Crema o sopa aguada del día'];
    }
    const parts = dailyMenu.entrada
      .split(/\s*(?:\/|\n|,| o | O | u | U )\s*/)
      .map((value) => value.trim())
      .filter(Boolean);
    return parts.length ? parts : [dailyMenu.entrada.trim()];
  }, [dailyMenu.entrada]);

  const segundoTiempoOptions = useMemo(() => {
    const clean = (dailyMenu.guarniciones || []).map((value) => value.trim()).filter(Boolean);
    return clean.length ? clean : ['Arroz rojo', 'Pasta o espagueti'];
  }, [dailyMenu.guarniciones]);

  const dailyGuisadoOptions = useMemo(() => {
    if (!dailyMenu.platoFuerte?.trim()) return ['Guisado del día'];
    const clean = dailyMenu.platoFuerte.replace(/^guisados?\s*del\s*d[ií]a\s*:\s*/i, '');
    const seen = new Set<string>();
    return splitMenuChoices(clean).filter((item) => {
      const key = normalizeDishKey(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [dailyMenu.platoFuerte]);

  const alternativeDefaultSurcharge = useMemo(
    () => getAlternativeDefaultSurcharge(dailyMenu.opcionesAlternativas),
    [dailyMenu.opcionesAlternativas]
  );

  const alternativeGroups = useMemo<AlternativeGroup[]>(() => {
    const configured = (dailyMenu.opcionesAlternativas || [])
      .filter((option) => !option.startsWith(ALT_SURCHARGE_MARKER))
      .map((option) => option.trim())
      .filter(Boolean);

    const fallback = [
      'Enchiladas verdes o rojas (+$5)',
      'Milanesa de res o pollo (+$5)',
      'Tacos dorados (+$5)',
      'Bistec o pechuga asada (+$5)',
      'Enchiladas suizas (+$10)',
    ];

    const source = configured.length ? configured : fallback;
    const seen = new Set<string>();
    const dailyKeys = new Set(dailyGuisadoOptions.map(normalizeDishKey));

    return source
      .map((option) => buildAlternativeGroup(option, alternativeDefaultSurcharge))
      .filter((group) => {
        const key = normalizeDishKey(group.label);
        if (!key || seen.has(key) || dailyKeys.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [dailyMenu.opcionesAlternativas, dailyGuisadoOptions, alternativeDefaultSurcharge]);

  const alternativeValues = useMemo(
    () => new Set(
      alternativeGroups.flatMap((group) =>
        group.directValue ? [group.directValue] : group.choices.map((choice) => choice.value)
      )
    ),
    [alternativeGroups]
  );

  const selectedThirdSurcharge = useMemo(() => {
    const explicit = getExplicitSurcharge(tercerTiempo);
    if (explicit !== null) return explicit;
    return alternativeValues.has(tercerTiempo) ? alternativeDefaultSurcharge : 0;
  }, [tercerTiempo, alternativeValues, alternativeDefaultSurcharge]);

  useEffect(() => {
    if (!primerTiempoOptions.includes(primerTiempo)) setPrimerTiempo(primerTiempoOptions[0] || '');
  }, [primerTiempoOptions, primerTiempo]);

  useEffect(() => {
    if (!segundoTiempoOptions.includes(segundoTiempo)) setSegundoTiempo(segundoTiempoOptions[0] || '');
  }, [segundoTiempoOptions, segundoTiempo]);

  useEffect(() => {
    const alternativeList = Array.from(alternativeValues);
    const all = [...dailyGuisadoOptions, ...alternativeList];
    if (!all.includes(tercerTiempo)) setTercerTiempo(dailyGuisadoOptions[0] || all[0] || '');
  }, [dailyGuisadoOptions, alternativeValues, tercerTiempo]);

  if (!isOpen) return null;

  const baseMenuPrice = Number(dailyMenu.price) > 0 ? Number(dailyMenu.price) : 90;
  const finalUnitPrice = baseMenuPrice + selectedThirdSurcharge + (extraAgrega === 'Sin extra' ? 0 : 10);

  const handleAlternativeGroupClick = (group: AlternativeGroup) => {
    if (group.directValue) {
      setTercerTiempo(group.directValue);
      setExpandedAlternativeId(null);
      return;
    }
    setExpandedAlternativeId((current) => current === group.id ? null : group.id);
  };

  const handleAdd = () => {
    const customComidaCorrida: ComidaCorridaCustomization = {
      primerTiempo: primerTiempo || primerTiempoOptions[0] || 'Sopa del día',
      segundoTiempo: segundoTiempo || segundoTiempoOptions[0] || 'Arroz del día',
      tercerTiempo: tercerTiempo || dailyGuisadoOptions[0] || 'Guisado del día',
      extraAgrega: extraAgrega !== 'Sin extra' ? extraAgrega : undefined,
    };

    const item = MENU_ITEMS.find((menuItem) => menuItem.id === 'comida-corrida') || {
      id: 'comida-corrida',
      name: 'Comida Corrida Completa',
      category: 'comida-corrida' as const,
      description: `Menú completo de 3 tiempos con ${dailyMenu.aguaDelDia || 'agua del día'} y ${dailyMenu.postreDelDia || 'postre casero'}.`,
      price: baseMenuPrice,
    };

    const cartItem: CartItem = {
      cartId: `corrida-${Date.now()}`,
      item,
      quantity: 1,
      customComidaCorrida,
      selectedOption: `${customComidaCorrida.primerTiempo} + ${customComidaCorrida.segundoTiempo} + ${customComidaCorrida.tercerTiempo}`,
      unitPrice: finalUnitPrice,
      totalPrice: finalUnitPrice,
    };

    onAddToCart(cartItem);
    setExtraAgrega('Sin extra');
    setExpandedAlternativeId(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2B1B13]/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-[#FFF7EA] w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-[#F4E3C8] flex flex-col max-h-[92vh]">
        <div className="bg-gradient-to-r from-[#3A2418] to-[#2B1B13] text-[#FFF7EA] p-5 flex items-start justify-between">
          <div>
            <span className="text-[10px] uppercase font-black tracking-widest text-[#C9974D]">Menú del Día en Vivo</span>
            <h2 className="text-xl sm:text-2xl font-black font-serif mt-0.5">Comida Corrida Completa (${baseMenuPrice})</h2>
            <p className="text-xs text-[#F4E3C8] mt-0.5">Incluye 1/2L de {dailyMenu.aguaDelDia || 'agua fresca'} + {dailyMenu.postreDelDia || 'postre casero'}.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full bg-[#4A2E1F] text-[#FFF7EA]"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-2xl bg-[#F4E3C8]/40 border border-[#C9974D]/30">
            <div className="flex items-center gap-2.5 text-xs"><GlassWater className="w-4 h-4 text-[#A86B3D]" /><strong>{dailyMenu.aguaDelDia || 'Agua fresca del día'} · 1/2 L</strong></div>
            <div className="flex items-center gap-2.5 text-xs"><Cake className="w-4 h-4 text-[#A86B3D]" /><strong>{dailyMenu.postreDelDia || 'Postre casero del día'}</strong></div>
          </div>

          {!dailyMenu.isAvailable && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /><strong>El menú del día está marcado como agotado.</strong>
            </div>
          )}

          <section>
            <h3 className="text-xs font-bold uppercase text-[#3A2418] mb-2 flex items-center gap-1.5"><Soup className="w-4 h-4 text-[#A86B3D]" />1er Tiempo</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {primerTiempoOptions.map((option) => <ChoiceButton key={option} active={primerTiempo === option} label={option} onClick={() => setPrimerTiempo(option)} />)}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase text-[#3A2418] mb-2 flex items-center gap-1.5"><Utensils className="w-4 h-4 text-[#A86B3D]" />2do Tiempo</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {segundoTiempoOptions.map((option) => (
                <ChoiceButton key={option} active={segundoTiempo === option} label={option} onClick={() => {
                  if (option !== segundoTiempo) setExtraAgrega('Sin extra');
                  setSegundoTiempo(option);
                }} />
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase text-[#3A2418] flex items-center gap-1.5"><Flame className="w-4 h-4 text-[#A86B3D]" />3er Tiempo · Plato Fuerte</h3>

            <div>
              <span className="text-[11px] font-bold text-[#A86B3D] uppercase">✨ Guisados del Día</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1.5">
                {dailyGuisadoOptions.map((option) => <ChoiceButton key={option} active={tercerTiempo === option} label={option} onClick={() => setTercerTiempo(option)} />)}
              </div>
            </div>

            {alternativeGroups.length > 0 && (
              <div>
                <span className="text-[11px] font-semibold text-[#6B4028] uppercase">Otras Especialidades y Clásicos</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1.5">
                  {alternativeGroups.map((group) => {
                    const selectedChoice = group.choices.find((choice) => choice.value === tercerTiempo);
                    const directSelected = group.directValue === tercerTiempo;
                    const active = Boolean(selectedChoice || directSelected);
                    const expanded = expandedAlternativeId === group.id;

                    return (
                      <div key={group.id} className={`rounded-xl border overflow-hidden ${active ? 'border-[#A86B3D] bg-[#C77B4A]/10' : 'border-[#F4E3C8] bg-[#FFF7EA]'}`}>
                        <button
                          type="button"
                          onClick={() => handleAlternativeGroupClick(group)}
                          className="w-full p-3 text-left flex items-center justify-between gap-2"
                        >
                          <div>
                            <span className="block text-xs font-bold text-[#3A2418]">{group.label}</span>
                            <span className="block text-[10px] text-[#A86B3D] mt-0.5">
                              {selectedChoice ? selectedChoice.label : `+$${formatSurcharge(group.surcharge)}`}
                            </span>
                          </div>
                          {group.choices.length > 0 ? (
                            <ChevronDown className={`w-4 h-4 text-[#A86B3D] transition-transform ${expanded ? 'rotate-180' : ''}`} />
                          ) : directSelected ? (
                            <Check className="w-4 h-4 text-[#A86B3D]" />
                          ) : null}
                        </button>

                        {group.choices.length > 0 && expanded && (
                          <div className="px-3 pb-3 grid grid-cols-2 gap-2">
                            {group.choices.map((choice) => (
                              <button
                                key={choice.value}
                                type="button"
                                onClick={() => {
                                  setTercerTiempo(choice.value);
                                  setExpandedAlternativeId(null);
                                }}
                                className={`py-2 px-3 rounded-lg border text-[11px] font-bold ${
                                  tercerTiempo === choice.value
                                    ? 'bg-[#3A2418] border-[#3A2418] text-[#FFF7EA]'
                                    : 'bg-white border-[#DEC8AE] text-[#5C3825]'
                                }`}
                              >
                                {choice.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase text-[#3A2418] mb-2">Agrega a tu Guarnición (+ $10)</h3>
            <div className="grid grid-cols-3 gap-2">
              {['Sin extra', 'Agrega Huevo (+ $10)', 'Agrega Plátano (+ $10)'].map((option) => (
                <button key={option} type="button" onClick={() => setExtraAgrega(option)} className={`p-2.5 rounded-xl border text-xs font-semibold ${extraAgrega === option ? 'bg-[#3A2418] text-[#FFF7EA]' : 'bg-[#FFF7EA] border-[#F4E3C8] text-[#3A2418]'}`}>{option}</button>
              ))}
            </div>
          </section>

          <div className="bg-[#F4E3C8]/60 border border-[#C9974D]/40 rounded-2xl p-4 text-xs text-[#2B1B13] space-y-1.5">
            <h4 className="font-bold flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-[#C9974D]" />Tu Menú Incluye</h4>
            <p>• 1er Tiempo: <strong>{primerTiempo}</strong></p>
            <p>• 2do Tiempo: <strong>{segundoTiempo}</strong> {extraAgrega !== 'Sin extra' && `(${extraAgrega})`}</p>
            <p>• 3er Tiempo: <strong>{tercerTiempo}</strong></p>
          </div>
        </div>

        <div className="bg-[#FFF7EA] p-4 border-t border-[#F4E3C8] flex items-center justify-between gap-4">
          <div><span className="text-xs text-[#6B4028] font-bold uppercase">Precio Total: </span><span className="text-xl font-black text-[#3A2418] font-serif">${finalUnitPrice}</span></div>
          <button onClick={handleAdd} className="py-3 px-6 bg-gradient-to-r from-[#C77B4A] to-[#A86B3D] text-white rounded-xl font-bold text-sm shadow-md flex items-center gap-2"><Sparkles className="w-4 h-4" />Agregar Comida Corrida (${finalUnitPrice})</button>
        </div>
      </div>
    </div>
  );
};