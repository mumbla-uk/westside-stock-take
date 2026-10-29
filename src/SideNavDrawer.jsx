import React from 'react';
import {
  X,
  BookOpen,
  Coins,
  TrendingDown,
  Apple,
  FlaskConical,
  ClipboardList,
  Truck,
  Package,
  SlidersHorizontal,
  Wrench,
  UserCheck,
  LogOut,
  ChevronRight
} from 'lucide-react';

function AppLogo({ className = "w-7 h-7" }) {
  return (
    <img
      src="/img/icon.png"
      alt="West Side Tavern"
      className={`${className} object-contain`}
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}

export default function SideNavDrawer({
  isOpen,
  onClose,
  activeModule,
  onNavigate,
  currentUser,
  onLogout
}) {
  if (!isOpen) return null;

  const NAV_SECTIONS = [
    {
      title: 'Daily Paperwork',
      items: [
        { id: 'handover', label: 'Diary', icon: BookOpen, color: 'text-amber-600', bg: 'bg-amber-50' },
        { id: 'petty', label: 'Cash Up', icon: Coins, color: 'text-emerald-700', bg: 'bg-emerald-50' },
        { id: 'wastage', label: 'Spillage & Wastage', icon: TrendingDown, color: 'text-rose-600', bg: 'bg-rose-50' }
      ]
    },
    {
      title: 'Fresh Produce & Prep',
      items: [
        { id: 'produce', label: 'Produce Order', icon: Apple, color: 'text-emerald-800', bg: 'bg-emerald-50' },
        { id: 'prep', label: 'Prep Calculator', icon: FlaskConical, color: 'text-purple-700', bg: 'bg-purple-50' }
      ]
    },
    {
      title: 'Inventory Management',
      items: [
        { id: 'orders', label: 'Orders', icon: ClipboardList, color: 'text-indigo-600', bg: 'bg-indigo-50' },
        { id: 'goods', label: 'Goods Received', icon: Truck, color: 'text-amber-700', bg: 'bg-amber-50' },
        { id: 'catalog', label: 'Catalog Manager', icon: Package, color: 'text-blue-700', bg: 'bg-blue-50' }
      ]
    },
    {
      title: 'Settings & Control',
      items: [
        { id: 'preferences', label: 'Preferences & Notifications', icon: UserCheck, color: 'text-gray-700', bg: 'bg-gray-100' },
        { id: 'settings', label: 'App Settings & Dev Tools', icon: Wrench, color: 'text-gray-700', bg: 'bg-gray-100' }
      ]
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Body (approx half width on larger screens, 75% on compact mobile) */}
      <div className="relative w-[78%] sm:w-[50%] max-w-[340px] h-full bg-white text-gray-900 shadow-2xl flex flex-col justify-between border-r border-gray-200 z-10 animate-in slide-in-from-left duration-200 select-none">
        
        {/* Drawer Header */}
        <div className="px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-3 border-b border-gray-100 flex items-center justify-between bg-white">
          <div className="flex items-center space-x-2.5">
            <AppLogo className="w-7 h-7 rounded-lg" />
            <div>
              <span className="font-extrabold text-sm tracking-tight text-neutral-900 block leading-tight">
                West Side Tavern
              </span>
              <span className="text-[10px] text-gray-400 font-mono block">Operations Hub</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-black rounded-lg transition active:scale-95"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5 touch-pan-y overscroll-contain">
          {NAV_SECTIONS.map((sec, idx) => (
            <div key={idx} className="space-y-1">
              <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-gray-400 block px-2 mb-1.5">
                {sec.title}
              </span>
              <div className="space-y-0.5">
                {sec.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeModule === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onNavigate(item.id);
                        onClose();
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-bold transition ${
                        isActive
                          ? 'bg-neutral-900 text-white shadow-xs'
                          : 'text-gray-700 hover:bg-gray-100 active:scale-[0.98]'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isActive ? 'bg-white/20 text-white' : `${item.bg}${item.color}`}`}>
                          <Icon className="w-4 h-4 stroke-[2.2]" />
                        </div>
                        <span className="truncate">{item.label}</span>
                      </div>
                      <ChevronRight className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Drawer Footer / User Management */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="space-y-0.5">
            <span className="text-xs font-black text-gray-900 block truncate">
              {currentUser?.name || 'Staff Member'}
            </span>
            <span className="text-[10px] text-gray-400 font-mono capitalize block">
              {currentUser?.role || 'Duty Manager'}
            </span>
          </div>

          <button
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="flex items-center space-x-1 py-1.5 px-2.5 bg-white border border-gray-200 rounded-xl text-[11px] font-bold text-rose-600 hover:bg-rose-50 transition active:scale-95 shadow-2xs"
            title="Log Out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Exit</span>
          </button>
        </div>
      </div>
    </div>
  );
}