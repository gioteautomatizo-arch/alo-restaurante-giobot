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
        className="flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2.5 p-3 sm:py-3.5 sm:px-4 rounded-2xl bg-[#14281d] hover:bg-[#1b3a27] active:scale-95 text-[#faf8f5] shadow-xs border border-[#244c34] transition-all cursor-pointer group"
      >
        <div className="w-8 h-8 rounded-xl bg-[#1f402c] flex items-center justify-center text-[#c4974f] group-hover:scale-105 transition-transform shrink-0 border border-[#c4974f]/30">
          <UtensilsCrossed className="w-4 h-4" />
        </div>
        <div className="text-center sm:text-left">
          <span className="block font-bold text-xs sm:text-sm leading-tight text-[#faf8f5]">
            Ver menú
          </span>
          <span className="hidden sm:block text-[10px] text-stone-300 font-light">
            Explora platillos
          </span>
        </div>
      </button>

      {/* 2. Pedir a Domicilio */}
      <button
        onClick={onOpenDeliveryOrder}
        className="flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2.5 p-3 sm:py-3.5 sm:px-4 rounded-2xl bg-gradient-to-br from-[#c4974f] to-[#b5883d] hover:from-[#d6aa5f] hover:to-[#c4974f] active:scale-95 text-[#14281d] shadow-sm border border-[#e6caa0]/60 transition-all cursor-pointer group"
      >
        <div className="w-8 h-8 rounded-xl bg-[#14281d]/15 flex items-center justify-center text-[#14281d] group-hover:scale-105 transition-transform shrink-0">
          <Bike className="w-4 h-4" />
        </div>
        <div className="text-center sm:text-left">
          <span className="block font-black text-xs sm:text-sm leading-tight text-[#14281d]">
            Pedir a domicilio
          </span>
          <span className="hidden sm:block text-[10px] text-[#14281d]/85 font-medium">
            Envío o anticipar
          </span>
        </div>
      </button>

      {/* 3. Preguntar a Giobot */}
      <button
        onClick={onOpenGiobot}
        className="flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2.5 p-3 sm:py-3.5 sm:px-4 rounded-2xl bg-white hover:bg-[#faf8f5] active:scale-95 text-[#14281d] shadow-xs border border-[#e8dfd1] hover:border-[#c4974f]/60 transition-all cursor-pointer group relative overflow-hidden"
      >
        <div className="w-8 h-8 rounded-xl bg-[#f4efe6] text-[#8f6b2f] flex items-center justify-center group-hover:scale-105 transition-transform shrink-0 relative border border-[#c4974f]/30">
          <Bot className="w-4 h-4 text-[#8f6b2f]" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full" />
        </div>
        <div className="text-center sm:text-left">
          <span className="block font-bold text-xs sm:text-sm leading-tight text-stone-900 flex items-center justify-center sm:justify-start gap-1">
            Giobot
            <Sparkles className="w-3 h-3 text-[#c4974f] fill-[#c4974f]" />
          </span>
          <span className="hidden sm:block text-[10px] text-stone-500 font-light">
            Asesor culinario
          </span>
        </div>
      </button>
    </div>
  );
};
