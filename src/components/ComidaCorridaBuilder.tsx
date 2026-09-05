import React, { useState, useEffect, useMemo } from 'react';
import { MENU_ITEMS } from '../data/menu';
import { CartItem, ComidaCorridaCustomization, DailyMenuConfig } from '../types';
import { getDailyMenuConfig } from '../lib/adminStorage';
import { subscribeToCache } from '../lib/firestoreService';
import { X, Check, Utensils, Soup, Flame, Sparkles, GlassWater, Cake, AlertCircle } from 'lucide-react';

interface ComidaCorridaBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (cartItem: CartItem) => void;
}

export const ComidaCorridaBuilder: React.FC<ComidaCorridaBuilderProps> = ({
  isOpen,
  onClose,
  onAddToCart,
}) => {
  const [dailyMenu, setDailyMenu] = useState<DailyMenuConfig>(getDailyMenuConfig());
  const [primerTiempo, setPrimerTiempo] = useState<string>('');
  const [segundoTiempo, setSegundoTiempo] = useState<string>('');
  const [tercerTiempo, setTercerTiempo] = useState<string>('');
  const [extraAgrega, setExtraAgrega] = useState<string>('Sin extra');
  const [quantity, setQuantity] = useState<number>(1);

  // Escuchar cambios en tiempo real desde Firestore y el caché local
  useEffect(() => {
    // 1. Cargar estado inicial
    const initialConfig = getDailyMenuConfig();
    setDailyMenu(initialConfig);

    // 2. Suscribirse a cambios en tiempo real de Firestore mediante el bus de caché
    const unsubCache = subscribeToCache((cache) => {
      if (cache.dailyMenu) {
        setDailyMenu(cache.dailyMenu);
      }
    });

    // 3. Escuchar eventos entre pestañas o actualizaciones inmediatas
    const handleDataChange = () => {
      setDailyMenu(getDailyMenuConfig());
    };

    window.addEventListener('alo_admin_data_updated', handleDataChange);
    window.addEventListener('storage', handleDataChange);

    return () => {
      unsubCache();
      window.removeEventListener('alo_admin_data_updated', handleDataChange);
      window.removeEventListener('storage', handleDataChange);
    };
  }, []);

  // Parsear opciones de Entrada / Sopa
  const primerTiempoOptions = useMemo<string[]>(() => {
    if (!dailyMenu.entrada || !dailyMenu.entrada.trim()) {
      return ['Consomé del día', 'Sopa del día'];
    }
    const parts = dailyMenu.entrada
      .split(/\s*(?:\/|\n|,| o | O | u | U )\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts : [dailyMenu.entrada.trim()];
  }, [dailyMenu.entrada]);

  // Parsear opciones de Guarnición (Arroz / Pasta / Guarnición 1 & 2)
  const segundoTiempoOptions = useMemo<string[]>(() => {
    if (!dailyMenu.guarniciones || dailyMenu.guarniciones.length === 0) {
      return ['Arroz del día', 'Pasta del día'];
    }
    const clean = dailyMenu.guarniciones.map((g) => g.trim()).filter(Boolean);
    return clean.length > 0 ? clean : ['Arroz del día', 'Pasta del día'];
  }, [dailyMenu.guarniciones]);

  // Parsear guisados del día publicados desde Administración
  const dailyGuisadoOptions = useMemo<string[]>(() => {
    if (!dailyMenu.platoFuerte || !dailyMenu.platoFuerte.trim()) {
      return ['Guisado del día'];
    }
    const parts = dailyMenu.platoFuerte
      .split(/\s*(?:\/|\n)\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts : [dailyMenu.platoFuerte.trim()];
  }, [dailyMenu.platoFuerte]);

  // Opciones alternativas clásicas de la cocina
  const alternativeOptions = useMemo<string[]>(() => {
    const defaults = [
      'Enchiladas Verdes',
      'Enchiladas Rojas',
      'Milanesa de Res',
      'Milanesa de Pollo',
      'Tacos Dorados',
      'Bistec Asado (+$5)',
      'Pechuga Asada (+$5)',
      'Enchiladas Suizas (+$10)',
    ];
    if (dailyMenu.opcionesAlternativas && dailyMenu.opcionesAlternativas.length > 0) {
      const custom = dailyMenu.opcionesAlternativas.map((o) => o.trim()).filter(Boolean);
      return Array.from(new Set([...custom, ...defaults]));
    }
    return defaults;
  }, [dailyMenu.opcionesAlternativas]);

  // Sincronizar selección activa cuando cambia el menú
  useEffect(() => {
    if (primerTiempoOptions.length > 0 && (!primerTiempo || !primerTiempoOptions.includes(primerTiempo))) {
      setPrimerTiempo(primerTiempoOptions[0]);
    }
  }, [primerTiempoOptions, primerTiempo]);

  useEffect(() => {
    if (segundoTiempoOptions.length > 0 && (!segundoTiempo || !segundoTiempoOptions.includes(segundoTiempo))) {
      setSegundoTiempo(segundoTiempoOptions[0]);
    }
  }, [segundoTiempoOptions, segundoTiempo]);

  useEffect(() => {
    const allTercerOptions = [...dailyGuisadoOptions, ...alternativeOptions];
    if (allTercerOptions.length > 0 && (!tercerTiempo || !allTercerOptions.includes(tercerTiempo))) {
      setTercerTiempo(dailyGuisadoOptions[0] || allTercerOptions[0]);
    }
  }, [dailyGuisadoOptions, alternativeOptions, tercerTiempo]);

  if (!isOpen) return null;

  // Cálculo de precio base y extras
  const baseMenuPrice = Number(dailyMenu.price) > 0 ? Number(dailyMenu.price) : 90;
  let finalUnitPrice = baseMenuPrice;
  if (tercerTiempo.includes('+$5')) finalUnitPrice += 5;
  if (tercerTiempo.includes('+$10')) finalUnitPrice += 10;
  if (extraAgrega !== 'Sin extra') finalUnitPrice += 10;

  const handleAdd = () => {
    const customComidaCorrida: ComidaCorridaCustomization = {
      primerTiempo: primerTiempo || primerTiempoOptions[0] || 'Sopa del día',
      segundoTiempo: segundoTiempo || segundoTiempoOptions[0] || 'Arroz del día',
      tercerTiempo: tercerTiempo || dailyGuisadoOptions[0] || 'Guisado del día',
      extraAgrega: extraAgrega !== 'Sin extra' ? extraAgrega : undefined,
    };

    const corridaItem = MENU_ITEMS.find((i) => i.id === 'comida-corrida') || {
      id: 'comida-corrida',
      name: 'Comida Corrida Completa',
      category: 'comida-corrida' as const,
      description: `Menú completo de 3 tiempos con ${dailyMenu.aguaDelDia || 'agua del día'} y ${dailyMenu.postreDelDia || 'postre casero'}.`,
      price: baseMenuPrice,
    };

    const cartItem: CartItem = {
      cartId: `corrida-${Date.now()}`,
      item: corridaItem,
      quantity,
      customComidaCorrida,
      selectedOption: `${customComidaCorrida.primerTiempo} + ${customComidaCorrida.segundoTiempo} + ${customComidaCorrida.tercerTiempo}`,
      unitPrice: finalUnitPrice,
      totalPrice: finalUnitPrice * quantity,
    };

    onAddToCart(cartItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2B1B13]/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-[#FFF7EA] w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-[#F4E3C8] flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#3A2418] to-[#2B1B13] text-[#FFF7EA] p-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#C9974D]/20 border border-[#C9974D]/40 flex items-center justify-center text-[#C9974D] text-2xl font-bold">
              🍲
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-black tracking-widest text-[#C9974D] bg-[#4A2E1F] px-2.5 py-0.5 rounded-full border border-[#C9974D]/50 font-serif">
                  Menú del Día en Vivo
                </span>
                {!dailyMenu.isAvailable && (
                  <span className="text-[10px] uppercase font-black tracking-widest text-rose-300 bg-rose-950/80 px-2 py-0.5 rounded-full border border-rose-600/50">
                    Agotado en cocina
                  </span>
                )}
              </div>
              <h2 className="text-xl sm:text-2xl font-black font-serif text-[#FFF7EA] mt-0.5">
                Comida Corrida Completa (${baseMenuPrice})
              </h2>
              <p className="text-xs text-[#F4E3C8] mt-0.5">
                Incluye 1/2L de {dailyMenu.aguaDelDia || 'agua fresca del día'} + {dailyMenu.postreDelDia || 'postre casero de cortesía'}.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-[#4A2E1F] hover:bg-[#5C3825] text-[#FFF7EA] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Customization Options */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Banner de Agua y Postre del Día en Tiempo Real */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-2xl bg-[#F4E3C8]/40 border border-[#C9974D]/30">
            <div className="flex items-center gap-2.5 text-xs text-[#2B1B13]">
              <div className="w-8 h-8 rounded-xl bg-[#C9974D]/20 border border-[#C9974D]/30 flex items-center justify-center text-[#A86B3D] shrink-0">
                <GlassWater className="w-4 h-4 text-[#A86B3D]" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#A86B3D] block font-serif">
                  Agua Fresca del Día (1/2 L)
                </span>
                <strong className="text-xs font-bold text-[#2B1B13] line-clamp-1">
                  {dailyMenu.aguaDelDia || 'Agua fresca del día'}
                </strong>
              </div>
            </div>

            <div className="flex items-center gap-2.5 text-xs text-[#2B1B13]">
              <div className="w-8 h-8 rounded-xl bg-[#C9974D]/20 border border-[#C9974D]/30 flex items-center justify-center text-[#A86B3D] shrink-0">
                <Cake className="w-4 h-4 text-[#A86B3D]" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#A86B3D] block font-serif">
                  Postre Casero de Cortesía
                </span>
                <strong className="text-xs font-bold text-[#2B1B13] line-clamp-1">
                  {dailyMenu.postreDelDia || 'Postre casero del día'}
                </strong>
              </div>
            </div>
          </div>

          {!dailyMenu.isAvailable && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Aviso de cocina:</strong> El menú del día fue marcado como agotado temporalmente en administración.
              </span>
            </div>
          )}

          {/* 1er Tiempo (Entrada / Sopa) */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#3A2418] mb-2 flex items-center gap-1.5 font-serif">
              <Soup className="w-4 h-4 text-[#A86B3D]" />
              1er Tiempo (Entrada / Sopa del Día)
            </label>
            <div className={`grid ${primerTiempoOptions.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'} gap-2`}>
              {primerTiempoOptions.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setPrimerTiempo(opt)}
                  className={`p-3 rounded-xl border text-xs font-bold text-left transition-all flex items-center justify-between cursor-pointer ${
                    primerTiempo === opt
                      ? 'bg-[#C77B4A]/15 border-[#A86B3D] text-[#3A2418] shadow-xs ring-1 ring-[#A86B3D]'
                      : 'bg-[#FFF7EA] border-[#F4E3C8] text-[#3A2418] hover:bg-[#F4E3C8]/50'
                  }`}
                >
                  <span className="leading-snug">{opt}</span>
                  {primerTiempo === opt && <Check className="w-4 h-4 text-[#A86B3D] shrink-0 ml-2" />}
                </button>
              ))}
            </div>
          </div>

          {/* 2do Tiempo (Guarniciones) */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#3A2418] mb-2 flex items-center gap-1.5 font-serif">
              <Utensils className="w-4 h-4 text-[#A86B3D]" />
              2do Tiempo (Guarnición / Pasta / Arroz)
            </label>
            <div className={`grid ${segundoTiempoOptions.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'} gap-2`}>
              {segundoTiempoOptions.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setSegundoTiempo(opt)}
                  className={`p-3 rounded-xl border text-xs font-bold text-left transition-all flex items-center justify-between cursor-pointer ${
                    segundoTiempo === opt
                      ? 'bg-[#C77B4A]/15 border-[#A86B3D] text-[#3A2418] shadow-xs ring-1 ring-[#A86B3D]'
                      : 'bg-[#FFF7EA] border-[#F4E3C8] text-[#3A2418] hover:bg-[#F4E3C8]/50'
                  }`}
                >
                  <span className="leading-snug">{opt}</span>
                  {segundoTiempo === opt && <Check className="w-4 h-4 text-[#A86B3D] shrink-0 ml-2" />}
                </button>
              ))}
            </div>
          </div>

          {/* 3er Tiempo (Plato Fuerte / Guisados del Día y Especialidades) */}
          <div className="space-y-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#3A2418] flex items-center gap-1.5 font-serif">
              <Flame className="w-4 h-4 text-[#A86B3D]" />
              3er Tiempo (Plato Fuerte / Guisado)
            </label>

            {/* Guisados del Día Publicados */}
            <div>
              <span className="text-[11px] font-bold text-[#A86B3D] uppercase tracking-wider block mb-1.5 font-serif">
                ✨ Guisados del Día de Hoy
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {dailyGuisadoOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setTercerTiempo(opt)}
                    className={`p-3 rounded-xl border text-xs font-bold text-left transition-all flex items-center justify-between cursor-pointer ${
                      tercerTiempo === opt
                        ? 'bg-[#C77B4A]/20 border-[#A86B3D] text-[#3A2418] shadow-xs ring-1.5 ring-[#A86B3D]'
                        : 'bg-white border-[#E6CCA8] text-[#3A2418] hover:bg-[#F4E3C8]/50 shadow-2xs'
                    }`}
                  >
                    <span className="leading-snug">{opt}</span>
                    {tercerTiempo === opt && <Check className="w-4 h-4 text-[#A86B3D] shrink-0 ml-2" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Alternativas y Especialidades Clásicas */}
            <div>
              <span className="text-[11px] font-semibold text-[#6B4028] uppercase tracking-wider block mb-1.5 font-serif">
                Otras Especialidades y Clásicos
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {alternativeOptions
                  .filter((opt) => !dailyGuisadoOptions.includes(opt))
                  .map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setTercerTiempo(opt)}
                      className={`p-2.5 rounded-xl border text-xs font-semibold text-left transition-all flex items-center justify-between cursor-pointer ${
                        tercerTiempo === opt
                          ? 'bg-[#C77B4A]/15 border-[#A86B3D] text-[#3A2418] shadow-xs ring-1 ring-[#A86B3D]'
                          : 'bg-[#FFF7EA] border-[#F4E3C8] text-[#3A2418] hover:bg-[#F4E3C8]/50'
                      }`}
                    >
                      <span className="leading-snug">{opt}</span>
                      {tercerTiempo === opt && <Check className="w-4 h-4 text-[#A86B3D] shrink-0 ml-2" />}
                    </button>
                  ))}
              </div>
            </div>
          </div>

          {/* Extra Addon (Huevo / Plátano) */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#3A2418] mb-2 font-serif">
              Agrega a tu Guarnición (+ $10)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {['Sin extra', 'Agrega Huevo (+ $10)', 'Agrega Plátano (+ $10)'].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setExtraAgrega(opt)}
                  className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-all cursor-pointer ${
                    extraAgrega === opt
                      ? 'bg-[#3A2418] text-[#FFF7EA] border-[#3A2418]'
                      : 'bg-[#FFF7EA] border-[#F4E3C8] text-[#3A2418] hover:bg-[#F4E3C8]/50'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Resumen del Pedido en Tiempo Real */}
          <div className="bg-[#F4E3C8]/60 border border-[#C9974D]/40 rounded-2xl p-4 text-xs text-[#2B1B13] space-y-1.5">
            <h4 className="font-bold text-[#3A2418] mb-1 font-serif flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#C9974D]" />
              Tu Menú de Hoy Incluye:
            </h4>
            <p>• 1er Tiempo: <strong>{primerTiempo || 'Entrada del día'}</strong></p>
            <p>• 2do Tiempo: <strong>{segundoTiempo || 'Guarnición del día'}</strong> {extraAgrega !== 'Sin extra' && `(${extraAgrega})`}</p>
            <p>• 3er Tiempo: <strong>{tercerTiempo || 'Guisado del día'}</strong></p>
            <p>• Bebida: <strong>1/2 Litro de {dailyMenu.aguaDelDia || 'Agua fresca del día'}</strong></p>
            <p>• Postre: <strong>{dailyMenu.postreDelDia || 'Postre casero del día'}</strong></p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#FFF7EA] p-4 border-t border-[#F4E3C8] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#6B4028] font-bold uppercase">Precio Total:</span>
            <span className="text-xl font-black text-[#3A2418] font-serif">${finalUnitPrice * quantity}</span>
          </div>

          <button
            onClick={handleAdd}
            className="py-3 px-6 bg-gradient-to-r from-[#C77B4A] to-[#A86B3D] hover:from-[#d68a57] hover:to-[#b77848] text-white rounded-xl font-bold text-sm shadow-md transition-all active:scale-98 flex items-center gap-2 cursor-pointer border border-[#C9974D]/30"
          >
            <Sparkles className="w-4 h-4 text-[#FFF7EA]" />
            <span>Agregar Comida Corrida (${finalUnitPrice})</span>
          </button>
        </div>
      </div>
    </div>
  );
};

