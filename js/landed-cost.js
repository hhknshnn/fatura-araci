// js/landed-cost.js
// Kurumsal ülkeler için KDV hariç landed cost analizi ve raporu

const LC_COUNTRIES = ['ALMANYA', 'BELÇİKA', 'BOSNA', 'GÜRCİSTAN', 'HOLLANDA', 'KAZAKİSTAN', 'KOSOVA', 'MAKEDONYA', 'SIRBİSTAN'];
let landedCostState = { data: null, pendingExpanded: false };

function lcFormatEur(value) {
  const val = Number(value || 0);
  if (Math.abs(val) >= 1000000) return (val / 1000000).toFixed(2).replace('.', ',') + 'M €';
  if (Math.abs(val) >= 1000) return (val / 1000).toFixed(0) + 'K €';
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(val) + ' €';
}

function lcFormatFullEur(value) {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0)) + ' €';
}

function initLandedCostPanel() {
  const panel = document.getElementById('stepLandedCost');
  if (!panel) return;
  if (!panel.dataset.ready) {
    panel.dataset.ready = '1';
    panel.innerHTML = `
      <style>
        .lc-shell { display:flex; flex-direction:column; gap:14px; }
        .lc-header { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; }
        .lc-kicker { font-size:11px; font-weight:700; color:#2563EB; letter-spacing:.08em; text-transform:uppercase; }
        .lc-title { font-size:24px; font-weight:750; color:#0F172A; margin-top:4px; }
        .lc-subtitle { font-size:13px; color:#64748B; margin-top:5px; }
        .lc-filters { display:flex; gap:8px; flex-wrap:wrap; align-items:center; padding:12px; border:0.5px solid var(--border2); border-radius:12px; background:var(--surface); }
        .lc-input, .lc-select { height:34px; border:0.5px solid var(--border2); border-radius:9px; background:var(--surface2); color:var(--text); padding:0 10px; font-family:var(--font); font-size:12px; }
        .lc-btn { height:34px; border:none; border-radius:9px; background:#2563EB; color:#fff; padding:0 13px; font-size:12px; font-weight:700; cursor:pointer; }
        .lc-btn.secondary { background:#F1F5F9; color:#0F172A; border:0.5px solid #E2E8F0; }
        .lc-country-pills { display:flex; gap:6px; flex-wrap:wrap; }
        .lc-pill { border:0.5px solid #D8E2EF; background:#fff; color:#475569; border-radius:999px; padding:6px 10px; font-size:11px; font-weight:650; cursor:pointer; }
        .lc-pill.active { background:#EFF6FF; border-color:#93C5FD; color:#1D4ED8; }
        .lc-kpis { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:10px; }
        .lc-kpi { border:0.5px solid var(--border2); border-radius:12px; background:var(--surface); padding:14px; }
        .lc-kpi-label { font-size:11px; color:#64748B; margin-bottom:8px; }
        .lc-kpi-value { font-size:22px; font-weight:760; color:#0F172A; line-height:1; }
        .lc-grid { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr); gap:12px; }
        .lc-card { border:0.5px solid var(--border2); border-radius:12px; background:var(--surface); padding:16px; min-height:220px; }
        .lc-card-title { font-size:13px; font-weight:750; color:#0F172A; margin-bottom:2px; }
        .lc-card-sub { font-size:11px; color:#94A3B8; margin-bottom:14px; }
        .lc-pending-card { border:0.5px solid #FED7AA; border-radius:12px; background:#FFF7ED; padding:14px 16px; }
        .lc-pending-head { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; margin-bottom:10px; }
        .lc-pending-title { font-size:13px; font-weight:750; color:#9A3412; }
        .lc-pending-sub { font-size:11.5px; color:#C2410C; margin-top:3px; }
        .lc-pending-badge { white-space:nowrap; border-radius:999px; background:#FFEDD5; color:#9A3412; padding:5px 10px; font-size:11px; font-weight:750; }
        .lc-pending-more { display:flex; align-items:center; gap:8px; margin-top:10px; }
        .lc-pending-toggle { border:0.5px solid #FDBA74; border-radius:999px; background:#fff; color:#C2410C; padding:7px 11px; font-size:11.5px; font-weight:750; cursor:pointer; }
        .lc-pending-toggle:hover { background:#FFEDD5; }
        .lc-status-pills { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px; }
        .lc-status-pill { border:0.5px solid #FDBA74; border-radius:999px; background:#fff; color:#9A3412; padding:5px 9px; font-size:11px; font-weight:650; }
        .lc-chart-row { display:grid; grid-template-columns:92px minmax(0,1fr) 72px; gap:9px; align-items:center; margin-bottom:10px; }
        .lc-chart-label { font-size:11.5px; color:#475569; font-weight:650; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .lc-track { height:9px; border-radius:999px; background:#F1F5F9; overflow:hidden; }
        .lc-fill { height:100%; border-radius:999px; background:#2563EB; }
        .lc-chart-val { font-size:11px; color:#64748B; font-weight:700; text-align:right; }
        .lc-country-mix { border-top:0.5px solid #E2E8F0; margin-top:16px; padding-top:14px; }
        .lc-country-mix-title { font-size:11px; font-weight:750; color:#64748B; margin-bottom:10px; text-transform:uppercase; letter-spacing:.04em; }
        .lc-country-mix-row { display:grid; grid-template-columns:92px minmax(0,1fr) 58px; gap:9px; align-items:center; margin-bottom:10px; }
        .lc-stacked { height:16px; border-radius:999px; background:#F1F5F9; overflow:hidden; display:flex; }
        .lc-stacked-part { height:100%; min-width:3px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:9px; font-weight:800; line-height:1; }
        .lc-stacked-part.light { color:#1F2937; }
        .lc-table { width:100%; border-collapse:collapse; font-size:12px; }
        .lc-table th { text-align:left; color:#64748B; font-size:10.5px; text-transform:uppercase; letter-spacing:.04em; padding:9px 8px; border-bottom:0.5px solid #E2E8F0; }
        .lc-table td { padding:9px 8px; border-bottom:0.5px solid #EEF2F7; color:#334155; }
      </style>
      <div class="lc-shell">
        <div class="lc-header">
          <div>
            <div class="lc-kicker">Kurumsal Ülkeler</div>
            <div class="lc-title">Landed Cost Analizi</div>
            <div class="lc-subtitle">KDV hariç operasyon, navlun, vergi ve sigorta maliyetlerini ülke bazında izleyin.</div>
          </div>
          <button class="lc-btn" onclick="downloadLandedCostReport()">Excel Rapor İndir</button>
        </div>
        <div class="lc-filters">
          <input class="lc-input" id="lc-date-from" type="date">
          <input class="lc-input" id="lc-date-to" type="date">
          <select class="lc-select" id="lc-depo">
            <option value="">Tüm depolar</option>
            <option value="IHR">Serbest (IHR)</option>
            <option value="ANT">Antrepo (ANT)</option>
          </select>
          <select class="lc-select" id="lc-group-type">
            <option value="all">Tüm seferler</option>
            <option value="single">Tek araç</option>
            <option value="grouped">Gruplu</option>
          </select>
          <button class="lc-btn secondary" onclick="clearLandedCostFilters()">Temizle</button>
          <button class="lc-btn" onclick="loadLandedCost()">Uygula</button>
          <div class="lc-country-pills" id="lc-country-pills"></div>
        </div>
        <div class="lc-kpis" id="lc-kpis"></div>
        <div id="lc-pending-panel"></div>
        <div class="lc-grid">
          <div class="lc-card">
            <div class="lc-card-title">Ülkelere Göre Landed Cost</div>
            <div class="lc-card-sub">KDV hariç toplam maliyet</div>
            <div id="lc-country-chart"></div>
          </div>
          <div class="lc-card">
            <div class="lc-card-title">Maliyet Kalemi Dağılımı</div>
            <div class="lc-card-sub">Operasyon, navlun, vergi, sigorta</div>
            <div id="lc-cost-mix"></div>
            <div id="lc-country-mix"></div>
          </div>
        </div>
        <div class="lc-grid">
          <div class="lc-card">
            <div class="lc-card-title">Aylık Trend</div>
            <div class="lc-card-sub">Yükleme tarihine göre landed cost</div>
            <div id="lc-month-chart"></div>
          </div>
          <div class="lc-card">
            <div class="lc-card-title">Ülke Performansı</div>
            <div class="lc-card-sub">Fatura toplamına göre maliyet oranı</div>
            <div id="lc-ratio-chart"></div>
          </div>
        </div>
        <div class="lc-card">
          <div class="lc-card-title">Ülke Bazlı Detay</div>
          <div class="lc-card-sub">Seçili filtrelere göre kurumsal ülkeler</div>
          <div id="lc-country-table"></div>
        </div>
      </div>
    `;
    renderLandedCostCountryPills();
  }
  loadLandedCost();
}

function renderLandedCostCountryPills() {
  const box = document.getElementById('lc-country-pills');
  if (!box) return;
  box.innerHTML = LC_COUNTRIES.map(country => `
    <button class="lc-pill" data-country="${country}" onclick="toggleLandedCostCountry('${country}')">${country}</button>
  `).join('');
}

function getLandedCostParams() {
  const selected = [...document.querySelectorAll('#lc-country-pills .lc-pill.active')].map(btn => btn.dataset.country);
  const params = new URLSearchParams();
  if (selected.length) params.set('countries', selected.join(','));
  const dateFrom = document.getElementById('lc-date-from')?.value;
  const dateTo = document.getElementById('lc-date-to')?.value;
  const depo = document.getElementById('lc-depo')?.value;
  const groupType = document.getElementById('lc-group-type')?.value || 'all';
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo) params.set('date_to', dateTo);
  if (depo) params.set('depo', depo);
  if (groupType !== 'all') params.set('group_type', groupType);
  return params;
}

function toggleLandedCostCountry(country) {
  const btn = document.querySelector(`#lc-country-pills .lc-pill[data-country="${country}"]`);
  btn?.classList.toggle('active');
  loadLandedCost();
}

function clearLandedCostFilters() {
  document.getElementById('lc-date-from').value = '';
  document.getElementById('lc-date-to').value = '';
  document.getElementById('lc-depo').value = '';
  document.getElementById('lc-group-type').value = 'all';
  document.querySelectorAll('#lc-country-pills .lc-pill.active').forEach(btn => btn.classList.remove('active'));
  loadLandedCost();
}

async function loadLandedCost() {
  const params = getLandedCostParams();
  const token = sessionStorage.getItem('fa_auth_token');
  const res = await fetch('/api/landed-cost?' + params.toString(), {
    cache: 'no-store',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await res.json();
  if (!data.success) return;
  landedCostState.data = data;
  renderLandedCost(data);
}

function renderLandedCost(data) {
  const summary = data.summary || {};
  const pending = Object.prototype.hasOwnProperty.call(data, 'pending') ? data.pending : null;
  const countries = data.countries || [];
  const months = data.months || [];
  const costItems = [
    { label: 'Operasyon', value: summary.operasyon_eur, color: '#2563EB' },
    { label: 'Navlun', value: summary.navlun_eur, color: '#F59E0B' },
    { label: 'Vergi', value: summary.vergi_eur, color: '#EF4444' },
    { label: 'Sigorta', value: summary.sigorta_eur, color: '#06B6D4' },
  ];

  document.getElementById('lc-kpis').innerHTML = [
    ['Fatura Toplamı', lcFormatEur(summary.fatura_eur)],
    ['Landed Cost', lcFormatEur(summary.landed_cost_eur)],
    ['Maliyet / Fatura', '%' + Math.round(summary.oran || 0)],
    ['Ortalama Sefer Maliyeti', lcFormatEur(summary.ortalama_sefer_maliyeti_eur)],
    ['Sefer / Fatura', `${summary.sefer_sayisi || 0} / ${summary.fatura_sayisi || 0}`],
  ].map(([label, value]) => `
    <div class="lc-kpi"><div class="lc-kpi-label">${label}</div><div class="lc-kpi-value">${value}</div></div>
  `).join('');

  renderLcBarChart('lc-country-chart', countries.slice(0, 9).map(c => ({
    label: c.ulke, value: c.landed_cost_eur, display: lcFormatEur(c.landed_cost_eur), color: '#2563EB',
  })));
  renderLcCountryMix(countries);
  renderLcBarChart('lc-ratio-chart', countries.slice().sort((a, b) => b.oran - a.oran).slice(0, 8).map(c => ({
    label: c.ulke, value: c.oran, display: '%' + Math.round(c.oran || 0), color: '#F59E0B',
  })));
  renderLcBarChart('lc-month-chart', months.map(m => ({
    label: m.month, value: m.landed_cost_eur, display: lcFormatEur(m.landed_cost_eur), color: '#22C55E',
  })));
  renderLcMix(costItems);
  renderLcCountryTable(countries);
  renderLcPending(pending);
}

function renderLcBarChart(id, rows) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = '<div style="color:#94A3B8;font-size:12px;padding:16px 0;">Veri yok</div>';
    return;
  }
  const max = Math.max(...rows.map(r => Number(r.value || 0)), 1);
  el.innerHTML = rows.map(r => `
    <div class="lc-chart-row">
      <div class="lc-chart-label">${r.label}</div>
      <div class="lc-track"><div class="lc-fill" style="width:${Math.max((r.value / max) * 100, 2)}%;background:${r.color};"></div></div>
      <div class="lc-chart-val">${r.display}</div>
    </div>
  `).join('');
}

function renderLcMix(items) {
  const total = items.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const rows = items.filter(item => item.value > 0);
  const el = document.getElementById('lc-cost-mix');
  if (!el || !rows.length) {
    if (el) el.innerHTML = '<div style="color:#94A3B8;font-size:12px;padding:16px 0;">Veri yok</div>';
    return;
  }
  el.innerHTML = `
    <div style="height:12px;border-radius:999px;background:#F1F5F9;overflow:hidden;display:flex;margin-bottom:14px;">
      ${rows.map(item => `<div style="width:${Math.max((item.value / total) * 100, 3)}%;background:${item.color};"></div>`).join('')}
    </div>
    ${rows.map(item => `
      <div class="lc-chart-row" style="grid-template-columns:92px minmax(0,1fr) 76px;">
        <div class="lc-chart-label">${item.label}</div>
        <div class="lc-track"><div class="lc-fill" style="width:${Math.max((item.value / total) * 100, 2)}%;background:${item.color};"></div></div>
        <div class="lc-chart-val">${lcFormatEur(item.value)}</div>
      </div>
    `).join('')}
  `;
}

function renderLcCountryMix(countries) {
  const el = document.getElementById('lc-country-mix');
  if (!el) return;
  const rows = countries.filter(c => Number(c.landed_cost_eur || 0) > 0).slice(0, 9);
  if (!rows.length) {
    el.innerHTML = '';
    return;
  }
  const parts = [
    { key: 'operasyon_eur', color: '#2563EB' },
    { key: 'navlun_eur', color: '#F59E0B', className: 'light' },
    { key: 'vergi_eur', color: '#EF4444' },
    { key: 'sigorta_eur', color: '#06B6D4' },
  ];
  el.innerHTML = `
    <div class="lc-country-mix">
      <div class="lc-country-mix-title">Ülke Bazlı Maliyet Dağılımı</div>
      ${rows.map(country => {
        const total = Math.max(Number(country.landed_cost_eur || 0), 1);
        return `
          <div class="lc-country-mix-row">
            <div class="lc-chart-label">${country.ulke || '-'}</div>
            <div class="lc-stacked">
              ${parts.map(part => {
                const value = Number(country[part.key] || 0);
                if (value <= 0) return '';
                const pct = (value / total) * 100;
                const label = pct >= 7 ? `%${Math.round(pct)}` : '';
                return `<div class="lc-stacked-part ${part.className || ''}" style="width:${pct}%;background:${part.color};">${label}</div>`;
              }).join('')}
            </div>
            <div class="lc-chart-val">${lcFormatEur(country.landed_cost_eur)}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderLcCountryTable(countries) {
  const el = document.getElementById('lc-country-table');
  if (!el) return;
  if (!countries.length) {
    el.innerHTML = '<div style="color:#94A3B8;font-size:12px;padding:16px 0;">Kurumsal ülke kaydı yok</div>';
    return;
  }
  el.innerHTML = `
    <table class="lc-table">
      <thead>
        <tr>
          <th>Ülke</th><th>Fatura</th><th>Landed Cost</th><th>Oran</th><th>Operasyon</th><th>Navlun</th><th>Vergi</th><th>Sigorta</th><th>Sefer</th>
        </tr>
      </thead>
      <tbody>
        ${countries.map(c => `
          <tr>
            <td><b>${c.ulke}</b></td>
            <td>${lcFormatFullEur(c.fatura_eur)}</td>
            <td>${lcFormatFullEur(c.landed_cost_eur)}</td>
            <td><b>%${Math.round(c.oran || 0)}</b></td>
            <td>${lcFormatFullEur(c.operasyon_eur)}</td>
            <td>${lcFormatFullEur(c.navlun_eur)}</td>
            <td>${lcFormatFullEur(c.vergi_eur)}</td>
            <td>${lcFormatFullEur(c.sigorta_eur)}</td>
            <td>${c.sefer_sayisi || 0}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderLcPending(pending) {
  const el = document.getElementById('lc-pending-panel');
  if (!el) return;

  if (!pending) {
    el.innerHTML = `
      <div class="lc-pending-card">
        <div class="lc-pending-head" style="margin-bottom:0;">
          <div>
            <div class="lc-pending-title">Bekleyen kayıt bilgisi alınamadı</div>
            <div class="lc-pending-sub">API yanıtında pending alanı yok. Sunucu eski kodla çalışıyor olabilir; backend yeniden başlatılınca brokerage fee EUR boş/0 olan kurumsal sevkiyatlar burada görünecek.</div>
          </div>
          <div class="lc-pending-badge">kontrol gerekli</div>
        </div>
      </div>
    `;
    return;
  }

  const summary = pending.summary || {};
  const rows = pending.detail || [];
  const count = summary.fatura_sayisi || 0;
  if (!count) {
    el.innerHTML = `
      <div class="lc-pending-card" style="border-color:#BBF7D0;background:#F0FDF4;">
        <div class="lc-pending-head" style="margin-bottom:0;">
          <div>
            <div class="lc-pending-title" style="color:#166534;">Bekleyen landed cost kaydı yok</div>
            <div class="lc-pending-sub" style="color:#15803D;">Seçili filtrelerde brokerage fee EUR eksik olan kurumsal sevkiyat bulunmuyor.</div>
          </div>
          <div class="lc-pending-badge" style="background:#DCFCE7;color:#166534;">0 bekleyen</div>
        </div>
      </div>
    `;
    return;
  }

  const statusPills = (summary.by_status || []).map(item => `
    <span class="lc-status-pill">${item.durum}: ${item.sayi}</span>
  `).join('');
  const hasMore = rows.length > 8;
  const shownRows = landedCostState.pendingExpanded ? rows : rows.slice(0, 8);
  const moreText = hasMore
    ? `
      <div class="lc-pending-more">
        <button class="lc-pending-toggle" onclick="toggleLcPendingRows()">
          ${landedCostState.pendingExpanded ? 'Daha az göster' : `+${rows.length - 8} kaydı daha göster`}
        </button>
        ${landedCostState.pendingExpanded ? `<span style="font-size:11px;color:#C2410C;">${rows.length} kaydın tamamı gösteriliyor.</span>` : ''}
      </div>
    `
    : '';

  el.innerHTML = `
    <div class="lc-pending-card">
      <div class="lc-pending-head">
        <div>
          <div class="lc-pending-title">Landed Cost hesabına dahil edilmeyenler</div>
          <div class="lc-pending-sub">Brokerage Fee EUR boş ya da 0 olduğu için bu kurumsal sevkiyatlar ana hesaplardan çıkarıldı.</div>
        </div>
        <div class="lc-pending-badge">${count} fatura / ${summary.sefer_sayisi || 0} sefer</div>
      </div>
      <div class="lc-status-pills">${statusPills}</div>
      <div style="overflow-x:auto;">
        <table class="lc-table">
          <thead>
            <tr>
              <th>Fatura</th><th>Dosya</th><th>Ülke</th><th>Depo</th><th>Yükleme</th><th>Durum</th><th>Fatura EUR</th>
            </tr>
          </thead>
          <tbody>
            ${shownRows.map(row => `
              <tr>
                <td><b>${row.fatura_no || '-'}</b></td>
                <td>${row.ihracat_dosya_no || '-'}</td>
                <td>${row.ulke || '-'}</td>
                <td>${row.depo || '-'}</td>
                <td>${row.yukleme_tarihi || '-'}</td>
                <td>${row.durum || '-'}</td>
                <td>${lcFormatFullEur(row.fatura_eur)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${moreText}
    </div>
  `;
}

function toggleLcPendingRows() {
  landedCostState.pendingExpanded = !landedCostState.pendingExpanded;
  if (landedCostState.data) renderLandedCost(landedCostState.data);
}

async function downloadLandedCostReport() {
  const params = getLandedCostParams();
  const token = sessionStorage.getItem('fa_auth_token');
  const res = await fetch('/api/landed-cost/export?' + params.toString(), {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const contentType = res.headers.get('Content-Type') || '';
  if (!res.ok || contentType.includes('application/json')) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    alert('Rapor indirilemedi: ' + (err.error || 'Sunucu hatası'));
    return;
  }
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `landed_cost_raporu_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}
