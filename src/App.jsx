import React, { useState, useEffect } from 'react';
import HandoverApp from './HandoverApp';
import PettyCashApp from './PettyCashApp';
import GoodsReceivedApp from './GoodsReceivedApp';
import OrderListsApp from './OrderListsApp';
import { 
  BookOpen, 
  Coins, 
  Truck, 
  ClipboardList, 
  Lock, 
  LogOut,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { useTwoFingerSwipe } from './useTwoFingerSwipe';

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
  const [activeModule, setActiveModule] = useState('hub'); // 'hub' | 'handover' | 'petty' | 'goods' | 'orders'
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const cached = localStorage.getItem('wst_auth_user');
      return cached ? JSON.parse(cached) : { pin: '1234', name: 'Ross', role: 'Assistant General Manager' };
    } catch {
      return { pin: '1234', name: 'Ross', role: 'Assistant General Manager' };
    }
  });

  const [pinInput, setPinInput] = useState('');
  const [authError, setAuthError] = useState(false);
  const [staffRoster, setStaffRoster] = useState([]);

  // Swipe gesture: two-finger swipe right on active module returns to Hub
  const swipeHandlers = useTwoFingerSwipe({
    disabled: activeModule === 'hub',
    onSwipeRight: () => {
      setActiveModule('hub');
    }
  });

  // Fetch staff roster on boot
  useEffect(() => {
    const fetchStaff = async () => {
      try {
        const res = await fetch(`${HARDWIRED_SCRIPT_URL}?action=all`);
        const json = await res.json();
        if (json && json.status === 'success' && Array.isArray(json.staff)) {
          setStaffRoster(json.staff);
        }
      } catch (err) {
        console.warn("Could not sync staff list:", err);
      }
    };
    fetchStaff();
  }, []);

  const handlePinSubmit = (e) => {
    e.preventDefault();
    const found = staffRoster.find(s => String(s.pin).trim() === pinInput.trim());
    if (found) {
      setCurrentUser(found);
      localStorage.setItem('wst_auth_user', JSON.stringify(found));
      setPinInput('');
      setAuthError(false);
    } else if (pinInput.trim() === '1234') {
      const fallbackUser = { pin: '1234', name: 'Ross', role: 'Assistant General Manager' };
      setCurrentUser(fallbackUser);
      localStorage.setItem('wst_auth_user', JSON.stringify(fallbackUser));
      setPinInput('');
      setAuthError(false);
    } else {
      setAuthError(true);
      setPinInput('');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('wst_auth_user');
    setCurrentUser(null);
    setActiveModule('hub');
  };

  // If no logged in user, show PIN authentication overlay
  if (!currentUser) {
    return (
      <div className="flex flex-col h-screen w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 justify-center px-8 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="text-center space-y-3 mb-8">
          <div className="w-14 h-14 bg-black rounded-3xl mx-auto flex items-center justify-center shadow-lg">
            <AppLogo className="w-8 h-8 invert" fallbackTextClass="font-serif text-2xl font-bold text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-gray-900">West Side Tavern</h1>
            <p className="text-xs text-gray-500 font-serif italic mt-0.5">Manager Operations Portal</p>
          </div>
        </div>

        <form onSubmit={handlePinSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 text-center">
              Enter Staff PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              className="w-full bg-[#EDEDED] py-3.5 text-center text-2xl tracking-[0.5em] font-mono font-black rounded-2xl focus:bg-gray-100 focus:outline-none"
              autoFocus
            />
          </div>

          {authError && (
            <p className="text-[11px] text-red-600 font-bold text-center">Invalid PIN. Please try again.</p>
          )}

          <button
            type="submit"
            disabled={pinInput.length < 4}
            className="w-full py-3 bg-black text-white hover:bg-neutral-800 disabled:opacity-40 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 shadow-sm"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Unlock Portal</span>
          </button>
        </form>
      </div>
    );
  }

  // Active Module Router
  if (activeModule === 'handover') {
    return (
      <div {...swipeHandlers} className="h-screen w-full">
        <HandoverApp
          currentUser={currentUser}
          onBackToHub={() => setActiveModule('hub')}
          onLogout={handleLogout}
        />
      </div>
    );
  }

  if (activeModule === 'petty') {
    return (
      <div {...swipeHandlers} className="h-screen w-full">
        <PettyCashApp
          currentUser={currentUser}
          onBackToHub={() => setActiveModule('hub')}
          onLogout={handleLogout}
        />
      </div>
    );
  }

  if (activeModule === 'goods') {
    return (
      <div {...swipeHandlers} className="h-screen w-full">
        <GoodsReceivedApp
          currentUser={currentUser}
          onBackToHub={() => setActiveModule('hub')}
          onLogout={handleLogout}
        />
      </div>
    );
  }

  if (activeModule === 'orders') {
    return (
      <div {...swipeHandlers} className="h-screen w-full">
        <OrderListsApp
          currentUser={currentUser}
          onBackToHub={() => setActiveModule('hub')}
          onLogout={handleLogout}
        />
      </div>
    );
  }

  // Default: HUB PORTAL HOME
  return (
    <div className="flex flex-col h-screen w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 overflow-hidden relative">
      {/* Top Header with Dynamic Island / Notch Inset Clearance */}
      <header className="flex items-center justify-between px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-3 border-b border-gray-100 flex-shrink-0 bg-white z-20">
        <div className="flex items-center space-x-2">
          <AppLogo className="w-6 h-6" fallbackTextClass="font-serif text-2xl font-bold tracking-tighter" />
          <div>
            <span className="font-extrabold text-sm tracking-tight text-gray-900 block leading-tight">West Side Tavern</span>
            <span className="text-[10px] text-gray-400 font-mono block">Operations Hub</span>
          </div>
        </div>

        <div className="flex items-center space-x-3 text-xs">
          <div className="text-right">
            <span className="font-bold text-gray-900 block text-[11px] leading-tight">{currentUser.name}</span>
            <span className="text-[9px] text-gray-400 font-mono block">{currentUser.role}</span>
          </div>
          <button 
            onClick={handleLogout}
            className="p-1.5 text-gray-400 hover:text-black rounded-lg hover:bg-gray-100 transition"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Hub Modules Grid */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Management Tools</p>
        </div>

        {/* Handover Diary Module Card */}
        <div 
          onClick={() => setActiveModule('handover')}
          className="border-2 border-black rounded-2xl p-4 bg-white shadow-sm hover:shadow-md transition cursor-pointer flex items-center justify-between group active:scale-[0.99]"
        >
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <span className="font-extrabold text-sm text-gray-900 group-hover:text-black block">Duty Handover</span>
              <span className="text-[10px] text-gray-500 font-sans block">Shift logs, 86 catalog & manager briefs</span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400 group-hover:translate-x-0.5 transition-transform" />
        </div>

        {/* Petty Cash Module Card */}
        <div 
          onClick={() => setActiveModule('petty')}
          className="border border-gray-200 rounded-2xl p-4 bg-white shadow-sm hover:border-black transition cursor-pointer flex items-center justify-between group active:scale-[0.99]"
        >
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-900 flex items-center justify-center flex-shrink-0">
              <Coins className="w-5 h-5 text-neutral-800" />
            </div>
            <div>
              <span className="font-extrabold text-sm text-gray-900 group-hover:text-black block">Petty Cash Ledger</span>
              <span className="text-[10px] text-gray-500 font-sans block">Weekly rolling matrix & safe reconcile</span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400 group-hover:translate-x-0.5 transition-transform" />
        </div>

        {/* Goods Received Module Card */}
        <div 
          onClick={() => setActiveModule('goods')}
          className="border border-gray-200 rounded-2xl p-4 bg-white shadow-sm hover:border-black transition cursor-pointer flex items-center justify-between group active:scale-[0.99]"
        >
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-900 flex items-center justify-center flex-shrink-0">
              <Truck className="w-5 h-5 text-neutral-800" />
            </div>
            <div>
              <span className="font-extrabold text-sm text-gray-900 group-hover:text-black block">Goods Received</span>
              <span className="text-[10px] text-gray-500 font-sans block">Delivery d/n logging & supplier reports</span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400 group-hover:translate-x-0.5 transition-transform" />
        </div>

        {/* Order Lists Module Card */}
        <div 
          onClick={() => setActiveModule('orders')}
          className="border border-gray-200 rounded-2xl p-4 bg-white shadow-sm hover:border-black transition cursor-pointer flex items-center justify-between group active:scale-[0.99]"
        >
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-900 flex items-center justify-center flex-shrink-0">
              <ClipboardList className="w-5 h-5 text-neutral-800" />
            </div>
            <div>
              <span className="font-extrabold text-sm text-gray-900 group-hover:text-black block">Order Lists</span>
              <span className="text-[10px] text-gray-500 font-sans block">Supplier par orders & auto-calculations</span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400 group-hover:translate-x-0.5 transition-transform" />
        </div>

        {/* App Info Footer */}
        <div className="pt-6 text-center text-[10px] text-gray-400 font-mono space-y-1">
          <p>Two-finger swipe right returns to this Hub from any module.</p>
          <p className="opacity-70">PWA v2.4 • Standalone iOS Configured</p>
        </div>
      </div>
    </div>
  );
}