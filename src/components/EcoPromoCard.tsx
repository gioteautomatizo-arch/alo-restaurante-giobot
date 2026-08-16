import React from 'react';
import { Leaf, Check } from 'lucide-react';

interface EcoPromoCardProps {
  bringOwnContainer: boolean;
  setBringOwnContainer: (value: boolean) => void;
}

export const EcoPromoCard: React.FC<EcoPromoCardProps> = ({
  bringOwnContainer,
  setBringOwnContainer,
}) => {
  return (
    <div className="w-full bg-[#f2f7f3] border border-emerald-200/90 rounded-2xl p-3 sm:p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 shadow-xs">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
          <Leaf className="w-4 h-4 text-emerald-700" />
        </div>
        <div>
          <h4 className="text-xs sm:text-sm font-black text-emerald-950 flex items-center gap-1.5">
            10% de Descuento Ecológico
            <span className="text-[10px] font-bold bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded-md">
              Sustentable
            </span>
          </h4>
          <p className="text-[11px] text-emerald-800/90">
            Trae tus propios recipientes o termo para llevar y recibe 10% OFF en tu total.
          </p>
        </div>
      </div>

      <button
        onClick={() => setBringOwnContainer(!bringOwnContainer)}
        className={`w-full sm:w-auto px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer ${
          bringOwnContainer
            ? 'bg-emerald-700 text-white shadow-xs'
            : 'bg-white text-emerald-900 border border-emerald-300 hover:bg-emerald-50'
        }`}
      >
        {bringOwnContainer ? (
          <>
            <Check className="w-3.5 h-3.5 text-white" />
            <span>Descuento Activado</span>
          </>
        ) : (
          <span>Traeré mis recipientes</span>
        )}
      </button>
    </div>
  );
};
