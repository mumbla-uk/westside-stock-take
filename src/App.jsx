import React, { useState, useEffect, useRef } from 'react';
import HandoverApp from './HandoverApp';
import PettyCashApp from './PettyCashApp';
import GoodsReceivedApp from './GoodsReceivedApp';
import OrderListsApp from './OrderListsApp';
import { 
  BookOpen, 
  Coins, 
  Truck, 
  ClipboardList, 
  LogOut, 
  ChevronRight, 
  Delete, 
  Bell 
} from 'lucide-react';
import { useTwoFingerSwipe } from './useTwoFingerSwipe';
import { supabase, DEFAULT_VENUE_ID } from './lib/db';
import { sendPushNotification } from './lib/notifications';

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
  const [activeModule, setActiveModule] = useState('hub');
  const [deepLinkData, setDeepLinkData] = useState(null);

  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const cached = localStorage.getItem('wst_auth_user');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  const [pinDigits, setPinDigits] = useState('');
  const [authError, setAuthError] = useState(false);
  const pinRef = useRef('');
  const isCheckingRef = useRef(false);

  const [pushEnabled, setPushEnabled] = useState(false);
  const [showFirstOpenPushModal, setShowFirstOpenPushModal] = useState(false);

  const swipeHandlers = useTwoFingerSwipe({
    disabled: activeModule === 'hub' || showFirstOpenPushModal,
    onSwipeRight: () => {
      setDeepLinkData(null);
      setActiveModule('hub');
    }
  });

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const mod = params.get('module');
      const entryId = params.get('entryId');

      if (mod) {
        setActiveModule(mod);
        setDeepLinkData({ module: mod, entryId: entryId || '' });
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (err) {
      console.warn("Could not parse launch query params:", err);
    }
  }, []);

  useEffect(() => {
    if (!currentUser || !window.OneSignalDeferred) return;

    const hasPrompted = localStorage.getItem('wst_push_prompted');
    window.OneSignalDeferred.push(async function(OneSignal) {
      if (typeof OneSignal.login === 'function') {
        await OneSignal.login(currentUser.name.trim());
      }
      if (OneSignal.User?.addTag) {
        await OneSignal.User.addTag("role", currentUser.role);
      }

      const isOptedIn = await OneSignal.User?.PushSubscription?.optedIn;
      setPushEnabled(Boolean(isOptedIn));

      if (!isOptedIn && !hasPrompted) {
        setShowFirstOpenPushModal(true);
      }
    });
  }, [currentUser]);

  const triggerPushNotification = async ({ title, message, targetManager = null }) => {
    sendPushNotification(title, message, targetManager, { module: activeModule });
  };

  const handleEnablePushFromModal = async () => {
    localStorage.setItem('wst_push_prompted', 'true');
    setShowFirstOpenPushModal(false);
    if (!window.OneSignalDeferred) return;

    window.OneSignalDeferred.push(async function(OneSignal) {
      try {
        await OneSignal.User.PushSubscription.optIn();
        if (currentUser) {
          await OneSignal.login(currentUser.name.trim());
          await OneSignal.User.addTag("role", currentUser.role);
        }
        setPushEnabled(true);
      } catch (err) {
        console.warn("Push permission error or denied:", err);
      }
    });
  };

  const handleDismissFirstOpenPushModal = () => {
    localStorage.setItem('wst_push_prompted', 'true');
    setShowFirstOpenPushModal(false);
  };

  // Secure PIN verification: checks database function or offline fallback
  const verifyPin = async (enteredPin) => {
    isCheckingRef.current = true;

    // Hardcoded AGM emergency fallback
    if (enteredPin === '1234') {
      const fallbackUser = { name: 'Ross', role: 'General Manager' };
      setCurrentUser(fallbackUser);
      localStorage.setItem('wst_auth_user', JSON.stringify(fallbackUser));
      pinRef.current = '';
      setPinDigits('');
      setAuthError(false);
      isCheckingRef.current = false;
      return;
    }

    try {
      const { data, error } = await supabase.rpc('verify_staff_pin', {
        entered_pin: enteredPin,
        target_venue: DEFAULT_VENUE_ID
      });

      if (!error && data && data.length > 0) {
        const verifiedUser = data[0];
        setCurrentUser(verifiedUser);
        localStorage.setItem('wst_auth_user', JSON.stringify(verifiedUser));
        pinRef.current = '';
        setPinDigits('');
        setAuthError(false);
        isCheckingRef.current = false;
        return;
      }
    } catch (err) {
      console.warn("RPC auth check failed, verifying fallback cache:", err);
    }

    // Auth failed
    setAuthError(true);
    setTimeout(() => {
      pinRef.current = '';
      setPinDigits('');
      setAuthError(false);
      isCheckingRef.current = false;
    }, 700);
  };

  const handleKeypadPress = (val) => {
    if (isCheckingRef.current || authError) return;
    if (pinRef.current.length >= 4) return;

    const nextPin = pinRef.current + String(val);
    pinRef.current = nextPin;
    setPinDigits(nextPin);

    if (nextPin.length === 4) {
      verifyPin(nextPin);
    }
  };

  const handleBackspace = () => {
    if (isCheckingRef.current || authError) return;
    const nextPin = pinRef.current.slice(0, -1);
    pinRef.current = nextPin;
    setPinDigits(nextPin);
    setAuthError(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('wst_auth_user');
    if (window.OneSignalDeferred) {
      window.OneSignalDeferred.push(async function(OneSignal) {
        if (typeof OneSignal.logout === 'function') await OneSignal.logout();
      });
    }
    setCurrentUser(null);
    pinRef.current = '';
    setPinDigits('');
    isCheckingRef.current = false;
    setDeepLinkData(null);
    setActiveModule('hub');
  };

  if (!currentUser) {
    return (
      <div className="flex flex-col h-screen w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 justify-between px-8 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] select-none">
        <div className="text-center space-y-3 pt-4">
          <div className="w-14 h-14 bg-black rounded-3xl mx-auto flex items-center justify-center shadow-lg">
            <AppLogo className="w-8 h-8 invert" fallbackTextClass="font-serif text-2xl font-bold text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-gray-900">West Side Tavern</h1>
            <p className="text-xs text-gray-400 font-serif italic mt-0.5">Manager Operations Portal</p>
          </div>
        </div>

        <div className="py-2 text-center space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            Enter 4-Digit Passcode
          </p>
          
          <div className={`flex justify-center items-center space-x-4 ${authError ? 'animate-bounce' : ''}`}>
            {[0, 1, 2, 3].map((idx) => {
              const isFilled = pinDigits.length > idx;
              return (
                <div
                  key={idx}
                  className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                    authError 
                      ? 'bg-red-500 scale-110'
                      : isFilled
                      ? 'bg-black scale-110'
                      : 'bg-gray-200'
                  }`}
                />
              );
            })}
          </div>

          <div className="h-4">
            {authError && (
              <p className="text-[11px] text-red-600 font-bold">Incorrect PIN. Try again.</p>
            )}
          </div>
        </div>

        <div className="w-full max-w-xs mx-auto pb-4">
          <div className="grid grid-cols-3 gap-y-3 gap-x-6 text-center">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleKeypadPress(num)}
                className="w-16 h-16 rounded-full bg-gray-50 hover:bg-gray-100 active:bg-gray-200 text-xl font-black text-gray-900 mx-auto flex items-center justify-center transition active:scale-95 shadow-sm border border-gray-100"
              >
                {num}
              </button>
            ))}

            <button
              type="button"
              onClick={() => {
                if (isCheckingRef.current || authError) return;
                pinRef.current = '';
                setPinDigits('');
                setAuthError(false);
              }}
              className="w-16 h-16 rounded-full text-xs font-bold text-gray-400 hover:text-black mx-auto flex items-center justify-center transition active:scale-95"
            >
              Clear
            </button>

            <button
              type="button"
              onClick={() => handleKeypadPress('0')}
              className="w-16 h-16 rounded-full bg-gray-50 hover:bg-gray-100 active:bg-gray-200 text-xl font-black text-gray-900 mx-auto flex items-center justify-center transition active:scale-95 shadow-sm border border-gray-100"
            >
              0
            </button>

            <button
              type="button"
              onClick={handleBackspace}
              disabled={pinDigits.length === 0}
              className="w-16 h-16 rounded-full text-gray-500 hover:text-black active:scale-95 disabled:opacity-20 mx-auto flex items-center justify-center transition"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (activeModule === 'handover') {
    return (
      <div {...swipeHandlers} className="h-screen w-full">
        <HandoverApp
          currentUser={currentUser}
          initialDeepLink={deepLinkData}
          onClearDeepLink={() => setDeepLinkData(null)}
          onBackToHub={() => {
            setDeepLinkData(null);
            setActiveModule('hub');
          }}
          onLogout={handleLogout}
          onSendNotification={triggerPushNotification}
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
          onSendNotification={triggerPushNotification}
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
          onSendNotification={triggerPushNotification}
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
          onSendNotification={triggerPushNotification}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 overflow-hidden relative">
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

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Management Tools</p>
        </div>

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

        <div 
          onClick={() => setActiveModule('orders')}
          className="border border-gray-200 rounded-2xl p-4 bg-white shadow-sm hover:border-black transition cursor-pointer flex items-center justify-between group active:scale-[0.99]"
        >
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-900 flex items-center justify-center flex-shrink-0">
              <ClipboardList className="w-5 h-5 text-neutral-800" />
            </div>
            <div>
              <span className="font-extrabold text-sm text-gray-900 group-hover:text-black block">Stocktake & Orders</span>
              <span className="text-[10px] text-gray-500 font-sans block">Count stock, par-level math & supplier order lists</span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400 group-hover:translate-x-0.5 transition-transform" />
        </div>

        <div className="pt-6 text-center text-[10px] text-gray-400 font-mono space-y-1">
          <p>Two-finger swipe right returns to this Hub from any module.</p>
          <p className="opacity-70">PWA v2.4 • Standalone iOS Keypad Active</p>
        </div>
      </div>
    </div>
  );
}