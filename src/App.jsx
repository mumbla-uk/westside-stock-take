import React, { useState } from 'react';
import { 
  ClipboardCheck, 
  BookOpen, 
  Wine, 
  Sparkles, 
  LogOut, 
  ArrowLeft, 
  ChevronRight, 
  Delete,
  Clock
} from 'lucide-react';

// Sub-app imports
import StocktakeApp from './StocktakeApp';
import HandoverApp from './HandoverApp';

const PIN_CODE = "1234";

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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  
  // Navigation State: 'hub' | 'stocktake' | 'handover' | 'spillage' | 'clean'
  const [currentApp, setCurrentApp] = useState('hub');

  // Keypad Handlers
  const handlePinPress = (num) => {
    if (pinInput.length < 4) {
      const newPin = pinInput + num;
      setPinInput(newPin);
      setPinError(false);

      if (newPin.length === 4) {
        if (newPin === PIN_CODE) {
          setTimeout(() => setIsAuthenticated(true), 150);
        } else {
          setTimeout(() => {
            setPinError(true);
            setPinInput('');
          }, 200);
        }
      }
    }
  };

  const handlePinDelete = () => {
    setPinInput(prev => prev.slice(0, -1));
    setPinError(false);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setPinInput('');
    setCurrentApp('hub');
  };

  /* -------------------------------------------------------------------------- */
  /* 1. PIN LOGIN SCREEN                                                       */
  /* -------------------------------------------------------------------------- */
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-screen w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 justify-center items-center px-8">
        <div className="mb-12 flex flex-col items-center justify-center">
          <AppLogo className="w-20 h-20 mb-3" fallbackTextClass="font-serif text-6xl font-bold tracking-tighter" />
          <h1 className="text-xl font-extrabold tracking-tight">West Side Tavern</h1>
          <p className="text-xs text-gray-400 font-mono mt-1">OPERATIONS PORTAL</p>
        </div>

        {/* PIN Indicators */}
        <div className="flex space-x-4 mb-16">
          {[0, 1, 2, 3].map(index => {
            const isFilled = pinInput.length > index;
            return (
              <div
                key={index}
                className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                  pinError ? 'bg-red-500 animate-bounce' : isFilled ? 'bg-gray-800 scale-110' : 'bg-gray-200'
                }`}
              />
            );
          })}
        </div>

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-y-8 gap-x-12 w-full max-w-xs text-center text-2xl font-medium">
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
  /* 2. SUB-APP ROUTING                                                         */
  /* -------------------------------------------------------------------------- */
  if (currentApp === 'stocktake') {
    return <StocktakeApp onBackToHub={() => setCurrentApp('hub')} onLogout={handleLogout} />;
  }

  if (currentApp === 'handover') {
    return <HandoverApp onBackToHub={() => setCurrentApp('hub')} onLogout={handleLogout} />;
  }

  // Placeholder views for Spillage and Clean modules
  if (['spillage', 'clean'].includes(currentApp)) {
    const titles = {
      spillage: 'Spillage Log & Waste',
      clean: 'Weekly Cleaning Matrix'
    };

    return (
      <div className="flex flex-col h-screen w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200">
        <header className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <button 
            onClick={() => setCurrentApp('hub')}
            className="flex items-center space-x-1 text-xs font-bold text-gray-600 hover:text-black"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Hub</span>
          </button>
          <span className="font-extrabold text-sm">{titles[currentApp]}</span>
          <button onClick={handleLogout} className="text-xs font-semibold text-gray-400 hover:text-black">
            Logout
          </button>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <Clock className="w-10 h-10 text-gray-300 mb-3 animate-pulse" />
          <h2 className="text-lg font-bold text-gray-900">{titles[currentApp]}</h2>
          <p className="text-xs text-gray-500 max-w-xs mt-1">
            This module interface is scheduled for deployment.
          </p>
          <button
            onClick={() => setCurrentApp('hub')}
            className="mt-6 px-5 py-2.5 bg-[#EDEDED] rounded-xl text-xs font-bold text-black hover:bg-gray-200 transition"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* 3. MAIN DASHBOARD / HUB MENU                                              */
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
      badge: 'Next',
      badgeColor: 'bg-orange-100 text-orange-900'
    },
    {
      id: 'clean',
      title: 'Weekly Clean',
      subtitle: 'Deep clean schedules, checklist & sign-offs',
      icon: Sparkles,
      badge: 'Next',
      badgeColor: 'bg-purple-100 text-purple-900'
    }
  ];

  return (
    <div className="flex flex-col h-screen w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 overflow-x-hidden">
      
      {/* Top Header */}
      <header className="flex items-center justify-between px-5 pt-6 pb-4 border-b border-gray-50 flex-shrink-0">
        <div className="flex items-center space-x-2.5">
          <AppLogo className="w-7 h-7" fallbackTextClass="font-serif text-2xl font-bold tracking-tighter" />
          <div>
            <span className="font-black text-base tracking-tight block leading-none">West Side Tavern</span>
            <span className="text-[10px] text-gray-400 font-mono tracking-wide uppercase">Operations Suite</span>
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
          <p className="text-gray-400 font-serif italic text-xs">Duty Operations</p>
          <h1 className="text-2xl font-black tracking-tight text-gray-900 mt-0.5">
            Select Module
          </h1>
        </div>

        {/* App Selection Cards */}
        <div className="space-y-3">
          {modules.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => setCurrentApp(m.id)}
                className="w-full text-left p-4 rounded-2xl border border-gray-200 bg-white hover:border-black active:scale-[0.99] transition-all shadow-sm group flex items-center justify-between"
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

                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-black transition-transform group-hover:translate-x-0.5 flex-shrink-0" />
              </button>
            );
          })}
        </div>

      </div>

      {/* Footer Info */}
      <footer className="px-5 py-4 border-t border-gray-100 bg-[#FAFAFA] flex items-center justify-between text-[11px] text-gray-400 font-mono">
        <span>West Side Tavern Staff Portal</span>
        <span>v2.1</span>
      </footer>

    </div>
  );
}