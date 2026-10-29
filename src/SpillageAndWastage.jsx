import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Search,
  Beer,
  Wine,
  GlassWater,
  Package,
  FlaskConical,
  CheckCircle2,
  RefreshCw,
  X,
  Calendar,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
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
  { id: 'line_clean', label: 'Line Clean / Cellar Flush' },
  { id: 'foaming', label: 'Foaming / Bad Head / Dregs' },
  { id: 'breakage', label: 'Breakage / Dropped' },
  { id: 'return', label: 'Customer Return / Off Drink' },
  { id: 'prep_batch', label: 'Cocktail / Batch Prep' },
  { id: 'spoilage', label: 'Out of Date / Spoiled' },
];

// Generates the Monday date for any given date
function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

function getOrdinalSuffix(d) {
  if (d > 3 && d < 21) return 'th';
  switch (d % 10) {
    case 1:  return "st";
    case 2:  return "nd";
    case 3:  return "rd";
    default: return "th";
  }
}

export default function SpillageAndWastage({ currentUser, onBackToHub, onLogout }) {
  // Navigation & Date State (Anchored to current Monday)
  const [currentMonday, setCurrentMonday] = useState(() => getMonday(new Date()));
  const [selectedDateStr, setSelectedDateStr] = useState(() => new Date().toISOString().slice(0, 10));

  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogItems, setCatalogItems] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [customQtyInput, setCustomQtyInput] = useState('');
  const [selectedReason, setSelectedReason] = useState(REASONS[1].label);
  const [customNotes, setCustomNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  const [recentLogs, setRecentLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const swipeHandlers = useTwoFingerSwipe({
    onSwipeRight: () => {
      if (onBackToHub) onBackToHub();
    }
  });

  // Calculate Monday–Sunday pill dates
  const weekDays = useMemo(() => {
    const days = [];
    const mon = new Date(currentMonday);
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const shortName = d.toLocaleDateString('en-GB', { weekday: 'short' }); // Mon, Tue, etc.
      const dayNum = d.getDate();
      days.push({ iso, shortName, dayNum, fullDate: d });
    }
    return days;
  }, [currentMonday]);

  // Formatted header: "Week beginning 26th October"
  const weekBeginningStr = useMemo(() => {
    const day = currentMonday.getDate();
    const month = currentMonday.toLocaleDateString('en-GB', { month: 'long' });
    return `${day}${getOrdinalSuffix(day)} ${month}`;
  }, [currentMonday]);

  const handlePrevWeek = () => {
    const nextMon = new Date(currentMonday);
    nextMon.setDate(currentMonday.getDate() - 7);
    setCurrentMonday(nextMon);
    setSelectedDateStr(nextMon.toISOString().slice(0, 10));
  };

  const handleNextWeek = () => {
    const nextMon = new Date(currentMonday);
    nextMon.setDate(currentMonday.getDate() + 7);
    setCurrentMonday(nextMon);
    setSelectedDateStr(nextMon.toISOString().slice(0, 10));
  };

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
        const mapped = data.map(item => {
          const cat = (item.category || '').toLowerCase();
          const isDraught = cat.includes('draught') || (item.unit && item.unit.toLowerCase().includes('keg'));
          const isSpirit = cat.includes('spirit') || (item.unit && item.unit.toLowerCase().includes('bottle') && !cat.includes('wine'));
          const isWine = cat.includes('wine');
          const isPackage = cat.includes('beer') && !isDraught;

          const category = isDraught ? 'draught' : isSpirit ? 'spirits' : isWine ? 'wine' : isPackage ? 'packaged_beer' : 'prep';
          const baseUom = (isDraught || isSpirit || isWine || category === 'prep') ? 'ml' : 'each';
          
          let packageSizeBase = Number(item.package_size_base) || 700;
          if (isDraught && !item.package_size_base) packageSizeBase = 50000;
          if (isWine && !item.package_size_base) packageSizeBase = 750;
          if (baseUom === 'each') packageSizeBase = 1;

          const unitsPerCase = Number(item.units_per_order_case) || (isDraught ? 1 : isPackage ? 24 : 6);
          const rawCost = Number(item.last_cost_ex_vat || item.cost_price_ex_vat || item.cost_price || 0);

          return {
            id: item.id,
            name: item.name,
            category,
            base_uom: baseUom,
            package_size_base: packageSizeBase,
            units_per_order_case: unitsPerCase,
            cost_price_ex_vat: rawCost,
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

  const fetchWastageLogs = async () => {
    setLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('wastage_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

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

  const filteredCatalog = useMemo(() => {
    return catalogItems.filter(item => {
      const matchesCat = activeCategory === 'all' || item.category === activeCategory;
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [catalogItems, activeCategory, searchQuery]);

  const handleSelectItem = (item) => {
    setSelectedItem(item);
    setCustomQtyInput('');
    setSelectedPreset(null);
    if (item.category === 'draught') {
      setSelectedPreset({ label: 'Pint (568ml)', baseAmount: 568, unit: 'pints', qty: 1 });
    } else if (item.category === 'spirits') {
      setSelectedPreset({ label: 'Single Measure (25ml)', baseAmount: 25, unit: 'single', qty: 1 });
    } else if (item.category === 'wine') {
      setSelectedPreset({ label: 'Medium Glass (175ml)', baseAmount: 175, unit: 'glass', qty: 1 });
    } else if (item.category === 'packaged_beer') {
      setSelectedPreset({ label: '1 Can / Bottle', baseAmount: 1, unit: 'each', qty: 1 });
    } else {
      setSelectedPreset({ label: '50ml Pour', baseAmount: 50, unit: 'ml', qty: 50 });
    }
  };

  const wastageMetrics = useMemo(() => {
    if (!selectedItem) return { totalBaseUnits: 0, costImpact: 0, displayVolume: '', unitCostEx: 0 };

    let totalBaseUnits = 0;
    let displayVolume = '';

    if (customQtyInput) {
      const parsed = parseFloat(customQtyInput) || 0;
      totalBaseUnits = parsed;
      displayVolume = `${parsed} ${selectedItem.base_uom}`;
    } else if (selectedPreset) {
      totalBaseUnits = selectedPreset.baseAmount;
      displayVolume = selectedPreset.label;
    }

    const itemCost = Number(selectedItem.cost_price_ex_vat) || 0;
    let costImpact = 0;

    if (selectedItem.category === 'packaged_beer') {
      const singleCanCost = selectedItem.units_per_order_case > 0 
        ? itemCost / selectedItem.units_per_order_case 
        : itemCost;
      costImpact = totalBaseUnits * singleCanCost;
    } else {
      const containerBaseSize = Number(selectedItem.package_size_base) || 700;
      costImpact = containerBaseSize > 0 
        ? (totalBaseUnits / containerBaseSize) * itemCost 
        : 0;
    }

    return {
      totalBaseUnits,
      costImpact: Math.max(0, costImpact),
      displayVolume,
      unitCostEx: itemCost
    };
  }, [selectedItem, selectedPreset, customQtyInput]);

  const handleSubmitWastage = async (e) => {
    e.preventDefault();
    if (!selectedItem || wastageMetrics.totalBaseUnits <= 0) return;

    setSubmitting(true);
    setStatusMsg(null);
    const staffName = currentUser?.name || 'Duty Manager';

    const payload = {
      venue_id: DEFAULT_VENUE_ID,
      item_id: String(selectedItem.id),
      item_name: selectedItem.name,
      category: selectedItem.category,
      logged_qty: customQtyInput ? parseFloat(customQtyInput) : selectedPreset?.qty || 1,
      unit_used: customQtyInput ? selectedItem.base_uom : selectedPreset?.unit || selectedItem.base_uom,
      total_base_deducted: Number(wastageMetrics.totalBaseUnits),
      cost_impact: Number(wastageMetrics.costImpact.toFixed(2)),
      reason: selectedReason,
      notes: customNotes ? customNotes.trim() : '',
      staff_name: staffName,
      created_at: new Date(`${selectedDateStr}T12:00:00Z`).toISOString()
    };

    try {
      const { error: logErr } = await supabase
        .from('wastage_log')
        .insert([payload]);

      if (logErr) throw new Error(logErr.message || 'Database rejected wastage insert');

      const nextStock = Math.max(0, (selectedItem.current_stock_base || 0) - wastageMetrics.totalBaseUnits);
      await supabase
        .from('catalog_items')
        .update({
          current_stock_base: nextStock,
          count: selectedItem.package_size_base > 0 ? Number((nextStock / selectedItem.package_size_base).toFixed(2)) : 0
        })
        .eq('id', selectedItem.id);

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
        text: `Deducted ${wastageMetrics.displayVolume} ${selectedItem.name} (£${wastageMetrics.costImpact.toFixed(2)})`
      });

      setSelectedItem(null);
      setCustomQtyInput('');
      setCustomNotes('');
      await fetchWastageLogs();
      await fetchInventory();
    } catch (err) {
      console.error("Wastage submission error:", err);
      setStatusMsg({ type: 'error', text: err.message || 'Error recording wastage to database.' });
    } finally {
      setSubmitting(false);
    }
  };

  // Filter logs for the selected day vs current week
  const dayLogs = useMemo(() => {
    return recentLogs.filter(l => (l.created_at || '').slice(0, 10) === selectedDateStr);
  }, [recentLogs, selectedDateStr]);

  const weekSummary = useMemo(() => {
    const mondayIso = currentMonday.toISOString().slice(0, 10);
    const sundayDate = new Date(currentMonday);
    sundayDate.setDate(currentMonday.getDate() + 6);
    const sundayIso = sundayDate.toISOString().slice(0, 10);

    const logsThisWeek = recentLogs.filter(l => {
      const dt = (l.created_at || '').slice(0, 10);
      return dt >= mondayIso && dt <= sundayIso;
    });

    let totalCost = 0;
    let pintsWasted = 0;

    logsThisWeek.forEach(l => {
      totalCost += Number(l.cost_impact || 0);
      if (l.category === 'draught') {
        pintsWasted += Math.round((Number(l.total_base_deducted || 0) / 568) * 10) / 10;
      }
    });

    return { totalCost, pintsWasted, count: logsThisWeek.length };
  }, [recentLogs, currentMonday]);

  const selectedDayLabel = useMemo(() => {
    const d = new Date(selectedDateStr);
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
  }, [selectedDateStr]);

  return (
    <div
      {...swipeHandlers}
      className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 overflow-hidden relative select-none"
    >
      {/* Top Header */}
      <header className="flex items-center justify-between px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-2 border-b border-gray-100 flex-shrink-0 bg-white z-20">
        <div className="flex items-center space-x-2">
          {onBackToHub && (
            <button onClick={onBackToHub} className="mr-0.5 p-1 -ml-1 text-gray-500 hover:text-black rounded-lg transition" title="Return to Hub">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <AppLogo className="w-6 h-6" fallbackTextClass="font-serif text-xl font-bold tracking-tighter" />
          <span className="font-semibold text-base tracking-tight text-gray-900">West Side Tavern</span>
        </div>
        <div className="flex items-center space-x-3 text-xs font-medium">
          {onBackToHub ? (
            <button onClick={onBackToHub} className="text-gray-900 hover:text-black font-semibold">Hub</button>
          ) : (
            <button onClick={onLogout} className="text-gray-900 hover:text-black">Logout</button>
          )}
        </div>
      </header>

      {/* Week Title & Period Navigator (Matching Cash Up / Petty Cash) */}
      <div className="px-5 pt-3 pb-2 border-b border-gray-100 flex-shrink-0 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-500 italic text-[11px] font-serif">Stock Loss Ledger</p>
            <h1 className="text-base font-extrabold tracking-tight text-gray-900 mt-0.5">
              Week beginning {weekBeginningStr}
            </h1>
          </div>
          <div className="flex items-center space-x-1">
            <button
              onClick={handlePrevWeek}
              className="p-1 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-600 transition"
              title="Previous Week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNextWeek}
              className="p-1 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-600 transition"
              title="Next Week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => { fetchInventory(); fetchWastageLogs(); }}
              className="p-1 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-600 transition ml-0.5"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingCatalog || loadingLogs ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Mon - Sun Day Selection Bar */}
        <div className="grid grid-cols-7 gap-1.5 mt-3">
          {weekDays.map(d => {
            const isSelected = selectedDateStr === d.iso;
            const hasLogs = recentLogs.some(l => (l.created_at || '').slice(0, 10) === d.iso);

            return (
              <button
                key={d.iso}
                type="button"
                onClick={() => setSelectedDateStr(d.iso)}
                className={`py-1.5 px-0.5 rounded-xl flex flex-col items-center justify-center transition border ${
                  isSelected
                    ? 'bg-black text-white border-black shadow-xs'
                    : 'bg-[#EDEDED] text-gray-700 border-transparent hover:bg-gray-200'
                }`}
              >
                <span className="text-[9px] font-bold uppercase tracking-wider block">{d.shortName}</span>
                <span className="text-xs font-mono font-black mt-0.5">{d.dayNum}</span>
                {hasLogs && (
                  <span className={`w-1 h-1 rounded-full mt-0.5 ${isSelected ? 'bg-emerald-400' : 'bg-rose-500'}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Week Loss Summary Metric Bar */}
      <div className="flex items-center justify-between px-5 py-2 bg-gray-50/80 border-b border-gray-100 text-xs flex-shrink-0">
        <span className="font-bold text-gray-900 text-[11px]">
          {selectedDayLabel}
        </span>
        <div className="flex items-center space-x-2 text-[10px] font-mono">
          <span className="text-gray-500">Week Loss: <strong className="text-rose-600 font-bold">£{weekSummary.totalCost.toFixed(2)}</strong></span>
          <span>•</span>
          <span className="text-gray-500">{weekSummary.pintsWasted} pts lost</span>
        </div>
      </div>

      {statusMsg && (
        <div className={`mx-5 my-2 p-2.5 rounded-xl text-xs font-semibold flex-shrink-0 ${
          statusMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {statusMsg.text}
        </div>
      )}

      {/* Main Content Body */}
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4 pb-28 touch-pan-y overscroll-contain">
        {/* Category Pills */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400 block">
            1. Select Category
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
                      ? 'bg-black text-white border-black shadow-xs'
                      : 'bg-[#EDEDED] text-gray-700 border-transparent hover:bg-gray-200'
                  }`}
                >
                  {Icon && <Icon className="w-3.5 h-3.5" />}
                  <span>{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Item Search & Quick Results */}
        <div className="space-y-1.5">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search product (e.g. Aberfeldy 12, Tennent's)..."
              className="w-full bg-[#EDEDED] py-2 pl-3 pr-8 rounded-xl text-xs italic placeholder-gray-500 focus:outline-none"
            />
            {searchQuery ? (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black">
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            )}
          </div>

          <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto border border-gray-100 rounded-2xl p-1 bg-gray-50/60">
            {filteredCatalog.slice(0, 10).map(item => {
              const isSelected = selectedItem?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectItem(item)}
                  className={`p-2 rounded-xl text-left transition border flex flex-col justify-between ${
                    isSelected
                      ? 'bg-black text-white border-black shadow-xs'
                      : 'bg-white border-gray-200 hover:bg-gray-100 text-gray-900'
                  }`}
                >
                  <span className="font-bold text-xs truncate block">{item.name}</span>
                  <span className={`text-[9px] font-mono block mt-0.5 ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}>
                    {item.package_size_base}{item.base_uom} • £{item.cost_price_ex_vat.toFixed(2)} cost
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Deduction Form */}
        {selectedItem && (
          <form onSubmit={handleSubmitWastage} className="bg-white border-2 border-black rounded-3xl p-4 space-y-3.5 shadow-md animate-in fade-in duration-150">
            <div className="flex items-start justify-between border-b border-gray-100 pb-2.5">
              <div>
                <span className="text-[9px] font-mono font-bold uppercase text-emerald-600 block tracking-wider">
                  Selected Item
                </span>
                <h3 className="text-sm font-black text-gray-900">{selectedItem.name}</h3>
                <span className="text-[10px] text-gray-500 font-mono">
                  Bottle/Unit Cost: £{wastageMetrics.unitCostEx.toFixed(2)} ({selectedItem.package_size_base}{selectedItem.base_uom})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="p-1 text-gray-400 hover:text-black"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Presets by Specific Bar Dispense Measures */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400 block">
                Select Loss Measure
              </span>

              <div className="grid grid-cols-2 gap-1.5">
                {selectedItem.category === 'draught' && (
                  <>
                    <button
                      type="button"
                      onClick={() => { setSelectedPreset({ label: 'Half Pint (284ml)', baseAmount: 284, unit: 'pints', qty: 0.5 }); setCustomQtyInput(''); }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        selectedPreset?.baseAmount === 284 && !customQtyInput ? 'bg-black text-white border-black' : 'bg-gray-50 border-gray-200 text-gray-700'
                      }`}
                    >
                      Half Pint (284ml)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedPreset({ label: 'Full Pint (568ml)', baseAmount: 568, unit: 'pints', qty: 1.0 }); setCustomQtyInput(''); }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        selectedPreset?.baseAmount === 568 && !customQtyInput ? 'bg-black text-white border-black' : 'bg-gray-50 border-gray-200 text-gray-700'
                      }`}
                    >
                      Pint (568ml)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedPreset({ label: `Full ${selectedItem.package_size_base / 1000}L Keg`, baseAmount: selectedItem.package_size_base, unit: 'keg', qty: 1.0 }); setCustomQtyInput(''); }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        selectedPreset?.baseAmount === selectedItem.package_size_base && !customQtyInput ? 'bg-black text-white border-black' : 'bg-gray-50 border-gray-200 text-gray-700'
                      }`}
                    >
                      Full Keg
                    </button>
                  </>
                )}

                {selectedItem.category === 'spirits' && (
                  <>
                    <button
                      type="button"
                      onClick={() => { setSelectedPreset({ label: 'Single Measure (25ml)', baseAmount: 25, unit: 'measures', qty: 1 }); setCustomQtyInput(''); }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        selectedPreset?.baseAmount === 25 && !customQtyInput ? 'bg-black text-white border-black' : 'bg-gray-50 border-gray-200 text-gray-700'
                      }`}
                    >
                      Single (25ml)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedPreset({ label: 'Double Measure (50ml)', baseAmount: 50, unit: 'measures', qty: 2 }); setCustomQtyInput(''); }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        selectedPreset?.baseAmount === 50 && !customQtyInput ? 'bg-black text-white border-black' : 'bg-gray-50 border-gray-200 text-gray-700'
                      }`}
                    >
                      Double (50ml)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedPreset({ label: `Full Bottle (${selectedItem.package_size_base}ml)`, baseAmount: selectedItem.package_size_base, unit: 'bottle', qty: 1 }); setCustomQtyInput(''); }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        selectedPreset?.baseAmount === selectedItem.package_size_base && !customQtyInput ? 'bg-black text-white border-black' : 'bg-gray-50 border-gray-200 text-gray-700'
                      }`}
                    >
                      Full Bottle
                    </button>
                  </>
                )}

                {selectedItem.category === 'wine' && (
                  <>
                    <button
                      type="button"
                      onClick={() => { setSelectedPreset({ label: 'Small Glass (125ml)', baseAmount: 125, unit: 'glasses', qty: 1 }); setCustomQtyInput(''); }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        selectedPreset?.baseAmount === 125 && !customQtyInput ? 'bg-black text-white border-black' : 'bg-gray-50 border-gray-200 text-gray-700'
                      }`}
                    >
                      Small (125ml)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedPreset({ label: 'Standard Glass (175ml)', baseAmount: 175, unit: 'glasses', qty: 1 }); setCustomQtyInput(''); }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        selectedPreset?.baseAmount === 175 && !customQtyInput ? 'bg-black text-white border-black' : 'bg-gray-50 border-gray-200 text-gray-700'
                      }`}
                    >
                      Standard (175ml)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedPreset({ label: 'Large Glass (250ml)', baseAmount: 250, unit: 'glasses', qty: 1 }); setCustomQtyInput(''); }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        selectedPreset?.baseAmount === 250 && !customQtyInput ? 'bg-black text-white border-black' : 'bg-gray-50 border-gray-200 text-gray-700'
                      }`}
                    >
                      Large (250ml)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedPreset({ label: 'Full Bottle (750ml)', baseAmount: 750, unit: 'bottle', qty: 1 }); setCustomQtyInput(''); }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        selectedPreset?.baseAmount === 750 && !customQtyInput ? 'bg-black text-white border-black' : 'bg-gray-50 border-gray-200 text-gray-700'
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
                        selectedPreset?.baseAmount === 1 && !customQtyInput ? 'bg-black text-white border-black' : 'bg-gray-50 border-gray-200 text-gray-700'
                      }`}
                    >
                      1 Bottle / Can
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedPreset({ label: `Full Case (${selectedItem.units_per_order_case})`, baseAmount: selectedItem.units_per_order_case, unit: 'case', qty: selectedItem.units_per_order_case }); setCustomQtyInput(''); }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        selectedPreset?.baseAmount === selectedItem.units_per_order_case && !customQtyInput ? 'bg-black text-white border-black' : 'bg-gray-50 border-gray-200 text-gray-700'
                      }`}
                    >
                      Full Case
                    </button>
                  </>
                )}

                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    value={customQtyInput}
                    onChange={(e) => { setCustomQtyInput(e.target.value); setSelectedPreset(null); }}
                    placeholder={`Custom ${selectedItem.base_uom}...`}
                    className="w-full bg-[#EDEDED] py-2 px-2.5 rounded-xl text-xs font-mono font-bold text-gray-900 focus:outline-none focus:ring-1 focus:ring-black"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-gray-400 font-mono uppercase">
                    {selectedItem.base_uom}
                  </span>
                </div>
              </div>
            </div>

            {/* Reason Tags */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400 block">
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
                        ? 'bg-rose-50 border-rose-400 text-rose-900 font-bold'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <span className="block truncate">{r.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Impact Readout */}
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[9px] font-mono text-gray-500 uppercase tracking-wider block">Stock Impact</span>
                <span className="text-xs text-gray-800 block font-semibold">
                  Deducting {wastageMetrics.totalBaseUnits} {selectedItem.base_uom}
                </span>
              </div>
              <div className="text-right">
                <span className="text-lg font-black text-rose-600 font-mono block">
                  ~£{wastageMetrics.costImpact.toFixed(2)}
                </span>
                <span className="text-[9px] text-gray-400 font-mono block">Cost Impact Ex VAT</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || wastageMetrics.totalBaseUnits <= 0}
              className="w-full py-3 bg-black hover:bg-neutral-800 active:scale-[0.98] disabled:opacity-40 text-white rounded-2xl text-xs font-black transition flex items-center justify-center space-x-1.5 shadow-md"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{submitting ? 'Deducting Stock...' : `Log Loss for ${selectedDayLabel}`}</span>
            </button>
          </form>
        )}

        {/* Selected Day Activity Ledger */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400">
              Activity on {selectedDayLabel} ({dayLogs.length})
            </span>
          </div>

          <div className="divide-y divide-gray-100 bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-xs">
            {dayLogs.length === 0 ? (
              <p className="p-5 text-center text-xs text-gray-400 italic">No spillage entries logged on this day.</p>
            ) : (
              dayLogs.map((log) => (
                <div key={log.id} className="p-3 flex items-center justify-between text-xs">
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <span className="font-bold text-gray-900 text-[11px]">{log.item_name}</span>
                      <span className="text-[9px] font-mono text-gray-500 uppercase px-1 rounded bg-gray-100">
                        {log.reason}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono block mt-0.5">
                      {log.total_base_deducted} ml/ea • {log.staff_name} • {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <span className="font-mono font-bold text-rose-600 text-xs">
                    -£{Number(log.cost_impact || 0).toFixed(2)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

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