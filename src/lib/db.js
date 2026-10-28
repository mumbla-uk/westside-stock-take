import { createClient } from '@supabase/supabase-js';
import Dexie from 'dexie';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://xuchzhwdgrukoylzvjvl.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_szcofKuNIM98PsfNckZlLg_K0Fc-30D';
export const DEFAULT_VENUE_ID = 'a0000000-0000-0000-0000-000000000001';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Offline IndexedDB Schema
export const localDb = new Dexie('WST_OperationsDB');
localDb.version(1).stores({
  cached_catalog: 'id, supplier, area, category',
  pending_stock_counts: 'id, count, updatedAt',
  cached_handovers: 'id, dateStr, created_at',
  cached_staff: 'name, role'
});