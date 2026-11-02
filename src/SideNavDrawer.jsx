import React from 'react';
import {
  X,
  BookOpen,
  Coins,
  Truck,
  ClipboardList,
  TrendingDown,
  FlaskConical,
  Package,
  Apple,
  MessageSquare,
  BarChart3,
  Sliders,
  Settings as SettingsIcon,
  LogOut,
  ChevronRight,
  Wrench,
  Layers,
  Sparkles
} from 'lucide-react';

function DrawerLogo({ className = "w-7 h-7", fallbackTextClass = "font-serif text-xl font-bold tracking-tighter" }) {
  const [imgError, setImgError] = React.useState(false);
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

export default function SideNavDrawer({
  isOpen,
  onClose,
  activeModule,
  onNavigate,
  currentUser,
  onLogout,
  devMode = false
}) {
  if (!isOpen) return null;

  // The 4 Core Launch Pillars
  const corePillars = [
    {
      id: 'handover',
      label: 'Handover Diary',
      sub: 'Night close, Z-reports & shift log',
      icon: BookOpen,
      color: 'bg-[#FFE484] text-neutral-900'
    },
    {
      id: 'orders',
      label: 'Speed Count & Orders',
      sub: 'Stocktake & smart supplier orders',
      icon: ClipboardList,
      color: 'bg-[#CDB5FF] text-neutral-900'
    },
    {
      id: 'petty',
      label: 'Cash Up & Float',
      sub: '£1,200 float balance & expense slips',
      icon: Coins,
      color: 'bg-[#7EE9B6] text-neutral-900'
    },
    {
      id: 'wastage',
      label: 'Spillage & Wastage',
      sub: 'Pints, ullage & broken bottle deductions',
      icon: TrendingDown,
      color: 'bg-[#FFA6A6] text-neutral-900'
    }
  ];

  // In-Development Modules (Visible only in Dev Mode)
  const devModules = [
    {
      id: 'goods',
      label: 'Stock & Deliveries',
      sub: 'Goods received check-in & invoice audit',
      icon: Truck,
      color: 'bg-[#FFB27D] text-neutral-900'
    },
    {
      id: 'prep',
      label: 'Prep Calculator',
      sub: 'Batch scaling, station pars & recipes',
      icon: FlaskConical,
      color: 'bg-[#F3E5F5] text-purple-700'
    },
    {
      id: 'produce',
      label: 'Produce & Herbs',
      sub: 'Citrus, garnish & bar order list',
      icon: Apple,
      color: 'bg-[#D7F5DC] text-emerald-800'
    },
    {
      id: 'catalog',
      label: 'Master Catalog',
      sub: 'Item costs, suppliers & packaging',
      icon: Package,
      color: 'bg-[#E3F2FD] text-blue-700'
    },
    {
      id: 'discussions',
      label: 'Action Threads',
      sub: 'Asynchronous shift task assignments',
      icon: MessageSquare,
      color: 'bg-neutral-100 text-neutral-800'
    },
    {
      id: 'reports',
      label: 'Operations Reports',
      sub: 'Audit history, exports & analytics',
      icon: BarChart3,
      color: 'bg-neutral-100 text-neutral-800'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex select-none animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="relative w-full max-w-[320px] bg-white h-full flex flex-col justify-between shadow-2xl z-10 animate-in slide-in-from-left duration-200">
        
        {/* Drawer Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/70">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 bg-neutral-900 rounded-xl flex items-center justify-center shadow-xs">
              <DrawerLogo className="w-5 h-5 invert" fallbackTextClass="font-serif text-lg font-bold text-white" />
            </div>
            <div>
              <h2 className="text-sm font-black text-gray-900 tracking-tight leading-tight">West Side Tavern</h2>
              <p className="text-[10px] text-gray-400 font-serif italic">Operations Portal</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-black hover:bg-gray-200 transition"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Navigation List */}
        <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-5 no-scrollbar">
          
          {/* Section 1: Core Launch Pillars */}
          <div className="space-y-1">
            <div className="px-2 pb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400">
                Core Operations
              </span>
              <span className="text-[9px] font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                Live
              </span>
            </div>

            <div className="space-y-1">
              {corePillars.map((item) => {
                const IconComponent = item.icon;
                const isActive = activeModule === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-2xl transition active:scale-[0.98] text-left group ${
                      isActive
                        ? 'bg-neutral-950 text-white shadow-xs'
                        : 'hover:bg-gray-100/80 text-gray-900'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0 pr-2">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${item.color}`}>
                        <IconComponent className="w-4 h-4 stroke-[2.2]" />
                      </div>
                      <div className="min-w-0">
                        <span className={`text-xs font-bold block truncate leading-tight ${isActive ? 'text-white' : 'text-gray-900'}`}>
                          {item.label}
                        </span>
                        <span className={`text-[10px] block truncate leading-tight mt-0.5 ${isActive ? 'text-gray-300' : 'text-gray-400'}`}>
                          {item.sub}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 transition-transform group-hover:translate-x-0.5 ${isActive ? 'text-gray-400' : 'text-gray-300'}`} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Developer Mode Modules (Only rendered when devMode is active) */}
          {devMode && (
            <div className="space-y-1 pt-2 border-t border-gray-100">
              <div className="px-2 pb-1.5 flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-600 flex items-center gap-1">
                  <Wrench className="w-3 h-3" />
                  <span>Dev Preview Modules</span>
                </span>
                <span className="text-[9px] font-mono font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                  Beta
                </span>
              </div>

              <div className="space-y-1">
                {devModules.map((item) => {
                  const IconComponent = item.icon;
                  const isActive = activeModule === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onNavigate(item.id)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-2xl transition active:scale-[0.98] text-left group ${
                        isActive
                          ? 'bg-neutral-950 text-white shadow-xs'
                          : 'hover:bg-amber-50/50 text-gray-900'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0 pr-2">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${item.color}`}>
                          <IconComponent className="w-4 h-4 stroke-[2.2]" />
                        </div>
                        <div className="min-w-0">
                          <span className={`text-xs font-bold block truncate leading-tight ${isActive ? 'text-white' : 'text-gray-900'}`}>
                            {item.label}
                          </span>
                          <span className={`text-[10px] block truncate leading-tight mt-0.5 ${isActive ? 'text-gray-300' : 'text-gray-400'}`}>
                            {item.sub}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 transition-transform group-hover:translate-x-0.5 ${isActive ? 'text-gray-400' : 'text-gray-300'}`} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 3: System Utilities */}
          <div className="space-y-1 pt-2 border-t border-gray-100">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400 block px-2 pb-1">
              Configuration
            </span>

            <button
              onClick={() => onNavigate('preferences')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition text-left ${
                activeModule === 'preferences' ? 'bg-gray-100 text-black font-bold' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Sliders className="w-4 h-4 text-gray-500" />
                <span>Alerts &amp; Sound Settings</span>
              </div>
            </button>

            <button
              onClick={() => onNavigate('settings')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition text-left ${
                activeModule === 'settings' ? 'bg-gray-100 text-black font-bold' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <SettingsIcon className="w-4 h-4 text-gray-500" />
                <span>Venue PINs &amp; Access</span>
              </div>
            </button>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/70 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-gray-900 block leading-tight">
              {currentUser?.name || 'Staff Member'}
            </span>
            <span className="text-[10px] text-gray-400 font-mono block">
              {currentUser?.role || 'Duty Manager'} {devMode ? '• Dev Active' : ''}
            </span>
          </div>

          <button
            onClick={onLogout}
            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition flex items-center space-x-1"
            title="Log out of session"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}