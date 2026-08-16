import React, { useRef } from 'react';
import { CategoryId } from '../types';

interface CategoryFilterProps {
  activeCategory: CategoryId;
  onSelectCategory: (cat: CategoryId) => void;
}

const CATEGORIES: { id: CategoryId; label: string; icon: string }[] = [
  { id: 'all', label: 'Todo', icon: '✨' },
  { id: 'desayunos', label: 'Desayunos', icon: '🍳' },
  { id: 'comida-corrida', label: 'Comida Corrida $90', icon: '🍲' },
  { id: 'ensaladas', label: 'Ensaladas $90', icon: '🥗' },
  { id: 'chapatas-sandwiches', label: 'Chapatas & Sandwiches', icon: '🥪' },
  { id: 'hamburguesas', label: 'Hamburguesas', icon: '🍔' },
  { id: 'tortas-molletes', label: 'Tortas & Molletes', icon: '🥖' },
  { id: 'antojitos', label: 'Antojitos', icon: '🌮' },
  { id: 'especialidades', label: 'Especialidades', icon: '🍽️' },
  { id: 'bebidas', label: 'Café & Infusiones', icon: '☕' },
  { id: 'frios-frappes', label: 'Fríos & Frappés', icon: '🧊' },
  { id: 'jugos-licuados', label: 'Jugos Naturales', icon: '🥤' },
  { id: 'panaderia', label: 'Postres & Pan', icon: '🍰' },
  { id: 'fin-de-semana', label: 'Fin de Semana', icon: '🍲' },
];

export const CategoryFilter: React.FC<CategoryFilterProps> = ({
  activeCategory,
  onSelectCategory,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleCategoryClick = (catId: CategoryId) => {
    onSelectCategory(catId);
  };

  return (
    <div
      id="menu-categories"
      className="sticky top-[52px] sm:top-[57px] z-30 bg-[#fcfaf6]/95 backdrop-blur-md border-b border-stone-200/90 py-2.5 px-3 sm:px-6 shadow-xs"
    >
      <div
        ref={scrollContainerRef}
        className="max-w-7xl mx-auto flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar scroll-smooth"
      >
        {CATEGORIES.map((cat) => {
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => handleCategoryClick(cat.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all duration-150 cursor-pointer shrink-0 ${
                isActive
                  ? 'bg-[#162e1e] text-[#fcfaf6] shadow-sm ring-1 ring-[#b48a44]'
                  : 'bg-white hover:bg-stone-100 text-stone-700 border border-stone-200/90'
              }`}
            >
              <span className="text-sm sm:text-base">{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
