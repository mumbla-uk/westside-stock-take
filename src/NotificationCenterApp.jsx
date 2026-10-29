import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Truck,
  Coins,
  ClipboardList,
  Check,
  ChevronRight,
  Filter,
  CheckCheck,
  MessageCircle,
  FileText
} from 'lucide-react';
import { useTwoFingerSwipe } from './useTwoFingerSwipe';

export default function NotificationCenterApp({
  notifications = [],
  readIds = [],
  onMarkAsRead,
  onMarkAllAsRead,
  onNavigate,
  onBackToHub
}) {
  const [activeFilter, setActiveFilter] = useState('all');

  const swipeHandlers = useTwoFingerSwipe({
    onSwipeRight: () => {
      if (onBackToHub) onBackToHub();
    }
  });

  const filteredNotifications = useMemo(() => {
    if (activeFilter === 'all') return notifications;
    return notifications.filter(n => n.module === activeFilter);
  }, [notifications, activeFilter]);

  const unreadCount = useMemo(() => {
    return notifications.filter(n => !readIds.includes(n.id)).length;
  }, [notifications, readIds]);

  const getModuleIcon = (module) => {
    switch (module) {
      case 'handover':
        return <BookOpen className="w-4 h-4 text-amber-500" />;
      case 'goods':
        return <Truck className="w-4 h-4 text-orange-500" />;
      case 'petty':
        return <Coins className="w-4 h-4 text-emerald-500" />;
      case 'orders':
        return <ClipboardList className="w-4 h-4 text-indigo-500" />;
      default:
        return <FileText className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div
      {...swipeHandlers}
      className="flex flex-col h-screen w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 overflow-x-hidden relative select-none"
    >
      {/* Top Header */}
      <header className="flex items-center justify-between px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-3 border-b border-gray-100 flex-shrink-0 bg-white z-20">
        <div className="flex items-center space-x-2">
          <button
            onClick={onBackToHub}
            className="p-1 -ml-1 text-gray-500 hover:text-black rounded-lg transition"
            title="Return to Hub"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="font-extrabold text-base tracking-tight text-gray-900 leading-tight">
              Activity & Notifications
            </h1>
            <span className="text-[10px] text-gray-400 font-mono block">
              West Side Tavern
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllAsRead}
              className="text-[11px] font-bold text-neutral-800 hover:text-black flex items-center space-x-1 bg-gray-100 px-2.5 py-1 rounded-lg transition active:scale-95"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Mark all read</span>
            </button>
          )}
        </div>
      </header>

      {/* Filter Tabs */}
      <div className="flex items-center px-5 py-2 border-b border-gray-100 bg-gray-50 space-x-1.5 overflow-x-auto scrollbar-none flex-shrink-0 text-xs font-bold">
        {[
          { id: 'all', label: 'All Activity' },
          { id: 'handover', label: 'Diaries' },
          { id: 'goods', label: 'Deliveries' },
          { id: 'petty', label: 'Cash Up' },
          { id: 'orders', label: 'Orders' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveFilter(tab.id)}
            className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition text-[11px] ${
              activeFilter === tab.id
                ? 'bg-black text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main List */}
      <div className="flex-1 overflow-y-auto px-5 py-3 divide-y divide-gray-100">
        {filteredNotifications.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Filter className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs font-semibold text-gray-600">No events found in this category</p>
          </div>
        ) : (
          filteredNotifications.map((n) => {
            const isUnread = !readIds.includes(n.id);
            return (
              <div
                key={n.id}
                onClick={() => {
                  onMarkAsRead(n.id);
                  onNavigate(n.module, n.entryId);
                }}
                className={`py-3 px-2 flex items-start justify-between cursor-pointer rounded-xl transition active:bg-gray-100 ${
                  isUnread ? 'bg-blue-50/40' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start space-x-3 pr-2">
                  <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5 border border-gray-200/60">
                    {getModuleIcon(n.module)}
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-1.5">
                      <span className={`text-xs leading-tight ${isUnread ? 'font-black text-black' : 'font-semibold text-gray-800'}`}>
                        {n.title}
                      </span>
                      {isUnread && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-gray-600 line-clamp-2 leading-relaxed">
                      {n.desc}
                    </p>
                    <span className="text-[9px] font-mono text-gray-400 block pt-0.5">
                      {n.timeStr}
                    </span>
                  </div>
                </div>

                <div className="flex items-center self-center pl-2 text-gray-400">
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Floating Bottom Nav */}
      <nav className="fixed bottom-2 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[390px] z-30 rounded-2xl bg-[#111111]/95 backdrop-blur-md text-white py-2 px-3 flex justify-around items-center text-xs font-semibold shadow-2xl border border-white/10 select-none pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
        <button
          onClick={onBackToHub}
          className="flex-1 py-1 text-center rounded-xl transition text-gray-400 hover:text-white"
        >
          Return to Hub
        </button>
      </nav>
    </div>
  );
}