import React, { useState, useEffect } from 'react';
import { ArrowLeft, Bell, Shield, User, Check, RefreshCw, Save } from 'lucide-react';
import { useTwoFingerSwipe } from './useTwoFingerSwipe';
import { supabase, DEFAULT_VENUE_ID } from './lib/db';

export default function PreferencesApp({ currentUser, onBackToHub, onLogout }) {
  const [preferences, setPreferences] = useState(() => {
    try {
      const saved = localStorage.getItem(`wst_prefs_${currentUser?.name || 'default'}`);
      return saved ? JSON.parse(saved) : {
        notify_handover: true,
        notify_high_spillage: true,
        notify_deliveries: true,
        notify_prep_deficits: false,
        notify_low_safe_float: true,
      };
    } catch {
      return {
        notify_handover: true,
        notify_high_spillage: true,
        notify_deliveries: true,
        notify_prep_deficits: false,
        notify_low_safe_float: true,
      };
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
      localStorage.setItem(`wst_prefs_${currentUser?.name || 'default'}`, JSON.stringify(preferences));

      // Push user tags to OneSignal if available
      if (window.OneSignalDeferred) {
        window.OneSignalDeferred.push(async function(OneSignal) {
          if (OneSignal.User?.addTags) {
            await OneSignal.User.addTags({
              notify_handover: preferences.notify_handover ? '1' : '0',
              notify_high_spillage: preferences.notify_high_spillage ? '1' : '0',
              notify_deliveries: preferences.notify_deliveries ? '1' : '0',
              notify_prep_deficits: preferences.notify_prep_deficits ? '1' : '0'
            });
          }
        });
      }

      setStatusMsg({ type: 'success', text: 'Notification preferences updated!' });
    } catch (err) {
      console.warn("Could not save preferences:", err);
      setStatusMsg({ type: 'error', text: 'Could not sync preferences.' });
    } finally {
      setSaving(false);
    }
  };

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
            <h1 className="font-extrabold text-base tracking-tight text-gray-900 leading-tight">User Preferences</h1>
            <span className="text-[10px] text-gray-400 font-mono block">Notifications &amp; Manager Identity</span>
          </div>
        </div>

        <button
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
            Active
          </span>
        </div>

        {/* Notifications Matrix */}
        <div className="space-y-2">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400 block px-0.5">
            Operational Alerts &amp; Push Triggers
          </span>

          <div className="divide-y divide-gray-100 border border-gray-200 rounded-2xl bg-white overflow-hidden shadow-2xs">
            <div className="p-3.5 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-gray-900 block">Shift Handover &amp; Notes</span>
                <span className="text-[10px] text-gray-400">Receive alerts when night closes or day notes are saved</span>
              </div>
              <input
                type="checkbox"
                checked={preferences.notify_handover}
                onChange={() => togglePref('notify_handover')}
                className="w-4 h-4 accent-black cursor-pointer"
              />
            </div>

            <div className="p-3.5 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-gray-900 block">High Spillage Alerts (&gt; £15.00)</span>
                <span className="text-[10px] text-gray-400">Pushed immediately when an expensive spirit or keg is dropped</span>
              </div>
              <input
                type="checkbox"
                checked={preferences.notify_high_spillage}
                onChange={() => togglePref('notify_high_spillage')}
                className="w-4 h-4 accent-black cursor-pointer"
              />
            </div>

            <div className="p-3.5 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-gray-900 block">Goods Received Delivery Inward</span>
                <span className="text-[10px] text-gray-400">Alerts when drivers check in stock invoices</span>
              </div>
              <input
                type="checkbox"
                checked={preferences.notify_deliveries}
                onChange={() => togglePref('notify_deliveries')}
                className="w-4 h-4 accent-black cursor-pointer"
              />
            </div>

            <div className="p-3.5 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-gray-900 block">Daily Prep Deficits</span>
                <span className="text-[10px] text-gray-400">Notify when daily station audits show empty prep pars</span>
              </div>
              <input
                type="checkbox"
                checked={preferences.notify_prep_deficits}
                onChange={() => togglePref('notify_prep_deficits')}
                className="w-4 h-4 accent-black cursor-pointer"
              />
            </div>

            <div className="p-3.5 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-gray-900 block">Safe Float Variance Alerts</span>
                <span className="text-[10px] text-gray-400">Notify when petty cash drops below £1,200.00 standard float</span>
              </div>
              <input
                type="checkbox"
                checked={preferences.notify_low_safe_float}
                onChange={() => togglePref('notify_low_safe_float')}
                className="w-4 h-4 accent-black cursor-pointer"
              />
            </div>
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