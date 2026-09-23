import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Plus, Save, Trash2, Utensils } from 'lucide-react';
import type { BusinessCatalogItem } from '../../lib/businessCatalogService';
import {
  createCatalogItemId,
  saveBusinessCatalog,
  subscribeToBusinessCatalog,
} from '../../lib/businessCatalogService';
import { getBusinessCatalogTemplate } from '../../data/businessCatalogTemplates';

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
}> = ({ businessId, businessName, onBack }) => {
  const [items, setItems] = useState<BusinessCatalogItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    return subscribeToBusinessCatalog(
      businessId,
      (catalog) => {
        setItems(catalog?.items || []);
        setLoaded(true);
      },
      () => setMessage('No pudimos cargar el catálogo.')
    );
  }, [businessId]);

  const categories = useMemo(
    () => Array.from(new Set(items.map((item) => item.category).filter(Boolean))),
    [items]
  );

  const updateItem = (id: string, patch: Partial<BusinessCatalogItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    setMessage('');
  };

  const addItem = () => {
    setItems((current) => [...current, emptyItem(current.length ? Math.max(...current.map((i) => i.sortOrder)) + 10 : 10)]);
  };

  const removeItem = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  };

  const loadTemplate = () => {
    const template = getBusinessCatalogTemplate('creperia');
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
    } catch (error) {
      console.error(error);
      setMessage('No pudimos guardar el catálogo. Revisa tu conexión y permisos.');
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return <div className="min-h-screen bg-[#F5F1EA] flex items-center justify-center text-[#6B4028]">Cargando catálogo…</div>;
  }

  return (
    <div className="min-h-screen bg-[#F5F1EA] text-[#201610]">
      <header className="border-b border-[#E5D6C4] bg-white px-4 py-4 shadow-sm">
        <div className="mx-auto max-w-6xl flex items-center justify-between gap-3">
          <button onClick={onBack} className="rounded-xl border border-[#DEC8AE] bg-white px-3 py-2 text-xs font-bold text-[#6B4028] flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Negocio
          </button>
          <button onClick={save} disabled={saving} className="rounded-xl bg-[#3A2418] px-4 py-2 text-xs font-black text-white flex items-center gap-2 disabled:opacity-60">
            <Save className="w-4 h-4" /> {saving ? 'Guardando…' : 'Guardar catálogo'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-7 sm:py-10">
        <div className="rounded-[2rem] border border-[#D9C5AC] bg-white p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#A86B3D]">Catálogo</span>
              <h1 className="mt-1 font-serif text-3xl font-black">{businessName}</h1>
              <p className="mt-1 text-sm text-[#6B4028]">Administra productos, precios, categorías y disponibilidad.</p>
            </div>
            <div className="flex gap-2">
              {items.length === 0 && (
                <button onClick={loadTemplate} className="rounded-xl border border-[#DEC8AE] px-4 py-2 text-xs font-black text-[#6B4028]">Usar plantilla de crepería</button>
              )}
              <button onClick={addItem} className="rounded-xl bg-[#A86B3D] px-4 py-2 text-xs font-black text-white flex items-center gap-2"><Plus className="w-4 h-4" /> Producto</button>
            </div>
          </div>

          {message && <div className="mt-5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs font-bold text-amber-900">{message}</div>}

          {items.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-[#D9C5AC] p-10 text-center">
              <Utensils className="mx-auto w-8 h-8 text-[#A86B3D]" />
              <p className="mt-3 font-serif text-xl font-black">Tu catálogo está vacío</p>
              <p className="mt-1 text-sm text-[#6B4028]">Agrega tu primer producto o carga una plantilla.</p>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {items.map((item) => (
                <div key={item.id} className="rounded-2xl border border-[#E8D8C4] bg-[#FFFDF9] p-4 sm:p-5">
                  <div className="grid gap-3 md:grid-cols-12">
                    <input value={item.name} onChange={(e) => updateItem(item.id, { name: e.target.value })} placeholder="Nombre del producto" className="md:col-span-4 rounded-xl border border-[#DEC8AE] bg-white px-3 py-2 text-sm outline-none focus:border-[#A86B3D]" />
                    <input value={item.category} onChange={(e) => updateItem(item.id, { category: e.target.value })} placeholder="Categoría" className="md:col-span-3 rounded-xl border border-[#DEC8AE] bg-white px-3 py-2 text-sm outline-none focus:border-[#A86B3D]" />
                    <input type="number" min="0" step="0.01" value={item.price ?? ''} onChange={(e) => updateItem(item.id, { price: e.target.value === '' ? null : Number(e.target.value) })} placeholder="Precio" className="md:col-span-2 rounded-xl border border-[#DEC8AE] bg-white px-3 py-2 text-sm outline-none focus:border-[#A86B3D]" />
                    <label className="md:col-span-2 flex items-center gap-2 rounded-xl border border-[#DEC8AE] px-3 text-xs font-bold">
                      <input type="checkbox" checked={item.available} onChange={(e) => updateItem(item.id, { available: e.target.checked })} />
                      Disponible
                    </label>
                    <button onClick={() => removeItem(item.id)} className="rounded-xl border border-red-200 px-3 py-2 text-red-700 hover:bg-red-50" title="Eliminar producto"><Trash2 className="mx-auto w-4 h-4" /></button>
                    <textarea value={item.description} onChange={(e) => updateItem(item.id, { description: e.target.value })} placeholder="Descripción del producto" className="md:col-span-10 min-h-20 rounded-xl border border-[#DEC8AE] bg-white px-3 py-2 text-sm outline-none focus:border-[#A86B3D]" />
                    <label className="md:col-span-2 flex items-center gap-2 text-xs font-bold">
                      <input type="checkbox" checked={!!item.popular} onChange={(e) => updateItem(item.id, { popular: e.target.checked })} />
                      Popular
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}

          {categories.length > 0 && <p className="mt-6 text-xs text-[#6B4028]">Categorías: {categories.join(' · ')}</p>}
        </div>
      </main>
    </div>
  );
};
