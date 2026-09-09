import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Loader2,
  Plus,
  Search,
  Star,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import type { CategoryId, StaffUser } from '../../types';
import {
  createMenuItemId,
  deleteManagedMenuItem,
  initializeMenuCatalogFromOriginal,
  ManagedMenuItem,
  MenuCatalogDocument,
  RESTAURANT_ID,
  subscribeToMenuCatalog,
  upsertManagedMenuItem,
} from '../../lib/menuCatalogService';
import { deleteMenuImageByUrl, uploadMenuImage, validateMenuImage } from '../../lib/menuImagesService';

interface MenuCatalogManagerViewProps {
  currentUser: StaffUser;
}

const CATEGORY_OPTIONS: { id: Exclude<CategoryId, 'all'>; label: string }[] = [
  { id: 'bebidas', label: 'Bebidas' },
  { id: 'licuados-agua-fruta-jugos', label: 'Licuados, agua, fruta y jugos' },
  { id: 'panaderia', label: 'Panadería' },
  { id: 'molletes-sincronizadas-tortas', label: 'Molletes, sincronizadas y tortas' },
  { id: 'desayunos', label: 'Desayunos' },
  { id: 'chapatas-sandwiches', label: 'Chapatas y sandwiches' },
  { id: 'hamburguesas', label: 'Hamburguesas' },
  { id: 'comida-corrida', label: 'Comida corrida' },
  { id: 'antojitos', label: 'Antojitos' },
  { id: 'especialidades', label: 'Especialidades' },
  { id: 'ensaladas', label: 'Ensaladas' },
  { id: 'fin-de-semana', label: 'Fin de semana' },
];

const categoryLabel = (category: CategoryId): string =>
  CATEGORY_OPTIONS.find((option) => option.id === category)?.label || category;

const formatPrice = (item: ManagedMenuItem): string => {
  if (item.price != null && Number.isFinite(item.price)) return `$${item.price}`;
  if (item.sourcePriceText) return item.sourcePriceText;
  return 'Precio pendiente';
};

export const MenuCatalogManagerView: React.FC<MenuCatalogManagerViewProps> = ({ currentUser }) => {
  const [catalog, setCatalog] = useState<MenuCatalogDocument | null>(null);
  const [initialSnapshotReceived, setInitialSnapshotReceived] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryId>('all');
  const [editingItem, setEditingItem] = useState<ManagedMenuItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedMenuItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canManage = currentUser.role === 'DUEÑA' || currentUser.role === 'ADMINISTRADOR';

  useEffect(() => {
    const unsubscribe = subscribeToMenuCatalog(
      (nextCatalog) => {
        setCatalog(nextCatalog);
        setInitialSnapshotReceived(true);
        setError(null);
      },
      (err: any) => {
        setInitialSnapshotReceived(true);
        setError(err?.message || 'No se pudo leer el catálogo del menú.');
      }
    );
    return unsubscribe;
  }, []);

  const showSuccess = (message: string) => {
    setSuccess(message);
    window.setTimeout(() => setSuccess(null), 3500);
  };

  const visibleItems = useMemo(() => {
    if (!catalog) return [];
    const term = search.trim().toLowerCase();
    return catalog.items.filter((item) => {
      const matchesCategory = category === 'all' || item.category === category;
      const matchesSearch =
        !term ||
        item.name.toLowerCase().includes(term) ||
        item.description.toLowerCase().includes(term) ||
        categoryLabel(item.category).toLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [catalog, search, category]);

  const stats = useMemo(() => {
    const items = catalog?.items || [];
    return {
      total: items.length,
      active: items.filter((item) => item.active).length,
      soldOut: items.filter((item) => !item.available).length,
      pendingPrice: items.filter((item) => item.price == null && !item.sizes?.some((size) => size.price != null)).length,
    };
  }, [catalog]);

  const isPersistedItem = (item: ManagedMenuItem): boolean =>
    !!catalog?.items.some((candidate) => candidate.id === item.id);

  const persistedVersion = (item: ManagedMenuItem): ManagedMenuItem | null =>
    catalog?.items.find((candidate) => candidate.id === item.id) || null;

  const handleInitialize = async () => {
    if (!canManage || busy) return;
    setBusy(true);
    setError(null);
    try {
      await initializeMenuCatalogFromOriginal(currentUser);
      showSuccess('Menú original cargado al gestor sin modificar el menú público.');
    } catch (err: any) {
      setError(err?.message || 'No se pudo inicializar el catálogo.');
    } finally {
      setBusy(false);
    }
  };

  const openNewItem = () => {
    const maxOrder = catalog?.items.reduce((max, item) => Math.max(max, item.sortOrder || 0), 0) || 0;
    const now = new Date().toISOString();
    setEditingItem({
      id: createMenuItemId('nuevo-platillo'),
      restaurantId: RESTAURANT_ID,
      name: '',
      category: 'desayunos',
      description: '',
      price: null,
      imageUrls: [],
      popular: false,
      active: true,
      available: true,
      sortOrder: maxOrder + 10,
      source: 'manual',
      updatedAt: now,
      updatedBy: currentUser.name,
    });
  };

  const saveEditingItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingItem || !canManage || busy || photoBusy) return;
    if (!editingItem.name.trim()) {
      setError('Escribe el nombre del platillo o producto.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await upsertManagedMenuItem(
        {
          ...editingItem,
          name: editingItem.name.trim(),
          description: editingItem.description.trim(),
        },
        currentUser
      );
      setEditingItem(null);
      showSuccess('Cambios guardados en el catálogo administrativo.');
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar el producto.');
    } finally {
      setBusy(false);
    }
  };

  const quickUpdate = async (item: ManagedMenuItem, updates: Partial<ManagedMenuItem>, successMessage: string) => {
    if (!canManage || busyItemId) return;
    setBusyItemId(item.id);
    setError(null);
    try {
      await upsertManagedMenuItem({ ...item, ...updates }, currentUser);
      showSuccess(successMessage);
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar el cambio.');
    } finally {
      setBusyItemId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !canManage || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteManagedMenuItem(deleteTarget.id, currentUser);
      showSuccess(`“${deleteTarget.name}” fue eliminado del catálogo administrativo.`);
      setDeleteTarget(null);
    } catch (err: any) {
      setError(err?.message || 'No se pudo eliminar el producto.');
    } finally {
      setBusy(false);
    }
  };

  const handlePhotoFiles = async (files: FileList | null) => {
    if (!editingItem || !files?.length || photoBusy) return;
    const persisted = persistedVersion(editingItem);
    if (!persisted) {
      setError('Guarda primero el nuevo producto. Después podrás subir sus fotos.');
      return;
    }

    const selected = Array.from(files).slice(0, 6);
    const validationError = selected.map(validateMenuImage).find(Boolean);
    if (validationError) {
      setError(validationError);
      return;
    }

    setPhotoBusy(true);
    setError(null);
    try {
      const uploadedUrls: string[] = [];
      for (const file of selected) {
        uploadedUrls.push(await uploadMenuImage(editingItem.id, file));
      }

      const imageUrls = Array.from(new Set([...(persisted.imageUrls || []), ...uploadedUrls]));
      const primaryImageUrl = persisted.primaryImageUrl || imageUrls[0];
      await upsertManagedMenuItem({ ...persisted, imageUrls, primaryImageUrl }, currentUser);
      setEditingItem((current) => current ? { ...current, imageUrls, primaryImageUrl } : current);
      showSuccess(`${uploadedUrls.length} foto${uploadedUrls.length === 1 ? '' : 's'} agregada${uploadedUrls.length === 1 ? '' : 's'}.`);
    } catch (err: any) {
      setError(err?.message || 'No se pudieron subir las fotos.');
    } finally {
      setPhotoBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const setPrimaryPhoto = async (url: string) => {
    if (!editingItem || photoBusy) return;
    const persisted = persistedVersion(editingItem);
    if (!persisted) return;
    setPhotoBusy(true);
    setError(null);
    try {
      await upsertManagedMenuItem({ ...persisted, primaryImageUrl: url }, currentUser);
      setEditingItem((current) => current ? { ...current, primaryImageUrl: url } : current);
      showSuccess('Foto principal actualizada.');
    } catch (err: any) {
      setError(err?.message || 'No se pudo cambiar la foto principal.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async (url: string) => {
    if (!editingItem || photoBusy) return;
    const persisted = persistedVersion(editingItem);
    if (!persisted) return;

    const imageUrls = (persisted.imageUrls || []).filter((candidate) => candidate !== url);
    const primaryImageUrl = persisted.primaryImageUrl === url ? imageUrls[0] : persisted.primaryImageUrl;

    setPhotoBusy(true);
    setError(null);
    try {
      await upsertManagedMenuItem({ ...persisted, imageUrls, primaryImageUrl }, currentUser);
      setEditingItem((current) => current ? { ...current, imageUrls, primaryImageUrl } : current);
      try {
        await deleteMenuImageByUrl(url);
      } catch (storageError) {
        console.warn('La referencia se quitó del menú, pero no se pudo borrar el archivo físico:', storageError);
      }
      showSuccess('Foto eliminada del platillo.');
    } catch (err: any) {
      setError(err?.message || 'No se pudo eliminar la foto.');
    } finally {
      setPhotoBusy(false);
    }
  };

  if (!canManage) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5" />
          <div><h3 className="font-serif font-bold">Administrar Menú</h3><p className="text-xs mt-1">Esta sección está disponible únicamente para Dueña y Administrador.</p></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      {success && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900 text-xs font-medium flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /><span>{success}</span></div>}
      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900 text-xs font-medium flex items-start gap-2"><AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" /><span>{error}</span></div>}

      <section className="rounded-3xl bg-[#3A2418] text-[#FFF7EA] border border-[#4E3222] shadow-md p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-[#C9974D] text-[11px] font-bold uppercase tracking-wider mb-1"><Utensils className="w-4 h-4" /> Gestor visual</div>
            <h2 className="font-serif font-bold text-2xl">Administrar Menú</h2>
            <p className="text-xs sm:text-sm text-[#F4E3C8]/85 mt-1 max-w-2xl">Administra productos, disponibilidad, destacados y fotos. Esta etapa todavía no reemplaza el menú público.</p>
          </div>
          {catalog && <button type="button" onClick={openNewItem} className="px-4 py-3 rounded-2xl bg-[#C9974D] hover:bg-[#D6A65D] text-[#2B1B13] font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shrink-0"><Plus className="w-4 h-4" /> Agregar platillo</button>}
        </div>
      </section>

      {!initialSnapshotReceived ? (
        <div className="rounded-3xl border border-[#F4E3C8] bg-white p-10 text-center text-[#6B4028]"><Loader2 className="w-7 h-7 animate-spin mx-auto mb-3 text-[#C9974D]" /><p className="text-sm font-bold">Leyendo catálogo…</p></div>
      ) : !catalog ? (
        <section className="rounded-3xl border border-[#E8D4BE] bg-white p-6 sm:p-8 text-center shadow-xs">
          <Utensils className="w-7 h-7 text-[#A86B3D] mx-auto mb-3" />
          <h3 className="font-serif font-bold text-xl text-[#2B1B13]">El catálogo dinámico todavía está vacío</h3>
          <p className="text-xs sm:text-sm text-[#6B4028] max-w-xl mx-auto mt-2">Carga una sola vez el menú original. Si ya existe, no se sobrescribe.</p>
          <button type="button" disabled={busy} onClick={handleInitialize} className="mt-5 px-5 py-3 rounded-2xl bg-[#3A2418] text-[#FFF7EA] font-bold text-xs inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 text-[#C9974D]" />} Cargar menú original</button>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl border border-[#F4E3C8] p-4"><span className="text-[10px] uppercase font-bold text-[#A86B3D]">Catálogo</span><strong className="block text-xl font-serif text-[#2B1B13]">{stats.total}</strong></div>
            <div className="bg-white rounded-2xl border border-[#F4E3C8] p-4"><span className="text-[10px] uppercase font-bold text-emerald-700">Activos</span><strong className="block text-xl font-serif text-[#2B1B13]">{stats.active}</strong></div>
            <div className="bg-white rounded-2xl border border-[#F4E3C8] p-4"><span className="text-[10px] uppercase font-bold text-rose-700">Agotados</span><strong className="block text-xl font-serif text-[#2B1B13]">{stats.soldOut}</strong></div>
            <div className="bg-white rounded-2xl border border-[#F4E3C8] p-4"><span className="text-[10px] uppercase font-bold text-amber-700">Precio por revisar</span><strong className="block text-xl font-serif text-[#2B1B13]">{stats.pendingPrice}</strong></div>
          </div>

          <div className="bg-white rounded-3xl border border-[#F4E3C8] p-4 shadow-xs space-y-3">
            <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#A86B3D]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar platillo, bebida o categoría…" className="w-full pl-9 pr-4 py-2.5 rounded-2xl border border-[#E8D4BE] bg-[#FFFDF9] text-sm text-[#2B1B13] focus:outline-hidden focus:border-[#A86B3D]" /></div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button type="button" onClick={() => setCategory('all')} className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer ${category === 'all' ? 'bg-[#3A2418] text-white' : 'bg-[#FFF7EA] text-[#6B4028]'}`}>Todo</button>
              {CATEGORY_OPTIONS.map((option) => <button type="button" key={option.id} onClick={() => setCategory(option.id)} className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer ${category === option.id ? 'bg-[#3A2418] text-white' : 'bg-[#FFF7EA] text-[#6B4028]'}`}>{option.label}</button>)}
            </div>
          </div>

          {visibleItems.length === 0 ? <div className="rounded-3xl border border-[#F4E3C8] bg-white p-10 text-center text-sm text-[#6B4028]">No hay productos que coincidan con esos filtros.</div> : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {visibleItems.map((item) => {
                const itemBusy = busyItemId === item.id;
                return (
                  <article key={item.id} className="bg-white rounded-3xl border border-[#E8D4BE] overflow-hidden shadow-xs flex flex-col">
                    <div className="aspect-[16/8] bg-[#FAF5ED] border-b border-[#F4E3C8] relative overflow-hidden">
                      {item.primaryImageUrl ? <img src={item.primaryImageUrl} alt={item.name} loading="lazy" decoding="async" fetchPriority="low" className="w-full h-full object-cover" /> : <div className="w-full h-full flex flex-col items-center justify-center text-[#A86B3D] gap-2"><ImageIcon className="w-7 h-7" /><span className="text-[11px] font-bold">Sin foto todavía</span></div>}
                      <div className="absolute top-2 left-2 flex gap-1.5">{!item.active && <span className="px-2 py-1 rounded-lg bg-stone-900/80 text-white text-[10px] font-bold">Oculto</span>}{!item.available && <span className="px-2 py-1 rounded-lg bg-rose-700 text-white text-[10px] font-bold">Agotado</span>}{item.popular && <span className="px-2 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold">★ Destacado</span>}</div>
                      {!!item.imageUrls?.length && <span className="absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-black/60 text-white text-[10px] font-bold">{item.imageUrls.length} foto{item.imageUrls.length === 1 ? '' : 's'}</span>}
                    </div>
                    <div className="p-4 flex-1 flex flex-col gap-3">
                      <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#A86B3D]">{categoryLabel(item.category)}</p><div className="flex items-start justify-between gap-3 mt-0.5"><h3 className="font-serif font-bold text-base text-[#2B1B13] leading-tight">{item.name}</h3><strong className={`text-sm whitespace-nowrap ${item.price == null ? 'text-amber-700' : 'text-[#2B1B13]'}`}>{formatPrice(item)}</strong></div><p className="text-xs text-[#6B4028] mt-1 line-clamp-3">{item.description || 'Sin descripción.'}</p></div>
                      {(item.sizes?.length || item.options?.length || item.extras?.length || item.includedItems?.length) ? <div className="flex flex-wrap gap-1.5 text-[10px]">{!!item.sizes?.length && <span className="px-2 py-1 rounded-lg bg-[#FFF7EA] text-[#6B4028]">{item.sizes.length} tamaños</span>}{!!item.options?.length && <span className="px-2 py-1 rounded-lg bg-[#FFF7EA] text-[#6B4028]">{item.options.length} opciones</span>}{!!item.extras?.length && <span className="px-2 py-1 rounded-lg bg-[#FFF7EA] text-[#6B4028]">{item.extras.length} extras</span>}{!!item.includedItems?.length && <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-800">{item.includedItems.length} incluidos</span>}</div> : null}
                      {(item.notes || item.sourcePriceText) && <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[10px] text-amber-900"><strong>Revisar antes de publicar:</strong> {item.notes || `Precio original: ${item.sourcePriceText}`}</div>}
                      <div className="mt-auto pt-1 grid grid-cols-2 gap-2">
                        <button type="button" disabled={itemBusy} onClick={() => quickUpdate(item, { active: !item.active }, item.active ? 'Producto ocultado del catálogo.' : 'Producto activado en el catálogo.')} className="py-2 rounded-xl border border-[#E8D4BE] text-[11px] font-bold text-[#6B4028] flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer">{item.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}{item.active ? 'Visible' : 'Oculto'}</button>
                        <button type="button" disabled={itemBusy} onClick={() => quickUpdate(item, { available: !item.available }, item.available ? 'Producto marcado como agotado.' : 'Producto marcado como disponible.')} className={`py-2 rounded-xl border text-[11px] font-bold disabled:opacity-50 cursor-pointer ${item.available ? 'border-emerald-200 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{item.available ? 'Disponible' : 'Agotado'}</button>
                        <button type="button" disabled={itemBusy} onClick={() => quickUpdate(item, { popular: !item.popular }, item.popular ? 'Se quitó de destacados.' : 'Producto marcado como destacado.')} className="py-2 rounded-xl border border-amber-200 text-[11px] font-bold text-amber-800 flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"><Star className="w-3.5 h-3.5" /> {item.popular ? 'Destacado' : 'Destacar'}</button>
                        <button type="button" onClick={() => setEditingItem({ ...item, imageUrls: [...(item.imageUrls || [])] })} className="py-2 rounded-xl bg-[#3A2418] text-[#FFF7EA] text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer"><Edit3 className="w-3.5 h-3.5" /> Editar</button>
                      </div>
                      <button type="button" onClick={() => setDeleteTarget(item)} className="text-[10px] text-rose-700 hover:underline inline-flex items-center justify-center gap-1 cursor-pointer"><Trash2 className="w-3 h-3" /> Eliminar del catálogo</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {editingItem && (
        <div className="fixed inset-0 z-[80] bg-[#2B1B13]/80 backdrop-blur-md p-4 flex items-center justify-center">
          <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto bg-[#FFF7EA] rounded-3xl border border-[#E8D4BE] shadow-2xl">
            <div className="sticky top-0 bg-[#3A2418] text-white px-5 py-4 flex items-center justify-between gap-3 z-10">
              <div><h3 className="font-serif font-bold text-lg">{isPersistedItem(editingItem) ? 'Editar producto' : 'Nuevo producto'}</h3><p className="text-[11px] text-[#F4E3C8]">Datos y galería del catálogo administrativo.</p></div>
              <button type="button" onClick={() => setEditingItem(null)} className="p-2 rounded-xl hover:bg-white/10 cursor-pointer" aria-label="Cerrar"><X className="w-4 h-4" /></button>
            </div>

            <form onSubmit={saveEditingItem} className="p-5 space-y-4">
              <div><label className="block text-[11px] font-bold uppercase text-[#6B4028] mb-1">Nombre *</label><input required value={editingItem.name} onChange={(event) => setEditingItem({ ...editingItem, name: event.target.value })} className="w-full px-3.5 py-2.5 rounded-xl border border-[#DEC8AE] bg-white text-sm focus:outline-hidden focus:border-[#A86B3D]" placeholder="Nombre del platillo" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block text-[11px] font-bold uppercase text-[#6B4028] mb-1">Categoría</label><select value={editingItem.category} onChange={(event) => setEditingItem({ ...editingItem, category: event.target.value as CategoryId })} className="w-full px-3.5 py-2.5 rounded-xl border border-[#DEC8AE] bg-white text-sm cursor-pointer">{CATEGORY_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></div>
                <div><label className="block text-[11px] font-bold uppercase text-[#6B4028] mb-1">Precio base</label><input type="number" min="0" step="0.01" value={editingItem.price ?? ''} onChange={(event) => setEditingItem({ ...editingItem, price: event.target.value === '' ? null : Number(event.target.value) })} className="w-full px-3.5 py-2.5 rounded-xl border border-[#DEC8AE] bg-white text-sm" placeholder="Dejar vacío si está por revisar" /></div>
              </div>
              <div><label className="block text-[11px] font-bold uppercase text-[#6B4028] mb-1">Descripción</label><textarea rows={3} value={editingItem.description} onChange={(event) => setEditingItem({ ...editingItem, description: event.target.value })} className="w-full px-3.5 py-2.5 rounded-xl border border-[#DEC8AE] bg-white text-sm resize-none focus:outline-hidden focus:border-[#A86B3D]" placeholder="Descripción que después verá el cliente" /></div>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => setEditingItem({ ...editingItem, active: !editingItem.active })} className={`py-2.5 rounded-xl border text-[11px] font-bold cursor-pointer ${editingItem.active ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-stone-100 border-stone-200 text-stone-700'}`}>{editingItem.active ? 'Visible' : 'Oculto'}</button>
                <button type="button" onClick={() => setEditingItem({ ...editingItem, available: !editingItem.available })} className={`py-2.5 rounded-xl border text-[11px] font-bold cursor-pointer ${editingItem.available ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>{editingItem.available ? 'Disponible' : 'Agotado'}</button>
                <button type="button" onClick={() => setEditingItem({ ...editingItem, popular: !editingItem.popular })} className={`py-2.5 rounded-xl border text-[11px] font-bold cursor-pointer ${editingItem.popular ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-white border-[#DEC8AE] text-[#6B4028]'}`}>{editingItem.popular ? '★ Destacado' : 'Destacar'}</button>
              </div>

              {!!editingItem.sizes?.length && <div className="rounded-2xl border border-[#E8D4BE] bg-white p-3"><p className="text-[11px] font-bold text-[#2B1B13] mb-2">Tamaños actuales</p><div className="flex flex-wrap gap-1.5">{editingItem.sizes.map((size) => <span key={size.name} className="px-2 py-1 rounded-lg bg-[#FFF7EA] text-[10px] text-[#6B4028]">{size.name}: {size.price == null ? 'pendiente' : `$${size.price}`}</span>)}</div></div>}
              {(editingItem.notes || editingItem.sourcePriceText) && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><strong>Dato del menú original:</strong> {editingItem.notes || editingItem.sourcePriceText}</div>}

              <div className="rounded-2xl border border-[#E8D4BE] bg-white p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div><p className="text-xs font-bold text-[#2B1B13] flex items-center gap-1.5"><Camera className="w-4 h-4 text-[#A86B3D]" /> Fotos del platillo</p><p className="text-[10px] text-[#6B4028] mt-0.5">Sube varias y elige cuál será la principal.</p></div>
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(event) => void handlePhotoFiles(event.target.files)} />
                  <button type="button" disabled={photoBusy || !isPersistedItem(editingItem)} onClick={() => fileInputRef.current?.click()} className="px-3 py-2 rounded-xl bg-[#3A2418] text-white text-[10px] font-bold disabled:opacity-40 cursor-pointer inline-flex items-center gap-1.5">{photoBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Subir fotos</button>
                </div>

                {!isPersistedItem(editingItem) && <div className="rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-[10px] text-amber-900">Guarda primero el producto nuevo; después abre “Editar” y podrás subir sus fotos.</div>}

                {!!editingItem.imageUrls?.length ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {editingItem.imageUrls.map((url) => {
                      const isPrimary = editingItem.primaryImageUrl === url;
                      return <div key={url} className={`relative rounded-xl overflow-hidden border-2 bg-[#FAF5ED] ${isPrimary ? 'border-[#C9974D]' : 'border-transparent'}`}>
                        <img src={url} alt={editingItem.name} loading="lazy" decoding="async" className="w-full aspect-square object-cover" />
                        {isPrimary && <span className="absolute top-1.5 left-1.5 px-2 py-1 rounded-lg bg-[#3A2418] text-white text-[9px] font-bold">★ Principal</span>}
                        <div className="absolute inset-x-1.5 bottom-1.5 grid grid-cols-2 gap-1">
                          <button type="button" disabled={photoBusy || isPrimary} onClick={() => void setPrimaryPhoto(url)} className="py-1.5 rounded-lg bg-white/95 text-[#3A2418] text-[9px] font-bold disabled:opacity-60 cursor-pointer">Principal</button>
                          <button type="button" disabled={photoBusy} onClick={() => void removePhoto(url)} className="py-1.5 rounded-lg bg-rose-700/95 text-white text-[9px] font-bold disabled:opacity-60 cursor-pointer">Eliminar</button>
                        </div>
                      </div>;
                    })}
                  </div>
                ) : <div className="rounded-xl border border-dashed border-[#DEC8AE] bg-[#FFFDF9] p-5 text-center"><ImageIcon className="w-5 h-5 mx-auto text-[#A86B3D] mb-1" /><p className="text-[10px] text-[#6B4028]">Todavía no hay fotos.</p></div>}
                <p className="text-[9px] text-[#8A6A55]">JPG, PNG o WEBP · máximo 8 MB por foto · hasta 6 fotos por selección.</p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button type="button" disabled={busy || photoBusy} onClick={() => setEditingItem(null)} className="py-3 rounded-xl border border-[#DEC8AE] bg-white text-[#6B4028] font-bold text-xs disabled:opacity-50 cursor-pointer">Cancelar</button>
                <button type="submit" disabled={busy || photoBusy} className="py-3 rounded-xl bg-[#3A2418] text-white font-bold text-xs disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[90] bg-[#2B1B13]/80 backdrop-blur-md p-4 flex items-center justify-center">
          <div className="w-full max-w-md bg-[#FFF7EA] rounded-3xl border border-[#E8D4BE] shadow-2xl overflow-hidden">
            <div className="bg-[#3A2418] text-white p-5 flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center shrink-0"><Trash2 className="w-5 h-5" /></div><div><h3 className="font-serif font-bold text-lg">Eliminar del catálogo</h3><p className="text-[11px] text-[#F4E3C8]">Esta acción sí elimina el registro administrativo.</p></div></div>
            <div className="p-5 space-y-4"><p className="text-sm text-[#2B1B13]">¿Estás seguro de que deseas eliminar <strong>{deleteTarget.name}</strong>?</p><div className="grid grid-cols-2 gap-3"><button type="button" disabled={busy} onClick={() => setDeleteTarget(null)} className="py-3 rounded-xl border border-[#DEC8AE] bg-white text-[#6B4028] font-bold text-xs disabled:opacity-50 cursor-pointer">Cancelar</button><button type="button" disabled={busy} onClick={confirmDelete} className="py-3 rounded-xl bg-rose-700 text-white font-bold text-xs disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Sí, eliminar</button></div></div>
          </div>
        </div>
      )}
    </div>
  );
};