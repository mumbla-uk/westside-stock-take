import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  Send,
  RefreshCw,
  Search,
  X,
  FileText,
  DollarSign,
  Receipt,
  Smile,
  MessageSquare,
  ChevronDown
} from 'lucide-react';
import { useTwoFingerSwipe } from './useTwoFingerSwipe';
import { supabase, DEFAULT_VENUE_ID } from './lib/db';
import { sendPushNotification, dispatchMentionsFromText } from './lib/notifications';
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

// Format Date as: Day DD-MM-YY (e.g., Fri 30-10-26)
function formatBritishDate(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d.getTime())) return '';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayName = days[d.getDay()];
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dayName} ${dd}-${mm}-${yy}`;
}

// 15-minute increment times starting from 22:00 (10:00 PM)
const CLOSING_TIMES = [
  '22:00', '22:15', '22:30', '22:45',
  '23:00', '23:15', '23:30', '23:45',
  '00:00', '00:15', '00:30', '00:45',
  '01:00', '01:15', '01:30', '01:45',
  '02:00'
];

const EMOJIS = ['👍', '❤️', '🔥', '👀', '🙌'];

export default function HandoverApp({
  currentUser,
  initialDeepLink,
  onClearDeepLink,
  onBackToHub,
  onLogout
}) {
  const [activeTab, setActiveTab] = useState('write'); // 'write' | 'history'

  // Form State
  const [rawDate, setRawDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [entryType, setEntryType] = useState('Night Close');
  const [closeTime, setCloseTime] = useState('22:00');

  // Financial figures: Gross -> Auto Net, Tips & Service Charge
  const [grossSales, setGrossSales] = useState('');
  const [netSales, setNetSales] = useState('');
  const [cardTips, setCardTips] = useState('');
  const [serviceCharge, setServiceCharge] = useState('');
  const [cashVariance, setCashVariance] = useState('');

  // Qualitative notes
  const [generalNotes, setGeneralNotes] = useState('');
  const [maintenanceNotes, setMaintenanceNotes] = useState('');
  const [staffNotes, setStaffNotes] = useState('');

  // History & Detail View
  const [historyList, setHistoryList] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [selectedHistoricalHandover, setSelectedHistoricalHandover] = useState(null);

  // Comments & Reactions State for Active Inspection Modal
  const [comments, setComments] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  const swipeHandlers = useTwoFingerSwipe({
    disabled: Boolean(selectedHistoricalHandover),
    onSwipeRight: () => {
      if (onBackToHub) onBackToHub();
    }
  });

  // Calculate Auto Net whenever Gross Sales changes
  const handleGrossChange = (val) => {
    setGrossSales(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      const calculatedNet = (num / 1.20).toFixed(2);
      setNetSales(calculatedNet);
    } else {
      setNetSales('');
    }
  };

  const totalGratuities = useMemo(() => {
    const t = parseFloat(cardTips) || 0;
    const s = parseFloat(serviceCharge) || 0;
    return (t + s).toFixed(2);
  }, [cardTips, serviceCharge]);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('handovers')
        .select('*')
        .eq('venue_id', DEFAULT_VENUE_ID)
        .order('date_str', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(60);

      if (error) throw error;
      setHistoryList(data || []);

      if (initialDeepLink?.entryId) {
        const found = (data || []).find(h => String(h.id) === String(initialDeepLink.entryId));
        if (found) {
          openInspectionModal(found);
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

  // Fetch comments and reactions for the active modal
  const fetchModalFeedback = async (handoverId) => {
    try {
      const [commRes, reactRes] = await Promise.all([
        supabase
          .from('handover_comments')
          .select('*')
          .eq('handover_id', handoverId)
          .order('created_at', { ascending: true }),
        supabase
          .from('handover_reactions')
          .select('*')
          .eq('handover_id', handoverId)
      ]);

      setComments(commRes.data || []);
      setReactions(reactRes.data || []);
    } catch (err) {
      console.warn("Could not load feedback:", err);
    }
  };

  const openInspectionModal = (item) => {
    setSelectedHistoricalHandover(item);
    fetchModalFeedback(item.id);
  };

  // Submit new diary entry
  const handleSubmitHandover = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setStatusMsg(null);

    const authorName = currentUser?.name || 'Duty Manager';
    const authorId = currentUser?.name || 'anonymous';
    const formattedBritish = formatBritishDate(rawDate);

    try {
      const payload = {
        venue_id: DEFAULT_VENUE_ID,
        date_str: rawDate,
        date_formatted: formattedBritish,
        entry_type: entryType,
        close_time: closeTime,
        manager_name: authorName,
        gross_sales: parseFloat(grossSales) || 0,
        net_sales: parseFloat(netSales) || 0,
        card_tips: parseFloat(cardTips) || 0,
        service_charge: parseFloat(serviceCharge) || 0,
        total_grats: parseFloat(totalGratuities) || 0,
        cash_variance: parseFloat(cashVariance) || 0,
        general_notes: generalNotes.trim(),
        maintenance_notes: maintenanceNotes.trim(),
        staff_notes: staffNotes.trim(),
        created_at: new Date().toISOString()
      };

      const { data: savedRow, error: hErr } = await supabase
        .from('handovers')
        .insert(payload)
        .select()
        .single();

      if (hErr) throw hErr;

      // Dispatch @mentions if any staff were tagged
      const combinedNotes = `${generalNotes} \n ${maintenanceNotes} \n ${staffNotes}`;
      await dispatchMentionsFromText(
        combinedNotes,
        authorName,
        `Handover (${formattedBritish})`,
        { module: 'handover', entryId: savedRow.id }
      );

      sendPushNotification(
        `Diary Logged: ${formattedBritish}`,
        `${authorName} submitted ${entryType}. Gross: £${grossSales || '0'} (Net: £${netSales || '0'})`,
        null,
        { module: 'handover', entryId: savedRow.id }
      );

      setStatusMsg({ type: 'success', text: `Handover recorded for ${formattedBritish}!` });

      // Reset Form
      setGrossSales('');
      setNetSales('');
      setCardTips('');
      setServiceCharge('');
      setCashVariance('');
      setGeneralNotes('');
      setMaintenanceNotes('');
      setStaffNotes('');
      fetchHistory();
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: err.message || 'Error saving handover diary.' });
    } finally {
      setSubmitting(false);
    }
  };

  // Add Comment to an existing handover
  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newCommentText.trim() || !selectedHistoricalHandover?.id || postingComment) return;

    setPostingComment(true);
    const authorName = currentUser?.name || 'Staff';

    try {
      const { data, error } = await supabase
        .from('handover_comments')
        .insert({
          handover_id: selectedHistoricalHandover.id,
          author_name: authorName,
          comment: newCommentText.trim()
        })
        .select()
        .single();

      if (error) throw error;

      setComments(prev => [...prev, data]);
      setNewCommentText('');

      // Notify the manager who wrote the handover
      if (selectedHistoricalHandover.manager_name !== authorName) {
        sendPushNotification(
          `New Comment on Your Handover`,
          `${authorName}: "${newCommentText.trim().slice(0, 60)}"`,
          selectedHistoricalHandover.manager_name,
          { module: 'handover', entryId: selectedHistoricalHandover.id }
        );
      }
    } catch (err) {
      console.error("Error adding comment:", err);
    } finally {
      setPostingComment(false);
    }
  };

  // Toggle Reaction on an existing handover
  const handleToggleReaction = async (emoji) => {
    if (!selectedHistoricalHandover?.id) return;
    const userName = currentUser?.name || 'Staff';

    const existing = reactions.find(
      r => r.user_name === userName && r.emoji === emoji
    );

    try {
      if (existing) {
        await supabase
          .from('handover_reactions')
          .delete()
          .eq('id', existing.id);
        setReactions(prev => prev.filter(r => r.id !== existing.id));
      } else {
        const { data, error } = await supabase
          .from('handover_reactions')
          .insert({
            handover_id: selectedHistoricalHandover.id,
            user_name: userName,
            emoji: emoji
          })
          .select()
          .single();

        if (error) throw error;
        setReactions(prev => [...prev, data]);
      }
    } catch (err) {
      console.error("Error toggling reaction:", err);
    }
  };

  // Filtered History
  const filteredHistory = useMemo(() => {
    const q = historySearch.toLowerCase().trim();
    return historyList.filter(h => {
      if (!q) return true;
      const notes = String(h.general_notes || '').toLowerCase();
      const manager = String(h.manager_name || '').toLowerCase();
      const dt = String(h.date_formatted || h.date_str || '').toLowerCase();
      return notes.includes(q) || manager.includes(q) || dt.includes(q);
    });
  }, [historyList, historySearch]);

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

      {/* Write View */}
      {activeTab === 'write' ? (
        <form onSubmit={handleSubmitHandover} className="flex-1 overflow-y-auto px-5 py-3 space-y-4 pb-28 touch-pan-y overscroll-contain text-xs">
          
          {/* Shift Metadata Row */}
          <div className="grid grid-cols-12 gap-1.5">
            <div className="col-span-5">
              <label className="text-[9px] font-bold text-gray-400 uppercase block mb-0.5">Date</label>
              <input
                type="date"
                required
                value={rawDate}
                onChange={(e) => setRawDate(e.target.value)}
                className="w-full bg-[#EDEDED] py-1.5 px-2 rounded-xl font-mono text-xs font-bold text-gray-900 focus:outline-none appearance-none"
              />
              <span className="text-[9px] font-mono text-gray-500 block mt-0.5 pl-0.5">
                {formatBritishDate(rawDate)}
              </span>
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

            {/* Closing Time Dropdown - Starts at 10:00 PM */}
            <div className="col-span-3">
              <label className="text-[9px] font-bold text-gray-400 uppercase block mb-0.5">Closing Time</label>
              <select
                value={closeTime}
                onChange={(e) => setCloseTime(e.target.value)}
                className="w-full bg-[#EDEDED] py-1.5 px-1.5 rounded-xl font-mono text-xs font-bold text-gray-900 focus:outline-none"
              >
                {CLOSING_TIMES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 1. General Shift Notes (First Section) */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-700 uppercase tracking-wider block">
              1. General Notes &amp; Shift Summary (Type @ to tag staff)
            </label>
            <MentionInput
              as="textarea"
              rows={4}
              value={generalNotes}
              onChange={setGeneralNotes}
              placeholder="Atmosphere, trade pacing, 86'd items, guest feedback, key handover updates..."
              className="w-full bg-[#EDEDED] p-3 rounded-2xl text-xs leading-relaxed focus:outline-none resize-none"
            />
          </div>

          {/* 2. Financial Figures: Gross Z -> Auto Net & Gratuities */}
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-gray-400 block">
                2. Z-Report &amp; Gratuity Figures
              </span>
              <span className="text-[9px] font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                VAT Auto-Calculated
              </span>
            </div>

            {/* Gross Z to Net Z */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-bold text-gray-900 block mb-0.5">
                  Gross Z-Report (£ Inc VAT) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="e.g. 2400.00"
                  value={grossSales}
                  onChange={(e) => handleGrossChange(e.target.value)}
                  className="w-full bg-white border-2 border-black py-1.5 px-2.5 rounded-xl font-mono font-black text-gray-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[9px] font-bold text-gray-500 block mb-0.5">
                  Net Z-Report (£ Ex VAT)
                </label>
                <div className="w-full bg-gray-100 border border-gray-200 py-1.5 px-2.5 rounded-xl font-mono font-bold text-gray-700 text-xs">
                  £{netSales || '0.00'}
                </div>
              </div>
            </div>

            {/* Tips & Service Charges */}
            <div className="pt-1 border-t border-gray-200/60">
              <span className="text-[9px] font-bold text-gray-500 uppercase block mb-1">
                Tips &amp; Service Charge Collection
              </span>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[8px] font-bold text-gray-600 block mb-0.5">Card Tips (£)</label>
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
                  <label className="text-[8px] font-bold text-gray-600 block mb-0.5">Service Charge (£)</label>
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
                  <label className="text-[8px] font-bold text-gray-600 block mb-0.5">Total Gratuities</label>
                  <div className="w-full bg-emerald-50 border border-emerald-200 py-1 px-1.5 rounded-lg font-mono font-black text-emerald-800 text-xs text-center">
                    £{totalGratuities}
                  </div>
                </div>
              </div>
            </div>

            {/* Cash Drawer Variance */}
            <div className="pt-1">
              <label className="text-[9px] font-bold text-gray-600 block mb-0.5">
                Cash Till Variance (£ Over / Short)
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={cashVariance}
                onChange={(e) => setCashVariance(e.target.value)}
                className="w-full bg-white border border-gray-300 py-1.5 px-2.5 rounded-xl font-mono text-xs focus:outline-none"
              />
            </div>
          </div>

          {/* 3. Maintenance, Cellar & Snags */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-700 uppercase tracking-wider block">
              3. Maintenance, Cellar &amp; Snags
            </label>
            <MentionInput
              as="textarea"
              rows={2}
              value={maintenanceNotes}
              onChange={setMaintenanceNotes}
              placeholder="e.g. Glasswasher chemical pump leaking, cellar gas bottle changed..."
              className="w-full bg-[#EDEDED] p-3 rounded-2xl text-xs leading-relaxed focus:outline-none resize-none"
            />
          </div>

          {/* 4. Staff Shoutouts */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-700 uppercase tracking-wider block">
              4. Staff Shoutouts &amp; Comms
            </label>
            <MentionInput
              as="textarea"
              rows={2}
              value={staffNotes}
              onChange={setStaffNotes}
              placeholder="Good shifts, praise, floor rotation reminders..."
              className="w-full bg-[#EDEDED] p-3 rounded-2xl text-xs leading-relaxed focus:outline-none resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !grossSales}
            className="w-full py-3.5 bg-black hover:bg-neutral-800 disabled:opacity-40 text-white rounded-2xl text-xs font-black transition flex items-center justify-center space-x-1.5 shadow-md mt-2"
          >
            <Send className="w-4 h-4 text-emerald-400" />
            <span>{submitting ? 'Recording Handover...' : 'Submit Shift Handover'}</span>
          </button>
        </form>
      ) : (
        /* Past Diary Feed */
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto px-5 py-3 space-y-3 pb-28 touch-pan-y overscroll-contain">
          <div className="relative flex-shrink-0">
            <input
              type="text"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Search diary notes, managers, dates..."
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
              <p className="p-8 text-center text-xs text-gray-400 italic">No handover diaries found.</p>
            ) : (
              filteredHistory.map((item) => {
                const displayDate = item.date_formatted || formatBritishDate(item.date_str);
                return (
                  <div
                    key={item.id}
                    onClick={() => openInspectionModal(item)}
                    className="p-3.5 cursor-pointer hover:bg-gray-50 transition space-y-1.5 group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs text-gray-900 group-hover:text-black">
                        {displayDate} • {item.entry_type}
                      </span>
                      <span className="font-mono text-xs font-black text-gray-900">
                        Gross: £{Number(item.gross_sales || 0).toFixed(2)}
                      </span>
                    </div>

                    <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
                      {item.general_notes || item.maintenance_notes || 'Closing figures recorded.'}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono pt-1">
                      <span>By {item.manager_name}</span>
                      <span>Closed at {item.close_time || '22:00'}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* DETAIL INSPECTION MODAL: Comments & Reactions Reinstated */}
      {selectedHistoricalHandover && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl border border-gray-200 flex flex-col max-h-[92vh] animate-in slide-in-from-bottom duration-200">
            
            {/* Modal Header */}
            <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex justify-between items-center bg-gray-50/80">
              <div>
                <span className="text-[9px] font-mono uppercase text-rose-600 font-bold block">
                  Handover Diary Entry
                </span>
                <h2 className="text-base font-black text-gray-900 leading-tight mt-0.5">
                  {selectedHistoricalHandover.date_formatted || formatBritishDate(selectedHistoricalHandover.date_str)}
                </h2>
                <span className="text-[10px] text-gray-500 font-mono">
                  {selectedHistoricalHandover.manager_name} • Closed at {selectedHistoricalHandover.close_time || '22:00'}
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

            {/* Modal Scrollable Content */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs touch-pan-y overscroll-contain flex-1">
              
              {/* Financial Recap Table */}
              <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-200 space-y-1.5 font-mono">
                <span className="text-[9px] font-bold uppercase text-gray-400 block mb-1">Financial Reconciliation</span>
                <div className="flex justify-between items-center text-gray-800">
                  <span>Gross Z-Report:</span>
                  <span className="font-black text-sm">£{Number(selectedHistoricalHandover.gross_sales || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-gray-600 text-[11px]">
                  <span>Net Z-Report (Ex VAT):</span>
                  <span>£{Number(selectedHistoricalHandover.net_sales || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-emerald-800 text-[11px] pt-1 border-t border-gray-200">
                  <span>Tips &amp; Service Charge:</span>
                  <span className="font-bold">
                    £{Number(selectedHistoricalHandover.total_grats || (Number(selectedHistoricalHandover.card_tips || 0) + Number(selectedHistoricalHandover.service_charge || 0))).toFixed(2)}
                  </span>
                </div>
                {Number(selectedHistoricalHandover.cash_variance || 0) !== 0 && (
                  <div className="flex justify-between items-center text-[10px] text-gray-500">
                    <span>Till Variance:</span>
                    <span>£{Number(selectedHistoricalHandover.cash_variance || 0).toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Notes Sections */}
              {selectedHistoricalHandover.general_notes && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-gray-400 tracking-wider block">General Notes</span>
                  <p className="bg-neutral-50 p-3 rounded-2xl text-gray-800 leading-relaxed italic border border-gray-100">
                    "{selectedHistoricalHandover.general_notes}"
                  </p>
                </div>
              )}

              {selectedHistoricalHandover.maintenance_notes && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-rose-600 tracking-wider block">Maintenance &amp; Snags</span>
                  <p className="bg-rose-50/50 p-3 rounded-2xl text-rose-950 leading-relaxed border border-rose-200/50">
                    "{selectedHistoricalHandover.maintenance_notes}"
                  </p>
                </div>
              )}

              {selectedHistoricalHandover.staff_notes && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-purple-600 tracking-wider block">Staff &amp; Shoutouts</span>
                  <p className="bg-purple-50/50 p-3 rounded-2xl text-purple-950 leading-relaxed border border-purple-200/50">
                    "{selectedHistoricalHandover.staff_notes}"
                  </p>
                </div>
              )}

              {/* Emoji Reactions Bar */}
              <div className="pt-2 border-t border-gray-100 space-y-1.5">
                <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-gray-400 block">
                  Reactions
                </span>
                <div className="flex items-center space-x-2">
                  {EMOJIS.map(emoji => {
                    const count = reactions.filter(r => r.emoji === emoji).length;
                    const isMine = reactions.some(r => r.emoji === emoji && r.user_name === currentUser?.name);
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleToggleReaction(emoji)}
                        className={`px-2 py-1 rounded-xl text-xs flex items-center space-x-1 border transition ${
                          isMine
                            ? 'bg-amber-50 border-amber-300 font-bold'
                            : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        <span>{emoji}</span>
                        {count > 0 && <span className="font-mono text-[10px]">{count}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Team Comments Thread */}
              <div className="pt-2 border-t border-gray-100 space-y-2">
                <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-gray-400 block">
                  Comments &amp; Queries ({comments.length})
                </span>

                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {comments.length === 0 ? (
                    <p className="text-[11px] text-gray-400 italic">No comments yet. Leave a note below.</p>
                  ) : (
                    comments.map(c => (
                      <div key={c.id} className="bg-gray-50 p-2.5 rounded-xl border border-gray-200/60 space-y-0.5">
                        <div className="flex items-center justify-between text-[9px] font-mono text-gray-500">
                          <span className="font-bold text-gray-800">{c.author_name}</span>
                          <span>{new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-xs text-gray-800 leading-snug">{c.comment}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Add Comment Input */}
                <form onSubmit={handleAddComment} className="flex items-center space-x-1.5 pt-1">
                  <input
                    type="text"
                    value={newCommentText}
                    onChange={(e) => setNewCommentText(e.target.value)}
                    placeholder="Write a comment or query..."
                    className="flex-1 bg-[#EDEDED] py-2 px-3 rounded-xl text-xs focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!newCommentText.trim() || postingComment}
                    className="p-2 bg-black hover:bg-neutral-800 disabled:opacity-30 text-white rounded-xl transition"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
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