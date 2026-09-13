import React, { useState, useEffect } from 'react';
import { Leaf, Check, Megaphone, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { getRestaurantInfo, ADMIN_DATA_EVENT } from '../lib/adminStorage';
import { getTodaysPromotion, parseActivePromotions } from '../lib/promotions';

interface EcoPromoCardProps {
  bringOwnContainer: boolean;
  setBringOwnContainer: (value: boolean) => void;
}

export const EcoPromoCard: React.FC<EcoPromoCardProps> = ({
  bringOwnContainer,
  setBringOwnContainer,
}) => {
  const [restaurantInfo, setRestaurantInfo] = useState(getRestaurantInfo());
  const [showWeeklyPromotions, setShowWeeklyPromotions] = useState(false);

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

  const discountPercent = restaurantInfo.ecoDiscountPercent ?? 10;
  const promotions = parseActivePromotions(restaurantInfo.activePromotions);
  const todayPromotion = getTodaysPromotion(restaurantInfo.activePromotions);

  // Extract explanation without any hardcoded percentage so ecoDiscountPercent is the sole source of truth
  const rawDesc = (restaurantInfo.ecoDiscountDescription || '').trim();
  let explanation = rawDesc
    .replace(/^\d+%\s*(?:de\s+descuento\s*)?/i, '')
    .replace(/\b\d+%\s*/g, '')
    .trim();

  if (!explanation) {
    explanation = 'si el cliente trae sus propios recipientes o termo.';
  } else if (explanation.toLowerCase().startsWith('aplica si ')) {
    explanation = explanation.substring(7);
  } else if (explanation.toLowerCase().startsWith('aplica ')) {
    explanation = `si ${explanation.substring(7)}`;
  } else if (!explanation.toLowerCase().startsWith('si ')) {
    explanation = `si ${explanation}`;
  }

  const discountDescription = `${discountPercent}% de descuento ${explanation}`;

  return (
    <div className="space-y-2.5">
      <div className="w-full bg-[#F4E3C8]/50 border border-[#DEC8AE] rounded-2xl p-3 sm:p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#FFFDF9] text-[#C77B4A] border border-[#C77B4A]/30 flex items-center justify-center shrink-0">
            <Leaf className="w-4 h-4 text-[#C77B4A]" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-black text-[#2B1B13] flex items-center gap-1.5 font-serif">
              {discountPercent}% de Descuento Ecológico
              <span className="text-[10px] font-bold bg-[#C77B4A]/20 text-[#6B4028] px-1.5 py-0.5 rounded-md">
                Sustentable
              </span>
            </h4>
            <p className="text-[11px] text-[#6B4028]">
              {discountDescription}
            </p>
          </div>
        </div>

        <button
          onClick={() => setBringOwnContainer(!bringOwnContainer)}
          className={`w-full sm:w-auto px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer ${
            bringOwnContainer
              ? 'bg-[#A86B3D] text-[#FFF7EA] shadow-xs'
              : 'bg-[#FFFDF9] text-[#6B4028] border border-[#DEC8AE] hover:bg-[#F4E3C8]'
          }`}
        >
          {bringOwnContainer ? (
            <>
              <Check className="w-3.5 h-3.5 text-[#FFF7EA]" />
              <span>Descuento Activado</span>
            </>
          ) : (
            <span>Traeré mis recipientes</span>
          )}
        </button>
      </div>

      {promotions.length > 0 && (
        <div className="w-full rounded-2xl border border-[#C9974D]/35 bg-[#FFFDF9] px-3.5 py-3 shadow-2xs">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#F4E3C8]/55 border border-[#C9974D]/35 flex items-center justify-center shrink-0">
              <Megaphone className="w-4 h-4 text-[#A86B3D]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#C9974D]" />
                <span className="text-[10px] sm:text-xs uppercase tracking-wider font-black text-[#A86B3D]">Promoción de hoy</span>
              </div>

              {todayPromotion ? (
                <div className="rounded-xl border border-[#C9974D]/55 bg-[#FFF7EA] px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#3A2418] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#FFF7EA]">Hoy · {todayPromotion.label}</span>
                    <strong className="text-xs sm:text-sm text-[#3A2418]">{todayPromotion.text}</strong>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-[#6B4028]">Hoy no hay una promoción especial activa.</p>
              )}

              <button
                type="button"
                onClick={() => setShowWeeklyPromotions((current) => !current)}
                className="mt-2 inline-flex items-center gap-1.5 text-[10px] sm:text-xs font-black text-[#A86B3D] hover:text-[#6B4028]"
              >
                {showWeeklyPromotions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {showWeeklyPromotions ? 'Ocultar promociones de la semana' : 'Ver promociones de la semana'}
              </button>

              {showWeeklyPromotions && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {promotions.map((promotion) => (
                    <span key={promotion} className="px-2.5 py-1 rounded-full bg-white border border-[#DEC8AE] text-[10px] sm:text-xs font-bold text-[#5C3825]">
                      {promotion}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
