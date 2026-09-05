import React, { useState } from 'react';
import { StaffUser, InventoryItem, InventoryControlType } from '../../types';
import {
  getInventory,
  saveInventoryItem,
  addInventoryProduct,
  deleteInventoryProduct,
} from '../../lib/adminStorage';
import {
  Package,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  AlertTriangle,
  Edit2,
  Hash,
  ListOrdered,
} from 'lucide-react';

interface InventoryViewProps {
  currentUser: StaffUser;
  onRefreshStats: () => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  currentUser,
  onRefreshStats,
}) => {
  const [inventory, setInventory] = useState<InventoryItem[]>(getInventory());
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<'all' | 'cantidad' | 'folio'>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // New product form
  const [newProductName, setNewProductName] = useState<string>('');
  const [newProductCategory, setNewProductCategory] = useState<InventoryItem['category']>('Desechables & Vasos');
  const [newProductUnit, setNewProductUnit] = useState<string>('pz');
  const [newProductType, setNewProductType] = useState<InventoryControlType>('cantidad');
  const [newProductInitial, setNewProductInitial] = useState<number>(0);
  const [newProductFolioIni, setNewProductFolioIni] = useState<string>('');
  const [newProductFolioFin, setNewProductFolioFin] = useState<string>('');
  const [newProductNotes, setNewProductNotes] = useState<string>('');

  const refreshList = () => {
    setInventory(getInventory());
  };

  React.useEffect(() => {
    const handleDataChange = () => {
      refreshList();
    };
    window.addEventListener('alo_admin_data_updated', handleDataChange);
    window.addEventListener('storage', handleDataChange);
    return () => {
      window.removeEventListener('alo_admin_data_updated', handleDataChange);
      window.removeEventListener('storage', handleDataChange);
    };
  }, []);

  const showNotification = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  // Quick cell change for Cantidad
  const handleQuantityCellChange = async (
    id: string,
    field: 'initialQty' | 'entriesQty' | 'finalQty',
    val: number
  ) => {
    const safeVal = Math.max(0, isNaN(val) ? 0 : val);
    const updated = await saveInventoryItem(id, { [field]: safeVal, tipoControl: 'cantidad' }, currentUser);
    if (updated) {
      refreshList();
    }
  };

  // Quick cell change for Folios
  const handleFolioCellChange = async (
    id: string,
    field: 'folioInicial' | 'folioFinal' | 'entriesQty',
    valStr: string
  ) => {
    let updates: Partial<InventoryItem> = { tipoControl: 'folio' };

    if (field === 'entriesQty') {
      const num = Math.max(0, parseInt(valStr, 10) || 0);
      updates.entriesQty = num;
    } else if (field === 'folioInicial') {
      const trimmed = valStr.trim();
      updates.folioInicial = trimmed === '' ? null : parseInt(trimmed, 10);
    } else if (field === 'folioFinal') {
      const trimmed = valStr.trim();
      updates.folioFinal = trimmed === '' ? null : parseInt(trimmed, 10);
    }

    const updated = await saveInventoryItem(id, updates, currentUser);
    if (updated) {
      refreshList();
    }
  };

  // Quick toggle between Cantidad and Folio
  const handleToggleControlType = async (item: InventoryItem) => {
    if (currentUser.role === 'EMPLEADO') return;
    const currentType = item.tipoControl || 'cantidad';
    const newType: InventoryControlType = currentType === 'cantidad' ? 'folio' : 'cantidad';

    let updates: Partial<InventoryItem> = { tipoControl: newType };

    if (newType === 'folio') {
      updates.unit = item.unit === 'pz' ? 'folios' : item.unit;
      if (item.folioInicial == null && item.initialQty > 0) {
        updates.folioInicial = 1;
        updates.folioFinal = item.initialQty > 0 ? item.initialQty : 1;
      }
    } else {
      updates.unit = item.unit === 'folios' ? 'pz' : item.unit;
      if (item.folioInicial != null && item.folioFinal != null && item.folioFinal >= item.folioInicial) {
        updates.initialQty = item.folioFinal - item.folioInicial + 1;
      }
    }

    const updated = await saveInventoryItem(item.id, updates, currentUser);
    if (updated) {
      showNotification(`Modo de "${item.name}" cambiado a: ${newType === 'folio' ? 'Control por Folios' : 'Conteo por Piezas'}`);
      refreshList();
      onRefreshStats();
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName.trim()) return;

    try {
      const parsedFolioIni = newProductFolioIni.trim() !== '' ? parseInt(newProductFolioIni, 10) : null;
      const parsedFolioFin = newProductFolioFin.trim() !== '' ? parseInt(newProductFolioFin, 10) : null;

      await addInventoryProduct(
        {
          name: newProductName.trim(),
          category: newProductCategory,
          unit: newProductUnit.trim() || (newProductType === 'folio' ? 'folios' : 'pz'),
          tipoControl: newProductType,
          initialQty: newProductType === 'cantidad' ? Number(newProductInitial || 0) : 0,
          folioInicial: newProductType === 'folio' ? parsedFolioIni : null,
          folioFinal: newProductType === 'folio' ? parsedFolioFin : null,
          notes: newProductNotes.trim() || undefined,
        },
        currentUser
      );

      // Reset form
      setNewProductName('');
      setNewProductInitial(0);
      setNewProductFolioIni('');
      setNewProductFolioFin('');
      setNewProductNotes('');
      setNewProductType('cantidad');
      setIsAddModalOpen(false);
      showNotification('¡Nuevo producto agregado al catálogo de inventario!');
      refreshList();
      onRefreshStats();
    } catch (err: any) {
      alert(err.message || 'Error al agregar producto.');
    }
  };

  const handleSaveEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    try {
      const isFolio = editingItem.tipoControl === 'folio';
      const fInit = isFolio && editingItem.folioInicial != null && Number.isFinite(Number(editingItem.folioInicial))
        ? Math.floor(Number(editingItem.folioInicial))
        : null;
      const fFinal = isFolio && editingItem.folioFinal != null && Number.isFinite(Number(editingItem.folioFinal))
        ? Math.floor(Number(editingItem.folioFinal))
        : null;

      await saveInventoryItem(
        editingItem.id,
        {
          name: editingItem.name.trim(),
          category: editingItem.category,
          unit: editingItem.unit?.trim() || (isFolio ? 'folios' : 'pz'),
          tipoControl: isFolio ? 'folio' : 'cantidad',
          initialQty: Number.isFinite(Number(editingItem.initialQty)) ? Number(editingItem.initialQty) : 0,
          entriesQty: Number.isFinite(Number(editingItem.entriesQty)) ? Number(editingItem.entriesQty) : 0,
          finalQty: Number.isFinite(Number(editingItem.finalQty)) ? Number(editingItem.finalQty) : 0,
          folioInicial: fInit,
          folioFinal: fFinal,
          notes: editingItem.notes?.trim() || '',
        },
        currentUser
      );

      setEditingItem(null);
      showNotification(`¡Insumo "${editingItem.name}" actualizado exitosamente!`);
      refreshList();
      onRefreshStats();
    } catch (err: any) {
      alert(err?.message || 'Error al guardar el cambio. Reintentar');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`¿Deseas eliminar "${name}" del inventario?`)) return;
    try {
      await deleteInventoryProduct(id, currentUser);
      refreshList();
      onRefreshStats();
      showNotification(`Producto "${name}" eliminado.`);
    } catch (err: any) {
      alert(err.message || 'Error al eliminar.');
    }
  };

  const categories = ['all', 'Desechables & Vasos', 'Panadería', 'Bebidas', 'Abarrotes & Varios', 'Operación'];

  const filteredItems = inventory.filter((item) => {
    const itemType = item.tipoControl || 'cantidad';
    const matchesType = selectedTypeFilter === 'all' || itemType === selectedTypeFilter;
    const matchesCat = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch =
      !searchTerm ||
      item.name.toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
      item.category.toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
      (item.notes && item.notes.toLowerCase().includes(searchTerm.toLowerCase().trim()));
    return matchesType && matchesCat && matchesSearch;
  });

  const cantidadCount = inventory.filter((i) => (i.tipoControl || 'cantidad') === 'cantidad').length;
  const folioCount = inventory.filter((i) => i.tipoControl === 'folio').length;
  const totalConsumptionCount = inventory.reduce((sum, i) => sum + i.consumption, 0);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs sm:text-sm font-medium flex items-center gap-2 animate-in fade-in shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-3xl border border-[#F4E3C8] shadow-xs">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFF7EA] text-[#A86B3D] text-xs font-bold uppercase tracking-wider mb-1 font-serif border border-[#F4E3C8]">
            <Package className="w-3.5 h-3.5" />
            <span>Formato de Papel Digitalizado</span>
          </div>
          <h2 className="font-serif font-bold text-xl sm:text-2xl text-[#2B1B13]">
            Inventario & Control de Existencias
          </h2>
          <p className="text-xs text-[#6B4028] mt-0.5">
            Soporta <strong>Conteo por Piezas</strong> (Inicial + Entradas - Final) y <strong>Control por Folios / Rango</strong> (Folio final - inicial + 1).
          </p>
        </div>

        {currentUser.role !== 'EMPLEADO' && (
          <button
            onClick={() => {
              setNewProductType('cantidad');
              setIsAddModalOpen(true);
            }}
            className="px-5 py-3 rounded-2xl bg-[#3A2418] hover:bg-[#4A2E1F] text-[#FFF7EA] font-serif font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 text-[#C9974D]" />
            <span>Nuevo Insumo</span>
          </button>
        )}
      </div>

      {/* Resumen & Métricas Rápidas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-[#F4E3C8] shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#A86B3D] block font-serif">Catálogo Total</span>
          <span className="font-serif font-bold text-xl text-[#2B1B13]">{inventory.length} insumos</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-[#F4E3C8] shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B4028] block font-serif">Por Piezas</span>
          <span className="font-serif font-bold text-xl text-[#3A2418] flex items-center gap-1.5">
            <Hash className="w-4 h-4 text-[#A86B3D]" />
            <span>{cantidadCount} pz</span>
          </span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-[#F4E3C8] shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#C9974D] block font-serif">Por Folios / Rango</span>
          <span className="font-serif font-bold text-xl text-[#A86B3D] flex items-center gap-1.5">
            <ListOrdered className="w-4 h-4 text-[#C9974D]" />
            <span>{folioCount} folios</span>
          </span>
        </div>
        <div className="bg-[#3A2418] text-[#FFF7EA] p-4 rounded-2xl border border-[#4E3222] shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#C9974D] block font-serif">Consumo Estimado</span>
          <span className="font-serif font-bold text-xl text-white">{totalConsumptionCount} u.</span>
        </div>
      </div>

      {/* Search & Category / Type Filters */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A86B3D]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar insumo (ej. 8 oz, Chapata, Bolillo, Agua, Folios...)"
              className="w-full pl-9 pr-4 py-2.5 bg-white rounded-2xl border border-[#F4E3C8] text-xs sm:text-sm text-[#2B1B13] focus:border-[#3A2418] focus:outline-hidden shadow-2xs"
            />
          </div>

          {/* Type Filter Buttons (Piezas vs Folios vs Todos) */}
          <div className="inline-flex p-1 bg-white rounded-2xl border border-[#F4E3C8] shadow-2xs shrink-0 self-start sm:self-auto">
            <button
              onClick={() => setSelectedTypeFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-serif font-bold transition-all cursor-pointer ${
                selectedTypeFilter === 'all'
                  ? 'bg-[#3A2418] text-white shadow-xs'
                  : 'text-[#6B4028] hover:bg-[#FFF7EA]'
              }`}
            >
              Todos ({inventory.length})
            </button>
            <button
              onClick={() => setSelectedTypeFilter('cantidad')}
              className={`px-3 py-1.5 rounded-xl text-xs font-serif font-bold transition-all flex items-center gap-1 cursor-pointer ${
                selectedTypeFilter === 'cantidad'
                  ? 'bg-[#3A2418] text-white shadow-xs'
                  : 'text-[#6B4028] hover:bg-[#FFF7EA]'
              }`}
            >
              <Hash className="w-3 h-3 text-[#C9974D]" />
              <span>Piezas ({cantidadCount})</span>
            </button>
            <button
              onClick={() => setSelectedTypeFilter('folio')}
              className={`px-3 py-1.5 rounded-xl text-xs font-serif font-bold transition-all flex items-center gap-1 cursor-pointer ${
                selectedTypeFilter === 'folio'
                  ? 'bg-[#3A2418] text-white shadow-xs'
                  : 'text-[#6B4028] hover:bg-[#FFF7EA]'
              }`}
            >
              <ListOrdered className="w-3 h-3 text-[#C9974D]" />
              <span>Folios ({folioCount})</span>
            </button>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs shrink-0">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl font-serif font-bold transition-all shrink-0 cursor-pointer text-xs ${
                selectedCategory === cat
                  ? 'bg-[#A86B3D] text-white shadow-xs'
                  : 'bg-white text-[#6B4028] border border-[#F4E3C8] hover:bg-[#FFF7EA]'
              }`}
            >
              {cat === 'all' ? 'Todas las categorías' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla Adaptativa / Lista de Insumos */}
      <div className="bg-white rounded-3xl border border-[#F4E3C8] shadow-xs overflow-hidden">
        {/* Table Header (Desktop / iPad) */}
        <div className="hidden lg:grid grid-cols-12 gap-3 bg-[#3A2418] text-[#FFF7EA] px-6 py-3.5 text-xs font-bold uppercase tracking-wider border-b border-[#4E3222] font-serif items-center">
          <div className="col-span-4">Producto & Tipo de Control</div>
          <div className="col-span-2 text-center">Inicial / Folio Ini</div>
          <div className="col-span-2 text-center text-[#C9974D]">Entradas (+)</div>
          <div className="col-span-2 text-center">Final / Folio Fin</div>
          <div className="col-span-2 text-right">Resultado / Consumo</div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="py-12 text-center p-6 space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#FFF7EA] text-[#A86B3D] flex items-center justify-center text-xl mx-auto border border-[#F4E3C8]">
              🔍
            </div>
            <h3 className="font-serif font-bold text-base text-[#2B1B13]">No se encontraron insumos</h3>
            <p className="text-xs text-[#6B4028] max-w-xs mx-auto">
              Prueba cambiando los filtros de categoría, tipo o el término de búsqueda.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#F4E3C8]/50">
            {filteredItems.map((item) => {
              const isFolio = item.tipoControl === 'folio';
              const hasFolioIni = item.folioInicial != null && !isNaN(item.folioInicial);
              const hasFolioFin = item.folioFinal != null && !isNaN(item.folioFinal);
              const isFolioRangeValid = hasFolioIni && hasFolioFin && (item.folioFinal as number) >= (item.folioInicial as number);
              const isFolioRangeInvalid = hasFolioIni && hasFolioFin && (item.folioFinal as number) < (item.folioInicial as number);
              const isQuantityNegative = !isFolio && item.consumption < 0;

              return (
                <div
                  key={item.id}
                  className={`p-4 sm:p-5 hover:bg-[#FFF7EA]/30 transition-colors flex flex-col lg:grid lg:grid-cols-12 lg:gap-3 lg:items-center space-y-3 lg:space-y-0 ${
                    isFolio ? 'bg-[#FFFDF9]' : ''
                  }`}
                >
                  {/* Columna 1: Info del Producto + Indicador Visual */}
                  <div className="lg:col-span-4 flex items-start justify-between lg:justify-start gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-serif font-bold text-sm sm:text-base text-[#2B1B13]">
                          {item.name}
                        </span>

                        {/* Indicador Visual: "Chapata · Piezas" o "8 oz · Folios" */}
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-serif font-bold px-2 py-0.5 rounded-md border ${
                            isFolio
                              ? 'bg-amber-50 text-amber-900 border-amber-300'
                              : 'bg-[#FFF7EA] text-[#6B4028] border-[#F4E3C8]'
                          }`}
                        >
                          {isFolio ? (
                            <>
                              <ListOrdered className="w-3 h-3 text-[#C9974D]" />
                              <span>Folios</span>
                            </>
                          ) : (
                            <>
                              <Hash className="w-3 h-3 text-[#A86B3D]" />
                              <span>Piezas</span>
                            </>
                          )}
                        </span>

                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#FAF5ED] text-[#8C5E3C] border border-[#F4E3C8]">
                          {item.unit}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-[#A86B3D]">
                        <span>{item.category}</span>
                        {item.notes && (
                          <span className="text-stone-500 italic max-w-xs truncate" title={item.notes}>
                            • {item.notes}
                          </span>
                        )}
                      </div>

                      {/* Botón rápido para cambiar de modo (Piezas <-> Folios) para Administradores */}
                      {currentUser.role !== 'EMPLEADO' && (
                        <div className="flex items-center gap-2 pt-0.5">
                          <button
                            type="button"
                            onClick={() => handleToggleControlType(item)}
                            className="text-[10px] font-serif text-[#A86B3D] hover:text-[#3A2418] hover:underline flex items-center gap-1 cursor-pointer"
                            title={`Cambiar a modo ${isFolio ? 'Conteo por Piezas' : 'Control por Folios'}`}
                          >
                            <span>Cambiar a {isFolio ? 'Piezas' : 'Folios'}</span>
                          </button>

                          <span className="text-stone-300">•</span>

                          <button
                            type="button"
                            onClick={() => setEditingItem({ ...item })}
                            className="text-[10px] font-serif text-[#6B4028] hover:text-[#3A2418] flex items-center gap-0.5 cursor-pointer"
                            title="Editar detalles del insumo"
                          >
                            <Edit2 className="w-2.5 h-2.5" />
                            <span>Editar</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {currentUser.role !== 'EMPLEADO' && (
                      <button
                        onClick={() => handleDelete(item.id, item.name)}
                        className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg lg:opacity-0 hover:opacity-100 transition-opacity cursor-pointer shrink-0"
                        title="Eliminar producto"
                        aria-label="Eliminar producto de inventario"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Columnas 2, 3, 4: Inputs adaptados según Tipo 1 (Piezas) o Tipo 2 (Folio) */}
                  <div className="grid grid-cols-3 gap-2 lg:col-span-6 lg:grid-cols-3 items-center">
                    {/* Input 1: Inicial o Folio Inicial */}
                    {isFolio ? (
                      <div className="bg-amber-50/60 p-2 rounded-xl border border-amber-200/80 text-center">
                        <span className="text-[10px] font-bold text-amber-900 uppercase block lg:hidden mb-1 font-serif">
                          Folio Inicial
                        </span>
                        <input
                          type="number"
                          placeholder="ej. 122"
                          value={item.folioInicial ?? ''}
                          onChange={(e) => handleFolioCellChange(item.id, 'folioInicial', e.target.value)}
                          className="w-full text-center font-bold text-sm bg-white rounded-lg border border-amber-300 py-1 text-amber-950 focus:border-[#3A2418] focus:outline-hidden"
                        />
                        <span className="hidden lg:block text-[9px] text-amber-800/80 mt-0.5 font-serif">Folio inicial</span>
                      </div>
                    ) : (
                      <div className="bg-[#FFF7EA]/60 p-2 rounded-xl border border-[#F4E3C8] text-center">
                        <span className="text-[10px] font-bold text-[#6B4028] uppercase block lg:hidden mb-1 font-serif">
                          Inicial (pz)
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={item.initialQty}
                          onChange={(e) => handleQuantityCellChange(item.id, 'initialQty', Number(e.target.value))}
                          className="w-full text-center font-bold text-sm bg-white rounded-lg border border-[#F4E3C8] py-1 text-[#2B1B13] focus:border-[#3A2418] focus:outline-hidden"
                        />
                        <span className="hidden lg:block text-[9px] text-[#A86B3D] mt-0.5 font-serif">Conteo inicial</span>
                      </div>
                    )}

                    {/* Input 2: Entradas (+) */}
                    <div className="bg-amber-50/70 p-2 rounded-xl border border-amber-200 text-center">
                      <span className="text-[10px] font-bold text-amber-800 uppercase block lg:hidden mb-1 font-serif">
                        Entradas (+)
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={item.entriesQty}
                        onChange={(e) =>
                          isFolio
                            ? handleFolioCellChange(item.id, 'entriesQty', e.target.value)
                            : handleQuantityCellChange(item.id, 'entriesQty', Number(e.target.value))
                        }
                        className="w-full text-center font-bold text-sm bg-white text-amber-900 rounded-lg border border-amber-300 py-1 focus:border-[#3A2418] focus:outline-hidden"
                      />
                      <span className="hidden lg:block text-[9px] text-amber-800/80 mt-0.5 font-serif">Entradas turno</span>
                    </div>

                    {/* Input 3: Final o Folio Final */}
                    {isFolio ? (
                      <div className="bg-amber-50/60 p-2 rounded-xl border border-amber-200/80 text-center">
                        <span className="text-[10px] font-bold text-amber-900 uppercase block lg:hidden mb-1 font-serif">
                          Folio Final
                        </span>
                        <input
                          type="number"
                          placeholder="ej. 125"
                          value={item.folioFinal ?? ''}
                          onChange={(e) => handleFolioCellChange(item.id, 'folioFinal', e.target.value)}
                          className="w-full text-center font-bold text-sm bg-white rounded-lg border border-amber-300 py-1 text-amber-950 focus:border-[#3A2418] focus:outline-hidden"
                        />
                        <span className="hidden lg:block text-[9px] text-amber-800/80 mt-0.5 font-serif">Folio final</span>
                      </div>
                    ) : (
                      <div className="bg-[#FFF7EA]/60 p-2 rounded-xl border border-[#F4E3C8] text-center">
                        <span className="text-[10px] font-bold text-[#6B4028] uppercase block lg:hidden mb-1 font-serif">
                          Final (pz)
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={item.finalQty}
                          onChange={(e) => handleQuantityCellChange(item.id, 'finalQty', Number(e.target.value))}
                          className="w-full text-center font-bold text-sm bg-white rounded-lg border border-[#F4E3C8] py-1 text-[#2B1B13] focus:border-[#3A2418] focus:outline-hidden"
                        />
                        <span className="hidden lg:block text-[9px] text-[#A86B3D] mt-0.5 font-serif">Conteo final</span>
                      </div>
                    )}
                  </div>

                  {/* Columna 5: Resultado / Consumo Calculado */}
                  <div className="lg:col-span-2 flex flex-col justify-center items-start lg:items-end bg-[#FFF7EA]/80 lg:bg-transparent p-2.5 lg:p-0 rounded-xl">
                    <span className="text-[10px] font-bold text-[#6B4028] uppercase lg:hidden font-serif">
                      {isFolio ? 'Resultado / Rango:' : 'Consumo Calculado:'}
                    </span>

                    {isFolio ? (
                      <div className="text-left lg:text-right space-y-0.5 w-full">
                        {isFolioRangeInvalid ? (
                          <div className="text-xs text-rose-700 font-bold bg-rose-50 px-2 py-1 rounded-lg border border-rose-200 flex items-center gap-1 justify-start lg:justify-end">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                            <span>Revisa el rango de folios.</span>
                          </div>
                        ) : isFolioRangeValid ? (
                          <>
                            <div className="font-serif font-black text-sm sm:text-base text-[#2B1B13] flex items-center justify-start lg:justify-end gap-1.5">
                              <span className="px-2 py-0.5 rounded bg-amber-100/80 text-amber-900 border border-amber-200 text-xs font-mono">
                                {item.folioInicial}–{item.folioFinal}
                              </span>
                              <span>
                                {item.consumption} <span className="text-xs font-normal text-[#6B4028]">u.</span>
                              </span>
                            </div>
                            <span className="text-[10px] text-[#A86B3D] block font-serif">
                              {item.folioFinal! - item.folioInicial! + 1} unidades del rango
                              {item.entriesQty > 0 ? ` (+${item.entriesQty} ent)` : ''}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-stone-500 italic font-serif">
                            {hasFolioIni || hasFolioFin ? 'Rango incompleto' : 'Sin folios capturados'}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-left lg:text-right space-y-0.5 w-full">
                        {isQuantityNegative ? (
                          <div className="text-xs text-rose-700 font-bold bg-rose-50 px-2 py-1 rounded-lg border border-rose-200 flex items-center gap-1 justify-start lg:justify-end">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                            <span>Consumo negativo ({item.consumption})</span>
                          </div>
                        ) : (
                          <>
                            <span className="font-serif font-black text-base sm:text-lg text-[#2B1B13] block">
                              {item.consumption} <span className="text-xs font-normal text-[#6B4028]">{item.unit}</span>
                            </span>
                            <span className="text-[10px] text-[#A86B3D] block font-serif">
                              {item.initialQty} + {item.entriesQty} - {item.finalQty}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Agregar Insumo con Selección de Tipo de Control */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2B1B13]/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-lg bg-[#FFF7EA] text-[#2B1B13] rounded-3xl shadow-2xl border border-[#F4E3C8] overflow-hidden">
            <div className="bg-[#3A2418] text-white p-5 border-b border-[#4E3222] flex items-center justify-between">
              <h3 className="font-serif font-bold text-lg flex items-center gap-2 text-[#FFF7EA]">
                <Plus className="w-5 h-5 text-[#C9974D]" />
                <span>Nuevo Insumo al Inventario</span>
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-[#F4E3C8] hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddProduct} className="p-6 space-y-4">
              {/* Selector de Tipo de Control */}
              <div>
                <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-2 font-serif">
                  Tipo de Control de Inventario *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setNewProductType('cantidad');
                      setNewProductUnit('pz');
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      newProductType === 'cantidad'
                        ? 'bg-white border-[#3A2418] ring-2 ring-[#3A2418]/20 shadow-xs'
                        : 'bg-[#FAF5ED] border-[#F4E3C8] opacity-75 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-serif font-bold text-xs text-[#2B1B13] mb-1">
                      <Hash className="w-4 h-4 text-[#A86B3D]" />
                      <span>1. Conteo por Piezas</span>
                    </div>
                    <p className="text-[11px] text-[#6B4028] font-light">
                      Inicial + Entradas - Final = Consumo (Chapata, Pan, Bebidas, etc.)
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setNewProductType('folio');
                      setNewProductUnit('folios');
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      newProductType === 'folio'
                        ? 'bg-white border-[#C9974D] ring-2 ring-[#C9974D]/30 shadow-xs'
                        : 'bg-[#FAF5ED] border-[#F4E3C8] opacity-75 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-serif font-bold text-xs text-[#2B1B13] mb-1">
                      <ListOrdered className="w-4 h-4 text-[#C9974D]" />
                      <span>2. Folio / Rango</span>
                    </div>
                    <p className="text-[11px] text-[#6B4028] font-light">
                      Folio inicial a final (ej. 122–125 = 4 u. para vasos, comandas)
                    </p>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                  Nombre del Insumo / Producto *
                </label>
                <input
                  type="text"
                  required
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder={newProductType === 'folio' ? 'Ej. 8 oz, 12 oz, Vasos 1 L...' : 'Ej. Chapata rústica, Bolillo, Jugos...'}
                  className="w-full px-4 py-2.5 bg-white rounded-xl border border-[#F4E3C8] text-[#2B1B13] text-xs sm:text-sm font-medium focus:border-[#3A2418] focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                    Categoría
                  </label>
                  <select
                    value={newProductCategory}
                    onChange={(e) => setNewProductCategory(e.target.value as any)}
                    className="w-full px-3 py-2.5 bg-white rounded-xl border border-[#F4E3C8] text-xs font-medium text-[#2B1B13] focus:outline-hidden cursor-pointer"
                  >
                    <option value="Desechables & Vasos">Desechables & Vasos</option>
                    <option value="Panadería">Panadería</option>
                    <option value="Bebidas">Bebidas</option>
                    <option value="Abarrotes & Varios">Abarrotes & Varios</option>
                    <option value="Operación">Operación</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                    Unidad de Medida
                  </label>
                  <input
                    type="text"
                    value={newProductUnit}
                    onChange={(e) => setNewProductUnit(e.target.value)}
                    placeholder="pz, paq, folios, kg..."
                    className="w-full px-3 py-2.5 bg-white rounded-xl border border-[#F4E3C8] text-xs text-[#2B1B13] focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Campos dinámicos según el tipo de control */}
              {newProductType === 'cantidad' ? (
                <div>
                  <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                    Cantidad Inicial en Existencia
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newProductInitial}
                    onChange={(e) => setNewProductInitial(Math.max(0, Number(e.target.value)))}
                    className="w-full px-4 py-2.5 bg-white rounded-xl border border-[#F4E3C8] text-[#2B1B13] font-bold text-sm focus:outline-hidden"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200">
                  <div>
                    <label className="block text-xs font-bold text-amber-900 uppercase tracking-wider mb-1 font-serif">
                      Folio Inicial
                    </label>
                    <input
                      type="number"
                      value={newProductFolioIni}
                      onChange={(e) => setNewProductFolioIni(e.target.value)}
                      placeholder="Ej. 122"
                      className="w-full px-3 py-2 bg-white rounded-xl border border-amber-300 text-amber-950 font-bold text-sm focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-amber-900 uppercase tracking-wider mb-1 font-serif">
                      Folio Final
                    </label>
                    <input
                      type="number"
                      value={newProductFolioFin}
                      onChange={(e) => setNewProductFolioFin(e.target.value)}
                      placeholder="Ej. 125"
                      className="w-full px-3 py-2 bg-white rounded-xl border border-amber-300 text-amber-950 font-bold text-sm focus:outline-hidden"
                    />
                  </div>
                  <div className="col-span-2 text-[11px] text-amber-800">
                    Fórmula inclusiva: <code>(Folio Final - Folio Inicial + 1)</code>. Ejemplo: 122 a 125 = 4 unidades.
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                  Observaciones / Notas (Opcional)
                </label>
                <input
                  type="text"
                  value={newProductNotes}
                  onChange={(e) => setNewProductNotes(e.target.value)}
                  placeholder="Ej. Paquete sellado en estante 2, proveedor San Juan..."
                  className="w-full px-4 py-2 bg-white rounded-xl border border-[#F4E3C8] text-xs text-[#2B1B13] focus:outline-hidden"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="w-1/2 py-3 rounded-xl border border-[#F4E3C8] text-[#6B4028] font-serif font-bold text-xs hover:bg-[#FAF5ED] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-3 rounded-xl bg-[#3A2418] hover:bg-[#4A2E1F] text-white font-serif font-bold text-xs shadow-md cursor-pointer"
                >
                  Guardar Insumo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Insumo Existente & Cambiar Tipo */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2B1B13]/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-lg bg-[#FFF7EA] text-[#2B1B13] rounded-3xl shadow-2xl border border-[#F4E3C8] overflow-hidden">
            <div className="bg-[#3A2418] text-white p-5 border-b border-[#4E3222] flex items-center justify-between">
              <h3 className="font-serif font-bold text-lg flex items-center gap-2 text-[#FFF7EA]">
                <Edit2 className="w-5 h-5 text-[#C9974D]" />
                <span>Editar Insumo: {editingItem.name}</span>
              </h3>
              <button
                onClick={() => setEditingItem(null)}
                className="text-[#F4E3C8] hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditProduct} className="p-6 space-y-4">
              {/* Cambiar Tipo de Control */}
              <div>
                <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-2 font-serif">
                  Tipo de Control
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setEditingItem({
                        ...editingItem,
                        tipoControl: 'cantidad',
                        folioInicial: null,
                        folioFinal: null,
                        unit: editingItem.unit === 'folios' ? 'pz' : editingItem.unit,
                      })
                    }
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      (editingItem.tipoControl || 'cantidad') === 'cantidad'
                        ? 'bg-white border-[#3A2418] ring-2 ring-[#3A2418]/20 shadow-xs'
                        : 'bg-[#FAF5ED] border-[#F4E3C8] opacity-75'
                    }`}
                  >
                    <div className="font-serif font-bold text-xs text-[#2B1B13] flex items-center gap-1.5">
                      <Hash className="w-4 h-4 text-[#A86B3D]" />
                      <span>Conteo por Piezas</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setEditingItem({
                        ...editingItem,
                        tipoControl: 'folio',
                        unit: editingItem.unit === 'pz' ? 'folios' : editingItem.unit,
                        folioInicial: editingItem.folioInicial ?? (editingItem.initialQty > 0 ? 1 : null),
                        folioFinal: editingItem.folioFinal ?? (editingItem.initialQty > 0 ? editingItem.initialQty : null),
                      })
                    }
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      editingItem.tipoControl === 'folio'
                        ? 'bg-white border-[#C9974D] ring-2 ring-[#C9974D]/30 shadow-xs'
                        : 'bg-[#FAF5ED] border-[#F4E3C8] opacity-75'
                    }`}
                  >
                    <div className="font-serif font-bold text-xs text-[#2B1B13] flex items-center gap-1.5">
                      <ListOrdered className="w-4 h-4 text-[#C9974D]" />
                      <span>Folios / Rango</span>
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                  Nombre del Insumo
                </label>
                <input
                  type="text"
                  required
                  value={editingItem.name}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                  className="w-full px-4 py-2 bg-white rounded-xl border border-[#F4E3C8] text-[#2B1B13] text-xs sm:text-sm font-medium focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                    Categoría
                  </label>
                  <select
                    value={editingItem.category}
                    onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value as any })}
                    className="w-full px-3 py-2 bg-white rounded-xl border border-[#F4E3C8] text-xs font-medium text-[#2B1B13] focus:outline-hidden cursor-pointer"
                  >
                    <option value="Desechables & Vasos">Desechables & Vasos</option>
                    <option value="Panadería">Panadería</option>
                    <option value="Bebidas">Bebidas</option>
                    <option value="Abarrotes & Varios">Abarrotes & Varios</option>
                    <option value="Operación">Operación</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                    Unidad
                  </label>
                  <input
                    type="text"
                    value={editingItem.unit}
                    onChange={(e) => setEditingItem({ ...editingItem, unit: e.target.value })}
                    className="w-full px-3 py-2 bg-white rounded-xl border border-[#F4E3C8] text-xs text-[#2B1B13] focus:outline-hidden"
                  />
                </div>
              </div>

              {editingItem.tipoControl === 'folio' ? (
                <div className="grid grid-cols-2 gap-3 bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200">
                  <div>
                    <label className="block text-xs font-bold text-amber-900 uppercase tracking-wider mb-1 font-serif">
                      Folio Inicial
                    </label>
                    <input
                      type="number"
                      value={editingItem.folioInicial ?? ''}
                      onChange={(e) => {
                        const val = e.target.value.trim() === '' ? null : parseInt(e.target.value, 10);
                        setEditingItem({ ...editingItem, folioInicial: val });
                      }}
                      placeholder="122"
                      className="w-full px-3 py-2 bg-white rounded-xl border border-amber-300 text-amber-950 font-bold text-sm focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-amber-900 uppercase tracking-wider mb-1 font-serif">
                      Folio Final
                    </label>
                    <input
                      type="number"
                      value={editingItem.folioFinal ?? ''}
                      onChange={(e) => {
                        const val = e.target.value.trim() === '' ? null : parseInt(e.target.value, 10);
                        setEditingItem({ ...editingItem, folioFinal: val });
                      }}
                      placeholder="125"
                      className="w-full px-3 py-2 bg-white rounded-xl border border-amber-300 text-amber-950 font-bold text-sm focus:outline-hidden"
                    />
                  </div>
                  <div className="col-span-2 text-[11px] text-amber-800">
                    Fórmula inclusiva: <code>Folio Final - Folio Inicial + 1</code>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-[#6B4028] uppercase mb-1 font-serif">
                      Inicial
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editingItem.initialQty}
                      onChange={(e) => setEditingItem({ ...editingItem, initialQty: Number(e.target.value) })}
                      className="w-full p-2 bg-white rounded-xl border border-[#F4E3C8] text-xs font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#6B4028] uppercase mb-1 font-serif">
                      Entradas
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editingItem.entriesQty}
                      onChange={(e) => setEditingItem({ ...editingItem, entriesQty: Number(e.target.value) })}
                      className="w-full p-2 bg-white rounded-xl border border-[#F4E3C8] text-xs font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#6B4028] uppercase mb-1 font-serif">
                      Final
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editingItem.finalQty}
                      onChange={(e) => setEditingItem({ ...editingItem, finalQty: Number(e.target.value) })}
                      className="w-full p-2 bg-white rounded-xl border border-[#F4E3C8] text-xs font-bold text-center"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-1 font-serif">
                  Observaciones / Notas
                </label>
                <input
                  type="text"
                  value={editingItem.notes || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, notes: e.target.value })}
                  placeholder="Detalles sobre el lote, proveedor o estante..."
                  className="w-full px-4 py-2 bg-white rounded-xl border border-[#F4E3C8] text-xs text-[#2B1B13] focus:outline-hidden"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="w-1/2 py-3 rounded-xl border border-[#F4E3C8] text-[#6B4028] font-serif font-bold text-xs hover:bg-[#FAF5ED] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-3 rounded-xl bg-[#3A2418] hover:bg-[#4A2E1F] text-white font-serif font-bold text-xs shadow-md cursor-pointer"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
