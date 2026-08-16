import React, { useState, useEffect, useRef } from 'react';
import { MENU_ITEMS } from './data/menu';
import { MenuItem, CategoryId, CartItem, VipProfile } from './types';
import { getVipProfile } from './lib/vipStorage';
import { Header } from './components/Header';
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
import { InfoSection } from './components/InfoSection';
import { Footer } from './components/Footer';
import { Bot, Utensils, Sparkles } from 'lucide-react';

export default function App() {
  const [activeCategory, setActiveCategory] = useState<CategoryId>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [isSaladBuilderOpen, setIsSaladBuilderOpen] = useState<boolean>(false);
  const [isComidaCorridaBuilderOpen, setIsComidaCorridaBuilderOpen] = useState<boolean>(false);
  const [isGiobotOpen, setIsGiobotOpen] = useState<boolean>(false);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isVipModalOpen, setIsVipModalOpen] = useState<boolean>(false);
  const [bringOwnContainer, setBringOwnContainer] = useState<boolean>(false);
  const [vipProfile, setVipProfile] = useState<VipProfile | null>(null);

  const menuSectionRef = useRef<HTMLDivElement>(null);

  const refreshVipProfile = () => {
    setVipProfile(getVipProfile());
  };

  useEffect(() => {
    refreshVipProfile();
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
    scrollToMenu();
  };

  // Filter menu items
  const filteredItems = MENU_ITEMS.filter((item) => {
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

  const cartTotalCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <div id="inicio" className="min-h-screen bg-[#fcfaf6] text-stone-900 font-sans flex flex-col selection:bg-[#d1a85b]/30 selection:text-[#162e1e] pb-16 sm:pb-0">
      {/* 1. Header (Compact, Dynamic Status, Socials, VIP, Cart) */}
      <Header
        cartCount={cartTotalCount}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenVipModal={() => setIsVipModalOpen(true)}
        vipProfile={vipProfile}
      />

      {/* Top Application Flow Area (Mobile First Hub) */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-5 w-full space-y-3 sm:space-y-4">
        {/* 2. Search Bar */}
        <SearchBar searchTerm={searchTerm} setSearchTerm={setSearchTerm} />

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
        onSelectCategory={setActiveCategory}
      />

      {/* 6. Products Catalog Section */}
      <main id="menu-section" ref={menuSectionRef} className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-7 flex-1 w-full space-y-4 sm:space-y-6">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg sm:text-2xl font-black font-serif text-stone-900">
              {activeCategory === 'all'
                ? 'Todo nuestro Menú'
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
            <p className="text-xs text-stone-500">
              {filteredItems.length} {filteredItems.length === 1 ? 'platillo disponible' : 'platillos disponibles'}
            </p>
          </div>

          {/* Quick builder triggers if on specific categories */}
          {(activeCategory === 'all' || activeCategory === 'ensaladas' || activeCategory === 'comida-corrida') && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsComidaCorridaBuilderOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold text-xs border border-amber-300 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Utensils className="w-3.5 h-3.5 text-amber-800" />
                <span>Armar Corrida ($90)</span>
              </button>
              <button
                onClick={() => setIsSaladBuilderOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-950 font-bold text-xs border border-emerald-300 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                <span>Armar Ensalada ($90)</span>
              </button>
            </div>
          )}
        </div>

        {/* Product Cards Grid */}
        {filteredItems.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {filteredItems.map((item) => (
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
        ) : (
          <div className="py-12 text-center bg-white rounded-3xl border border-stone-200/80 p-6 space-y-3">
            <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-2xl mx-auto">
              🔍
            </div>
            <h3 className="font-bold text-base text-stone-800">No encontramos platillos con esa búsqueda</h3>
            <p className="text-xs text-stone-500 max-w-xs mx-auto">
              Prueba buscando otro término o pregúntale a <strong>Giobot</strong> para asesorarte.
            </p>
            <button
              onClick={() => {
                setSearchTerm('');
                setActiveCategory('all');
              }}
              className="px-4 py-2 bg-[#162e1e] text-[#fcfaf6] rounded-xl text-xs font-bold shadow-xs hover:bg-[#1f402c] transition-colors cursor-pointer"
            >
              Ver todo el menú
            </button>
          </div>
        )}

        {/* 10. Compact Restaurant Information / Contact */}
        <div className="pt-6">
          <InfoSection />
        </div>
      </main>

      {/* 7. Giobot Floating Button (FAB with live pulse indicator) */}
      {!isGiobotOpen && (
        <button
          onClick={() => setIsGiobotOpen(true)}
          className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-40 bg-[#162e1e] hover:bg-[#1f402c] text-[#fcfaf6] p-3 sm:px-4 sm:py-3 rounded-full shadow-2xl flex items-center gap-2 font-bold text-xs sm:text-sm border border-[#d1a85b] transition-all hover:scale-105 active:scale-95 group cursor-pointer"
          title="Hablar con Giobot"
          aria-label="Abrir asistente Giobot"
        >
          <div className="relative">
            <Bot className="w-5 h-5 sm:w-6 sm:h-6 text-[#d1a85b] group-hover:rotate-12 transition-transform" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full" />
          </div>
          <span className="hidden sm:inline font-bold">Asesor Giobot</span>
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
