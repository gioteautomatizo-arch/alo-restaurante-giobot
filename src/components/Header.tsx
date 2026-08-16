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
    <header className="sticky top-0 z-40 bg-[#14281d]/95 backdrop-blur-md text-[#faf8f5] shadow-sm border-b border-[#244c34]">
      <div className="max-w-7xl mx-auto px-3.5 sm:px-6 py-2.5">
        <div className="flex items-center justify-between gap-3">
          {/* Left: Brand Logo & Status */}
          <div className="flex items-center gap-3">
            <a
              href="#inicio"
              className="bg-[#faf8f5] px-2.5 py-1 rounded-xl shadow-xs border border-[#c4974f]/30 hover:opacity-95 transition-opacity flex items-center shrink-0"
            >
              <Logo size="sm" variant="full" />
            </a>

            <div className="flex flex-col">
              {/* Dynamic Status Badge */}
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold tracking-wide ${
                    isOpenNow
                      ? 'bg-[#1b3a27] text-emerald-300 border border-emerald-500/30'
                      : 'bg-rose-950/70 text-rose-300 border border-rose-500/30'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isOpenNow ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                    }`}
                  />
                  {isOpenNow ? 'Abierto' : 'Cerrado'}
                </span>

                <span className="text-[10px] sm:text-xs text-stone-300 font-normal flex items-center gap-1">
                  <Clock className="w-3 h-3 text-[#c4974f]" /> 9:00 AM - 5:30 PM
                </span>
              </div>

              {/* Location micro text */}
              <span className="hidden md:inline-flex items-center gap-1 text-[10px] text-stone-400 mt-0.5">
                <MapPin className="w-2.5 h-2.5 text-[#c4974f]" /> Calle la Fama 12, Tlalpan CDMX
              </span>
            </div>
          </div>

          {/* Right: Quick Social Icons + VIP + Cart */}
          <div className="flex items-center gap-2">
            {/* Social Icons directly in Header (Minimal & Elegant) */}
            <div className="flex items-center gap-1 bg-[#102017] p-1 rounded-xl border border-[#244c34]">
              <a
                href="https://wa.me/525574411437"
                target="_blank"
                rel="noopener noreferrer"
                title="WhatsApp Oficial: 55 7441 1437"
                className="p-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-[#1a3424] rounded-lg transition-colors"
                aria-label="WhatsApp"
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </a>
              <a
                href="https://www.instagram.com/calientitocafe15?igsh=Z3hzdmViZDVka2ho"
                target="_blank"
                rel="noopener noreferrer"
                title="Instagram @calientitocafe15"
                className="p-1.5 text-[#c4974f] hover:text-[#d6aa5f] hover:bg-[#1a3424] rounded-lg transition-colors"
                aria-label="Instagram"
              >
                <Instagram className="w-3.5 h-3.5" />
              </a>
              <a
                href="https://www.facebook.com/share/1Cvompzmgh/"
                target="_blank"
                rel="noopener noreferrer"
                title="Facebook Oficial"
                className="p-1.5 text-[#c4974f] hover:text-[#d6aa5f] hover:bg-[#1a3424] rounded-lg transition-colors"
                aria-label="Facebook"
              >
                <Facebook className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Aló! VIP Button */}
            <button
              onClick={onOpenVipModal}
              className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer ${
                vipProfile
                  ? 'bg-gradient-to-r from-[#1b3a27] to-[#14281d] text-[#e6caa0] border-[#c4974f]'
                  : 'bg-[#1b3a27] hover:bg-[#234b33] text-stone-200 border border-[#c4974f]/40'
              }`}
              title="Tarjeta de Lealtad Aló! VIP"
            >
              <Star className="w-3.5 h-3.5 text-[#c4974f] fill-[#c4974f]" />
              <span className="hidden sm:inline">
                {vipProfile ? `VIP (${vipProfile.stamps}/5)` : 'VIP'}
              </span>
            </button>

            {/* Shopping Cart Button */}
            <button
              onClick={onOpenCart}
              className="relative p-2 sm:px-3 sm:py-1.5 rounded-xl bg-gradient-to-r from-[#c4974f] to-[#b5883d] hover:from-[#d6aa5f] hover:to-[#c4974f] text-[#14281d] font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
              title="Ver Pedido"
            >
              <ShoppingBag className="w-4 h-4 text-[#14281d]" />
              <span className="hidden sm:inline font-bold">Pedido</span>
              {cartCount > 0 && (
                <span className="bg-[#14281d] text-[#faf8f5] text-[10px] font-black px-1.5 py-0.5 rounded-full">
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
