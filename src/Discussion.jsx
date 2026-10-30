import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Search,
  Plus,
  Pin,
  AlertCircle,
  CheckCircle2,
  Clock,
  User,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  X
} from 'lucide-react';
import { useTwoFingerSwipe } from './useTwoFingerSwipe';
import { supabase, DEFAULT_VENUE_ID } from './lib/db';
import ThreadDrawer from './ThreadDrawer';
import MentionInput from './MentionInput';

function formatDateSafe(val, type = 'time') {
  if (!val) return 'Recently';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return 'Recently';
    if (type === 'time') {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return 'Recently';
  }
}

export default function Discussion({ currentUser, onBackToHub, onLogout }) {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedThread, setSelectedThread] = useState(null);
  const [showArchive, setShowArchive] = useState(false);

  // New Thread Modal State
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSnippet, setNewSnippet] = useState('');
  const [newTopicType, setNewTopicType] = useState('direct');
  const [newSeverity, setNewSeverity] = useState('normal');
  const [newAssignedTo, setNewAssignedTo] = useState('Next Shift Openers');
  const [creating, setCreating] = useState(false);

  const swipeHandlers = useTwoFingerSwipe({
    disabled: Boolean(selectedThread) || showNewModal,
    onSwipeRight: () => {
      if (onBackToHub) onBackToHub();
    }
  });

  const fetchThreads = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('discussion_threads')
        .select('*')
        .eq('venue_id', DEFAULT_VENUE_ID)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setThreads(data || []);
    } catch (err) {
      console.warn('Could not load discussion threads:', err);
      setThreads([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchThreads();

    const channel = supabase
      .channel('discussion_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'discussion_threads' },
        () => {
          fetchThreads();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredThreads = useMemo(() => {
    const q = (searchQuery || '').toLowerCase().trim();
    return (threads || []).filter((t) => {
      if (!t) return false;
      if (!q) return true;
      const title = String(t.title || '').toLowerCase();
      const assigned = String(t.assigned_to || '').toLowerCase();
      const author = String(t.author_name || '').toLowerCase();
      const snippet = String(t.snippet || '').toLowerCase();
      return title.includes(q) || assigned.includes(q) || author.includes(q) || snippet.includes(q);
    });
  }, [threads, searchQuery]);

  const pinnedThreads = useMemo(() => {
    return filteredThreads.filter(
      (t) => (t.status || 'open') === 'open' && (t.is_pinned || t.severity === 'critical')
    );
  }, [filteredThreads]);

  const activeActionThreads = useMemo(() => {
    return filteredThreads.filter(
      (t) => (t.status || 'open') === 'open' && !t.is_pinned && t.severity !== 'critical'
    );
  }, [filteredThreads]);

  const resolvedThreads = useMemo(() => {
    return filteredThreads.filter((t) => t.status === 'resolved');
  }, [filteredThreads]);

  const handleCreateThread = async (e) => {
    e.preventDefault();
    if (!newTitle.trim() || creating) return;

    setCreating(true);
    const authorName = currentUser?.name || 'Staff';
    const authorId = currentUser?.name || 'anonymous';

    // Auto-detect @mentions inside title/snippet to auto-assign
    let autoAssigned = newAssignedTo.trim() || 'Next Shift Openers';
    const match = newTitle.match(/@(\w+)/) || newSnippet.match(/@(\w+)/);
    if (match && match[1]) {
      autoAssigned = match[1];
    }

    try {
      const payload = {
        venue_id: DEFAULT_VENUE_ID,
        title: newTitle.trim(),
        snippet: newSnippet.trim() || null,
        topic_type: newTopicType,
        severity: newSeverity,
        assigned_to: autoAssigned,
        author_id: authorId,
        author_name: authorName,
        is_pinned: newSeverity === 'critical' || newTopicType === 'team'
      };

      const { error } = await supabase
        .from('discussion_threads')
        .insert(payload);

      if (error) throw error;

      setShowNewModal(false);
      setNewTitle('');
      setNewSnippet('');
      setNewSeverity('normal');
      setNewTopicType('direct');
      setNewAssignedTo('Next Shift Openers');
      fetchThreads();
    } catch (err) {
      console.error('Error creating discussion thread:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      {...swipeHandlers}
      className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 overflow-hidden relative select-none"
    >
      {/* Top Bar */}
      <header className="flex items-center justify-between px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-2 border-b border-gray-100 flex-shrink-0 bg-white z-20">
        <div className="flex items-center space-x-2">
          {onBackToHub && (
            <button
              onClick={onBackToHub}
              className="mr-0.5 p-1 -ml-1 text-gray-500 hover:text-black rounded-lg transition"
              title="Return to Hub"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="w-6 h-6 rounded bg-neutral-900 text-white flex items-center justify-center font-serif text-xs font-bold">
            W
          </div>
          <div>
            <h1 className="font-extrabold text-base tracking-tight text-gray-900 leading-tight">
              Action Threads
            </h1>
            <span className="text-[10px] text-gray-400 font-mono block">
              Asynchronous Shift Continuity
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          <button
            onClick={fetchThreads}
            className="p-1.5 text-gray-500 hover:text-black rounded-lg transition"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center space-x-1 py-1.5 px-3 rounded-xl bg-black text-white hover:bg-neutral-800 text-xs font-bold transition active:scale-95 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Action</span>
          </button>
        </div>
      </header>

      {/* Search Bar */}
      <div className="px-5 py-2 border-b border-gray-100 bg-white flex-shrink-0">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks, snags or @assignee..."
            className="w-full bg-[#EDEDED] py-1.5 pl-3 pr-8 rounded-xl text-xs placeholder-gray-400 focus:outline-none"
          />
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          )}
        </div>
      </div>

      {/* Main Action Feed Container */}
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4 pb-28 touch-pan-y overscroll-contain">
        {/* SECTION 1: TOP PINNED SHELF */}
        {pinnedThreads.length > 0 && (
          <div className="space-y-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-rose-600 flex items-center space-x-1 px-1">
              <Pin className="w-3 h-3" />
              <span>Pinned Decisions &amp; Critical Snags</span>
            </span>

            <div className="space-y-2">
              {pinnedThreads.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setSelectedThread(t)}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition active:scale-[0.98] shadow-xs ${
                    t.severity === 'critical'
                      ? 'bg-rose-50/70 border-rose-300'
                      : 'bg-amber-50/70 border-amber-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 pr-2">
                      <div className="flex items-center space-x-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            t.severity === 'critical' ? 'bg-rose-600 animate-pulse' : 'bg-amber-500'
                          }`}
                        />
                        <span className="font-extrabold text-xs text-gray-900 block leading-tight">
                          {t.title || 'Untitled Action'}
                        </span>
                      </div>
                      {t.snippet && (
                        <p className="text-[11px] text-gray-600 line-clamp-1 italic">
                          "{t.snippet}"
                        </p>
                      )}
                    </div>

                    <span className="text-[9px] font-mono font-bold uppercase bg-white px-2 py-0.5 rounded-full border border-gray-200 text-gray-800 flex-shrink-0">
                      @{t.assigned_to || 'Openers'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-gray-500 font-mono mt-2 pt-1.5 border-t border-black/5">
                    <span>By {t.author_name || 'Staff'}</span>
                    <span>{formatDateSafe(t.created_at, 'time')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SECTION 2: ACTIVE ACTION FEED */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400">
              Active Action Feed ({activeActionThreads.length})
            </span>
            <span className="text-[10px] font-mono text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-bold">
              Action Required
            </span>
          </div>

          {activeActionThreads.length === 0 ? (
            <div className="p-8 border border-dashed border-gray-200 rounded-3xl text-center text-xs text-gray-400">
              All tasks resolved. Nightly handover is clean.
            </div>
          ) : (
            <div className="divide-y divide-gray-100 border border-gray-200 rounded-3xl bg-white overflow-hidden shadow-xs">
              {activeActionThreads.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setSelectedThread(t)}
                  className="p-3.5 cursor-pointer hover:bg-gray-50/80 transition group space-y-1"
                >
                  <div className="flex items-start justify-between">
                    <span className="font-bold text-xs text-gray-900 group-hover:text-black leading-snug">
                      {t.title || 'Action Required'}
                    </span>
                    <span className="text-[9px] font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                      @{t.assigned_to || 'Next Shift'}
                    </span>
                  </div>

                  {t.snippet && (
                    <p className="text-[11px] text-gray-500 line-clamp-1 italic">
                      "{t.snippet}"
                    </p>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono pt-1">
                    <span>
                      {t.author_name || 'Staff'} • {formatDateSafe(t.created_at, 'date')}
                    </span>
                    <span className="flex items-center space-x-1 text-gray-500 font-semibold">
                      <MessageSquare className="w-3 h-3" />
                      <span>Open Thread</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SECTION 4: HISTORICAL / RESOLVED ARCHIVE */}
        <div className="space-y-2 pt-2 border-t border-gray-100">
          <button
            onClick={() => setShowArchive(!showArchive)}
            className="w-full flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-wider text-gray-500 py-1 px-1 hover:text-black transition"
          >
            <span>Resolved Archive ({resolvedThreads.length})</span>
            {showArchive ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showArchive && (
            <div className="divide-y divide-gray-100 border border-gray-200 rounded-2xl bg-gray-50/60 overflow-hidden text-xs">
              {resolvedThreads.length === 0 ? (
                <p className="p-4 text-center text-gray-400 text-[11px] italic">No resolved records.</p>
              ) : (
                resolvedThreads.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => setSelectedThread(t)}
                    className="p-3 cursor-pointer hover:bg-gray-100/70 transition flex items-center justify-between"
                  >
                    <div className="space-y-0.5 min-w-0 pr-2">
                      <div className="flex items-center space-x-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        <span className="font-bold text-gray-800 truncate block text-[11px]">{t.title}</span>
                      </div>
                      <span className="text-[9px] text-gray-400 font-mono block truncate">
                        Resolved by {t.resolved_by || 'Staff'} • "{t.resolution_note || 'Closed'}"
                      </span>
                    </div>

                    <span className="text-[9px] font-mono text-gray-400 flex-shrink-0">
                      {formatDateSafe(t.resolved_at || t.created_at, 'date')}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Floating Hub Nav */}
      <nav className="fixed bottom-2 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[390px] z-30 rounded-2xl bg-[#111111]/95 backdrop-blur-md text-white py-2 px-3 flex justify-around items-center text-xs font-semibold shadow-2xl border border-white/10 select-none pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
        <button
          onClick={onBackToHub}
          className="flex-1 py-1 text-center rounded-xl transition text-neutral-400 hover:text-white"
        >
          Return to Hub
        </button>
      </nav>

      {/* Nested Slide-Over Thread Drawer */}
      {selectedThread && (
        <ThreadDrawer
          thread={selectedThread}
          currentUser={currentUser}
          onClose={() => setSelectedThread(null)}
          onThreadUpdated={fetchThreads}
        />
      )}

      {/* Create Action Modal with Autocomplete @mentions */}
      {showNewModal && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 space-y-3.5 shadow-2xl border border-gray-200 animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[9px] font-mono font-bold uppercase text-purple-600 block">
                  Operations Handover
                </span>
                <h3 className="text-base font-extrabold text-gray-900 leading-tight">
                  New Action Thread
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="p-1 text-gray-400 hover:text-black"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateThread} className="space-y-3 text-xs">
              <div>
                <label className="text-[9px] font-bold text-gray-500 uppercase block mb-1">
                  Title / Action * (Type @ for staff)
                </label>
                <MentionInput
                  as="input"
                  required
                  placeholder="e.g. @Luca please reset glasswasher breaker"
                  value={newTitle}
                  onChange={setNewTitle}
                  className="w-full bg-[#EDEDED] py-2 px-3 rounded-xl text-xs font-bold text-gray-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[9px] font-bold text-gray-500 uppercase block mb-1">
                  Context / Notes (Optional)
                </label>
                <MentionInput
                  as="textarea"
                  rows={2}
                  placeholder="e.g. Pump started dripping during Sunday close..."
                  value={newSnippet}
                  onChange={setNewSnippet}
                  className="w-full bg-[#EDEDED] p-2.5 rounded-xl text-xs leading-relaxed focus:outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] font-bold text-gray-500 uppercase block mb-1">
                    Assignee (@User)
                  </label>
                  <MentionInput
                    as="input"
                    placeholder="e.g. Luca or Openers"
                    value={newAssignedTo}
                    onChange={setNewAssignedTo}
                    className="w-full bg-[#EDEDED] py-1.5 px-2.5 rounded-xl text-xs font-semibold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-gray-500 uppercase block mb-1">
                    Severity
                  </label>
                  <select
                    value={newSeverity}
                    onChange={(e) => setNewSeverity(e.target.value)}
                    className="w-full bg-[#EDEDED] py-1.5 px-2 rounded-xl text-xs font-semibold focus:outline-none"
                  >
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="critical">Critical (Pin to top)</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={!newTitle.trim() || creating}
                className="w-full py-2.5 bg-black hover:bg-neutral-800 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1 shadow-sm mt-2"
              >
                <span>{creating ? 'Creating...' : 'Post Action Thread'}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}