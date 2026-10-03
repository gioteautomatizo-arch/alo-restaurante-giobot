import React, { useState, useEffect, useMemo } from 'react';
import { ShoppingBag, Star, MessageSquare, Instagram, Facebook, Clock, MapPin, ChevronDown, X } from 'lucide-react';
import { VipProfile } from '../types';
import { Logo } from './Logo';
import { getRestaurantInfo, ADMIN_DATA_EVENT } from '../lib/adminStorage';
import {
  DAY_KEYS,
  DAY_LABELS,
  resolveWeeklySchedule,
  computeScheduleStatus,
} from '../lib/scheduleService';

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
  const [restaurantInfo, setRestaurantInfo] = useState(() => getRestaurantInfo());
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [showScheduleModal, setShowScheduleModal] = useState<boolean>(false);

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

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const vipStampsReq = restaurantInfo.vipStampsRequired ?? 5;

  const weeklySchedule = useMemo(() => resolveWeeklySchedule(restaurantInfo), [restaurantInfo]);
  const scheduleStatus = useMemo(
    () => computeScheduleStatus(weeklySchedule, currentTime),
    [weeklySchedule, currentTime]
  );

  return (
    <header className="sticky top-0 z-40 bg-[#3A2418]/95 backdrop-blur-md text-[#FFF7EA] shadow-sm border-b border-[#4E3222] w-full">
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
              {/* Dynamic Status Badge - Single compact line with interactive weekly modal */}
              <button
                type="button"
                onClick={() => setShowScheduleModal((prev) => !prev)}
                className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs whitespace-nowrap cursor-pointer group text-left rounded-lg p-0.5 hover:bg-white/5 transition-colors"
                title="Toca para ver los horarios de toda la semana"
                aria-label={`Horario: ${scheduleStatus.statusText}. Toca para ver la semana completa.`}
              >
                <span
                  className={`inline-flex items-center gap-1 px-1.5 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[11px] font-bold tracking-wide shrink-0 ${
                    scheduleStatus.isOpen
                      ? 'bg-[#4E3222] text-[#F4E3C8] border border-[#C9974D]/40 group-hover:border-[#C9974D]'
                      : 'bg-[#4E3222] text-[#EAD9C4] border border-[#A86B3D]/30 group-hover:border-[#A86B3D]'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      scheduleStatus.isOpen ? 'bg-[#C9974D] animate-pulse' : 'bg-rose-400'
                    }`}
                  />
                  <span>{scheduleStatus.badgeText}</span>
                </span>

                <span className="text-[10px] sm:text-xs text-[#EAD9C4] font-medium flex items-center gap-1 shrink-0 group-hover:text-[#FFF7EA]">
                  <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#C9974D] shrink-0" />
                  <span>
                    {scheduleStatus.isOpen
                      ? `${scheduleStatus.todaySchedule.openTime}–${scheduleStatus.todaySchedule.closeTime}`
                      : scheduleStatus.statusText.replace(/^Cerrado\s*·\s*/i, '')}
                  </span>
                  <ChevronDown
                    className={`w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#C9974D]/80 group-hover:text-[#C9974D] transition-transform duration-200 ${
                      showScheduleModal ? 'rotate-180' : ''
                    }`}
                  />
                </span>
              </button>

              {/* Location micro text (Desktop only) */}
              <span className="hidden md:inline-flex items-center gap-1 text-[10px] text-[#D8C4B4] mt-0.5">
                <MapPin className="w-2.5 h-2.5 text-[#C9974D]" /> {restaurantInfo.address || 'Calle la Fama 12, Tlalpan CDMX'}
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

      {/* Modal de Horarios Semanales al tocar la insignia */}
      {showScheduleModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setShowScheduleModal(false)}
        >
          <div
            className="bg-[#FFFDF9] text-[#2B1B13] border border-[#C9974D]/40 rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabecera del modal */}
            <div className="flex items-center justify-between border-b border-[#F4E3C8] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-[#3A2418] text-[#C9974D] flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-base sm:text-lg text-[#2B1B13]">
                    Horario de atención
                  </h3>
                  <p className="text-[11px] text-[#8A6A55]">
                    Hora oficial CDMX ({scheduleStatus.mexicoTimeText} hrs)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="w-8 h-8 rounded-full bg-[#FFF7EA] text-[#6B4028] hover:bg-[#F4E3C8] flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Cerrar horario"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Estado actual */}
            <div
              className={`p-3 rounded-2xl text-xs font-semibold flex items-center justify-between ${
                scheduleStatus.isOpen
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                  : 'bg-amber-50 text-amber-900 border border-amber-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    scheduleStatus.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                  }`}
                />
                <span>{scheduleStatus.statusText}</span>
              </div>
            </div>

            {/* Lista de 7 días */}
            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
              {DAY_KEYS.map((key) => {
                const day = weeklySchedule[key];
                const isToday = scheduleStatus.todayKey === key;

                return (
                  <div
                    key={key}
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs transition-colors ${
                      isToday
                        ? 'bg-[#3A2418] text-[#FFF7EA] font-bold shadow-xs'
                        : 'bg-[#FFF7EA]/70 text-[#2B1B13]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span>{DAY_LABELS[key]}</span>
                      {isToday && (
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-[#C9974D] text-[#3A2418] font-black uppercase">
                          Hoy
                        </span>
                      )}
                    </div>
                    <div>
                      {day.closed ? (
                        <span className={isToday ? 'text-rose-300 font-semibold' : 'text-rose-600 font-semibold'}>
                          Cerrado
                        </span>
                      ) : (
                        <span>
                          {day.openTime} – {day.closeTime}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Botón de cierre */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="w-full py-2.5 rounded-2xl bg-[#3A2418] hover:bg-[#2B1B13] text-[#FFF7EA] font-bold text-xs shadow-md transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

