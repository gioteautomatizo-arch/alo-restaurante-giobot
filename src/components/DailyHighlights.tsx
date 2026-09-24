import React, { useEffect, useMemo, useState } from 'react';
import { CategoryId, DailyMenuConfig } from '../types';
import { Sparkles, UtensilsCrossed, Salad, SunMedium, Soup, ArrowRight, AlertTriangle } from 'lucide-react';
import { getDailyMenuConfig } from '../lib/adminStorage';
import { subscribeToCache } from '../lib/firestoreService';
import {
  getComidaCorridaStatus,
  getComidaCorridaStatusLabel,
  getComidaCorridaStatusMessage,
  isComidaCorridaOrderable,
} from '../lib/comidaCorridaAvailability';

interface DailyHighlightsProps {
  onOpenComidaCorrida: () => void;
  onOpenSaladBuilder: () => void;
  onSelectCategory: (cat: CategoryId) => void;
}

export const DailyHighlights: React.FC<DailyHighlightsProps> = ({
  onOpenComidaCorrida,
  onOpenSaladBuilder,
  onSelectCategory,
}) => {
  const [dailyMenu, setDailyMenu] = useState<DailyMenuConfig>(getDailyMenuConfig());

  useEffect(() => {
    setDailyMenu(getDailyMenuConfig());
    const unsubCache = subscribeToCache((cache) => {
      if (cache.dailyMenu) setDailyMenu(cache.dailyMenu);
    });
    const refresh = () => setDailyMenu(getDailyMenuConfig());
    window.addEventListener('alo_admin_data_updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      unsubCache();
      window.removeEventListener('alo_admin_data_updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const corridaStatus = useMemo(() => getComidaCorridaStatus(dailyMenu), [dailyMenu]);
  const corridaOrderable = useMemo(() => isComidaCorridaOrderable(dailyMenu), [dailyMenu]);
  const alternatives = (dailyMenu.quickAlternatives || []).filter(Boolean).slice(0, 4);

  return (
    <section className="w-full space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B4028] flex items-center gap-1.5 font-serif">
          <Sparkles className="w-3.5 h-3.5 text-[#C9974D]" />
          Especialidades del Día
        </h3>
        <span className="text-[11px] text-[#A86B3D] font-semibold">
          Toca para armar o explorar
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* 1. Comida Corrida dinámica */}
        <div
          role={corridaOrderable ? 'button' : undefined}
          tabIndex={corridaOrderable ? 0 : undefined}
          onClick={corridaOrderable ? onOpenComidaCorrida : undefined}
          onKeyDown={corridaOrderable ? (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onOpenComidaCorrida();
            }
          } : undefined}
          className={`p-3.5 rounded-2xl border text-left transition-all shadow-2xs flex flex-col justify-between ${
            corridaOrderable
              ? 'bg-[#FFFDF9] border-[#DEC8AE] hover:border-[#A86B3D]/70 hover:shadow-sm active:scale-[0.99] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C9974D]/50'
              : 'bg-rose-50/50 border-rose-200'
          }`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center border ${
                corridaOrderable
                  ? 'bg-[#F4E3C8] text-[#6B4028] border-[#C9974D]/30'
                  : 'bg-rose-100 text-rose-700 border-rose-200'
              }`}>
                {corridaOrderable ? <UtensilsCrossed className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
              </div>
              <span className="text-xs font-serif font-black px-2 py-0.5 rounded-full bg-[#3A2418] text-[#F4E3C8]">
                ${dailyMenu.price || 90}
              </span>
            </div>

            <div className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide mb-1.5 ${
              corridaStatus === 'DISPONIBLE'
                ? 'bg-emerald-100 text-emerald-800'
                : corridaStatus === 'ULTIMAS_PORCIONES'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-rose-100 text-rose-800'
            }`}>
              {getComidaCorridaStatusLabel(corridaStatus)}
            </div>

            <h4 className="font-serif font-bold text-xs sm:text-sm text-[#2B1B13] leading-snug">
              Comida Corrida
            </h4>
            <p className="text-[11px] text-[#6B4028]/80 mt-0.5 font-light leading-snug">
              {getComidaCorridaStatusMessage(corridaStatus)}
            </p>

            {!corridaOrderable && alternatives.length > 0 && (
              <div className="mt-2">
                <div className="text-[9px] font-black uppercase tracking-wide text-[#A86B3D]">Todavía puedes pedir</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {alternatives.map((alternative) => (
                    <span key={alternative} className="px-1.5 py-0.5 rounded-full bg-white border border-[#DEC8AE] text-[9px] font-bold text-[#5C3825]">
                      {alternative}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {corridaOrderable ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenComidaCorrida();
              }}
              className="mt-2.5 text-[10px] font-bold text-[#A86B3D] flex items-center gap-1 text-left"
            >
              Armar mi menú <ArrowRight className="w-3 h-3" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onSelectCategory('all')}
              className="mt-2.5 text-[10px] font-bold text-rose-700 flex items-center gap-1 text-left"
            >
              Ver alternativas <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* 2. Arma tu Ensalada $90 */}
        <button
          onClick={onOpenSaladBuilder}
          className="p-3.5 rounded-2xl bg-[#FFFDF9] hover:bg-[#F4E3C8]/40 border border-[#DEC8AE] hover:border-[#C77B4A]/70 text-left transition-all active:scale-98 shadow-2xs cursor-pointer flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="w-7 h-7 rounded-lg bg-[#F4E3C8] flex items-center justify-center text-[#C77B4A] border border-[#C77B4A]/30">
                <Salad className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-serif font-black px-2 py-0.5 rounded-full bg-[#3A2418] text-[#F4E3C8]">
                $90
              </span>
            </div>
            <h4 className="font-serif font-bold text-xs sm:text-sm text-[#2B1B13] leading-snug group-hover:text-[#C77B4A]">
              Arma tu Ensalada
            </h4>
            <p className="text-[11px] text-[#6B4028]/80 line-clamp-1 mt-0.5 font-light">
              Base + Proteína + Aderezo
            </p>
          </div>
          <span className="mt-2.5 text-[10px] font-bold text-[#C77B4A] flex items-center gap-1">
            Personalizar <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </button>

        {/* 3. Desayunos & Paquetes */}
        <button
          onClick={() => onSelectCategory('desayunos')}
          className="p-3.5 rounded-2xl bg-[#FFFDF9] hover:bg-[#F4E3C8]/40 border border-[#DEC8AE] hover:border-[#A86B3D]/70 text-left transition-all active:scale-98 shadow-2xs cursor-pointer flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="w-7 h-7 rounded-lg bg-[#F4E3C8] flex items-center justify-center text-[#6B4028] border border-[#C9974D]/30">
                <SunMedium className="w-3.5 h-3.5" />
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F4E3C8] text-[#6B4028] border border-[#C9974D]/40">
                Con Café
              </span>
            </div>
            <h4 className="font-serif font-bold text-xs sm:text-sm text-[#2B1B13] leading-snug group-hover:text-[#6B4028]">
              Desayunos & Combos
            </h4>
            <p className="text-[11px] text-[#6B4028]/80 line-clamp-1 mt-0.5 font-light">
              Chilaquiles, Huevos y más
            </p>
          </div>
          <span className="mt-2.5 text-[10px] font-bold text-[#A86B3D] flex items-center gap-1">
            Ver desayunos <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </button>

        {/* 4. Especial de Fin de Semana */}
        <button
          onClick={() => onSelectCategory('fin-de-semana')}
          className="p-3.5 rounded-2xl bg-[#FFFDF9] hover:bg-[#F4E3C8]/40 border border-[#DEC8AE] hover:border-[#A86B3D]/70 text-left transition-all active:scale-98 shadow-2xs cursor-pointer flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="w-7 h-7 rounded-lg bg-[#F4E3C8] flex items-center justify-center text-[#6B4028] border border-[#C9974D]/30">
                <Soup className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-serif font-black px-2 py-0.5 rounded-full bg-[#3A2418] text-[#F4E3C8]">
                $80
              </span>
            </div>
            <h4 className="font-serif font-bold text-xs sm:text-sm text-[#2B1B13] leading-snug group-hover:text-[#6B4028]">
              Fin de Semana
            </h4>
            <p className="text-[11px] text-[#6B4028]/80 line-clamp-1 mt-0.5 font-light">
              Sáb: Pozole • Dom: Pancita
            </p>
          </div>
          <span className="mt-2.5 text-[10px] font-bold text-[#A86B3D] flex items-center gap-1">
            Ver especial <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </button>
      </div>
    </section>
  );
};
