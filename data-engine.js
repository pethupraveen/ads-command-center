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

// ============================================================
// DERIVE KPI DATA — computes all metrics for the KPI Dashboard
// Called alongside computeActionPlan on every data load/refresh
// ============================================================
function deriveKpiData(dailyRows, productRows, placementRows) {
  const n = (v) => { const x = parseFloat(v); return isNaN(x) ? 0 : x; };
  const r2 = (x) => Math.round(x * 100) / 100;

  // ---- Daily trend ----
  const dayMap = {};
  dailyRows.forEach(r => {
    const d = dayMap[r.date] || (dayMap[r.date] = { spend:0, rev:0, imp:0, clk:0, units:0 });
    d.spend += n(r.ad_spend); d.rev += n(r.total_revenue);
    d.imp += n(r.impressions); d.clk += n(r.clicks); d.units += n(r.units_sold_total);
  });
  const daily_trend = Object.keys(dayMap).sort().map(k => {
    const v = dayMap[k];
    const roas = v.spend > 0 ? v.rev / v.spend : 0;
    const dd = k.length === 8 ? `${k.slice(6,8)}-${k.slice(4,6)}` : k;
    return { date: k, date_fmt: dd, spend: r2(v.spend), revenue: r2(v.rev), roas: r2(roas), units: Math.round(v.units),
             ctr: r2(v.imp > 0 ? (v.clk/v.imp)*100 : 0), cvr: r2(v.clk > 0 ? (v.units/v.clk)*100 : 0) };
  });

  // ---- Ad group aggregates ----
  const agMap = {};
  dailyRows.forEach(r => {
    const a = agMap[r.adgroup_name] || (agMap[r.adgroup_name] = { spend:0, rev:0, imp:0, clk:0, units:0 });
    a.spend += n(r.ad_spend); a.rev += n(r.total_revenue);
    a.imp += n(r.impressions); a.clk += n(r.clicks); a.units += n(r.units_sold_total);
  });
  const adgroups = Object.keys(agMap).map(name => {
    const v = agMap[name];
    const roas = v.spend > 0 ? v.rev / v.spend : 0;
    return { name, spend: r2(v.spend), revenue: r2(v.rev), roas: r2(roas),
             units: Math.round(v.units), impressions: Math.round(v.imp), clicks: Math.round(v.clk),
             ctr: r2(v.imp > 0 ? (v.clk/v.imp)*100 : 0), cvr: r2(v.clk > 0 ? (v.units/v.clk)*100 : 0) };
  }).sort((a,b) => b.revenue - a.revenue);

  // ---- Placement aggregates ----
  const plMap = {};
  placementRows.forEach(r => {
    const p = plMap[r.placement] || (plMap[r.placement] = { spend:0, rev:0, imp:0, clk:0, units:0 });
    p.spend += n(r.budget_spend); p.rev += n(r.total_revenue);
    p.imp += n(r.impressions); p.clk += n(r.clicks); p.units += n(r.units_sold_total);
  });
  const placements = Object.keys(plMap).map(name => {
    const v = plMap[name];
    const roas = v.spend > 0 ? v.rev / v.spend : 0;
    return { name, spend: r2(v.spend), revenue: r2(v.rev), roas: r2(roas),
             units: Math.round(v.units), impressions: Math.round(v.imp), clicks: Math.round(v.clk),
             ctr: r2(v.imp > 0 ? (v.clk/v.imp)*100 : 0), cvr: r2(v.clk > 0 ? (v.units/v.clk)*100 : 0) };
  }).filter(p => p.spend > 0).sort((a,b) => b.spend - a.spend);

  // ---- Product level ----
  const products = productRows.map(r => {
    const spend = n(r.budget_spend), rev = n(r.total_revenue), clk = n(r.clicks), units = n(r.units_sold_total);
    const roas = spend > 0 ? rev / spend : 0;
    return { id: r.product_id, name: r.product_name, adgroup: r.adgroup_name,
             spend: r2(spend), revenue: r2(rev), roas: r2(roas),
             units: Math.round(units), clicks: Math.round(clk),
             impressions: Math.round(n(r.impressions)),
             cvr: r2(clk > 0 ? (units/clk)*100 : 0), cpc: r2(n(r.avg_cpc)) };
  }).sort((a,b) => b.revenue - a.revenue);

  // ---- Summary KPIs ----
  const total_spend = adgroups.reduce((s,a) => s + a.spend, 0);
  const total_rev   = adgroups.reduce((s,a) => s + a.revenue, 0);
  const impressions = adgroups.reduce((s,a) => s + a.impressions, 0);
  const clicks      = adgroups.reduce((s,a) => s + a.clicks, 0);
  const units       = adgroups.reduce((s,a) => s + a.units, 0);
  const zeroRev     = products.filter(p => p.revenue === 0 && p.spend > 0);
  const dates       = daily_trend.map(d => d.date);
  const fmtDate     = (k) => { if (!k || k.length !== 8) return k;
    const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${k.slice(6,8)} ${mo[parseInt(k.slice(4,6),10)-1]} ${k.slice(0,4)}`; };

  return {
    summary: {
      total_spend: r2(total_spend), total_revenue: r2(total_rev),
      roas: total_spend > 0 ? r2(total_rev/total_spend) : 0, target_roas: 6.0,
      impressions, clicks, units,
      ctr: r2(impressions > 0 ? (clicks/impressions)*100 : 0),
      cvr: r2(clicks > 0 ? (units/clicks)*100 : 0),
      avg_cpc: r2(clicks > 0 ? total_spend/clicks : 0),
      zero_revenue_spend: r2(zeroRev.reduce((s,p) => s+p.spend, 0)),
      zero_revenue_count: zeroRev.length,
      date_range: dates.length ? `${fmtDate(dates[0])} – ${fmtDate(dates[dates.length-1])}` : '—',
      total_days: daily_trend.length, total_products: products.length,
      days_below_target: daily_trend.filter(d => d.roas < 6).length,
      campaign_name: dailyRows[0] ? dailyRows[0].campaign_name : '—',
    },
    daily_trend, adgroups, placements, products
  };
}
