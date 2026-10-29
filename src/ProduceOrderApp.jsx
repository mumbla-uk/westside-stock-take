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
  ChevronRight,
  PlusCircle,
  Trash2
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

function getNextServiceDayKey() {
  const dayIndex = new Date().getDay(); // 0 is Sunday ... 6 is Saturday
  const map = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  return map[dayIndex];
}

export default function ProduceOrderApp({ currentUser, onBackToHub, onLogout }) {
  const [produceItems, setProduceItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  
  // Nightly Target Service Day
  const [targetDayKey, setTargetDayKey] = useState(getNextServiceDayKey);

  // Shelf Stock Counts: { [id]: countVal }
  const [counts, setCounts] = useState({});
  const [prepDemand, setPrepDemand] = useState({});
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Ad-hoc Manager Additions
  const [adHocItems, setAdHocItems] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAdHocName, setNewAdHocName] = useState('');
  const [newAdHocQty, setNewAdHocQty] = useState('1');
  const [newAdHocUnit, setNewAdHocUnit] = useState('box');
  const [newAdHocNote, setNewAdHocNote] = useState('');

  // 7-Day Par & Buffer Editor
  const [editingItemPars, setEditingItemPars] = useState(null);
  const [savingPars, setSavingPars] = useState(false);

  const swipeHandlers = useTwoFingerSwipe({
    disabled: Boolean(editingItemPars) || showAddModal,
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

  // Buffer Calculation Engine for Produce:
  // Deficit in working containers evaluated against buffer_rate (1-10)
  const orderQueue = useMemo(() => {
    return produceItems.map(item => {
      const onHand = Number(counts[item.id] || 0);
      const dayParMap = item.daily_pars || {};
      const targetPar = Number(
        dayParMap[targetDayKey] ?? 
        (targetDayKey === 'fri' || targetDayKey === 'sat' ? item.par_weekend : item.par_midweek) ?? 
        1.0
      );

      // Check if extra prep demand exists
      let prepExtra = 0;
      const itemNameLower = item.name.toLowerCase();
      Object.keys(prepDemand).forEach(demKey => {
        if (itemNameLower.includes(demKey) || demKey.includes(itemNameLower.split(' ')[0])) {
          const rawBaseNeed = prepDemand[demKey];
          prepExtra += (rawBaseNeed / (item.package_size_base || 1));
        }
      });

      const rawDeficit = Math.max(0, targetPar - onHand) + prepExtra;
      
      // Buffer rule: Buffer Rate 1-10 -> 0.1 - 1.0 threshold
      const bufferRate = Number(item.buffer_rate ?? 5);
      const threshold = Math.min(1.0, Math.max(0.1, bufferRate / 10));

      const wholeContainersMissing = Math.floor(rawDeficit);
      const partialContainerDeficit = rawDeficit - wholeContainersMissing;
      const extraContainer = partialContainerDeficit > threshold ? 1 : 0;
      const totalUnitsToOrder = wholeContainersMissing + extraContainer;

      return {
        ...item,
        onHand,
        targetPar,
        rawDeficit,
        prepExtra: Math.round(prepExtra * 10) / 10,
        bufferRate,
        wholeUnitsToOrder: totalUnitsToOrder,
        isBufferOk: rawDeficit > 0 && totalUnitsToOrder === 0
      };
    });
  }, [produceItems, counts, targetDayKey, prepDemand]);

  const itemsNeedingOrder = useMemo(() => {
    return orderQueue.filter(it => it.wholeUnitsToOrder > 0);
  }, [orderQueue]);

  const activeTargetDay = useMemo(() => {
    return DAYS_OF_WEEK.find(d => d.key === targetDayKey) || DAYS_OF_WEEK[0];
  }, [targetDayKey]);

  // Handle adding an on-the-fly custom item
  const handleAddAdHoc = (e) => {
    e.preventDefault();
    if (!newAdHocName.trim()) return;

    setAdHocItems(prev => [
      ...prev,
      {
        id: `adhoc-${Date.now()}`,
        name: newAdHocName.trim(),
        qty: parseFloat(newAdHocQty) || 1,
        unit: newAdHocUnit.trim() || 'box',
        note: newAdHocNote.trim()
      }
    ]);

    setNewAdHocName('');
    setNewAdHocQty('1');
    setNewAdHocNote('');
    setShowAddModal(false);
  };

  const handleRemoveAdHoc = (id) => {
    setAdHocItems(prev => prev.filter(a => a.id !== id));
  };

  const totalLinesToOrder = itemsNeedingOrder.length + adHocItems.length;

  const handleCopyProduceOrder = () => {
    let text = `WEST SIDE TAVERN - NIGHTLY PRODUCE ORDER\nFor Service On: ${activeTargetDay.full.toUpperCase()} (${new Date().toLocaleDateString('en-GB')})\n--------------------------------------------\n`;
    
    // Standard replenishment
    itemsNeedingOrder.forEach(it => {
      text += `• ${it.name}: ${it.wholeUnitsToOrder} ${it.order_unit}`;
      if (it.prepExtra > 0) text += ` (inc. +${it.prepExtra} for prep)`;
      text += `\n`;
    });

    // Ad-hoc additions
    if (adHocItems.length > 0) {
      text += `\n[EXTRA PREP & SPECIAL ADDITIONS]\n`;
      adHocItems.forEach(a => {
        text += `• ${a.name}: ${a.qty} ${a.unit}${a.note ? ` (${a.note})` : ''}\n`;
      });
    }

    navigator.clipboard.writeText(text);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const handleConfirmOrderPlaced = async () => {
    if (totalLinesToOrder === 0) return;
    setSubmittingOrder(true);
    setStatusMsg(null);
    const dateStr = new Date().toISOString().slice(0, 10);
    const staffName = currentUser?.name || 'Duty Manager';

    const fullPayloadItems = [
      ...itemsNeedingOrder.map(it => ({
        id: it.id,
        name: it.name,
        qty: it.wholeUnitsToOrder,
        unit: it.order_unit,
        type: 'standard',
        prepExtra: it.prepExtra
      })),
      ...adHocItems.map(a => ({
        id: a.id,
        name: a.name,
        qty: a.qty,
        unit: a.unit,
        type: 'adhoc',
        note: a.note
      }))
    ];

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
          items: fullPayloadItems
        });

      if (error) throw error;

      sendPushNotification(
        `Produce Order Logged (${activeTargetDay.full} Service)`,
        `${staffName} ordered ${totalLinesToOrder} produce lines for ${activeTargetDay.full} service.`,
        null,
        { module: 'produce' }
      );

      setStatusMsg({ type: 'success', text: `Nightly order placed for ${activeTargetDay.full} service!` });
      setAdHocItems([]);
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Error recording produce order.' });
    } finally {
      setSubmittingOrder(false);
    }
  };

  // Save 7-Day Par & Buffer Adjustments
  const handleSaveDailyPars = async (e) => {
    e.preventDefault();
    if (!editingItemPars) return;
    setSavingPars(true);

    try {
      const { error } = await supabase
        .from('produce_items')
        .update({
          daily_pars: editingItemPars.daily_pars,
          buffer_rate: Number(editingItemPars.buffer_rate ?? 5),
          updated_at: new Date().toISOString()
        })
        .eq('id', editingItemPars.id);

      if (error) throw error;

      setStatusMsg({ type: 'success', text: `Updated buffer & pars for ${editingItemPars.name}` });
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
            <span className="text-[10px] text-gray-400 font-mono block">Nightly Service Par &amp; Buffer Engine</span>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          <button onClick={fetchProduceData} className="p-1.5 text-gray-500 hover:text-black rounded-lg transition" title="Refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center space-x-1 py-1.5 px-3 rounded-xl bg-black text-white hover:bg-neutral-800 text-xs font-bold transition active:scale-95 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Item</span>
          </button>
        </div>
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

      {/* Ad-Hoc Items Tray (If any added) */}
      {adHocItems.length > 0 && (
        <div className="mx-5 my-1.5 p-3 bg-purple-50/70 border border-purple-200 rounded-2xl space-y-2 flex-shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-purple-800">
              Extra Prep &amp; Special Additions ({adHocItems.length})
            </span>
          </div>

          <div className="divide-y divide-purple-200/60 text-xs">
            {adHocItems.map(a => (
              <div key={a.id} className="py-1.5 flex items-center justify-between">
                <div>
                  <span className="font-bold text-gray-900 block leading-tight">{a.name}</span>
                  <span className="text-[9px] text-purple-600 font-mono">
                    {a.qty} {a.unit} {a.note ? `• ${a.note}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveAdHoc(a.id)}
                  className="p-1 text-gray-400 hover:text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Produce Items List */}
      <div className="flex-1 overflow-y-auto px-5 divide-y divide-gray-100 pb-28 touch-pan-y overscroll-contain">
        {filteredItems.map(item => {
          const metrics = orderQueue.find(q => q.id === item.id);
          const onHand = metrics?.onHand ?? 0;
          const par = metrics?.targetPar ?? 1;
          const toOrder = metrics?.wholeUnitsToOrder ?? 0;
          const isBufferOk = metrics?.isBufferOk;

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
                      onClick={() => setEditingItemPars({ ...item, daily_pars: { ...(item.daily_pars || {}) }, buffer_rate: item.buffer_rate ?? 5 })}
                      className="p-0.5 text-gray-400 hover:text-black rounded"
                      title="Edit Buffer & 7-Day Pars"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex items-center space-x-1.5 text-[10px] text-gray-500 font-mono mt-0.5">
                    <span>{item.supplier}</span>
                    <span>•</span>
                    <span className="font-bold text-gray-800">{activeTargetDay.label} Par: {par} {item.order_unit}</span>
                    <span>•</span>
                    <span className="text-emerald-700 font-semibold bg-emerald-50 px-1 rounded">
                      Buf: {item.buffer_rate ?? 5}/10
                    </span>
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
                      : isBufferOk
                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  }`}>
                    {toOrder > 0 ? `Order: ${toOrder} ${item.order_unit}` : isBufferOk ? 'Buffer OK' : 'Stock OK'}
                  </span>
                </div>
              </div>

              {/* Rough Estimation Buttons & Number Stepper */}
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
          disabled={totalLinesToOrder === 0}
          className="py-2.5 px-3 bg-[#F3F3F3] hover:bg-gray-200 disabled:opacity-40 rounded-xl text-xs font-bold text-gray-900 transition flex items-center space-x-1.5 flex-shrink-0"
        >
          {copyFeedback ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copyFeedback ? 'Copied' : `Copy (${totalLinesToOrder})`}</span>
        </button>

        <button
          type="button"
          disabled={totalLinesToOrder === 0 || submittingOrder}
          onClick={handleConfirmOrderPlaced}
          className="flex-1 py-2.5 bg-black hover:bg-neutral-800 disabled:opacity-40 text-white rounded-xl text-xs font-black transition flex items-center justify-center space-x-1.5 shadow-sm"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>{submittingOrder ? 'Submitting...' : `Place ${totalLinesToOrder} Line Order`}</span>
        </button>
      </div>

      {/* AD-HOC EXTRA ITEM MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl border border-gray-200 flex flex-col animate-in slide-in-from-bottom duration-200">
            <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex justify-between items-center bg-gray-50/80">
              <div>
                <span className="text-[9px] font-mono uppercase text-purple-600 font-bold block">
                  On-The-Fly Addition
                </span>
                <h2 className="text-base font-black text-gray-900 leading-tight mt-0.5">
                  Add Item to Tonight's Order
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1.5 text-gray-400 hover:text-black bg-white rounded-full border border-gray-200 shadow-xs"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddAdHoc} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="text-[9px] font-bold text-gray-600 uppercase block mb-1">Item Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Extra Limes for Saturday, Fresh Rosemary..."
                  value={newAdHocName}
                  onChange={(e) => setNewAdHocName(e.target.value)}
                  className="w-full bg-[#EDEDED] py-2 px-3 rounded-xl font-bold text-gray-900 text-xs focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] font-bold text-gray-600 uppercase block mb-1">Quantity</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={newAdHocQty}
                    onChange={(e) => setNewAdHocQty(e.target.value)}
                    className="w-full bg-[#EDEDED] py-2 px-3 rounded-xl font-mono font-bold text-gray-900 text-xs focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-gray-600 uppercase block mb-1">Unit</label>
                  <input
                    type="text"
                    required
                    placeholder="box / bunch / kg"
                    value={newAdHocUnit}
                    onChange={(e) => setNewAdHocUnit(e.target.value)}
                    className="w-full bg-[#EDEDED] py-2 px-3 rounded-xl font-semibold text-gray-900 text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[9px] font-bold text-gray-600 uppercase block mb-1">Reason / Note (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. For batching Super Lime tomorrow"
                  value={newAdHocNote}
                  onChange={(e) => setNewAdHocNote(e.target.value)}
                  className="w-full bg-[#EDEDED] py-2 px-3 rounded-xl text-gray-700 text-xs focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-black hover:bg-neutral-800 text-white rounded-2xl text-xs font-bold transition flex items-center justify-center space-x-1.5 shadow-md mt-2"
              >
                <Plus className="w-4 h-4 text-emerald-400" />
                <span>Add to Tonight's Order</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 7-DAY PARS & BUFFER MODAL */}
      {editingItemPars && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl border border-gray-200 flex flex-col max-h-[85vh] animate-in slide-in-from-bottom duration-200">
            <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex justify-between items-center bg-gray-50/80">
              <div>
                <span className="text-[9px] font-mono uppercase text-gray-400 font-bold block">
                  Buffer &amp; Daily Pars
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

            <form onSubmit={handleSaveDailyPars} className="p-5 space-y-4 text-xs">
              {/* Buffer Slider */}
              <div className="space-y-1.5 bg-gray-50 p-3 rounded-2xl border border-gray-200/70">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-gray-800 uppercase tracking-wider block">
                    Reorder Buffer Rate: <span className="font-mono text-black font-black">{editingItemPars.buffer_rate ?? 5} / 10</span>
                  </label>
                  <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                    Triggers when &gt; 0.{editingItemPars.buffer_rate ?? 5} deficit
                  </span>
                </div>

                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={editingItemPars.buffer_rate ?? 5}
                  onChange={(e) => setEditingItemPars({ ...editingItemPars, buffer_rate: parseInt(e.target.value, 10) })}
                  className="w-full accent-black cursor-pointer"
                />

                <p className="text-[10px] text-gray-500 font-sans leading-tight italic">
                  {editingItemPars.buffer_rate <= 3
                    ? "Order Early: Triggers when even a fraction is missing."
                    : editingItemPars.buffer_rate >= 7
                    ? "Order Late: Triggers only when the container is nearly empty."
                    : "Balanced 50%: Triggers once past the half-way mark."}
                </p>
              </div>

              {/* 7-Day Matrix */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-700 uppercase tracking-wider block">7-Day Service Pars</label>
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
              </div>

              <button
                type="submit"
                disabled={savingPars}
                className="w-full py-3 bg-black hover:bg-neutral-800 disabled:opacity-40 text-white rounded-2xl text-xs font-bold transition flex items-center justify-center space-x-1.5 shadow-md mt-2"
              >
                <Save className="w-4 h-4 text-emerald-400" />
                <span>{savingPars ? 'Saving Configuration...' : 'Save Buffer & Schedule'}</span>
              </button>
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