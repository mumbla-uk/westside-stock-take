import React, { useState } from 'react';
import {
  ArrowLeft,
  Shield,
  Key,
  Smartphone,
  Trash2,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Wrench,
  Check,
  AlertTriangle,
  RotateCcw,
  Layers,
  Database
} from 'lucide-react';
import { useTwoFingerSwipe } from './useTwoFingerSwipe';
import { supabase, localDb, DEFAULT_VENUE_ID } from './lib/db';
import {
  ALL_MODULES,
  getDevMode,
  setDevMode,
  getEnabledModules,
  toggleModule,
  setEnabledModules,
  DEFAULT_ENABLED_MODULES
} from './lib/features';

export default function Settings({ currentUser, onBackToHub, onLogout }) {
  const [devModeActive, setDevModeActive] = useState(() => getDevMode());
  const [enabledModules, setModulesState] = useState(() => getEnabledModules());
  const [statusMsg, setStatusMsg] = useState(null);
  const [confirmWipeType, setConfirmWipeType] = useState(null);
  const [wiping, setWiping] = useState(false);

  const swipeHandlers = useTwoFingerSwipe({
    onSwipeRight: () => {
      if (onBackToHub) onBackToHub();
    }
  });

  const handleToggleDevMode = () => {
    const next = !devModeActive;
    setDevModeActive(next);
    setDevMode(next);
    setStatusMsg({ type: 'info', text: next ? 'Developer Mode unlocked.' : 'Developer Mode locked.' });
  };

  const handleToggleApp = (modId) => {
    const updated = toggleModule(modId);
    setModulesState(updated);
  };

  const handleResetToDefaults = () => {
    setEnabledModules(DEFAULT_ENABLED_MODULES);
    setModulesState(DEFAULT_ENABLED_MODULES);
    setStatusMsg({ type: 'info', text: 'Reset visibility to core 4 launch pillars.' });
  };

  const handleSelectAll = () => {
    const allIds = ALL_MODULES.map(m => m.id);
    setEnabledModules(allIds);
    setModulesState(allIds);
    setStatusMsg({ type: 'info', text: 'All modules enabled.' });
  };

  // Safe Data Wipe Utilities
  const executeDataWipe = async (type) => {
    setWiping(true);
    try {
      if (type === 'cache') {
        // Clear offline IndexedDB & cached session states
        if (localDb?.pending_stock_counts) await localDb.pending_stock_counts.clear();
        if (localDb?.cached_catalog) await localDb.cached_catalog.clear();
        localStorage.removeItem('wst_catalog_cache');
        localStorage.removeItem('wst_active_counts');
        localStorage.removeItem('wst_modified_ids');
        localStorage.removeItem('wst_read_activity_ids');
        setStatusMsg({ type: 'success', text: 'Offline cache and local stock counters cleared.' });
      } else if (type === 'notifications') {
        // Clear notification center read history and prompt flag
        localStorage.removeItem('wst_read_activity_ids');
        localStorage.removeItem('wst_push_prompted');
        setStatusMsg({ type: 'success', text: 'Push permission tracking and read states reset.' });
      } else if (type === 'full_local') {
        // Factory reset local browser storage except user auth
        const authBackup = localStorage.getItem('wst_auth_user');
        localStorage.clear();
        if (authBackup) localStorage.setItem('wst_auth_user', authBackup);
        setEnabledModules(DEFAULT_ENABLED_MODULES);
        setModulesState(DEFAULT_ENABLED_MODULES);
        setDevMode(true);
        setDevModeActive(true);
        setStatusMsg({ type: 'success', text: 'Local app settings reset to fresh install state.' });
      }
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Wipe failed: ' + err.message });
    } finally {
      setWiping(false);
      setConfirmWipeType(null);
    }
  };

  return (
    <div
      {...swipeHandlers}
      className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 overflow-hidden relative select-none"
    >
      {/* Top Bar */}
      <header className="flex items-center justify-between px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-3 border-b border-gray-100 flex-shrink-0 bg-white z-20">
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
              Venue Settings
            </h1>
            <span className="text-[10px] text-gray-400 font-mono block">
              System &amp; Developer Controls
            </span>
          </div>
        </div>

        <button
          onClick={onBackToHub}
          className="text-xs font-bold text-gray-900 hover:text-black py-1 px-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition"
        >
          Done
        </button>
      </header>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6 pb-28 touch-pan-y overscroll-contain">
        {statusMsg && (
          <div
            className={`p-3 rounded-2xl text-xs font-semibold flex items-center justify-between animate-in fade-in ${
              statusMsg.type === 'error'
                ? 'bg-rose-50 text-rose-800 border border-rose-200'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}
          >
            <span>{statusMsg.text}</span>
            <button onClick={() => setStatusMsg(null)} className="text-gray-400 hover:text-black">
              ×
            </button>
          </div>
        )}

        {/* SECTION 1: VENUE & ACCESS INFO */}
        <div className="space-y-2">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400 px-1">
            Access &amp; Security
          </span>
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 divide-y divide-gray-200/60 text-xs">
            <div className="flex items-center justify-between pb-3">
              <div className="space-y-0.5">
                <span className="font-bold text-gray-900 block">Authenticated User</span>
                <span className="text-[11px] text-gray-500 font-mono">
                  {currentUser?.name || 'Staff Member'} ({currentUser?.role || 'Duty Manager'})
                </span>
              </div>
              <span className="text-[10px] font-mono font-bold uppercase bg-white border border-gray-200 px-2 py-0.5 rounded-md">
                Active
              </span>
            </div>

            <div className="flex items-center justify-between pt-3">
              <div className="space-y-0.5">
                <span className="font-bold text-gray-900 block">Venue Scope</span>
                <span className="text-[11px] text-gray-500 font-mono">West Side Tavern • Partick</span>
              </div>
              <span className="text-[10px] font-mono text-gray-400">#001</span>
            </div>
          </div>
        </div>

        {/* SECTION 2: DEVELOPER MODE MASTER SWITCH */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1">
              <Wrench className="w-3.5 h-3.5" />
              <span>Developer Controls</span>
            </span>
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
              Admin
            </span>
          </div>

          <div className="border border-amber-200 bg-amber-50/50 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-xs text-gray-900 block">Enable Developer Mode</span>
                <p className="text-[11px] text-gray-500 leading-tight mt-0.5">
                  Allows app visibility toggling, beta access, and diagnostic controls.
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleDevMode}
                className="text-gray-800 hover:text-black transition p-1"
                aria-label="Toggle Developer Mode"
              >
                {devModeActive ? (
                  <ToggleRight className="w-8 h-8 text-black fill-black" />
                ) : (
                  <ToggleLeft className="w-8 h-8 text-gray-300" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* SECTION 3: APP MODULE VISIBILITY TOGGLES (When Developer Mode is Active) */}
        {devModeActive && (
          <div className="space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between px-1">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-500 block">
                  Tool Visibility ({enabledModules.length}/{ALL_MODULES.length} Active)
                </span>
                <span className="text-[10px] text-gray-400">
                  Toggle which apps appear on the home screen and navigation drawer.
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2 px-1">
              <button
                type="button"
                onClick={handleResetToDefaults}
                className="py-1 px-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10px] font-bold transition flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Launch Pillars Only (4)</span>
              </button>
              <button
                type="button"
                onClick={handleSelectAll}
                className="py-1 px-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10px] font-bold transition flex items-center gap-1"
              >
                <Layers className="w-3 h-3" />
                <span>Enable All</span>
              </button>
            </div>

            <div className="divide-y divide-gray-100 border border-gray-200 rounded-3xl bg-white overflow-hidden shadow-2xs">
              {ALL_MODULES.map((mod) => {
                const isEnabled = enabledModules.includes(mod.id);
                return (
                  <div
                    key={mod.id}
                    onClick={() => handleToggleApp(mod.id)}
                    className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-gray-50/80 transition"
                  >
                    <div className="space-y-0.5 pr-2">
                      <div className="flex items-center space-x-2">
                        <span className={`text-xs font-bold ${isEnabled ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                          {mod.label}
                        </span>
                        <span className="text-[9px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.2 rounded">
                          {mod.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 line-clamp-1 leading-snug">
                        {mod.sub}
                      </p>
                    </div>

                    <button
                      type="button"
                      className="p-1 text-gray-700 hover:text-black flex-shrink-0"
                    >
                      {isEnabled ? (
                        <ToggleRight className="w-7 h-7 text-emerald-600 fill-emerald-600" />
                      ) : (
                        <ToggleLeft className="w-7 h-7 text-gray-300" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SECTION 4: DATA WIPING CONSOLE (When Developer Mode is Active) */}
        {devModeActive && (
          <div className="space-y-2 pt-2 border-t border-gray-100 animate-in fade-in duration-150">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-rose-600 flex items-center gap-1 px-1">
              <Trash2 className="w-3.5 h-3.5" />
              <span>Data Wipe &amp; Reset Utilities</span>
            </span>

            <div className="border border-rose-200 bg-rose-50/40 rounded-2xl p-4 space-y-3">
              <p className="text-[11px] text-gray-600 leading-snug">
                Clear stale browser caches, unread flags, and local offline counts without affecting other staff members' data.
              </p>

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmWipeType('cache')}
                  className="w-full py-2 px-3 bg-white hover:bg-rose-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 text-left flex items-center justify-between transition"
                >
                  <div>
                    <span className="block leading-tight">Clear Offline Stock Cache &amp; Disks</span>
                    <span className="text-[10px] text-gray-400 font-normal">Wipes local IndexedDB counters and stocktake drafts</span>
                  </div>
                  <Database className="w-3.5 h-3.5 text-gray-400" />
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmWipeType('notifications')}
                  className="w-full py-2 px-3 bg-white hover:bg-rose-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 text-left flex items-center justify-between transition"
                >
                  <div>
                    <span className="block leading-tight">Reset Read Activity &amp; Push Flags</span>
                    <span className="text-[10px] text-gray-400 font-normal">Resets notification read markers and push permission modals</span>
                  </div>
                  <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmWipeType('full_local')}
                  className="w-full py-2 px-3 bg-white hover:bg-red-100 border border-red-200 rounded-xl text-xs font-bold text-red-700 text-left flex items-center justify-between transition"
                >
                  <div>
                    <span className="block leading-tight">Full Device Clean Reset</span>
                    <span className="text-[10px] text-red-500 font-normal">Wipes all cached app preferences (PIN remains saved)</span>
                  </div>
                  <Trash2 className="w-3.5 h-3.5 text-red-600" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal for Data Wipe */}
      {confirmWipeType && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-xs rounded-3xl p-5 space-y-3.5 shadow-2xl border border-gray-200 text-center">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-gray-900 leading-tight">
                Confirm Data Wipe
              </h3>
              <p className="text-xs text-gray-500 mt-1 leading-snug">
                {confirmWipeType === 'cache' && 'This will remove offline stock counts saved on this device. Cloud items remain safe.'}
                {confirmWipeType === 'notifications' && 'This will reset your local activity read markers.'}
                {confirmWipeType === 'full_local' && 'This will factory reset all local configuration on this phone/computer.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmWipeType(null)}
                className="py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-700 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={wiping}
                onClick={() => executeDataWipe(confirmWipeType)}
                className="py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-bold text-white transition shadow-sm"
              >
                {wiping ? 'Wiping...' : 'Yes, Wipe'}
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