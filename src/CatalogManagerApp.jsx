import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Search,
  Plus,
  Trash2,
  Save,
  X,
  Package,
  RefreshCw,
  Wine,
  GlassWater,
  FlaskConical,
  Layers,
  ChevronRight,
  TrendingUp
} from 'lucide-react';
import { useTwoFingerSwipe } from './useTwoFingerSwipe';
import { supabase, DEFAULT_VENUE_ID } from './lib/db';

const CATEGORIES = [
  { id: 'all', label: 'All Categories' },
  { id: 'draught', label: 'Draught Beer' },
  { id: 'spirits', label: 'Spirits & Liqueurs' },
  { id: 'packaged_beer', label: 'Packaged Beer / Cans' },
  { id: 'wine', label: 'Wine & Fizz' },
  { id: 'prep', label: 'Syrups & Prep' },
  { id: 'minerals', label: 'Minerals & Softs' },
];

function getBufferDescription(rate) {
  const r = Number(rate) || 5;
  if (r <= 3) return `Order Early: Triggers when 0.${r} is poured (Keeps stock high)`;
  if (r === 5) return `Balanced Default: Triggers once 0.5+ of working unit is poured`;
  return `Order Late: Triggers only when 0.${r} of unit is gone (Keeps stock lean)`;
}

export default function CatalogManagerApp({ currentUser, onBackToHub, onLogout }) {
  const [activeTab, setActiveTab] = useState('products'); // 'products' | 'recipes'
  
  // Product State
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [editingItem, setEditingItem] = useState(null);
  const [savingItem, setSavingItem] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  // Recipe State
  const [recipes, setRecipes] = useState([]);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [savingRecipe, setSavingRecipe] = useState(false);

  const swipeHandlers = useTwoFingerSwipe({
    disabled: Boolean(editingItem) || Boolean(editingRecipe),
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
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn("Could not sync master catalog:", err);
      setStatusMsg({ type: 'error', text: 'Error connecting to database items.' });
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecipes = async () => {
    setLoadingRecipes(true);
    try {
      const { data: recs, error: rErr } = await supabase
        .from('recipes')
        .select('*')
        .eq('venue_id', DEFAULT_VENUE_ID)
        .order('name');

      if (rErr) throw rErr;

      const { data: ings, error: iErr } = await supabase
        .from('recipe_ingredients')
        .select('*');

      if (iErr) throw iErr;

      const combined = (recs || []).map(r => ({
        ...r,
        ingredients: (ings || []).filter(i => i.recipe_id === r.id)
      }));

      setRecipes(combined);
    } catch (err) {
      console.warn("Could not load recipes:", err);
    } finally {
      setLoadingRecipes(false);
    }
  };

  useEffect(() => {
    fetchMasterCatalog();
    fetchRecipes();
  }, []);

  // Filtered Products
  const filteredItems = useMemo(() => {
    if (!Array.isArray(items)) return [];
    return items.filter(it => {
      const name = String(it.name || '').toLowerCase();
      const id = String(it.id || '').toLowerCase();
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || name.includes(q) || id.includes(q);
      
      const itemCat = String(it.category || '').toLowerCase();
      let matchesCat = selectedCategory === 'all';
      if (!matchesCat) {
        if (selectedCategory === 'draught') {
          matchesCat = itemCat.includes('draught') || itemCat.includes('keg');
        } else if (selectedCategory === 'packaged_beer') {
          matchesCat = (itemCat.includes('packaged') || itemCat.includes('beer')) && !itemCat.includes('draught');
        } else {
          matchesCat = itemCat === selectedCategory;
        }
      }

      return matchesSearch && matchesCat;
    });
  }, [items, searchQuery, selectedCategory]);

  // Filtered Recipes
  const filteredRecipes = useMemo(() => {
    if (!Array.isArray(recipes)) return [];
    const q = searchQuery.toLowerCase();
    return recipes.filter(r => !q || r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
  }, [recipes, searchQuery]);

  // Handle Product CRUD
  const handleCreateNewItem = () => {
    const newItem = {
      id: `SKU-${Date.now().toString().slice(-4)}`,
      venue_id: DEFAULT_VENUE_ID,
      name: '',
      category: 'draught',
      supplier: 'Tennents',
      area: 'Cellar',
      count_unit: 'keg',
      package_size_base: 50000,
      base_uom: 'ml',
      order_unit: 'keg',
      units_per_order_case: 1,
      cost_price_ex_vat: 0.00,
      last_cost_ex_vat: 0.00,
      par: 1,
      buffer_rate: 5,
      menu_prices: {},
      isNew: true
    };
    setEditingItem(newItem);
  };

  const handlePriceFieldChange = (key, val) => {
    setEditingItem(prev => ({
      ...prev,
      menu_prices: {
        ...(prev.menu_prices || {}),
        [key]: val === '' ? '' : Number(val)
      }
    }));
  };

  const handleSaveItem = async (e) => {
    e.preventDefault();
    if (!editingItem?.id || !editingItem?.name?.trim()) return;

    setSavingItem(true);
    setStatusMsg(null);

    let cat = (editingItem.category || 'spirits').toLowerCase();
    if (cat.includes('keg')) cat = 'draught';

    const payload = {
      id: editingItem.id.trim(),
      venue_id: DEFAULT_VENUE_ID,
      name: editingItem.name.trim(),
      category: cat,
      supplier: editingItem.supplier?.trim() || 'General',
      area: editingItem.area?.trim() || 'Main Bar',
      count_unit: editingItem.count_unit?.trim() || 'unit',
      package_size_base: Number(editingItem.package_size_base) || 1,
      base_uom: editingItem.base_uom || 'ml',
      order_unit: editingItem.order_unit?.trim() || 'case',
      units_per_order_case: Number(editingItem.units_per_order_case) || 1,
      cost_price_ex_vat: Number(editingItem.cost_price_ex_vat) || 0.00,
      last_cost_ex_vat: Number(editingItem.last_cost_ex_vat || editingItem.cost_price_ex_vat) || 0.00,
      par: Number(editingItem.par) || 1,
      buffer_rate: Number(editingItem.buffer_rate ?? 5),
      menu_prices: editingItem.menu_prices || {},
      updated_at: new Date().toISOString()
    };

    try {
      const { error } = await supabase
        .from('catalog_items')
        .upsert(payload, { onConflict: 'id' });

      if (error) {
        if (error.message && error.message.includes('menu_prices')) {
          const fallback = { ...payload };
          delete fallback.menu_prices;
          const { error: retryError } = await supabase
            .from('catalog_items')
            .upsert(fallback, { onConflict: 'id' });
          if (retryError) throw retryError;
        } else {
          throw error;
        }
      }

      setStatusMsg({ type: 'success', text: `Saved ${payload.name} (${payload.id})` });
      setEditingItem(null);
      await fetchMasterCatalog();
    } catch (err) {
      console.error("Save error:", err);
      setStatusMsg({ type: 'error', text: err.message || 'Error saving product configuration.' });
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

  // Handle Recipe / BOM CRUD
  const handleCreateNewRecipe = () => {
    const newRecipe = {
      id: `REC-${Date.now().toString().slice(-4)}`,
      venue_id: DEFAULT_VENUE_ID,
      name: '',
      recipe_type: 'cocktail',
      yield_amount: 1,
      yield_unit: 'serve',
      menu_price_inc_vat: 0.00,
      ingredients: [],
      isNew: true
    };
    setEditingRecipe(newRecipe);
  };

  const handleAddIngredientLine = () => {
    if (items.length === 0) return;
    const defaultProduct = items[0];
    setEditingRecipe(prev => ({
      ...prev,
      ingredients: [
        ...prev.ingredients,
        {
          id: `tmp-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          item_id: defaultProduct.id,
          item_name: defaultProduct.name,
          quantity: 25,
          unit: defaultProduct.base_uom || 'ml'
        }
      ]
    }));
  };

  const handleUpdateIngredient = (idx, field, val) => {
    setEditingRecipe(prev => {
      const copy = [...prev.ingredients];
      if (field === 'item_id') {
        const prod = items.find(p => p.id === val);
        copy[idx] = {
          ...copy[idx],
          item_id: val,
          item_name: prod ? prod.name : '',
          unit: prod ? prod.base_uom : 'ml'
        };
      } else {
        copy[idx] = { ...copy[idx], [field]: val };
      }
      return { ...prev, ingredients: copy };
    });
  };

  const handleRemoveIngredient = (idx) => {
    setEditingRecipe(prev => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== idx)
    }));
  };

  // Dynamic Pour Cost & Margin Calculation
  const recipeCostMetrics = useMemo(() => {
    if (!editingRecipe) return { costExVat: 0, pourCostPercent: 0, profitExVat: 0 };

    let costExVat = 0;
    (editingRecipe.ingredients || []).forEach(ing => {
      const parent = items.find(p => p.id === ing.item_id);
      if (parent) {
        const baseSize = Number(parent.package_size_base) || 700;
        const unitCost = Number(parent.last_cost_ex_vat || parent.cost_price_ex_vat || 0);
        if (baseSize > 0 && unitCost > 0) {
          costExVat += (Number(ing.quantity) / baseSize) * unitCost;
        }
      }
    });

    const menuPriceInc = Number(editingRecipe.menu_price_inc_vat) || 0;
    const menuPriceEx = menuPriceInc / 1.20;
    const pourCostPercent = menuPriceEx > 0 ? (costExVat / menuPriceEx) * 100 : 0;
    const profitExVat = menuPriceEx - costExVat;

    return {
      costExVat: Math.round(costExVat * 100) / 100,
      pourCostPercent: Math.round(pourCostPercent * 10) / 10,
      profitExVat: Math.round(profitExVat * 100) / 100
    };
  }, [editingRecipe, items]);

  const handleSaveRecipe = async (e) => {
    e.preventDefault();
    if (!editingRecipe?.id || !editingRecipe?.name?.trim()) return;

    setSavingRecipe(true);
    setStatusMsg(null);

    const recipePayload = {
      id: editingRecipe.id.trim(),
      venue_id: DEFAULT_VENUE_ID,
      name: editingRecipe.name.trim(),
      recipe_type: editingRecipe.recipe_type || 'cocktail',
      yield_amount: Number(editingRecipe.yield_amount) || 1,
      yield_unit: editingRecipe.yield_unit || 'serve',
      menu_price_inc_vat: Number(editingRecipe.menu_price_inc_vat) || 0.00,
      updated_at: new Date().toISOString()
    };

    try {
      const { error: rErr } = await supabase
        .from('recipes')
        .upsert(recipePayload, { onConflict: 'id' });

      if (rErr) throw rErr;

      // Wipe and replace ingredient lines
      await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipePayload.id);

      if (editingRecipe.ingredients && editingRecipe.ingredients.length > 0) {
        const ingredientsPayload = editingRecipe.ingredients.map(ing => ({
          recipe_id: recipePayload.id,
          item_id: ing.item_id,
          item_name: ing.item_name || 'Ingredient',
          quantity: Number(ing.quantity) || 0,
          unit: ing.unit || 'ml'
        }));

        const { error: iErr } = await supabase
          .from('recipe_ingredients')
          .insert(ingredientsPayload);

        if (iErr) throw iErr;
      }

      setStatusMsg({ type: 'success', text: `Saved recipe ${recipePayload.name}` });
      setEditingRecipe(null);
      await fetchRecipes();
    } catch (err) {
      console.error("Recipe save error:", err);
      setStatusMsg({ type: 'error', text: err.message || 'Error saving recipe.' });
    } finally {
      setSavingRecipe(false);
    }
  };

  const handleDeleteRecipe = async (id, name) => {
    if (!window.confirm(`Delete recipe ${name} (${id})?`)) return;
    try {
      const { error } = await supabase.from('recipes').delete().eq('id', id);
      if (error) throw error;
      setEditingRecipe(null);
      setStatusMsg({ type: 'success', text: `Removed recipe ${name}` });
      await fetchRecipes();
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Could not delete recipe.' });
    }
  };

  const activeCategoryType = (editingItem?.category || 'spirits').toLowerCase();

  return (
    <div
      {...swipeHandlers}
      className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 overflow-hidden relative select-none"
    >
      {/* Top Header */}
      <header className="flex items-center justify-between px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-2 border-b border-gray-100 flex-shrink-0 bg-white z-20 shadow-xs">
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
            <span className="text-[10px] text-gray-400 font-mono block">Inventory, BOM &amp; Recipe Margins</span>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          <button 
            onClick={() => { fetchMasterCatalog(); fetchRecipes(); }} 
            className="p-1.5 text-gray-500 hover:text-black rounded-lg transition" 
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading || loadingRecipes ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={activeTab === 'products' ? handleCreateNewItem : handleCreateNewRecipe}
            className="flex items-center space-x-1 py-1.5 px-3 rounded-xl bg-black text-white hover:bg-neutral-800 text-xs font-bold transition active:scale-95 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{activeTab === 'products' ? 'Add Item' : 'New Recipe'}</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Toggle */}
      <div className="px-5 pt-2 pb-1.5 bg-gray-50/80 border-b border-gray-100 flex-shrink-0">
        <div className="flex bg-[#EDEDED] p-1 rounded-2xl">
          <button
            onClick={() => { setActiveTab('products'); setSelectedCategory('all'); }}
            className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition flex items-center justify-center space-x-1.5 ${
              activeTab === 'products' ? 'bg-white text-black shadow-xs' : 'text-gray-500 hover:text-black'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Master Products ({items.length})</span>
          </button>
          <button
            onClick={() => { setActiveTab('recipes'); setSelectedCategory('all'); }}
            className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition flex items-center justify-center space-x-1.5 ${
              activeTab === 'recipes' ? 'bg-white text-black shadow-xs' : 'text-gray-500 hover:text-black'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5 text-rose-500" />
            <span>Recipes &amp; BOM ({recipes.length})</span>
          </button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="p-4 border-b border-gray-100 bg-white space-y-2 flex-shrink-0">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeTab === 'products' ? "Search SKU, product or supplier..." : "Search cocktail or batch recipe..."}
            className="w-full bg-[#EDEDED] py-1.5 pl-3 pr-8 rounded-xl text-xs placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-black"
          />
          {searchQuery ? (
            <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black">
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          )}
        </div>

        {activeTab === 'products' && (
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
        )}
      </div>

      {statusMsg && (
        <div className={`mx-5 my-2 p-2 rounded-xl text-xs font-semibold flex-shrink-0 ${
          statusMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {statusMsg.text}
        </div>
      )}

      {/* ITEMS OR RECIPES LIST */}
      <div className="flex-1 overflow-y-auto px-5 divide-y divide-gray-100 pb-24 touch-pan-y overscroll-contain">
        {activeTab === 'products' ? (
          loading ? (
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
                onClick={() => setEditingItem({ ...item, menu_prices: item.menu_prices || {} })}
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
                    <span>•</span>
                    <span className="text-emerald-700 font-semibold bg-emerald-50 px-1 rounded">
                      Buf: {item.buffer_rate ?? 5}/10
                    </span>
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
          )
        ) : (
          /* RECIPES LIST */
          loadingRecipes ? (
            <p className="text-center py-16 text-xs text-gray-400 italic">Loading recipes &amp; bills of materials...</p>
          ) : filteredRecipes.length === 0 ? (
            <div className="text-center py-16 text-gray-400 space-y-1">
              <FlaskConical className="w-8 h-8 mx-auto mb-2 opacity-30 text-rose-500" />
              <p className="text-xs font-semibold text-gray-700">No recipes logged yet</p>
              <p className="text-[10px] text-gray-400">Add cocktails or prep syrups to auto-deduct base stock on spillage.</p>
            </div>
          ) : (
            filteredRecipes.map(recipe => {
              // Calculate live pour cost
              let costEx = 0;
              (recipe.ingredients || []).forEach(ing => {
                const parent = items.find(p => p.id === ing.item_id);
                if (parent) {
                  const baseSize = Number(parent.package_size_base) || 700;
                  const unitCost = Number(parent.last_cost_ex_vat || parent.cost_price_ex_vat || 0);
                  if (baseSize > 0) costEx += (Number(ing.quantity) / baseSize) * unitCost;
                }
              });

              const menuEx = (Number(recipe.menu_price_inc_vat) || 0) / 1.20;
              const pc = menuEx > 0 ? (costEx / menuEx) * 100 : 0;

              return (
                <div
                  key={recipe.id}
                  onClick={() => setEditingRecipe({ ...recipe })}
                  className="py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50/80 transition rounded-lg px-1 group"
                >
                  <div className="space-y-0.5 pr-2">
                    <div className="flex items-center space-x-1.5">
                      <span className="font-bold text-gray-900 text-xs block leading-tight group-hover:text-black">
                        {recipe.name}
                      </span>
                      <span className="text-[9px] font-mono text-rose-600 bg-rose-50 px-1 py-0.5 rounded font-bold uppercase">
                        {recipe.recipe_type}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1.5 text-[9px] text-gray-500 font-mono">
                      <span>{(recipe.ingredients || []).length} ingredients</span>
                      <span>•</span>
                      <span>Yield: {recipe.yield_amount} {recipe.yield_unit}</span>
                      {menuEx > 0 && (
                        <>
                          <span>•</span>
                          <span className={`font-bold ${pc > 22 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {pc.toFixed(1)}% Pour Cost
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <span className="text-xs font-black text-gray-900 font-mono block">
                      £{costEx.toFixed(2)} cost
                    </span>
                    <span className="text-[9px] text-gray-400 font-mono block">
                      Menu: £{Number(recipe.menu_price_inc_vat || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })
          )
        )}
      </div>

      {/* EDIT RECIPE DRAWER */}
      {editingRecipe && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl border border-gray-200 flex flex-col max-h-[92vh] animate-in slide-in-from-bottom duration-200">
            <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex justify-between items-center bg-gray-50/80">
              <div>
                <span className="text-[9px] font-mono uppercase text-rose-600 font-bold block">
                  {editingRecipe.isNew ? 'New Recipe BOM' : `Recipe • ${editingRecipe.id}`}
                </span>
                <h2 className="text-base font-black text-gray-900 leading-tight mt-0.5">
                  {editingRecipe.name || 'Cocktail / Prep Formulation'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingRecipe(null)}
                className="p-1.5 text-gray-400 hover:text-black bg-white rounded-full border border-gray-200 shadow-xs"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRecipe} className="p-5 overflow-y-auto space-y-4 text-xs touch-pan-y overscroll-contain">
              {/* Recipe Meta */}
              <div className="space-y-2">
                <span className="font-bold uppercase tracking-wider text-[10px] text-gray-400 block">
                  1. Recipe Specifications
                </span>
                
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-4">
                    <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Recipe Code *</label>
                    <input
                      type="text"
                      required
                      value={editingRecipe.id}
                      onChange={(e) => setEditingRecipe({ ...editingRecipe, id: e.target.value })}
                      className="w-full bg-[#EDEDED] py-1.5 px-2.5 rounded-xl font-mono text-xs font-bold text-gray-900 focus:outline-none"
                    />
                  </div>
                  <div className="col-span-8">
                    <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Recipe Name *</label>
                    <input
                      type="text"
                      required
                      value={editingRecipe.name}
                      onChange={(e) => setEditingRecipe({ ...editingRecipe, name: e.target.value })}
                      placeholder="e.g. Classic Negroni"
                      className="w-full bg-[#EDEDED] py-1.5 px-2.5 rounded-xl text-xs font-bold text-gray-900 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Type</label>
                    <select
                      value={editingRecipe.recipe_type || 'cocktail'}
                      onChange={(e) => setEditingRecipe({ ...editingRecipe, recipe_type: e.target.value })}
                      className="w-full bg-[#EDEDED] py-1.5 px-2 rounded-xl text-xs font-medium text-gray-800 focus:outline-none"
                    >
                      <option value="cocktail">Cocktail Serve</option>
                      <option value="prep_batch">Syrup / Prep Batch</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Yield Amount</label>
                    <input
                      type="number"
                      step="any"
                      value={editingRecipe.yield_amount || 1}
                      onChange={(e) => setEditingRecipe({ ...editingRecipe, yield_amount: e.target.value })}
                      className="w-full bg-[#EDEDED] py-1.5 px-2.5 rounded-xl text-xs font-mono font-bold text-center text-gray-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Menu Price (Inc)</label>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 font-mono">£</span>
                      <input
                        type="number"
                        step="0.05"
                        value={editingRecipe.menu_price_inc_vat || ''}
                        onChange={(e) => setEditingRecipe({ ...editingRecipe, menu_price_inc_vat: e.target.value })}
                        placeholder="10.50"
                        className="w-full bg-[#EDEDED] py-1.5 pl-5 pr-2 rounded-xl text-xs font-mono font-bold text-gray-900 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Ingredients BOM Section */}
              <div className="space-y-2 pt-1 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="font-bold uppercase tracking-wider text-[10px] text-gray-400 block">
                    2. Ingredients &amp; Stock Links
                  </span>
                  <button
                    type="button"
                    onClick={handleAddIngredientLine}
                    className="flex items-center space-x-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200 hover:bg-emerald-100 transition"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Ingredient</span>
                  </button>
                </div>

                {(editingRecipe.ingredients || []).length === 0 ? (
                  <div className="p-4 border border-dashed border-gray-200 rounded-2xl text-center text-gray-400 text-xs">
                    No ingredients added yet. Tap "Add Ingredient" to link parent stock SKUs.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {editingRecipe.ingredients.map((ing, idx) => {
                      const parent = items.find(p => p.id === ing.item_id);
                      const baseSize = Number(parent?.package_size_base) || 700;
                      const unitCost = Number(parent?.last_cost_ex_vat || parent?.cost_price_ex_vat || 0);
                      const lineCost = baseSize > 0 ? (Number(ing.quantity) / baseSize) * unitCost : 0;

                      return (
                        <div key={idx} className="flex items-center space-x-1.5 bg-gray-50 p-2 rounded-xl border border-gray-200">
                          {/* Item Dropdown */}
                          <div className="flex-1 min-w-0">
                            <select
                              value={ing.item_id}
                              onChange={(e) => handleUpdateIngredient(idx, 'item_id', e.target.value)}
                              className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg text-xs truncate focus:outline-none"
                            >
                              {items.map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.name} [{p.id}]
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Measure Input */}
                          <div className="w-20 relative">
                            <input
                              type="number"
                              step="any"
                              value={ing.quantity}
                              onChange={(e) => handleUpdateIngredient(idx, 'quantity', e.target.value)}
                              className="w-full bg-white border border-gray-300 py-1 pl-2 pr-6 rounded-lg text-xs font-mono font-bold text-center"
                            />
                            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-gray-400 font-mono">
                              {ing.unit || 'ml'}
                            </span>
                          </div>

                          {/* Line Cost */}
                          <span className="text-[10px] font-mono font-bold text-gray-700 w-12 text-right">
                            £{lineCost.toFixed(2)}
                          </span>

                          {/* Remove */}
                          <button
                            type="button"
                            onClick={() => handleRemoveIngredient(idx)}
                            className="p-1 text-gray-400 hover:text-red-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Financial Margin Readout */}
              <div className="bg-[#FAFAFA] border border-gray-200 rounded-2xl p-3 flex items-center justify-between">
                <div>
                  <span className="text-[9px] font-mono text-gray-400 uppercase tracking-wider block">Total Pour Cost</span>
                  <span className="text-base font-black text-gray-900 font-mono">
                    £{recipeCostMetrics.costExVat.toFixed(2)} <span className="text-[10px] font-normal text-gray-400">Ex VAT</span>
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[9px] font-mono text-gray-400 uppercase tracking-wider block">Pour Cost %</span>
                  <span className={`text-base font-black font-mono ${recipeCostMetrics.pourCostPercent > 22 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {recipeCostMetrics.pourCostPercent}%
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center space-x-2">
                {!editingRecipe.isNew && (
                  <button
                    type="button"
                    onClick={() => handleDeleteRecipe(editingRecipe.id, editingRecipe.name)}
                    className="p-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl transition"
                    title="Delete recipe"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="submit"
                  disabled={savingRecipe}
                  className="flex-1 py-3 bg-black hover:bg-neutral-800 disabled:opacity-40 text-white rounded-2xl text-xs font-bold transition flex items-center justify-center space-x-1.5 shadow-md"
                >
                  <Save className="w-4 h-4 text-emerald-400" />
                  <span>{savingRecipe ? 'Saving Recipe...' : 'Save Recipe & BOM'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT PRODUCT DRAWER */}
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
              {/* Section 1: Identification */}
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
                      placeholder="e.g. Tennent's Lager"
                      className="w-full bg-[#EDEDED] py-1.5 px-2.5 rounded-xl text-xs font-bold text-gray-900 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Category</label>
                    <select
                      value={activeCategoryType.includes('keg') ? 'draught' : activeCategoryType}
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

              {/* Section 2: Units */}
              <div className="space-y-2 pt-1 border-t border-gray-100">
                <span className="font-bold uppercase tracking-wider text-[10px] text-gray-400 block">
                  2. Stocktake &amp; Ordering Units
                </span>
                
                <div className="grid grid-cols-12 gap-2 bg-gray-50 p-2.5 rounded-2xl border border-gray-200/70">
                  <div className="col-span-4">
                    <label className="text-[9px] font-bold text-gray-600 uppercase block mb-0.5">Count Unit</label>
                    <input
                      type="text"
                      value={editingItem.count_unit || editingItem.unit || 'unit'}
                      onChange={(e) => setEditingItem({ ...editingItem, count_unit: e.target.value })}
                      placeholder="keg / bottle"
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
                      value={editingItem.package_size_base ?? (activeCategoryType === 'draught' ? 50000 : 700)}
                      onChange={(e) => setEditingItem({ ...editingItem, package_size_base: e.target.value })}
                      placeholder="50000 or 700"
                      className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg font-mono text-xs text-center font-bold"
                    />
                  </div>

                  <div className="col-span-6 pt-1">
                    <label className="text-[9px] font-bold text-gray-600 uppercase block mb-0.5">Order Unit Format</label>
                    <input
                      type="text"
                      value={editingItem.order_unit || (activeCategoryType === 'draught' ? 'keg' : 'case')}
                      onChange={(e) => setEditingItem({ ...editingItem, order_unit: e.target.value })}
                      placeholder="keg / case"
                      className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg text-xs"
                    />
                  </div>
                  <div className="col-span-6 pt-1">
                    <label className="text-[9px] font-bold text-gray-600 uppercase block mb-0.5">Units per Order Case</label>
                    <input
                      type="number"
                      value={editingItem.units_per_order_case ?? 1}
                      onChange={(e) => setEditingItem({ ...editingItem, units_per_order_case: e.target.value })}
                      placeholder="1"
                      className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg font-mono text-xs text-center font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Costs, Buffer & Par Target */}
              <div className="space-y-2 pt-1 border-t border-gray-100">
                <span className="font-bold uppercase tracking-wider text-[10px] text-gray-400 block">
                  3. Wholesale Costs &amp; Reorder Buffer
                </span>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Cost Ex VAT</label>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">£</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editingItem.cost_price_ex_vat ?? 0}
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

                <div className="space-y-1.5 pt-2 bg-gray-50 p-3 rounded-2xl border border-gray-200/60">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-gray-800 uppercase tracking-wider block">
                      Reorder Buffer: <span className="font-mono text-black font-black">{editingItem.buffer_rate ?? 5} / 10</span>
                    </label>
                    <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                      Triggers at 0.{editingItem.buffer_rate ?? 5} deficit
                    </span>
                  </div>

                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={editingItem.buffer_rate ?? 5}
                    onChange={(e) => setEditingItem({ ...editingItem, buffer_rate: parseInt(e.target.value, 10) })}
                    className="w-full accent-black cursor-pointer"
                  />

                  <p className="text-[10px] text-gray-500 font-sans leading-tight italic">
                    {getBufferDescription(editingItem.buffer_rate ?? 5)}
                  </p>
                </div>
              </div>

              {/* Section 4: Dynamic Menu Pour Prices */}
              <div className="space-y-2 pt-1 border-t border-gray-100">
                <span className="font-bold uppercase tracking-wider text-[10px] text-gray-400 block">
                  4. Menu Dispense Prices (£ Inc VAT)
                </span>

                {activeCategoryType === 'draught' && (
                  <div className="grid grid-cols-2 gap-2 bg-[#F9FAFB] p-2.5 rounded-2xl border border-gray-200/80">
                    <div>
                      <label className="text-[9px] font-bold text-gray-600 block mb-0.5">Pint (568ml)</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-mono">£</span>
                        <input
                          type="number"
                          step="0.05"
                          placeholder="5.80"
                          value={editingItem.menu_prices?.pint ?? ''}
                          onChange={(e) => handlePriceFieldChange('pint', e.target.value)}
                          className="w-full bg-white border border-gray-300 py-1 pl-6 pr-2 rounded-lg font-mono font-bold text-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-gray-600 block mb-0.5">Half Pint (284ml)</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-mono">£</span>
                        <input
                          type="number"
                          step="0.05"
                          placeholder="3.00"
                          value={editingItem.menu_prices?.half ?? ''}
                          onChange={(e) => handlePriceFieldChange('half', e.target.value)}
                          className="w-full bg-white border border-gray-300 py-1 pl-6 pr-2 rounded-lg font-mono font-bold text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {activeCategoryType === 'spirits' && (
                  <div className="grid grid-cols-2 gap-2 bg-[#F9FAFB] p-2.5 rounded-2xl border border-gray-200/80">
                    <div>
                      <label className="text-[9px] font-bold text-gray-600 block mb-0.5">Single (25ml)</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-mono">£</span>
                        <input
                          type="number"
                          step="0.05"
                          placeholder="4.50"
                          value={editingItem.menu_prices?.single ?? ''}
                          onChange={(e) => handlePriceFieldChange('single', e.target.value)}
                          className="w-full bg-white border border-gray-300 py-1 pl-6 pr-2 rounded-lg font-mono font-bold text-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-gray-600 block mb-0.5">Double (50ml)</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-mono">£</span>
                        <input
                          type="number"
                          step="0.05"
                          placeholder="8.00"
                          value={editingItem.menu_prices?.double ?? ''}
                          onChange={(e) => handlePriceFieldChange('double', e.target.value)}
                          className="w-full bg-white border border-gray-300 py-1 pl-6 pr-2 rounded-lg font-mono font-bold text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {activeCategoryType === 'wine' && (
                  <div className="grid grid-cols-4 gap-1.5 bg-[#F9FAFB] p-2.5 rounded-2xl border border-gray-200/80">
                    <div>
                      <label className="text-[8px] font-bold text-gray-600 block mb-0.5">125ml</label>
                      <input
                        type="number"
                        step="0.05"
                        placeholder="5.50"
                        value={editingItem.menu_prices?.['125ml'] ?? ''}
                        onChange={(e) => handlePriceFieldChange('125ml', e.target.value)}
                        className="w-full bg-white border border-gray-300 py-1 px-1.5 rounded-lg font-mono font-bold text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-bold text-gray-600 block mb-0.5">175ml</label>
                      <input
                        type="number"
                        step="0.05"
                        placeholder="7.50"
                        value={editingItem.menu_prices?.['175ml'] ?? ''}
                        onChange={(e) => handlePriceFieldChange('175ml', e.target.value)}
                        className="w-full bg-white border border-gray-300 py-1 px-1.5 rounded-lg font-mono font-bold text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-bold text-gray-600 block mb-0.5">250ml</label>
                      <input
                        type="number"
                        step="0.05"
                        placeholder="10.00"
                        value={editingItem.menu_prices?.['250ml'] ?? ''}
                        onChange={(e) => handlePriceFieldChange('250ml', e.target.value)}
                        className="w-full bg-white border border-gray-300 py-1 px-1.5 rounded-lg font-mono font-bold text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-bold text-gray-600 block mb-0.5">Bottle</label>
                      <input
                        type="number"
                        step="0.05"
                        placeholder="28.00"
                        value={editingItem.menu_prices?.bottle ?? ''}
                        onChange={(e) => handlePriceFieldChange('bottle', e.target.value)}
                        className="w-full bg-white border border-gray-300 py-1 px-1.5 rounded-lg font-mono font-bold text-xs"
                      />
                    </div>
                  </div>
                )}

                {(activeCategoryType === 'packaged_beer' || activeCategoryType === 'minerals' || activeCategoryType === 'prep') && (
                  <div className="bg-[#F9FAFB] p-2.5 rounded-2xl border border-gray-200/80">
                    <label className="text-[9px] font-bold text-gray-600 block mb-0.5">Unit Selling Price (£ Inc VAT)</label>
                    <div className="relative max-w-[160px]">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 font-mono">£</span>
                      <input
                        type="number"
                        step="0.05"
                        placeholder="4.50"
                        value={editingItem.menu_prices?.unit ?? ''}
                        onChange={(e) => handlePriceFieldChange('unit', e.target.value)}
                        className="w-full bg-white border border-gray-300 py-1 pl-6 pr-2 rounded-lg font-mono font-bold text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
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
                  <span>{savingItem ? 'Saving to Database...' : 'Save Product & Menu Prices'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Bottom Nav */}
      <nav className="fixed bottom-2 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[390px] z-30 rounded-2xl bg-[#111111]/95 backdrop-blur-md text-white py-2 px-3 flex justify-around items-center text-xs font-semibold shadow-2xl border border-white/10 select-none pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
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