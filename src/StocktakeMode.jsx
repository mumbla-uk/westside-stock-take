import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, 
  ChevronLeft, 
  ChevronRight, 
  Delete, 
  Check, 
  MapPin, 
  Building2,
  Sparkles
} from 'lucide-react';
import { useTwoFingerSwipe } from './useTwoFingerSwipe';

function triggerHaptic(duration = 10) {
  if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
    try {
      window.navigator.vibrate(duration);
    } catch {
      // Ignore vibration errors if unsupported
    }
  }
}

export default function StocktakeMode({ 
  products = [], 
  counts = {}, 
  onUpdateCount, 
  onClose,
  initialArea = null 
}) {
  // 1. TOP HIERARCHY: SUPPLIERS
  const suppliers = useMemo(() => {
    const unique = Array.from(new Set(products.map(p => p.supplier || 'General'))).filter(Boolean);
    return ['ALL', ...unique];
  }, [products]);

  const [selectedSupplier, setSelectedSupplier] = useState('ALL');

  // Products belonging to the selected supplier
  const supplierProducts = useMemo(() => {
    if (selectedSupplier === 'ALL') return products;
    return products.filter(p => (p.supplier || 'General') === selectedSupplier);
  }, [products, selectedSupplier]);

  // 2. SECOND HIERARCHY: PHYSICAL AREAS (Underneath Supplier)
  const areas = useMemo(() => {
    const unique = Array.from(new Set(supplierProducts.map(p => p.area || 'Main Bar'))).filter(Boolean);
    return unique.length > 0 ? unique : ['Main Bar'];
  }, [supplierProducts]);

  const [activeAreaIndex, setActiveAreaIndex] = useState(0);

  // Maintain valid area index when supplier changes
  useEffect(() => {
    setActiveAreaIndex(0);
  }, [selectedSupplier]);

  const currentArea = areas[activeAreaIndex] || areas[0];

  // 3. PRODUCTS FOR THE ACTIVE SLICE (Supplier + Area)
  const activeSliceProducts = useMemo(() => {
    return supplierProducts.filter(p => (p.area || 'Main Bar') === currentArea);
  }, [supplierProducts, currentArea]);

  const [currentItemIndex, setCurrentItemIndex] = useState(0);

  useEffect(() => {
    setCurrentItemIndex(0);
  }, [currentArea, selectedSupplier]);

  const activeProduct = activeSliceProducts[currentItemIndex] || null;

  // Keypad buffer
  const [inputBuffer, setInputBuffer] = useState('');

  // Sync buffer when product changes
  useEffect(() => {
    if (activeProduct) {
      const existing = counts[activeProduct.id];
      if (existing !== undefined && existing !== null && existing !== '') {
        setInputBuffer(String(existing));
      } else {
        setInputBuffer('');
      }
    } else {
      setInputBuffer('');
    }
  }, [activeProduct?.id]);

  const swipeHandlers = useTwoFingerSwipe({
    onSwipeRight: () => {
      if (onClose) onClose();
    }
  });

  // Calculate completion status (None, In-Progress, or Complete)
  const getProgressState = (items) => {
    if (!items || items.length === 0) return 'empty';
    let countedCount = 0;
    items.forEach(it => {
      if (counts[it.id] !== undefined && counts[it.id] !== null && counts[it.id] !== '') {
        countedCount++;
      }
    });

    if (countedCount === items.length) return 'complete'; // All items counted
    if (countedCount > 0) return 'partial';              // In progress
    return 'none';
  };

  // Supplier completion map
  const supplierStatusMap = useMemo(() => {
    const map = {};
    suppliers.forEach(sup => {
      const prods = sup === 'ALL' ? products : products.filter(p => (p.supplier || 'General') === sup);
      map[sup] = getProgressState(prods);
    });
    return map;
  }, [products, counts, suppliers]);

  // Area completion map for current supplier
  const areaStatusMap = useMemo(() => {
    const map = {};
    areas.forEach(ar => {
      const prods = supplierProducts.filter(p => (p.area || 'Main Bar') === ar);
      map[ar] = getProgressState(prods);
    });
    return map;
  }, [supplierProducts, counts, areas]);

  const handleNextItem = () => {
    triggerHaptic(10);
    if (currentItemIndex < activeSliceProducts.length - 1) {
      setCurrentItemIndex(prev => prev + 1);
    } else if (activeAreaIndex < areas.length - 1) {
      setActiveAreaIndex(prev => prev + 1);
      setCurrentItemIndex(0);
    }
  };

  const handlePrevItem = () => {
    triggerHaptic(10);
    if (currentItemIndex > 0) {
      setCurrentItemIndex(prev => prev - 1);
    } else if (activeAreaIndex > 0) {
      setActiveAreaIndex(prev => prev - 1);
    }
  };

  // Keypad Engine
  const handleKeyPress = (char) => {
    triggerHaptic(8);
    if (!activeProduct) return;

    let nextBuffer = inputBuffer;

    if (char === '.') {
      if (nextBuffer.includes('.')) return;
      nextBuffer = nextBuffer === '' ? '0.' : nextBuffer + '.';
      setInputBuffer(nextBuffer);
      return;
    }

    if (nextBuffer === '0' && char !== '.') {
      nextBuffer = String(char);
    } else {
      if (nextBuffer.includes('.') && nextBuffer.split('.')[1].length >= 1) {
        return;
      }
      nextBuffer += String(char);
    }

    setInputBuffer(nextBuffer);
    const parsed = parseFloat(nextBuffer);
    if (!isNaN(parsed)) {
      onUpdateCount(activeProduct.id, parsed);
    }
  };

  const handleBackspace = () => {
    triggerHaptic(8);
    if (!activeProduct) return;

    const nextBuffer = inputBuffer.slice(0, -1);
    setInputBuffer(nextBuffer);
    const parsed = parseFloat(nextBuffer);
    onUpdateCount(activeProduct.id, isNaN(parsed) ? 0 : parsed);
  };

  const handleQuickAdd = (amount) => {
    triggerHaptic(15);
    if (!activeProduct) return;

    const currentVal = parseFloat(inputBuffer) || 0;
    const nextVal = Math.round((currentVal + amount) * 10) / 10;
    setInputBuffer(String(nextVal));
    onUpdateCount(activeProduct.id, nextVal);
  };

  const handleSetExactDecimal = (fraction) => {
    triggerHaptic(12);
    if (!activeProduct) return;

    const currentVal = parseFloat(inputBuffer) || 0;
    const whole = Math.floor(currentVal);
    const nextVal = Math.round((whole + fraction) * 10) / 10;
    setInputBuffer(String(nextVal));
    onUpdateCount(activeProduct.id, nextVal);
  };

  const handleClear = () => {
    triggerHaptic(12);
    if (!activeProduct) return;
    setInputBuffer('');
    onUpdateCount(activeProduct.id, 0);
  };

  const currentCountVal = parseFloat(inputBuffer) || (counts[activeProduct?.id] ?? 0);
  const par = activeProduct?.par || 0;
  const suggestedOrder = Math.max(0, Math.ceil(par - currentCountVal));

  return (
    <div 
      {...swipeHandlers}
      className="fixed inset-0 z-50 flex flex-col bg-[#121214] text-neutral-100 font-sans antialiased select-none overflow-hidden"
    >
      {/* 1. TOP HEADER: SUPPLIER ON TOP -> AREA UNDERNEATH */}
      <header className="flex-shrink-0 pt-[max(0.8rem,env(safe-area-inset-top))] pb-2.5 px-4 bg-[#18181B] border-b border-white/5 flex flex-col space-y-2.5 shadow-sm">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between">
          <button 
            onClick={onClose} 
            className="flex items-center space-x-1.5 py-1.5 px-3 rounded-xl bg-white/5 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-white/10 transition active:scale-95 border border-white/5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Done</span>
          </button>

          <span className="font-serif italic text-xs text-neutral-400 tracking-wide">
            West Side Tavern
          </span>

          <span className="text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full">
            {activeSliceProducts.length > 0 ? `${currentItemIndex + 1} / ${activeSliceProducts.length}` : '0 Items'}
          </span>
        </div>

        {/* HIERARCHY LEVEL 1: SUPPLIERS (TOP TABS) */}
        <div className="space-y-1">
          <div className="flex items-center space-x-1 px-1">
            <Building2 className="w-3 h-3 text-neutral-400" />
            <span className="text-[9px] uppercase font-mono tracking-wider text-neutral-400 font-bold">
              Suppliers
            </span>
          </div>

          <div className="flex items-center space-x-1.5 overflow-x-auto scrollbar-none pb-0.5">
            {suppliers.map(sup => {
              const isSelected = selectedSupplier === sup;
              const status = supplierStatusMap[sup];

              return (
                <button
                  key={sup}
                  onClick={() => {
                    triggerHaptic(8);
                    setSelectedSupplier(sup);
                  }}
                  className={`relative py-1.5 px-3 rounded-xl text-[10px] transition whitespace-nowrap border flex items-center space-x-1.5 ${
                    status === 'complete'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold'
                      : isSelected 
                      ? 'bg-white text-neutral-900 border-white font-bold shadow-sm' 
                      : 'bg-white/5 text-neutral-400 border-white/5 hover:text-white'
                  }`}
                >
                  <span>{sup === 'ALL' ? 'All Suppliers' : sup}</span>
                  {status === 'complete' && <Check className="w-3 h-3 text-emerald-400" />}

                  {/* Top-Right Blue Dot when In-Progress / Partial */}
                  {status === 'partial' && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-[#18181B]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* HIERARCHY LEVEL 2: PHYSICAL AREA (UNDERNEATH SUPPLIER) */}
        <div className="space-y-1 pt-0.5">
          <div className="flex items-center space-x-1 px-1">
            <MapPin className="w-3 h-3 text-emerald-400" />
            <span className="text-[9px] uppercase font-mono tracking-wider text-neutral-400 font-bold">
              Bar Area
            </span>
          </div>

          <div className="flex items-center space-x-1.5 overflow-x-auto scrollbar-none pb-0.5">
            {areas.map((ar, idx) => {
              const isSelected = idx === activeAreaIndex;
              const status = areaStatusMap[ar];

              return (
                <button
                  key={ar}
                  onClick={() => {
                    triggerHaptic(10);
                    setActiveAreaIndex(idx);
                  }}
                  className={`relative py-1.5 px-3 rounded-xl text-[10px] transition whitespace-nowrap border flex items-center space-x-1.5 ${
                    status === 'complete'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold'
                      : isSelected
                      ? 'bg-neutral-200 text-neutral-950 font-black border-white shadow-sm'
                      : 'bg-white/5 text-neutral-400 border-white/5 hover:text-white'
                  }`}
                >
                  <span>{ar}</span>
                  {status === 'complete' && <Check className="w-3 h-3 text-emerald-400" />}

                  {/* Top-Right Blue Dot when In-Progress / Partial */}
                  {status === 'partial' && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-[#18181B]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* 2. HERO COUNT CARD */}
      <main className="flex-1 flex flex-col justify-between px-5 py-2.5 overflow-hidden">
        {activeProduct ? (
          <div className="flex-1 flex flex-col justify-center items-center text-center space-y-2.5">
            <div className="space-y-1 max-w-sm">
              <div className="inline-flex items-center space-x-1.5 text-[10px] font-mono bg-white/5 text-neutral-400 border border-white/5 px-2.5 py-0.5 rounded-md uppercase">
                <span className="font-bold text-neutral-200">{activeProduct.id}</span>
                <span>•</span>
                <span>{activeProduct.supplier}</span>
              </div>

              <h2 className="text-2xl font-black tracking-tight text-white leading-tight px-2">
                {activeProduct.name}
              </h2>

              <div className="flex items-center justify-center space-x-2 text-xs font-mono text-neutral-400">
                <span>Par: <strong className="text-neutral-100">{par}</strong> {activeProduct.unit}</span>
                <span>•</span>
                <span className={suggestedOrder > 0 ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}>
                  {suggestedOrder > 0 ? `Need: +${suggestedOrder}` : 'Par Met ✓'}
                </span>
              </div>
            </div>

            {/* Readout Display */}
            <div className="relative py-0.5">
              <div className="flex items-baseline justify-center">
                <span className="font-mono text-6xl font-black tracking-tight text-white">
                  {inputBuffer === '' ? '0' : inputBuffer}
                </span>
                <span className="text-xs font-bold text-neutral-400 ml-2 font-mono uppercase">
                  {activeProduct.unit || 'unit'}
                </span>
              </div>
              <div className="w-14 h-0.5 bg-emerald-400 rounded-full mx-auto mt-1.5 opacity-60" />
            </div>

            {/* Bulk Case Shortcuts */}
            <div className="flex items-center space-x-1.5 pt-0.5">
              <button
                type="button"
                onClick={() => handleQuickAdd(1)}
                className="py-1 px-3 bg-white/5 hover:bg-white/10 active:scale-95 rounded-xl text-xs font-mono font-bold transition border border-white/5 text-neutral-200"
              >
                +1
              </button>
              <button
                type="button"
                onClick={() => handleQuickAdd(6)}
                className="py-1 px-3 bg-white/5 hover:bg-white/10 active:scale-95 rounded-xl text-xs font-mono font-bold transition border border-white/5 text-neutral-200"
              >
                +6 Case
              </button>
              <button
                type="button"
                onClick={() => handleQuickAdd(12)}
                className="py-1 px-3 bg-white/5 hover:bg-white/10 active:scale-95 rounded-xl text-xs font-mono font-bold transition border border-white/5 text-neutral-200"
              >
                +12 Case
              </button>
              <button
                type="button"
                onClick={() => handleQuickAdd(24)}
                className="py-1 px-3 bg-white/5 hover:bg-white/10 active:scale-95 rounded-xl text-xs font-mono font-bold transition border border-white/5 text-neutral-200"
              >
                +24 Crate
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 text-xs italic">
            No items in this area & supplier filter.
          </div>
        )}

        {/* 3. TACTILE KEYPAD & ADVANCE CONTROLS */}
        <div className="flex-shrink-0 w-full max-w-sm mx-auto space-y-1.5 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
          {/* Direct Fraction Quick Buttons */}
          <div className="grid grid-cols-4 gap-1.5">
            <button
              type="button"
              onClick={() => handleSetExactDecimal(0.1)}
              className="py-1.5 bg-[#1C1C20] hover:bg-white/10 text-emerald-400 border border-white/5 rounded-xl text-xs font-mono font-bold active:scale-95 transition"
            >
              .1
            </button>
            <button
              type="button"
              onClick={() => handleSetExactDecimal(0.25)}
              className="py-1.5 bg-[#1C1C20] hover:bg-white/10 text-emerald-400 border border-white/5 rounded-xl text-xs font-mono font-bold active:scale-95 transition"
            >
              .25 (¼)
            </button>
            <button
              type="button"
              onClick={() => handleSetExactDecimal(0.5)}
              className="py-1.5 bg-[#1C1C20] hover:bg-white/10 text-emerald-400 border border-white/5 rounded-xl text-xs font-mono font-bold active:scale-95 transition"
            >
              .5 (½)
            </button>
            <button
              type="button"
              onClick={() => handleSetExactDecimal(0.75)}
              className="py-1.5 bg-[#1C1C20] hover:bg-white/10 text-emerald-400 border border-white/5 rounded-xl text-xs font-mono font-bold active:scale-95 transition"
            >
              .75 (¾)
            </button>
          </div>

          {/* 3x4 Numpad */}
          <div className="grid grid-cols-3 gap-1.5">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit => (
              <button
                key={digit}
                type="button"
                onClick={() => handleKeyPress(digit)}
                className="py-3 bg-[#1C1C20] hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 rounded-2xl text-xl font-bold font-mono transition text-white border border-white/5 shadow-sm"
              >
                {digit}
              </button>
            ))}

            <button
              type="button"
              onClick={() => handleKeyPress('.')}
              className="py-3 bg-[#1C1C20] hover:bg-neutral-800 active:scale-95 rounded-2xl text-xl font-bold font-mono transition text-emerald-400 border border-white/5"
            >
              .
            </button>

            <button
              type="button"
              onClick={() => handleKeyPress('0')}
              className="py-3 bg-[#1C1C20] hover:bg-neutral-800 active:scale-95 rounded-2xl text-xl font-bold font-mono transition text-white border border-white/5"
            >
              0
            </button>

            <button
              type="button"
              onClick={handleBackspace}
              className="py-3 bg-[#1C1C20] hover:bg-neutral-800 active:scale-95 rounded-2xl flex items-center justify-center transition text-neutral-400 hover:text-white border border-white/5"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>

          {/* Steppers */}
          <div className="grid grid-cols-12 gap-2 pt-0.5">
            <button
              type="button"
              disabled={currentItemIndex === 0 && activeAreaIndex === 0}
              onClick={handlePrevItem}
              className="col-span-3 py-3 bg-[#1C1C20] hover:bg-neutral-800 active:scale-95 disabled:opacity-20 rounded-2xl text-xs font-bold transition flex items-center justify-center space-x-1 border border-white/5"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Prev</span>
            </button>

            <button
              type="button"
              onClick={handleClear}
              className="col-span-3 py-3 bg-[#1C1C20] hover:bg-neutral-800 active:scale-95 rounded-2xl text-xs font-bold text-neutral-400 hover:text-white transition flex items-center justify-center border border-white/5"
            >
              Clear
            </button>

            <button
              type="button"
              onClick={handleNextItem}
              className="col-span-6 py-3 bg-[#C2F19D] hover:bg-[#b2e88a] active:scale-95 rounded-2xl text-xs font-black text-neutral-900 transition flex items-center justify-center space-x-1.5 shadow-md shadow-emerald-950/20"
            >
              <span>Next Bottle</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </main>

      {/* 4. BOTTOM BOTTLE PEEK STRIP */}
      <footer className="flex-shrink-0 px-4 py-2 bg-[#18181B] border-t border-white/5 flex items-center space-x-2 overflow-x-auto scrollbar-none">
        {activeSliceProducts.map((p, idx) => {
          const isSelected = idx === currentItemIndex;
          const isCounted = counts[p.id] !== undefined && counts[p.id] !== null && counts[p.id] !== '';

          return (
            <button
              key={p.id}
              onClick={() => {
                triggerHaptic(10);
                setCurrentItemIndex(idx);
              }}
              className={`py-1.5 px-3 rounded-xl whitespace-nowrap text-xs transition border flex items-center space-x-1.5 ${
                isSelected 
                  ? 'bg-neutral-100 text-neutral-900 font-bold border-white shadow-sm' 
                  : isCounted
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 font-medium'
                  : 'bg-white/5 hover:bg-white/10 text-neutral-400 border-transparent'
              }`}
            >
              <span>{p.name}</span>
              {isCounted && (
                <span className={`text-[9px] font-mono px-1 rounded ${isSelected ? 'bg-neutral-900 text-white font-bold' : 'bg-emerald-500/20 text-emerald-400 font-bold'}`}>
                  {counts[p.id]}
                </span>
              )}
            </button>
          );
        })}
      </footer>
    </div>
  );
}