import React from 'react';
import { Utensils, Bike, Bot } from 'lucide-react';

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
        className="flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2.5 p-3 sm:py-3.5 sm:px-4 rounded-2xl bg-[#162e1e] hover:bg-[#1f402c] active:scale-95 text-[#fcfaf6] shadow-sm border border-[#2d563c] transition-all cursor-pointer group"
      >
        <div className="w-8 h-8 rounded-xl bg-[#234730] flex items-center justify-center text-lg group-hover:scale-110 transition-transform shrink-0">
          🍽️
        </div>
        <div className="text-center sm:text-left">
          <span className="block font-black text-xs sm:text-sm leading-tight text-white">
            Ver menú
          </span>
          <span className="hidden sm:block text-[10px] text-stone-300">
            Explora platillos
          </span>
        </div>
      </button>

      {/* 2. Pedir a Domicilio */}
      <button
        onClick={onOpenDeliveryOrder}
        className="flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2.5 p-3 sm:py-3.5 sm:px-4 rounded-2xl bg-gradient-to-br from-[#d1a85b] to-[#b48a44] hover:from-[#e0bc74] hover:to-[#c59a50] active:scale-95 text-[#162e1e] shadow-md border border-[#e0bc74]/60 transition-all cursor-pointer group"
      >
        <div className="w-8 h-8 rounded-xl bg-[#162e1e]/10 flex items-center justify-center text-lg group-hover:scale-110 transition-transform shrink-0">
          🛵
        </div>
        <div className="text-center sm:text-left">
          <span className="block font-black text-xs sm:text-sm leading-tight text-[#162e1e]">
            Pedir a domicilio
          </span>
          <span className="hidden sm:block text-[10px] text-[#162e1e]/80 font-medium">
            Envío o anticipar
          </span>
        </div>
      </button>

      {/* 3. Preguntar a Giobot */}
      <button
        onClick={onOpenGiobot}
        className="flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2.5 p-3 sm:py-3.5 sm:px-4 rounded-2xl bg-white hover:bg-stone-50 active:scale-95 text-[#162e1e] shadow-sm border border-stone-200 hover:border-[#b48a44]/50 transition-all cursor-pointer group relative overflow-hidden"
      >
        <div className="w-8 h-8 rounded-xl bg-emerald-50 text-[#162e1e] flex items-center justify-center text-lg group-hover:scale-110 transition-transform shrink-0 relative">
          🤖
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full" />
        </div>
        <div className="text-center sm:text-left">
          <span className="block font-black text-xs sm:text-sm leading-tight text-stone-900">
            Preguntar a Giobot
          </span>
          <span className="hidden sm:block text-[10px] text-stone-500">
            Asesor virtual
          </span>
        </div>
      </button>
    </div>
  );
};
