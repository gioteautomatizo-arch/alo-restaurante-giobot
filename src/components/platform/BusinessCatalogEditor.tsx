import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ImagePlus, Loader2, Plus, Save, Trash2, Utensils, ClipboardPaste, ChevronDown, ListPlus, X } from 'lucide-react';
import { uploadMenuImage } from '../../lib/menuImagesService';
import { BusinessMenuPasteImport } from './BusinessMenuPasteImport';
import type { ParsedMenuItem } from '../../lib/menuTextParser';
import type { BusinessCatalogItem, CatalogOptionGroup } from '../../lib/businessCatalogService';
import {
  createCatalogItemId,
  ensureUniqueIds,
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
  const [openOptions, setOpenOptions] = useState<Record<string, boolean>>({});

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
        setItems(ensureUniqueIds(catalog?.items || []));
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

  const newGroup = (kind: 'sabor' | 'extras' | 'paquete' | 'vacio'): CatalogOptionGroup => {
    const id = `g-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    if (kind === 'extras') return { id, name: 'Extras', required: false, multiple: true, choices: [{ name: '', price: 0 }] };
    if (kind === 'paquete') return { id, name: '¿Lo quieres en paquete?', required: false, multiple: false, choices: [{ name: 'Solo el platillo', price: 0 }, { name: 'En paquete', price: 0 }] };
    if (kind === 'sabor') return { id, name: 'Elige una opción', required: true, multiple: false, choices: [{ name: '', price: 0 }, { name: '', price: 0 }] };
    return { id, name: '', required: false, multiple: false, choices: [{ name: '', price: 0 }] };
  };

  const setGroups = (item: BusinessCatalogItem, groups: CatalogOptionGroup[]) => updateItem(item.id, { optionGroups: groups });
  const patchGroup = (item: BusinessCatalogItem, groupId: string, patch: Partial<CatalogOptionGroup>) =>
    setGroups(item, (item.optionGroups || []).map((g) => (g.id === groupId ? { ...g, ...patch } : g)));
  const patchChoice = (item: BusinessCatalogItem, groupId: string, index: number, patch: Partial<{ name: string; price: number }>) =>
    setGroups(item, (item.optionGroups || []).map((g) => (g.id === groupId ? { ...g, choices: g.choices.map((c, i) => (i === index ? { ...c, ...patch } : c)) } : g)));

  const applyPasted = (parsed: ParsedMenuItem[], mode: 'add' | 'replace') => {
    const base = mode === 'replace' ? [] : items;
    let order = base.length ? Math.max(...base.map((i) => i.sortOrder)) : 0;
    const added: BusinessCatalogItem[] = parsed.map((p) => {
      order += 10;
      const optionGroups = p.options.length >= 2
        ? [{ id: `g-${Date.now().toString(36)}${order}`, name: 'Elige una opción', required: true, multiple: false, choices: p.options.map((name) => ({ name, price: 0 })) }]
        : undefined;
      return { id: createCatalogItemId(p.name), name: p.name, description: p.description, price: p.price, category: p.category || 'General', available: true, popular: false, sortOrder: order, ...(optionGroups ? { optionGroups } : {}) };
    });
    setItems(ensureUniqueIds([...base, ...added]));
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
    setItems(ensureUniqueIds(nextItems));
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
                <button type="button" onClick={() => setOpenOptions((c) => ({ ...c, [item.id]: !c[item.id] }))} className="mt-2 flex w-full items-center justify-between rounded-xl border border-[#3A3022] bg-[#0B0B0B] px-3 py-2.5 text-xs font-bold text-[#E3BC6B]">
                  <span className="flex items-center gap-2"><ListPlus className="h-4 w-4" /> Opciones del producto {(item.optionGroups || []).length > 0 && `(${(item.optionGroups || []).length})`}</span>
                  <ChevronDown className={`h-4 w-4 transition ${openOptions[item.id] ? 'rotate-180' : ''}`} />
                </button>
                {openOptions[item.id] && (
                  <div className="mt-2 space-y-3 rounded-xl border border-[#3A3022] bg-[#0B0B0B] p-3">
                    <p className="text-[11px] leading-relaxed text-[#C8C8C8]">Para que el cliente elija, por ejemplo, <b>nopales, pollo o chorizo</b>, o si lo quiere <b>en paquete</b>. El precio de arriba es el precio base; cada opción puede sumar un precio extra.</p>
                    {(item.optionGroups || []).map((group) => (
                      <div key={group.id} className="rounded-xl border border-[#3A3022] bg-[#111111] p-3">
                        <div className="flex gap-2">
                          <input value={group.name} onChange={(e) => patchGroup(item, group.id, { name: e.target.value })} placeholder="Título (ej. Guiso, Extras)" className={field} />
                          <button type="button" onClick={() => setGroups(item, (item.optionGroups || []).filter((g) => g.id !== group.id))} className="shrink-0 rounded-lg border border-red-500/50 px-3 text-red-400" title="Quitar este grupo"><Trash2 className="h-4 w-4" /></button>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                          <button type="button" onClick={() => patchGroup(item, group.id, { required: !group.required })} className={`rounded-lg border px-3 py-2 ${group.required ? 'border-[#D6A34A] text-[#E3BC6B]' : 'border-[#3A3022] text-[#C8C8C8]'}`}>{group.required ? 'Obligatorio' : 'Opcional'}</button>
                          <button type="button" onClick={() => patchGroup(item, group.id, { multiple: !group.multiple })} className={`rounded-lg border px-3 py-2 ${group.multiple ? 'border-[#D6A34A] text-[#E3BC6B]' : 'border-[#3A3022] text-[#C8C8C8]'}`}>{group.multiple ? 'Puede elegir varias' : 'Elige solo una'}</button>
                        </div>
                        <div className="mt-2 space-y-2">
                          {group.choices.map((choice, index) => (
                            <div key={index} className="flex gap-2">
                              <input value={choice.name} onChange={(e) => patchChoice(item, group.id, index, { name: e.target.value })} placeholder="Opción (ej. Nopales)" className={`${field} flex-1`} />
                              <input type="number" inputMode="decimal" min="0" step="0.01" value={choice.price || ''} onChange={(e) => patchChoice(item, group.id, index, { price: e.target.value === '' ? 0 : Number(e.target.value) })} placeholder="+$0" className={`${field} w-24`} />
                              <button type="button" onClick={() => patchGroup(item, group.id, { choices: group.choices.filter((_, i) => i !== index) })} className="shrink-0 rounded-lg border border-[#3A3022] px-2.5 text-[#C8C8C8]" title="Quitar opción"><X className="h-4 w-4" /></button>
                            </div>
                          ))}
                          <button type="button" onClick={() => patchGroup(item, group.id, { choices: [...group.choices, { name: '', price: 0 }] })} className="text-xs font-bold text-[#E3BC6B]">+ Agregar opción</button>
                        </div>
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-2 text-xs font-bold">
                      <button type="button" onClick={() => setGroups(item, [...(item.optionGroups || []), newGroup('sabor')])} className="rounded-lg border border-[#D6A34A] px-3 py-2 text-[#E3BC6B]">+ Elegir guiso o sabor</button>
                      <button type="button" onClick={() => setGroups(item, [...(item.optionGroups || []), newGroup('paquete')])} className="rounded-lg border border-[#3A3022] px-3 py-2 text-[#C8C8C8]">+ ¿En paquete?</button>
                      <button type="button" onClick={() => setGroups(item, [...(item.optionGroups || []), newGroup('extras')])} className="rounded-lg border border-[#3A3022] px-3 py-2 text-[#C8C8C8]">+ Extras</button>
                    </div>
                  </div>
                )}
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
