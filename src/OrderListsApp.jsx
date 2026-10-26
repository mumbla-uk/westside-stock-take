import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ArrowLeft, 
  Search, 
  Plus, 
  Minus, 
  RefreshCw, 
  X, 
  Lock, 
  Copy, 
  Check, 
  ClipboardList, 
  FileSpreadsheet, 
  ExternalLink,
  Send
} from 'lucide-react';
import { useTwoFingerSwipe } from './useTwoFingerSwipe';

const HARDWIRED_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzcrqf4q-QWiGq0sxMmXqS7QcsxCVfhkJgPfjxOm6KyPShNUD-zkD9HUZy49rDdrfAYJg/exec";

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
  const fullDateStr = `${dayName} ${dayOfMonth}${getOrdinalSuffix(dayOfMonth)} ${monthName}`;
  return { dayName, weekBeginningStr, fullDateStr };
}

export default function OrderListsApp({ currentUser, initialCatalog = [], onBackToHub, onLogout }) {
  const [activeTab, setActiveTab] = useState('Stocktake'); // 'Stocktake' | 'Orders'
  const [searchQuery, setSearchQuery] = useState('');
  
  const [selectedSuppliers, setSelectedSuppliers] = useState([]);
  const [selectedAreas, setSelectedAreas] = useState([]);
  const [view, setView] = useState('main'); // 'main' | 'settings'

  const parseCatalog = (data) => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.catalog)) return data.catalog;
    if (Array.isArray(data.data)) return data.data;
    return [];
  };

  const [products, setProducts] = useState(() => {
    const fromProp = parseCatalog(initialCatalog);
    if (fromProp.length > 0) return fromProp;

    try {
      const cached = localStorage.getItem('wst_catalog');
      return cached ? parseCatalog(JSON.parse(cached)) : [];
    } catch {
      return [];
    }
  });

  const [masterSheetUrl, setMasterSheetUrl] = useState(() => {
    return localStorage.getItem('wst_master_sheet_url') || '';
  });

  const [counts, setCounts] = useState(() => {
    const init = {};
    const fromProp = parseCatalog(initialCatalog);
    const base = fromProp.length > 0 ? fromProp : (() => {
      try { return parseCatalog(JSON.parse(localStorage.getItem('wst_catalog') || '[]')); } catch { return []; }
    })();
    base.forEach(p => { if (p && p.id) init[p.id] = p.count ?? 0; });
    return init;
  });

  const [orderOverrides, setOrderOverrides] = useState(() => {
    const init = {};
    const fromProp = parseCatalog(initialCatalog);
    const base = fromProp.length > 0 ? fromProp : (() => {
      try { return parseCatalog(JSON.parse(localStorage.getItem('wst_catalog') || '[]')); } catch { return []; }
    })();
    base.forEach(p => { if (p && p.id) init[p.id] = Math.max(0, (p.par ?? 0) - (p.count ?? 0)); });
    return init;
  });

  const [copyFeedback, setCopyFeedback] = useState(null);
  const [modifiedIds, setModifiedIds] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [savingToDrive, setSavingToDrive] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [driveFileUrl, setDriveFileUrl] = useState('');

  const { dayName, weekBeginningStr, fullDateStr } = useMemo(() => getFormattedDates(), []);

  // TWO-FINGER SWIPE NAVIGATION HOOK
  const swipeHandlers = useTwoFingerSwipe({
    disabled: view === 'settings',
    onSwipeLeft: () => {
      if (activeTab === 'Stocktake') setActiveTab('Orders');
    },
    onSwipeRight: () => {
      if (activeTab === 'Orders') {
        setActiveTab('Stocktake');
      } else if (activeTab === 'Stocktake' && onBackToHub) {
        onBackToHub();
      }
    }
  });

  const fetchSheetData = async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`${HARDWIRED_SCRIPT_URL}?action=all`);
      const json = await res.json();
      const fetched = parseCatalog(json);

      if (json && json.masterSheetUrl) {
        setMasterSheetUrl(json.masterSheetUrl);
        localStorage.setItem('wst_master_sheet_url', json.masterSheetUrl);
      }

      if (fetched.length > 0) {
        setProducts(fetched);
        const cInit = {};
        const oInit = {};
        fetched.forEach(p => {
          if (p && p.id) {
            cInit[p.id] = p.count ?? 0;
            oInit[p.id] = Math.max(0, (p.par ?? 0) - (p.count ?? 0));
          }
        });
        setCounts(cInit);
        setOrderOverrides(oInit);
        localStorage.setItem('wst_catalog', JSON.stringify(fetched));
      }
    } catch (err) {
      console.error("Stocktake fetch error:", err);
      setStatusMsg({ type: 'error', text: 'Could not load catalog from Google Sheet.' });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (products.length === 0 || !masterSheetUrl) {
      fetchSheetData();
    }
  }, []);

  const updateCount = (id, delta) => {
    setModifiedIds(prev => new Set(prev).add(id));
    setCounts(prev => {
      const newCount = Math.max(0, (prev[id] ?? 0) + delta);
      const prod = products.find(p => p.id === id);
      const par = prod ? (prod.par ?? 0) : 0;
      setOrderOverrides(orderPrev => ({ ...orderPrev, [id]: Math.max(0, par - newCount) }));
      return { ...prev, [id]: newCount };
    });
  };

  const updateOrderAmount = (id, delta) => {
    setOrderOverrides(prev => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 0) + delta) }));
  };

const handleSaveToSheet = async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      const payload = {
        action: 'save_counts',
        items: products.map(p => ({
          id: p.id,
          count: counts[p.id] ?? 0
        }))
      };

      const res = await fetch(HARDWIRED_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();

      if (json && json.status === 'success') {
        setStatusMsg({ type: 'success', text: 'Stock counts saved to Google Sheet!' });
      } else {
        setStatusMsg({ type: 'error', text: json?.message || 'Error saving counts.' });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Failed to write counts to Google Sheet.' });
    } finally {
      setSaving(false);
    }
  };

  const toggleSupplier = (sup) => {
    setSelectedSuppliers(prev => prev.includes(sup) ? prev.filter(s => s !== sup) : [...prev, sup]);
  };

  const toggleArea = (area) => {
    setSelectedAreas(prev => prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area]);
  };

  const allSuppliers = useMemo(() => Array.from(new Set(products.map(p => p.supplier))).filter(Boolean), [products]);

  const availableAreas = useMemo(() => {
    const relevantProducts = selectedSuppliers.length > 0
      ? products.filter(p => selectedSuppliers.includes(p.supplier))
      : products;
    return Array.from(new Set(relevantProducts.map(p => p.area || 'Main Bar'))).filter(Boolean);
  }, [products, selectedSuppliers]);

  useEffect(() => {
    setSelectedAreas(prev => prev.filter(a => availableAreas.includes(a)));
  }, [availableAreas]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const itemArea = p.area || 'Main Bar';
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            p.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSupplier = selectedSuppliers.length > 0 ? selectedSuppliers.includes(p.supplier) : true;
      const matchesArea = selectedAreas.length > 0 ? selectedAreas.includes(itemArea) : true;
      return matchesSearch && matchesSupplier && matchesArea;
    });
  }, [products, searchQuery, selectedSuppliers, selectedAreas]);

  const ordersBySupplier = useMemo(() => {
    const grouped = {};
    products.forEach(p => {
      if (modifiedIds.has(p.id)) {
        const orderQty = orderOverrides[p.id] ?? Math.max(0, (p.par ?? 0) - (counts[p.id] ?? 0));
        if (orderQty > 0) {
          const sup = p.supplier || 'General';
          if (!grouped[sup]) grouped[sup] = [];
          grouped[sup].push({ ...p, orderQty });
        }
      }
    });
    return grouped;
  }, [products, modifiedIds, orderOverrides, counts]);

  const handleCopySupplier = (supplierName, items) => {
    let text = `WEST SIDE TAVERN - ${supplierName.toUpperCase()} ORDER\nDate: ${fullDateStr}\n----------------------------------\n`;
    items.forEach(item => {
      text += `• [${item.id}] ${item.name} (${item.unit}) x ${item.orderQty}\n`;
    });
    navigator.clipboard.writeText(text);
    setCopyFeedback(supplierName);
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  const handleCopyAll = () => {
    let text = `WEST SIDE TAVERN - COMPLETE ORDER SUMMARY\nDate: ${fullDateStr}\n==================================\n\n`;
    Object.keys(ordersBySupplier).forEach(sup => {
      text += `[ ${sup.toUpperCase()} ]\n`;
      ordersBySupplier[sup].forEach(item => {
        text += `• [${item.id}] ${item.name} (${item.unit}) x ${item.orderQty}\n`;
      });
      text += `\n`;
    });
    navigator.clipboard.writeText(text);
    setCopyFeedback('ALL');
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  const handleSaveSupplierOrderToDrive = async (supplierName, items) => {
    setSavingToDrive(true);
    setStatusMsg({ type: 'info', text: `Saving ${supplierName} order into Drive folder...` });

    try {
      const payload = {
        action: 'save_order_list',
        supplier: supplierName,
        date: new Date().toISOString().slice(0, 10),
        manager: currentUser?.name || 'Duty Manager',
        items: items.map(it => ({
          sku: it.id,
          name: it.name,
          orderQty: it.orderQty,
          unit: it.unit || 'unit',
          par: it.par || 0,
          currentCount: counts[it.id] ?? 0
        }))
      };

      const res = await fetch(HARDWIRED_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();

      if (json && json.status === 'success') {
        setStatusMsg({ type: 'success', text: `${supplierName} order saved to Order Lists folder!` });
        if (json.fileUrl) setDriveFileUrl(json.fileUrl);
      } else {
        setStatusMsg({ type: 'error', text: 'Error saving order list to Drive.' });
      }
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Network error saving order list.' });
    } finally {
      setSavingToDrive(false);
    }
  };

  return (
    <div 
      {...swipeHandlers}
      className="flex flex-col h-screen w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 overflow-x-hidden relative"
    >
      {/* Top Header with Safe Area Notch Clearance */}
      <header className="flex items-center justify-between px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-2 border-b border-gray-100 flex-shrink-0 bg-white z-20">
        <div className="flex items-center space-x-2">
          {onBackToHub && (
            <button onClick={onBackToHub} className="mr-0.5 p-1 -ml-1 text-gray-500 hover:text-black rounded-lg transition" title="Return to Hub">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <AppLogo className="w-6 h-6" fallbackTextClass="font-serif text-2xl font-bold tracking-tighter" />
          <span className="font-semibold text-base tracking-tight">West Side Tavern</span>
        </div>
        <div className="flex items-center space-x-4 text-xs font-medium">
          {onBackToHub ? (
            <button onClick={onBackToHub} className="text-gray-900 hover:text-black font-semibold">Hub</button>
          ) : (
            <button onClick={onLogout} className="text-gray-900 hover:text-black">Logout</button>
          )}
          <button 
            onClick={() => setView(view === 'settings' ? 'main' : 'settings')}
            className={`transition ${view === 'settings' ? 'font-bold underline' : 'text-gray-900 hover:text-black'}`}
          >
            Settings
          </button>
        </div>
      </header>

      {/* Main View Router */}
      {view === 'settings' ? (
        <div className="flex-1 flex flex-col px-5 pt-4 pb-20 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div>
              <p className="text-gray-500 italic text-[11px] font-serif">Preferences</p>
              <h1 className="text-xl font-extrabold tracking-tight mt-0.5">Settings</h1>
            </div>
            <button onClick={() => setView('main')} className="p-1.5 bg-[#EDEDED] rounded-lg text-gray-700 hover:bg-gray-200">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4 text-[11px]">
            {/* Direct Master Sheet Link */}
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[9px] uppercase font-bold text-gray-400 block">Master Catalog Sheet</span>
                  <p className="text-xs font-bold text-gray-900">Manage SKUs, Pars & Suppliers</p>
                </div>
              </div>
              <p className="text-[10px] text-gray-500 leading-tight">
                Edit items, pars, suppliers, and areas directly in the master stock spreadsheet.
              </p>
              {masterSheetUrl ? (
                <a
                  href={masterSheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2.5 bg-black hover:bg-neutral-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 shadow-sm"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Open Master Stocktake Sheet</span>
                  <ExternalLink className="w-3 h-3 text-gray-400" />
                </a>
              ) : (
                <button
                  type="button"
                  onClick={fetchSheetData}
                  className="w-full py-2 bg-gray-200 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-300 transition"
                >
                  Sync Spreadsheet URL
                </button>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-900">Google Apps Script Web App</label>
              <div className="relative mt-2">
                <input type="text" readOnly value={HARDWIRED_SCRIPT_URL} className="w-full bg-[#EDEDED] py-2.5 pl-9 pr-3 rounded-lg text-[10px] font-mono text-gray-500 cursor-not-allowed focus:outline-none" />
                <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
            </div>

            <button onClick={() => setView('main')} className="w-full py-2.5 bg-[#C2F19D] text-xs font-semibold rounded-lg text-gray-900 hover:bg-[#b2e88a] transition">
              Back to Stocktake
            </button>
          </div>
        </div>
      ) : activeTab === 'Orders' ? (

        /* TAB 2: PAR-LEVEL ORDERS BY SUPPLIER */
        <div className="flex-1 flex flex-col overflow-hidden pb-20">
          <div className="px-5 pt-3 pb-2 border-b border-gray-100 flex-shrink-0">
            <div className="flex justify-between items-start mb-1.5">
              <div>
                <div className="flex items-center space-x-1.5">
                  <p className="text-gray-500 italic text-[11px] font-serif">Par-Level Reorder Calculations</p>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-bold">{modifiedIds.size} items counted</span>
                </div>
                <h1 className="text-xl font-black tracking-tight text-gray-900">Orders by Supplier</h1>
              </div>
              <button
                onClick={handleCopyAll}
                disabled={Object.keys(ordersBySupplier).length === 0}
                className="flex items-center space-x-1 px-2.5 py-1 bg-[#F3F3F3] hover:bg-gray-200 disabled:opacity-40 rounded-lg text-xs font-bold text-gray-900 transition"
              >
                {copyFeedback === 'ALL' ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                <span>{copyFeedback === 'ALL' ? 'Copied' : 'Copy All'}</span>
              </button>
            </div>

            {statusMsg && (
              <div className={`p-2 rounded-xl text-[11px] font-semibold my-1 ${statusMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : statusMsg.type === 'info' ? 'bg-blue-50 text-blue-800 border border-blue-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                {statusMsg.text}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
            {modifiedIds.size === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-xs font-semibold text-gray-600">No stock counted yet this session</p>
                <p className="text-[10px] text-gray-400 mt-1">Adjust item counts on the Stocktake tab to calculate supplier orders</p>
              </div>
            ) : Object.keys(ordersBySupplier).length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Check className="w-10 h-10 mx-auto mb-2 text-green-600 opacity-60" />
                <p className="text-xs font-bold text-gray-800">All counted items are at or above par</p>
              </div>
            ) : (
              Object.keys(ordersBySupplier).map(supplier => {
                const items = ordersBySupplier[supplier];
                const totalUnits = items.reduce((sum, item) => sum + item.orderQty, 0);
                return (
                  <div key={supplier} className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                    <div className="bg-[#F8F8F8] px-3.5 py-2 flex items-center justify-between border-b border-gray-200">
                      <div>
                        <span className="text-xs font-black text-gray-900 uppercase tracking-wide">{supplier}</span>
                        <span className="text-[10px] text-gray-500 font-mono ml-2 font-bold">({totalUnits} units)</span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <button 
                          onClick={() => handleCopySupplier(supplier, items)} 
                          className="flex items-center space-x-1 px-2 py-0.5 bg-white border border-gray-200 rounded-md text-[10px] font-bold text-gray-800 hover:bg-gray-50 transition"
                        >
                          {copyFeedback === supplier ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                          <span>{copyFeedback === supplier ? 'Copied' : 'Copy'}</span>
                        </button>
                        <button
                          disabled={savingToDrive}
                          onClick={() => handleSaveSupplierOrderToDrive(supplier, items)}
                          className="flex items-center space-x-1 px-2 py-0.5 bg-black text-white rounded-md text-[10px] font-bold hover:bg-neutral-800 transition"
                        >
                          <Send className="w-2.5 h-2.5 text-emerald-400" />
                          <span>Save Drive</span>
                        </button>
                      </div>
                    </div>

                    <div className="divide-y divide-gray-100">
                      {items.map(item => (
                        <div key={item.id} className="grid grid-cols-12 items-center px-3.5 py-2 text-xs">
                          <div className="col-span-7 pr-2">
                            <span className="font-bold text-gray-900 block leading-tight text-[11px]">{item.name}</span>
                            <span className="text-[9px] text-gray-400 italic font-mono">
                              {item.id} | Par: {item.par} | Count: {counts[item.id] ?? 0}
                            </span>
                          </div>
                          <div className="col-span-5 flex items-center justify-end space-x-1">
                            <button 
                              onClick={() => updateOrderAmount(item.id, -1)} 
                              className="p-1 text-gray-700 hover:bg-gray-100 rounded transition"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-8 py-0.5 bg-[#EDEDED] text-center font-mono font-bold text-gray-900 rounded text-xs">
                              {item.orderQty}
                            </span>
                            <button 
                              onClick={() => updateOrderAmount(item.id, 1)} 
                              className="p-1 text-gray-700 hover:bg-gray-100 rounded transition"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}

            {driveFileUrl && (
              <a
                href={driveFileUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-xl flex items-center justify-center space-x-1.5 font-bold hover:bg-emerald-100 transition text-[11px]"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                <span>Open Saved Order in Drive</span>
                <ExternalLink className="w-3 h-3 text-emerald-600 ml-1" />
              </a>
            )}
          </div>
        </div>

      ) : (

        /* TAB 1: STOCKTAKE COUNTING MATRIX */
        <div className="flex-1 flex flex-col overflow-hidden pb-20">
          <div className="px-5 pt-3 pb-1 flex justify-between items-end flex-shrink-0">
            <div>
              <p className="text-gray-500 italic text-[11px] font-serif">Stocktake</p>
              <h1 className="text-base font-bold tracking-tight text-gray-900 mt-0.5 leading-snug">
                Week beginning {weekBeginningStr}
              </h1>
            </div>
            <div className="flex items-center space-x-1.5">
              {masterSheetUrl && (
                <a 
                  href={masterSheetUrl} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="p-1 text-emerald-700 hover:text-black rounded-lg bg-emerald-50 border border-emerald-200 flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5"
                  title="Open Master Sheet in Google Sheets"
                >
                  <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                  <span>Sheet</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                </a>
              )}
              <button onClick={fetchSheetData} className="p-1 text-gray-500 hover:text-black rounded-lg bg-gray-50 border border-gray-100" title="Sync with Google Sheet">
                <RefreshCw className={`w-3.5 h-3.5 ${saving ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {statusMsg && (
            <div className={`mx-5 my-1 p-2 rounded-lg text-xs font-medium flex-shrink-0 ${
              statusMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {statusMsg.text}
            </div>
          )}

          <div className="flex items-center justify-between px-5 py-1.5 flex-shrink-0">
            <div className="flex items-center space-x-2">
              <span className="bg-[#F3F3F3] font-bold px-2.5 py-1 rounded-lg text-[10px] text-gray-800 tracking-wide uppercase">{dayName}</span>
              {modifiedIds.size > 0 && <span className="text-[10px] text-gray-500 font-medium italic">{modifiedIds.size} counted</span>}
            </div>
            <div className="flex space-x-1.5">
              <button onClick={() => { setCounts({}); setModifiedIds(new Set()); }} className="px-2.5 py-1 bg-[#F3F3F3] hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-800 transition">Clear</button>
              <button onClick={handleSaveToSheet} disabled={saving} className="flex items-center space-x-1 px-3 py-1 bg-[#C2F19D] hover:bg-[#b2e88a] rounded-lg text-xs font-semibold text-gray-900 transition">
                <span>{saving ? 'Saving...' : 'Save Counts'}</span>
              </button>
            </div>
          </div>

          <div className="px-5 py-1 flex-shrink-0 space-y-1.5">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="w-full bg-[#EDEDED] py-1.5 pl-3 pr-8 rounded-lg text-xs italic placeholder-gray-500 focus:outline-none"
              />
              {searchQuery ? (
                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-500 hover:text-black">
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">
                  Suppliers {selectedSuppliers.length > 0 && `(${selectedSuppliers.length})`}
                </span>
                {selectedSuppliers.length > 0 && <button onClick={() => setSelectedSuppliers([])} className="text-[9px] text-gray-400 hover:text-black font-semibold">Clear</button>}
              </div>
              <div className="flex items-center space-x-1 overflow-x-auto pb-0.5 scrollbar-none">
                {allSuppliers.map(sup => {
                  const isSelected = selectedSuppliers.includes(sup);
                  return (
                    <button key={sup} onClick={() => toggleSupplier(sup)} className={`px-2 py-0.5 rounded-md text-[10px] font-medium italic whitespace-nowrap transition border ${
                      isSelected ? 'bg-black text-white border-black font-bold' : 'bg-[#EDEDED] text-gray-700 border-transparent hover:bg-gray-200'
                    }`}>
                      {sup}
                    </button>
                  );
                })}
              </div>
            </div>

            {availableAreas.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">
                    Areas {selectedAreas.length > 0 && `(${selectedAreas.length})`}
                  </span>
                  {selectedAreas.length > 0 && <button onClick={() => setSelectedAreas([])} className="text-[9px] text-gray-400 hover:text-black font-semibold">Clear</button>}
                </div>
                <div className="flex items-center space-x-1 overflow-x-auto pb-0.5 scrollbar-none">
                  {availableAreas.map(area => {
                    const isSelected = selectedAreas.includes(area);
                    return (
                      <button key={area} onClick={() => toggleArea(area)} className={`px-2 py-0.5 rounded-md text-[10px] font-medium whitespace-nowrap transition border ${
                        isSelected ? 'bg-black text-white border-black font-bold' : 'bg-[#EDEDED] text-gray-700 border-transparent hover:bg-gray-200'
                      }`}>
                        {area}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-12 px-5 py-1 border-b border-gray-100 text-[11px] font-bold text-gray-900 mt-1 flex-shrink-0">
            <span className="col-span-5">Stock Item</span>
            <span className="col-span-2 text-center">Order</span>
            <span className="col-span-2 text-center">Par</span>
            <span className="col-span-3 text-center">Count</span>
          </div>

          <div className="flex-1 overflow-y-auto px-5 divide-y divide-gray-100">
            {filteredProducts.length === 0 ? (
              <p className="text-center py-8 text-xs text-gray-500">No matching products found.</p>
            ) : (
              filteredProducts.map(product => {
                const currentCount = counts[product.id] ?? 0;
                const orderAmt = orderOverrides[product.id] ?? Math.max(0, (product.par ?? 0) - currentCount);
                const isModified = modifiedIds.has(product.id);

                return (
                  <div key={product.id} className={`grid grid-cols-12 items-center py-2 text-xs transition-colors ${isModified ? 'bg-[#FAFCF8] border-l-2 border-black pl-2 -ml-2 pr-1' : ''}`}>
                    <div className="col-span-5 pr-1">
                      <span className={`leading-tight text-[11px] block ${isModified ? 'font-bold text-black' : 'font-medium text-gray-800'}`}>
                        {product.name}
                      </span>
                      <div className="flex items-center space-x-1 mt-0.5">
                        <span className="font-mono text-[8px] bg-gray-100 text-gray-500 px-1 rounded">{product.id}</span>
                        <span className="text-[9px] text-gray-400 italic">({product.unit})</span>
                      </div>
                    </div>
                    <div className={`col-span-2 text-center text-xs ${isModified && orderAmt > 0 ? 'font-black text-black' : 'font-normal text-gray-400'}`}>
                      {orderAmt}
                    </div>
                    <div className="col-span-2 text-center text-gray-700 font-medium text-xs">
                      {product.par}
                    </div>
                    <div className="col-span-3 flex items-center justify-end space-x-1">
                      <button onClick={() => updateCount(product.id, -1)} className="p-0.5 text-gray-800 hover:bg-gray-100 rounded transition">
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className={`w-6 py-0.5 text-center rounded text-xs transition-colors font-mono ${isModified ? 'bg-[#D9EECD] text-black font-bold' : 'bg-[#EDEDED] text-gray-600 font-medium'}`}>
                        {currentCount}
                      </span>
                      <button onClick={() => updateCount(product.id, 1)} className="p-0.5 text-gray-800 hover:bg-gray-100 rounded transition">
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Floating Bottom Nav */}
      <nav className="fixed bottom-2 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[390px] z-30 rounded-2xl bg-[#111111]/95 backdrop-blur-md text-white py-2 px-3 flex justify-around items-center text-xs font-semibold shadow-2xl border border-white/10 select-none pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
        <button 
          onClick={() => { setView('main'); setActiveTab('Stocktake'); }} 
          className={`flex-1 py-1 text-center rounded-xl transition ${activeTab === 'Stocktake' && view === 'main' ? 'text-white bg-white/15 font-bold shadow-inner' : 'text-gray-400 hover:text-white'}`}
        >
          Stocktake
        </button>
        <button 
          onClick={() => { setView('main'); setActiveTab('Orders'); }} 
          className={`flex-1 py-1 text-center rounded-xl transition ${activeTab === 'Orders' && view === 'main' ? 'text-white bg-white/15 font-bold shadow-inner' : 'text-gray-400 hover:text-white'}`}
        >
          Orders
        </button>
      </nav>
    </div>
  );
}