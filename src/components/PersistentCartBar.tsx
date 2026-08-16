import React from 'react';
import { ShoppingBag, ArrowRight } from 'lucide-react';
import { CartItem } from '../types';

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
  if (cartItems.length === 0) return null;

  const totalCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cartItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const discount = bringOwnContainer ? subtotal * 0.1 : 0;
  const estimatedTotal = subtotal - discount;

  return (
    <div className="fixed bottom-16 sm:bottom-6 left-0 right-0 z-30 px-3 sm:px-6 pointer-events-none">
      <div className="max-w-md mx-auto pointer-events-auto">
        <button
          onClick={onOpenCart}
          className="w-full bg-[#14281d] hover:bg-[#1b3a27] active:scale-98 text-[#faf8f5] p-3 sm:py-3.5 sm:px-4 rounded-2xl shadow-2xl border border-[#c4974f]/60 flex items-center justify-between transition-all group cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-[#c4974f] to-[#a67a35] text-[#14281d] flex items-center justify-center font-black text-xs shadow-xs">
              <ShoppingBag className="w-5 h-5 text-[#14281d]" />
              <span className="absolute -top-1 -right-1 bg-white text-[#14281d] text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-[#14281d]">
                {totalCount}
              </span>
            </div>
            <div className="text-left">
              <span className="text-xs sm:text-sm font-bold block leading-tight text-white font-serif">
                Ver pedido ({totalCount} {totalCount === 1 ? 'producto' : 'productos'})
              </span>
              <span className="text-[11px] text-[#e6caa0] font-medium block">
                Total est.: <strong>${estimatedTotal.toFixed(0)} MXN</strong>
                {bringOwnContainer && ' (con 10% eco)'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-[#1f3d2b] px-3 py-1.5 rounded-xl font-bold text-xs text-[#c4974f] group-hover:bg-[#c4974f] group-hover:text-[#14281d] transition-colors">
            <span>Revisar</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </button>
      </div>
    </div>
  );
};
