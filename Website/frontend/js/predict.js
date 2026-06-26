const API = 'http://localhost:8000';

let selectedFile = null;
let allResults   = [];
let downloadPath = null;

// ── Sidebar toggle ────────────────────────────────────────────────────────────
document.getElementById('toggleSidebar').addEventListener('click', () => {
  document.getElementById('app').classList.toggle('collapsed');
});

// ── API status ────────────────────────────────────────────────────────────────
(async function checkAPI() {
  try {
    const r = await fetch(`${API}/`, { signal: AbortSignal.timeout(3000) });
    document.getElementById('apiStatus').textContent = r.ok ? 'Online' : 'Error';
  } catch {
    document.getElementById('apiStatus').textContent = 'Offline';
    toast('Backend offline. Run: uvicorn main:app --reload --port 8000', 'error');
  }
})();

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<i class="fas fa-${type === 'error' ? 'circle-xmark' : type === 'success' ? 'circle-check' : 'circle-info'}"></i> ${msg}`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// ── Drag & drop ───────────────────────────────────────────────────────────────
function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('uploadZone').classList.add('drag-over');
}
function handleDragLeave(e) {
  e.preventDefault();
  document.getElementById('uploadZone').classList.remove('drag-over');
}
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('uploadZone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
}
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) processFile(file);
}

function processFile(file) {
  const allowed = ['.xlsx', '.xls', '.csv'];
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!allowed.includes(ext)) {
    toast('Only .xlsx, .xls, or .csv files are allowed.', 'error');
    return;
  }
  selectedFile = file;

  // Show file info bar
  document.getElementById('fileInfoBar').style.display = 'flex';
  document.getElementById('fileName').textContent = file.name;
  document.getElementById('fileSize').textContent = formatBytes(file.size);
  document.getElementById('predictBtn').disabled = false;
  document.getElementById('predictStatus').textContent = 'File ready. Click Predict.';

  // Hide previous results
  document.getElementById('resultsSection').style.display = 'none';
  document.getElementById('downloadBtn').style.display = 'none';
  downloadPath = null;

  // Show preview
  previewFile(file);
}

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}

function resetFile() {
  selectedFile = null;
  document.getElementById('fileInput').value = '';
  document.getElementById('fileInfoBar').style.display = 'none';
  document.getElementById('predictBtn').disabled = true;
  document.getElementById('predictStatus').textContent = '';
  document.getElementById('previewSection').style.display = 'none';
  document.getElementById('resultsSection').style.display = 'none';
  document.getElementById('downloadBtn').style.display = 'none';
  downloadPath = null;
}

// ── Preview file (client-side, first 10 rows) ─────────────────────────────────
async function previewFile(file) {
  const section = document.getElementById('previewSection');
  section.style.display = 'block';

  // Read file using SheetJS if available, otherwise show placeholder
  if (!window.XLSX) {
    // Lazy-load SheetJS
    await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
  }

  const data = await file.arrayBuffer();
  let wb;
  try {
    if (file.name.endsWith('.csv')) {
      const text = new TextDecoder().decode(data);
      wb = window.XLSX.read(text, { type: 'string' });
    } else {
      wb = window.XLSX.read(data, { type: 'array' });
    }
  } catch {
    document.getElementById('previewSubtitle').textContent = 'Preview unavailable';
    return;
  }

  const ws    = wb.Sheets[wb.SheetNames[0]];
  const rows  = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const headers = rows[0] || [];
  const dataRows = rows.slice(1, 11);

  document.getElementById('previewSubtitle').textContent =
    `Showing first ${Math.min(dataRows.length, 10)} of ${rows.length - 1} rows`;

  document.getElementById('previewHead').innerHTML =
    `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
  document.getElementById('previewBody').innerHTML =
    dataRows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('');
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ── Run prediction ────────────────────────────────────────────────────────────
async function runPrediction() {
  if (!selectedFile) return;

  const btn = document.getElementById('predictBtn');
  const status = document.getElementById('predictStatus');
  const progressWrap = document.getElementById('progressWrap');
  const progressFill = document.getElementById('progressFill');
  const progressLabel = document.getElementById('progressLabel');

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner spin"></i> Predicting…';
  progressWrap.style.display = 'block';

  // Animate progress bar
  let progress = 0;
  const progressTimer = setInterval(() => {
    progress = Math.min(progress + 2, 85);
    progressFill.style.width = progress + '%';
    progressLabel.textContent = progress < 30 ? 'Reading file…'
      : progress < 60 ? 'Running ML model…'
      : 'Generating results…';
  }, 80);

  try {
    const formData = new FormData();
    formData.append('file', selectedFile);

    const response = await fetch(`${API}/api/predict/upload`, {
      method: 'POST',
      body: formData,
    });

    clearInterval(progressTimer);

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Prediction failed');
    }

    progressFill.style.width = '100%';
    progressLabel.textContent = 'Done!';

    const result = await response.json();
    downloadPath = result.summary.download_path;
    allResults   = result.preview;

    renderResults(result.summary, result.preview);

    setTimeout(() => { progressWrap.style.display = 'none'; }, 800);
    toast(`Prediction complete! ${result.summary.churn_count} customers at risk.`, 'success');

  } catch (e) {
    clearInterval(progressTimer);
    progressWrap.style.display = 'none';
    toast(`Error: ${e.message}`, 'error');
    status.textContent = 'Prediction failed.';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-brain"></i> Predict Churn';
  }
}

// ── Render results ────────────────────────────────────────────────────────────
function renderResults(summary, preview) {
  const section = document.getElementById('resultsSection');
  section.style.display = 'block';

  // Summary cards
  document.getElementById('resultGrid').innerHTML = `
    <div class="result-card">
      <div class="result-num" style="color:#6366f1">${summary.total.toLocaleString()}</div>
      <div class="result-label">Total Customers</div>
    </div>
    <div class="result-card">
      <div class="result-num" style="color:#f43f5e">${summary.churn_count.toLocaleString()}</div>
      <div class="result-label">Predicted to Churn</div>
    </div>
    <div class="result-card">
      <div class="result-num" style="color:#10b981">${summary.keep_count.toLocaleString()}</div>
      <div class="result-label">Predicted to Stay</div>
    </div>
    <div class="result-card">
      <div class="result-num" style="color:#ef4444">${summary.high_risk.toLocaleString()}</div>
      <div class="result-label">HIGH Risk</div>
    </div>
    <div class="result-card">
      <div class="result-num" style="color:#f59e0b">${summary.medium_risk.toLocaleString()}</div>
      <div class="result-label">MEDIUM Risk</div>
    </div>
    <div class="result-card">
      <div class="result-num" style="color:#10b981">${summary.low_risk.toLocaleString()}</div>
      <div class="result-label">LOW Risk</div>
    </div>`;

  document.getElementById('resultSubtitle').textContent =
    `${summary.total} customers • ${summary.churn_rate}% predicted churn rate`;
  document.getElementById('downloadBtn').style.display = 'flex';

  renderResultTable(preview);
}

// ── Result table (with pagination) ───────────────────────────────────────────
let resultPage = 1;
const RESULT_PAGE_SIZE = 15;

function renderResultTable(data) {
  if (!data || data.length === 0) {
    document.getElementById('resultTableBody').innerHTML =
      '<tr><td colspan="99" style="text-align:center;padding:32px">No data</td></tr>';
    return;
  }

  // Build header from first row keys, push prediction columns to front
  const priorityCols = ['Churn Prediction','Churn Probability %','Risk Level','Recommendation'];
  const otherCols    = Object.keys(data[0]).filter(k => !priorityCols.includes(k));
  const cols         = [...priorityCols.filter(c => c in data[0]), ...otherCols];

  document.getElementById('resultTableHead').innerHTML =
    cols.map(c => `<th>${c}</th>`).join('');

  const paginated = data.slice((resultPage - 1) * RESULT_PAGE_SIZE, resultPage * RESULT_PAGE_SIZE);

  document.getElementById('resultTableBody').innerHTML = paginated.map(row => {
    const pred = row['Churn Prediction'];
    const risk = row['Risk Level'];
    const rowClass = pred === 1
      ? (risk === 'HIGH' ? 'result-row-churn' : 'result-row-monitor')
      : 'result-row-keep';
    const prob = row['Churn Probability %'] || 0;

    const cells = cols.map(c => {
      const v = row[c];
      if (c === 'Churn Prediction')
        return `<td>${v === 1
          ? '<span class="badge badge-yes">CHURN</span>'
          : '<span class="badge badge-no">STAY</span>'}</td>`;
      if (c === 'Churn Probability %')
        return `<td>
          <div class="risk-bar-wrap">
            <div class="risk-bar-inner">
              <div class="risk-bar-fill risk-${risk?.toLowerCase()}" style="width:${prob}%"></div>
            </div>
            <span style="font-size:12px;font-weight:600">${prob}%</span>
          </div></td>`;
      if (c === 'Risk Level')
        return `<td><span class="badge badge-${risk?.toLowerCase()}">${v}</span></td>`;
      if (c === 'Recommendation')
        return `<td><span class="badge badge-${v?.includes('DROP') ? 'drop' : v?.includes('MONITOR') ? 'monitor' : 'keep'}">${v}</span></td>`;
      return `<td>${v ?? ''}</td>`;
    }).join('');

    return `<tr class="${rowClass}">${cells}</tr>`;
  }).join('');

  // Pagination
  const pages = Math.ceil(data.length / RESULT_PAGE_SIZE);
  const bar = document.getElementById('resultPaginationBar');
  bar.innerHTML = `
    <span class="pagination-info">Showing ${Math.min((resultPage-1)*RESULT_PAGE_SIZE+1, data.length)}–${Math.min(resultPage*RESULT_PAGE_SIZE, data.length)} of ${data.length}</span>
    <div class="pagination-btns">
      <button class="pg-btn" onclick="gotoResultPage(${resultPage-1})" ${resultPage<=1?'disabled':''}>
        <i class="fas fa-chevron-left"></i></button>
      ${Array.from({length: Math.min(pages, 7)}, (_, i) => {
        const p = i + 1;
        return `<button class="pg-btn ${p===resultPage?'active':''}" onclick="gotoResultPage(${p})">${p}</button>`;
      }).join('')}
      <button class="pg-btn" onclick="gotoResultPage(${resultPage+1})" ${resultPage>=pages?'disabled':''}>
        <i class="fas fa-chevron-right"></i></button>
    </div>`;
}

function gotoResultPage(p) {
  resultPage = p;
  renderResultTable(getFilteredResults());
}

// ── Filter results ────────────────────────────────────────────────────────────
function getFilteredResults() {
  const riskFilter   = document.getElementById('riskFilter').value;
  const searchFilter = document.getElementById('resultsSearch').value.toLowerCase();
  return allResults.filter(r => {
    if (riskFilter && r['Risk Level'] !== riskFilter) return false;
    if (searchFilter) {
      return Object.values(r).some(v => String(v).toLowerCase().includes(searchFilter));
    }
    return true;
  });
}

function filterResults() {
  resultPage = 1;
  renderResultTable(getFilteredResults());
}

// ── Download results ──────────────────────────────────────────────────────────
async function downloadResults() {
  if (!downloadPath) { toast('No results to download. Run prediction first.', 'error'); return; }
  const btn = document.getElementById('downloadBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner spin"></i> Downloading…';
  try {
    const url = `${API}/api/predict/download?path=${encodeURIComponent(downloadPath)}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = 'churn_prediction_results.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast('Download started!', 'success');
  } catch {
    toast('Download failed.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-download"></i> Download Results';
  }
}

// ── Download template ─────────────────────────────────────────────────────────
async function downloadTemplate() {
  const btn = document.getElementById('templateBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner spin"></i>';
  try {
    const link = document.createElement('a');
    link.href = `${API}/api/predict/template`;
    link.download = 'churn_prediction_template.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast('Template downloaded!', 'success');
  } catch {
    toast('Could not download template. Is the backend running?', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-download"></i> Template';
  }
}
