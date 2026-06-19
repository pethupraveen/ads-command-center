// ============================================================
// LIVE STATE
// ============================================================
let rawDailyRows = [], rawProductRows = [], rawPlacementRows = [];
let actionPlan = null;
let lastGeneratedAt = null;

const fmtINR = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
const fmtINRFull = (n, d = 0) => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d });
const fmtNum = (n) => Number(n).toLocaleString('en-IN');
const fmtCompact = (n) => {
  if (n >= 100000) return (n / 100000).toFixed(2) + 'L';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return Math.round(n).toString();
};
const truncName = (name, len = 48) => name.length > len ? name.slice(0, len - 1) + '\u2026' : name;
const stripBrandPrefix = (name) => name.replace(/^SPRIG\s*/i, '');

function formatTimestamp(d) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`;
}

// ============================================================
// MAIN RENDER — builds the entire #main-wrap from scratch
// ============================================================
function renderAll() {
  const wrap = document.getElementById('main-wrap');
  document.getElementById('brief-timestamp').textContent = lastGeneratedAt ? formatTimestamp(lastGeneratedAt) : '\u2014';

  if (!actionPlan || !rawProductRows.length) {
    wrap.innerHTML = `
      <div class="empty-state">
        <h2>No brief generated yet</h2>
        <p>Upload today's Daily, Product &amp; Placement reports to generate today's action plan \u2014 scale calls, pause calls, and budget moves, computed fresh from the data.</p>
      </div>
    `;
    document.getElementById('download-btn').disabled = true;
    updateDataStatusBar();
    return;
  }

  document.getElementById('download-btn').disabled = false;

  const s = actionPlan.summary;
  const gapDirection = s.projectedRoas >= s.currentRoas ? 'improves' : 'changes';

  wrap.innerHTML = `
    ${renderBriefingHeader(s)}
    ${renderSection1Scale()}
    ${renderSection2Pause()}
    ${renderSection3Increase()}
    ${renderSection4Decrease()}
    ${renderSection5Placement()}
    ${renderSection6Reallocation()}
    <div class="footer">Generated from Consolidated Daily, Product &amp; Placement reports &middot; All figures in \u20b9</div>
  `;

  updateDataStatusBar();
}

// ============================================================
// BRIEFING HEADER + EXECUTIVE SUMMARY
// ============================================================
function renderBriefingHeader(s) {
  return `
    <div class="briefing">
      <div class="briefing-eyebrow"><span class="pulse"></span>Today's Action Plan</div>
      <h1>${s.scaleCount} styles to scale. ${s.pauseCount} to pause.</h1>
      <div class="sub">Every directive below is computed fresh from the reports you uploaded \u2014 not a static report. Work through each section in order.</div>

      <div class="exec-grid">
        <div class="exec-card">
          <div class="exec-label">Scale Styles</div>
          <div class="exec-value scale">${s.scaleCount}</div>
          <div class="exec-sub">ROAS \u2265 8x, 2+ orders</div>
        </div>
        <div class="exec-card">
          <div class="exec-label">Pause Styles</div>
          <div class="exec-value pause">${s.pauseCount}</div>
          <div class="exec-sub">${fmtINR(s.pauseSpendRecovered)} recoverable</div>
        </div>
        <div class="exec-card">
          <div class="exec-label">Budget Increases</div>
          <div class="exec-value" style="color:var(--text-on-dark);">${s.increaseCount}</div>
          <div class="exec-sub">ad group${s.increaseCount === 1 ? '' : 's'} flagged</div>
        </div>
        <div class="exec-card">
          <div class="exec-label">Budget Reductions</div>
          <div class="exec-value" style="color:var(--text-on-dark);">${s.reduceCount}</div>
          <div class="exec-sub">ad group${s.reduceCount === 1 ? '' : 's'} flagged</div>
        </div>
        <div class="exec-card highlight">
          <div class="exec-label">Expected ROAS Impact</div>
          <div class="roas-arrow">
            <span class="from num">${s.currentRoas.toFixed(2)}x</span>
            <span class="arrow">\u2192</span>
            <span class="to num">${s.projectedRoas.toFixed(2)}x</span>
          </div>
          <div class="exec-sub">if today's reallocation is executed</div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// SECTION 1: SCALE STYLE IDS
// ============================================================
function renderSection1Scale() {
  const items = actionPlan.scaleStyles;
  const rows = items.length
    ? items.map(p => `
        <div class="directive-card scale">
          <div class="dc-id">${p.id}</div>
          <div class="dc-body">
            <div class="dc-name">${truncName(stripBrandPrefix(p.name))}</div>
            <div class="dc-meta"><span class="dc-adgroup">${p.adgroup}</span>${p.orders} orders &middot; ${fmtINR(p.revenue)} revenue</div>
            <div class="dc-reason">${p.reason}</div>
          </div>
          <div class="dc-metric">
            <div class="dc-roas scale num">${p.roas.toFixed(2)}x</div>
            <div class="dc-metric-label">Current ROAS</div>
          </div>
          <div class="dc-action scale">+${p.recommendedIncrease}% Budget</div>
        </div>
      `).join('')
    : `<div class="empty-row">No styles currently clear the SCALE bar (ROAS \u2265 8x, 2+ orders, \u20b9500+ revenue).</div>`;

  return `
    <div class="action-section">
      <div class="section-bar">
        <div class="section-num n-scale">1</div>
        <div class="section-title">Scale Style IDs</div>
        <div class="section-count">${items.length} styles</div>
      </div>
      <div class="directive-grid">${rows}</div>
    </div>
  `;
}

// ============================================================
// SECTION 2: PAUSE STYLE IDS
// ============================================================
function renderSection2Pause() {
  const items = actionPlan.pauseStyles;
  const rows = items.length
    ? items.map(p => `
        <div class="directive-card pause">
          <div class="dc-id">${p.id}</div>
          <div class="dc-body">
            <div class="dc-name">${truncName(stripBrandPrefix(p.name))}</div>
            <div class="dc-meta"><span class="dc-adgroup">${p.adgroup}</span>${fmtINR(p.spend)} spend &middot; ${Math.round(p.clicks)} clicks &middot; ${p.orders} orders &middot; ${fmtINR(p.revenue)} revenue</div>
            <div class="dc-reason">${p.reason}</div>
          </div>
          <div class="dc-metric">
            <div class="dc-roas pause num">${p.roas.toFixed(2)}x</div>
            <div class="dc-metric-label">Current ROAS</div>
          </div>
          <div class="dc-action pause">Pause Immediately</div>
        </div>
      `).join('')
    : `<div class="empty-row">No styles currently trigger a PAUSE condition. Nothing to cut today.</div>`;

  return `
    <div class="action-section">
      <div class="section-bar">
        <div class="section-num n-pause">2</div>
        <div class="section-title">Pause Style IDs</div>
        <div class="section-count">${items.length} styles \u00b7 ${fmtINR(actionPlan.totalPauseSpend)} at risk</div>
      </div>
      <div class="directive-grid">${rows}</div>
    </div>
  `;
}

// ============================================================
// SECTION 3: INCREASE AD GROUP BUDGET
// ============================================================
function renderSection3Increase() {
  const items = actionPlan.increaseAdGroups;
  const cards = items.length
    ? items.map(a => `
        <div class="budget-card increase">
          <div class="budget-card-head">
            <div class="budget-ag-name">${a.name}</div>
            <div class="budget-pct increase">+${a.increasePct}%</div>
          </div>
          <div class="budget-stats">
            <div>
              <div class="budget-stat-label">Spend</div>
              <div class="budget-stat-value">${fmtINR(a.spend)}</div>
            </div>
            <div>
              <div class="budget-stat-label">Revenue</div>
              <div class="budget-stat-value">${fmtINR(a.revenue)}</div>
            </div>
            <div>
              <div class="budget-stat-label">ROAS</div>
              <div class="budget-stat-value" style="color:#1A8A6C;">${a.roas.toFixed(2)}x</div>
            </div>
          </div>
          <div class="budget-reason">${a.reason}</div>
        </div>
      `).join('')
    : `<div class="empty-row">No ad group currently clears both conditions (ROAS &gt; 7x AND revenue contribution &gt; 15%).</div>`;

  return `
    <div class="action-section">
      <div class="section-bar">
        <div class="section-num n-incr">3</div>
        <div class="section-title">Increase Ad Group Budget</div>
        <div class="section-count">${items.length} ad group${items.length === 1 ? '' : 's'}</div>
      </div>
      <div class="budget-grid">${cards}</div>
    </div>
  `;
}

// ============================================================
// SECTION 4: REDUCE AD GROUP BUDGET
// ============================================================
function renderSection4Decrease() {
  const items = actionPlan.reduceAdGroups;
  const cards = items.length
    ? items.map(a => `
        <div class="budget-card decrease">
          <div class="budget-card-head">
            <div class="budget-ag-name">${a.name}</div>
            <div class="budget-pct decrease">\u2212${a.reducePct}%</div>
          </div>
          <div class="budget-stats">
            <div>
              <div class="budget-stat-label">Spend</div>
              <div class="budget-stat-value">${fmtINR(a.spend)}</div>
            </div>
            <div>
              <div class="budget-stat-label">Revenue</div>
              <div class="budget-stat-value">${fmtINR(a.revenue)}</div>
            </div>
            <div>
              <div class="budget-stat-label">ROAS</div>
              <div class="budget-stat-value" style="color:#B85C00;">${a.roas.toFixed(2)}x</div>
            </div>
          </div>
          <div class="budget-reason">${a.reason}</div>
        </div>
      `).join('')
    : `<div class="empty-row">No ad group currently triggers a reduce condition (ROAS &lt; 4x or declining revenue).</div>`;

  return `
    <div class="action-section">
      <div class="section-bar">
        <div class="section-num n-decr">4</div>
        <div class="section-title">Reduce Ad Group Budget</div>
        <div class="section-count">${items.length} ad group${items.length === 1 ? '' : 's'}</div>
      </div>
      <div class="budget-grid">${cards}</div>
    </div>
  `;
}

// ============================================================
// SECTION 5: PLACEMENT OPTIMIZATION
// ============================================================
function renderSection5Placement() {
  const { bestPlacement, worstPlacement, scalePlacements, reducePlacements } = actionPlan;

  if (!bestPlacement) {
    return `
      <div class="action-section">
        <div class="section-bar">
          <div class="section-num n-place">5</div>
          <div class="section-title">Placement Optimization</div>
        </div>
        <div class="empty-row">No placement spend recorded in this upload.</div>
      </div>
    `;
  }

  const recRows = [];
  scalePlacements.forEach(p => recRows.push(`
    <div class="placement-rec scale">
      <span class="placement-rec-name">Increase spend \u2014 ${p.name}</span>
      <span class="placement-rec-roas" style="color:#1A8A6C;">${p.roas.toFixed(2)}x</span>
    </div>
  `));
  reducePlacements.forEach(p => recRows.push(`
    <div class="placement-rec reduce">
      <span class="placement-rec-name">Reduce spend \u2014 ${p.name}</span>
      <span class="placement-rec-roas" style="color:#B85C00;">${p.roas.toFixed(2)}x</span>
    </div>
  `));
  const recHtml = recRows.length
    ? recRows.join('')
    : `<div class="empty-row" style="text-align:left;">No placement crosses the 8x or 4x thresholds today \u2014 ${bestPlacement.name} and ${worstPlacement.name} both sit in the middle band. Monitor, no action needed yet.</div>`;

  return `
    <div class="action-section">
      <div class="section-bar">
        <div class="section-num n-place">5</div>
        <div class="section-title">Placement Optimization</div>
      </div>
      <div class="placement-summary">
        <div class="placement-hero best">
          <div class="placement-hero-label">Best Placement</div>
          <div class="placement-hero-name">${bestPlacement.name}</div>
          <div class="placement-hero-roas num">${bestPlacement.roas.toFixed(2)}x</div>
          <div class="placement-hero-meta">${fmtINR(bestPlacement.spend)} spend &middot; ${fmtINR(bestPlacement.revenue)} revenue</div>
        </div>
        <div class="placement-hero worst">
          <div class="placement-hero-label">Worst Placement</div>
          <div class="placement-hero-name">${worstPlacement.name}</div>
          <div class="placement-hero-roas num">${worstPlacement.roas.toFixed(2)}x</div>
          <div class="placement-hero-meta">${fmtINR(worstPlacement.spend)} spend &middot; ${fmtINR(worstPlacement.revenue)} revenue</div>
        </div>
      </div>
      <div class="placement-rec-list">${recHtml}</div>
    </div>
  `;
}

// ============================================================
// SECTION 6: BUDGET REALLOCATION ENGINE
// ============================================================
function renderSection6Reallocation() {
  const { totalPauseSpend, reallocationSources, reallocationDestinations } = actionPlan;

  if (!reallocationSources.length || !reallocationDestinations.length) {
    return `
      <div class="action-section">
        <div class="section-bar">
          <div class="section-num n-realloc">6</div>
          <div class="section-title">Budget Reallocation Engine</div>
        </div>
        <div class="empty-row">Not enough PAUSE or SCALE styles today to compute a reallocation move.</div>
      </div>
    `;
  }

  const fromHtml = reallocationSources.map(p => `
    <div class="realloc-item">
      <span class="realloc-item-id">${p.id}</span>
      <span class="realloc-item-val">${fmtINR(p.spend)}</span>
    </div>
  `).join('');
  const toHtml = reallocationDestinations.map(p => `
    <div class="realloc-item">
      <span class="realloc-item-id">${p.id}</span>
      <span class="realloc-item-val">${p.roas.toFixed(1)}x</span>
    </div>
  `).join('');

  return `
    <div class="action-section">
      <div class="section-bar">
        <div class="section-num n-realloc">6</div>
        <div class="section-title">Budget Reallocation Engine</div>
      </div>
      <div class="realloc-box">
        <div class="realloc-headline">Move <span class="amt num">${fmtINR(totalPauseSpend)}</span> from paused spend to your winners</div>
        <div class="realloc-sub">Sourced from all ${actionPlan.pauseStyles.length} PAUSE styles &middot; top 5 shown on each side &middot; routed to your highest-ROAS SCALE styles</div>
        <div class="realloc-flow">
          <div class="realloc-col from">
            <h4>From (Pause)</h4>
            ${fromHtml}
          </div>
          <div class="realloc-arrow-col">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14m0 0-6-6m6 6-6 6"/></svg>
          </div>
          <div class="realloc-col to">
            <h4>To (Scale)</h4>
            ${toHtml}
          </div>
        </div>
      </div>
    </div>
  `;
}
