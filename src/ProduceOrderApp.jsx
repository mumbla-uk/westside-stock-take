import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Search,
  Plus,
  Minus,
  RefreshCw,
  X,
  Copy,
  Check,
  CheckCircle2,
  Calendar,
  Apple,
  Scale,
  Sparkles,
  ClipboardList,
  Edit3,
  Save,
  Moon,
  ChevronRight
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
  return <span className={fallbackTextClass}>W</span>;
}

const DAYS_OF_WEEK = [
  { key: 'mon', label: 'Mon', full: 'Monday' },
  { key: 'tue', label: 'Tue', full: 'Tuesday' },
  { key: 'wed', label: 'Wed', full: 'Wednesday' },
  { key: 'thu', label: 'Thu', full: 'Thursday' },
  { key: 'fri', label: 'Fri', full: 'Friday' },
  { key: 'sat', label: 'Sat', full: 'Saturday' },
  { key: 'sun', label: 'Sun', full: 'Sunday' },
];

// Returns the target service day key (ordered nightly for next-day service)
function getNextServiceDayKey() {
  const dayIndex = new Date().getDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday
  // If ordering Sunday night (0), target Monday (mon)
  // If ordering Monday night (1), target Tuesday (tue)
  const map = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  return map[dayIndex];
}

export default function ProduceOrderApp({ currentUser, onBackToHub, onLogout }) {
  const [produceItems, setProduceItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  
  // Target Service Day (Default: Next day service)
  const [targetDayKey, setTargetDayKey] = useState(getNextServiceDayKey);

  // Shelf Stock Counts: { [id]: countVal }
  const [counts, setCounts] = useState({});
  const [prepDemand, setPrepDemand] = useState({});
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Par Editor Modal State
  const [editingItemPars, setEditingItemPars] = useState(null);
  const [savingPars, setSavingPars] = useState(false);

  const swipeHandlers = useTwoFingerSwipe({
    disabled: Boolean(editingItemPars),
    onSwipeRight: () => {
      if (onBackToHub) onBackToHub();
    }
  });

  const fetchProduceData = async () => {
    setLoading(true);
    setStatusMsg(null);
    try {
      const { data: pData, error: pErr } = await supabase
        .from('produce_items')
        .select('*')
        .eq('venue_id', DEFAULT_VENUE_ID)
        .order('name');

      if (pErr) throw pErr;
      setProduceItems(pData || []);

      const initCounts = {};
      (pData || []).forEach(p => {
        initCounts[p.id] = initCounts[p.id] ?? 0;
      });
      setCounts(initCounts);

      // Fetch pending prep picklist deficits logged today in Prep App
      const todayStr = new Date().toISOString().slice(0, 10);
      const { data: prepData } = await supabase
        .from('prep_counts')
        .select('prep_item_id, batches_needed, prep_items(prep_ingredients(item_name, quantity, unit))')
        .eq('venue_id', DEFAULT_VENUE_ID)
        .eq('date_str', todayStr)
        .gt('batches_needed', 0);

      const demandMap = {};
      (prepData || []).forEach(p => {
        const mult = Number(p.batches_needed || 0);
        const ings = p.prep_items?.prep_ingredients || [];
        ings.forEach(ing => {
          const matchName = ing.item_name.toLowerCase();
          demandMap[matchName] = (demandMap[matchName] || 0) + (Number(ing.quantity) * mult);
        });
      });
      setPrepDemand(demandMap);
    } catch (err) {
      console.warn("Could not sync produce data:", err);
      setStatusMsg({ type: 'error', text: 'Error connecting to produce database.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProduceData();
  }, []);

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return produceItems.filter(p => {
      const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.supplier.toLowerCase().includes(q);
      const matchesCat = activeCategory === 'all' || p.item_type === activeCategory;
      return matchesSearch && matchesCat;
    });
  }, [produceItems, searchQuery, activeCategory]);

  const updateCount = (id, delta) => {
    setCounts(prev => {
      const cur = Number(prev[id] || 0);
      const next = Math.max(0, Math.round((cur + delta) * 10) / 10);
      return { ...prev, [id]: next };
    });
  };

  const setCountFraction = (id, fraction) => {
    setCounts(prev => ({ ...prev, [id]: fraction }));
  };

  // Order Calculation: Target Day Par - On Hand + Prep Demand
  const orderQueue = useMemo(() => {
    return produceItems.map(item => {
      const onHand = Number(counts[item.id] || 0);
      
      // Pull specific day par from daily_pars JSON map, fallback to midweek/weekend or 1.0
      const dayParMap = item.daily_pars || {};
      const targetPar = Number(
        dayParMap[targetDayKey] ?? 
        (targetDayKey === 'fri' || targetDayKey === 'sat' ? item.par_weekend : item.par_midweek) ?? 
        1.0
      );

      const shelfDeficit = Math.max(0, targetPar - onHand);

      // Check if extra prep demand exists
      let prepExtra = 0;
      const itemNameLower = item.name.toLowerCase();
      Object.keys(prepDemand).forEach(demKey => {
        if (itemNameLower.includes(demKey) || demKey.includes(itemNameLower.split(' ')[0])) {
          const rawBaseNeed = prepDemand[demKey];
          prepExtra += (rawBaseNeed / (item.package_size_base || 1));
        }
      });

      const totalOrderNeeded = Math.ceil((shelfDeficit + prepExtra) * 10) / 10;
      const wholeUnitsToOrder = Math.ceil(totalOrderNeeded);

      return {
        ...item,
        onHand,
        targetPar,
        shelfDeficit,
        prepExtra: Math.round(prepExtra * 10) / 10,
        wholeUnitsToOrder
      };
    });
  }, [produceItems, counts, targetDayKey, prepDemand]);

  const itemsNeedingOrder = useMemo(() => {
    return orderQueue.filter(it => it.wholeUnitsToOrder > 0);
  }, [orderQueue]);

  const activeTargetDay = useMemo(() => {
    return DAYS_OF_WEEK.find(d => d.key === targetDayKey) || DAYS_OF_WEEK[0];
  }, [targetDayKey]);

  const handleCopyProduceOrder = () => {
    let text = `WEST SIDE TAVERN - NIGHTLY PRODUCE ORDER\nFor Service On: ${activeTargetDay.full.toUpperCase()} (${new Date().toLocaleDateString('en-GB')})\n--------------------------------------------\n`;
    itemsNeedingOrder.forEach(it => {
      text += `• ${it.name}: ${it.wholeUnitsToOrder} ${it.order_unit}`;
      if (it.prepExtra > 0) text += ` (inc. +${it.prepExtra} for prep)`;
      text += `\n`;
    });
    navigator.clipboard.writeText(text);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const handleConfirmOrderPlaced = async () => {
    if (itemsNeedingOrder.length === 0) return;
    setSubmittingOrder(true);
    setStatusMsg(null);
    const dateStr = new Date().toISOString().slice(0, 10);
    const staffName = currentUser?.name || 'Duty Manager';

    try {
      const { error } = await supabase
        .from('produce_orders')
        .insert({
          venue_id: DEFAULT_VENUE_ID,
          order_date: dateStr,
          day_type: targetDayKey,
          manager_name: staffName,
          is_placed: true,
          placed_at: new Date().toISOString(),
          items: itemsNeedingOrder
        });

      if (error) throw error;

      sendPushNotification(
        `Produce Order Logged (${activeTargetDay.full} Service)`,
        `${staffName} ordered ${itemsNeedingOrder.length} lines for ${activeTargetDay.full} prep & service.`,
        null,
        { module: 'produce' }
      );

      setStatusMsg({ type: 'success', text: `Nightly order placed for ${activeTargetDay.full} service!` });
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Error recording produce order.' });
    } finally {
      setSubmittingOrder(false);
    }
  };

  // Save 7-Day Par Adjustments
  const handleSaveDailyPars = async (e) => {
    e.preventDefault();
    if (!editingItemPars) return;
    setSavingPars(true);

    try {
      const { error } = await supabase
        .from('produce_items')
        .update({
          daily_pars: editingItemPars.daily_pars,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingItemPars.id);

      if (error) throw error;

      setStatusMsg({ type: 'success', text: `Updated 7-day pars for ${editingItemPars.name}` });
      setEditingItemPars(null);
      await fetchProduceData();
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Failed to update item pars.' });
    } finally {
      setSavingPars(false);
    }
  };

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
          <div>
            <h1 className="font-extrabold text-base tracking-tight text-gray-900 leading-tight">Fresh Produce &amp; Herbs</h1>
            <span className="text-[10px] text-gray-400 font-mono block">Nightly Service Par Engine</span>
          </div>
        </div>

        <button onClick={fetchProduceData} className="p-1.5 text-gray-500 hover:text-black rounded-lg transition" title="Refresh">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* Target Day Selector Bar */}
      <div className="px-5 pt-3 pb-2.5 bg-gray-50/80 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-500 flex items-center space-x-1">
            <Moon className="w-3.5 h-3.5 text-indigo-600" />
            <span>Ordering Tonight For: <strong className="text-black uppercase">{activeTargetDay.full} Service</strong></span>
          </span>
          <span className="text-[9px] font-mono text-gray-400">Nightly Shift Routine</span>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {DAYS_OF_WEEK.map(d => {
            const isSelected = targetDayKey === d.key;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => setTargetDayKey(d.key)}
                className={`py-1.5 rounded-xl flex flex-col items-center justify-center transition border ${
                  isSelected
                    ? 'bg-black text-white border-black shadow-xs'
                    : 'bg-[#EDEDED] text-gray-700 border-transparent hover:bg-gray-200'
                }`}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider block">{d.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {statusMsg && (
        <div className={`mx-5 my-2 p-2 rounded-xl text-xs font-semibold flex-shrink-0 ${
          statusMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {statusMsg.text}
        </div>
      )}

      {/* Search & Category Tabs */}
      <div className="px-5 pt-2 pb-1 space-y-2 flex-shrink-0">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search limes, mint, basil, citric..."
            className="w-full bg-[#EDEDED] py-1.5 pl-3 pr-8 rounded-xl text-xs placeholder-gray-400 focus:outline-none"
          />
          {searchQuery ? (
            <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black">
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          )}
        </div>

        <div className="flex items-center space-x-1 overflow-x-auto scrollbar-none pb-0.5 text-[10px]">
          {['all', 'fruit', 'herb', 'chemical', 'bakery'].map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-2.5 py-1 rounded-xl font-bold uppercase tracking-wider transition border ${
                activeCategory === cat
                  ? 'bg-black text-white border-black shadow-xs'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Produce Items List */}
      <div className="flex-1 overflow-y-auto px-5 divide-y divide-gray-100 pb-28 touch-pan-y overscroll-contain">
        {filteredItems.map(item => {
          const metrics = orderQueue.find(q => q.id === item.id);
          const onHand = metrics?.onHand ?? 0;
          const par = metrics?.targetPar ?? 1;
          const toOrder = metrics?.wholeUnitsToOrder ?? 0;

          return (
            <div key={item.id} className="py-3 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="font-extrabold text-xs text-gray-900 block leading-tight">
                      {item.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingItemPars({ ...item, daily_pars: { ...(item.daily_pars || {}) } })}
                      className="p-0.5 text-gray-400 hover:text-black rounded"
                      title="Edit 7-Day Pars"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex items-center space-x-1.5 text-[10px] text-gray-500 font-mono mt-0.5">
                    <span>{item.supplier}</span>
                    <span>•</span>
                    <span className="font-bold text-gray-800">{activeTargetDay.label} Par: {par} {item.order_unit}</span>
                    {metrics?.prepExtra > 0 && (
                      <span className="text-purple-700 font-bold bg-purple-50 px-1 rounded">
                        +{metrics.prepExtra} prep
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <span className={`text-xs font-mono font-black px-2 py-0.5 rounded-lg border ${
                    toOrder > 0
                      ? 'bg-rose-50 border-rose-300 text-rose-700'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  }`}>
                    {toOrder > 0 ? `Order: ${toOrder} ${item.order_unit}` : 'Stock OK'}
                  </span>
                </div>
              </div>

              {/* Rough Estimation Buttons & Number Scroller */}
              <div className="flex items-center justify-between pt-0.5">
                <div className="flex items-center space-x-1">
                  {[0.1, 0.25, 0.5, 0.75, 1.0].map(frac => (
                    <button
                      key={frac}
                      type="button"
                      onClick={() => setCountFraction(item.id, frac)}
                      className={`px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold transition border ${
                        Math.abs(onHand - frac) < 0.05
                          ? 'bg-black text-white border-black shadow-xs'
                          : 'bg-[#EDEDED] text-gray-700 border-transparent hover:bg-gray-200'
                      }`}
                    >
                      {frac === 0.1 ? 'Almost Empty' : frac === 0.5 ? 'Half' : frac === 1.0 ? 'Full' : `${frac * 100}%`}
                    </button>
                  ))}
                </div>

                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={() => updateCount(item.id, -0.5)}
                    className="w-6 h-6 bg-gray-100 rounded-md font-bold text-gray-800 text-xs flex items-center justify-center hover:bg-gray-200"
                  >
                    -
                  </button>
                  <span className="w-8 text-center font-mono font-black text-xs">
                    {onHand.toFixed(1)}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateCount(item.id, 0.5)}
                    className="w-6 h-6 bg-gray-100 rounded-md font-bold text-gray-800 text-xs flex items-center justify-center hover:bg-gray-200"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Action Bar */}
      <div className="p-3 bg-white border-t border-gray-100 shadow-xl flex items-center justify-between gap-2 z-20 pb-[max(0.8rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={handleCopyProduceOrder}
          disabled={itemsNeedingOrder.length === 0}
          className="py-2.5 px-3 bg-[#F3F3F3] hover:bg-gray-200 disabled:opacity-40 rounded-xl text-xs font-bold text-gray-900 transition flex items-center space-x-1.5 flex-shrink-0"
        >
          {copyFeedback ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copyFeedback ? 'Copied' : `Copy (${itemsNeedingOrder.length})`}</span>
        </button>

        <button
          type="button"
          disabled={itemsNeedingOrder.length === 0 || submittingOrder}
          onClick={handleConfirmOrderPlaced}
          className="flex-1 py-2.5 bg-black hover:bg-neutral-800 disabled:opacity-40 text-white rounded-xl text-xs font-black transition flex items-center justify-center space-x-1.5 shadow-sm"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>{submittingOrder ? 'Submitting...' : `Place ${itemsNeedingOrder.length} Line Order`}</span>
        </button>
      </div>

      {/* 7-DAY PARS MODAL */}
      {editingItemPars && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl border border-gray-200 flex flex-col max-h-[85vh] animate-in slide-in-from-bottom duration-200">
            <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex justify-between items-center bg-gray-50/80">
              <div>
                <span className="text-[9px] font-mono uppercase text-gray-400 font-bold block">
                  Dynamic 7-Day Par Schedule
                </span>
                <h2 className="text-base font-black text-gray-900 leading-tight mt-0.5">
                  {editingItemPars.name}
                </h2>
                <span className="text-[10px] text-gray-500 font-mono">
                  Unit: {editingItemPars.order_unit}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditingItemPars(null)}
                className="p-1.5 text-gray-400 hover:text-black bg-white rounded-full border border-gray-200 shadow-xs"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDailyPars} className="p-5 space-y-3.5 text-xs">
              <p className="text-gray-500 text-[11px] leading-tight">
                Adjust the par target for each service day. Nightly orders placed the evening prior will order to hit these buffers.
              </p>

              <div className="grid grid-cols-7 gap-1.5 bg-gray-50 p-2.5 rounded-2xl border border-gray-200">
                {DAYS_OF_WEEK.map(d => (
                  <div key={d.key} className="space-y-1 text-center">
                    <label className="text-[9px] font-bold text-gray-600 uppercase block">{d.label}</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={editingItemPars.daily_pars?.[d.key] ?? 1.0}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setEditingItemPars(prev => ({
                          ...prev,
                          daily_pars: {
                            ...(prev.daily_pars || {}),
                            [d.key]: val
                          }
                        }));
                      }}
                      className="w-full bg-white border border-gray-300 py-1 px-1 rounded-lg font-mono font-bold text-xs text-center focus:outline-none"
                    />
                  </div>
                ))}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={savingPars}
                  className="w-full py-3 bg-black hover:bg-neutral-800 disabled:opacity-40 text-white rounded-2xl text-xs font-bold transition flex items-center justify-center space-x-1.5 shadow-md"
                >
                  <Save className="w-4 h-4 text-emerald-400" />
                  <span>{savingPars ? 'Saving Schedule...' : 'Save 7-Day Par Schedule'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hub Nav */}
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