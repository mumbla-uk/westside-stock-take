import React, { useState, useEffect } from 'react';
import { 
  ClipboardCheck, 
  BookOpen, 
  Wine, 
  Sparkles, 
  LogOut, 
  ArrowLeft, 
  ChevronRight, 
  Delete,
  Clock,
  ShieldCheck
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

const BOOT_QUIPS = [
  "Connecting to staff roster...",
  "Syncing role permissions...",
  "Verifying duty manager PINs...",
  "Priming operations hub...",
  "Ready for service..."
];

export default function App() {
  // Pre-loader State
  const [isInitializing, setIsInitializing] = useState(true);
  const [initProgress, setInitProgress] = useState(15);
  const [quipIndex, setQuipIndex] = useState(0);

  // Authentication & Roster State
  const [staffRoster, setStaffRoster] = useState([
    { pin: '1234', name: 'Ross', role: 'General Manager' }
  ]);
  const [currentUser, setCurrentUser] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  
  // Navigation State: 'hub' | 'stocktake' | 'handover'
  const [currentApp, setCurrentApp] = useState('hub');

  // Cycle playful startup hints while initializing
  useEffect(() => {
    if (!isInitializing) return;
    const interval = setInterval(() => {
      setQuipIndex((prev) => (prev + 1) % BOOT_QUIPS.length);
    }, 1400);
    return () => clearInterval(interval);
  }, [isInitializing]);

  // Initial gateway fetch: load staff roster before rendering PIN keypad
  useEffect(() => {
    let isMounted = true;
    
    // Staged progress jumps to maintain user engagement on slower mobile connections
    const t1 = setTimeout(() => setInitProgress(48), 350);
    const t2 = setTimeout(() => setInitProgress(78), 900);

    async function bootstrapStaff() {
      try {
        const res = await fetch(`${HARDWIRED_SCRIPT_URL}?action=get_staff`);
        const json = await res.json();
        
        if (isMounted) {
          clearTimeout(t1);
          clearTimeout(t2);
          setInitProgress(95);

          if (json.status === 'success' && Array.isArray(json.data) && json.data.length > 0) {
            setStaffRoster(json.data);
          }
          setInitProgress(100);
          setTimeout(() => setIsInitializing(false), 250);
        }
      } catch (err) {
        console.error("Staff roster bootstrap failed, using local offline credentials:", err);
        if (isMounted) {
          clearTimeout(t1);
          clearTimeout(t2);
          setInitProgress(100);
          setTimeout(() => setIsInitializing(false), 300);
        }
      }
    }

    bootstrapStaff();

    return () => {
      isMounted = false;
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // Keypad Handlers with instantaneous in-memory validation
  const handlePinPress = (num) => {
    if (pinInput.length < 4) {
      const newPin = pinInput + num;
      setPinInput(newPin);
      setPinError(false);

      if (newPin.length === 4) {
        const matchedStaff = staffRoster.find(s => s.pin === newPin);
        if (matchedStaff) {
          setCurrentUser(matchedStaff);
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

  /* -------------------------------------------------------------------------- */
  /* 1. ANIMATED GATEWAY PRE-LOADER (MOBILE-OPTIMIZED)                          */
  /* -------------------------------------------------------------------------- */
  if (isInitializing) {
    return (
      <div className="flex flex-col h-screen w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 justify-center items-center px-8 relative overflow-hidden select-none">
        
        {/* Soft background ambient glow */}
        <div className="absolute w-72 h-72 rounded-full bg-neutral-100 blur-3xl pointer-events-none -top-10" />

        {/* Brand Monogram */}
        <div className="mb-8 relative flex flex-col items-center">
          <div className="p-4 rounded-3xl bg-neutral-50 border border-neutral-100 shadow-sm mb-3">
            <AppLogo className="w-14 h-14" fallbackTextClass="font-serif text-5xl font-black tracking-tighter" />
          </div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">West Side Tavern</span>
        </div>

        {/* Glassmorphic Progress Container */}
        <div className="w-full max-w-xs bg-neutral-50/80 backdrop-blur border border-neutral-200/80 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-bold tracking-tight text-neutral-900">Connecting...</span>
            </div>
            <span className="font-mono text-[11px] font-bold text-neutral-500">
              {Math.round(initProgress)}%
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-neutral-200/70 h-2 rounded-full overflow-hidden p-0.5">
            <div 
              className="bg-black h-full rounded-full transition-all duration-300 ease-out shadow-sm"
              style={{ width: `${initProgress}%` }}
            />
          </div>

          {/* Cycling status quip */}
          <div className="min-h-[26px] flex items-center justify-center text-center">
            <p className="text-[11px] font-medium text-neutral-500 italic transition-opacity duration-300">
              {BOOT_QUIPS[quipIndex]}
            </p>
          </div>
        </div>

        <p className="text-[10px] text-neutral-400 font-mono mt-8">Operations Portal Gateway</p>
      </div>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* 2. ROLE-BASED PIN LOGIN SCREEN                                            */
  /* -------------------------------------------------------------------------- */
  if (!currentUser) {
    return (
      <div className="flex flex-col h-screen w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 justify-center items-center px-8">
        <div className="mb-10 flex flex-col items-center justify-center">
          <AppLogo className="w-20 h-20 mb-3" fallbackTextClass="font-serif text-6xl font-bold tracking-tighter" />
          <h1 className="text-xl font-extrabold tracking-tight">West Side Tavern</h1>
          <p className="text-xs text-gray-400 font-mono mt-1">STAFF OPERATIONS PORTAL</p>
        </div>

        {/* PIN Indicators */}
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

        {/* Numeric Keypad */}
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

  /* -------------------------------------------------------------------------- */
  /* 3. SUB-APP ROUTING                                                         */
  /* -------------------------------------------------------------------------- */
  if (currentApp === 'stocktake') {
    return <StocktakeApp currentUser={currentUser} onBackToHub={() => setCurrentApp('hub')} onLogout={handleLogout} />;
  }

  if (currentApp === 'handover') {
    return <HandoverApp currentUser={currentUser} onBackToHub={() => setCurrentApp('hub')} onLogout={handleLogout} />;
  }

  /* -------------------------------------------------------------------------- */
  /* 4. MAIN DASHBOARD / HUB MENU                                              */
  /* -------------------------------------------------------------------------- */
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
      
      {/* Top Header with Active Role Badge */}
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

      {/* Main Content Area */}
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
        <span>v2.3</span>
      </footer>
    </div>
  );
}