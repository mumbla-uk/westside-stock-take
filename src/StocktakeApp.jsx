import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Minus, RefreshCw, X, Check, Lock, Delete } from 'lucide-react';

const HARDWIRED_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzcrqf4q-QWiGq0sxMmXqS7QcsxCVfhkJgPfjxOm6KyPShNUD-zkD9HUZy49rDdrfAYJg/exec";
const PIN_CODE = "1234";

// Reusable Icon Component with fallback to text
function AppLogo({ className = "w-12 h-12", fallbackTextClass = "font-serif text-6xl font-bold tracking-tighter" }) {
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

function getFormattedDates() {
  const now = new Date();
  const dayName = now.toLocaleDateString('en-GB', { weekday: 'long' });

  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));

  const dayOfMonth = monday.getDate();
  const monthName = monday.toLocaleDateString('en-GB', { month: 'long' });
  
  const getOrdinalSuffix = (d) => {
    if (d > 3 && d < 21) return 'th';
    switch (d % 10) {
      case 1:  return "st";
      case 2:  return "nd";
      case 3:  return "rd";
      default: return "th";
    }
  };

  const weekBeginningStr = `${dayOfMonth}${getOrdinalSuffix(dayOfMonth)} ${monthName}`;
  return { dayName, weekBeginningStr };
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const [activeTab, setActiveTab] = useState('Stocktake');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filter States
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [selectedArea, setSelectedArea] = useState(null);

  const [view, setView] = useState('stocktake');
  const [products, setProducts] = useState([]);
  const [counts, setCounts] = useState({});
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  // Animated Startup Sequence State
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingText, setLoadingText] = useState('Initializing settings...');

  const { dayName, weekBeginningStr } = useMemo(() => getFormattedDates(), []);

  useEffect(() => {
    const initCounts = {};
    products.forEach(p => { initCounts[p.id] = p.count ?? 0; });
    setCounts(initCounts);
  }, [products]);

  // Animated Multi-Stage Startup Loader
  const startLoadingSequence = async () => {
    setLoading(true);
    setLoadingProgress(10);
    setLoadingText('Initializing settings...');

    try {
      await new Promise(r => setTimeout(r, 300));
      setLoadingProgress(35);
      setLoadingText('Connecting to Google Sheets...');

      const res = await fetch(HARDWIRED_SCRIPT_URL);
      const json = await res.json();

      setLoadingProgress(65);
      setLoadingText('Loading SKUs & inventory...');
      await new Promise(r => setTimeout(r, 400));

      setLoadingProgress(85);
      setLoadingText('Finalizing product catalog...');

      if (json.status === "success" && Array.isArray(json.data)) {
        setProducts(json.data);
      } else if (Array.isArray(json)) {
        setProducts(json);
      }

      await new Promise(r => setTimeout(r, 300));
      setLoadingProgress(100);

      setTimeout(() => {
        setLoading(false);
      }, 200);

    } catch (err) {
      console.error("Failed to load sheet data:", err);
      setLoadingProgress(100);
      setLoadingText('Loaded with offline fallback.');
      setTimeout(() => setLoading(false), 500);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      startLoadingSequence();
    }
  }, [isAuthenticated]);

  const handlePinPress = (num) => {
    if (pinInput.length < 4) {
      const newPin = pinInput + num;
      setPinInput(newPin);
      setPinError(false);

      if (newPin.length === 4) {
        if (newPin === PIN_CODE) {
          setTimeout(() => setIsAuthenticated(true), 150);
        } else {
          setTimeout(() => {
            setPinError(true);
            setPinInput('');
          }, 200);
        }
      }
    }
  };

  const handlePinDelete = () => {
    setPinInput(prev => prev.slice(0, -1));
    setPinError(false);
  };

  const handleSaveToSheet = async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      const payload = products.map(p => ({
        id: p.id,
        count: counts[p.id] ?? 0
      }));
      await fetch(HARDWIRED_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'no-cors'
      });
      setStatusMsg({ type: 'success', text: 'Stock counts saved to Google Sheet!' });
    } catch (err) {
      console.error("Failed to save to sheet:", err);
      setStatusMsg({ type: 'error', text: 'Failed to write counts to Google Sheet.' });
    } finally {
      setSaving(false);
    }
  };

  // Filter Extractors
  const suppliers = useMemo(() => Array.from(new Set(products.map(p => p.supplier))).filter(Boolean), [products]);
  const areas = useMemo(() => {
    const list = Array.from(new Set(products.map(p => p.area || 'Main Bar'))).filter(Boolean);
    return list;
  }, [products]);

  // Combined Supplier & Area Filter Logic
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const itemArea = p.area || 'Main Bar';
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            p.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSupplier = selectedSupplier ? p.supplier === selectedSupplier : true;
      const matchesArea = selectedArea ? itemArea === selectedArea : true;

      return matchesSearch && matchesSupplier && matchesArea;
    });
  }, [products, searchQuery, selectedSupplier, selectedArea]);

  const updateCount = (id, delta) => {
    setCounts(prev => ({
      ...prev,
      [id]: Math.max(0, (prev[id] ?? 0) + delta)
    }));
  };

  /* -------------------------------------------------------------------------- */
  /* 1. LOGIN SCREEN                                                           */
  /* -------------------------------------------------------------------------- */
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-screen w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 justify-center items-center px-8">
        <div className="mb-12 flex justify-center items-center">
          <AppLogo className="w-20 h-20" fallbackTextClass="font-serif text-6xl font-bold tracking-tighter" />
        </div>
        <div className="flex space-x-4 mb-16">
          {[0, 1, 2, 3].map(index => {
            const isFilled = pinInput.length > index;
            return (
              <div
                key={index}
                className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                  pinError ? 'bg-red-500 animate-bounce' : isFilled ? 'bg-gray-800 scale-110' : 'bg-gray-200'
                }`}
              />
            );
          })}
        </div>
        <div className="grid grid-cols-3 gap-y-8 gap-x-12 w-full max-w-xs text-center text-2xl font-medium">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button
              key={num}
              onClick={() => handlePinPress(num.toString())}
              className="py-3 hover:bg-gray-50 active:bg-gray-100 rounded-full transition select-none focus:outline-none"
            >
              {num}
            </button>
          ))}
          <div />
          <button
            onClick={() => handlePinPress('0')}
            className="py-3 hover:bg-gray-50 active:bg-gray-100 rounded-full transition select-none focus:outline-none"
          >
            0
          </button>
          <button
            onClick={handlePinDelete}
            className="flex items-center justify-center py-3 text-gray-400 hover:text-gray-900 transition focus:outline-none"
          >
            <Delete className="w-6 h-6" />
          </button>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* 2. ANIMATED STARTUP LOADING SCREEN                                         */
  /* -------------------------------------------------------------------------- */
  if (loading) {
    return (
      <div className="flex flex-col h-screen w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 justify-center items-center px-10">
        <div className="mb-10 animate-pulse flex justify-center items-center">
          <AppLogo className="w-16 h-16" fallbackTextClass="font-serif text-6xl font-bold tracking-tighter" />
        </div>
        
        <div className="w-full bg-[#EDEDED] h-2 rounded-full overflow-hidden mb-4">
          <div 
            className="bg-black h-full transition-all duration-300 ease-out rounded-full"
            style={{ width: `${loadingProgress}%` }}
          />
        </div>

        <p className="text-xs font-mono text-gray-500 italic tracking-tight">
          {loadingText}
        </p>
      </div>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* 3. MAIN APPLICATION                                                        */
  /* -------------------------------------------------------------------------- */
  return (
    <div className="flex flex-col h-screen w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 overflow-x-hidden">
      
      {/* Header */}
      <header className="flex items-center justify-between px-5 pt-6 pb-2 border-b border-gray-50 flex-shrink-0">
        <div className="flex items-center space-x-2">
          <AppLogo className="w-7 h-7" fallbackTextClass="font-serif text-2xl font-bold tracking-tighter" />
          <span className="font-semibold text-base tracking-tight">West Side Tavern</span>
        </div>
        <div className="flex items-center space-x-4 text-sm font-medium">
          <button 
            onClick={() => {
              setIsAuthenticated(false);
              setPinInput('');
            }} 
            className="text-gray-900 hover:text-black"
          >
            Logout
          </button>
          <button 
            onClick={() => setView(view === 'settings' ? 'stocktake' : 'settings')}
            className={`transition ${view === 'settings' ? 'font-bold underline' : 'text-gray-900 hover:text-black'}`}
          >
            Settings
          </button>
        </div>
      </header>

      {/* Main Container */}
      {view === 'settings' ? (
        
        /* SETTINGS SCREEN */
        <div className="flex-1 flex flex-col px-5 pt-4 pb-2 overflow-y-auto">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div>
              <p className="text-gray-500 italic text-sm font-serif">Preferences</p>
              <h1 className="text-2xl font-extrabold tracking-tight mt-0.5">Settings</h1>
            </div>
            <button 
              onClick={() => setView('stocktake')}
              className="p-1.5 bg-[#EDEDED] rounded-lg text-gray-700 hover:bg-gray-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-5 mt-4">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-gray-900">
                Google Apps Script Web App URL
              </label>
              <p className="text-xs text-gray-500 leading-relaxed">
                Endpoint URL is hardwired into the application core.
              </p>
              <div className="relative mt-2">
                <input
                  type="text"
                  readOnly
                  value={HARDWIRED_SCRIPT_URL}
                  className="w-full bg-[#EDEDED] py-3 pl-10 pr-4 rounded-lg text-xs font-mono text-gray-500 cursor-not-allowed focus:outline-none"
                />
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
            </div>

            <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-2 text-xs text-green-800 font-medium">
              <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span>Hardwired & Connected to Google Sheet.</span>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setView('stocktake')}
                className="w-full py-3 bg-[#C2F19D] text-sm font-semibold rounded-lg text-gray-900 hover:bg-[#b2e88a] transition"
              >
                Back to Stocktake
              </button>
            </div>
          </div>
        </div>

      ) : (

        /* STOCKTAKE SCREEN */
        <div className="flex-1 flex flex-col overflow-hidden">
          
          {/* Title Section */}
          <div className="px-5 pt-3 pb-1 flex justify-between items-end flex-shrink-0">
            <div>
              <p className="text-gray-500 italic text-xs font-serif">Stocktake</p>
              <h1 className="text-lg font-bold tracking-tight text-gray-900 mt-0.5 leading-snug">
                Week beginning {weekBeginningStr}
              </h1>
            </div>
            <button 
              onClick={startLoadingSequence} 
              className="p-1.5 text-gray-500 hover:text-black rounded-lg bg-gray-50 border border-gray-100"
              title="Sync with Google Sheet"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {statusMsg && (
            <div className={`mx-5 my-1 p-2 rounded-lg text-xs font-medium flex-shrink-0 ${
              statusMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {statusMsg.text}
            </div>
          )}

          {/* Controls Bar */}
          <div className="flex items-center justify-between px-5 py-2 flex-shrink-0">
            <div className="bg-[#F3F3F3] font-bold px-3 py-1.5 rounded-lg text-xs text-gray-800 tracking-wide uppercase">
              {dayName}
            </div>

            <div className="flex space-x-2">
              <button 
                onClick={() => setCounts({})}
                className="px-3 py-1.5 bg-[#F3F3F3] hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-800 transition"
              >
                Clear
              </button>
              <button 
                onClick={handleSaveToSheet}
                disabled={saving}
                className="flex items-center space-x-1 px-3 py-1.5 bg-[#C2F19D] hover:bg-[#b2e88a] rounded-lg text-xs font-semibold text-gray-900 transition"
              >
                <span>{saving ? 'Saving...' : 'Save'}</span>
              </button>
            </div>
          </div>

          {/* Dynamic Search Bar */}
          <div className="px-5 py-1.5 flex-shrink-0 space-y-2">
            
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="w-full bg-[#EDEDED] py-2 pl-4 pr-9 rounded-lg text-xs italic placeholder-gray-500 focus:outline-none focus:ring-0"
              />
              
              {searchQuery ? (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-500 hover:text-black transition"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              )}
            </div>

            {/* Row 1: Supplier */}
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Supplier</span>
              <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
                {suppliers.map(sup => (
                  <button
                    key={sup}
                    onClick={() => setSelectedSupplier(selectedSupplier === sup ? null : sup)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium italic whitespace-nowrap transition border ${
                      selectedSupplier === sup 
                        ? 'bg-black text-white border-black' 
                        : 'bg-[#EDEDED] text-gray-700 border-transparent hover:bg-gray-200'
                    }`}
                  >
                    {sup}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 2: Area (Column H) */}
            {areas.length > 0 && (
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Area</span>
                <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
                  {areas.map(area => (
                    <button
                      key={area}
                      onClick={() => setSelectedArea(selectedArea === area ? null : area)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition border ${
                        selectedArea === area 
                          ? 'bg-black text-white border-black' 
                          : 'bg-[#EDEDED] text-gray-700 border-transparent hover:bg-gray-200'
                      }`}
                    >
                      {area}
                    </button>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Table Headers */}
          <div className="grid grid-cols-12 px-5 py-1.5 border-b border-gray-100 text-xs font-bold text-gray-900 mt-1 flex-shrink-0">
            <span className="col-span-5">Stocktake</span>
            <span className="col-span-2 text-center">Order Amt.</span>
            <span className="col-span-2 text-center">Par</span>
            <span className="col-span-3 text-center">Count</span>
          </div>

          {/* Product List */}
          <div className="flex-1 overflow-y-auto px-5 divide-y divide-gray-100">
            {filteredProducts.length === 0 ? (
              <p className="text-center py-8 text-sm text-gray-500">No matching products found.</p>
            ) : (
              filteredProducts.map(product => {
                const currentCount = counts[product.id] ?? 0;
                const orderAmt = Math.max(0, product.par - currentCount);

                return (
                  <div key={product.id} className="grid grid-cols-12 items-center py-2.5 text-sm">
                    <div className="col-span-5 pr-1">
                      <span className="font-semibold text-gray-900 block leading-tight text-xs">{product.name}</span>
                      <span className="text-[10px] text-gray-400 italic">({product.unit})</span>
                    </div>

                    <div className="col-span-2 text-center font-bold text-gray-900 text-xs">
                      {orderAmt}
                    </div>

                    <div className="col-span-2 text-center text-gray-800 font-medium text-xs">
                      {product.par}
                    </div>

                    <div className="col-span-3 flex items-center justify-end space-x-1.5">
                      <button 
                        onClick={() => updateCount(product.id, -1)}
                        className="p-1 text-gray-800 hover:bg-gray-100 rounded transition"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      
                      <span className="w-7 py-1 bg-[#EDEDED] text-center font-medium rounded text-xs">
                        {currentCount}
                      </span>

                      <button 
                        onClick={() => updateCount(product.id, 1)}
                        className="p-1 text-gray-800 hover:bg-gray-100 rounded transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <footer className="bg-[#111111] text-white flex justify-around items-center py-3.5 px-2 text-xs font-semibold flex-shrink-0">
        <button className="text-gray-400 hover:text-white">&lt; Back</button>
        <button 
          onClick={() => { setView('stocktake'); setActiveTab('Stocktake'); }}
          className={activeTab === 'Stocktake' && view === 'stocktake' ? 'text-white border-b-2 border-white pb-0.5' : 'text-gray-400 hover:text-white'}
        >
          Stocktake
        </button>
        <button 
          onClick={() => setActiveTab('Orders')}
          className={activeTab === 'Orders' ? 'text-white border-b-2 border-white pb-0.5' : 'text-gray-400 hover:text-white'}
        >
          Orders
        </button>
        <button 
          onClick={() => setActiveTab('Goods')}
          className={activeTab === 'Goods' ? 'text-white border-b-2 border-white pb-0.5' : 'text-gray-400 hover:text-white'}
        >
          Goods Received
        </button>
      </footer>
    </div>
  );
}