import React, { useState, useRef } from 'react';
import { MessageSquareText, Sparkles } from 'lucide-react';

export default function OpsFloatingTrigger({ onTrigger }) {
  const [isPressing, setIsPressing] = useState(false);
  const timerRef = useRef(null);

  const startPress = () => {
    setIsPressing(true);
    timerRef.current = setTimeout(() => {
      // Trigger haptic if on iOS/Android PWA
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
      setIsPressing(false);
      onTrigger();
    }, 500); // 500ms long-press threshold
  };

  const cancelPress = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setIsPressing(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-40 select-none">
      <button
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onContextMenu={(e) => e.preventDefault()} // prevent context menu on iOS
        className={`relative flex items-center justify-center rounded-full bg-neutral-900 text-white shadow-xl transition-all duration-300 ease-out active:outline-none ${
          isPressing 
            ? 'w-16 h-16 scale-125 ring-4 ring-emerald-400/40 shadow-emerald-500/20' 
            : 'w-14 h-14 scale-100 hover:scale-105'
        }`}
        aria-label="Hold for Ops Assistant"
      >
        {/* Pulsing indicator while pressing */}
        {isPressing && (
          <span className="absolute inset-0 rounded-full bg-emerald-400/20 animate-ping" />
        )}
        
        <MessageSquareText className={`w-6 h-6 transition-transform duration-200 ${isPressing ? 'scale-110 text-emerald-400' : 'text-white'}`} />
        
        {/* Small sparkle badge */}
        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 text-black flex items-center justify-center shadow-md">
          <Sparkles className="w-3 h-3 fill-current" />
        </span>
      </button>

      {/* Subtle helper tooltip while resting */}
      {!isPressing && (
        <span className="absolute right-0 -top-6 whitespace-nowrap text-[9px] font-mono text-neutral-400 tracking-tight pointer-events-none opacity-60">
          Hold for AI
        </span>
      )}
    </div>
  );
}