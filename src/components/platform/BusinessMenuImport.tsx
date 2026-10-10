import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { auth } from '../../lib/firebase';
import { uploadBusinessMenuImage, validateMenuImage } from '../../lib/menuImagesService';
import {
  createCatalogItemId,
  saveBusinessCatalog,
  subscribeToBusinessCatalog,
} from '../../lib/businessCatalogService';
import type { BusinessCatalogDocument, BusinessCatalogItem } from '../../lib/businessCatalogService';
import {
  clearMenuImportDraft,
  getMenuImportDraft,
  saveMenuImportDraft,
} from '../../lib/businessMenuImportService';
import type { MenuImportDraftItem } from '../../lib/businessMenuImportService';

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

const SAVE_DELAY_MS = 1200;

function newDraftItem(category = ''): MenuImportDraftItem {
  return {
    id: `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    category,
    price: '',
    description: '',
  };
}

/** "65", "65.5", "65,50" y "$65" son válidos. Vacío = sin precio. undefined = inválido. */
function parsePrice(raw: string): number | null | undefined {
  const cleaned = raw.replace(/[$\s]/g, '').replace(',', '.');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : undefined;
}

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

function actorName(): string {
  const user = auth.currentUser;
  return user?.displayName || user?.email || 'Dueño del negocio';
}

const fieldClass =
  'w-full rounded-xl border border-[#3A3022] bg-[#0B0B0B] px-3 py-3 text-base text-[#F7F7F7] placeholder:text-[#8A8A8A] focus:border-[#D6A34A] focus:outline-none';
const labelClass = 'mb-1 block text-[11px] font-black uppercase tracking-wide text-[#B7B7B7]';

export const BusinessMenuImport: React.FC<{
  businessId: string;
  businessName: string;
  onBack: () => void;
  onOpenCatalog?: () => void;
}> = ({ businessId, businessName, onBack, onOpenCatalog }) => {
  const [loading, setLoading] = useState(true);
  const [sourceImageUrl, setSourceImageUrl] = useState('');
  const [localPreview, setLocalPreview] = useState('');
  const [items, setItems] = useState<MenuImportDraftItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [catalog, setCatalog] = useState<BusinessCatalogDocument | null>(null);
  const [catalogReady, setCatalogReady] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisNote, setAnalysisNote] = useState('');
  const [error, setError] = useState('');
  const [published, setPublished] = useState<{ added: number; skipped: number } | null>(null);

  // Siempre apunta a lo más reciente para guardar sin leer valores viejos.
  const latest = useRef({ items, sourceImageUrl });
  latest.current = { items, sourceImageUrl };
  const dirty = useRef(false);
  const [revision, setRevision] = useState(0);

  // 1) Cargar el borrador guardado (si el dueño ya empezó antes).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMenuImportDraft(businessId)
      .then((draft) => {
        if (cancelled || !draft) return;
        setSourceImageUrl(draft.sourceImageUrl);
        setItems(draft.items);
      })
      .catch((err) => {
        console.error('[BusinessMenuImport] no se pudo leer el borrador:', err);
        if (!cancelled) setError('No pudimos cargar tu borrador guardado. Puedes empezar uno nuevo.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  // 2) Escuchar el catálogo actual para no duplicar productos al publicar.
  useEffect(
    () =>
      subscribeToBusinessCatalog(
        businessId,
        (doc) => {
          setCatalog(doc);
          setCatalogReady(true);
        },
        (err) => {
          console.error('[BusinessMenuImport] no se pudo leer el catálogo:', err);
          setCatalogReady(false);
        },
      ),
    [businessId],
  );

  const persist = async (override?: { sourceImageUrl?: string }) => {
    setSaveState('saving');
    try {
      await saveMenuImportDraft(
        businessId,
        {
          items: latest.current.items,
          sourceImageUrl: override?.sourceImageUrl ?? latest.current.sourceImageUrl,
        },
        actorName(),
      );
      dirty.current = false;
      setSaveState('saved');
    } catch (err) {
      console.error('[BusinessMenuImport] no se pudo guardar el borrador:', err);
      setSaveState('error');
      setError('No se pudo guardar el borrador. Revisa tu conexión e inténtalo de nuevo.');
    }
  };

  // 3) Guardado automático poco después de cada cambio.
  useEffect(() => {
    if (revision === 0) return;
    const timer = setTimeout(() => {
      void persist();
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [revision]);

  // 4) Si se sale de la pantalla con algo pendiente, se guarda antes de perderlo.
  useEffect(
    () => () => {
      if (dirty.current) {
        void saveMenuImportDraft(businessId, latest.current, actorName()).catch((err) =>
          console.error('[BusinessMenuImport] no se pudo guardar al salir:', err),
        );
      }
    },
    [businessId],
  );

  useEffect(
    () => () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    },
    [localPreview],
  );

  const edit = (updater: (current: MenuImportDraftItem[]) => MenuImportDraftItem[]) => {
    setItems(updater);
    dirty.current = true;
    setSaveState('dirty');
    setError('');
    setPublished(null);
    setRevision((value) => value + 1);
  };

  const updateItem = (id: string, patch: Partial<MenuImportDraftItem>) =>
    edit((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const addItem = () => edit((current) => [...current, newDraftItem(current[current.length - 1]?.category || '')]);

  const removeItem = (id: string) => edit((current) => current.filter((item) => item.id !== id));

  const handleBack = async () => {
    if (dirty.current) await persist();
    onBack();
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    const problem = validateMenuImage(file);
    if (problem) {
      setError(problem);
      return;
    }

    setError('');
    setPublished(null);
    setUploading(true);
    setLocalPreview(URL.createObjectURL(file));
    try {
      const url = await uploadBusinessMenuImage(businessId, file);
      setSourceImageUrl(url);
      latest.current = { ...latest.current, sourceImageUrl: url };
      await persist({ sourceImageUrl: url });
    } catch (err) {
      console.error('[BusinessMenuImport] no se pudo subir la foto:', err);
      setError(err instanceof Error ? err.message : 'No se pudo subir la foto. Inténtalo de nuevo.');
    } finally {
      setLocalPreview('');
      setUploading(false);
    }
  };

  const analyzeWithGiobot = async () => {
    if (!sourceImageUrl) {
      setError('Primero sube la foto de tu menú.');
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      setError('Tu sesión expiró. Vuelve a iniciar sesión.');
      return;
    }

    setError('');
    setPublished(null);
    setAnalysisNote('');
    setAnalyzing(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/menu-import/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ businessId, imageUrl: sourceImageUrl }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Giobot no pudo analizar la foto. Inténtalo de nuevo.');

      const found: Array<Partial<MenuImportDraftItem>> = Array.isArray(data?.items) ? data.items : [];
      if (found.length === 0) {
        setError('Giobot no encontró productos en esta foto. Prueba con una foto más clara o súbela completa.');
        return;
      }

      // Se suma a lo que ya hay en el borrador sin repetir nombres.
      const known = new Set(latest.current.items.map((item) => normalizeName(item.name)).filter(Boolean));
      const fresh: MenuImportDraftItem[] = [];
      found.forEach((entry, index) => {
        const name = String(entry.name || '').trim();
        const key = normalizeName(name);
        if (!name || known.has(key)) return;
        known.add(key);
        fresh.push({
          id: `draft-ai-${Date.now().toString(36)}-${index}`,
          name,
          category: String(entry.category || '').trim(),
          price: String(entry.price || '').trim(),
          description: String(entry.description || '').trim(),
        });
      });

      if (fresh.length === 0) {
        setAnalysisNote('Giobot revisó la foto, pero esos productos ya estaban en tu lista.');
        return;
      }

      edit((current) => [...current, ...fresh]);
      setAnalysisNote(`Giobot encontró ${fresh.length} producto${fresh.length === 1 ? '' : 's'}. Revísalos y corrige lo que haga falta antes de publicar.`);
    } catch (err) {
      console.error('[BusinessMenuImport] falló el análisis:', err);
      setError(err instanceof Error ? err.message : 'Giobot no pudo analizar la foto. Inténtalo de nuevo.');
    } finally {
      setAnalyzing(false);
    }
  };

  const categories = useMemo(() => {
    const names = new Set<string>();
    (catalog?.items || []).forEach((item) => item.category && names.add(item.category));
    items.forEach((item) => item.category.trim() && names.add(item.category.trim()));
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'es-MX'));
  }, [catalog, items]);

  const filledCount = items.filter((item) => item.name.trim()).length;

  const publish = async () => {
    setError('');
    setPublished(null);

    if (!catalogReady) {
      setError('Todavía no podemos leer tu catálogo actual. Espera un momento e inténtalo otra vez.');
      return;
    }

    const prepared = items
      .map((item) => ({
        name: item.name.trim(),
        category: item.category.trim() || 'Sin categoría',
        description: item.description.trim(),
        price: parsePrice(item.price),
        rawPrice: item.price,
      }))
      .filter((item) => item.name);

    if (prepared.length === 0) {
      setError('Agrega al menos un producto con nombre.');
      return;
    }

    const badPrice = prepared.find((item) => item.price === undefined);
    if (badPrice) {
      setError(`Revisa el precio de "${badPrice.name}": usa solo números, por ejemplo 65 o 65.50.`);
      return;
    }

    const existing = catalog?.items || [];
    const taken = new Set(existing.map((item) => normalizeName(item.name)));
    let sortOrder = existing.reduce((max, item) => Math.max(max, item.sortOrder || 0), 0);
    const toAdd: BusinessCatalogItem[] = [];
    let skipped = 0;

    prepared.forEach((item, index) => {
      const key = normalizeName(item.name);
      if (taken.has(key)) {
        skipped += 1;
        return;
      }
      taken.add(key);
      sortOrder += 1;
      toAdd.push({
        id: `${createCatalogItemId(item.name)}-${index + 1}`,
        name: item.name,
        description: item.description,
        price: item.price as number | null,
        category: item.category,
        available: true,
        sortOrder,
      });
    });

    if (toAdd.length === 0) {
      setError('Todos esos productos ya están en tu catálogo, así que no agregué nada.');
      return;
    }

    setPublishing(true);
    try {
      await saveBusinessCatalog(businessId, [...existing, ...toAdd], actorName());
      try {
        await clearMenuImportDraft(businessId);
      } catch (err) {
        console.warn('[BusinessMenuImport] el catálogo se guardó, pero no se pudo limpiar el borrador:', err);
      }
      dirty.current = false;
      setItems([]);
      setSourceImageUrl('');
      setSaveState('idle');
      setPublished({ added: toAdd.length, skipped });
    } catch (err) {
      console.error('[BusinessMenuImport] no se pudo publicar:', err);
      setError(err instanceof Error ? err.message : 'No se pudo publicar en tu catálogo. Tu borrador sigue guardado.');
    } finally {
      setPublishing(false);
    }
  };

  const photo = localPreview || sourceImageUrl;

  const saveLabel =
    saveState === 'saving'
      ? 'Guardando…'
      : saveState === 'dirty'
        ? 'Cambios sin guardar'
        : saveState === 'saved'
          ? 'Borrador guardado'
          : saveState === 'error'
            ? 'No se pudo guardar'
            : '';

  return (
    <div className="min-h-screen bg-[#050505] text-[#F7F7F7]">
      <header className="sticky top-0 z-20 border-b border-[#3A3022] bg-[#0B0B0B]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => void handleBack()}
            className="flex items-center gap-2 rounded-xl border border-[#3A3022] px-3 py-2 text-xs font-bold text-[#F7F7F7]"
          >
            <ArrowLeft className="h-4 w-4" /> Negocio
          </button>
          <span className="truncate text-xs font-black text-[#B7B7B7]">Sube tu menú · {businessName}</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        <section className="rounded-[1.75rem] border border-[#3A3022] bg-[#111111] p-5 sm:p-7">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-[#D6A34A] p-3 text-[#050505]">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#E3BC6B]">Giobot</p>
              <h1 className="mt-1 font-serif text-2xl font-black text-[#F7F7F7] sm:text-3xl">Convierte tu menú en tu app</h1>
              <p className="mt-2 text-sm leading-relaxed text-[#C8C8C8]">
                Sube la foto de tu menú y Giobot la lee por ti: arma tu lista con nombres, categorías y precios. Tú solo revisas, y nada llega
                a tus clientes hasta que pulses <strong className="text-[#F7F7F7]">Publicar</strong>.
              </p>
            </div>
          </div>
        </section>

        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-400/40 bg-red-950/40 p-4 text-sm text-red-100">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {published && (
          <div className="rounded-2xl border border-emerald-400/40 bg-emerald-950/40 p-5 text-sm text-emerald-50">
            <div className="flex items-center gap-2 font-black">
              <CheckCircle2 className="h-5 w-5" /> ¡Listo! Se agregaron {published.added} producto{published.added === 1 ? '' : 's'} a tu catálogo.
            </div>
            {published.skipped > 0 && (
              <p className="mt-1 text-xs text-emerald-100/80">
                {published.skipped} ya existía{published.skipped === 1 ? '' : 'n'} y no se repitió{published.skipped === 1 ? '' : 'ron'}.
              </p>
            )}
            {onOpenCatalog && (
              <button
                type="button"
                onClick={onOpenCatalog}
                className="mt-4 rounded-xl bg-[#D6A34A] px-4 py-3 text-sm font-black text-[#050505]"
              >
                Ver mi catálogo
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-3 rounded-[1.75rem] border border-[#3A3022] bg-[#111111] p-10 text-sm text-[#C8C8C8]">
            <Loader2 className="h-5 w-5 animate-spin" /> Abriendo tu borrador…
          </div>
        ) : (
          <>
            <section className="rounded-[1.75rem] border border-[#3A3022] bg-[#111111] p-5 sm:p-7">
              <h2 className="font-serif text-xl font-black text-[#F7F7F7]">1. La foto de tu menú</h2>

              {photo ? (
                <div className="mt-4">
                  <img
                    src={photo}
                    alt="Foto de tu menú"
                    className="max-h-[420px] w-full rounded-2xl border border-[#3A3022] bg-[#0B0B0B] object-contain"
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {sourceImageUrl && (
                      <a
                        href={sourceImageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-xl border border-[#3A3022] px-3 py-2 text-xs font-bold text-[#E3BC6B]"
                      >
                        <ExternalLink className="h-4 w-4" /> Ver foto completa
                      </a>
                    )}
                    <label className="cursor-pointer rounded-xl border border-[#3A3022] px-3 py-2 text-xs font-bold text-[#F7F7F7]">
                      Cambiar foto
                      <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => { void handleFile(e.target.files?.[0] || null); e.target.value = ''; }} />
                    </label>
                    {uploading && (
                      <span className="flex items-center gap-2 text-xs text-[#C8C8C8]">
                        <Loader2 className="h-4 w-4 animate-spin" /> Subiendo…
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <label className="mt-4 block cursor-pointer rounded-2xl border-2 border-dashed border-[#5A4A2E] bg-[#0B0B0B] p-8 text-center hover:border-[#D6A34A]">
                  {uploading ? <Loader2 className="mx-auto h-10 w-10 animate-spin text-[#D6A34A]" /> : <Camera className="mx-auto h-10 w-10 text-[#D6A34A]" />}
                  <strong className="mt-3 block text-[#F7F7F7]">{uploading ? 'Subiendo tu foto…' : 'Subir foto del menú'}</strong>
                  <span className="mt-1 block text-xs text-[#B7B7B7]">JPG, PNG o WEBP</span>
                  <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => { void handleFile(e.target.files?.[0] || null); e.target.value = ''; }} />
                </label>
              )}

              {sourceImageUrl && (
                <button
                  type="button"
                  onClick={() => void analyzeWithGiobot()}
                  disabled={analyzing || uploading}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#D6A34A] px-5 py-4 text-sm font-black text-[#050505] disabled:opacity-50"
                >
                  {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {analyzing ? 'Giobot está leyendo tu menú… (puede tardar un poco)' : 'Analizar menú con Giobot'}
                </button>
              )}
              {analysisNote && (
                <p className="mt-3 rounded-xl border border-[#3A3022] bg-[#0B0B0B] p-3 text-xs leading-relaxed text-[#E3BC6B]">{analysisNote}</p>
              )}
            </section>

            <section className="rounded-[1.75rem] border border-[#3A3022] bg-[#111111] p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-serif text-xl font-black text-[#F7F7F7]">2. Tus productos</h2>
                {saveLabel && (
                  <span className={`text-xs font-bold ${saveState === 'error' ? 'text-red-300' : 'text-[#B7B7B7]'}`}>{saveLabel}</span>
                )}
              </div>
              <p className="mt-1 text-xs text-[#B7B7B7]">Revisa lo que leyó Giobot y corrige lo que haga falta (también puedes agregar productos a mano). Si un producto ya está en tu catálogo, no se repite.</p>

              <datalist id="menu-import-categories">
                {categories.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>

              <div className="mt-4 space-y-4">
                {items.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-[#3A3022] p-6 text-center text-sm text-[#B7B7B7]">
                    Todavía no hay productos. Sube tu foto y pulsa <strong className="text-[#F7F7F7]">Analizar menú con Giobot</strong>, o agrega uno a mano.
                  </div>
                )}

                {items.map((item, index) => (
                  <div key={item.id} className="rounded-2xl border border-[#3A3022] bg-[#0B0B0B] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase tracking-wide text-[#E3BC6B]">Producto {index + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        aria-label={`Quitar producto ${index + 1}`}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-red-300"
                      >
                        <Trash2 className="h-4 w-4" /> Quitar
                      </button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                      <div>
                        <label className={labelClass} htmlFor={`name-${item.id}`}>Nombre</label>
                        <input
                          id={`name-${item.id}`}
                          className={fieldClass}
                          value={item.name}
                          placeholder="Ej. Quesadilla sencilla"
                          onChange={(e) => updateItem(item.id, { name: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className={labelClass} htmlFor={`price-${item.id}`}>Precio</label>
                        <input
                          id={`price-${item.id}`}
                          className={fieldClass}
                          value={item.price}
                          inputMode="decimal"
                          placeholder="65"
                          onChange={(e) => updateItem(item.id, { price: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="mt-3">
                      <label className={labelClass} htmlFor={`cat-${item.id}`}>Categoría</label>
                      <input
                        id={`cat-${item.id}`}
                        className={fieldClass}
                        list="menu-import-categories"
                        value={item.category}
                        placeholder="Ej. Tacos, Bebidas, Paquetes"
                        onChange={(e) => updateItem(item.id, { category: e.target.value })}
                      />
                    </div>

                    <div className="mt-3">
                      <label className={labelClass} htmlFor={`desc-${item.id}`}>Descripción (opcional)</label>
                      <textarea
                        id={`desc-${item.id}`}
                        className={`${fieldClass} min-h-[72px] resize-y`}
                        value={item.description}
                        placeholder="Ingredientes, tamaño, extras…"
                        onChange={(e) => updateItem(item.id, { description: e.target.value })}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addItem}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-[#5A4A2E] px-5 py-4 text-sm font-black text-[#E3BC6B]"
              >
                <Plus className="h-4 w-4" /> Agregar producto
              </button>
            </section>

            <section className="rounded-[1.75rem] border border-[#3A3022] bg-[#111111] p-5 sm:p-7">
              <h2 className="font-serif text-xl font-black text-[#F7F7F7]">3. Publicar</h2>
              <p className="mt-1 text-xs text-[#B7B7B7]">
                Se agregan a tu catálogo {filledCount} producto{filledCount === 1 ? '' : 's'}. Después puedes editarlos, cambiar fotos y precios en
                “Catálogo”.
              </p>
              <button
                type="button"
                onClick={() => void publish()}
                disabled={publishing || uploading || filledCount === 0}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#D6A34A] px-5 py-4 text-sm font-black text-[#050505] disabled:opacity-40"
              >
                {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {publishing ? 'Publicando…' : 'Publicar en mi catálogo'}
              </button>
            </section>
          </>
        )}
      </main>
    </div>
  );
};
