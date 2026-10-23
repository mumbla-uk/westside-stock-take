import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Camera, 
  FileText, 
  Check, 
  Search, 
  X, 
  Calendar, 
  ExternalLink,
  ChevronRight,
  FileSpreadsheet,
  FileCheck,
  RefreshCw,
  Clock
} from 'lucide-react';

const HARDWIRED_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzcrqf4q-QWiGq0sxMmXqS7QcsxCVfhkJgPfjxOm6KyPShNUD-zkD9HUZy49rDdrfAYJg/exec";
const FLOAT_TARGET = 1200.00;

const DENOMINATIONS = [
  { id: 'n50', label: '£50' },
  { id: 'n20', label: '£20' },
  { id: 'n10', label: '£10' },
  { id: 'n5',  label: '£5' },
  { id: 'c1',  label: '£1' },
  { id: 'c50p', label: '50p' },
  { id: 'c20p', label: '20p' },
  { id: 'c10p', label: '10p' },
  { id: 'c5p',  label: '5p' },
  { id: 'c2p',  label: '2p' },
  { id: 'c1p',  label: '1p' }
];

const COMMON_VENDORS = [
  "Partick Superstore",
  "Laundry",
  "Sainsbury's",
  "Tesco",
  "M&S",
  "Ice 24/7",
  "Emergency Bar Supplies"
];

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

function getWeekRange(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diffToMon = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d.setDate(diffToMon));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);

  const format = (dt) => dt.toISOString().slice(0, 10);
  return {
    start: format(mon),
    end: format(sun),
    label: `${format(mon)} to ${format(sun)}`
  };
}

export default function PettyCashApp({ currentUser, onBackToHub, onLogout }) {
  const [activeTab, setActiveTab] = useState('entry');

  // Summary Toggle Mode: 'week' | 'date'
  const [summaryViewMode, setSummaryViewMode] = useState('week');
  const [filterDate, setFilterDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedWeekRange, setSelectedWeekRange] = useState(() => getWeekRange(new Date()));

  // Daily Entry State
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [entryDay, setEntryDay] = useState(() => new Date().toLocaleDateString('en-GB', { weekday: 'long' }));

  // Cash In Safe: Denominations Monetary Value
  const [denomValues, setDenomValues] = useState({
    n50: '', n20: '', n10: '', n5: '',
    c1: '', c50p: '', c20p: '', c10p: '', c5p: '', c2p: '', c1p: ''
  });

  // Outgoings List
  const [expenseVendor, setExpenseVendor] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('Supplies');
  const [receiptImage, setReceiptImage] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [expenseList, setExpenseList] = useState([]);
  const [existingRecordUrl, setExistingRecordUrl] = useState('');

  // History & Archive
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historySearch, setHistorySearch] = useState('');
  const [selectedLogModal, setSelectedLogModal] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [exportingDrive, setExportingDrive] = useState(false);
  const fileInputRef = useRef(null);

  // Swipe handling
  const touchStartRef = useRef({ x: 0, y: 0 });

  const handleTouchStart = (e) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e) => {
    if (selectedLogModal) return;
    const deltaX = e.changedTouches[0].clientX - touchStartRef.current.x;
    const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;

    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX < 0 && activeTab === 'entry') setActiveTab('summary');
      else if (deltaX > 0) {
        if (activeTab === 'summary') setActiveTab('entry');
        else if (activeTab === 'entry' && onBackToHub) onBackToHub();
      }
    }
  };

  // Sync Day Name & Auto-Load Day So Far
  useEffect(() => {
    const d = new Date(entryDate);
    if (!isNaN(d.getTime())) {
      setEntryDay(d.toLocaleDateString('en-GB', { weekday: 'long' }));
    }

    // Check if entryDate already exists in historyLogs
    const existingLog = historyLogs.find(l => l.date === entryDate);
    if (existingLog) {
      // Hydrate saved denominations and items for ongoing day editing
      const dVals = existingLog.denominations || {};
      setDenomValues({
        n50: dVals.n50 !== undefined ? String(dVals.n50) : '',
        n20: dVals.n20 !== undefined ? String(dVals.n20) : '',
        n10: dVals.n10 !== undefined ? String(dVals.n10) : '',
        n5:  dVals.n5 !== undefined ? String(dVals.n5) : '',
        c1:  dVals.c1 !== undefined ? String(dVals.c1) : '',
        c50p: dVals.c50p !== undefined ? String(dVals.c50p) : '',
        c20p: dVals.c20p !== undefined ? String(dVals.c20p) : '',
        c10p: dVals.c10p !== undefined ? String(dVals.c10p) : '',
        c5p:  dVals.c5 !== undefined ? String(dVals.c5) : '',
        c2p:  dVals.c2 !== undefined ? String(dVals.c2) : '',
        c1p:  dVals.c1p !== undefined ? String(dVals.c1p) : ''
      });
      setExpenseList(existingLog.items || []);
      setExistingRecordUrl(existingLog.fileUrl || '');
    } else {
      // Clear fields for a new day count
      setDenomValues({
        n50: '', n20: '', n10: '', n5: '',
        c1: '', c50p: '', c20p: '', c10p: '', c5p: '', c2p: '', c1p: ''
      });
      setExpenseList([]);
      setExistingRecordUrl('');
    }
  }, [entryDate, historyLogs]);

  const loadPettyData = async () => {
    try {
      const res = await fetch(`${HARDWIRED_SCRIPT_URL}?action=get_petty_cash`);
      const json = await res.json();
      if (json.status === "success" && Array.isArray(json.data)) {
        setHistoryLogs(json.data);
      }
    } catch (err) {
      console.warn("Could not load petty cash logs:", err);
    }
  };

  useEffect(() => {
    loadPettyData();
  }, []);

  // Total Physical Cash
  const totalPhysicalCash = useMemo(() => {
    return Object.values(denomValues).reduce((sum, val) => {
      const num = parseFloat(val);
      return sum + (isNaN(num) ? 0 : num);
    }, 0);
  }, [denomValues]);

  const totalExpensesToday = useMemo(() => {
    return expenseList.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  }, [expenseList]);

  // Imprest Reconciled Math
  const accountableTotal = totalPhysicalCash + totalExpensesToday;
  const dailyVariance = accountableTotal - FLOAT_TARGET;

  const handleDenomChange = (key, val) => {
    setDenomValues(prev => ({ ...prev, [key]: val }));
  };

  const handleImageCapture = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setReceiptImage({
        base64: reader.result,
        name: file.name,
        type: file.type
      });
      setReceiptPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleAddExpense = (e) => {
    e.preventDefault();
    const amt = parseFloat(expenseAmount);
    if (!expenseVendor.trim() || isNaN(amt) || amt <= 0) return;

    setExpenseList(prev => [...prev, {
      id: `exp-${Date.now()}`,
      vendor: expenseVendor.trim(),
      amount: amt,
      category: expenseCategory,
      receipt: receiptImage
    }]);

    setExpenseVendor('');
    setExpenseAmount('');
    setReceiptImage(null);
    setReceiptPreview(null);
  };

  const handleRemoveExpense = (index) => {
    setExpenseList(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitDay = async () => {
    if (totalPhysicalCash === 0 && expenseList.length === 0) {
      setStatusMsg({ type: 'error', text: 'Enter cash denomination values before submitting.' });
      return;
    }

    setSubmitting(true);
    setStatusMsg(null);

    try {
      const uploadedReceipts = [];
      for (const exp of expenseList) {
        if (exp.receipt && exp.receipt.base64) {
          try {
            const upRes = await fetch(HARDWIRED_SCRIPT_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'upload_petty_receipt',
                base64Data: exp.receipt.base64,
                mimeType: exp.receipt.type,
                fileName: `Petty_${entryDate}_${exp.vendor.replace(/\s+/g, '_')}.jpg`
              })
            });
            const upJson = await upRes.json();
            if (upJson.status === 'success') {
              uploadedReceipts.push({
                vendor: exp.vendor,
                amount: exp.amount,
                fileUrl: upJson.fileUrl
              });
            }
          } catch (e) {
            console.error("Receipt upload skipped:", e);
          }
        }
      }

      const payload = {
        action: 'save_petty_cash',
        id: `pc-${Date.now()}`,
        date: entryDate,
        day: entryDay,
        manager: currentUser?.name || 'Duty Manager',
        cashCount: totalPhysicalCash,
        floatAmount: FLOAT_TARGET,
        expensesTotal: totalExpensesToday,
        variance: dailyVariance,
        items: expenseList.map(e => ({ vendor: e.vendor, amount: e.amount, category: e.category })),
        receiptUrls: uploadedReceipts,
        denominations: denomValues
      };

      await fetch(HARDWIRED_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'no-cors'
      });

      setStatusMsg({ type: 'success', text: `Saved petty cash for ${entryDate}!` });
      loadPettyData();
      setActiveTab('summary');
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Network error saving petty cash.' });
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered Summary
  const filteredSummaryLogs = useMemo(() => {
    return historyLogs.filter(log => {
      const q = historySearch.toLowerCase();
      const matchesSearch = 
        (log.date || '').toLowerCase().includes(q) ||
        (log.day || '').toLowerCase().includes(q) ||
        (log.manager || '').toLowerCase().includes(q) ||
        (log.items || []).some(i => (i.vendor || '').toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (summaryViewMode === 'date') {
        return log.date === filterDate;
      } else {
        return log.date >= selectedWeekRange.start && log.date <= selectedWeekRange.end;
      }
    });
  }, [historyLogs, historySearch, summaryViewMode, filterDate, selectedWeekRange]);

  // Aggregate stats
  const aggregateSummary = useMemo(() => {
    let totExp = 0;
    let closingCash = 0;
    let netVar = 0;

    filteredSummaryLogs.forEach(l => {
      totExp += Number(l.expensesTotal || 0);
      netVar += Number(l.variance || 0);
    });

    if (filteredSummaryLogs.length > 0) {
      closingCash = Number(filteredSummaryLogs[0].cashCount || 0);
    }

    return { totExp, closingCash, netVar };
  }, [filteredSummaryLogs]);

  // Save Weekly Report (Creates Spreadsheet + Formatted Doc in Folder)
  const handleSaveWeeklyReport = async () => {
    if (filteredSummaryLogs.length === 0) return;
    setExportingDrive(true);
    setStatusMsg(null);

    const weekLabel = summaryViewMode === 'week' ? selectedWeekRange.label : filterDate;

    try {
      const res = await fetch(HARDWIRED_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'export_petty_cash_summary',
          weekLabel: weekLabel,
          totalExpenses: aggregateSummary.totExp,
          closingCash: aggregateSummary.closingCash,
          netVariance: aggregateSummary.netVar,
          logs: filteredSummaryLogs
        })
      });
      const json = await res.json();
      if (json.status === 'success') {
        setStatusMsg({ 
          type: 'success', 
          text: `Weekly report generated: Ledger Sheet & Summary Document saved to Drive!` 
        });
      }
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Failed to generate weekly reports.' });
    } finally {
      setExportingDrive(false);
    }
  };

  return (
    <div 
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="flex flex-col h-screen w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 overflow-x-hidden relative"
    >
      {/* Top Header */}
      <header className="flex items-center justify-between px-5 pt-6 pb-2 border-b border-gray-50 flex-shrink-0 bg-white z-10">
        <div className="flex items-center space-x-2">
          {onBackToHub && (
            <button onClick={onBackToHub} className="mr-0.5 p-1 -ml-1 text-gray-500 hover:text-black rounded-lg transition" title="Return to Hub">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <AppLogo className="w-6 h-6" fallbackTextClass="font-serif text-2xl font-bold tracking-tighter" />
          <span className="font-semibold text-base tracking-tight">West Side Tavern</span>
        </div>
        <div className="flex items-center space-x-4 text-sm font-medium">
          {onBackToHub ? (
            <button onClick={onBackToHub} className="text-gray-900 hover:text-black font-semibold">Hub</button>
          ) : (
            <button onClick={onLogout} className="text-gray-900 hover:text-black">Logout</button>
          )}
        </div>
      </header>

      {/* Main Viewport Router */}
      {activeTab === 'entry' ? (

        /* ====================================================================== */
        /* TAB 1: DAILY COUNT & CONTINUOUS EDIT                                   */
        /* ====================================================================== */
        <div className="flex-1 flex flex-col overflow-y-auto px-5 py-3 space-y-4 pb-28">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 italic text-xs font-serif">Imprest Safe Breakdown (£1,200 Float)</p>
              <h1 className="text-2xl font-black tracking-tight text-gray-900 mt-0.5">Petty Cash Count</h1>
            </div>
            {existingRecordUrl && (
              <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-lg text-[10px] font-bold">
                <Clock className="w-3 h-3 text-amber-600" />
                <span>Editing Day In Progress</span>
              </span>
            )}
          </div>

          {statusMsg && (
            <div className={`p-2.5 rounded-xl text-xs font-semibold ${statusMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
              {statusMsg.text}
            </div>
          )}

          {/* Date Selector Header */}
          <div className="grid grid-cols-12 gap-2 text-xs bg-[#F8F8F8] p-3 rounded-2xl border border-gray-200">
            <div className="col-span-7">
              <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Select / Toggle Date</label>
              <input 
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full bg-white border border-gray-200 py-1.5 px-2 rounded-lg text-xs font-bold focus:outline-none"
              />
            </div>
            <div className="col-span-5">
              <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Day</label>
              <div className="w-full py-1.5 px-2 bg-gray-200/80 rounded-lg text-xs font-bold text-gray-700 text-center uppercase tracking-wide">
                {entryDay}
              </div>
            </div>
          </div>

          {/* Live Imprest Balance Card */}
          <div className="bg-black text-white p-4 rounded-2xl shadow-sm space-y-2">
            <div className="flex justify-between items-baseline text-xs font-mono">
              <span className="text-gray-400">AUTHORIZED FLOAT</span>
              <span className="font-bold">£{FLOAT_TARGET.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-baseline text-xs font-mono">
              <span className="text-gray-400">PHYSICAL CASH (SUM OF DENOMS)</span>
              <span className="font-bold text-emerald-400">£{totalPhysicalCash.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-baseline text-xs font-mono">
              <span className="text-gray-400">UNREIMBURSED RECEIPTS</span>
              <span className="font-bold">£{totalExpensesToday.toFixed(2)}</span>
            </div>
            <div className="border-t border-white/20 pt-2 flex justify-between items-baseline">
              <span className="text-xs font-bold uppercase tracking-wider">Variance to Float</span>
              <span className={`text-base font-black font-mono ${dailyVariance === 0 ? 'text-emerald-400' : dailyVariance < 0 ? 'text-red-400' : 'text-amber-400'}`}>
                {dailyVariance > 0 ? `+£${dailyVariance.toFixed(2)}` : dailyVariance < 0 ? `-£${Math.abs(dailyVariance).toFixed(2)}` : '£0.00 (Balanced)'}
              </span>
            </div>
          </div>

          {/* 11 Denominations */}
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="block font-bold text-gray-900 uppercase tracking-wider text-[11px]">
                Safe Cash Denomination Value (£)
              </span>
              <span className="text-[10px] font-mono text-gray-500 font-bold">
                Tot: £{totalPhysicalCash.toFixed(2)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {DENOMINATIONS.map(d => (
                <div key={d.id} className="flex items-center bg-white border border-gray-200 rounded-xl px-2.5 py-1.5 focus-within:border-black transition">
                  <span className="w-10 font-bold text-gray-700 text-xs">{d.label}</span>
                  <span className="text-gray-400 text-xs mr-1">£</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={denomValues[d.id]}
                    onChange={(e) => handleDenomChange(d.id, e.target.value)}
                    className="w-full text-right font-mono font-bold text-gray-900 bg-transparent focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Add Payout */}
          <form onSubmit={handleAddExpense} className="bg-gray-50 border border-gray-200 rounded-2xl p-3.5 space-y-3 text-xs">
            <span className="block font-bold text-gray-900 uppercase tracking-wider text-[11px]">Add Cash Payout / Receipt</span>
            
            <div className="space-y-1">
              <input 
                type="text"
                placeholder="Vendor / Description..."
                value={expenseVendor}
                onChange={(e) => setExpenseVendor(e.target.value)}
                className="w-full bg-white border border-gray-300 py-2 px-3 rounded-xl text-xs font-medium focus:outline-none"
              />
              <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none pt-1">
                {COMMON_VENDORS.map(v => (
                  <button 
                    key={v}
                    type="button"
                    onClick={() => setExpenseVendor(v)}
                    className="px-2 py-0.5 bg-gray-200/70 hover:bg-gray-300 text-[10px] font-semibold rounded-md whitespace-nowrap text-gray-700"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-6">
                <input 
                  type="number"
                  step="0.01"
                  placeholder="Amount (£)"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  className="w-full bg-white border border-gray-300 py-2 px-3 rounded-xl text-xs font-bold text-black focus:outline-none"
                />
              </div>
              <div className="col-span-6">
                <select 
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value)}
                  className="w-full bg-white border border-gray-300 py-2 px-2 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none"
                >
                  <option value="Supplies">Bar Supplies</option>
                  <option value="Groceries">Groceries / Fruit</option>
                  <option value="Wages">Wages / Shift Pay</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Travel">Staff Travel / Taxi</option>
                </select>
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                ref={fileInputRef} 
                onChange={handleImageCapture} 
                className="hidden" 
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center space-x-1.5 transition ${
                  receiptPreview 
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800' 
                    : 'bg-white border-gray-300 hover:bg-gray-100 text-gray-700'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{receiptPreview ? 'Receipt Attached ✓' : 'Scan / Snap Receipt'}</span>
              </button>
              {receiptPreview && (
                <button 
                  type="button" 
                  onClick={() => { setReceiptImage(null); setReceiptPreview(null); }}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={!expenseVendor.trim() || !expenseAmount}
              className="w-full py-2 bg-black text-white hover:bg-neutral-800 disabled:opacity-40 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add to Today's Outgoings</span>
            </button>
          </form>

          {/* Outgoings So Far for Selected Date */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase text-gray-400 px-1">
              Outgoings for {entryDate} ({expenseList.length} items • £{totalExpensesToday.toFixed(2)})
            </span>

            {expenseList.length === 0 ? (
              <div className="border border-dashed border-gray-200 rounded-2xl py-6 text-center text-xs text-gray-400">
                No outgoings logged for this date.
              </div>
            ) : (
              <div className="border border-gray-200 rounded-2xl divide-y divide-gray-100 bg-white overflow-hidden shadow-sm">
                {expenseList.map((item, idx) => (
                  <div key={item.id || idx} className="p-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-extrabold text-gray-900 block leading-tight">{item.vendor}</span>
                      <div className="flex items-center space-x-2 text-[10px] text-gray-400 font-mono mt-0.5">
                        <span>{item.category}</span>
                        {item.receipt && (
                          <span className="text-emerald-600 font-bold">• Scanned</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="font-mono text-sm font-black text-gray-900">
                        £{Number(item.amount).toFixed(2)}
                      </span>
                      <button 
                        type="button" 
                        onClick={() => handleRemoveExpense(idx)}
                        className="text-gray-400 hover:text-red-500 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmitDay}
            className="w-full py-3.5 bg-black text-white rounded-2xl text-xs font-bold hover:bg-neutral-800 transition disabled:opacity-50 flex items-center justify-center space-x-2 shadow-sm"
          >
            <Check className="w-4 h-4" />
            <span>{submitting ? 'Saving to Drive Folder...' : existingRecordUrl ? 'Update Day Count & Outgoings' : 'Reconcile & Save Day'}</span>
          </button>
        </div>

      ) : (

        /* ====================================================================== */
        /* TAB 2: SUMMARY WITH CLEAN DATE TITLES & SAVE WEEKLY REPORT              */
        /* ====================================================================== */
        <div className="flex-1 flex flex-col overflow-hidden pb-24">
          <div className="px-5 pt-3 pb-2 border-b border-gray-100 flex-shrink-0 space-y-2">
            <div className="flex justify-between items-baseline">
              <div>
                <p className="text-gray-500 italic text-xs font-serif">Imprest Audit Ledger</p>
                <h1 className="text-xl font-black tracking-tight text-gray-900">Petty Cash Summary</h1>
              </div>
              <button onClick={loadPettyData} className="text-xs font-semibold text-gray-500 hover:text-black underline flex items-center space-x-1">
                <RefreshCw className="w-3 h-3" />
                <span>Refresh</span>
              </button>
            </div>

            {/* View Mode Toggle: Week vs. Date */}
            <div className="grid grid-cols-2 gap-1 bg-[#EDEDED] p-1 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setSummaryViewMode('week')}
                className={`py-1.5 rounded-lg text-center transition ${summaryViewMode === 'week' ? 'bg-white text-black shadow-sm' : 'text-gray-600'}`}
              >
                Weekly View
              </button>
              <button
                type="button"
                onClick={() => setSummaryViewMode('date')}
                className={`py-1.5 rounded-lg text-center transition ${summaryViewMode === 'date' ? 'bg-white text-black shadow-sm' : 'text-gray-600'}`}
              >
                By Date
              </button>
            </div>

            {/* Filter Date Selector */}
            {summaryViewMode === 'week' ? (
              <div className="flex items-center space-x-2 text-xs">
                <label className="text-[10px] font-bold uppercase text-gray-400">Anchor Date:</label>
                <input 
                  type="date"
                  value={selectedWeekRange.start}
                  onChange={(e) => setSelectedWeekRange(getWeekRange(e.target.value))}
                  className="bg-[#EDEDED] py-1 px-2 rounded-md font-semibold text-[11px] text-gray-800 focus:outline-none"
                />
                <span className="font-mono text-[10px] text-gray-500 font-bold truncate">
                  {selectedWeekRange.label}
                </span>
              </div>
            ) : (
              <div className="flex items-center space-x-2 text-xs">
                <label className="text-[10px] font-bold uppercase text-gray-400">Date:</label>
                <input 
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="bg-[#EDEDED] py-1 px-2 rounded-md font-semibold text-[11px] text-gray-800 focus:outline-none"
                />
              </div>
            )}

            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search vendor, manager..."
                className="w-full bg-[#EDEDED] py-2 pl-4 pr-9 rounded-xl text-xs italic placeholder-gray-500 focus:outline-none"
              />
              {historySearch && (
                <button onClick={() => setHistorySearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* SAVE WEEKLY REPORT BUTTON (DUAL SPREADSHEET + DOCUMENT CREATION) */}
            <button
              type="button"
              disabled={exportingDrive || filteredSummaryLogs.length === 0}
              onClick={handleSaveWeeklyReport}
              className="w-full py-2.5 bg-black hover:bg-neutral-800 disabled:opacity-40 text-white text-xs font-bold rounded-xl flex items-center justify-center space-x-2 transition shadow-sm"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>{exportingDrive ? 'Generating Reports in Drive...' : 'Save Weekly Report'}</span>
            </button>
          </div>

          {/* Rollup Stats */}
          <div className="px-5 pt-3">
            <div className="bg-neutral-900 text-white p-3.5 rounded-2xl space-y-1.5 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-gray-400">Total Outgoings:</span>
                <span className="font-bold">£{aggregateSummary.totExp.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Closing Safe Cash:</span>
                <span className="font-bold text-emerald-400">£{aggregateSummary.closingCash.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-white/20 pt-1 font-bold">
                <span>Net Period Variance:</span>
                <span className={aggregateSummary.netVar < 0 ? 'text-red-400' : 'text-emerald-400'}>
                  £{aggregateSummary.netVar.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Summary Logs List Titled Strictly by Date */}
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
            {filteredSummaryLogs.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Calendar className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-xs font-semibold text-gray-600">No records found</p>
              </div>
            ) : (
              filteredSummaryLogs.map((log) => {
                const varNum = Number(log.variance) || 0;
                return (
                  <div
                    key={log.id}
                    onClick={() => setSelectedLogModal(log)}
                    className="border border-gray-200 rounded-2xl p-4 bg-white shadow-sm hover:border-black transition cursor-pointer space-y-2 group"
                  >
                    <div className="flex justify-between items-baseline">
                      <div>
                        {/* Title strictly has date */}
                        <span className="font-extrabold text-sm text-gray-900 group-hover:text-black">
                          {log.date}
                        </span>
                        <span className="text-[10px] text-gray-400 block font-mono">Duty: {log.manager}</span>
                      </div>
                      <div className="text-right">
                        <span className={`font-mono text-xs font-bold ${varNum === 0 ? 'text-emerald-600' : varNum < 0 ? 'text-red-500' : 'text-amber-500'}`}>
                          {varNum > 0 ? `+£${varNum.toFixed(2)}` : varNum < 0 ? `-£${Math.abs(varNum).toFixed(2)}` : 'Balanced'}
                        </span>
                        <span className="text-[10px] text-gray-400 block font-mono">Variance</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-gray-50 p-2 rounded-xl">
                      <div>
                        <span className="text-gray-400 block text-[9px] uppercase">Cash Count</span>
                        <span className="font-bold text-gray-800">£{Number(log.cashCount).toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[9px] uppercase">Outgoings</span>
                        <span className="font-bold text-gray-800">£{Number(log.expensesTotal).toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 pt-1 group-hover:text-black">
                      <span>{(log.items || []).length} expenses</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Modal Log Viewport with Denominations & Document Link */}
          {selectedLogModal && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border border-gray-200 flex flex-col max-h-[80vh]">
                <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex justify-between items-start bg-gray-50/50">
                  <div>
                    <span className="text-[10px] font-mono uppercase text-gray-400 block font-bold">
                      LOGGED BY {selectedLogModal.manager.toUpperCase()}
                    </span>
                    <h2 className="text-base font-black text-gray-900 leading-snug mt-0.5">
                      {selectedLogModal.date}
                    </h2>
                  </div>
                  <button onClick={() => setSelectedLogModal(null)} className="p-1.5 text-gray-400 hover:text-black bg-white rounded-full border border-gray-200 shadow-sm">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-5 overflow-y-auto space-y-3.5 text-xs">
                  {/* Summary Breakdown */}
                  <div className="bg-neutral-50 border border-neutral-200 p-3 rounded-2xl space-y-1 font-mono text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Physical Cash:</span>
                      <span className="font-bold">£{Number(selectedLogModal.cashCount).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Receipt Expenses:</span>
                      <span className="font-bold">£{Number(selectedLogModal.expensesTotal).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t border-gray-200 pt-1 font-bold text-xs">
                      <span>Variance (£1,200 Float):</span>
                      <span className={Number(selectedLogModal.variance) < 0 ? 'text-red-500' : 'text-emerald-600'}>
                        £{Number(selectedLogModal.variance).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Denominations */}
                  {selectedLogModal.denominations && Object.keys(selectedLogModal.denominations).length > 0 && (
                    <div>
                      <span className="font-bold uppercase tracking-wider text-[10px] text-gray-400 block mb-1">Denominations (£)</span>
                      <div className="grid grid-cols-3 gap-1 bg-gray-50 p-2 rounded-xl text-[10px] font-mono">
                        {DENOMINATIONS.map(d => (
                          <div key={d.id} className="flex justify-between border-b border-gray-100 py-0.5">
                            <span className="text-gray-400">{d.label}:</span>
                            <span className="font-bold">£{Number(selectedLogModal.denominations[d.id] || 0).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Outgoings Breakdown */}
                  <div>
                    <span className="font-bold uppercase tracking-wider text-[10px] text-gray-400 block mb-1">Outgoings</span>
                    <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden bg-white">
                      {(selectedLogModal.items || []).map((exp, i) => (
                        <div key={i} className="p-2.5 flex justify-between items-center text-xs">
                          <div>
                            <span className="font-bold text-gray-900 block">{exp.vendor}</span>
                            <span className="text-[10px] text-gray-400">{exp.category}</span>
                          </div>
                          <span className="font-mono font-bold text-gray-900">£{Number(exp.amount).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Open Standalone File */}
                  {selectedLogModal.fileUrl && (
                    <a
                      href={selectedLogModal.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full py-2.5 bg-black text-white rounded-xl flex items-center justify-center space-x-1.5 font-bold hover:bg-neutral-800 transition shadow-sm mt-2"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                      <span>Open Drive File</span>
                      <ExternalLink className="w-3 h-3 text-gray-400 ml-1" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating Bottom Navigation */}
      <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[390px] z-50 rounded-2xl bg-[#111111]/95 backdrop-blur-md text-white py-2.5 px-3 flex justify-around items-center text-xs font-semibold shadow-2xl border border-white/10 select-none">
        <button 
          onClick={() => setActiveTab('entry')} 
          className={`flex-1 py-1 text-center rounded-xl transition ${activeTab === 'entry' ? 'text-white bg-white/15 font-bold shadow-inner' : 'text-gray-400 hover:text-white'}`}
        >
          Daily Count
        </button>
        <button 
          onClick={() => setActiveTab('summary')} 
          className={`flex-1 py-1 text-center rounded-xl transition ${activeTab === 'summary' ? 'text-white bg-white/15 font-bold shadow-inner' : 'text-gray-400 hover:text-white'}`}
        >
          Summary
        </button>
      </nav>
    </div>
  );
}