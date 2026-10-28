import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ArrowLeft, 
  Plus, 
  Minus, 
  Trash2, 
  Camera, 
  X, 
  ExternalLink, 
  RefreshCw, 
  Settings, 
  CheckCircle2, 
  ChevronLeft, 
  ChevronRight 
} from 'lucide-react';
import { useTwoFingerSwipe } from './useTwoFingerSwipe';
import { supabase, DEFAULT_VENUE_ID } from './lib/db';
import { sendPushNotification } from './lib/notifications';

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

  const anchor = daysDates[0].isoDate;
  const label = `${daysDates[0].ukDate.replace(/\//g, '-')} to ${daysDates[6].ukDate.replace(/\//g, '-')}`;

  return { anchor, label, daysDates, mondayDate: mon };
}

async function compressImageToBlob(file, maxWidth = 1200, quality = 0.7) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const elem = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        elem.width = width;
        elem.height = height;
        const ctx = elem.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        elem.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
      };
    };
  });
}

export default function PettyCashApp({ currentUser, onBackToHub, onLogout }) {
  const [activeTab, setActiveTab] = useState('ledger');
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);

  const activeWeek = useMemo(() => {
    const base = new Date();
    base.setDate(base.getDate() + currentWeekOffset * 7);
    return getWeekInfo(base);
  }, [currentWeekOffset]);

  const [selectedDayIndex, setSelectedDayIndex] = useState(() => {
    const today = new Date().getDay();
    return today === 0 ? 6 : today - 1;
  });

  const selectedDayInfo = activeWeek.daysDates[selectedDayIndex];

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

  const [startingFloat, setStartingFloat] = useState(DEFAULT_FLOAT);
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  const [expenseVendor, setExpenseVendor] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('Supplies');
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const fileInputRef = useRef(null);

  const [showMondayModal, setShowMondayModal] = useState(false);
  const [mondayTopUpAmount, setMondayTopUpAmount] = useState('');
  const [customStartingFloat, setCustomStartingFloat] = useState(DEFAULT_FLOAT);

  const swipeHandlers = useTwoFingerSwipe({
    disabled: showMondayModal,
    onSwipeLeft: () => {
      if (activeTab === 'ledger') setActiveTab('daily');
    },
    onSwipeRight: () => {
      if (activeTab === 'daily') {
        setActiveTab('ledger');
      } else if (activeTab === 'ledger' && onBackToHub) {
        onBackToHub();
      }
    }
  });

  const loadWeekData = async () => {
    try {
      const [ledgerRes, floatRes] = await Promise.all([
        supabase
          .from('petty_weekly_ledgers')
          .select('*')
          .eq('venue_id', DEFAULT_VENUE_ID)
          .eq('week_anchor', activeWeek.anchor)
          .maybeSingle(),
        supabase
          .from('petty_cash_floats')
          .select('starting_float')
          .eq('venue_id', DEFAULT_VENUE_ID)
          .eq('week_anchor', activeWeek.anchor)
          .maybeSingle()
      ]);

      if (floatRes.data) {
        setStartingFloat(Number(floatRes.data.starting_float) || DEFAULT_FLOAT);
      }

      if (ledgerRes.data && ledgerRes.data.week_data) {
        setWeekData(ledgerRes.data.week_data);
      } else {
        const emptyDays = {};
        DAYS_OF_WEEK.forEach(d => {
          emptyDays[d] = { expenses: [], cashCount: '', denoms: {} };
        });
        setWeekData({ days: emptyDays, dates: activeWeek.daysDates.map(d => d.ukDate) });
      }
    } catch (err) {
      console.warn("Could not load week data:", err);
    }
  };

  useEffect(() => {
    loadWeekData();
  }, [activeWeek.anchor]);

  const currentDayData = weekData.days[selectedDayInfo.dayName] || { expenses: [], cashCount: '', denoms: {} };
  const currentDayDenoms = currentDayData.denoms || {};

  const totalPhysicalCash = useMemo(() => {
    return Object.values(currentDayDenoms).reduce((sum, val) => {
      const num = parseFloat(val);
      return sum + (isNaN(num) ? 0 : num);
    }, 0);
  }, [currentDayDenoms]);

  const rollingStats = useMemo(() => {
    const daySpends = [];
    const cumulativeExpenses = [];
    const cashCounts = [];
    const subTotals = [];
    const variances = [];

    let runningExp = 0;
    let lastCash = 0;

    DAYS_OF_WEEK.forEach((dName) => {
      const dObj = weekData.days[dName] || { expenses: [], cashCount: '' };
      const dSpend = (dObj.expenses || []).reduce((acc, it) => acc + (parseFloat(it.amount) || 0), 0);
      daySpends.push(dSpend);

      runningExp += dSpend;
      cumulativeExpenses.push(runningExp);

      const cCount = (dObj.cashCount !== '' && dObj.cashCount !== undefined && !isNaN(dObj.cashCount)) 
        ? parseFloat(dObj.cashCount) 
        : null;
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

  const syncWeekToSupabase = async (updatedWeekData) => {
    setSubmitting(true);
    setStatusMsg({ type: 'info', text: 'Updating weekly ledger in database...' });

    try {
      const { error } = await supabase.from('petty_weekly_ledgers').upsert({
        venue_id: DEFAULT_VENUE_ID,
        week_anchor: activeWeek.anchor,
        week_label: activeWeek.label,
        week_data: {
          ...updatedWeekData,
          dates: activeWeek.daysDates.map(d => d.ukDate)
        },
        updated_at: new Date().toISOString()
      }, { onConflict: 'week_anchor' });

      if (error) throw error;
      setStatusMsg({ type: 'success', text: `Weekly ledger synchronized!` });
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Failed to update ledger.' });
    } finally {
      setSubmitting(false);
    }
  };

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

  const handleImageCapture = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setReceiptFile(file);
    setReceiptPreview(URL.createObjectURL(file));
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    const amt = parseFloat(expenseAmount);
    if (!expenseVendor.trim() || isNaN(amt) || amt <= 0) return;

    setSubmitting(true);
    setStatusMsg({ type: 'info', text: 'Compressing and uploading photo...' });

    try {
      let uploadedUrl = "";

      if (receiptFile) {
        const compressedBlob = await compressImageToBlob(receiptFile);
        const fileName = `${activeWeek.anchor}_${Date.now()}.jpg`;

        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('receipts')
          .upload(fileName, compressedBlob, { contentType: 'image/jpeg' });

        if (!uploadErr && uploadData) {
          const { data: publicUrlData } = supabase.storage
            .from('receipts')
            .getPublicUrl(fileName);
          uploadedUrl = publicUrlData?.publicUrl || "";
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
      await syncWeekToSupabase(updatedWeek);

      setExpenseVendor('');
      setExpenseAmount('');
      setReceiptFile(null);
      setReceiptPreview(null);
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Error adding payout.' });
    } finally {
      setSubmitting(false);
    }
  };

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
    await syncWeekToSupabase(updatedWeek);
  };

  const handleSaveDayCashCount = async () => {
    await syncWeekToSupabase(weekData);
  };

  const handleConfirmMondaySetup = async () => {
    setSubmitting(true);
    try {
      const { error } = await supabase.from('petty_cash_floats').insert({
        venue_id: DEFAULT_VENUE_ID,
        week_anchor: activeWeek.anchor,
        starting_float: customStartingFloat,
        top_up_added: parseFloat(mondayTopUpAmount) || 0,
        ending_cash_prev_sunday: rollingStats.lastCash,
        manager_name: currentUser?.name || 'Manager'
      });

      if (error) throw error;

      setStartingFloat(customStartingFloat);
      setShowMondayModal(false);
      setStatusMsg({ type: 'success', text: `Week starting float set to £${customStartingFloat.toFixed(2)}.` });

      sendPushNotification(
        "Petty Cash Float Established",
        `${currentUser?.name || 'Manager'} set float of £${customStartingFloat.toFixed(2)}`,
        null,
        { module: 'petty' }
      );

      await syncWeekToSupabase(weekData);
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Failed to record Monday setup.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div 
      {...swipeHandlers}
      className="flex flex-col h-screen w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 overflow-x-hidden relative"
    >
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
          <button 
            onClick={() => setShowMondayModal(true)} 
            className="p-1 text-gray-500 hover:text-black rounded-lg flex items-center space-x-1"
            title="Monday Float Setup"
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="text-[11px] font-bold">Float</span>
          </button>
          {onBackToHub ? (
            <button onClick={onBackToHub} className="text-gray-900 hover:text-black font-semibold">Hub</button>
          ) : (
            <button onClick={onLogout} className="text-gray-900 hover:text-black">Logout</button>
          )}
        </div>
      </header>

      <div className="px-5 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
        <button 
          onClick={() => setCurrentWeekOffset(prev => prev - 1)} 
          className="p-1 hover:bg-gray-200 rounded-lg text-gray-600 transition"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <div className="text-center">
          <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 block">Weekly Ledger</span>
          <span className="text-[11px] font-black text-gray-900 font-mono">{activeWeek.label}</span>
        </div>
        <button 
          onClick={() => setCurrentWeekOffset(prev => prev + 1)} 
          className="p-1 hover:bg-gray-200 rounded-lg text-gray-600 transition"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {activeTab === 'ledger' ? (
        <div className="flex-1 flex flex-col overflow-hidden pb-20">
          <div className="px-5 pt-3 pb-2 border-b border-gray-100 flex-shrink-0 space-y-2">
            <div className="flex justify-between items-baseline">
              <div>
                <p className="text-gray-500 italic text-[11px] font-serif">Monday to Sunday Rolling Audit</p>
                <h1 className="text-xl font-black tracking-tight text-gray-900">Weekly Safe Sheet</h1>
              </div>
              <button onClick={loadWeekData} className="text-xs font-semibold text-gray-500 hover:text-black underline flex items-center space-x-1">
                <RefreshCw className="w-3 h-3" />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          <div className="px-5 pt-2.5 flex-shrink-0">
            <div className="bg-neutral-900 text-white p-3 rounded-2xl space-y-1 text-[11px] font-mono">
              <div className="flex justify-between">
                <span className="text-gray-400">Total Week Outgoings:</span>
                <span className="font-bold">£{rollingStats.runningExp.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Latest Safe Cash:</span>
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

          <div className="flex-1 overflow-auto p-5">
            <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm bg-white min-w-[560px]">
              <table className="w-full text-[10px] font-mono border-collapse">
                <thead>
                  <tr className="bg-black text-white text-center">
                    <th className="p-1.5 text-left font-sans">DATE</th>
                    {activeWeek.daysDates.map(d => (
                      <th key={d.dayName} className="p-1.5 font-mono">{d.ukDate.slice(0, 5)}</th>
                    ))}
                    <th className="p-1.5 font-bold bg-neutral-800">TOTAL</th>
                  </tr>
                  <tr className="bg-gray-100 text-gray-700 text-center border-b border-gray-200">
                    <th className="p-1.5 text-left font-bold">VENDOR</th>
                    {DAY_SHORT.map(s => (
                      <th key={s} className="p-1.5 font-bold">{s}</th>
                    ))}
                    <th className="p-1.5 font-bold bg-gray-200">TOTAL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {Array.from(new Set(
                    DAYS_OF_WEEK.flatMap(d => (weekData.days[d]?.expenses || []).map(it => it.vendor))
                  )).map(vendorName => {
                    let vendorSum = 0;
                    return (
                      <tr key={vendorName} className="hover:bg-gray-50 text-[10px]">
                        <td className="p-1.5 font-sans font-bold text-gray-900 truncate max-w-[110px]">{vendorName}</td>
                        {DAYS_OF_WEEK.map(d => {
                          const matching = (weekData.days[d]?.expenses || []).filter(it => it.vendor === vendorName);
                          const dayAmt = matching.reduce((acc, it) => acc + (parseFloat(it.amount) || 0), 0);
                          vendorSum += dayAmt;
                          return (
                            <td key={d} className="p-1.5 text-right">
                              {dayAmt > 0 ? `£${dayAmt.toFixed(2)}` : ''}
                            </td>
                          );
                        })}
                        <td className="p-1.5 text-right font-bold bg-gray-50">
                          {vendorSum > 0 ? `£${vendorSum.toFixed(2)}` : ''}
                        </td>
                      </tr>
                    );
                  })}

                  <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                    <td className="p-1.5 font-sans">Total Expenses</td>
                    {rollingStats.cumulativeExpenses.map((val, idx) => (
                      <td key={idx} className="p-1.5 text-right font-mono">£{val.toFixed(2)}</td>
                    ))}
                    <td className="p-1.5 text-right font-mono bg-gray-100">£{rollingStats.runningExp.toFixed(2)}</td>
                  </tr>

                  <tr className="font-bold">
                    <td className="p-1.5 font-sans">Cash Count</td>
                    {rollingStats.cashCounts.map((val, idx) => (
                      <td key={idx} className="p-1.5 text-right font-mono text-emerald-700">
                        {val !== null ? `£${val.toFixed(2)}` : ''}
                      </td>
                    ))}
                    <td className="p-1.5 text-right font-mono bg-gray-50 text-emerald-700">£{rollingStats.lastCash.toFixed(2)}</td>
                  </tr>

                  <tr className="font-bold border-t border-gray-200">
                    <td className="p-1.5 font-sans">Sub Total</td>
                    {rollingStats.subTotals.map((val, idx) => (
                      <td key={idx} className="p-1.5 text-right font-mono">£{val.toFixed(2)}</td>
                    ))}
                    <td className="p-1.5 text-right font-mono bg-gray-50">£{(rollingStats.lastCash + rollingStats.runningExp).toFixed(2)}</td>
                  </tr>

                  <tr className="text-gray-500">
                    <td className="p-1.5 font-sans font-bold">Float</td>
                    {DAYS_OF_WEEK.map((_, idx) => (
                      <td key={idx} className="p-1.5 text-right font-mono">£{startingFloat.toFixed(2)}</td>
                    ))}
                    <td className="p-1.5 text-right font-mono bg-gray-50 font-bold">£{startingFloat.toFixed(2)}</td>
                  </tr>

                  <tr className="font-bold border-t border-gray-200">
                    <td className="p-1.5 font-sans">Daily Variance</td>
                    {rollingStats.variances.map((val, idx) => (
                      <td key={idx} className={`p-1.5 text-right font-mono ${val < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                        £{val.toFixed(2)}
                      </td>
                    ))}
                    <td className={`p-1.5 text-right font-mono bg-gray-100 ${rollingStats.netWeekVariance < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                      £{rollingStats.netWeekVariance.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-y-auto px-5 py-3 space-y-3.5 pb-20">
          <div className="grid grid-cols-7 gap-1 bg-gray-100 p-1 rounded-2xl flex-shrink-0">
            {activeWeek.daysDates.map((dayObj, idx) => {
              const isSelected = selectedDayIndex === idx;
              const hasSpend = (weekData.days[dayObj.dayName]?.expenses || []).length > 0;
              return (
                <button
                  key={dayObj.dayName}
                  onClick={() => setSelectedDayIndex(idx)}
                  className={`py-1.5 px-0.5 rounded-xl flex flex-col items-center justify-center transition relative ${
                    isSelected 
                      ? 'bg-black text-white shadow-sm' 
                      : 'hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  <span className="text-[9px] font-bold uppercase">{dayObj.shortName}</span>
                  <span className="text-[8px] font-mono opacity-70">{dayObj.ukDate.slice(0, 5)}</span>
                  {hasSpend && (
                    <span className={`w-1 h-1 rounded-full absolute bottom-0.5 ${isSelected ? 'bg-emerald-400' : 'bg-black'}`} />
                  )}
                </button>
              );
            })}
          </div>

          {statusMsg && (
            <div className={`p-2 rounded-xl text-[11px] font-semibold ${statusMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : statusMsg.type === 'info' ? 'bg-blue-50 text-blue-800 border border-blue-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
              {statusMsg.text}
            </div>
          )}

          <div className="bg-black text-white p-3 rounded-2xl shadow-sm space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between items-baseline">
              <span className="text-gray-400">ACTIVE FLOAT</span>
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
            <div className="border-t border-white/20 pt-1.5 flex justify-between items-baseline">
              <span className="text-[10px] font-bold uppercase tracking-wider">Variance to Float</span>
              <span className={`text-sm font-black ${rollingStats.variances[selectedDayIndex] === 0 ? 'text-emerald-400' : rollingStats.variances[selectedDayIndex] < 0 ? 'text-red-400' : 'text-amber-400'}`}>
                {rollingStats.variances[selectedDayIndex] > 0 
                  ? `+£${rollingStats.variances[selectedDayIndex].toFixed(2)}` 
                  : rollingStats.variances[selectedDayIndex] < 0 
                  ? `-£${Math.abs(rollingStats.variances[selectedDayIndex]).toFixed(2)}` 
                  : '£0.00 (Balanced)'}
              </span>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="block font-bold text-gray-900 uppercase tracking-wider text-[10px]">
                {selectedDayInfo.dayName} Safe Cash Breakdown
              </span>
              <span className="text-[9px] font-mono text-gray-500 font-bold">
                Tot: £{totalPhysicalCash.toFixed(2)}
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              {DENOMINATIONS.map(d => (
                <div key={d.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-2.5 py-1 focus-within:border-black transition">
                  <span className="w-20 font-bold text-gray-800 text-[11px] truncate">{d.label}</span>
                  
                  <div className="flex items-center space-x-1 flex-1 justify-end">
                    <button
                      type="button"
                      onClick={() => stepDenom(d.id, d.step, false)}
                      className="p-0.5 hover:bg-gray-100 rounded text-gray-500 active:scale-95 transition"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    
                    <div className="flex items-center w-20 bg-gray-50 px-1.5 py-0.5 rounded-lg border border-gray-200">
                      <span className="text-gray-400 text-[10px] mr-1">£</span>
                      <input
                        type="number"
                        step={d.step}
                        value={currentDayDenoms[d.id] || ''}
                        onChange={(e) => handleDenomChange(d.id, e.target.value)}
                        className="w-full text-right font-mono font-bold text-gray-900 bg-transparent focus:outline-none text-[11px]"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => stepDenom(d.id, d.step, true)}
                      className="p-0.5 hover:bg-gray-100 rounded text-gray-800 active:scale-95 transition"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={handleSaveDayCashCount}
              className="w-full py-1.5 bg-neutral-900 hover:bg-black text-white text-[11px] font-bold rounded-xl transition flex items-center justify-center space-x-1.5 mt-1 shadow-sm"
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>Update {selectedDayInfo.dayName} Safe Count</span>
            </button>
          </div>

          <form onSubmit={handleAddExpense} className="bg-gray-50 border border-gray-200 rounded-2xl p-3 space-y-2.5 text-xs">
            <span className="block font-bold text-gray-900 uppercase tracking-wider text-[10px]">
              Add Payout to {selectedDayInfo.dayName} Column
            </span>
            
            <div className="space-y-1">
              <input 
                type="text"
                placeholder="Vendor / Description"
                value={expenseVendor}
                onChange={(e) => setExpenseVendor(e.target.value)}
                className="w-full bg-white border border-gray-300 py-1.5 px-2.5 rounded-xl text-xs font-medium focus:outline-none"
              />
              <div className="flex items-center space-x-1 overflow-x-auto pb-0.5 scrollbar-none pt-0.5">
                {COMMON_VENDORS.map(v => (
                  <button 
                    key={v}
                    type="button"
                    onClick={() => setExpenseVendor(v)}
                    className="px-1.5 py-0.5 bg-gray-200/70 hover:bg-gray-300 text-[9px] font-semibold rounded-md whitespace-nowrap text-gray-700"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-12 gap-1.5">
              <div className="col-span-6">
                <input 
                  type="number" 
                  step="0.01" 
                  value={expenseAmount} 
                  onChange={(e) => setExpenseAmount(e.target.value)} 
                  className="w-full bg-white border border-gray-300 py-1.5 px-2.5 rounded-xl text-xs font-bold text-black focus:outline-none" 
                />
              </div>
              <div className="col-span-6">
                <select 
                  value={expenseCategory} 
                  onChange={(e) => setExpenseCategory(e.target.value)} 
                  className="w-full bg-white border border-gray-300 py-1.5 px-2 rounded-xl text-[11px] font-semibold text-gray-700 focus:outline-none"
                >
                  <option value="Supplies">Bar Supplies</option>
                  <option value="Groceries">Groceries / Fruit</option>
                  <option value="Wages">Wages / Shift Pay</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Travel">Staff Travel / Taxi</option>
                </select>
              </div>
            </div>

            <div className="flex items-center space-x-1.5 pt-0.5">
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
                className={`flex-1 py-1.5 px-2.5 rounded-xl border text-[11px] font-bold flex items-center justify-center space-x-1 transition ${
                  receiptPreview 
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800' 
                    : 'bg-white border-gray-300 hover:bg-gray-100 text-gray-700'
                }`}
              >
                <Camera className="w-3 h-3" />
                <span>{receiptPreview ? 'Receipt Attached ✓' : 'Scan Receipt'}</span>
              </button>
              {receiptPreview && (
                <button 
                  type="button" 
                  onClick={() => { setReceiptFile(null); setReceiptPreview(null); }}
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting || !expenseVendor.trim() || !expenseAmount}
              className="w-full py-2 bg-black text-white hover:bg-neutral-800 disabled:opacity-40 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1 shadow-sm"
            >
              <Plus className="w-3 h-3" />
              <span>{submitting ? 'Saving...' : `Add to ${selectedDayInfo.dayName}`}</span>
            </button>
          </form>

          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase text-gray-400 px-1">
              {selectedDayInfo.dayName} Payouts ({(currentDayData.expenses || []).length} items • £{rollingStats.daySpends[selectedDayIndex].toFixed(2)})
            </span>

            {(currentDayData.expenses || []).length === 0 ? (
              <div className="border border-dashed border-gray-200 rounded-2xl py-4 text-center text-xs text-gray-400">
                No payouts recorded for {selectedDayInfo.dayName}.
              </div>
            ) : (
              <div className="border border-gray-200 rounded-2xl divide-y divide-gray-100 bg-white overflow-hidden shadow-sm">
                {(currentDayData.expenses || []).map((item, idx) => (
                  <div key={item.id || idx} className="p-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-extrabold text-gray-900 block leading-tight text-[11px]">{item.vendor}</span>
                      <div className="flex items-center space-x-1.5 text-[9px] text-gray-400 font-mono mt-0.5">
                        <span>{item.category}</span>
                        {item.fileUrl && (
                          <a href={item.fileUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center">
                            <span>Photo</span>
                            <ExternalLink className="w-2 h-2 ml-0.5" />
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs font-black text-gray-900">
                        £{Number(item.amount).toFixed(2)}
                      </span>
                      <button 
                        type="button" 
                        onClick={() => handleRemoveExpense(idx)}
                        className="text-gray-400 hover:text-red-500 p-1"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showMondayModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border border-gray-200 p-4 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[9px] font-mono uppercase text-gray-400 font-bold block">Monday Morning Setup</span>
                <h2 className="text-base font-black text-gray-900">Float Top-Up</h2>
              </div>
              <button onClick={() => setShowMondayModal(false)} className="p-1 text-gray-400 hover:text-black">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-2.5 bg-neutral-50 rounded-2xl border border-neutral-200 text-xs font-mono space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500 text-[10px]">Sunday Ending Cash:</span>
                <span className="font-bold text-gray-800 text-[11px]">£{rollingStats.lastCash.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-0.5">
                <span className="text-gray-500 text-[10px]">Target Standard Float:</span>
                <span className="font-bold text-gray-800 text-[11px]">£{DEFAULT_FLOAT.toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <label className="block text-[9px] font-bold text-gray-500 uppercase mb-0.5">
                  Cash Top-Up Added (£)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={mondayTopUpAmount}
                  onChange={(e) => {
                    const topUp = parseFloat(e.target.value) || 0;
                    setMondayTopUpAmount(e.target.value);
                    setCustomStartingFloat(rollingStats.lastCash + topUp);
                  }}
                  className="w-full bg-[#EDEDED] py-1.5 px-2.5 rounded-xl font-bold text-gray-900 focus:outline-none text-xs"
                />
              </div>

              <div className="p-2.5 bg-neutral-900 text-white rounded-xl space-y-0.5 font-mono text-xs">
                <div className="flex justify-between items-baseline">
                  <span className="text-gray-400 text-[9px] uppercase">New Week Float:</span>
                  <span className="font-bold text-emerald-400 text-xs">£{customStartingFloat.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={handleConfirmMondaySetup}
              className="w-full py-2 bg-black text-white rounded-xl text-xs font-bold hover:bg-neutral-800 transition"
            >
              {submitting ? 'Confirming...' : 'Confirm Starting Float'}
            </button>
          </div>
        </div>
      )}

      <nav className="fixed bottom-2 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[390px] z-30 rounded-2xl bg-[#111111]/95 backdrop-blur-md text-white py-2 px-3 flex justify-around items-center text-xs font-semibold shadow-2xl border border-white/10 select-none pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
        <button 
          onClick={() => setActiveTab('ledger')} 
          className={`flex-1 py-1.5 text-center rounded-xl transition ${activeTab === 'ledger' ? 'text-white bg-white/15 font-bold shadow-inner' : 'text-gray-400 hover:text-white'}`}
        >
          Weekly Matrix
        </button>
        <button 
          onClick={() => setActiveTab('daily')} 
          className={`flex-1 py-1.5 text-center rounded-xl transition ${activeTab === 'daily' ? 'text-white bg-white/15 font-bold shadow-inner' : 'text-gray-400 hover:text-white'}`}
        >
          Day Column
        </button>
      </nav>
    </div>
  );
}