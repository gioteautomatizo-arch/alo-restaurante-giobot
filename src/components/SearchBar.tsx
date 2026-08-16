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
        <Search className="w-4 h-4 absolute left-3.5 text-[#b48a44] pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar platillos, bebidas o ingredientes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-10 py-3 text-xs sm:text-sm bg-white border border-stone-300/80 rounded-2xl text-stone-900 placeholder-stone-400 shadow-xs focus:outline-none focus:ring-2 focus:ring-[#162e1e] focus:border-transparent transition-all"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-3 p-1 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
            title="Limpiar búsqueda"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
