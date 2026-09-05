import React from 'react';
import { UtensilsCrossed, Bike, Bot, Sparkles } from 'lucide-react';

interface QuickActionsProps {
  onScrollToMenu: () => void;
  onOpenDeliveryOrder: () => void;
  onOpenGiobot: () => void;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  onScrollToMenu,
  onOpenDeliveryOrder,
  onOpenGiobot,
}) => {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full">
      {/* 1. Ver Menú */}
      <button
        onClick={onScrollToMenu}
        className="flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2.5 p-3 sm:py-3.5 sm:px-4 rounded-2xl bg-[#3A2418] hover:bg-[#4A2E1F] active:scale-95 text-[#FFF7EA] shadow-xs border border-[#4E3222] transition-all cursor-pointer group"
      >
        <div className="w-8 h-8 rounded-xl bg-[#4A2E1F] flex items-center justify-center text-[#C9974D] group-hover:scale-105 transition-transform shrink-0 border border-[#C9974D]/30">
          <UtensilsCrossed className="w-4 h-4" />
        </div>
        <div className="text-center sm:text-left">
          <span className="block font-bold text-xs sm:text-sm leading-tight text-[#FFF7EA]">
            Ver menú
          </span>
          <span className="hidden sm:block text-[10px] text-[#EAD9C4] font-light">
            Explora platillos
          </span>
        </div>
      </button>

      {/* 2. Pedir a Domicilio */}
      <button
        onClick={onOpenDeliveryOrder}
        className="flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2.5 p-3 sm:py-3.5 sm:px-4 rounded-2xl bg-gradient-to-br from-[#C9974D] to-[#A86B3D] hover:from-[#d6aa5f] hover:to-[#C9974D] active:scale-95 text-[#3A2418] shadow-sm border border-[#F4E3C8]/60 transition-all cursor-pointer group"
      >
        <div className="w-8 h-8 rounded-xl bg-[#3A2418]/15 flex items-center justify-center text-[#3A2418] group-hover:scale-105 transition-transform shrink-0">
          <Bike className="w-4 h-4" />
        </div>
        <div className="text-center sm:text-left">
          <span className="block font-black text-xs sm:text-sm leading-tight text-[#3A2418]">
            Pedir a domicilio
          </span>
          <span className="hidden sm:block text-[10px] text-[#3A2418]/85 font-medium">
            Envío o anticipar
          </span>
        </div>
      </button>

      {/* 3. Preguntar a Tita */}
      <button
        onClick={onOpenGiobot}
        className="flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2.5 p-3 sm:py-3.5 sm:px-4 rounded-2xl bg-[#FFFDF9] hover:bg-[#F4E3C8]/40 active:scale-95 text-[#2B1B13] shadow-2xs border border-[#DEC8AE] hover:border-[#A86B3D]/60 transition-all cursor-pointer group relative overflow-hidden"
      >
        <div className="w-8 h-8 rounded-xl bg-[#FFF7EA] flex items-center justify-center group-hover:scale-105 transition-transform shrink-0 relative border border-[#A86B3D]/30 p-0.5">
          <img src="/tita.png" alt="Tita" className="w-full h-full object-contain" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full" />
        </div>
        <div className="text-center sm:text-left">
          <span className="block font-bold text-xs sm:text-sm leading-tight text-[#2B1B13] flex items-center justify-center sm:justify-start gap-1">
            Tita
            <Sparkles className="w-3 h-3 text-[#C9974D] fill-[#C9974D]" />
          </span>
          <span className="hidden sm:block text-[10px] text-[#6B4028] font-light">
            Asesora de confianza
          </span>
        </div>
      </button>
    </div>
  );
};
