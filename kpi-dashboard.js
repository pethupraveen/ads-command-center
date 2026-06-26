// ============================================================
// KPI DASHBOARD RENDERER
// Renders into #main-wrap when the KPI tab is active
// Depends on: kpiData (global), Chart.js (CDN)
// ============================================================

let _chartTrend = null, _chartRoas = null;

function renderKpiDashboard() {
  const wrap = document.getElementById('main-wrap');
  if (!kpiData || !rawProductRows.length) {
    wrap.innerHTML = `
      <div class="empty-state">
        <h2>No data yet</h2>
        <p>Upload today's Daily, Product &amp; Placement reports to populate the KPI Dashboard.</p>
      </div>`;
    return;
  }

  const { summary, daily_trend, adgroups, placements, products } = kpiData;

  wrap.innerHTML = `
    ${renderKpiStrip(summary)}
    <div class="kpi-grid-trend">
      <div class="chart-card">
        <h3>Daily Spend &amp; Revenue</h3>
        <div class="sub">${summary.date_range} &middot; ${summary.total_days} days</div>
        <div class="chart-box"><canvas id="chart-trend"></canvas></div>
      </div>
      <div class="chart-card">
        <h3>Daily ROAS vs 6x Target</h3>
        <div class="sub">${summary.days_below_target} of ${summary.total_days} days below target</div>
        <div class="chart-box"><canvas id="chart-roas"></canvas></div>
      </div>
    </div>
    <div class="kpi-grid-2">
      <div class="chart-card">
        <h3>Brand (Ad Group) Performance</h3>
        <div class="sub">Spend, Revenue &amp; ROAS by ad group</div>
        ${renderCompareList('adgroup-compare', adgroups, 'adgroups')}
      </div>
      <div class="chart-card">
        <h3>Placement Performance</h3>
        <div class="sub">Best and worst converting placements</div>
        ${renderCompareList('placement-compare', placements, 'placements')}
      </div>
    </div>
    ${renderProductTable(products)}
    <div class="footer">Generated from Consolidated Daily, Product &amp; Placement reports &middot; All figures in &#8377;</div>
  `;

  // Wire charts after DOM insertion
  wireTrendChart(daily_trend);
  wireRoasChart(daily_trend);
  wireProductTable(products);
}

// ---- KPI Strip ----
function renderKpiStrip(s) {
  const gap = s.target_roas - s.roas;
  const gaugePct = Math.min((s.roas / 12) * 100, 100);
  const markerPct = (s.target_roas / 12) * 100;
  return `
    <div class="kpi-strip">
      <div class="kpi-card hero">
        <div class="kpi-label">Blended ROAS</div>
        <div class="kpi-value num">${s.roas.toFixed(2)}x</div>
        <div class="kpi-delta ${gap > 0 ? 'bad' : 'good'}">
          ${gap > 0 ? '▼' : '▲'} ${Math.abs(gap).toFixed(2)}x ${gap > 0 ? 'below' : 'above'} target
        </div>
        <div class="gauge-track">
          <div class="gauge-fill" style="width:${gaugePct}%"></div>
          <div class="gauge-marker" style="left:${markerPct}%"></div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total Spend</div>
        <div class="kpi-value num">${fmtCompact(s.total_spend)}</div>
        <div class="kpi-sub">₹${fmtNum(s.total_spend.toFixed(0))} total</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total Revenue</div>
        <div class="kpi-value num">${fmtCompact(s.total_revenue)}</div>
        <div class="kpi-sub">₹${fmtNum(s.total_revenue.toFixed(0))} total</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Units Sold</div>
        <div class="kpi-value num">${s.units}</div>
        <div class="kpi-sub">${s.total_products} SKUs tracked</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">CTR / CVR</div>
        <div class="kpi-value num" style="font-size:20px;">${s.ctr}%<span style="color:var(--text-muted);font-size:14px;"> / </span>${s.cvr}%</div>
        <div class="kpi-sub">${fmtCompact(s.impressions)} impressions</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Wasted Spend</div>
        <div class="kpi-value num" style="color:var(--myntra);">${fmtCompact(s.zero_revenue_spend)}</div>
        <div class="kpi-sub">${s.zero_revenue_count} SKUs, ₹0 revenue</div>
      </div>
    </div>
  `;
}

// ---- Charts ----
function wireTrendChart(daily_trend) {
  if (_chartTrend) { _chartTrend.destroy(); _chartTrend = null; }
  if (!daily_trend.length) return;
  const ctx = document.getElementById('chart-trend');
  if (!ctx) return;
  _chartTrend = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: daily_trend.map(d => d.date_fmt),
      datasets: [
        { label: 'Spend', data: daily_trend.map(d => d.spend), backgroundColor: '#E4E2F0', borderRadius: 3, order: 2 },
        { label: 'Revenue', data: daily_trend.map(d => d.revenue), backgroundColor: '#FF3F6C', borderRadius: 3, order: 1 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'end', labels: { usePointStyle: true, pointStyle: 'circle', font: { family: 'Inter', size: 11, weight: '600' }, color: '#0F0E1A' } },
        tooltip: {
          backgroundColor: '#0F0E1A', padding: 12,
          bodyFont: { family: 'JetBrains Mono', size: 12 },
          callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ₹${Number(ctx.parsed.y).toLocaleString('en-IN')}` }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'JetBrains Mono', size: 10 }, color: '#9CA3AF' } },
        y: { grid: { color: '#F0EEF9' }, ticks: { font: { family: 'JetBrains Mono', size: 10 }, color: '#9CA3AF', callback: v => '₹' + (v >= 1000 ? (v/1000).toFixed(0)+'K' : v) } }
      }
    }
  });
}

function wireRoasChart(daily_trend) {
  if (_chartRoas) { _chartRoas.destroy(); _chartRoas = null; }
  if (!daily_trend.length) return;
  const ctx = document.getElementById('chart-roas');
  if (!ctx) return;
  _chartRoas = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels: daily_trend.map(d => d.date_fmt),
      datasets: [
        {
          label: 'Daily ROAS',
          data: daily_trend.map(d => d.roas),
          borderColor: '#FF3F6C', backgroundColor: 'rgba(255,63,108,.08)',
          fill: true, tension: 0.35, borderWidth: 2.5,
          pointRadius: 4, pointBorderWidth: 2, pointBorderColor: '#fff',
          pointBackgroundColor: daily_trend.map(d => d.roas >= 6 ? '#16A34A' : '#D97706')
        },
        {
          label: 'Target (6x)', data: daily_trend.map(() => 6),
          borderColor: '#16A34A', borderDash: [5, 4], borderWidth: 1.5,
          pointRadius: 0, fill: false
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'end', labels: { usePointStyle: true, pointStyle: 'circle', font: { family: 'Inter', size: 11, weight: '600' }, color: '#0F0E1A' } },
        tooltip: {
          backgroundColor: '#0F0E1A', padding: 12,
          bodyFont: { family: 'JetBrains Mono', size: 12 },
          callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}x` }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'JetBrains Mono', size: 10 }, color: '#9CA3AF' } },
        y: { grid: { color: '#F0EEF9' }, ticks: { font: { family: 'JetBrains Mono', size: 10 }, color: '#9CA3AF', callback: v => v + 'x' } }
      }
    }
  });
}

// ---- Brand / Placement Compare ----
function renderCompareList(id, items, type) {
  if (!items.length) return `<div style="color:var(--text-muted);font-size:13px;padding:16px 0;">No data available.</div>`;
  const maxSpend = Math.max(...items.map(i => i.spend));
  const totalRev = items.reduce((s, i) => s + i.revenue, 0);
  return `<div class="compare-list">${items.map(item => {
    const pct = (item.spend / maxSpend) * 100;
    const roas = item.roas;
    const color = roas >= 6 ? 'var(--green)' : roas >= 4 ? 'var(--amber)' : 'var(--myntra)';
    const tagClass = roas >= 6 ? 'tag-win' : roas >= 4 ? 'tag-warn' : 'tag-bad';
    const tagLabel = roas >= 6 ? 'ON TARGET' : roas >= 4 ? 'WATCH' : 'BELOW';
    const rowClass = roas >= 6 ? 'win' : roas < 4 ? 'flag' : '';
    return `<div class="compare-row ${rowClass}">
      <div class="compare-name">${item.name}</div>
      <div>
        <div class="compare-bar-track"><div class="compare-bar-fill" style="width:${pct}%;background:${color}"></div></div>
        <div class="compare-sub">₹${Number(item.spend.toFixed(0)).toLocaleString('en-IN')} spend &middot; ${item.units} units</div>
      </div>
      <div class="compare-roas" style="color:${color}">${roas.toFixed(2)}x</div>
      <span class="compare-tag ${tagClass}">${tagLabel}</span>
    </div>`;
  }).join('')}</div>`;
}

// ---- Product Table ----
let prodTableState = { sortKey: 'revenue', sortDir: 'desc', search: '', adgroup: 'all', page: 1 };
const PROD_PAGE_SIZE = 15;

function kpiActionBadge(p) {
  if (p.clicks >= 100 && p.units === 0) return { cls: 'badge-pause', label: 'PAUSE' };
  if (p.roas >= 8) return { cls: 'badge-scale', label: 'SCALE' };
  if (p.roas >= 4) return { cls: 'badge-maintain', label: 'MAINTAIN' };
  if (p.roas >= 2) return { cls: 'badge-reduce', label: 'REDUCE' };
  return { cls: 'badge-pause', label: 'PAUSE' };
}

function prodRoasClass(r) { return r >= 6 ? 'high' : r >= 3 ? 'mid' : 'low'; }

function renderProductTable(products) {
  const adgroups = ['all', ...new Set(products.map(p => p.adgroup))];
  const adgroupOpts = adgroups.map(ag => `<option value="${ag}" ${prodTableState.adgroup === ag ? 'selected' : ''}>${ag === 'all' ? 'All Brands' : ag}</option>`).join('');
  return `
    <div class="kpi-section-head">
      <h2>Product-Level Performance</h2>
      <span class="sub" id="prod-table-count"></span>
    </div>
    <div class="prod-controls">
      <div class="prod-search">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" id="prod-search" placeholder="Search Style ID or product…" value="${prodTableState.search}">
      </div>
      <select class="prod-filter" id="prod-adgroup-filter">${adgroupOpts}</select>
    </div>
    <div class="prod-table-wrap">
      <table class="prod-table">
        <thead><tr id="prod-table-head"></tr></thead>
        <tbody id="prod-table-body"></tbody>
      </table>
    </div>
    <div class="dt-pagination" id="prod-pagination"></div>
  `;
}

const PROD_COLS = [
  { key: 'id', label: 'Style ID', render: p => `<td class="prod-id-cell">${p.id}</td>` },
  { key: 'name', label: 'Product', render: p => `<td class="prod-name-cell">${truncName(stripBrandPrefix(p.name), 55)}</td>` },
  { key: 'adgroup', label: 'Brand', render: p => `<td><span class="dt-adgroup">${p.adgroup}</span></td>` },
  { key: 'spend', label: 'Spend', num: true, render: p => `<td class="num-col">${fmtINR(p.spend)}</td>` },
  { key: 'revenue', label: 'Revenue', num: true, render: p => `<td class="num-col">${fmtINR(p.revenue)}</td>` },
  { key: 'roas', label: 'ROAS', num: true, render: p => `<td class="num-col"><span class="prod-roas ${prodRoasClass(p.roas)}">${p.roas.toFixed(2)}x</span></td>` },
  { key: 'units', label: 'Units', num: true, render: p => `<td class="num-col">${p.units}</td>` },
  { key: 'clicks', label: 'Clicks', num: true, render: p => `<td class="num-col" style="color:var(--text-muted)">${p.clicks}</td>` },
  { key: 'cvr', label: 'CVR', num: true, render: p => `<td class="num-col" style="color:var(--text-muted)">${p.cvr.toFixed(2)}%</td>` },
  { key: 'action', label: 'Action', render: p => { const b = kpiActionBadge(p); return `<td><span class="action-badge ${b.cls}">${b.label}</span></td>`; } },
];

function wireProductTable(products) {
  const state = prodTableState;

  function getRows() {
    let rows = [...products];
    if (state.adgroup !== 'all') rows = rows.filter(p => p.adgroup === state.adgroup);
    if (state.search) {
      const q = state.search.toLowerCase();
      rows = rows.filter(p => String(p.id).toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
    }
    rows.sort((a, b) => {
      let av = a[state.sortKey], bv = b[state.sortKey];
      if (state.sortKey === 'action') { av = kpiActionBadge(a).label; bv = kpiActionBadge(b).label; }
      if (typeof av === 'string') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
      return state.sortDir === 'asc' ? (av < bv ? -1 : av > bv ? 1 : 0) : (av > bv ? -1 : av < bv ? 1 : 0);
    });
    return rows;
  }

  function renderHead() {
    document.getElementById('prod-table-head').innerHTML = PROD_COLS.map(col => `
      <th class="${col.num ? 'num-col' : ''} ${state.sortKey === col.key ? 'sorted' : ''}" data-key="${col.key}">${col.label}</th>
    `).join('');
    document.querySelectorAll('#prod-table-head th').forEach(th => {
      th.addEventListener('click', () => {
        if (state.sortKey === th.dataset.key) state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
        else { state.sortKey = th.dataset.key; state.sortDir = 'desc'; }
        state.page = 1; renderHead(); renderBody();
      });
    });
  }

  function renderBody() {
    const all = getRows();
    const total = all.length;
    const start = (state.page - 1) * PROD_PAGE_SIZE;
    const page = all.slice(start, start + PROD_PAGE_SIZE);
    document.getElementById('prod-table-count').textContent = `${total} of ${products.length} products`;
    document.getElementById('prod-table-body').innerHTML = page.map(p =>
      `<tr>${PROD_COLS.map(col => col.render(p)).join('')}</tr>`
    ).join('') || `<tr><td colspan="${PROD_COLS.length}" style="text-align:center;padding:24px;color:var(--text-muted)">No results match your filter.</td></tr>`;

    const totalPages = Math.max(1, Math.ceil(total / PROD_PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;
    const pg = document.getElementById('prod-pagination');
    if (totalPages <= 1) { pg.innerHTML = ''; return; }
    const pageEnd = Math.min(state.page * PROD_PAGE_SIZE, total);
    let btns = '';
    for (let i = 1; i <= totalPages; i++) {
      if (totalPages > 8 && i !== 1 && i !== totalPages && Math.abs(i - state.page) > 1) {
        if (i === 2 || i === totalPages - 1) btns += `<span class="dt-page-ellipsis">…</span>`;
        continue;
      }
      btns += `<button class="dt-page-btn ${i === state.page ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    pg.innerHTML = `
      <div class="dt-page-range">Rows ${start + 1}–${pageEnd} of ${total}</div>
      <div class="dt-page-controls">
        <button class="dt-page-nav" id="prod-prev" ${state.page === 1 ? 'disabled' : ''}>‹</button>
        ${btns}
        <button class="dt-page-nav" id="prod-next" ${state.page === totalPages ? 'disabled' : ''}>›</button>
      </div>`;
    document.getElementById('prod-prev').addEventListener('click', () => { state.page--; renderBody(); });
    document.getElementById('prod-next').addEventListener('click', () => { state.page++; renderBody(); });
    pg.querySelectorAll('.dt-page-btn').forEach(btn => {
      btn.addEventListener('click', () => { state.page = +btn.dataset.page; renderBody(); });
    });
  }

  renderHead();
  renderBody();

  document.getElementById('prod-search').addEventListener('input', e => {
    state.search = e.target.value; state.page = 1; renderBody();
  });
  document.getElementById('prod-adgroup-filter').addEventListener('change', e => {
    state.adgroup = e.target.value; state.page = 1; renderBody();
  });
}
