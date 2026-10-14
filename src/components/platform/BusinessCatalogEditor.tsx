import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ImagePlus, Loader2, Plus, Save, Trash2, Utensils, ClipboardPaste } from 'lucide-react';
import { uploadMenuImage } from '../../lib/menuImagesService';
import { BusinessMenuPasteImport } from './BusinessMenuPasteImport';
import type { ParsedMenuItem } from '../../lib/menuTextParser';
import type { BusinessCatalogItem } from '../../lib/businessCatalogService';
import {
  createCatalogItemId,
  saveBusinessCatalog,
  subscribeToBusinessCatalog,
} from '../../lib/businessCatalogService';
import { getBusinessCatalogTemplate } from '../../data/businessCatalogTemplates';
import { getBusinessForUser } from '../../lib/businessAuthService';
import { subscribeToAuth } from '../../lib/firebase';

const emptyItem = (sortOrder: number): BusinessCatalogItem => ({
  id: createCatalogItemId('producto'),
  name: '',
  description: '',
  price: null,
  category: 'General',
  available: true,
  popular: false,
  sortOrder,
});

export const BusinessCatalogEditor: React.FC<{
  businessId: string;
  businessName: string;
  onBack: () => void;
  onImportFromPhoto?: () => void;
}> = ({ businessId, businessName, onBack }) => {
  const [items, setItems] = useState<BusinessCatalogItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [businessType, setBusinessType] = useState('restaurant');
  const [showPaste, setShowPaste] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = subscribeToAuth((user) => {
      if (!user) return;
      getBusinessForUser(user.uid, businessId).then((tenant) => {
        if (tenant?.businessType) setBusinessType(tenant.businessType);
      }).catch(() => undefined);
    });
    return () => unsubscribeAuth();
  }, [businessId]);

  useEffect(() => {
    return subscribeToBusinessCatalog(
      businessId,
      (catalog) => {
        setItems(catalog?.items || []);
        setLoaded(true);
      },
      (error: any) => {
        setMessage(`Error al cargar: ${error?.message || error?.code || 'desconocido'}`);
        setLoaded(true);
      }
    );
  }, [businessId]);

  const categories = useMemo(
    () => Array.from(new Set(items.map((item) => item.category).filter(Boolean))),
    [items]
  );

  const updateItem = (id: string, patch: Partial<BusinessCatalogItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    setMessage('');
    setDirty(true);
  };

  const addItem = () => {
    setItems((current) => [...current, emptyItem(current.length ? Math.max(...current.map((i) => i.sortOrder)) + 10 : 10)]);
    setDirty(true);
  };

  const removeItem = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    setDirty(true);
  };

  const uploadPhoto = async (id: string, file?: File | null) => {
    if (!file) return;
    setUploadingId(id);
    setMessage('');
    try {
      const url = await uploadMenuImage(id, file);
      updateItem(id, { imageUrl: url });
    } catch (error: any) {
      setMessage(error?.message || 'No pudimos subir la foto. Intenta de nuevo.');
    } finally {
      setUploadingId(null);
    }
  };

  const applyPasted = (parsed: ParsedMenuItem[], mode: 'add' | 'replace') => {
    const base = mode === 'replace' ? [] : items;
    let order = base.length ? Math.max(...base.map((i) => i.sortOrder)) : 0;
    const added: BusinessCatalogItem[] = parsed.map((p) => {
      order += 10;
      return { id: createCatalogItemId(p.name), name: p.name, description: p.description, price: p.price, category: p.category || 'General', available: true, popular: false, sortOrder: order };
    });
    setItems([...base, ...added]);
    setShowPaste(false);
    setDirty(true);
    setMessage(`Agregamos ${added.length} productos. Revisa, ponles foto y toca Guardar catálogo.`);
  };

  const loadTemplate = () => {
    const template = getBusinessCatalogTemplate(businessType);
    if (!template) return;
    const nextItems = template.items.map((item) => ({
      ...item,
      id: createCatalogItemId(item.name),
      available: true,
    }));
    setItems(nextItems);
    setMessage('Plantilla cargada. Guarda para publicarla en este negocio.');
  };

  const save = async () => {
    const cleaned = items
      .filter((item) => item.name.trim())
      .map((item, index) => ({
        ...item,
        name: item.name.trim(),
        description: item.description.trim(),
        category: item.category.trim() || 'General',
        price: item.price === null || Number.isNaN(Number(item.price)) ? null : Number(item.price),
        sortOrder: (index + 1) * 10,
      }));
    setSaving(true);
    setMessage('');
    try {
      await saveBusinessCatalog(businessId, cleaned, businessName);
      setMessage('Catálogo guardado correctamente.');
      setDirty(false);
    } catch (error) {
      console.error(error);
      setMessage('No pudimos guardar el catálogo. Revisa tu conexión y permisos.');
    } finally {
      setSaving(false);
    }
  };

  if (message && !loaded) {
    return <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6 text-center text-sm text-red-400">{message}</div>;
  }

  if (!loaded) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center text-[#C8C8C8] p-4 text-center">
        <div>Cargando catálogo…</div>
        {message && <div className="mt-2 text-sm text-red-400">{message}</div>}
      </div>
    );
  }

  const field = 'w-full rounded-xl border border-[#3A3022] bg-[#0B0B0B] px-3 py-2.5 text-sm text-[#F7F7F7] outline-none placeholder:text-[#8F8F8F] focus:border-[#D6A34A]';

  return (
    <div className="min-h-screen bg-[#050505] text-[#F7F7F7]">
      <header className="sticky top-0 z-20 border-b border-[#3A3022] bg-[#0B0B0B]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <button onClick={onBack} className="flex items-center gap-2 rounded-xl border border-[#3A3022] px-3 py-2 text-xs font-bold text-[#F7F7F7]">
            <ArrowLeft className="h-4 w-4" /> Negocio
          </button>
          <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-xl bg-[#D6A34A] px-4 py-2.5 text-xs font-black text-[#050505] disabled:opacity-60">
            <Save className="h-4 w-4" /> {saving ? 'Guardando…' : dirty ? 'Guardar cambios' : 'Guardar catálogo'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:py-9">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#D6A34A]">Catálogo</span>
          <h1 className="mt-1 font-serif text-3xl font-black text-[#F7F7F7]">{businessName}</h1>
          <p className="mt-1 text-sm text-[#C8C8C8]">{items.length} {items.length === 1 ? 'producto' : 'productos'} · toca la foto para cambiarla.</p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <button onClick={() => setShowPaste(true)} className="flex items-center justify-center gap-2 rounded-xl bg-[#D6A34A] px-4 py-3 text-xs font-black text-[#050505]"><ClipboardPaste className="h-4 w-4" /> Pegar mi menú</button>
          <button onClick={addItem} className="flex items-center justify-center gap-2 rounded-xl border border-[#D6A34A] px-4 py-3 text-xs font-black text-[#E3BC6B]"><Plus className="h-4 w-4" /> Producto</button>
          {items.length === 0 && (
            <button onClick={loadTemplate} className="col-span-2 rounded-xl border border-[#3A3022] px-4 py-3 text-xs font-bold text-[#C8C8C8]">Usar productos de ejemplo</button>
          )}
        </div>

        {message && <div className="mt-4 rounded-xl border border-[#D6A34A]/40 bg-[#111111] px-4 py-3 text-xs font-bold text-[#E3BC6B]">{message}</div>}

        {items.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-[#3A3022] bg-[#111111] p-10 text-center">
            <Utensils className="mx-auto h-8 w-8 text-[#D6A34A]" />
            <p className="mt-3 font-serif text-xl font-black text-[#F7F7F7]">Tu catálogo está vacío</p>
            <p className="mt-1 text-sm text-[#C8C8C8]">Toca <b>Pegar mi menú</b> para cargar todo de una vez, o agrega tu primer producto.</p>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-[#3A3022] bg-[#111111] p-3 sm:p-4">
                <div className="flex gap-3">
                  <label className="relative flex h-24 w-24 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-[#5A4A2E] bg-[#0B0B0B] sm:h-28 sm:w-28">
                    {item.imageUrl ? <img src={item.imageUrl} alt={item.name || 'Producto'} className="h-full w-full object-cover" /> : (
                      <span className="flex flex-col items-center gap-1 text-[10px] font-bold text-[#C8C8C8]"><ImagePlus className="h-5 w-5 text-[#D6A34A]" />Agregar foto</span>
                    )}
                    {uploadingId === item.id && <span className="absolute inset-0 flex items-center justify-center bg-black/70"><Loader2 className="h-6 w-6 animate-spin text-[#D6A34A]" /></span>}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { void uploadPhoto(item.id, e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                  <div className="min-w-0 flex-1 space-y-2">
                    <input value={item.name} onChange={(e) => updateItem(item.id, { name: e.target.value })} placeholder="Nombre del producto" className={field} />
                    <div className="grid grid-cols-5 gap-2">
                      <input list="catalog-categories" value={item.category} onChange={(e) => updateItem(item.id, { category: e.target.value })} placeholder="Categoría" className={`${field} col-span-3`} />
                      <input type="number" inputMode="decimal" min="0" step="0.01" value={item.price ?? ''} onChange={(e) => updateItem(item.id, { price: e.target.value === '' ? null : Number(e.target.value) })} placeholder="$ Precio" className={`${field} col-span-2`} />
                    </div>
                  </div>
                </div>
                <textarea value={item.description} onChange={(e) => updateItem(item.id, { description: e.target.value })} placeholder="Descripción (opcional)" rows={2} className={`${field} mt-2`} />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2 text-xs font-bold">
                    <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 ${item.available ? 'border-[#D6A34A] text-[#E3BC6B]' : 'border-[#3A3022] text-[#C8C8C8]'}`}>
                      <input type="checkbox" className="accent-[#D6A34A]" checked={item.available} onChange={(e) => updateItem(item.id, { available: e.target.checked })} /> Disponible
                    </label>
                    <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 ${item.popular ? 'border-[#D6A34A] text-[#E3BC6B]' : 'border-[#3A3022] text-[#C8C8C8]'}`}>
                      <input type="checkbox" className="accent-[#D6A34A]" checked={!!item.popular} onChange={(e) => updateItem(item.id, { popular: e.target.checked })} /> Popular
                    </label>
                  </div>
                  <div className="flex gap-2">
                    {item.imageUrl && <button onClick={() => updateItem(item.id, { imageUrl: undefined })} className="rounded-lg border border-[#3A3022] px-3 py-2 text-xs font-bold text-[#C8C8C8]">Quitar foto</button>}
                    <button onClick={() => removeItem(item.id)} className="rounded-lg border border-red-500/50 px-3 py-2 text-red-400" title="Eliminar producto"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <datalist id="catalog-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        {categories.length > 0 && <p className="mt-5 text-xs text-[#B7B7B7]">Categorías: {categories.join(' · ')}</p>}
      </main>

      {showPaste && <BusinessMenuPasteImport hasExisting={items.length > 0} onApply={applyPasted} onClose={() => setShowPaste(false)} />}
    </div>
  );
};
