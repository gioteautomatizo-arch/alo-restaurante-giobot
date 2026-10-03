import React, { useState, useEffect, useMemo } from 'react';
import { MapPin, Clock, MessageSquare, Instagram, Facebook, Map, Lock, ChevronDown } from 'lucide-react';
import { Logo } from './Logo';
import { getRestaurantInfo, ADMIN_DATA_EVENT } from '../lib/adminStorage';
import {
  DAY_KEYS,
  DAY_LABELS,
  resolveWeeklySchedule,
  computeScheduleStatus,
} from '../lib/scheduleService';

interface FooterProps {
  onOpenAdmin?: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenAdmin }) => {
  const [restaurantInfo, setRestaurantInfo] = useState(() => getRestaurantInfo());
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [showWeeklySchedule, setShowWeeklySchedule] = useState<boolean>(false);

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

  const weeklySchedule = useMemo(() => resolveWeeklySchedule(restaurantInfo), [restaurantInfo]);
  const scheduleStatus = useMemo(
    () => computeScheduleStatus(weeklySchedule, currentTime),
    [weeklySchedule, currentTime]
  );

  return (
    <footer
      id="contacto"
      className="bg-[#2B1B13] text-[#FFF7EA] border-t border-[#3A2418] pt-7 pb-24 sm:pb-8 px-4 sm:px-6 lg:px-8"
    >
      <div className="max-w-3xl mx-auto flex flex-col items-center text-center space-y-4">
        {/* 1. Logotipo de Restaurante Calientito */}
        <div className="inline-flex items-center justify-center p-2 sm:p-2.5 bg-[#FFF7EA] rounded-2xl shadow-md border border-[#C9974D]/40">
          <Logo variant="compact" size="lg" />
        </div>

        {/* 2. Dirección y Horario */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6 text-xs text-[#EAD9C4] font-light">
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-[#C9974D] shrink-0" />
            <span>{restaurantInfo.address || 'Calle la Fama 12, Tlalpan, CDMX'}</span>
          </div>
          <span className="hidden sm:inline text-[#6B4028]">•</span>
          <button
            type="button"
            onClick={() => setShowWeeklySchedule((prev) => !prev)}
            className="flex items-center gap-1.5 hover:text-[#FFF7EA] transition-colors cursor-pointer text-left group"
            title="Toca para ver los horarios de toda la semana"
          >
            <Clock className="w-3.5 h-3.5 text-[#C9974D] shrink-0" />
            <span className="group-hover:underline">{scheduleStatus.statusText}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-[#C9974D] transition-transform duration-200 ${
                showWeeklySchedule ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {/* Desplegable de Horarios de la Semana en Contacto */}
        {showWeeklySchedule && (
          <div className="w-full max-w-md bg-[#3A2418] border border-[#C9974D]/40 rounded-2xl p-4 shadow-lg text-left animate-in fade-in duration-150 space-y-2.5">
            <div className="flex items-center justify-between border-b border-[#4E3222] pb-2 text-xs">
              <span className="font-bold text-[#F4E3C8] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#C9974D]" /> Horarios semanales de atención
              </span>
              <span className="text-[10px] text-[#C9974D]">CDMX ({scheduleStatus.mexicoTimeText} hrs)</span>
            </div>

            <div className="space-y-1">
              {DAY_KEYS.map((key) => {
                const day = weeklySchedule[key];
                const isToday = scheduleStatus.todayKey === key;
                return (
                  <div
                    key={key}
                    className={`flex items-center justify-between px-3 py-1.5 rounded-xl text-xs transition-colors ${
                      isToday
                        ? 'bg-[#C9974D]/20 text-[#FFF7EA] font-bold border border-[#C9974D]/40'
                        : 'text-[#EAD9C4]'
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
                        <span className="text-rose-400 font-semibold">Cerrado</span>
                      ) : (
                        <span>{day.openTime} – {day.closeTime}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. Botón principal de WhatsApp */}
        <div className="w-full max-w-xs pt-1">
          <a
            href={`https://wa.me/52${restaurantInfo.whatsappRaw || '5574411437'}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full px-4 py-2.5 rounded-2xl bg-[#25D366] hover:bg-[#20ba59] active:scale-98 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all"
          >
            <MessageSquare className="w-4 h-4 fill-white text-[#25D366]" />
            <span>Pedir por WhatsApp ({restaurantInfo.whatsapp || '55 7441 1437'})</span>
          </a>
        </div>

        {/* 4. Iconos secundarios: Instagram, Facebook y Google Maps */}
        <div className="flex items-center justify-center gap-3 pt-1 text-xs">
          <a
            href="https://www.instagram.com/calientitocafe15?igsh=Z3hzdmViZDVka2ho"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-xl bg-[#3A2418] hover:bg-[#4A2E1F] text-[#FFF7EA] hover:text-[#C9974D] border border-[#4E3222] flex items-center gap-1.5 transition-colors"
            title="Instagram Calientito"
          >
            <Instagram className="w-3.5 h-3.5 text-[#C9974D]" />
            <span className="font-medium">Instagram</span>
          </a>

          <a
            href="https://www.facebook.com/share/1Cvompzmgh/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-xl bg-[#3A2418] hover:bg-[#4A2E1F] text-[#FFF7EA] hover:text-[#C9974D] border border-[#4E3222] flex items-center gap-1.5 transition-colors"
            title="Facebook Calientito"
          >
            <Facebook className="w-3.5 h-3.5 text-[#C9974D]" />
            <span className="font-medium">Facebook</span>
          </a>

          <a
            href="https://maps.google.com/?q=Calle+la+Fama+12,+14260+Tlalpan,+CDMX"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-xl bg-[#3A2418] hover:bg-[#4A2E1F] text-[#FFF7EA] hover:text-[#C9974D] border border-[#4E3222] flex items-center gap-1.5 transition-colors"
            title="Ubicación en Google Maps"
          >
            <Map className="w-3.5 h-3.5 text-[#C9974D]" />
            <span className="font-medium">Google Maps</span>
          </a>
        </div>

        {/* 5. Línea final de copyright y acceso administrativo discreto */}
        <div className="w-full pt-4 border-t border-[#3A2418] flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-[#A86B3D] font-light">
          <p>© 2026 Restaurante Calientito • Calle la Fama 12, Tlalpan, CDMX.</p>
          {onOpenAdmin && (
            <button
              onClick={onOpenAdmin}
              className="text-[#A86B3D] hover:text-[#FFF7EA] transition-colors text-[10px] flex items-center gap-1 cursor-pointer py-1 px-2 rounded-lg hover:bg-[#3A2418]"
              title="Panel Interno de Colaboradores"
            >
              <Lock className="w-3 h-3 text-[#A86B3D]" />
              <span>Administración</span>
            </button>
          )}
        </div>
      </div>
    </footer>
  );
};


