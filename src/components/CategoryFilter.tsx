import React, { useRef } from 'react';
import { CategoryId } from '../types';
import {
  Sparkles,
  SunMedium,
  UtensilsCrossed,
  Salad,
  Sandwich,
  Flame,
  Wheat,
  ChefHat,
  Award,
  Coffee,
  GlassWater,
  CupSoda,
  Cake,
  Soup,
  LucideIcon,
} from 'lucide-react';

interface CategoryFilterProps {
  activeCategory: CategoryId;
  onSelectCategory: (cat: CategoryId) => void;
}

interface CategoryDefinition {
  id: CategoryId;
  label: string;
  Icon: LucideIcon;
}

const CATEGORIES: CategoryDefinition[] = [
  { id: 'all', label: 'Selección & Todo', Icon: Sparkles },
  { id: 'desayunos', label: 'Desayunos', Icon: SunMedium },
  { id: 'comida-corrida', label: 'Comida Corrida $90', Icon: UtensilsCrossed },
  { id: 'ensaladas', label: 'Ensaladas $90', Icon: Salad },
  { id: 'chapatas-sandwiches', label: 'Chapatas & Sandwiches', Icon: Sandwich },
  { id: 'hamburguesas', label: 'Hamburguesas', Icon: Flame },
  { id: 'tortas-molletes', label: 'Tortas & Molletes', Icon: Wheat },
  { id: 'antojitos', label: 'Antojitos', Icon: ChefHat },
  { id: 'especialidades', label: 'Especialidades', Icon: Award },
  { id: 'bebidas', label: 'Café & Infusiones', Icon: Coffee },
  { id: 'frios-frappes', label: 'Fríos & Frappés', Icon: GlassWater },
  { id: 'jugos-licuados', label: 'Jugos Naturales', Icon: CupSoda },
  { id: 'panaderia', label: 'Postres & Pan', Icon: Cake },
  { id: 'fin-de-semana', label: 'Fin de Semana', Icon: Soup },
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
      className="sticky top-[49px] sm:top-[55px] z-30 bg-[#FFF7EA]/95 backdrop-blur-md border-b border-[#DEC8AE] py-2.5 px-3 sm:px-6 shadow-xs"
    >
      <div
        ref={scrollContainerRef}
        className="max-w-7xl mx-auto flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar scroll-smooth"
      >
        {CATEGORIES.map((cat) => {
          const isActive = activeCategory === cat.id;
          const IconComponent = cat.Icon;
          return (
            <button
              key={cat.id}
              onClick={() => handleCategoryClick(cat.id)}
              className={`flex items-center gap-2 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer shrink-0 ${
                isActive
                  ? 'bg-[#3A2418] text-[#FFF7EA] shadow-sm ring-1 ring-[#C9974D]'
                  : 'bg-[#FFFDF9] hover:bg-[#F4E3C8] text-[#6B4028] border border-[#DEC8AE]'
              }`}
            >
              <IconComponent
                className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${
                  isActive ? 'text-[#C9974D]' : 'text-[#A86B3D]'
                }`}
              />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
