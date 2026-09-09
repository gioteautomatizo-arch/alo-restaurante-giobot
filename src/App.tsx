import React, { useState, useEffect, useRef } from 'react';
import { MENU_ITEMS } from './data/menu';
import { MenuItem, CategoryId, CartItem, VipProfile, StaffUser, TableSessionPerson } from './types';
import { getVipProfile, refreshCloudVipProfile, VIP_DATA_EVENT } from './lib/vipStorage';
import { getAuthSession, logoutStaff } from './lib/adminStorage';
import { subscribeToMenuCatalog } from './lib/menuCatalogService';
import { subscribeToTableSession } from './lib/tableSessionsService';
import type { ManagedMenuItem } from './lib/menuCatalogService';
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
import { Utensils, Sparkles, ArrowRight, ChevronUp, Lock } from 'lucide-react';

const toPublicMenuItem = (item: ManagedMenuItem): MenuItem | null => {
  if (!item.active || !item.available) return null;

  const sizes = (item.sizes || [])
    .filter((size) => typeof size.price === 'number' && Number.isFinite(size.price) && size.price >= 0)
    .map((size) => ({ name: size.name, price: size.price as number }));

  const basePrice =
    typeof item.price === 'number' && Number.isFinite(item.price) && item.price >= 0
      ? item.price
      : sizes.length > 0
      ? Math.min(...sizes.map((size) => size.price))
      : null;

  if (basePrice === null) return null;

  const realPhoto = [item.primaryImageUrl, ...(item.imageUrls || [])]
    .find((url) => !!url && url.startsWith('https://res.cloudinary.com/'));

  return {
    id: item.id,
    name: item.name,
    category: item.category,
    description: item.description,
    price: basePrice,
    ...(sizes.length > 0 ? { sizes } : {}),
    ...(item.options?.length ? { options: item.options } : {}),
    ...(item.extras?.length
      ? {
          extras: item.extras.map((extra) => ({
            id: extra.id,
            name: extra.name,
            price: extra.price,
          })),
        }
      : {}),
    ...(realPhoto ? { image: realPhoto } : {}),
    popular: item.popular,
    ...(item.weekendOnly ? { weekendOnly: item.weekendOnly } : {}),
  };
};

export default function App() {
  const [activeCategory, setActiveCategory] = useState<CategoryId>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showAllCatalog, setShowAllCatalog] = useState<boolean>(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>(MENU_ITEMS);
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
  const [selectedTablePerson, setSelectedTablePerson] = useState<TableSessionPerson | null>(null);
  const [tableCartResetNotice, setTableCartResetNotice] = useState<string | null>(null);

  const [adminUser, setAdminUser] = useState<StaffUser | null>(null);
  const [isAdminViewActive, setIsAdminViewActive] = useState<boolean>(false);
  const [isAdminLoginModalOpen, setIsAdminLoginModalOpen] = useState<boolean>(false);

  const menuSectionRef = useRef<HTMLDivElement>(null);
  const activeTableSessionOpenedAtRef = useRef<string | null>(null);
  const cartTableSessionOpenedAtRef = useRef<string | null>(null);

  const refreshVipProfile = () => {
    setVipProfile(getVipProfile());
  };

  useEffect(() => {
    refreshVipProfile();

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

    refreshCloudVipProfile().then(() => {
      refreshVipProfile();
    }).catch(() => {});

    const handleVipUpdate = () => {
      refreshVipProfile();
    };
    window.addEventListener(VIP_DATA_EVENT, handleVipUpdate);
    window.addEventListener('storage', handleVipUpdate);

    const session = getAuthSession();
    if (session && session.user) {
      setAdminUser(session.user);
    }

    if (window.location.hash === '#admin') {
      if (session && session.user) {
        setIsAdminViewActive(true);
      } else {
        setIsAdminLoginModalOpen(true);
      }
    }
  }, []);

  useEffect(() => {
    if (!customerTableNumber) {
      activeTableSessionOpenedAtRef.current = null;
      cartTableSessionOpenedAtRef.current = null;
      return;
    }

    return subscribeToTableSession(customerTableNumber, (session) => {
      const nextOpenedAt = session && session.status !== 'CERRADA' ? session.openedAt : null;
      const previousOpenedAt = activeTableSessionOpenedAtRef.current;
      const cartOpenedAt = cartTableSessionOpenedAtRef.current;

      const sessionChanged = !!previousOpenedAt && previousOpenedAt !== nextOpenedAt;
      const cartBelongsToAnotherSession = !!cartOpenedAt && cartOpenedAt !== nextOpenedAt;

      if ((sessionChanged || cartBelongsToAnotherSession) && cartOpenedAt) {
        setCartItems((currentItems) => (currentItems.length > 0 ? [] : currentItems));
        cartTableSessionOpenedAtRef.current = null;
        setSelectedTablePerson(null);
        setTableCartResetNotice(
          'La mesa inició un nuevo servicio. Por seguridad vaciamos el pedido anterior.'
        );
      }

      activeTableSessionOpenedAtRef.current = nextOpenedAt;

      // Si el cliente armó el carrito mientras terminaba de abrir la mesa,
      // ligarlo a la primera sesión activa que aparezca. Desde ese momento no puede
      // cruzarse a una sesión posterior.
      if (nextOpenedAt && !cartTableSessionOpenedAtRef.current) {
        setCartItems((currentItems) => {
          if (currentItems.length > 0) {
            cartTableSessionOpenedAtRef.current = nextOpenedAt;
          }
          return currentItems;
        });
      }
    });
  }, [customerTableNumber]);

  useEffect(() => {
    if (!tableCartResetNotice) return;
    const timer = window.setTimeout(() => setTableCartResetNotice(null), 6500);
    return () => window.clearTimeout(timer);
  }, [tableCartResetNotice]);

  useEffect(() => {
    if (isAdminViewActive) return;

    return subscribeToMenuCatalog(
      (catalog) => {
        if (!catalog) {
          setMenuItems(MENU_ITEMS);
          return;
        }

        const publicItems = catalog.items
          .map(toPublicMenuItem)
          .filter((item): item is MenuItem => item !== null);

        setMenuItems(publicItems);
      },
      (error) => {
        console.warn('No se pudo leer el catálogo administrable; se conserva el menú de respaldo.', error);
        setMenuItems(MENU_ITEMS);
      }
    );
  }, [isAdminViewActive]);

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

  if (isAdminViewActive && adminUser) {
    return (
      <AdminDashboard
        currentUser={adminUser}
        onLogout={handleAdminLogout}
        onExitToStore={() => setIsAdminViewActive(false)}
      />
    );
  }

  const handleAddToCart = (item: CartItem) => {
    const person = customerTableNumber
      ? (selectedTablePerson || { id: 'person-1', index: 1, label: 'Persona 1', accountId: 'general' })
      : null;

    const itemWithPerson = person
      ? {
          ...item,
          personId: person.id,
          personIndex: person.index,
          personLabel: person.label,
        }
      : item;

    if (customerTableNumber) {
      const activeOpenedAt = activeTableSessionOpenedAtRef.current;
      const cartOpenedAt = cartTableSessionOpenedAtRef.current;

      if (activeOpenedAt && cartOpenedAt && activeOpenedAt !== cartOpenedAt) {
        cartTableSessionOpenedAtRef.current = activeOpenedAt;
        setCartItems([itemWithPerson]);
        setTableCartResetNotice(
          'La mesa cambió de servicio. Eliminamos el pedido anterior y comenzamos un carrito nuevo.'
        );
        return;
      }

      if (activeOpenedAt && !cartOpenedAt) {
        cartTableSessionOpenedAtRef.current = activeOpenedAt;
      }
    }

    setCartItems((prev) => [...prev, itemWithPerson]);
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
    cartTableSessionOpenedAtRef.current = null;
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

  const rawFilteredItems = menuItems.filter((item) => {
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

  const isInitialCatalogView = activeCategory === 'all' && !searchTerm.trim() && !showAllCatalog;
  const displayedItems = isInitialCatalogView ? rawFilteredItems.slice(0, 6) : rawFilteredItems;
  const catalogTotal = menuItems.length;
  const initialVisibleCount = Math.min(6, catalogTotal);

  const cartTotalCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <div id="inicio" className="min-h-screen bg-[#FFF7EA] text-[#2B1B13] font-sans flex flex-col selection:bg-[#C9974D]/30 selection:text-[#3A2418] pb-16 sm:pb-0">
      <Header
        cartCount={cartTotalCount}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenVipModal={() => setIsVipModalOpen(true)}
        vipProfile={vipProfile}
      />

      {tableCartResetNotice && customerTableNumber !== null && (
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 pt-3 w-full">
          <div className="rounded-2xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-[11px] sm:text-xs font-semibold text-amber-900 shadow-sm">
            ⚠️ {tableCartResetNotice}
          </div>
        </div>
      )}

      {customerTableNumber !== null && (
        <TableCustomerView
          tableNumber={customerTableNumber}
          onExploreMenu={scrollToMenu}
          onSelectCategory={(cat) => {
            setActiveCategory(cat);
            setShowAllCatalog(true);
            scrollToMenu();
          }}
          onOpenComidaCorrida={() => {
            setIsComidaCorridaBuilderOpen(true);
          }}
          onPersonSelectionChange={setSelectedTablePerson}
        />
      )}

      {!customerTableNumber && (
        <Banner
          onOpenGiobot={() => setIsGiobotOpen(true)}
          onOpenComidaCorrida={() => setIsComidaCorridaBuilderOpen(true)}
          onOpenEnsalada={() => setIsSaladBuilderOpen(true)}
          onScrollToMenu={scrollToMenu}
        />
      )}

      {!customerTableNumber && (
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-3.5 sm:py-5 w-full space-y-3 sm:space-y-4">
          <SearchBar
            searchTerm={searchTerm}
            setSearchTerm={(term) => {
              setSearchTerm(term);
              if (term) setShowAllCatalog(true);
            }}
          />

          <QuickActions
            onScrollToMenu={scrollToMenu}
            onOpenDeliveryOrder={() => setIsCartOpen(true)}
            onOpenGiobot={() => setIsGiobotOpen(true)}
          />

          <DailyHighlights
            onOpenComidaCorrida={() => setIsComidaCorridaBuilderOpen(true)}
            onOpenSaladBuilder={() => setIsSaladBuilderOpen(true)}
            onSelectCategory={handleCategorySelect}
          />

          <EcoPromoCard
            bringOwnContainer={bringOwnContainer}
            setBringOwnContainer={setBringOwnContainer}
          />
        </div>
      )}

      {customerTableNumber && (
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 pt-1 pb-1 w-full">
          <SearchBar
            searchTerm={searchTerm}
            setSearchTerm={(term) => {
              setSearchTerm(term);
              if (term) setShowAllCatalog(true);
            }}
          />
        </div>
      )}

      <CategoryFilter
        activeCategory={activeCategory}
        onSelectCategory={(cat) => {
          setActiveCategory(cat);
          setShowAllCatalog(true);
        }}
      />

      <main id="menu-section" ref={menuSectionRef} className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-5 sm:py-7 flex-1 w-full space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-2xl font-serif font-black text-[#2B1B13] flex items-center gap-2">
              {activeCategory === 'all'
                ? isInitialCatalogView
                  ? 'Selección de Platillos Recomendados'
                  : `Catálogo Completo (${catalogTotal} Platillos)`
                : activeCategory === 'desayunos'
                ? 'Desayunos & Paquetes'
                : activeCategory === 'bebidas'
                ? 'Bebidas & Café'
                : activeCategory === 'licuados-agua-fruta-jugos'
                ? 'Licuados, Aguas, Fruta & Jugos'
                : activeCategory === 'comida-corrida'
                ? 'Comida Corrida de 3 Tiempos'
                : activeCategory === 'ensaladas'
                ? 'Ensaladas Frescas'
                : activeCategory === 'chapatas-sandwiches'
                ? 'Chapatas & Sandwiches'
                : activeCategory === 'hamburguesas'
                ? 'Hamburguesas'
                : activeCategory === 'molletes-sincronizadas-tortas'
                ? 'Molletes, Sincronizadas & Tortas'
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
                ? `Mostrando ${initialVisibleCount} opciones de nuestra carta de ${catalogTotal} platillos`
                : `${displayedItems.length} ${displayedItems.length === 1 ? 'platillo disponible' : 'platillos disponibles'}`}
            </p>
          </div>

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

            {isInitialCatalogView && catalogTotal > initialVisibleCount && (
              <div className="py-6 px-4 rounded-3xl bg-gradient-to-br from-[#3A2418] via-[#4E3222] to-[#2B1B13] text-[#FFF7EA] text-center border border-[#C9974D]/40 shadow-md space-y-3">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#C9974D]/20 text-[#FFF7EA] text-xs font-semibold border border-[#C9974D]/30 font-serif">
                  <Sparkles className="w-3.5 h-3.5 text-[#C9974D]" />
                  <span>Carta Gastronómica Completa</span>
                </div>
                <h3 className="text-lg sm:text-xl font-serif font-bold text-[#FFF7EA]">
                  ¿Quieres explorar todo lo que preparamos para ti?
                </h3>
                <p className="text-xs sm:text-sm text-[#F4E3C8]/80 max-w-md mx-auto font-light">
                  Descubre nuestra carta completa y las opciones disponibles hoy.
                </p>
                <div>
                  <button
                    onClick={() => {
                      setShowAllCatalog(true);
                      scrollToMenu();
                    }}
                    className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-[#C9974D] to-[#A86B3D] hover:from-[#d6aa5f] hover:to-[#C9974D] text-[#FFF7EA] font-serif font-bold text-sm sm:text-base shadow-lg hover:shadow-xl transition-all active:scale-98 cursor-pointer"
                  >
                    <span>Ver los {catalogTotal} platillos</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

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
                  <span>Mostrar solo los {initialVisibleCount} recomendados</span>
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

      <PersistentCartBar
        cartItems={cartItems}
        bringOwnContainer={bringOwnContainer}
        onOpenCart={() => setIsCartOpen(true)}
      />

      <BottomNav
        cartCount={cartTotalCount}
        onScrollToTop={scrollToTop}
        onScrollToMenu={scrollToMenu}
        onOpenCart={() => setIsCartOpen(true)}
        onScrollToContact={scrollToContact}
      />

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
        menuItems={menuItems}
        onAddToCart={handleAddToCart}
        onSelectMenuItem={(item) => setSelectedItem(item)}
        onOpenCart={() => {
          setIsGiobotOpen(false);
          setIsCartOpen(true);
        }}
        tableNumber={customerTableNumber}
        selectedPersonLabel={selectedTablePerson?.label || null}
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

      <AdminLoginModal
        isOpen={isAdminLoginModalOpen}
        onClose={() => setIsAdminLoginModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      <Footer onOpenAdmin={handleOpenAdminClick} />
    </div>
  );
}