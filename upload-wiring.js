// ============================================================
// UPLOAD UI WIRING
// ============================================================
const pendingFiles = { daily: null, product: null, placement: null };
const pendingRows = { daily: null, product: null, placement: null };

function openUploadPanel() { document.getElementById('upload-panel').classList.add('open'); }
function closeUploadPanel() { document.getElementById('upload-panel').classList.remove('open'); }

document.getElementById('open-upload-btn').addEventListener('click', openUploadPanel);
document.getElementById('close-upload-btn').addEventListener('click', closeUploadPanel);
document.getElementById('upload-panel').addEventListener('click', (e) => {
  if (e.target.id === 'upload-panel') closeUploadPanel();
});

['daily', 'product', 'placement'].forEach(slotKey => {
  const slotEl = document.querySelector(`.upload-slot[data-slot="${slotKey}"]`);
  const inputEl = document.getElementById(`file-${slotKey}`);
  const statusEl = document.getElementById(`status-${slotKey}`);

  slotEl.addEventListener('click', () => inputEl.click());

  slotEl.addEventListener('dragover', (e) => { e.preventDefault(); slotEl.style.borderColor = 'var(--fuchsia)'; });
  slotEl.addEventListener('dragleave', () => { slotEl.style.borderColor = ''; });
  slotEl.addEventListener('drop', (e) => {
    e.preventDefault();
    slotEl.style.borderColor = '';
    if (e.dataTransfer.files.length) handleFile(slotKey, e.dataTransfer.files[0]);
  });

  inputEl.addEventListener('change', (e) => {
    if (e.target.files.length) handleFile(slotKey, e.target.files[0]);
  });
});

function handleFile(slotKey, file) {
  const slotEl = document.querySelector(`.upload-slot[data-slot="${slotKey}"]`);
  const statusEl = document.getElementById(`status-${slotKey}`);

  if (!file.name.toLowerCase().endsWith('.csv')) {
    slotEl.classList.add('error'); slotEl.classList.remove('filled');
    statusEl.textContent = 'Please upload a .csv file';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const rows = parseCSV(text);
    const detected = detectReportType(rows);

    if (!detected) {
      slotEl.classList.add('error'); slotEl.classList.remove('filled');
      statusEl.textContent = 'Could not recognize this file\u2019s columns';
      pendingRows[slotKey] = null;
      checkProcessButton();
      return;
    }
    if (detected !== slotKey) {
      slotEl.classList.add('error'); slotEl.classList.remove('filled');
      statusEl.textContent = `This looks like a ${detected} report, not ${slotKey}`;
      pendingRows[slotKey] = null;
      checkProcessButton();
      return;
    }

    pendingFiles[slotKey] = file.name;
    pendingRows[slotKey] = rows;
    slotEl.classList.add('filled'); slotEl.classList.remove('error');
    statusEl.textContent = `${file.name} \u00b7 ${rows.length} rows`;
    checkProcessButton();
  };
  reader.onerror = () => {
    slotEl.classList.add('error');
    statusEl.textContent = 'Failed to read file';
  };
  reader.readAsText(file);
}

function checkProcessButton() {
  const anyReady = pendingRows.daily || pendingRows.product || pendingRows.placement;
  document.getElementById('process-btn').disabled = !anyReady;
}

document.getElementById('process-btn').addEventListener('click', async () => {
  const btn = document.getElementById('process-btn');
  const feedback = document.getElementById('upload-feedback');
  btn.disabled = true;
  btn.textContent = 'Processing\u2026';
  feedback.className = 'upload-feedback';
  feedback.textContent = '';

  try {
    const summaryParts = [];

    if (pendingRows.daily) {
      const { merged, datesUpdated } = await mergeDailyRows(pendingRows.daily);
      rawDailyRows = merged;
      summaryParts.push(`${datesUpdated.length} date(s) added/updated in daily history (now ${merged.length} rows total)`);
    }
    if (pendingRows.product) {
      rawProductRows = await replaceProductRows(pendingRows.product);
      summaryParts.push(`Product snapshot refreshed (${rawProductRows.length} SKUs)`);
    }
    if (pendingRows.placement) {
      rawPlacementRows = await replacePlacementRows(pendingRows.placement);
      summaryParts.push(`Placement snapshot refreshed (${rawPlacementRows.length} rows)`);
    }

    await saveStored(STORE_KEYS.meta, { lastUpload: new Date().toISOString() });

    actionPlan = computeActionPlan(rawDailyRows, rawProductRows, rawPlacementRows);
    lastGeneratedAt = new Date();

    renderAll();

    feedback.className = 'upload-feedback success';
    feedback.textContent = '\u2713 ' + summaryParts.join(' \u00b7 ');

    // reset pending slots after successful process
    ['daily', 'product', 'placement'].forEach(k => {
      pendingRows[k] = null; pendingFiles[k] = null;
      const slotEl = document.querySelector(`.upload-slot[data-slot="${k}"]`);
      slotEl.classList.remove('filled', 'error');
      document.getElementById(`status-${k}`).textContent = 'No file selected';
      document.getElementById(`file-${k}`).value = '';
    });
    checkProcessButton();

    setTimeout(() => { closeUploadPanel(); }, 1800);
  } catch (err) {
    feedback.className = 'upload-feedback error';
    feedback.textContent = 'Something went wrong processing the files: ' + err.message;
    console.error(err);
  } finally {
    btn.textContent = 'Process & Generate Brief';
    checkProcessButton();
  }
});

document.getElementById('clear-data-btn').addEventListener('click', async () => {
  if (!confirm('This clears data for EVERYONE on the team, not just you \u2014 daily history, product and placement snapshots, permanently. Continue?')) return;
  try {
    await deleteStored(STORE_KEYS.daily);
    await deleteStored(STORE_KEYS.product);
    await deleteStored(STORE_KEYS.placement);
    await deleteStored(STORE_KEYS.meta);
  } catch (e) { /* keys may not exist yet */ }

  rawDailyRows = []; rawProductRows = []; rawPlacementRows = [];
  actionPlan = null; lastGeneratedAt = null;
  renderAll();

  const feedback = document.getElementById('upload-feedback');
  feedback.className = 'upload-feedback success';
  feedback.textContent = '\u2713 All stored data cleared.';
});

function updateDataStatusBar() {
  const bar = document.getElementById('data-status-bar');
  if (!actionPlan || !rawProductRows.length) {
    bar.className = 'data-status-bar show empty';
    bar.textContent = 'No reports uploaded yet \u2014 click "Upload Today\u2019s Reports" above to get started.';
    return;
  }
  bar.className = 'data-status-bar show';
  bar.textContent = `Brief covers ${rawProductRows.length} SKUs across ${actionPlan.placementList.length} placements \u00b7 ${rawDailyRows.length} day-rows of history loaded`;
}

// ============================================================
// BOOT — load from storage, compute, render
// ============================================================
async function boot() {
  if (typeof SUPABASE_URL === 'undefined' || !SUPABASE_URL || SUPABASE_URL.includes('YOUR_PROJECT')) {
    document.getElementById('main-wrap').innerHTML = `
      <div class="empty-state">
        <h2>Setup needed</h2>
        <p>This site isn't connected to a database yet. Open <code>config.js</code> and add your Supabase URL and anon key \u2014 see the setup guide for the exact steps.</p>
      </div>
    `;
    document.getElementById('data-status-bar').className = 'data-status-bar show empty';
    document.getElementById('data-status-bar').textContent = 'Database not configured \u2014 see config.js';
    return;
  }

  try {
    const [storedDaily, storedProduct, storedPlacement, storedMeta] = await Promise.all([
      loadStored(STORE_KEYS.daily),
      loadStored(STORE_KEYS.product),
      loadStored(STORE_KEYS.placement),
      loadStored(STORE_KEYS.meta)
    ]);
    rawDailyRows = storedDaily || [];
    rawProductRows = storedProduct || [];
    rawPlacementRows = storedPlacement || [];

    if (rawProductRows.length) {
      actionPlan = computeActionPlan(rawDailyRows, rawProductRows, rawPlacementRows);
      lastGeneratedAt = storedMeta && storedMeta.lastUpload ? new Date(storedMeta.lastUpload) : new Date();
    }
    renderAll();

    // First-time users with no data: open the upload panel automatically
    if (!rawDailyRows.length && !rawProductRows.length && !rawPlacementRows.length) {
      openUploadPanel();
    }
  } catch (err) {
    document.getElementById('main-wrap').innerHTML = `
      <div class="empty-state">
        <h2>Couldn't reach the database</h2>
        <p>Check that your Supabase project is active and the URL/key in <code>config.js</code> are correct. (${err.message})</p>
      </div>
    `;
  }
}

document.getElementById('refresh-btn').addEventListener('click', () => {
  const btn = document.getElementById('refresh-btn');
  btn.disabled = true;
  btn.classList.add('spinning');
  boot().finally(() => { btn.disabled = false; btn.classList.remove('spinning'); });
});

boot();
