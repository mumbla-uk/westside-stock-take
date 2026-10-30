import React, { useState } from 'react';
import { ArrowLeft, Save, Bell, Check } from 'lucide-react';
import { useTwoFingerSwipe } from './useTwoFingerSwipe';

const DEFAULT_PREFS = {
  notify_handover: true,          // New handover submitted by any user
  notify_orders: true,            // New placed order by any user
  notify_goods: true,             // New goods received by any user
  notify_my_diary_comments: true, // New comment on own diary
  notify_thread_comments: true,   // New comment on diary current user commented on
  notify_mentions: true           // When @ user is used
};

export default function PreferencesApp({ currentUser, onBackToHub, onLogout }) {
  const [preferences, setPreferences] = useState(() => {
    try {
      const userKey = currentUser?.name ? currentUser.name.replace(/\s+/g, '_') : 'default';
      const saved = localStorage.getItem(`wst_prefs_${userKey}`);
      return saved ? { ...DEFAULT_PREFS, ...JSON.parse(saved) } : DEFAULT_PREFS;
    } catch {
      return DEFAULT_PREFS;
    }
  });

  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  const swipeHandlers = useTwoFingerSwipe({
    onSwipeRight: () => {
      if (onBackToHub) onBackToHub();
    }
  });

  const togglePref = (key) => {
    setPreferences(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      const userKey = currentUser?.name ? currentUser.name.replace(/\s+/g, '_') : 'default';
      localStorage.setItem(`wst_prefs_${userKey}`, JSON.stringify(preferences));

      // Push preference tags to OneSignal
      if (window.OneSignalDeferred) {
        window.OneSignalDeferred.push(async function(OneSignal) {
          if (OneSignal?.User?.addTags) {
            await OneSignal.User.addTags({
              user_name: currentUser?.name || 'Staff',
              notify_handover: preferences.notify_handover ? '1' : '0',
              notify_orders: preferences.notify_orders ? '1' : '0',
              notify_goods: preferences.notify_goods ? '1' : '0',
              notify_my_diary_comments: preferences.notify_my_diary_comments ? '1' : '0',
              notify_thread_comments: preferences.notify_thread_comments ? '1' : '0',
              notify_mentions: preferences.notify_mentions ? '1' : '0'
            });
          }
        });
      }

      setStatusMsg({ type: 'success', text: 'Notification preferences synced!' });
    } catch (err) {
      console.warn("Could not save preferences:", err);
      setStatusMsg({ type: 'error', text: 'Failed to update preferences.' });
    } finally {
      setSaving(false);
    }
  };

  const PREF_ITEMS = [
    {
      key: 'notify_handover',
      title: 'New Handover Diary Submissions',
      desc: 'Alert when any manager logs a Night Close or Day Note'
    },
    {
      key: 'notify_orders',
      title: 'New Placed Orders',
      desc: 'Alert when stock orders are officially submitted to suppliers'
    },
    {
      key: 'notify_goods',
      title: 'New Goods Received Invoices',
      desc: 'Alert when a delivery arrives and an invoice is checked in'
    },
    {
      key: 'notify_my_diary_comments',
      title: 'Comments on My Handover Entries',
      desc: 'Alert when team members leave queries or feedback on your diary'
    },
    {
      key: 'notify_thread_comments',
      title: 'Participated Diary Discussion',
      desc: 'Alert when someone comments on a diary you have also commented on'
    },
    {
      key: 'notify_mentions',
      title: 'Direct @Mentions',
      desc: 'Instant alert when someone tags you directly in notes, actions, or replies'
    }
  ];

  return (
    <div
      {...swipeHandlers}
      className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 overflow-hidden relative select-none"
    >
      <header className="flex items-center justify-between px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-3 border-b border-gray-100 flex-shrink-0 bg-white">
        <div className="flex items-center space-x-2">
          {onBackToHub && (
            <button onClick={onBackToHub} className="mr-0.5 p-1 -ml-1 text-gray-500 hover:text-black rounded-lg transition" title="Return to Hub">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <h1 className="font-extrabold text-base tracking-tight text-gray-900 leading-tight">Preferences</h1>
            <span className="text-[10px] text-gray-400 font-mono block">Push Notification Matrix</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center space-x-1 py-1.5 px-3 rounded-xl bg-black text-white hover:bg-neutral-800 text-xs font-bold transition active:scale-95 shadow-xs"
        >
          <Save className="w-3.5 h-3.5 text-emerald-400" />
          <span>{saving ? 'Saving...' : 'Save'}</span>
        </button>
      </header>

      {statusMsg && (
        <div className={`mx-5 my-2 p-2 rounded-xl text-xs font-semibold ${
          statusMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {statusMsg.text}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 pb-24 touch-pan-y overscroll-contain">
        {/* User Card */}
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-neutral-900 text-white font-bold flex items-center justify-center text-sm">
              {currentUser?.name?.slice(0, 1) || 'U'}
            </div>
            <div>
              <span className="font-black text-sm text-gray-900 block leading-tight">{currentUser?.name || 'Staff User'}</span>
              <span className="text-[10px] text-gray-400 font-mono capitalize">{currentUser?.role || 'Duty Manager'}</span>
            </div>
          </div>
          <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
            Target ID: {currentUser?.name}
          </span>
        </div>

        {/* Notification Matrix */}
        <div className="space-y-2">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400 block px-0.5">
            Operational Notification Rules
          </span>

          <div className="divide-y divide-gray-100 border border-gray-200 rounded-2xl bg-white overflow-hidden shadow-2xs">
            {PREF_ITEMS.map((item) => (
              <div key={item.key} className="p-3.5 flex items-center justify-between">
                <div className="pr-3">
                  <span className="text-xs font-bold text-gray-900 block">{item.title}</span>
                  <span className="text-[10px] text-gray-400 leading-snug block">{item.desc}</span>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(preferences[item.key])}
                  onChange={() => togglePref(item.key)}
                  className="w-4 h-4 accent-black cursor-pointer flex-shrink-0"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <nav className="fixed bottom-2 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[390px] z-30 rounded-2xl bg-[#111111]/95 backdrop-blur-md text-white py-2 px-3 flex justify-around items-center text-xs font-semibold shadow-2xl border border-white/10 select-none pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
        <button onClick={onBackToHub} className="flex-1 py-1 text-center rounded-xl transition text-neutral-400 hover:text-white">
          Return to Hub
        </button>
      </nav>
    </div>
  );
}