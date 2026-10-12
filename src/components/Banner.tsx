import React, { useEffect, useState } from 'react';
import { getRestaurantInfo, ADMIN_DATA_EVENT } from '../lib/adminStorage';

interface BannerProps {
  onOpenGiobot: () => void;
  onOpenComidaCorrida: () => void;
  onOpenEnsalada: () => void;
  onScrollToMenu: () => void;
}

/**
 * Portada editorial de la experiencia pública.
 *
 * Las acciones principales viven justo debajo, en QuickActions y DailyHighlights.
 * Mantener este bloque informativo evita duplicar botones y evita que tarjetas
 * decorativas parezcan acciones cuando en realidad no lo son.
 */
export const Banner: React.FC<BannerProps> = () => {
  // Textos editables por el negocio (admin → Información → Portada).
  const [info, setInfo] = useState(() => getRestaurantInfo());
  useEffect(() => {
    const update = () => setInfo(getRestaurantInfo());
    window.addEventListener(ADMIN_DATA_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(ADMIN_DATA_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);

  const heroTitle = info.heroTitle || 'Sabor casero y hospitalidad en cada platillo.';

  return (
    <section className="relative overflow-hidden bg-[#3A2418] text-[#FFF7EA] border-b border-[#4E3222]">
      <div className="absolute inset-0 z-0">
        <img
          src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=85&w=1800"
          alt="Ambiente acogedor de Restaurante Calientito"
          className="w-full h-full object-cover object-center opacity-[0.18] scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#3A2418] via-[#3A2418]/92 to-[#3A2418]/80" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(201,151,77,0.16),transparent_65%)]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 sm:py-9 lg:py-10">
        <div className="max-w-4xl mx-auto text-center space-y-3.5">
          {info.heroBadge && (
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#4A2E1F]/90 border border-[#C9974D]/40 backdrop-blur-md shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#C9974D]" />
              <span className="text-[10px] sm:text-xs font-semibold tracking-wider text-[#F4E3C8] uppercase">
                {info.heroBadge}
              </span>
            </div>
          )}

          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-serif font-black tracking-tight text-[#FFF7EA] leading-[1.12]">
            {heroTitle}
          </h1>

          {info.heroSubtitle && (
            <p className="text-xs sm:text-sm lg:text-base text-[#EAD9C4] leading-relaxed max-w-2xl mx-auto">
              {info.heroSubtitle}
            </p>
          )}

          <div className="inline-flex items-center gap-2 text-[10px] sm:text-xs text-[#F4E3C8]/85 bg-[#4A2E1F]/65 border border-[#C9974D]/20 rounded-xl px-3 py-2">
            <span className="text-[#C9974D]">↓</span>
            <span>Elige abajo cómo quieres ordenar.</span>
          </div>
        </div>
      </div>
    </section>
  );
};
