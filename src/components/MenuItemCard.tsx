import React from 'react';
import { MenuItem } from '../types';
import { Plus, Sparkles, Utensils } from 'lucide-react';

interface MenuItemCardProps {
  item: MenuItem;
  onSelectItem: (item: MenuItem) => void;
}

export const MenuItemCard: React.FC<MenuItemCardProps> = ({ item, onSelectItem }) => {
  return (
    <article
      onClick={() => onSelectItem(item)}
      className="group bg-[#FFFDF9] rounded-2xl border border-[#DEC8AE] shadow-2xs hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between hover:border-[#A86B3D]/70 cursor-pointer active:scale-[0.99]"
    >
      <div>
        {/* Uniform High-End Photography Container */}
        <div className="relative aspect-[4/3] w-full bg-[#F4E3C8]/40 overflow-hidden">
          {item.image ? (
            <img
              src={item.image}
              alt={item.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[#F4E3C8] text-[#6B4028]">
              <Utensils className="w-8 h-8 opacity-30" />
            </div>
          )}

          {/* Editorial Badges Overlay */}
          <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5 z-10">
            {item.popular && (
              <span className="px-2 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider bg-[#C9974D] text-[#3A2418] rounded-full shadow-xs flex items-center gap-1 border border-[#A86B3D]/40">
                <Sparkles className="w-2.5 h-2.5 fill-[#3A2418]" /> Destacado
              </span>
            )}
            {item.weekendOnly && (
              <span className="px-2 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider bg-[#3A2418]/90 backdrop-blur-xs text-[#FFF7EA] rounded-full shadow-xs border border-[#C9974D]/40">
                {item.weekendOnly}
              </span>
            )}
          </div>

          {/* Price Tag Overlay */}
          <div className="absolute bottom-2.5 right-2.5 bg-[#3A2418]/95 backdrop-blur-md px-2.5 py-1 rounded-xl font-serif font-black text-xs sm:text-sm text-[#F4E3C8] shadow-sm border border-[#C9974D]/30">
            ${item.price}
            {item.sizes && item.sizes.length > 0 && (
              <span className="text-[10px] font-sans font-normal text-[#D8C4B4]"> (desde)</span>
            )}
          </div>
        </div>

        {/* Editorial Content */}
        <div className="p-3.5 sm:p-4">
          <h3 className="font-serif font-bold text-sm sm:text-base text-[#2B1B13] leading-snug group-hover:text-[#6B4028] transition-colors">
            {item.name}
          </h3>
          <p className="text-xs text-[#5A453A] line-clamp-2 mt-1.5 leading-relaxed font-light">
            {item.description}
          </p>
        </div>
      </div>

      {/* Direct Quick Action Button */}
      <div className="p-3.5 sm:p-4 pt-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelectItem(item);
          }}
          className="w-full py-2 px-3 bg-[#FFF7EA] group-hover:bg-[#3A2418] text-[#6B4028] group-hover:text-[#FFF7EA] border border-[#DEC8AE] group-hover:border-[#3A2418] rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-[#A86B3D] group-hover:text-[#C9974D]" />
          <span>Agregar / Personalizar</span>
        </button>
      </div>
    </article>
  );
};
