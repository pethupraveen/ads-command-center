// ============================================================
// EXPORT — builds a multi-sheet .xlsx from the live action plan
// Sheets: Executive Summary, Scale Style IDs, Pause Style IDs,
// Increase Ad Group Budget, Reduce Ad Group Budget,
// Placement Optimization, Budget Reallocation
// ============================================================

function buildActionPlanWorkbook(plan, generatedAt) {
  const wb = XLSX.utils.book_new();
  const r2 = (n) => Math.round(n * 100) / 100;

  // ---------- Executive Summary ----------
  const execRows = [
    ['EOR-SALE \u00b7 Ads Command Center \u2014 Daily Action Plan'],
    ['Generated', generatedAt],
    [],
    ['Metric', 'Value'],
    ["Today's Scale Count", plan.summary.scaleCount],
    ["Today's Pause Count", plan.summary.pauseCount],
    ['Budget Increase Recommendations', plan.summary.increaseCount],
    ['Budget Reduction Recommendations', plan.summary.reduceCount],
    ['Total Spend Recoverable from Pause', r2(plan.summary.pauseSpendRecovered)],
    ['Current Blended ROAS', r2(plan.summary.currentRoas)],
    ['Projected ROAS After Reallocation', r2(plan.summary.projectedRoas)],
  ];
  const execSheet = XLSX.utils.aoa_to_sheet(execRows);
  execSheet['!cols'] = [{ wch: 38 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, execSheet, 'Executive Summary');

  // ---------- 1. Scale Style IDs ----------
  const scaleHeader = ['Style ID', 'SKU / Product Name', 'Brand (Ad Group)', 'Current ROAS', 'Orders', 'Revenue', 'Spend', 'Recommended Budget Increase %', 'Reason'];
  const scaleRows = plan.scaleStyles.map(p => [
    p.id, p.name, p.adgroup, r2(p.roas), p.orders, r2(p.revenue), r2(p.spend), `+${p.recommendedIncrease}%`, p.reason
  ]);
  const scaleSheet = XLSX.utils.aoa_to_sheet([scaleHeader, ...scaleRows]);
  scaleSheet['!cols'] = [{ wch: 12 }, { wch: 42 }, { wch: 14 }, { wch: 12 }, { wch: 9 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 55 }];
  XLSX.utils.book_append_sheet(wb, scaleSheet, 'Scale Style IDs');

  // ---------- 2. Pause Style IDs ----------
  const pauseHeader = ['Style ID', 'SKU / Product Name', 'Brand (Ad Group)', 'Spend', 'Clicks', 'Orders', 'Revenue', 'Current ROAS', 'Reason', 'Action'];
  const pauseRows = plan.pauseStyles.map(p => [
    p.id, p.name, p.adgroup, r2(p.spend), Math.round(p.clicks), p.orders, r2(p.revenue), r2(p.roas), p.reason, 'Pause Immediately'
  ]);
  const pauseSheet = XLSX.utils.aoa_to_sheet([pauseHeader, ...pauseRows]);
  pauseSheet['!cols'] = [{ wch: 12 }, { wch: 42 }, { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 45 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, pauseSheet, 'Pause Style IDs');

  // ---------- 3. Increase Ad Group Budget ----------
  const incHeader = ['Ad Group', 'Spend', 'Revenue', 'ROAS', 'Revenue Contribution %', 'Budget Increase %', 'Reason'];
  const incRows = plan.increaseAdGroups.map(a => [
    a.name, r2(a.spend), r2(a.revenue), r2(a.roas), r2(a.contribution), `+${a.increasePct}%`, a.reason
  ]);
  const incSheet = XLSX.utils.aoa_to_sheet([incHeader, ...incRows]);
  incSheet['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 16 }, { wch: 55 }];
  XLSX.utils.book_append_sheet(wb, incSheet, 'Increase Ad Group Budget');

  // ---------- 4. Reduce Ad Group Budget ----------
  const decHeader = ['Ad Group', 'Spend', 'Revenue', 'ROAS', 'Budget Reduction %', 'Reason'];
  const decRows = plan.reduceAdGroups.map(a => [
    a.name, r2(a.spend), r2(a.revenue), r2(a.roas), `-${a.reducePct}%`, a.reason
  ]);
  const decSheet = XLSX.utils.aoa_to_sheet([decHeader, ...decRows]);
  decSheet['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, decSheet, 'Reduce Ad Group Budget');

  // ---------- 5. Placement Optimization ----------
  const plHeader = ['Placement', 'Spend', 'Revenue', 'ROAS', 'Recommendation'];
  const plRows = plan.placementList.map(p => {
    let rec = 'Monitor \u2014 no action needed';
    if (p.roas > 8) rec = 'Increase spend';
    else if (p.roas < 4) rec = 'Reduce spend';
    if (plan.bestPlacement && p.name === plan.bestPlacement.name) rec += ' (Best Placement)';
    if (plan.worstPlacement && p.name === plan.worstPlacement.name) rec += ' (Worst Placement)';
    return [p.name, r2(p.spend), r2(p.revenue), r2(p.roas), rec];
  });
  const plSheet = XLSX.utils.aoa_to_sheet([plHeader, ...plRows]);
  plSheet['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 38 }];
  XLSX.utils.book_append_sheet(wb, plSheet, 'Placement Optimization');

  // ---------- 6. Budget Reallocation Engine ----------
  const reallocRows = [
    ['Budget Reallocation Engine'],
    ['Total Spend Recoverable from Pause Styles', r2(plan.totalPauseSpend)],
    [],
    ['MOVE FROM (Pause Styles)', '', '', 'MOVE TO (Scale Styles)', ''],
    ['Style ID', 'Spend', '', 'Style ID', 'ROAS'],
  ];
  const maxLen = Math.max(plan.reallocationSources.length, plan.reallocationDestinations.length);
  for (let i = 0; i < maxLen; i++) {
    const src = plan.reallocationSources[i];
    const dst = plan.reallocationDestinations[i];
    reallocRows.push([
      src ? src.id : '', src ? r2(src.spend) : '', '',
      dst ? dst.id : '', dst ? r2(dst.roas) : ''
    ]);
  }
  const reallocSheet = XLSX.utils.aoa_to_sheet(reallocRows);
  reallocSheet['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 4 }, { wch: 14 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, reallocSheet, 'Budget Reallocation');

  return wb;
}

function downloadActionPlan() {
  if (!actionPlan) return;
  const generatedAt = lastGeneratedAt ? formatTimestamp(lastGeneratedAt) : formatTimestamp(new Date());
  const wb = buildActionPlanWorkbook(actionPlan, generatedAt);
  const dateForFilename = lastGeneratedAt
    ? lastGeneratedAt.toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `EOR-SALE_Action_Plan_${dateForFilename}.xlsx`);
}

document.getElementById('download-btn').addEventListener('click', downloadActionPlan);
