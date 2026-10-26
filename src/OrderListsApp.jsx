import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  ClipboardList, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  FileSpreadsheet, 
  ExternalLink,
  Search,
  X
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

export default function OrderListsApp({ currentUser, onBackToHub, onLogout }) {
  const [supplier, setSupplier] = useState('');
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [manager, setManager] = useState(currentUser?.name || 'Ross');

  const [catalog, setCatalog] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [orderItems, setOrderItems] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [savedFileUrl, setSavedFileUrl] = useState('');

  const swipeHandlers = useTwoFingerSwipe({
    onSwipeRight: () => {
      if (onBackToHub) onBackToHub();
    }
  });

  useEffect(() => {
    const fetchCatalog = async () => {
      try {
        const res = await fetch(`${HARDWIRED_SCRIPT_URL}?action=all`);
        const json = await res.json();
        if (json && json.status === 'success' && Array.isArray(json.catalog)) {
          setCatalog(json.catalog);
        }
      } catch (err) {
        console.warn("Could not load catalog for order lists:", err);
      }
    };
    fetchCatalog();
  }, []);

  const filteredCatalog = catalog.filter(p => {
    if (!searchQuery.trim()) return false;
    const q = searchQuery.toLowerCase();
    return (p.name || '').toLowerCase().includes(q) || (p.id || '').toLowerCase().includes(q);
  }).slice(0, 6);

  const handleAddProductToOrder = (prod) => {
    if (orderItems.some(i => i.id === prod.id)) return;
    const needed = Math.max(0, (prod.par || 0) - (prod.count || 0));

    setOrderItems(prev => [
      ...prev,
      {
        id: prod.id,
        sku: prod.id,
        name: prod.name,
        unit: prod.unit || 'unit',
        par: prod.par || 0,
        currentCount: prod.count || 0,
        orderQty: needed > 0 ? needed : 1
      }
    ]);
    setSearchQuery('');
  };

  const handleQtyChange = (id, newQty) => {
    setOrderItems(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, orderQty: parseFloat(newQty) || 0 };
      }
      return item;
    }));
  };

  const handleRemoveOrderItem = (id) => {
    setOrderItems(prev => prev.filter(item => item.id !== id));
  };

  const handleSubmitOrder = async (e) => {
    e.preventDefault();
    if (!supplier.trim() || orderItems.length === 0) {
      setStatusMsg({ type: 'error', text: 'Enter supplier and at least one item.' });
      return;
    }

    setIsSubmitting(true);
    setStatusMsg({ type: 'info', text: 'Saving order list in Drive folder...' });

    try {
      const payload = {
        action: 'save_order_list',
        supplier: supplier.trim(),
        date: orderDate,
        manager,
        items: orderItems
      };

      const res = await fetch(HARDWIRED_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();

      if (json && json.status === 'success') {
        setStatusMsg({ type: 'success', text: 'Order list saved to Order Lists folder!' });
        setSavedFileUrl(json.fileUrl || '');
        setOrderItems([]);
        setSupplier('');
      } else {
        setStatusMsg({ type: 'error', text: 'Failed to record order list.' });
      }
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Network error saving order list.' });
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

      {/* Main Order Form View */}
      <div className="flex-1 flex flex-col overflow-y-auto px-5 py-3 space-y-4 pb-20">
        <div>
          <p className="text-gray-500 italic text-[11px] font-serif">Supplier Procurement</p>
          <h1 className="text-xl font-black tracking-tight text-gray-900 mt-0.5">Order Lists</h1>
        </div>

        {statusMsg && (
          <div className={`p-2 rounded-xl text-[11px] font-semibold ${statusMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : statusMsg.type === 'info' ? 'bg-blue-50 text-blue-800 border border-blue-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {statusMsg.text}
          </div>
        )}

        <div className="bg-[#F8F8F8] border border-gray-200 rounded-2xl p-3 space-y-2 text-xs">
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-7">
              <label className="block text-[9px] font-bold uppercase text-gray-400 mb-0.5">Supplier</label>
              <input
                type="text"
                placeholder="e.g. Inverarity, Matthew Clark"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className="w-full bg-white border border-gray-200 py-1.5 px-2 rounded-lg text-xs font-bold focus:outline-none"
              />
            </div>
            <div className="col-span-5">
              <label className="block text-[9px] font-bold uppercase text-gray-400 mb-0.5">Order Date</label>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="w-full bg-white border border-gray-200 py-1 px-1.5 rounded-lg text-xs font-bold focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Product Lookup */}
        <div className="space-y-1 relative">
          <label className="block text-[10px] font-bold uppercase text-gray-400 px-1">Lookup Catalog SKU to Order</label>
          <div className="relative">
            <input
              type="text"
              placeholder="Search product name or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#EDEDED] py-1.5 pl-3 pr-8 rounded-xl text-xs italic placeholder-gray-400 focus:outline-none"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {filteredCatalog.length > 0 && (
            <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
              {filteredCatalog.map(prod => (
                <button
                  key={prod.id}
                  type="button"
                  onClick={() => handleAddProductToOrder(prod)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 flex items-center justify-between"
                >
                  <div>
                    <span className="font-bold text-gray-900">{prod.name}</span>
                    <span className="text-[10px] text-gray-400 font-mono ml-2">[{prod.id}]</span>
                  </div>
                  <span className="text-[10px] text-gray-500">Par: {prod.par || 0}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Order Items List */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-bold uppercase text-gray-400 px-1">
            Order Items ({orderItems.length})
          </span>

          {orderItems.length === 0 ? (
            <div className="border border-dashed border-gray-200 rounded-2xl py-6 text-center text-xs text-gray-400">
              No items added to this order list yet.
            </div>
          ) : (
            <div className="border border-gray-200 rounded-2xl divide-y divide-gray-100 bg-white overflow-hidden shadow-sm">
              {orderItems.map((item) => (
                <div key={item.id} className="p-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-extrabold text-gray-900 block leading-tight text-[11px]">{item.name}</span>
                    <span className="text-[9px] text-gray-400 font-mono">
                      Current: {item.currentCount} • Par: {item.par} ({item.unit})
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      step="any"
                      value={item.orderQty}
                      onChange={(e) => handleQtyChange(item.id, e.target.value)}
                      className="w-16 bg-[#EDEDED] py-1 px-1.5 rounded-lg text-center font-bold text-xs focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveOrderItem(item.id)}
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

        {/* Submit to Order Lists Folder */}
        <button
          type="button"
          disabled={isSubmitting || orderItems.length === 0 || !supplier.trim()}
          onClick={handleSubmitOrder}
          className="w-full py-2.5 bg-black text-white hover:bg-neutral-800 disabled:opacity-40 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 shadow-sm"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>{isSubmitting ? 'Saving...' : 'Save Order List to Drive'}</span>
        </button>

        {savedFileUrl && (
          <a
            href={savedFileUrl}
            target="_blank"
            rel="noreferrer"
            className="w-full py-2 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-xl flex items-center justify-center space-x-1.5 font-bold hover:bg-emerald-100 transition text-[11px]"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            <span>Open Order File in Drive</span>
            <ExternalLink className="w-3 h-3 text-emerald-600 ml-1" />
          </a>
        )}
      </div>

      {/* Floating Bottom Nav */}
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