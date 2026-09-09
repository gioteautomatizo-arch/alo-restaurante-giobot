import React, { useMemo, useRef, useState } from 'react';
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
  CupSoda,
  Cake,
  Soup,
  ChevronDown,
  LucideIcon,
} from 'lucide-react';

interface CategoryFilterProps {
  activeCategory: CategoryId;
  onSelectCategory: (cat: CategoryId) => void;
}

interface SubcategoryDefinition {
  id: CategoryId;
  label: string;
  Icon: LucideIcon;
}

interface MenuSectionDefinition {
  id: string;
  label: string;
  Icon: LucideIcon;
  categories: SubcategoryDefinition[];
}

const MENU_SECTIONS: MenuSectionDefinition[] = [
  {
    id: 'all',
    label: 'Toda la carta',
    Icon: Sparkles,
    categories: [{ id: 'all', label: 'Toda la carta', Icon: Sparkles }],
  },
  {
    id: 'desayunos',
    label: 'Desayunos',
    Icon: SunMedium,
    categories: [
      { id: 'desayunos', label: 'Desayunos', Icon: SunMedium },
      { id: 'molletes-sincronizadas-tortas', label: 'Molletes, sincronizadas y tortas', Icon: Wheat },
    ],
  },
  {
    id: 'comida',
    label: 'Comida',
    Icon: UtensilsCrossed,
    categories: [
      { id: 'comida-corrida', label: 'Comida corrida', Icon: UtensilsCrossed },
      { id: 'antojitos', label: 'Antojitos', Icon: ChefHat },
      { id: 'hamburguesas', label: 'Hamburguesas', Icon: Flame },
      { id: 'chapatas-sandwiches', label: 'Chapatas y sandwiches', Icon: Sandwich },
      { id: 'ensaladas', label: 'Arma tu ensalada', Icon: Salad },
    ],
  },
  {
    id: 'bebidas',
    label: 'Bebidas',
    Icon: Coffee,
    categories: [
      { id: 'bebidas', label: 'Café y bebidas', Icon: Coffee },
      { id: 'licuados-agua-fruta-jugos', label: 'Licuados, aguas, fruta y jugos', Icon: CupSoda },
    ],
  },
  {
    id: 'panaderia',
    label: 'Panadería',
    Icon: Cake,
    categories: [{ id: 'panaderia', label: 'Panadería', Icon: Cake }],
  },
  {
    id: 'especialidades',
    label: 'Especialidades',
    Icon: Award,
    categories: [{ id: 'especialidades', label: 'Especialidades', Icon: Award }],
  },
  {
    id: 'fin-de-semana',
    label: 'Fin de semana',
    Icon: Soup,
    categories: [{ id: 'fin-de-semana', label: 'Fin de semana', Icon: Soup }],
  },
];

export const CategoryFilter: React.FC<CategoryFilterProps> = ({
  activeCategory,
  onSelectCategory,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const activeSection = useMemo(
    () => MENU_SECTIONS.find((section) => section.categories.some((category) => category.id === activeCategory)) || MENU_SECTIONS[0],
    [activeCategory]
  );

  const [openSectionId, setOpenSectionId] = useState<string>(() =>
    activeSection.categories.length > 1 ? activeSection.id : ''
  );

  const openSection = MENU_SECTIONS.find((section) => section.id === openSectionId);

  const handleSectionClick = (section: MenuSectionDefinition) => {
    if (section.id === 'all') {
      setOpenSectionId('');
      onSelectCategory('all');
      return;
    }

    if (section.categories.length === 1) {
      setOpenSectionId('');
      onSelectCategory(section.categories[0].id);
      return;
    }

    setOpenSectionId((current) => (current === section.id ? '' : section.id));

    if (!section.categories.some((category) => category.id === activeCategory)) {
      onSelectCategory(section.categories[0].id);
    }
  };

  return (
    <div
      id="menu-categories"
      className="sticky top-[49px] sm:top-[55px] z-30 bg-[#FFF7EA]/95 backdrop-blur-md border-b border-[#DEC8AE] shadow-xs"
    >
      <div className="py-2.5 px-3 sm:px-6">
        <div
          ref={scrollContainerRef}
          className="max-w-7xl mx-auto flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar scroll-smooth"
        >
          {MENU_SECTIONS.map((section) => {
            const isActive = section.categories.some((category) => category.id === activeCategory);
            const isOpen = openSectionId === section.id;
            const IconComponent = section.Icon;
            const hasSubcategories = section.categories.length > 1;

            return (
              <button
                key={section.id}
                type="button"
                onClick={() => handleSectionClick(section)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer shrink-0 ${
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
                <span>{section.label}</span>
                {hasSubcategories && (
                  <ChevronDown
                    className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''} ${
                      isActive ? 'text-[#C9974D]' : 'text-[#A86B3D]'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {openSection && openSection.categories.length > 1 && (
        <div className="border-t border-[#E8D4BE] bg-[#FFFDF9]/95 px-3 sm:px-6 py-2">
          <div className="max-w-7xl mx-auto flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth">
            {openSection.categories.map((category) => {
              const isActive = activeCategory === category.id;
              const IconComponent = category.Icon;

              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => onSelectCategory(category.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                    isActive
                      ? 'bg-[#F4E3C8] text-[#3A2418] border border-[#C9974D]'
                      : 'bg-white text-[#6B4028] border border-[#E8D4BE] hover:bg-[#FFF7EA]'
                  }`}
                >
                  <IconComponent className="w-3.5 h-3.5 text-[#A86B3D]" />
                  <span>{category.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
