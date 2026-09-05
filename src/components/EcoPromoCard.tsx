import React, { useState, useEffect } from 'react';
import { Leaf, Check } from 'lucide-react';
import { getRestaurantInfo, ADMIN_DATA_EVENT } from '../lib/adminStorage';

interface EcoPromoCardProps {
  bringOwnContainer: boolean;
  setBringOwnContainer: (value: boolean) => void;
}

export const EcoPromoCard: React.FC<EcoPromoCardProps> = ({
  bringOwnContainer,
  setBringOwnContainer,
}) => {
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

  const discountPercent = restaurantInfo.ecoDiscountPercent ?? 10;

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
  );
};
