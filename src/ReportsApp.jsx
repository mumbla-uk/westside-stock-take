import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Calendar,
  FileSpreadsheet,
  TrendingDown,
  Coins,
  Package,
  Layers,
  RefreshCw,
  Download,
  Receipt,
  DollarSign,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { useTwoFingerSwipe } from './useTwoFingerSwipe';
import { supabase, DEFAULT_VENUE_ID } from './lib/db';

function parseItems(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// Helper: Formats ISO date to YYYY-MM-DD
function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

// Preset date ranges
function getDateRange(preset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (preset === 'this_week') {
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(today.setDate(diff));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { start: toDateStr(mon), end: toDateStr(sun) };
  }

  if (preset === 'last_week') {
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1) - 7;
    const mon = new Date(today.setDate(diff));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { start: toDateStr(mon), end: toDateStr(sun) };
  }

  if (preset === 'this_month') {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: toDateStr(firstDay), end: toDateStr(lastDay) };
  }

  if (preset === 'last_month') {
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: toDateStr(firstDay), end: toDateStr(lastDay) };
  }

  return { start: toDateStr(today), end: toDateStr(today) };
}

export default function ReportsApp({ currentUser, initialReportType = 'master', onBackToHub, onLogout }) {
  const [activeReport, setActiveReport] = useState(initialReportType); // 'inventory' | 'takings' | 'petty' | 'master'
  const [periodPreset, setPeriodPreset] = useState('this_week');
  
  const initialRange = useMemo(() => getDateRange('this_week'), []);
  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);

  const [loading, setLoading] = useState(false);
  const [deliveries, setDeliveries] = useState([]);
  const [wastage, setWastage] = useState([]);
  const [handovers, setHandovers] = useState([]);
  const [pettyCash, setPettyCash] = useState([]);

  const swipeHandlers = useTwoFingerSwipe({
    onSwipeRight: () => {
      if (onBackToHub) onBackToHub();
    }
  });

  const handlePeriodChange = (preset) => {
    setPeriodPreset(preset);
    if (preset !== 'custom') {
      const range = getDateRange(preset);
      setStartDate(range.start);
      setEndDate(range.end);
    }
  };

  const fetchReportData = async () => {
    setLoading(true);
    try {
      const [delRes, wasteRes, handRes, petRes] = await Promise.all([
        supabase
          .from('goods_received')
          .select('*')
          .eq('venue_id', DEFAULT_VENUE_ID)
          .gte('delivery_date', startDate)
          .lte('delivery_date', endDate),
        supabase
          .from('wastage_log')
          .select('*')
          .eq('venue_id', DEFAULT_VENUE_ID)
          .gte('created_at', `${startDate}T00:00:00Z`)
          .lte('created_at', `${endDate}T23:59:59Z`),
        supabase
          .from('handovers')
          .select('*')
          .eq('venue_id', DEFAULT_VENUE_ID)
          .gte('date_str', startDate)
          .lte('date_str', endDate),
        supabase
          .from('petty_cash')
          .select('*')
          .eq('venue_id', DEFAULT_VENUE_ID)
          .gte('date_str', startDate)
          .lte('date_str', endDate)
      ]);

      setDeliveries((delRes.data || []).map(d => ({ ...d, items: parseItems(d.items) })));
      setWastage(wasteRes.data || []);
      setHandovers(handRes.data || []);
      setPettyCash(petRes.data || []);
    } catch (err) {
      console.warn("Could not fetch reports data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, [startDate, endDate]);

  // --- Financial & Metric Calculations ---

  // Inventory / Stock Received & Lost
  const inventoryMetrics = useMemo(() => {
    let totalPurchasesEx = 0;
    let totalPurchasesInc = 0;
    const supplierMap = {};
    const categoryMap = {};

    deliveries.forEach(del => {
      (del.items || []).forEach(it => {
        const lineEx = Number(it.totalEx || (it.qty * it.unitEx) || 0);
        const lineInc = Number(it.totalInc || (lineEx * 1.20) || 0);
        totalPurchasesEx += lineEx;
        totalPurchasesInc += lineInc;

        const cat = it.category || 'General';
        categoryMap[cat] = (categoryMap[cat] || 0) + lineEx;
      });

      const sup = del.supplier || 'General';
      supplierMap[sup] = (supplierMap[sup] || 0) + Number(del.items?.reduce((acc, i) => acc + Number(i.totalEx || 0), 0) || 0);
    });

    let totalWastageCost = 0;
    const wasteReasonMap = {};
    wastage.forEach(w => {
      const cost = Number(w.cost_impact || 0);
      totalWastageCost += cost;
      const r = w.reason || 'General';
      wasteReasonMap[r] = (wasteReasonMap[r] || 0) + cost;
    });

    return {
      totalPurchasesEx: Math.round(totalPurchasesEx * 100) / 100,
      totalPurchasesInc: Math.round(totalPurchasesInc * 100) / 100,
      totalWastageCost: Math.round(totalWastageCost * 100) / 100,
      supplierMap,
      categoryMap,
      wasteReasonMap,
      deliveriesCount: deliveries.length,
      wastageCount: wastage.length
    };
  }, [deliveries, wastage]);

  // Takings & Cash Flow (from Handovers / Cash-ups)
  const takingsMetrics = useMemo(() => {
    let totalNetSales = 0;
    let totalGrossSales = 0;
    let totalTipsGrats = 0;
    let shiftsLogged = 0;

    handovers.forEach(h => {
      shiftsLogged += 1;
      const net = Number(h.net_sales || h.total_z || 0);
      const gross = Number(h.gross_sales || (net * 1.20) || 0);
      const grats = Number(h.service_charge || h.card_tips || 0);

      totalNetSales += net;
      totalGrossSales += gross;
      totalTipsGrats += grats;
    });

    return {
      totalNetSales: Math.round(totalNetSales * 100) / 100,
      totalGrossSales: Math.round(totalGrossSales * 100) / 100,
      totalTipsGrats: Math.round(totalTipsGrats * 100) / 100,
      shiftsLogged
    };
  }, [handovers]);

  // Petty Cash & Safe Float Variances
  const pettyCashMetrics = useMemo(() => {
    let totalExpenses = 0;
    let totalPaidIn = 0;
    let netVariance = 0;

    pettyCash.forEach(p => {
      totalExpenses += Number(p.total_expenses || 0);
      totalPaidIn += Number(p.total_paid_in || 0);
      netVariance += Number(p.variance || 0);
    });

    return {
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      totalPaidIn: Math.round(totalPaidIn * 100) / 100,
      netVariance: Math.round(netVariance * 100) / 100,
      entriesCount: pettyCash.length
    };
  }, [pettyCash]);

  // Master Executive Report (GP & Theoretical Pour Cost)
  const masterMetrics = useMemo(() => {
    const netSales = takingsMetrics.totalNetSales;
    const purchasesEx = inventoryMetrics.totalPurchasesEx;
    const wastageEx = inventoryMetrics.totalWastageCost;
    const pettyExpense = pettyCashMetrics.totalExpenses;

    const totalCostOfGoods = purchasesEx + wastageEx;
    const grossProfit = netSales > 0 ? (netSales - totalCostOfGoods) : 0;
    const gpMargin = netSales > 0 ? Math.round(((netSales - totalCostOfGoods) / netSales) * 1000) / 10 : 0;
    const costPercent = netSales > 0 ? Math.round((totalCostOfGoods / netSales) * 1000) / 10 : 0;

    return {
      netSales,
      purchasesEx,
      wastageEx,
      pettyExpense,
      totalCostOfGoods: Math.round(totalCostOfGoods * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      gpMargin,
      costPercent
    };
  }, [takingsMetrics, inventoryMetrics, pettyCashMetrics]);

  return (
    <div
      {...swipeHandlers}
      className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-white text-black font-sans antialiased border-x border-gray-200 overflow-hidden relative select-none"
    >
      {/* Top Header */}
      <header className="flex items-center justify-between px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-2 border-b border-gray-100 flex-shrink-0 bg-white z-20">
        <div className="flex items-center space-x-2">
          {onBackToHub && (
            <button onClick={onBackToHub} className="mr-0.5 p-1 -ml-1 text-gray-500 hover:text-black rounded-lg transition" title="Return to Hub">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="w-6 h-6 rounded bg-neutral-900 text-white flex items-center justify-center font-serif text-xs font-bold">
            W
          </div>
          <div>
            <h1 className="font-extrabold text-base tracking-tight text-gray-900 leading-tight">Financial &amp; Stock Reports</h1>
            <span className="text-[10px] text-gray-400 font-mono block">West Side Tavern • Period Audits</span>
          </div>
        </div>

        <button onClick={fetchReportData} className="p-1.5 text-gray-500 hover:text-black rounded-lg transition" title="Refresh">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* Report Section Tabs */}
      <div className="px-5 pt-2 pb-1.5 bg-gray-50/80 border-b border-gray-100 flex-shrink-0">
        <div className="grid grid-cols-4 bg-[#EDEDED] p-1 rounded-2xl gap-1">
          <button
            onClick={() => setActiveReport('inventory')}
            className={`py-1.5 text-[11px] font-bold rounded-xl transition text-center ${
              activeReport === 'inventory' ? 'bg-white text-black shadow-xs' : 'text-gray-500 hover:text-black'
            }`}
          >
            Inventory
          </button>
          <button
            onClick={() => setActiveReport('takings')}
            className={`py-1.5 text-[11px] font-bold rounded-xl transition text-center ${
              activeReport === 'takings' ? 'bg-white text-black shadow-xs' : 'text-gray-500 hover:text-black'
            }`}
          >
            Takings
          </button>
          <button
            onClick={() => setActiveReport('petty')}
            className={`py-1.5 text-[11px] font-bold rounded-xl transition text-center ${
              activeReport === 'petty' ? 'bg-white text-black shadow-xs' : 'text-gray-500 hover:text-black'
            }`}
          >
            Petty Cash
          </button>
          <button
            onClick={() => setActiveReport('master')}
            className={`py-1.5 text-[11px] font-bold rounded-xl transition text-center ${
              activeReport === 'master' ? 'bg-white text-black shadow-xs' : 'text-gray-500 hover:text-black'
            }`}
          >
            Master
          </button>
        </div>
      </div>

      {/* Date Range Selector Bar */}
      <div className="px-5 py-2.5 bg-white border-b border-gray-100 space-y-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400">
            Audit Period
          </span>
          <div className="flex items-center space-x-1">
            {[
              { id: 'this_week', label: 'This Wk' },
              { id: 'last_week', label: 'Last Wk' },
              { id: 'this_month', label: 'This Mo' },
              { id: 'custom', label: 'Custom' }
            ].map(p => (
              <button
                key={p.id}
                onClick={() => handlePeriodChange(p.id)}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition border ${
                  periodPreset === p.id
                    ? 'bg-black text-white border-black shadow-xs'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date Inputs */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="relative">
            <label className="text-[8px] font-bold uppercase text-gray-400 block mb-0.5">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPeriodPreset('custom');
              }}
              className="w-full bg-[#EDEDED] py-1 px-2 rounded-xl font-mono text-xs font-semibold focus:outline-none appearance-none"
            />
          </div>
          <div className="relative">
            <label className="text-[8px] font-bold uppercase text-gray-400 block mb-0.5">To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPeriodPreset('custom');
              }}
              className="w-full bg-[#EDEDED] py-1 px-2 rounded-xl font-mono text-xs font-semibold focus:outline-none appearance-none"
            />
          </div>
        </div>
      </div>

      {/* Report Body */}
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4 pb-28 touch-pan-y overscroll-contain">
        
        {/* TAB 1: INVENTORY REPORT */}
        {activeReport === 'inventory' && (
          <div className="space-y-3 animate-in fade-in duration-150">
            <div className="bg-gray-50 border border-gray-200 rounded-3xl p-4 space-y-2">
              <span className="text-[9px] font-mono uppercase text-gray-400 font-bold block">
                Wholesale Purchases vs. Spillage
              </span>
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-200">
                <div>
                  <span className="text-[10px] text-gray-500 block">Deliveries Net (Ex)</span>
                  <span className="text-base font-black text-gray-900 font-mono">
                    £{inventoryMetrics.totalPurchasesEx.toFixed(2)}
                  </span>
                  <span className="text-[9px] text-gray-400 font-mono block">
                    Gross: £{inventoryMetrics.totalPurchasesInc.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 block">Wastage / Loss</span>
                  <span className="text-base font-black text-rose-600 font-mono">
                    -£{inventoryMetrics.totalWastageCost.toFixed(2)}
                  </span>
                  <span className="text-[9px] text-gray-400 font-mono block">
                    {inventoryMetrics.wastageCount} entries logged
                  </span>
                </div>
              </div>
            </div>

            {/* Supplier Breakdown */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400 block">
                Purchases by Supplier ({Object.keys(inventoryMetrics.supplierMap).length})
              </span>
              <div className="border border-gray-200 rounded-2xl bg-white divide-y divide-gray-100 overflow-hidden shadow-2xs">
                {Object.keys(inventoryMetrics.supplierMap).length === 0 ? (
                  <p className="p-4 text-center text-xs text-gray-400 italic">No deliveries recorded in this period.</p>
                ) : (
                  Object.entries(inventoryMetrics.supplierMap).map(([sup, total]) => (
                    <div key={sup} className="p-2.5 flex items-center justify-between text-xs">
                      <span className="font-bold text-gray-900">{sup}</span>
                      <span className="font-mono font-bold text-gray-900">£{total.toFixed(2)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Wastage Breakdown by Reason */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400 block">
                Loss Breakdown by Reason
              </span>
              <div className="border border-gray-200 rounded-2xl bg-white divide-y divide-gray-100 overflow-hidden shadow-2xs">
                {Object.keys(inventoryMetrics.wasteReasonMap).length === 0 ? (
                  <p className="p-4 text-center text-xs text-gray-400 italic">No spillage logged in this period.</p>
                ) : (
                  Object.entries(inventoryMetrics.wasteReasonMap).map(([reason, cost]) => (
                    <div key={reason} className="p-2.5 flex items-center justify-between text-xs">
                      <span className="font-semibold text-gray-700">{reason}</span>
                      <span className="font-mono font-bold text-rose-600">-£{cost.toFixed(2)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TAKINGS REPORT */}
        {activeReport === 'takings' && (
          <div className="space-y-3 animate-in fade-in duration-150">
            <div className="bg-gray-50 border border-gray-200 rounded-3xl p-4 space-y-2">
              <span className="text-[9px] font-mono uppercase text-gray-400 font-bold block">
                Z-Report Net Sales &amp; Gratuities
              </span>
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-200">
                <div>
                  <span className="text-[10px] text-gray-500 block">Total Net Sales (Ex VAT)</span>
                  <span className="text-lg font-black text-gray-900 font-mono">
                    £{takingsMetrics.totalNetSales.toFixed(2)}
                  </span>
                  <span className="text-[9px] text-gray-400 font-mono block">
                    Gross: £{takingsMetrics.totalGrossSales.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 block">Service Charges &amp; Tips</span>
                  <span className="text-lg font-black text-emerald-700 font-mono">
                    £{takingsMetrics.totalTipsGrats.toFixed(2)}
                  </span>
                  <span className="text-[9px] text-gray-400 font-mono block">
                    Over {takingsMetrics.shiftsLogged} shifts
                  </span>
                </div>
              </div>
            </div>

            {/* Daily Shift Sales Log */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400 block">
                Handovers Logged in Period ({handovers.length})
              </span>
              <div className="border border-gray-200 rounded-2xl bg-white divide-y divide-gray-100 overflow-hidden shadow-2xs">
                {handovers.length === 0 ? (
                  <p className="p-4 text-center text-xs text-gray-400 italic">No shift handovers found for this period.</p>
                ) : (
                  handovers.map(h => (
                    <div key={h.id} className="p-2.5 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-gray-900 block">{h.date_str}</span>
                        <span className="text-[10px] text-gray-400 font-mono">{h.manager_name} • {h.entry_type || 'Shift Close'}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-gray-900 block">
                          £{Number(h.net_sales || h.total_z || 0).toFixed(2)}
                        </span>
                        <span className="text-[9px] text-gray-400 font-mono">
                          Tips: £{Number(h.service_charge || h.card_tips || 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: PETTY CASH REPORT */}
        {activeReport === 'petty' && (
          <div className="space-y-3 animate-in fade-in duration-150">
            <div className="bg-gray-50 border border-gray-200 rounded-3xl p-4 space-y-2">
              <span className="text-[9px] font-mono uppercase text-gray-400 font-bold block">
                Safe Float &amp; Petty Cash Audit
              </span>
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-200">
                <div>
                  <span className="text-[10px] text-gray-500 block">Total Expenses Claimed</span>
                  <span className="text-base font-black text-rose-600 font-mono">
                    £{pettyCashMetrics.totalExpenses.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 block">Cumulative Variance</span>
                  <span className={`text-base font-black font-mono ${pettyCashMetrics.netVariance < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {pettyCashMetrics.netVariance >= 0 ? '+' : ''}£{pettyCashMetrics.netVariance.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Petty Cash Entry History */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400 block">
                Cash Log History ({pettyCash.length})
              </span>
              <div className="border border-gray-200 rounded-2xl bg-white divide-y divide-gray-100 overflow-hidden shadow-2xs">
                {pettyCash.length === 0 ? (
                  <p className="p-4 text-center text-xs text-gray-400 italic">No petty cash counts logged for this period.</p>
                ) : (
                  pettyCash.map(p => (
                    <div key={p.id} className="p-2.5 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-gray-900 block">{p.date_str}</span>
                        <span className="text-[10px] text-gray-400 font-mono">
                          Counted by: {p.counted_by || 'Manager'}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-gray-900 block">
                          Expenses: £{Number(p.total_expenses || 0).toFixed(2)}
                        </span>
                        <span className={`text-[9px] font-mono block ${Number(p.variance || 0) < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          Var: {Number(p.variance || 0) >= 0 ? '+' : ''}£{Number(p.variance || 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: MASTER EXECUTIVE REPORT */}
        {activeReport === 'master' && (
          <div className="space-y-3 animate-in fade-in duration-150">
            {/* Key Performance Indicators */}
            <div className="bg-neutral-900 text-white rounded-3xl p-4 space-y-3 shadow-md">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[9px] font-mono uppercase text-emerald-400 font-bold block">
                    Venue P&amp;L Snapshot
                  </span>
                  <h3 className="text-base font-black text-white">Master Performance</h3>
                </div>
                <div className="text-right">
                  <span className="text-[9px] font-mono text-gray-400 block">Estimated GP %</span>
                  <span className={`text-lg font-black font-mono ${masterMetrics.gpMargin < 65 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {masterMetrics.gpMargin}%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10 font-mono text-xs">
                <div>
                  <span className="text-[10px] text-gray-400 block">Net Sales:</span>
                  <span className="font-bold text-white">£{masterMetrics.netSales.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 block">Total Cost of Goods:</span>
                  <span className="font-bold text-rose-400">£{masterMetrics.totalCostOfGoods.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Financial Ledger Breakdown */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400 block">
                Period Financial Breakdown
              </span>

              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3.5 space-y-2 text-xs font-mono">
                <div className="flex justify-between items-center text-gray-700">
                  <span>Net Turnover:</span>
                  <span className="font-bold text-gray-900">£{masterMetrics.netSales.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-gray-700">
                  <span>Delivered Wholesale Stock (Ex VAT):</span>
                  <span className="font-bold text-gray-900">-£{masterMetrics.purchasesEx.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-gray-700">
                  <span>Logged Stock Spillage / Loss:</span>
                  <span className="font-bold text-rose-600">-£{masterMetrics.wastageEx.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-gray-700">
                  <span>Petty Cash Expenses:</span>
                  <span className="font-bold text-gray-900">-£{masterMetrics.pettyExpense.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-gray-200 font-sans font-black text-sm text-black">
                  <span>Estimated Gross Profit:</span>
                  <span className="font-mono text-emerald-700 font-bold">£{masterMetrics.grossProfit.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Hub Nav */}
      <nav className="fixed bottom-2 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[390px] z-30 rounded-2xl bg-[#111111]/95 backdrop-blur-md text-white py-2 px-3 flex justify-around items-center text-xs font-semibold shadow-2xl border border-white/10 select-none pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
        <button
          onClick={onBackToHub}
          className="flex-1 py-1 text-center rounded-xl transition text-neutral-400 hover:text-white"
        >
          Return to Hub
        </button>
      </nav>
    </div>
  );
}