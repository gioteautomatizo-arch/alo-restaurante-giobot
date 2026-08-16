import React from 'react';
import { CategoryId } from '../types';
import { Sparkles, Utensils, ArrowRight } from 'lucide-react';

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
  return (
    <div className="w-full space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#b48a44]" />
          Destacados del Día
        </h3>
        <span className="text-[11px] text-[#162e1e] font-bold">
          Toca para armar o ver
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* 1. Comida Corrida $90 */}
        <button
          onClick={onOpenComidaCorrida}
          className="p-3 rounded-2xl bg-white hover:bg-stone-50 border border-stone-200 hover:border-[#b48a44]/60 text-left transition-all active:scale-98 shadow-xs cursor-pointer flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xl">🍲</span>
              <span className="text-xs font-black px-2 py-0.5 rounded-full bg-[#162e1e] text-[#d1a85b]">
                $90
              </span>
            </div>
            <h4 className="font-bold text-xs sm:text-sm text-stone-900 leading-snug group-hover:text-[#162e1e]">
              Comida Corrida
            </h4>
            <p className="text-[11px] text-stone-500 line-clamp-1 mt-0.5">
              3 tiempos con guisado casero
            </p>
          </div>
          <span className="mt-2 text-[10px] font-extrabold text-[#b48a44] flex items-center gap-1">
            Armar mi menú <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </button>

        {/* 2. Arma tu Ensalada $90 */}
        <button
          onClick={onOpenSaladBuilder}
          className="p-3 rounded-2xl bg-white hover:bg-stone-50 border border-stone-200 hover:border-emerald-600/60 text-left transition-all active:scale-98 shadow-xs cursor-pointer flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xl">🥗</span>
              <span className="text-xs font-black px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-200">
                $90
              </span>
            </div>
            <h4 className="font-bold text-xs sm:text-sm text-stone-900 leading-snug group-hover:text-emerald-800">
              Arma tu Ensalada
            </h4>
            <p className="text-[11px] text-stone-500 line-clamp-1 mt-0.5">
              Base + Proteína + Aderezo
            </p>
          </div>
          <span className="mt-2 text-[10px] font-extrabold text-emerald-700 flex items-center gap-1">
            Personalizar <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </button>

        {/* 3. Desayunos & Paquetes */}
        <button
          onClick={() => onSelectCategory('desayunos')}
          className="p-3 rounded-2xl bg-white hover:bg-stone-50 border border-stone-200 hover:border-[#b48a44]/60 text-left transition-all active:scale-98 shadow-xs cursor-pointer flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xl">🍳</span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                Con Café
              </span>
            </div>
            <h4 className="font-bold text-xs sm:text-sm text-stone-900 leading-snug group-hover:text-[#162e1e]">
              Desayunos & Combos
            </h4>
            <p className="text-[11px] text-stone-500 line-clamp-1 mt-0.5">
              Chilaquiles, Huevos y más
            </p>
          </div>
          <span className="mt-2 text-[10px] font-extrabold text-[#b48a44] flex items-center gap-1">
            Ver desayunos <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </button>

        {/* 4. Especial de Fin de Semana */}
        <button
          onClick={() => onSelectCategory('fin-de-semana')}
          className="p-3 rounded-2xl bg-white hover:bg-stone-50 border border-stone-200 hover:border-[#b48a44]/60 text-left transition-all active:scale-98 shadow-xs cursor-pointer flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xl">🍲</span>
              <span className="text-xs font-black px-2 py-0.5 rounded-full bg-[#162e1e] text-[#d1a85b]">
                $80
              </span>
            </div>
            <h4 className="font-bold text-xs sm:text-sm text-stone-900 leading-snug group-hover:text-[#162e1e]">
              Fin de Semana
            </h4>
            <p className="text-[11px] text-stone-500 line-clamp-1 mt-0.5">
              Sáb: Pozole • Dom: Pancita
            </p>
          </div>
          <span className="mt-2 text-[10px] font-extrabold text-[#b48a44] flex items-center gap-1">
            Ver especial <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </button>
      </div>
    </div>
  );
};
