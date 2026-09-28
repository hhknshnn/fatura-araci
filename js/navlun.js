// ── NAVLUN.JS ─────────────────────────────────────────────────────────────────
// Navlun Tanımları admin ekranı: kurumsal ülkelerin 3 navlun senaryosu +
// para birimi + sigorta bazı düzenlenebilir tablo (satır başına Kaydet).
// Değer revize edilip kaydedilince eski değerler arşivlenir; alttaki grafikler
// seçili ülkenin değişim geçmişini, önceki tarife karşılaştırmasını ve ülkeler
// arası sıralamayı gösterir. Grafikler PNG, geçmiş Excel olarak indirilebilir.

const NV_UI = 'nv-ui-8';
const NV_SERI = [
  { key: 'navlunIhr',    label: 'Komple İhracat',     kisa: 'İhracat',  renk: '#2563EB' },
  { key: 'navlunAntIhr', label: 'İhracat + Transit',  kisa: 'Gruplu',   renk: '#0F766E' },
  { key: 'navlunAnt',    label: 'Komple Transit',     kisa: 'Transit',  renk: '#D97706' },
];

let _navlunTanimlar = [];
let _navlunGecmisChart = null;
let _navlunKarsilastirChart = null;
let _navlunGecmisVersiyonlar = [];
let _navlunGecmisUlke = '';
let _navlunDlBagli = false;

function navlunFmtTarih(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-');
  return `${d}.${m}.${y}`;
}

function navlunFmtSayi(n, fraction = 0) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
  }).format(Number(n));
}

function navlunSembol(para) {
  return para === 'USD' ? '$' : para === 'TRY' ? '₺' : '€';
}

function navlunPct(curr, prev) {
  if (prev == null || Number(prev) === 0 || curr == null) return null;
  return Math.round(((Number(curr) - Number(prev)) / Number(prev)) * 10000) / 100;
}

function navlunPctHtml(pct) {
  if (pct == null) return '<span class="nv-delta flat">—</span>';
  const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  const yon = pct > 0 ? '▲' : pct < 0 ? '▼' : '■';
  const abs = Math.abs(pct).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  return `<span class="nv-delta ${cls}">${yon} ${pct > 0 ? '+' : pct < 0 ? '−' : ''}${abs}%</span>`;
}

function navlunPctText(pct) {
  if (pct == null) return 'değişim yok';
  const abs = Math.abs(pct).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  if (pct > 0) return `▲ +${abs}%`;
  if (pct < 0) return `▼ −${abs}%`;
  return '■ 0%';
}

function navlunEsc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function navlunChartYok() {
  return typeof Chart === 'undefined';
}

const NV_PLUGIN_BG = {
  id: 'nvWhiteBg',
  beforeDraw(chart) {
    const { ctx, width, height } = chart;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  },
};

const NV_PLUGIN_LAST = {
  id: 'nvLastLabel',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.font = '650 10px Inter, system-ui, sans-serif';
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (!meta || meta.hidden || !meta.data.length) return;
      const last = meta.data[meta.data.length - 1];
      const val = ds.data[ds.data.length - 1];
      if (!last || val == null) return;
      const { x, y } = last.getProps(['x', 'y'], true);
      ctx.fillStyle = ds.borderColor || ds.backgroundColor || '#0F172A';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(navlunFmtSayi(val), x + 8, y);
    });
    ctx.restore();
  },
};

const NV_PLUGIN_BAR = {
  id: 'nvBarLabel',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.font = '650 10px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#334155';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (!meta || meta.hidden) return;
      meta.data.forEach((el, i) => {
        const val = ds.data[i];
        if (val == null) return;
        const { x, y } = el.getProps(['x', 'y'], true);
        ctx.fillText(navlunFmtSayi(val), x, y - 4);
      });
    });
    ctx.restore();
  },
};

// ── PANELİ BAŞLAT ─────────────────────────────────────────────────────────────
function initNavlunTanimPanel() {
  const panel = document.getElementById('stepNavlunTanim');
  if (!panel) return;
  if (panel.dataset.ready !== NV_UI) {
    panel.dataset.ready = NV_UI;
    panel.innerHTML = `
    <div class="nv-shell">
      <div class="nv-header">
        <div class="nv-kicker">Navlun tarifeleri</div>
      </div>

      <div id="navlunTanimStatus" class="status-box"></div>

      <div class="nv-card">
        <div class="nv-card-head">
          <div>
            <h2><i class="ti ti-table"></i> Güncel tarifeler</h2>
          </div>
        </div>
        <div class="nv-table-scroll">
          <table class="nv-table" id="navlunTanimTablo">
            <thead>
              <tr>
                <th>Ülke</th>
                <th>Para</th>
                <th>Komple İhracat</th>
                <th>İhracat + Transit</th>
                <th>Komple Transit</th>
                <th>Geçerlilik</th>
              </tr>
            </thead>
            <tbody id="navlunTanimBody">
              <tr><td colspan="6" style="padding:22px;text-align:center;color:#94A3B8;">Yükleniyor…</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="nv-card">
        <div class="nv-card-head">
          <div>
            <h2><i class="ti ti-chart-line"></i> Navlun değişim grafikleri</h2>
          </div>
          <div class="nv-head-actions">
            <div class="nv-select-wrap">
              <label for="navlunGecmisUlke">Ülke</label>
              <select id="navlunGecmisUlke" class="nv-select" onchange="navlunGecmisYukle()"></select>
            </div>
            <div class="nv-dl">
              <button type="button" class="nv-btn nv-btn-primary" id="navlunIndirBtn" onclick="navlunIndirMenuAc(event)">
                <i class="ti ti-download"></i> İndir
              </button>
              <div id="navlunIndirMenu" class="nv-dl-menu" hidden>
                <button type="button" onclick="navlunGrafikPng('gecmis')"><i class="ti ti-chart-line"></i> Değişim grafiği (PNG)</button>
                <button type="button" onclick="navlunGrafikPng('karsilastir')"><i class="ti ti-chart-bar"></i> Güncel vs önceki (PNG)</button>
                <button type="button" onclick="navlunExcelIndir()"><i class="ti ti-file-spreadsheet"></i> Revizyon geçmişi (Excel)</button>
              </div>
            </div>
          </div>
        </div>
        <div class="nv-kpis" id="navlunKpiRow"></div>
        <div id="navlunGecmisOzet" class="nv-hint"></div>
        <div class="nv-chart-grid">
          <div class="nv-chart-pane">
            <h3>Tarife zaman çizelgesi</h3>
            <div class="nv-chart-box"><canvas id="navlunGecmisChart"></canvas></div>
          </div>
          <div class="nv-chart-pane">
            <h3>Güncel vs önceki revizyon</h3>
            <div class="nv-chart-box sm"><canvas id="navlunKarsilastirChart"></canvas></div>
          </div>
        </div>
        <div class="nv-chart-pane" style="border-top:1px solid rgba(15,23,42,.08);">
          <h3>Revizyon tablosu</h3>
          <div class="nv-hist-wrap">
            <table class="nv-hist" id="navlunGecmisTablo">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Durum</th>
                  <th class="num">Komple İhracat</th>
                  <th class="num">Δ</th>
                  <th class="num">İhracat + Transit</th>
                  <th class="num">Δ</th>
                  <th class="num">Komple Transit</th>
                  <th class="num">Δ</th>
                </tr>
              </thead>
              <tbody id="navlunGecmisTabloBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;
    navlunIndirDisariKapat();
  }
  navlunTanimYukle();
}

function navlunIndirDisariKapat() {
  if (_navlunDlBagli) return;
  _navlunDlBagli = true;
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('navlunIndirMenu');
    const btn = document.getElementById('navlunIndirBtn');
    if (!menu || menu.hidden) return;
    if (menu.contains(e.target) || btn?.contains(e.target)) return;
    menu.hidden = true;
  });
}

function navlunIndirMenuAc(ev) {
  ev.stopPropagation();
  const menu = document.getElementById('navlunIndirMenu');
  if (!menu) return;
  menu.hidden = !menu.hidden;
}

function navlunIndirMenuKapat() {
  const menu = document.getElementById('navlunIndirMenu');
  if (menu) menu.hidden = true;
}

// ── VERİYİ YÜKLE ──────────────────────────────────────────────────────────────
async function navlunTanimYukle() {
  const body = document.getElementById('navlunTanimBody');
  if (!body) return;
  try {
    const resp = await fetch('/api/navlun/tanim', { cache: 'no-store' });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');
    _navlunTanimlar = data.tanimlar || [];
    navlunTanimRender(_navlunTanimlar);
    navlunGecmisSelectDoldur(_navlunTanimlar);
    navlunGecmisYukle();
  } catch (e) {
    body.innerHTML = `<tr><td colspan="6" style="padding:22px;text-align:center;color:#B91C1C;">⚠ ${navlunEsc(e.message)}</td></tr>`;
  }
}

// ── TABLO SATIRLARINI OLUŞTUR ─────────────────────────────────────────────────
function navlunTanimRender(tanimlar) {
  const body = document.getElementById('navlunTanimBody');
  if (!body) return;
  body.innerHTML = '';

  tanimlar.forEach(t => {
    const tr = document.createElement('tr');
    tr.dataset.kod = t.ulkeKodu;
    const numInput = (alan, val) =>
      `<input class="nv-inp navlun-inp" data-alan="${alan}" type="text" inputmode="decimal"
              value="${val ?? 0}" autocomplete="off">`;
    tr.innerHTML = `
      <td>
        <div class="nv-country">
          <img src="https://flagcdn.com/20x15/${t.ulkeKodu}.png" alt="">
          <strong>${navlunEsc(t.ulkeAdi)}</strong>
          <em>${t.ulkeKodu.toUpperCase()}</em>
        </div>
      </td>
      <td>
        <select class="nv-inp nv-para navlun-inp" data-alan="paraBirimi">
          <option value="EUR" ${t.paraBirimi === 'EUR' ? 'selected' : ''}>EUR</option>
          <option value="USD" ${t.paraBirimi === 'USD' ? 'selected' : ''}>USD</option>
          <option value="TRY" ${t.paraBirimi === 'TRY' ? 'selected' : ''}>TRY</option>
        </select>
      </td>
      <td>${numInput('navlunIhr', t.navlunIhr)}</td>
      <td>${numInput('navlunAntIhr', t.navlunAntIhr)}</td>
      <td>${numInput('navlunAnt', t.navlunAnt)}</td>
      <td class="nv-end">
        <div class="nv-save-cell">
          <input type="date" class="nv-tarih navlun-tarih" data-alan="guncellemeTarihi"
                 value="${t.guncellemeTarihi || ''}" title="Geçerlilik / güncelleme tarihi">
          <button type="button" class="nv-btn nv-btn-save"
                  onclick="navlunTanimKaydet('${t.ulkeKodu}', this)">
            <i class="ti ti-device-floppy"></i>Kaydet
          </button>
        </div>
      </td>`;
    body.appendChild(tr);
  });
}

// ── SATIRI KAYDET (revize + arşiv) ────────────────────────────────────────────
async function navlunTanimKaydet(kod, btn) {
  const tr = document.querySelector(`#navlunTanimBody tr[data-kod="${kod}"]`);
  if (!tr) return;

  const oku = alan => tr.querySelector(`.navlun-inp[data-alan="${alan}"]`);
  const sayi = alan => {
    const v = (oku(alan)?.value || '').trim().replace(/\./g, '').replace(',', '.');
    const raw = (oku(alan)?.value || '').trim();
    const n = raw.includes(',') ? parseFloat(v) : parseFloat(raw.replace(',', '.'));
    return isNaN(n) ? 0 : n;
  };

  const tarihEl = tr.querySelector('.navlun-tarih');
  const mevcut = _navlunTanimlar.find(t => t.ulkeKodu === kod);
  const payload = {
    ulkeKodu: kod,
    paraBirimi: oku('paraBirimi')?.value || 'EUR',
    navlunIhr: sayi('navlunIhr'),
    navlunAntIhr: sayi('navlunAntIhr'),
    navlunAnt: sayi('navlunAnt'),
    sigortaBaz: mevcut?.sigortaBaz ?? 0,
    guncellemeTarihi: tarihEl?.value || '',
  };

  const eskiMetin = btn ? btn.innerHTML : '';
  if (btn) { btn.innerHTML = '⏳'; btn.disabled = true; }
  try {
    const resp = await fetch('/api/navlun/tanim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');
    navlunTanimDurum('success',
      data.arsivlendi
        ? `✓ ${kod.toUpperCase()} revize edildi — önceki değerler arşivlendi.`
        : `✓ ${kod.toUpperCase()} navlun tanımı kaydedildi.`);
    const idx = _navlunTanimlar.findIndex(t => t.ulkeKodu === kod);
    if (idx >= 0) Object.assign(_navlunTanimlar[idx], payload, { guncellemeTarihi: data.guncellemeTarihi });
    if (tarihEl && data.guncellemeTarihi) tarihEl.value = data.guncellemeTarihi;
    if (document.getElementById('navlunGecmisUlke')?.value === kod) {
      navlunGecmisYukle();
    }
  } catch (e) {
    navlunTanimDurum('error', `⚠ ${e.message}`);
  } finally {
    if (btn) { btn.innerHTML = eskiMetin || 'Kaydet'; btn.disabled = false; }
  }
}

function navlunTanimDurum(tip, mesaj) {
  const sb = document.getElementById('navlunTanimStatus');
  if (!sb) return;
  sb.className = 'status-box visible ' + tip;
  sb.textContent = mesaj;
  if (tip === 'success') {
    setTimeout(() => { if (sb) { sb.className = 'status-box'; sb.textContent = ''; } }, 3500);
  }
}

function navlunGecmisSelectDoldur(tanimlar) {
  const sel = document.getElementById('navlunGecmisUlke');
  if (!sel) return;
  const oncekiDeger = sel.value;
  sel.innerHTML = tanimlar.map(t =>
    `<option value="${t.ulkeKodu}">${navlunEsc(t.ulkeAdi)} (${t.ulkeKodu.toUpperCase()})</option>`).join('');
  if (oncekiDeger && tanimlar.some(t => t.ulkeKodu === oncekiDeger)) {
    sel.value = oncekiDeger;
  } else if (tanimlar.some(t => t.ulkeKodu === 'rs')) {
    sel.value = 'rs';
  }
}

function navlunUlkeBul(kod) {
  return _navlunTanimlar.find(t => t.ulkeKodu === kod) || null;
}

function navlunVersiyonZenginlestir(versiyonlar) {
  return versiyonlar.map((v, i) => {
    const prev = i > 0 ? versiyonlar[i - 1] : null;
    return {
      ...v,
      degisimIhr: prev ? navlunPct(v.navlunIhr, prev.navlunIhr) : null,
      degisimAntIhr: prev ? navlunPct(v.navlunAntIhr, prev.navlunAntIhr) : (v.degisimYuzde ?? null),
      degisimAnt: prev ? navlunPct(v.navlunAnt, prev.navlunAnt) : null,
    };
  });
}

// ── DEĞİŞİM GEÇMİŞİNİ YÜKLE & ÇİZ ─────────────────────────────────────────────
async function navlunGecmisYukle() {
  const sel = document.getElementById('navlunGecmisUlke');
  const ozet = document.getElementById('navlunGecmisOzet');
  if (!sel || !sel.value) return;
  const kod = sel.value;
  _navlunGecmisUlke = kod;

  try {
    const resp = await fetch('/api/navlun/gecmis?ulke=' + encodeURIComponent(kod), { cache: 'no-store' });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');
    const versiyonlar = navlunVersiyonZenginlestir(data.versiyonlar || []);
    _navlunGecmisVersiyonlar = versiyonlar;
    navlunKpiCiz(versiyonlar);
    navlunGecmisOzetCiz(versiyonlar);
    navlunGecmisCiz(versiyonlar);
    navlunKarsilastirCiz(versiyonlar);
    navlunGecmisTabloCiz(versiyonlar);
  } catch (e) {
    if (ozet) ozet.textContent = '⚠ ' + e.message;
  }
}

function navlunGecmisOzetCiz(versiyonlar) {
  const ozet = document.getElementById('navlunGecmisOzet');
  if (!ozet) return;
  const ulke = navlunUlkeBul(_navlunGecmisUlke);
  const ad = ulke ? ulke.ulkeAdi : (_navlunGecmisUlke || '').toUpperCase();
  const para = versiyonlar.length ? versiyonlar[versiyonlar.length - 1].paraBirimi : (ulke?.paraBirimi || 'EUR');
  const sembol = navlunSembol(para);

  if (versiyonlar.length <= 1) {
    ozet.innerHTML = `<b>${navlunEsc(ad)}</b> için henüz revizyon yok — değeri değiştirip kaydedince çizgi ve yüzde değişim burada birikir. Gösterilen tutarlar ${para} (${sembol}).`;
    return;
  }
  const son = versiyonlar[versiyonlar.length - 1];
  const onceki = versiyonlar[versiyonlar.length - 2];
  ozet.innerHTML =
    `<b>${navlunEsc(ad)}</b> · ${versiyonlar.length} tarife versiyonu · son revizyon ` +
    `<b>${navlunFmtTarih(son.tarih)}</b> (İhracat + Transit): ` +
    `<b>${navlunFmtSayi(onceki.navlunAntIhr)} ${sembol}</b> → ` +
    `<b>${navlunFmtSayi(son.navlunAntIhr)} ${sembol}</b> ` +
    navlunPctHtml(son.degisimAntIhr);
}

function navlunKpiCiz(versiyonlar) {
  const row = document.getElementById('navlunKpiRow');
  if (!row) return;
  const son = versiyonlar[versiyonlar.length - 1];
  const para = son?.paraBirimi || 'EUR';
  const sembol = navlunSembol(para);
  const items = NV_SERI.map(s => ({
    lbl: s.label,
    val: son ? `${navlunFmtSayi(son[s.key])} ${sembol}` : '—',
    pct: son ? (s.key === 'navlunIhr' ? son.degisimIhr : s.key === 'navlunAntIhr' ? son.degisimAntIhr : son.degisimAnt) : null,
  }));
  row.innerHTML = items.map(it => {
    const cls = it.pct > 0 ? 'up' : it.pct < 0 ? 'down' : 'flat';
    const delta = it.pct == null
      ? 'Önceki revizyon yok'
      : (it.pct === 0 ? 'Önceki revizyona göre değişmedi' : `Önceki revizyona göre ${navlunPctText(it.pct)}`);
    return `<div class="nv-kpi">
      <div class="lbl">${it.lbl}</div>
      <div class="val">${it.val}</div>
      <div class="delta ${cls}">${delta}</div>
    </div>`;
  }).join('');
}

function navlunChartFont() {
  return { family: 'Inter, system-ui, sans-serif', size: 11 };
}

function navlunGecmisCiz(versiyonlar) {
  const canvas = document.getElementById('navlunGecmisChart');
  if (!canvas) return;
  if (_navlunGecmisChart) { _navlunGecmisChart.destroy(); _navlunGecmisChart = null; }

  if (navlunChartYok()) {
    canvas.parentElement.innerHTML = '<div class="nv-empty">Grafik kütüphanesi yüklenemedi.</div>';
    return;
  }

  const ulke = navlunUlkeBul(_navlunGecmisUlke);
  const para = versiyonlar.length ? versiyonlar[versiyonlar.length - 1].paraBirimi : (ulke?.paraBirimi || 'EUR');
  const sembol = navlunSembol(para);
  const labels = versiyonlar.map(v => navlunFmtTarih(v.tarih));

  const mkSeri = (s) => ({
    label: s.label,
    data: versiyonlar.map(v => v[s.key]),
    borderColor: s.renk,
    backgroundColor: s.renk + '22',
    tension: 0.25,
    pointRadius: versiyonlar.length === 1 ? 6 : 4,
    pointHoverRadius: 7,
    pointBackgroundColor: '#fff',
    pointBorderWidth: 2,
    borderWidth: 2.4,
    fill: false,
    spanGaps: true,
  });

  _navlunGecmisChart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets: NV_SERI.map(mkSeri) },
    plugins: [NV_PLUGIN_BG, NV_PLUGIN_LAST],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { right: 52, top: 10, left: 4 } },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle',
            font: { family: 'Inter, system-ui, sans-serif', size: 11, weight: '650' },
            color: '#334155',
            padding: 12,
          },
        },
        tooltip: {
          backgroundColor: '#0F172A',
          titleFont: { family: 'Inter, system-ui, sans-serif', size: 12, weight: '700' },
          bodyFont: { family: 'Inter, system-ui, sans-serif', size: 12 },
          padding: 10,
          callbacks: {
            title: items => {
              const i = items[0]?.dataIndex ?? 0;
              const v = versiyonlar[i];
              return (v?.guncel ? 'Güncel tarife · ' : 'Arşiv · ') + (items[0]?.label || '');
            },
            label: ctx => {
              const v = versiyonlar[ctx.dataIndex];
              const key = NV_SERI[ctx.datasetIndex]?.key;
              const pct = key === 'navlunIhr' ? v?.degisimIhr
                : key === 'navlunAntIhr' ? v?.degisimAntIhr
                : v?.degisimAnt;
              const pctTxt = pct == null ? '' : `  (${navlunPctText(pct)})`;
              return ` ${ctx.dataset.label}: ${navlunFmtSayi(ctx.parsed.y)} ${sembol}${pctTxt}`;
            },
            footer: items => {
              const i = items[0]?.dataIndex ?? 0;
              if (i === 0) return 'İlk kayıt — yüzde değişim yok.';
              return 'Yüzdeler bir önceki revizyona göredir.';
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: navlunChartFont(), color: '#64748B', maxRotation: 0 },
          title: {
            display: true,
            text: 'Geçerlilik tarihi',
            color: '#64748B',
            font: { family: 'Inter, system-ui, sans-serif', size: 11, weight: '650' },
          },
        },
        y: {
          beginAtZero: false,
          grace: '8%',
          grid: { color: 'rgba(148,163,184,.18)' },
          border: { display: false },
          title: {
            display: true,
            text: `Tutar (${para} / ${sembol})`,
            color: '#64748B',
            font: { family: 'Inter, system-ui, sans-serif', size: 11, weight: '650' },
          },
          ticks: {
            font: navlunChartFont(),
            color: '#64748B',
            callback: v => navlunFmtSayi(v) + ' ' + sembol,
          },
        },
      },
    },
  });
}

function navlunKarsilastirCiz(versiyonlar) {
  const canvas = document.getElementById('navlunKarsilastirChart');
  if (!canvas) return;
  if (_navlunKarsilastirChart) { _navlunKarsilastirChart.destroy(); _navlunKarsilastirChart = null; }
  if (navlunChartYok()) return;

  const son = versiyonlar[versiyonlar.length - 1];
  const onceki = versiyonlar.length > 1 ? versiyonlar[versiyonlar.length - 2] : null;
  const para = son?.paraBirimi || 'EUR';
  const sembol = navlunSembol(para);
  const labels = NV_SERI.map(s => s.kisa);
  const datasets = [];

  if (onceki) {
    datasets.push({
      label: 'Önceki · ' + navlunFmtTarih(onceki.tarih),
      data: NV_SERI.map(s => onceki[s.key]),
      backgroundColor: 'rgba(148,163,184,.55)',
      borderRadius: 6,
      maxBarThickness: 28,
    });
  }
  if (son) {
    datasets.push({
      label: (son.guncel ? 'Güncel' : 'Son') + ' · ' + navlunFmtTarih(son.tarih),
      data: NV_SERI.map(s => son[s.key]),
      backgroundColor: NV_SERI.map(s => s.renk),
      borderRadius: 6,
      maxBarThickness: 28,
    });
  }

  _navlunKarsilastirChart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    plugins: [NV_PLUGIN_BG, NV_PLUGIN_BAR],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 16 } },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'rectRounded',
            font: { family: 'Inter, system-ui, sans-serif', size: 11, weight: '650' },
            color: '#334155',
          },
        },
        tooltip: {
          backgroundColor: '#0F172A',
          callbacks: {
            label: ctx => {
              const seri = NV_SERI[ctx.dataIndex];
              const curr = ctx.parsed.y;
              let extra = '';
              if (onceki && son && ctx.datasetIndex === datasets.length - 1 && seri) {
                extra = '  ' + navlunPctText(navlunPct(son[seri.key], onceki[seri.key]));
              }
              return ` ${ctx.dataset.label}: ${navlunFmtSayi(curr)} ${sembol}${extra}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: navlunChartFont(), color: '#64748B' },
        },
        y: {
          beginAtZero: true,
          grace: '12%',
          grid: { color: 'rgba(148,163,184,.18)' },
          border: { display: false },
          ticks: {
            font: navlunChartFont(),
            color: '#64748B',
            callback: v => navlunFmtSayi(v) + ' ' + sembol,
          },
        },
      },
    },
  });
}

function navlunGecmisTabloCiz(versiyonlar) {
  const body = document.getElementById('navlunGecmisTabloBody');
  if (!body) return;
  const para = versiyonlar.length ? versiyonlar[versiyonlar.length - 1].paraBirimi : 'EUR';
  const sembol = navlunSembol(para);
  if (!versiyonlar.length) {
    body.innerHTML = `<tr><td colspan="8" style="padding:16px;color:#94A3B8;text-align:center;">Kayıt yok</td></tr>`;
    return;
  }
  const rows = [...versiyonlar].reverse();
  body.innerHTML = rows.map(v => `
    <tr class="${v.guncel ? 'guncel' : ''}">
      <td>${navlunFmtTarih(v.tarih)}</td>
      <td><span class="pill">${v.guncel ? 'Güncel' : 'Arşiv'}</span></td>
      <td class="num">${navlunFmtSayi(v.navlunIhr)} ${sembol}</td>
      <td class="num">${navlunPctHtml(v.degisimIhr)}</td>
      <td class="num">${navlunFmtSayi(v.navlunAntIhr)} ${sembol}</td>
      <td class="num">${navlunPctHtml(v.degisimAntIhr)}</td>
      <td class="num">${navlunFmtSayi(v.navlunAnt)} ${sembol}</td>
      <td class="num">${navlunPctHtml(v.degisimAnt)}</td>
    </tr>`).join('');
}

// ── İNDİRME ───────────────────────────────────────────────────────────────────
function navlunDosyaAd(parca) {
  const kod = (_navlunGecmisUlke || 'navlun').toUpperCase();
  const gun = new Date().toISOString().slice(0, 10);
  return `navlun_${parca}_${kod}_${gun}`;
}

function navlunGrafikPng(hangisi) {
  navlunIndirMenuKapat();
  const map = {
    gecmis: {
      chart: _navlunGecmisChart,
      baslik: (navlunUlkeBul(_navlunGecmisUlke)?.ulkeAdi || _navlunGecmisUlke.toUpperCase()) + ' — navlun tarife geçmişi',
      alt: 'Her nokta bir revizyon. Çizgiler: Komple İhracat, İhracat + Transit, Komple Transit.',
      dosya: navlunDosyaAd('gecmis'),
    },
    karsilastir: {
      chart: _navlunKarsilastirChart,
      baslik: (navlunUlkeBul(_navlunGecmisUlke)?.ulkeAdi || _navlunGecmisUlke.toUpperCase()) + ' — güncel vs önceki tarife',
      alt: 'Komple İhracat, İhracat + Transit, Komple Transit',
      dosya: navlunDosyaAd('karsilastir'),
    },
  };
  const cfg = map[hangisi];
  if (!cfg?.chart) {
    navlunTanimDurum('error', '⚠ İndirilecek grafik henüz hazır değil.');
    return;
  }
  navlunCanvasIndir(cfg.chart, cfg.dosya + '.png', cfg.baslik, cfg.alt);
}

function navlunCanvasIndir(chart, filename, baslik, alt) {
  const src = chart.canvas;
  const dpr = window.devicePixelRatio || 1;
  const headerH = Math.round(68 * dpr);
  const footerH = Math.round(30 * dpr);
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height + headerH + footerH;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.fillStyle = '#0F172A';
  ctx.font = `700 ${Math.round(16 * dpr)}px Inter, system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(baslik, Math.round(16 * dpr), Math.round(14 * dpr));
  ctx.fillStyle = '#64748B';
  ctx.font = `500 ${Math.round(11 * dpr)}px Inter, system-ui, sans-serif`;
  ctx.fillText(alt, Math.round(16 * dpr), Math.round(38 * dpr));
  ctx.drawImage(src, 0, headerH);
  ctx.fillStyle = '#94A3B8';
  ctx.font = `500 ${Math.round(10 * dpr)}px Inter, system-ui, sans-serif`;
  ctx.fillText(
    'Fatura Aracı · Navlun Tanımları · ' + new Date().toLocaleDateString('tr-TR'),
    Math.round(16 * dpr),
    headerH + src.height + Math.round(8 * dpr),
  );
  out.toBlob(blob => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
}

function navlunExcelIndir() {
  navlunIndirMenuKapat();
  if (typeof XLSX === 'undefined') {
    navlunTanimDurum('error', '⚠ Excel kütüphanesi yüklenemedi.');
    return;
  }
  const ulke = navlunUlkeBul(_navlunGecmisUlke);
  const versiyonlar = _navlunGecmisVersiyonlar || [];
  const sonV = versiyonlar.length ? versiyonlar[versiyonlar.length - 1] : null;
  const sembol = navlunSembol(sonV?.paraBirimi || ulke?.paraBirimi || 'EUR');

  const gecmisAoA = [
    ['Ülke', ulke?.ulkeAdi || '', (_navlunGecmisUlke || '').toUpperCase()],
    ['Para birimi', sonV?.paraBirimi || ulke?.paraBirimi || 'EUR', sembol],
    [],
    ['Tarih', 'Durum', 'Komple İhracat', 'Δ İhracat %', 'İhracat + Transit', 'Δ Gruplu %',
     'Komple Transit', 'Δ Transit %'],
    ...versiyonlar.map(v => [
      navlunFmtTarih(v.tarih),
      v.guncel ? 'Güncel' : 'Arşiv',
      v.navlunIhr, v.degisimIhr,
      v.navlunAntIhr, v.degisimAntIhr,
      v.navlunAnt, v.degisimAnt,
    ]),
  ];

  const guncelAoA = [
    ['Ülke', 'Kod', 'Para', 'Komple İhracat', 'İhracat + Transit', 'Komple Transit', 'Geçerlilik'],
    ..._navlunTanimlar.map(t => [
      t.ulkeAdi, t.ulkeKodu.toUpperCase(), t.paraBirimi,
      t.navlunIhr, t.navlunAntIhr, t.navlunAnt, t.guncellemeTarihi || '',
    ]),
  ];

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(gecmisAoA);
  const ws2 = XLSX.utils.aoa_to_sheet(guncelAoA);
  ws1['!cols'] = [15, 12, 16, 14, 18, 14, 16, 14, 14, 14].map(w => ({ wch: w }));
  ws2['!cols'] = [16, 8, 8, 16, 18, 16, 14, 14].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws1, 'Revizyon geçmişi');
  XLSX.utils.book_append_sheet(wb, ws2, 'Güncel tarifeler');
  XLSX.writeFile(wb, navlunDosyaAd('gecmis') + '.xlsx');
}
