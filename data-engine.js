// ============================================================
// CSV PARSER (handles quoted fields, commas inside quotes)
// ============================================================
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else { field += c; }
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).filter(r => r.length > 1 || r[0] !== '').map(r => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = r[i] !== undefined ? r[i].trim() : '');
    return obj;
  });
}

const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

// ============================================================
// REPORT TYPE DETECTION (by header signature)
// ============================================================
function detectReportType(rows) {
  if (!rows.length) return null;
  const keys = Object.keys(rows[0]);
  if (keys.includes('date') && keys.includes('ad_spend')) return 'daily';
  if (keys.includes('product_id') && keys.includes('product_name')) return 'product';
  if (keys.includes('placement') && keys.includes('budget_spend')) return 'placement';
  return null;
}

// ============================================================
// STORAGE — persisted via Supabase (shared across all visitors)
// Table: command_center_data (key text primary key, value jsonb)
// Configure SUPABASE_URL and SUPABASE_ANON_KEY in config.js
// ============================================================
const STORE_KEYS = {
  daily: 'pla:daily_rows',       // accumulates by date (merge/overwrite per date)
  product: 'pla:product_rows',   // latest snapshot
  placement: 'pla:placement_rows', // latest snapshot
  meta: 'pla:meta'               // last upload timestamps etc
};

const SUPABASE_TABLE = 'command_center_data';

function supabaseHeaders() {
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json'
  };
}

async function loadStored(key) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?key=eq.${encodeURIComponent(key)}&select=value`;
    const res = await fetch(url, { headers: supabaseHeaders() });
    if (!res.ok) return null;
    const rows = await res.json();
    return rows.length ? rows[0].value : null;
  } catch (e) {
    console.error('Supabase load failed', key, e);
    return null;
  }
}

async function saveStored(key, value) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...supabaseHeaders(), 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ key, value, updated_at: new Date().toISOString() })
    });
    return res.ok;
  } catch (e) {
    console.error('Supabase save failed', key, e);
    return false;
  }
}

async function deleteStored(key) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?key=eq.${encodeURIComponent(key)}`;
    await fetch(url, { method: 'DELETE', headers: supabaseHeaders() });
    return true;
  } catch (e) {
    console.error('Supabase delete failed', key, e);
    return false;
  }
}

// ============================================================
// MERGE LOGIC
// Daily report: append by date, new upload overwrites same-date rows
// Product / Placement: latest upload replaces previous snapshot entirely
// ============================================================
async function mergeDailyRows(newRows) {
  const existing = (await loadStored(STORE_KEYS.daily)) || [];
  const byDate = {};
  existing.forEach(r => {
    if (!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push(r);
  });
  // Group new rows by date, then overwrite those dates entirely
  const newDates = new Set(newRows.map(r => r.date));
  newDates.forEach(d => { byDate[d] = []; });
  newRows.forEach(r => byDate[r.date].push(r));

  const merged = Object.values(byDate).flat();
  await saveStored(STORE_KEYS.daily, merged);
  return { merged, datesUpdated: [...newDates] };
}

async function replaceProductRows(newRows) {
  await saveStored(STORE_KEYS.product, newRows);
  return newRows;
}
async function replacePlacementRows(newRows) {
  await saveStored(STORE_KEYS.placement, newRows);
  return newRows;
}
