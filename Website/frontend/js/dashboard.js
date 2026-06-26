// ── Config ────────────────────────────────────────────────────────────────────
const API_HTTP = 'http://localhost:8000';
const API_WS   = 'ws://localhost:8000/ws/dashboard';

// Chart instances — initialized once, updated via updateSeries() on refresh
const charts = {};
let chartsReady  = false;   // true after first render
let isFirstData  = true;    // drives count-up animation (only on first message)

// WebSocket state
let ws             = null;
let reconnectTimer = null;
let reconnectDelay = 1000;  // ms, doubles on each failure up to 15 s

// ── Shared ApexCharts defaults ────────────────────────────────────────────────
const BASE = {
  chart:       { toolbar: { show: false }, fontFamily: 'Inter, sans-serif',
                 animations: { speed: 450, easing: 'easeinout' } },
  tooltip:     { theme: 'dark' },
  dataLabels:  { enabled: false },
  grid:        { borderColor: '#f1f5f9', strokeDashArray: 4 },
};

// ── Sidebar toggle ────────────────────────────────────────────────────────────
document.getElementById('toggleSidebar').addEventListener('click', () =>
  document.getElementById('app').classList.toggle('collapsed'));

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  const icon = { success: 'circle-check', error: 'circle-xmark', info: 'circle-info' }[type] || 'circle-info';
  t.innerHTML = `<i class="fas fa-${icon}"></i> ${msg}`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ── Connection status badge ───────────────────────────────────────────────────
function setStatus(status) {
  const label = document.getElementById('apiStatus');
  const dot   = document.querySelector('.model-badge i');
  const colors = { online: '#10b981', offline: '#ef4444', connecting: '#f59e0b' };
  const texts  = { online: 'Live', offline: 'Offline', connecting: 'Connecting…' };
  if (label) label.textContent = texts[status] ?? status;
  if (dot)   dot.style.color   = colors[status] ?? '#94a3b8';
}

// ── WebSocket connection with auto-reconnect ──────────────────────────────────
function connectWS() {
  setStatus('connecting');

  ws = new WebSocket(API_WS);

  ws.onopen = () => {
    reconnectDelay = 1000;
    setStatus('online');
    if (!isFirstData) toast('Reconnected to live feed', 'info');
  };

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.error) { toast('Server error: ' + data.error, 'error'); return; }
      handleData(data);
      const el = document.getElementById('lastUpdated');
      if (el) el.textContent = 'Live · ' + new Date().toLocaleTimeString();
    } catch {
      toast('Received invalid data from server', 'error');
    }
  };

  ws.onclose = () => {
    setStatus('offline');
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, 15000);
      connectWS();
    }, reconnectDelay);
  };

  ws.onerror = () => ws.close();  // triggers onclose which handles reconnect
}

// Manual refresh — sends a ping; if WS is closed, reconnects immediately
function manualRefresh() {
  const icon = document.getElementById('refreshIcon');
  if (icon) { icon.classList.add('spin'); setTimeout(() => icon.classList.remove('spin'), 800); }

  if (ws && ws.readyState === WebSocket.OPEN) {
    // Close and reopen so server sends a fresh payload immediately
    ws.close();
  } else {
    clearTimeout(reconnectTimer);
    reconnectDelay = 1000;
    connectWS();
  }
}

// ── Master data handler ───────────────────────────────────────────────────────
function handleData(data) {
  updateKPI(data.summary);

  if (!chartsReady) {
    initAllCharts(data);
    chartsReady = true;
    loadTable(1);         // load table once on first data
  } else {
    updateAllCharts(data);
  }
  isFirstData = false;
}

// ── KPI Cards ─────────────────────────────────────────────────────────────────
function countUp(el, target, suffix = '', dec = 0) {
  if (!el) return;
  let cur = 0;
  const inc = target / (900 / 14);
  const t = setInterval(() => {
    cur = Math.min(cur + inc, target);
    el.textContent = cur.toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + suffix;
    if (cur >= target) clearInterval(t);
  }, 14);
}

function updateKPI(s) {
  const grid = document.getElementById('kpiGrid');

  if (isFirstData) {
    grid.innerHTML = `
      <div class="kpi-card kpi-indigo">
        <div class="kpi-icon"><i class="fas fa-users"></i></div>
        <div>
          <div class="kpi-value" id="kv1">0</div>
          <div class="kpi-label">Total Customers</div>
        </div>
      </div>
      <div class="kpi-card kpi-rose">
        <div class="kpi-icon"><i class="fas fa-person-walking-arrow-right"></i></div>
        <div>
          <div class="kpi-value" id="kv2">0%</div>
          <div class="kpi-label">Churn Rate</div>
          <div class="kpi-sub" id="kv2s"></div>
        </div>
      </div>
      <div class="kpi-card kpi-emerald">
        <div class="kpi-icon"><i class="fas fa-dollar-sign"></i></div>
        <div>
          <div class="kpi-value" id="kv3">$0</div>
          <div class="kpi-label">Avg Monthly Charge</div>
          <div class="kpi-sub" id="kv3s"></div>
        </div>
      </div>
      <div class="kpi-card kpi-amber">
        <div class="kpi-icon"><i class="fas fa-clock-rotate-left"></i></div>
        <div>
          <div class="kpi-value" id="kv4">0</div>
          <div class="kpi-label">Avg Tenure (months)</div>
          <div class="kpi-sub" id="kv4s"></div>
        </div>
      </div>`;

    // Animated count-up only on first load
    setTimeout(() => {
      countUp(document.getElementById('kv1'), +s.total_customers);
      countUp(document.getElementById('kv2'), +s.churn_rate, '%', 1);
      countUp(document.getElementById('kv3'), +s.avg_monthly_charge, '', 2);
      countUp(document.getElementById('kv4'), +s.avg_tenure, '', 1);
      // Prefix dollar signs after animation
      const kv3 = document.getElementById('kv3');
      const origTick = kv3.textContent;
      kv3.textContent = '$' + (+s.avg_monthly_charge).toFixed(2);
    }, 50);
  } else {
    // Silent update — no re-animation on WS refresh
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('kv1', (+s.total_customers).toLocaleString());
    set('kv2', s.churn_rate + '%');
    set('kv3', '$' + (+s.avg_monthly_charge).toFixed(2));
    set('kv4', (+s.avg_tenure).toFixed(1));
  }

  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set('kv2s', (+s.total_churned).toLocaleString() + ' churned');
  set('kv3s', '$' + (s.total_revenue / 1e6).toFixed(1) + 'M total revenue');
  set('kv4s', 'CLTV avg $' + (+s.avg_cltv).toLocaleString());
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function clearEl(id) {
  const el = document.getElementById(id);
  el.innerHTML = '';
  return el;
}

// ── Init all charts (called once) ─────────────────────────────────────────────
function initAllCharts(d) {
  initChurnDonut(d.churn_distribution);
  initContractChart(d.by_contract);
  initInternetChart(d.by_internet);
  initPaymentChart(d.by_payment);
  initTenureChart(d.tenure_histogram);
  initChargesChart(d.charges_histogram);
  initSeniorChart(d.by_senior);
  initReasonsChart(d.churn_reasons);
}

// ── Update all charts via updateSeries (no re-render) ────────────────────────
function updateAllCharts(d) {
  charts.donut?.updateSeries(d.churn_distribution.map(x => x.value));

  charts.contract?.updateSeries([
    { name: 'Churned',  data: d.by_contract.map(x => x.churned)  },
    { name: 'Retained', data: d.by_contract.map(x => x.retained) },
  ]);

  charts.internet?.updateSeries([
    { name: 'Churn Rate %', data: d.by_internet.map(x => x.churn_rate) },
  ]);

  charts.payment?.updateSeries([
    { name: 'Churned',  data: d.by_payment.map(x => x.churned)  },
    { name: 'Retained', data: d.by_payment.map(x => x.retained) },
  ]);

  charts.tenure?.updateSeries([
    { name: 'Churned',  data: d.tenure_histogram.churned  },
    { name: 'Retained', data: d.tenure_histogram.retained },
  ]);

  charts.charges?.updateSeries([
    { name: 'Churned',  data: d.charges_histogram.churned  },
    { name: 'Retained', data: d.charges_histogram.retained },
  ]);

  charts.senior?.updateSeries([
    { name: 'Churned',  data: d.by_senior.map(x => x.churned)  },
    { name: 'Retained', data: d.by_senior.map(x => x.retained) },
  ]);

  charts.reasons?.updateSeries([
    { name: 'Customers', data: [...d.churn_reasons].reverse().map(x => x.count) },
  ]);
}

// ── Chart initializers ────────────────────────────────────────────────────────

function initChurnDonut(data) {
  charts.donut = new ApexCharts(clearEl('churnDonut'), {
    ...BASE,
    chart: { ...BASE.chart, type: 'donut', height: 300 },
    series: data.map(d => d.value),
    labels: data.map(d => d.label === 'No' ? 'Retained' : 'Churned'),
    colors: ['#10b981', '#f43f5e'],
    legend: { position: 'bottom', fontFamily: 'Inter', fontSize: '13px' },
    plotOptions: { pie: { donut: { size: '65%', labels: { show: true,
      total: { show: true, label: 'Churn Rate',
        formatter: w => {
          const [no, yes] = w.globals.seriesTotals;
          return ((yes / (no + yes)) * 100).toFixed(1) + '%';
        },
      },
    }}}},
  });
  charts.donut.render();
}

function initContractChart(data) {
  charts.contract = new ApexCharts(clearEl('contractChart'), {
    ...BASE,
    chart: { ...BASE.chart, type: 'bar', height: 300 },
    series: [
      { name: 'Churned',  data: data.map(d => d.churned)  },
      { name: 'Retained', data: data.map(d => d.retained) },
    ],
    xaxis:  { categories: data.map(d => d.contract) },
    colors: ['#f43f5e', '#10b981'],
    plotOptions: { bar: { borderRadius: 4, columnWidth: '50%' } },
    yaxis:  { title: { text: 'Customers' } },
    legend: { position: 'top' },
  });
  charts.contract.render();
}

function initInternetChart(data) {
  charts.internet = new ApexCharts(clearEl('internetChart'), {
    ...BASE,
    chart: { ...BASE.chart, type: 'bar', height: 300 },
    series: [{ name: 'Churn Rate %', data: data.map(d => d.churn_rate) }],
    xaxis:  { categories: data.map(d => d.internet_service) },
    colors: ['#6366f1'],
    plotOptions: { bar: { borderRadius: 6, columnWidth: '45%',
      dataLabels: { position: 'top' } } },
    dataLabels: { enabled: true, formatter: v => v + '%',
      offsetY: -22, style: { fontSize: '12px', colors: ['#374151'] } },
    yaxis: { max: 50, title: { text: 'Churn Rate (%)' } },
  });
  charts.internet.render();
}

function initPaymentChart(data) {
  const short = s => s.replace(' (automatic)', ' (auto)');
  charts.payment = new ApexCharts(clearEl('paymentChart'), {
    ...BASE,
    chart: { ...BASE.chart, type: 'bar', height: 300 },
    series: [
      { name: 'Churned',  data: data.map(d => d.churned)  },
      { name: 'Retained', data: data.map(d => d.retained) },
    ],
    xaxis:  { categories: data.map(d => short(d.payment_method)),
              labels: { style: { fontSize: '11px' } } },
    colors: ['#f43f5e', '#10b981'],
    plotOptions: { bar: { borderRadius: 4, columnWidth: '55%' } },
    yaxis:  { title: { text: 'Customers' } },
    legend: { position: 'top' },
  });
  charts.payment.render();
}

function initTenureChart(data) {
  charts.tenure = new ApexCharts(clearEl('tenureChart'), {
    ...BASE,
    chart: { ...BASE.chart, type: 'bar', height: 300 },
    series: [
      { name: 'Churned',  data: data.churned  },
      { name: 'Retained', data: data.retained },
    ],
    xaxis:  { categories: data.categories, title: { text: 'Tenure (months)' } },
    colors: ['#f43f5e', '#10b981'],
    plotOptions: { bar: { borderRadius: 3, columnWidth: '70%' } },
    yaxis:  { title: { text: 'Customers' } },
    legend: { position: 'top' },
  });
  charts.tenure.render();
}

function initChargesChart(data) {
  charts.charges = new ApexCharts(clearEl('chargesChart'), {
    ...BASE,
    chart: { ...BASE.chart, type: 'bar', height: 300 },
    series: [
      { name: 'Churned',  data: data.churned  },
      { name: 'Retained', data: data.retained },
    ],
    xaxis:  { categories: data.categories, title: { text: 'Monthly Charges' } },
    colors: ['#f43f5e', '#10b981'],
    plotOptions: { bar: { borderRadius: 3, columnWidth: '70%' } },
    yaxis:  { title: { text: 'Customers' } },
    legend: { position: 'top' },
  });
  charts.charges.render();
}

function initSeniorChart(data) {
  charts.senior = new ApexCharts(clearEl('seniorChart'), {
    ...BASE,
    chart: { ...BASE.chart, type: 'bar', height: 300 },
    series: [
      { name: 'Churned',  data: data.map(d => d.churned)  },
      { name: 'Retained', data: data.map(d => d.retained) },
    ],
    xaxis:  { categories: data.map(d => d.senior_citizen === 'Yes' ? 'Senior' : 'Non-Senior') },
    colors: ['#f43f5e', '#10b981'],
    plotOptions: { bar: { borderRadius: 6, columnWidth: '35%',
      dataLabels: { position: 'top' } } },
    dataLabels: {
      enabled: true,
      formatter: (val, opts) =>
        opts.seriesIndex === 0 ? data[opts.dataPointIndex].churn_rate + '%' : '',
      style: { fontSize: '11px', colors: ['#dc2626', 'transparent'] },
    },
    yaxis:  { title: { text: 'Customers' } },
    legend: { position: 'top' },
  });
  charts.senior.render();
}

function initReasonsChart(data) {
  const trim = s => s.length > 38 ? s.slice(0, 36) + '…' : s;
  const rev  = [...data].reverse();
  charts.reasons = new ApexCharts(clearEl('reasonsChart'), {
    ...BASE,
    chart: { ...BASE.chart, type: 'bar', height: 340 },
    series: [{ name: 'Customers', data: rev.map(d => d.count) }],
    xaxis:  { categories: rev.map(d => trim(d.reason)),
              labels: { style: { fontSize: '11px' } } },
    colors: ['#6366f1'],
    plotOptions: { bar: { borderRadius: 4, horizontal: true, barHeight: '60%',
      dataLabels: { position: 'right' } } },
    dataLabels: { enabled: true, offsetX: 8,
      style: { fontSize: '11px', colors: ['#374151'] } },
  });
  charts.reasons.render();
}

// ── Customer Table (HTTP — has pagination/search/filter) ──────────────────────
let currentPage   = 1;
let searchTimeout = null;

function debounceSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => loadTable(1), 380);
}

async function loadTable(page = 1) {
  currentPage = page;
  const search = document.getElementById('tableSearch')?.value ?? '';
  const churn  = document.getElementById('churnFilter')?.value ?? '';
  const tbody  = document.getElementById('tableBody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text-muted)">
    <i class="fas fa-spinner spin"></i> Loading…</td></tr>`;

  try {
    const p    = new URLSearchParams({ page, per_page: 10, search, churn });
    const data = await fetch(`${API_HTTP}/api/stats/customers?${p}`).then(r => r.json());

    const sub = document.getElementById('tableSubtitle');
    if (sub) sub.textContent =
      `${data.total.toLocaleString()} customers · Page ${data.page} of ${data.pages}`;

    tbody.innerHTML = data.data.map(r => `
      <tr>
        <td><code style="font-size:11px">${r.customer_id}</code></td>
        <td>${r.gender}</td>
        <td>${r.senior_citizen === 'Yes'
          ? '<span class="badge badge-yes">Yes</span>'
          : '<span class="badge badge-no">No</span>'}</td>
        <td>${r.tenure_months}</td>
        <td style="font-size:12px">${r.contract}</td>
        <td>${r.internet_service}</td>
        <td>$${(+r.monthly_charges).toFixed(2)}</td>
        <td>$${(+r.total_charges).toFixed(2)}</td>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <div class="progress-bar-wrap" style="width:60px">
              <div class="progress-bar-fill" style="width:${r.churn_score}%;
                background:${r.churn_score>70?'#ef4444':r.churn_score>40?'#f59e0b':'#10b981'}">
              </div>
            </div>
            <span style="font-size:11px">${r.churn_score}</span>
          </div>
        </td>
        <td><span class="badge badge-${r.churn_label==='Yes'?'yes':'no'}">${r.churn_label}</span></td>
      </tr>`).join('');

    renderPagination(data.page, data.pages);
  } catch {
    tbody.innerHTML = `<tr><td colspan="10"
      style="text-align:center;padding:32px;color:#ef4444">
      <i class="fas fa-triangle-exclamation"></i> Failed to load table.
    </td></tr>`;
  }
}

function renderPagination(page, pages) {
  const bar = document.getElementById('paginationBar');
  if (!bar) return;
  const start = Math.max(1, page - 2);
  const end   = Math.min(pages, page + 2);
  let btns = `<button class="pg-btn" onclick="loadTable(${page-1})" ${page<=1?'disabled':''}>
    <i class="fas fa-chevron-left"></i></button>`;
  if (start > 1) {
    btns += `<button class="pg-btn" onclick="loadTable(1)">1</button>`;
    if (start > 2) btns += `<span style="padding:0 4px;color:var(--text-muted)">…</span>`;
  }
  for (let i = start; i <= end; i++)
    btns += `<button class="pg-btn ${i===page?'active':''}" onclick="loadTable(${i})">${i}</button>`;
  if (end < pages) {
    if (end < pages - 1) btns += `<span style="padding:0 4px;color:var(--text-muted)">…</span>`;
    btns += `<button class="pg-btn" onclick="loadTable(${pages})">${pages}</button>`;
  }
  btns += `<button class="pg-btn" onclick="loadTable(${page+1})" ${page>=pages?'disabled':''}>
    <i class="fas fa-chevron-right"></i></button>`;

  bar.innerHTML = `
    <span class="pagination-info">Page ${page} of ${pages}</span>
    <div class="pagination-btns">${btns}</div>`;
}

// Keep header search synced with table search
document.getElementById('headerSearch')?.addEventListener('input', e => {
  const ts = document.getElementById('tableSearch');
  if (ts) ts.value = e.target.value;
  debounceSearch();
});

// ── Boot ──────────────────────────────────────────────────────────────────────
connectWS();
