import React, { useEffect, useMemo, useState } from 'react';
import { Clock, Facebook, Instagram, MapPin, MessageCircle, Minus, Plus, Search, ShoppingBag, Store, X } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { subscribeToBusinessCatalog } from '../../lib/businessCatalogService';
import type { BusinessCatalogItem } from '../../lib/businessCatalogService';
import type { RestaurantTenant } from '../../lib/restaurantCore';
import {
  buildWhatsappOrderUrl,
  cartTotal,
  formatMoney,
  groupVisibleCatalog,
  normalizeWhatsapp,
  safeExternalUrl,
} from '../../lib/businessPublicPage';
import type { PublicCartLine } from '../../lib/businessPublicPage';

/**
 * Página pública de un negocio: lo que ve el cliente al abrir su enlace (#negocio/{id}).
 * No muestra nada administrativo. Usa la identidad del negocio (logo, portada, colores)
 * y envía el pedido por WhatsApp, así que no genera costo.
 */
export const BusinessPublicPage: React.FC<{ businessId: string }> = ({ businessId }) => {
  const [business, setBusiness] = useState<RestaurantTenant | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [items, setItems] = useState<BusinessCatalogItem[]>([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('Todo');
  const [cart, setCart] = useState<PublicCartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    getDoc(doc(db, 'publicBusinessProfiles', businessId))
      .then((snap) => {
        if (cancelled) return;
        if (!snap.exists()) {
          setStatus('missing');
          return;
        }
        if (snap.data().published !== true) {\n          setStatus('missing');\n          return;\n        }\n        setBusiness({\n          restaurantId: businessId,\n          businessType: snap.data().businessType,\n          branding: snap.data().branding,\n          assistant: { name: 'Giobot', plan: 'GIOBOT_BASE', personality: 'AMABLE', enabled: true },\n          features: { publicMenu: true, qrTables: false, pos: false, kitchenStations: false, inventory: false, vip: false, promotions: false, customerAssistant: false, adminAssistant: false, delivery: true, reservations: false },\n        } as RestaurantTenant);
        setStatus('ready');
      })
      .catch((error) => {
        console.error('[BusinessPublicPage] no se pudo abrir el negocio:', error);
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  useEffect(
    () =>
      subscribeToBusinessCatalog(
        businessId,
        (catalog) => {
          setItems(catalog?.items || []);
          setCatalogReady(true);
        },
        () => setCatalogReady(true),
      ),
    [businessId],
  );

  useEffect(() => {
    if (business?.branding.restaurantName) document.title = business.branding.restaurantName;
  }, [business]);

  const groups = useMemo(() => groupVisibleCatalog(items), [items]);
  const categories = useMemo(() => ['Todo', ...groups.map((group) => group.category)], [groups]);

  const visibleGroups = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es-MX');
    return groups
      .filter((group) => activeCategory === 'Todo' || group.category === activeCategory)
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => !term || `${item.name} ${item.description} ${item.category}`.toLocaleLowerCase('es-MX').includes(term),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, activeCategory, search]);

  if (status === 'loading') {
    return <div className="flex min-h-screen items-center justify-center bg-[#111111] text-sm text-[#F7F7F7]">Cargando…</div>;
  }

  if (status !== 'ready' || !business) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#111111] px-6 text-center text-[#F7F7F7]">
        <div>
          <Store className="mx-auto h-10 w-10 text-[#D6A34A]" />
          <h1 className="mt-4 font-serif text-2xl font-black">{status === 'missing' ? 'Este negocio no existe' : 'No pudimos abrir esta página'}</h1>
          <p className="mt-2 text-sm text-[#B7B7B7]">{status === 'missing' ? 'Revisa que el enlace esté completo.' : 'Revisa tu conexión e inténtalo de nuevo.'}</p>
        </div>
      </div>
    );
  }

  const b = business.branding;
  const bg = b.backgroundColor || '#111111';
  const surface = b.surfaceColor || '#1A1A1A';
  const text = b.textColor || '#F7F7F7';
  const primary = b.primaryColor || '#D6A34A';
  const accent = b.accentColor || '#E3BC6B';
  const border = `${accent}55`;

  const instagram = safeExternalUrl(b.instagramUrl);
  const facebook = safeExternalUrl(b.facebookUrl);
  const whatsappNumber = normalizeWhatsapp(b.whatsapp);
  const mapsUrl = b.address ? `https://maps.google.com/?q=${encodeURIComponent(b.address)}` : '';

  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const total = cartTotal(cart);
  const orderUrl = buildWhatsappOrderUrl({ whatsapp: b.whatsapp || '', businessName: b.restaurantName, lines: cart, customerName, notes });

  const add = (item: BusinessCatalogItem) =>
    setCart((current) => {
      const existing = current.find((line) => line.item.id === item.id);
      return existing
        ? current.map((line) => (line.item.id === item.id ? { ...line, quantity: line.quantity + 1 } : line))
        : [...current, { item, quantity: 1 }];
    });

  const change = (id: string, delta: number) =>
    setCart((current) =>
      current.map((line) => (line.item.id === id ? { ...line, quantity: line.quantity + delta } : line)).filter((line) => line.quantity > 0),
    );

  const quantityOf = (id: string) => cart.find((line) => line.item.id === id)?.quantity || 0;

  return (
    <div className="min-h-screen pb-28" style={{ backgroundColor: bg, color: text }}>
      <header className="sticky top-0 z-30 border-b px-4 py-3 backdrop-blur" style={{ borderColor: border, backgroundColor: `${bg}ee` }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white">
              {b.logoUrl ? <img src={b.logoUrl} alt="" className="h-full w-full object-contain" /> : <Store className="h-5 w-5 text-stone-500" />}
            </div>
            <strong className="truncate font-serif text-lg">{b.restaurantName}</strong>
          </div>
          <button type="button" onClick={() => setCartOpen(true)} className="relative flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-black" style={{ backgroundColor: primary, color: bg }}>
            <ShoppingBag className="h-4 w-4" /> Pedido
            {itemCount > 0 && <span className="rounded-full px-1.5 text-xs" style={{ backgroundColor: bg, color: primary }}>{itemCount}</span>}
          </button>
        </div>
      </header>

      <section
        className="relative px-4 py-10 text-center sm:py-14"
        style={{
          backgroundColor: surface,
          backgroundImage: b.coverUrl ? `linear-gradient(0deg, ${bg}f2, ${bg}99), url("${b.coverUrl}")` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="mx-auto max-w-3xl space-y-3">
          <h1 className="font-serif text-3xl font-black leading-tight sm:text-5xl">{b.tagline || b.restaurantName}</h1>
          {b.description && <p className="mx-auto max-w-2xl text-sm opacity-85 sm:text-base">{b.description}</p>}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-xs">
            {b.hoursText && <span className="flex items-center gap-1.5 rounded-full border px-3 py-1.5" style={{ borderColor: border }}><Clock className="h-3.5 w-3.5" style={{ color: accent }} />{b.hoursText}</span>}
            {b.address && <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full border px-3 py-1.5" style={{ borderColor: border }}><MapPin className="h-3.5 w-3.5" style={{ color: accent }} />{b.address}</a>}
            {whatsappNumber && <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full border px-3 py-1.5" style={{ borderColor: border }}><MessageCircle className="h-3.5 w-3.5" style={{ color: accent }} />WhatsApp</a>}
            {instagram && <a href={instagram} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full border px-3 py-1.5" style={{ borderColor: border }}><Instagram className="h-3.5 w-3.5" style={{ color: accent }} />Instagram</a>}
            {facebook && <a href={facebook} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full border px-3 py-1.5" style={{ borderColor: border }}><Facebook className="h-3.5 w-3.5" style={{ color: accent }} />Facebook</a>}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar en el menú…" className="w-full rounded-2xl border py-3 pl-10 pr-4 text-sm outline-none" style={{ borderColor: border, backgroundColor: surface, color: text }} />
        </div>

        {categories.length > 2 && (
          <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {categories.map((category) => (
              <button key={category} type="button" onClick={() => setActiveCategory(category)} className="shrink-0 rounded-full border px-4 py-2 text-xs font-black" style={activeCategory === category ? { backgroundColor: primary, color: bg, borderColor: primary } : { borderColor: border, color: text }}>
                {category}
              </button>
            ))}
          </div>
        )}

        {!catalogReady ? (
          <p className="mt-10 text-center text-sm opacity-70">Cargando el menú…</p>
        ) : groups.length === 0 ? (
          <p className="mt-10 text-center text-sm opacity-70">Este negocio todavía no publica su menú.</p>
        ) : visibleGroups.length === 0 ? (
          <p className="mt-10 text-center text-sm opacity-70">No encontramos productos con esa búsqueda.</p>
        ) : (
          visibleGroups.map((group) => (
            <section key={group.category} className="mt-7">
              <h2 className="mb-3 font-serif text-xl font-black">{group.category}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.items.map((item) => {
                  const quantity = quantityOf(item.id);
                  return (
                    <article key={item.id} className="flex gap-3 overflow-hidden rounded-2xl border p-3" style={{ borderColor: border, backgroundColor: surface }}>
                      {item.imageUrl && <img src={item.imageUrl} alt={item.name} loading="lazy" className="h-24 w-24 shrink-0 rounded-xl object-cover" />}
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-serif text-base font-black leading-snug">{item.name}</h3>
                          <strong className="shrink-0 text-sm" style={{ color: accent }}>{formatMoney(Number(item.price))}</strong>
                        </div>
                        {item.description && <p className="mt-1 line-clamp-3 text-xs opacity-75">{item.description}</p>}
                        <div className="mt-auto flex items-center justify-between pt-2">
                          {item.popular ? <span className="text-[10px] font-black uppercase" style={{ color: accent }}>★ Favorito</span> : <span />}
                          {quantity === 0 ? (
                            <button type="button" onClick={() => add(item)} className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-black" style={{ backgroundColor: primary, color: bg }}><Plus className="h-3.5 w-3.5" /> Agregar</button>
                          ) : (
                            <span className="flex items-center gap-2 rounded-xl border px-1 py-0.5" style={{ borderColor: border }}>
                              <button type="button" aria-label="Quitar uno" onClick={() => change(item.id, -1)} className="rounded-lg p-1.5"><Minus className="h-3.5 w-3.5" /></button>
                              <strong className="min-w-4 text-center text-sm">{quantity}</strong>
                              <button type="button" aria-label="Agregar uno" onClick={() => change(item.id, 1)} className="rounded-lg p-1.5"><Plus className="h-3.5 w-3.5" /></button>
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))
        )}

        <footer className="mt-12 flex items-center justify-between border-t pt-4 text-[11px] opacity-70" style={{ borderColor: border }}>
          <span>Hecho con Gioteautomatizo</span>
          <a href="#business" className="underline">Acceso del negocio</a>
        </footer>
      </main>

      {itemCount > 0 && !cartOpen && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-3">
          <button type="button" onClick={() => setCartOpen(true)} className="mx-auto flex w-full max-w-md items-center justify-between rounded-2xl px-5 py-4 text-sm font-black shadow-xl" style={{ backgroundColor: primary, color: bg }}>
            <span>Ver mi pedido ({itemCount})</span><span>{formatMoney(total)}</span>
          </button>
        </div>
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setCartOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl border p-5 sm:rounded-3xl" style={{ backgroundColor: surface, borderColor: border, color: text }} onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl font-black">Tu pedido</h2>
              <button type="button" aria-label="Cerrar" onClick={() => setCartOpen(false)} className="rounded-lg p-2"><X className="h-5 w-5" /></button>
            </div>

            {cart.length === 0 ? (
              <p className="mt-6 text-center text-sm opacity-70">Aún no agregas productos.</p>
            ) : (
              <>
                <ul className="mt-4 space-y-2">
                  {cart.map((line) => (
                    <li key={line.item.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 flex-1 truncate">{line.item.name}</span>
                      <span className="flex items-center gap-2">
                        <button type="button" aria-label="Quitar uno" onClick={() => change(line.item.id, -1)} className="rounded-lg border p-1" style={{ borderColor: border }}><Minus className="h-3.5 w-3.5" /></button>
                        <strong className="w-5 text-center">{line.quantity}</strong>
                        <button type="button" aria-label="Agregar uno" onClick={() => change(line.item.id, 1)} className="rounded-lg border p-1" style={{ borderColor: border }}><Plus className="h-3.5 w-3.5" /></button>
                      </span>
                      <strong className="w-20 text-right">{formatMoney(Number(line.item.price) * line.quantity)}</strong>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex items-center justify-between border-t pt-3 text-base font-black" style={{ borderColor: border }}>
                  <span>Total</span><span style={{ color: accent }}>{formatMoney(total)}</span>
                </div>

                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Tu nombre (opcional)" className="mt-4 w-full rounded-xl border px-3 py-3 text-sm outline-none" style={{ borderColor: border, backgroundColor: bg, color: text }} />
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas: sin cebolla, para llevar, dirección…" rows={2} className="mt-2 w-full rounded-xl border px-3 py-3 text-sm outline-none" style={{ borderColor: border, backgroundColor: bg, color: text }} />

                {orderUrl ? (
                  <a href={orderUrl} target="_blank" rel="noopener noreferrer" className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-5 py-4 text-sm font-black text-white">
                    <MessageCircle className="h-4 w-4" /> Enviar pedido por WhatsApp
                  </a>
                ) : (
                  <p className="mt-4 rounded-xl border p-3 text-xs" style={{ borderColor: border }}>Este negocio aún no configura su WhatsApp. Muestra este pedido directamente en el local.</p>
                )}
                <button type="button" onClick={() => setCart([])} className="mt-3 w-full text-xs underline opacity-70">Vaciar pedido</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
