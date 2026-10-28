import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

const SUPABASE_URL = 'https://xuchzhwdgrukoylzvjvl.supabase.co';
const ANON_KEY = 'sb_publishable_szcofKuNIM98PsfNckZlLg_K0Fc-30D';

export default function PreShiftCard({ onOpenChat }) {
  const [brief, setBrief] = useState(() => {
    try {
      const cached = sessionStorage.getItem('wst_preshift_hud');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(!brief);

  const loadBrief = async (force = false) => {
    if (!force && brief) return;
    setLoading(true);

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/manager-brief`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`,
          'apikey': ANON_KEY,
        },
        body: JSON.stringify({ mode: 'brief' }),
      });

      const data = await res.json();
      if (res.ok && data?.brief) {
        setBrief(data.brief);
        sessionStorage.setItem('wst_preshift_hud', JSON.stringify(data.brief));
      }
    } catch (err) {
      console.warn('Brief fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBrief();
  }, []);

  return (
    <div className="space-y-3.5 select-none text-white w-full">
      
      {/* 1. Header Bar: TavernAssistant Pill + Refresh */}
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center bg-[#070d1b] border border-white/10 px-3.5 py-1.5 rounded-xl">
          <span className="text-[12px] font-black tracking-tight text-white">
            TavernAssistant
          </span>
        </div>

        <button
          onClick={() => loadBrief(true)}
          disabled={loading}
          className="p-1.5 text-white/50 hover:text-white transition active:scale-95"
          aria-label="Refresh Intel"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-white' : ''}`} />
        </button>
      </div>

      {/* 2. 2x2 Soft-Blue Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 animate-pulse">
          <div className="h-28 bg-[#DFECFD]/20 rounded-2xl"></div>
          <div className="h-28 bg-[#DFECFD]/20 rounded-2xl"></div>
          <div className="h-28 bg-[#DFECFD]/20 rounded-2xl"></div>
          <div className="h-28 bg-[#DFECFD]/20 rounded-2xl"></div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          
          {/* Tile 1: Trade */}
          <div 
            onClick={onOpenChat}
            className="bg-[#DFECFD] rounded-[22px] p-4 flex flex-col justify-between min-h-[114px] cursor-pointer active:scale-[0.98] transition hover:bg-[#d4e4f9]"
          >
            <h3 className="text-[15px] font-black tracking-tight text-black">
              Trade
            </h3>
            <p className="text-[11px] font-medium leading-[1.35] text-black/90">
              {brief?.trade?.detail || 'Steady midweek neighborhood trade; expect walk-ins sheltering from rain.'}
            </p>
          </div>

          {/* Tile 2: Stock */}
          <div 
            onClick={onOpenChat}
            className="bg-[#DFECFD] rounded-[22px] p-4 flex flex-col justify-between min-h-[114px] cursor-pointer active:scale-[0.98] transition hover:bg-[#d4e4f9]"
          >
            <h3 className="text-[15px] font-black tracking-tight text-black">
              Stock
            </h3>
            <p className="text-[11px] font-medium leading-[1.35] text-black/90">
              {brief?.stock?.headline || 'No active 86s logged on close.'}
            </p>
          </div>

          {/* Tile 3: Floor */}
          <div 
            onClick={onOpenChat}
            className="bg-[#DFECFD] rounded-[22px] p-4 flex flex-col justify-between min-h-[114px] cursor-pointer active:scale-[0.98] transition hover:bg-[#d4e4f9]"
          >
            <h3 className="text-[15px] font-black tracking-tight text-black">
              Floor
            </h3>
            <p className="text-[11px] font-medium leading-[1.35] text-black/90">
              {brief?.floor?.detail || 'Steady midweek neighborhood trade; expect walk-ins sheltering from persistent West End rain.'}
            </p>
          </div>

          {/* Tile 4: Handover */}
          <div 
            onClick={onOpenChat}
            className="bg-[#DFECFD] rounded-[22px] p-4 flex flex-col justify-between min-h-[114px] cursor-pointer active:scale-[0.98] transition hover:bg-[#d4e4f9]"
          >
            <h3 className="text-[15px] font-black tracking-tight text-black">
              Handover
            </h3>
            <p className="text-[11px] font-medium leading-[1.35] text-black/90">
              {brief?.carryover?.task || 'Steady midweek neighborhood trade; expect walk-ins sheltering from persistent West End rain.'}
            </p>
          </div>

        </div>
      )}

      {/* 3. Suggestion Pill: "What do I have to do today?" */}
      <div className="pt-0.5">
        <button
          onClick={onOpenChat}
          className="inline-block bg-[#F8F9FA] text-[#1E293B] text-[11px] font-semibold italic px-3 py-1 rounded-md shadow-2xs hover:bg-white active:scale-95 transition"
        >
          What do I have to do today?
        </button>
      </div>

      {/* 4. White Integrated Input Bar: "Ask me anything..." */}
      <div 
        onClick={onOpenChat}
        className="w-full bg-white rounded-md px-3.5 py-2.5 flex items-center cursor-pointer shadow-xs active:bg-gray-50 transition"
      >
        <span className="text-sm font-normal italic text-neutral-800">
          Ask me anything...
        </span>
      </div>

    </div>
  );
}