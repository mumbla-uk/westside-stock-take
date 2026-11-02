// Storage keys
const DEV_MODE_KEY = 'wst_dev_mode';
const MODULES_KEY = 'wst_enabled_modules';

export const ALL_MODULES = [
  { id: 'handover', label: 'Handover Diary', sub: 'Night close, Z-reports & shift log', category: 'Core' },
  { id: 'orders', label: 'Speed Count & Orders', sub: 'Stocktake & smart supplier orders', category: 'Core' },
  { id: 'petty', label: 'Cash Up & Float', sub: '£1,200 float balance & expense slips', category: 'Core' },
  { id: 'wastage', label: 'Spillage & Wastage', sub: 'Pints, ullage & broken bottle deductions', category: 'Core' },
  { id: 'goods', label: 'Stock & Deliveries', sub: 'Goods received check-in & invoice audit', category: 'Operations' },
  { id: 'prep', label: 'Prep Calculator', sub: 'Batch scaling, station pars & recipes', category: 'Kitchen/Bar' },
  { id: 'produce', label: 'Produce & Herbs', sub: 'Citrus, garnish & bar order list', category: 'Bar' },
  { id: 'catalog', label: 'Master Catalog', sub: 'Item costs, suppliers & packaging', category: 'Inventory' },
  { id: 'discussions', label: 'Action Threads', sub: 'Asynchronous shift task assignments', category: 'Comms' },
  { id: 'reports', label: 'Operations Reports', sub: 'Audit history, exports & analytics', category: 'Reports' }
];

// Default pillars enabled on fresh launch
export const DEFAULT_ENABLED_MODULES = ['handover', 'orders', 'petty', 'wastage'];

export function getDevMode() {
  return localStorage.getItem(DEV_MODE_KEY) === 'true';
}

export function setDevMode(val) {
  localStorage.setItem(DEV_MODE_KEY, String(val));
}

export function getEnabledModules() {
  try {
    const cached = localStorage.getItem(MODULES_KEY);
    if (!cached) return DEFAULT_ENABLED_MODULES;
    const parsed = JSON.parse(cached);
    return Array.isArray(parsed) ? parsed : DEFAULT_ENABLED_MODULES;
  } catch {
    return DEFAULT_ENABLED_MODULES;
  }
}

export function setEnabledModules(modulesArray) {
  localStorage.setItem(MODULES_KEY, JSON.stringify(modulesArray));
}

export function toggleModule(modId) {
  const current = getEnabledModules();
  let updated;
  if (current.includes(modId)) {
    // Keep at least one module active
    if (current.length === 1) return current;
    updated = current.filter(id => id !== modId);
  } else {
    updated = [...current, modId];
  }
  setEnabledModules(updated);
  return updated;
}