import React, { useMemo } from 'react';
import { ArrowRight, Crown, Gift, Sparkles, Star, Utensils } from 'lucide-react';
import { MenuItem, VipProfile } from '../types';
import { getRestaurantInfo } from '../lib/adminStorage';

interface PublicHomeHighlightsProps {
  vipProfile: VipProfile | null;
  menuItems: MenuItem[];
  onOpenVip: () => void;
  onSelectItem: (item: MenuItem) => void;
}

const formatCustomerName = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase('es-MX') + part.slice(1).toLocaleLowerCase('es-MX'))
    .join(' ');

const hasRealPhoto = (url?: string): boolean =>
  !!url && url.startsWith('https://res.cloudinary.com/');

export const PublicHomeHighlights: React.FC<PublicHomeHighlightsProps> = ({
  vipProfile,
  menuItems,
  onOpenVip,
  onSelectItem,
}) => {
  const restaurantInfo = getRestaurantInfo();
  const featured = useMemo(
    () => menuItems.filter((item) => item.popular).slice(0, 4),
    [menuItems]
  );

  const goal = Math.max(1, restaurantInfo.vipStampsRequired ?? 5);
  const stamps = Math.max(0, vipProfile?.stamps ?? 0);
  const remaining = Math.max(0, goal - stamps);
  const progress = Math.min(100, (stamps / goal) * 100);
  const customerName = vipProfile ? formatCustomerName(vipProfile.customerName) : '';

  return (
    <div className="space-y-4 sm:space-y-5 w-full">
      <button
        type="button"
        onClick={onOpenVip}
        className="w-full rounded-3xl border border-[#C9974D]/35 bg-gradient-to-r from-[#3A2418] via-[#4A2E1F] to-[#3A2418] text-[#FFF7EA] p-4 sm:p-5 text-left shadow-sm hover:border-[#C9974D]/70 transition-all active:scale-[0.995] cursor-pointer"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-[#C9974D]/15 border border-[#C9974D]/35 flex items-center justify-center shrink-0">
              <Crown className="w-5 h-5 text-[#C9974D]" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] sm:text-xs uppercase tracking-wider font-black text-[#C9974D]">Cliente VIP</span>
              <h3 className="font-serif font-black text-base sm:text-xl mt-0.5">
                {vipProfile ? `Hola, ${customerName}` : 'Haz que cada visita cuente'}
              </h3>
              <p className="text-[11px] sm:text-sm text-[#EAD9C4] mt-1 leading-snug max-w-2xl">
                {vipProfile
                  ? vipProfile.rewardAvailable
                    ? (restaurantInfo.vipRewardDescription || 'Ya tienes una recompensa lista para usar.')
                    : remaining === 1
                    ? 'Te falta solo 1 sello para tu siguiente recompensa.'
                    : `Llevas ${stamps} de ${goal} sellos. Te faltan ${remaining}.`
                  : 'Crea tu tarjeta VIP, acumula sellos con tus pedidos y recibe recompensas.'}
              </p>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-[#C9974D] shrink-0 mt-2" />
        </div>

        {vipProfile && !vipProfile.rewardAvailable && (
          <div className="mt-3 h-2 rounded-full bg-[#2B1B13]/70 overflow-hidden border border-[#C9974D]/15">
            <div className="h-full rounded-full bg-[#C9974D]" style={{ width: `${progress}%` }} />
          </div>
        )}

        <div className="mt-3 flex items-center gap-2 text-[10px] sm:text-xs font-bold text-[#F4E3C8]">
          {vipProfile ? <Gift className="w-3.5 h-3.5 text-[#C9974D]" /> : <Star className="w-3.5 h-3.5 text-[#C9974D]" />}
          <span>{vipProfile ? 'Ver mi tarjeta VIP' : 'Crear mi tarjeta VIP'}</span>
        </div>
      </button>

      {featured.length > 0 && (
        <section>
          <div className="mb-2.5">
            <div className="flex items-center gap-1.5 text-[#A86B3D]">
              <Sparkles className="w-4 h-4" />
              <span className="text-[10px] sm:text-xs uppercase tracking-wider font-black">Favoritos de Calientito</span>
            </div>
            <h3 className="font-serif font-black text-lg sm:text-xl text-[#2B1B13]">Platillos estrella</h3>
            <p className="text-[10px] sm:text-xs text-[#6B4028]">Los destacados que recomendamos hoy.</p>
          </div>

          <div className={featured.length === 1 ? 'grid grid-cols-1' : 'flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory'}>
            {featured.map((item) => {
              const single = featured.length === 1;
              const realPhoto = hasRealPhoto(item.image) ? item.image : null;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectItem(item)}
                  className={`${single ? 'w-full sm:grid sm:grid-cols-[minmax(220px,36%)_1fr]' : 'min-w-[210px] sm:min-w-[250px] max-w-[270px] snap-start'} rounded-2xl bg-white border border-[#DEC8AE] overflow-hidden text-left shadow-2xs hover:shadow-md hover:border-[#A86B3D]/60 transition-all active:scale-[0.99] cursor-pointer`}
                >
                  <div className={`relative ${single ? 'h-40 sm:h-full sm:min-h-[165px]' : 'h-28 sm:h-32'} bg-gradient-to-br from-[#FFF7EA] to-[#F4E3C8] overflow-hidden`}>
                    {realPhoto ? (
                      <img src={realPhoto} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
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
                    <span className="absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-[#3A2418]/95 text-[#FFF7EA] text-xs font-black">${item.price}</span>
                  </div>
                  <div className={`${single ? 'p-4 sm:p-5 sm:flex sm:flex-col sm:justify-center' : 'p-3'}`}>
                    <strong className={`block font-serif ${single ? 'text-base sm:text-xl' : 'text-sm sm:text-base'} text-[#2B1B13] line-clamp-1`}>{item.name}</strong>
                    <span className={`block ${single ? 'text-xs sm:text-sm' : 'text-[10px] sm:text-[11px]'} text-[#6B4028] mt-1 line-clamp-2`}>{item.description}</span>
                    <span className="mt-3 inline-flex items-center gap-1 text-[10px] sm:text-xs font-black text-[#A86B3D]">Abrir platillo <ArrowRight className="w-3 h-3" /></span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};