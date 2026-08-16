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
          className="w-full bg-[#162e1e] hover:bg-[#1f402c] active:scale-98 text-[#fcfaf6] p-3 sm:py-3.5 sm:px-4 rounded-2xl shadow-2xl border border-[#d1a85b]/60 flex items-center justify-between transition-all group cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-[#d1a85b] to-[#b48a44] text-[#162e1e] flex items-center justify-center font-black text-xs shadow-xs">
              <ShoppingBag className="w-5 h-5 text-[#162e1e]" />
              <span className="absolute -top-1 -right-1 bg-white text-[#162e1e] text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-[#162e1e]">
                {totalCount}
              </span>
            </div>
            <div className="text-left">
              <span className="text-xs sm:text-sm font-black block leading-tight text-white">
                Ver pedido ({totalCount} {totalCount === 1 ? 'producto' : 'productos'})
              </span>
              <span className="text-[11px] text-[#d1a85b] font-medium block">
                Total est.: <strong>${estimatedTotal.toFixed(0)} MXN</strong>
                {bringOwnContainer && ' (con 10% eco)'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-[#234730] px-3 py-1.5 rounded-xl font-bold text-xs text-[#d1a85b] group-hover:bg-[#d1a85b] group-hover:text-[#162e1e] transition-colors">
            <span>Revisar</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </button>
      </div>
    </div>
  );
};
