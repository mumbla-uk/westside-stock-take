import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ArrowLeft, 
  Plus, 
  Minus, 
  Trash2, 
  Camera, 
  X, 
  ExternalLink, 
  FileSpreadsheet, 
  FileDown, 
  RefreshCw, 
  Settings, 
  CheckCircle2,
  Calendar,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

const HARDWIRED_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzcrqf4q-QWiGq0sxMmXqS7QcsxCVfhkJgPfjxOm6KyPShNUD-zkD9HUZy49rDdrfAYJg/exec";
const DEFAULT_FLOAT = 1200.00;

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DENOMINATIONS = [
  { id: 'largeNotes', label: 'Large Notes', step: 10.00 },
  { id: 'n5',  label: '£5',  step: 5.00 },
  { id: 'c1',  label: '£1',  step: 1.00 },
  { id: 'c50p', label: '50p', step: 0.50 },
  { id: 'c20p', label: '20p', step: 0.20 },
  { id: 'c10p', label: '10p', step: 0.10 },
  { id: 'c5p',  label: '5p',  step: 0.05 },
  { id: 'c2p',  label: '2p',  step: 0.02 },
  { id: 'c1p',  label: '1p',  step: 0.01 }
];

const COMMON_VENDORS = [
  "Partick Superstore",
  "Laundry",
  "Sainsbury's",
  "Tesco",
  "Lidl",
  "Morrisons",
  "Ice 24/7",
  "Ben wages",
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

// Compute standard Monday to Sunday week cycle
function getWeekInfo(dateObj = new Date()) {
  const d = new Date(dateObj);
  const day = d.getDay();
  const diffToMon = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d.setDate(diffToMon));
  
  const daysDates = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(mon);
    cur.setDate(mon.getDate() + i);
    daysDates.push({
      dayName: DAYS_OF_WEEK[i],
      shortName: DAY_SHORT[i],
      isoDate: cur.toISOString().slice(0, 10),
      ukDate: cur.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
    });
  }

  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);

  const anchor = daysDates[0].isoDate;
  const label = `${daysDates[0].ukDate.replace(/\//g, '-')} to ${daysDates[6].ukDate.replace(/\//g, '-')}`;

  return { anchor, label, daysDates, mondayDate: mon };
}

export default function PettyCashApp({ currentUser, onBackToHub, onLogout }) {
  const [activeTab, setActiveTab] = useState('daily'); // 'daily' | 'ledger'
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);

  // Active Week Info
  const activeWeek = useMemo(() => {
    const base = new Date();
    base.setDate(base.getDate() + currentWeekOffset * 7);
    return getWeekInfo(base);
  }, [currentWeekOffset]);

  // Selected Day (Index 0..6: Monday..Sunday)
  const [selectedDayIndex, setSelectedDayIndex] = useState(() => {
    const today = new Date().getDay();
    return today === 0 ? 6 : today - 1;
  });

  const selectedDayInfo = activeWeek.daysDates[selectedDayIndex];

  // Full Week In-Memory Ledger (Mirror of the Excel Sheet)
  const [weekData, setWeekData] = useState({
    days: {
      Monday: { expenses: [], cashCount: '', denoms: {} },
      Tuesday: { expenses: [], cashCount: '', denoms: {} },
      Wednesday: { expenses: [], cashCount: '', denoms: {} },
      Thursday: { expenses: [], cashCount: '', denoms: {} },
      Friday: { expenses: [], cashCount: '', denoms: {} },
      Saturday: { expenses: [], cashCount: '', denoms: {} },
      Sunday: { expenses: [], cashCount: '', denoms: {} }
    }
  });

  // Safe Starting Float & Overrides
  const [startingFloat, setStartingFloat] = useState(DEFAULT_FLOAT);
  const [fileUrl, setFileUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  // Payout Form Input State
  const [expenseVendor, setExpenseVendor] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('Supplies');
  const [receiptImage, setReceiptImage] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const fileInputRef = useRef(null);

  // Monday Top-Up Setup Modal
  const [showMondayModal, setShowMondayModal] = useState(false);
  const [mondayTopUpAmount, setMondayTopUpAmount] = useState('');
  const [customStartingFloat, setCustomStartingFloat] = useState(DEFAULT_FLOAT);

  // Load Week Data from Script
  const loadWeekData = async () => {
    try {
      const res = await fetch(`${HARDWIRED_SCRIPT_URL}?action=get_week_ledger&weekAnchor=${activeWeek.anchor}`);
      const json = await res.json();
      if (json && json.status === "success") {
        setStartingFloat(Number(json.startingFloat) || DEFAULT_FLOAT);
        if (json.weekData && json.weekData.days) {
          setWeekData(json.weekData);
        } else {
          // Initialize empty week structure
          const emptyDays = {};
          DAYS_OF_WEEK.forEach(d => {
            emptyDays[d] = { expenses: [], cashCount: '', denoms: {} };
          });
          setWeekData({ days: emptyDays, dates: activeWeek.daysDates.map(d => d.ukDate) });
        }
      }
    } catch (err) {
      console.warn("Could not load week data:", err);
    }
  };

  useEffect(() => {
    loadWeekData();
  }, [activeWeek.anchor]);

  // Active day's data slice
  const currentDayData = weekData.days[selectedDayInfo.dayName] || { expenses: [], cashCount: '', denoms: {} };
  const currentDayDenoms = currentDayData.denoms || {};

  // Auto-calculated physical cash from active day's denominations
  const totalPhysicalCash = useMemo(() => {
    return Object.values(currentDayDenoms).reduce((sum, val) => {
      const num = parseFloat(val);
      return sum + (isNaN(num) ? 0 : num);
    }, 0);
  }, [currentDayDenoms]);

  // Rolling Totals Across the 7 Columns (Replicating Excel Formulas)
  const rollingStats = useMemo(() => {
    const daySpends = [];
    const cumulativeExpenses = [];
    const cashCounts = [];
    const subTotals = [];
    const variances = [];

    let runningExp = 0;
    let lastCash = 0;

    DAYS_OF_WEEK.forEach((dName, idx) => {
      const dObj = weekData.days[dName] || { expenses: [], cashCount: '' };
      const dSpend = (dObj.expenses || []).reduce((acc, it) => acc + (parseFloat(it.amount) || 0), 0);
      daySpends.push(dSpend);

      runningExp += dSpend;
      cumulativeExpenses.push(runningExp);

      const cCount = dObj.cashCount !== '' && !isNaN(dObj.cashCount) ? parseFloat(dObj.cashCount) : null;
      if (cCount !== null) lastCash = cCount;
      cashCounts.push(cCount);

      if (cCount !== null) {
        subTotals.push(cCount + runningExp);
        variances.push((cCount + runningExp) - startingFloat);
      } else {
        subTotals.push(runningExp);
        variances.push(runningExp - startingFloat);
      }
    });

    const netWeekVariance = (lastCash + runningExp) - startingFloat;
    return { daySpends, cumulativeExpenses, cashCounts, subTotals, variances, runningExp, lastCash, netWeekVariance };
  }, [weekData, startingFloat]);

  // Sync Whole Week Ledger to Google Drive
  const syncWeekToDrive = async (updatedWeekData) => {
    setSubmitting(true);
    setStatusMsg({ type: 'info', text: 'Updating weekly ledger in Google Drive...' });

    try {
      const payload = {
        action: 'save_week_ledger',
        weekAnchor: activeWeek.anchor,
        weekLabel: activeWeek.label,
        startingFloat: startingFloat,
        weekData: {
          ...updatedWeekData,
          dates: activeWeek.daysDates.map(d => d.ukDate)
        }
      };

      const res = await fetch(HARDWIRED_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();

      if (json && json.status === "success") {
        setFileUrl(json.fileUrl);
        setStatusMsg({ type: 'success', text: `Weekly ledger synchronized with Google Drive!` });
      }
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Failed to update weekly ledger in Drive.' });
    } finally {
      setSubmitting(false);
    }
  };

  // Denominations Handlers
  const handleDenomChange = (key, val) => {
    const nextDenoms = { ...currentDayDenoms, [key]: val };
    const calcPhysCash = Object.values(nextDenoms).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);

    const updatedWeek = {
      ...weekData,
      days: {
        ...weekData.days,
        [selectedDayInfo.dayName]: {
          ...currentDayData,
          denoms: nextDenoms,
          cashCount: calcPhysCash > 0 ? String(calcPhysCash) : ''
        }
      }
    };
    setWeekData(updatedWeek);
  };

  const stepDenom = (key, stepAmount, isAdd) => {
    const currentVal = parseFloat(currentDayDenoms[key]) || 0;
    const nextVal = isAdd 
      ? Math.round((currentVal + stepAmount) * 100) / 100 
      : Math.max(0, Math.round((currentVal - stepAmount) * 100) / 100);
    handleDenomChange(key, nextVal > 0 ? String(nextVal) : '');
  };

  // Photo Capture
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

  // Add Payout to Active Day Column & Overwrite Ledger
  const handleAddExpense = async (e) => {
    e.preventDefault();
    const amt = parseFloat(expenseAmount);
    if (!expenseVendor.trim() || isNaN(amt) || amt <= 0) return;

    setSubmitting(true);
    setStatusMsg({ type: 'info', text: 'Uploading photo and saving to weekly ledger...' });

    try {
      let uploadedUrl = "";
      if (receiptImage && receiptImage.base64) {
        const cleanVendor = expenseVendor.trim().replace(/[^a-zA-Z0-9]/g, '_');
        const upRes = await fetch(HARDWIRED_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'upload_petty_receipt',
            base64Data: receiptImage.base64,
            mimeType: receiptImage.type,
            fileName: `Receipt_${selectedDayInfo.isoDate}_${cleanVendor}.jpg`
          })
        });
        const upJson = await upRes.json();
        if (upJson && upJson.status === "success") {
          uploadedUrl = upJson.fileUrl;
        }
      }

      const newItem = {
        id: `exp-${Date.now()}`,
        vendor: expenseVendor.trim(),
        amount: amt,
        category: expenseCategory,
        fileUrl: uploadedUrl
      };

      const updatedExpenses = [...(currentDayData.expenses || []), newItem];
      const updatedWeek = {
        ...weekData,
        days: {
          ...weekData.days,
          [selectedDayInfo.dayName]: {
            ...currentDayData,
            expenses: updatedExpenses
          }
        }
      };

      setWeekData(updatedWeek);
      await syncWeekToDrive(updatedWeek);

      setExpenseVendor('');
      setExpenseAmount('');
      setReceiptImage(null);
      setReceiptPreview(null);
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Error adding payout to week.' });
    } finally {
      setSubmitting(false);
    }
  };

  // Remove Payout from Active Day Column & Overwrite Ledger
  const handleRemoveExpense = async (index) => {
    const updatedExpenses = currentDayData.expenses.filter((_, i) => i !== index);
    const updatedWeek = {
      ...weekData,
      days: {
        ...weekData.days,
        [selectedDayInfo.dayName]: {
          ...currentDayData,
          expenses: updatedExpenses
        }
      }
    };
    setWeekData(updatedWeek);
    await syncWeekToDrive(updatedWeek);
  };

  // Save Physical Cash Count for the Day
  const handleSaveDayCashCount = async () => {
    await syncWeekToDrive(weekData);
  };

  // Monday Setup / Top-Up Handler
  const handleConfirmMondaySetup = async () => {
    setSubmitting(true);
    try {
      await fetch(HARDWIRED_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'save_monday_float',
          weekAnchor: activeWeek.anchor,
          startingFloat: customStartingFloat,
          topUpAdded: parseFloat(mondayTopUpAmount) || 0,
          endingCashPrevSunday: rollingStats.lastCash,
          manager: currentUser?.name || 'Manager'
        })
      });
      setStartingFloat(customStartingFloat);
      setShowMondayModal(false);
      setStatusMsg({ type: 'success', text: `Week starting float set to £${customStartingFloat.toFixed(2)}.` });
      await syncWeekToDrive(weekData);
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Failed to record Monday setup.' });
    } finally {
      setSubmitting(false);
    }
  };

  // PDF Export
  const handleOpenPdf = () => {
    const pdfUrl = `${HARDWIRED_SCRIPT_URL}?action=get_week_pdf&weekAnchor=${activeWeek.anchor}`;
    window.open(pdfUrl, '_blank');
  };

  return (
    <div className="flex flex-col h-screen w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 overflow-x-hidden relative">
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
        <div className="flex items-center space-x-3 text-sm font-medium">
          <button 
            onClick={() => setShowMondayModal(true)} 
            className="p-1 text-gray-500 hover:text-black rounded-lg flex items-center space-x-1"
            title="Monday Float Setup"
          >
            <Settings className="w-4 h-4" />
            <span className="text-xs font-bold">Float</span>
          </button>
          {onBackToHub ? (
            <button onClick={onBackToHub} className="text-gray-900 hover:text-black font-semibold">Hub</button>
          ) : (
            <button onClick={onLogout} className="text-gray-900 hover:text-black">Logout</button>
          )}
        </div>
      </header>

      {/* Week Selector Bar */}
      <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
        <button 
          onClick={() => setCurrentWeekOffset(prev => prev - 1)} 
          className="p-1 hover:bg-gray-200 rounded-lg text-gray-600 transition"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">Rolling Week Ledger</span>
          <span className="text-xs font-black text-gray-900 font-mono">{activeWeek.label}</span>
        </div>
        <button 
          onClick={() => setCurrentWeekOffset(prev => prev + 1)} 
          className="p-1 hover:bg-gray-200 rounded-lg text-gray-600 transition"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Main View Router */}
      {activeTab === 'daily' ? (

        /* ====================================================================== */
        /* TAB 1: DAILY ENTRY COLUMN VIEW                                         */
        /* ====================================================================== */
        <div className="flex-1 flex flex-col overflow-y-auto px-5 py-3 space-y-4 pb-28">
          {/* Day of Week Selector Pills */}
          <div className="grid grid-cols-7 gap-1 bg-gray-100 p-1 rounded-2xl">
            {activeWeek.daysDates.map((dayObj, idx) => {
              const isSelected = selectedDayIndex === idx;
              const hasSpend = (weekData.days[dayObj.dayName]?.expenses || []).length > 0;
              return (
                <button
                  key={dayObj.dayName}
                  onClick={() => setSelectedDayIndex(idx)}
                  className={`py-2 px-1 rounded-xl flex flex-col items-center justify-center transition relative ${
                    isSelected 
                      ? 'bg-black text-white shadow-sm' 
                      : 'hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase">{dayObj.shortName}</span>
                  <span className="text-[9px] font-mono opacity-70">{dayObj.ukDate.slice(0, 5)}</span>
                  {hasSpend && (
                    <span className={`w-1 h-1 rounded-full absolute bottom-1 ${isSelected ? 'bg-emerald-400' : 'bg-black'}`} />
                  )}
                </button>
              );
            })}
          </div>

          {statusMsg && (
            <div className={`p-2.5 rounded-xl text-xs font-semibold ${statusMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : statusMsg.type === 'info' ? 'bg-blue-50 text-blue-800 border border-blue-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
              {statusMsg.text}
            </div>
          )}

          {/* Rolling Weekly Ledger Banner for Active Column */}
          <div className="bg-black text-white p-4 rounded-2xl shadow-sm space-y-2 font-mono text-xs">
            <div className="flex justify-between items-baseline">
              <span className="text-gray-400">STARTING FLOAT</span>
              <span className="font-bold">£{startingFloat.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-gray-400">{selectedDayInfo.dayName.toUpperCase()} CASH IN SAFE</span>
              <span className="font-bold text-emerald-400">£{totalPhysicalCash.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-gray-400">CUMULATIVE EXPENSES (MON-{selectedDayInfo.shortName.toUpperCase()})</span>
              <span className="font-bold">£{rollingStats.cumulativeExpenses[selectedDayIndex].toFixed(2)}</span>
            </div>
            <div className="border-t border-white/20 pt-2 flex justify-between items-baseline">
              <span className="text-xs font-bold uppercase tracking-wider">Variance to Float</span>
              <span className={`text-base font-black ${rollingStats.variances[selectedDayIndex] === 0 ? 'text-emerald-400' : rollingStats.variances[selectedDayIndex] < 0 ? 'text-red-400' : 'text-amber-400'}`}>
                {rollingStats.variances[selectedDayIndex] > 0 
                  ? `+£${rollingStats.variances[selectedDayIndex].toFixed(2)}` 
                  : rollingStats.variances[selectedDayIndex] < 0 
                  ? `-£${Math.abs(rollingStats.variances[selectedDayIndex]).toFixed(2)}` 
                  : '£0.00 (Balanced)'}
              </span>
            </div>
          </div>

          {/* Denominations for Selected Day */}
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="block font-bold text-gray-900 uppercase tracking-wider text-[11px]">
                {selectedDayInfo.dayName} Safe Cash Breakdown
              </span>
              <span className="text-[10px] font-mono text-gray-500 font-bold">
                Tot: £{totalPhysicalCash.toFixed(2)}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              {DENOMINATIONS.map(d => (
                <div key={d.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-3 py-1.5 focus-within:border-black transition">
                  <span className="w-24 font-bold text-gray-800 text-xs truncate">{d.label}</span>
                  
                  <div className="flex items-center space-x-1.5 flex-1 justify-end">
                    <button
                      type="button"
                      onClick={() => stepDenom(d.id, d.step, false)}
                      className="p-1 hover:bg-gray-100 rounded text-gray-500 active:scale-95 transition"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    
                    <div className="flex items-center w-24 bg-gray-50 px-2 py-0.5 rounded-lg border border-gray-200">
                      <span className="text-gray-400 text-xs mr-1">£</span>
                      <input
                        type="number"
                        step={d.step}
                        placeholder="0.00"
                        value={currentDayDenoms[d.id] || ''}
                        onChange={(e) => handleDenomChange(d.id, e.target.value)}
                        className="w-full text-right font-mono font-bold text-gray-900 bg-transparent focus:outline-none"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => stepDenom(d.id, d.step, true)}
                      className="p-1 hover:bg-gray-100 rounded text-gray-800 active:scale-95 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={handleSaveDayCashCount}
              className="w-full py-2 bg-neutral-900 hover:bg-black text-white text-xs font-bold rounded-xl transition flex items-center justify-center space-x-1.5 mt-2"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Update {selectedDayInfo.dayName} Safe Count in Ledger</span>
            </button>
          </div>

          {/* Add Payout to this Day's Column */}
          <form onSubmit={handleAddExpense} className="bg-gray-50 border border-gray-200 rounded-2xl p-3.5 space-y-3 text-xs">
            <span className="block font-bold text-gray-900 uppercase tracking-wider text-[11px]">
              Add Payout to {selectedDayInfo.dayName} Column
            </span>
            
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
                <span>{receiptPreview ? 'Receipt Photo Attached ✓' : 'Scan / Snap Receipt'}</span>
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
              disabled={submitting || !expenseVendor.trim() || !expenseAmount}
              className="w-full py-2.5 bg-black text-white hover:bg-neutral-800 disabled:opacity-40 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{submitting ? 'Saving...' : `Add to ${selectedDayInfo.dayName} Column`}</span>
            </button>
          </form>

          {/* Outgoings for Selected Day */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase text-gray-400 px-1">
              {selectedDayInfo.dayName} Payouts ({(currentDayData.expenses || []).length} items • £{rollingStats.daySpends[selectedDayIndex].toFixed(2)})
            </span>

            {(currentDayData.expenses || []).length === 0 ? (
              <div className="border border-dashed border-gray-200 rounded-2xl py-6 text-center text-xs text-gray-400">
                No payouts recorded for {selectedDayInfo.dayName}.
              </div>
            ) : (
              <div className="border border-gray-200 rounded-2xl divide-y divide-gray-100 bg-white overflow-hidden shadow-sm">
                {(currentDayData.expenses || []).map((item, idx) => (
                  <div key={item.id || idx} className="p-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-extrabold text-gray-900 block leading-tight">{item.vendor}</span>
                      <div className="flex items-center space-x-2 text-[10px] text-gray-400 font-mono mt-0.5">
                        <span>{item.category}</span>
                        {item.fileUrl && (
                          <a href={item.fileUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center">
                            <span>Photo</span>
                            <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                          </a>
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
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      ) : (

        /* ====================================================================== */
        /* TAB 2: ROLLING WEEK LEDGER MATRIX (EXCEL REPLICA)                      */
        /* ====================================================================== */
        <div className="flex-1 flex flex-col overflow-hidden pb-24">
          <div className="px-5 pt-3 pb-2 border-b border-gray-100 flex-shrink-0 space-y-2">
            <div className="flex justify-between items-baseline">
              <div>
                <p className="text-gray-500 italic text-xs font-serif">Rolling Weekly Ledger Matrix</p>
                <h1 className="text-xl font-black tracking-tight text-gray-900">Weekly Audit Sheet</h1>
              </div>
              <button onClick={loadWeekData} className="text-xs font-semibold text-gray-500 hover:text-black underline flex items-center space-x-1">
                <RefreshCw className="w-3 h-3" />
                <span>Refresh</span>
              </button>
            </div>

            {/* DUAL EXPORTS: DRIVE & PDF */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                disabled={submitting}
                onClick={() => syncWeekToDrive(weekData)}
                className="py-2.5 bg-black hover:bg-neutral-800 disabled:opacity-40 text-white text-xs font-bold rounded-xl flex items-center justify-center space-x-1.5 transition shadow-sm"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>{submitting ? 'Saving...' : 'Save to Drive'}</span>
              </button>
              <button
                type="button"
                onClick={handleOpenPdf}
                className="py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-900 border border-neutral-300 text-xs font-bold rounded-xl flex items-center justify-center space-x-1.5 transition shadow-sm"
              >
                <FileDown className="w-3.5 h-3.5 text-neutral-700" />
                <span>Open as PDF</span>
              </button>
            </div>
          </div>

          {/* Rollup Summary Box */}
          <div className="px-5 pt-3">
            <div className="bg-neutral-900 text-white p-3.5 rounded-2xl space-y-1.5 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-gray-400">Total Week Spend:</span>
                <span className="font-bold">£{rollingStats.runningExp.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Latest Physical Cash:</span>
                <span className="font-bold text-emerald-400">£{rollingStats.lastCash.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-white/20 pt-1 font-bold">
                <span>Net Weekly Variance:</span>
                <span className={rollingStats.netWeekVariance < 0 ? 'text-red-400' : 'text-emerald-400'}>
                  £{rollingStats.netWeekVariance.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Scrollable Weekly Ledger Grid (Exact layout from user's Excel) */}
          <div className="flex-1 overflow-auto p-5">
            <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm bg-white min-w-[580px]">
              <table className="w-full text-xs font-mono border-collapse">
                <thead>
                  <tr className="bg-black text-white text-[10px] text-center">
                    <th className="p-2 text-left font-sans">DATE</th>
                    {activeWeek.daysDates.map(d => (
                      <th key={d.dayName} className="p-2 font-mono">{d.ukDate.slice(0, 5)}</th>
                    ))}
                    <th className="p-2 font-bold bg-neutral-800">TOTAL</th>
                  </tr>
                  <tr className="bg-gray-100 text-gray-700 text-[10px] text-center border-b border-gray-200">
                    <th className="p-2 text-left font-bold">VENDOR</th>
                    {DAY_SHORT.map(s => (
                      <th key={s} className="p-2 font-bold">{s}</th>
                    ))}
                    <th className="p-2 font-bold bg-gray-200">TOTAL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {/* Extract list of vendors */}
                  {Array.from(new Set(
                    DAYS_OF_WEEK.flatMap(d => (weekData.days[d]?.expenses || []).map(it => it.vendor))
                  )).map(vendorName => {
                    let vendorSum = 0;
                    return (
                      <tr key={vendorName} className="hover:bg-gray-50 text-[11px]">
                        <td className="p-2 font-sans font-bold text-gray-900 truncate max-w-[120px]">{vendorName}</td>
                        {DAYS_OF_WEEK.map(d => {
                          const matching = (weekData.days[d]?.expenses || []).filter(it => it.vendor === vendorName);
                          const dayAmt = matching.reduce((acc, it) => acc + (parseFloat(it.amount) || 0), 0);
                          vendorSum += dayAmt;
                          return (
                            <td key={d} className="p-2 text-right">
                              {dayAmt > 0 ? `£${dayAmt.toFixed(2)}` : ''}
                            </td>
                          );
                        })}
                        <td className="p-2 text-right font-bold bg-gray-50">
                          {vendorSum > 0 ? `£${vendorSum.toFixed(2)}` : ''}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Calculations Rows */}
                  <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                    <td className="p-2 font-sans">Total Expenses</td>
                    {rollingStats.cumulativeExpenses.map((val, idx) => (
                      <td key={idx} className="p-2 text-right font-mono">£{val.toFixed(2)}</td>
                    ))}
                    <td className="p-2 text-right font-mono bg-gray-100">£{rollingStats.runningExp.toFixed(2)}</td>
                  </tr>

                  <tr className="font-bold">
                    <td className="p-2 font-sans">Cash Count</td>
                    {rollingStats.cashCounts.map((val, idx) => (
                      <td key={idx} className="p-2 text-right font-mono text-emerald-700">
                        {val !== null ? `£${val.toFixed(2)}` : ''}
                      </td>
                    ))}
                    <td className="p-2 text-right font-mono bg-gray-50 text-emerald-700">£{rollingStats.lastCash.toFixed(2)}</td>
                  </tr>

                  <tr className="font-bold border-t border-gray-200">
                    <td className="p-2 font-sans">Sub Total</td>
                    {rollingStats.subTotals.map((val, idx) => (
                      <td key={idx} className="p-2 text-right font-mono">£{val.toFixed(2)}</td>
                    ))}
                    <td className="p-2 text-right font-mono bg-gray-50">£{(rollingStats.lastCash + rollingStats.runningExp).toFixed(2)}</td>
                  </tr>

                  <tr className="text-gray-500">
                    <td className="p-2 font-sans font-bold">Float</td>
                    {DAYS_OF_WEEK.map((_, idx) => (
                      <td key={idx} className="p-2 text-right font-mono">£{startingFloat.toFixed(2)}</td>
                    ))}
                    <td className="p-2 text-right font-mono bg-gray-50 font-bold">£{startingFloat.toFixed(2)}</td>
                  </tr>

                  <tr className="font-bold border-t border-gray-200">
                    <td className="p-2 font-sans">Variance</td>
                    {rollingStats.variances.map((val, idx) => (
                      <td key={idx} className={`p-2 text-right font-mono ${val < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                        £{val.toFixed(2)}
                      </td>
                    ))}
                    <td className={`p-2 text-right font-mono bg-gray-100 ${rollingStats.netWeekVariance < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                      £{rollingStats.netWeekVariance.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Monday Float Top-Up Modal */}
      {showMondayModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border border-gray-200 p-5 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-mono uppercase text-gray-400 font-bold block">Monday Morning Setup</span>
                <h2 className="text-lg font-black text-gray-900">Float Top-Up</h2>
              </div>
              <button onClick={() => setShowMondayModal(false)} className="p-1 text-gray-400 hover:text-black">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-neutral-50 rounded-2xl border border-neutral-200 text-xs font-mono space-y-1.5">
              <div className="flex justify-between">
                <span className="text-gray-500">Sunday Ending Cash:</span>
                <span className="font-bold text-gray-800">£{rollingStats.lastCash.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-1">
                <span className="text-gray-500">Target Standard Float:</span>
                <span className="font-bold text-gray-800">£{DEFAULT_FLOAT.toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                  Cash Top-Up Added (£)
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 1000.00"
                  value={mondayTopUpAmount}
                  onChange={(e) => {
                    const topUp = parseFloat(e.target.value) || 0;
                    setMondayTopUpAmount(e.target.value);
                    setCustomStartingFloat(rollingStats.lastCash + topUp);
                  }}
                  className="w-full bg-[#EDEDED] py-2 px-3 rounded-xl font-bold text-gray-900 focus:outline-none"
                />
              </div>

              <div className="p-3 bg-neutral-900 text-white rounded-xl space-y-1 font-mono text-xs">
                <div className="flex justify-between items-baseline">
                  <span className="text-gray-400 text-[10px] uppercase">New Week Float:</span>
                  <span className="font-bold text-emerald-400 text-sm">£{customStartingFloat.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={handleConfirmMondaySetup}
              className="w-full py-3 bg-black text-white rounded-xl text-xs font-bold hover:bg-neutral-800 transition"
            >
              {submitting ? 'Confirming...' : 'Confirm Starting Float'}
            </button>
          </div>
        </div>
      )}

      {/* Floating Bottom Nav */}
      <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[390px] z-50 rounded-2xl bg-[#111111]/95 backdrop-blur-md text-white py-2.5 px-3 flex justify-around items-center text-xs font-semibold shadow-2xl border border-white/10 select-none">
        <button 
          onClick={() => setActiveTab('daily')} 
          className={`flex-1 py-1 text-center rounded-xl transition ${activeTab === 'daily' ? 'text-white bg-white/15 font-bold shadow-inner' : 'text-gray-400 hover:text-white'}`}
        >
          Daily Column
        </button>
        <button 
          onClick={() => setActiveTab('ledger')} 
          className={`flex-1 py-1 text-center rounded-xl transition ${activeTab === 'ledger' ? 'text-white bg-white/15 font-bold shadow-inner' : 'text-gray-400 hover:text-white'}`}
        >
          Weekly Matrix
        </button>
      </nav>
    </div>
  );
}