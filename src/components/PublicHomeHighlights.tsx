import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Crown, Gift, Sparkles, Star, Utensils } from 'lucide-react';
import { MenuItem, VipProfile } from '../types';
import { ADMIN_DATA_EVENT, getRestaurantInfo } from '../lib/adminStorage';

interface PublicHomeHighlightsProps {
  vipProfile: VipProfile | null;
  menuItems: MenuItem[];
  onOpenVip: () => void;
  onSelectItem: (item: MenuItem) => void;
}

const hasRealPhoto = (url?: string): boolean =>
  !!url && url.startsWith('https://res.cloudinary.com/');

export const PublicHomeHighlights: React.FC<PublicHomeHighlightsProps> = ({
  vipProfile,
  menuItems,
  onOpenVip,
  onSelectItem,
}) => {
  const [restaurantInfo, setRestaurantInfo] = useState(getRestaurantInfo());

  useEffect(() => {
    const refresh = () => setRestaurantInfo(getRestaurantInfo());
    window.addEventListener(ADMIN_DATA_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(ADMIN_DATA_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const vipGoal = Math.max(1, restaurantInfo.vipStampsRequired ?? 5);
  const stamps = Math.max(0, vipProfile?.stamps ?? 0);
  const remaining = Math.max(0, vipGoal - stamps);
  const progress = Math.min(100, (stamps / vipGoal) * 100);

  const starredItems = useMemo(
    () => menuItems.filter((item) => item.popular).slice(0, 4),
    [menuItems]
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      <button
        type="button"
        onClick={onOpenVip}
        className="w-full rounded-3xl border border-[#C9974D]/35 bg-gradient-to-r from-[#3A2418] via-[#4A2E1F] to-[#3A2418] text-[#FFF7EA] p-4 sm:p-5 text-left shadow-sm hover:border-[#C9974D]/70 transition-all active:scale-[0.995]"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-[#C9974D]/15 border border-[#C9974D]/35 flex items-center justify-center shrink-0">
              <Crown className="w-5 h-5 text-[#C9974D]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] sm:text-xs uppercase tracking-wider font-black text-[#C9974D]">Cliente VIP</span>
                {vipProfile?.rewardAvailable && (
                  <span className="text-[9px] font-black uppercase rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5">Recompensa disponible</span>
                )}
              </div>
              <h3 className="font-serif font-black text-base sm:text-xl mt-0.5">
                {vipProfile ? `Hola, ${vipProfile.customerName}` : 'Haz que cada visita cuente'}
              </h3>
              <p className="text-[11px] sm:text-sm text-[#EAD9C4] mt-1 leading-snug max-w-2xl">
                {vipProfile
                  ? vipProfile.rewardAvailable
                    ? (restaurantInfo.vipRewardDescription || 'Ya tienes una recompensa lista para usar.')
                    : remaining === 1
                    ? 'Te falta solo 1 sello para tu siguiente recompensa.'
                    : `Llevas ${stamps} de ${vipGoal} sellos. Te faltan ${remaining} para tu siguiente recompensa.`
                  : 'Crea tu tarjeta VIP, acumula sellos con tus pedidos y recibe recompensas.'}
              </p>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-[#C9974D] shrink-0 mt-2" />
        </div>

        {vipProfile && !vipProfile.rewardAvailable && (
          <div className="mt-3">
            <div className="h-2 rounded-full bg-[#2B1B13]/70 overflow-hidden border border-[#C9974D]/15">
              <div className="h-full rounded-full bg-[#C9974D] transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center gap-2 text-[10px] sm:text-xs font-bold text-[#F4E3C8]">
          {vipProfile ? <Gift className="w-3.5 h-3.5 text-[#C9974D]" /> : <Star className="w-3.5 h-3.5 text-[#C9974D]" />}
          <span>{vipProfile ? 'Ver mi tarjeta VIP' : 'Crear mi tarjeta VIP'}</span>
        </div>
      </button>

      {starredItems.length > 0 && (
        <section>
          <div className="flex items-end justify-between gap-3 mb-2.5">
            <div>
              <div className="flex items-center gap-1.5 text-[#A86B3D]">
                <Sparkles className="w-4 h-4" />
                <span className="text-[10px] sm:text-xs uppercase tracking-wider font-black">Favoritos de Calientito</span>
              </div>
              <h3 className="font-serif font-black text-lg sm:text-xl text-[#2B1B13]">Platillos estrella</h3>
              <p className="text-[10px] sm:text-xs text-[#6B4028]">Los destacados que recomendamos hoy.</p>
            </div>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-thin">
            {starredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectItem(item)}
                className="min-w-[210px] sm:min-w-[250px] max-w-[270px] snap-start rounded-2xl bg-white border border-[#DEC8AE] overflow-hidden text-left shadow-2xs hover:shadow-md hover:border-[#A86B3D]/60 transition-all active:scale-[0.99]"
              >
                <div className="relative h-28 sm:h-32 bg-gradient-to-br from-[#FFF7EA] to-[#F4E3C8] overflow-hidden">
                  {hasRealPhoto(item.image) ? (
                    <img src={item.image} alt={item.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-white/70 border border-[#C9974D]/40 flex items-center justify-center">
                        <Utensils className="w-5 h-5 text-[#A86B3D]" />
                      </div>
                    </div>
                  )}
                  <span className="absolute top-2 left-2 px-2 py-1 rounded-full bg-[#C9974D] text-[#3A2418] text-[9px] font-black uppercase flex items-center gap-1">
                    <Star className="w-2.5 h-2.5 fill-[#3A2418]" /> Estrella
                  </span>
                  <span className="absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-[#3A2418]/95 text-[#FFF7EA] text-xs font-black">
                    ${item.price}{item.sizes?.length ? ' desde' : ''}
                  </span>
                </div>
                <div className="p-3">
                  <strong className="block font-serif text-sm sm:text-base text-[#2B1B13] line-clamp-1">{item.name}</strong>
                  <span className="block text-[10px] sm:text-[11px] text-[#6B4028] mt-1 line-clamp-2">{item.description}</span>
                  <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-black text-[#A86B3D]">Ver / Personalizar <ArrowRight className="w-3 h-3" /></span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
