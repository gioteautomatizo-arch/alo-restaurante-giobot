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
      className="group bg-white rounded-2xl border border-[#e8dfd1] shadow-xs hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between hover:border-[#c4974f]/60 cursor-pointer active:scale-[0.99]"
    >
      <div>
        {/* Uniform High-End Photography Container */}
        <div className="relative aspect-[4/3] w-full bg-stone-100 overflow-hidden">
          {item.image ? (
            <img
              src={item.image}
              alt={item.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[#f4efe6] text-[#14281d]">
              <Utensils className="w-8 h-8 opacity-25" />
            </div>
          )}

          {/* Editorial Badges Overlay */}
          <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5 z-10">
            {item.popular && (
              <span className="px-2 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider bg-[#c4974f] text-[#14281d] rounded-full shadow-xs flex items-center gap-1 border border-[#a87d37]/40">
                <Sparkles className="w-2.5 h-2.5 fill-[#14281d]" /> Destacado
              </span>
            )}
            {item.weekendOnly && (
              <span className="px-2 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider bg-[#14281d]/90 backdrop-blur-xs text-[#faf8f5] rounded-full shadow-xs border border-[#c4974f]/40">
                {item.weekendOnly}
              </span>
            )}
          </div>

          {/* Price Tag Overlay */}
          <div className="absolute bottom-2.5 right-2.5 bg-[#14281d]/95 backdrop-blur-md px-2.5 py-1 rounded-xl font-serif font-black text-xs sm:text-sm text-[#e6caa0] shadow-sm border border-[#c4974f]/30">
            ${item.price}
            {item.sizes && item.sizes.length > 0 && (
              <span className="text-[10px] font-sans font-normal text-stone-300"> (desde)</span>
            )}
          </div>
        </div>

        {/* Editorial Content */}
        <div className="p-3.5 sm:p-4">
          <h3 className="font-serif font-bold text-sm sm:text-base text-stone-900 leading-snug group-hover:text-[#14281d] transition-colors">
            {item.name}
          </h3>
          <p className="text-xs text-stone-600 line-clamp-2 mt-1.5 leading-relaxed font-light">
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
          className="w-full py-2 px-3 bg-[#faf8f5] group-hover:bg-[#14281d] text-[#14281d] group-hover:text-[#faf8f5] border border-[#c4974f]/40 group-hover:border-[#14281d] rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-[#8f6b2f] group-hover:text-[#c4974f]" />
          <span>Agregar / Personalizar</span>
        </button>
      </div>
    </article>
  );
};
