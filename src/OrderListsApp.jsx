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
  ClipboardList,
  ExternalLink,
  CheckCircle2,
  ListTodo,
  FolderOpen,
  Layers,
  SlidersHorizontal,
  WifiOff,
  Upload as CloudUpload,
  Maximize2
} from 'lucide-react';
import { useTwoFingerSwipe } from './useTwoFingerSwipe';
import { supabase, localDb, DEFAULT_VENUE_ID } from './lib/db';
import { sendPushNotification } from './lib/notifications';
import SpeedCount from './SpeedCount';

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

function calculateOrderQty(parLevel, currentStock) {
  const par = Number(parLevel) || 0;
  const count = Number(currentStock) || 0;
  if (count <= 0.25) {
    return Math.max(1, Math.ceil(par - count));
  }
  return Math.max(0, Math.ceil(par - count));
}

export default function OrderListsApp({ currentUser, onBackToHub, onLogout }) {
  const [activeTab, setActiveTab] = useState('Stocktake');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSuppliers, setSelectedSuppliers] = useState([]);
  const [selectedAreas, setSelectedAreas] = useState([]);
  const [view, setView] = useState('main');
  const [detailedMode, setDetailedMode] = useState(false);
  const [speedCountOpen, setSpeedCountOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [hasUnsyncedCounts, setHasUnsyncedCounts] = useState(false);
  const [orderMode, setOrderMode] = useState(false);
  const [checkedItemIds, setCheckedItemIds] = useState(new Set());
  const [placedSuppliers, setPlacedSuppliers] = useState(new Set());
  const [lastOrderedMap, setLastOrderedMap] = useState({});
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [archiveTab, setArchiveTab] = useState('stocktakes');
  const [archiveStocktakes, setArchiveStocktakes] = useState([]);
  const [archiveOrders, setArchiveOrders] = useState([]);
  const [loadingArchive, setLoadingArchive] = useState(false);
  const [selectedRecordDetail, setSelectedRecordDetail] = useState(null);
  const [loadingRecordDetail, setLoadingRecordDetail] = useState(false);

  const [products, setProducts] = useState(() => {
    try {
      const cached = localStorage.getItem('wst_catalog_cache');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [counts, setCounts] = useState(() => {
    try {
      const cachedCounts = localStorage.getItem('wst_active_counts');
      return cachedCounts ? JSON.parse(cachedCounts) : {};
    } catch {
      return {};
    }
  });

  const [orderOverrides, setOrderOverrides] = useState({});
  const [copyFeedback, setCopyFeedback] = useState(null);
  const [modifiedIds, setModifiedIds] = useState(() => {
    try {
      const cached = localStorage.getItem('wst_modified_ids');
      return cached ? new Set(JSON.parse(cached)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [saving, setSaving] = useState(false);
  const [savingToDrive, setSavingToDrive] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  const { dayName, weekBeginningStr, fullDateStr } = useMemo(() => getFormattedDates(), []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    localDb.pending_stock_counts.count().then(cnt => {
      setHasUnsyncedCounts(cnt > 0);
    });
  }, [counts]);

  useEffect(() => {
    localStorage.setItem('wst_active_counts', JSON.stringify(counts));
    localStorage.setItem('wst_modified_ids', JSON.stringify(Array.from(modifiedIds)));
  }, [counts, modifiedIds]);

  const swipeHandlers = useTwoFingerSwipe({
    disabled: view === 'settings' || archiveModalOpen || Boolean(selectedRecordDetail) || speedCountOpen,
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

  const fetchCatalogData = async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from('catalog_items')
          .select('*')
          .eq('venue_id', DEFAULT_VENUE_ID)
          .order('name');
        if (error) throw error;
        if (data && data.length > 0) {
          setProducts(data);
          localStorage.setItem('wst_catalog_cache', JSON.stringify(data));
          await localDb.cached_catalog.bulkPut(data);
          setCounts(prevCounts => {
            const next = { ...prevCounts };
            data.forEach(p => {
              if (next[p.id] === undefined) {
                next[p.id] = Number(p.count) || 0;
              }
            });
            return next;
          });
        }
      } else {
        const offlineData = await localDb.cached_catalog.toArray();
        if (offlineData.length > 0) setProducts(offlineData);
      }
    } catch (err) {
      console.warn("Catalog fetch error:", err);
      const offlineData = await localDb.cached_catalog.toArray();
      if (offlineData.length > 0) setProducts(offlineData);
      setStatusMsg({ type: 'info', text: 'Loaded catalog from offline storage.' });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchCatalogData();
  }, []);

  const fetchFolderArchives = async () => {
    setLoadingArchive(true);
    try {
      const [snapRes, orderRes] = await Promise.all([
        supabase
          .from('stocktake_snapshots')
          .select('id, date_str, manager_name, logged_at')
          .eq('venue_id', DEFAULT_VENUE_ID)
          .order('logged_at', { ascending: false })
          .limit(20),
        supabase
          .from('supplier_orders')
          .select('id, supplier_name, order_date, manager_name, is_placed, created_at')
          .eq('venue_id', DEFAULT_VENUE_ID)
          .order('created_at', { ascending: false })
          .limit(20)
      ]);

      if (snapRes.data) {
        setArchiveStocktakes(snapRes.data.map(s => ({
          id: s.id,
          name: `Stocktake - ${s.date_str} - ${s.manager_name}`,
          date: s.logged_at ? new Date(s.logged_at).toLocaleString('en-GB') : s.date_str
        })));
      }
      if (orderRes.data) {
        setArchiveOrders(orderRes.data.map(o => ({
          id: o.id,
          name: `Order - ${o.supplier_name} - ${o.order_date}${o.is_placed ? ' (PLACED)' : ''}`,
          date: o.created_at ? new Date(o.created_at).toLocaleString('en-GB') : o.order_date
        })));
      }
    } catch (err) {
      console.error("Could not fetch archives:", err);
    } finally {
      setLoadingArchive(false);
    }
  };

  const handleOpenRecordDetail = async (file) => {
    setLoadingRecordDetail(true);
    setSelectedRecordDetail({ title: file.name, loading: true });
    try {
      if (archiveTab === 'stocktakes') {
        const { data, error } = await supabase
          .from('stocktake_snapshots')
          .select('*')
          .eq('id', file.id)
          .single();
        if (error) throw error;
        setSelectedRecordDetail({
          title: file.name,
          meta: {
            "Counted By": data.manager_name,
            "Date": data.date_str,
            "Logged At": new Date(data.logged_at).toLocaleString('en-GB')
          },
          items: data.items || []
        });
      } else {
        const { data, error } = await supabase
          .from('supplier_orders')
          .select('*')
          .eq('id', file.id)
          .single();
        if (error) throw error;
        setSelectedRecordDetail({
          title: file.name,
          meta: {
            "Supplier": data.supplier_name,
            "Ordered By": data.manager_name,
            "Status": data.is_placed ? "PLACED" : "PENDING",
            "Date": data.order_date
          },
          items: (data.items || []).map(it => ({
            name: it.name,
            sku: it.sku || it.id,
            qty: it.orderQty,
            unit: it.unit,
            par: it.par
          }))
        });
      }
    } catch (err) {
      console.error("Error reading file detail:", err);
    } finally {
      setLoadingRecordDetail(false);
    }
  };

  const updateCount = (id, delta) => {
    setModifiedIds(prev => new Set(prev).add(id));
    setCounts(prev => {
      const rawCurrent = prev[id] ?? 0;
      const nextVal = Math.max(0, Math.round((rawCurrent + delta) * 10) / 10);
      const prod = products.find(p => p.id === id);
      const par = prod ? (prod.par ?? 0) : 0;
      setOrderOverrides(orderPrev => ({
        ...orderPrev,
        [id]: calculateOrderQty(par, nextVal)
      }));
      localDb.pending_stock_counts.put({
        id,
        count: nextVal,
        updatedAt: new Date().toISOString()
      });
      return { ...prev, [id]: nextVal };
    });
  };

  const updateOrderAmount = (id, delta) => {
    setOrderOverrides(prev => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 0) + delta) }));
  };

  const toggleCheckItem = (id) => {
    setCheckedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSaveToSheet = async () => {
    setSaving(true);
    setStatusMsg(null);
    const timestamp = new Date().toISOString();
    const dateStr = timestamp.slice(0, 10);
    const managerName = currentUser?.name || 'Duty Manager';

    const countList = products.map(p => ({
      id: p.id,
      name: p.name,
      count: counts[p.id] ?? 0,
      unit: p.unit || 'unit',
      par: p.par || 0,
      supplier: p.supplier || 'General',
      area: p.area || 'Main Bar'
    }));

    await localDb.pending_stock_counts.bulkPut(
      countList.map(it => ({ id: it.id, count: it.count, updatedAt: timestamp }))
    );

    if (!navigator.onLine) {
      setStatusMsg({
        type: 'info',
        text: 'Offline: Counts saved safely to phone disk. Will sync on reconnection.'
      });
      setSaving(false);
      return;
    }

    try {
      const updates = countList.map(it => ({
        id: it.id,
        venue_id: DEFAULT_VENUE_ID,
        name: it.name,
        count: it.count,
        unit: it.unit,
        par: it.par,
        supplier: it.supplier,
        area: it.area,
        updated_at: timestamp
      }));

      const { error: upsertErr } = await supabase
        .from('catalog_items')
        .upsert(updates, { onConflict: 'id' });
      if (upsertErr) throw upsertErr;

      const { error: snapErr } = await supabase
        .from('stocktake_snapshots')
        .insert({
          venue_id: DEFAULT_VENUE_ID,
          date_str: dateStr,
          manager_name: managerName,
          items: countList
        });
      if (snapErr) throw snapErr;

      await localDb.pending_stock_counts.clear();
      setHasUnsyncedCounts(false);
      setStatusMsg({ type: 'success', text: 'Stocktake saved & database updated!' });
    } catch (err) {
      console.error("Save stocktake error:", err);
      setStatusMsg({ type: 'info', text: 'Saved to phone storage. Cloud sync will retry on reconnect.' });
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
        const orderQty = orderOverrides[p.id] ?? calculateOrderQty(p.par ?? 0, counts[p.id] ?? 0);
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

  const handleSaveSupplierOrder = async (supplierName, items, isPlaced = false) => {
    setSavingToDrive(true);
    const managerName = currentUser?.name || 'Duty Manager';
    const orderDate = new Date().toISOString().slice(0, 10);
    try {
      const orderPayload = {
        venue_id: DEFAULT_VENUE_ID,
        supplier_name: supplierName,
        order_date: orderDate,
        manager_name: managerName,
        is_placed: isPlaced,
        placed_at: isPlaced ? new Date().toISOString() : null,
        items: items.map(it => ({
          sku: it.id,
          name: it.name,
          orderQty: it.orderQty,
          unit: it.unit || 'unit',
          par: it.par || 0,
          currentCount: counts[it.id] ?? 0,
          checked: checkedItemIds.has(it.id)
        }))
      };

      const { error } = await supabase.from('supplier_orders').insert(orderPayload);
      if (error) throw error;

      if (isPlaced) {
        setPlacedSuppliers(prev => new Set(prev).add(supplierName));
        setLastOrderedMap(prev => ({
          ...prev,
          [supplierName]: { dateStr: orderDate, isPlaced: true }
        }));
        sendPushNotification(
          `Order Placed: ${supplierName}`,
          `${managerName} placed the order (${items.length} lines)`,
          null,
          { module: 'orders' }
        );
      }

      setStatusMsg({
        type: 'success',
        text: isPlaced ? `${supplierName} marked placed!` : `${supplierName} order saved!`
      });
    } catch (err) {
      console.error("Order save error:", err);
      setStatusMsg({ type: 'error', text: 'Error saving order to database.' });
    } finally {
      setSavingToDrive(false);
    }
  };

  const handleSaveAllOrders = async (isPlaced = false) => {
    const suppliers = Object.keys(ordersBySupplier);
    if (suppliers.length === 0) return;
    setSavingToDrive(true);
    const managerName = currentUser?.name || 'Duty Manager';
    const orderDate = new Date().toISOString().slice(0, 10);
    try {
      const inserts = suppliers.map(sup => ({
        venue_id: DEFAULT_VENUE_ID,
        supplier_name: sup,
        order_date: orderDate,
        manager_name: managerName,
        is_placed: isPlaced,
        placed_at: isPlaced ? new Date().toISOString() : null,
        items: ordersBySupplier[sup].map(it => ({
          sku: it.id,
          name: it.name,
          orderQty: it.orderQty,
          unit: it.unit || 'unit',
          par: it.par || 0,
          currentCount: counts[it.id] ?? 0,
          checked: checkedItemIds.has(it.id)
        }))
      }));

      const { error } = await supabase.from('supplier_orders').insert(inserts);
      if (error) throw error;

      if (isPlaced) {
        setPlacedSuppliers(new Set(suppliers));
        sendPushNotification(
          "All Orders Placed",
          `${managerName} finalized all supplier orders`,
          null,
          { module: 'orders' }
        );
      }

      setStatusMsg({
        type: 'success',
        text: isPlaced ? "All orders placed & team notified!" : "All orders saved!"
      });
    } catch (err) {
      console.error("Save all error:", err);
      setStatusMsg({ type: 'error', text: 'Failed to record orders.' });
    } finally {
      setSavingToDrive(false);
    }
  };

  return (
    <div
      {...swipeHandlers}
      className="flex flex-col h-screen w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 overflow-x-hidden relative select-none"
    >
      {/* Top Header */}
      <header className="flex items-center justify-between px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-2 border-b border-gray-100 flex-shrink-0 bg-white z-20">
        <div className="flex items-center space-x-2">
          {onBackToHub && (
            <button onClick={onBackToHub} className="mr-0.5 p-1 -ml-1 text-gray-500 hover:text-black rounded-lg transition" title="Return to Hub">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <AppLogo className="w-6 h-6" fallbackTextClass="font-serif text-2xl font-bold tracking-tighter" />
          <span className="font-semibold text-base tracking-tight">West Side Tavern</span>
          {!isOnline ? (
            <span className="flex items-center space-x-1 text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
              <WifiOff className="w-2.5 h-2.5" />
              <span>Offline</span>
            </span>
          ) : hasUnsyncedCounts ? (
            <span className="flex items-center space-x-1 text-[9px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full">
              <CloudUpload className="w-2.5 h-2.5 animate-pulse" />
              <span>Disk</span>
            </span>
          ) : null}
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

      {/* Main Stocktake View */}
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
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
              <div>
                <span className="text-[9px] uppercase font-bold text-gray-400 block">Database & Storage</span>
                <p className="text-xs font-bold text-gray-900">Supabase Connected Engine</p>
              </div>
              <p className="text-[10px] text-gray-500 leading-tight">
                Operating with local IndexedDB cache buffer and PostgreSQL persistence.
              </p>
              <button
                type="button"
                onClick={() => {
                  localDb.pending_stock_counts.clear();
                  localStorage.removeItem('wst_active_counts');
                  localStorage.removeItem('wst_modified_ids');
                  setCounts({});
                  setModifiedIds(new Set());
                  setStatusMsg({ type: 'success', text: 'Local disk cache reset cleanly.' });
                }}
                className="w-full py-2 bg-gray-200 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-300 transition"
              >
                Clear Local Session Cache
              </button>
            </div>
            <button onClick={() => setView('main')} className="w-full py-2.5 bg-[#C2F19D] text-xs font-semibold rounded-lg text-gray-900 hover:bg-[#b2e88a] transition">
              Back to Stocktake
            </button>
          </div>
        </div>
      ) : activeTab === 'Orders' ? (
        <div className="flex-1 flex flex-col overflow-hidden pb-20">
          <div className="px-5 pt-3 pb-2 border-b border-gray-100 flex-shrink-0">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-black tracking-tight text-gray-900 leading-tight">Orders</h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-bold">
                  {modifiedIds.size} counted
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setArchiveModalOpen(true);
                    fetchFolderArchives();
                  }}
                  className="p-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 transition"
                  title="View Saved Archives & Order Lists"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-gray-700" />
                </button>
                <button
                  type="button"
                  onClick={() => setOrderMode(!orderMode)}
                  className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition ${
                    orderMode
                      ? 'bg-black text-white border-black shadow-sm'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <ListTodo className="w-3 h-3 text-emerald-400" />
                  <span>{orderMode ? 'Order Mode' : 'Normal'}</span>
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-[10px] text-gray-400 font-mono">
                {Object.keys(ordersBySupplier).length} Suppliers active
              </span>
              <div className="flex items-center space-x-1.5">
                <button
                  onClick={handleCopyAll}
                  disabled={Object.keys(ordersBySupplier).length === 0}
                  className="p-1.5 bg-[#F3F3F3] hover:bg-gray-200 disabled:opacity-30 rounded-lg text-gray-800 transition"
                  title="Copy All Orders"
                >
                  {copyFeedback === 'ALL' ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button
                  disabled={savingToDrive || Object.keys(ordersBySupplier).length === 0}
                  onClick={() => handleSaveAllOrders(false)}
                  className="px-2.5 py-1 bg-[#F3F3F3] hover:bg-gray-200 disabled:opacity-30 rounded-lg text-[10px] font-bold text-gray-800 transition"
                >
                  Save All
                </button>
                {orderMode && (
                  <button
                    disabled={savingToDrive || Object.keys(ordersBySupplier).length === 0}
                    onClick={() => handleSaveAllOrders(true)}
                    className="flex items-center space-x-1 px-2.5 py-1 bg-black text-white hover:bg-neutral-800 disabled:opacity-30 rounded-lg text-[10px] font-bold transition shadow-sm"
                  >
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>All Orders Placed</span>
                  </button>
                )}
              </div>
            </div>
            {statusMsg && (
              <div className={`p-2 rounded-xl text-[11px] font-semibold mt-2 ${statusMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : statusMsg.type === 'info' ? 'bg-blue-50 text-blue-800 border border-blue-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
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
                const isSupplierPlaced = placedSuppliers.has(supplier);
                const lastOrderInfo = lastOrderedMap[supplier];
                return (
                  <div key={supplier} className={`border rounded-2xl overflow-hidden bg-white shadow-sm transition-all ${isSupplierPlaced ? 'border-emerald-300 bg-emerald-50/10' : 'border-gray-200'}`}>
                    <div className="bg-[#F8F8F8] px-3.5 py-2 flex items-center justify-between border-b border-gray-200">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs font-black text-gray-900 uppercase tracking-wide">{supplier}</span>
                        <span className="text-[10px] text-gray-500 font-mono font-bold">({totalUnits} units)</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => handleCopySupplier(supplier, items)}
                          className="p-1 bg-white border border-gray-200 rounded-md text-gray-800 hover:bg-gray-50 transition"
                          title={`Copy ${supplier} order`}
                        >
                          {copyFeedback === supplier ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                        </button>
                        <button
                          disabled={savingToDrive}
                          onClick={() => handleSaveSupplierOrder(supplier, items, false)}
                          className="px-2 py-0.5 bg-white border border-gray-200 rounded-md text-[10px] font-bold text-gray-800 hover:bg-gray-50 transition"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {items.map(item => {
                        const isChecked = checkedItemIds.has(item.id);
                        return (
                          <div
                            key={item.id}
                            onClick={() => { if (orderMode) toggleCheckItem(item.id); }}
                            className={`grid grid-cols-12 items-center px-3.5 py-2 text-xs transition-colors ${
                              orderMode ? 'cursor-pointer hover:bg-gray-50' : ''
                            } ${isChecked && orderMode ? 'bg-emerald-50/30 opacity-75' : ''}`}
                          >
                            <div className="col-span-7 pr-2 flex items-center space-x-2">
                              {orderMode && (
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleCheckItem(item.id)}
                                  className="w-3.5 h-3.5 rounded text-black border-gray-300 focus:ring-0 cursor-pointer"
                                />
                              )}
                              <div>
                                <span className={`font-bold block leading-tight text-[11px] ${isChecked && orderMode ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                                  {item.name}
                                </span>
                                <span className="text-[9px] text-gray-400 italic font-mono">
                                  {item.id} | Par: {item.par} | Count: {counts[item.id] ?? 0}
                                </span>
                              </div>
                            </div>
                            <div className="col-span-5 flex items-center justify-end space-x-1">
                              {!orderMode ? (
                                <>
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
                                </>
                              ) : (
                                <span className="font-mono text-xs font-bold px-2 py-0.5 bg-gray-100 rounded text-gray-800">
                                  {item.orderQty} {item.unit}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="px-3.5 py-2 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between text-[10px]">
                      <span className="text-gray-400 font-mono italic">
                        {lastOrderInfo?.dateStr ? `Last ordered: ${lastOrderInfo.dateStr}` : 'Last ordered: No prior record'}
                      </span>
                      {orderMode && (
                        <button
                          disabled={savingToDrive || isSupplierPlaced}
                          onClick={() => handleSaveSupplierOrder(supplier, items, true)}
                          className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-[10px] font-bold transition shadow-sm ${
                            isSupplierPlaced
                              ? 'bg-emerald-100 text-emerald-800 cursor-not-allowed'
                              : 'bg-black text-white hover:bg-neutral-800'
                          }`}
                        >
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>{isSupplierPlaced ? 'Placed' : 'Mark Order Placed'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* Stocktake Tab */
        <div className="flex-1 flex flex-col overflow-hidden pb-20">
          {/* Header Row: Title + Archive + Refresh */}
          <div className="px-5 pt-3 pb-1 flex justify-between items-baseline flex-shrink-0">
            <div>
              <p className="text-gray-500 italic text-[11px] font-serif">Stocktake</p>
              <h1 className="text-base font-extrabold tracking-tight text-gray-900 mt-0.5 leading-snug">
                Week beginning {weekBeginningStr}
              </h1>
            </div>
            <div className="flex items-center space-x-1.5">
              <button
                onClick={() => {
                  setArchiveModalOpen(true);
                  fetchFolderArchives();
                }}
                className="p-1.5 text-gray-700 hover:text-black rounded-lg bg-gray-50 border border-gray-200"
                title="View Archives"
              >
                <FolderOpen className="w-3.5 h-3.5" />
              </button>
              <button onClick={fetchCatalogData} className="p-1.5 text-gray-500 hover:text-black rounded-lg bg-gray-50 border border-gray-100" title="Sync with Database">
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

          {/* CLEANED UP STATUS & CONTROLS SUB-BAR (No Crowding, No Width Jumps) */}
          <div className="flex items-center justify-between px-5 py-2 flex-shrink-0 bg-white">
            {/* Left: Day Badge & Count Counter */}
            <div className="flex items-center space-x-2">
              <span className="bg-[#F3F3F3] font-black px-2.5 py-1 rounded-lg text-[10px] text-gray-800 tracking-wider uppercase">
                {dayName}
              </span>
              <span className="text-[10px] text-gray-500 font-mono font-semibold">
                {modifiedIds.size} counted
              </span>
            </div>

            {/* Right: Fixed-Width Mode Toggle, Clear & Save */}
            <div className="flex items-center space-x-1.5">
              {/* Fixed-Width Toggle Button (w-[76px]) Prevents Layout Shifting */}
              <button
                type="button"
                onClick={() => setDetailedMode(!detailedMode)}
                className={`w-[78px] py-1 rounded-lg text-[10px] font-bold border transition text-center flex items-center justify-center space-x-1 ${
                  detailedMode
                    ? 'bg-black text-white border-black shadow-xs'
                    : 'bg-[#EDEDED] text-gray-700 border-transparent hover:bg-gray-200'
                }`}
                title="Toggle Decimal Precision"
              >
                <SlidersHorizontal className="w-2.5 h-2.5 text-emerald-400" />
                <span>{detailedMode ? '0.1 Mode' : 'Standard'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCounts({});
                  setModifiedIds(new Set());
                  localStorage.removeItem('wst_active_counts');
                  localStorage.removeItem('wst_modified_ids');
                }}
                className="px-2 py-1 text-gray-400 hover:text-black rounded-lg text-[10px] font-bold transition"
                title="Clear current counts"
              >
                Clear
              </button>

              <button
                onClick={handleSaveToSheet}
                disabled={saving}
                className="flex items-center space-x-1 px-3 py-1 bg-[#C2F19D] hover:bg-[#b2e88a] rounded-lg text-xs font-black text-gray-900 transition shadow-xs flex-shrink-0"
              >
                <span>{saving ? 'Saving...' : 'Save Stocktake'}</span>
              </button>
            </div>
          </div>

          {/* Search & Filter Pills */}
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

          {/* Table Headers */}
          <div className="grid grid-cols-12 px-5 py-1.5 border-b border-gray-100 text-[11px] font-bold text-gray-900 mt-1 flex-shrink-0">
            <span className={detailedMode ? "col-span-4" : "col-span-5"}>Stock Item</span>
            <span className={detailedMode ? "col-span-2 text-center" : "col-span-2 text-center"}>Order</span>
            <span className={detailedMode ? "col-span-2 text-center" : "col-span-2 text-center"}>Par</span>
            <span className={detailedMode ? "col-span-4 text-center" : "col-span-3 text-center"}>
              {detailedMode ? "Count (+1 / +0.1)" : "Count"}
            </span>
          </div>

          {/* Table Body */}
          <div className="flex-1 overflow-y-auto px-5 divide-y divide-gray-100">
            {filteredProducts.length === 0 ? (
              <p className="text-center py-8 text-xs text-gray-500">No matching products found.</p>
            ) : (
              filteredProducts.map(product => {
                const currentCount = counts[product.id] ?? 0;
                const orderAmt = orderOverrides[product.id] ?? calculateOrderQty(product.par ?? 0, currentCount);
                const isModified = modifiedIds.has(product.id);
                return (
                  <div key={product.id} className={`grid grid-cols-12 items-center py-2 text-xs transition-colors ${isModified ? 'bg-[#FAFCF8] border-l-2 border-black pl-2 -ml-2 pr-1' : ''}`}>
                    <div className={`${detailedMode ? "col-span-4" : "col-span-5"} pr-1`}>
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
                    <div className={`${detailedMode ? "col-span-4" : "col-span-3"} flex items-center justify-end space-x-1`}>
                      {detailedMode ? (
                        <div className="flex items-center space-x-1">
                          <div className="flex flex-col space-y-0.5">
                            <button
                              onClick={() => updateCount(product.id, 1)}
                              className="px-1 py-0.5 bg-gray-100 hover:bg-gray-200 text-[9px] font-bold rounded"
                              title="+1 Whole Unit"
                            >
                              +1
                            </button>
                            <button
                              onClick={() => updateCount(product.id, -1)}
                              className="px-1 py-0.5 bg-gray-100 hover:bg-gray-200 text-[9px] font-bold rounded"
                              title="-1 Whole Unit"
                            >
                              -1
                            </button>
                          </div>
                          <span className={`w-9 py-1 text-center rounded text-xs transition-colors font-mono font-bold ${isModified ? 'bg-[#D9EECD] text-black' : 'bg-[#EDEDED] text-gray-700'}`}>
                            {Number(currentCount).toFixed(1)}
                          </span>
                          <div className="flex flex-col space-y-0.5">
                            <button
                              onClick={() => updateCount(product.id, 0.1)}
                              className="px-1 py-0.5 bg-gray-100 hover:bg-gray-200 text-[8px] font-bold rounded"
                              title="+0.1 Tenth"
                            >
                              +.1
                            </button>
                            <button
                              onClick={() => updateCount(product.id, -0.1)}
                              className="px-1 py-0.5 bg-gray-100 hover:bg-gray-200 text-[8px] font-bold rounded"
                              title="-0.1 Tenth"
                            >
                              -.1
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button onClick={() => updateCount(product.id, -1)} className="p-0.5 text-gray-800 hover:bg-gray-100 rounded transition">
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className={`w-6 py-0.5 text-center rounded text-xs transition-colors font-mono ${isModified ? 'bg-[#D9EECD] text-black font-bold' : 'bg-[#EDEDED] text-gray-600 font-medium'}`}>
                            {currentCount}
                          </span>
                          <button onClick={() => updateCount(product.id, 1)} className="p-0.5 text-gray-800 hover:bg-gray-100 rounded transition">
                            <Plus className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Floating Action Button for Speed Count Mode */}
      {activeTab === 'Stocktake' && view === 'main' && (
        <div className="fixed bottom-16 right-5 z-30">
          <button
            onClick={() => setSpeedCountOpen(true)}
            className="w-13 h-13 rounded-full bg-black hover:bg-neutral-800 text-white shadow-xl flex items-center justify-center transition active:scale-95 border border-white/10"
            title="Open Fullscreen Speed Count Keypad"
            aria-label="Speed Count"
          >
            <Maximize2 className="w-5 h-5 text-emerald-400 stroke-[2.2]" />
          </button>
        </div>
      )}

      {/* Archive Inspection Modal */}
      {archiveModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border border-gray-200 flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <span className="text-[9px] font-mono uppercase font-bold text-gray-400">Database Archive</span>
                <h2 className="text-sm font-black text-gray-900 leading-tight mt-0.5">Compiled Records</h2>
              </div>
              <button
                onClick={() => setArchiveModalOpen(false)}
                className="p-1 text-gray-400 hover:text-black bg-white rounded-full border border-gray-200 shadow-sm"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="px-5 pt-3 pb-2 border-b border-gray-100 flex space-x-2">
              <button
                onClick={() => setArchiveTab('stocktakes')}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 ${
                  archiveTab === 'stocktakes' ? 'bg-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <ClipboardList className="w-3 h-3" />
                <span>Saved Stocktakes</span>
              </button>
              <button
                onClick={() => setArchiveTab('orders')}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 ${
                  archiveTab === 'orders' ? 'bg-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>Order Lists</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3 divide-y divide-gray-100 text-xs">
              {loadingArchive ? (
                <p className="text-center py-8 text-gray-400 italic">Reading records from database...</p>
              ) : archiveTab === 'stocktakes' ? (
                archiveStocktakes.length === 0 ? (
                  <p className="text-center py-8 text-gray-400 italic">No compiled stocktakes found.</p>
                ) : (
                  archiveStocktakes.map(file => (
                    <div
                      key={file.id}
                      onClick={() => handleOpenRecordDetail(file)}
                      className="py-2.5 flex items-center justify-between hover:bg-gray-50 cursor-pointer rounded-lg px-1 transition"
                    >
                      <div className="pr-2">
                        <span className="font-bold text-gray-900 block leading-tight text-[11px]">{file.name}</span>
                        <span className="text-[9px] text-gray-400 font-mono">{file.date}</span>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    </div>
                  ))
                )
              ) : (
                archiveOrders.length === 0 ? (
                  <p className="text-center py-8 text-gray-400 italic">No compiled orders found.</p>
                ) : (
                  archiveOrders.map(file => (
                    <div
                      key={file.id}
                      onClick={() => handleOpenRecordDetail(file)}
                      className="py-2.5 flex items-center justify-between hover:bg-gray-50 cursor-pointer rounded-lg px-1 transition"
                    >
                      <div className="pr-2">
                        <span className="font-bold text-gray-900 block leading-tight text-[11px]">{file.name}</span>
                        <span className="text-[9px] text-gray-400 font-mono">{file.date}</span>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    </div>
                  ))
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Record Inspector Drawer */}
      {selectedRecordDetail && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border border-gray-200 flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex justify-between items-start bg-gray-50">
              <div>
                <span className="text-[9px] font-mono uppercase font-bold text-gray-400">Record Inspection</span>
                <h2 className="text-sm font-black text-gray-900 leading-tight mt-0.5">{selectedRecordDetail.title}</h2>
              </div>
              <button
                onClick={() => setSelectedRecordDetail(null)}
                className="p-1 text-gray-400 hover:text-black bg-white rounded-full border border-gray-200 shadow-sm"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3 text-xs">
              {loadingRecordDetail ? (
                <p className="text-center py-12 text-gray-400 italic">Loading record contents...</p>
              ) : (
                <>
                  {selectedRecordDetail.meta && Object.keys(selectedRecordDetail.meta).length > 0 && (
                    <div className="grid grid-cols-2 gap-1.5 p-2.5 bg-gray-50 rounded-xl border border-gray-100 text-[10px]">
                      {Object.entries(selectedRecordDetail.meta).map(([k, v]) => (
                        <div key={k}>
                          <span className="text-gray-400 font-bold block uppercase text-[8px]">{k}</span>
                          <span className="text-gray-800 font-semibold">{v}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100 bg-white">
                    <div className="grid grid-cols-12 bg-gray-50 px-3 py-1.5 text-[9px] font-bold text-gray-400 uppercase">
                      <span className="col-span-8">Product / Item</span>
                      <span className="col-span-4 text-right">Qty / Par</span>
                    </div>
                    {(selectedRecordDetail.items || []).map((it, idx) => (
                      <div key={idx} className="grid grid-cols-12 items-center px-3 py-2 text-[11px]">
                        <div className="col-span-8 pr-1">
                          <span className="font-bold text-gray-900 block leading-tight">{it.name}</span>
                          <span className="text-[9px] text-gray-400 font-mono">{it.sku}</span>
                        </div>
                        <div className="col-span-4 text-right font-mono">
                          <span className="font-bold text-black">{it.qty} {it.unit}</span>
                          {it.par !== "" && it.par !== undefined && <span className="text-[9px] text-gray-400 block font-normal">Par: {it.par}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Bottom Nav */}
      <nav className="fixed bottom-2 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[390px] z-20 rounded-2xl bg-[#111111]/95 backdrop-blur-md text-white py-2 px-3 flex justify-around items-center text-xs font-semibold shadow-2xl border border-white/10 select-none pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
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

      {/* Dedicated SpeedCount Component */}
      {speedCountOpen && (
        <SpeedCount
          products={filteredProducts.length > 0 ? filteredProducts : products}
          counts={counts}
          initialArea={selectedAreas[0] || null}
          onUpdateCount={(id, val) => {
            setModifiedIds(prev => new Set(prev).add(id));
            setCounts(prev => ({ ...prev, [id]: val }));
            localDb.pending_stock_counts.put({
              id,
              count: val,
              updatedAt: new Date().toISOString()
            });
          }}
          onClose={() => setSpeedCountOpen(false)}
        />
      )}
    </div>
  );
}