import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  Save,
  Send,
  AlertCircle,
  CheckCircle2,
  FileText,
  DollarSign,
  TrendingDown,
  RefreshCw,
  Search,
  X,
  MessageSquare,
  HelpCircle,
  Pin
} from 'lucide-react';
import { useTwoFingerSwipe } from './useTwoFingerSwipe';
import { supabase, DEFAULT_VENUE_ID } from './lib/db';
import { sendPushNotification } from './lib/notifications';
import MentionInput from './MentionInput';

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
  return <span className={fallbackTextClass}>W</span>;
}

export default function HandoverApp({
  currentUser,
  initialDeepLink,
  onClearDeepLink,
  onBackToHub,
  onLogout,
  onSendNotification
}) {
  const [activeTab, setActiveTab] = useState('write'); // 'write' | 'history'
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [entryType, setEntryType] = useState('Night Close'); // 'Night Close' | 'Day Note'
  const [closeTime, setCloseTime] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  // Financial figures
  const [netSales, setNetSales] = useState('');
  const [grossSales, setGrossSales] = useState('');
  const [serviceCharge, setServiceCharge] = useState('');
  const [cardTips, setCardTips] = useState('');
  const [cashVariance, setCashVariance] = useState('');

  // Qualitative reporting
  const [generalNotes, setGeneralNotes] = useState('');
  const [maintenanceNotes, setMaintenanceNotes] = useState('');
  const [staffNotes, setStaffNotes] = useState('');

  // State & Feedback
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [historyList, setHistoryList] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [selectedHistoricalHandover, setSelectedHistoricalHandover] = useState(null);

  // Opt-in Task Creation Preview Modal
  const [pendingActionThreads, setPendingActionThreads] = useState([]);
  const [showTaskPromptModal, setShowTaskPromptModal] = useState(false);

  const swipeHandlers = useTwoFingerSwipe({
    disabled: Boolean(selectedHistoricalHandover) || showTaskPromptModal,
    onSwipeRight: () => {
      if (onBackToHub) onBackToHub();
    }
  });

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('handovers')
        .select('*')
        .eq('venue_id', DEFAULT_VENUE_ID)
        .order('date_str', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setHistoryList(data || []);

      if (initialDeepLink?.entryId) {
        const found = (data || []).find(h => String(h.id) === String(initialDeepLink.entryId));
        if (found) {
          setSelectedHistoricalHandover(found);
          setActiveTab('history');
          if (onClearDeepLink) onClearDeepLink();
        }
      }
    } catch (err) {
      console.warn("Could not load handover history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  // Filter history
  const filteredHistory = useMemo(() => {
    const q = historySearch.toLowerCase().trim();
    return historyList.filter(h => {
      if (!q) return true;
      const notes = String(h.general_notes || '').toLowerCase();
      const manager = String(h.manager_name || '').toLowerCase();
      const dt = String(h.date_str || '').toLowerCase();
      return notes.includes(q) || manager.includes(q) || dt.includes(q);
    });
  }, [historyList, historySearch]);

  // Parser: Scan for mentions (@), questions (?), or maintenance snags (broken, leak, etc.)
  const scanForActionItems = (notesText, maintText) => {
    const combined = `${notesText} \n ${maintText}`;
    const lines = combined.split('\n').map(l => l.trim()).filter(Boolean);
    const candidateTasks = [];

    const issueKeywords = ['broken', 'leak', 'fix', 'repair', 'snag', 'maintenance', 'fault', 'service'];

    lines.forEach(line => {
      const hasMention = line.includes('@');
      const hasQuestion = line.includes('?');
      const hasKeyword = issueKeywords.some(kw => line.toLowerCase().includes(kw));

      if (hasMention || hasQuestion || hasKeyword) {
        const match = line.match(/@(\w+)/);
        const assignedTo = match ? match[1] : 'Next Shift Openers';
        const severity = (line.toLowerCase().includes('leak') || line.toLowerCase().includes('urgent')) ? 'critical' : 'normal';

        candidateTasks.push({
          id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          title: line.slice(0, 80),
          snippet: line,
          assigned_to: assignedTo,
          severity,
          selected: true
        });
      }
    });

    return candidateTasks;
  };

  const handlePreSubmit = (e) => {
    e.preventDefault();
    setStatusMsg(null);

    const candidates = scanForActionItems(generalNotes, maintenanceNotes);
    if (candidates.length > 0) {
      setPendingActionThreads(candidates);
      setShowTaskPromptModal(true);
    } else {
      executeSaveHandover([]);
    }
  };

  const executeSaveHandover = async (tasksToCreate = []) => {
    setSubmitting(true);
    setShowTaskPromptModal(false);
    setStatusMsg(null);

    const authorName = currentUser?.name || 'Duty Manager';
    const authorId = currentUser?.name || 'anonymous';

    try {
      const payload = {
        venue_id: DEFAULT_VENUE_ID,
        date_str: dateStr,
        entry_type: entryType,
        close_time: closeTime,
        manager_name: authorName,
        net_sales: parseFloat(netSales) || 0,
        gross_sales: parseFloat(grossSales) || 0,
        service_charge: parseFloat(serviceCharge) || 0,
        card_tips: parseFloat(cardTips) || 0,
        cash_variance: parseFloat(cashVariance) || 0,
        general_notes: generalNotes.trim(),
        maintenance_notes: maintenanceNotes.trim(),
        staff_notes: staffNotes.trim(),
        created_at: new Date().toISOString()
      };

      const { data: handoverRes, error: hErr } = await supabase
        .from('handovers')
        .insert(payload)
        .select()
        .single();

      if (hErr) throw hErr;

      // Create confirmed Action Threads linked to this handover
      if (tasksToCreate.length > 0) {
        const threadPayloads = tasksToCreate.map(t => ({
          venue_id: DEFAULT_VENUE_ID,
          handover_id: handoverRes.id,
          title: t.title,
          snippet: t.snippet,
          topic_type: t.severity === 'critical' ? 'issue' : 'direct',
          severity: t.severity,
          assigned_to: t.assigned_to,
          author_id: authorId,
          author_name: authorName,
          is_pinned: t.severity === 'critical',
          status: 'open'
        }));

        await supabase.from('discussion_threads').insert(threadPayloads);

        // Targeted push alert if someone was tagged
        tasksToCreate.forEach(t => {
          if (t.assigned_to && t.assigned_to !== 'Next Shift Openers') {
            sendPushNotification(
              `Handover Action: ${t.title}`,
              `${authorName} assigned an item to you from tonight's handover.`,
              t.assigned_to,
              { module: 'discussions' }
            );
          }
        });
      }

      sendPushNotification(
        `${entryType} Submitted`,
        `${authorName} logged handover notes for ${dateStr}.`,
        null,
        { module: 'handover' }
      );

      setStatusMsg({ type: 'success', text: `Handover for ${dateStr} saved cleanly!` });

      // Reset form
      setGeneralNotes('');
      setMaintenanceNotes('');
      setStaffNotes('');
      setNetSales('');
      setGrossSales('');
      setServiceCharge('');
      setCardTips('');
      setCashVariance('');
      fetchHistory();
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: err.message || 'Error recording handover.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      {...swipeHandlers}
      className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 overflow-hidden relative select-none"
    >
      {/* Header */}
      <header className="flex items-center justify-between px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-2 border-b border-gray-100 flex-shrink-0 bg-white z-20">
        <div className="flex items-center space-x-2">
          {onBackToHub && (
            <button onClick={onBackToHub} className="mr-0.5 p-1 -ml-1 text-gray-500 hover:text-black rounded-lg transition" title="Return to Hub">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <AppLogo className="w-6 h-6" fallbackTextClass="font-serif text-xl font-bold tracking-tighter" />
          <div>
            <h1 className="font-extrabold text-base tracking-tight text-gray-900 leading-tight">Handover Diary</h1>
            <span className="text-[10px] text-gray-400 font-mono block">Shift Log &amp; Financial Reconciliation</span>
          </div>
        </div>

        <button onClick={fetchHistory} className="p-1.5 text-gray-500 hover:text-black rounded-lg transition" title="Refresh">
          <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* Tab Switcher */}
      <div className="px-5 pt-2 pb-1.5 bg-gray-50/80 border-b border-gray-100 flex-shrink-0">
        <div className="flex bg-[#EDEDED] p-1 rounded-2xl">
          <button
            onClick={() => setActiveTab('write')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition flex items-center justify-center space-x-1.5 ${
              activeTab === 'write' ? 'bg-white text-black shadow-xs' : 'text-gray-500 hover:text-black'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-rose-500" />
            <span>Write Handover</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition flex items-center justify-center space-x-1.5 ${
              activeTab === 'history' ? 'bg-white text-black shadow-xs' : 'text-gray-500 hover:text-black'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-gray-600" />
            <span>Past Diary ({historyList.length})</span>
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className={`mx-5 my-2 p-2 rounded-xl text-xs font-semibold flex-shrink-0 ${
          statusMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {statusMsg.text}
        </div>
      )}

      {/* Main Body */}
      {activeTab === 'write' ? (
        <form onSubmit={handlePreSubmit} className="flex-1 overflow-y-auto px-5 py-3 space-y-4 pb-28 touch-pan-y overscroll-contain text-xs">
          {/* Shift Metadata */}
          <div className="grid grid-cols-12 gap-1.5">
            <div className="col-span-5">
              <label className="text-[9px] font-bold text-gray-400 uppercase block mb-0.5">Date</label>
              <input
                type="date"
                required
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="w-full bg-[#EDEDED] py-1.5 px-2 rounded-xl font-mono text-xs font-bold text-gray-900 focus:outline-none appearance-none"
              />
            </div>
            <div className="col-span-4">
              <label className="text-[9px] font-bold text-gray-400 uppercase block mb-0.5">Type</label>
              <select
                value={entryType}
                onChange={(e) => setEntryType(e.target.value)}
                className="w-full bg-[#EDEDED] py-1.5 px-2 rounded-xl text-xs font-bold text-gray-900 focus:outline-none"
              >
                <option value="Night Close">Night Close</option>
                <option value="Day Note">Day Note</option>
              </select>
            </div>
            <div className="col-span-3">
              <label className="text-[9px] font-bold text-gray-400 uppercase block mb-0.5">Time</label>
              <input
                type="text"
                value={closeTime}
                onChange={(e) => setCloseTime(e.target.value)}
                className="w-full bg-[#EDEDED] py-1.5 px-2 rounded-xl text-center font-mono text-xs font-bold text-gray-900 focus:outline-none"
              />
            </div>
          </div>

          {/* Financial Breakdown (Net/Gross/Tips) */}
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 space-y-2">
            <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-gray-400 block">
              1. Z-Report &amp; Gratuity Figures
            </span>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-bold text-gray-600 block mb-0.5">Net Sales (Ex VAT £)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={netSales}
                  onChange={(e) => {
                    setNetSales(e.target.value);
                    const n = parseFloat(e.target.value) || 0;
                    if (n > 0 && !grossSales) setGrossSales((n * 1.20).toFixed(2));
                  }}
                  className="w-full bg-white border border-gray-300 py-1.5 px-2.5 rounded-xl font-mono font-black text-gray-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-gray-600 block mb-0.5">Gross Sales (Inc VAT £)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={grossSales}
                  onChange={(e) => setGrossSales(e.target.value)}
                  className="w-full bg-white border border-gray-300 py-1.5 px-2.5 rounded-xl font-mono font-bold text-gray-700 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <div>
                <label className="text-[8px] font-bold text-gray-500 uppercase block mb-0.5">Service Chg</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={serviceCharge}
                  onChange={(e) => setServiceCharge(e.target.value)}
                  className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg font-mono text-xs focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[8px] font-bold text-gray-500 uppercase block mb-0.5">Card Tips</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={cardTips}
                  onChange={(e) => setCardTips(e.target.value)}
                  className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg font-mono text-xs focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[8px] font-bold text-gray-500 uppercase block mb-0.5">Till Variance</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={cashVariance}
                  onChange={(e) => setCashVariance(e.target.value)}
                  className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg font-mono text-xs focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Qualitative Notes with MentionInput */}
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-gray-700 uppercase tracking-wider block mb-1">
                2. Shift Notes &amp; Incidents (Type @ to tag staff)
              </label>
              <MentionInput
                as="textarea"
                rows={4}
                value={generalNotes}
                onChange={setGeneralNotes}
                placeholder="Trade atmosphere, VIP tables, 86'd lines, guest complaints (type @ to assign tasks)..."
                className="w-full bg-[#EDEDED] p-3 rounded-2xl text-xs leading-relaxed focus:outline-none resize-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-700 uppercase tracking-wider block mb-1">
                3. Maintenance, Cellar &amp; Snags
              </label>
              <MentionInput
                as="textarea"
                rows={2}
                value={maintenanceNotes}
                onChange={setMaintenanceNotes}
                placeholder="e.g. Glasswasher pump dripping, cellar gas switchover..."
                className="w-full bg-[#EDEDED] p-3 rounded-2xl text-xs leading-relaxed focus:outline-none resize-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-700 uppercase tracking-wider block mb-1">
                4. Staff Shoutouts &amp; Team Comms
              </label>
              <MentionInput
                as="textarea"
                rows={2}
                value={staffNotes}
                onChange={setStaffNotes}
                placeholder="Top performers, punctuality, floor rotation notes..."
                className="w-full bg-[#EDEDED] p-3 rounded-2xl text-xs leading-relaxed focus:outline-none resize-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 bg-black hover:bg-neutral-800 disabled:opacity-40 text-white rounded-2xl text-xs font-black transition flex items-center justify-center space-x-1.5 shadow-md mt-2"
          >
            <Send className="w-4 h-4 text-emerald-400" />
            <span>{submitting ? 'Recording Handover...' : 'Submit Shift Handover'}</span>
          </button>
        </form>
      ) : (
        /* PAST DIARY LOG */
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto px-5 py-3 space-y-3 pb-28 touch-pan-y overscroll-contain">
          <div className="relative flex-shrink-0">
            <input
              type="text"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Search notes, dates, managers..."
              className="w-full bg-[#EDEDED] py-2 pl-3 pr-8 rounded-xl text-xs placeholder-gray-400 focus:outline-none"
            />
            {historySearch ? (
              <button onClick={() => setHistorySearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black">
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            )}
          </div>

          <div className="divide-y divide-gray-100 border border-gray-200 rounded-3xl overflow-hidden bg-white shadow-xs">
            {loadingHistory ? (
              <p className="p-8 text-center text-xs text-gray-400 italic">Syncing past handovers...</p>
            ) : filteredHistory.length === 0 ? (
              <p className="p-8 text-center text-xs text-gray-400 italic">No handover records found.</p>
            ) : (
              filteredHistory.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedHistoricalHandover(item)}
                  className="p-3.5 cursor-pointer hover:bg-gray-50 transition space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-xs text-gray-900 leading-tight">
                      {item.date_str} • {item.entry_type}
                    </span>
                    <span className="font-mono text-xs font-bold text-gray-900">
                      £{Number(item.net_sales || 0).toFixed(2)}
                    </span>
                  </div>

                  <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
                    {item.general_notes || item.maintenance_notes || 'Closing duties completed.'}
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono pt-1">
                    <span>By {item.manager_name}</span>
                    <span>{item.close_time || 'Closed'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* HISTORICAL HANDOVER INSPECTION MODAL */}
      {selectedHistoricalHandover && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl border border-gray-200 flex flex-col max-h-[90vh] animate-in slide-in-from-bottom duration-200">
            <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex justify-between items-center bg-gray-50/80">
              <div>
                <span className="text-[9px] font-mono uppercase text-rose-600 font-bold block">
                  Handover Inspection
                </span>
                <h2 className="text-base font-black text-gray-900 leading-tight mt-0.5">
                  {selectedHistoricalHandover.date_str} • {selectedHistoricalHandover.entry_type}
                </h2>
                <span className="text-[10px] text-gray-500 font-mono">
                  Submitted by {selectedHistoricalHandover.manager_name} at {selectedHistoricalHandover.close_time || 'Close'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedHistoricalHandover(null)}
                className="p-1.5 text-gray-400 hover:text-black bg-white rounded-full border border-gray-200 shadow-xs"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs touch-pan-y overscroll-contain">
              {/* Financial Recap */}
              <div className="bg-gray-50 p-3 rounded-2xl border border-gray-200 space-y-1 font-mono">
                <span className="text-[9px] font-bold uppercase text-gray-400 block mb-1">Financial Figures</span>
                <div className="flex justify-between">
                  <span className="text-gray-500">Net Sales:</span>
                  <span className="font-bold text-gray-900">£{Number(selectedHistoricalHandover.net_sales || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Gross Sales:</span>
                  <span className="font-bold text-gray-900">£{Number(selectedHistoricalHandover.gross_sales || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Service Charges / Tips:</span>
                  <span className="font-bold text-emerald-700">£{Number(selectedHistoricalHandover.service_charge || selectedHistoricalHandover.card_tips || 0).toFixed(2)}</span>
                </div>
              </div>

              {/* General Notes */}
              {selectedHistoricalHandover.general_notes && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-gray-400 tracking-wider block">Shift Notes</span>
                  <p className="bg-neutral-50 p-3 rounded-2xl text-gray-800 leading-relaxed italic">
                    "{selectedHistoricalHandover.general_notes}"
                  </p>
                </div>
              )}

              {/* Maintenance Notes */}
              {selectedHistoricalHandover.maintenance_notes && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-rose-600 tracking-wider block">Maintenance &amp; Cellar</span>
                  <p className="bg-rose-50/50 p-3 rounded-2xl text-rose-950 leading-relaxed border border-rose-200/50">
                    "{selectedHistoricalHandover.maintenance_notes}"
                  </p>
                </div>
              )}

              {/* Staff Notes */}
              {selectedHistoricalHandover.staff_notes && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-purple-600 tracking-wider block">Staff &amp; Comms</span>
                  <p className="bg-purple-50/50 p-3 rounded-2xl text-purple-950 leading-relaxed border border-purple-200/50">
                    "{selectedHistoricalHandover.staff_notes}"
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* OPT-IN ACTION THREAD CONFIRMATION PROMPT */}
      {showTaskPromptModal && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 space-y-3.5 shadow-2xl border border-gray-200 animate-in zoom-in-95 duration-150">
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-purple-600 block">
                Continuous Shift Continuity
              </span>
              <h3 className="text-base font-extrabold text-gray-900 leading-tight">
                Create Action Threads?
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Detected actionable items, @mentions, or maintenance snags in your log:
              </p>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto">
              {pendingActionThreads.map((task, idx) => (
                <div
                  key={task.id}
                  onClick={() => {
                    setPendingActionThreads(prev =>
                      prev.map((t, i) => i === idx ? { ...t, selected: !t.selected } : t)
                    );
                  }}
                  className={`p-2.5 rounded-xl border cursor-pointer text-xs transition ${
                    task.selected
                      ? 'bg-purple-50/80 border-purple-300 text-purple-950'
                      : 'bg-gray-50 border-gray-200 opacity-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold truncate pr-2">{task.title}</span>
                    <span className="text-[9px] font-mono bg-white px-1.5 py-0.5 rounded border border-gray-200">
                      @{task.assigned_to}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center space-x-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => executeSaveHandover([])}
                className="flex-1 py-2 text-xs font-semibold text-gray-500 hover:text-black bg-gray-100 rounded-xl transition"
              >
                Skip Tasks
              </button>
              <button
                type="button"
                onClick={() => {
                  const selected = pendingActionThreads.filter(t => t.selected);
                  executeSaveHandover(selected);
                }}
                className="flex-1 py-2 bg-black hover:bg-neutral-800 text-white rounded-xl text-xs font-bold transition shadow-xs"
              >
                Track {pendingActionThreads.filter(t => t.selected).length} Item(s)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Hub Nav */}
      <nav className="fixed bottom-2 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[390px] z-30 rounded-2xl bg-[#111111]/95 backdrop-blur-md text-white py-2 px-3 flex justify-around items-center text-xs font-semibold shadow-2xl border border-white/10 select-none pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
        <button
          onClick={onBackToHub}
          className="flex-1 py-1 text-center rounded-xl transition text-neutral-400 hover:text-white"
        >
          Return to Hub
        </button>
      </nav>
    </div>
  );
}