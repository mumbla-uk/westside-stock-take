import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, 
  Search, 
  Plus, 
  Trash2, 
  Save, 
  Download, 
  AlertTriangle, 
  ShieldAlert, 
  RefreshCw, 
  Sliders, 
  Users, 
  CheckSquare, 
  Database,
  Lock,
  Unlock,
  Check,
  X
} from 'lucide-react';
import { useTwoFingerSwipe } from './useTwoFingerSwipe';
import { supabase, localDb, DEFAULT_VENUE_ID } from './lib/db';

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

export default function Settings({ currentUser, onBackToHub, onLogout }) {
  const [activeTab, setActiveTab] = useState('catalog'); // 'catalog' | 'duties' | 'staff' | 'dev'
  const [devUnlocked, setDevUnlocked] = useState(false);
  const [devPasscode, setDevPasscode] = useState('');
  const [statusMsg, setStatusMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  // --- CATALOG MANAGER STATE ---
  const [catalog, setCatalog] = useState([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [editingSku, setEditingSku] = useState(null);
  const [skuForm, setSkuForm] = useState({
    id: '',
    name: '',
    unit: 'unit',
    par: 1,
    supplier: 'Tennents',
    area: 'Main Bar',
    category: 'General'
  });

  // --- DUTIES STATE ---
  const [duties, setDuties] = useState([]);
  const [newDutyText, setNewDutyText] = useState('');

  // --- STAFF STATE ---
  const [staff, setStaff] = useState([]);
  const [staffForm, setStaffForm] = useState({ name: '', role: 'Duty Manager', pin: '' });

  // --- DEV / BULK STATE ---
  const [wipeConfirmText, setWipeConfirmText] = useState('');

  const swipeHandlers = useTwoFingerSwipe({
    onSwipeRight: () => {
      if (onBackToHub) onBackToHub();
    }
  });

  // Load all operational config data
  const loadSettingsData = async () => {
    setLoading(true);
    try {
      const [catRes, dutyRes, staffRes] = await Promise.all([
        supabase.from('catalog_items').select('*').eq('venue_id', DEFAULT_VENUE_ID).order('name'),
        supabase.from('venue_duties').select('*').eq('venue_id', DEFAULT_VENUE_ID),
        supabase.from('staff').select('id, name, role, pin').eq('venue_id', DEFAULT_VENUE_ID)
      ]);

      if (catRes.data) setCatalog(catRes.data);
      if (dutyRes.data) setDuties(dutyRes.data);
      if (staffRes.data) setStaff(staffRes.data);
    } catch (err) {
      console.error("Failed loading settings:", err);
      setStatusMsg({ type: 'error', text: 'Error connecting to database config.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettingsData();
  }, []);

  // Filter Catalog
  const filteredCatalog = useMemo(() => {
    if (!catalogSearch.trim()) return catalog;
    const q = catalogSearch.toLowerCase();
    return catalog.filter(p => 
      (p.name || '').toLowerCase().includes(q) ||
      (p.id || '').toLowerCase().includes(q) ||
      (p.supplier || '').toLowerCase().includes(q) ||
      (p.area || '').toLowerCase().includes(q)
    );
  }, [catalog, catalogSearch]);

  // 1. SAVE SKU
  const handleSaveSku = async (e) => {
    e.preventDefault();
    if (!skuForm.id.trim() || !skuForm.name.trim()) return;

    try {
      const payload = {
        id: skuForm.id.trim(),
        venue_id: DEFAULT_VENUE_ID,
        name: skuForm.name.trim(),
        unit: skuForm.unit.trim() || 'unit',
        par: parseFloat(skuForm.par) || 0,
        supplier: skuForm.supplier.trim() || 'General',
        area: skuForm.area.trim() || 'Main Bar',
        category: skuForm.category.trim() || 'General'
      };

      const { error } = await supabase.from('catalog_items').upsert(payload, { onConflict: 'id' });
      if (error) throw error;

      setStatusMsg({ type: 'success', text: `Saved SKU ${payload.id} (${payload.name})` });
      setEditingSku(null);
      setSkuForm({ id: '', name: '', unit: 'unit', par: 1, supplier: 'Tennents', area: 'Main Bar', category: 'General' });
      loadSettingsData();
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Failed to update SKU.' });
    }
  };

  const handleDeleteSku = async (id) => {
    if (!window.confirm(`Delete SKU ${id} from catalog?`)) return;
    try {
      await supabase.from('catalog_items').delete().eq('id', id);
      setStatusMsg({ type: 'success', text: `Removed SKU ${id}` });
      loadSettingsData();
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Could not delete SKU.' });
    }
  };

  // 2. DUTIES MANAGER
  const handleAddDuty = async (e) => {
    e.preventDefault();
    if (!newDutyText.trim()) return;

    try {
      const { error } = await supabase.from('venue_duties').insert({
        venue_id: DEFAULT_VENUE_ID,
        duty_text: newDutyText.trim()
      });
      if (error) throw error;
      setNewDutyText('');
      loadSettingsData();
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Error adding duty.' });
    }
  };

  const handleDeleteDuty = async (dutyId) => {
    try {
      await supabase.from('venue_duties').delete().eq('id', dutyId);
      loadSettingsData();
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Could not remove duty.' });
    }
  };

  // 3. STAFF PIN MANAGER
  const handleAddStaff = async (e) => {
    e.preventDefault();
    if (!staffForm.name.trim() || staffForm.pin.length !== 4) {
      alert("Please enter a valid name and a 4-digit PIN.");
      return;
    }

    try {
      const { error } = await supabase.from('staff').insert({
        venue_id: DEFAULT_VENUE_ID,
        name: staffForm.name.trim(),
        role: staffForm.role.trim(),
        pin: staffForm.pin.trim()
      });
      if (error) throw error;
      setStaffForm({ name: '', role: 'Duty Manager', pin: '' });
      setStatusMsg({ type: 'success', text: `Staff member added.` });
      loadSettingsData();
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Error adding staff.' });
    }
  };

  const handleDeleteStaff = async (id) => {
    if (!window.confirm("Remove this staff member?")) return;
    try {
      await supabase.from('staff').delete().eq('id', id);
      loadSettingsData();
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Failed to delete staff.' });
    }
  };

  // 4. DEVELOPER BULK ACTIONS
  const handleExportJsonBackup = async () => {
    setLoading(true);
    setStatusMsg({ type: 'info', text: 'Creating full database dump...' });
    try {
      const [cat, snaps, orders, handovers, floats, ledgers, goods] = await Promise.all([
        supabase.from('catalog_items').select('*'),
        supabase.from('stocktake_snapshots').select('*'),
        supabase.from('supplier_orders').select('*'),
        supabase.from('handovers').select('*'),
        supabase.from('petty_cash_floats').select('*'),
        supabase.from('petty_weekly_ledgers').select('*'),
        supabase.from('goods_received').select('*')
      ]);

      const backup = {
        exportedAt: new Date().toISOString(),
        venue: "West Side Tavern",
        catalog: cat.data || [],
        stocktakeSnapshots: snaps.data || [],
        supplierOrders: orders.data || [],
        handovers: handovers.data || [],
        pettyFloats: floats.data || [],
        pettyLedgers: ledgers.data || [],
        goodsReceived: goods.data || []
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `WST_Supabase_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setStatusMsg({ type: 'success', text: 'Backup JSON downloaded safely!' });
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Backup failed.' });
    } finally {
      setLoading(false);
    }
  };

  // Safe table wipe
  const handleBulkPurgeTable = async (tableName, tableDisplayName) => {
    if (!window.confirm(`Are you SURE you want to purge all records from ${tableDisplayName}? This cannot be undone.`)) return;

    try {
      const { error } = await supabase.from(tableName).delete().neq('venue_id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
      setStatusMsg({ type: 'success', text: `Purged all records from ${tableDisplayName}.` });
    } catch (err) {
      setStatusMsg({ type: 'error', text: `Failed to wipe ${tableDisplayName}.` });
    }
  };

  // Full transactional test-data wipe
  const handleWipeAllTestData = async () => {
    if (wipeConfirmText !== 'WIPE-TEST-DATA') {
      alert("You must type WIPE-TEST-DATA exactly to proceed.");
      return;
    }

    setLoading(true);
    try {
      await Promise.all([
        supabase.from('stocktake_snapshots').delete().neq('venue_id', '00000000-0000-0000-0000-000000000000'),
        supabase.from('supplier_orders').delete().neq('venue_id', '00000000-0000-0000-0000-000000000000'),
        supabase.from('handovers').delete().neq('venue_id', '00000000-0000-0000-0000-000000000000'),
        supabase.from('goods_received').delete().neq('venue_id', '00000000-0000-0000-0000-000000000000'),
        supabase.from('petty_cash_floats').delete().neq('venue_id', '00000000-0000-0000-0000-000000000000'),
        supabase.from('petty_weekly_ledgers').delete().neq('venue_id', '00000000-0000-0000-0000-000000000000')
      ]);

      // Reset client indexedDB
      await localDb.pending_stock_counts.clear();
      localStorage.removeItem('wst_active_counts');
      localStorage.removeItem('wst_modified_ids');

      setWipeConfirmText('');
      setStatusMsg({ type: 'success', text: 'All test orders, handovers, floats and deliveries wiped cleanly.' });
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Error executing purge.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      {...swipeHandlers}
      className="flex flex-col h-screen w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 overflow-x-hidden relative"
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
          <span className="font-semibold text-base tracking-tight">Portal Configuration</span>
        </div>
        <div className="flex items-center space-x-3 text-xs font-medium">
          {onBackToHub ? (
            <button onClick={onBackToHub} className="text-gray-900 hover:text-black font-semibold">Hub</button>
          ) : (
            <button onClick={onLogout} className="text-gray-900 hover:text-black">Logout</button>
          )}
        </div>
      </header>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center px-5 py-2 border-b border-gray-200 bg-gray-50 space-x-1.5 overflow-x-auto scrollbar-none flex-shrink-0 text-xs font-bold">
        <button
          onClick={() => setActiveTab('catalog')}
          className={`flex items-center space-x-1 px-3 py-1.5 rounded-xl transition whitespace-nowrap ${
            activeTab === 'catalog' ? 'bg-black text-white shadow-sm' : 'text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Pars & SKUs</span>
        </button>

        <button
          onClick={() => setActiveTab('duties')}
          className={`flex items-center space-x-1 px-3 py-1.5 rounded-xl transition whitespace-nowrap ${
            activeTab === 'duties' ? 'bg-black text-white shadow-sm' : 'text-gray-600 hover:bg-gray-200'
          }`}
        >
          <CheckSquare className="w-3.5 h-3.5" />
          <span>Duties</span>
        </button>

        <button
          onClick={() => setActiveTab('staff')}
          className={`flex items-center space-x-1 px-3 py-1.5 rounded-xl transition whitespace-nowrap ${
            activeTab === 'staff' ? 'bg-black text-white shadow-sm' : 'text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Staff PINs</span>
        </button>

        <button
          onClick={() => setActiveTab('dev')}
          className={`flex items-center space-x-1 px-3 py-1.5 rounded-xl transition whitespace-nowrap ${
            activeTab === 'dev' ? 'bg-red-600 text-white shadow-sm' : 'text-red-700 bg-red-50 hover:bg-red-100'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>Dev Mode</span>
        </button>
      </div>

      {statusMsg && (
        <div className={`mx-5 my-2 p-2 rounded-xl text-xs font-semibold flex-shrink-0 ${
          statusMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 
          statusMsg.type === 'info' ? 'bg-blue-50 text-blue-800 border border-blue-200' : 
          'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {statusMsg.text}
        </div>
      )}

      {/* TAB 1: CATALOG & PAR LEVELS */}
      {activeTab === 'catalog' && (
        <div className="flex-1 flex flex-col overflow-hidden pb-20">
          <div className="p-4 border-b border-gray-100 space-y-2 flex-shrink-0 bg-white">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-[10px] font-mono uppercase text-gray-400 font-bold">Catalog Inventory</span>
                <h2 className="text-base font-black text-gray-900 leading-tight">Master Stock Items ({catalog.length})</h2>
              </div>
              <button
                onClick={() => {
                  setEditingSku(editingSku ? null : 'new');
                  setSkuForm({ id: `SKU-${Date.now().toString().slice(-4)}`, name: '', unit: 'bottle', par: 1, supplier: 'Tennents', area: 'Main Bar', category: 'General' });
                }}
                className="px-2.5 py-1 bg-black text-white hover:bg-neutral-800 rounded-lg text-xs font-bold transition flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{editingSku ? 'Close Form' : 'New Item'}</span>
              </button>
            </div>

            {/* SKU Add / Edit Drawer */}
            {editingSku && (
              <form onSubmit={handleSaveSku} className="bg-gray-50 border border-gray-200 rounded-2xl p-3 space-y-2 text-xs animate-in fade-in duration-150">
                <div className="grid grid-cols-12 gap-1.5">
                  <div className="col-span-4">
                    <label className="text-[9px] font-bold uppercase text-gray-400">SKU Code *</label>
                    <input
                      type="text"
                      required
                      value={skuForm.id}
                      onChange={(e) => setSkuForm({ ...skuForm, id: e.target.value })}
                      placeholder="SKU-101"
                      className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg font-mono text-xs font-bold text-gray-900"
                    />
                  </div>
                  <div className="col-span-8">
                    <label className="text-[9px] font-bold uppercase text-gray-400">Item Name *</label>
                    <input
                      type="text"
                      required
                      value={skuForm.name}
                      onChange={(e) => setSkuForm({ ...skuForm, name: e.target.value })}
                      placeholder="e.g. Tanqueray London Dry Gin"
                      className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg text-xs font-bold text-gray-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-1.5">
                  <div className="col-span-3">
                    <label className="text-[9px] font-bold uppercase text-gray-400">Par Level</label>
                    <input
                      type="number"
                      step="any"
                      value={skuForm.par}
                      onChange={(e) => setSkuForm({ ...skuForm, par: e.target.value })}
                      className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg font-mono text-xs font-bold text-center"
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="text-[9px] font-bold uppercase text-gray-400">Unit</label>
                    <input
                      type="text"
                      value={skuForm.unit}
                      onChange={(e) => setSkuForm({ ...skuForm, unit: e.target.value })}
                      placeholder="keg / bottle"
                      className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg text-xs"
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="text-[9px] font-bold uppercase text-gray-400">Supplier</label>
                    <input
                      type="text"
                      value={skuForm.supplier}
                      onChange={(e) => setSkuForm({ ...skuForm, supplier: e.target.value })}
                      placeholder="Tennents"
                      className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg text-xs"
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="text-[9px] font-bold uppercase text-gray-400">Area</label>
                    <input
                      type="text"
                      value={skuForm.area}
                      onChange={(e) => setSkuForm({ ...skuForm, area: e.target.value })}
                      placeholder="Main Bar"
                      className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg text-xs"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-1.5 bg-[#C2F19D] hover:bg-[#b2e88a] text-gray-900 font-bold rounded-lg text-xs transition flex items-center justify-center space-x-1"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Item to Catalog</span>
                </button>
              </form>
            )}

            <div className="relative">
              <input
                type="text"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Search items by SKU, name, supplier, area..."
                className="w-full bg-[#EDEDED] py-1.5 pl-3 pr-8 rounded-lg text-xs italic focus:outline-none"
              />
              {catalogSearch ? (
                <button onClick={() => setCatalogSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 divide-y divide-gray-100 text-xs">
            {filteredCatalog.map(p => (
              <div key={p.id} className="py-2.5 flex items-center justify-between">
                <div className="pr-2">
                  <span className="font-bold text-gray-900 block leading-tight text-[11px]">{p.name}</span>
                  <div className="flex items-center space-x-1.5 text-[9px] text-gray-400 font-mono mt-0.5">
                    <span className="bg-gray-100 px-1 rounded text-gray-600">{p.id}</span>
                    <span>•</span>
                    <span>Par: {p.par} ({p.unit})</span>
                    <span>•</span>
                    <span>{p.supplier}</span>
                    <span>•</span>
                    <span className="italic">{p.area || 'Main Bar'}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-1 flex-shrink-0">
                  <button
                    onClick={() => {
                      setEditingSku(p.id);
                      setSkuForm({
                        id: p.id,
                        name: p.name,
                        unit: p.unit || 'unit',
                        par: p.par || 0,
                        supplier: p.supplier || 'General',
                        area: p.area || 'Main Bar',
                        category: p.category || 'General'
                      });
                    }}
                    className="p-1.5 text-gray-500 hover:text-black bg-gray-100 hover:bg-gray-200 rounded-lg text-[10px] font-bold"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteSku(p.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: DUTIES MASTER LIST */}
      {activeTab === 'duties' && (
        <div className="flex-1 flex flex-col overflow-hidden pb-20 p-5 space-y-3">
          <div>
            <span className="text-[10px] font-mono uppercase text-gray-400 font-bold">Shift Routines</span>
            <h2 className="text-base font-black text-gray-900">Shift Handover Duties ({duties.length})</h2>
            <p className="text-[10px] text-gray-500">These populate autocomplete suggestions on the Duty Handover app.</p>
          </div>

          <form onSubmit={handleAddDuty} className="flex items-center space-x-1.5">
            <input
              type="text"
              value={newDutyText}
              onChange={(e) => setNewDutyText(e.target.value)}
              placeholder="e.g. Deep clean ice machine filter..."
              className="flex-1 bg-[#EDEDED] py-2 px-3 rounded-xl text-xs focus:outline-none"
            />
            <button
              type="submit"
              disabled={!newDutyText.trim()}
              className="py-2 px-3 bg-black hover:bg-neutral-800 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1"
            >
              <Plus className="w-3 h-3" />
              <span>Add</span>
            </button>
          </form>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-2xl bg-white">
            {duties.map(d => (
              <div key={d.id} className="p-3 flex items-center justify-between text-xs">
                <span className="font-semibold text-gray-800 text-[11px]">{d.duty_text}</span>
                <button
                  onClick={() => handleDeleteDuty(d.id)}
                  className="p-1 text-gray-400 hover:text-red-600 rounded"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: STAFF & PASSCODES */}
      {activeTab === 'staff' && (
        <div className="flex-1 flex flex-col overflow-hidden pb-20 p-5 space-y-3">
          <div>
            <span className="text-[10px] font-mono uppercase text-gray-400 font-bold">Access Control</span>
            <h2 className="text-base font-black text-gray-900">Staff & PIN Roster</h2>
            <p className="text-[10px] text-gray-500">Manage 4-digit passcodes for team terminal logins.</p>
          </div>

          <form onSubmit={handleAddStaff} className="bg-gray-50 border border-gray-200 rounded-2xl p-3 space-y-2 text-xs">
            <span className="font-bold text-[10px] uppercase text-gray-400 block">Add New Team Member</span>
            <div className="grid grid-cols-12 gap-1.5">
              <div className="col-span-5">
                <label className="text-[9px] font-bold uppercase text-gray-400">Name</label>
                <input
                  type="text"
                  required
                  placeholder="Manager Name"
                  value={staffForm.name}
                  onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
                  className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg font-bold text-xs"
                />
              </div>
              <div className="col-span-4">
                <label className="text-[9px] font-bold uppercase text-gray-400">Role</label>
                <input
                  type="text"
                  placeholder="Assistant GM"
                  value={staffForm.role}
                  onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}
                  className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg text-xs"
                />
              </div>
              <div className="col-span-3">
                <label className="text-[9px] font-bold uppercase text-gray-400">4-Digit PIN</label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  placeholder="****"
                  value={staffForm.pin}
                  onChange={(e) => setStaffForm({ ...staffForm, pin: e.target.value })}
                  className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg text-xs font-mono text-center font-bold"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-1.5 bg-black text-white hover:bg-neutral-800 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1"
            >
              <Plus className="w-3 h-3" />
              <span>Create Staff Login</span>
            </button>
          </form>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-2xl bg-white">
            {staff.map(s => (
              <div key={s.id} className="p-3 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-gray-900 block text-[11px]">{s.name}</span>
                  <span className="text-[9px] font-mono text-gray-400">{s.role}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded font-bold text-gray-600">••••</span>
                  <button
                    onClick={() => handleDeleteStaff(s.id)}
                    className="p-1 text-gray-400 hover:text-red-600 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: DEVELOPER BULK ACTIONS & PURGE CONTROLS */}
      {activeTab === 'dev' && (
        <div className="flex-1 flex flex-col overflow-y-auto pb-24 p-5 space-y-4 text-xs">
          {!devUnlocked ? (
            <div className="p-5 border-2 border-red-500/30 bg-red-50/20 rounded-3xl text-center space-y-3 my-auto">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-sm text-gray-900">Developer Access Protected</h3>
                <p className="text-[11px] text-gray-500 mt-0.5">Enter developer passcode to access database purge utilities.</p>
              </div>

              <div className="flex items-center space-x-2 max-w-[200px] mx-auto">
                <input
                  type="password"
                  placeholder="Passcode (1234)"
                  value={devPasscode}
                  onChange={(e) => setDevPasscode(e.target.value)}
                  className="w-full bg-white border border-gray-300 py-1.5 px-3 rounded-xl text-center font-mono font-bold text-sm focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (devPasscode === '1234') {
                      setDevUnlocked(true);
                      setDevPasscode('');
                    } else {
                      alert("Incorrect developer code.");
                    }
                  }}
                  className="py-1.5 px-3 bg-red-600 text-white rounded-xl font-bold"
                >
                  Unlock
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center bg-red-50 border border-red-200 p-3 rounded-2xl">
                <div className="flex items-center space-x-2 text-red-900">
                  <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0" />
                  <div>
                    <span className="font-black text-xs block">DEVELOPER CONTROLS ACTIVE</span>
                    <span className="text-[10px] text-red-700">Irreversible database actions enabled.</span>
                  </div>
                </div>
                <button
                  onClick={() => setDevUnlocked(false)}
                  className="p-1 text-gray-500 hover:text-black"
                >
                  <Lock className="w-4 h-4" />
                </button>
              </div>

              {/* SECTION: DATABASE BACKUP */}
              <div className="p-4 border border-gray-200 rounded-2xl space-y-2 bg-white shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">Fail-Safe Export</span>
                <h3 className="font-black text-xs text-gray-900">Download Full JSON Database Dump</h3>
                <p className="text-[11px] text-gray-500 leading-snug">
                  Exports every single table (catalog, stocktakes, order archives, handovers, floats, deliveries) to your local downloads folder.
                </p>
                <button
                  type="button"
                  onClick={handleExportJsonBackup}
                  disabled={loading}
                  className="w-full py-2 bg-black text-white hover:bg-neutral-800 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Download Backup File</span>
                </button>
              </div>

              {/* SECTION: SELECTIVE TABLE PURGES */}
              <div className="p-4 border border-gray-200 rounded-2xl space-y-2 bg-white shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">Selective Table Truncation</span>
                <p className="text-[11px] text-gray-500 leading-snug">
                  Purge transactional history module by module without affecting your catalog or staff roster.
                </p>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => handleBulkPurgeTable('stocktake_snapshots', 'Stocktakes')}
                    className="py-1.5 px-2 bg-gray-100 hover:bg-red-50 hover:text-red-700 text-gray-700 font-bold rounded-lg transition text-[11px] border border-gray-200"
                  >
                    Purge Stocktakes
                  </button>

                  <button
                    onClick={() => handleBulkPurgeTable('supplier_orders', 'Supplier Orders')}
                    className="py-1.5 px-2 bg-gray-100 hover:bg-red-50 hover:text-red-700 text-gray-700 font-bold rounded-lg transition text-[11px] border border-gray-200"
                  >
                    Purge Orders
                  </button>

                  <button
                    onClick={() => handleBulkPurgeTable('handovers', 'Duty Handover Diary')}
                    className="py-1.5 px-2 bg-gray-100 hover:bg-red-50 hover:text-red-700 text-gray-700 font-bold rounded-lg transition text-[11px] border border-gray-200"
                  >
                    Purge Handovers
                  </button>

                  <button
                    onClick={() => handleBulkPurgeTable('goods_received', 'Goods Deliveries')}
                    className="py-1.5 px-2 bg-gray-100 hover:bg-red-50 hover:text-red-700 text-gray-700 font-bold rounded-lg transition text-[11px] border border-gray-200"
                  >
                    Purge Deliveries
                  </button>
                </div>
              </div>

              {/* SECTION: FULL TEST-DATA NUKE */}
              <div className="p-4 border-2 border-red-200 bg-red-50/30 rounded-2xl space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-red-600 block">Nuclear Reset</span>
                <h3 className="font-black text-xs text-red-950">Wipe All Test Transactional Data</h3>
                <p className="text-[11px] text-red-800 leading-snug">
                  Wipes all test stock counts, saved order lists, handovers, petty cash ledgers, and deliveries. <strong>Your catalog items and staff logins will remain safe.</strong>
                </p>

                <div className="space-y-1.5 pt-1">
                  <label className="text-[9px] font-mono text-gray-500 uppercase block">Type <strong>WIPE-TEST-DATA</strong> to confirm:</label>
                  <input
                    type="text"
                    value={wipeConfirmText}
                    onChange={(e) => setWipeConfirmText(e.target.value)}
                    placeholder="WIPE-TEST-DATA"
                    className="w-full bg-white border border-red-300 py-1.5 px-3 rounded-xl font-mono text-xs font-bold text-red-700 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={wipeConfirmText !== 'WIPE-TEST-DATA' || loading}
                    onClick={handleWipeAllTestData}
                    className="w-full py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-xl text-xs font-black transition shadow-sm"
                  >
                    Confirm & Wipe All Test Records
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Floating Bottom Hub Return */}
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