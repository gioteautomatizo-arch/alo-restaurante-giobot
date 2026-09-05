import React, { useState, useEffect } from 'react';
import { ShoppingBag, Star, MessageSquare, Instagram, Facebook, Clock, MapPin } from 'lucide-react';
import { VipProfile } from '../types';
import { Logo } from './Logo';
import { getRestaurantInfo, ADMIN_DATA_EVENT } from '../lib/adminStorage';

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

  const vipStampsReq = restaurantInfo.vipStampsRequired ?? 5;

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
    <header className="sticky top-0 z-40 bg-[#3A2418]/95 backdrop-blur-md text-[#FFF7EA] shadow-sm border-b border-[#4E3222] w-full overflow-x-hidden">
      <div className="max-w-7xl mx-auto px-2.5 sm:px-6 py-1.5 sm:py-2 w-full">
        <div className="flex items-center justify-between gap-1.5 sm:gap-3 w-full">
          {/* Left: Brand Logo & Status */}
          <div className="flex items-center gap-2 sm:gap-3 shrink min-w-0">
            <a
              href="#inicio"
              className="bg-[#FFF7EA] p-0.5 sm:p-1 rounded-2xl shadow-xs border border-[#C9974D]/40 hover:opacity-95 transition-opacity flex items-center justify-center shrink-0"
              aria-label="Ir al inicio"
            >
              <Logo size="header" variant="full" />
            </a>

            <div className="flex flex-col justify-center min-w-0">
              {/* Dynamic Status Badge - Single compact line */}
              <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs whitespace-nowrap">
                <span
                  className={`inline-flex items-center gap-1 px-1.5 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[11px] font-bold tracking-wide shrink-0 ${
                    isOpenNow
                      ? 'bg-[#4E3222] text-[#F4E3C8] border border-[#C9974D]/40'
                      : 'bg-[#4E3222] text-[#EAD9C4] border border-[#A86B3D]/30'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      isOpenNow ? 'bg-[#C9974D] animate-pulse' : 'bg-rose-400'
                    }`}
                  />
                  <span>{isOpenNow ? 'Abierto' : 'Cerrado'}</span>
                </span>

                <span className="text-[10px] sm:text-xs text-[#EAD9C4] font-light flex items-center gap-1 shrink-0">
                  <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#C9974D] shrink-0" />
                  <span>9:00–17:30</span>
                </span>
              </div>

              {/* Location micro text (Desktop only) */}
              <span className="hidden md:inline-flex items-center gap-1 text-[10px] text-[#D8C4B4] mt-0.5">
                <MapPin className="w-2.5 h-2.5 text-[#C9974D]" /> Calle la Fama 12, Tlalpan CDMX
              </span>
            </div>
          </div>

          {/* Right: Actions (Mobile: WhatsApp, VIP, Cart | Desktop: Socials, VIP, Cart) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* WhatsApp (Visible on both mobile & desktop) */}
            <a
              href="https://wa.me/525574411437"
              target="_blank"
              rel="noopener noreferrer"
              title="WhatsApp: 55 7441 1437"
              className="p-1.5 sm:p-2 rounded-xl bg-[#4A2E1F] hover:bg-[#6B4028] text-emerald-400 border border-[#6B4028] flex items-center justify-center transition-colors shrink-0"
              aria-label="WhatsApp Oficial"
            >
              <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
            </a>

            {/* Instagram & Facebook (Desktop only, hidden on mobile < 640px) */}
            <a
              href="https://www.instagram.com/calientitocafe15?igsh=Z3hzdmViZDVka2ho"
              target="_blank"
              rel="noopener noreferrer"
              title="Instagram @calientitocafe15"
              className="hidden sm:flex p-2 rounded-xl bg-[#4A2E1F] hover:bg-[#6B4028] text-[#C9974D] hover:text-[#FFF7EA] border border-[#6B4028] items-center justify-center transition-colors shrink-0"
              aria-label="Instagram"
            >
              <Instagram className="w-4 h-4" />
            </a>
            <a
              href="https://www.facebook.com/share/1Cvompzmgh/"
              target="_blank"
              rel="noopener noreferrer"
              title="Facebook Oficial"
              className="hidden sm:flex p-2 rounded-xl bg-[#4A2E1F] hover:bg-[#6B4028] text-[#C9974D] hover:text-[#FFF7EA] border border-[#6B4028] items-center justify-center transition-colors shrink-0"
              aria-label="Facebook"
            >
              <Facebook className="w-4 h-4" />
            </a>

            {/* VIP Button */}
            <button
              onClick={onOpenVipModal}
              className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1 sm:gap-1.5 shrink-0 cursor-pointer ${
                vipProfile
                  ? 'bg-gradient-to-r from-[#6B4028] to-[#4A2E1F] text-[#F4E3C8] border-[#C9974D]'
                  : 'bg-[#4A2E1F] hover:bg-[#6B4028] text-[#FFF7EA] border border-[#C9974D]/40'
              }`}
              title="Tarjeta de Lealtad VIP"
              aria-label="Tarjeta de Lealtad VIP"
            >
              <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#C9974D] fill-[#C9974D] shrink-0" />
              <span className="hidden sm:inline font-medium">
                {vipProfile ? `VIP (${vipProfile.stamps}/${vipStampsReq})` : 'VIP'}
              </span>
            </button>

            {/* Shopping Cart Button */}
            <button
              onClick={onOpenCart}
              className="relative p-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-gradient-to-r from-[#C9974D] to-[#A86B3D] hover:from-[#d6aa5f] hover:to-[#C9974D] text-[#3A2418] font-black text-xs sm:text-sm flex items-center gap-1 sm:gap-1.5 shadow-sm active:scale-95 transition-all shrink-0 cursor-pointer"
              title="Ver Pedido"
              aria-label="Ver Pedido"
            >
              <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#3A2418] shrink-0" />
              <span className="hidden sm:inline font-bold">Pedido</span>
              {cartCount > 0 && (
                <span className="bg-[#3A2418] text-[#FFF7EA] text-[9px] sm:text-[10px] font-black min-w-4 h-4 px-1 rounded-full flex items-center justify-center">
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
