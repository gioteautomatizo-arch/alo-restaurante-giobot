import React, { useEffect, useState } from 'react';
import { Megaphone, Sparkles } from 'lucide-react';
import { ADMIN_DATA_EVENT, getRestaurantInfo } from '../lib/adminStorage';
import { parseActivePromotions } from '../lib/promotions';

export const PublicPromotionsStrip: React.FC = () => {
  const [promotions, setPromotions] = useState<string[]>(() =>
    parseActivePromotions(getRestaurantInfo().activePromotions)
  );

  useEffect(() => {
    const refresh = () => {
      setPromotions(parseActivePromotions(getRestaurantInfo().activePromotions));
    };
    window.addEventListener(ADMIN_DATA_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(ADMIN_DATA_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  if (promotions.length === 0) return null;

  return (
    <section className="w-full rounded-2xl border border-[#C9974D]/35 bg-[#FFFDF9] px-3.5 py-3 shadow-2xs">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#C9974D]/35 bg-[#F4E3C8]/55 text-[#A86B3D]">
          <Megaphone className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-[#C9974D]" />
            <span className="text-[10px] font-black uppercase tracking-wider text-[#A86B3D]">Promociones vigentes</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {promotions.map((promotion) => (
              <span
                key={promotion}
                className="rounded-full border border-[#DEC8AE] bg-[#FFF7EA] px-2.5 py-1 text-[10px] sm:text-xs font-bold text-[#5C3825]"
              >
                {promotion}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
