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
    <section className="relative overflow-hidden bg-[#3A2418] text-[#FFF7EA] border-b border-[#4E3222]">
      {/* High-Resolution Gastronomic Atmosphere Background */}
      <div className="absolute inset-0 z-0">
        <img
          src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=85&w=1800"
          alt="Ambiente acogedor cafetería Restaurante Calientito"
          className="w-full h-full object-cover object-center opacity-20 scale-105 transform duration-700"
        />
        {/* Soft Vignette and Warm Coffee Gradient Gradients */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#3A2418] via-[#3A2418]/85 to-[#3A2418]/70" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(201,151,77,0.18),transparent_70%)]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          {/* Main Editorial Presentation */}
          <div className="lg:col-span-7 space-y-5 text-center lg:text-left">
            {/* Tagline Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#4A2E1F]/90 border border-[#C9974D]/40 backdrop-blur-md shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#C9974D] animate-pulse" />
              <span className="text-[11px] sm:text-xs font-semibold tracking-wider text-[#F4E3C8] uppercase">
                Comida Casera & Cafetería Cálida · Tlalpan
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-2xl sm:text-4xl lg:text-5xl font-serif font-black tracking-tight text-[#FFF7EA] leading-[1.15]">
              Sabor casero y hospitalidad en cada platillo.
            </h1>

            {/* Description */}
            <p className="text-sm sm:text-base text-[#EAD9C4] font-light leading-relaxed max-w-2xl mx-auto lg:mx-0">
              Bienvenido a <strong>Restaurante Calientito</strong> en Calle la Fama 12. Preparamos cada platillo con ingredientes frescos seleccionados al día, café de grano recién molido y una atención cordial diseñada para hacerte sentir en casa.
            </p>

            {/* Tita Host Card Integration */}
            <div className="p-4 sm:p-4.5 rounded-2xl bg-[#4A2E1F]/90 border border-[#C9974D]/35 backdrop-blur-md shadow-md text-left flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-[#FFF7EA] border border-[#C9974D]/40 p-1 flex items-center justify-center shrink-0 shadow-sm mt-0.5 sm:mt-0">
                  <img
                    src="/tita.png"
                    alt="Tita"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-serif font-bold text-sm text-[#FFF7EA]">Tita</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-[#F4E3C8] bg-[#3A2418] px-2 py-0.5 rounded-md border border-[#C9974D]/40">
                      Anfitriona & Asesora
                    </span>
                  </div>
                  <p className="text-xs text-[#EAD9C4] leading-snug">
                    ¿Deseas una sugerencia personalizada, conocer la comida corrida o armar tu ensalada? Estoy lista para consentirte.
                  </p>
                </div>
              </div>

              <button
                onClick={onOpenGiobot}
                className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-[#C9974D] to-[#A86B3D] hover:from-[#d6aa5f] hover:to-[#C9974D] text-[#3A2418] font-black text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 shrink-0 active:scale-95 cursor-pointer"
              >
                <span>Platicar con Tita</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick Action Navigation Buttons */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2.5 pt-1">
              <button
                onClick={onScrollToMenu}
                className="px-5 py-2.5 bg-[#FFF7EA] hover:bg-white text-[#3A2418] font-black text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
              >
                <UtensilsCrossed className="w-4 h-4 text-[#3A2418]" />
                <span>Explorar Menú</span>
              </button>

              <button
                onClick={onOpenComidaCorrida}
                className="px-4 py-2.5 bg-[#4A2E1F] hover:bg-[#6B4028] text-[#FFF7EA] border border-[#C9974D]/40 font-bold text-xs sm:text-sm rounded-xl transition-all flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#C9974D]" />
                <span>Comida Corrida ($90)</span>
              </button>

              <button
                onClick={onOpenEnsalada}
                className="px-4 py-2.5 bg-[#4A2E1F] hover:bg-[#6B4028] text-[#FFF7EA] border border-[#C77B4A]/50 font-bold text-xs sm:text-sm rounded-xl transition-all flex items-center gap-2 cursor-pointer"
              >
                <Salad className="w-3.5 h-3.5 text-[#C77B4A]" />
                <span>Arma tu Ensalada ($90)</span>
              </button>
            </div>
          </div>

          {/* Right Highlights Showcase (Visual & Gastronomic Pillars) */}
          <div className="lg:col-span-5 grid grid-cols-2 gap-3 sm:gap-3.5">
            {/* Card 1: Café & Bebidas */}
            <div className="p-4 rounded-2xl bg-[#4A2E1F]/80 border border-[#C9974D]/25 backdrop-blur-xs space-y-2 hover:border-[#C9974D]/60 transition-colors">
              <div className="w-8 h-8 rounded-xl bg-[#3A2418] flex items-center justify-center text-[#C9974D] border border-[#C9974D]/30">
                <Coffee className="w-4 h-4" />
              </div>
              <h3 className="font-serif font-bold text-xs sm:text-sm text-[#FFF7EA]">Café de Especialidad</h3>
              <p className="text-[11px] text-[#D8C4B4] leading-snug">
                Granos seleccionados molidos al instante: espresso, cappuccino, americano y de olla.
              </p>
            </div>

            {/* Card 2: Comida Corrida 3 Tiempos */}
            <div className="p-4 rounded-2xl bg-[#4A2E1F]/80 border border-[#C9974D]/25 backdrop-blur-xs space-y-2 hover:border-[#C9974D]/60 transition-colors">
              <div className="w-8 h-8 rounded-xl bg-[#3A2418] flex items-center justify-center text-[#C9974D] border border-[#C9974D]/30">
                <UtensilsCrossed className="w-4 h-4" />
              </div>
              <h3 className="font-serif font-bold text-xs sm:text-sm text-[#FFF7EA]">Comida Corrida · $90</h3>
              <p className="text-[11px] text-[#D8C4B4] leading-snug">
                Tres tiempos completos con agua fresca del día y postre casero incluido.
              </p>
            </div>

            {/* Card 3: Ensaladas Frescas */}
            <div className="p-4 rounded-2xl bg-[#4A2E1F]/80 border border-[#C9974D]/25 backdrop-blur-xs space-y-2 hover:border-[#C9974D]/60 transition-colors">
              <div className="w-8 h-8 rounded-xl bg-[#3A2418] flex items-center justify-center text-[#C77B4A] border border-[#C9974D]/30">
                <Salad className="w-4 h-4" />
              </div>
              <h3 className="font-serif font-bold text-xs sm:text-sm text-[#FFF7EA]">Ensaladas a Tu Medida</h3>
              <p className="text-[11px] text-[#D8C4B4] leading-snug">
                Proteínas asadas, frutas frescas, toppings crujientes y aderezos de la casa por $90.
              </p>
            </div>

            {/* Card 4: Compromiso & Calidad */}
            <div className="p-4 rounded-2xl bg-[#4A2E1F]/80 border border-[#C9974D]/25 backdrop-blur-xs space-y-2 hover:border-[#C9974D]/60 transition-colors">
              <div className="w-8 h-8 rounded-xl bg-[#3A2418] flex items-center justify-center text-[#C9974D] border border-[#C9974D]/30">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <h3 className="font-serif font-bold text-xs sm:text-sm text-[#FFF7EA]">100% Calidad y Confianza</h3>
              <p className="text-[11px] text-[#D8C4B4] leading-snug">
                Ingredientes frescos, preparación limpia e higiene certificada en cada platillo.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
