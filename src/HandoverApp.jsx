import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, 
  Search, 
  Plus, 
  X, 
  Send, 
  Calendar, 
  ChevronRight, 
  Sparkles, 
  Bell, 
  MessageCircle, 
  MoreHorizontal, 
  Check 
} from 'lucide-react';
import { useTwoFingerSwipe } from './useTwoFingerSwipe';
import { supabase, DEFAULT_VENUE_ID } from './lib/db';
import { sendPushNotification } from './lib/notifications'; 

const AVAILABLE_REACTIONS = [
  { emoji: '❤️', label: 'Love' },
  { emoji: '👍', label: 'Like' },
  { emoji: '🍻', label: 'Cheers' },
  { emoji: '😂', label: 'Laugh' }
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

function formatDisplayDate(dateInput) {
  if (!dateInput) return "Undated Shift";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);

  const dayName = d.toLocaleDateString('en-GB', { weekday: 'long' });
  const dayNum = d.getDate();
  const monthName = d.toLocaleDateString('en-GB', { month: 'long' });
  const year = d.getFullYear();

  const getOrdinalSuffix = (n) => {
    if (n > 3 && n < 21) return 'th';
    switch (n % 10) {
      case 1:  return "st";
      case 2:  return "nd";
      case 3:  return "rd";
      default: return "th";
    }
  };

  return `${dayName} ${dayNum}${getOrdinalSuffix(dayNum)} ${monthName} ${year}`;
}

export default function HandoverApp({ 
  currentUser, 
  initialDeepLink = null,
  onClearDeepLink,
  onBackToHub, 
  onLogout 
}) {
  const [catalog, setCatalog] = useState(() => {
    try {
      const cached = localStorage.getItem('wst_catalog_cache');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [historyList, setHistoryList] = useState([]);
  const [sheetDuties, setSheetDuties] = useState([]);

  // Submission Form State (Now Inside Modal)
  const [isNewEntryOpen, setIsNewEntryOpen] = useState(false);
  const [manager, setManager] = useState(currentUser?.name || 'Ross');
  const [role, setRole] = useState(currentUser?.role || 'Assistant General Manager');
  const [shiftDate, setShiftDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [takings, setTakings] = useState('');
  const [closeTime, setCloseTime] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');

  const [eightySixInput, setEightySixInput] = useState('');
  const [eightySixQty, setEightySixQty] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [eightySixList, setEightySixList] = useState([]);

  const [tomorrowInput, setTomorrowInput] = useState('');
  const [tomorrowList, setTomorrowList] = useState([]);

  // Search & Filtering State
  const [historySearch, setHistorySearch] = useState('');
  const [historyDateFilter, setHistoryDateFilter] = useState('');
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);
  const [reactorsModalItem, setReactorsModalItem] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  const [commentInput, setCommentInput] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  const [readNotifIds, setReadNotifIds] = useState(() => {
    try {
      const cached = localStorage.getItem('wst_read_notifs');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    if (initialDeepLink && initialDeepLink.entryId && historyList.length > 0) {
      const match = historyList.find(item => String(item.id).trim() === String(initialDeepLink.entryId).trim());
      if (match) {
        setSelectedHistoryItem(match);
        if (onClearDeepLink) onClearDeepLink();
      }
    }
  }, [initialDeepLink, historyList, onClearDeepLink]);

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

  const swipeHandlers = useTwoFingerSwipe({
    disabled: isNewEntryOpen || Boolean(selectedHistoryItem) || Boolean(reactorsModalItem) || showNotifications,
    onSwipeRight: () => {
      if (onBackToHub) onBackToHub();
    }
  });

  useEffect(() => {
    if (currentUser?.name) setManager(currentUser.name);
    if (currentUser?.role) setRole(currentUser.role);
  }, [currentUser]);

  const fetchAllHandoverData = async () => {
    setLoadingHistory(true);
    try {
      const [handoverRes, dutyRes, catalogRes] = await Promise.all([
        supabase
          .from('handovers')
          .select('*')
          .eq('venue_id', DEFAULT_VENUE_ID)
          .order('created_at', { ascending: false })
          .limit(35),
        supabase
          .from('venue_duties')
          .select('duty_text')
          .eq('venue_id', DEFAULT_VENUE_ID),
        supabase
          .from('catalog_items')
          .select('id, name, unit, supplier')
          .eq('venue_id', DEFAULT_VENUE_ID)
      ]);

      if (handoverRes.data) {
        const mapped = handoverRes.data.map(h => ({
          id: h.id,
          dateStr: h.date_str,
          timestamp: h.created_at,
          manager: h.manager_name,
          role: h.role,
          takings: h.takings,
          closeTime: h.close_time,
          generalNotes: h.general_notes,
          eightySixList: h.eighty_six_list || [],
          tomorrowTasks: h.tomorrow_tasks || [],
          reactions: h.reactions || [],
          comments: h.comments || [],
          entryType: h.entry_type
        }));
        setHistoryList(mapped);
      }

      if (dutyRes.data) {
        setSheetDuties(dutyRes.data.map(d => d.duty_text));
      }

      if (catalogRes.data && catalogRes.data.length > 0) {
        setCatalog(catalogRes.data);
      }
    } catch (err) {
      console.error("Failed to sync handover data:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchAllHandoverData();
  }, []);

  const allNotifications = useMemo(() => {
    const currentUserName = currentUser?.name || manager;
    const notifs = [];

    historyList.forEach(entry => {
      if (entry.manager === currentUserName) {
        (entry.reactions || []).forEach(rx => {
          if (rx.user !== currentUserName) {
            notifs.push({
              id: `rx-${entry.id}-${rx.user}-${rx.emoji}`,
              entry,
              type: 'reaction',
              text: `${rx.user} reacted ${rx.emoji} to your ${entry.entryType || 'handover'}`,
              dateStr: entry.dateStr
            });
          }
        });
        (entry.comments || []).forEach(c => {
          if (c.user !== currentUserName) {
            notifs.push({
              id: `c-${c.id || Math.random()}`,
              entry,
              type: 'comment',
              text: `${c.user} commented: "${c.text.slice(0, 45)}${c.text.length > 45 ? '...' : ''}"`,
              dateStr: entry.dateStr
            });
          }
        });
      }
    });

    return notifs;
  }, [historyList, currentUser, manager]);

  const unreadNotifications = useMemo(() => {
    return allNotifications.filter(n => !readNotifIds.includes(n.id));
  }, [allNotifications, readNotifIds]);

  const markAllNotificationsAsRead = () => {
    const allIds = allNotifications.map(n => n.id);
    const updated = Array.from(new Set([...readNotifIds, ...allIds]));
    setReadNotifIds(updated);
    localStorage.setItem('wst_read_notifs', JSON.stringify(updated));
  };

  const markSingleNotificationAsRead = (notifId, entry) => {
    if (!readNotifIds.includes(notifId)) {
      const updated = [...readNotifIds, notifId];
      setReadNotifIds(updated);
      localStorage.setItem('wst_read_notifs', JSON.stringify(updated));
    }
    setSelectedHistoryItem(entry);
    setShowNotifications(false);
  };

  const handleToggleReaction = async (itemId, emoji, e) => {
    if (e) e.stopPropagation();
    const activeUserName = currentUser?.name || manager || 'Staff';

    const targetItem = historyList.find(it => it.id === itemId);
    if (!targetItem) return;

    const currentReactions = targetItem.reactions || [];
    let updatedReactions = [];
    const existing = currentReactions.find(r => r.user === activeUserName && r.emoji === emoji);

    if (existing) {
      updatedReactions = currentReactions.filter(r => !(r.user === activeUserName && r.emoji === emoji));
    } else {
      updatedReactions = [...currentReactions, { 
        emoji, 
        user: activeUserName, 
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
      }];

      if (targetItem.manager && targetItem.manager !== activeUserName) {
        sendPushNotification(
          "New Reaction on Your Handover",
          `${activeUserName} reacted ${emoji} to your shift briefing`,
          targetItem.manager,
          { module: 'handover', entryId: itemId }
        );
      }
    }

    setHistoryList(prev => prev.map(item => item.id === itemId ? { ...item, reactions: updatedReactions } : item));
    if (selectedHistoryItem?.id === itemId) {
      setSelectedHistoryItem(prev => ({ ...prev, reactions: updatedReactions }));
    }

    await supabase.from('handovers').update({ reactions: updatedReactions }).eq('id', itemId);
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentInput.trim() || !selectedHistoryItem) return;

    setSubmittingComment(true);
    const activeUserName = currentUser?.name || manager || 'Staff';
    const activeUserRole = currentUser?.role || role || 'Manager';

    const newCommentObj = {
      id: `c-${Date.now()}`,
      user: activeUserName,
      role: activeUserRole,
      text: commentInput.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const updatedComments = [...(selectedHistoryItem.comments || []), newCommentObj];

    setSelectedHistoryItem(prev => ({ ...prev, comments: updatedComments }));
    setHistoryList(prev => prev.map(item => item.id === selectedHistoryItem.id ? { ...item, comments: updatedComments } : item));
    setCommentInput('');

    try {
      await supabase.from('handovers').update({ comments: updatedComments }).eq('id', selectedHistoryItem.id);

      if (selectedHistoryItem.manager && selectedHistoryItem.manager !== activeUserName) {
        sendPushNotification(
          `New Comment from ${activeUserName}`,
          newCommentObj.text.slice(0, 60),
          selectedHistoryItem.manager,
          { module: 'handover', entryId: selectedHistoryItem.id }
        );
      }
    } catch (err) {
      console.error("Failed to post comment:", err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const catalogSuggestions = useMemo(() => {
    if (!eightySixInput.trim() || selectedProduct) return [];
    return catalog.filter(p => 
      (p.name && p.name.toLowerCase().includes(eightySixInput.toLowerCase())) || 
      (p.id && p.id.toLowerCase().includes(eightySixInput.toLowerCase()))
    ).slice(0, 5);
  }, [catalog, eightySixInput, selectedProduct]);

  const dutySuggestions = useMemo(() => {
    if (!tomorrowInput.trim()) return [];
    return sheetDuties.filter(duty => 
      duty.toLowerCase().includes(tomorrowInput.toLowerCase())
    ).slice(0, 5);
  }, [sheetDuties, tomorrowInput]);

  const handleAdd86 = (e) => {
    e?.preventDefault();
    if (!eightySixInput.trim()) return;

    setEightySixList(prev => [...prev, {
      sku: selectedProduct ? selectedProduct.id : 'CUSTOM',
      name: selectedProduct ? selectedProduct.name : eightySixInput.trim(),
      supplier: selectedProduct ? selectedProduct.supplier : 'General',
      unit: selectedProduct ? selectedProduct.unit : 'unit',
      qty: parseFloat(eightySixQty) || 1
    }]);

    setEightySixInput(''); 
    setSelectedProduct(null); 
    setEightySixQty('');
  };

  const handleAddTomorrow = (textToAdd) => {
    const text = textToAdd || tomorrowInput;
    if (text.trim()) {
      setTomorrowList(prev => [...prev, text.trim()]);
      setTomorrowInput('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatusMsg(null);

    const isDayNote = (!takings.trim() || takings === '0' || takings === '0.00') && !closeTime.trim();
    const entryId = `h-${Date.now()}`;

    const payload = {
      id: entryId,
      venue_id: DEFAULT_VENUE_ID,
      date_str: shiftDate,
      manager_name: manager,
      role,
      takings: takings.trim(),
      close_time: closeTime.trim(),
      general_notes: generalNotes,
      kitchen_notes: "",
      eighty_six_list: eightySixList,
      tomorrow_tasks: tomorrowList,
      reactions: [],
      comments: [],
      entry_type: isDayNote ? "Day Note" : "Closing Handover"
    };

    try {
      const { error } = await supabase.from('handovers').insert(payload);
      if (error) throw error;

      setStatusMsg({ 
        type: 'success', 
        text: isDayNote ? 'Day note posted to diary!' : 'Handover posted to diary!' 
      });

      sendPushNotification(
        isDayNote ? "New Day Note Logged" : "Shift Handover Submitted",
        `${manager} submitted ${isDayNote ? "a day note" : "the closing handover"} for ${shiftDate}`,
        null,
        { module: 'handover', entryId }
      );
      
      setTakings('');
      setCloseTime('');
      setGeneralNotes('');
      setEightySixList([]);
      setTomorrowList([]);
      setIsNewEntryOpen(false);
      
      await fetchAllHandoverData();
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Error saving handover report.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const latestHandover = historyList.length > 0 ? historyList[0] : null;

  const filteredHistory = useMemo(() => {
    const pool = (historySearch || historyDateFilter) ? historyList : historyList.slice(1);
    return pool.filter(item => {
      const q = historySearch.toLowerCase();
      const matchesSearch = 
        (item.manager || '').toLowerCase().includes(q) ||
        (item.generalNotes || '').toLowerCase().includes(q) ||
        (item.dateStr || '').toLowerCase().includes(q) ||
        (item.eightySixList || []).some(p => (p.name || p).toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q));
      const matchesDate = historyDateFilter ? item.dateStr === historyDateFilter : true;
      return matchesSearch && matchesDate;
    });
  }, [historyList, historySearch, historyDateFilter]);

  const ReactionBar = ({ item }) => {
    const reactions = item.reactions || [];
    const activeUserName = currentUser?.name || manager || 'Staff';

    return (
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {AVAILABLE_REACTIONS.map(rx => {
          const matching = reactions.filter(r => r.emoji === rx.emoji);
          const hasReacted = matching.some(r => r.user === activeUserName);

          return (
            <button
              key={rx.emoji}
              type="button"
              onClick={(e) => handleToggleReaction(item.id, rx.emoji, e)}
              className={`flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] transition border active:scale-95 select-none ${
                hasReacted
                  ? 'bg-black text-white border-black font-bold shadow-sm'
                  : matching.length > 0
                  ? 'bg-gray-100 text-gray-800 border-gray-300'
                  : 'bg-white hover:bg-gray-50 text-gray-400 border-gray-200'
              }`}
            >
              <span>{rx.emoji}</span>
              {matching.length > 0 && (
                <span className={`text-[9px] font-mono ${hasReacted ? 'text-white' : 'text-gray-700 font-bold'}`}>
                  {matching.length}
                </span>
              )}
            </button>
          );
        })}

        {reactions.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setReactorsModalItem(item);
            }}
            className="px-1.5 py-0.5 rounded-full text-[10px] bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-600 transition"
            title="See who reacted"
          >
            <MoreHorizontal className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div 
      {...swipeHandlers}
      className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 overflow-hidden relative select-none"
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
        </div>

        <div className="flex items-center space-x-3 text-xs font-medium relative">
          <button
            onClick={() => setShowNotifications(prev => !prev)}
            className="relative p-1.5 text-gray-700 hover:text-black rounded-full hover:bg-gray-100 transition"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadNotifications.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-600 text-white font-mono text-[9px] font-bold flex items-center justify-center animate-pulse">
                {unreadNotifications.length > 9 ? '9+' : unreadNotifications.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Notifications Dropdown */}
      {showNotifications && (
        <div className="absolute top-[max(3.8rem,calc(env(safe-area-inset-top)+2.5rem))] right-4 z-40 w-72 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden divide-y divide-gray-100 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="p-3 bg-gray-50 flex justify-between items-center">
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Activity On Your Posts</span>
            <div className="flex items-center space-x-2">
              {unreadNotifications.length > 0 && (
                <button 
                  onClick={markAllNotificationsAsRead}
                  className="text-[10px] text-emerald-700 hover:underline font-bold flex items-center space-x-0.5"
                >
                  <Check className="w-3 h-3" />
                  <span>Mark all read</span>
                </button>
              )}
              <button onClick={() => setShowNotifications(false)} className="text-gray-400 hover:text-black p-0.5">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
            {allNotifications.length === 0 ? (
              <p className="p-4 text-center text-xs text-gray-400 italic">No activity yet</p>
            ) : (
              allNotifications.map((n) => {
                const isUnread = !readNotifIds.includes(n.id);
                return (
                  <div 
                    key={n.id}
                    onClick={() => markSingleNotificationAsRead(n.id, n.entry)}
                    className={`p-3 hover:bg-gray-50 cursor-pointer text-xs space-y-0.5 transition ${isUnread ? 'bg-emerald-50/40' : 'bg-white'}`}
                  >
                    <div className="flex items-start justify-between">
                      <p className={`leading-snug ${isUnread ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                        {n.text}
                      </p>
                      {isUnread && (
                        <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0 mt-1 ml-1" />
                      )}
                    </div>
                    <span className="text-[9px] text-gray-400 font-mono block">{n.dateStr}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Main Single-Page Physical Diary Body */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="px-5 pt-3 pb-2 border-b border-gray-100 flex-shrink-0 space-y-2 bg-white">
          <div className="flex justify-between items-baseline">
            <div>
              <p className="text-gray-500 italic text-[11px] font-serif">Shift Logs</p>
              <h1 className="text-xl font-black tracking-tight text-gray-900">Handover Diary</h1>
            </div>
            <button onClick={fetchAllHandoverData} className="text-xs font-semibold text-gray-500 hover:text-black underline">Refresh</button>
          </div>

          <div className="relative">
            <input
              type="text"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Search by manager, notes, or 86 item..."
              className="w-full bg-[#EDEDED] py-1.5 pl-3 pr-8 rounded-lg text-xs italic placeholder-gray-400 focus:outline-none"
            />
            {historySearch ? (
              <button onClick={() => setHistorySearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black">
                <X className="w-3 h-3" />
              </button>
            ) : (
              <Search className="w-3 h-3 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            )}
          </div>

          <div className="flex items-center space-x-2 text-[11px]">
            <label className="text-[9px] font-bold uppercase text-gray-400">Date:</label>
            <input type="date" value={historyDateFilter} onChange={(e) => setHistoryDateFilter(e.target.value)} className="bg-[#EDEDED] py-0.5 px-1.5 rounded-md font-semibold text-[10px] text-gray-800 focus:outline-none" />
            {historyDateFilter && (
              <button onClick={() => setHistoryDateFilter('')} className="text-[9px] text-gray-500 hover:text-black underline">Clear date</button>
            )}
          </div>
        </div>

        {/* Scrollable Diary Feed */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-3 pb-28 touch-pan-y overscroll-contain">
          {loadingHistory ? (
            <p className="text-center py-12 text-xs text-gray-400 italic">Connecting to archive...</p>
          ) : historyList.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs font-semibold text-gray-600">No shift handovers found</p>
            </div>
          ) : (
            <>
              {!historySearch && !historyDateFilter && latestHandover && (
                <div className="space-y-1">
                  <div className="flex items-center space-x-1.5 px-1">
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    <span className="text-[9px] font-black uppercase tracking-wider text-emerald-800">
                      {latestHandover.entryType === 'Day Note' ? 'Most Recent Day Note' : 'Most Recent Handover'}
                    </span>
                  </div>

                  <div onClick={() => setSelectedHistoryItem(latestHandover)} className="border-2 border-black bg-[#FAFCF8] rounded-2xl p-3.5 cursor-pointer shadow-sm hover:shadow-md transition active:scale-[0.99] group space-y-1.5">
                    <div className="flex justify-between items-baseline">
                      <span className="font-extrabold text-xs text-gray-900">{formatDisplayDate(latestHandover.dateStr || latestHandover.timestamp)}</span>
                      {latestHandover.takings && latestHandover.takings !== "0.00" && latestHandover.takings !== "0" && (
                        <span className="font-mono text-xs font-black text-gray-900">£{latestHandover.takings}</span>
                      )}
                    </div>
                    <div className="flex items-center space-x-1.5 text-[9px] text-gray-500 font-mono">
                      <span>Duty: {latestHandover.manager}</span>
                      {latestHandover.closeTime && (
                        <><span>•</span><span>Close: {latestHandover.closeTime}</span></>
                      )}
                      <span>•</span>
                      <span className="text-red-600 font-bold">{(latestHandover.eightySixList || []).length} items 86'd</span>
                    </div>
                    {latestHandover.generalNotes && (
                      <p className="text-[11px] text-gray-700 italic line-clamp-2 leading-relaxed">"{latestHandover.generalNotes}"</p>
                    )}

                    <div className="flex items-center justify-between pt-0.5">
                      <ReactionBar item={latestHandover} />
                      {(latestHandover.comments || []).length > 0 && (
                        <span className="inline-flex items-center space-x-1 text-[10px] text-gray-500 font-bold bg-gray-100 px-2 py-0.5 rounded-full">
                          <MessageCircle className="w-3 h-3" />
                          <span>{(latestHandover.comments || []).length}</span>
                        </span>
                      )}
                    </div>

                    <div className="flex justify-between items-center pt-1 text-[10px] font-bold text-black border-t border-gray-100">
                      <span>Tap to open briefing & comments</span>
                      <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2 pt-1">
                {!historySearch && !historyDateFilter && filteredHistory.length > 0 && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 px-1 block">Previous Diaries ({filteredHistory.length})</span>
                )}
                {filteredHistory.map((item) => (
                  <div key={item.id} onClick={() => setSelectedHistoryItem(item)} className="border border-gray-200 rounded-xl p-3 hover:border-black transition cursor-pointer bg-white shadow-sm space-y-1 group">
                    <div className="flex justify-between items-baseline">
                      <span className="font-bold text-[11px] text-gray-900 group-hover:text-black">{formatDisplayDate(item.dateStr || item.timestamp)}</span>
                      {item.takings && item.takings !== "0.00" && item.takings !== "0" ? (
                        <span className="font-mono text-[11px] font-bold text-gray-900">£{item.takings}</span>
                      ) : (
                        <span className="text-[8px] font-bold uppercase bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded">Day Note</span>
                      )}
                    </div>
                    <div className="flex items-center space-x-1.5 text-[9px] text-gray-400 font-mono">
                      <span>{item.manager}</span>
                      {item.closeTime && <><span>•</span><span>{item.closeTime}</span></>}
                      <span>•</span>
                      <span>{(item.eightySixList || []).length} on 86</span>
                    </div>
                    {item.generalNotes && <p className="text-[11px] text-gray-500 line-clamp-1 italic">"{item.generalNotes}"</p>}

                    <div className="flex items-center justify-between pt-0.5">
                      <ReactionBar item={item} />
                      {(item.comments || []).length > 0 && (
                        <span className="inline-flex items-center space-x-1 text-[10px] text-gray-500 font-bold bg-gray-100 px-2 py-0.5 rounded-full">
                          <MessageCircle className="w-3 h-3" />
                          <span>{(item.comments || []).length}</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Floating Add New Entry Button (+) */}
      <div className="fixed bottom-6 right-6 z-30">
        <button
          onClick={() => {
            setShiftDate(new Date().toISOString().slice(0, 10));
            setIsNewEntryOpen(true);
          }}
          className="w-14 h-14 rounded-full bg-black hover:bg-neutral-800 text-white shadow-2xl flex items-center justify-center transition active:scale-95 border border-white/10"
          aria-label="Add New Handover Entry"
        >
          <Plus className="w-6 h-6 stroke-[2.5]" />
        </button>
      </div>

      {/* NEW ENTRY SUBMISSION MODAL / DRAWER */}
      {isNewEntryOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl border border-gray-200 flex flex-col max-h-[92vh] animate-in slide-in-from-bottom duration-200">
            {/* Modal Header */}
            <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex justify-between items-center bg-gray-50/70">
              <div>
                <span className="text-[10px] font-mono uppercase text-gray-400 font-bold block">New Diary Record</span>
                <h2 className="text-base font-black text-gray-900 leading-tight">Post Shift Entry</h2>
              </div>
              <button 
                onClick={() => setIsNewEntryOpen(false)} 
                className="p-1.5 text-gray-400 hover:text-black bg-white rounded-full border border-gray-200 shadow-xs"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs touch-pan-y overscroll-contain">
              <div className="border-b border-gray-100 pb-3 space-y-2">
                <div className="grid grid-cols-12 gap-1.5 text-[11px]">
                  <div className="col-span-4 min-w-0">
                    <label className="block text-[9px] font-bold uppercase text-gray-400 mb-0.5 truncate">Shift Date</label>
                    <input 
                      type="date" 
                      value={shiftDate} 
                      onChange={(e) => setShiftDate(e.target.value)} 
                      className="w-full min-w-0 bg-[#EDEDED] py-1.5 px-1.5 rounded-lg font-semibold text-gray-900 text-[10px] focus:outline-none appearance-none" 
                    />
                  </div>
                  <div className="col-span-4 min-w-0">
                    <label className="block text-[9px] font-bold uppercase text-gray-400 mb-0.5 truncate">Duty Manager</label>
                    <input 
                      type="text" 
                      readOnly 
                      value={`${manager} (${role})`} 
                      className="w-full min-w-0 bg-[#EDEDED] py-1.5 px-2 rounded-lg font-semibold text-gray-900 text-[10px] cursor-not-allowed focus:outline-none" 
                    />
                  </div>
                  <div className="col-span-4 min-w-0">
                    <label className="block text-[9px] font-bold uppercase text-gray-400 mb-0.5 truncate">Close Time</label>
                    <select 
                      value={closeTime} 
                      onChange={(e) => setCloseTime(e.target.value)} 
                      className="w-full min-w-0 bg-[#EDEDED] py-1.5 px-1 rounded-lg font-semibold text-gray-900 text-[10px] focus:outline-none"
                    >
                      <option value=""></option>
                      {timeOptions15Min.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-0.5">
                  <label className="text-xs font-extrabold text-gray-900">Takings (£):</label>
                  <div className="relative bg-[#EDEDED] rounded-lg px-2.5 py-1 flex items-center">
                    <span className="text-[11px] font-bold text-gray-500 mr-1">£</span>
                    <input 
                      type="text" 
                      value={takings} 
                      onChange={(e) => setTakings(e.target.value)} 
                      placeholder="0.00"
                      className="w-24 text-xs font-bold bg-transparent text-gray-900 focus:outline-none" 
                    />
                  </div>
                  <span className="text-[10px] text-gray-400 italic">(Leave empty for Day Note)</span>
                </div>
              </div>

              {/* General Notes */}
              <div className="space-y-1">
                <div className="flex justify-between items-baseline">
                  <label className="block text-[11px] font-extrabold text-gray-900">General Notes</label>
                  <span className={`text-[9px] font-mono ${generalNotes.length >= 1200 ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                    {generalNotes.length}/1250
                  </span>
                </div>
                <div className="relative bg-[#EDEDED] rounded-xl p-2.5 focus-within:bg-gray-100 transition">
                  <textarea 
                    rows={4} 
                    maxLength={1250} 
                    placeholder="Shift commentary, trade notes, maintenance..."
                    value={generalNotes} 
                    onChange={(e) => setGeneralNotes(e.target.value)} 
                    className="w-full text-xs text-gray-900 bg-transparent focus:outline-none resize-none leading-relaxed" 
                  />
                </div>
              </div>

              {/* 86 List SKU Lookup */}
              <div className="space-y-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
                <div className="flex justify-between items-center">
                  <span className="block font-bold text-gray-900 uppercase tracking-wider text-[10px]">86 List (Stock Shortages)</span>
                  <span className="text-[9px] text-gray-400 font-mono">{catalog.length} SKUs ready</span>
                </div>
                
                <form onSubmit={handleAdd86} className="space-y-1.5">
                  <div className="relative">
                    <input
                      type="text"
                      value={eightySixInput}
                      onChange={(e) => { setEightySixInput(e.target.value); setSelectedProduct(null); }}
                      placeholder="Search catalog or item..."
                      className="w-full bg-white border border-gray-300 py-1.5 pl-2.5 pr-7 rounded-lg text-xs italic focus:outline-none placeholder-gray-400"
                    />
                    {eightySixInput && (
                      <button type="button" onClick={() => { setEightySixInput(''); setSelectedProduct(null); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                    {catalogSuggestions.length > 0 && !selectedProduct && (
                      <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg divide-y divide-gray-100 max-h-36 overflow-y-auto">
                        {catalogSuggestions.map(prod => (
                          <button key={prod.id} type="button" onClick={() => { setSelectedProduct(prod); setEightySixInput(prod.name); }} className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-gray-100 flex items-center justify-between">
                            <div><span className="font-bold text-gray-900">{prod.name}</span><span className="text-[9px] text-gray-400 font-mono ml-1.5">[{prod.id}]</span></div>
                            <span className="text-[9px] text-gray-500 italic">({prod.unit})</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-12 gap-1.5">
                    <div className="col-span-4">
                      <input 
                        type="number" 
                        step="any" 
                        value={eightySixQty} 
                        onChange={(e) => setEightySixQty(e.target.value)} 
                        placeholder="Qty" 
                        className="w-full bg-white border border-gray-300 py-1 px-2 rounded-lg text-xs font-bold text-center focus:outline-none" 
                      />
                    </div>
                    <div className="col-span-8">
                      <button type="submit" disabled={!eightySixInput.trim()} className="w-full py-1 bg-black text-white hover:bg-gray-800 disabled:opacity-40 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1">
                        <Plus className="w-3 h-3" />
                        <span>Add to 86 List</span>
                      </button>
                    </div>
                  </div>
                </form>

                <div className="divide-y divide-gray-200 pt-0.5">
                  {eightySixList.length === 0 ? (
                    <p className="text-[10px] text-gray-400 italic py-1 text-center">No items 86'd this shift.</p>
                  ) : (
                    eightySixList.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center py-1.5 text-xs">
                        <div>
                          <span className="font-bold text-gray-900">{item.name}</span>
                          <div className="flex items-center space-x-1 text-[9px] text-gray-400 font-mono">
                            <span>SKU: {item.sku}</span><span>•</span><span>{item.supplier}</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">{item.qty} {item.unit}</span>
                          <button type="button" onClick={() => setEightySixList(prev => prev.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-red-500 font-mono px-1">✕</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Tomorrow Handover Duties */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="block text-[11px] font-extrabold text-gray-900">Tomorrow / Handover Actions</label>
                  {sheetDuties.length > 0 && (
                    <span className="text-[9px] text-gray-400 font-mono">{sheetDuties.length} Duties live</span>
                  )}
                </div>
                
                <div className="relative">
                  <input 
                    type="text" 
                    value={tomorrowInput} 
                    onChange={(e) => setTomorrowInput(e.target.value)} 
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTomorrow())} 
                    placeholder="Search duties or type task..." 
                    className="w-full bg-[#EDEDED] rounded-xl py-1.5 px-2.5 text-xs focus:outline-none pr-8" 
                  />
                  <button type="button" onClick={() => handleAddTomorrow()} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 font-bold hover:text-black text-xs">→</button>
                </div>

                {dutySuggestions.length > 0 && (
                  <div className="border border-neutral-200 rounded-xl overflow-hidden divide-y divide-neutral-100 bg-[#FBFBFB]">
                    {dutySuggestions.map((suggestion, idx) => (
                      <button 
                        key={idx} 
                        type="button" 
                        onClick={() => handleAddTomorrow(suggestion)} 
                        className="w-full text-left px-2.5 py-1.5 text-xs text-black flex justify-between items-center hover:bg-neutral-100"
                      >
                        <span>{suggestion}</span>
                        <span className="text-neutral-400 font-mono text-[10px]">+ Add Duty</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="divide-y divide-gray-100 pt-0.5">
                  {tomorrowList.length === 0 ? (
                    <p className="text-[10px] text-gray-400 italic py-1 text-center">No tomorrow tasks assigned yet.</p>
                  ) : (
                    tomorrowList.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center py-1.5 text-xs text-gray-900 font-medium">
                        <span>{item}</span>
                        <button type="button" onClick={() => setTomorrowList(prev => prev.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-black px-1 font-mono">✕</button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Submit Post Button */}
              <div className="pt-2 pb-2">
                <button 
                  type="button" 
                  onClick={handleSubmit} 
                  disabled={isSubmitting} 
                  className="w-full py-3 bg-[#141414] text-white rounded-xl text-xs font-bold hover:bg-black transition active:scale-[0.98] disabled:opacity-50 flex items-center justify-center space-x-1.5 shadow-md"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Posting to Diary...' : 'Post Entry to Diary'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL VIEW MODAL */}
      {selectedHistoryItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border border-gray-200 flex flex-col max-h-[85vh]">
            <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex justify-between items-start bg-gray-50/50">
              <div>
                <span className="text-[9px] font-mono uppercase text-gray-400 block font-bold">
                  LOGGED BY {selectedHistoryItem.manager.toUpperCase()} • {selectedHistoryItem.entryType || 'HANDOVER'}
                </span>
                <h2 className="text-sm font-black text-gray-900 leading-snug mt-0.5">{formatDisplayDate(selectedHistoryItem.dateStr || selectedHistoryItem.timestamp)}</h2>
                {selectedHistoryItem.takings && selectedHistoryItem.takings !== "0.00" && selectedHistoryItem.takings !== "0" && (
                  <span className="text-[11px] font-mono font-bold text-gray-900 mt-0.5 block">
                    Takings: £{selectedHistoryItem.takings} {selectedHistoryItem.closeTime ? `| Close: ${selectedHistoryItem.closeTime}` : ''}
                  </span>
                )}
              </div>
              <button onClick={() => setSelectedHistoryItem(null)} className="p-1 text-gray-400 hover:text-black bg-white rounded-full border border-gray-200 shadow-sm">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3.5 text-[11px]">
              <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between">
                <div>
                  <span className="font-bold uppercase tracking-wider text-[9px] text-gray-400 block mb-1">Acknowledgements</span>
                  <ReactionBar item={selectedHistoryItem} />
                </div>
              </div>

              <div>
                <span className="font-bold uppercase tracking-wider text-[9px] text-gray-400 block mb-1">General Notes</span>
                <p className="p-2.5 bg-gray-50 rounded-xl text-gray-800 leading-relaxed italic border border-gray-100 whitespace-pre-line text-[11px]">
                  {selectedHistoryItem.generalNotes || 'No notes logged.'}
                </p>
              </div>

              <div>
                <span className="font-bold uppercase tracking-wider text-[9px] text-gray-400 block mb-1">86 List (Out of Stock SKUs)</span>
                {(selectedHistoryItem.eightySixList || []).length === 0 ? (
                  <p className="p-1.5 text-gray-400 italic text-[10px]">No items out of stock.</p>
                ) : (
                  <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden bg-white">
                    {selectedHistoryItem.eightySixList.map((prod, i) => (
                      <div key={i} className="p-1.5 flex justify-between items-center text-[10px]">
                        <div><span className="font-bold text-gray-900">{prod.name || prod}</span>{prod.sku && <span className="font-mono text-[8px] text-gray-400 ml-1">[{prod.sku}]</span>}</div>
                        <span className="font-mono text-[9px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">{prod.qty || 1} {prod.unit || 'unit'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedHistoryItem.tomorrowTasks && selectedHistoryItem.tomorrowTasks.length > 0 && (
                <div>
                  <span className="font-bold uppercase tracking-wider text-[9px] text-gray-400 block mb-1">Tomorrow / Handover Actions</span>
                  <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 space-y-1">
                    {selectedHistoryItem.tomorrowTasks.map((t, idx) => (
                      <div key={idx} className="flex items-center space-x-1.5 text-gray-800 text-[10px]">
                        <span className="text-[9px] text-gray-400">•</span>
                        <span>{t}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-gray-100 pt-3 space-y-2">
                <span className="font-bold uppercase tracking-wider text-[9px] text-gray-400 block">
                  Manager Discussion ({(selectedHistoryItem.comments || []).length})
                </span>

                <div className="space-y-2">
                  {(selectedHistoryItem.comments || []).length === 0 ? (
                    <p className="text-[10px] text-gray-400 italic">No comments yet. Start the conversation below.</p>
                  ) : (
                    (selectedHistoryItem.comments || []).map((c) => (
                      <div key={c.id} className="p-2 bg-gray-50 rounded-xl space-y-0.5 border border-gray-100">
                        <div className="flex justify-between items-baseline">
                          <span className="font-bold text-gray-900 text-[10px]">{c.user}</span>
                          <span className="text-[8px] text-gray-400 font-mono">{c.timestamp}</span>
                        </div>
                        <p className="text-gray-700 leading-snug">{c.text}</p>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={handleAddComment} className="flex items-center space-x-1.5 pt-1">
                  <input
                    type="text"
                    placeholder="Write a reply or note..."
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    className="flex-1 bg-gray-100 py-1.5 px-2.5 rounded-xl text-xs focus:bg-white focus:outline-none border border-transparent focus:border-gray-300 transition"
                  />
                  <button
                    type="submit"
                    disabled={submittingComment || !commentInput.trim()}
                    className="p-2 bg-black text-white hover:bg-neutral-800 disabled:opacity-40 rounded-xl transition"
                  >
                    <Send className="w-3 h-3" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REACTIONS MODAL */}
      {reactorsModalItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xs rounded-3xl overflow-hidden shadow-2xl border border-gray-200 flex flex-col max-h-[60vh]">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <span className="text-xs font-black text-gray-900">Reactions</span>
              <button onClick={() => setReactorsModalItem(null)} className="p-1 text-gray-400 hover:text-black">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto divide-y divide-gray-100">
              {(reactorsModalItem.reactions || []).map((rx, idx) => (
                <div key={idx} className="py-2 flex items-center justify-between text-xs">
                  <span className="font-bold text-gray-800">{rx.user}</span>
                  <span className="text-sm">{rx.emoji}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}