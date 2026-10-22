import React, { useState, useEffect } from 'react';
import { 
  ClipboardCheck, 
  BookOpen, 
  Wine, 
  Sparkles, 
  LogOut, 
  ChevronRight, 
  Delete,
  Loader2
} from 'lucide-react';

import StocktakeApp from './StocktakeApp';
import HandoverApp from './HandoverApp';

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

export default function App() {
  // Read immediately from LocalStorage for zero-wait UI
  const [staffRoster, setStaffRoster] = useState(() => {
    try {
      const c = localStorage.getItem('wst_staff');
      return c ? JSON.parse(c) : [{ pin: '1234', name: 'Ross', role: 'General Manager' }];
    } catch {
      return [{ pin: '1234', name: 'Ross', role: 'General Manager' }];
    }
  });

  const [preloadedCatalog, setPreloadedCatalog] = useState(() => {
    try {
      const c = localStorage.getItem('wst_catalog');
      return c ? JSON.parse(c) : [];
    } catch {
      return [];
    }
  });

  const [preloadedHistory, setPreloadedHistory] = useState(() => {
    try {
      const c = localStorage.getItem('wst_history');
      return c ? JSON.parse(c) : [];
    } catch {
      return [];
    }
  });

  // If local storage has a staff list, don't block user behind a full splash
  const [isAppLoading, setIsAppLoading] = useState(() => {
    return !localStorage.getItem('wst_staff');
  });

  // Auth & Navigation
  const [currentUser, setCurrentUser] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [currentApp, setCurrentApp] = useState('hub');

  // Single Background Data Sync Call
  useEffect(() => {
    let isMounted = true;

    async function syncBundle() {
      try {
        const res = await fetch(`${HARDWIRED_SCRIPT_URL}?action=all`);
        const json = await res.json();
        
        if (isMounted && json && json.status === 'success') {
          if (json.staff && json.staff.length > 0) {
            setStaffRoster(json.staff);
            localStorage.setItem('wst_staff', JSON.stringify(json.staff));
          }
          if (json.catalog && json.catalog.length > 0) {
            setPreloadedCatalog(json.catalog);
            localStorage.setItem('wst_catalog', JSON.stringify(json.catalog));
          }
          if (json.history) {
            setPreloadedHistory(json.history);
            localStorage.setItem('wst_history', JSON.stringify(json.history));
          }
        }
      } catch (err) {
        console.warn("Operating with cached local storage:", err);
      } finally {
        if (isMounted) setIsAppLoading(false);
      }
    }

    syncBundle();

    return () => { isMounted = false; };
  }, []);

  // Keypad Handlers
  const handlePinPress = (num) => {
    if (pinInput.length < 4) {
      const newPin = pinInput + num;
      setPinInput(newPin);
      setPinError(false);

      if (newPin.length === 4) {
        const matched = staffRoster.find(s => s.pin === newPin);
        if (matched) {
          setCurrentUser(matched);
          setTimeout(() => setPinInput(''), 150);
        } else {
          setTimeout(() => {
            setPinError(true);
            setPinInput('');
          }, 250);
        }
      }
    }
  };

  const handlePinDelete = () => {
    setPinInput(prev => prev.slice(0, -1));
    setPinError(false);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setPinInput('');
    setCurrentApp('hub');
  };

  /* 1. NATIVE SPLASH (Only triggers if cache is completely empty) */
  if (isAppLoading) {
    return (
      <div className="flex flex-col h-screen w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 justify-between items-center py-16 px-8 select-none">
        <div className="w-full" />
        <div className="flex flex-col items-center justify-center">
          <div className="p-3 mb-4">
            <AppLogo className="w-24 h-24" fallbackTextClass="font-serif text-7xl font-bold tracking-tighter" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">West Side Tavern</h1>
          <p className="text-[11px] font-mono tracking-widest text-gray-400 uppercase mt-1">
            Operations Suite
          </p>
        </div>
        <div className="flex flex-col items-center space-y-3">
          <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
        </div>
      </div>
    );
  }

  /* 2. PIN LOGIN */
  if (!currentUser) {
    return (
      <div className="flex flex-col h-screen w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 justify-center items-center px-8">
        <div className="mb-10 flex flex-col items-center justify-center">
          <AppLogo className="w-20 h-20 mb-3" fallbackTextClass="font-serif text-6xl font-bold tracking-tighter" />
          <h1 className="text-xl font-extrabold tracking-tight">West Side Tavern</h1>
          <p className="text-xs text-gray-400 font-mono mt-1">STAFF OPERATIONS PORTAL</p>
        </div>

        <div className="flex space-x-4 mb-14">
          {[0, 1, 2, 3].map(index => {
            const isFilled = pinInput.length > index;
            return (
              <div
                key={index}
                className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                  pinError ? 'bg-red-500 animate-bounce' : isFilled ? 'bg-black scale-110' : 'bg-gray-200'
                }`}
              />
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-y-7 gap-x-12 w-full max-w-xs text-center text-2xl font-medium">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button
              key={num}
              onClick={() => handlePinPress(num.toString())}
              className="py-3 hover:bg-gray-50 active:bg-gray-100 rounded-full transition select-none focus:outline-none"
            >
              {num}
            </button>
          ))}
          <div />
          <button
            onClick={() => handlePinPress('0')}
            className="py-3 hover:bg-gray-50 active:bg-gray-100 rounded-full transition select-none focus:outline-none"
          >
            0
          </button>
          <button
            onClick={handlePinDelete}
            className="flex items-center justify-center py-3 text-gray-400 hover:text-gray-900 transition focus:outline-none"
          >
            <Delete className="w-6 h-6" />
          </button>
        </div>
      </div>
    );
  }

  /* 3. SUB-APP ROUTING */
  if (currentApp === 'stocktake') {
    return (
      <StocktakeApp 
        currentUser={currentUser} 
        initialCatalog={preloadedCatalog}
        onBackToHub={() => setCurrentApp('hub')} 
        onLogout={handleLogout} 
      />
    );
  }

  if (currentApp === 'handover') {
    return (
      <HandoverApp 
        currentUser={currentUser} 
        initialCatalog={preloadedCatalog}
        initialHistory={preloadedHistory}
        onBackToHub={() => setCurrentApp('hub')} 
        onLogout={handleLogout} 
      />
    );
  }

  /* 4. MAIN HUB */
  const modules = [
    {
      id: 'stocktake',
      title: 'Stocktake & Orders',
      subtitle: 'Inventory counts, live deficits & goods intake',
      icon: ClipboardCheck,
      badge: 'Active',
      badgeColor: 'bg-[#C2F19D] text-gray-900'
    },
    {
      id: 'handover',
      title: 'Handover Diary',
      subtitle: 'Shift reckonings, notes, 86 list & next-day prep',
      icon: BookOpen,
      badge: 'Active',
      badgeColor: 'bg-[#C2F19D] text-gray-900'
    },
    {
      id: 'spillage',
      title: 'Spillage Log',
      subtitle: 'Draft line cleans, customer drops & bottle breakages',
      icon: Wine,
      badge: 'Upcoming',
      badgeColor: 'bg-orange-100 text-orange-900'
    },
    {
      id: 'clean',
      title: 'Weekly Clean',
      subtitle: 'Deep clean schedules, checklist & sign-offs',
      icon: Sparkles,
      badge: 'Upcoming',
      badgeColor: 'bg-purple-100 text-purple-900'
    }
  ];

  return (
    <div className="flex flex-col h-screen w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 overflow-x-hidden">
      <header className="flex items-center justify-between px-5 pt-6 pb-4 border-b border-gray-50 flex-shrink-0">
        <div className="flex items-center space-x-2.5">
          <AppLogo className="w-7 h-7" fallbackTextClass="font-serif text-2xl font-bold tracking-tighter" />
          <div>
            <span className="font-black text-base tracking-tight block leading-none">West Side Tavern</span>
            <div className="flex items-center space-x-1.5 mt-0.5">
              <span className="text-[10px] text-gray-500 font-bold">{currentUser.name}</span>
              <span className="text-[9px] font-mono bg-gray-100 text-gray-600 px-1 rounded">
                {currentUser.role}
              </span>
            </div>
          </div>
        </div>

        <button 
          onClick={handleLogout}
          className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-gray-500 hover:text-black hover:bg-gray-100 transition"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Exit</span>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
        <div>
          <p className="text-gray-400 font-serif italic text-xs">Logged in as {currentUser.role}</p>
          <h1 className="text-2xl font-black tracking-tight text-gray-900 mt-0.5">
            Select Module
          </h1>
        </div>

        <div className="space-y-3">
          {modules.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => {
                  if (m.id === 'stocktake' || m.id === 'handover') setCurrentApp(m.id);
                }}
                className={`w-full text-left p-4 rounded-2xl border transition-all shadow-sm group flex items-center justify-between ${
                  m.badge === 'Active' 
                    ? 'border-gray-200 bg-white hover:border-black active:scale-[0.99] cursor-pointer' 
                    : 'border-gray-100 bg-gray-50/60 opacity-60 cursor-not-allowed'
                }`}
              >
                <div className="flex items-start space-x-3.5">
                  <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100 group-hover:bg-black group-hover:text-white transition-colors">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-extrabold text-sm text-gray-900 block leading-tight">
                        {m.title}
                      </span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${m.badgeColor}`}>
                        {m.badge}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 leading-snug pr-4">
                      {m.subtitle}
                    </p>
                  </div>
                </div>

                {m.badge === 'Active' && (
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-black transition-transform group-hover:translate-x-0.5 flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <footer className="px-5 py-4 border-t border-gray-100 bg-[#FAFAFA] flex items-center justify-between text-[11px] text-gray-400 font-mono">
        <span>West Side Tavern Staff Portal</span>
        <span>v2.5</span>
      </footer>
    </div>
  );
}