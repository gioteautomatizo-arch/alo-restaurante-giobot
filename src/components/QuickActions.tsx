import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Crown, Gift, Sparkles, Star, Utensils } from 'lucide-react';
import { MenuItem, VipProfile } from '../types';
import { getVipProfile, VIP_DATA_EVENT } from '../lib/vipStorage';
import { ADMIN_DATA_EVENT, getRestaurantInfo } from '../lib/adminStorage';
import { ManagedMenuItem, subscribeToMenuCatalog } from '../lib/menuCatalogService';
import { VipCardModal } from './VipCardModal';

interface QuickActionsProps {
  onScrollToMenu: () => void;
  onOpenDeliveryOrder: () => void;
  onOpenGiobot: () => void;
  onSelectItem: (item: MenuItem) => void;
}

const itemPrice = (item: ManagedMenuItem): number | null => {
  if (typeof item.price === 'number' && Number.isFinite(item.price) && item.price >= 0) return item.price;
  const values = (item.sizes || [])
    .map((size) => size.price)
    .filter((price): price is number => typeof price === 'number' && Number.isFinite(price) && price >= 0);
  return values.length ? Math.min(...values) : null;
};

const formatCustomerName = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase('es-MX') + part.slice(1).toLocaleLowerCase('es-MX'))
    .join(' ');

export const QuickActions: React.FC<QuickActionsProps> = ({
  onScrollToMenu,
  onOpenDeliveryOrder,
  onSelectItem,
}) => {
  const [vipProfile, setVipProfile] = useState<VipProfile | null>(() => getVipProfile());
  const [vipOpen, setVipOpen] = useState(false);
  const [restaurantInfo, setRestaurantInfo] = useState(getRestaurantInfo());
  const [catalog, setCatalog] = useState<ManagedMenuItem[]>([]);

  useEffect(() => {
    const refreshVip = () => setVipProfile(getVipProfile());
    const refreshRestaurant = () => setRestaurantInfo(getRestaurantInfo());
    window.addEventListener(VIP_DATA_EVENT, refreshVip);
    window.addEventListener('storage', refreshVip);
    window.addEventListener(ADMIN_DATA_EVENT, refreshRestaurant);
    const unsubscribe = subscribeToMenuCatalog((next) => setCatalog(next?.items || []), () => setCatalog([]));
    return () => {
      unsubscribe();
      window.removeEventListener(VIP_DATA_EVENT, refreshVip);
      window.removeEventListener('storage', refreshVip);
      window.removeEventListener(ADMIN_DATA_EVENT, refreshRestaurant);
    };
  }, []);

  useEffect(() => {
    const tidyPublicCatalog = () => {
      const main = document.getElementById('menu-section');
      if (!main) return;

      const heading = main.querySelector('h2');
      if (heading?.textContent?.trim() === 'Selección de Platillos Recomendados') {
        heading.textContent = 'Explora nuestra carta';
      }

      const buttons = Array.from(main.querySelectorAll<HTMLButtonElement>('button'));
      const builderButtons = buttons.filter((button) => {
        const text = button.textContent || '';
        return text.includes('Armar Corrida') || text.includes('Armar Ensalada');
      });
      builderButtons.forEach((button) => {
        const wrapper = button.parentElement;
        if (wrapper && wrapper.querySelectorAll('button').length === 2) {
          wrapper.dataset.publicDuplicateActions = 'true';
          wrapper.style.display = 'none';
        }
      });
    };

    tidyPublicCatalog();
    const timer = window.setInterval(tidyPublicCatalog, 1200);

    return () => {
      window.clearInterval(timer);
      document.querySelectorAll<HTMLElement>('[data-public-duplicate-actions="true"]').forEach((node) => {
        node.style.display = '';
        delete node.dataset.publicDuplicateActions;
      });
    };
  }, []);

  const featured = useMemo(
    () => catalog.filter((item) => item.active && item.available && item.popular && itemPrice(item) !== null).slice(0, 4),
    [catalog]
  );

  const goal = Math.max(1, restaurantInfo.vipStampsRequired ?? 5);
  const stamps = Math.max(0, vipProfile?.stamps ?? 0);
  const remaining = Math.max(0, goal - stamps);
  const progress = Math.min(100, (stamps / goal) * 100);
  const formattedName = vipProfile ? formatCustomerName(vipProfile.customerName) : '';

  const toMenuItem = (item: ManagedMenuItem): MenuItem => ({
    id: item.id,
    name: item.name,
    category: item.category,
    description: item.description,
    price: itemPrice(item) as number,
    ...(item.sizes?.length ? { sizes: item.sizes.filter((size) => typeof size.price === 'number').map((size) => ({ name: size.name, price: size.price })) } : {}),
    ...(item.options?.length ? { options: item.options } : {}),
    ...(item.extras?.length ? { extras: item.extras.map((extra) => ({ id: extra.id, name: extra.name, price: extra.price })) } : {}),
    ...(item.primaryImageUrl ? { image: item.primaryImageUrl } : {}),
    popular: item.popular,
    ...(item.weekendOnly ? { weekendOnly: item.weekendOnly } : {}),
  });

  const openFeaturedItem = (item: ManagedMenuItem) => {
    onSelectItem(toMenuItem(item));
  };

  return (
    <div className="space-y-4 sm:space-y-5 w-full">
      <button
        type="button"
        onClick={() => setVipOpen(true)}
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
                {vipProfile ? `Hola, ${formattedName}` : 'Haz que cada visita cuente'}
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
              const price = itemPrice(item) as number;
              const image = [item.primaryImageUrl, ...(item.imageUrls || [])]
                .find((url) => !!url && url.startsWith('https://res.cloudinary.com/'));
              const single = featured.length === 1;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openFeaturedItem(item)}
                  className={`${single ? 'w-full sm:grid sm:grid-cols-[minmax(220px,36%)_1fr]' : 'min-w-[210px] sm:min-w-[250px] max-w-[270px] snap-start'} rounded-2xl bg-white border border-[#DEC8AE] overflow-hidden text-left shadow-2xs hover:shadow-md hover:border-[#A86B3D]/60 transition-all active:scale-[0.99] cursor-pointer`}
                >
                  <div className={`relative ${single ? 'h-40 sm:h-full sm:min-h-[165px]' : 'h-28 sm:h-32'} bg-gradient-to-br from-[#FFF7EA] to-[#F4E3C8] overflow-hidden`}>
                    {image ? (
                      <img src={image} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
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
                    <span className="absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-[#3A2418]/95 text-[#FFF7EA] text-xs font-black">${price}</span>
                  </div>
                  <div className={`${single ? 'p-4 sm:p-5 sm:flex sm:flex-col sm:justify-center' : 'p-3'}`}>
                    <strong className={`block font-serif ${single ? 'text-base sm:text-xl' : 'text-sm sm:text-base'} text-[#2B1B13] line-clamp-1`}>{item.name}</strong>
                    <span className={`block ${single ? 'text-xs sm:text-sm' : 'text-[10px] sm:text-[11px]'} text-[#6B4028] mt-1 line-clamp-2`}>{item.description}</span>
                    <span className="mt-3 inline-flex items-center gap-1 text-[10px] sm:text-xs font-black text-[#A86B3D]">Agregar / Personalizar <ArrowRight className="w-3 h-3" /></span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <VipCardModal
        isOpen={vipOpen}
        onClose={() => setVipOpen(false)}
        onOpenCart={() => {
          setVipOpen(false);
          onOpenDeliveryOrder();
        }}
        vipProfile={vipProfile}
        onProfileUpdated={() => setVipProfile(getVipProfile())}
      />
    </div>
  );
};