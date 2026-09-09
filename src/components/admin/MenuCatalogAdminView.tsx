import React, { useEffect, useMemo, useState } from 'react';
import { CategoryId, StaffUser } from '../../types';
import {
  initializeMenuCatalogFromOriginal,
  ManagedMenuItem,
  MenuCatalogDocument,
  subscribeToMenuCatalog,
  upsertManagedMenuItem,
} from '../../lib/menuCatalogService';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Edit2,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Loader2,
  Search,
  Sparkles,
  Utensils,
  X,
} from 'lucide-react';

interface MenuCatalogAdminViewProps {
  currentUser: StaffUser;
}

const CATEGORY_LABELS: Record<CategoryId, string> = {
  all: 'Todas',
  bebidas: 'Bebidas',
  'licuados-agua-fruta-jugos': 'Licuados, aguas y jugos',
  panaderia: 'Panadería',
  'molletes-sincronizadas-tortas': 'Molletes, sincronizadas y tortas',
  desayunos: 'Desayunos',
  'chapatas-sandwiches': 'Chapatas y sándwiches',
  hamburguesas: 'Hamburguesas',
  'comida-corrida': 'Comida corrida',
  antojitos: 'Antojitos',
  especialidades: 'Especialidades',
  ensaladas: 'Ensaladas',
  'fin-de-semana': 'Fin de semana',
};

const CATEGORY_OPTIONS = (Object.keys(CATEGORY_LABELS) as CategoryId[]).filter((key) => key !== 'all');

function formatPrice(item: ManagedMenuItem): string {
  if (item.sizes && item.sizes.length > 0) {
    const priced = item.sizes.filter((size) => size.price != null).map((size) => Number(size.price));
    if (priced.length > 0) {
      const min = Math.min(...priced);
      const max = Math.max(...priced);
      return min === max ? `$${min}` : `$${min} – $${max}`;
    }
  }
  if (item.price != null) return `$${item.price}`;
  return item.sourcePriceText ? item.sourcePriceText : 'Precio por revisar';
}

export const MenuCatalogAdminView: React.FC<MenuCatalogAdminViewProps> = ({ currentUser }) => {
  const [catalog, setCatalog] = useState<MenuCatalogDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryId>('all');
  const [editing, setEditing] = useState<ManagedMenuItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManage = currentUser.role === 'DUEÑA' || currentUser.role === 'ADMINISTRADOR';

  useEffect(() => {
    const unsubscribe = subscribeToMenuCatalog(
      (nextCatalog) => {
        setCatalog(nextCatalog);
        setLoading(false);
      },
      (err) => {
        setError(err instanceof Error ? err.message : 'No se pudo leer el catálogo del menú.');
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (catalog?.items || []).filter((item) => {
      const matchesCategory = category === 'all' || item.category === category;
      const matchesTerm = !term ||
        item.name.toLowerCase().includes(term) ||
        item.description.toLowerCase().includes(term) ||
        CATEGORY_LABELS[item.category].toLowerCase().includes(term);
      return matchesCategory && matchesTerm;
    });
  }, [catalog, search, category]);

  const stats = useMemo(() => {
    const items = catalog?.items || [];
    return {
      total: items.length,
      active: items.filter((item) => item.active).length,
      available: items.filter((item) => item.active && item.available).length,
      pendingPrice: items.filter((item) => item.price == null && !(item.sizes || []).some((size) => size.price != null)).length,
    };
  }, [catalog]);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3200);
  };

  const handleInitialize = async () => {
    if (!canManage || initializing) return;
    setInitializing(true);
    setError(null);
    try {
      await initializeMenuCatalogFromOriginal(currentUser);
      showNotice('Menú original cargado como catálogo editable. El menú público todavía no cambió.');
    } catch (err: any) {
      setError(err?.message || 'No se pudo inicializar el catálogo.');
    } finally {
      setInitializing(false);
    }
  };

  const saveItem = async (item: ManagedMenuItem, successMessage: string) => {
    if (!canManage || savingId) return;
    setSavingId(item.id);
    setError(null);
    try {
      await upsertManagedMenuItem(item, currentUser);
      showNotice(successMessage);
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar el cambio.');
    } finally {
      setSavingId(null);
    }
  };

  const toggleAvailable = async (item: ManagedMenuItem) => {
    await saveItem(
      { ...item, available: !item.available },
      item.available ? `${item.name} marcado como agotado.` : `${item.name} vuelve a estar disponible.`
    );
  };

  const toggleActive = async (item: ManagedMenuItem) => {
    await saveItem(
      { ...item, active: !item.active },
      item.active ? `${item.name} ocultado del catálogo.` : `${item.name} activado en el catálogo.`
    );
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    await saveItem(editing, `Cambios guardados en ${editing.name}.`);
    setEditing(null);
  };

  if (!canManage) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-800 text-sm">
        Este catálogo solo puede ser administrado por Dueña o Administrador.
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-20">
      {notice && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-900 px-4 py-3 flex items-center gap-2 text-xs font-bold">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {notice}
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 text-rose-800 px-4 py-3 flex items-start gap-2 text-xs font-medium">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <section className="rounded-3xl bg-[#3A2418] text-[#FFF7EA] border border-[#C9974D]/30 p-5 sm:p-7 shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 text-[#C9974D] text-[11px] font-bold uppercase tracking-wider mb-1">
              <Sparkles className="w-4 h-4" /> Gestor visual del catálogo
            </div>
            <h2 className="font-serif font-bold text-2xl sm:text-3xl">Administrar Menú</h2>
            <p className="text-xs sm:text-sm text-[#F4E3C8]/85 mt-1 max-w-2xl">
              Edita el catálogo como contenido: precios, descripción, categoría, disponibilidad y visibilidad. Las fotos se conectarán en la siguiente etapa.
            </p>
          </div>

          <div className="rounded-2xl bg-[#2B1B13] border border-[#C9974D]/30 p-3 text-xs text-[#F4E3C8] max-w-md">
            <strong className="text-[#C9974D] block mb-1">Modo seguro</strong>
            Este panel todavía no reemplaza el menú público. Primero revisamos el catálogo original y después hacemos la publicación controlada.
          </div>
        </div>
      </section>

      {loading ? (
        <div className="bg-white rounded-3xl border border-[#F4E3C8] p-10 text-center text-[#6B4028]">
          <Loader2 className="w-7 h-7 animate-spin mx-auto mb-3 text-[#A86B3D]" />
          Leyendo catálogo…
        </div>
      ) : !catalog ? (
        <section className="bg-white rounded-3xl border border-[#F4E3C8] p-6 sm:p-8 shadow-xs text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#FFF7EA] border border-[#F4E3C8] text-[#A86B3D] flex items-center justify-center mx-auto mb-4">
            <Utensils className="w-7 h-7" />
          </div>
          <h3 className="font-serif font-bold text-xl text-[#2B1B13]">El catálogo editable todavía no está inicializado</h3>
          <p className="text-sm text-[#6B4028] mt-2 max-w-xl mx-auto">
            Carga una sola vez el menú original que recuperamos. Esta acción crea la copia editable en Firestore y no modifica el menú que hoy ve el cliente.
          </p>
          <button
            type="button"
            disabled={initializing}
            onClick={handleInitialize}
            className="mt-5 px-5 py-3 rounded-2xl bg-[#3A2418] hover:bg-[#4A2E1F] text-[#FFF7EA] font-bold text-sm inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {initializing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-[#C9974D]" />}
            {initializing ? 'Cargando menú original…' : 'Cargar menú original'}
          </button>
        </section>
      ) : (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-[#F4E3C8] rounded-2xl p-4">
              <span className="text-[10px] uppercase tracking-wider font-bold text-[#A86B3D]">Catálogo</span>
              <strong className="block text-2xl font-serif text-[#2B1B13]">{stats.total}</strong>
              <span className="text-[11px] text-[#6B4028]">productos</span>
            </div>
            <div className="bg-white border border-[#F4E3C8] rounded-2xl p-4">
              <span className="text-[10px] uppercase tracking-wider font-bold text-[#A86B3D]">Activos</span>
              <strong className="block text-2xl font-serif text-[#2B1B13]">{stats.active}</strong>
              <span className="text-[11px] text-[#6B4028]">visibles al publicar</span>
            </div>
            <div className="bg-white border border-[#F4E3C8] rounded-2xl p-4">
              <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-700">Disponibles</span>
              <strong className="block text-2xl font-serif text-[#2B1B13]">{stats.available}</strong>
              <span className="text-[11px] text-[#6B4028]">no agotados</span>
            </div>
            <div className="bg-white border border-[#F4E3C8] rounded-2xl p-4">
              <span className="text-[10px] uppercase tracking-wider font-bold text-amber-700">Por revisar</span>
              <strong className="block text-2xl font-serif text-[#2B1B13]">{stats.pendingPrice}</strong>
              <span className="text-[11px] text-[#6B4028]">sin precio definido</span>
            </div>
          </section>

          <section className="bg-white rounded-3xl border border-[#F4E3C8] p-4 shadow-xs space-y-3">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A86B3D]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar platillo, bebida o categoría…"
                className="w-full pl-10 pr-4 py-3 rounded-2xl border border-[#F4E3C8] bg-[#FFFDF9] text-sm text-[#2B1B13] focus:outline-hidden focus:border-[#C9974D]"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {(Object.keys(CATEGORY_LABELS) as CategoryId[]).map((categoryId) => (
                <button
                  key={categoryId}
                  type="button"
                  onClick={() => setCategory(categoryId)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap border cursor-pointer ${category === categoryId
                    ? 'bg-[#3A2418] text-[#FFF7EA] border-[#3A2418]'
                    : 'bg-white text-[#6B4028] border-[#DEC8AE] hover:bg-[#FFF7EA]'
                  }`}
                >
                  {CATEGORY_LABELS[categoryId]}
                </button>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleItems.map((item) => {
              const busy = savingId === item.id;
              return (
                <article key={item.id} className={`bg-white rounded-3xl border shadow-xs overflow-hidden ${item.active ? 'border-[#F4E3C8]' : 'border-stone-200 opacity-75'}`}>
                  <div className="aspect-[16/7] bg-[#F8EFE3] border-b border-[#F4E3C8] flex items-center justify-center relative overflow-hidden">
                    {item.primaryImageUrl ? (
                      <img src={item.primaryImageUrl} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center text-[#A86B3D]">
                        <ImageIcon className="w-8 h-8 mx-auto mb-1" />
                        <span className="text-[11px] font-bold">Foto pendiente</span>
                      </div>
                    )}
                    <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold border ${item.active ? 'bg-white/95 text-[#3A2418] border-[#F4E3C8]' : 'bg-stone-100 text-stone-600 border-stone-200'}`}>
                        {item.active ? 'Activo' : 'Oculto'}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold border ${item.available ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'}`}>
                        {item.available ? 'Disponible' : 'Agotado'}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 space-y-3">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="text-[10px] uppercase tracking-wider font-bold text-[#A86B3D]">{CATEGORY_LABELS[item.category]}</span>
                          <h3 className="font-serif font-bold text-lg text-[#2B1B13] leading-tight">{item.name}</h3>
                        </div>
                        <strong className={`text-sm whitespace-nowrap ${item.price == null ? 'text-amber-700' : 'text-[#2B1B13]'}`}>{formatPrice(item)}</strong>
                      </div>
                      <p className="text-xs text-[#6B4028] mt-2 line-clamp-3 min-h-[3rem]">{item.description}</p>
                    </div>

                    {item.notes && (
                      <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[10px] text-amber-900">
                        <strong>Revisar:</strong> {item.notes}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1.5 text-[10px]">
                      {(item.sizes?.length || 0) > 0 && <span className="px-2 py-1 rounded-lg bg-[#FFF7EA] text-[#6B4028]">{item.sizes!.length} tamaños</span>}
                      {(item.options?.length || 0) > 0 && <span className="px-2 py-1 rounded-lg bg-[#FFF7EA] text-[#6B4028]">{item.options!.length} opciones</span>}
                      {(item.extras?.length || 0) > 0 && <span className="px-2 py-1 rounded-lg bg-[#FFF7EA] text-[#6B4028]">{item.extras!.length} extras</span>}
                      {(item.includedItems?.length || 0) > 0 && <span className="px-2 py-1 rounded-lg bg-[#FFF7EA] text-[#6B4028]">{item.includedItems!.length} incluidos</span>}
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <button
                        type="button"
                        disabled={!!savingId}
                        onClick={() => setEditing({ ...item })}
                        className="py-2.5 rounded-xl border border-[#DEC8AE] text-[#5C3825] text-[11px] font-bold flex items-center justify-center gap-1.5 hover:bg-[#FFF7EA] disabled:opacity-50 cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" /> Editar
                      </button>
                      <button
                        type="button"
                        disabled={!!savingId}
                        onClick={() => void toggleAvailable(item)}
                        className={`py-2.5 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer ${item.available
                          ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                          : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                        }`}
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : item.available ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                        {item.available ? 'Agotar' : 'Disponible'}
                      </button>
                      <button
                        type="button"
                        disabled={!!savingId}
                        onClick={() => void toggleActive(item)}
                        className={`py-2.5 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer ${item.active
                          ? 'border-stone-200 text-stone-600 hover:bg-stone-50'
                          : 'border-[#DEC8AE] text-[#5C3825] hover:bg-[#FFF7EA]'
                        }`}
                      >
                        {item.active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        {item.active ? 'Ocultar' : 'Activar'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {visibleItems.length === 0 && (
            <div className="bg-white rounded-3xl border border-[#F4E3C8] p-10 text-center text-[#6B4028] text-sm">
              No hay productos que coincidan con estos filtros.
            </div>
          )}
        </>
      )}

      {editing && (
        <div className="fixed inset-0 z-[80] bg-[#2B1B13]/80 backdrop-blur-md p-4 flex items-center justify-center overflow-y-auto">
          <form onSubmit={handleSaveEdit} className="w-full max-w-xl bg-[#FFF7EA] rounded-3xl border border-[#F4E3C8] shadow-2xl overflow-hidden my-6">
            <div className="bg-[#3A2418] text-[#FFF7EA] px-5 py-4 flex items-center justify-between gap-3">
              <div>
                <span className="text-[10px] uppercase tracking-wider font-bold text-[#C9974D]">Editar producto</span>
                <h3 className="font-serif font-bold text-lg">{editing.name}</h3>
              </div>
              <button type="button" onClick={() => setEditing(null)} className="p-2 rounded-xl hover:bg-[#4A2E1F] cursor-pointer" aria-label="Cerrar editor">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-[#6B4028] uppercase mb-1">Nombre</label>
                <input
                  required
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#DEC8AE] bg-white text-sm focus:outline-hidden focus:border-[#C9974D]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#6B4028] uppercase mb-1">Descripción</label>
                <textarea
                  rows={3}
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#DEC8AE] bg-white text-sm focus:outline-hidden focus:border-[#C9974D]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#6B4028] uppercase mb-1">Categoría</label>
                  <select
                    value={editing.category}
                    onChange={(e) => setEditing({ ...editing, category: e.target.value as CategoryId })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DEC8AE] bg-white text-sm focus:outline-hidden"
                  >
                    {CATEGORY_OPTIONS.map((categoryId) => <option key={categoryId} value={categoryId}>{CATEGORY_LABELS[categoryId]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#6B4028] uppercase mb-1">Precio base</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={editing.price ?? ''}
                    onChange={(e) => setEditing({ ...editing, price: e.target.value === '' ? null : Number(e.target.value) })}
                    placeholder="Sin precio"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DEC8AE] bg-white text-sm focus:outline-hidden"
                  />
                </div>
              </div>

              {(editing.sizes?.length || 0) > 0 && (
                <div className="rounded-2xl bg-white border border-[#F4E3C8] p-3">
                  <span className="text-[11px] font-bold text-[#6B4028] uppercase">Precios por tamaño</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    {editing.sizes!.map((size, index) => (
                      <label key={`${size.name}-${index}`} className="flex items-center gap-2 text-xs text-[#6B4028]">
                        <span className="flex-1 truncate">{size.name}</span>
                        <input
                          type="number"
                          min="0"
                          value={size.price ?? ''}
                          onChange={(e) => {
                            const sizes = [...(editing.sizes || [])];
                            sizes[index] = { ...sizes[index], price: e.target.value === '' ? null : Number(e.target.value) };
                            setEditing({ ...editing, sizes });
                          }}
                          className="w-24 px-2 py-1.5 rounded-lg border border-[#DEC8AE] text-right"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {editing.notes && (
                <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
                  <strong>Nota del menú original:</strong> {editing.notes}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button type="button" onClick={() => setEditing(null)} className="py-3 rounded-xl border border-[#DEC8AE] bg-white text-[#6B4028] text-xs font-bold cursor-pointer">Cancelar</button>
                <button type="submit" disabled={!!savingId} className="py-3 rounded-xl bg-[#3A2418] hover:bg-[#4A2E1F] text-[#FFF7EA] text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer">
                  {savingId === editing.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-[#C9974D]" />}
                  Guardar cambios
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
