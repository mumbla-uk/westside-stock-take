import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Search,
  Calculator,
  CheckCircle2,
  RefreshCw,
  Plus,
  Minus,
  Sparkles,
  ClipboardList,
  Scale,
  FlaskConical,
  Layers,
  ChevronRight,
  Info,
  Edit3,
  Trash2,
  Save,
  X
} from 'lucide-react';
import { useTwoFingerSwipe } from './useTwoFingerSwipe';
import { supabase, DEFAULT_VENUE_ID } from './lib/db';
import { sendPushNotification } from './lib/notifications';

function AppLogo({ className = "w-6 h-6", fallbackTextClass = "font-serif text-xl font-bold tracking-tighter" }) {
  const [imgError, setImgError] = useState(false);
  if (!imgError) {
    return (
      <img
        src="/img/icon.png"
        alt="West Side Tavern"
        className={`${className} object-contain`}
        onError={() => setImgError(true)}
      />
    );
  }
  return <span className={fallbackTextClass}>T</span>;
}

export default function PrepCalculatorApp({ currentUser, onBackToHub, onLogout }) {
  const [activeTab, setActiveTab] = useState('count'); // 'count' | 'calculator'
  const [prepItems, setPrepItems] = useState([]);
  const [catalogItems, setCatalogItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Counts State
  const [counts, setCounts] = useState({});
  const [savingBatch, setSavingBatch] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  // Scaler State (Protected with guards)
  const [selectedPrepForScale, setSelectedPrepForScale] = useState(null);
  const [scaleMultiplier, setScaleMultiplier] = useState(1);
  const [targetVolumeInput, setTargetVolumeInput] = useState('');

  // Edit / Formulation Builder Modal
  const [editingPrepItem, setEditingPrepItem] = useState(null);
  const [savingFormulation, setSavingFormulation] = useState(false);

  const swipeHandlers = useTwoFingerSwipe({
    disabled: Boolean(editingPrepItem),
    onSwipeRight: () => {
      if (onBackToHub) onBackToHub();
    }
  });

  const fetchPrepData = async () => {
    setLoading(true);
    setStatusMsg(null);
    try {
      // 1. Fetch catalog items for ingredient pickers
      const { data: catData } = await supabase
        .from('catalog_items')
        .select('id, name, base_uom')
        .eq('venue_id', DEFAULT_VENUE_ID)
        .order('name');
      setCatalogItems(catData || []);

      // 2. Fetch prep items
      const { data: itemsData, error: iErr } = await supabase
        .from('prep_items')
        .select('*')
        .eq('venue_id', DEFAULT_VENUE_ID)
        .order('name');

      if (iErr) throw iErr;

      // 3. Fetch prep ingredients
      const { data: ingData, error: ingErr } = await supabase
        .from('prep_ingredients')
        .select('*');

      if (ingErr) throw ingErr;

      const fullList = (itemsData || []).map(p => ({
        ...p,
        ingredients: (ingData || []).filter(i => i.prep_item_id === p.id)
      }));

      setPrepItems(fullList);

      setCounts(prev => {
        const next = { ...prev };
        fullList.forEach(p => {
          if (next[p.id] === undefined) next[p.id] = 0;
        });
        return next;
      });

      // Keep scaler in sync if open
      if (selectedPrepForScale) {
        const updated = fullList.find(p => p.id === selectedPrepForScale.id);
        if (updated) setSelectedPrepForScale(updated);
      }
    } catch (err) {
      console.warn("Could not fetch prep catalog:", err);
      setStatusMsg({ type: 'error', text: 'Error connecting to prep database.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrepData();
  }, []);

  const filteredPrepList = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return prepItems.filter(p => !q || p.name.toLowerCase().includes(q) || (p.station || '').toLowerCase().includes(q));
  }, [prepItems, searchQuery]);

  const updateCount = (id, delta) => {
    setCounts(prev => {
      const cur = Number(prev[id] || 0);
      const next = Math.max(0, Math.round((cur + delta) * 10) / 10);
      return { ...prev, [id]: next };
    });
  };

  // Queue of Batches to Make
  const prepProductionQueue = useMemo(() => {
    const queue = [];
    prepItems.forEach(item => {
      const onHand = Number(counts[item.id] || 0);
      const par = Number(item.par_containers || 1);
      const deficitContainers = Math.max(0, par - onHand);

      if (deficitContainers > 0) {
        const containerSize = Number(item.container_size || 1000);
        const totalVolumeNeeded = deficitContainers * containerSize;
        const baseYield = Number(item.yield_amount || 1000);
        const batchesNeeded = Math.round((totalVolumeNeeded / baseYield) * 10) / 10;

        queue.push({
          ...item,
          onHand,
          par,
          deficitContainers,
          totalVolumeNeeded,
          batchesNeeded: Math.max(0.5, batchesNeeded)
        });
      }
    });
    return queue;
  }, [prepItems, counts]);

  // Aggregated Produce Picklist
  const unifiedProducePickList = useMemo(() => {
    const pickMap = {};

    prepProductionQueue.forEach(prep => {
      const mult = prep.batchesNeeded;
      (prep.ingredients || []).forEach(ing => {
        const key = `${ing.item_name}_${ing.unit}`;
        const totalQty = Number(ing.quantity || 0) * mult;

        if (!pickMap[key]) {
          pickMap[key] = {
            item_id: ing.item_id,
            item_name: ing.item_name,
            totalQuantity: totalQty,
            unit: ing.unit,
            usedIn: [prep.name]
          };
        } else {
          pickMap[key].totalQuantity += totalQty;
          if (!pickMap[key].usedIn.includes(prep.name)) {
            pickMap[key].usedIn.push(prep.name);
          }
        }
      });
    });

    return Object.values(pickMap);
  }, [prepProductionQueue]);

  // SAFE SCALED INGREDIENTS (Guarded against undefined)
  const activeScaledIngredients = useMemo(() => {
    if (!selectedPrepForScale) return [];
    const mult = Number(scaleMultiplier) || 1;
    const lines = selectedPrepForScale.ingredients || [];

    return lines.map(ing => ({
      ...ing,
      scaledQuantity: Math.round((Number(ing.quantity || 0) * mult) * 100) / 100
    }));
  }, [selectedPrepForScale, scaleMultiplier]);

  const handleSelectPrepForScale = (item) => {
    setSelectedPrepForScale(item);
    setScaleMultiplier(1);
    setTargetVolumeInput(String(item.yield_amount || 1000));
  };

  const handleTargetVolumeChange = (val) => {
    setTargetVolumeInput(val);
    const target = parseFloat(val);
    if (!isNaN(target) && target > 0 && selectedPrepForScale) {
      const baseYield = Number(selectedPrepForScale.yield_amount) || 1000;
      setScaleMultiplier(Math.round((target / baseYield) * 100) / 100);
    }
  };

  // CRUD Formulation Handlers
  const handleOpenNewPrepModal = () => {
    setEditingPrepItem({
      id: `PREP-${Date.now().toString().slice(-4)}`,
      venue_id: DEFAULT_VENUE_ID,
      name: '',
      station: 'FRDG',
      yield_amount: 1000,
      yield_unit: 'ml',
      container_size: 1000,
      par_containers: 2,
      shelf_life_days: 7,
      method_instructions: '',
      ingredients: [],
      isNew: true
    });
  };

  const handleOpenEditPrepModal = (item) => {
    setEditingPrepItem({
      ...item,
      ingredients: (item.ingredients || []).map(i => ({ ...i }))
    });
  };

  const handleAddIngredientRow = () => {
    setEditingPrepItem(prev => ({
      ...prev,
      ingredients: [
        ...(prev.ingredients || []),
        {
          id: `tmp-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          item_id: 'RAW-PRODUCE',
          item_name: '',
          quantity: 100,
          unit: 'ml'
        }
      ]
    }));
  };

  const handleUpdateIngredientRow = (idx, field, val) => {
    setEditingPrepItem(prev => {
      const copy = [...(prev.ingredients || [])];
      copy[idx] = { ...copy[idx], [field]: val };
      return { ...prev, ingredients: copy };
    });
  };

  const handleRemoveIngredientRow = (idx) => {
    setEditingPrepItem(prev => ({
      ...prev,
      ingredients: (prev.ingredients || []).filter((_, i) => i !== idx)
    }));
  };

  const handleSaveFormulation = async (e) => {
    e.preventDefault();
    if (!editingPrepItem?.id || !editingPrepItem?.name?.trim()) return;

    setSavingFormulation(true);
    setStatusMsg(null);

    const prepPayload = {
      id: editingPrepItem.id.trim(),
      venue_id: DEFAULT_VENUE_ID,
      name: editingPrepItem.name.trim(),
      station: editingPrepItem.station || 'FRDG',
      yield_amount: Number(editingPrepItem.yield_amount) || 1000,
      yield_unit: editingPrepItem.yield_unit || 'ml',
      container_size: Number(editingPrepItem.container_size) || 1000,
      par_containers: Number(editingPrepItem.par_containers) || 1,
      shelf_life_days: Number(editingPrepItem.shelf_life_days) || 7,
      method_instructions: editingPrepItem.method_instructions || '',
      updated_at: new Date().toISOString()
    };

    try {
      const { error: pErr } = await supabase
        .from('prep_items')
        .upsert(prepPayload, { onConflict: 'id' });

      if (pErr) throw pErr;

      // Replace ingredients
      await supabase.from('prep_ingredients').delete().eq('prep_item_id', prepPayload.id);

      if (editingPrepItem.ingredients && editingPrepItem.ingredients.length > 0) {
        const ingredientsPayload = editingPrepItem.ingredients
          .filter(ing => ing.item_name?.trim())
          .map(ing => ({
            prep_item_id: prepPayload.id,
            item_id: ing.item_id || 'RAW-PRODUCE',
            item_name: ing.item_name.trim(),
            quantity: Number(ing.quantity) || 0,
            unit: ing.unit || 'ml'
          }));

        if (ingredientsPayload.length > 0) {
          const { error: iErr } = await supabase
            .from('prep_ingredients')
            .insert(ingredientsPayload);
          if (iErr) throw iErr;
        }
      }

      setStatusMsg({ type: 'success', text: `Saved formulation for ${prepPayload.name}` });
      setEditingPrepItem(null);
      await fetchPrepData();
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: err.message || 'Error saving prep formulation.' });
    } finally {
      setSavingFormulation(false);
    }
  };

  const handleDeleteFormulation = async (id, name) => {
    if (!window.confirm(`Delete ${name} (${id}) from prep catalog?`)) return;
    try {
      const { error } = await supabase.from('prep_items').delete().eq('id', id);
      if (error) throw error;
      setEditingPrepItem(null);
      if (selectedPrepForScale?.id === id) setSelectedPrepForScale(null);
      setStatusMsg({ type: 'success', text: `Removed ${name}` });
      await fetchPrepData();
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Could not delete item.' });
    }
  };

  const handleSaveDailyPrepCount = async () => {
    setSavingBatch(true);
    setStatusMsg(null);
    const dateStr = new Date().toISOString().slice(0, 10);
    const staffName = currentUser?.name || 'Prep Bartender';

    const records = prepItems.map(p => ({
      venue_id: DEFAULT_VENUE_ID,
      date_str: dateStr,
      prep_item_id: p.id,
      on_hand_containers: Number(counts[p.id] || 0),
      par_containers: Number(p.par_containers || 1),
      batches_needed: prepProductionQueue.find(q => q.id === p.id)?.batchesNeeded || 0,
      logged_by: staffName,
      created_at: new Date().toISOString()
    }));

    try {
      const { error } = await supabase.from('prep_counts').insert(records);
      if (error) throw error;

      sendPushNotification(
        `Prep Audit Complete: ${prepProductionQueue.length} Batches Needed`,
        `${staffName} logged prep stock. ${unifiedProducePickList.length} ingredients queued for prep.`,
        null,
        { module: 'prep' }
      );

      setStatusMsg({ type: 'success', text: `Prep count logged! ${prepProductionQueue.length} items queued to make.` });
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Error recording prep count.' });
    } finally {
      setSavingBatch(false);
    }
  };

  return (
    <div
      {...swipeHandlers}
      className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 overflow-hidden relative select-none"
    >
      {/* Header */}
      <header className="flex items-center justify-between px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-2 border-b border-gray-100 flex-shrink-0 bg-white z-20">
        <div className="flex items-center space-x-2">
          {onBackToHub && (
            <button onClick={onBackToHub} className="mr-0.5 p-1 -ml-1 text-gray-500 hover:text-black rounded-lg transition" title="Return to Hub">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <AppLogo className="w-6 h-6" fallbackTextClass="font-serif text-xl font-bold tracking-tighter" />
          <div>
            <h1 className="font-extrabold text-base tracking-tight text-gray-900 leading-tight">Prep &amp; Batches</h1>
            <span className="text-[10px] text-gray-400 font-mono block">Ratios, Yields &amp; Produce Picklist</span>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          <button onClick={fetchPrepData} className="p-1.5 text-gray-500 hover:text-black rounded-lg transition" title="Refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleOpenNewPrepModal}
            className="flex items-center space-x-1 py-1.5 px-3 rounded-xl bg-black text-white hover:bg-neutral-800 text-xs font-bold transition active:scale-95 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Prep</span>
          </button>
        </div>
      </header>

      {/* Mode Toggle Bar */}
      <div className="px-5 pt-2 pb-1.5 bg-gray-50/80 border-b border-gray-100 flex-shrink-0">
        <div className="flex bg-[#EDEDED] p-1 rounded-2xl">
          <button
            onClick={() => setActiveTab('count')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition flex items-center justify-center space-x-1.5 ${
              activeTab === 'count' ? 'bg-white text-black shadow-xs' : 'text-gray-500 hover:text-black'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Prep Count &amp; Par</span>
          </button>
          <button
            onClick={() => setActiveTab('calculator')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition flex items-center justify-center space-x-1.5 ${
              activeTab === 'calculator' ? 'bg-white text-black shadow-xs' : 'text-gray-500 hover:text-black'
            }`}
          >
            <Calculator className="w-3.5 h-3.5 text-rose-500" />
            <span>Batch Scaler &amp; Specs</span>
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className={`mx-5 my-2 p-2 rounded-xl text-xs font-semibold flex-shrink-0 ${
          statusMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {statusMsg.text}
        </div>
      )}

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4 pb-28 touch-pan-y overscroll-contain">
        {activeTab === 'count' ? (
          /* TAB 1: PREP INVENTORY & PAR COUNT */
          <>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400 block">
                  Daily Station Audit
                </span>
                <p className="text-xs text-gray-500">Count bottles on hand; system scales batches to hit par.</p>
              </div>

              <button
                onClick={handleSaveDailyPrepCount}
                disabled={savingBatch}
                className="py-1.5 px-3 bg-black hover:bg-neutral-800 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1 shadow-sm"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>{savingBatch ? 'Saving...' : 'Save Prep Sheet'}</span>
              </button>
            </div>

            {/* Prep Items List */}
            <div className="divide-y divide-gray-100 border border-gray-200 rounded-3xl overflow-hidden bg-white shadow-xs">
              {filteredPrepList.map(item => {
                const onHand = counts[item.id] ?? 0;
                const par = Number(item.par_containers || 1);
                const deficit = Math.max(0, par - onHand);

                return (
                  <div key={item.id} className="p-3 flex items-center justify-between text-xs">
                    <div className="space-y-0.5 pr-2">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold text-gray-900 block leading-tight text-[11px]">{item.name}</span>
                        <span className="text-[9px] font-mono uppercase bg-gray-100 text-gray-600 px-1 py-0.5 rounded">
                          {item.station}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenEditPrepModal(item)}
                          className="p-0.5 text-gray-400 hover:text-black rounded"
                          title="Edit Formulation"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="text-[10px] text-gray-400 font-mono block">
                        Par: {par} containers ({item.container_size}{item.yield_unit}) • Deficit: <strong className={deficit > 0 ? "text-rose-600 font-bold" : "text-emerald-600"}>{deficit.toFixed(1)}</strong>
                      </span>
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => updateCount(item.id, -0.5)}
                        className="w-7 h-7 bg-gray-100 rounded-lg font-bold text-gray-800 text-xs flex items-center justify-center hover:bg-gray-200"
                      >
                        -
                      </button>
                      <span className="w-9 text-center font-mono font-black text-xs">
                        {Number(onHand).toFixed(1)}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateCount(item.id, 0.5)}
                        className="w-7 h-7 bg-gray-100 rounded-lg font-bold text-gray-800 text-xs flex items-center justify-center hover:bg-gray-200"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* UNIFIED PRODUCE & CHEMICAL PICKLIST */}
            {unifiedProducePickList.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-rose-600 flex items-center space-x-1">
                    <Scale className="w-3.5 h-3.5" />
                    <span>Raw Produce &amp; Chemical Picklist ({unifiedProducePickList.length})</span>
                  </span>
                  <span className="text-[10px] font-mono text-gray-400">Calculated from deficits</span>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 divide-y divide-gray-200/70 text-xs">
                  {unifiedProducePickList.map((ing, idx) => (
                    <div key={idx} className="py-2 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-gray-900 block leading-tight">{ing.item_name}</span>
                        <span className="text-[9px] text-gray-400 font-mono">
                          Used in: {ing.usedIn.join(', ')}
                        </span>
                      </div>
                      <span className="font-mono font-black text-black text-xs bg-white px-2 py-1 rounded-lg border border-gray-200 shadow-xs">
                        {Math.round(ing.totalQuantity * 100) / 100} {ing.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          /* TAB 2: INTERACTIVE BATCH SCALER */
          <>
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400 block">
                Select Formulation to Scale
              </span>
              <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto border border-gray-100 rounded-2xl p-1 bg-gray-50/60">
                {filteredPrepList.map(item => {
                  const isSelected = selectedPrepForScale?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectPrepForScale(item)}
                      className={`p-2 rounded-xl text-left transition border flex flex-col justify-between ${
                        isSelected
                          ? 'bg-black text-white border-black shadow-xs'
                          : 'bg-white border-gray-200 hover:bg-gray-100 text-gray-900'
                      }`}
                    >
                      <span className="font-bold text-xs truncate block">{item.name}</span>
                      <span className={`text-[9px] font-mono block mt-0.5 ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}>
                        Base: {item.yield_amount}{item.yield_unit} • {item.station}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedPrepForScale && (
              <div className="bg-white border-2 border-black rounded-3xl p-4 space-y-3.5 shadow-md animate-in fade-in duration-150">
                <div className="flex items-start justify-between border-b border-gray-100 pb-2.5">
                  <div>
                    <span className="text-[9px] font-mono font-bold uppercase text-rose-600 block tracking-wider">
                      Batch Calculator
                    </span>
                    <h3 className="text-sm font-black text-gray-900">{selectedPrepForScale.name}</h3>
                    <span className="text-[10px] text-gray-400 font-mono">
                      Station: {selectedPrepForScale.station} • Standard Yield: {selectedPrepForScale.yield_amount} {selectedPrepForScale.yield_unit}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenEditPrepModal(selectedPrepForScale)}
                      className="p-1.5 text-gray-400 hover:text-black rounded-lg border border-gray-200 shadow-xs"
                      title="Edit Specs & Ingredients"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedPrepForScale(null)}
                      className="p-1.5 text-gray-400 hover:text-black rounded-lg border border-gray-200 shadow-xs"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Target Scaler Controls */}
                <div className="grid grid-cols-2 gap-2 bg-gray-50 p-2.5 rounded-2xl border border-gray-200">
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Target Volume ({selectedPrepForScale.yield_unit})</label>
                    <input
                      type="number"
                      step="any"
                      value={targetVolumeInput}
                      onChange={(e) => handleTargetVolumeChange(e.target.value)}
                      className="w-full bg-white border border-gray-300 py-1.5 px-2.5 rounded-xl font-mono text-xs font-black text-gray-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Batch Multiplier</label>
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => {
                          const n = Math.max(0.25, Math.round((scaleMultiplier - 0.25) * 100) / 100);
                          setScaleMultiplier(n);
                          setTargetVolumeInput(String(Math.round(n * (Number(selectedPrepForScale.yield_amount) || 1000))));
                        }}
                        className="w-7 h-7 bg-white rounded-lg border border-gray-300 font-bold text-xs"
                      >
                        -
                      </button>
                      <span className="flex-1 text-center font-mono font-bold text-xs">
                        {scaleMultiplier}x
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const n = Math.round((scaleMultiplier + 0.25) * 100) / 100;
                          setScaleMultiplier(n);
                          setTargetVolumeInput(String(Math.round(n * (Number(selectedPrepForScale.yield_amount) || 1000))));
                        }}
                        className="w-7 h-7 bg-white rounded-lg border border-gray-300 font-bold text-xs"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Scaled Ingredients Breakdown */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400 block">
                    Scaled Formulation Requirements
                  </span>
                  
                  {activeScaledIngredients.length === 0 ? (
                    <div className="p-4 border border-dashed border-gray-200 rounded-2xl text-center text-xs text-gray-400">
                      No ingredients logged for this item yet. Tap the edit pencil above to add produce or spirit measures.
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100 border border-gray-200 rounded-2xl overflow-hidden bg-white">
                      {activeScaledIngredients.map((ing, idx) => (
                        <div key={idx} className="p-2.5 flex items-center justify-between text-xs">
                          <span className="font-bold text-gray-900">{ing.item_name}</span>
                          <span className="font-mono font-black text-black text-xs bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                            {ing.scaledQuantity} {ing.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Method from Booklet */}
                {selectedPrepForScale.method_instructions && (
                  <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-1 text-xs">
                    <span className="text-[9px] font-mono font-bold uppercase text-amber-800 flex items-center space-x-1">
                      <Info className="w-3 h-3" />
                      <span>Production Method</span>
                    </span>
                    <p className="text-gray-700 leading-relaxed text-[11px] italic">
                      "{selectedPrepForScale.method_instructions}"
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* FULL FORMULATION EDIT / BUILDER MODAL */}
      {editingPrepItem && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl border border-gray-200 flex flex-col max-h-[92vh] animate-in slide-in-from-bottom duration-200">
            <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex justify-between items-center bg-gray-50/80">
              <div>
                <span className="text-[9px] font-mono uppercase text-rose-600 font-bold block">
                  {editingPrepItem.isNew ? 'New Prep Formulation' : `Edit • ${editingPrepItem.id}`}
                </span>
                <h2 className="text-base font-black text-gray-900 leading-tight mt-0.5">
                  {editingPrepItem.name || 'Formulation Specs'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingPrepItem(null)}
                className="p-1.5 text-gray-400 hover:text-black bg-white rounded-full border border-gray-200 shadow-xs"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveFormulation} className="p-5 overflow-y-auto space-y-4 text-xs touch-pan-y overscroll-contain">
              {/* Basic Meta */}
              <div className="space-y-2">
                <span className="font-bold uppercase tracking-wider text-[10px] text-gray-400 block">
                  1. Specifications &amp; Yield
                </span>

                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-4">
                    <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Prep Code *</label>
                    <input
                      type="text"
                      required
                      value={editingPrepItem.id}
                      onChange={(e) => setEditingPrepItem({ ...editingPrepItem, id: e.target.value })}
                      className="w-full bg-[#EDEDED] py-1.5 px-2.5 rounded-xl font-mono text-xs font-bold text-gray-900 focus:outline-none"
                    />
                  </div>
                  <div className="col-span-8">
                    <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Item Name *</label>
                    <input
                      type="text"
                      required
                      value={editingPrepItem.name}
                      onChange={(e) => setEditingPrepItem({ ...editingPrepItem, name: e.target.value })}
                      placeholder="e.g. Super Lime Juice"
                      className="w-full bg-[#EDEDED] py-1.5 px-2.5 rounded-xl text-xs font-bold text-gray-900 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Station</label>
                    <select
                      value={editingPrepItem.station || 'FRDG'}
                      onChange={(e) => setEditingPrepItem({ ...editingPrepItem, station: e.target.value })}
                      className="w-full bg-[#EDEDED] py-1.5 px-2 rounded-xl text-xs font-medium text-gray-800 focus:outline-none"
                    >
                      <option value="FRDG">Fridge (FRDG)</option>
                      <option value="FRZR">Freezer (FRZR)</option>
                      <option value="SHELF">Back Bar (SHELF)</option>
                      <option value="CELLAR">Cellar / Tap</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Batch Yield</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        value={editingPrepItem.yield_amount || 1000}
                        onChange={(e) => setEditingPrepItem({ ...editingPrepItem, yield_amount: e.target.value })}
                        className="w-full bg-[#EDEDED] py-1.5 px-2 rounded-xl text-xs font-mono font-bold text-center text-gray-900 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Yield Unit</label>
                    <input
                      type="text"
                      value={editingPrepItem.yield_unit || 'ml'}
                      onChange={(e) => setEditingPrepItem({ ...editingPrepItem, yield_unit: e.target.value })}
                      className="w-full bg-[#EDEDED] py-1.5 px-2 rounded-xl text-xs font-mono font-bold text-center text-gray-900 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Container Size (ml/g)</label>
                    <input
                      type="number"
                      step="any"
                      value={editingPrepItem.container_size || 1000}
                      onChange={(e) => setEditingPrepItem({ ...editingPrepItem, container_size: e.target.value })}
                      className="w-full bg-[#EDEDED] py-1.5 px-2 rounded-xl text-xs font-mono font-bold text-center text-gray-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Par (Containers)</label>
                    <input
                      type="number"
                      step="any"
                      value={editingPrepItem.par_containers || 2}
                      onChange={(e) => setEditingPrepItem({ ...editingPrepItem, par_containers: e.target.value })}
                      className="w-full bg-[#EDEDED] py-1.5 px-2 rounded-xl text-xs font-mono font-bold text-center text-gray-900 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Ingredients / Produce Lines */}
              <div className="space-y-2 pt-1 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="font-bold uppercase tracking-wider text-[10px] text-gray-400 block">
                    2. Ingredients, Produce &amp; Chemicals
                  </span>
                  <button
                    type="button"
                    onClick={handleAddIngredientRow}
                    className="flex items-center space-x-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200 hover:bg-emerald-100 transition"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Item</span>
                  </button>
                </div>

                {(!editingPrepItem.ingredients || editingPrepItem.ingredients.length === 0) ? (
                  <div className="p-3 border border-dashed border-gray-200 rounded-2xl text-center text-xs text-gray-400">
                    No ingredients added yet. Tap "Add Item" above to add produce, spirits or chemicals.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {editingPrepItem.ingredients.map((ing, idx) => (
                      <div key={idx} className="flex items-center space-x-1.5 bg-gray-50 p-2 rounded-xl border border-gray-200">
                        {/* Name or Catalog Link */}
                        <div className="flex-1 min-w-0">
                          <input
                            type="text"
                            required
                            placeholder="e.g. Lime Peels or Campari"
                            value={ing.item_name}
                            onChange={(e) => handleUpdateIngredientRow(idx, 'item_name', e.target.value)}
                            className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg text-xs font-semibold focus:outline-none"
                          />
                        </div>

                        {/* Amount */}
                        <div className="w-16">
                          <input
                            type="number"
                            step="any"
                            required
                            placeholder="Qty"
                            value={ing.quantity}
                            onChange={(e) => handleUpdateIngredientRow(idx, 'quantity', e.target.value)}
                            className="w-full bg-white border border-gray-300 py-1 px-1.5 rounded-lg text-xs font-mono font-bold text-center focus:outline-none"
                          />
                        </div>

                        {/* Unit */}
                        <div className="w-14">
                          <input
                            type="text"
                            required
                            placeholder="ml/g"
                            value={ing.unit}
                            onChange={(e) => handleUpdateIngredientRow(idx, 'unit', e.target.value)}
                            className="w-full bg-white border border-gray-300 py-1 px-1 rounded-lg text-[10px] font-mono font-bold text-center focus:outline-none"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveIngredientRow(idx)}
                          className="p-1 text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Booklet Instructions */}
              <div className="space-y-1 pt-1 border-t border-gray-100">
                <label className="text-[9px] font-bold text-gray-500 uppercase block">Production Method (from booklet)</label>
                <textarea
                  rows={3}
                  value={editingPrepItem.method_instructions || ''}
                  onChange={(e) => setEditingPrepItem({ ...editingPrepItem, method_instructions: e.target.value })}
                  placeholder="e.g. Sous vide at 60C for 1 hour, fine strain through chinois..."
                  className="w-full bg-[#EDEDED] p-2 rounded-xl text-xs leading-relaxed focus:outline-none resize-none"
                />
              </div>

              {/* Actions */}
              <div className="pt-2 flex items-center space-x-2">
                {!editingPrepItem.isNew && (
                  <button
                    type="button"
                    onClick={() => handleDeleteFormulation(editingPrepItem.id, editingPrepItem.name)}
                    className="p-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl transition"
                    title="Delete item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="submit"
                  disabled={savingFormulation}
                  className="flex-1 py-3 bg-black hover:bg-neutral-800 disabled:opacity-40 text-white rounded-2xl text-xs font-bold transition flex items-center justify-center space-x-1.5 shadow-md"
                >
                  <Save className="w-4 h-4 text-emerald-400" />
                  <span>{savingFormulation ? 'Saving to Database...' : 'Save Formulation'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Hub Nav */}
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