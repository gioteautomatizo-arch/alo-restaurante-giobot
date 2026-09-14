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

const parseOptions = (value: string): string[] | undefined => {
  const options = value
    .split(/\r?\n/)
    .map((option) => option.trim())
    .filter(Boolean);
  return options.length ? Array.from(new Set(options)) : undefined;
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
  const [quickPhotoTarget, setQuickPhotoTarget] = useState<ManagedMenuItem | null>(null);
  const [sizePhotoTarget, setSizePhotoTarget] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const quickPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const sizePhotoInputRef = useRef<HTMLInputElement | null>(null);

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
        (item.options || []).some((option) => option.toLowerCase().includes(term)) ||
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

  const handleQuickPhoto = async (files: FileList | null) => {
    const item = quickPhotoTarget;
    if (!item || !files?.length || busyItemId) return;
    const file = files[0];
    const validationError = validateMenuImage(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusyItemId(item.id);
    setError(null);
    try {
      const url = await uploadMenuImage(item.id, file);
      const imageUrls = Array.from(new Set([...(item.imageUrls || []), url]));
      await upsertManagedMenuItem({ ...item, imageUrls, primaryImageUrl: url }, currentUser);
      showSuccess(`Foto de “${item.name}” actualizada.`);
    } catch (err: any) {
      setError(err?.message || 'No se pudo subir la foto.');
    } finally {
      setBusyItemId(null);
      setQuickPhotoTarget(null);
      if (quickPhotoInputRef.current) quickPhotoInputRef.current.value = '';
    }
  };

  const openQuickPhotoPicker = (item: ManagedMenuItem) => {
    if (busyItemId) return;
    setQuickPhotoTarget(item);
    window.setTimeout(() => quickPhotoInputRef.current?.click(), 0);
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
      for (const file of selected) uploadedUrls.push(await uploadMenuImage(editingItem.id, file));
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

  const handleSizePhoto = async (files: FileList | null) => {
    if (!editingItem || !sizePhotoTarget || !files?.length || photoBusy) return;
    const persisted = persistedVersion(editingItem);
    if (!persisted) return;
    const file = files[0];
    const validationError = validateMenuImage(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    const sizeName = sizePhotoTarget;
    setPhotoBusy(true);
    setError(null);
    try {
      const url = await uploadMenuImage(`${editingItem.id}-${sizeName}`, file);
      const imageUrls = Array.from(new Set([...(persisted.imageUrls || []), url]));
      const sizeImageUrls = { ...(persisted.sizeImageUrls || {}), [sizeName]: url };
      await upsertManagedMenuItem({ ...persisted, imageUrls, sizeImageUrls }, currentUser);
      setEditingItem((current) => current ? { ...current, imageUrls, sizeImageUrls } : current);
      showSuccess(`Foto del tamaño ${sizeName} actualizada.`);
    } catch (err: any) {
      setError(err?.message || 'No se pudo subir la foto del tamaño.');
    } finally {
      setPhotoBusy(false);
      setSizePhotoTarget(null);
      if (sizePhotoInputRef.current) sizePhotoInputRef.current.value = '';
    }
  };

  const openSizePhotoPicker = (sizeName: string) => {
    setSizePhotoTarget(sizeName);
    window.setTimeout(() => sizePhotoInputRef.current?.click(), 0);
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
    const sizeImageUrls = Object.fromEntries(
      Object.entries(persisted.sizeImageUrls || {}).filter(([, value]) => value !== url)
    );

    setPhotoBusy(true);
    setError(null);
    try {
      await upsertManagedMenuItem({ ...persisted, imageUrls, primaryImageUrl, sizeImageUrls }, currentUser);
      setEditingItem((current) => current ? { ...current, imageUrls, primaryImageUrl, sizeImageUrls } : current);
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
          <div>
            <h3 className="font-serif font-bold">Administrar Menú</h3>
            <p className="text-xs mt-1">Esta sección está disponible únicamente para Dueña y Administrador.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <input ref={quickPhotoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void handleQuickPhoto(event.target.files)} />

      {success && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />{success}
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900 text-xs font-medium flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5" />{error}
        </div>
      )}

      <section className="rounded-3xl bg-[#3A2418] text-[#FFF7EA] border border-[#4E3222] shadow-md p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-[#C9974D] text-[11px] font-bold uppercase tracking-wider mb-1"><Utensils className="w-4 h-4" /> Gestor visual</div>
            <h2 className="font-serif font-bold text-2xl">Administrar Menú</h2>
            <p className="text-xs sm:text-sm text-[#F4E3C8]/85 mt-1">La tarjeta muestra una vista muy cercana a la que verá el cliente.</p>
          </div>
          {catalog && (
            <button type="button" onClick={openNewItem} className="px-4 py-3 rounded-2xl bg-[#C9974D] text-[#2B1B13] font-bold text-xs flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" /> Agregar platillo
            </button>
          )}
        </div>
      </section>

      {!initialSnapshotReceived ? (
        <div className="rounded-3xl border border-[#F4E3C8] bg-white p-10 text-center"><Loader2 className="w-7 h-7 animate-spin mx-auto mb-3 text-[#C9974D]" />Leyendo catálogo…</div>
      ) : !catalog ? (
        <section className="rounded-3xl border border-[#E8D4BE] bg-white p-8 text-center">
          <Utensils className="w-7 h-7 text-[#A86B3D] mx-auto mb-3" />
          <h3 className="font-serif font-bold text-xl">El catálogo dinámico todavía está vacío</h3>
          <button type="button" disabled={busy} onClick={handleInitialize} className="mt-5 px-5 py-3 rounded-2xl bg-[#3A2418] text-[#FFF7EA] font-bold text-xs">Cargar menú original</button>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl border border-[#F4E3C8] p-4"><span className="text-[10px] uppercase font-bold text-[#A86B3D]">Catálogo</span><strong className="block text-xl font-serif">{stats.total}</strong></div>
            <div className="bg-white rounded-2xl border border-[#F4E3C8] p-4"><span className="text-[10px] uppercase font-bold text-emerald-700">Activos</span><strong className="block text-xl font-serif">{stats.active}</strong></div>
            <div className="bg-white rounded-2xl border border-[#F4E3C8] p-4"><span className="text-[10px] uppercase font-bold text-rose-700">Agotados</span><strong className="block text-xl font-serif">{stats.soldOut}</strong></div>
            <div className="bg-white rounded-2xl border border-[#F4E3C8] p-4"><span className="text-[10px] uppercase font-bold text-amber-700">Precio por revisar</span><strong className="block text-xl font-serif">{stats.pendingPrice}</strong></div>
          </div>

          <div className="bg-white rounded-3xl border border-[#F4E3C8] p-4 space-y-3">
            <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#A86B3D]" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar platillo, bebida, sabor o categoría…" className="w-full pl-9 pr-4 py-2.5 rounded-2xl border border-[#E8D4BE] bg-[#FFFDF9] text-sm" /></div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button type="button" onClick={() => setCategory('all')} className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap ${category === 'all' ? 'bg-[#3A2418] text-white' : 'bg-[#FFF7EA] text-[#6B4028]'}`}>Todo</button>
              {CATEGORY_OPTIONS.map((option) => (
                <button type="button" key={option.id} onClick={() => setCategory(option.id)} className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap ${category === option.id ? 'bg-[#3A2418] text-white' : 'bg-[#FFF7EA] text-[#6B4028]'}`}>{option.label}</button>
              ))}
            </div>
          </div>

          {visibleItems.length === 0 ? (
            <div className="rounded-3xl border bg-white p-10 text-center">No hay productos que coincidan.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {visibleItems.map((item) => {
                const itemBusy = busyItemId === item.id;
                return (
                  <article key={item.id} className="bg-[#FFFDF9] rounded-2xl border border-[#DEC8AE] overflow-hidden shadow-xs flex flex-col">
                    <button type="button" disabled={itemBusy} onClick={() => openQuickPhotoPicker(item)} className="relative aspect-[4/3] w-full bg-[#F4E3C8]/35 overflow-hidden p-1.5 text-left disabled:opacity-60 group">
                      {item.primaryImageUrl ? (
                        <img src={item.primaryImageUrl} alt={item.name} className="w-full h-full object-contain rounded-xl" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-[#A86B3D] gap-2 bg-gradient-to-br from-[#FFF7EA] to-[#F4E3C8] rounded-xl">
                          <ImageIcon className="w-7 h-7" />
                          <span className="text-[11px] font-bold">Sin foto todavía</span>
                        </div>
                      )}

                      <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
                        {!item.active && <span className="px-2 py-1 rounded-lg bg-stone-900/80 text-white text-[10px] font-bold">Oculto</span>}
                        {!item.available && <span className="px-2 py-1 rounded-lg bg-rose-700 text-white text-[10px] font-bold">Agotado</span>}
                        {item.popular && <span className="px-2 py-1 rounded-lg bg-[#C9974D] text-[#3A2418] text-[10px] font-bold">★ Destacado</span>}
                      </div>

                      <span className="absolute bottom-2.5 right-2.5 bg-[#3A2418]/95 px-2.5 py-1 rounded-xl font-serif font-black text-xs text-[#F4E3C8] border border-[#C9974D]/30">
                        {formatPrice(item)}{item.sizes?.length ? <small className="font-sans font-normal"> (desde)</small> : null}
                      </span>

                      <span className="absolute bottom-2.5 left-2.5 px-2 py-1 rounded-lg bg-white/95 border border-[#DEC8AE] text-[#6B4028] text-[9px] font-bold flex items-center gap-1">
                        <Camera className="w-3 h-3" /> Cambiar foto
                      </span>

                      {itemBusy && <span className="absolute inset-0 bg-white/80 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#A86B3D]" /></span>}
                    </button>

                    <div className="p-4 flex-1 flex flex-col gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase text-[#A86B3D]">{categoryLabel(item.category)}</p>
                        <h3 className="font-serif font-bold text-base text-[#2B1B13]">{item.name}</h3>
                        <p className="text-xs text-[#6B4028] mt-1 line-clamp-2">{item.description || 'Sin descripción.'}</p>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {!!item.sizes?.length && <span className="px-2 py-1 rounded-lg bg-[#FFF7EA] text-[10px] text-[#6B4028]">{item.sizes.length} tamaños</span>}
                        {!!item.options?.length && <span className="px-2 py-1 rounded-lg bg-[#FFF7EA] text-[10px] text-[#6B4028]">{item.options.length} sabores/opciones</span>}
                      </div>

                      <div className="mt-auto grid grid-cols-2 gap-2">
                        <button type="button" disabled={itemBusy} onClick={() => quickUpdate(item, { active: !item.active }, item.active ? 'Producto ocultado.' : 'Producto activado.')} className="py-2 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1">{item.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}{item.active ? 'Visible' : 'Oculto'}</button>
                        <button type="button" disabled={itemBusy} onClick={() => quickUpdate(item, { available: !item.available }, item.available ? 'Producto marcado como agotado.' : 'Producto disponible.')} className="py-2 rounded-xl border text-[11px] font-bold">{item.available ? 'Disponible' : 'Agotado'}</button>
                        <button type="button" disabled={itemBusy} onClick={() => quickUpdate(item, { popular: !item.popular }, item.popular ? 'Se quitó de destacados.' : 'Producto destacado.')} className="py-2 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1"><Star className="w-3.5 h-3.5" />{item.popular ? 'Destacado' : 'Destacar'}</button>
                        <button type="button" onClick={() => setEditingItem({ ...item, imageUrls: [...(item.imageUrls || [])], sizeImageUrls: { ...(item.sizeImageUrls || {}) }, options: item.options ? [...item.options] : undefined })} className="py-2 rounded-xl bg-[#3A2418] text-white text-[11px] font-bold flex items-center justify-center gap-1"><Edit3 className="w-3.5 h-3.5" />Editar</button>
                      </div>

                      <button type="button" onClick={() => setDeleteTarget(item)} className="text-[10px] text-rose-700 flex items-center justify-center gap-1"><Trash2 className="w-3 h-3" />Eliminar del catálogo</button>
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
          <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto bg-[#FFF7EA] rounded-3xl border shadow-2xl">
            <div className="sticky top-0 bg-[#3A2418] text-white px-5 py-4 flex justify-between z-10">
              <div><h3 className="font-serif font-bold text-lg">{isPersistedItem(editingItem) ? 'Editar producto' : 'Nuevo producto'}</h3><p className="text-[11px] text-[#F4E3C8]">Datos, sabores, tamaños y galería.</p></div>
              <button type="button" onClick={() => setEditingItem(null)}><X className="w-4 h-4" /></button>
            </div>

            <form onSubmit={saveEditingItem} className="p-5 space-y-4">
              <div><label className="block text-[11px] font-bold uppercase mb-1">Nombre *</label><input required value={editingItem.name} onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })} className="w-full px-3.5 py-2.5 rounded-xl border bg-white text-sm" /></div>

              <div className="grid grid-cols-2 gap-3">
                <select value={editingItem.category} onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value as CategoryId })} className="px-3 py-2.5 rounded-xl border bg-white text-sm">
                  {CATEGORY_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
                <input type="number" min="0" value={editingItem.price ?? ''} onChange={(e) => setEditingItem({ ...editingItem, price: e.target.value === '' ? null : Number(e.target.value) })} className="px-3 py-2.5 rounded-xl border bg-white text-sm" placeholder="Precio base" />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase mb-1">Descripción</label>
                <textarea rows={3} value={editingItem.description} onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })} className="w-full px-3.5 py-2.5 rounded-xl border bg-white text-sm" placeholder="Descripción visible para el cliente" />
              </div>

              <div className="rounded-2xl border border-[#E8D4BE] bg-white p-3">
                <label className="block text-[11px] font-bold uppercase text-[#6B4028]">Sabores / opciones</label>
                <p className="text-[10px] text-[#8A6A55] mt-0.5 mb-2">Escribe una opción por línea. Ejemplo: Naranja, Zanahoria, Guayaba. Estas son las opciones que podrá elegir el cliente.</p>
                <textarea
                  rows={4}
                  value={(editingItem.options || []).join('\n')}
                  onChange={(e) => setEditingItem({ ...editingItem, options: parseOptions(e.target.value) })}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#DEC8AE] bg-[#FFFDF9] text-sm"
                  placeholder={'Naranja\nZanahoria\nGuayaba'}
                />
                {!!editingItem.options?.length && <p className="text-[10px] font-bold text-[#A86B3D] mt-2">El cliente verá {editingItem.options.length} opción{editingItem.options.length === 1 ? '' : 'es'}.</p>}
              </div>

              {!!editingItem.sizes?.length && (
                <div className="rounded-2xl border bg-white p-3 space-y-2">
                  <div><p className="text-xs font-bold">Fotos por tamaño</p><p className="text-[10px] text-[#6B4028]">La imagen se muestra completa, igual que al cliente.</p></div>
                  <input ref={sizePhotoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void handleSizePhoto(e.target.files)} />
                  <div className="grid grid-cols-3 gap-2">
                    {editingItem.sizes.map((size) => {
                      const image = editingItem.sizeImageUrls?.[size.name] || editingItem.primaryImageUrl;
                      return (
                        <button key={size.name} type="button" disabled={photoBusy || !isPersistedItem(editingItem)} onClick={() => openSizePhotoPicker(size.name)} className="rounded-xl border overflow-hidden bg-[#FFF7EA] text-left disabled:opacity-50">
                          {image ? <div className="aspect-[4/3] p-1 bg-[#F4E3C8]/30"><img src={image} alt={size.name} className="w-full h-full object-contain rounded-lg" /></div> : <div className="aspect-[4/3] flex items-center justify-center"><Camera className="w-5 h-5 text-[#A86B3D]" /></div>}
                          <div className="p-2"><strong className="block text-[10px]">{size.name}</strong><span className="text-[9px] text-[#6B4028]">{size.price == null ? 'Precio pendiente' : `$${size.price}`} · Cambiar foto</span></div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="rounded-2xl border bg-white p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div><p className="text-xs font-bold flex items-center gap-1"><Camera className="w-4 h-4" />Fotos del producto</p><p className="text-[10px] text-[#6B4028]">Galería general y foto principal.</p></div>
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => void handlePhotoFiles(e.target.files)} />
                  <button type="button" disabled={photoBusy || !isPersistedItem(editingItem)} onClick={() => fileInputRef.current?.click()} className="px-3 py-2 rounded-xl bg-[#3A2418] text-white text-[10px] font-bold"><Plus className="w-3 h-3 inline" /> Subir fotos</button>
                </div>

                {!!editingItem.imageUrls?.length ? (
                  <div className="grid grid-cols-3 gap-2">
                    {editingItem.imageUrls.map((url) => {
                      const primary = editingItem.primaryImageUrl === url;
                      return (
                        <div key={url} className={`relative rounded-xl overflow-hidden border-2 bg-[#F4E3C8]/30 ${primary ? 'border-[#C9974D]' : 'border-transparent'}`}>
                          <div className="aspect-[4/3] p-1"><img src={url} alt={editingItem.name} className="w-full h-full object-contain rounded-lg" /></div>
                          {primary && <span className="absolute top-1 left-1 bg-[#3A2418] text-white text-[8px] px-1.5 py-1 rounded">Principal</span>}
                          <div className="absolute bottom-1 inset-x-1 grid grid-cols-2 gap-1">
                            <button type="button" disabled={primary || photoBusy} onClick={() => void setPrimaryPhoto(url)} className="bg-white text-[8px] py-1 rounded">Principal</button>
                            <button type="button" disabled={photoBusy} onClick={() => void removePhoto(url)} className="bg-rose-700 text-white text-[8px] py-1 rounded">Eliminar</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="border border-dashed rounded-xl p-4 text-center text-[10px] text-[#6B4028]">Todavía no hay fotos.</div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button type="button" disabled={busy || photoBusy} onClick={() => setEditingItem(null)} className="py-3 rounded-xl border bg-white text-xs font-bold">Cancelar</button>
                <button type="submit" disabled={busy || photoBusy} className="py-3 rounded-xl bg-[#3A2418] text-white text-xs font-bold">{busy ? 'Guardando…' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[90] bg-[#2B1B13]/80 p-4 flex items-center justify-center">
          <div className="w-full max-w-md bg-[#FFF7EA] rounded-3xl overflow-hidden">
            <div className="bg-[#3A2418] text-white p-5"><h3 className="font-serif font-bold text-lg">Eliminar del catálogo</h3></div>
            <div className="p-5 space-y-4">
              <p>¿Eliminar <strong>{deleteTarget.name}</strong>?</p>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setDeleteTarget(null)} className="py-3 border rounded-xl">Cancelar</button>
                <button type="button" disabled={busy} onClick={confirmDelete} className="py-3 bg-rose-700 text-white rounded-xl">Sí, eliminar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};