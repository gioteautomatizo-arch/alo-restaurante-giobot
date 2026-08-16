import React from 'react';
import { Home, Utensils, ShoppingBag, MapPin } from 'lucide-react';

interface BottomNavProps {
  cartCount: number;
  onScrollToTop: () => void;
  onScrollToMenu: () => void;
  onOpenCart: () => void;
  onScrollToContact: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  cartCount,
  onScrollToTop,
  onScrollToMenu,
  onOpenCart,
  onScrollToContact,
}) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#14281d]/98 backdrop-blur-md border-t border-[#244c34] py-1.5 px-3 sm:hidden shadow-2xl">
      <div className="grid grid-cols-4 gap-1 items-center">
        {/* 1. Inicio */}
        <button
          onClick={onScrollToTop}
          className="flex flex-col items-center justify-center py-1 text-stone-300 hover:text-white transition-colors cursor-pointer"
        >
          <Home className="w-4 h-4" />
          <span className="text-[10px] font-bold mt-0.5">Inicio</span>
        </button>

        {/* 2. Menú */}
        <button
          onClick={onScrollToMenu}
          className="flex flex-col items-center justify-center py-1 text-stone-300 hover:text-[#c4974f] transition-colors cursor-pointer"
        >
          <Utensils className="w-4 h-4" />
          <span className="text-[10px] font-bold mt-0.5">Menú</span>
        </button>

        {/* 3. Pedido */}
        <button
          onClick={onOpenCart}
          className="flex flex-col items-center justify-center py-1 text-[#c4974f] hover:text-[#e6caa0] transition-colors cursor-pointer relative"
        >
          <div className="relative">
            <ShoppingBag className="w-4 h-4" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-[#c4974f] text-[#14281d] text-[9px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-black mt-0.5">Pedido</span>
        </button>

        {/* 4. Contacto */}
        <button
          onClick={onScrollToContact}
          className="flex flex-col items-center justify-center py-1 text-stone-300 hover:text-white transition-colors cursor-pointer"
        >
          <MapPin className="w-4 h-4" />
          <span className="text-[10px] font-bold mt-0.5">Contacto</span>
        </button>
      </div>
    </nav>
  );
};
