import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ArrowLeft, 
  Plus, 
  Minus, 
  Trash2, 
  Camera, 
  X, 
  Calendar, 
  ExternalLink, 
  ChevronRight, 
  FileSpreadsheet, 
  RefreshCw, 
  Settings, 
  FileDown,
  CheckCircle2,
  Edit3,
  Loader2
} from 'lucide-react';

const HARDWIRED_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzcrqf4q-QWiGq0sxMmXqS7QcsxCVfhkJgPfjxOm6KyPShNUD-zkD9HUZy49rDdrfAYJg/exec";
const DEFAULT_FLOAT_TARGET = 1200.00;

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
  const [activeTab, setActiveTab] = useState('entry'); // 'entry' | 'summary'

  const [summaryViewMode, setSummaryViewMode] = useState('week');
  const [filterDate, setFilterDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedWeekRange, setSelectedWeekRange] = useState(() => getWeekRange(new Date()));

  // Active Daily Count Tab
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [entryDay, setEntryDay] = useState(() => new Date().toLocaleDateString('en-GB', { weekday: 'long' }));
  const [loadingDateFile, setLoadingDateFile] = useState(false);

  const [denomValues, setDenomValues] = useState({
    largeNotes: '', n5: '', c1: '', c50p: '', c20p: '', c10p: '', c5p: '', c2p: '', c1p: ''
  });

  const [expenseVendor, setExpenseVendor] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('Supplies');
  const [receiptImage, setReceiptImage] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [expenseList, setExpenseList] = useState([]);
  const [existingRecordUrl, setExistingRecordUrl] = useState('');
  const [lastSavedTimestamp, setLastSavedTimestamp] = useState('');

  // History & Overrides
  const [historyLogs, setHistoryLogs] = useState([]);
  const [floatOverrides, setFloatOverrides] = useState([]);
  const [historySearch, setHistorySearch] = useState('');

  // Historical Edit Modal
  const [editingLogModal, setEditingLogModal] = useState(null);

  // Monday Float Reset Modal
  const [showMondayModal, setShowMondayModal] = useState(false);
  const [mondayTopUpAmount, setMondayTopUpAmount] = useState('');
  const [mondayCalculatedFloat, setMondayCalculatedFloat] = useState(DEFAULT_FLOAT_TARGET);

  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [exportingDrive, setExportingDrive] = useState(false);
  const fileInputRef = useRef(null);

  const touchStartRef = useRef({ x: 0, y: 0 });

  const handleTouchStart = (e) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e) => {
    if (editingLogModal || showMondayModal) return;
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

  const postToAppsScript = async (payload) => {
    const res = await fetch(HARDWIRED_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  };

  const loadPettyData = async () => {
    try {
      const res = await fetch(`${HARDWIRED_SCRIPT_URL}?action=get_petty_cash`);
      const json = await res.json();
      if (json && json.status === "success") {
        if (Array.isArray(json.data)) setHistoryLogs(json.data);
        if (Array.isArray(json.floats)) setFloatOverrides(json.floats);
        return json;
      }
    } catch (err) {
      console.warn("Could not load petty cash data:", err);
    }
    return null;
  };

  useEffect(() => {
    loadPettyData();
  }, []);

  const currentEntryWeek = useMemo(() => {
    return getWeekRange(entryDate);
  }, [entryDate]);

  const activeWeekFloat = useMemo(() => {
    const fMatch = floatOverrides.find(f => f.weekAnchor === currentEntryWeek.start);
    return fMatch ? Number(fMatch.startingFloat) : DEFAULT_FLOAT_TARGET;
  }, [floatOverrides, currentEntryWeek]);

  const previousSundayEndingCash = useMemo(() => {
    const monDate = new Date(currentEntryWeek.start);
    const prevSunDate = new Date(monDate);
    prevSunDate.setDate(monDate.getDate() - 1);
    const prevSunStr = prevSunDate.toISOString().slice(0, 10);

    const prevSunLog = historyLogs.find(l => l.date === prevSunStr);
    return prevSunLog ? Number(prevSunLog.cashCount || 0) : 0;
  }, [historyLogs, currentEntryWeek]);

  useEffect(() => {
    const topUp = parseFloat(mondayTopUpAmount) || 0;
    setMondayCalculatedFloat(previousSundayEndingCash + topUp);
  }, [mondayTopUpAmount, previousSundayEndingCash]);

  // Load Date File Directly from Drive Folder (or start clean)
  const fetchDayFromDriveFolder = async (targetDate) => {
    setLoadingDateFile(true);
    setStatusMsg(null);

    try {
      const res = await fetch(`${HARDWIRED_SCRIPT_URL}?action=get_day_file&date=${targetDate}`);
      const json = await res.json();

      if (json && json.status === "success" && json.found && json.data) {
        const d = json.data;
        const dVals = d.denominations || {};

        setDenomValues({
          largeNotes: dVals.largeNotes || '',
          n5: dVals.n5 || '',
          c1: dVals.c1 || '',
          c50p: dVals.c50p || '',
          c20p: dVals.c20p || '',
          c10p: dVals.c10p || '',
          c5p: dVals.c5 || '',
          c2p: dVals.c2 || '',
          c1p: dVals.c1p || ''
        });

        setExpenseList(d.items || []);
        setExistingRecordUrl(d.fileUrl || '');
        setLastSavedTimestamp(d.lastUpdated || '');
      } else {
        // No file in Drive for this date - clean slate
        setDenomValues({
          largeNotes: '', n5: '', c1: '', c50p: '', c20p: '', c10p: '', c5p: '', c2p: '', c1p: ''
        });
        setExpenseList([]);
        setExistingRecordUrl('');
        setLastSavedTimestamp('');
      }
    } catch (err) {
      console.warn("Could not check folder for day file:", err);
    } finally {
      setLoadingDateFile(false);
    }
  };

  // Trigger loading when entryDate changes
  useEffect(() => {
    const d = new Date(entryDate);
    if (!isNaN(d.getTime())) {
      setEntryDay(d.toLocaleDateString('en-GB', { weekday: 'long' }));
      fetchDayFromDriveFolder(entryDate);
    }
  }, [entryDate]);

  // Denominations Physical Cash Total
  const totalPhysicalCash = useMemo(() => {
    return Object.values(denomValues).reduce((sum, val) => {
      const num = parseFloat(val);
      return sum + (isNaN(num) ? 0 : num);
    }, 0);
  }, [denomValues]);

  // Current day's expenses
  const totalExpensesToday = useMemo(() => {
    return expenseList.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  }, [expenseList]);

  // Rolling Imprest Math
  const priorWeekSpend = useMemo(() => {
    return historyLogs
      .filter(l => l.date >= currentEntryWeek.start && l.date < entryDate)
      .reduce((sum, l) => sum + (Number(l.expensesTotal) || 0), 0);
  }, [historyLogs, currentEntryWeek, entryDate]);

  const cumulativeReceiptsInSafe = priorWeekSpend + totalExpensesToday;
  const accountableTotalInSafe = totalPhysicalCash + cumulativeReceiptsInSafe;
  const dailyVariance = accountableTotalInSafe - activeWeekFloat;

  const handleDenomChange = (key, val) => {
    setDenomValues(prev => ({ ...prev, [key]: val }));
  };

  const stepDenom = (key, stepAmount, isAdd) => {
    const currentVal = parseFloat(denomValues[key]) || 0;
    const nextVal = isAdd 
      ? Math.round((currentVal + stepAmount) * 100) / 100 
      : Math.max(0, Math.round((currentVal - stepAmount) * 100) / 100);
    setDenomValues(prev => ({
      ...prev,
      [key]: nextVal > 0 ? String(nextVal) : ''
    }));
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

  const handleQueueExpense = (e) => {
    e.preventDefault();
    const amt = parseFloat(expenseAmount);
    if (!expenseVendor.trim() || isNaN(amt) || amt <= 0) return;

    const newItem = {
      id: `exp-${Date.now()}`,
      vendor: expenseVendor.trim(),
      amount: amt,
      category: expenseCategory,
      localPhoto: receiptImage ? { ...receiptImage } : null,
      fileUrl: ""
    };

    setExpenseList(prev => [...prev, newItem]);
    setExpenseVendor('');
    setExpenseAmount('');
    setReceiptImage(null);
    setReceiptPreview(null);
  };

  const handleRemoveQueuedExpense = (index) => {
    setExpenseList(prev => prev.filter((_, i) => i !== index));
  };

  // Submit End of Day Count and STAY on this date's state
  const handleSaveEndOfDay = async () => {
    if (totalPhysicalCash === 0 && expenseList.length === 0) {
      setStatusMsg({ type: 'error', text: 'Enter safe cash count before submitting end of day.' });
      return;
    }

    setSubmitting(true);
    setStatusMsg({ type: 'info', text: 'Uploading receipts and recording end of day count in Drive...' });

    try {
      const processedItems = [];
      const uploadedReceipts = [];

      for (const item of expenseList) {
        let finalPhotoUrl = item.fileUrl || "";

        if (item.localPhoto && item.localPhoto.base64) {
          try {
            const cleanVendor = item.vendor.replace(/[^a-zA-Z0-9]/g, '_');
            const upRes = await postToAppsScript({
              action: 'upload_petty_receipt',
              base64Data: item.localPhoto.base64,
              mimeType: item.localPhoto.type,
              fileName: `Receipt_${entryDate}_${cleanVendor}.jpg`
            });
            if (upRes && upRes.status === 'success') {
              finalPhotoUrl = upRes.fileUrl;
              uploadedReceipts.push({ vendor: item.vendor, amount: item.amount, fileUrl: finalPhotoUrl });
            }
          } catch (err) {
            console.error("Photo upload error:", err);
          }
        } else if (finalPhotoUrl) {
          uploadedReceipts.push({ vendor: item.vendor, amount: item.amount, fileUrl: finalPhotoUrl });
        }

        processedItems.push({
          vendor: item.vendor,
          amount: item.amount,
          category: item.category,
          fileUrl: finalPhotoUrl
        });
      }

      const payload = {
        action: 'save_petty_cash',
        id: `pc-${entryDate}`,
        date: entryDate,
        day: entryDay,
        weekAnchor: currentEntryWeek.start,
        manager: currentUser?.name || 'Duty Manager',
        cashCount: totalPhysicalCash,
        floatAmount: activeWeekFloat,
        expensesTotal: totalExpensesToday,
        cumulativeReceipts: cumulativeReceiptsInSafe,
        variance: dailyVariance,
        items: processedItems,
        receiptUrls: uploadedReceipts,
        denominations: denomValues
      };

      const saveRes = await postToAppsScript(payload);

      if (saveRes && saveRes.fileUrl) {
        setExistingRecordUrl(saveRes.fileUrl);
        setLastSavedTimestamp(saveRes.savedAt || '');
      }

      // Update in-memory items so photo URLs stay active
      setExpenseList(processedItems);
      setStatusMsg({ type: 'success', text: `Saved and synced to Drive file: Petty Cash - ${entryDate}` });
      await loadPettyData();
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Network error saving end of day count.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveMondayReset = async () => {
    const topUp = parseFloat(mondayTopUpAmount) || 0;
    const finalStartingFloat = mondayCalculatedFloat;

    setSubmitting(true);
    try {
      await postToAppsScript({
        action: 'save_monday_float',
        weekAnchor: currentEntryWeek.start,
        startingFloat: finalStartingFloat,
        topUpAdded: topUp,
        endingCashPrevSunday: previousSundayEndingCash,
        manager: currentUser?.name || 'Manager'
      });
      setStatusMsg({ type: 'success', text: `Monday reset confirmed: Starting float set to £${finalStartingFloat.toFixed(2)}.` });
      setShowMondayModal(false);
      setMondayTopUpAmount('');
      await loadPettyData();
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Failed to record Monday reset.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEditedHistoricalLog = async () => {
    if (!editingLogModal) return;

    setSubmitting(true);
    try {
      const calcPhysCash = Object.values(editingLogModal.denominations).reduce((s, v) => s + (parseFloat(v) || 0), 0);
      const calcDaySpend = editingLogModal.items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);

      const editWeek = getWeekRange(editingLogModal.date);
      const editPriorSpend = historyLogs
        .filter(l => l.date >= editWeek.start && l.date < editingLogModal.date)
        .reduce((s, l) => s + (Number(l.expensesTotal) || 0), 0);

      const editCumul = editPriorSpend + calcDaySpend;
      const editVariance = (calcPhysCash + editCumul) - Number(editingLogModal.floatAmount || activeWeekFloat);

      const payload = {
        action: 'save_petty_cash',
        id: `pc-${editingLogModal.date}`,
        date: editingLogModal.date,
        day: editingLogModal.day,
        weekAnchor: editWeek.start,
        manager: currentUser?.name || editingLogModal.manager,
        cashCount: calcPhysCash,
        floatAmount: Number(editingLogModal.floatAmount || activeWeekFloat),
        expensesTotal: calcDaySpend,
        cumulativeReceipts: editCumul,
        variance: editVariance,
        items: editingLogModal.items,
        receiptUrls: editingLogModal.receiptUrls || [],
        denominations: editingLogModal.denominations
      };

      await postToAppsScript(payload);
      setEditingLogModal(null);
      setStatusMsg({ type: 'success', text: `Updated and overwritten file for ${editingLogModal.date} in Drive!` });
      await loadPettyData();
      if (entryDate === editingLogModal.date) {
        fetchDayFromDriveFolder(entryDate);
      }
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Failed to update historical record.' });
    } finally {
      setSubmitting(false);
    }
  };

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

  const aggregateSummary = useMemo(() => {
    let totExp = 0;
    let closingCash = 0;
    let netVar = 0;

    filteredSummaryLogs.forEach(l => {
      totExp += Number(l.expensesTotal || 0);
    });

    if (filteredSummaryLogs.length > 0) {
      closingCash = Number(filteredSummaryLogs[0].cashCount || 0);
      netVar = Number(filteredSummaryLogs[0].variance || 0);
    }

    return { totExp, closingCash, netVar };
  }, [filteredSummaryLogs]);

  const handleSaveWeeklyReport = async () => {
    if (filteredSummaryLogs.length === 0) return;
    setExportingDrive(true);
    setStatusMsg(null);

    const weekLabel = summaryViewMode === 'week' ? selectedWeekRange.label : filterDate;

    try {
      const json = await postToAppsScript({
        action: 'export_petty_cash_summary',
        weekLabel: weekLabel,
        activeFloat: activeWeekFloat,
        totalExpenses: aggregateSummary.totExp,
        closingCash: aggregateSummary.closingCash,
        netVariance: aggregateSummary.netVar,
        logs: filteredSummaryLogs
      });
      if (json && json.status === 'success') {
        setStatusMsg({ 
          type: 'success', 
          text: `Weekly reports saved: Ledger Sheet & Formatted Document created in Drive!` 
        });
      }
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Failed to generate weekly reports.' });
    } finally {
      setExportingDrive(false);
    }
  };

  const handleOpenPdfReport = async () => {
    if (filteredSummaryLogs.length === 0) return;
    setExportingDrive(true);
    setStatusMsg({ type: 'info', text: 'Compiling weekly audit and generating PDF...' });

    const weekLabel = summaryViewMode === 'week' ? selectedWeekRange.label : filterDate;

    try {
      const json = await postToAppsScript({
        action: 'export_petty_cash_summary',
        weekLabel: weekLabel,
        activeFloat: activeWeekFloat,
        totalExpenses: aggregateSummary.totExp,
        closingCash: aggregateSummary.closingCash,
        netVariance: aggregateSummary.netVar,
        logs: filteredSummaryLogs
      });
      if (json && json.pdfUrl) {
        window.open(json.pdfUrl, '_blank');
        setStatusMsg({ type: 'success', text: 'PDF opened in new tab.' });
      }
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Failed to generate PDF.' });
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
        <div className="flex items-center space-x-3 text-sm font-medium">
          <button 
            onClick={() => setShowMondayModal(true)} 
            className="p-1 text-gray-500 hover:text-black rounded-lg flex items-center space-x-1"
            title="Monday Float Top-Up"
          >
            <Settings className="w-4 h-4" />
            <span className="text-xs font-bold">Top-Up</span>
          </button>
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
        /* TAB 1: DAILY COUNT & DIRECT DRIVE FILE PERSISTENCE                     */
        /* ====================================================================== */
        <div className="flex-1 flex flex-col overflow-y-auto px-5 py-3 space-y-4 pb-28">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 italic text-xs font-serif">End of Day Safe Reconcile (£{activeWeekFloat.toFixed(2)} Float)</p>
              <h1 className="text-2xl font-black tracking-tight text-gray-900 mt-0.5">Petty Cash Count</h1>
            </div>
            {existingRecordUrl && (
              <a
                href={existingRecordUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-lg text-[10px] font-bold"
              >
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>Drive File Ready</span>
                <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
              </a>
            )}
          </div>

          {statusMsg && (
            <div className={`p-2.5 rounded-xl text-xs font-semibold ${statusMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : statusMsg.type === 'info' ? 'bg-blue-50 text-blue-800 border border-blue-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
              {statusMsg.text}
            </div>
          )}

          {/* Date Selector Header Grid with File Search Spinner */}
          <div className="grid grid-cols-12 gap-2 text-xs bg-[#F8F8F8] p-2.5 rounded-2xl border border-gray-200 items-center relative">
            <div className="col-span-6 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <label className="block text-[9px] font-bold uppercase text-gray-400">Date</label>
                {loadingDateFile && <Loader2 className="w-2.5 h-2.5 text-gray-500 animate-spin" />}
              </div>
              <input 
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full bg-white border border-gray-200 py-1 px-2 rounded-lg text-xs font-bold focus:outline-none appearance-none"
              />
            </div>
            <div className="col-span-6 min-w-0">
              <label className="block text-[9px] font-bold uppercase text-gray-400 mb-0.5">Day</label>
              <div className="w-full py-1 px-2 bg-gray-200/80 rounded-lg text-xs font-bold text-gray-700 text-center uppercase tracking-wide truncate">
                {entryDay}
              </div>
            </div>
          </div>

          {/* Live Rolling Imprest Balance Card */}
          <div className="bg-black text-white p-4 rounded-2xl shadow-sm space-y-2">
            <div className="flex justify-between items-baseline text-xs font-mono">
              <span className="text-gray-400">ACTIVE WEEK FLOAT</span>
              <span className="font-bold">£{activeWeekFloat.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-baseline text-xs font-mono">
              <span className="text-gray-400">PHYSICAL CASH IN SAFE</span>
              <span className="font-bold text-emerald-400">£{totalPhysicalCash.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-baseline text-xs font-mono">
              <span className="text-gray-400">RECEIPTS IN SAFE</span>
              <span className="font-bold">
                £{cumulativeReceiptsInSafe.toFixed(2)}
                <span className="text-[10px] text-gray-400 ml-1">
                  (Prior £{priorWeekSpend.toFixed(2)} + Today £{totalExpensesToday.toFixed(2)})
                </span>
              </span>
            </div>
            <div className="border-t border-white/20 pt-2 flex justify-between items-baseline">
              <span className="text-xs font-bold uppercase tracking-wider">Daily Variance</span>
              <span className={`text-base font-black font-mono ${dailyVariance === 0 ? 'text-emerald-400' : dailyVariance < 0 ? 'text-red-400' : 'text-amber-400'}`}>
                {dailyVariance > 0 ? `+£${dailyVariance.toFixed(2)}` : dailyVariance < 0 ? `-£${Math.abs(dailyVariance).toFixed(2)}` : '£0.00 (Balanced)'}
              </span>
            </div>
          </div>

          {/* Denominations: Large Notes and Incremental Multiples */}
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="block font-bold text-gray-900 uppercase tracking-wider text-[11px]">
                Safe Cash Denominations (£)
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
                        value={denomValues[d.id]}
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
          </div>

          {/* Add Payout / Invoice Form */}
          <form onSubmit={handleQueueExpense} className="bg-gray-50 border border-gray-200 rounded-2xl p-3.5 space-y-3 text-xs">
            <span className="block font-bold text-gray-900 uppercase tracking-wider text-[11px]">Add Paid-Out Receipt</span>
            
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
              disabled={!expenseVendor.trim() || !expenseAmount}
              className="w-full py-2 bg-neutral-800 text-white hover:bg-black disabled:opacity-40 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Queue Outgoing for Today</span>
            </button>
          </form>

          {/* Outgoings Queue */}
          <div className="space-y-2">
            <div className="flex justify-between items-center px-1">
              <span className="text-[11px] font-bold uppercase text-gray-400">
                Today's Outgoings ({expenseList.length} items • £{totalExpensesToday.toFixed(2)})
              </span>
              {lastSavedTimestamp && (
                <span className="text-[10px] text-gray-400 font-mono">Last count: {lastSavedTimestamp}</span>
              )}
            </div>

            {expenseList.length === 0 ? (
              <div className="border border-dashed border-gray-200 rounded-2xl py-6 text-center text-xs text-gray-400">
                No outgoings logged for this date yet.
              </div>
            ) : (
              <div className="border border-gray-200 rounded-2xl divide-y divide-gray-100 bg-white overflow-hidden shadow-sm">
                {expenseList.map((item, idx) => (
                  <div key={item.id || idx} className="p-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-extrabold text-gray-900 block leading-tight">{item.vendor}</span>
                      <div className="flex items-center space-x-2 text-[10px] text-gray-400 font-mono mt-0.5">
                        <span>{item.category}</span>
                        {(item.fileUrl || item.localPhoto) && (
                          <span className="text-emerald-600 font-bold">• Photo Ready</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="font-mono text-sm font-black text-gray-900">
                        £{Number(item.amount).toFixed(2)}
                      </span>
                      <button 
                        type="button" 
                        onClick={() => handleRemoveQueuedExpense(idx)}
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

          {/* Submit End of Day Count */}
          <button
            type="button"
            disabled={submitting}
            onClick={handleSaveEndOfDay}
            className="w-full py-3.5 bg-black text-white rounded-2xl text-xs font-bold hover:bg-neutral-800 transition disabled:opacity-50 flex items-center justify-center space-x-2 shadow-sm"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{submitting ? 'Recording End of Day in Drive...' : 'Submit End of Day Count'}</span>
          </button>
        </div>

      ) : (

        /* ====================================================================== */
        /* TAB 2: SUMMARY WITH EDITABLE MODAL & DUAL EXPORTS                       */
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

            {/* DUAL EXPORT ACTIONS */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                disabled={exportingDrive || filteredSummaryLogs.length === 0}
                onClick={handleSaveWeeklyReport}
                className="py-2.5 bg-black hover:bg-neutral-800 disabled:opacity-40 text-white text-xs font-bold rounded-xl flex items-center justify-center space-x-1.5 transition shadow-sm"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>{exportingDrive ? 'Saving...' : 'Save to Drive'}</span>
              </button>
              <button
                type="button"
                disabled={exportingDrive || filteredSummaryLogs.length === 0}
                onClick={handleOpenPdfReport}
                className="py-2.5 bg-neutral-100 hover:bg-neutral-200 disabled:opacity-40 text-neutral-900 border border-neutral-300 text-xs font-bold rounded-xl flex items-center justify-center space-x-1.5 transition shadow-sm"
              >
                <FileDown className="w-3.5 h-3.5 text-neutral-700" />
                <span>Open as PDF</span>
              </button>
            </div>
          </div>

          <div className="px-5 pt-3">
            <div className="bg-neutral-900 text-white p-3.5 rounded-2xl space-y-1.5 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-gray-400">Total Week Outgoings:</span>
                <span className="font-bold">£{aggregateSummary.totExp.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Closing Safe Cash:</span>
                <span className="font-bold text-emerald-400">£{aggregateSummary.closingCash.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-white/20 pt-1 font-bold">
                <span>End-of-Week Variance:</span>
                <span className={aggregateSummary.netVar < 0 ? 'text-red-400' : 'text-emerald-400'}>
                  £{aggregateSummary.netVar.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Clean Date-Titled Summary List (Click opens Historical Edit Modal) */}
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
                    onClick={() => setEditingLogModal(JSON.parse(JSON.stringify(log)))}
                    className="border border-gray-200 rounded-2xl p-4 bg-white shadow-sm hover:border-black transition cursor-pointer space-y-2 group"
                  >
                    <div className="flex justify-between items-baseline">
                      <div>
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
                        <span className="text-gray-400 block text-[9px] uppercase">Day Spend</span>
                        <span className="font-bold text-gray-800">£{Number(log.expensesTotal).toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 pt-1 group-hover:text-black">
                      <span>{(log.items || []).length} invoices • Click to edit</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* HISTORICAL EDIT / OVERWRITE MODAL */}
          {editingLogModal && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border border-gray-200 flex flex-col max-h-[85vh]">
                <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex justify-between items-start bg-gray-50/50">
                  <div>
                    <span className="text-[10px] font-mono uppercase text-gray-400 block font-bold">
                      EDITING LOG • {editingLogModal.day}
                    </span>
                    <h2 className="text-base font-black text-gray-900 leading-snug mt-0.5">
                      {editingLogModal.date}
                    </h2>
                  </div>
                  <button onClick={() => setEditingLogModal(null)} className="p-1.5 text-gray-400 hover:text-black bg-white rounded-full border border-gray-200 shadow-sm">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-5 overflow-y-auto space-y-4 text-xs">
                  <div>
                    <span className="font-bold uppercase tracking-wider text-[10px] text-gray-400 block mb-1.5">
                      Safe Denominations (£)
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {DENOMINATIONS.map(d => (
                        <div key={d.id} className="flex items-center bg-gray-50 border border-gray-200 rounded-lg px-2 py-1">
                          <span className="text-gray-500 font-bold text-[10px] w-16 truncate">{d.label}</span>
                          <span className="text-gray-400 mr-1 text-[10px]">£</span>
                          <input
                            type="number"
                            step={d.step}
                            value={editingLogModal.denominations[d.id] || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditingLogModal(prev => ({
                                ...prev,
                                denominations: { ...prev.denominations, [d.id]: val }
                              }));
                            }}
                            className="w-full text-right font-mono font-bold text-gray-900 bg-transparent focus:outline-none text-[11px]"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="font-bold uppercase tracking-wider text-[10px] text-gray-400 block mb-1">
                      Invoices & Outgoings ({editingLogModal.items.length})
                    </span>
                    <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden bg-white">
                      {editingLogModal.items.map((exp, i) => (
                        <div key={i} className="p-2.5 flex justify-between items-center text-xs">
                          <div>
                            <span className="font-bold text-gray-900 block">{exp.vendor}</span>
                            <div className="flex items-center space-x-1.5 mt-0.5">
                              <span className="text-[10px] text-gray-400">{exp.category}</span>
                              {exp.fileUrl && (
                                <a href={exp.fileUrl} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 hover:underline flex items-center">
                                  <span>Photo</span>
                                  <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                                </a>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-gray-900">£{Number(exp.amount).toFixed(2)}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingLogModal(prev => ({
                                  ...prev,
                                  items: prev.items.filter((_, idx) => idx !== i)
                                }));
                              }}
                              className="text-gray-400 hover:text-red-500 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {editingLogModal.fileUrl && (
                    <a
                      href={editingLogModal.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full py-2 bg-gray-100 text-gray-800 rounded-xl flex items-center justify-center space-x-1.5 font-bold hover:bg-gray-200 transition text-[11px]"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Open File in Drive</span>
                      <ExternalLink className="w-3 h-3 text-gray-400 ml-1" />
                    </a>
                  )}

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleSaveEditedHistoricalLog}
                    className="w-full py-3 bg-black text-white rounded-xl text-xs font-bold hover:bg-neutral-800 transition disabled:opacity-50 flex items-center justify-center space-x-2 shadow-sm"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{submitting ? 'Updating...' : 'Update & Overwrite Day'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MONDAY TOP-UP MODAL */}
      {showMondayModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border border-gray-200 p-5 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-mono uppercase text-gray-400 font-bold block">Monday Morning Setup</span>
                <h2 className="text-lg font-black text-gray-900">Weekly Float Top-Up</h2>
              </div>
              <button onClick={() => setShowMondayModal(false)} className="p-1 text-gray-400 hover:text-black">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-neutral-50 rounded-2xl border border-neutral-200 text-xs font-mono space-y-1.5">
              <div className="flex justify-between">
                <span className="text-gray-500">Sunday Ending Cash:</span>
                <span className="font-bold text-gray-800">£{previousSundayEndingCash.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-1">
                <span className="text-gray-500">Target Full Float:</span>
                <span className="font-bold text-gray-800">£{DEFAULT_FLOAT_TARGET.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[11px] text-blue-600 font-bold">
                <span>Top-Up Needed for £1,200:</span>
                <span>£{Math.max(0, DEFAULT_FLOAT_TARGET - previousSundayEndingCash).toFixed(2)}</span>
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
                  onChange={(e) => setMondayTopUpAmount(e.target.value)}
                  className="w-full bg-[#EDEDED] py-2 px-3 rounded-xl font-bold text-gray-900 focus:outline-none"
                />
              </div>

              <div className="p-3 bg-neutral-900 text-white rounded-xl space-y-1 font-mono text-xs">
                <div className="flex justify-between items-baseline">
                  <span className="text-gray-400 text-[10px] uppercase">New Week Starting Float:</span>
                  <span className="font-bold text-emerald-400 text-sm">£{mondayCalculatedFloat.toFixed(2)}</span>
                </div>
                {mondayCalculatedFloat !== DEFAULT_FLOAT_TARGET && (
                  <p className="text-[10px] text-amber-300 leading-tight pt-1">
                    Float starts £{Math.abs(DEFAULT_FLOAT_TARGET - mondayCalculatedFloat).toFixed(2)} {mondayCalculatedFloat < DEFAULT_FLOAT_TARGET ? 'short' : 'over'} target. Daily variance will reconcile against £{mondayCalculatedFloat.toFixed(2)}.
                  </p>
                )}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                disabled={submitting}
                onClick={handleSaveMondayReset}
                className="w-full py-3 bg-black text-white rounded-xl text-xs font-bold hover:bg-neutral-800 transition"
              >
                {submitting ? 'Confirming...' : 'Confirm Week Starting Float'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Bottom Nav */}
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