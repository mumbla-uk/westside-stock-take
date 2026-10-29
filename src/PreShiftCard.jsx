import React, { useState } from 'react';
import { RefreshCw, Sparkles, ChevronDown } from 'lucide-react';

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

  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleGenerateSummary = async (force = false) => {
    setIsExpanded(true);

    if (!force && brief) {
      return;
    }

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

  return (
    <div className="select-none text-white w-full transition-all duration-500 ease-out">
      
      {/* 1. Folded Bar: TavernAssistant + Action Button */}
      <div className="flex items-center justify-between gap-2 bg-[#070d1b] border border-white/10 px-3.5 py-2 rounded-2xl shadow-xs">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-black tracking-tight text-white">
            TavernAssistant
          </span>
          {loading && (
            <span className="flex items-center gap-1 text-[10px] text-sky-400 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
              Generating...
            </span>
          )}
        </div>

        {!isExpanded ? (
          <button
            onClick={() => handleGenerateSummary(false)}
            disabled={loading}
            className="flex items-center gap-1.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-400/30 px-3 py-1 rounded-xl text-[11px] font-bold transition active:scale-95"
          >
            <Sparkles className="w-3 h-3 text-sky-300" />
            <span>Generate today's summary</span>
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleGenerateSummary(true)}
              disabled={loading}
              className="p-1.5 text-white/50 hover:text-white transition active:scale-95"
              aria-label="Refresh Intel"
              title="Refresh Brief"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-400' : ''}`} />
            </button>
            <button
              onClick={() => setIsExpanded(false)}
              className="p-1.5 text-white/50 hover:text-white transition active:scale-95"
              aria-label="Fold Card"
              title="Fold Brief"
            >
              <ChevronDown className="w-4 h-4 rotate-180 transition-transform" />
            </button>
          </div>
        )}
      </div>

      {/* 2. Animated Accordion Container */}
      <div
        className={`grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div
            className={`pt-3.5 space-y-3.5 transition-all duration-500 ${
              isExpanded ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
            }`}
          >
            {/* 2x2 Soft-Blue Cards */}
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
                  {loading
                    ? 'Synthesising footfall & weather...'
                    : brief?.trade?.detail || 'Midweek steady; monitor Kelvinhall walk-ins.'}
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
                  {loading
                    ? 'Cross-referencing 86 list...'
                    : brief?.stock?.detail || 'All cocktail pars and lines operational.'}
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
                  {loading
                    ? 'Checking section pacing...'
                    : brief?.floor?.detail || 'Keep floor turnover under 90 mins for 2-tops.'}
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
                  {loading
                    ? 'Reading last night’s close tasks...'
                    : brief?.handover?.detail || 'Check batch cordial stocks and clean line pars.'}
                </p>
              </div>
            </div>

            {/* Staggered Suggestion Pill & Search Bar */}
            <div
              className={`space-y-3.5 transition-all duration-500 delay-150 ${
                isExpanded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
              }`}
            >
              <div className="pt-0.5">
                <button
                  onClick={onOpenChat}
                  className="inline-block bg-[#F8F9FA] text-[#1E293B] text-[11px] font-semibold italic px-3 py-1 rounded-md shadow-2xs hover:bg-white active:scale-95 transition"
                >
                  What do I have to do today?
                </button>
              </div>

              <div
                onClick={onOpenChat}
                className="w-full bg-white rounded-md px-3.5 py-2.5 flex items-center cursor-pointer shadow-xs active:bg-gray-50 transition"
              >
                <span className="text-sm font-normal italic text-neutral-800">
                  Ask me anything...
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}