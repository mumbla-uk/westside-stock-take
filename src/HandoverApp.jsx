import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ArrowLeft, 
  Send, 
  Plus, 
  Trash2, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  MessageSquare, 
  AlertTriangle, 
  X, 
  ExternalLink,
  ChevronRight,
  FileSpreadsheet,
  RefreshCw,
  Search,
  StickyNote
} from 'lucide-react';

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

export default function HandoverApp({ currentUser, onBackToHub, onLogout }) {
  const [activeTab, setActiveTab] = useState('new'); // 'new' | 'diary'

  // Shift metadata
  const [managerName, setManagerName] = useState(currentUser?.name || 'Ross');
  const [managerRole, setManagerRole] = useState(currentUser?.role || 'Assistant General Manager');
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 10));

  // Takings & Close Time (both blank by default for Day Note flexibility)
  const [takings, setTakings] = useState('');
  const [closeTime, setCloseTime] = useState('');

  // Shift notes
  const [generalNotes, setGeneralNotes] = useState('');

  // 86 List (item name & supplier only, no quantity)
  const [eightySixItemName, setEightySixItemName] = useState('');
  const [eightySixSupplier, setEightySixSupplier] = useState('');
  const [eightySixList, setEightySixList] = useState([]);

  // Tomorrow / Follow up tasks
  const [taskInput, setTaskInput] = useState('');
  const [tomorrowTasks, setTomorrowTasks] = useState([]);

  // Diary / History state
  const [historyList, setHistoryList] = useState([]);
  const [historySearch, setHistorySearch] = useState('');
  const [selectedEntryModal, setSelectedEntryModal] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  // Swipe handling
  const touchStartRef = useRef({ x: 0, y: 0 });

  const handleTouchStart = (e) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e) => {
    if (selectedEntryModal) return;
    const deltaX = e.changedTouches[0].clientX - touchStartRef.current.x;
    const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;

    if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX < 0 && activeTab === 'new') setActiveTab('diary');
      else if (deltaX > 0) {
        if (activeTab === 'diary') setActiveTab('new');
        else if (activeTab === 'new' && onBackToHub) onBackToHub();
      }
    }
  };

  // Generate 15-minute close time increments
  const timeOptions15Min = useMemo(() => {
    const times = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 15) {
        const hh = String(h).padStart(2, '0');
        const mm = String(m).padStart(2, '0');
        times.push(`${hh}:${mm}`);
      }
    }
    return times;
  }, []);

  // Determine entry classification live
  const isDayNote = useMemo(() => {
    return (!takings.trim() || takings === '0' || takings === '0.00') && !closeTime.trim();
  }, [takings, closeTime]);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`${HARDWIRED_SCRIPT_URL}?action=all`);
      const json = await res.json();
      if (json && json.status === 'success' && Array.isArray(json.history)) {
        setHistoryList(json.history);
      }
    } catch (err) {
      console.warn("Could not load handover history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  // Add 86 item (without quantity)
  const handleAdd86 = (e) => {
    e.preventDefault();
    if (!eightySixItemName.trim()) return;

    setEightySixList(prev => [
      ...prev,
      {
        id: `86-${Date.now()}`,
        name: eightySixItemName.trim(),
        supplier: eightySixSupplier.trim() || 'Bar'
      }
    ]);

    setEightySixItemName('');
    setEightySixSupplier('');
  };

  const handleRemove86 = (index) => {
    setEightySixList(prev => prev.filter((_, i) => i !== index));
  };

  // Add task
  const handleAddTask = (e) => {
    e.preventDefault();
    if (!taskInput.trim()) return;

    setTomorrowTasks(prev => [...prev, taskInput.trim()]);
    setTaskInput('');
  };

  const handleRemoveTask = (index) => {
    setTomorrowTasks(prev => prev.filter((_, i) => i !== index));
  };

  // Submit Handover / Day Note
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!generalNotes.trim() && eightySixList.length === 0 && tomorrowTasks.length === 0) {
      setStatusMsg({ type: 'error', text: 'Enter notes, 86 items, or tasks before submitting.' });
      return;
    }

    setSubmitting(true);
    setStatusMsg({ type: 'info', text: isDayNote ? 'Saving day note...' : 'Saving closing handover...' });

    try {
      const payload = {
        action: 'handover_report',
        id: `h-${Date.now()}`,
        dateStr: dateStr,
        manager: managerName,
        role: managerRole,
        takings: takings.trim(),
        closeTime: closeTime.trim(),
        generalNotes: generalNotes.trim(),
        eightySixList: eightySixList,
        tomorrowTasks: tomorrowTasks
      };

      const res = await fetch(HARDWIRED_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();

      if (json && json.status === 'success') {
        setStatusMsg({
          type: 'success',
          text: isDayNote ? 'Day note recorded successfully!' : 'Closing handover submitted and filed to Drive!'
        });

        // Reset form
        setTakings('');
        setCloseTime('');
        setGeneralNotes('');
        setEightySixList([]);
        setTomorrowTasks([]);

        await loadHistory();
        setActiveTab('diary');
      } else {
        setStatusMsg({ type: 'error', text: json?.message || 'Error saving handover.' });
      }
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Network error saving report.' });
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered History
  const filteredHistory = useMemo(() => {
    return historyList.filter(item => {
      const q = historySearch.toLowerCase();
      const inManager = (item.manager || '').toLowerCase().includes(q);
      const inDate = (item.dateStr || '').toLowerCase().includes(q);
      const inNotes = (item.generalNotes || '').toLowerCase().includes(q);
      const in86 = (item.eightySixList || []).some(x => (x.name || x).toLowerCase().includes(q));
      return inManager || inDate || inNotes || in86;
    });
  }, [historyList, historySearch]);

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
          {onBackToHub ? (
            <button onClick={onBackToHub} className="text-gray-900 hover:text-black font-semibold">Hub</button>
          ) : (
            <button onClick={onLogout} className="text-gray-900 hover:text-black">Logout</button>
          )}
        </div>
      </header>

      {/* Main Viewport Router */}
      {activeTab === 'new' ? (

        /* ====================================================================== */
        /* TAB 1: NEW ENTRY (HANDOVER OR DAY NOTE)                                */
        /* ====================================================================== */
        <div className="flex-1 flex flex-col overflow-y-auto px-5 py-3 space-y-4 pb-24">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 italic text-xs font-serif">Shift Logbook & Operations</p>
              <h1 className="text-2xl font-black tracking-tight text-gray-900 mt-0.5">Duty Handover</h1>
            </div>
            <span className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${
              isDayNote 
                ? 'bg-amber-50 text-amber-900 border-amber-200' 
                : 'bg-emerald-50 text-emerald-900 border-emerald-200'
            }`}>
              {isDayNote ? <StickyNote className="w-3 h-3 text-amber-600" /> : <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
              <span>{isDayNote ? 'Logging as Day Note' : 'Logging as Close'}</span>
            </span>
          </div>

          {statusMsg && (
            <div className={`p-2.5 rounded-xl text-xs font-semibold ${statusMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : statusMsg.type === 'info' ? 'bg-blue-50 text-blue-800 border border-blue-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
              {statusMsg.text}
            </div>
          )}

          {/* Metadata Card */}
          <div className="bg-[#F8F8F8] border border-gray-200 rounded-2xl p-3 space-y-2.5 text-xs">
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-7">
                <label className="block text-[9px] font-bold uppercase text-gray-400 mb-0.5">Manager</label>
                <input
                  type="text"
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                  className="w-full bg-white border border-gray-200 py-1.5 px-2.5 rounded-xl font-bold text-gray-900 focus:outline-none"
                />
              </div>
              <div className="col-span-5">
                <label className="block text-[9px] font-bold uppercase text-gray-400 mb-0.5">Date</label>
                <input
                  type="date"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  className="w-full bg-white border border-gray-200 py-1.5 px-2 rounded-xl font-bold text-gray-900 focus:outline-none"
                />
              </div>
            </div>

            {/* Takings & 15-Minute Close Time (Leave blank for Day Note) */}
            <div className="grid grid-cols-12 gap-2 pt-1 border-t border-gray-200/60">
              <div className="col-span-6">
                <div className="flex justify-between items-baseline mb-0.5">
                  <label className="block text-[9px] font-bold uppercase text-gray-400">Total Takings (£)</label>
                  <span className="text-[8px] text-gray-400 font-mono">Optional</span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Leave blank for note"
                  value={takings}
                  onChange={(e) => setTakings(e.target.value)}
                  className="w-full bg-white border border-gray-200 py-1.5 px-2.5 rounded-xl font-mono font-bold text-gray-900 focus:outline-none"
                />
              </div>
              <div className="col-span-6">
                <div className="flex justify-between items-baseline mb-0.5">
                  <label className="block text-[9px] font-bold uppercase text-gray-400">Close Time (15m)</label>
                  <span className="text-[8px] text-gray-400 font-mono">Optional</span>
                </div>
                <select
                  value={closeTime}
                  onChange={(e) => setCloseTime(e.target.value)}
                  className="w-full bg-white border border-gray-200 py-1.5 px-2 rounded-xl font-bold text-gray-900 focus:outline-none"
                >
                  <option value="">Leave blank (Day Note)</option>
                  {timeOptions15Min.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* General Shift Notes */}
          <div className="space-y-1">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 px-1">
              General Shift Notes & Operational Handover
            </label>
            <textarea
              rows={4}
              placeholder="Atmosphere, maintenance items, booking pacing, staff highlights, or daytime trade updates..."
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 p-3 rounded-2xl text-xs text-gray-900 focus:bg-white focus:outline-none resize-none leading-relaxed transition"
            />
          </div>

          {/* 86 List (Out of Stock) - No Quantity Required */}
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3.5 space-y-3 text-xs">
            <div className="flex justify-between items-baseline">
              <span className="block font-bold text-gray-900 uppercase tracking-wider text-[11px]">
                86 List (86'd Items)
              </span>
              <span className="text-[10px] text-gray-400 font-mono">{eightySixList.length} items logged</span>
            </div>

            <form onSubmit={handleAdd86} className="space-y-2">
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-7">
                  <input
                    type="text"
                    placeholder="Product / Item name..."
                    value={eightySixItemName}
                    onChange={(e) => setEightySixItemName(e.target.value)}
                    className="w-full bg-white border border-gray-300 py-2 px-3 rounded-xl text-xs font-medium focus:outline-none"
                  />
                </div>
                <div className="col-span-5">
                  <input
                    type="text"
                    placeholder="Supplier / Area"
                    value={eightySixSupplier}
                    onChange={(e) => setEightySixSupplier(e.target.value)}
                    className="w-full bg-white border border-gray-300 py-2 px-2.5 rounded-xl text-xs font-medium focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={!eightySixItemName.trim()}
                className="w-full py-2 bg-neutral-800 text-white hover:bg-black disabled:opacity-40 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add to 86 List</span>
              </button>
            </form>

            {eightySixList.length > 0 && (
              <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 bg-white overflow-hidden shadow-sm">
                {eightySixList.map((item, idx) => (
                  <div key={item.id || idx} className="p-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-gray-900 block">{item.name}</span>
                      <span className="text-[10px] text-gray-400 font-mono">{item.supplier}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemove86(idx)}
                      className="text-gray-400 hover:text-red-500 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tomorrow / Next Shift Tasks */}
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3.5 space-y-3 text-xs">
            <span className="block font-bold text-gray-900 uppercase tracking-wider text-[11px]">
              Follow-Up / Tomorrow Tasks
            </span>

            <form onSubmit={handleAddTask} className="flex space-x-2">
              <input
                type="text"
                placeholder="Action item for opening manager..."
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                className="flex-1 bg-white border border-gray-300 py-2 px-3 rounded-xl text-xs font-medium focus:outline-none"
              />
              <button
                type="submit"
                disabled={!taskInput.trim()}
                className="px-4 py-2 bg-neutral-800 text-white hover:bg-black disabled:opacity-40 rounded-xl text-xs font-bold transition flex items-center justify-center"
              >
                <Plus className="w-4 h-4" />
              </button>
            </form>

            {tomorrowTasks.length > 0 && (
              <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 bg-white overflow-hidden shadow-sm">
                {tomorrowTasks.map((t, idx) => (
                  <div key={idx} className="p-2.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-gray-900 pr-2">• {t}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTask(idx)}
                      className="text-gray-400 hover:text-red-500 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Primary Submit Button */}
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="w-full py-3.5 bg-black text-white rounded-2xl text-xs font-bold hover:bg-neutral-800 transition disabled:opacity-50 flex items-center justify-center space-x-2 shadow-sm"
          >
            <Send className="w-4 h-4 text-emerald-400" />
            <span>
              {submitting 
                ? 'Saving to Handover Folder...' 
                : isDayNote 
                ? 'Save Day Note to Diary' 
                : 'Submit Closing Handover'}
            </span>
          </button>
        </div>

      ) : (

        /* ====================================================================== */
        /* TAB 2: HISTORICAL DIARY (FILTER BY DAY NOTES & HANDOVERS)              */
        /* ====================================================================== */
        <div className="flex-1 flex flex-col overflow-hidden pb-20">
          <div className="px-5 pt-3 pb-2 border-b border-gray-100 flex-shrink-0 space-y-2">
            <div className="flex justify-between items-baseline">
              <div>
                <p className="text-gray-500 italic text-xs font-serif">Historical Logbook</p>
                <h1 className="text-xl font-black tracking-tight text-gray-900">Handover Diary</h1>
              </div>
              <button onClick={loadHistory} className="text-xs font-semibold text-gray-500 hover:text-black underline flex items-center space-x-1">
                <RefreshCw className="w-3 h-3" />
                <span>Refresh</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search notes, manager, 86'd items..."
                className="w-full bg-[#EDEDED] py-2 pl-4 pr-9 rounded-xl text-xs italic placeholder-gray-500 focus:outline-none"
              />
              {historySearch && (
                <button onClick={() => setHistorySearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Diary List */}
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
            {filteredHistory.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Calendar className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-xs font-semibold text-gray-600">
                  {loadingHistory ? 'Loading diary entries...' : 'No entries found'}
                </p>
              </div>
            ) : (
              filteredHistory.map((entry) => {
                const isEntryDayNote = (!entry.takings || entry.takings === '' || entry.takings === '0.00' || entry.takings === '0') && (!entry.closeTime || entry.closeTime === '');
                return (
                  <div
                    key={entry.id}
                    onClick={() => setSelectedEntryModal(entry)}
                    className="border border-gray-200 rounded-2xl p-4 bg-white shadow-sm hover:border-black transition cursor-pointer space-y-2.5 group"
                  >
                    <div className="flex justify-between items-baseline">
                      <div>
                        <span className="font-extrabold text-sm text-gray-900 group-hover:text-black">
                          {entry.dateStr}
                        </span>
                        <span className="text-[10px] text-gray-400 block font-mono">
                          Duty: {entry.manager}
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        isEntryDayNote 
                          ? 'bg-amber-100 text-amber-900' 
                          : 'bg-black text-white'
                      }`}>
                        {isEntryDayNote ? 'Day Note' : 'Closing Handover'}
                      </span>
                    </div>

                    {!isEntryDayNote && (
                      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-gray-50 p-2 rounded-xl">
                        <div>
                          <span className="text-gray-400 block text-[9px] uppercase">Takings</span>
                          <span className="font-bold text-gray-800">
                            {entry.takings ? `£${Number(entry.takings).toFixed(2)}` : 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400 block text-[9px] uppercase">Close Time</span>
                          <span className="font-bold text-gray-800">{entry.closeTime || 'N/A'}</span>
                        </div>
                      </div>
                    )}

                    {entry.generalNotes && (
                      <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed font-sans">
                        {entry.generalNotes}
                      </p>
                    )}

                    <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 pt-1 group-hover:text-black">
                      <span>{(entry.eightySixList || []).length} items 86'd • {(entry.tomorrowTasks || []).length} follow-ups</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Read Modal for Historical Entry */}
          {selectedEntryModal && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border border-gray-200 flex flex-col max-h-[85vh]">
                <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex justify-between items-start bg-gray-50/50">
                  <div>
                    <span className="text-[10px] font-mono uppercase text-gray-400 block font-bold">
                      {selectedEntryModal.manager.toUpperCase()} • {selectedEntryModal.entryType || 'LOG'}
                    </span>
                    <h2 className="text-base font-black text-gray-900 leading-snug mt-0.5">
                      {selectedEntryModal.dateStr}
                    </h2>
                  </div>
                  <button onClick={() => setSelectedEntryModal(null)} className="p-1.5 text-gray-400 hover:text-black bg-white rounded-full border border-gray-200 shadow-sm">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-5 overflow-y-auto space-y-4 text-xs">
                  {selectedEntryModal.takings && selectedEntryModal.takings !== '0.00' && (
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-neutral-50 p-2.5 rounded-xl border border-neutral-200">
                      <div>
                        <span className="text-gray-400 block text-[9px] uppercase font-bold">Takings</span>
                        <span className="font-black text-gray-900">£{Number(selectedEntryModal.takings).toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[9px] uppercase font-bold">Close Time</span>
                        <span className="font-black text-gray-900">{selectedEntryModal.closeTime || 'N/A'}</span>
                      </div>
                    </div>
                  )}

                  {selectedEntryModal.generalNotes && (
                    <div>
                      <span className="font-bold uppercase tracking-wider text-[10px] text-gray-400 block mb-1">
                        General Notes
                      </span>
                      <p className="bg-gray-50 p-3 rounded-xl text-gray-800 leading-relaxed font-sans whitespace-pre-wrap">
                        {selectedEntryModal.generalNotes}
                      </p>
                    </div>
                  )}

                  {(selectedEntryModal.eightySixList || []).length > 0 && (
                    <div>
                      <span className="font-bold uppercase tracking-wider text-[10px] text-gray-400 block mb-1">
                        86 List
                      </span>
                      <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden bg-white">
                        {selectedEntryModal.eightySixList.map((item, idx) => (
                          <div key={idx} className="p-2 flex justify-between items-center text-xs">
                            <span className="font-bold text-gray-900">{item.name || item}</span>
                            <span className="text-[10px] text-gray-400 font-mono">{item.supplier || 'Bar'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(selectedEntryModal.tomorrowTasks || []).length > 0 && (
                    <div>
                      <span className="font-bold uppercase tracking-wider text-[10px] text-gray-400 block mb-1">
                        Follow-Up / Tomorrow Tasks
                      </span>
                      <div className="bg-gray-50 p-2.5 rounded-xl space-y-1">
                        {selectedEntryModal.tomorrowTasks.map((t, idx) => (
                          <p key={idx} className="text-gray-800 font-medium">• {t}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedEntryModal.fileUrl && (
                    <a
                      href={selectedEntryModal.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full py-2.5 bg-black text-white rounded-xl flex items-center justify-center space-x-1.5 font-bold hover:bg-neutral-800 transition text-[11px] shadow-sm mt-2"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Open Handover File in Drive</span>
                      <ExternalLink className="w-3 h-3 text-gray-400 ml-1" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating Bottom Nav */}
      <nav className="fixed bottom-2 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[390px] z-50 rounded-2xl bg-[#111111]/95 backdrop-blur-md text-white py-2 px-3 flex justify-around items-center text-xs font-semibold shadow-2xl border border-white/10 select-none pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
        <button 
          onClick={() => setActiveTab('new')} 
          className={`flex-1 py-1.5 text-center rounded-xl transition ${activeTab === 'new' ? 'text-white bg-white/15 font-bold shadow-inner' : 'text-gray-400 hover:text-white'}`}
        >
          New Entry
        </button>
        <button 
          onClick={() => setActiveTab('diary')} 
          className={`flex-1 py-1.5 text-center rounded-xl transition ${activeTab === 'diary' ? 'text-white bg-white/15 font-bold shadow-inner' : 'text-gray-400 hover:text-white'}`}
        >
          Handover Diary
        </button>
      </nav>
    </div>
  );
}