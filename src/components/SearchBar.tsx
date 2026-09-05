import React from 'react';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ searchTerm, setSearchTerm }) => {
  return (
    <div className="w-full relative">
      <div className="relative flex items-center">
        <Search className="w-4 h-4 absolute left-3.5 text-[#A86B3D] pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar platillos, bebidas o ingredientes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-10 py-3 text-xs sm:text-sm bg-[#FFFDF9] border border-[#DEC8AE] rounded-2xl text-[#2B1B13] placeholder-[#8C7364] shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#A86B3D] focus:border-transparent transition-all"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-3 p-1 rounded-full text-[#6B4028] hover:text-[#2B1B13] hover:bg-[#F4E3C8] transition-colors cursor-pointer"
            title="Limpiar búsqueda"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
