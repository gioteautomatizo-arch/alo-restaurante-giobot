import React from 'react';
import { Logo } from './Logo';
import { Bot, Sparkles, UtensilsCrossed, Salad, Coffee, ArrowRight, ShieldCheck } from 'lucide-react';

interface BannerProps {
  onOpenGiobot: () => void;
  onOpenComidaCorrida: () => void;
  onOpenEnsalada: () => void;
  onScrollToMenu: () => void;
}

export const Banner: React.FC<BannerProps> = ({
  onOpenGiobot,
  onOpenComidaCorrida,
  onOpenEnsalada,
  onScrollToMenu,
}) => {
  return (
    <section className="relative overflow-hidden bg-[#14281d] text-[#faf8f5] border-b border-[#244c34]">
      {/* High-Resolution Gastronomic Atmosphere Background */}
      <div className="absolute inset-0 z-0">
        <img
          src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=85&w=1800"
          alt="Ambiente bistró contemporáneo ¡Aló! Restaurante"
          className="w-full h-full object-cover object-center opacity-25 scale-105 transform duration-700"
        />
        {/* Soft Vignette and Forest Green Gradient Gradients */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#14281d] via-[#14281d]/85 to-[#14281d]/70" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(196,151,79,0.15),transparent_70%)]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          {/* Main Editorial Presentation */}
          <div className="lg:col-span-7 space-y-5 text-center lg:text-left">
            {/* Tagline Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#1b3a27]/90 border border-[#c4974f]/40 backdrop-blur-md shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#c4974f] animate-pulse" />
              <span className="text-[11px] sm:text-xs font-semibold tracking-wider text-[#e6caa0] uppercase">
                Bistró Mexicano Contemporáneo · Tlalpan
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-2xl sm:text-4xl lg:text-5xl font-serif font-black tracking-tight text-[#faf8f5] leading-[1.15]">
              Sabor tradicional con la elegancia del bistró actual.
            </h1>

            {/* Description */}
            <p className="text-sm sm:text-base text-stone-300 font-light leading-relaxed max-w-2xl mx-auto lg:mx-0">
              Bienvenido a <strong>¡Aló! Restaurante</strong> en Calle la Fama 12. Preparamos cada platillo con ingredientes frescos seleccionados al día, café de grano recién molido y una atención cordial diseñada para hacerte sentir en casa.
            </p>

            {/* Giobot Host Card Integration */}
            <div className="p-4 sm:p-4.5 rounded-2xl bg-[#1a3424]/90 border border-[#c4974f]/35 backdrop-blur-md shadow-md text-left flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-[#c4974f]/20 border border-[#c4974f]/40 text-[#d1a85b] shrink-0 mt-0.5 sm:mt-0">
                  <Bot className="w-5 h-5 text-[#d1a85b]" />
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-serif font-bold text-sm text-[#faf8f5]">Giobot</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-[#c4974f] bg-[#14281d] px-2 py-0.5 rounded-md border border-[#c4974f]/30">
                      Anfitrión Culinario
                    </span>
                  </div>
                  <p className="text-xs text-stone-300 leading-snug">
                    ¿Deseas una sugerencia del chef, conocer la comida corrida o personalizar tu ensalada? Estoy listo para asesorarte.
                  </p>
                </div>
              </div>

              <button
                onClick={onOpenGiobot}
                className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-[#c4974f] to-[#b5883d] hover:from-[#d6aa5f] hover:to-[#c4974f] text-[#14281d] font-black text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 shrink-0 active:scale-95 cursor-pointer"
              >
                <span>Consultar</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick Action Navigation Buttons */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2.5 pt-1">
              <button
                onClick={onScrollToMenu}
                className="px-5 py-2.5 bg-[#faf8f5] hover:bg-white text-[#14281d] font-black text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
              >
                <UtensilsCrossed className="w-4 h-4 text-[#14281d]" />
                <span>Explorar Menú</span>
              </button>

              <button
                onClick={onOpenComidaCorrida}
                className="px-4 py-2.5 bg-[#1b3a27] hover:bg-[#234b33] text-[#faf8f5] border border-[#c4974f]/40 font-bold text-xs sm:text-sm rounded-xl transition-all flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#c4974f]" />
                <span>Comida Corrida ($90)</span>
              </button>

              <button
                onClick={onOpenEnsalada}
                className="px-4 py-2.5 bg-[#1b3a27] hover:bg-[#234b33] text-[#faf8f5] border border-[#c4974f]/40 font-bold text-xs sm:text-sm rounded-xl transition-all flex items-center gap-2 cursor-pointer"
              >
                <Salad className="w-3.5 h-3.5 text-emerald-400" />
                <span>Arma tu Ensalada ($90)</span>
              </button>
            </div>
          </div>

          {/* Right Highlights Showcase (Visual & Gastronomic Pillars) */}
          <div className="lg:col-span-5 grid grid-cols-2 gap-3 sm:gap-3.5">
            {/* Card 1: Café & Bebidas */}
            <div className="p-4 rounded-2xl bg-[#1b3a27]/80 border border-[#c4974f]/25 backdrop-blur-xs space-y-2 hover:border-[#c4974f]/60 transition-colors">
              <div className="w-8 h-8 rounded-xl bg-[#14281d] flex items-center justify-center text-[#c4974f] border border-[#c4974f]/30">
                <Coffee className="w-4 h-4" />
              </div>
              <h3 className="font-serif font-bold text-xs sm:text-sm text-[#faf8f5]">Café de Especialidad</h3>
              <p className="text-[11px] text-stone-300 leading-snug">
                Granos seleccionados molidos al instante: espresso, cappuccino, americano y de olla.
              </p>
            </div>

            {/* Card 2: Comida Corrida 3 Tiempos */}
            <div className="p-4 rounded-2xl bg-[#1b3a27]/80 border border-[#c4974f]/25 backdrop-blur-xs space-y-2 hover:border-[#c4974f]/60 transition-colors">
              <div className="w-8 h-8 rounded-xl bg-[#14281d] flex items-center justify-center text-[#c4974f] border border-[#c4974f]/30">
                <UtensilsCrossed className="w-4 h-4" />
              </div>
              <h3 className="font-serif font-bold text-xs sm:text-sm text-[#faf8f5]">Comida Corrida · $90</h3>
              <p className="text-[11px] text-stone-300 leading-snug">
                Tres tiempos completos con agua fresca del día y postre casero incluido.
              </p>
            </div>

            {/* Card 3: Ensaladas Frescas */}
            <div className="p-4 rounded-2xl bg-[#1b3a27]/80 border border-[#c4974f]/25 backdrop-blur-xs space-y-2 hover:border-[#c4974f]/60 transition-colors">
              <div className="w-8 h-8 rounded-xl bg-[#14281d] flex items-center justify-center text-emerald-400 border border-[#c4974f]/30">
                <Salad className="w-4 h-4" />
              </div>
              <h3 className="font-serif font-bold text-xs sm:text-sm text-[#faf8f5]">Ensaladas a Tu Medida</h3>
              <p className="text-[11px] text-stone-300 leading-snug">
                Proteínas asadas, frutas frescas, toppings crujientes y aderezos de la casa por $90.
              </p>
            </div>

            {/* Card 4: Compromiso & Calidad */}
            <div className="p-4 rounded-2xl bg-[#1b3a27]/80 border border-[#c4974f]/25 backdrop-blur-xs space-y-2 hover:border-[#c4974f]/60 transition-colors">
              <div className="w-8 h-8 rounded-xl bg-[#14281d] flex items-center justify-center text-[#c4974f] border border-[#c4974f]/30">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <h3 className="font-serif font-bold text-xs sm:text-sm text-[#faf8f5]">100% Calidad y Confianza</h3>
              <p className="text-[11px] text-stone-300 leading-snug">
                Ingredientes frescos, preparación limpia e higiene certificada en cada platillo.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
