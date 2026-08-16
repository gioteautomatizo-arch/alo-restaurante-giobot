import React, { useState, useEffect } from 'react';
import { ShoppingBag, Star, MessageSquare, Instagram, Facebook, Clock, MapPin } from 'lucide-react';
import { VipProfile } from '../types';
import { Logo } from './Logo';

interface HeaderProps {
  cartCount: number;
  onOpenCart: () => void;
  onOpenVipModal: () => void;
  vipProfile: VipProfile | null;
}

export const Header: React.FC<HeaderProps> = ({
  cartCount,
  onOpenCart,
  onOpenVipModal,
  vipProfile,
}) => {
  // Check if currently open (9:00 AM - 5:30 PM local time)
  const [isOpenNow, setIsOpenNow] = useState<boolean>(true);

  useEffect(() => {
    const checkSchedule = () => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const currentTimeInMinutes = hours * 60 + minutes;
      const openTimeInMinutes = 9 * 60; // 9:00 AM
      const closeTimeInMinutes = 17 * 60 + 30; // 5:30 PM
      setIsOpenNow(currentTimeInMinutes >= openTimeInMinutes && currentTimeInMinutes <= closeTimeInMinutes);
    };

    checkSchedule();
    const interval = setInterval(checkSchedule, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-[#162e1e] text-stone-100 shadow-lg border-b border-[#244c34]">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5">
        <div className="flex items-center justify-between gap-2">
          {/* Left: Brand Logo & Status */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <a href="#inicio" className="bg-[#fcfaf6] px-2.5 py-1 rounded-xl shadow-sm border border-[#b48a44]/30 hover:opacity-95 transition-opacity flex items-center shrink-0">
              <Logo size="sm" variant="full" />
            </a>

            <div className="flex flex-col">
              {/* Dynamic Status Badge */}
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-extrabold tracking-wide ${
                    isOpenNow
                      ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
                      : 'bg-rose-950/80 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isOpenNow ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                    }`}
                  />
                  {isOpenNow ? 'Abierto' : 'Cerrado'}
                </span>

                <span className="text-[10px] sm:text-xs text-stone-300 font-medium flex items-center gap-1">
                  <Clock className="w-3 h-3 text-[#d1a85b]" /> 9:00 AM - 5:30 PM
                </span>
              </div>

              {/* Location micro text */}
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-stone-400 mt-0.5">
                <MapPin className="w-2.5 h-2.5 text-[#d1a85b]" /> Calle la Fama 12, Tlalpan CDMX
              </span>
            </div>
          </div>

          {/* Right: Quick Social Icons + VIP + Cart */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Social Icons directly in Header */}
            <div className="flex items-center gap-1 bg-[#102216] p-1 rounded-xl border border-[#244c34]">
              <a
                href="https://wa.me/525574411437"
                target="_blank"
                rel="noopener noreferrer"
                title="WhatsApp: 55 7441 1437"
                className="p-1.5 text-[#25D366] hover:text-emerald-300 hover:bg-[#162e1e] rounded-lg transition-colors"
                aria-label="WhatsApp"
              >
                <MessageSquare className="w-4 h-4" />
              </a>
              <a
                href="https://www.instagram.com/calientitocafe15?igsh=Z3hzdmViZDVka2ho"
                target="_blank"
                rel="noopener noreferrer"
                title="Instagram @calientitocafe15"
                className="p-1.5 text-[#d1a85b] hover:text-amber-200 hover:bg-[#162e1e] rounded-lg transition-colors"
                aria-label="Instagram"
              >
                <Instagram className="w-4 h-4" />
              </a>
              <a
                href="https://www.facebook.com/share/1Cvompzmgh/"
                target="_blank"
                rel="noopener noreferrer"
                title="Facebook Oficial"
                className="p-1.5 text-[#d1a85b] hover:text-amber-200 hover:bg-[#162e1e] rounded-lg transition-colors"
                aria-label="Facebook"
              >
                <Facebook className="w-4 h-4" />
              </a>
            </div>

            {/* Aló! VIP Button */}
            <button
              onClick={onOpenVipModal}
              className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs border flex items-center gap-1 cursor-pointer ${
                vipProfile
                  ? 'bg-gradient-to-r from-[#2a4d34] to-[#1b3824] text-[#d1a85b] border-[#b48a44]'
                  : 'bg-[#1f402c] hover:bg-[#285037] text-stone-200 border border-[#b48a44]/40'
              }`}
              title="Tarjeta de Lealtad Aló! VIP"
            >
              <Star className="w-3.5 h-3.5 text-[#d1a85b] fill-[#d1a85b]" />
              <span className="hidden sm:inline">
                {vipProfile ? `VIP (${vipProfile.stamps}/5)` : 'VIP'}
              </span>
            </button>

            {/* Shopping Cart Button */}
            <button
              onClick={onOpenCart}
              className="relative p-2 sm:px-3 sm:py-1.5 rounded-xl bg-gradient-to-r from-[#d1a85b] to-[#b48a44] hover:from-[#e0bc74] hover:to-[#c59a50] text-[#162e1e] font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
              title="Ver Pedido"
            >
              <ShoppingBag className="w-4 h-4 text-[#162e1e]" />
              <span className="hidden sm:inline">Pedido</span>
              {cartCount > 0 && (
                <span className="bg-[#162e1e] text-[#fcfaf6] text-[10px] font-black px-1.5 py-0.5 rounded-full">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
