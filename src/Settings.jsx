import React, { useState } from 'react';
import { ArrowLeft, Trash2, Code2, RefreshCw, Database, Terminal, ShieldAlert } from 'lucide-react';
import { useTwoFingerSwipe } from './useTwoFingerSwipe';

export default function Settings({ currentUser, onBackToHub, onLogout }) {
  const [devMode, setDevMode] = useState(() => localStorage.getItem('wst_dev_mode') === 'true');
  const [cacheCleared, setCacheCleared] = useState(false);

  const swipeHandlers = useTwoFingerSwipe({
    onSwipeRight: () => {
      if (onBackToHub) onBackToHub();
    }
  });

  const toggleDevMode = () => {
    const next = !devMode;
    setDevMode(next);
    localStorage.setItem('wst_dev_mode', next ? 'true' : 'false');
  };

  const handleClearCache = () => {
    if (!window.confirm("Clear all local catalog caches, IndexedDB buffers and reload fresh?")) return;
    localStorage.removeItem('wst_catalog_cache');
    localStorage.removeItem('wst_read_activity_ids');
    setCacheCleared(true);
    setTimeout(() => {
      window.location.reload();
    }, 800);
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
            <h1 className="font-extrabold text-base tracking-tight text-gray-900 leading-tight">App Settings</h1>
            <span className="text-[10px] text-gray-400 font-mono block">Diagnostics &amp; System State</span>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 pb-24 touch-pan-y overscroll-contain">
        {cacheCleared && (
          <div className="p-2.5 rounded-xl text-xs font-semibold bg-green-50 text-green-800 border border-green-200">
            Local cache cleared. Reloading app...
          </div>
        )}

        {/* System & Cache Maintenance */}
        <div className="space-y-2">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400 block px-0.5">
            System &amp; Offline Cache
          </span>

          <div className="border border-gray-200 rounded-2xl bg-white divide-y divide-gray-100 overflow-hidden shadow-2xs">
            <div className="p-3.5 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-gray-900 block">Purge Local Storage Cache</span>
                <span className="text-[10px] text-gray-400">Clears offline catalog snapshots and forces fresh Supabase sync</span>
              </div>
              <button
                type="button"
                onClick={handleClearCache}
                className="py-1.5 px-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold transition flex items-center space-x-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Cache</span>
              </button>
            </div>

            <div className="p-3.5 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-gray-900 block">Developer &amp; Debug Mode</span>
                <span className="text-[10px] text-gray-400">Exposes raw database response logs and SQL query profiling</span>
              </div>
              <input
                type="checkbox"
                checked={devMode}
                onChange={toggleDevMode}
                className="w-4 h-4 accent-black cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Environment Diagnostics */}
        <div className="space-y-2">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400 block px-0.5">
            Environment Diagnostics
          </span>

          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3.5 space-y-1.5 font-mono text-[10px] text-gray-600">
            <div className="flex justify-between">
              <span>Client Version:</span>
              <span className="font-bold text-black">v2.4.0-supabase</span>
            </div>
            <div className="flex justify-between">
              <span>Venue ID:</span>
              <span className="font-bold text-black">West Side Tavern (Partick)</span>
            </div>
            <div className="flex justify-between">
              <span>Database Connection:</span>
              <span className="text-emerald-700 font-bold">PostgreSQL Active</span>
            </div>
            <div className="flex justify-between">
              <span>PWA / Touch Engine:</span>
              <span className="text-emerald-700 font-bold">Two-Finger Swipe Active</span>
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