import React from 'react';
import { Logo } from './Logo';

interface BannerProps {
  onOpenGiobot: () => void;
  onOpenComidaCorrida: () => void;
  onOpenEnsalada: () => void;
}

export const Banner: React.FC<BannerProps> = ({
  onOpenGiobot,
  onOpenComidaCorrida,
  onOpenEnsalada,
}) => {
  return (
    <div className="relative bg-gradient-to-br from-[#162e1e] via-[#1b3824] to-[#122418] text-stone-100 py-10 px-4 sm:px-6 lg:px-8 overflow-hidden shadow-inner border-b border-[#2a4d34]">
      {/* Decorative Background Pattern */}
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#d1a85b_1px,transparent_1px)] [background-size:20px_20px]" />

      <div className="max-w-7xl mx-auto relative z-10 flex flex-col lg:flex-row items-center justify-between gap-8">
        {/* Left Content */}
        <div className="space-y-4 text-center lg:text-left max-w-xl">
          <div className="inline-block bg-[#fcfaf6] px-4 py-2 rounded-2xl shadow-xl border border-[#b48a44]/40">
            <Logo size="md" variant="full" />
          </div>

          <h2 className="text-2xl sm:text-4xl font-black font-serif text-[#fcfaf6] leading-tight">
            Sabor Casero, Tradición y Atención Exclusiva
          </h2>

          <p className="text-xs sm:text-sm text-stone-300 leading-relaxed font-normal">
            En <strong>¡Aló! Restaurante</strong> (Calle la Fama 12, Tlalpan CDMX) combinamos la cocina casera con ingredientes selectos y un servicio cercano. Disfruta en <strong>sucursal, a domicilio o anticipando tu orden</strong>.
          </p>

          <div className="pt-2 flex flex-wrap items-center justify-center lg:justify-start gap-2.5">
            <button
              onClick={onOpenGiobot}
              className="px-5 py-2.5 bg-gradient-to-r from-[#d1a85b] to-[#b48a44] hover:from-[#e0bc74] hover:to-[#c59a50] text-[#162e1e] rounded-xl font-black text-xs sm:text-sm shadow-lg transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
            >
              🤖 Asesoría con Giobot
            </button>
            <button
              onClick={onOpenComidaCorrida}
              className="px-4 py-2.5 bg-[#1f402c] hover:bg-[#285037] text-stone-100 border border-[#b48a44]/50 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer"
            >
              🍲 Comida Corrida ($90)
            </button>
            <button
              onClick={onOpenEnsalada}
              className="px-4 py-2.5 bg-[#1f402c] hover:bg-[#285037] text-stone-100 border border-[#b48a44]/50 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer"
            >
              🥗 Arma tu Ensalada ($90)
            </button>
          </div>
        </div>

        {/* Right Highlight Cards */}
        <div className="grid grid-cols-2 gap-3 w-full lg:w-auto shrink-0">
          <div className="bg-[#1f402c]/70 border border-[#b48a44]/40 p-4 rounded-2xl text-center space-y-1.5 backdrop-blur-xs hover:border-[#d1a85b] transition-all">
            <div className="text-2xl">☕</div>
            <h4 className="font-bold text-xs text-[#d1a85b]">Café de Grano & Olla</h4>
            <p className="text-[10px] text-stone-300">Espresso, Cappuccino, Chai, Mocca y Tradicional</p>
          </div>

          <div className="bg-[#1f402c]/70 border border-[#b48a44]/40 p-4 rounded-2xl text-center space-y-1.5 backdrop-blur-xs hover:border-[#d1a85b] transition-all">
            <div className="text-2xl">🌿</div>
            <h4 className="font-bold text-xs text-[#d1a85b]">10% Descuento Eco</h4>
            <p className="text-[10px] text-emerald-300">Trayendo tus recipientes o termo para llevar</p>
          </div>

          <div className="bg-[#1f402c]/70 border border-[#b48a44]/40 p-4 rounded-2xl text-center space-y-1.5 backdrop-blur-xs hover:border-[#d1a85b] transition-all">
            <div className="text-2xl">🍳</div>
            <h4 className="font-bold text-xs text-[#d1a85b]">Desayunos del Día</h4>
            <p className="text-[10px] text-stone-300">Chilaquiles, Huevos al Gusto y Enfrijoladas</p>
          </div>

          <div className="bg-[#1f402c]/70 border border-[#b48a44]/40 p-4 rounded-2xl text-center space-y-1.5 backdrop-blur-xs hover:border-[#d1a85b] transition-all">
            <div className="text-2xl">🍲</div>
            <h4 className="font-bold text-xs text-[#d1a85b]">Fin de Semana</h4>
            <p className="text-[10px] text-stone-300">Sábados Pozole y Domingos Pancita ($80)</p>
          </div>
        </div>
      </div>
    </div>
  );
};
