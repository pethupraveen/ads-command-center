// ============================================================
// ACTION ENGINE — computes today's directives from raw rows
// All thresholds match the spec exactly. Stock condition is
// omitted: none of the 3 Myntra reports contain inventory data.
// ============================================================

function computeActionPlan(dailyRows, productRows, placementRows) {
  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

  // ---------------------------------------------------------
  // 1. SCALE STYLE IDS
  // ROAS >= 8, Orders >= 2, Revenue >= 500
  // ---------------------------------------------------------
  const scaleStyles = productRows.map(r => {
    const spend = num(r.budget_spend), revenue = num(r.total_revenue), orders = num(r.units_sold_total);
    const roas = spend > 0 ? revenue / spend : 0;
    return { id: r.product_id, name: r.product_name, adgroup: r.adgroup_name, spend, revenue, orders, roas };
  }).filter(p => p.roas >= 8 && p.orders >= 2 && p.revenue >= 500)
    .sort((a, b) => b.roas - a.roas)
    .map(p => ({
      ...p,
      recommendedIncrease: p.roas >= 15 ? 30 : p.roas >= 10 ? 25 : 20,
      reason: `High ROAS (${p.roas.toFixed(2)}x) with strong conversion — ${p.orders} orders on ₹${Math.round(p.revenue).toLocaleString('en-IN')} revenue`
    }));

  // ---------------------------------------------------------
  // 2. PAUSE STYLE IDS
  // ROAS < 2  OR  (Clicks >= 100 AND Orders = 0)
  // ---------------------------------------------------------
  const pauseStyles = productRows.map(r => {
    const spend = num(r.budget_spend), revenue = num(r.total_revenue), orders = num(r.units_sold_total), clicks = num(r.clicks);
    const roas = spend > 0 ? revenue / spend : 0;
    let reason = null;
    if (clicks >= 100 && orders === 0) reason = `${Math.round(clicks)} clicks, 0 orders — pure spend waste`;
    else if (roas < 2) reason = `ROAS ${roas.toFixed(2)}x — below 2x floor`;
    return { id: r.product_id, name: r.product_name, adgroup: r.adgroup_name, spend, revenue, orders, clicks, roas, reason };
  }).filter(p => p.reason)
    .sort((a, b) => b.spend - a.spend);

  // ---------------------------------------------------------
  // Ad Group aggregation (from daily rows — has full traffic)
  // ---------------------------------------------------------
  const dayDates = [...new Set(dailyRows.map(r => r.date))].sort();
  const midpoint = Math.floor(dayDates.length / 2);
  const firstHalfDates = new Set(dayDates.slice(0, midpoint));
  const secondHalfDates = new Set(dayDates.slice(midpoint));

  const agTotals = {};
  const agTrend = {};
  dailyRows.forEach(r => {
    const a = agTotals[r.adgroup_name] || (agTotals[r.adgroup_name] = { spend: 0, revenue: 0 });
    a.spend += num(r.ad_spend); a.revenue += num(r.total_revenue);
    const t = agTrend[r.adgroup_name] || (agTrend[r.adgroup_name] = { first: 0, second: 0 });
    if (firstHalfDates.has(r.date)) t.first += num(r.total_revenue);
    else t.second += num(r.total_revenue);
  });

  const totalRevenue = Object.values(agTotals).reduce((s, a) => s + a.revenue, 0);
  const adGroups = Object.keys(agTotals).map(name => {
    const a = agTotals[name];
    const roas = a.spend > 0 ? a.revenue / a.spend : 0;
    const contribution = totalRevenue > 0 ? (a.revenue / totalRevenue) * 100 : 0;
    const trend = agTrend[name] || { first: 0, second: 0 };
    const declining = dayDates.length >= 2 && trend.second < trend.first;
    return { name, spend: a.spend, revenue: a.revenue, roas, contribution, declining, trendFirst: trend.first, trendSecond: trend.second };
  });

  // ---------------------------------------------------------
  // 3. INCREASE AD GROUP BUDGET
  // Ad Group ROAS > 7 AND Revenue Contribution > 15%
  // ---------------------------------------------------------
  const increaseAdGroups = adGroups.filter(a => a.roas > 7 && a.contribution > 15)
    .sort((a, b) => b.roas - a.roas)
    .map(a => ({
      ...a,
      increasePct: a.roas >= 12 ? 30 : a.roas >= 10 ? 25 : a.roas > 7 ? 20 : 15,
      reason: `ROAS ${a.roas.toFixed(2)}x with ${a.contribution.toFixed(1)}% of total revenue — your strongest lever`
    }));

  // ---------------------------------------------------------
  // 4. REDUCE AD GROUP BUDGET
  // ROAS < 4  OR  Revenue declining (second half < first half)
  // ---------------------------------------------------------
  const reduceAdGroups = adGroups.filter(a => a.roas < 4 || a.declining)
    .sort((a, b) => a.roas - b.roas)
    .map(a => {
      const reasons = [];
      if (a.roas < 4) reasons.push(`ROAS ${a.roas.toFixed(2)}x — below 4x floor`);
      if (a.declining) reasons.push(`revenue declining (₹${Math.round(a.trendFirst).toLocaleString('en-IN')} \u2192 ₹${Math.round(a.trendSecond).toLocaleString('en-IN')})`);
      return {
        ...a,
        reducePct: a.roas < 2 ? 30 : a.roas < 3 ? 25 : 20,
        reason: reasons.join(' AND ')
      };
    });

  // ---------------------------------------------------------
  // 5 & 6. PLACEMENT OPTIMIZATION
  // ---------------------------------------------------------
  const plTotals = {};
  placementRows.forEach(r => {
    const p = plTotals[r.placement] || (plTotals[r.placement] = { spend: 0, revenue: 0 });
    p.spend += num(r.budget_spend); p.revenue += num(r.total_revenue);
  });
  const placementList = Object.keys(plTotals).map(name => {
    const p = plTotals[name];
    const roas = p.spend > 0 ? p.revenue / p.spend : 0;
    return { name, spend: p.spend, revenue: p.revenue, roas };
  }).filter(p => p.spend > 0).sort((a, b) => b.roas - a.roas);

  const bestPlacement = placementList.length ? placementList[0] : null;
  const worstPlacement = placementList.length ? placementList[placementList.length - 1] : null;
  const scalePlacements = placementList.filter(p => p.roas > 8);
  const reducePlacements = placementList.filter(p => p.roas < 4);

  // ---------------------------------------------------------
  // BUDGET REALLOCATION ENGINE
  // Move spend wasted by PAUSE styles to SCALE styles
  // ---------------------------------------------------------
  const totalPauseSpend = pauseStyles.reduce((s, p) => s + p.spend, 0);
  const reallocationSources = [...pauseStyles].sort((a, b) => b.spend - a.spend).slice(0, 5);
  const reallocationDestinations = [...scaleStyles].sort((a, b) => b.roas - a.roas).slice(0, 5);

  // ---------------------------------------------------------
  // EXECUTIVE SUMMARY
  // ---------------------------------------------------------
  const totalSpend = adGroups.reduce((s, a) => s + a.spend, 0);
  const totalRev = adGroups.reduce((s, a) => s + a.revenue, 0);
  const currentRoas = totalSpend > 0 ? totalRev / totalSpend : 0;

  // Expected ROAS impact: remove pause spend (0 contribution), reallocate it
  // at the blended ROAS of the scale-tier destinations
  const scaleBlendedRoas = reallocationDestinations.length
    ? reallocationDestinations.reduce((s, p) => s + p.revenue, 0) / reallocationDestinations.reduce((s, p) => s + p.spend, 0)
    : currentRoas;
  const projectedRevenue = totalRev + (totalPauseSpend * scaleBlendedRoas);
  const projectedRoas = totalSpend > 0 ? projectedRevenue / totalSpend : 0;

  return {
    scaleStyles, pauseStyles, increaseAdGroups, reduceAdGroups,
    placementList, bestPlacement, worstPlacement, scalePlacements, reducePlacements,
    totalPauseSpend, reallocationSources, reallocationDestinations,
    summary: {
      totalSpend, totalRevenue: totalRev, currentRoas, projectedRoas,
      scaleCount: scaleStyles.length, pauseCount: pauseStyles.length,
      increaseCount: increaseAdGroups.length, reduceCount: reduceAdGroups.length,
      pauseSpendRecovered: totalPauseSpend
    }
  };
}
