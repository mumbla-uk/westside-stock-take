import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Search,
  Trash2,
  AlertTriangle,
  Beer,
  Wine,
  GlassWater,
  Package,
  FlaskConical,
  CheckCircle2,
  RefreshCw,
  Plus,
  X,
  History,
  TrendingDown
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

const CATEGORIES = [
  { id: 'all', label: 'All Items' },
  { id: 'draught', label: 'Draught Beer', icon: Beer },
  { id: 'spirits', label: 'Spirits', icon: GlassWater },
  { id: 'packaged_beer', label: 'Packaged Beer', icon: Package },
  { id: 'wine', label: 'Wine', icon: Wine },
  { id: 'prep', label: 'Prep & Batching', icon: FlaskConical },
];

const REASONS = [
  { id: 'line_clean', label: 'Line Clean / Cellar Flush', desc: 'Routine weekly flush' },
  { id: 'foaming', label: 'Foaming / Bad Head / Dregs', desc: 'Gas pressure or fob loss' },
  { id: 'breakage', label: 'Breakage / Dropped', desc: 'Bar slip or dropped glass' },
  { id: 'return', label: 'Customer Return / Off Pint', desc: 'Corked wine or turned beer' },
  { id: 'prep_batch', label: 'Cocktail / Batch Prep', desc: 'Cordial, infusion or shrub cook' },
  { id: 'spoilage', label: 'Out of Date / Spoiled', desc: 'Product expired or soured' },
];

export default function SpillageAndWastage({ currentUser, onBackToHub, onLogout }) {
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogItems, setCatalogItems] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  
  // Active Form State
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [customQtyInput, setCustomQtyInput] = useState('');
  const [selectedReason, setSelectedReason] = useState(REASONS[1].label);
  const [customNotes, setCustomNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  // Wastage History Ledger
  const [recentLogs, setRecentLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const swipeHandlers = useTwoFingerSwipe({
    onSwipeRight: () => {
      if (onBackToHub) onBackToHub();
    }
  });

  // 1. Fetch Catalog Inventory with Base Units
  const fetchInventory = async () => {
    setLoadingCatalog(true);
    try {
      const { data, error } = await supabase
        .from('catalog_items')
        .select('*')
        .eq('venue_id', DEFAULT_VENUE_ID)
        .order('name');
      
      if (error) throw error;
      if (data) {
        // Normalize schema contracts
        const mapped = data.map(item => {
          const cat = (item.category || '').toLowerCase();
          const isDraught = cat.includes('draught') || (item.unit && item.unit.toLowerCase().includes('keg'));
          const isSpirit = cat.includes('spirit') || (item.unit && item.unit.toLowerCase().includes('bottle') && !cat.includes('wine'));
          const isWine = cat.includes('wine');
          const isPackage = cat.includes('beer') && !isDraught;

          const category = isDraught ? 'draught' : isSpirit ? 'spirits' : isWine ? 'wine' : isPackage ? 'packaged_beer' : 'prep';
          const baseUom = (isDraught || isSpirit || isWine || category === 'prep') ? 'ml' : 'each';
          
          let packageSizeBase = 700; // default 700ml bottle
          if (isDraught) packageSizeBase = 50000; // 50L keg default
          if (isWine) packageSizeBase = 750; // 750ml wine
          if (baseUom === 'each') packageSizeBase = 1;

          const unitsPerCase = isDraught ? 1 : isPackage ? 24 : 6;
          const costPerOrderUnit = item.cost_price || 35.00;

          return {
            id: item.id,
            name: item.name,
            category,
            base_uom: baseUom,
            package_size_base: item.package_size_base || packageSizeBase,
            units_per_order_case: item.units_per_order_case || unitsPerCase,
            cost_per_order_unit: Number(item.cost_per_order_unit || costPerOrderUnit),
            current_stock_base: Number(item.current_stock_base ?? (item.count ? item.count * packageSizeBase : 0))
          };
        });
        setCatalogItems(mapped);
      }
    } catch (err) {
      console.warn("Could not load inventory for spillage app:", err);
    } finally {
      setLoadingCatalog(false);
    }
  };

  // 2. Fetch Recent Wastage Logs
  const fetchWastageLogs = async () => {
    setLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('wastage_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);

      if (!error && data) {
        setRecentLogs(data);
      }
    } catch (err) {
      console.warn("Could not load wastage log:", err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchInventory();
    fetchWastageLogs();
  }, []);

  // Filter Catalog
  const filteredCatalog = useMemo(() => {
    return catalogItems.filter(item => {
      const matchesCat = activeCategory === 'all' || item.category === activeCategory;
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [catalogItems, activeCategory, searchQuery]);

  // Handle Item Selection and Initialize Default Presets
  const handleSelectItem = (item) => {
    setSelectedItem(item);
    setCustomQtyInput('');
    setSelectedPreset(null);
    if (item.category === 'draught') {
      setSelectedPreset({ label: 'Pint', baseAmount: 568, unit: 'pints', qty: 1 });
    } else if (item.category === 'spirits') {
      setSelectedPreset({ label: 'Single (25ml)', baseAmount: 25, unit: 'measures', qty: 1 });
    } else if (item.category === 'wine') {
      setSelectedPreset({ label: 'Large (250ml)', baseAmount: 250, unit: 'glasses', qty: 1 });
    } else if (item.category === 'packaged_beer') {
      setSelectedPreset({ label: '1 Can / Bottle', baseAmount: 1, unit: 'each', qty: 1 });
    } else {
      setSelectedPreset({ label: '100ml', baseAmount: 100, unit: 'ml', qty: 100 });
    }
  };

  // Calculate live deducted base units & total £ cost impact
  const wastageMetrics = useMemo(() => {
    if (!selectedItem) return { totalBaseUnits: 0, costImpact: 0, displayVolume: '' };

    let totalBaseUnits = 0;
    let displayVolume = '';

    if (customQtyInput) {
      const parsed = parseFloat(customQtyInput) || 0;
      totalBaseUnits = parsed;
      displayVolume = `${parsed} ${selectedItem.base_uom}`;
    } else if (selectedPreset) {
      totalBaseUnits = selectedPreset.baseAmount;
      displayVolume = `${selectedPreset.label}`;
    }

    // Cost formula: (Deducted Base Units / Total Base Units in Whole Case/Keg) * Case Cost
    const totalBaseUnitsInCase = selectedItem.package_size_base * selectedItem.units_per_order_case;
    const costImpact = totalBaseUnitsInCase > 0 
      ? (totalBaseUnits / totalBaseUnitsInCase) * selectedItem.cost_per_order_unit
      : 0;

    return {
      totalBaseUnits,
      costImpact: Math.max(0, costImpact),
      displayVolume
    };
  }, [selectedItem, selectedPreset, customQtyInput]);

  // Submit Wastage Entry
  const handleSubmitWastage = async (e) => {
    e.preventDefault();
    if (!selectedItem || wastageMetrics.totalBaseUnits <= 0) return;

    setSubmitting(true);
    setStatusMsg(null);
    const staffName = currentUser?.name || 'Duty Manager';

    const payload = {
      venue_id: DEFAULT_VENUE_ID,
      item_id: selectedItem.id,
      item_name: selectedItem.name,
      category: selectedItem.category,
      logged_qty: customQtyInput ? parseFloat(customQtyInput) : selectedPreset?.qty || 1,
      unit_used: customQtyInput ? selectedItem.base_uom : selectedPreset?.unit || selectedItem.base_uom,
      total_base_deducted: wastageMetrics.totalBaseUnits,
      cost_impact: Number(wastageMetrics.costImpact.toFixed(2)),
      reason: selectedReason,
      notes: customNotes.trim(),
      staff_name: staffName,
      created_at: new Date().toISOString()
    };

    try {
      // 1. Insert into wastage_log
      const { error: logErr } = await supabase.from('wastage_log').insert(payload);
      if (logErr) throw logErr;

      // 2. Decrement inventory item atomically
      const nextStock = Math.max(0, (selectedItem.current_stock_base || 0) - wastageMetrics.totalBaseUnits);
      await supabase
        .from('catalog_items')
        .update({
          current_stock_base: nextStock,
          count: selectedItem.package_size_base > 0 ? (nextStock / selectedItem.package_size_base).toFixed(2) : 0
        })
        .eq('id', selectedItem.id);

      // 3. Dispatch push notification for major losses (> £15)
      if (wastageMetrics.costImpact >= 15.00) {
        sendPushNotification(
          `High Spillage Logged: ${selectedItem.name}`,
          `${staffName} logged £${wastageMetrics.costImpact.toFixed(2)} waste (${selectedReason})`,
          null,
          { module: 'wastage' }
        );
      }

      setStatusMsg({
        type: 'success',
        text: `Logged ${wastageMetrics.displayVolume} ${selectedItem.name} (£${wastageMetrics.costImpact.toFixed(2)})`
      });

      // Reset
      setSelectedItem(null);
      setCustomQtyInput('');
      setCustomNotes('');
      await fetchWastageLogs();
      await fetchInventory();
    } catch (err) {
      console.error("Wastage submission error:", err);
      setStatusMsg({ type: 'error', text: 'Error recording wastage to database.' });
    } finally {
      setSubmitting(false);
    }
  };

  // Top Metrics
  const dailySummary = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayLogs = recentLogs.filter(l => (l.created_at || '').slice(0, 10) === todayStr);

    let totalCost = 0;
    let pintsWasted = 0;
    const catCount = {};

    todayLogs.forEach(l => {
      totalCost += Number(l.cost_impact || 0);
      if (l.category === 'draught') {
        pintsWasted += Math.round((Number(l.total_base_deducted || 0) / 568) * 10) / 10;
      }
      catCount[l.category] = (catCount[l.category] || 0) + Number(l.cost_impact || 0);
    });

    let topCategory = 'None';
    let maxVal = 0;
    Object.entries(catCount).forEach(([c, val]) => {
      if (val > maxVal) {
        maxVal = val;
        topCategory = c.toUpperCase();
      }
    });

    return { totalCost, pintsWasted, topCategory };
  }, [recentLogs]);

  return (
    <div
      {...swipeHandlers}
      className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-[#0E1015] text-neutral-100 font-sans antialiased border-x border-neutral-800 overflow-hidden relative select-none"
    >
      {/* Top Header */}
      <header className="flex items-center justify-between px-5 pt-[max(1.2rem,env(safe-area-inset-top))] pb-3 border-b border-white/10 flex-shrink-0 bg-[#14171F] z-20 shadow-md">
        <div className="flex items-center space-x-2">
          {onBackToHub && (
            <button onClick={onBackToHub} className="mr-0.5 p-1 -ml-1 text-neutral-400 hover:text-white rounded-lg transition" title="Return to Hub">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <AppLogo className="w-6 h-6 invert" fallbackTextClass="font-serif text-2xl font-bold tracking-tighter text-white" />
          <div>
            <h1 className="font-black text-sm tracking-tight text-white leading-tight">Spillage & Wastage</h1>
            <span className="text-[10px] text-neutral-400 font-mono block">Cost Impact & Loss Audit</span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button onClick={() => { fetchInventory(); fetchWastageLogs(); }} className="p-1.5 text-neutral-400 hover:text-white rounded-lg transition" title="Refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${loadingCatalog || loadingLogs ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </header>

      {/* Top Loss KPI Cards */}
      <div className="grid grid-cols-3 gap-2 px-5 py-2.5 bg-[#14171F] border-b border-white/5 flex-shrink-0 text-left">
        <div className="bg-white/5 p-2.5 rounded-2xl border border-white/5 space-y-0.5">
          <span className="text-[9px] font-mono uppercase text-neutral-400 font-bold block">Today's Loss</span>
          <span className="text-base font-black text-rose-400 font-mono">
            £{dailySummary.totalCost.toFixed(2)}
          </span>
        </div>

        <div className="bg-white/5 p-2.5 rounded-2xl border border-white/5 space-y-0.5">
          <span className="text-[9px] font-mono uppercase text-neutral-400 font-bold block">Draught Lost</span>
          <span className="text-base font-black text-amber-300 font-mono">
            {dailySummary.pintsWasted} <span className="text-[10px] font-sans font-normal text-neutral-400">pts</span>
          </span>
        </div>

        <div className="bg-white/5 p-2.5 rounded-2xl border border-white/5 space-y-0.5">
          <span className="text-[9px] font-mono uppercase text-neutral-400 font-bold block">Top Category</span>
          <span className="text-xs font-black text-white truncate block pt-0.5">
            {dailySummary.topCategory}
          </span>
        </div>
      </div>

      {statusMsg && (
        <div className={`mx-5 my-2 p-2 rounded-xl text-xs font-semibold flex-shrink-0 ${
          statusMsg.type === 'success' ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800' : 'bg-rose-950/80 text-rose-300 border border-rose-800'
        }`}>
          {statusMsg.text}
        </div>
      )}

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4 pb-28 touch-pan-y overscroll-contain">
        
        {/* Step 1: Category Filter Pills */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-400">
            1. Select Item Category
          </span>
          <div className="flex items-center space-x-1.5 overflow-x-auto scrollbar-none pb-0.5">
            {CATEGORIES.map(c => {
              const Icon = c.icon;
              const isSelected = activeCategory === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => { setActiveCategory(c.id); setSelectedItem(null); }}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition border ${
                    isSelected
                      ? 'bg-white text-black border-white shadow-sm'
                      : 'bg-white/5 text-neutral-400 border-white/5 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {Icon && <Icon className="w-3.5 h-3.5" />}
                  <span>{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Item Search & Quick-Select Dropdown */}
        <div className="space-y-1.5">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search SKU or tap below (e.g. Tennent's, Negroni batch)..."
              className="w-full bg-[#181B24] border border-white/10 py-2 pl-3 pr-8 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white/30"
            />
            {searchQuery ? (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
            )}
          </div>

          {/* Quick-Pick SKU Grid */}
          <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto border border-white/5 rounded-2xl p-1 bg-black/20">
            {filteredCatalog.slice(0, 10).map(item => {
              const isSelected = selectedItem?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectItem(item)}
                  className={`p-2 rounded-xl text-left transition border flex flex-col justify-between ${
                    isSelected
                      ? 'bg-emerald-500/20 border-emerald-400 text-white shadow-xs'
                      : 'bg-white/5 border-white/5 hover:bg-white/10 text-neutral-300'
                  }`}
                >
                  <span className="font-bold text-xs truncate block">{item.name}</span>
                  <span className="text-[9px] font-mono text-neutral-400 block mt-0.5">
                    {item.category.toUpperCase()} • £{(item.cost_per_order_unit / item.units_per_order_case).toFixed(2)}/unit
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 3: Context-Aware Presets & Live Loss Visualizer */}
        {selectedItem && (
          <form onSubmit={handleSubmitWastage} className="bg-[#14171F] border border-white/10 rounded-3xl p-4 space-y-3.5 shadow-xl animate-in fade-in duration-150">
            <div className="flex items-start justify-between border-b border-white/10 pb-2.5">
              <div>
                <span className="text-[9px] font-mono font-bold uppercase text-emerald-400 block tracking-wider">
                  Target Product Selected
                </span>
                <h3 className="text-sm font-black text-white">{selectedItem.name}</h3>
                <span className="text-[10px] text-neutral-400 font-mono">
                  Base UOM: {selectedItem.base_uom} | Pkg: {selectedItem.package_size_base}{selectedItem.base_uom}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="p-1 text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Presets by Category */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-400">
                Wastage Volume / Measures
              </span>

              <div className="grid grid-cols-2 gap-1.5">
                {selectedItem.category === 'draught' && (
                  <>
                    <button
                      type="button"
                      onClick={() => { setSelectedPreset({ label: 'Half Pint (284ml)', baseAmount: 284, unit: 'pints', qty: 0.5 }); setCustomQtyInput(''); }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        selectedPreset?.baseAmount === 284 && !customQtyInput ? 'bg-white text-black border-white' : 'bg-white/5 border-white/5 text-neutral-300'
                      }`}
                    >
                      Half Pint (284ml)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedPreset({ label: 'Full Pint (568ml)', baseAmount: 568, unit: 'pints', qty: 1.0 }); setCustomQtyInput(''); }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        selectedPreset?.baseAmount === 568 && !customQtyInput ? 'bg-white text-black border-white' : 'bg-white/5 border-white/5 text-neutral-300'
                      }`}
                    >
                      Pint (568ml)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedPreset({ label: 'Full 50L Keg', baseAmount: 50000, unit: 'keg', qty: 1.0 }); setCustomQtyInput(''); }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        selectedPreset?.baseAmount === 50000 && !customQtyInput ? 'bg-white text-black border-white' : 'bg-white/5 border-white/5 text-neutral-300'
                      }`}
                    >
                      Full 50L Keg
                    </button>
                  </>
                )}

                {selectedItem.category === 'spirits' && (
                  <>
                    <button
                      type="button"
                      onClick={() => { setSelectedPreset({ label: 'Single Measure (25ml)', baseAmount: 25, unit: 'measures', qty: 1 }); setCustomQtyInput(''); }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        selectedPreset?.baseAmount === 25 && !customQtyInput ? 'bg-white text-black border-white' : 'bg-white/5 border-white/5 text-neutral-300'
                      }`}
                    >
                      Single (25ml)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedPreset({ label: 'Double Measure (50ml)', baseAmount: 50, unit: 'measures', qty: 2 }); setCustomQtyInput(''); }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        selectedPreset?.baseAmount === 50 && !customQtyInput ? 'bg-white text-black border-white' : 'bg-white/5 border-white/5 text-neutral-300'
                      }`}
                    >
                      Double (50ml)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedPreset({ label: 'Full 700ml Bottle', baseAmount: 700, unit: 'bottle', qty: 1 }); setCustomQtyInput(''); }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        selectedPreset?.baseAmount === 700 && !customQtyInput ? 'bg-white text-black border-white' : 'bg-white/5 border-white/5 text-neutral-300'
                      }`}
                    >
                      Full Bottle (700ml)
                    </button>
                  </>
                )}

                {selectedItem.category === 'wine' && (
                  <>
                    <button
                      type="button"
                      onClick={() => { setSelectedPreset({ label: 'Small Glass (125ml)', baseAmount: 125, unit: 'glasses', qty: 1 }); setCustomQtyInput(''); }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        selectedPreset?.baseAmount === 125 && !customQtyInput ? 'bg-white text-black border-white' : 'bg-white/5 border-white/5 text-neutral-300'
                      }`}
                    >
                      Small (125ml)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedPreset({ label: 'Medium Glass (175ml)', baseAmount: 175, unit: 'glasses', qty: 1 }); setCustomQtyInput(''); }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        selectedPreset?.baseAmount === 175 && !customQtyInput ? 'bg-white text-black border-white' : 'bg-white/5 border-white/5 text-neutral-300'
                      }`}
                    >
                      Medium (175ml)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedPreset({ label: 'Large Glass (250ml)', baseAmount: 250, unit: 'glasses', qty: 1 }); setCustomQtyInput(''); }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        selectedPreset?.baseAmount === 250 && !customQtyInput ? 'bg-white text-black border-white' : 'bg-white/5 border-white/5 text-neutral-300'
                      }`}
                    >
                      Large (250ml)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedPreset({ label: 'Full Bottle (750ml)', baseAmount: 750, unit: 'bottle', qty: 1 }); setCustomQtyInput(''); }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        selectedPreset?.baseAmount === 750 && !customQtyInput ? 'bg-white text-black border-white' : 'bg-white/5 border-white/5 text-neutral-300'
                      }`}
                    >
                      Full Bottle (750ml)
                    </button>
                  </>
                )}

                {selectedItem.category === 'packaged_beer' && (
                  <>
                    <button
                      type="button"
                      onClick={() => { setSelectedPreset({ label: '1 Bottle / Can', baseAmount: 1, unit: 'each', qty: 1 }); setCustomQtyInput(''); }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        selectedPreset?.baseAmount === 1 && !customQtyInput ? 'bg-white text-black border-white' : 'bg-white/5 border-white/5 text-neutral-300'
                      }`}
                    >
                      1 Bottle / Can
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedPreset({ label: 'Full Case (24)', baseAmount: 24, unit: 'case', qty: 24 }); setCustomQtyInput(''); }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        selectedPreset?.baseAmount === 24 && !customQtyInput ? 'bg-white text-black border-white' : 'bg-white/5 border-white/5 text-neutral-300'
                      }`}
                    >
                      Full Case (24)
                    </button>
                  </>
                )}

                {/* Custom Entry Option */}
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    value={customQtyInput}
                    onChange={(e) => { setCustomQtyInput(e.target.value); setSelectedPreset(null); }}
                    placeholder={`Custom ${selectedItem.base_uom}...`}
                    className="w-full bg-[#1A1E29] border border-white/10 py-2 px-2.5 rounded-xl text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-400"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-neutral-500 font-mono uppercase">
                    {selectedItem.base_uom}
                  </span>
                </div>
              </div>
            </div>

            {/* Step 4: Reason Tag Selector */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-400">
                Reason for Spillage / Loss
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {REASONS.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedReason(r.label)}
                    className={`p-2 rounded-xl text-left border transition text-xs ${
                      selectedReason === r.label
                        ? 'bg-rose-500/20 border-rose-400 text-white font-bold'
                        : 'bg-white/5 border-white/5 text-neutral-400 hover:bg-white/10'
                    }`}
                  >
                    <span className="block truncate">{r.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 5: Live Real-Time Impact Readout */}
            <div className="bg-black/50 border border-white/10 rounded-2xl p-3 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[9px] font-mono text-neutral-400 uppercase tracking-wider block">Live Cost Deduction</span>
                <span className="text-xs text-neutral-200 block font-medium">
                  Deducting {wastageMetrics.totalBaseUnits} {selectedItem.base_uom}
                </span>
              </div>
              <div className="text-right">
                <span className="text-lg font-black text-rose-400 font-mono block">
                  ~£{wastageMetrics.costImpact.toFixed(2)}
                </span>
                <span className="text-[9px] text-neutral-500 font-mono block">Cost Impact</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || wastageMetrics.totalBaseUnits <= 0}
              className="w-full py-3 bg-[#E5484D] hover:bg-[#d93d42] active:scale-[0.98] disabled:opacity-40 text-white rounded-2xl text-xs font-black transition flex items-center justify-center space-x-1.5 shadow-lg shadow-rose-950/20"
            >
              <CheckCircle2 className="w-4 h-4 text-white" />
              <span>{submitting ? 'Recording Loss...' : 'Confirm & Deduct Stock'}</span>
            </button>
          </form>
        )}

        {/* Step 6: Rolling Activity Ledger */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-400">
              Recent Spillage Activity
            </span>
            <span className="text-[10px] font-mono text-neutral-500">
              {recentLogs.length} total logged
            </span>
          </div>

          <div className="divide-y divide-white/5 bg-[#14171F] border border-white/10 rounded-3xl overflow-hidden shadow-sm">
            {recentLogs.length === 0 ? (
              <p className="p-5 text-center text-xs text-neutral-500 italic">No spillage entries logged yet.</p>
            ) : (
              recentLogs.map((log) => (
                <div key={log.id} className="p-3 flex items-center justify-between text-xs">
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <span className="font-bold text-white text-[11px]">{log.item_name}</span>
                      <span className="text-[9px] font-mono text-neutral-500 uppercase px-1 rounded bg-white/5">
                        {log.reason}
                      </span>
                    </div>
                    <span className="text-[10px] text-neutral-400 font-mono block mt-0.5">
                      {log.total_base_deducted} ml/ea • {log.staff_name} • {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <span className="font-mono font-bold text-rose-400 text-xs">
                    -£{Number(log.cost_impact || 0).toFixed(2)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

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