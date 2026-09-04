import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Minus, ChevronDown, RefreshCw, X, Check, Lock, Delete } from 'lucide-react';

// Hardwired Web App Endpoint
const HARDWIRED_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzcrqf4q-QWiGq0sxMmXqS7QcsxCVfhkJgPfjxOm6KyPShNUD-zkD9HUZy49rDdrfAYJg/exec";
const PIN_CODE = "1234";

export default function App() {
  // Navigation & Auth States
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const [activeTab, setActiveTab] = useState('Stocktake');
  const [selectedDay, setSelectedDay] = useState('Monday');
  const [searchQuery, setSearchQuery] = useState('Bacard');
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  
  // App views: 'stocktake' or 'settings'
  const [view, setView] = useState('stocktake');
  const [products, setProducts] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  // Sync counts state from products
  useEffect(() => {
    const initCounts = {};
    products.forEach(p => { initCounts[p.id] = p.count ?? 0; });
    setCounts(initCounts);
  }, [products]);

  // Fetch sheet catalog upon authentication
  const fetchSheetData = async () => {
    setLoading(true);
    setStatusMsg(null);
    try {
      const res = await fetch(HARDWIRED_SCRIPT_URL);
      const json = await res.json();
      if (json.status === "success" && Array.isArray(json.data)) {
        setProducts(json.data);
      } else if (Array.isArray(json)) {
        setProducts(json);
      } else {
        setStatusMsg({ type: 'error', text: 'Error fetching catalog from script.' });
      }
    } catch (err) {
      console.error("Failed to load sheet data:", err);
      setStatusMsg({ type: 'error', text: 'Network error connecting to Apps Script.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchSheetData();
    }
  }, [isAuthenticated]);

  // PIN Keypad Press Handler
  const handlePinPress = (num) => {
    if (pinInput.length < 4) {
      const newPin = pinInput + num;
      setPinInput(newPin);
      setPinError(false);

      if (newPin.length === 4) {
        if (newPin === PIN_CODE) {
          setTimeout(() => {
            setIsAuthenticated(true);
          }, 150);
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

  // Save stock counts back to sheet
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

  const suppliers = useMemo(() => {
    return Array.from(new Set(products.map(p => p.supplier))).filter(Boolean);
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            p.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSupplier = selectedSupplier ? p.supplier === selectedSupplier : true;
      return matchesSearch && matchesSupplier;
    });
  }, [products, searchQuery, selectedSupplier]);

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
        {/* Brand Logo */}
        <div className="mb-12">
          <span className="font-serif text-6xl font-bold tracking-tighter">T</span>
        </div>

        {/* PIN Indicators */}
        <div className="flex space-x-4 mb-16">
          {[0, 1, 2, 3].map(index => {
            const isFilled = pinInput.length > index;
            return (
              <div
                key={index}
                className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                  pinError 
                    ? 'bg-red-500 animate-bounce' 
                    : isFilled 
                      ? 'bg-gray-800 scale-110' 
                      : 'bg-gray-200'
                }`}
              />
            );
          })}
        </div>

        {/* Numeric Keypad */}
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
  /* 2. LOADING SCREEN                                                          */
  /* -------------------------------------------------------------------------- */
  if (loading) {
    return (
      <div className="flex flex-col h-screen w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 justify-center items-center px-6">
        <span className="font-serif text-5xl font-bold tracking-tighter mb-6">T</span>
        <RefreshCw className="w-6 h-6 text-gray-400 animate-spin mb-3" />
        <p className="text-sm font-medium text-gray-600 italic">loading products...</p>
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
          <span className="font-serif text-2xl font-bold tracking-tighter">T</span>
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

      {/* Main Container Switch */}
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
          <div className="px-5 pt-3 pb-2 flex justify-between items-end flex-shrink-0">
            <div>
              <p className="text-gray-500 italic text-sm font-serif">Stocktake</p>
              <h1 className="text-3xl font-extrabold tracking-tight leading-none mt-1">
                Week beginning<br />17th November
              </h1>
            </div>
            <button 
              onClick={fetchSheetData} 
              className="p-2 text-gray-500 hover:text-black rounded-lg bg-gray-50 border border-gray-100"
              title="Sync with Google Sheet"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {statusMsg && (
            <div className={`mx-5 my-1 p-2.5 rounded-lg text-xs font-medium flex-shrink-0 ${
              statusMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {statusMsg.text}
            </div>
          )}

          {/* Controls Bar */}
          <div className="flex items-center justify-between px-5 py-2 flex-shrink-0">
            <div className="relative">
              <select 
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
                className="appearance-none bg-[#F3F3F3] font-medium py-2 pl-4 pr-9 rounded-lg text-base sm:text-sm text-gray-900 focus:outline-none cursor-pointer"
              >
                <option>Monday</option>
                <option>Tuesday</option>
                <option>Wednesday</option>
                <option>Thursday</option>
                <option>Friday</option>
                <option>Saturday</option>
                <option>Sunday</option>
              </select>
              <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-600" />
            </div>

            <div className="flex space-x-2">
              <button 
                onClick={() => setCounts({})}
                className="px-4 py-2 bg-[#F3F3F3] hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-800 transition"
              >
                Clear
              </button>
              <button 
                onClick={handleSaveToSheet}
                disabled={saving}
                className="flex items-center space-x-1 px-4 py-2 bg-[#C2F19D] hover:bg-[#b2e88a] rounded-lg text-sm font-semibold text-gray-900 transition"
              >
                <span>{saving ? 'Saving...' : 'Save'}</span>
              </button>
            </div>
          </div>

          {/* Search & Supplier Filter Chips */}
          <div className="px-5 py-2 flex-shrink-0">
            <label className="block text-sm font-bold text-gray-900 mb-2">Search products</label>
            
            <div className="flex items-center space-x-2 mb-2 overflow-x-auto pb-1 scrollbar-none">
              {suppliers.map(sup => (
                <button
                  key={sup}
                  onClick={() => setSelectedSupplier(selectedSupplier === sup ? null : sup)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium italic whitespace-nowrap transition border ${
                    selectedSupplier === sup 
                      ? 'bg-black text-white border-black' 
                      : 'bg-[#EDEDED] text-gray-700 border-transparent hover:bg-gray-200'
                  }`}
                >
                  {sup}
                </button>
              ))}
            </div>

            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="w-full bg-[#EDEDED] py-2.5 pl-4 pr-10 rounded-lg text-base sm:text-sm italic placeholder-gray-500 focus:outline-none focus:ring-0"
              />
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Stocktake Table Headers */}
          <div className="grid grid-cols-12 px-5 py-2 border-b border-gray-100 text-xs font-bold text-gray-900 mt-1 flex-shrink-0">
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
                  <div key={product.id} className="grid grid-cols-12 items-center py-3 text-sm">
                    <div className="col-span-5 pr-1">
                      <span className="font-semibold text-gray-900 block leading-tight">{product.name}</span>
                      <span className="text-xs text-gray-400 italic">({product.unit})</span>
                    </div>

                    <div className="col-span-2 text-center font-bold text-gray-900">
                      {orderAmt}
                    </div>

                    <div className="col-span-2 text-center text-gray-800 font-medium">
                      {product.par}
                    </div>

                    <div className="col-span-3 flex items-center justify-end space-x-1.5">
                      <button 
                        onClick={() => updateCount(product.id, -1)}
                        className="p-1 text-gray-800 hover:bg-gray-100 rounded transition"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      
                      <span className="w-8 py-1 bg-[#EDEDED] text-center font-medium rounded text-xs">
                        {currentCount}
                      </span>

                      <button 
                        onClick={() => updateCount(product.id, 1)}
                        className="p-1 text-gray-800 hover:bg-gray-100 rounded transition"
                      >
                        <Plus className="w-4 h-4" />
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
      <footer className="bg-[#111111] text-white flex justify-around items-center py-4 px-2 text-xs font-semibold flex-shrink-0">
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