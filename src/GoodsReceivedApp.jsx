import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  X, 
  Lock, 
  Unlock, 
  Send, 
  FileText
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

  return <span className={fallbackTextClass}>T</span>;
}

export default function GoodsReceivedApp({ currentUser, onBackToHub, onLogout }) {
  const [products, setProducts] = useState(() => {
    try {
      const cached = localStorage.getItem('wst_catalog_cache');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

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

  const swipeHandlers = useTwoFingerSwipe({
    onSwipeRight: () => {
      if (onBackToHub) onBackToHub();
    }
  });

  useEffect(() => {
    const fetchCatalog = async () => {
      try {
        if (navigator.onLine) {
          const { data } = await supabase
            .from('catalog_items')
            .select('id, name, unit, supplier')
            .eq('venue_id', DEFAULT_VENUE_ID);
          if (data && data.length > 0) {
            setProducts(data);
            localStorage.setItem('wst_catalog_cache', JSON.stringify(data));
          }
        } else {
          const offline = await localDb.cached_catalog.toArray();
          if (offline.length > 0) setProducts(offline);
        }
      } catch (err) {
        console.warn("Could not sync catalog in GoodsReceivedApp:", err);
      }
    };
    fetchCatalog();
  }, []);

  const productSearchResults = useMemo(() => {
    if (!itemSearch.trim() || selectedProduct) return [];
    const q = itemSearch.toLowerCase();
    return products.filter(p => 
      (p.name && p.name.toLowerCase().includes(q)) || 
      (p.id && p.id.toLowerCase().includes(q))
    ).slice(0, 6);
  }, [products, itemSearch, selectedProduct]);

  const handleSelectProduct = (prod) => {
    setSelectedProduct(prod);
    setCustomName(prod.name);
    setCustomUnit(prod.unit || 'unit');
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
      setTotalInc(''); setTotalEx(''); setUnitInc(''); setUnitEx('');
      return;
    }

    if (field === 'totalInc') {
      const tEx = num / 1.20;
      setTotalInc(val); setTotalEx(tEx.toFixed(2));
      setUnitInc((num / qty).toFixed(2)); setUnitEx((tEx / qty).toFixed(2));
    } else if (field === 'totalEx') {
      const tInc = num * 1.20;
      setTotalEx(val); setTotalInc(tInc.toFixed(2));
      setUnitEx((num / qty).toFixed(2)); setUnitInc((tInc / qty).toFixed(2));
    } else if (field === 'unitEx') {
      const uInc = num * 1.20; const tEx = num * qty;
      setUnitEx(val); setUnitInc(uInc.toFixed(2));
      setTotalEx(tEx.toFixed(2)); setTotalInc((tEx * 1.20).toFixed(2));
    } else if (field === 'unitInc') {
      const uEx = num / 1.20; const tInc = num * qty;
      setUnitInc(val); setUnitEx(uEx.toFixed(2));
      setTotalInc(tInc.toFixed(2)); setTotalEx((tInc / 1.20).toFixed(2));
    }
  };

  const handleQtyChange = (val) => {
    setQtyDelivered(val);
    const qty = parseFloat(val);
    if (isMathLocked && qty > 0) {
      if (totalInc) {
        const tInc = parseFloat(totalInc);
        setUnitInc((tInc / qty).toFixed(2));
        setUnitEx((tInc / 1.20 / qty).toFixed(2));
      } else if (unitEx) {
        const uEx = parseFloat(unitEx);
        setTotalEx((uEx * qty).toFixed(2));
        setTotalInc((uEx * qty * 1.20).toFixed(2));
      }
    }
  };

  const handleAddReceivedItem = (e) => {
    e.preventDefault();
    const finalName = selectedProduct ? selectedProduct.name : customName.trim();
    if (!finalName || !qtyDelivered) return;

    setReceivedItems(prev => [...prev, {
      id: selectedProduct ? selectedProduct.id : `CUSTOM-${Date.now()}`,
      sku: selectedProduct ? selectedProduct.id : 'CUSTOM',
      name: finalName,
      supplier: invoiceSupplier || (selectedProduct ? selectedProduct.supplier : 'General'),
      unit: customUnit || (selectedProduct ? selectedProduct.unit : 'unit'),
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

      sendPushNotification(
        `Delivery Logged: ${sup}`,
        `${receivedItems.length} items checked in (${invoiceRef ? "Ref: " + invoiceRef : deliveryDate})`,
        null,
        { module: 'goods' }
      );

      setStatusMsg({ type: 'success', text: `Delivery report for ${sup} saved!` });
      setReceivedItems([]);
      setInvoiceRef('');
      setInvoiceNotes('');
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Error saving delivery report.' });
    } finally {
      setSubmittingReport(false);
    }
  };

  const handleExportDeliveryDoc = () => {
    let content = `WEST SIDE TAVERN - GOODS RECEIVED INTAKE REPORT\nDelivery Date: ${deliveryDate}\nSupplier: ${invoiceSupplier || 'All'}\nInvoice / Ref: ${invoiceRef || 'N/A'}\nNotes: ${invoiceNotes || 'None'}\n========================================================================\n\n`;
    content += `${"SKU".padEnd(8)} | ${"ITEM".padEnd(26)} | ${"QTY".padEnd(5)} | ${"UNIT".padEnd(6)} | ${"TOT EX".padEnd(9)} | TOT INC (20%)\n------------------------------------------------------------------------\n`;
    let sumEx = 0, sumInc = 0;
    receivedItems.forEach(item => {
      sumEx += item.totalEx;
      sumInc += item.totalInc;
      content += `${item.sku.padEnd(8)} | ${item.name.padEnd(26).slice(0, 26)} | ${String(item.qty).padEnd(5)} | ${item.unit.padEnd(6)} | £${item.totalEx.toFixed(2).padEnd(8)} | £${item.totalInc.toFixed(2)}\n`;
    });
    content += `------------------------------------------------------------------------\nTOTALS: Ex VAT: £${sumEx.toFixed(2)} | Inc VAT: £${sumInc.toFixed(2)}\n`;

    const blob = new Blob([content], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `WST_Delivery_${invoiceRef || 'Intake'}_${deliveryDate}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div 
      {...swipeHandlers}
      className="flex flex-col h-screen w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 overflow-x-hidden relative"
    >
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
        <div className="flex items-center space-x-3 text-xs font-medium">
          {onBackToHub ? (
            <button onClick={onBackToHub} className="text-gray-900 hover:text-black font-semibold">Hub</button>
          ) : (
            <button onClick={onLogout} className="text-gray-900 hover:text-black">Logout</button>
          )}
        </div>
      </header>

      <div className="flex-1 flex flex-col overflow-y-auto px-5 py-3 space-y-3.5 pb-20">
        <div className="border-b border-gray-100 pb-2.5">
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

          {statusMsg && (
            <div className={`p-2 rounded-xl text-[11px] font-semibold my-2 ${
              statusMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {statusMsg.text}
            </div>
          )}

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

        <form onSubmit={handleAddReceivedItem} className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2.5 text-xs">
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
              className="w-full bg-white border border-gray-300 py-1.5 pl-2.5 pr-7 rounded-lg text-xs italic focus:outline-none"
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
              <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg divide-y divide-gray-100 max-h-40 overflow-y-auto">
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
                    <span className="text-[9px] text-gray-500 italic">{prod.supplier}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[9px] font-bold text-gray-500 mb-0.5">Delivered Qty *</label>
              <input 
                type="number" 
                step="any" 
                required 
                placeholder="5" 
                value={qtyDelivered} 
                onChange={(e) => handleQtyChange(e.target.value)} 
                className="w-full bg-white border border-gray-300 py-1 px-2.5 rounded-lg text-xs font-bold text-black focus:outline-none" 
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-gray-500 mb-0.5">Unit</label>
              <input 
                type="text" 
                placeholder="case / keg" 
                value={customUnit} 
                onChange={(e) => setCustomUnit(e.target.value)} 
                className="w-full bg-white border border-gray-300 py-1 px-2.5 rounded-lg text-xs focus:outline-none" 
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <div>
              <label className="block text-[9px] font-bold text-gray-500 mb-0.5">Total (Inc VAT £)</label>
              <input 
                type="number" 
                step="0.01" 
                placeholder="0.00" 
                value={totalInc} 
                onChange={(e) => handlePriceChange('totalInc', e.target.value)} 
                className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg text-xs font-bold text-black focus:outline-none" 
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-gray-500 mb-0.5">Total (Ex VAT £)</label>
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
              <label className="block text-[9px] font-bold text-gray-500 mb-0.5">Unit (Inc VAT £)</label>
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
              <label className="block text-[9px] font-bold text-gray-500 mb-0.5">Unit (Ex VAT £)</label>
              <input 
                type="number" 
                step="0.01" 
                placeholder="0.00" 
                value={unitEx} 
                onChange={(e) => handlePriceChange('unitEx', e.target.value)} 
                className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg text-xs text-gray-700 focus:outline-none" 
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={!qtyDelivered || (!selectedProduct && !customName.trim())} 
            className="w-full py-1.5 bg-black text-white hover:bg-neutral-800 disabled:opacity-40 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add to Delivery Queue</span>
          </button>
        </form>

        <div className="space-y-1.5">
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
            <div className="border border-dashed border-gray-200 rounded-xl py-5 text-center text-xs text-gray-400">
              No items added to delivery yet.
            </div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100 bg-white">
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

        <div className="space-y-1">
          <label className="block text-[10px] font-bold text-gray-700">Delivery Notes & Discrepancies</label>
          <textarea 
            rows={2} 
            placeholder="Driver signature, damaged items, bottle shortages..." 
            value={invoiceNotes} 
            onChange={(e) => setInvoiceNotes(e.target.value)} 
            className="w-full bg-[#EDEDED] p-2 rounded-xl text-xs focus:outline-none resize-none leading-relaxed" 
          />
        </div>

        <div className="grid grid-cols-2 gap-2 pt-0.5 pb-2">
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
            <span>{submittingReport ? 'Saving...' : 'Submit Report'}</span>
          </button>
        </div>
      </div>

      <nav className="fixed bottom-2 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[390px] z-30 rounded-2xl bg-[#111111]/95 backdrop-blur-md text-white py-2 px-3 flex justify-around items-center text-xs font-semibold shadow-2xl border border-white/10 select-none pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
        <button 
          onClick={onBackToHub} 
          className="flex-1 py-1 text-center rounded-xl transition text-gray-400 hover:text-white"
        >
          Return to Hub
        </button>
      </nav>
    </div>
  );
}