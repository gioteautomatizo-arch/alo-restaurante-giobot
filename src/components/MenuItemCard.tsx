import React from 'react';
import { MenuItem } from '../types';
import { Plus, Sparkles, Utensils } from 'lucide-react';

interface MenuItemCardProps {
  item: MenuItem;
  onSelectItem: (item: MenuItem) => void;
}

export const MenuItemCard: React.FC<MenuItemCardProps> = ({ item, onSelectItem }) => {
  return (
    <div
      onClick={() => onSelectItem(item)}
      className="group bg-white rounded-2xl border border-stone-200/90 shadow-xs hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between hover:border-[#b48a44]/50 cursor-pointer active:scale-[0.99]"
    >
      <div>
        {/* Photography / Image Header */}
        <div className="relative h-40 sm:h-44 w-full bg-stone-100 overflow-hidden">
          {item.image ? (
            <img
              src={item.image}
              alt={item.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-emerald-50 text-[#162e1e]">
              <Utensils className="w-10 h-10 opacity-30" />
            </div>
          )}

          {/* Badges */}
          <div className="absolute top-2 left-2 flex flex-wrap gap-1">
            {item.popular && (
              <span className="px-2 py-0.5 text-[9px] sm:text-[10px] font-black uppercase tracking-wider bg-[#d1a85b] text-[#162e1e] rounded-full shadow-xs flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5 fill-[#162e1e]" /> Recomendado
              </span>
            )}
            {item.weekendOnly && (
              <span className="px-2 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider bg-[#162e1e] text-[#fcfaf6] rounded-full shadow-xs border border-[#d1a85b]/40">
                Especial {item.weekendOnly}
              </span>
            )}
          </div>

          {/* Price Tag Overlay */}
          <div className="absolute bottom-2 right-2 bg-[#162e1e]/95 backdrop-blur-md px-2.5 py-1 rounded-xl font-black text-xs sm:text-sm text-[#d1a85b] shadow-md border border-[#b48a44]/30">
            ${item.price}
            {item.sizes && item.sizes.length > 0 && (
              <span className="text-[10px] font-normal text-stone-300"> (desde)</span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-3.5 sm:p-4">
          <h3 className="font-serif font-black text-sm sm:text-base text-stone-900 leading-snug group-hover:text-[#162e1e] transition-colors">
            {item.name}
          </h3>
          <p className="text-xs text-stone-500 line-clamp-2 mt-1 leading-relaxed">
            {item.description}
          </p>
        </div>
      </div>

      {/* Direct Quick Add / Customize Button */}
      <div className="p-3.5 sm:p-4 pt-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelectItem(item);
          }}
          className="w-full py-2 sm:py-2.5 px-3 bg-[#fcfaf6] group-hover:bg-[#162e1e] text-[#162e1e] group-hover:text-[#fcfaf6] border border-[#b48a44]/40 group-hover:border-[#162e1e] rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4 text-[#b48a44] group-hover:text-[#d1a85b]" />
          <span>Agregar</span>
        </button>
      </div>
    </div>
  );
};
