import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Search,
  Plus,
  Trash2,
  Save,
  X,
  Package,
  RefreshCw
} from 'lucide-react';
import { useTwoFingerSwipe } from './useTwoFingerSwipe';
import { supabase, DEFAULT_VENUE_ID } from './lib/db';

const CATEGORIES = [
  { id: 'all', label: 'All Categories' },
  { id: 'draught', label: 'Draught Kegs' },
  { id: 'spirits', label: 'Spirits & Liqueurs' },
  { id: 'packaged_beer', label: 'Packaged Beer / Cans' },
  { id: 'wine', label: 'Wine & Fizz' },
  { id: 'prep', label: 'Syrups & Prep' },
  { id: 'minerals', label: 'Minerals & Softs' },
];

export default function CatalogManagerApp({ currentUser, onBackToHub, onLogout }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [editingItem, setEditingItem] = useState(null);
  const [savingItem, setSavingItem] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  const swipeHandlers = useTwoFingerSwipe({
    disabled: Boolean(editingItem),
    onSwipeRight: () => {
      if (onBackToHub) onBackToHub();
    }
  });

  const fetchMasterCatalog = async () => {
    setLoading(true);
    setStatusMsg(null);
    try {
      const { data, error } = await supabase
        .from('catalog_items')
        .select('*')
        .eq('venue_id', DEFAULT_VENUE_ID)
        .order('name');

      if (error) throw error;
      if (Array.isArray(data)) {
        setItems(data);
      } else {
        setItems([]);
      }
    } catch (err) {
      console.warn("Could not sync master catalog:", err);
      setStatusMsg({ type: 'error', text: 'Error connecting to database items.' });
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMasterCatalog();
  }, []);

  const filteredItems = useMemo(() => {
    if (!Array.isArray(items)) return [];
    return items.filter(it => {
      const name = String(it.name || '').toLowerCase();
      const id = String(it.id || '').toLowerCase();
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || name.includes(q) || id.includes(q);
      const itemCat = String(it.category || '').toLowerCase();
      const matchesCat = selectedCategory === 'all' || itemCat === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [items, searchQuery, selectedCategory]);

  const handleCreateNewItem = () => {
    const newItem = {
      id: `SKU-${Date.now().toString().slice(-4)}`,
      venue_id: DEFAULT_VENUE_ID,
      name: '',
      category: 'spirits',
      supplier: 'Tennents',
      area: 'Main Bar',
      count_unit: 'bottle',
      package_size_base: 700,
      base_uom: 'ml',
      order_unit: 'case',
      units_per_order_case: 6,
      cost_price_ex_vat: 0.00,
      last_cost_ex_vat: 0.00,
      vat_rate: 20.0,
      par: 1,
      isNew: true
    };
    setEditingItem(newItem);
  };

  const handleSaveItem = async (e) => {
    e.preventDefault();
    if (!editingItem?.id || !editingItem?.name?.trim()) return;

    setSavingItem(true);
    setStatusMsg(null);

    const payload = {
      id: editingItem.id.trim(),
      venue_id: DEFAULT_VENUE_ID,
      name: editingItem.name.trim(),
      category: editingItem.category || 'spirits',
      supplier: editingItem.supplier?.trim() || 'General',
      area: editingItem.area?.trim() || 'Main Bar',
      count_unit: editingItem.count_unit?.trim() || 'unit',
      package_size_base: Number(editingItem.package_size_base) || 1,
      base_uom: editingItem.base_uom || 'ml',
      order_unit: editingItem.order_unit?.trim() || 'case',
      units_per_order_case: Number(editingItem.units_per_order_case) || 1,
      cost_price_ex_vat: Number(editingItem.cost_price_ex_vat) || 0.00,
      last_cost_ex_vat: Number(editingItem.last_cost_ex_vat || editingItem.cost_price_ex_vat) || 0.00,
      vat_rate: Number(editingItem.vat_rate) || 20.0,
      par: Number(editingItem.par) || 1,
      updated_at: new Date().toISOString()
    };

    try {
      const { error } = await supabase
        .from('catalog_items')
        .upsert(payload, { onConflict: 'id' });

      if (error) throw error;

      setStatusMsg({ type: 'success', text: `Saved ${payload.name} (${payload.id})` });
      setEditingItem(null);
      await fetchMasterCatalog();
    } catch (err) {
      console.error("Save error:", err);
      setStatusMsg({ type: 'error', text: 'Error saving product configuration.' });
    } finally {
      setSavingItem(false);
    }
  };

  const handleDeleteItem = async (id, name) => {
    if (!window.confirm(`Delete ${name} (${id}) from venue catalog?`)) return;
    try {
      const { error } = await supabase.from('catalog_items').delete().eq('id', id);
      if (error) throw error;
      setEditingItem(null);
      setStatusMsg({ type: 'success', text: `Removed ${name}` });
      await fetchMasterCatalog();
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Could not delete item.' });
    }
  };

  return (
    <div
      {...swipeHandlers}
      className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 overflow-hidden relative select-none"
    >
      {/* Top Header */}
      <header className="flex items-center justify-between px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-3 border-b border-gray-100 flex-shrink-0 bg-white z-20 shadow-xs">
        <div className="flex items-center space-x-2">
          {onBackToHub && (
            <button onClick={onBackToHub} className="mr-0.5 p-1 -ml-1 text-gray-500 hover:text-black rounded-lg transition" title="Return to Hub">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="w-6 h-6 rounded bg-neutral-900 text-white flex items-center justify-center font-serif text-sm font-bold">
            W
          </div>
          <div>
            <h1 className="font-extrabold text-base tracking-tight text-gray-900 leading-tight">Master Catalog</h1>
            <span className="text-[10px] text-gray-400 font-mono block">Inventory, Costs &amp; Units</span>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          <button
            onClick={fetchMasterCatalog}
            className="p-1.5 text-gray-500 hover:text-black rounded-lg transition"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleCreateNewItem}
            className="flex items-center space-x-1 py-1.5 px-3 rounded-xl bg-black text-white hover:bg-neutral-800 text-xs font-bold transition active:scale-95 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        </div>
      </header>

      {/* Filter & Search Bar */}
      <div className="p-4 border-b border-gray-100 bg-gray-50/70 space-y-2 flex-shrink-0">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search SKU or name..."
            className="w-full bg-white border border-gray-300 py-1.5 pl-3 pr-8 rounded-xl text-xs placeholder-gray-400 focus:outline-none focus:border-black"
          />
          {searchQuery ? (
            <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black">
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          )}
        </div>

        {/* Categories Pills */}
        <div className="flex items-center space-x-1 overflow-x-auto scrollbar-none pb-0.5">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-2.5 py-1 rounded-xl text-[10px] font-bold whitespace-nowrap transition border ${
                selectedCategory === cat.id
                  ? 'bg-black text-white border-black shadow-xs'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {statusMsg && (
        <div className={`mx-5 my-2 p-2 rounded-xl text-xs font-semibold flex-shrink-0 ${
          statusMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {statusMsg.text}
        </div>
      )}

      {/* Items Ledger */}
      <div className="flex-1 overflow-y-auto px-5 divide-y divide-gray-100 pb-24 touch-pan-y overscroll-contain">
        {loading ? (
          <p className="text-center py-16 text-xs text-gray-400 italic">Syncing inventory attributes...</p>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs font-semibold text-gray-600">No items matched your search</p>
          </div>
        ) : (
          filteredItems.map(item => (
            <div
              key={item.id}
              onClick={() => setEditingItem({ ...item })}
              className="py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50/80 transition rounded-lg px-1 group"
            >
              <div className="space-y-0.5 pr-2">
                <div className="flex items-center space-x-1.5">
                  <span className="font-bold text-gray-900 text-xs block leading-tight group-hover:text-black">
                    {item.name}
                  </span>
                  <span className="text-[9px] font-mono text-gray-400 bg-gray-100 px-1 py-0.5 rounded">
                    {item.id}
                  </span>
                </div>
                <div className="flex items-center space-x-1.5 text-[9px] text-gray-500 font-mono">
                  <span>{item.supplier || 'General'}</span>
                  <span>•</span>
                  <span>{item.area || 'Main Bar'}</span>
                  <span>•</span>
                  <span className="font-bold text-gray-700">Par: {item.par ?? 1} {item.count_unit || item.unit || 'unit'}</span>
                </div>
              </div>

              <div className="text-right flex-shrink-0">
                <span className="text-xs font-black text-gray-900 font-mono block">
                  £{Number(item.cost_price_ex_vat || item.cost_price || 0).toFixed(2)}
                </span>
                <span className="text-[9px] text-gray-400 font-mono block">
                  per {item.order_unit || 'case'}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* EDIT DRAWER */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl border border-gray-200 flex flex-col max-h-[92vh] animate-in slide-in-from-bottom duration-200">
            <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex justify-between items-center bg-gray-50/80">
              <div>
                <span className="text-[9px] font-mono uppercase text-gray-400 font-bold block">
                  {editingItem.isNew ? 'New Inventory Item' : `Edit SKU • ${editingItem.id}`}
                </span>
                <h2 className="text-base font-black text-gray-900 leading-tight mt-0.5">
                  {editingItem.name || 'Product Details'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="p-1.5 text-gray-400 hover:text-black bg-white rounded-full border border-gray-200 shadow-xs"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-5 overflow-y-auto space-y-4 text-xs touch-pan-y overscroll-contain">
              <div className="space-y-2">
                <span className="font-bold uppercase tracking-wider text-[10px] text-gray-400 block">
                  1. Identification &amp; Category
                </span>
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-4">
                    <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">SKU ID *</label>
                    <input
                      type="text"
                      required
                      value={editingItem.id}
                      onChange={(e) => setEditingItem({ ...editingItem, id: e.target.value })}
                      className="w-full bg-[#EDEDED] py-1.5 px-2.5 rounded-xl font-mono text-xs font-bold text-gray-900 focus:outline-none"
                    />
                  </div>
                  <div className="col-span-8">
                    <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Item Name *</label>
                    <input
                      type="text"
                      required
                      value={editingItem.name}
                      onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                      placeholder="e.g. Tanqueray London Dry Gin"
                      className="w-full bg-[#EDEDED] py-1.5 px-2.5 rounded-xl text-xs font-bold text-gray-900 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Category</label>
                    <select
                      value={editingItem.category || 'spirits'}
                      onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                      className="w-full bg-[#EDEDED] py-1.5 px-2 rounded-xl text-xs font-medium text-gray-800 focus:outline-none"
                    >
                      <option value="draught">Draught Beer</option>
                      <option value="spirits">Spirits</option>
                      <option value="packaged_beer">Packaged Beer</option>
                      <option value="wine">Wine</option>
                      <option value="prep">Prep / Batching</option>
                      <option value="minerals">Minerals</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Supplier</label>
                    <input
                      type="text"
                      value={editingItem.supplier || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, supplier: e.target.value })}
                      placeholder="Tennents"
                      className="w-full bg-[#EDEDED] py-1.5 px-2 rounded-xl text-xs font-medium text-gray-800 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Bar Area</label>
                    <input
                      type="text"
                      value={editingItem.area || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, area: e.target.value })}
                      placeholder="Main Bar"
                      className="w-full bg-[#EDEDED] py-1.5 px-2 rounded-xl text-xs font-medium text-gray-800 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-1 border-t border-gray-100">
                <span className="font-bold uppercase tracking-wider text-[10px] text-gray-400 block">
                  2. Stocktake &amp; Ordering Units
                </span>
                
                <div className="grid grid-cols-12 gap-2 bg-gray-50 p-2.5 rounded-2xl border border-gray-200/70">
                  <div className="col-span-4">
                    <label className="text-[9px] font-bold text-gray-600 uppercase block mb-0.5">Count Unit</label>
                    <input
                      type="text"
                      value={editingItem.count_unit || editingItem.unit || 'bottle'}
                      onChange={(e) => setEditingItem({ ...editingItem, count_unit: e.target.value })}
                      placeholder="bottle / keg"
                      className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg text-xs"
                    />
                  </div>
                  <div className="col-span-4">
                    <label className="text-[9px] font-bold text-gray-600 uppercase block mb-0.5">Base UOM</label>
                    <select
                      value={editingItem.base_uom || 'ml'}
                      onChange={(e) => setEditingItem({ ...editingItem, base_uom: e.target.value })}
                      className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg text-xs"
                    >
                      <option value="ml">ml (Liquids)</option>
                      <option value="each">each (Packaged)</option>
                    </select>
                  </div>
                  <div className="col-span-4">
                    <label className="text-[9px] font-bold text-gray-600 uppercase block mb-0.5">Size in Base UOM</label>
                    <input
                      type="number"
                      step="any"
                      value={editingItem.package_size_base ?? 700}
                      onChange={(e) => setEditingItem({ ...editingItem, package_size_base: e.target.value })}
                      placeholder="700 or 50000"
                      className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg font-mono text-xs text-center font-bold"
                    />
                  </div>

                  <div className="col-span-6 pt-1">
                    <label className="text-[9px] font-bold text-gray-600 uppercase block mb-0.5">Order Unit Format</label>
                    <input
                      type="text"
                      value={editingItem.order_unit || 'case'}
                      onChange={(e) => setEditingItem({ ...editingItem, order_unit: e.target.value })}
                      placeholder="case / 24pk / keg"
                      className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg text-xs"
                    />
                  </div>
                  <div className="col-span-6 pt-1">
                    <label className="text-[9px] font-bold text-gray-600 uppercase block mb-0.5">Units per Order Case</label>
                    <input
                      type="number"
                      value={editingItem.units_per_order_case ?? 6}
                      onChange={(e) => setEditingItem({ ...editingItem, units_per_order_case: e.target.value })}
                      placeholder="6"
                      className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg font-mono text-xs text-center font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-1 border-t border-gray-100">
                <span className="font-bold uppercase tracking-wider text-[10px] text-gray-400 block">
                  3. Pricing &amp; Par Target
                </span>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Wholesale Cost (Ex)</label>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">£</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editingItem.cost_price_ex_vat ?? editingItem.cost_price ?? 0}
                        onChange={(e) => setEditingItem({ ...editingItem, cost_price_ex_vat: e.target.value })}
                        className="w-full bg-[#EDEDED] py-1.5 pl-5 pr-2 rounded-xl font-mono text-xs font-bold text-gray-900 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Last Inv Cost</label>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">£</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editingItem.last_cost_ex_vat ?? editingItem.cost_price_ex_vat ?? 0}
                        onChange={(e) => setEditingItem({ ...editingItem, last_cost_ex_vat: e.target.value })}
                        className="w-full bg-[#EDEDED] py-1.5 pl-5 pr-2 rounded-xl font-mono text-xs font-bold text-gray-900 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Par Target</label>
                    <input
                      type="number"
                      step="any"
                      value={editingItem.par ?? 1}
                      onChange={(e) => setEditingItem({ ...editingItem, par: e.target.value })}
                      className="w-full bg-[#EDEDED] py-1.5 px-2 rounded-xl font-mono text-xs font-bold text-center text-gray-900 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center space-x-2">
                {!editingItem.isNew && (
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(editingItem.id, editingItem.name)}
                    className="p-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl transition"
                    title="Delete item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="submit"
                  disabled={savingItem}
                  className="flex-1 py-3 bg-black hover:bg-neutral-800 disabled:opacity-40 text-white rounded-2xl text-xs font-bold transition flex items-center justify-center space-x-1.5 shadow-md"
                >
                  <Save className="w-4 h-4 text-emerald-400" />
                  <span>{savingItem ? 'Saving to Database...' : 'Save Product Attributes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Bottom Nav */}
      <nav className="fixed bottom-2 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[390px] z-20 rounded-2xl bg-[#111111]/95 backdrop-blur-md text-white py-2 px-3 flex justify-around items-center text-xs font-semibold shadow-2xl border border-white/10 select-none pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
        <button
          onClick={onBackToHub}
          className="flex-1 py-1 text-center rounded-xl transition text-neutral-400 hover:text-white"
        >
          Return to Hub
        </button>
      </nav>
    </div>
  );
}