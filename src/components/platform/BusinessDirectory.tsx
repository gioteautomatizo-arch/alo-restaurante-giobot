import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { ArrowRight, Search, Store, Utensils, ShoppingBag, Sparkles, MapPin, Bot } from 'lucide-react';
import { db } from '../../lib/firebase';
import type { RestaurantTenant } from '../../lib/restaurantCore';

type DirectoryBusiness = RestaurantTenant & { publicListing?: boolean; published?: boolean };

const normalize = (value: string) => value.toLocaleLowerCase('es-MX').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const calientitoCard = (): DirectoryBusiness => ({
            restaurantId: 'alo-restaurante',
            businessType: 'restaurant',
            branding: {
              restaurantName: 'Restaurante Calientito',
              publicSlug: 'calientito',
              tagline: 'Comida rica, como en casa',
              description: 'Consulta el menú de Restaurante Calientito y prepara tu pedido.',
            },
            assistant: { name: 'Giobot', plan: 'GIOBOT_BASE', personality: 'AMABLE', enabled: true },
            features: {
              publicMenu: true, qrTables: true, pos: true, kitchenStations: true, inventory: true,
              vip: true, promotions: true, customerAssistant: true, adminAssistant: true,
              delivery: true, reservations: false,
            },
            publicListing: true,
            published: true,
          } as DirectoryBusiness);

export const BusinessDirectory: React.FC = () => {
  const [businesses, setBusinesses] = useState<DirectoryBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    getDocs(query(collection(db, 'publicBusinessProfiles'), where('published', '==', true)))
      .then((snapshot) => {
        if (cancelled) return;
        const rows = snapshot.docs
          .map((item) => ({ ...(item.data() as DirectoryBusiness), restaurantId: item.id }))
          .filter((business) => business.published === true);

        if (!rows.some((business) => business.restaurantId === 'alo-restaurante')) rows.push(calientitoCard());

        rows.sort((a, b) => a.branding.restaurantName.localeCompare(b.branding.restaurantName, 'es-MX'));
        setBusinesses(rows);
      })
      .catch((err) => {
        console.error('[BusinessDirectory] No se pudieron cargar los negocios públicos:', err);
        if (!cancelled) {
          setError(String((err as { code?: string })?.code || (err as Error)?.message || 'error'));
          setBusinesses([calientitoCard()]);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(() => {
    const term = normalize(search.trim());
    return businesses.filter((business) => normalize([
      business.branding.restaurantName,
      business.branding.description || '',
      business.branding.tagline || '',
      business.businessType || '',
    ].join(' ')).includes(term));
  }, [businesses, search]);

  const openBusiness = (id: string) => { window.location.hash = '#negocio/' + encodeURIComponent(id); };
  const openBusinessAccess = () => { window.location.hash = '#business'; };
  const openRegistration = () => { window.location.hash = '#business-new'; };

  return (
    <div className="min-h-screen bg-[#10100F] text-[#F7F4EE]">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#10100F]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <a href="#" onClick={(event) => { event.preventDefault(); window.location.hash = '#explorar'; }} className="flex items-center gap-3">
            <img src="/gioteautomatizo-mark.svg" alt="" className="h-10 w-10 rounded-xl" />
            <span><span className="block text-[10px] font-black uppercase tracking-[.2em] text-[#D6A34A]">Gioteautomatizo</span><strong className="font-serif text-lg sm:text-xl">Negocios cerca de ti</strong><span className="block text-[10px] tracking-wide text-white/60">Tu negocio. Más conectado.</span></span>
          </a>
          <button onClick={openBusinessAccess} className="rounded-xl border border-white/15 px-3 py-2 text-xs font-bold hover:border-[#D6A34A] sm:px-4 sm:text-sm">Acceso para negocios</button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-14">
        <section className="relative overflow-hidden rounded-[2rem] border border-[#D6A34A]/25 bg-gradient-to-br from-[#382317] via-[#211811] to-[#151514] p-6 sm:p-12">
          <div className="relative z-10 max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#D6A34A]/35 bg-black/20 px-3 py-1.5 text-xs font-bold text-[#E8C17A]"><Sparkles className="h-3.5 w-3.5" /> Descubre, elige y pide</span>
            <h1 className="mt-5 font-serif text-4xl font-black leading-tight sm:text-6xl">Tus negocios favoritos,<br/><span className="text-[#D6A34A]">en un solo lugar.</span></h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/75 sm:text-base">Explora restaurantes, conoce sus menús y prepara tu pedido sin crear una cuenta para comenzar.</p>
            <button onClick={() => document.getElementById('negocios')?.scrollIntoView({ behavior: 'smooth' })} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#D6A34A] px-5 py-3 font-black text-[#211811] hover:bg-[#E8C17A]">Explorar negocios <ArrowRight className="h-4 w-4" /></button>
          </div>
          <div className="pointer-events-none absolute -right-12 -top-12 hidden h-72 w-72 rounded-full border border-[#D6A34A]/15 sm:block"><div className="absolute inset-8 rounded-full border border-[#D6A34A]/20"/><div className="absolute inset-16 rounded-full border border-[#D6A34A]/25"/></div>
        </section>

        <section id="negocios" className="scroll-mt-24 pt-10 sm:pt-14">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-xs font-black uppercase tracking-[.2em] text-[#D6A34A]">Directorio público</p><h2 className="mt-2 font-serif text-3xl font-black sm:text-4xl">Explora los negocios</h2><p className="mt-2 text-sm text-white/60">Consulta sus productos y realiza tu pedido directamente.</p></div>
            <div className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar negocio o categoría…" className="w-full rounded-xl border border-white/15 bg-white/5 py-3 pl-10 pr-3 text-sm outline-none focus:border-[#D6A34A]"/></div>
          </div>

          {loading && <div className="py-14 text-center text-sm text-white/60">Cargando negocios publicados…</div>}
          {error && <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-950/20 p-5 text-sm text-red-100">No pudimos cargar todos los negocios ({error}). Si dice permission-denied, faltan publicar las reglas de Firestore.</div>}
          {!loading && !error && visible.length === 0 && <div className="mt-6 rounded-2xl border border-white/10 bg-white/[.03] p-8 text-center"><Store className="mx-auto h-9 w-9 text-[#D6A34A]"/><h3 className="mt-3 text-lg font-bold">{search ? 'No encontramos coincidencias' : 'Estamos preparando el directorio'}</h3><p className="mt-2 text-sm text-white/60">{search ? 'Prueba con otro nombre o categoría.' : 'Pronto aparecerán más negocios. Mientras tanto, puedes registrar el tuyo.'}</p></div>}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((business) => {
              const branding = business.branding;
              return <button key={business.restaurantId} onClick={() => openBusiness(business.restaurantId)} className="group overflow-hidden rounded-2xl border border-white/10 bg-[#191917] text-left transition hover:-translate-y-1 hover:border-[#D6A34A]/60 hover:bg-[#211F1B]">
                <div className="relative flex h-36 items-center justify-center overflow-hidden bg-gradient-to-br from-[#3A2418] to-[#151514]">
                  {branding.coverUrl ? <img src={branding.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70"/> : null}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#191917] to-transparent"/>
                  <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-[#10100F] shadow-xl">{branding.logoUrl ? <img src={branding.logoUrl} alt="" className="h-full w-full object-contain"/> : business.businessType === 'perfumes' ? <ShoppingBag className="h-7 w-7 text-[#D6A34A]"/> : <Utensils className="h-7 w-7 text-[#D6A34A]"/>}</div>
                </div>
                <div className="p-5"><div className="flex items-start justify-between gap-3"><h3 className="font-serif text-xl font-black">{branding.restaurantName || business.restaurantId}</h3><ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#D6A34A] transition group-hover:translate-x-1"/></div>{branding.tagline && <p className="mt-1 text-sm text-[#D6A34A]">{branding.tagline}</p>}<p className="mt-2 line-clamp-2 min-h-10 text-sm text-white/60">{branding.description || 'Conoce el catálogo y consulta los productos disponibles.'}</p>{branding.address && <p className="mt-3 flex items-center gap-1.5 text-xs text-white/45"><MapPin className="h-3.5 w-3.5"/>{branding.address}</p>}<span className="mt-4 inline-flex items-center gap-2 text-xs font-black text-[#E8C17A]">Ver menú y pedir <ArrowRight className="h-3.5 w-3.5"/></span></div>
              </button>;
            })}
          </div>
        </section>

        <section className="mt-12 rounded-3xl border border-[#D6A34A]/25 bg-[#1B1814] p-6 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-8">
          <div><p className="text-xs font-black uppercase tracking-[.2em] text-[#D6A34A]">¿Tienes un negocio?</p><h2 className="mt-2 font-serif text-2xl font-black">Haz que más clientes te encuentren.</h2><p className="mt-2 max-w-xl text-sm text-white/65">Publica tu catálogo y empieza a recibir pedidos con tu propia página.</p></div>
          <button onClick={openRegistration} className="mt-5 inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#D6A34A] px-5 py-3 font-black text-[#211811] hover:bg-[#E8C17A] sm:mt-0">Registrar mi negocio <ArrowRight className="h-4 w-4"/></button>
        </section>
        <footer className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between"><span>© {new Date().getFullYear()} Gioteautomatizo</span><button onClick={openBusinessAccess} className="self-start hover:text-[#D6A34A]">Acceso para negocios</button></footer>
      </main>
    </div>
  );
};
