import React, { useState, useEffect, useRef } from 'react';
import { MENU_ITEMS } from './data/menu';
import { MenuItem, CategoryId, CartItem, VipProfile } from './types';
import { getVipProfile } from './lib/vipStorage';
import { Header } from './components/Header';
import { Banner } from './components/Banner';
import { SearchBar } from './components/SearchBar';
import { QuickActions } from './components/QuickActions';
import { DailyHighlights } from './components/DailyHighlights';
import { EcoPromoCard } from './components/EcoPromoCard';
import { CategoryFilter } from './components/CategoryFilter';
import { MenuItemCard } from './components/MenuItemCard';
import { ItemModal } from './components/ItemModal';
import { EnsaladaBuilder } from './components/EnsaladaBuilder';
import { ComidaCorridaBuilder } from './components/ComidaCorridaBuilder';
import { GiobotChat } from './components/GiobotChat';
import { CartDrawer } from './components/CartDrawer';
import { VipCardModal } from './components/VipCardModal';
import { PersistentCartBar } from './components/PersistentCartBar';
import { BottomNav } from './components/BottomNav';
import { Footer } from './components/Footer';
import { Bot, Utensils, Sparkles, ArrowRight, ChevronUp } from 'lucide-react';

export default function App() {
  const [activeCategory, setActiveCategory] = useState<CategoryId>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showAllCatalog, setShowAllCatalog] = useState<boolean>(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [isSaladBuilderOpen, setIsSaladBuilderOpen] = useState<boolean>(false);
  const [isComidaCorridaBuilderOpen, setIsComidaCorridaBuilderOpen] = useState<boolean>(false);
  const [isGiobotOpen, setIsGiobotOpen] = useState<boolean>(false);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isVipModalOpen, setIsVipModalOpen] = useState<boolean>(false);
  const [bringOwnContainer, setBringOwnContainer] = useState<boolean>(false);
  const [vipProfile, setVipProfile] = useState<VipProfile | null>(null);
  const [isContactVisible, setIsContactVisible] = useState<boolean>(false);

  const menuSectionRef = useRef<HTMLDivElement>(null);

  const refreshVipProfile = () => {
    setVipProfile(getVipProfile());
  };

  useEffect(() => {
    refreshVipProfile();
  }, []);

  // Observe the #contacto footer section to hide FAB when footer is in view
  useEffect(() => {
    const contactEl = document.getElementById('contacto');
    if (!contactEl) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsContactVisible(entry.isIntersecting);
      },
      {
        root: null,
        threshold: 0.05,
      }
    );

    observer.observe(contactEl);
    return () => {
      observer.disconnect();
    };
  }, []);

  // Cart operations
  const handleAddToCart = (item: CartItem) => {
    setCartItems((prev) => [...prev, item]);
  };

  const handleUpdateQuantity = (cartId: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveItem(cartId);
      return;
    }
    setCartItems((prev) =>
      prev.map((i) =>
        i.cartId === cartId
          ? { ...i, quantity: newQty, totalPrice: i.unitPrice * newQty }
          : i
      )
    );
  };

  const handleRemoveItem = (cartId: string) => {
    setCartItems((prev) => prev.filter((i) => i.cartId !== cartId));
  };

  const handleClearCart = () => {
    setCartItems([]);
  };

  const scrollToMenu = () => {
    const el = document.getElementById('menu-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToContact = () => {
    const el = document.getElementById('contacto');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleCategorySelect = (catId: CategoryId) => {
    setActiveCategory(catId);
    setShowAllCatalog(true);
    scrollToMenu();
  };

  // Filter menu items
  const rawFilteredItems = MENU_ITEMS.filter((item) => {
    const matchesCategory =
      activeCategory === 'all' || item.category === activeCategory;

    const query = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !query ||
      item.name.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      (item.options && item.options.some((o) => o.toLowerCase().includes(query)));

    return matchesCategory && matchesSearch;
  });

  // Check if we should slice to 12 items (initial state on 'all' without search and showAllCatalog=false)
  const isInitialCatalogView = activeCategory === 'all' && !searchTerm.trim() && !showAllCatalog;
  const displayedItems = isInitialCatalogView ? rawFilteredItems.slice(0, 12) : rawFilteredItems;

  const cartTotalCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <div id="inicio" className="min-h-screen bg-[#faf8f5] text-stone-900 font-sans flex flex-col selection:bg-[#c4974f]/30 selection:text-[#14281d] pb-16 sm:pb-0">
      {/* 1. Header (Compact, Dynamic Status, Socials, VIP, Cart) */}
      <Header
        cartCount={cartTotalCount}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenVipModal={() => setIsVipModalOpen(true)}
        vipProfile={vipProfile}
      />

      {/* 2. Hero Banner Bistró Mexicano Contemporáneo */}
      <Banner
        onOpenGiobot={() => setIsGiobotOpen(true)}
        onOpenComidaCorrida={() => setIsComidaCorridaBuilderOpen(true)}
        onOpenEnsalada={() => setIsSaladBuilderOpen(true)}
        onScrollToMenu={scrollToMenu}
      />

      {/* Top Application Flow Area (Mobile First Hub) */}
      <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-3.5 sm:py-5 w-full space-y-3 sm:space-y-4">
        {/* 2. Search Bar */}
        <SearchBar
          searchTerm={searchTerm}
          setSearchTerm={(term) => {
            setSearchTerm(term);
            if (term) setShowAllCatalog(true);
          }}
        />

        {/* 3. Primary Actions (3 tactile buttons: Ver menú, Pedir a domicilio, Preguntar a Giobot) */}
        <QuickActions
          onScrollToMenu={scrollToMenu}
          onOpenDeliveryOrder={() => setIsCartOpen(true)}
          onOpenGiobot={() => setIsGiobotOpen(true)}
        />

        {/* 4. Daily Highlights */}
        <DailyHighlights
          onOpenComidaCorrida={() => setIsComidaCorridaBuilderOpen(true)}
          onOpenSaladBuilder={() => setIsSaladBuilderOpen(true)}
          onSelectCategory={handleCategorySelect}
        />

        {/* 9. Eco Promotion Banner */}
        <EcoPromoCard
          bringOwnContainer={bringOwnContainer}
          setBringOwnContainer={setBringOwnContainer}
        />
      </div>

      {/* 5. Sticky Category Navigation Bar */}
      <CategoryFilter
        activeCategory={activeCategory}
        onSelectCategory={(cat) => {
          setActiveCategory(cat);
          setShowAllCatalog(true);
        }}
      />

      {/* 6. Products Catalog Section */}
      <main id="menu-section" ref={menuSectionRef} className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-5 sm:py-7 flex-1 w-full space-y-4 sm:space-y-6">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-2xl font-serif font-black text-stone-900 flex items-center gap-2">
              {activeCategory === 'all'
                ? isInitialCatalogView
                  ? 'Selección de Platillos Recomendados'
                  : 'Catálogo Completo (61 Platillos)'
                : activeCategory === 'desayunos'
                ? 'Desayunos & Paquetes'
                : activeCategory === 'bebidas'
                ? 'Café Caliente & Infusiones'
                : activeCategory === 'frios-frappes'
                ? 'Bebidas Frías & Frappés'
                : activeCategory === 'jugos-licuados'
                ? 'Jugos Naturales & Licuados'
                : activeCategory === 'comida-corrida'
                ? 'Comida Corrida de 3 Tiempos'
                : activeCategory === 'ensaladas'
                ? 'Ensaladas Frescas'
                : activeCategory === 'chapatas-sandwiches'
                ? 'Chapatas & Sandwiches'
                : activeCategory === 'hamburguesas'
                ? 'Hamburguesas'
                : activeCategory === 'tortas-molletes'
                ? 'Tortas & Molletes'
                : activeCategory === 'antojitos'
                ? 'Antojitos Mexicanos'
                : activeCategory === 'especialidades'
                ? 'Especialidades de la Casa'
                : activeCategory === 'panaderia'
                ? 'Postres & Panadería'
                : 'Especial de Fin de Semana'}
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              {isInitialCatalogView
                ? 'Mostrando 12 opciones populares de nuestra carta de 61 platillos'
                : `${displayedItems.length} ${displayedItems.length === 1 ? 'platillo disponible' : 'platillos disponibles'}`}
            </p>
          </div>

          {/* Quick builder triggers if on specific categories */}
          {(activeCategory === 'all' || activeCategory === 'ensaladas' || activeCategory === 'comida-corrida') && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsComidaCorridaBuilderOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-[#f4efe6] hover:bg-[#ebdcc8] text-[#8f6b2f] font-bold text-xs border border-[#c4974f]/40 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Utensils className="w-3.5 h-3.5 text-[#8f6b2f]" />
                <span>Armar Corrida ($90)</span>
              </button>
              <button
                onClick={() => setIsSaladBuilderOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold text-xs border border-emerald-300/60 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                <span>Armar Ensalada ($90)</span>
              </button>
            </div>
          )}
        </div>

        {/* Product Cards Grid */}
        {displayedItems.length > 0 ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-4">
              {displayedItems.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  onSelectItem={(itemToSelect) => {
                    if (itemToSelect.id === 'arma-ensalada') {
                      setIsSaladBuilderOpen(true);
                    } else if (itemToSelect.id === 'comida-corrida') {
                      setIsComidaCorridaBuilderOpen(true);
                    } else {
                      setSelectedItem(itemToSelect);
                    }
                  }}
                />
              ))}
            </div>

            {/* "Ver los 61 platillos" Action Button when in initial 12 items view */}
            {isInitialCatalogView && (
              <div className="py-6 px-4 rounded-3xl bg-gradient-to-br from-[#14281d] via-[#1a3424] to-[#102017] text-[#faf8f5] text-center border border-[#c4974f]/40 shadow-md space-y-3">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#c4974f]/20 text-[#e6caa0] text-xs font-semibold border border-[#c4974f]/30">
                  <Sparkles className="w-3.5 h-3.5 text-[#c4974f]" />
                  <span>Carta Gastronómica Completa</span>
                </div>
                <h3 className="text-lg sm:text-xl font-serif font-bold text-[#faf8f5]">
                  ¿Quieres explorar todo lo que preparamos para ti?
                </h3>
                <p className="text-xs sm:text-sm text-stone-300 max-w-md mx-auto font-light">
                  Descubre chapatas, hamburguesas, antojitos mexicanos, bebidas frías, frappés, café de grano y postres artesanales.
                </p>
                <div>
                  <button
                    onClick={() => {
                      setShowAllCatalog(true);
                      scrollToMenu();
                    }}
                    className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-[#c4974f] to-[#b5883d] hover:from-[#d6aa5f] hover:to-[#c4974f] text-[#14281d] font-bold text-sm sm:text-base shadow-lg hover:shadow-xl transition-all active:scale-98 cursor-pointer"
                  >
                    <span>Ver los 61 platillos</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Collapse button if user opened all 61 platillos and is on 'all' category */}
            {activeCategory === 'all' && !searchTerm && showAllCatalog && (
              <div className="text-center pt-2">
                <button
                  onClick={() => {
                    setShowAllCatalog(false);
                    scrollToMenu();
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-[#faf8f5] text-stone-700 text-xs font-semibold border border-[#e8dfd1] transition-colors cursor-pointer"
                >
                  <ChevronUp className="w-4 h-4 text-stone-500" />
                  <span>Mostrar solo los 12 recomendados</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="py-12 text-center bg-white rounded-3xl border border-[#e8dfd1] p-6 space-y-3">
            <div className="w-14 h-14 rounded-full bg-[#f4efe6] text-[#8f6b2f] flex items-center justify-center text-2xl mx-auto">
              🔍
            </div>
            <h3 className="font-serif font-bold text-base text-stone-900">No encontramos platillos con esa búsqueda</h3>
            <p className="text-xs text-stone-500 max-w-xs mx-auto font-light">
              Prueba buscando otro ingrediente o pregúntale a <strong>Giobot</strong> para una recomendación personalizada.
            </p>
            <button
              onClick={() => {
                setSearchTerm('');
                setActiveCategory('all');
                setShowAllCatalog(true);
              }}
              className="px-4 py-2 bg-[#14281d] text-[#faf8f5] rounded-xl text-xs font-bold shadow-xs hover:bg-[#1b3a27] transition-colors cursor-pointer"
            >
              Ver todo el menú
            </button>
          </div>
        )}
      </main>

      {/* 7. Giobot Floating Button (FAB with live pulse indicator - auto-hides when footer #contacto is visible) */}
      {!isGiobotOpen && !isContactVisible && (
        <button
          onClick={() => setIsGiobotOpen(true)}
          className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-40 bg-[#14281d] hover:bg-[#1b3a27] text-[#faf8f5] p-3 sm:px-4 sm:py-3 rounded-full shadow-2xl flex items-center gap-2.5 font-bold text-xs sm:text-sm border border-[#c4974f] transition-all hover:scale-105 active:scale-95 group cursor-pointer"
          title="Hablar con Giobot"
          aria-label="Abrir asistente Giobot"
        >
          <div className="relative">
            <Bot className="w-5 h-5 sm:w-6 sm:h-6 text-[#c4974f] group-hover:rotate-12 transition-transform" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full" />
          </div>
          <span className="hidden sm:inline font-bold">Anfitrión Giobot</span>
        </button>
      )}

      {/* 8. Persistent Cart Floating Indicator */}
      <PersistentCartBar
        cartItems={cartItems}
        bringOwnContainer={bringOwnContainer}
        onOpenCart={() => setIsCartOpen(true)}
      />

      {/* 11. Mobile Bottom Navigation (4 clear options) */}
      <BottomNav
        cartCount={cartTotalCount}
        onScrollToTop={scrollToTop}
        onScrollToMenu={scrollToMenu}
        onOpenCart={() => setIsCartOpen(true)}
        onScrollToContact={scrollToContact}
      />

      {/* Modals, Builders & Drawers */}
      <ItemModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onAddToCart={handleAddToCart}
      />

      <EnsaladaBuilder
        isOpen={isSaladBuilderOpen}
        onClose={() => setIsSaladBuilderOpen(false)}
        onAddToCart={handleAddToCart}
      />

      <ComidaCorridaBuilder
        isOpen={isComidaCorridaBuilderOpen}
        onClose={() => setIsComidaCorridaBuilderOpen(false)}
        onAddToCart={handleAddToCart}
      />

      <GiobotChat
        isOpen={isGiobotOpen}
        onClose={() => setIsGiobotOpen(false)}
        onOpenSaladBuilder={() => setIsSaladBuilderOpen(true)}
        onOpenComidaCorridaBuilder={() => setIsComidaCorridaBuilderOpen(true)}
      />

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cartItems}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onClearCart={handleClearCart}
        bringOwnContainer={bringOwnContainer}
        setBringOwnContainer={setBringOwnContainer}
        onOpenVipModal={() => setIsVipModalOpen(true)}
      />

      <VipCardModal
        isOpen={isVipModalOpen}
        onClose={() => setIsVipModalOpen(false)}
        onOpenCart={() => setIsCartOpen(true)}
        vipProfile={vipProfile}
        onProfileUpdated={refreshVipProfile}
      />

      {/* Footer */}
      <Footer />
    </div>
  );
}
