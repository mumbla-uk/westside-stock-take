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
  Flame,
  Sun,
  ShieldAlert
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

export default function ProduceOrderApp({ currentUser, onBackToHub, onLogout }) {
  const [produceItems, setProduceItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all'); // 'all' | 'fruit' | 'herb' | 'chemical' | 'bakery'
  
  // Day Schedule: Sun (0), Mon (1), Tue (2), Wed (3) = Midweek | Thu (4), Fri (5), Sat (6) = Weekend
  const [daySchedule, setDaySchedule] = useState(() => {
    const day = new Date().getDay();
    return (day >= 4 && day <= 6) ? 'weekend' : 'midweek';
  });

  // Shelf Stock Counts: { [id]: countVal }
  const [counts, setCounts] = useState({});
  const [prepDemand, setPrepDemand] = useState({});
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const swipeHandlers = useTwoFingerSwipe({
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

      // Pre-fill initial on-hand counts
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

  // Order Calculation: (Target Par - On Hand) + Prep Deficits
  const orderQueue = useMemo(() => {
    return produceItems.map(item => {
      const onHand = Number(counts[item.id] || 0);
      const targetPar = Number(daySchedule === 'weekend' ? item.par_weekend : item.par_midweek) || 1;
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
  }, [produceItems, counts, daySchedule, prepDemand]);

  const itemsNeedingOrder = useMemo(() => {
    return orderQueue.filter(it => it.wholeUnitsToOrder > 0);
  }, [orderQueue]);

  const handleCopyProduceOrder = () => {
    const dayLabel = daySchedule === 'weekend' ? 'WEEKEND SPIKE' : 'MIDWEEK RUN';
    let text = `WEST SIDE TAVERN - FRESH PRODUCE & PREP ORDER\nSchedule: ${dayLabel} (${new Date().toLocaleDateString('en-GB')})\n--------------------------------------------\n`;
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
          day_type: daySchedule,
          manager_name: staffName,
          is_placed: true,
          placed_at: new Date().toISOString(),
          items: itemsNeedingOrder
        });

      if (error) throw error;

      sendPushNotification(
        `Produce Order Placed (${daySchedule.toUpperCase()})`,
        `${staffName} ordered ${itemsNeedingOrder.length} lines of fresh produce and prep supplies.`,
        null,
        { module: 'produce' }
      );

      setStatusMsg({ type: 'success', text: `Produce order logged! ${itemsNeedingOrder.length} items recorded.` });
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Error recording produce order.' });
    } finally {
      setSubmittingOrder(false);
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
            <span className="text-[10px] text-gray-400 font-mono block">Dynamic Pars &amp; Prep Demand</span>
          </div>
        </div>

        <button onClick={fetchProduceData} className="p-1.5 text-gray-500 hover:text-black rounded-lg transition" title="Refresh">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* Schedule Mode Switcher */}
      <div className="px-5 py-2.5 bg-gray-50/80 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400 block">
              Active Par Schedule
            </span>
            <span className="text-xs font-black text-gray-900 flex items-center space-x-1">
              {daySchedule === 'weekend' ? <Flame className="w-3.5 h-3.5 text-rose-500 fill-rose-500" /> : <Sun className="w-3.5 h-3.5 text-amber-500" />}
              <span>{daySchedule === 'weekend' ? 'Weekend High Volume (Thu–Sat)' : 'Midweek Lean (Sun–Wed)'}</span>
            </span>
          </div>

          <div className="flex bg-white border border-gray-200 p-0.5 rounded-xl shadow-xs">
            <button
              onClick={() => setDaySchedule('midweek')}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition ${
                daySchedule === 'midweek' ? 'bg-black text-white shadow-xs' : 'text-gray-500 hover:text-black'
              }`}
            >
              Midweek
            </button>
            <button
              onClick={() => setDaySchedule('weekend')}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition ${
                daySchedule === 'weekend' ? 'bg-rose-600 text-white shadow-xs' : 'text-gray-500 hover:text-black'
              }`}
            >
              Weekend
            </button>
          </div>
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
          const isChemical = item.item_type === 'chemical' || item.count_format === 'grams';

          return (
            <div key={item.id} className="py-3 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <span className="font-extrabold text-xs text-gray-900 block leading-tight">
                    {item.name}
                  </span>
                  <div className="flex items-center space-x-1.5 text-[10px] text-gray-500 font-mono mt-0.5">
                    <span>{item.supplier}</span>
                    <span>•</span>
                    <span className="font-bold text-gray-800">Par: {par} {item.order_unit}</span>
                    {metrics?.prepExtra > 0 && (
                      <span className="text-purple-700 font-bold bg-purple-50 px-1 rounded">
                        +{metrics.prepExtra} for prep
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
                {/* Fraction Estimator Chips */}
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

                {/* Counter Stepper */}
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