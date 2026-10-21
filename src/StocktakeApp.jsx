import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Plus, 
  Minus, 
  RefreshCw, 
  X, 
  Lock, 
  Unlock, 
  Copy, 
  Check, 
  Download, 
  ClipboardList, 
  Trash2, 
  Send, 
  FileText,
  ArrowLeft
} from 'lucide-react';

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

export default function StocktakeApp({ onBackToHub, onLogout }) {
  // Tabs: 'Stocktake', 'Orders', 'Goods'
  const [activeTab, setActiveTab] = useState('Stocktake');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Stocktake Filters
  const [selectedSuppliers, setSelectedSuppliers] = useState([]);
  const [selectedAreas, setSelectedAreas] = useState([]);

  const [view, setView] = useState('main'); // 'main' or 'settings'
  const [products, setProducts] = useState([]);
  const [counts, setCounts] = useState({});
  const [orderOverrides, setOrderOverrides] = useState({});
  const [copyFeedback, setCopyFeedback] = useState(null);

  // Session Tracking: SKU IDs modified in current login session
  const [modifiedIds, setModifiedIds] = useState(new Set());

  // =========================================================================
  // GOODS RECEIVED INVOICE INTAKE FORM STATE
  // =========================================================================
  const [invoiceSupplier, setInvoiceSupplier] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [invoiceNotes, setInvoiceNotes] = useState('');
  
  // Active Line Item Input Builder
  const [itemSearch, setItemSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [customName, setCustomName] = useState('');
  const [customUnit, setCustomUnit] = useState('case');
  const [qtyDelivered, setQtyDelivered] = useState('');
  
  // Math & Price Fields (20% VAT)
  const [unitEx, setUnitEx] = useState('');
  const [unitInc, setUnitInc] = useState('');
  const [totalEx, setTotalEx] = useState('');
  const [totalInc, setTotalInc] = useState('');
  const [isMathLocked, setIsMathLocked] = useState(true);

  // Delivery report item queue
  const [receivedItems, setReceivedItems] = useState([]);
  const [submittingReport, setSubmittingReport] = useState(false);

  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  // Animated Startup Loader
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingText, setLoadingText] = useState('Initializing settings...');

  const { dayName, weekBeginningStr, fullDateStr } = useMemo(() => getFormattedDates(), []);

  // Fetch sheet catalog
  const fetchSheetData = async () => {
    setLoading(true);
    setLoadingProgress(20);
    setLoadingText('Connecting to Google Sheets...');
    try {
      const res = await fetch(HARDWIRED_SCRIPT_URL);
      const json = await res.json();
      
      setLoadingProgress(70);
      setLoadingText('Loading catalog & par levels...');

      let fetched = [];
      if (json.status === "success" && Array.isArray(json.data)) {
        fetched = json.data;
      } else if (Array.isArray(json)) {
        fetched = json;
      }
      setProducts(fetched);

      const initialCounts = {};
      const initialOrders = {};
      fetched.forEach(p => {
        initialCounts[p.id] = p.count ?? 0;
        initialOrders[p.id] = Math.max(0, (p.par ?? 0) - (p.count ?? 0));
      });
      setCounts(initialCounts);
      setOrderOverrides(initialOrders);

      setLoadingProgress(100);
      setTimeout(() => setLoading(false), 200);
    } catch (err) {
      console.error("Failed to load sheet data:", err);
      setLoadingProgress(100);
      setLoadingText('Ready (Offline mode)');
      setTimeout(() => setLoading(false), 400);
    }
  };

  useEffect(() => {
    fetchSheetData();
  }, []);

  // Stock count modifier
  const updateCount = (id, delta) => {
    setModifiedIds(prev => new Set(prev).add(id));

    setCounts(prev => {
      const newCount = Math.max(0, (prev[id] ?? 0) + delta);
      const prod = products.find(p => p.id === id);
      const par = prod ? (prod.par ?? 0) : 0;
      
      setOrderOverrides(orderPrev => ({
        ...orderPrev,
        [id]: Math.max(0, par - newCount)
      }));

      return { ...prev, [id]: newCount };
    });
  };

  const updateOrderAmount = (id, delta) => {
    setOrderOverrides(prev => ({
      ...prev,
      [id]: Math.max(0, (prev[id] ?? 0) + delta)
    }));
  };

  // Save stock counts back to master Google Sheet
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

  // Multi-select filters
  const toggleSupplier = (sup) => {
    setSelectedSuppliers(prev => 
      prev.includes(sup) ? prev.filter(s => s !== sup) : [...prev, sup]
    );
  };

  const toggleArea = (area) => {
    setSelectedAreas(prev => 
      prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area]
    );
  };

  const allSuppliers = useMemo(() => {
    return Array.from(new Set(products.map(p => p.supplier))).filter(Boolean);
  }, [products]);

  const availableAreas = useMemo(() => {
    const relevantProducts = selectedSuppliers.length > 0
      ? products.filter(p => selectedSuppliers.includes(p.supplier))
      : products;

    return Array.from(new Set(relevantProducts.map(p => p.area || 'Main Bar'))).filter(Boolean);
  }, [products, selectedSuppliers]);

  useEffect(() => {
    setSelectedAreas(prev => prev.filter(a => availableAreas.includes(a)));
  }, [availableAreas]);

  // Stocktake filtered items
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const itemArea = p.area || 'Main Bar';
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            p.id.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesSupplier = selectedSuppliers.length > 0
        ? selectedSuppliers.includes(p.supplier)
        : true;

      const matchesArea = selectedAreas.length > 0
        ? selectedAreas.includes(itemArea)
        : true;

      return matchesSearch && matchesSupplier && matchesArea;
    });
  }, [products, searchQuery, selectedSuppliers, selectedAreas]);

  // Session-only orders
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

  // =========================================================================
  // GOODS RECEIVED 20% VAT MATH & CATALOG LOOKUP
  // =========================================================================
  const productSearchResults = useMemo(() => {
    if (!itemSearch.trim()) return [];
    return products.filter(p => 
      p.name.toLowerCase().includes(itemSearch.toLowerCase()) || 
      p.id.toLowerCase().includes(itemSearch.toLowerCase())
    ).slice(0, 6);
  }, [products, itemSearch]);

  const handleSelectProduct = (prod) => {
    setSelectedProduct(prod);
    setCustomName(prod.name);
    setCustomUnit(prod.unit);
    setItemSearch(prod.name);
    if (!invoiceSupplier && prod.supplier) {
      setInvoiceSupplier(prod.supplier);
    }
  };

  const handlePriceChange = (field, val) => {
    const num = parseFloat(val);
    const qty = parseFloat(qtyDelivered) || 1;

    if (!isMathLocked) {
      if (field === 'totalInc') setTotalInc(val);
      if (field === 'totalEx') setTotalEx(val);
      if (field === 'unitInc') setUnitInc(val);
      if (field === 'unitEx') setUnitEx(val);
      return;
    }

    if (isNaN(num)) {
      setTotalInc('');
      setTotalEx('');
      setUnitInc('');
      setUnitEx('');
      return;
    }

    if (field === 'totalInc') {
      const tInc = num;
      const tEx = tInc / 1.20;
      setTotalInc(val);
      setTotalEx(tEx.toFixed(2));
      setUnitInc((tInc / qty).toFixed(2));
      setUnitEx((tEx / qty).toFixed(2));
    } else if (field === 'totalEx') {
      const tEx = num;
      const tInc = tEx * 1.20;
      setTotalEx(val);
      setTotalInc(tInc.toFixed(2));
      setUnitEx((tEx / qty).toFixed(2));
      setUnitInc((tInc / qty).toFixed(2));
    } else if (field === 'unitEx') {
      const uEx = num;
      const uInc = uEx * 1.20;
      const tEx = uEx * qty;
      const tInc = tEx * 1.20;
      setUnitEx(val);
      setUnitInc(uInc.toFixed(2));
      setTotalEx(tEx.toFixed(2));
      setTotalInc(tInc.toFixed(2));
    } else if (field === 'unitInc') {
      const uInc = num;
      const uEx = uInc / 1.20;
      const tInc = uInc * qty;
      const tEx = tInc / 1.20;
      setUnitInc(val);
      setUnitEx(uEx.toFixed(2));
      setTotalInc(tInc.toFixed(2));
      setTotalEx(tEx.toFixed(2));
    }
  };

  const handleQtyChange = (val) => {
    setQtyDelivered(val);
    const qty = parseFloat(val);
    if (isMathLocked && qty > 0) {
      if (totalInc) {
        const tInc = parseFloat(totalInc);
        const tEx = tInc / 1.20;
        setUnitInc((tInc / qty).toFixed(2));
        setUnitEx((tEx / qty).toFixed(2));
      } else if (unitEx) {
        const uEx = parseFloat(unitEx);
        const tEx = uEx * qty;
        setTotalEx(tEx.toFixed(2));
        setTotalInc((tEx * 1.20).toFixed(2));
      }
    }
  };

  const handleAddReceivedItem = (e) => {
    e.preventDefault();
    const finalName = selectedProduct ? selectedProduct.name : customName.trim();
    if (!finalName || !qtyDelivered) return;

    const newItem = {
      id: selectedProduct ? selectedProduct.id : `CUSTOM-${Date.now()}`,
      sku: selectedProduct ? selectedProduct.id : 'CUSTOM',
      name: finalName,
      supplier: invoiceSupplier || (selectedProduct ? selectedProduct.supplier : 'General'),
      unit: customUnit || (selectedProduct ? selectedProduct.unit : 'unit'),
      qty: parseFloat(qtyDelivered) || 1,
      unitEx: parseFloat(unitEx) || 0,
      unitInc: parseFloat(unitInc) || 0,
      totalEx: parseFloat(totalEx) || 0,
      totalInc: parseFloat(totalInc) || 0,
    };

    setReceivedItems(prev => [...prev, newItem]);

    setSelectedProduct(null);
    setItemSearch('');
    setCustomName('');
    setQtyDelivered('');
    setUnitEx('');
    setUnitInc('');
    setTotalEx('');
    setTotalInc('');
  };

  const handleRemoveReceivedItem = (index) => {
    setReceivedItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitInvoiceReport = async () => {
    if (receivedItems.length === 0) return;
    setSubmittingReport(true);
    setStatusMsg(null);

    const payload = {
      action: "goods_received_report",
      invoiceRef,
      supplier: invoiceSupplier,
      deliveryDate,
      notes: invoiceNotes,
      items: receivedItems
    };

    try {
      await fetch(HARDWIRED_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'no-cors'
      });

      setStatusMsg({ type: 'success', text: `Report for ${invoiceSupplier || 'Supplier'} saved to Google Drive!` });
      setReceivedItems([]);
      setInvoiceRef('');
      setInvoiceNotes('');
    } catch (err) {
      console.error("Failed to post report:", err);
      setStatusMsg({ type: 'error', text: 'Network error submitting delivery report.' });
    } finally {
      setSubmittingReport(false);
    }
  };

  const handleExportDeliveryDoc = () => {
    let content = `WEST SIDE TAVERN - GOODS RECEIVED INTAKE REPORT\n`;
    content += `Delivery Date: ${deliveryDate}\n`;
    content += `Supplier: ${invoiceSupplier || 'All'}\n`;
    content += `Invoice / Ref: ${invoiceRef || 'N/A'}\n`;
    content += `Notes: ${invoiceNotes || 'None'}\n`;
    content += `========================================================================\n\n`;
    content += `${"SKU".padEnd(8)} | ${"ITEM".padEnd(26)} | ${"QTY".padEnd(5)} | ${"UNIT".padEnd(6)} | ${"TOT EX".padEnd(9)} | TOT INC (20%)\n`;
    content += `------------------------------------------------------------------------\n`;

    let sumEx = 0;
    let sumInc = 0;

    receivedItems.forEach(item => {
      sumEx += item.totalEx;
      sumInc += item.totalInc;
      content += `${item.sku.padEnd(8)} | ${item.name.padEnd(26).slice(0, 26)} | ${String(item.qty).padEnd(5)} | ${item.unit.padEnd(6)} | £${item.totalEx.toFixed(2).padEnd(8)} | £${item.totalInc.toFixed(2)}\n`;
    });

    content += `------------------------------------------------------------------------\n`;
    content += `TOTALS: Ex VAT: £${sumEx.toFixed(2)} | Inc VAT: £${sumInc.toFixed(2)}\n`;

    const blob = new Blob([content], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `WST_Delivery_${invoiceRef || 'Intake'}_${deliveryDate}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /* -------------------------------------------------------------------------- */
  /* LOADING SCREEN                                                             */
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
        <p className="text-xs font-mono text-gray-500 italic tracking-tight">{loadingText}</p>
      </div>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* MAIN APPLICATION INTERFACE                                                 */
  /* -------------------------------------------------------------------------- */
  return (
    <div className="flex flex-col h-screen w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 overflow-x-hidden">
      
      {/* Top Header with Hub Navigation */}
      <header className="flex items-center justify-between px-5 pt-6 pb-2 border-b border-gray-50 flex-shrink-0">
        <div className="flex items-center space-x-2">
          {onBackToHub && (
            <button 
              onClick={onBackToHub} 
              className="mr-0.5 p-1 -ml-1 text-gray-500 hover:text-black rounded-lg transition"
              title="Return to Portal Hub"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <AppLogo className="w-6 h-6" fallbackTextClass="font-serif text-2xl font-bold tracking-tighter" />
          <span className="font-semibold text-base tracking-tight">West Side Tavern</span>
        </div>
        <div className="flex items-center space-x-4 text-sm font-medium">
          {onBackToHub ? (
            <button 
              onClick={onBackToHub} 
              className="text-gray-900 hover:text-black font-semibold"
            >
              Hub
            </button>
          ) : (
            <button 
              onClick={onLogout} 
              className="text-gray-900 hover:text-black"
            >
              Logout
            </button>
          )}
          <button 
            onClick={() => setView(view === 'settings' ? 'main' : 'settings')}
            className={`transition ${view === 'settings' ? 'font-bold underline' : 'text-gray-900 hover:text-black'}`}
          >
            Settings
          </button>
        </div>
      </header>

      {/* Main Switcher */}
      {view === 'settings' ? (
        
        /* SETTINGS VIEW */
        <div className="flex-1 flex flex-col px-5 pt-4 pb-2 overflow-y-auto">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div>
              <p className="text-gray-500 italic text-xs font-serif">Preferences</p>
              <h1 className="text-2xl font-extrabold tracking-tight mt-0.5">Settings</h1>
            </div>
            <button 
              onClick={() => setView('main')}
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

            <div className="pt-2">
              <button
                onClick={() => setView('main')}
                className="w-full py-3 bg-[#C2F19D] text-sm font-semibold rounded-lg text-gray-900 hover:bg-[#b2e88a] transition"
              >
                Back to App
              </button>
            </div>
          </div>
        </div>

      ) : activeTab === 'Orders' ? (

        /* ====================================================================== */
        /* ORDERS MODULE                                                          */
        /* ====================================================================== */
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-5 pt-4 pb-2 border-b border-gray-100 flex-shrink-0">
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="flex items-center space-x-2">
                  <p className="text-gray-500 italic text-xs font-serif">Session Orders</p>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                    {modifiedIds.size} counted
                  </span>
                </div>
                <h1 className="text-2xl font-black tracking-tight text-gray-900">Orders by Supplier</h1>
              </div>
              <div className="flex space-x-1.5">
                <button
                  onClick={handleCopyAll}
                  disabled={Object.keys(ordersBySupplier).length === 0}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-[#F3F3F3] hover:bg-gray-200 disabled:opacity-40 rounded-lg text-xs font-bold text-gray-900 transition"
                  title="Copy All Orders"
                >
                  {copyFeedback === 'ALL' ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copyFeedback === 'ALL' ? 'Copied' : 'Copy All'}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-5">
            {modifiedIds.size === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-semibold text-gray-700">No items counted yet this session</p>
                <p className="text-xs text-gray-400 mt-1">Tap Stocktake to adjust counts; any items needing restock will appear here.</p>
              </div>
            ) : Object.keys(ordersBySupplier).length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Check className="w-10 h-10 mx-auto mb-2 text-green-600 opacity-60" />
                <p className="text-sm font-semibold text-gray-800">All counted items are at or above par!</p>
                <p className="text-xs text-gray-400 mt-1">None of the {modifiedIds.size} items modified this session need ordering.</p>
              </div>
            ) : (
              Object.keys(ordersBySupplier).map(supplier => {
                const items = ordersBySupplier[supplier];
                const totalUnits = items.reduce((sum, item) => sum + item.orderQty, 0);

                return (
                  <div key={supplier} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                    <div className="bg-[#F8F8F8] px-4 py-2 flex items-center justify-between border-b border-gray-200">
                      <div>
                        <span className="text-sm font-black text-gray-900 uppercase tracking-wide">{supplier}</span>
                        <span className="text-xs text-gray-500 font-mono ml-2">({totalUnits} units)</span>
                      </div>
                      <button
                        onClick={() => handleCopySupplier(supplier, items)}
                        className="flex items-center space-x-1 px-2.5 py-1 bg-white border border-gray-200 rounded-md text-[11px] font-bold text-gray-800 hover:bg-gray-50 transition"
                      >
                        {copyFeedback === supplier ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                        <span>{copyFeedback === supplier ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>

                    <div className="divide-y divide-gray-100">
                      {items.map(item => (
                        <div key={item.id} className="grid grid-cols-12 items-center px-4 py-2.5 text-xs">
                          <div className="col-span-7 pr-2">
                            <span className="font-bold text-gray-900 block leading-tight">{item.name}</span>
                            <span className="text-[10px] text-gray-400 italic font-mono">
                              {item.id} | Par: {item.par} | Count: {counts[item.id] ?? 0} ({item.unit})
                            </span>
                          </div>

                          <div className="col-span-5 flex items-center justify-end space-x-1.5">
                            <button
                              onClick={() => updateOrderAmount(item.id, -1)}
                              className="p-1 text-gray-700 hover:bg-gray-100 rounded transition"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            
                            <span className="w-9 py-1 bg-[#EDEDED] text-center font-bold text-gray-900 rounded text-xs">
                              {item.orderQty}
                            </span>

                            <button
                              onClick={() => updateOrderAmount(item.id, 1)}
                              className="p-1 text-gray-700 hover:bg-gray-100 rounded transition"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      ) : activeTab === 'Goods' ? (

        /* ====================================================================== */
        /* GOODS RECEIVED INVOICE INTAKE REPORT                                   */
        /* ====================================================================== */
        <div className="flex-1 flex flex-col overflow-y-auto px-5 py-3 space-y-4">
          
          <div className="border-b border-gray-100 pb-3">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-500 italic text-xs font-serif">Delivery Check-In</p>
                <h1 className="text-xl font-black tracking-tight text-gray-900">Goods Received Report</h1>
              </div>
              <button
                onClick={() => setIsMathLocked(!isMathLocked)}
                className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-bold border transition ${
                  isMathLocked 
                    ? 'bg-green-50 text-green-800 border-green-200' 
                    : 'bg-amber-50 text-amber-800 border-amber-300'
                }`}
                title="Lock / Unlock Automatic VAT & Unit Math"
              >
                {isMathLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                <span>{isMathLocked ? 'VAT Locked (20%)' : 'Unlocked (Manual)'}</span>
              </button>
            </div>

            {/* Supplier, Invoice Ref & Delivery Date */}
            <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Supplier</label>
                <input
                  type="text"
                  placeholder="e.g. Tennents"
                  value={invoiceSupplier}
                  onChange={(e) => setInvoiceSupplier(e.target.value)}
                  className="w-full bg-[#EDEDED] py-2 px-3 rounded-lg font-semibold text-gray-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Invoice / Ref #</label>
                <input
                  type="text"
                  placeholder="e.g. INV-1094"
                  value={invoiceRef}
                  onChange={(e) => setInvoiceRef(e.target.value)}
                  className="w-full bg-[#EDEDED] py-2 px-3 rounded-lg font-semibold text-gray-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Delivery Date</label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="w-full bg-[#EDEDED] py-2 px-2.5 rounded-lg font-semibold text-gray-900 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Interactive Line-Item Builder */}
          <form onSubmit={handleAddReceivedItem} className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 space-y-3 text-xs">
            <span className="block font-bold text-gray-900 uppercase tracking-wider text-[11px]">
              Add Invoice Line Item
            </span>

            {/* Catalog Search & Dropdown Picker */}
            <div className="relative">
              <input
                type="text"
                value={itemSearch}
                onChange={(e) => {
                  setItemSearch(e.target.value);
                  setSelectedProduct(null);
                  setCustomName(e.target.value);
                }}
                placeholder="Type & search catalog (or enter custom item)..."
                className="w-full bg-white border border-gray-300 py-2 pl-3 pr-8 rounded-lg text-xs italic focus:outline-none"
              />
              {itemSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setItemSearch('');
                    setSelectedProduct(null);
                    setCustomName('');
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Autocomplete Dropdown List */}
              {productSearchResults.length > 0 && !selectedProduct && (
                <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg divide-y divide-gray-100 max-h-44 overflow-y-auto">
                  {productSearchResults.map(prod => (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => handleSelectProduct(prod)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 flex items-center justify-between"
                    >
                      <div>
                        <span className="font-bold text-gray-900">{prod.name}</span>
                        <span className="text-[10px] text-gray-400 font-mono ml-2">[{prod.id}]</span>
                      </div>
                      <span className="text-[10px] text-gray-500 italic">{prod.supplier}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Delivered Amount & Custom Unit */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-1">Delivered Qty *</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="e.g. 5"
                  value={qtyDelivered}
                  onChange={(e) => handleQtyChange(e.target.value)}
                  className="w-full bg-white border border-gray-300 py-1.5 px-3 rounded-lg text-xs font-bold text-black focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-1">Unit</label>
                <input
                  type="text"
                  placeholder="case / bottle / keg"
                  value={customUnit}
                  onChange={(e) => setCustomUnit(e.target.value)}
                  className="w-full bg-white border border-gray-300 py-1.5 px-3 rounded-lg text-xs focus:outline-none"
                />
              </div>
            </div>

            {/* Smart 20% VAT Pricing Row */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-0.5">Total (Inc VAT £)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={totalInc}
                  onChange={(e) => handlePriceChange('totalInc', e.target.value)}
                  className="w-full bg-white border border-gray-300 py-1.5 px-2.5 rounded-lg text-xs font-bold text-black focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-0.5">Total (Ex VAT £)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={totalEx}
                  onChange={(e) => handlePriceChange('totalEx', e.target.value)}
                  className="w-full bg-white border border-gray-300 py-1.5 px-2.5 rounded-lg text-xs font-semibold text-gray-700 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-0.5">Unit (Inc VAT £)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={unitInc}
                  onChange={(e) => handlePriceChange('unitInc', e.target.value)}
                  className="w-full bg-white border border-gray-300 py-1.5 px-2.5 rounded-lg text-xs text-gray-700 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-0.5">Unit (Ex VAT £)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={unitEx}
                  onChange={(e) => handlePriceChange('unitEx', e.target.value)}
                  className="w-full bg-white border border-gray-300 py-1.5 px-2.5 rounded-lg text-xs text-gray-700 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!qtyDelivered || (!selectedProduct && !customName.trim())}
              className="w-full py-2 bg-black text-white hover:bg-gray-800 disabled:opacity-40 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add to Delivery Queue</span>
            </button>
          </form>

          {/* Current Queue Table */}
          <div className="space-y-2">
            <div className="flex justify-between items-center px-1">
              <span className="text-[11px] font-bold uppercase text-gray-400">
                Delivery Queue ({receivedItems.length} items)
              </span>
              {receivedItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setReceivedItems([])}
                  className="text-[10px] text-red-500 hover:underline font-semibold"
                >
                  Clear Queue
                </button>
              )}
            </div>

            {receivedItems.length === 0 ? (
              <div className="border border-dashed border-gray-200 rounded-xl py-6 text-center text-xs text-gray-400">
                No delivery items added yet. Search above to begin check-in.
              </div>
            ) : (
              <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100 bg-white">
                {receivedItems.map((item, idx) => (
                  <div key={idx} className="p-3 flex items-center justify-between text-xs">
                    <div className="pr-2">
                      <span className="font-bold text-gray-900 block leading-tight">{item.name}</span>
                      <div className="flex items-center space-x-2 text-[10px] text-gray-400 font-mono mt-0.5">
                        <span>{item.qty} {item.unit}</span>
                        <span>•</span>
                        <span>Tot Ex: £{item.totalEx.toFixed(2)}</span>
                        <span>•</span>
                        <span className="font-bold text-gray-800">Tot Inc: £{item.totalInc.toFixed(2)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveReceivedItem(idx)}
                      className="p-1 text-gray-400 hover:text-red-500 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Delivery Notes */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-gray-700">Delivery Notes & Discrepancies</label>
            <textarea
              rows={2}
              placeholder="e.g. 1 broken bottle credited, driver signed d/n..."
              value={invoiceNotes}
              onChange={(e) => setInvoiceNotes(e.target.value)}
              className="w-full bg-[#EDEDED] p-2.5 rounded-xl text-xs focus:outline-none resize-none"
            />
          </div>

          {/* Action Submission Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1 pb-4">
            <button
              type="button"
              disabled={receivedItems.length === 0}
              onClick={handleExportDeliveryDoc}
              className="py-2.5 bg-[#F3F3F3] hover:bg-gray-200 disabled:opacity-40 rounded-xl text-xs font-bold text-gray-900 transition flex items-center justify-center space-x-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Export Doc</span>
            </button>
            <button
              type="button"
              disabled={receivedItems.length === 0 || submittingReport}
              onClick={handleSubmitInvoiceReport}
              className="py-2.5 bg-[#C2F19D] hover:bg-[#b2e88a] disabled:opacity-40 rounded-xl text-xs font-black text-gray-900 transition flex items-center justify-center space-x-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{submittingReport ? 'Submitting...' : 'Submit Report'}</span>
            </button>
          </div>

        </div>

      ) : (

        /* ====================================================================== */
        /* STOCKTAKE MODULE                                                       */
        /* ====================================================================== */
        <div className="flex-1 flex flex-col overflow-hidden">
          
          <div className="px-5 pt-3 pb-1 flex justify-between items-end flex-shrink-0">
            <div>
              <p className="text-gray-500 italic text-xs font-serif">Stocktake</p>
              <h1 className="text-lg font-bold tracking-tight text-gray-900 mt-0.5 leading-snug">
                Week beginning {weekBeginningStr}
              </h1>
            </div>
            <button 
              onClick={fetchSheetData} 
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

          {/* Controls Bar with Session Count Counter */}
          <div className="flex items-center justify-between px-5 py-2 flex-shrink-0">
            <div className="flex items-center space-x-2">
              <span className="bg-[#F3F3F3] font-bold px-3 py-1.5 rounded-lg text-xs text-gray-800 tracking-wide uppercase">
                {dayName}
              </span>
              {modifiedIds.size > 0 && (
                <span className="text-[11px] text-gray-500 font-medium italic">
                  {modifiedIds.size} counted
                </span>
              )}
            </div>

            <div className="flex space-x-2">
              <button 
                onClick={() => {
                  setCounts({});
                  setModifiedIds(new Set());
                }}
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

          {/* Dynamic Search Bar & Multi-Select Filter Chips */}
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

            {/* Suppliers */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                  Suppliers {selectedSuppliers.length > 0 && `(${selectedSuppliers.length} selected)`}
                </span>
                {selectedSuppliers.length > 0 && (
                  <button 
                    onClick={() => setSelectedSuppliers([])}
                    className="text-[10px] text-gray-400 hover:text-black font-semibold"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
                {allSuppliers.map(sup => {
                  const isSelected = selectedSuppliers.includes(sup);
                  return (
                    <button
                      key={sup}
                      onClick={() => toggleSupplier(sup)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium italic whitespace-nowrap transition border ${
                        isSelected
                          ? 'bg-black text-white border-black font-bold' 
                          : 'bg-[#EDEDED] text-gray-700 border-transparent hover:bg-gray-200'
                      }`}
                    >
                      {sup}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Areas */}
            {availableAreas.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                    Areas {selectedAreas.length > 0 && `(${selectedAreas.length} selected)`}
                  </span>
                  {selectedAreas.length > 0 && (
                    <button 
                      onClick={() => setSelectedAreas([])}
                      className="text-[10px] text-gray-400 hover:text-black font-semibold"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
                  {availableAreas.map(area => {
                    const isSelected = selectedAreas.includes(area);
                    return (
                      <button
                        key={area}
                        onClick={() => toggleArea(area)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition border ${
                          isSelected
                            ? 'bg-black text-white border-black font-bold' 
                            : 'bg-[#EDEDED] text-gray-700 border-transparent hover:bg-gray-200'
                        }`}
                      >
                        {area}
                      </button>
                    );
                  })}
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
                const orderAmt = orderOverrides[product.id] ?? Math.max(0, product.par - currentCount);
                const isModified = modifiedIds.has(product.id);

                return (
                  <div 
                    key={product.id} 
                    className={`grid grid-cols-12 items-center py-2.5 text-sm transition-colors ${
                      isModified ? 'bg-[#FAFCF8] border-l-2 border-black pl-2 -ml-2 pr-1' : ''
                    }`}
                  >
                    <div className="col-span-5 pr-1">
                      <span className={`leading-tight text-xs block ${isModified ? 'font-bold text-black' : 'font-medium text-gray-800'}`}>
                        {product.name}
                      </span>
                      <div className="flex items-center space-x-1.5 mt-0.5">
                        <span className="font-mono text-[9px] bg-gray-100 text-gray-500 px-1 rounded">{product.id}</span>
                        <span className="text-[10px] text-gray-400 italic">({product.unit})</span>
                      </div>
                    </div>

                    <div className={`col-span-2 text-center text-xs ${isModified && orderAmt > 0 ? 'font-black text-black' : 'font-normal text-gray-400'}`}>
                      {orderAmt}
                    </div>

                    <div className="col-span-2 text-center text-gray-700 font-medium text-xs">
                      {product.par}
                    </div>

                    <div className="col-span-3 flex items-center justify-end space-x-1.5">
                      <button 
                        onClick={() => updateCount(product.id, -1)}
                        className="p-1 text-gray-800 hover:bg-gray-100 rounded transition"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      
                      <span className={`w-7 py-1 text-center rounded text-xs transition-colors ${
                        isModified ? 'bg-[#D9EECD] text-black font-bold' : 'bg-[#EDEDED] text-gray-600 font-medium'
                      }`}>
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
        <button 
          onClick={() => { setView('main'); setActiveTab('Stocktake'); }}
          className={activeTab === 'Stocktake' && view === 'main' ? 'text-white border-b-2 border-white pb-0.5' : 'text-gray-400 hover:text-white'}
        >
          Stocktake
        </button>
        <button 
          onClick={() => { setView('main'); setActiveTab('Orders'); }}
          className={activeTab === 'Orders' && view === 'main' ? 'text-white border-b-2 border-white pb-0.5' : 'text-gray-400 hover:text-white'}
        >
          Orders
        </button>
        <button 
          onClick={() => { setView('main'); setActiveTab('Goods'); }}
          className={activeTab === 'Goods' && view === 'main' ? 'text-white border-b-2 border-white pb-0.5' : 'text-gray-400 hover:text-white'}
        >
          Goods Received
        </button>
      </footer>
    </div>
  );
}