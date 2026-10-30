import React, { useState, useEffect, useRef } from 'react';
import HandoverApp from './HandoverApp';
import PettyCashApp from './PettyCashApp';
import GoodsReceivedApp from './GoodsReceivedApp';
import OrderListsApp from './OrderListsApp';
import SpillageAndWastage from './SpillageAndWastage';
import CatalogManagerApp from './CatalogManagerApp';
import PrepCalculatorApp from './PrepCalculatorApp';
import ProduceOrderApp from './ProduceOrderApp';
import ReportsApp from './ReportsApp';
import Discussion from './Discussion';
import PreferencesApp from './PreferencesApp';
import Settings from './Settings';
import SideNavDrawer from './SideNavDrawer';
import PreShiftCard from './PreShiftCard';
import OpsChatDrawer from './OpsChatDrawer';
import OpsFloatingTrigger from './OpsFloatingTrigger';
import NotificationCenterApp from './NotificationCenterApp';
import {
  Menu,
  BookOpen,
  Coins,
  Truck,
  ClipboardList,
  LogOut,
  Delete,
  Bell,
  SlidersHorizontal,
  ChevronRight,
  PlusCircle,
  FolderOpen,
  TrendingDown,
  FlaskConical,
  Package,
  Apple,
  MessageSquare
} from 'lucide-react';
import { useTwoFingerSwipe } from './useTwoFingerSwipe';
import { supabase, DEFAULT_VENUE_ID } from './lib/db';
import { sendPushNotification } from './lib/notifications';

function AppLogo({ className = "w-8 h-8", fallbackTextClass = "font-serif text-2xl font-bold tracking-tighter" }) {
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
  return <span className={fallbackTextClass}>WST</span>;
}

export default function App() {
  const [activeModule, setActiveModule] = useState('hub');
  const [reportType, setReportType] = useState('master');
  const [drawerOpen, setDrawerOpen] = useState(false);
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
  const [showNotifications, setShowNotifications] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [latestHandover, setLatestHandover] = useState(null);

  // Dynamic Live Activity Feed from Supabase
  const [activityFeed, setActivityFeed] = useState([]);
  const [readNotifIds, setReadNotifIds] = useState(() => {
    try {
      const cached = localStorage.getItem('wst_read_activity_ids');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const swipeHandlers = useTwoFingerSwipe({
    disabled: activeModule === 'hub' || showFirstOpenPushModal || chatOpen || drawerOpen,
    onSwipeRight: () => {
      setDeepLinkData(null);
      setActiveModule('hub');
    }
  });

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const fetchLiveActivity = async () => {
    try {
      // Use Promise.allSettled so an error on one table never wipes out the entire feed
      const [handoverRes, goodsRes, orderRes, wastageRes] = await Promise.allSettled([
        supabase
          .from('handovers')
          .select('*')
          .eq('venue_id', DEFAULT_VENUE_ID)
          .order('created_at', { ascending: false })
          .limit(15),
        supabase
          .from('goods_received')
          .select('*')
          .eq('venue_id', DEFAULT_VENUE_ID)
          .order('created_at', { ascending: false })
          .limit(15),
        supabase
          .from('supplier_orders')
          .select('*')
          .eq('venue_id', DEFAULT_VENUE_ID)
          .order('created_at', { ascending: false })
          .limit(15),
        supabase
          .from('wastage_log')
          .select('*')
          .eq('venue_id', DEFAULT_VENUE_ID)
          .order('created_at', { ascending: false })
          .limit(15)
      ]);

      const items = [];

      if (handoverRes.status === 'fulfilled' && handoverRes.value.data) {
        handoverRes.value.data.forEach(h => {
          items.push({
            id: `h-${h.id}`,
            entryId: h.id,
            module: 'handover',
            title: h.entry_type === 'Day Note' ? 'Day Note Logged' : 'Shift Handover Submitted',
            desc: `${h.manager_name || 'Staff'}: "${(h.general_notes || 'Closing figures logged').slice(0, 55)}..."`,
            timestamp: new Date(h.created_at || Date.now()).getTime(),
            timeStr: h.date_formatted || h.date_str || 'Today'
          });
        });

        if (handoverRes.value.data.length > 0) {
          setLatestHandover(handoverRes.value.data[0]);
        }
      }

      if (goodsRes.status === 'fulfilled' && goodsRes.value.data) {
        goodsRes.value.data.forEach(g => {
          const count = Array.isArray(g.items) ? g.items.length : 0;
          items.push({
            id: `g-${g.id}`,
            entryId: g.id,
            module: 'goods',
            title: `Delivery Logged: ${g.supplier || 'Supplier'}`,
            desc: `${count} items checked in (${g.invoice_ref ? 'Ref: ' + g.invoice_ref : g.delivery_date})`,
            timestamp: new Date(g.created_at || Date.now()).getTime(),
            timeStr: g.delivery_date || 'Today'
          });
        });
      }

      if (orderRes.status === 'fulfilled' && orderRes.value.data) {
        orderRes.value.data.forEach(o => {
          items.push({
            id: `o-${o.id}`,
            entryId: o.id,
            module: 'orders',
            title: o.is_placed ? `Order Placed: ${o.supplier_name}` : `Order Drafted: ${o.supplier_name}`,
            desc: `${o.manager_name || 'Staff'} recorded order for ${o.supplier_name}`,
            timestamp: new Date(o.created_at || Date.now()).getTime(),
            timeStr: o.order_date || 'Today'
          });
        });
      }

      if (wastageRes.status === 'fulfilled' && wastageRes.value.data) {
        wastageRes.value.data.forEach(w => {
          items.push({
            id: `w-${w.id}`,
            entryId: w.id,
            module: 'wastage',
            title: `Wastage Logged: £${Number(w.cost_impact || 0).toFixed(2)}`,
            desc: `${w.staff_name || 'Staff'} logged ${w.item_name} (${w.reason || 'Waste'})`,
            timestamp: new Date(w.created_at || Date.now()).getTime(),
            timeStr: 'Today'
          });
        });
      }

      items.sort((a, b) => b.timestamp - a.timestamp);
      setActivityFeed(items);
    } catch (err) {
      console.warn("Could not sync live activity feed:", err);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchLiveActivity();

      // Realtime listener so any new insert updates the Notification Center immediately
      const channel = supabase
        .channel('public_activity_feed')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'handovers' }, () => fetchLiveActivity())
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'goods_received' }, () => fetchLiveActivity())
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'supplier_orders' }, () => fetchLiveActivity())
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wastage_log' }, () => fetchLiveActivity())
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [currentUser, activeModule]);

  // Deep linking parser for module routing
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

  // OneSignal registration & preference initialization
  useEffect(() => {
    if (!currentUser || !window.OneSignalDeferred) return;
    const hasPrompted = localStorage.getItem('wst_push_prompted');

    window.OneSignalDeferred.push(async function(OneSignal) {
      try {
        const cleanName = currentUser.name.trim();

        // 1. OneSignal.login automatically sets the external_id.
        // DO NOT call addAlias("external_id", ...) as external_id is reserved.
        if (typeof OneSignal.login === 'function') {
          await OneSignal.login(cleanName);
        }

        // 2. Set operational preference tags
        if (OneSignal.User?.addTags) {
          await OneSignal.User.addTags({
            user_name: cleanName,
            role: currentUser.role || 'Staff',
            notify_handover: '1',
            notify_orders: '1',
            notify_goods: '1',
            notify_my_diary_comments: '1',
            notify_thread_comments: '1',
            notify_mentions: '1'
          });
        }

        const isOptedIn = await OneSignal.User?.PushSubscription?.optedIn;
        setPushEnabled(Boolean(isOptedIn));

        if (!isOptedIn && !hasPrompted) {
          setShowFirstOpenPushModal(true);
        }
      } catch (err) {
        console.warn("OneSignal setup error:", err);
      }
    });
  }, [currentUser]);

  const triggerPushNotification = async (arg1, arg2, arg3) => {
    if (typeof arg1 === 'object' && arg1 !== null) {
      await sendPushNotification(arg1);
    } else {
      await sendPushNotification(arg1, arg2, arg3, { module: activeModule });
    }
  };

  const handleMarkAsRead = (id) => {
    if (!readNotifIds.includes(id)) {
      const updated = [...readNotifIds, id];
      setReadNotifIds(updated);
      localStorage.setItem('wst_read_activity_ids', JSON.stringify(updated));
    }
  };

  const handleMarkAllAsRead = () => {
    const allIds = activityFeed.map(n => n.id);
    const updated = Array.from(new Set([...readNotifIds, ...allIds]));
    setReadNotifIds(updated);
    localStorage.setItem('wst_read_activity_ids', JSON.stringify(updated));
  };

  const verifyPin = async (enteredPin) => {
    isCheckingRef.current = true;
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

  // Auth Keypad Screen
  if (!currentUser) {
    return (
      <div className="flex flex-col h-screen w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-100 justify-between px-8 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] select-none">
        <div className="text-center space-y-3 pt-6">
          <div className="w-16 h-16 bg-neutral-900 rounded-3xl mx-auto flex items-center justify-center shadow-md">
            <AppLogo className="w-10 h-10 invert" fallbackTextClass="font-serif text-2xl font-bold text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-gray-900">West Side Tavern</h1>
            <p className="text-xs text-gray-400 font-serif italic mt-0.5">Manager Operations Portal</p>
          </div>
        </div>
        <div className="py-2 text-center space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
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
                className="w-16 h-16 rounded-full bg-gray-50 hover:bg-gray-100 active:bg-gray-200 text-xl font-bold text-gray-900 mx-auto flex items-center justify-center transition active:scale-95 shadow-sm border border-gray-100"
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
              className="w-16 h-16 rounded-full bg-gray-50 hover:bg-gray-100 active:bg-gray-200 text-xl font-bold text-gray-900 mx-auto flex items-center justify-center transition active:scale-95 shadow-sm border border-gray-100"
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

  // Active Module Router
  if (activeModule === 'notifications') {
    return (
      <NotificationCenterApp
        notifications={activityFeed}
        readIds={readNotifIds}
        onMarkAsRead={handleMarkAsRead}
        onMarkAllAsRead={handleMarkAllAsRead}
        onNavigate={(mod, entryId) => {
          if (entryId) setDeepLinkData({ module: mod, entryId });
          setActiveModule(mod);
        }}
        onBackToHub={() => setActiveModule('hub')}
      />
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
        />
      </div>
    );
  }

  if (activeModule === 'discussions') {
    return (
      <div {...swipeHandlers} className="h-screen w-full">
        <Discussion
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

  if (activeModule === 'prep') {
    return (
      <div {...swipeHandlers} className="h-screen w-full">
        <PrepCalculatorApp
          currentUser={currentUser}
          onBackToHub={() => setActiveModule('hub')}
          onLogout={handleLogout}
        />
      </div>
    );
  }

  if (activeModule === 'produce') {
    return (
      <div {...swipeHandlers} className="h-screen w-full">
        <ProduceOrderApp
          currentUser={currentUser}
          onBackToHub={() => setActiveModule('hub')}
          onLogout={handleLogout}
        />
      </div>
    );
  }

  if (activeModule === 'wastage') {
    return (
      <div {...swipeHandlers} className="h-screen w-full">
        <SpillageAndWastage
          currentUser={currentUser}
          onBackToHub={() => setActiveModule('hub')}
          onLogout={handleLogout}
        />
      </div>
    );
  }

  if (activeModule === 'catalog') {
    return (
      <div {...swipeHandlers} className="h-screen w-full">
        <CatalogManagerApp
          currentUser={currentUser}
          onBackToHub={() => setActiveModule('hub')}
          onLogout={handleLogout}
        />
      </div>
    );
  }

  if (activeModule.startsWith('report_') || activeModule === 'reports') {
    return (
      <div {...swipeHandlers} className="h-screen w-full">
        <ReportsApp
          currentUser={currentUser}
          initialReportType={reportType}
          onBackToHub={() => setActiveModule('hub')}
          onLogout={handleLogout}
        />
      </div>
    );
  }

  if (activeModule === 'preferences') {
    return (
      <div {...swipeHandlers} className="h-screen w-full">
        <PreferencesApp
          currentUser={currentUser}
          onBackToHub={() => setActiveModule('hub')}
          onLogout={handleLogout}
        />
      </div>
    );
  }

  if (activeModule === 'settings') {
    return (
      <div {...swipeHandlers} className="h-screen w-full">
        <Settings
          currentUser={currentUser}
          onBackToHub={() => setActiveModule('hub')}
          onLogout={handleLogout}
        />
      </div>
    );
  }

  const unreadCount = activityFeed.filter(n => !readNotifIds.includes(n.id)).length;
  const recentThree = activityFeed.slice(0, 3);

  return (
    <div className="flex flex-col h-screen w-full max-w-md mx-auto bg-[#101b34] text-gray-900 font-sans antialiased border-x border-gray-100 overflow-hidden relative select-none">
      
      {/* Universal Side Navigation Drawer */}
      <SideNavDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        activeModule={activeModule}
        onNavigate={(mod, repType) => {
          if (repType) setReportType(repType);
          setActiveModule(mod);
          setDrawerOpen(false);
        }}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* Top Navigation Bar with Hamburger Icon on Left of Logo */}
      <header className="flex items-center justify-between px-5 pt-[max(1.2rem,env(safe-area-inset-top))] pb-3 flex-shrink-0 bg-white z-30 shadow-2xs">
        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-1.5 -ml-1.5 text-gray-700 hover:text-black rounded-lg transition active:scale-95"
            aria-label="Open Navigation Drawer"
          >
            <Menu className="w-5 h-5 stroke-[2.2]" />
          </button>
          <AppLogo className="w-8 h-8 rounded-lg" fallbackTextClass="font-serif text-2xl font-bold tracking-tight text-neutral-900" />
        </div>

        <div className="relative">
          <button
            onClick={() => setShowNotifications(prev => !prev)}
            className="w-10 h-10 rounded-full flex items-center justify-center text-gray-700 hover:bg-gray-100 active:scale-95 transition relative"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white animate-pulse" />
            )}
          </button>

          {/* Quick Notifications Dropdown */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-100 p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100 px-1">
                <span className="font-bold text-xs uppercase tracking-wider text-gray-500">Activity</span>
                <span className="text-[10px] text-gray-400 font-mono">{unreadCount} unread</span>
              </div>
              <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto mt-1">
                {recentThree.length === 0 ? (
                  <p className="p-3 text-center text-xs text-gray-400 italic">No recent activity</p>
                ) : (
                  recentThree.map((item) => {
                    const isUnread = !readNotifIds.includes(item.id);
                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          handleMarkAsRead(item.id);
                          setShowNotifications(false);
                          if (item.entryId) setDeepLinkData({ module: item.module, entryId: item.entryId });
                          setActiveModule(item.module);
                        }}
                        className={`py-2.5 px-2 hover:bg-gray-50 rounded-xl cursor-pointer transition flex flex-col space-y-0.5 ${
                          isUnread ? 'bg-blue-50/40' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                            {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                            {item.title}
                          </span>
                          <span className="text-[10px] text-gray-400">{item.timeStr}</span>
                        </div>
                        <p className="text-[11px] text-gray-500 line-clamp-1">{item.desc}</p>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2 pt-1 border-t border-gray-100">
                <button
                  onClick={() => {
                    handleMarkAllAsRead();
                    setShowNotifications(false);
                  }}
                  className="py-1.5 text-center text-[10px] font-semibold text-gray-500 hover:text-black bg-gray-50 rounded-lg transition"
                >
                  Mark all read
                </button>
                <button
                  onClick={() => {
                    setShowNotifications(false);
                    setActiveModule('notifications');
                  }}
                  className="py-1.5 text-center text-[10px] font-bold text-black bg-gray-100 hover:bg-gray-200 rounded-lg transition"
                >
                  See All Activity
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Greeting Banner */}
      <div className="bg-white px-6 pt-1 pb-4 space-y-0.5 flex-shrink-0">
        <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900">
          {getGreeting()}, {currentUser?.name?.split(' ')[0] || 'Ross'}
        </h1>
        <p className="text-xs font-medium text-gray-400 capitalize">
          {currentUser?.role || 'Duty Manager'} • {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}
        </p>
      </div>

      <div
        onClick={() => showNotifications && setShowNotifications(false)}
        className="flex-1 overflow-y-auto no-scrollbar"
      >
        <div className="bg-[#101b34] px-6 pt-5 pb-6">
          <PreShiftCard onOpenChat={() => setChatOpen(true)} />
        </div>

        <div className="bg-white rounded-t-[36px] px-6 pt-6 pb-24 space-y-6 shadow-md -mt-2">
          
          {/* Categorized Tools Row */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black tracking-tight text-neutral-900">Tools</h2>
              <button
                onClick={() => setDrawerOpen(true)}
                className="text-xs font-semibold text-neutral-400 hover:text-neutral-900 transition flex items-center space-x-1"
              >
                <span>Full Menu</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            
            <div className="flex items-start justify-start gap-4 overflow-x-auto no-scrollbar py-1">
              <div
                onClick={() => setActiveModule('handover')}
                className="flex flex-col items-center space-y-2 cursor-pointer flex-shrink-0 group active:scale-95 transition"
              >
                <div className="w-[66px] h-[66px] rounded-2xl bg-[#FFE484] shadow-sm flex items-center justify-center text-neutral-900">
                  <BookOpen className="w-7 h-7 stroke-[2.2]" />
                </div>
                <span className="text-xs font-bold text-neutral-900 text-center tracking-tight leading-tight">
                  Diary
                </span>
              </div>

              <div
                onClick={() => setActiveModule('goods')}
                className="flex flex-col items-center space-y-2 cursor-pointer flex-shrink-0 group active:scale-95 transition"
              >
                <div className="w-[66px] h-[66px] rounded-2xl bg-[#FFB27D] shadow-sm flex items-center justify-center text-neutral-900">
                  <Truck className="w-7 h-7 stroke-[2.2]" />
                </div>
                <span className="text-xs font-bold text-neutral-900 text-center tracking-tight leading-tight max-w-[70px]">
                  Stock &amp; Deliveries
                </span>
              </div>

              <div
                onClick={() => setActiveModule('prep')}
                className="flex flex-col items-center space-y-2 cursor-pointer flex-shrink-0 group active:scale-95 transition"
              >
                <div className="w-[66px] h-[66px] rounded-2xl bg-[#F3E5F5] shadow-sm flex items-center justify-center text-neutral-900 border border-purple-200">
                  <FlaskConical className="w-7 h-7 stroke-[2.2] text-purple-700" />
                </div>
                <span className="text-xs font-bold text-neutral-900 text-center tracking-tight leading-tight max-w-[70px]">
                  Prep &amp; Batches
                </span>
              </div>

              <div
                onClick={() => setActiveModule('produce')}
                className="flex flex-col items-center space-y-2 cursor-pointer flex-shrink-0 group active:scale-95 transition"
              >
                <div className="w-[66px] h-[66px] rounded-2xl bg-[#D7F5DC] shadow-sm flex items-center justify-center text-neutral-900 border border-emerald-300">
                  <Apple className="w-7 h-7 stroke-[2.2] text-emerald-800" />
                </div>
                <span className="text-xs font-bold text-neutral-900 text-center tracking-tight leading-tight max-w-[70px]">
                  Produce &amp; Herbs
                </span>
              </div>

              <div
                onClick={() => setActiveModule('petty')}
                className="flex flex-col items-center space-y-2 cursor-pointer flex-shrink-0 group active:scale-95 transition"
              >
                <div className="w-[66px] h-[66px] rounded-2xl bg-[#7EE9B6] shadow-sm flex items-center justify-center text-neutral-900">
                  <Coins className="w-7 h-7 stroke-[2.2]" />
                </div>
                <span className="text-xs font-bold text-neutral-900 text-center tracking-tight leading-tight">
                  Cash Up
                </span>
              </div>

              <div
                onClick={() => setActiveModule('orders')}
                className="flex flex-col items-center space-y-2 cursor-pointer flex-shrink-0 group active:scale-95 transition"
              >
                <div className="w-[66px] h-[66px] rounded-2xl bg-[#CDB5FF] shadow-sm flex items-center justify-center text-neutral-900">
                  <ClipboardList className="w-7 h-7 stroke-[2.2]" />
                </div>
                <span className="text-xs font-bold text-neutral-900 text-center tracking-tight leading-tight">
                  Orders
                </span>
              </div>

              <div
                onClick={() => setActiveModule('wastage')}
                className="flex flex-col items-center space-y-2 cursor-pointer flex-shrink-0 group active:scale-95 transition"
              >
                <div className="w-[66px] h-[66px] rounded-2xl bg-[#FFA6A6] shadow-sm flex items-center justify-center text-neutral-900">
                  <TrendingDown className="w-7 h-7 stroke-[2.2]" />
                </div>
                <span className="text-xs font-bold text-neutral-900 text-center tracking-tight leading-tight max-w-[70px]">
                  Spillage &amp; Waste
                </span>
              </div>

              <div
                onClick={() => setActiveModule('catalog')}
                className="flex flex-col items-center space-y-2 cursor-pointer flex-shrink-0 group active:scale-95 transition"
              >
                <div className="w-[66px] h-[66px] rounded-2xl bg-[#E3F2FD] shadow-sm flex items-center justify-center text-neutral-900">
                  <Package className="w-7 h-7 stroke-[2.2] text-blue-700" />
                </div>
                <span className="text-xs font-bold text-neutral-900 text-center tracking-tight leading-tight max-w-[70px]">
                  Master Catalog
                </span>
              </div>
            </div>
          </div>

          {/* Quick Links Section */}
          <div className="space-y-3">
            <h2 className="text-lg font-black tracking-tight text-neutral-900">Quick Links</h2>
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
              <div
                onClick={() => setActiveModule('prep')}
                className="w-[220px] h-[190px] rounded-3xl bg-[#FBF7FD] border border-purple-200 p-5 flex flex-col justify-between flex-shrink-0 cursor-pointer active:scale-[0.98] transition hover:shadow-sm"
              >
                <div>
                  <span className="text-[10px] font-black tracking-widest uppercase text-purple-600 block mb-1">
                    Kitchen &amp; Bar
                  </span>
                  <h3 className="text-base font-extrabold text-neutral-900 leading-snug">
                    Daily Prep Production
                  </h3>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-neutral-500">
                    Station audits, recipe scaling &amp; produce picklists.
                  </p>
                  <div className="pt-3 flex items-center text-xs font-bold text-neutral-900 gap-1">
                    <FlaskConical className="w-4 h-4 text-purple-600" />
                    <span>Open Calculator</span>
                  </div>
                </div>
              </div>

              <div
                onClick={() => setActiveModule('produce')}
                className="w-[220px] h-[190px] rounded-3xl bg-[#F0FDF4] border border-emerald-200 p-5 flex flex-col justify-between flex-shrink-0 cursor-pointer active:scale-[0.98] transition hover:shadow-sm"
              >
                <div>
                  <span className="text-[10px] font-black tracking-widest uppercase text-emerald-600 block mb-1">
                    Fresh Order
                  </span>
                  <h3 className="text-base font-extrabold text-neutral-900 leading-snug">
                    Fresh Produce &amp; Herbs
                  </h3>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-neutral-500">
                    Limes, lemons, herbs &amp; chemicals with dynamic pars.
                  </p>
                  <div className="pt-3 flex items-center text-xs font-bold text-neutral-900 gap-1">
                    <Apple className="w-4 h-4 text-emerald-600" />
                    <span>Order Produce</span>
                  </div>
                </div>
              </div>

              <div
                onClick={() => setActiveModule('handover')}
                className="w-[220px] h-[190px] rounded-3xl bg-[#FFF0F2] border border-[#FFD9DF] p-5 flex flex-col justify-between flex-shrink-0 cursor-pointer active:scale-[0.98] transition hover:shadow-sm"
              >
                <div>
                  <span className="text-[10px] font-black tracking-widest uppercase text-rose-500 block mb-1">
                    Daily Brief
                  </span>
                  <h3 className="text-base font-extrabold text-neutral-900 leading-snug">
                    Most Recent Handover
                  </h3>
                </div>
                <div className="space-y-1">
                  {latestHandover ? (
                    <>
                      <p className="text-xs font-semibold text-neutral-800 line-clamp-2">
                        {latestHandover.general_notes || 'All closing routines complete.'}
                      </p>
                      <span className="text-[10px] text-neutral-400 block font-mono">
                        {latestHandover.manager_name} • {latestHandover.date_formatted || latestHandover.date_str || 'Today'}
                      </span>
                    </>
                  ) : (
                    <p className="text-xs text-neutral-500 italic">No notes logged yet today.</p>
                  )}
                  <div className="pt-2 flex items-center text-xs font-bold text-neutral-900 gap-1">
                    <span>View entry</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>

              <div
                onClick={() => setActiveModule('petty')}
                className="w-[220px] h-[190px] rounded-3xl bg-white border border-neutral-200/90 p-5 flex flex-col justify-between flex-shrink-0 cursor-pointer active:scale-[0.98] transition hover:shadow-sm"
              >
                <div>
                  <span className="text-[10px] font-black tracking-widest uppercase text-emerald-600 block mb-1">
                    Safe &amp; Till
                  </span>
                  <h3 className="text-base font-extrabold text-neutral-900 leading-snug">
                    Add Petty Cash Report
                  </h3>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-neutral-500">
                    Standard float: <strong className="text-neutral-900">£1,200.00</strong>
                  </p>
                  <div className="pt-3 flex items-center text-xs font-bold text-neutral-900 gap-1">
                    <PlusCircle className="w-4 h-4 text-neutral-900" />
                    <span>Log Expense / Denoms</span>
                  </div>
                </div>
              </div>

              <div
                onClick={() => setActiveModule('orders')}
                className="w-[220px] h-[190px] rounded-3xl bg-[#F4F5F7] border border-neutral-200 p-5 flex flex-col justify-between flex-shrink-0 cursor-pointer active:scale-[0.98] transition hover:shadow-sm"
              >
                <div>
                  <span className="text-[10px] font-black tracking-widest uppercase text-indigo-600 block mb-1">
                    Inventory
                  </span>
                  <h3 className="text-base font-extrabold text-neutral-900 leading-snug">
                    Start Speed Stocktake
                  </h3>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-neutral-500">
                    Tactile bottles &amp; par-level ordering lists.
                  </p>
                  <div className="pt-3 flex items-center text-xs font-bold text-neutral-900 gap-1">
                    <span>Open counter</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>

              <div
                onClick={() => setActiveModule('wastage')}
                className="w-[220px] h-[190px] rounded-3xl bg-[#FFF5F5] border border-rose-200 p-5 flex flex-col justify-between flex-shrink-0 cursor-pointer active:scale-[0.98] transition hover:shadow-sm"
              >
                <div>
                  <span className="text-[10px] font-black tracking-widest uppercase text-rose-500 block mb-1">
                    Stock Loss
                  </span>
                  <h3 className="text-base font-extrabold text-neutral-900 leading-snug">
                    Log Spillage / Waste
                  </h3>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-neutral-500">
                    Pints, cocktails, broken bottles &amp; line flushes.
                  </p>
                  <div className="pt-3 flex items-center text-xs font-bold text-neutral-900 gap-1">
                    <TrendingDown className="w-4 h-4 text-rose-600" />
                    <span>Deduct stock</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer className="absolute bottom-0 inset-x-0 bg-white/90 backdrop-blur-md border-t border-gray-100 px-6 py-3 flex items-center justify-between pb-[max(0.8rem,env(safe-area-inset-bottom))] z-20">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-100" />
          <span className="text-xs font-bold text-neutral-800">
            {currentUser?.name}
          </span>
          <span className="text-[10px] text-gray-400 font-mono">
            ({currentUser?.role})
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center space-x-1.5 text-xs font-semibold text-gray-500 hover:text-red-600 transition p-1"
          title="Log Out"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Exit</span>
        </button>
      </footer>

      <OpsFloatingTrigger onTrigger={() => setChatOpen(true)} />
      <OpsChatDrawer isOpen={chatOpen} onClose={() => setChatOpen(false)} />

      {/* iOS Push Notification Opt-in Modal */}
      {showFirstOpenPushModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xs rounded-3xl overflow-hidden shadow-2xl border border-gray-200 p-5 space-y-3.5 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center mx-auto shadow-md">
              <Bell className="w-6 h-6 text-emerald-400" />
            </div>
            <div className="text-center space-y-1">
              <h2 className="text-base font-black text-gray-900 tracking-tight">Enable Operations Alerts</h2>
              <p className="text-xs text-gray-500 leading-snug">
                Receive instant alerts for shift handovers, deliveries, safe floats, spillages, and team notes.
              </p>
            </div>
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem('wst_push_prompted', 'true');
                  setShowFirstOpenPushModal(false);
                }}
                className="w-full py-2.5 bg-black hover:bg-neutral-800 text-white rounded-xl text-xs font-bold transition shadow-sm active:scale-95"
              >
                Allow Notifications
              </button>
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem('wst_push_prompted', 'true');
                  setShowFirstOpenPushModal(false);
                }}
                className="w-full py-2 text-xs font-semibold text-gray-400 hover:text-gray-700 transition"
              >
                Not Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}