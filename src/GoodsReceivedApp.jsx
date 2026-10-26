import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, 
  Truck, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  FileSpreadsheet, 
  Search, 
  X,
  ExternalLink
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

export default function GoodsReceivedApp({ currentUser, onBackToHub, onLogout }) {
  const [supplier, setSupplier] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [invoiceRef, setInvoiceRef] = useState('');
  const [notes, setNotes] = useState('');

  const [itemName, setItemName] = useState('');
  const [itemSku, setItemSku] = useState('');
  const [itemQty, setItemQty] = useState('');
  const [itemUnit, setItemUnit] = useState('unit');
  const [unitExVat, setUnitExVat] = useState('');
  const [unitIncVat, setUnitIncVat] = useState('');

  const [deliveredItems, setDeliveredItems] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [savedFileUrl, setSavedFileUrl] = useState('');

  const swipeHandlers = useTwoFingerSwipe({
    onSwipeRight: () => {
      if (onBackToHub) onBackToHub();
    }
  });

  const handleExVatChange = (val) => {
    setUnitExVat(val);
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setUnitIncVat((num * 1.2).toFixed(2));
    } else {
      setUnitIncVat('');
    }
  };

  const handleAddItem = (e) => {
    e.preventDefault();
    if (!itemName.trim() || !itemQty) return;

    const qty = parseFloat(itemQty) || 0;
    const ex = parseFloat(unitExVat) || 0;
    const inc = parseFloat(unitIncVat) || 0;

    const newItem = {
      sku: itemSku.trim() || 'CUSTOM',
      name: itemName.trim(),
      qty,
      unit: itemUnit,
      unitEx: ex,
      unitInc: inc,
      totalEx: qty * ex,
      totalInc: qty * inc
    };

    setDeliveredItems(prev => [...prev, newItem]);
    setItemName('');
    setItemSku('');
    setItemQty('');
    setUnitExVat('');
    setUnitIncVat('');
  };

  const handleRemoveItem = (index) => {
    setDeliveredItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitReport = async (e) => {
    e.preventDefault();
    if (!supplier.trim() || deliveredItems.length === 0) {
      setStatusMsg({ type: 'error', text: 'Enter supplier and at least one item.' });
      return;
    }

    setIsSubmitting(true);
    setStatusMsg({ type: 'info', text: 'Generating delivery report in Drive folder...' });

    try {
      const payload = {
        action: 'goods_received_report',
        supplier: supplier.trim(),
        deliveryDate,
        invoiceRef: invoiceRef.trim(),
        notes: notes.trim(),
        items: deliveredItems
      };

      const res = await fetch(HARDWIRED_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();

      if (json && json.status === 'success') {
        setStatusMsg({ type: 'success', text: 'Delivery report saved to Goods Received folder!' });
        setSavedFileUrl(json.fileUrl || '');
        setDeliveredItems([]);
        setSupplier('');
        setInvoiceRef('');
        setNotes('');
      } else {
        setStatusMsg({ type: 'error', text: 'Failed to record delivery report.' });
      }
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Network error saving delivery report.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      {...swipeHandlers}
      className="flex flex-col h-screen w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 overflow-x-hidden relative"
    >
      {/* Top Header with Safe Area Inset */}
      <header className="flex items-center justify-between px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-2 border-b border-gray-100 flex-shrink-0 bg-white z-10">
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

      {/* Main Delivery Form View */}
      <div className="flex-1 flex flex-col overflow-y-auto px-5 py-3 space-y-4 pb-20">
        <div>
          <p className="text-gray-500 italic text-[11px] font-serif">Inward Stock & Invoices</p>
          <h1 className="text-xl font-black tracking-tight text-gray-900 mt-0.5">Goods Received</h1>
        </div>

        {statusMsg && (
          <div className={`p-2 rounded-xl text-[11px] font-semibold ${statusMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : statusMsg.type === 'info' ? 'bg-blue-50 text-blue-800 border border-blue-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {statusMsg.text}
          </div>
        )}

        {/* Header Details */}
        <div className="bg-[#F8F8F8] border border-gray-200 rounded-2xl p-3 space-y-2 text-xs">
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-7">
              <label className="block text-[9px] font-bold uppercase text-gray-400 mb-0.5">Supplier</label>
              <input
                type="text"
                placeholder="e.g. Inverarity Morton"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className="w-full bg-white border border-gray-200 py-1.5 px-2 rounded-lg text-xs font-bold focus:outline-none"
              />
            </div>
            <div className="col-span-5">
              <label className="block text-[9px] font-bold uppercase text-gray-400 mb-0.5">Date</label>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full bg-white border border-gray-200 py-1 px-1.5 rounded-lg text-xs font-bold focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-6">
              <label className="block text-[9px] font-bold uppercase text-gray-400 mb-0.5">Invoice / D/N #</label>
              <input
                type="text"
                placeholder="Invoice number"
                value={invoiceRef}
                onChange={(e) => setInvoiceRef(e.target.value)}
                className="w-full bg-white border border-gray-200 py-1.5 px-2 rounded-lg text-xs font-medium focus:outline-none"
              />
            </div>
            <div className="col-span-6">
              <label className="block text-[9px] font-bold uppercase text-gray-400 mb-0.5">Delivery Notes</label>
              <input
                type="text"
                placeholder="Breakages, shortages..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-white border border-gray-200 py-1.5 px-2 rounded-lg text-xs font-medium focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Add Delivery Item Form */}
        <form onSubmit={handleAddItem} className="bg-gray-50 border border-gray-200 rounded-2xl p-3 space-y-2 text-xs">
          <span className="block font-bold text-gray-900 uppercase tracking-wider text-[10px]">Add Delivered Item</span>
          
          <div className="grid grid-cols-12 gap-1.5">
            <div className="col-span-8">
              <input
                type="text"
                placeholder="Product Name"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                className="w-full bg-white border border-gray-300 py-1.5 px-2.5 rounded-xl text-xs font-medium focus:outline-none"
              />
            </div>
            <div className="col-span-4">
              <input
                type="text"
                placeholder="SKU"
                value={itemSku}
                onChange={(e) => setItemSku(e.target.value)}
                className="w-full bg-white border border-gray-300 py-1.5 px-2 rounded-xl text-xs font-mono focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-12 gap-1.5">
            <div className="col-span-4">
              <input
                type="number"
                step="any"
                placeholder="Qty"
                value={itemQty}
                onChange={(e) => setItemQty(e.target.value)}
                className="w-full bg-white border border-gray-300 py-1.5 px-2 rounded-xl text-xs font-bold text-center focus:outline-none"
              />
            </div>
            <div className="col-span-4">
              <select
                value={itemUnit}
                onChange={(e) => setItemUnit(e.target.value)}
                className="w-full bg-white border border-gray-300 py-1.5 px-1.5 rounded-xl text-xs focus:outline-none"
              >
                <option value="unit">unit</option>
                <option value="keg">keg</option>
                <option value="case">case</option>
                <option value="bottle">bottle</option>
                <option value="kg">kg</option>
              </select>
            </div>
            <div className="col-span-4">
              <input
                type="number"
                step="0.01"
                placeholder="Ex VAT (£)"
                value={unitExVat}
                onChange={(e) => handleExVatChange(e.target.value)}
                className="w-full bg-white border border-gray-300 py-1.5 px-2 rounded-xl text-xs font-mono text-right focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!itemName.trim() || !itemQty}
            className="w-full py-1.5 bg-neutral-900 text-white hover:bg-black disabled:opacity-40 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Item to Receipt</span>
          </button>
        </form>

        {/* List of Delivered Items */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-bold uppercase text-gray-400 px-1">
            Delivered Items ({deliveredItems.length})
          </span>

          {deliveredItems.length === 0 ? (
            <div className="border border-dashed border-gray-200 rounded-2xl py-6 text-center text-xs text-gray-400">
              No items added to this delivery yet.
            </div>
          ) : (
            <div className="border border-gray-200 rounded-2xl divide-y divide-gray-100 bg-white overflow-hidden shadow-sm">
              {deliveredItems.map((item, idx) => (
                <div key={idx} className="p-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-extrabold text-gray-900 block leading-tight text-[11px]">{item.name}</span>
                    <span className="text-[9px] text-gray-400 font-mono">
                      {item.qty} {item.unit} • £{item.unitEx.toFixed(2)} ex
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs font-bold text-gray-900">
                      £{item.totalEx.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="text-gray-400 hover:text-red-500 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit to Goods Received Folder */}
        <button
          type="button"
          disabled={isSubmitting || deliveredItems.length === 0 || !supplier.trim()}
          onClick={handleSubmitReport}
          className="w-full py-2.5 bg-black text-white hover:bg-neutral-800 disabled:opacity-40 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 shadow-sm"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>{isSubmitting ? 'Saving...' : 'Save Goods Received Report'}</span>
        </button>

        {savedFileUrl && (
          <a
            href={savedFileUrl}
            target="_blank"
            rel="noreferrer"
            className="w-full py-2 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-xl flex items-center justify-center space-x-1.5 font-bold hover:bg-emerald-100 transition text-[11px]"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            <span>Open Delivery File in Drive</span>
            <ExternalLink className="w-3 h-3 text-emerald-600 ml-1" />
          </a>
        )}
      </div>

      {/* Floating Bottom Navigation Bar */}
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