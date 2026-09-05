import React, { useState, useEffect } from 'react';
import { ShoppingBag, ArrowRight } from 'lucide-react';
import { CartItem } from '../types';
import { getRestaurantInfo, ADMIN_DATA_EVENT } from '../lib/adminStorage';

interface PersistentCartBarProps {
  cartItems: CartItem[];
  bringOwnContainer: boolean;
  onOpenCart: () => void;
}

export const PersistentCartBar: React.FC<PersistentCartBarProps> = ({
  cartItems,
  bringOwnContainer,
  onOpenCart,
}) => {
  const [restaurantInfo, setRestaurantInfo] = useState(getRestaurantInfo());

  useEffect(() => {
    const handleUpdate = () => {
      setRestaurantInfo(getRestaurantInfo());
    };
    window.addEventListener(ADMIN_DATA_EVENT, handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener(ADMIN_DATA_EVENT, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  if (cartItems.length === 0) return null;

  const ecoPercent = restaurantInfo.ecoDiscountPercent ?? 10;
  const totalCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cartItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const discount = bringOwnContainer ? Math.round((subtotal * ecoPercent) / 100) : 0;
  const estimatedTotal = Math.max(0, subtotal - discount);

  return (
    <div className="fixed bottom-16 sm:bottom-6 left-0 right-0 z-30 px-3 sm:px-6 pointer-events-none">
      <div className="max-w-md mx-auto pointer-events-auto">
        <button
          onClick={onOpenCart}
          className="w-full bg-[#3A2418] hover:bg-[#4A2E1F] active:scale-98 text-[#FFF7EA] p-3 sm:py-3.5 sm:px-4 rounded-2xl shadow-2xl border border-[#C9974D]/60 flex items-center justify-between transition-all group cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-[#C9974D] to-[#A86B3D] text-[#3A2418] flex items-center justify-center font-black text-xs shadow-xs">
              <ShoppingBag className="w-5 h-5 text-[#3A2418]" />
              <span className="absolute -top-1 -right-1 bg-white text-[#3A2418] text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-[#3A2418]">
                {totalCount}
              </span>
            </div>
            <div className="text-left">
              <span className="text-xs sm:text-sm font-bold block leading-tight text-white font-serif">
                Ver pedido ({totalCount} {totalCount === 1 ? 'producto' : 'productos'})
              </span>
              <span className="text-[11px] text-[#F4E3C8] font-medium block">
                Total est.: <strong>${estimatedTotal.toFixed(0)} MXN</strong>
                {bringOwnContainer && ` (con ${ecoPercent}% eco)`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-[#4A2E1F] px-3 py-1.5 rounded-xl font-bold text-xs text-[#C9974D] group-hover:bg-[#C9974D] group-hover:text-[#3A2418] transition-colors">
            <span>Revisar</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </button>
      </div>
    </div>
  );
};
