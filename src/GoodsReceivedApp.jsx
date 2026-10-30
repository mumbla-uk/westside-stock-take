import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  X, 
  Lock, 
  Unlock, 
  Send, 
  FileText,
  Calendar,
  Search,
  Edit3,
  Save,
  CheckCircle2,
  RefreshCw,
  FolderOpen,
  PieChart,
  Receipt,
  Eye,
  PlusCircle
} from 'lucide-react';
import { useTwoFingerSwipe } from './useTwoFingerSwipe';
import { supabase, localDb, DEFAULT_VENUE_ID } from './lib/db';
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

function parseItems(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export default function GoodsReceivedApp({ currentUser, onBackToHub, onLogout }) {
  const [activeTab, setActiveTab] = useState('intake'); // 'intake' | 'reports'

  // Master Catalog Products
  const [products, setProducts] = useState(() => {
    try {
      const cached = localStorage.getItem('wst_catalog_cache');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  // Current Intake Session State
  const [invoiceSupplier, setInvoiceSupplier] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [invoiceNotes, setInvoiceNotes] = useState('');

  const [itemSearch, setItemSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [customName, setCustomName] = useState('');
  const [customUnit, setCustomUnit] = useState('case');
  const [qtyDelivered, setQtyDelivered] = useState('');

  const [unitEx, setUnitEx] = useState('');
  const [unitInc, setUnitInc] = useState('');
  const [totalEx, setTotalEx] = useState('');
  const [totalInc, setTotalInc] = useState('');
  const [isMathLocked, setIsMathLocked] = useState(true);

  const [receivedItems, setReceivedItems] = useState([]);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  // Past Reports State
  const [pastReports, setPastReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [reportSearchQuery, setReportSearchQuery] = useState('');
  
  // Selected Report Modal (View vs Edit Mode)
  const [selectedReport, setSelectedReport] = useState(null);
  const [isEditingReport, setIsEditingReport] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Add Item to Existing Report Drawer Sub-State
  const [showAddLineToReport, setShowAddLineToReport] = useState(false);
  const [editLineSearch, setEditLineSearch] = useState('');
  const [editLineProduct, setEditLineProduct] = useState(null);
  const [editLineName, setEditLineName] = useState('');
  const [editLineUnit, setEditLineUnit] = useState('case');
  const [editLineQty, setEditLineQty] = useState('1');
  const [editLineUnitEx, setEditLineUnitEx] = useState('');

  const swipeHandlers = useTwoFingerSwipe({
    disabled: Boolean(selectedReport),
    onSwipeRight: () => {
      if (onBackToHub) onBackToHub();
    }
  });

  const fetchCatalog = async () => {
    try {
      if (navigator.onLine) {
        const { data } = await supabase
          .from('catalog_items')
          .select('*')
          .eq('venue_id', DEFAULT_VENUE_ID);
        if (data && data.length > 0) {
          setProducts(data);
          localStorage.setItem('wst_catalog_cache', JSON.stringify(data));
        }
      } else if (localDb?.cached_catalog) {
        const offline = await localDb.cached_catalog.toArray();
        if (offline.length > 0) setProducts(offline);
      }
    } catch (err) {
      console.warn("Could not sync catalog in GoodsReceivedApp:", err);
    }
  };

  const fetchPastReports = async () => {
    setLoadingReports(true);
    try {
      const { data, error } = await supabase
        .from('goods_received')
        .select('*')
        .order('delivery_date', { ascending: false })
        .limit(60);

      if (error) throw error;
      
      const normalized = (data || []).map(r => ({
        ...r,
        items: parseItems(r.items)
      }));
      setPastReports(normalized);
    } catch (err) {
      console.warn("Could not fetch past delivery reports:", err);
      setPastReports([]);
    } finally {
      setLoadingReports(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
    fetchPastReports();
  }, []);

  const productSearchResults = useMemo(() => {
    if (!itemSearch.trim() || selectedProduct) return [];
    const q = itemSearch.toLowerCase();
    return products.filter(p => 
      (p.name && p.name.toLowerCase().includes(q)) || 
      (p.id && String(p.id).toLowerCase().includes(q))
    ).slice(0, 6);
  }, [products, itemSearch, selectedProduct]);

  // Search results for adding to an existing report
  const editLineSearchResults = useMemo(() => {
    if (!editLineSearch.trim() || editLineProduct) return [];
    const q = editLineSearch.toLowerCase();
    return products.filter(p => 
      (p.name && p.name.toLowerCase().includes(q)) || 
      (p.id && String(p.id).toLowerCase().includes(q))
    ).slice(0, 5);
  }, [products, editLineSearch, editLineProduct]);

  const handleSelectProduct = (prod) => {
    setSelectedProduct(prod);
    setCustomName(prod.name || '');
    setCustomUnit(prod.order_unit || prod.unit || 'unit');
    setItemSearch(prod.name || '');
    if (!invoiceSupplier && prod.supplier) {
      setInvoiceSupplier(prod.supplier);
    }
    
    const cEx = Number(prod.last_cost_ex_vat || prod.cost_price_ex_vat || prod.cost_price || 0);
    if (cEx > 0) {
      setUnitEx(cEx.toFixed(2));
      setUnitInc((cEx * 1.20).toFixed(2));
      const qty = parseFloat(qtyDelivered) || 0;
      if (qty > 0) {
        setTotalEx((cEx * qty).toFixed(2));
        setTotalInc((cEx * qty * 1.20).toFixed(2));
      } else {
        setTotalEx('');
        setTotalInc('');
      }
    }
  };

  const handleQtyChange = (val) => {
    setQtyDelivered(val);
    const qty = parseFloat(val);

    if (isNaN(qty) || qty <= 0) {
      setTotalEx('');
      setTotalInc('');
      return;
    }

    if (unitEx) {
      const uEx = parseFloat(unitEx) || 0;
      setTotalEx((uEx * qty).toFixed(2));
      setTotalInc((uEx * qty * 1.20).toFixed(2));
    } else if (totalEx) {
      const tEx = parseFloat(totalEx) || 0;
      setUnitEx((tEx / qty).toFixed(2));
      setUnitInc((tEx / qty * 1.20).toFixed(2));
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
      setTotalInc(''); setTotalEx(''); setUnitInc(''); setUnitEx('');
      return;
    }

    if (field === 'unitEx') {
      const uInc = num * 1.20;
      setUnitEx(val);
      setUnitInc(uInc.toFixed(2));
      if (qty > 0) {
        setTotalEx((num * qty).toFixed(2));
        setTotalInc((num * qty * 1.20).toFixed(2));
      }
    } else if (field === 'unitInc') {
      const uEx = num / 1.20;
      setUnitInc(val);
      setUnitEx(uEx.toFixed(2));
      if (qty > 0) {
        setTotalEx((uEx * qty).toFixed(2));
        setTotalInc((num * qty).toFixed(2));
      }
    } else if (field === 'totalEx') {
      const tInc = num * 1.20;
      setTotalEx(val);
      setTotalInc(tInc.toFixed(2));
      if (qty > 0) {
        setUnitEx((num / qty).toFixed(2));
        setUnitInc((tInc / qty).toFixed(2));
      }
    } else if (field === 'totalInc') {
      const tEx = num / 1.20;
      setTotalInc(val);
      setTotalEx(tEx.toFixed(2));
      if (qty > 0) {
        setUnitInc((num / qty).toFixed(2));
        setUnitEx((tEx / qty).toFixed(2));
      }
    }
  };

  const handleAddReceivedItem = (e) => {
    e.preventDefault();
    const finalName = selectedProduct ? selectedProduct.name : customName.trim();
    if (!finalName || !qtyDelivered) return;

    const matchedCat = selectedProduct?.category || 'general';

    setReceivedItems(prev => [...prev, {
      id: selectedProduct ? selectedProduct.id : `CUSTOM-${Date.now()}`,
      sku: selectedProduct ? selectedProduct.id : 'CUSTOM',
      name: finalName,
      category: matchedCat,
      supplier: invoiceSupplier || (selectedProduct ? selectedProduct.supplier : 'General'),
      unit: customUnit || (selectedProduct ? (selectedProduct.order_unit || selectedProduct.unit) : 'unit'),
      qty: parseFloat(qtyDelivered) || 1,
      unitEx: parseFloat(unitEx) || 0,
      unitInc: parseFloat(unitInc) || 0,
      totalEx: parseFloat(totalEx) || 0,
      totalInc: parseFloat(totalInc) || 0
    }]);

    setSelectedProduct(null);
    setItemSearch('');
    setCustomName('');
    setQtyDelivered('');
    setUnitEx('');
    setUnitInc('');
    setTotalEx('');
    setTotalInc('');
  };

  const handleSubmitInvoiceReport = async () => {
    if (receivedItems.length === 0) return;
    setSubmittingReport(true);
    setStatusMsg(null);

    const sup = invoiceSupplier.trim() || 'Supplier';

    try {
      const { error } = await supabase.from('goods_received').insert({
        venue_id: DEFAULT_VENUE_ID,
        supplier: sup,
        delivery_date: deliveryDate,
        invoice_ref: invoiceRef.trim(),
        notes: invoiceNotes.trim(),
        items: receivedItems
      });

      if (error) throw error;

      // Update last invoice cost ex VAT in catalog
      for (const item of receivedItems) {
        if (item.unitEx > 0 && item.id && !String(item.id).startsWith('CUSTOM-')) {
          await supabase
            .from('catalog_items')
            .update({
              last_cost_ex_vat: Number(item.unitEx),
              cost_price_ex_vat: Number(item.unitEx),
              updated_at: new Date().toISOString()
            })
            .eq('id', item.id);
        }
      }

      await sendPushNotification({
        title: `Delivery Logged: ${sup}`,
        message: `${receivedItems.length} lines checked in (${invoiceRef ? 'Ref: ' + invoiceRef : deliveryDate})`,
        prefKey: 'notify_goods',
        excludeUser: currentUser?.name,
        dataPayload: { module: 'goods' }
      });

      setStatusMsg({ type: 'success', text: `Delivery for ${sup} saved & master costs updated!` });
      setReceivedItems([]);
      setInvoiceRef('');
      setInvoiceNotes('');
      await fetchPastReports();
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Error saving delivery report.' });
    } finally {
      setSubmittingReport(false);
    }
  };

  const filteredPastReports = useMemo(() => {
    const q = reportSearchQuery.toLowerCase();
    return pastReports.filter(rep => {
      const sup = String(rep.supplier || '').toLowerCase();
      const ref = String(rep.invoice_ref || '').toLowerCase();
      const dt = String(rep.delivery_date || '').toLowerCase();
      return !q || sup.includes(q) || ref.includes(q) || dt.includes(q);
    });
  }, [pastReports, reportSearchQuery]);

  const handleOpenReportView = (rep) => {
    setSelectedReport({
      ...rep,
      items: parseItems(rep.items).map(i => ({ ...i }))
    });
    setIsEditingReport(false);
    setShowAddLineToReport(false);
  };

  const handleUpdateEditingItemLine = (idx, field, val) => {
    setSelectedReport(prev => {
      const itemsCopy = [...(prev.items || [])];
      itemsCopy[idx] = { ...itemsCopy[idx], [field]: val };

      if (field === 'qty' || field === 'unitEx') {
        const qty = parseFloat(field === 'qty' ? val : itemsCopy[idx].qty) || 0;
        const uEx = parseFloat(field === 'unitEx' ? val : itemsCopy[idx].unitEx) || 0;
        itemsCopy[idx].totalEx = Math.round(qty * uEx * 100) / 100;
        itemsCopy[idx].totalInc = Math.round(qty * uEx * 1.20 * 100) / 100;
        itemsCopy[idx].unitInc = Math.round(uEx * 1.20 * 100) / 100;
      }

      return { ...prev, items: itemsCopy };
    });
  };

  const handleRemoveEditingItemLine = (idx) => {
    setSelectedReport(prev => ({
      ...prev,
      items: (prev.items || []).filter((_, i) => i !== idx)
    }));
  };

  // Add a newly typed or selected item to the current editing report
  const handleConfirmAddLineToReport = (e) => {
    e.preventDefault();
    const finalName = editLineProduct ? editLineProduct.name : editLineName.trim();
    const qty = parseFloat(editLineQty) || 1;
    const uEx = parseFloat(editLineUnitEx) || 0;
    if (!finalName || qty <= 0) return;

    const matchedCat = editLineProduct?.category || 'general';

    const newLine = {
      id: editLineProduct ? editLineProduct.id : `CUSTOM-${Date.now()}`,
      sku: editLineProduct ? editLineProduct.id : 'CUSTOM',
      name: finalName,
      category: matchedCat,
      supplier: selectedReport?.supplier || (editLineProduct ? editLineProduct.supplier : 'General'),
      unit: editLineUnit || (editLineProduct ? (editLineProduct.order_unit || editLineProduct.unit) : 'unit'),
      qty: qty,
      unitEx: uEx,
      unitInc: Math.round(uEx * 1.20 * 100) / 100,
      totalEx: Math.round(qty * uEx * 100) / 100,
      totalInc: Math.round(qty * uEx * 1.20 * 100) / 100
    };

    setSelectedReport(prev => ({
      ...prev,
      items: [...(prev.items || []), newLine]
    }));

    setEditLineSearch('');
    setEditLineProduct(null);
    setEditLineName('');
    setEditLineQty('1');
    setEditLineUnitEx('');
    setShowAddLineToReport(false);
  };

  const handleSaveEditedReport = async (e) => {
    e.preventDefault();
    if (!selectedReport?.id) return;

    setSavingEdit(true);
    setStatusMsg(null);

    try {
      const { error } = await supabase
        .from('goods_received')
        .update({
          supplier: selectedReport.supplier?.trim() || 'Supplier',
          invoice_ref: selectedReport.invoice_ref?.trim() || '',
          delivery_date: selectedReport.delivery_date,
          notes: selectedReport.notes?.trim() || '',
          items: selectedReport.items || []
        })
        .eq('id', selectedReport.id);

      if (error) throw error;

      for (const item of (selectedReport.items || [])) {
        if (item.unitEx > 0 && item.id && !String(item.id).startsWith('CUSTOM-')) {
          await supabase
            .from('catalog_items')
            .update({
              last_cost_ex_vat: Number(item.unitEx),
              cost_price_ex_vat: Number(item.unitEx),
              updated_at: new Date().toISOString()
            })
            .eq('id', item.id);
        }
      }

      setStatusMsg({ type: 'success', text: `Updated invoice ${selectedReport.invoice_ref || selectedReport.supplier}` });
      setIsEditingReport(false);
      setShowAddLineToReport(false);
      await fetchPastReports();
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Error updating delivery report.' });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteReport = async (id, refStr) => {
    if (!window.confirm(`Permanently delete delivery report ${refStr || id}?`)) return;
    try {
      const { error } = await supabase.from('goods_received').delete().eq('id', id);
      if (error) throw error;
      setSelectedReport(null);
      setStatusMsg({ type: 'success', text: 'Report removed.' });
      await fetchPastReports();
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Could not delete report.' });
    }
  };

  const reportFinancials = useMemo(() => {
    if (!selectedReport) return { netTotal: 0, vatTotal: 0, grossTotal: 0, categories: [] };

    const items = parseItems(selectedReport.items);
    let net = 0;
    const catMap = {};

    items.forEach(item => {
      const lineNet = Number(item.totalEx || (item.qty * item.unitEx) || 0);
      net += lineNet;

      let cat = (item.category || '').toLowerCase();
      if (!cat) {
        const found = products.find(p => p.id === item.id || p.name === item.name);
        cat = (found?.category || 'general').toLowerCase();
      }

      let label = 'General / Other';
      if (cat.includes('draught') || cat.includes('keg')) label = 'Draught Beer';
      else if (cat.includes('spirit')) label = 'Spirits & Liqueurs';
      else if (cat.includes('wine')) label = 'Wine & Champagne';
      else if (cat.includes('beer') || cat.includes('pack')) label = 'Packaged Beer';
      else if (cat.includes('prep')) label = 'Prep & Syrups';
      else if (cat.includes('mineral') || cat.includes('soft')) label = 'Minerals & Softs';

      catMap[label] = (catMap[label] || 0) + lineNet;
    });

    const vat = Math.round(net * 0.20 * 100) / 100;
    const gross = Math.round((net + vat) * 100) / 100;

    const categories = Object.entries(catMap).map(([name, total]) => ({
      name,
      total: Math.round(total * 100) / 100,
      percent: net > 0 ? Math.round((total / net) * 1000) / 10 : 0
    })).sort((a, b) => b.total - a.total);

    return {
      netTotal: Math.round(net * 100) / 100,
      vatTotal: vat,
      grossTotal: gross,
      categories
    };
  }, [selectedReport, products]);

  const hasQty = parseFloat(qtyDelivered) > 0;

  return (
    <div 
      {...swipeHandlers}
      className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 overflow-hidden relative select-none"
    >
      {/* Top Bar */}
      <header className="flex items-center justify-between px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-2 border-b border-gray-100 flex-shrink-0 bg-white z-20">
        <div className="flex items-center space-x-2">
          {onBackToHub && (
            <button onClick={onBackToHub} className="mr-0.5 p-1 -ml-1 text-gray-500 hover:text-black rounded-lg transition" title="Return to Hub">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <AppLogo className="w-6 h-6" fallbackTextClass="font-serif text-2xl font-bold tracking-tighter" />
          <span className="font-semibold text-base tracking-tight text-gray-900">West Side Tavern</span>
        </div>
        <div className="flex items-center space-x-1.5 text-xs font-medium">
          <button onClick={fetchPastReports} className="p-1 text-gray-400 hover:text-black rounded-lg" title="Refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${loadingReports ? 'animate-spin' : ''}`} />
          </button>
          {onBackToHub ? (
            <button onClick={onBackToHub} className="text-gray-900 hover:text-black font-semibold">Hub</button>
          ) : (
            <button onClick={onLogout} className="text-gray-900 hover:text-black">Logout</button>
          )}
        </div>
      </header>

      {/* Tab Selector */}
      <div className="px-5 pt-2 pb-1.5 bg-gray-50/80 border-b border-gray-100 flex-shrink-0">
        <div className="flex bg-[#EDEDED] p-1 rounded-2xl">
          <button
            onClick={() => setActiveTab('intake')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition flex items-center justify-center space-x-1.5 ${
              activeTab === 'intake' ? 'bg-white text-black shadow-xs' : 'text-gray-500 hover:text-black'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Delivery Check-In</span>
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition flex items-center justify-center space-x-1.5 ${
              activeTab === 'reports' ? 'bg-white text-black shadow-xs' : 'text-gray-500 hover:text-black'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-700" />
            <span>Past Reports ({pastReports.length})</span>
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className={`mx-5 my-2 p-2 rounded-xl text-xs font-semibold flex-shrink-0 ${
          statusMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {statusMsg.text}
        </div>
      )}

      {/* Main Body */}
      {activeTab === 'intake' ? (
        /* INTAKE TAB */
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto px-5 py-3 space-y-3.5 pb-28 touch-pan-y overscroll-contain">
          <div className="border-b border-gray-100 pb-2.5 flex-shrink-0">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-500 italic text-[11px] font-serif">Delivery Check-In</p>
                <h1 className="text-lg font-black tracking-tight text-gray-900">Goods Received Report</h1>
              </div>
              <button
                onClick={() => setIsMathLocked(!isMathLocked)}
                className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-[10px] font-bold border transition ${
                  isMathLocked ? 'bg-green-50 text-green-800 border-green-200' : 'bg-amber-50 text-amber-800 border-amber-300'
                }`}
              >
                {isMathLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                <span>{isMathLocked ? 'VAT Locked' : 'Manual Math'}</span>
              </button>
            </div>

            <div className="grid grid-cols-12 gap-1.5 mt-2.5 text-[11px]">
              <div className="col-span-4 min-w-0">
                <label className="block text-[9px] font-bold uppercase text-gray-400 mb-0.5 truncate">Supplier</label>
                <input 
                  type="text" 
                  placeholder="Tennent's" 
                  value={invoiceSupplier} 
                  onChange={(e) => setInvoiceSupplier(e.target.value)} 
                  className="w-full min-w-0 bg-[#EDEDED] py-1.5 px-2 rounded-lg font-semibold text-gray-900 text-[10px] focus:outline-none" 
                />
              </div>
              <div className="col-span-4 min-w-0">
                <label className="block text-[9px] font-bold uppercase text-gray-400 mb-0.5 truncate">Invoice / Ref</label>
                <input 
                  type="text" 
                  placeholder="INV-1094" 
                  value={invoiceRef} 
                  onChange={(e) => setInvoiceRef(e.target.value)} 
                  className="w-full min-w-0 bg-[#EDEDED] py-1.5 px-2 rounded-lg font-semibold text-gray-900 text-[10px] focus:outline-none" 
                />
              </div>
              <div className="col-span-4 min-w-0">
                <label className="block text-[9px] font-bold uppercase text-gray-400 mb-0.5 truncate">Date</label>
                <input 
                  type="date" 
                  value={deliveryDate} 
                  onChange={(e) => setDeliveryDate(e.target.value)} 
                  className="w-full min-w-0 bg-[#EDEDED] py-1.5 px-1.5 rounded-lg font-semibold text-gray-900 text-[10px] focus:outline-none appearance-none" 
                />
              </div>
            </div>
          </div>

          <form onSubmit={handleAddReceivedItem} className="bg-gray-50 border border-gray-200 rounded-2xl p-3 space-y-2.5 text-xs flex-shrink-0">
            <span className="block font-bold text-gray-900 uppercase tracking-wider text-[10px]">Add Invoice Line Item</span>
            
            <div className="relative">
              <input
                type="text"
                value={itemSearch}
                onChange={(e) => { 
                  setItemSearch(e.target.value); 
                  setSelectedProduct(null); 
                  setCustomName(e.target.value); 
                }}
                placeholder="Search catalog or type custom item..."
                className="w-full bg-white border border-gray-300 py-1.5 pl-2.5 pr-7 rounded-xl text-xs italic focus:outline-none"
              />
              {itemSearch && (
                <button 
                  type="button" 
                  onClick={() => { setItemSearch(''); setSelectedProduct(null); setCustomName(''); }} 
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
              {productSearchResults.length > 0 && !selectedProduct && (
                <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg divide-y divide-gray-100 max-h-40 overflow-y-auto">
                  {productSearchResults.map(prod => (
                    <button 
                      key={prod.id} 
                      type="button" 
                      onClick={() => handleSelectProduct(prod)} 
                      className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-gray-100 flex items-center justify-between"
                    >
                      <div>
                        <span className="font-bold text-gray-900">{prod.name}</span>
                        <span className="text-[9px] text-gray-400 font-mono ml-1.5">[{prod.id}]</span>
                      </div>
                      <span className="text-[9px] text-gray-500 italic">£{Number(prod.last_cost_ex_vat || prod.cost_price_ex_vat || 0).toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[9px] font-bold text-gray-900 uppercase mb-0.5">1. Delivered Qty *</label>
                <input 
                  type="number" 
                  step="any" 
                  required 
                  placeholder="e.g. 6" 
                  value={qtyDelivered} 
                  onChange={(e) => handleQtyChange(e.target.value)} 
                  className="w-full bg-white border-2 border-black py-1 px-2.5 rounded-lg text-xs font-black text-black focus:outline-none" 
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-gray-500 mb-0.5">Unit Format</label>
                <input 
                  type="text" 
                  placeholder="case / bottle / keg" 
                  value={customUnit} 
                  onChange={(e) => setCustomUnit(e.target.value)} 
                  className="w-full bg-white border border-gray-300 py-1 px-2.5 rounded-lg text-xs focus:outline-none" 
                />
              </div>
            </div>

            <div className={`grid grid-cols-2 gap-2 pt-0.5 transition-opacity ${hasQty ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
              <div>
                <label className="block text-[9px] font-bold text-gray-600 mb-0.5">Unit Cost (Ex VAT £)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  placeholder="0.00" 
                  value={unitEx} 
                  onChange={(e) => handlePriceChange('unitEx', e.target.value)} 
                  className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg text-xs font-bold text-gray-900 focus:outline-none" 
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-gray-600 mb-0.5">Total Line (Ex VAT £)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  placeholder="0.00" 
                  value={totalEx} 
                  onChange={(e) => handlePriceChange('totalEx', e.target.value)} 
                  className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg text-xs font-semibold text-gray-700 focus:outline-none" 
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-gray-500 mb-0.5">Unit Cost (Inc VAT £)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  placeholder="0.00" 
                  value={unitInc} 
                  onChange={(e) => handlePriceChange('unitInc', e.target.value)} 
                  className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg text-xs text-gray-700 focus:outline-none" 
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-gray-500 mb-0.5">Total Line (Inc VAT £)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  placeholder="0.00" 
                  value={totalInc} 
                  onChange={(e) => handlePriceChange('totalInc', e.target.value)} 
                  className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg text-xs font-bold text-black focus:outline-none" 
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={!hasQty || (!selectedProduct && !customName.trim())} 
              className="w-full py-2 bg-black text-white hover:bg-neutral-800 disabled:opacity-40 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add to Delivery Queue</span>
            </button>
          </form>

          <div className="space-y-1.5 flex-shrink-0">
            <div className="flex justify-between items-center px-1">
              <span className="text-[10px] font-bold uppercase text-gray-400">
                Delivery Queue ({receivedItems.length} items)
              </span>
              {receivedItems.length > 0 && (
                <button 
                  type="button" 
                  onClick={() => setReceivedItems([])} 
                  className="text-[9px] text-red-500 hover:underline font-semibold"
                >
                  Clear Queue
                </button>
              )}
            </div>

            {receivedItems.length === 0 ? (
              <div className="border border-dashed border-gray-200 rounded-2xl py-5 text-center text-xs text-gray-400">
                No items added to delivery yet.
              </div>
            ) : (
              <div className="border border-gray-200 rounded-2xl overflow-hidden divide-y divide-gray-100 bg-white shadow-xs">
                {receivedItems.map((item, idx) => (
                  <div key={idx} className="p-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-gray-900 block leading-tight text-[11px]">{item.name}</span>
                      <div className="flex items-center space-x-1.5 text-[9px] text-gray-400 font-mono mt-0.5">
                        <span>{item.qty} {item.unit}</span>
                        <span>•</span>
                        <span>Tot Ex: £{item.totalEx.toFixed(2)}</span>
                        <span>•</span>
                        <span className="font-bold text-gray-800">Tot Inc: £{item.totalInc.toFixed(2)}</span>
                      </div>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => setReceivedItems(prev => prev.filter((_, i) => i !== idx))} 
                      className="p-1 text-gray-400 hover:text-red-500 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1 flex-shrink-0">
            <label className="block text-[10px] font-bold text-gray-700">Delivery Notes &amp; Discrepancies</label>
            <textarea 
              rows={2} 
              placeholder="Driver signature, damaged items, shortages..." 
              value={invoiceNotes} 
              onChange={(e) => setInvoiceNotes(e.target.value)} 
              className="w-full bg-[#EDEDED] p-2.5 rounded-2xl text-xs focus:outline-none resize-none leading-relaxed" 
            />
          </div>

          <button 
            type="button" 
            disabled={receivedItems.length === 0 || submittingReport} 
            onClick={handleSubmitInvoiceReport} 
            className="w-full py-3 bg-black hover:bg-neutral-800 disabled:opacity-40 rounded-2xl text-xs font-black text-white transition flex items-center justify-center space-x-1.5 shadow-md"
          >
            <Send className="w-3.5 h-3.5 text-emerald-400" />
            <span>{submittingReport ? 'Saving Report...' : 'Submit & Update Master Costs'}</span>
          </button>
        </div>
      ) : (
        /* PAST REPORTS TAB */
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto px-5 py-3 space-y-3 pb-28 touch-pan-y overscroll-contain">
          <div className="relative flex-shrink-0">
            <input
              type="text"
              value={reportSearchQuery}
              onChange={(e) => setReportSearchQuery(e.target.value)}
              placeholder="Search supplier, date or invoice ref..."
              className="w-full bg-[#EDEDED] py-2 pl-3 pr-8 rounded-xl text-xs placeholder-gray-400 focus:outline-none"
            />
            {reportSearchQuery ? (
              <button onClick={() => setReportSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black">
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            )}
          </div>

          <div className="divide-y divide-gray-100 border border-gray-200 rounded-3xl overflow-hidden bg-white shadow-xs">
            {loadingReports ? (
              <p className="p-8 text-center text-xs text-gray-400 italic">Loading past invoices...</p>
            ) : filteredPastReports.length === 0 ? (
              <div className="p-8 text-center text-gray-400 space-y-1">
                <FolderOpen className="w-8 h-8 mx-auto opacity-30 text-gray-400" />
                <p className="text-xs font-semibold text-gray-600">No goods received reports found</p>
              </div>
            ) : (
              filteredPastReports.map((rep) => {
                const safeItems = parseItems(rep.items);
                const itemsCount = safeItems.length;
                let totEx = 0;
                safeItems.forEach(i => { totEx += Number(i.totalEx || 0); });

                return (
                  <div
                    key={rep.id}
                    onClick={() => handleOpenReportView(rep)}
                    className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition group"
                  >
                    <div className="space-y-0.5 pr-2">
                      <div className="flex items-center space-x-2">
                        <span className="font-extrabold text-xs text-gray-900 group-hover:text-black block leading-tight">
                          {rep.supplier}
                        </span>
                        {rep.invoice_ref && (
                          <span className="text-[9px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                            {rep.invoice_ref}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-1.5 text-[10px] text-gray-500 font-mono">
                        <span>{rep.delivery_date}</span>
                        <span>•</span>
                        <span>{itemsCount} lines</span>
                        {rep.notes && (
                          <>
                            <span>•</span>
                            <span className="truncate max-w-[130px] italic text-gray-400">"{rep.notes}"</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0 flex items-center space-x-2">
                      <div>
                        <span className="text-xs font-black text-gray-900 font-mono block">
                          £{totEx.toFixed(2)}
                        </span>
                        <span className="text-[9px] text-gray-400 font-mono">Total Ex</span>
                      </div>
                      <Eye className="w-3.5 h-3.5 text-gray-400 group-hover:text-black" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* REPORT VIEWER & AUDIT MODAL */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl border border-gray-200 flex flex-col max-h-[92vh] animate-in slide-in-from-bottom duration-200">
            
            {/* Header */}
            <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex justify-between items-center bg-gray-50/80">
              <div>
                <span className="text-[9px] font-mono uppercase text-amber-700 font-bold block">
                  {isEditingReport ? 'Editing Delivery Report' : 'Invoice Inspection Report'}
                </span>
                <h2 className="text-base font-black text-gray-900 leading-tight mt-0.5">
                  {selectedReport.supplier} • {selectedReport.delivery_date}
                </h2>
                {selectedReport.invoice_ref && (
                  <span className="text-[10px] font-mono text-gray-500 block">
                    Ref: {selectedReport.invoice_ref}
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingReport(!isEditingReport);
                    setShowAddLineToReport(false);
                  }}
                  className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition flex items-center space-x-1 ${
                    isEditingReport
                      ? 'bg-amber-100 border-amber-300 text-amber-900'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100 shadow-2xs'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{isEditingReport ? 'Done' : 'Edit Invoice'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedReport(null)}
                  className="p-1.5 text-gray-400 hover:text-black bg-white rounded-full border border-gray-200 shadow-2xs"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveEditedReport} className="p-5 overflow-y-auto space-y-4 text-xs touch-pan-y overscroll-contain flex-1">
              {isEditingReport && (
                <div className="grid grid-cols-3 gap-2 pb-2">
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Supplier</label>
                    <input
                      type="text"
                      required
                      value={selectedReport.supplier || ''}
                      onChange={(e) => setSelectedReport({ ...selectedReport, supplier: e.target.value })}
                      className="w-full bg-[#EDEDED] py-1.5 px-2 rounded-xl text-xs font-bold focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Invoice Ref</label>
                    <input
                      type="text"
                      value={selectedReport.invoice_ref || ''}
                      onChange={(e) => setSelectedReport({ ...selectedReport, invoice_ref: e.target.value })}
                      className="w-full bg-[#EDEDED] py-1.5 px-2 rounded-xl text-xs font-mono font-bold focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5">Delivery Date</label>
                    <input
                      type="date"
                      required
                      value={selectedReport.delivery_date || ''}
                      onChange={(e) => setSelectedReport({ ...selectedReport, delivery_date: e.target.value })}
                      className="w-full bg-[#EDEDED] py-1.5 px-1.5 rounded-xl text-xs font-mono font-bold focus:outline-none appearance-none"
                    />
                  </div>
                </div>
              )}

              {/* Items Line Sheet */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold uppercase tracking-wider text-[10px] text-gray-400 block">
                    Delivered Items ({parseItems(selectedReport.items).length})
                  </span>

                  {isEditingReport && (
                    <button
                      type="button"
                      onClick={() => setShowAddLineToReport(!showAddLineToReport)}
                      className="flex items-center space-x-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-lg transition"
                    >
                      <Plus className="w-3 h-3" />
                      <span>{showAddLineToReport ? 'Close' : 'Add Item'}</span>
                    </button>
                  )}
                </div>

                {/* ADD ITEM DRAWER (IN EDIT MODE) */}
                {isEditingReport && showAddLineToReport && (
                  <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3 space-y-2 mb-2 animate-in fade-in duration-150">
                    <span className="font-bold text-[10px] uppercase text-amber-900 block">
                      Add Product to this Invoice
                    </span>

                    <div className="relative">
                      <input
                        type="text"
                        value={editLineSearch}
                        onChange={(e) => {
                          setEditLineSearch(e.target.value);
                          setEditLineProduct(null);
                          setEditLineName(e.target.value);
                        }}
                        placeholder="Search catalog SKU or product name..."
                        className="w-full bg-white border border-gray-300 py-1.5 pl-2.5 pr-7 rounded-xl text-xs focus:outline-none"
                      />
                      {editLineSearch && (
                        <button
                          type="button"
                          onClick={() => { setEditLineSearch(''); setEditLineProduct(null); setEditLineName(''); }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}

                      {editLineSearchResults.length > 0 && !editLineProduct && (
                        <div className="absolute z-40 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg divide-y divide-gray-100 max-h-36 overflow-y-auto">
                          {editLineSearchResults.map(prod => (
                            <button
                              key={prod.id}
                              type="button"
                              onClick={() => {
                                setEditLineProduct(prod);
                                setEditLineName(prod.name || '');
                                setEditLineUnit(prod.order_unit || prod.unit || 'unit');
                                setEditLineSearch(prod.name || '');
                                const cost = Number(prod.last_cost_ex_vat || prod.cost_price_ex_vat || 0);
                                if (cost > 0) setEditLineUnitEx(cost.toFixed(2));
                              }}
                              className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-gray-100 flex items-center justify-between"
                            >
                              <span className="font-bold text-gray-900 truncate">{prod.name}</span>
                              <span className="text-[10px] text-gray-500 font-mono">£{Number(prod.last_cost_ex_vat || prod.cost_price_ex_vat || 0).toFixed(2)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-12 gap-1.5">
                      <div className="col-span-3">
                        <label className="text-[8px] font-bold text-gray-600 uppercase block mb-0.5">Qty</label>
                        <input
                          type="number"
                          step="any"
                          required
                          value={editLineQty}
                          onChange={(e) => setEditLineQty(e.target.value)}
                          className="w-full bg-white border border-gray-300 py-1 px-1 rounded-lg font-mono font-bold text-xs text-center focus:outline-none"
                        />
                      </div>
                      <div className="col-span-4">
                        <label className="text-[8px] font-bold text-gray-600 uppercase block mb-0.5">Unit Format</label>
                        <input
                          type="text"
                          value={editLineUnit}
                          onChange={(e) => setEditLineUnit(e.target.value)}
                          className="w-full bg-white border border-gray-300 py-1 px-1.5 rounded-lg text-xs focus:outline-none"
                        />
                      </div>
                      <div className="col-span-5">
                        <label className="text-[8px] font-bold text-gray-600 uppercase block mb-0.5">Unit Ex (£)</label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          placeholder="0.00"
                          value={editLineUnitEx}
                          onChange={(e) => setEditLineUnitEx(e.target.value)}
                          className="w-full bg-white border border-gray-300 py-1 px-1.5 rounded-lg font-mono font-bold text-xs text-center focus:outline-none"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleConfirmAddLineToReport}
                      disabled={!editLineName.trim() || parseFloat(editLineQty) <= 0}
                      className="w-full py-1.5 bg-black hover:bg-neutral-800 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Append Item to List</span>
                    </button>
                  </div>
                )}

                <div className="divide-y divide-gray-100 border border-gray-200 rounded-2xl bg-white overflow-hidden shadow-2xs">
                  {parseItems(selectedReport.items).map((line, idx) => (
                    <div key={idx} className="p-2.5 flex items-center justify-between text-xs">
                      <div className="min-w-0 pr-2">
                        <span className="font-bold text-gray-900 block leading-tight truncate">{line.name}</span>
                        <span className="text-[10px] text-gray-400 font-mono mt-0.5 block">
                          {line.qty} {line.unit} @ £{Number(line.unitEx || 0).toFixed(2)} ex
                        </span>
                      </div>

                      {isEditingReport ? (
                        <div className="flex items-center space-x-1.5 flex-shrink-0">
                          <input
                            type="number"
                            step="any"
                            value={line.qty}
                            onChange={(e) => handleUpdateEditingItemLine(idx, 'qty', e.target.value)}
                            className="w-12 bg-white border border-gray-300 py-1 px-1 rounded-lg font-mono text-center text-xs font-bold"
                          />
                          <input
                            type="number"
                            step="0.01"
                            value={line.unitEx}
                            onChange={(e) => handleUpdateEditingItemLine(idx, 'unitEx', e.target.value)}
                            className="w-14 bg-white border border-gray-300 py-1 px-1 rounded-lg font-mono text-center text-xs font-bold"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveEditingItemLine(idx)}
                            className="p-1 text-gray-400 hover:text-red-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="text-right flex-shrink-0">
                          <span className="font-mono font-bold text-gray-900 block">
                            £{Number(line.totalEx || (line.qty * line.unitEx) || 0).toFixed(2)}
                          </span>
                          <span className="text-[9px] font-mono text-gray-400 block">
                            Inc: £{Number(line.totalInc || (line.qty * line.unitEx * 1.20) || 0).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Delivery Notes */}
              {selectedReport.notes && !isEditingReport && (
                <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl space-y-0.5">
                  <span className="text-[9px] font-bold uppercase text-gray-400 tracking-wider block">Notes</span>
                  <p className="text-[11px] text-gray-700 italic leading-snug">"{selectedReport.notes}"</p>
                </div>
              )}

              {isEditingReport && (
                <div className="space-y-1 pt-1 border-t border-gray-100">
                  <label className="text-[9px] font-bold text-gray-500 uppercase block">Delivery Notes</label>
                  <textarea
                    rows={2}
                    value={selectedReport.notes || ''}
                    onChange={(e) => setSelectedReport({ ...selectedReport, notes: e.target.value })}
                    placeholder="Notes or discrepancy logs..."
                    className="w-full bg-[#EDEDED] p-2 rounded-xl text-xs leading-relaxed focus:outline-none resize-none"
                  />
                </div>
              )}

              {/* SECTION: SUMMARY & VAT AUDIT REPORT */}
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <span className="font-bold uppercase tracking-wider text-[10px] text-gray-400 flex items-center space-x-1">
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Invoice Financial Summary &amp; VAT</span>
                </span>

                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 space-y-2 font-mono text-xs">
                  <div className="flex justify-between items-center text-gray-600">
                    <span>Subtotal (Net Ex VAT):</span>
                    <span className="font-bold text-gray-900">£{reportFinancials.netTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-gray-600">
                    <span>VAT @ 20.0%:</span>
                    <span className="font-bold text-gray-900">£{reportFinancials.vatTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1.5 border-t border-gray-200 text-sm font-black text-black">
                    <span>Gross Invoice Total:</span>
                    <span className="text-base font-black text-emerald-700">£{reportFinancials.grossTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* SECTION: CATEGORY COST BREAKDOWN */}
              <div className="space-y-1.5 pt-1">
                <span className="font-bold uppercase tracking-wider text-[10px] text-gray-400 flex items-center space-x-1">
                  <PieChart className="w-3.5 h-3.5" />
                  <span>Category Cost Breakdown</span>
                </span>

                <div className="border border-gray-200 rounded-2xl overflow-hidden divide-y divide-gray-100 bg-white shadow-2xs">
                  {reportFinancials.categories.map((cat, idx) => (
                    <div key={idx} className="p-2.5 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-gray-900 block leading-tight">{cat.name}</span>
                        <span className="text-[10px] font-mono text-gray-400">
                          {cat.percent}% of invoice net
                        </span>
                      </div>
                      <span className="font-mono font-black text-gray-900 text-xs">
                        £{cat.total.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons for Editing */}
              {isEditingReport && (
                <div className="pt-2 flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleDeleteReport(selectedReport.id, selectedReport.invoice_ref)}
                    className="p-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl transition"
                    title="Delete report"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="flex-1 py-3 bg-black hover:bg-neutral-800 disabled:opacity-40 text-white rounded-2xl text-xs font-bold transition flex items-center justify-center space-x-1.5 shadow-md"
                  >
                    <Save className="w-4 h-4 text-emerald-400" />
                    <span>{savingEdit ? 'Updating Report...' : 'Save & Sync Invoice'}</span>
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Floating Hub Nav */}
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