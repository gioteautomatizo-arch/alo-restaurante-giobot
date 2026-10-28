import { createBusinessRestaurantOrder } from '../../lib/ordersService';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Award, Clock, Facebook, Instagram, MapPin, MessageCircle, Minus, Plus, Search, ShoppingBag, Sparkles, Store, Utensils, X } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { subscribeToBusinessCatalog } from '../../lib/businessCatalogService';
import type { BusinessCatalogItem } from '../../lib/businessCatalogService';
import type { RestaurantTenant } from '../../lib/restaurantCore';
import {
  buildWhatsappOrderUrl,
  canSubmitPublicCart,
  cartToOrderItems,
  cartTotal,
  formatMoney,
  groupVisibleCatalog,
  normalizeWhatsapp,
  outdatedPublicCartKeys,
  parsePublicTableNumber,
  publicOrderOrigin,
  readPublicTableParam,
  isValidPublicGuestCount,
  safeExternalUrl,
} from '../../lib/businessPublicPage';
import type { PublicCartLine } from '../../lib/businessPublicPage';
import { lineUnitPrice } from '../../lib/businessPublicPage';
import { hasPriceFrom, selectionKey, selectionSummary } from '../../lib/catalogOptions';
import type { OptionSelection } from '../../lib/catalogOptions';
import { PublicOrderReceipts } from './PublicOrderReceipts';
import { addPublicReceipt, readPublicReceipts } from '../../lib/publicOrderReceipts';
import { publicCartAttemptFingerprint, getOrCreatePublicOrderAttemptCoordinated, clearPublicOrderAttempt, discardPublicOrderAttemptAfterReview, PublicOrderAttemptReviewRequiredError } from '../../lib/publicOrderAttempt';
import { BusinessTableWelcome } from './BusinessTableWelcome';
import { BusinessProductModal } from './BusinessProductModal';
import { VipCardModal } from '../VipCardModal';
import { getVipProfile, VIP_DATA_EVENT } from '../../lib/vipStorage';
import type { VipProfile } from '../../types';

/**
 * Página pública de un negocio: lo que ve el cliente al abrir su enlace (#negocio/{id}).
 * No muestra nada administrativo. Usa la identidad del negocio (logo, portada, colores)
 * y envía el pedido por WhatsApp, así que no genera costo.
 */
const BusinessPublicPageContent: React.FC<{ businessId: string; tableParam: string | null }> = ({ businessId, tableParam }) => {
  const tableNumber = parsePublicTableNumber(tableParam);
  const [guestCount, setGuestCount] = useState<number | null>(null);
  const [tableConfirmed, setTableConfirmed] = useState(false);
  const [sentReceipts, setSentReceipts] = useState(() => readPublicReceipts(businessId, tableNumber));
  const sendInFlight = useRef(false);
  const [profileAttempt, setProfileAttempt] = useState(0);
  const [business, setBusiness] = useState<RestaurantTenant | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [items, setItems] = useState<BusinessCatalogItem[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const catalogReady = catalogStatus === 'ready';
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('Todo');
  const [cart, setCart] = useState<PublicCartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<BusinessCatalogItem | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [sentCode, setSentCode] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [attemptNeedsReview, setAttemptNeedsReview] = useState(false);

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
        if (snap.data().published !== true) {
          setStatus('missing');
          return;
        }
        setBusiness({
          restaurantId: businessId,
          businessType: snap.data().businessType,
          branding: snap.data().branding,
          assistant: { name: 'Giobot', plan: 'GIOBOT_BASE', personality: 'AMABLE', enabled: true },
          features: { publicMenu: true, qrTables: false, pos: false, kitchenStations: false, inventory: false, vip: false, promotions: false, customerAssistant: false, adminAssistant: false, delivery: true, reservations: false },
        } as RestaurantTenant);
        setStatus('ready');
      })
      .catch((error) => {
        console.error('[BusinessPublicPage] no se pudo abrir el negocio:', error);
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, profileAttempt]);

  useEffect(() => {
    let active = true;
    setCatalogStatus('loading');
    setItems([]);
    const unsubscribe = subscribeToBusinessCatalog(
      businessId,
      (catalog) => {
        if (!active) return;
        setItems(catalog?.items || []);
        setCatalogStatus('ready');
      },
      () => {
        if (!active) return;
        setItems([]);
        setCatalogStatus('error');
      },
    );
    return () => { active = false; unsubscribe(); };
  }, [businessId, catalogAttempt]);

  useEffect(() => {
    if (business?.branding.restaurantName) document.title = business.branding.restaurantName;
  }, [business]);

  const groups = useMemo(() => groupVisibleCatalog(items), [items]);
  const categories = useMemo(() => ['Todo', ...groups.map((group) => group.category)], [groups]);
  const outdatedCartKeys = useMemo(
    () => catalogReady ? outdatedPublicCartKeys(cart, items) : [],
    [catalogReady, cart, items],
  );
  const cartCanSend = canSubmitPublicCart(catalogStatus, cart.length, sending) && outdatedCartKeys.length === 0;

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

  const vipEnabled = !!business?.branding?.vipEnabled;
  const [vipOpen, setVipOpen] = useState(false);
  const [vipProfile, setVipProfile] = useState<VipProfile | null>(null);
  useEffect(() => {
    if (!vipEnabled) return;
    const sync = () => setVipProfile(getVipProfile(businessId));
    sync();
    window.addEventListener(VIP_DATA_EVENT, sync);
    return () => {
      window.removeEventListener(VIP_DATA_EVENT, sync);
    };
  }, [businessId, vipEnabled]);

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
          {status === 'error' && <button type="button" onClick={() => setProfileAttempt((attempt) => attempt + 1)} className="mt-5 rounded-xl bg-[#D6A34A] px-5 py-3 text-sm font-bold text-black">Reintentar</button>}
          <a href="/#explorar" className="mt-4 block text-sm underline">Explorar otros negocios</a>
        </div>
      </div>
    );
  }

  if (tableParam !== null && tableNumber === undefined) {
    return <main className="flex min-h-screen items-center justify-center bg-[#111111] px-6 text-center text-white"><div role="alert"><h1 className="text-2xl font-bold">El QR no tiene una mesa válida</h1><p className="mt-3">Pide al personal el QR correcto de tu mesa.</p><a href="/#explorar" className="mt-5 block underline">Explorar negocios</a></div></main>;
  }
  if (tableNumber && !tableConfirmed) {
    return <BusinessTableWelcome businessName={business.branding.restaurantName} tableNumber={tableNumber} guestCount={guestCount} onGuestCount={setGuestCount} onContinue={() => { if (isValidPublicGuestCount(guestCount)) setTableConfirmed(true); }} />;
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
  const orderNotes = [tableNumber && isValidPublicGuestCount(guestCount) ? `${guestCount} ${guestCount === 1 ? 'persona' : 'personas'}` : '', notes.trim()].filter(Boolean).join(' · ');

  // Registra el pedido en Pedidos y Caja del negocio y, si hay WhatsApp, abre el chat con el código.
  const sendOrder = async () => {
    if (sendInFlight.current || !cartCanSend || (tableNumber && (!tableConfirmed || !isValidPublicGuestCount(guestCount)))) return;
    // Bloqueo síncrono: cubre pulsaciones antes del siguiente render de React.
    sendInFlight.current = true;
    setSending(true);
    setSendError(null);
    setAttemptNeedsReview(false);
    let popup: Window | null = null;
    let code: string | undefined;
    let attemptedWrite = false;
    try {
      // Abrir con el gesto del usuario, ANTES de esperar el Web Lock.
      // Nunca navegar con WhatsApp si Firestore no devuelve un folio.
      try { popup = whatsappNumber ? window.open('', '_blank') : null; } catch { /* WhatsApp es opcional. */ }
      // Coordinar la creación inicial del ID entre pestañas cuando Web Locks existe.
      // Persistir y comprobar la referencia ANTES de enviar a Firestore.
      const attemptId = await getOrCreatePublicOrderAttemptCoordinated(
        businessId, tableNumber, publicCartAttemptFingerprint(cart, guestCount),
      );
      attemptedWrite = true;
      const saved = await createBusinessRestaurantOrder(businessId, {
        orderType: 'pickup',
        orderSource: 'CLIENTE_QR',
        ...publicOrderOrigin(tableNumber),
        customerName: customerName.trim() || 'Cliente web',
        paymentMethod: 'efectivo',
        bringOwnContainer: false,
        items: cartToOrderItems(cart),
        subtotal: total,
        discountAmount: 0,
        deliveryFee: 0,
        total,
        notes: [tableNumber ? `Mesa ${tableNumber}` : '', orderNotes].filter(Boolean).join(' · ') || undefined,
      }, attemptId);
      code = saved.code;
      setSentReceipts((current) => addPublicReceipt(current, {
        id: saved.id || saved.code,
        businessId,
        ...(tableNumber ? { tableNumber, guestCount: guestCount! } : {}),
        code: saved.code,
        sentAt: new Date().toISOString(),
        total,
        items: cartToOrderItems(cart).map(({ name, quantity, totalPrice, customizationSummary }) => ({ name, quantity, totalPrice, ...(customizationSummary ? { customizationSummary } : {}) })),
      }));
      setSentCode(saved.code);
      setCart([]);
      clearPublicOrderAttempt(businessId, tableNumber, attemptId);
      setAttemptNeedsReview(false);
    } catch (err) {
      console.warn('No se pudo registrar el pedido en el negocio:', err);
      if (err instanceof PublicOrderAttemptReviewRequiredError) {
        setAttemptNeedsReview(true);
        setSendError(err.message);
      } else {
        setSendError(!attemptedWrite
          ? 'No pudimos preparar el envío seguro en este navegador. Conservamos tu pedido; revisa el almacenamiento antes de intentarlo de nuevo.'
          : whatsappNumber
            ? 'No pudimos confirmar el registro. Conservamos tu pedido; antes de reenviarlo, consulta al negocio por WhatsApp para evitar duplicados.'
            : 'No pudimos confirmar el registro. Conservamos tu pedido; antes de reenviarlo, consulta al negocio para evitar duplicados.');
      }
    } finally {
      sendInFlight.current = false;
      setSending(false);
    }
    if (whatsappNumber && code) {
      const url = buildWhatsappOrderUrl({ whatsapp: b.whatsapp || '', businessName: b.restaurantName, lines: cart, customerName, notes: orderNotes, tableNumber, orderCode: code });
      if (popup) popup.location.href = url;
      else window.open(url, '_blank');
    } else if (popup) popup.close();
  };

  const startNewAttemptAfterReview = () => {
    if (sendInFlight.current) return;
    if (!window.confirm('Confirma que ya consultaste al negocio sobre el pedido anterior. Si ya fue recibido, enviar uno nuevo puede duplicarlo. ¿Iniciar otro intento?')) return;
    try {
      discardPublicOrderAttemptAfterReview(businessId, tableNumber);
      setAttemptNeedsReview(false);
      setSendError('Se descartó el intento anterior después de tu confirmación. Revisa tu carrito antes de enviar un pedido nuevo.');
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'No se pudo iniciar un nuevo intento seguro.');
    }
  };

  const add = (item: BusinessCatalogItem, selection: OptionSelection = {}, quantity = 1) =>
    setCart((current) => {
      if (sendInFlight.current) return current;
      const key = selectionKey(item.id, item, selection);
      const existing = current.find((line) => line.key === key);
      return existing
        ? current.map((line) => (line.key === key ? { ...line, quantity: line.quantity + quantity } : line))
        : [...current, { key, item, quantity, selection }];
    });

  const change = (key: string, delta: number) =>
    setCart((current) =>
      sendInFlight.current ? current : current.map((line) => (line.key === key ? { ...line, quantity: line.quantity + delta } : line)).filter((line) => line.quantity > 0),
    );

  const quantityOf = (id: string) => cart.filter((line) => line.item.id === id).reduce((sum, line) => sum + line.quantity, 0);
  const theme = { bg, surface, text, primary, accent, border };

  const renderCard = (item: BusinessCatalogItem) => {
    const quantity = quantityOf(item.id);
    const customizable = (item.optionGroups || []).length > 0;
    return (
      <article key={item.id} onClick={() => { if (!sendInFlight.current) setSelectedItem(item); }} className="flex cursor-pointer flex-col overflow-hidden rounded-2xl border transition active:scale-[0.99]" style={{ borderColor: border, backgroundColor: surface }}>
        <div className="relative aspect-[4/3] w-full overflow-hidden" style={{ backgroundColor: bg }}>
          {item.imageUrl ? (
            <img src={item.imageUrl} alt={item.name} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center" style={{ background: `linear-gradient(135deg, ${surface}, ${bg})` }}>
              <span className="flex h-11 w-11 items-center justify-center rounded-full border" style={{ borderColor: border }}><Utensils className="h-5 w-5" style={{ color: accent }} /></span>
            </div>
          )}
          {item.popular && <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase" style={{ backgroundColor: primary, color: bg }}><Sparkles className="h-2.5 w-2.5" /> Favorito</span>}
          {quantity > 0 && <span className="absolute right-2 top-2 rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-black text-white">En pedido: {quantity}</span>}
          <span className="absolute bottom-2 right-2 rounded-xl bg-black/80 px-2.5 py-1 font-serif text-xs font-black text-white">
            {formatMoney(Number(item.price))}{hasPriceFrom(item) && <span className="font-sans text-[9px] font-normal opacity-80"> (desde)</span>}
          </span>
        </div>
        <div className="flex flex-1 flex-col p-3">
          <h3 className="font-serif text-sm font-black leading-snug">{item.name}</h3>
          {item.description && <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed opacity-75">{item.description}</p>}
          <button
            type="button"
            disabled={sending}
            onClick={(event) => { event.stopPropagation(); if (sendInFlight.current) return; if (customizable) setSelectedItem(item); else add(item); }}
            className="mt-auto flex w-full items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-black"
            style={{ backgroundColor: primary, color: bg, marginTop: '0.75rem' }}
          >
            <Plus className="h-3.5 w-3.5" /> {customizable ? 'Agregar / Personalizar' : 'Agregar'}
          </button>
        </div>
      </article>
    );
  };

  const starItems = groups.flatMap((group) => group.items).filter((item) => item.popular);

  return (
    <div className="min-h-screen pb-28" style={{ backgroundColor: bg, color: text }}>
      {tableNumber && <section aria-label="Tu mesa" className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-[#D6A34A] px-4 py-3 text-sm font-bold text-black"><span>Mesa {tableNumber} · {guestCount} {guestCount === 1 ? 'persona' : 'personas'}</span><button type="button" disabled={sending} onClick={() => { if (!sendInFlight.current) setTableConfirmed(false); }} className="rounded-lg border border-black/30 px-3 py-2 text-xs disabled:opacity-40">Cambiar personas</button></section>}
      <header className="border-b px-4 py-3" style={{ borderColor: border, backgroundColor: surface }}>
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow">
              {b.logoUrl ? <img src={b.logoUrl} alt={b.restaurantName} className="h-full w-full object-contain" /> : <Store className="h-6 w-6 text-stone-500" />}
            </div>
            <div className="min-w-0">
              <strong className="block truncate font-serif text-lg leading-tight">{b.restaurantName}</strong>
              {b.hoursText && <span className="mt-0.5 flex items-center gap-1 text-[11px] opacity-85"><Clock className="h-3 w-3 shrink-0" style={{ color: accent }} /><span className="truncate">{b.hoursText}</span></span>}
              {b.address && <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="mt-0.5 flex items-center gap-1 text-[11px] opacity-85"><MapPin className="h-3 w-3 shrink-0" style={{ color: accent }} /><span className="truncate">{b.address}</span></a>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {whatsappNumber && <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="flex h-9 w-9 items-center justify-center rounded-xl border" style={{ borderColor: border }}><MessageCircle className="h-4 w-4" style={{ color: accent }} /></a>}
            {instagram && <a href={instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="flex h-9 w-9 items-center justify-center rounded-xl border" style={{ borderColor: border }}><Instagram className="h-4 w-4" style={{ color: accent }} /></a>}
            {facebook && <a href={facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="flex h-9 w-9 items-center justify-center rounded-xl border" style={{ borderColor: border }}><Facebook className="h-4 w-4" style={{ color: accent }} /></a>}
            <button type="button" onClick={() => setCartOpen(true)} className="relative flex h-9 items-center gap-2 rounded-xl px-3 text-sm font-black" style={{ backgroundColor: primary, color: bg }}>
              <ShoppingBag className="h-4 w-4" /> Pedidos
              {itemCount > 0 && <span className="rounded-full px-1.5 text-xs" style={{ backgroundColor: bg, color: primary }}>{itemCount}</span>}
            </button>
          </div>
        </div>
      </header>

      <section
        className="relative px-4 py-12 text-center sm:py-16"
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
        </div>
      </section>

      {b.vipEnabled && (
        <section className="mx-auto max-w-5xl px-4 pt-6">
          <button
            type="button"
            onClick={() => setVipOpen(true)}
            className="flex w-full items-center gap-4 rounded-2xl border p-4 text-left"
            style={{ borderColor: primary, background: `linear-gradient(135deg, ${surface}, ${bg})` }}
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: primary, color: bg }}><Award className="h-6 w-6" /></span>
            <span className="min-w-0 flex-1">
              <strong className="block font-serif text-lg font-black">{b.loyaltyProgramName || `${b.restaurantName} VIP`}</strong>
              <span className="block text-xs opacity-80">
                {vipProfile ? `Tu tarjeta: ${vipProfile.stamps} / ${b.vipStampsRequired || 5} sellos${vipProfile.rewardAvailable ? ' · ¡Premio listo!' : ''}` : `Junta ${b.vipStampsRequired || 5} sellos${b.vipRewardDescription ? ` y gana: ${b.vipRewardDescription}` : ' y gana un premio'}.`}
              </span>
            </span>
            <span className="shrink-0 rounded-xl px-3 py-2 text-xs font-black" style={{ backgroundColor: primary, color: bg }}>{vipProfile ? 'Ver mi tarjeta' : 'Obtener tarjeta'}</span>
          </button>
        </section>
      )}

      <main className="mx-auto max-w-5xl px-4 py-6">
        {catalogReady && starItems.length > 0 && (
          <section>
            <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide" style={{ color: accent }}><Sparkles className="h-3.5 w-3.5" /> Favoritos de {b.restaurantName}</p>
            <h2 className="mt-1 font-serif text-2xl font-black">Platillos estrella</h2>
            <div className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-2">
              {starItems.map((item) => <div key={item.id} className="flex w-44 shrink-0 flex-col sm:w-52">{renderCard(item)}</div>)}
            </div>
          </section>
        )}

        <h2 className={`font-serif text-2xl font-black ${catalogReady && starItems.length > 0 ? 'mt-8' : ''}`}>Carta completa</h2>
        <div className="relative mt-3">
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

        {catalogStatus === 'error' ? (
          <div role="alert" className="mt-8 rounded-xl border border-amber-500/40 p-4 text-sm" style={{ backgroundColor: surface, color: text }}>
            <p className="font-bold">No pudimos cargar el menú de este negocio.</p>
            <p className="mt-1 opacity-80">Puede ser un problema de conexión o permisos. No significa que el negocio haya eliminado sus productos.</p>
            <button type="button" onClick={() => setCatalogAttempt((attempt) => attempt + 1)} className="mt-3 rounded-lg border px-4 py-2 text-xs font-bold" style={{ borderColor: primary }}>
              Reintentar carga del menú
            </button>
          </div>
        ) : !catalogReady ? (
          <p role="status" className="mt-10 text-center text-sm opacity-70">Cargando el menú…</p>
        ) : groups.length === 0 ? (
          <p className="mt-10 text-center text-sm opacity-70">Este negocio todavía no publica su menú.</p>
        ) : visibleGroups.length === 0 ? (
          <p className="mt-10 text-center text-sm opacity-70">No encontramos productos con esa búsqueda.</p>
        ) : (
          visibleGroups.map((group) => (
            <section key={group.category} className="mt-7">
              <h2 className="mb-3 font-serif text-xl font-black">{group.category}</h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                {group.items.map((item) => renderCard(item))}
              </div>
            </section>
          ))
        )}

        <footer className="mt-12 flex items-center justify-between border-t pt-4 text-[11px] opacity-70" style={{ borderColor: border }}>
          <span>Hecho con Gioteautomatizo</span>
          <a href="#business" className="underline">Acceso del negocio</a>
        </footer>
      </main>

      {b.vipEnabled && (
        <VipCardModal
          isOpen={vipOpen}
          onClose={() => setVipOpen(false)}
          onOpenCart={() => { setVipOpen(false); setCartOpen(true); }}
          vipProfile={vipProfile}
          onProfileUpdated={() => setVipProfile(getVipProfile(businessId))}
          businessId={businessId}
          vipConfig={{ programName: b.loyaltyProgramName || `${b.restaurantName} VIP`, stampsRequired: b.vipStampsRequired || 5, rewardDescription: b.vipRewardDescription, businessName: b.restaurantName }}
        />
      )}

      {itemCount > 0 && !cartOpen && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-3">
          <button type="button" onClick={() => setCartOpen(true)} className="mx-auto flex w-full max-w-md items-center justify-between rounded-2xl px-5 py-4 text-sm font-black shadow-xl" style={{ backgroundColor: primary, color: bg }}>
            <span>Ver mi pedido ({itemCount})</span><span>{formatMoney(total)}</span>
          </button>
        </div>
      )}

      {selectedItem && (
        <BusinessProductModal item={selectedItem} theme={theme} onClose={() => setSelectedItem(null)} onAdd={(selection, quantity) => { add(selectedItem, selection, quantity); setSelectedItem(null); }} />
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setCartOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl border p-5 sm:rounded-3xl" style={{ backgroundColor: surface, borderColor: border, color: text }} onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl font-black">Mis pedidos</h2>
              <button type="button" aria-label="Cerrar" onClick={() => setCartOpen(false)} className="rounded-lg p-2"><X className="h-5 w-5" /></button>
            </div>

            {sendError && (
              <p role="alert" className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm" style={{ color: text }}>
                {sendError}
              </p>
            )}
            {attemptNeedsReview && (
              <button type="button" disabled={sending} onClick={startNewAttemptAfterReview} className="mt-3 w-full rounded-xl border border-amber-500/50 px-3 py-3 text-sm font-bold disabled:opacity-60">
                Ya consulté al negocio; iniciar pedido nuevo
              </button>
            )}
            {!catalogReady && (
              <p role="alert" className="mt-4 rounded-xl border border-amber-500/40 p-3 text-sm" style={{ color: text }}>
                El menú aún no está disponible. Para evitar pedidos con datos incompletos, espera a que cargue o vuelve a intentarlo.
              </p>
            )}
            {catalogReady && outdatedCartKeys.length > 0 && (
              <div role="alert" className="mt-4 rounded-xl border border-amber-500/40 p-3 text-sm" style={{ backgroundColor: bg, color: text }}>
                <p className="font-bold">El menú cambió mientras preparabas tu pedido.</p>
                <p className="mt-1 opacity-85">{outdatedCartKeys.length} producto(s) ya no coinciden con sus precios, disponibilidad u opciones actuales. Revisa y vuelve a elegirlos antes de enviar.</p>
                <button
                  type="button"
                  disabled={sending} onClick={() => setCart((current) => {
                    if (sendInFlight.current) return current;
                    const obsolete = new Set(outdatedPublicCartKeys(current, items));
                    return current.filter((line) => !obsolete.has(line.key));
                  })}
                  className="mt-3 rounded-lg border px-4 py-2 text-xs font-bold"
                  style={{ borderColor: primary }}
                >
                  Quitar los productos que cambiaron
                </button>
              </div>
            )}

            {cart.length > 0 && <h3 className="mt-4 font-bold">Carrito · Por enviar</h3>}
            {cart.length === 0 ? (
              sentCode ? (
                <div className="mt-6 text-center">
                  <p className="font-serif text-lg font-black" style={{ color: accent }}>¡Pedido enviado!</p>
                  <p className="mt-1 text-sm">Tu código es <strong>{sentCode}</strong>. El negocio ya lo recibió.</p>
                  <button type="button" onClick={() => { setSentCode(null); setCartOpen(false); }} className="mt-4 rounded-xl border px-4 py-2 text-xs font-bold" style={{ borderColor: border }}>Seguir viendo el menú</button>
                </div>
              ) : (
                <p className="mt-6 text-center text-sm opacity-70">{sentReceipts.length ? 'Tus pedidos enviados aparecen abajo. Puedes seguir agregando productos al carrito.' : 'Aún no agregas productos.'}</p>
              )
            ) : (
              <>
                <ul className="mt-4 space-y-2">
                  {cart.map((line) => (
                    <li key={line.key} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{line.item.name}</span>
                        {selectionSummary(line.item, line.selection || {}) && <span className="block text-[11px] opacity-70">{selectionSummary(line.item, line.selection || {})}</span>}
                      </span>
                      <span className="flex items-center gap-2">
                        <button type="button" disabled={sending} aria-label="Quitar uno" onClick={() => change(line.key, -1)} className="rounded-lg border p-1" style={{ borderColor: border }}><Minus className="h-3.5 w-3.5" /></button>
                        <strong className="w-5 text-center">{line.quantity}</strong>
                        <button type="button" disabled={sending} aria-label="Agregar uno" onClick={() => change(line.key, 1)} className="rounded-lg border p-1" style={{ borderColor: border }}><Plus className="h-3.5 w-3.5" /></button>
                      </span>
                      <strong className="w-20 text-right">{formatMoney(lineUnitPrice(line) * line.quantity)}</strong>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex items-center justify-between border-t pt-3 text-base font-black" style={{ borderColor: border }}>
                  <span>Total</span><span style={{ color: accent }}>{formatMoney(total)}</span>
                </div>

                <input disabled={sending} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Tu nombre (opcional)" className="mt-4 w-full rounded-xl border px-3 py-3 text-sm outline-none" style={{ borderColor: border, backgroundColor: bg, color: text }} />
                <textarea disabled={sending} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas: sin cebolla, para llevar, dirección…" rows={2} className="mt-2 w-full rounded-xl border px-3 py-3 text-sm outline-none" style={{ borderColor: border, backgroundColor: bg, color: text }} />

                <button type="button" disabled={!cartCanSend} onClick={() => void sendOrder()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-sm font-black disabled:opacity-60" style={{ backgroundColor: whatsappNumber ? '#25D366' : primary, color: whatsappNumber ? '#fff' : bg }}>
                  <MessageCircle className="h-4 w-4" /> {sending ? 'Enviando…' : whatsappNumber ? 'Enviar pedido (se registra y abre WhatsApp)' : 'Enviar pedido al negocio'}
                </button>
                <button type="button" disabled={sending} onClick={() => { if (!sendInFlight.current) setCart([]); }} className="mt-3 w-full text-xs underline opacity-70">Vaciar pedido</button>
              </>
            )}
            <PublicOrderReceipts receipts={sentReceipts} />
          </div>
        </div>
      )}
    </div>
  );
};

// React remonta toda la vista (incluyendo carrito, cliente y suscripciones)
// cuando cambia el negocio, evitando que un carrito ajeno se envíe al tenant nuevo.
export const BusinessPublicPage: React.FC<{ businessId: string }> = ({ businessId }) => {
  const tableParam = readPublicTableParam(window.location.search, window.location.hash);
  return <BusinessPublicPageContent key={`${businessId}:${tableParam ?? 'menu'}`} businessId={businessId} tableParam={tableParam} />;
};
