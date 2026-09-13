import React, { useMemo } from 'react';
import { CalendarDays, Megaphone, Sparkles } from 'lucide-react';
import {
  PROMOTION_DAYS,
  WeeklyPromotionMap,
  getPromotionDayKey,
} from '../../lib/promotions';

interface WeeklyPromotionsEditorProps {
  value: WeeklyPromotionMap;
  onChange: (next: WeeklyPromotionMap) => void;
  disabled?: boolean;
}

export const WeeklyPromotionsEditor: React.FC<WeeklyPromotionsEditorProps> = ({ value, onChange, disabled }) => {
  const today = useMemo(() => getPromotionDayKey(), []);

  return (
    <section className="space-y-3 rounded-2xl border border-[#DEC8AE] bg-[#FFFDF9] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl border border-[#C9974D]/40 bg-[#F4E3C8]/60 flex items-center justify-center shrink-0">
          <CalendarDays className="w-4.5 h-4.5 text-[#A86B3D]" />
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-black text-[#A86B3D]">
            <Sparkles className="w-3.5 h-3.5" />
            Calendario semanal
          </div>
          <h4 className="font-serif font-black text-base text-[#2B1B13]">Promociones por día</h4>
          <p className="text-[11px] sm:text-xs text-[#6B4028] mt-0.5">
            Escribe o cambia la promoción del día correspondiente. Al guardar, se sincroniza con la portada y Tita.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PROMOTION_DAYS.map(({ key, label, shortLabel }) => {
          const isToday = key === today;
          return (
            <label key={key} className={`rounded-xl border p-3 bg-white ${isToday ? 'border-[#C9974D] ring-1 ring-[#C9974D]/25' : 'border-[#E7D7C4]'}`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-black text-[#2B1B13] flex items-center gap-1.5">
                  <Megaphone className="w-3.5 h-3.5 text-[#A86B3D]" />
                  {label}
                </span>
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${isToday ? 'bg-[#3A2418] text-[#FFF7EA]' : 'bg-[#FFF7EA] text-[#8A6A55]'}`}>
                  {isToday ? 'HOY' : shortLabel}
                </span>
              </div>
              <textarea
                rows={3}
                value={value[key]}
                onChange={(e) => onChange({ ...value, [key]: e.target.value })}
                disabled={disabled}
                placeholder={`Sin promoción para ${label.toLowerCase()}`}
                className="w-full resize-none rounded-xl border border-[#E7D7C4] bg-[#FFFDF9] p-2.5 text-xs sm:text-sm text-[#2B1B13] focus:ring-2 focus:ring-[#C9974D] focus:border-[#C9974D] disabled:opacity-60"
              />
            </label>
          );
        })}
      </div>

      <p className="text-[10px] text-[#8A6A55]">
        Puedes dejar un día vacío si no hay promoción. Los cambios se publican al guardar la información del restaurante.
      </p>
    </section>
  );
};
