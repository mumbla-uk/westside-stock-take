import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Send,
  CheckCircle2,
  AlertCircle,
  Pin,
  RotateCcw,
  Clock,
  User,
  ShieldAlert,
  CornerDownRight
} from 'lucide-react';
import { supabase } from './lib/db';
import { sendPushNotification } from './lib/notifications';

function formatDrawerTime(val) {
  if (!val) return 'Just now';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return 'Just now';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'Just now';
  }
}

export default function ThreadDrawer({
  thread,
  currentUser,
  onClose,
  onThreadUpdated
}) {
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  // Resolution Modal State
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolutionNote, setResolutionNote] = useState('');
  const [resolving, setResolving] = useState(false);

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = async () => {
    if (!thread?.id) return;
    try {
      const { data, error } = await supabase
        .from('thread_messages')
        .select('*')
        .eq('thread_id', thread.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (err) {
      console.warn('Could not fetch thread messages:', err);
    } finally {
      setLoadingMessages(false);
      setTimeout(scrollToBottom, 100);
    }
  };

  useEffect(() => {
    fetchMessages();

    if (!thread?.id) return;

    // Isolated realtime channel strictly inside drawer
    const channel = supabase
      .channel(`thread:${thread.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'thread_messages',
          filter: `thread_id=eq.${thread.id}`
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
          setTimeout(scrollToBottom, 100);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [thread?.id]);

  const handleSendReply = async (e) => {
    e.preventDefault();
    const text = replyText.trim();
    if (!text || sending) return;

    setSending(true);
    const authorName = currentUser?.name || 'Staff';
    const authorId = currentUser?.name || 'anonymous';

    // Parse @mentions
    const matches = text.match(/@(\w+)/g) || [];
    const mentioned = matches.map((m) => m.replace('@', ''));

    try {
      const { error } = await supabase
        .from('thread_messages')
        .insert({
          thread_id: thread.id,
          author_id: authorId,
          author_name: authorName,
          body: text,
          mentioned_users: mentioned
        });

      if (error) throw error;

      await supabase
        .from('discussion_threads')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', thread.id);

      if (mentioned.length > 0) {
        for (const target of mentioned) {
          if (target.toLowerCase() !== 'all' && target.toLowerCase() !== 'team') {
            sendPushNotification(
              `Mentioned in Thread: ${thread.title}`,
              `${authorName}: "${text.slice(0, 60)}..."`,
              target,
              { module: 'discussions', threadId: thread.id }
            );
          }
        }
      }

      setReplyText('');
      if (onThreadUpdated) onThreadUpdated();
    } catch (err) {
      console.error('Error posting message:', err);
    } finally {
      setSending(false);
    }
  };

  const handleConfirmResolve = async (e) => {
    e.preventDefault();
    if (!resolutionNote.trim() || resolving) return;

    setResolving(true);
    const resolverName = currentUser?.name || 'Duty Manager';

    try {
      const payload = {
        status: 'resolved',
        resolved_by: resolverName,
        resolved_at: new Date().toISOString(),
        resolution_note: resolutionNote.trim(),
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('discussion_threads')
        .update(payload)
        .eq('id', thread.id);

      if (error) throw error;

      setShowResolveModal(false);
      setResolutionNote('');
      if (onThreadUpdated) onThreadUpdated();
      onClose();
    } catch (err) {
      console.error('Error resolving thread:', err);
    } finally {
      setResolving(false);
    }
  };

  const handleReopen = async () => {
    if (!window.confirm('Re-open this issue back to active queue?')) return;
    try {
      const { error } = await supabase
        .from('discussion_threads')
        .update({
          status: 'open',
          resolved_by: null,
          resolved_at: null,
          resolution_note: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', thread.id);

      if (error) throw error;
      if (onThreadUpdated) onThreadUpdated();
      onClose();
    } catch (err) {
      console.error('Error reopening thread:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-in fade-in duration-200">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />

      <div className="relative w-full max-w-md h-full bg-white text-gray-900 shadow-2xl flex flex-col justify-between border-l border-gray-200 z-10 animate-in slide-in-from-right duration-200 select-none">
        {/* Drawer Header */}
        <div className="px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-3 border-b border-gray-100 flex items-start justify-between bg-white flex-shrink-0">
          <div className="pr-3 min-w-0">
            <div className="flex items-center space-x-1.5 mb-1">
              {thread.severity === 'critical' ? (
                <span className="text-[9px] font-mono font-bold uppercase bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded">
                  Critical Issue
                </span>
              ) : thread.is_pinned ? (
                <span className="text-[9px] font-mono font-bold uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded flex items-center space-x-0.5">
                  <Pin className="w-2.5 h-2.5" />
                  <span>Pinned Decision</span>
                </span>
              ) : (
                <span className="text-[9px] font-mono font-bold uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                  {thread.topic_type || 'direct'}
                </span>
              )}
              <span className="text-[10px] text-gray-400 font-mono">
                Assigned: <strong className="text-gray-700">{thread.assigned_to || 'Next Shift Openers'}</strong>
              </span>
            </div>
            <h2 className="text-base font-extrabold text-gray-900 leading-snug line-clamp-2">
              {thread.title}
            </h2>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-black rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Audit Status Bar */}
        <div className="px-5 py-2 bg-gray-50/80 border-b border-gray-100 flex items-center justify-between text-xs flex-shrink-0">
          <div className="flex items-center space-x-1.5">
            <User className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-gray-600 text-[11px]">
              Logged by <strong>{thread.author_name || 'Staff'}</strong>
            </span>
          </div>

          {thread.status === 'resolved' ? (
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                Resolved
              </span>
              <button
                onClick={handleReopen}
                className="text-[10px] font-bold text-gray-500 hover:text-black flex items-center space-x-0.5 underline"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Re-open</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowResolveModal(true)}
              className="py-1 px-3 bg-black text-white hover:bg-neutral-800 rounded-xl text-xs font-bold transition flex items-center space-x-1 shadow-2xs active:scale-95"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Mark Resolved</span>
            </button>
          )}
        </div>

        {/* Message Feed */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3 touch-pan-y overscroll-contain">
          {thread.snippet && (
            <div className="p-3 bg-neutral-50 border border-neutral-200/80 rounded-2xl space-y-1">
              <span className="text-[9px] font-mono font-bold uppercase text-gray-400 tracking-wider flex items-center space-x-1">
                <CornerDownRight className="w-3 h-3" />
                <span>Original Handover Reference</span>
              </span>
              <p className="text-xs text-gray-700 italic leading-relaxed">
                "{thread.snippet}"
              </p>
            </div>
          )}

          {thread.status === 'resolved' && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-1">
              <div className="flex items-center justify-between text-emerald-800 text-[10px] font-bold uppercase tracking-wider">
                <span className="flex items-center space-x-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Resolution Audit Trail</span>
                </span>
                <span className="font-mono text-gray-500">
                  {formatDrawerTime(thread.resolved_at)}
                </span>
              </div>
              <p className="text-xs text-emerald-950 font-medium">
                {thread.resolution_note || 'Resolved with no additional comments.'}
              </p>
              <span className="text-[9px] text-emerald-700 block font-mono">
                Confirmed by {thread.resolved_by || 'Manager'}
              </span>
            </div>
          )}

          {loadingMessages ? (
            <p className="text-center py-6 text-xs text-gray-400 italic">Syncing action thread...</p>
          ) : messages.length === 0 ? (
            <p className="text-center py-6 text-xs text-gray-400 italic">
              No replies yet. Post an update or tag a manager using @name.
            </p>
          ) : (
            messages.map((msg) => {
              const isMe = msg.author_name === currentUser?.name;
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-0.5`}
                >
                  <div className="flex items-center space-x-1 text-[9px] text-gray-400 font-mono px-1">
                    <span className="font-bold text-gray-700">{msg.author_name || 'Staff'}</span>
                    <span>•</span>
                    <span>{formatDrawerTime(msg.created_at)}</span>
                  </div>
                  <div
                    className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed ${
                      isMe
                        ? 'bg-neutral-900 text-white rounded-br-xs'
                        : 'bg-gray-100 text-gray-900 rounded-bl-xs'
                    }`}
                  >
                    {msg.body}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply Input Bar */}
        <form
          onSubmit={handleSendReply}
          className="p-3 border-t border-gray-100 bg-white flex items-center space-x-2 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Reply or re-assign with @Luca..."
            className="flex-1 bg-[#EDEDED] py-2 px-3 rounded-xl text-xs placeholder-gray-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!replyText.trim() || sending}
            className="p-2 bg-black hover:bg-neutral-800 disabled:opacity-30 text-white rounded-xl transition"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

        {/* Resolution Modal */}
        {showResolveModal && (
          <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-3xl p-5 space-y-3.5 shadow-2xl border border-gray-200 animate-in zoom-in-95 duration-150">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase text-emerald-600 block">
                  Action Audit Confirmation
                </span>
                <h3 className="text-base font-extrabold text-gray-900 leading-tight">
                  Mark Issue Resolved
                </h3>
              </div>

              <form onSubmit={handleConfirmResolve} className="space-y-3">
                <div>
                  <label className="text-[9px] font-bold text-gray-500 uppercase block mb-1">
                    Resolution Note (Audit Trail) *
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={resolutionNote}
                    onChange={(e) => setResolutionNote(e.target.value)}
                    placeholder="e.g. Cleared drainage pipe and reset pump. Working normally."
                    className="w-full bg-[#EDEDED] p-2.5 rounded-xl text-xs leading-relaxed focus:outline-none resize-none"
                  />
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowResolveModal(false)}
                    className="flex-1 py-2 text-xs font-semibold text-gray-500 hover:text-black bg-gray-100 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!resolutionNote.trim() || resolving}
                    className="flex-1 py-2 bg-black hover:bg-neutral-800 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition"
                  >
                    {resolving ? 'Logging...' : 'Confirm Resolution'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}