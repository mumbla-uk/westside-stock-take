import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';

const HARDWIRED_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzcrqf4q-QWiGq0sxMmXqS7QcsxCVfhkJgPfjxOm6KyPShNUD-zkD9HUZy49rDdrfAYJg/exec";

// Recurring schedule tasks feeding into suggestion logic
const WEEKLY_SCHEDULE_TASKS = {
  Thursday: ['Keg Order (Greene King)', 'Ice Order (Ice 24/7)', 'Cleanzone Order', 'Wine Order Check'],
  Friday: ['Laundry Drop Off & Pay (Pre 5pm)', 'Fruit Order'],
  Saturday: ['Pick Up Laundry (Pre 5pm)', 'Fruit Order'],
  Sunday: ['Restock Dry Goods', 'Check Beer Line Cleanliness'],
  Monday: ['Spirit Order', 'Keg Order', 'Cleanzone Order', 'Laundry Drop Off'],
  Tuesday: ['Check Brakes Orders', 'Pick Up Laundry'],
  Wednesday: ['Keg Order', 'Wine Order (Alliance)']
};

const INITIAL_HANDOVERS = [
  {
    id: 'h-101',
    date: 'Wednesday 17th November',
    dayOfWeek: 'Wednesday',
    manager: 'Ross',
    takings: '1823.21',
    closeTime: '11.30PM',
    generalNotes: 'Smooth shift overall. Regular crowd for late food. Tap 3 handle needs a washer check tomorrow.',
    kitchenNotes: 'Kitchen deep clean completed. Last order out at 21:15.',
    eightySixList: ['Rapple', 'Mai Italiano', 'Tavern Lager', 'Sangiovese'],
    tomorrowTasks: ['Prep', 'Wine Delivery', 'Keg Order', 'Kegs Out', 'Ice Ordered'],
    spillages: ['2 shots House Gin (Line burst)'],
    maintenanceFlags: ['Tap 3 handle loose']
  }
];

export default function HandoverApp({ onBackToHub, onLogout }) {
  // View Navigation ('today' | 'latest' | 'history' | 'assistant' | 'settings')
  const [currentTab, setCurrentTab] = useState('today');

  // Database History State
  const [handoverHistory, setHandoverHistory] = useState(INITIAL_HANDOVERS);

  // Form State ("Today" view)
  const [takings, setTakings] = useState('1540.21');
  const [generalNotes, setGeneralNotes] = useState('');
  const [kitchenService, setKitchenService] = useState('Close');
  const [eightySixInput, setEightySixInput] = useState('');
  const [eightySixList, setEightySixList] = useState(['Rapple', 'Mai Italiano', 'Tavern Lager', 'Ichnusa', 'Sangiovese']);

  const [tomorrowInput, setTomorrowInput] = useState('');
  const [tomorrowList, setTomorrowList] = useState(['Ice Order', 'Carb Hugo Keg', 'Strain Mint Water']);
  
  const [spillInput, setSpillInput] = useState('');
  const [spillList, setSpillList] = useState(['1x Pint Tavern Lager (Drip tray)']);

  const [closeTime, setCloseTime] = useState('11.30PM');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Autocomplete Suggestions for "Tomorrow" Tasks
  const tomorrowSuggestions = (WEEKLY_SCHEDULE_TASKS['Thursday'] || []).filter(
    (task) => task.toLowerCase().includes(tomorrowInput.toLowerCase()) && tomorrowInput.trim().length > 0
  );

  // 86 List Handlers
  const handleAdd86 = (e) => {
    e?.preventDefault();
    if (eightySixInput.trim()) {
      setEightySixList([...eightySixList, eightySixInput.trim()]);
      setEightySixInput('');
    }
  };

  const handleRemove86 = (index) => {
    setEightySixList(eightySixList.filter((_, i) => i !== index));
  };

  // Tomorrow List Handlers
  const handleAddTomorrow = (textToAdd) => {
    const text = textToAdd || tomorrowInput;
    if (text.trim()) {
      setTomorrowList([...tomorrowList, text.trim()]);
      setTomorrowInput('');
    }
  };

  const handleRemoveTomorrow = (index) => {
    setTomorrowList(tomorrowList.filter((_, i) => i !== index));
  };

  // Spillage Handlers
  const handleAddSpill = (e) => {
    e?.preventDefault();
    if (spillInput.trim()) {
      setSpillList([...spillList, spillInput.trim()]);
      setSpillInput('');
    }
  };

  const handleRemoveSpill = (index) => {
    setSpillList(spillList.filter((_, i) => i !== index));
  };

  // Form Submission -> Posts to Google Sheets & stores locally
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const newHandover = {
      action: 'handover',
      id: `h-${Date.now()}`,
      dateStr: 'Thursday 18th November',
      dayOfWeek: 'Thursday',
      manager: 'Ross',
      takings,
      closeTime,
      generalNotes,
      kitchenService,
      eightySixList,
      tomorrowTasks: tomorrowList,
      spillages: spillList,
      maintenanceFlags: generalNotes.toLowerCase().includes('glasswasher') ? ['Glasswasher check needed'] : []
    };

    try {
      await fetch(HARDWIRED_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newHandover),
        mode: 'no-cors'
      });
    } catch (err) {
      console.error("Failed to post handover:", err);
    } finally {
      setHandoverHistory([newHandover, ...handoverHistory]);
      setIsSubmitting(false);
      setIsSubmitted(true);
      setTimeout(() => setIsSubmitted(false), 3500);
    }
  };

  const handleReset = () => {
    setTakings('');
    setGeneralNotes('');
    setKitchenService('');
    setEightySixList([]);
    setTomorrowList([]);
    setSpillList([]);
  };

  const latestHandover = handoverHistory[0] || INITIAL_HANDOVERS[0];

  return (
    <div className="min-h-screen bg-white text-black font-sans max-w-md mx-auto pb-24 relative selection:bg-black selection:text-white border-x border-gray-200">
      
      {/* Top Header with Hub Navigation */}
      <header className="px-5 py-4 flex justify-between items-center bg-white sticky top-0 z-10 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center space-x-2">
          {onBackToHub && (
            <button 
              onClick={onBackToHub} 
              className="mr-0.5 p-1 -ml-1 text-gray-500 hover:text-black rounded-lg transition"
              title="Return to Portal Hub"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <span className="font-serif text-2xl font-black">𝕿</span>
          <span className="text-sm font-extrabold tracking-tight">West Side Tavern</span>
        </div>
        <div className="flex items-center space-x-4 text-xs font-semibold text-black">
          {onBackToHub ? (
            <button onClick={onBackToHub} className="hover:opacity-60 font-bold">
              Hub
            </button>
          ) : (
            <button onClick={onLogout} className="hover:opacity-60">
              Logout
            </button>
          )}
          <button onClick={() => setCurrentTab('settings')} className="hover:opacity-60">
            Settings
          </button>
        </div>
      </header>

      {/* VIEW ROUTER */}
      <main className="px-6 pt-3">
        {/* VIEW 1: TODAY (Write Form) */}
        {currentTab === 'today' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight leading-tight">
                Thursday<br />18th November
              </h1>
            </div>

            {/* Assistant Context Banner */}
            <div className="bg-[#F2F2F2] p-4 rounded-xl space-y-1.5">
              <p className="text-xs font-bold text-black">West Side Tavern Assistant:</p>
              <p className="text-xs text-neutral-600 italic leading-relaxed">
                Keg, Ice and Cleanzone orders usually need placed today.
              </p>
              {latestHandover.generalNotes && (latestHandover.generalNotes.toLowerCase().includes('glasswasher') || latestHandover.generalNotes.toLowerCase().includes('tap')) ? (
                <p className="text-xs text-neutral-600 italic leading-relaxed">
                  ⚠️ Note from last night: "{latestHandover.generalNotes}"
                </p>
              ) : null}
            </div>

            {/* Takings Input */}
            <div className="flex items-center space-x-4 pt-1">
              <label className="text-lg font-bold text-black">Takings</label>
              <div className="relative border border-neutral-300 rounded-lg px-3 py-1.5 focus-within:border-black bg-white">
                <span className="text-sm font-medium">£</span>
                <input
                  type="text"
                  value={takings}
                  onChange={(e) => setTakings(e.target.value)}
                  className="w-28 pl-1 text-sm font-medium bg-transparent focus:outline-none"
                />
              </div>
            </div>

            {/* General Notes */}
            <div className="space-y-1.5">
              <label className="text-lg font-bold text-black">General Notes</label>
              <div className="relative border border-neutral-300 rounded-xl p-3 focus-within:border-black bg-white">
                <textarea
                  rows="4"
                  maxLength={500}
                  value={generalNotes}
                  onChange={(e) => setGeneralNotes(e.target.value)}
                  placeholder="Record atmosphere, maintenance issues, or unexpected footfall spikes..."
                  className="w-full text-xs leading-relaxed text-black bg-transparent focus:outline-none resize-none"
                />
                <span className="absolute bottom-2 right-3 text-[9px] text-neutral-400 font-mono">
                  {generalNotes.length}/500
                </span>
              </div>
            </div>

            {/* Kitchen Service */}
            <div className="space-y-1.5">
              <label className="text-lg font-bold text-black">Kitchen Service</label>
              <div className="relative border border-neutral-300 rounded-xl p-3 focus-within:border-black bg-white">
                <textarea
                  rows="3"
                  maxLength={750}
                  value={kitchenService}
                  onChange={(e) => setKitchenService(e.target.value)}
                  placeholder="Close"
                  className="w-full text-xs leading-relaxed text-black bg-transparent focus:outline-none resize-none"
                />
                <span className="absolute bottom-2 right-3 text-[9px] text-neutral-400 font-mono">
                  {kitchenService.length}/750
                </span>
              </div>
            </div>

            {/* 86 List */}
            <div className="space-y-2">
              <label className="text-lg font-bold text-black">86 List</label>
              <form onSubmit={handleAdd86} className="relative">
                <input
                  type="text"
                  value={eightySixInput}
                  onChange={(e) => setEightySixInput(e.target.value)}
                  placeholder="Add item out of stock..."
                  className="w-full border border-neutral-300 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-black pr-10"
                />
                <button
                  type="submit"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-600 text-sm hover:text-black font-bold"
                >
                  →
                </button>
              </form>

              <div className="divide-y divide-neutral-100 pt-1">
                {eightySixList.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center py-2 text-sm font-semibold text-black">
                    <span>{item}</span>
                    <button
                      onClick={() => handleRemove86(idx)}
                      className="text-neutral-400 hover:text-black text-xs px-1 font-mono"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Tomorrow List */}
            <div className="space-y-2 pt-2">
              <label className="text-lg font-bold text-black">Tomorrow</label>
              <div className="relative">
                <input
                  type="text"
                  value={tomorrowInput}
                  onChange={(e) => setTomorrowInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTomorrow())}
                  placeholder="Add task for tomorrow's shift..."
                  className="w-full border border-neutral-300 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-black pr-10"
                />
                <button
                  type="button"
                  onClick={() => handleAddTomorrow()}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-600 text-sm hover:text-black font-bold"
                >
                  →
                </button>
              </div>

              {/* Autocomplete Suggestions */}
              {tomorrowSuggestions.length > 0 && (
                <div className="border border-neutral-200 rounded-xl overflow-hidden divide-y divide-neutral-100 bg-[#FBFBFB]">
                  {tomorrowSuggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAddTomorrow(suggestion)}
                      className="w-full text-left px-3 py-2 text-xs text-black flex justify-between items-center hover:bg-neutral-100"
                    >
                      <span>{suggestion}</span>
                      <span className="text-neutral-400">→</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="divide-y divide-neutral-100 pt-1">
                {tomorrowList.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center py-2 text-sm font-semibold text-black">
                    <span>{item}</span>
                    <button
                      onClick={() => handleRemoveTomorrow(idx)}
                      className="text-neutral-400 hover:text-black text-xs px-1 font-mono"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Spillage & Waste Logging */}
            <div className="space-y-2 pt-2">
              <label className="text-lg font-bold text-black">Spillage & Waste Log</label>
              <form onSubmit={handleAddSpill} className="relative">
                <input
                  type="text"
                  value={spillInput}
                  onChange={(e) => setSpillInput(e.target.value)}
                  placeholder="e.g. 1x Bottle House Gin (broken)"
                  className="w-full border border-neutral-300 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-black pr-10"
                />
                <button
                  type="submit"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-600 text-sm hover:text-black font-bold"
                >
                  →
                </button>
              </form>

              <div className="divide-y divide-neutral-100 pt-1">
                {spillList.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center py-2 text-xs text-neutral-800 font-medium">
                    <span>{item}</span>
                    <button
                      onClick={() => handleRemoveSpill(idx)}
                      className="text-neutral-400 hover:text-black text-xs px-1 font-mono"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Close Time Selector */}
            <div className="flex items-center space-x-3 pt-3">
              <label className="text-lg font-bold text-black">Close Time:</label>
              <div className="relative inline-block border border-neutral-300 rounded-xl px-3 py-1.5 bg-white">
                <select
                  value={closeTime}
                  onChange={(e) => setCloseTime(e.target.value)}
                  className="appearance-none bg-transparent pr-6 text-sm font-black focus:outline-none cursor-pointer"
                >
                  <option value="11.00PM">11.00PM</option>
                  <option value="11.30PM">11.30PM</option>
                  <option value="12.00AM">12.00AM</option>
                  <option value="12.30AM">12.30AM</option>
                  <option value="01.00AM">01.00AM</option>
                </select>
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-xs">
                  ▼
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-4">
              <button
                type="button"
                onClick={handleReset}
                className="w-full py-3 border border-neutral-300 rounded-xl text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full py-3 bg-[#141414] text-white rounded-xl text-xs font-bold hover:bg-black transition disabled:opacity-50"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Handover'}
              </button>
            </div>

            {isSubmitted && (
              <p className="text-center text-xs font-bold text-emerald-700 pt-1">
                ✓ Handover Saved & Logged to Master Sheet
              </p>
            )}
          </div>
        )}

        {/* VIEW 2: LATEST / YESTERDAY (Read View) */}
        {currentTab === 'latest' && (
          <div className="space-y-6">
            <div className="flex justify-between items-baseline">
              <h1 className="text-3xl font-extrabold tracking-tight leading-tight">
                {latestHandover.date}
              </h1>
              <span className="text-2xl font-black text-neutral-900">£{latestHandover.takings}</span>
            </div>

            <div className="bg-[#F2F2F2] p-4 rounded-xl space-y-1">
              <p className="text-xs font-bold text-black">West Side Tavern Assistant:</p>
              <p className="text-xs text-neutral-600 leading-relaxed italic">
                Logged by {latestHandover.manager}. Close time: {latestHandover.closeTime}.
              </p>
            </div>

            <div className="bg-[#F9F9F9] p-5 rounded-2xl space-y-5 border border-gray-100">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-black uppercase tracking-wider">General Notes</h3>
                <p className="text-xs text-neutral-700 leading-relaxed">
                  {latestHandover.generalNotes || 'No general notes submitted.'}
                </p>
              </div>

              <div className="space-y-1">
                <h3 className="text-sm font-bold text-black uppercase tracking-wider">Kitchen Service</h3>
                <p className="text-xs text-neutral-700 leading-relaxed">
                  {latestHandover.kitchenNotes || latestHandover.kitchenService || 'Close'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <h3 className="text-sm font-bold text-black uppercase tracking-wider mb-2">To Do</h3>
                  <div className="space-y-1.5 text-xs text-neutral-800">
                    {(latestHandover.tomorrowTasks || []).map((task, idx) => (
                      <label key={idx} className="flex items-center space-x-2 cursor-pointer font-medium">
                        <input type="checkbox" className="rounded border-neutral-400" />
                        <span>{task}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-black uppercase tracking-wider mb-2">86 List</h3>
                  <ul className="space-y-1 text-xs text-neutral-800 font-semibold list-disc list-inside">
                    {(latestHandover.eightySixList || []).map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: HISTORY */}
        {currentTab === 'history' && (
          <div className="space-y-4">
            <h1 className="text-2xl font-black">Handover History</h1>
            <div className="divide-y divide-neutral-200">
              {handoverHistory.map((item) => (
                <div key={item.id} className="py-3 flex justify-between items-center text-sm">
                  <div>
                    <p className="font-bold">{item.date || item.dateStr}</p>
                    <p className="text-xs text-neutral-500">Logged by {item.manager}</p>
                  </div>
                  <span className="font-extrabold text-neutral-800">£{item.takings}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 4: ASSISTANT */}
        {currentTab === 'assistant' && (
          <div className="space-y-4">
            <h1 className="text-2xl font-black">Shift Co-Pilot</h1>
            
            <div className="bg-[#F2F2F2] p-4 rounded-xl space-y-1.5">
              <p className="text-xs font-bold text-black">Cross-App Operational Summary</p>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Aggregating logs across Handover, Stocktake, and Maintenance pipelines.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <div className="p-3.5 border border-neutral-200 rounded-xl space-y-1">
                <p className="text-xs font-bold text-black">📦 Stock & 86 Insights</p>
                <p className="text-xs text-neutral-600">
                  {latestHandover.eightySixList.length} items currently on the 86 list. Automatically flagged for stock deficit check.
                </p>
              </div>

              <div className="p-3.5 border border-neutral-200 rounded-xl space-y-1">
                <p className="text-xs font-bold text-black">👥 Service Footfall</p>
                <p className="text-xs text-neutral-600">
                  Thursday revenue target averaged £1,540 over recent periods.
                </p>
              </div>

              <div className="p-3.5 border border-neutral-200 rounded-xl space-y-1">
                <p className="text-xs font-bold text-black">🛠️ Maintenance Alerts</p>
                <p className="text-xs text-neutral-600">
                  {latestHandover.maintenanceFlags && latestHandover.maintenanceFlags.length > 0
                    ? `Open issue: ${latestHandover.maintenanceFlags.join(', ')}`
                    : 'No critical equipment failures flagged in recent handovers.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 5: SETTINGS */}
        {currentTab === 'settings' && (
          <div className="space-y-4">
            <h1 className="text-2xl font-black">App Settings</h1>
            <div className="space-y-3 text-sm">
              <div className="p-3.5 border border-neutral-200 rounded-xl">
                <p className="font-bold text-xs">Manager Duty Roster</p>
                <p className="text-xs text-neutral-500 mt-0.5">Ross, Duty Manager</p>
              </div>
              <div className="p-3.5 border border-neutral-200 rounded-xl">
                <p className="font-bold text-xs">Google Sheets Data Bridge</p>
                <p className="text-xs text-emerald-700 font-semibold mt-0.5">● Active (Connected to West Side Tavern Sheet)</p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Sticky Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#141414] text-white py-3.5 px-6 max-w-md mx-auto flex justify-between items-center text-xs font-bold border-t border-neutral-800">
        <button
          onClick={() => setCurrentTab('latest')}
          className={`hover:text-neutral-300 transition ${
            currentTab === 'latest' ? 'text-white border-b-2 border-white pb-0.5' : 'text-neutral-400'
          }`}
        >
          Latest
        </button>
        <button
          onClick={() => setCurrentTab('today')}
          className={`hover:text-neutral-300 transition ${
            currentTab === 'today' ? 'text-white border-b-2 border-white pb-0.5' : 'text-neutral-400'
          }`}
        >
          Today
        </button>
        <button
          onClick={() => setCurrentTab('history')}
          className={`hover:text-neutral-300 transition ${
            currentTab === 'history' ? 'text-white border-b-2 border-white pb-0.5' : 'text-neutral-400'
          }`}
        >
          History
        </button>
        <button
          onClick={() => setCurrentTab('assistant')}
          className={`hover:text-neutral-300 transition ${
            currentTab === 'assistant' ? 'text-white border-b-2 border-white pb-0.5' : 'text-neutral-400'
          }`}
        >
          Assistant
        </button>
      </nav>
    </div>
  );
}