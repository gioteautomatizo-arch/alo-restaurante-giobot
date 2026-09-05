import React, { useState, useEffect, useRef } from 'react';
import { MENU_ITEMS } from './data/menu';
import { MenuItem, CategoryId, CartItem, VipProfile, StaffUser } from './types';
import { getVipProfile, refreshCloudVipProfile, VIP_DATA_EVENT } from './lib/vipStorage';
import { getAuthSession, logoutStaff } from './lib/adminStorage';
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
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AdminLoginModal } from './components/admin/AdminLoginModal';
import { TableCustomerView } from './components/public/TableCustomerView';
import { isValidTableNumber } from './lib/tableRequestsService';
import { Bot, Utensils, Sparkles, ArrowRight, ChevronUp, Lock } from 'lucide-react';

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
  const [customerTableNumber, setCustomerTableNumber] = useState<number | null>(null);

  // Administrative State
  const [adminUser, setAdminUser] = useState<StaffUser | null>(null);
  const [isAdminViewActive, setIsAdminViewActive] = useState<boolean>(false);
  const [isAdminLoginModalOpen, setIsAdminLoginModalOpen] = useState<boolean>(false);

  const menuSectionRef = useRef<HTMLDivElement>(null);

  const refreshVipProfile = () => {
    setVipProfile(getVipProfile());
  };

  useEffect(() => {
    refreshVipProfile();

    // Detección de atención a mesa por código QR (?table=1, ?table=2, ?table=4, ?table=5, ?table=6, ?table=7, ?table=8, ?table=9)
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const tableParam = searchParams.get('table');
      if (tableParam) {
        const parsed = parseInt(tableParam, 10);
        if (isValidTableNumber(parsed)) {
          setCustomerTableNumber(parsed);
        }
      }
    } catch {
      // ignore
    }

    // Sincronizar en segundo plano con Firestore si existe perfil VIP
    refreshCloudVipProfile().then(() => {
      refreshVipProfile();
    }).catch(() => {});

    const handleVipUpdate = () => {
      refreshVipProfile();
    };
    window.addEventListener(VIP_DATA_EVENT, handleVipUpdate);
    window.addEventListener('storage', handleVipUpdate);

    // Check if there is an active session (e.g. remembered iPad)
    const session = getAuthSession();
    if (session && session.user) {
      setAdminUser(session.user);
    }

    // Check if URL specifies #admin
    if (window.location.hash === '#admin') {
      if (session && session.user) {
        setIsAdminViewActive(true);
      } else {
        setIsAdminLoginModalOpen(true);
      }
    }
  }, []);

  const handleLoginSuccess = (user: StaffUser) => {
    setAdminUser(user);
    setIsAdminViewActive(true);
  };

  const handleAdminLogout = () => {
    logoutStaff();
    setAdminUser(null);
    setIsAdminViewActive(false);
  };

  const handleOpenAdminClick = () => {
    const session = getAuthSession();
    if (session && session.user) {
      setAdminUser(session.user);
      setIsAdminViewActive(true);
    } else {
      setIsAdminLoginModalOpen(true);
    }
  };

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

  // If Admin View is active, render full administrative panel
  if (isAdminViewActive && adminUser) {
    return (
      <AdminDashboard
        currentUser={adminUser}
        onLogout={handleAdminLogout}
        onExitToStore={() => setIsAdminViewActive(false)}
      />
    );
  }

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
    <div id="inicio" className="min-h-screen bg-[#FFF7EA] text-[#2B1B13] font-sans flex flex-col selection:bg-[#C9974D]/30 selection:text-[#3A2418] pb-16 sm:pb-0">
      {/* 1. Header (Compact, Dynamic Status, Socials, VIP, Cart) */}
      <Header
        cartCount={cartTotalCount}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenVipModal={() => setIsVipModalOpen(true)}
        vipProfile={vipProfile}
      />

      {/* Atención a mesa por código QR si la URL contiene ?table=X válida */}
      {customerTableNumber !== null && (
        <TableCustomerView
          tableNumber={customerTableNumber}
          onExploreMenu={scrollToMenu}
        />
      )}

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
            <h2 className="text-lg sm:text-2xl font-serif font-black text-[#2B1B13] flex items-center gap-2">
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
            <p className="text-xs text-[#6B4028] mt-0.5">
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
                className="px-3 py-1.5 rounded-xl bg-[#F4E3C8] hover:bg-[#ebdcc8] text-[#3A2418] font-serif font-bold text-xs border border-[#A86B3D]/30 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Utensils className="w-3.5 h-3.5 text-[#C9974D]" />
                <span>Armar Corrida ($90)</span>
              </button>
              <button
                onClick={() => setIsSaladBuilderOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-[#FFF7EA] hover:bg-[#F4E3C8] text-[#3A2418] font-serif font-bold text-xs border border-[#C9974D]/40 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#C9974D]" />
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
              <div className="py-6 px-4 rounded-3xl bg-gradient-to-br from-[#3A2418] via-[#4E3222] to-[#2B1B13] text-[#FFF7EA] text-center border border-[#C9974D]/40 shadow-md space-y-3">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#C9974D]/20 text-[#FFF7EA] text-xs font-semibold border border-[#C9974D]/30 font-serif">
                  <Sparkles className="w-3.5 h-3.5 text-[#C9974D]" />
                  <span>Carta Gastronómica Completa</span>
                </div>
                <h3 className="text-lg sm:text-xl font-serif font-bold text-[#FFF7EA]">
                  ¿Quieres explorar todo lo que preparamos para ti?
                </h3>
                <p className="text-xs sm:text-sm text-[#F4E3C8]/80 max-w-md mx-auto font-light">
                  Descubre chapatas, hamburguesas, antojitos mexicanos, bebidas frías, frappés, café de grano y postres artesanales.
                </p>
                <div>
                  <button
                    onClick={() => {
                      setShowAllCatalog(true);
                      scrollToMenu();
                    }}
                    className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-[#C9974D] to-[#A86B3D] hover:from-[#d6aa5f] hover:to-[#C9974D] text-[#FFF7EA] font-serif font-bold text-sm sm:text-base shadow-lg hover:shadow-xl transition-all active:scale-98 cursor-pointer"
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
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-[#FFF7EA] text-[#6B4028] text-xs font-semibold border border-[#F4E3C8] transition-colors cursor-pointer font-serif"
                >
                  <ChevronUp className="w-4 h-4 text-[#A86B3D]" />
                  <span>Mostrar solo los 12 recomendados</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="py-12 text-center bg-white rounded-3xl border border-[#F4E3C8] p-6 space-y-3">
            <div className="w-14 h-14 rounded-full bg-[#FFF7EA] text-[#A86B3D] flex items-center justify-center text-2xl mx-auto border border-[#F4E3C8]">
              🔍
            </div>
            <h3 className="font-serif font-bold text-base text-[#2B1B13]">No encontramos platillos con esa búsqueda</h3>
            <p className="text-xs text-[#6B4028] max-w-xs mx-auto font-light">
              Prueba buscando otro ingrediente o pregúntale a <strong>Tita</strong> para una recomendación personalizada.
            </p>
            <button
              onClick={() => {
                setSearchTerm('');
                setActiveCategory('all');
                setShowAllCatalog(true);
              }}
              className="px-4 py-2 bg-[#3A2418] text-[#FFF7EA] rounded-xl text-xs font-serif font-bold shadow-xs hover:bg-[#6B4028] transition-colors cursor-pointer"
            >
              Ver todo el menú
            </button>
          </div>
        )}
      </main>

      {/* 7. Tita Floating Button (FAB with live pulse indicator - auto-hides when footer #contacto is visible) */}
      {!isGiobotOpen && !isContactVisible && (
        <button
          onClick={() => setIsGiobotOpen(true)}
          className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-40 bg-[#3A2418] hover:bg-[#4A2E1F] text-[#FFF7EA] p-2 sm:px-4 sm:py-2.5 rounded-full shadow-2xl flex items-center gap-2.5 font-serif font-bold text-xs sm:text-sm border border-[#C9974D] transition-all hover:scale-105 active:scale-95 group cursor-pointer"
          title="Hablar con Tita"
          aria-label="Abrir asistente Tita"
        >
          <div className="relative w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center shrink-0">
            <img
              src="/tita.png"
              alt="Tita"
              className="w-full h-full object-contain drop-shadow-md group-hover:scale-105 transition-transform"
            />
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-400 rounded-full animate-ping" />
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-500 rounded-full border border-[#3A2418]" />
          </div>
          <span className="hidden sm:inline font-bold">Platicar con Tita</span>
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
        tableNumber={customerTableNumber}
      />

      <VipCardModal
        isOpen={isVipModalOpen}
        onClose={() => setIsVipModalOpen(false)}
        onOpenCart={() => setIsCartOpen(true)}
        vipProfile={vipProfile}
        onProfileUpdated={refreshVipProfile}
      />

      {/* Staff Floating Quick Return Bar (Only visible if a staff user is logged in on this iPad) */}
      {adminUser && !isAdminViewActive && (
        <button
          onClick={() => setIsAdminViewActive(true)}
          className="fixed top-20 right-4 z-40 bg-[#3A2418] text-[#FFF7EA] px-3.5 py-1.5 rounded-full border border-[#C9974D] shadow-lg flex items-center gap-1.5 text-xs font-serif font-bold hover:bg-[#6B4028] transition-all cursor-pointer"
          title="Regresar al panel de administración"
        >
          <Lock className="w-3.5 h-3.5 text-[#C9974D]" />
          <span>Panel Caja ({adminUser.name})</span>
        </button>
      )}

      {/* Admin Login Modal */}
      <AdminLoginModal
        isOpen={isAdminLoginModalOpen}
        onClose={() => setIsAdminLoginModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* Footer */}
      <Footer onOpenAdmin={handleOpenAdminClick} />
    </div>
  );
}
