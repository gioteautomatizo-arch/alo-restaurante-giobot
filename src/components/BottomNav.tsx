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
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#3A2418]/98 backdrop-blur-md border-t border-[#4E3222] py-1.5 px-3 sm:hidden shadow-2xl">
      <div className="grid grid-cols-4 gap-1 items-center">
        {/* 1. Inicio */}
        <button
          onClick={onScrollToTop}
          className="flex flex-col items-center justify-center py-1 text-[#EAD9C4] hover:text-[#FFF7EA] transition-colors cursor-pointer"
        >
          <Home className="w-4 h-4" />
          <span className="text-[10px] font-bold mt-0.5">Inicio</span>
        </button>

        {/* 2. Menú */}
        <button
          onClick={onScrollToMenu}
          className="flex flex-col items-center justify-center py-1 text-[#EAD9C4] hover:text-[#C9974D] transition-colors cursor-pointer"
        >
          <Utensils className="w-4 h-4" />
          <span className="text-[10px] font-bold mt-0.5">Menú</span>
        </button>

        {/* 3. Pedido */}
        <button
          onClick={onOpenCart}
          className="flex flex-col items-center justify-center py-1 text-[#C9974D] hover:text-[#F4E3C8] transition-colors cursor-pointer relative"
        >
          <div className="relative">
            <ShoppingBag className="w-4 h-4" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-[#C9974D] text-[#3A2418] text-[9px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-black mt-0.5">Pedido</span>
        </button>

        {/* 4. Contacto */}
        <button
          onClick={onScrollToContact}
          className="flex flex-col items-center justify-center py-1 text-[#EAD9C4] hover:text-[#FFF7EA] transition-colors cursor-pointer"
        >
          <MapPin className="w-4 h-4" />
          <span className="text-[10px] font-bold mt-0.5">Contacto</span>
        </button>
      </div>
    </nav>
  );
};
