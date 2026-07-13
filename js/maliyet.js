// js/maliyet.js
// Maliyet Takip — dış depo (3PL) tarife, hareket ve beklenen fatura takibi.
// Backend: /api/maliyet/* (api/maliyet/ paketi). Bu adımda Tarifeler sekmesi
// işlevsel; diğer sekmeler sonraki adımlarda doldurulacak.

let mtState = {
  meta: null,          // { ulkeler, kalemler, depo_ayarlari }
  ulke: null,          // seçili ülke kodu
  tab: 'karsilastirma',
  tarifeler: [],       // seçili ülkenin tarife satırları
  historyOpen: {},     // { kalem_id: bool } — geçmiş versiyonlar açık mı
  kalemFormOpen: false,
  hareket: {           // Hareketler sekmesi
    data: null,        // { hareketler, bakiye }
    formTarih: new Date().toISOString().slice(0, 10),
    filterStart: '',
    filterEnd: '',
    importMsg: '',     // son import sonucu (render sonrası kaybolmasın diye state'te)
  },
  karsi: {             // Karşılaştırma sekmesi
    start: '',         // boşsa ilk açılışta geçen ay atanır
    end: '',
    data: null,
    expanded: {},      // { ulkeKod: bool } — kalem kırılımı açık mı
    detay: {},         // { ulkeKod: beklenenDetay } — dönem değişince sıfırlanır
  },
  fatura: {            // Faturalar sekmesi
    list: null,
    editId: null,      // düzenleme modundaki fatura id'si
    draft: null,       // manuel veya PDF'den gelen, henüz kaydedilmemiş kırılım
  },
  analiz: {            // Analiz sekmesi
    start: '',         // boşsa ilk açılışta son 6 ay atanır
    end: '',
    data: null,
    chart: null,       // Chart.js instance — re-render'da destroy edilir
    charts: [],        // Gerçek maliyet analizindeki çoklu grafikler
  },
  rapor: {             // Rapor sekmesi
    start: '',         // boşsa ilk açılışta geçen ay atanır
    end: '',
    secili: null,      // Set(ulke kodları); null → hepsi seçili başlar
    indiriliyor: false,
  },
};

// Dataviz palet rolleri (doğrulanmış referans palet; seri sırası sabittir)
const MT_VIZ = {
  series1: '#2a78d6',   // beklenen
  series2: '#1baf7a',   // gerçek
  grid: '#e1e0d9',
  muted: '#898781',
  ink: '#0b0b0b',
};

const MT_YONTEM_LABELS = {
  donem_sonu: 'Dönem sonu snapshot',
  donem_basi: 'Dönem başı snapshot',
  gun_ortalama: 'Gün bazlı ortalama',
  maksimum: 'Dönem içi maksimum',
};

const MT_TABS = [
  { id: 'karsilastirma', label: 'Gerçek Maliyet', icon: 'ti-wallet' },
  { id: 'tarifeler',     label: 'Tarifeler',     icon: 'ti-list-details' },
  { id: 'faturalar',     label: 'Faturalar',     icon: 'ti-receipt' },
  { id: 'analiz',        label: 'Analiz',        icon: 'ti-chart-dots-3' },
];

const MT_ULKE_COLORS = {
  rs: '#0F766E', ba: '#16A34A', ge: '#DC2626', xk: '#7C3AED', mk: '#E11D48',
  be: '#F59E0B', de: '#2563EB', nl: '#EA580C', kz: '#0891B2',
};

const MT_BIRIM_LABELS = {
  palet: 'palet', koli: 'koli', siparis: 'sipariş', satir: 'satır',
  adet: 'adet', konteyner: 'konteyner', islem: 'işlem', ay: 'ay (sabit)',
  palet_hafta: 'palet / hafta', palet_ay: 'palet / ay',
};

function mtBirimLabel(birim) {
  return MT_BIRIM_LABELS[birim] || birim;
}

function mtUlkeColor(kod) {
  return MT_ULKE_COLORS[kod] || '#2563EB';
}

function mtEsc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function mtFmtFiyat(value, para) {
  const simge = { EUR: '€', USD: '$', TRY: '₺' }[para] || para;
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    .format(Number(value || 0)) + ' ' + simge;
}

function mtFmtTarih(iso) {
  if (!iso) return '-';
  const [y, m, d] = String(iso).split('-');
  return `${d}.${m}.${y}`;
}

// ── PANEL İSKELETİ ────────────────────────────────────────────────────────────

function initMaliyetPanel() {
  const panel = document.getElementById('stepMaliyetTakip');
  if (!panel) return;
  if (!panel.dataset.ready) {
    panel.dataset.ready = '1';
    panel.innerHTML = `
      <style>
        .mt-shell {
          display:flex; flex-direction:column; gap:14px; min-height:100%;
          padding:14px 22px 24px;
          background:
            radial-gradient(circle at 4% 0, rgba(37,99,235,0.10), transparent 28%),
            radial-gradient(circle at 96% 4%, rgba(20,184,166,0.10), transparent 24%),
            linear-gradient(180deg, rgba(248,250,252,0.96) 0%, rgba(241,245,249,0.98) 100%);
        }
        .mt-header { display:flex; justify-content:space-between; gap:16px; align-items:center; flex-wrap:wrap; }
        .mt-kicker {
          width:fit-content; padding:9px 15px; border:1px solid rgba(37,99,235,0.18);
          border-radius:999px;
          background:linear-gradient(135deg, rgba(239,246,255,0.96), rgba(240,253,250,0.96));
          font-size:13px; font-weight:800; color:var(--accent-text);
          letter-spacing:.08em; text-transform:uppercase;
          box-shadow:0 12px 30px rgba(37,99,235,0.10);
        }
        .mt-tabs { display:flex; gap:6px; flex-wrap:wrap; }
        .mt-tab {
          display:inline-flex; align-items:center; gap:7px;
          border:1px solid rgba(15,23,42,0.10); border-radius:999px;
          background:rgba(255,255,255,0.88); color:var(--text2);
          padding:8px 14px; font-size:12px; font-weight:750; cursor:pointer;
          font-family:var(--font);
          transition:transform .15s ease, box-shadow .15s ease, background .15s ease, color .15s ease;
        }
        .mt-tab:hover { transform:translateY(-1px); box-shadow:0 10px 22px rgba(15,23,42,0.08); }
        .mt-tab.active {
          background:linear-gradient(135deg,#2563EB,#1D4ED8); color:#fff; border-color:transparent;
          box-shadow:0 14px 26px rgba(37,99,235,0.24);
        }
        .mt-ulke-pills { display:flex; gap:8px; flex-wrap:wrap; }
        .mt-ulke-pill {
          position:relative; display:inline-flex; align-items:center; gap:8px;
          border:1px solid rgba(15,23,42,0.10); background:rgba(255,255,255,0.88);
          color:var(--text2); border-radius:14px; padding:8px 12px;
          font-size:11.5px; font-weight:800; cursor:pointer; font-family:var(--font);
          box-shadow:0 10px 22px rgba(15,23,42,0.04);
          transition:transform .15s ease, box-shadow .15s ease, border-color .15s ease, background .15s ease, color .15s ease;
        }
        .mt-ulke-pill::before {
          content:""; width:9px; height:9px; border-radius:999px;
          background:var(--ulke-color);
          box-shadow:0 0 0 4px color-mix(in srgb, var(--ulke-color) 16%, transparent);
        }
        .mt-ulke-pill:hover { transform:translateY(-2px); box-shadow:0 14px 24px rgba(15,23,42,0.08); }
        .mt-ulke-pill.active {
          background:linear-gradient(135deg, color-mix(in srgb, var(--ulke-color) 13%, #FFFFFF), #FFFFFF);
          border-color:color-mix(in srgb, var(--ulke-color) 42%, #CBD5E1);
          color:var(--text);
          box-shadow:0 16px 30px color-mix(in srgb, var(--ulke-color) 16%, transparent);
        }
        .mt-grid { display:grid; grid-template-columns:minmax(0,1.5fr) minmax(0,1fr); gap:12px; align-items:start; }
        .mt-card {
          border:1px solid rgba(15,23,42,0.08); border-radius:18px;
          background:rgba(255,255,255,0.94); padding:18px;
          box-shadow:0 18px 44px rgba(15,23,42,0.08); backdrop-filter:blur(14px);
        }
        .mt-card-title { font-size:13.5px; font-weight:780; color:var(--text); }
        .mt-card-sub { font-size:11.5px; color:var(--text3); margin-top:2px; margin-bottom:14px; }
        .mt-table-wrap { overflow-x:auto; border:1px solid var(--surface3); border-radius:14px; background:var(--surface); }
        .mt-table { width:100%; border-collapse:separate; border-spacing:0; font-size:12px; }
        .mt-table th {
          text-align:left; color:var(--text2); font-size:10.5px; text-transform:uppercase;
          letter-spacing:.04em; padding:10px; border-bottom:1px solid var(--surface3);
          background:var(--bg); white-space:nowrap;
        }
        .mt-table td { padding:10px; border-bottom:1px solid var(--surface2); color:var(--text2); background:var(--surface); }
        .mt-table tbody tr:last-child td { border-bottom:none; }
        .mt-table tbody tr:hover td { background:#F0F9FF; }
        .mt-table tr.mt-history-row td { background:var(--bg); color:var(--text3); font-size:11.5px; }
        .mt-kalem-ad { font-weight:750; color:var(--text); white-space:nowrap; }
        .mt-pill {
          display:inline-block; border-radius:999px; padding:3px 9px;
          font-size:10.5px; font-weight:750; white-space:nowrap;
        }
        .mt-pill.birim { background:var(--surface2); color:var(--text2); }
        .mt-pill.guncel { background:var(--success-dim); color:#166534; border:1px solid var(--success-mid); }
        .mt-pill.gelecek { background:var(--warning-dim); color:#92400E; border:1px solid var(--warning-mid); }
        .mt-history-toggle {
          border:none; background:none; color:var(--accent); font-size:11px; font-weight:750;
          cursor:pointer; padding:2px 4px; font-family:var(--font); white-space:nowrap;
        }
        .mt-history-toggle:hover { text-decoration:underline; }
        .mt-icon-btn {
          border:none; background:none; color:var(--text3); cursor:pointer;
          font-size:15px; padding:3px 5px; border-radius:8px;
          transition:color .12s ease, background .12s ease;
        }
        .mt-icon-btn:hover { color:var(--error); background:var(--error-dim); }
        .mt-form { display:flex; flex-direction:column; gap:11px; }
        .mt-field { display:flex; flex-direction:column; gap:5px; min-width:0; }
        .mt-field-label {
          color:var(--text2); font-size:10px; font-weight:800;
          letter-spacing:.08em; text-transform:uppercase;
        }
        .mt-input, .mt-select {
          width:100%; height:42px; border:1px solid rgba(15,23,42,0.09);
          border-radius:12px; background:var(--surface); color:var(--text);
          padding:0 12px; font-family:var(--font); font-size:13px; font-weight:600;
          transition:border-color .15s ease, box-shadow .15s ease;
        }
        .mt-input:focus, .mt-select:focus {
          outline:none; border-color:var(--accent);
          box-shadow:0 0 0 4px rgba(37,99,235,0.13);
        }
        .mt-form-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .mt-btn {
          height:42px; border:none; border-radius:12px;
          background:linear-gradient(135deg,#2563EB,#1D4ED8); color:#fff;
          padding:0 16px; font-size:12.5px; font-weight:750; cursor:pointer;
          font-family:var(--font); box-shadow:0 14px 26px rgba(37,99,235,0.22);
          transition:transform .14s ease, box-shadow .14s ease;
        }
        .mt-btn:hover { transform:translateY(-1px); box-shadow:0 18px 30px rgba(37,99,235,0.28); }
        .mt-btn.secondary {
          background:var(--surface); color:var(--text);
          border:1px solid rgba(15,23,42,0.10); box-shadow:0 8px 18px rgba(15,23,42,0.05);
        }
        .mt-btn.secondary:hover { background:var(--bg); }
        .mt-empty { color:var(--text3); font-size:12px; padding:18px 4px; }
        .mt-stat-value { font-size:30px; font-weight:800; color:var(--text); line-height:1.1; }
        .mt-stat-sub { font-size:11px; color:var(--text3); margin-top:6px; line-height:1.5; }
        .mt-qty-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .mt-qty-field { display:flex; flex-direction:column; gap:4px; }
        .mt-qty-label { font-size:11px; font-weight:700; color:var(--text2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .mt-qty-field .mt-input { height:38px; }
        .mt-textarea {
          width:100%; min-height:110px; border:1px solid rgba(15,23,42,0.09);
          border-radius:12px; background:var(--surface); color:var(--text);
          padding:10px 12px; font-family:var(--mono); font-size:12px; resize:vertical;
        }
        .mt-textarea:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 4px rgba(37,99,235,0.13); }
        .mt-import-result { font-size:11.5px; margin-top:8px; line-height:1.6; }
        .mt-import-result.ok { color:#166534; }
        .mt-import-result.err { color:#B91C1C; }
        .mt-filter-row { display:flex; gap:8px; align-items:end; flex-wrap:wrap; margin-bottom:12px; }
        .mt-filter-row .mt-field { flex:0 0 150px; }
        .mt-filter-row .mt-btn { height:38px; padding:0 13px; font-size:12px; }
        .mt-kpis { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin-bottom:12px; }
        .mt-kpi {
          border:1px solid rgba(15,23,42,0.08); border-radius:16px;
          background:linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.92));
          padding:14px; box-shadow:0 14px 32px rgba(15,23,42,0.06);
        }
        .mt-kpi-label { font-size:10.5px; color:var(--text3); font-weight:750; text-transform:uppercase; letter-spacing:.05em; margin-bottom:7px; }
        .mt-kpi-value { font-size:20px; font-weight:800; color:var(--text); line-height:1.05; }
        .mt-pct { display:inline-block; border-radius:999px; padding:4px 10px; font-size:11px; font-weight:800; white-space:nowrap; }
        .mt-pct.ok { background:var(--surface2); color:var(--text2); }
        .mt-pct.up { background:var(--error-dim); color:#B91C1C; border:1px solid #FECACA; }
        .mt-pct.down { background:var(--success-dim); color:#166534; border:1px solid var(--success-mid); }
        .mt-pct.none { background:var(--warning-dim); color:#92400E; border:1px solid var(--warning-mid); }
        .mt-row-click { cursor:pointer; }
        .mt-detail-cell { background:var(--bg) !important; padding:14px !important; }
        .mt-local-sub { display:block; font-size:10.5px; color:var(--text3); font-weight:600; margin-top:2px; }
        .mt-uyari {
          border:1px solid var(--warning-mid); border-radius:12px; background:var(--warning-dim);
          color:#92400E; font-size:11.5px; padding:9px 12px; line-height:1.5; margin-bottom:10px;
        }
        .mt-hbar-row { display:grid; grid-template-columns:150px minmax(0,1fr) 100px; gap:10px; align-items:center; margin-bottom:11px; }
        .mt-hbar-label { font-size:11.5px; color:var(--text2); font-weight:650; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .mt-hbar-track { height:10px; border-radius:999px; background:var(--surface2); overflow:hidden; }
        .mt-hbar-fill { height:100%; border-radius:999px; min-width:3px; }
        .mt-hbar-val { font-size:11px; color:var(--text2); font-weight:700; text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
        .mt-chart-box { position:relative; height:260px; }
        .mt-mini-table { width:100%; border-collapse:collapse; font-size:11px; margin-top:12px; }
        .mt-mini-table th { text-align:right; color:var(--text3); font-weight:700; padding:4px 8px; border-bottom:1px solid var(--surface3); }
        .mt-mini-table th:first-child, .mt-mini-table td:first-child { text-align:left; }
        .mt-mini-table td { text-align:right; color:var(--text2); padding:4px 8px; border-bottom:1px solid var(--surface2); font-variant-numeric:tabular-nums; }
        @media (max-width: 900px) { .mt-kpis { grid-template-columns:repeat(2,minmax(0,1fr)); } }
        @media (max-width: 640px) { .mt-qty-grid { grid-template-columns:1fr; } .mt-kpis { grid-template-columns:1fr; } .mt-hbar-row { grid-template-columns:100px minmax(0,1fr) 90px; } }
        .mt-soon-card {
          border:1px dashed rgba(15,23,42,0.15); border-radius:18px;
          background:rgba(255,255,255,0.6); padding:48px 24px; text-align:center;
          color:var(--text3); font-size:13px; font-weight:650;
        }
        .mt-soon-card i { display:block; font-size:30px; margin-bottom:10px; color:var(--text3); }
        .mt-hint { font-size:11px; color:var(--text3); line-height:1.5; margin-top:10px; }
        @media (max-width: 1100px) { .mt-grid { grid-template-columns:1fr; } }
        @media (max-width: 640px) {
          .mt-shell { padding:12px 14px 16px; }
          .mt-form-row { grid-template-columns:1fr; }
        }
      </style>
      <div class="mt-shell">
        <div class="mt-header">
          <div class="mt-kicker">Maliyet Takip</div>
          <div class="mt-tabs" id="mt-tabs"></div>
        </div>
        <div class="mt-ulke-pills" id="mt-ulke-pills"></div>
        <div id="mt-content"></div>
      </div>
    `;
  }
  mtRenderTabs();
  if (!mtState.meta) {
    mtLoadMeta();
  } else {
    mtRenderContent();
  }
}

async function mtLoadMeta() {
  const content = document.getElementById('mt-content');
  if (content) content.innerHTML = '<div class="mt-empty">Yükleniyor…</div>';
  try {
    const res = await fetch('/api/maliyet/meta', { cache: 'no-store' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');
    mtState.meta = data;
    if (!mtState.ulke && data.ulkeler.length) mtState.ulke = data.ulkeler[0].kod;
  } catch (e) {
    if (content) content.innerHTML = `<div class="mt-empty">Veri alınamadı: ${mtEsc(e.message)}</div>`;
    return;
  }
  mtRenderUlkePills();
  mtRenderContent();
}

// ── SEKMELER VE ÜLKE SEÇİMİ ──────────────────────────────────────────────────

function mtRenderTabs() {
  const box = document.getElementById('mt-tabs');
  if (!box) return;
  box.innerHTML = MT_TABS.map(t => `
    <button class="mt-tab ${mtState.tab === t.id ? 'active' : ''}" onclick="mtSelectTab('${t.id}')">
      <i class="ti ${t.icon}" aria-hidden="true"></i>${t.label}
    </button>
  `).join('');
}

function mtSelectTab(tab) {
  mtState.tab = tab;
  mtRenderTabs();
  mtRenderContent();
}

function mtRenderUlkePills() {
  const box = document.getElementById('mt-ulke-pills');
  if (!box || !mtState.meta) return;
  box.innerHTML = mtState.meta.ulkeler.map(u => `
    <button class="mt-ulke-pill ${mtState.ulke === u.kod ? 'active' : ''}"
            style="--ulke-color:${mtUlkeColor(u.kod)};"
            onclick="mtSelectUlke('${u.kod}')">${mtEsc(u.label)}</button>
  `).join('');
}

function mtSelectUlke(kod) {
  if (mtState.ulke === kod) return;
  mtState.ulke = kod;
  mtState.historyOpen = {};
  mtState.hareket.importMsg = '';
  mtState.fatura.editId = null;
  mtState.fatura.draft = null;
  mtRenderUlkePills();
  mtRenderContent();
}

function mtRenderContent() {
  const content = document.getElementById('mt-content');
  if (!content || !mtState.meta) return;
  if (mtState.tab === 'tarifeler') {
    mtLoadTarife();
    return;
  }
  if (mtState.tab === 'hareketler') {
    mtLoadHareket();
    return;
  }
  if (mtState.tab === 'karsilastirma') {
    mtLoadKarsi();
    return;
  }
  if (mtState.tab === 'faturalar') {
    mtLoadFatura();
    return;
  }
  if (mtState.tab === 'analiz') {
    mtLoadAnaliz();
    return;
  }
  if (mtState.tab === 'rapor') {
    mtRenderRapor();
    return;
  }
  const tab = MT_TABS.find(t => t.id === mtState.tab);
  content.innerHTML = `
    <div class="mt-soon-card">
      <i class="ti ${tab ? tab.icon : 'ti-clock'}" aria-hidden="true"></i>
      "${tab ? tab.label : mtState.tab}" sekmesi bir sonraki adımda eklenecek.
    </div>
  `;
}

// ── TARİFELER SEKMESİ ────────────────────────────────────────────────────────

async function mtLoadTarife() {
  const content = document.getElementById('mt-content');
  if (!content || !mtState.ulke) return;
  content.innerHTML = '<div class="mt-empty">Tarifeler yükleniyor…</div>';
  try {
    const res = await fetch('/api/maliyet/tarife?ulke=' + encodeURIComponent(mtState.ulke), { cache: 'no-store' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');
    mtState.tarifeler = data.tarifeler || [];
  } catch (e) {
    content.innerHTML = `<div class="mt-empty">Tarifeler alınamadı: ${mtEsc(e.message)}</div>`;
    return;
  }
  mtRenderTarife();
}

function mtUlkeObj() {
  return (mtState.meta.ulkeler || []).find(u => u.kod === mtState.ulke) || {};
}

function mtRenderTarife() {
  const content = document.getElementById('mt-content');
  if (!content) return;
  const ulke = mtUlkeObj();
  const aktifKalemler = (mtState.meta.kalemler || []).filter(k => k.aktif);

  content.innerHTML = `
    <div class="mt-grid">
      <div class="mt-card">
        <div class="mt-card-title">${mtEsc(ulke.label || '')} — Aktif Tarife</div>
        <div class="mt-card-sub">Fiyat değişiminde eski versiyon silinmez; hesaplama hareket tarihine denk gelen versiyonu kullanır.</div>
        <div id="mt-tarife-table"></div>
        <div class="mt-hint">Sadece bu depoyla anlaşılan kalemleri girin — her kalemin girilmesi zorunlu değildir.</div>
      </div>
      <div>
        <div class="mt-card">
          <div class="mt-card-title">Tarife Girişi</div>
          <div class="mt-card-sub">Yeni kalem fiyatı veya mevcut kalem için yeni versiyon.</div>
          <div class="mt-form">
            <label class="mt-field">
              <span class="mt-field-label">Kalem</span>
              <select class="mt-select" id="mt-f-kalem" onchange="mtOnKalemChange()">
                ${aktifKalemler.map(k => `<option value="${k.id}">${mtEsc(k.ad)}</option>`).join('')}
              </select>
            </label>
            <div class="mt-form-row">
              <label class="mt-field">
                <span class="mt-field-label">Birim</span>
                <select class="mt-select" id="mt-f-birim"></select>
              </label>
              <label class="mt-field">
                <span class="mt-field-label">Para Birimi</span>
                <select class="mt-select" id="mt-f-para">
                  ${['EUR', 'USD', 'TRY'].map(p => `<option value="${p}" ${p === (ulke.currency || 'EUR') ? 'selected' : ''}>${p}</option>`).join('')}
                </select>
              </label>
            </div>
            <div class="mt-form-row">
              <label class="mt-field">
                <span class="mt-field-label">Birim Fiyat</span>
                <input class="mt-input" id="mt-f-fiyat" type="number" step="0.0001" min="0" placeholder="0.00">
              </label>
              <label class="mt-field">
                <span class="mt-field-label">Geçerlilik Başlangıcı</span>
                <input class="mt-input" id="mt-f-baslangic" type="date" value="${new Date().toISOString().slice(0, 10)}">
              </label>
            </div>
            <label class="mt-field">
              <span class="mt-field-label">Not (opsiyonel)</span>
              <input class="mt-input" id="mt-f-not" type="text" maxlength="200" placeholder="ör. 2026 sözleşme zammı">
            </label>
            <button class="mt-btn" onclick="mtSubmitTarife()">Tarifeyi Kaydet</button>
          </div>
        </div>
        <div class="mt-card" style="margin-top:12px;">
          <div class="mt-card-title">Kalem Tanımları</div>
          <div class="mt-card-sub">Listede olmayan bir maliyet kalemi gerekiyorsa buradan ekleyin (tüm ülkeler için ortak tanımdır).</div>
          <div id="mt-kalem-form-box"></div>
        </div>
      </div>
    </div>
  `;
  mtRenderTarifeTable();
  mtOnKalemChange();
  mtRenderKalemForm();
}

function mtRenderTarifeTable() {
  const box = document.getElementById('mt-tarife-table');
  if (!box) return;
  const rows = mtState.tarifeler;
  if (!rows.length) {
    box.innerHTML = '<div class="mt-empty">Bu ülke için henüz tarife girilmedi. Sağdaki formdan ilk kalemi ekleyin.</div>';
    return;
  }

  // Kalem bazında grupla (backend kalem sırası + tarih azalan sırada gönderiyor)
  const gruplar = [];
  const idx = {};
  rows.forEach(r => {
    if (!(r.kalem_id in idx)) {
      idx[r.kalem_id] = gruplar.length;
      gruplar.push({ kalem_id: r.kalem_id, kalem_ad: r.kalem_ad, rows: [] });
    }
    gruplar[idx[r.kalem_id]].rows.push(r);
  });

  const bugun = new Date().toISOString().slice(0, 10);
  const satir = (r, isHistory) => `
    <tr class="${isHistory ? 'mt-history-row' : ''}">
      <td>${isHistory ? '' : `<span class="mt-kalem-ad">${mtEsc(r.kalem_ad)}</span>`}</td>
      <td><span class="mt-pill birim">${mtEsc(mtBirimLabel(r.birim))}</span></td>
      <td style="font-weight:${isHistory ? 500 : 750};color:${isHistory ? 'inherit' : 'var(--text)'};">${mtFmtFiyat(r.birim_fiyat, r.para_birimi)}</td>
      <td>${mtFmtTarih(r.gecerli_baslangic)}</td>
      <td>${r.guncel ? '<span class="mt-pill guncel">güncel</span>'
            : (r.gecerli_baslangic > bugun ? '<span class="mt-pill gelecek">ileri tarihli</span>' : '')}</td>
      <td>${r.notlar ? `<span title="${mtEsc(r.notlar)}">${mtEsc(r.notlar.length > 24 ? r.notlar.slice(0, 24) + '…' : r.notlar)}</span>` : ''}</td>
      <td style="text-align:right;">
        <button class="mt-icon-btn" title="Bu versiyonu sil (hatalı giriş düzeltme)" onclick="mtDeleteTarife(${r.id})"><i class="ti ti-trash"></i></button>
      </td>
    </tr>
  `;

  box.innerHTML = `
    <div class="mt-table-wrap">
      <table class="mt-table">
        <thead>
          <tr><th>Kalem</th><th>Birim</th><th>Fiyat</th><th>Geçerlilik</th><th></th><th>Not</th><th></th></tr>
        </thead>
        <tbody>
          ${gruplar.map(g => {
            const acik = !!mtState.historyOpen[g.kalem_id];
            const eski = g.rows.slice(1);
            return satir(g.rows[0], false)
              + (eski.length ? `
                <tr class="mt-history-row"><td colspan="7" style="padding:4px 10px;">
                  <button class="mt-history-toggle" onclick="mtToggleHistory(${g.kalem_id})">
                    ${acik ? '▾ geçmişi gizle' : `▸ geçmiş versiyonlar (${eski.length})`}
                  </button>
                </td></tr>` : '')
              + (acik ? eski.map(r => satir(r, true)).join('') : '');
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function mtToggleHistory(kalemId) {
  mtState.historyOpen[kalemId] = !mtState.historyOpen[kalemId];
  mtRenderTarifeTable();
}

function mtOnKalemChange() {
  const kalemSel = document.getElementById('mt-f-kalem');
  const birimSel = document.getElementById('mt-f-birim');
  if (!kalemSel || !birimSel) return;
  const kalem = (mtState.meta.kalemler || []).find(k => k.id === Number(kalemSel.value));
  const birimler = kalem ? kalem.birim_secenekleri : [];
  birimSel.innerHTML = birimler.map(b => `<option value="${mtEsc(b)}">${mtEsc(mtBirimLabel(b))}</option>`).join('');
  birimSel.disabled = birimler.length < 2;

  // Bu kalemin güncel tarifesi varsa formu onunla doldur (versiyon güncelleme kolaylığı)
  const mevcut = mtState.tarifeler.find(r => r.kalem_id === Number(kalemSel.value) && r.guncel);
  if (mevcut) {
    birimSel.value = mevcut.birim;
    document.getElementById('mt-f-para').value = mevcut.para_birimi;
    document.getElementById('mt-f-fiyat').value = mevcut.birim_fiyat;
  }
}

async function mtSubmitTarife() {
  const body = {
    ulke: mtState.ulke,
    kalem_id: Number(document.getElementById('mt-f-kalem').value),
    birim: document.getElementById('mt-f-birim').value,
    para_birimi: document.getElementById('mt-f-para').value,
    birim_fiyat: document.getElementById('mt-f-fiyat').value,
    gecerli_baslangic: document.getElementById('mt-f-baslangic').value,
    notlar: document.getElementById('mt-f-not').value.trim(),
  };
  if (!body.birim_fiyat || Number(body.birim_fiyat) < 0) { alert('Geçerli bir birim fiyat girin.'); return; }
  if (!body.gecerli_baslangic) { alert('Geçerlilik başlangıç tarihi seçin.'); return; }

  const res = await fetch('/api/maliyet/tarife', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) { alert('Tarife kaydedilemedi: ' + (data.error || 'Sunucu hatası')); return; }
  mtLoadTarife();
}

async function mtDeleteTarife(id) {
  const r = mtState.tarifeler.find(t => t.id === id);
  const tanim = r ? `${r.kalem_ad} = ${mtFmtFiyat(r.birim_fiyat, r.para_birimi)} (${mtFmtTarih(r.gecerli_baslangic)})` : '#' + id;
  if (!confirm(`Bu tarife versiyonu silinecek:\n${tanim}\n\nNormal fiyat değişikliğinde silme yerine yeni versiyon girin. Devam edilsin mi?`)) return;
  const res = await fetch('/api/maliyet/tarife/' + id, { method: 'DELETE' });
  const data = await res.json();
  if (!data.success) { alert('Silinemedi: ' + (data.error || 'Sunucu hatası')); return; }
  mtLoadTarife();
}

// ── KALEM TANIMLARI ──────────────────────────────────────────────────────────

function mtRenderKalemForm() {
  const box = document.getElementById('mt-kalem-form-box');
  if (!box) return;
  if (!mtState.kalemFormOpen) {
    box.innerHTML = '<button class="mt-btn secondary" onclick="mtToggleKalemForm()">+ Yeni Kalem Ekle</button>';
    return;
  }
  box.innerHTML = `
    <div class="mt-form">
      <label class="mt-field">
        <span class="mt-field-label">Kalem Adı</span>
        <input class="mt-input" id="mt-k-ad" type="text" maxlength="80" placeholder="ör. Kitting / Bundling">
      </label>
      <div class="mt-form-row">
        <label class="mt-field">
          <span class="mt-field-label">Birim(ler) — virgülle</span>
          <input class="mt-input" id="mt-k-birim" type="text" placeholder="ör. adet veya palet,koli">
        </label>
        <label class="mt-field">
          <span class="mt-field-label">Tip</span>
          <select class="mt-select" id="mt-k-tip">
            <option value="hareket">Hareket (miktar × fiyat)</option>
            <option value="sabit">Aylık sabit ücret</option>
            <option value="storage">Storage (bakiye bazlı)</option>
            <option value="minimum">Minimum aylık ücret</option>
          </select>
        </label>
      </div>
      <div class="mt-form-row">
        <button class="mt-btn" onclick="mtSubmitKalem()">Kalemi Ekle</button>
        <button class="mt-btn secondary" onclick="mtToggleKalemForm()">Vazgeç</button>
      </div>
    </div>
  `;
}

function mtToggleKalemForm() {
  mtState.kalemFormOpen = !mtState.kalemFormOpen;
  mtRenderKalemForm();
}

async function mtSubmitKalem() {
  const ad = document.getElementById('mt-k-ad').value.trim();
  const birimler = document.getElementById('mt-k-birim').value.split(',').map(s => s.trim()).filter(Boolean);
  const tip = document.getElementById('mt-k-tip').value;
  if (!ad) { alert('Kalem adı girin.'); return; }
  if (!birimler.length) { alert('En az bir birim girin (ör. palet).'); return; }

  const res = await fetch('/api/maliyet/kalem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ad, birim_secenekleri: birimler, tip }),
  });
  const data = await res.json();
  if (!data.success) { alert('Kalem eklenemedi: ' + (data.error || 'Sunucu hatası')); return; }

  mtState.kalemFormOpen = false;
  // Meta'yı tazele ki yeni kalem tüm select'lere düşsün
  const metaRes = await fetch('/api/maliyet/meta', { cache: 'no-store' });
  const meta = await metaRes.json();
  if (meta.success) mtState.meta = meta;
  mtRenderContent();
}

// ── HAREKETLER SEKMESİ ───────────────────────────────────────────────────────

function mtFmtMiktar(value) {
  const n = Number(value || 0);
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);
}

async function mtLoadHareket() {
  const content = document.getElementById('mt-content');
  if (!content || !mtState.ulke) return;
  content.innerHTML = '<div class="mt-empty">Hareketler yükleniyor…</div>';

  const params = new URLSearchParams({ ulke: mtState.ulke });
  if (mtState.hareket.filterStart) params.set('start', mtState.hareket.filterStart);
  if (mtState.hareket.filterEnd) params.set('end', mtState.hareket.filterEnd);

  try {
    const res = await fetch('/api/maliyet/hareket?' + params.toString(), { cache: 'no-store' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');
    mtState.hareket.data = data;
  } catch (e) {
    content.innerHTML = `<div class="mt-empty">Hareketler alınamadı: ${mtEsc(e.message)}</div>`;
    return;
  }
  mtRenderHareket();
}

function mtRenderHareket() {
  const content = document.getElementById('mt-content');
  const data = mtState.hareket.data;
  if (!content || !data) return;
  const ulke = mtUlkeObj();
  const bakiye = data.bakiye || {};
  const hareketKalemleri = (mtState.meta.kalemler || []).filter(k => k.aktif && k.tip === 'hareket');

  content.innerHTML = `
    <div class="mt-grid">
      <div>
        <div class="mt-card">
          <div class="mt-card-title">Hızlı Giriş — ${mtEsc(ulke.label || '')}</div>
          <div class="mt-card-sub">Tarih seçip o günün miktarlarını girin. Var olan gün seçilirse mevcut değerler yüklenir; boş bırakılan kalemlere dokunulmaz, 0 girilen kayıt silinir.</div>
          <div class="mt-form">
            <div class="mt-filter-row" style="margin-bottom:2px;">
              <label class="mt-field">
                <span class="mt-field-label">Tarih</span>
                <input class="mt-input" id="mt-h-tarih" type="date"
                       value="${mtState.hareket.formTarih}" onchange="mtHareketTarihChanged()">
              </label>
              <div class="mt-field" style="flex:1;justify-content:end;">
                <span id="mt-h-gun-durum" class="mt-hint" style="margin-top:0;"></span>
              </div>
            </div>
            <div class="mt-qty-grid">
              ${hareketKalemleri.map(k => `
                <label class="mt-qty-field">
                  <span class="mt-qty-label" title="${mtEsc(k.ad)}">${mtEsc(k.ad)}</span>
                  <input class="mt-input" id="mt-h-k-${k.id}" type="number" step="0.01" min="0" placeholder="—">
                </label>
              `).join('')}
            </div>
            <button class="mt-btn" onclick="mtSubmitHareketBulk()">Günü Kaydet</button>
          </div>
        </div>
        <div class="mt-card" style="margin-top:12px;">
          <div class="mt-card-title">Hareket Listesi</div>
          <div class="mt-card-sub">Son kayıtlar (en fazla 1000 satır). Tarih aralığıyla daraltabilirsiniz.</div>
          <div class="mt-filter-row">
            <label class="mt-field">
              <span class="mt-field-label">Başlangıç</span>
              <input class="mt-input" id="mt-h-f-start" type="date" value="${mtState.hareket.filterStart}" style="height:38px;">
            </label>
            <label class="mt-field">
              <span class="mt-field-label">Bitiş</span>
              <input class="mt-input" id="mt-h-f-end" type="date" value="${mtState.hareket.filterEnd}" style="height:38px;">
            </label>
            <button class="mt-btn secondary" onclick="mtHareketFiltre()">Uygula</button>
          </div>
          <div id="mt-hareket-table"></div>
        </div>
      </div>
      <div>
        <div class="mt-card">
          <div class="mt-card-title">Güncel Palet Bakiyesi</div>
          <div class="mt-card-sub">Açılış bakiyesi + kümülatif (Pallet In − Pallet Out)</div>
          <div class="mt-stat-value">${mtFmtMiktar(bakiye.guncel)} <span style="font-size:14px;color:var(--text3);font-weight:700;">palet</span></div>
          <div class="mt-stat-sub">
            Açılış: ${mtFmtMiktar(bakiye.acilis_bakiye)} palet${bakiye.acilis_tarihi ? ' (' + mtFmtTarih(bakiye.acilis_tarihi) + ')' : ''}<br>
            Storage bakiye yöntemi: <b>${mtEsc(MT_YONTEM_LABELS[bakiye.bakiye_yontemi] || bakiye.bakiye_yontemi || '-')}</b>
          </div>
        </div>
        <div class="mt-card" style="margin-top:12px;">
          <div class="mt-card-title">Depo Ayarları</div>
          <div class="mt-card-sub">Açılış stoğu ve storage hesabında kullanılacak bakiye yöntemi.</div>
          <div class="mt-form">
            <div class="mt-form-row">
              <label class="mt-field">
                <span class="mt-field-label">Açılış Tarihi</span>
                <input class="mt-input" id="mt-d-tarih" type="date" value="${bakiye.acilis_tarihi || ''}">
              </label>
              <label class="mt-field">
                <span class="mt-field-label">Açılış Bakiyesi (palet)</span>
                <input class="mt-input" id="mt-d-bakiye" type="number" step="1" min="0" value="${bakiye.acilis_bakiye || 0}">
              </label>
            </div>
            <label class="mt-field">
              <span class="mt-field-label">Storage Bakiye Yöntemi</span>
              <select class="mt-select" id="mt-d-yontem">
                ${Object.entries(MT_YONTEM_LABELS).map(([v, l]) =>
                  `<option value="${v}" ${v === bakiye.bakiye_yontemi ? 'selected' : ''}>${l}</option>`).join('')}
              </select>
            </label>
            <button class="mt-btn secondary" onclick="mtSubmitDepoAyar()">Ayarları Kaydet</button>
          </div>
        </div>
        <div class="mt-card" style="margin-top:12px;">
          <div class="mt-card-title">Excel'den Yapıştır</div>
          <div class="mt-card-sub">Sütunlar: tarih, kalem, miktar (Excel'den kopyalanan hücreler sekmeli gelir). Kalem adı veya kodu kullanılabilir.</div>
          <div class="mt-form">
            <textarea class="mt-textarea" id="mt-import-text"
              placeholder="2026-07-10&#9;Pallet In&#9;24&#10;2026-07-10&#9;Box Out&#9;310&#10;10.07.2026&#9;Store Transfer per Pallet&#9;6"></textarea>
            <button class="mt-btn" onclick="mtSubmitImport()">Aktar</button>
            <div id="mt-import-result">${mtState.hareket.importMsg || ''}</div>
          </div>
        </div>
      </div>
    </div>
  `;
  mtRenderHareketTable();
  mtHareketGunYukle();
}

function mtRenderHareketTable() {
  const box = document.getElementById('mt-hareket-table');
  const data = mtState.hareket.data;
  if (!box || !data) return;
  const rows = data.hareketler || [];
  if (!rows.length) {
    box.innerHTML = '<div class="mt-empty">Kayıt yok. Hızlı giriş formundan veya Excel yapıştırarak ekleyin.</div>';
    return;
  }
  box.innerHTML = `
    <div class="mt-table-wrap">
      <table class="mt-table">
        <thead><tr><th>Tarih</th><th>Kalem</th><th style="text-align:right;">Miktar</th><th></th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td style="white-space:nowrap;">${mtFmtTarih(r.tarih)}</td>
              <td><span class="mt-kalem-ad">${mtEsc(r.kalem_ad)}</span></td>
              <td style="text-align:right;font-weight:750;color:var(--text);">${mtFmtMiktar(r.miktar)}</td>
              <td style="text-align:right;">
                <button class="mt-icon-btn" title="Kaydı sil" onclick="mtDeleteHareket(${r.id})"><i class="ti ti-trash"></i></button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function mtHareketTarihChanged() {
  const el = document.getElementById('mt-h-tarih');
  if (!el || !el.value) return;
  mtState.hareket.formTarih = el.value;
  mtHareketGunYukle();
}

async function mtHareketGunYukle() {
  // Seçilen günün mevcut kayıtlarını hızlı giriş formuna doldur
  const tarih = mtState.hareket.formTarih;
  const durum = document.getElementById('mt-h-gun-durum');
  document.querySelectorAll('[id^="mt-h-k-"]').forEach(el => { el.value = ''; });

  const params = new URLSearchParams({ ulke: mtState.ulke, start: tarih, end: tarih });
  try {
    const res = await fetch('/api/maliyet/hareket?' + params.toString(), { cache: 'no-store' });
    const data = await res.json();
    if (!data.success) return;
    (data.hareketler || []).forEach(r => {
      const el = document.getElementById('mt-h-k-' + r.kalem_id);
      if (el) el.value = r.miktar;
    });
    if (durum) {
      const n = (data.hareketler || []).length;
      durum.textContent = n ? `Bu günde ${n} kalem kayıtlı — değerler yüklendi.` : 'Bu gün için kayıt yok.';
    }
  } catch (e) { /* sessiz: form boş kalır */ }
}

async function mtSubmitHareketBulk() {
  const tarih = document.getElementById('mt-h-tarih').value;
  if (!tarih) { alert('Tarih seçin.'); return; }

  const hareketler = {};
  let dolu = 0;
  (mtState.meta.kalemler || []).filter(k => k.aktif && k.tip === 'hareket').forEach(k => {
    const el = document.getElementById('mt-h-k-' + k.id);
    if (el && el.value.trim() !== '') {
      hareketler[k.id] = el.value.trim();
      dolu++;
    }
  });
  if (!dolu) { alert('En az bir kalem için miktar girin.'); return; }

  const res = await fetch('/api/maliyet/hareket/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ulke: mtState.ulke, tarih, hareketler }),
  });
  const data = await res.json();
  if (!data.success) { alert('Kaydedilemedi: ' + (data.error || 'Sunucu hatası')); return; }
  mtLoadHareket();
}

async function mtDeleteHareket(id) {
  const r = (mtState.hareket.data.hareketler || []).find(h => h.id === id);
  const tanim = r ? `${mtFmtTarih(r.tarih)} / ${r.kalem_ad} = ${mtFmtMiktar(r.miktar)}` : '#' + id;
  if (!confirm(`Bu hareket kaydı silinecek:\n${tanim}\n\nDevam edilsin mi?`)) return;
  const res = await fetch('/api/maliyet/hareket/' + id, { method: 'DELETE' });
  const data = await res.json();
  if (!data.success) { alert('Silinemedi: ' + (data.error || 'Sunucu hatası')); return; }
  mtLoadHareket();
}

function mtHareketFiltre() {
  mtState.hareket.filterStart = document.getElementById('mt-h-f-start').value;
  mtState.hareket.filterEnd = document.getElementById('mt-h-f-end').value;
  mtLoadHareket();
}

async function mtSubmitDepoAyar() {
  const body = {
    ulke: mtState.ulke,
    acilis_tarihi: document.getElementById('mt-d-tarih').value || null,
    acilis_bakiye: document.getElementById('mt-d-bakiye').value || 0,
    bakiye_yontemi: document.getElementById('mt-d-yontem').value,
  };
  const res = await fetch('/api/maliyet/depo-ayar', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) { alert('Ayarlar kaydedilemedi: ' + (data.error || 'Sunucu hatası')); return; }
  mtLoadHareket();
}

async function mtSubmitImport() {
  const text = document.getElementById('mt-import-text').value.trim();
  const resultBox = document.getElementById('mt-import-result');
  if (!text) { alert('Aktarılacak veri yapıştırın.'); return; }

  const rows = [];
  const bozuk = [];
  text.split('\n').forEach((line, i) => {
    const t = line.trim();
    if (!t) return;
    const parts = t.split('\t').length >= 3 ? t.split('\t') : t.split(';');
    if (parts.length < 3) { bozuk.push(i + 1); return; }
    rows.push({
      tarih: parts[0].trim(),
      kalem: parts[1].trim(),
      miktar: parts[2].trim(),
    });
  });
  if (!rows.length) {
    resultBox.innerHTML = '<div class="mt-import-result err">Satırlar çözümlenemedi — sütunlar sekme veya ; ile ayrılmalı (tarih, kalem, miktar).</div>';
    return;
  }

  const res = await fetch('/api/maliyet/hareket/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ulke: mtState.ulke, rows }),
  });
  const data = await res.json();
  if (!data.success) {
    const hatalar = (data.hatalar || []).map(mtEsc).join('<br>');
    resultBox.innerHTML = `<div class="mt-import-result err">${mtEsc(data.error || 'Aktarım başarısız')}${hatalar ? '<br>' + hatalar : ''}</div>`;
    return;
  }
  const uyari = (data.hatalar || []).length
    ? `<br>Atlanan satırlar:<br>${data.hatalar.map(mtEsc).join('<br>')}`
    : '';
  const bozukUyari = bozuk.length ? `<br>Eksik sütunlu satırlar atlandı: ${bozuk.join(', ')}` : '';
  mtState.hareket.importMsg = `<div class="mt-import-result ok">${data.yazilan} satır aktarıldı.${uyari}${bozukUyari}</div>`;
  mtLoadHareket();
}

// ── KARŞILAŞTIRMA SEKMESİ ────────────────────────────────────────────────────

function mtFmtEur(value) {
  if (value == null) return '—';
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value)) + ' €';
}

function mtAyAralik(offset) {
  // offset: 0 = bu ay, -1 = geçen ay → { start, end } (ISO)
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + offset;
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: iso(start), end: iso(end) };
}

async function mtLoadKarsi() {
  const content = document.getElementById('mt-content');
  if (!content) return;
  if (!mtState.karsi.start) {
    const gecenAy = mtAyAralik(-1);
    mtState.karsi.start = gecenAy.start;
    mtState.karsi.end = gecenAy.end;
  }
  content.innerHTML = '<div class="mt-empty">Gerçek maliyetler yükleniyor…</div>';

  const params = new URLSearchParams({ start: mtState.karsi.start, end: mtState.karsi.end });
  try {
    const res = await fetch('/api/maliyet/gercek?' + params.toString(), { cache: 'no-store' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');
    mtState.karsi.data = data;
    mtState.karsi.detay = {};   // dönem değişmiş olabilir — detay cache'i sıfırla
  } catch (e) {
    content.innerHTML = `<div class="mt-empty">Gerçek maliyetler alınamadı: ${mtEsc(e.message)}</div>`;
    return;
  }
  mtRenderKarsi();
}

function mtFarkPill(pct) {
  if (pct == null) return '<span class="mt-pct ok">—</span>';
  if (pct > 5) return `<span class="mt-pct up">▲ +%${pct.toLocaleString('tr-TR')}</span>`;
  if (pct < -5) return `<span class="mt-pct down">▼ %${pct.toLocaleString('tr-TR')}</span>`;
  return `<span class="mt-pct ok">%${pct.toLocaleString('tr-TR')}</span>`;
}

function mtKarsiPill(u) {
  if (u.fatura_sayisi === 0) {
    return (u.beklenen.eur || 0) > 0
      ? '<span class="mt-pct none">fatura girilmedi</span>'
      : '<span class="mt-pct ok">—</span>';
  }
  return mtFarkPill(u.fark_pct);
}

function mtLokalToplamlar(paraToplamlari) {
  const simge = { EUR: '€', USD: '$', TRY: '₺' };
  return Object.entries(paraToplamlari || {})
    .filter(([p]) => p !== 'EUR')
    .map(([p, v]) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(v) + ' ' + (simge[p] || p))
    .join(' + ');
}

function mtRenderKarsi() {
  const content = document.getElementById('mt-content');
  const data = mtState.karsi.data;
  if (!content || !data) return;
  const rows = data.ulkeler || [];
  const gercekToplam = rows.reduce((s, u) => s + (u.gercek_eur || 0), 0);
  const faturaToplam = rows.reduce((s, u) => s + u.fatura_sayisi, 0);
  const dagitilmamis = rows.reduce((s, u) => s + u.dagitilmamis, 0);
  const kurNotu = (data.kurlar && data.kurlar.USD)
    ? `1 € = ${data.kurlar.USD.toLocaleString('tr-TR')} $ / ${data.kurlar.TRY.toLocaleString('tr-TR')} ₺`
    : 'Kur alınamadı — EUR dışı tutarlar çevrilemiyor';

  content.innerHTML = `
    <div class="mt-card">
      <div class="mt-card-title">Gerçek Maliyetler</div>
      <div class="mt-card-sub">Kaydedilen faturaların gerçekleşen tutarları ve maliyet kalemi dağılımı. Tarih filtresi fatura tarihini, fatura tarihi yoksa dönem bitişini esas alır. ${mtEsc(kurNotu)}</div>
      <div class="mt-filter-row">
        <label class="mt-field">
          <span class="mt-field-label">Başlangıç</span>
          <input class="mt-input" id="mt-c-start" type="date" value="${mtState.karsi.start}" style="height:38px;">
        </label>
        <label class="mt-field">
          <span class="mt-field-label">Bitiş</span>
          <input class="mt-input" id="mt-c-end" type="date" value="${mtState.karsi.end}" style="height:38px;">
        </label>
        <button class="mt-btn secondary" onclick="mtKarsiAy(0)">Bu Ay</button>
        <button class="mt-btn secondary" onclick="mtKarsiAy(-1)">Geçen Ay</button>
        <button class="mt-btn" onclick="mtKarsiUygula()">Uygula</button>
      </div>
      <div class="mt-kpis">
        <div class="mt-kpi"><div class="mt-kpi-label">Gerçek Toplam</div><div class="mt-kpi-value">${mtFmtEur(gercekToplam)}</div></div>
        <div class="mt-kpi"><div class="mt-kpi-label">Fatura</div><div class="mt-kpi-value">${faturaToplam}</div></div>
        <div class="mt-kpi"><div class="mt-kpi-label">Maliyet Girilen Ülke</div><div class="mt-kpi-value">${rows.length}</div></div>
        <div class="mt-kpi"><div class="mt-kpi-label">Dağıtılmamış Eski Fatura</div><div class="mt-kpi-value" style="color:${dagitilmamis ? '#B91C1C' : '#166534'};">${dagitilmamis}</div></div>
      </div>
      ${dagitilmamis ? '<div class="mt-uyari">Eski toplam faturalarından bazıları henüz maliyet kalemlerine dağıtılmadı. Faturalar sekmesinden düzenleyebilirsiniz.</div>' : ''}
      <div class="mt-table-wrap">
        <table class="mt-table">
          <thead>
            <tr><th>Ülke</th><th style="text-align:right;">Gerçek Toplam</th><th style="text-align:right;">Fatura</th><th style="text-align:right;">Maliyet Kalemi</th><th></th></tr>
          </thead>
          <tbody>
            ${rows.map(u => {
              const acik = !!mtState.karsi.expanded[u.ulke];
              return `
                <tr class="mt-row-click" onclick="mtToggleKarsiDetay('${u.ulke}')">
                  <td><span class="mt-kalem-ad" style="display:inline-flex;align-items:center;gap:8px;">
                    <span style="width:9px;height:9px;border-radius:999px;background:${mtUlkeColor(u.ulke)};box-shadow:0 0 0 4px color-mix(in srgb, ${mtUlkeColor(u.ulke)} 14%, transparent);"></span>
                    ${mtEsc(u.label)}</span></td>
                  <td style="text-align:right;font-weight:700;color:var(--text);">${mtFmtEur(u.gercek_eur)}</td>
                  <td style="text-align:right;">${u.fatura_sayisi}</td>
                  <td style="text-align:right;">${(u.kalemler || []).length}${u.dagitilmamis ? `<span class="mt-local-sub">${u.dagitilmamis} dağıtılmamış</span>` : ''}</td>
                  <td style="text-align:right;color:var(--text3);">${acik ? '▾' : '▸'}</td>
                </tr>
                ${acik ? `<tr><td colspan="5" class="mt-detail-cell"><div id="mt-c-detay-${u.ulke}"></div></td></tr>` : ''}
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  Object.keys(mtState.karsi.expanded).forEach(kod => {
    if (mtState.karsi.expanded[kod]) mtRenderKarsiDetay(kod);
  });
}

function mtKarsiAy(offset) {
  const a = mtAyAralik(offset);
  mtState.karsi.start = a.start;
  mtState.karsi.end = a.end;
  mtLoadKarsi();
}

function mtKarsiUygula() {
  const start = document.getElementById('mt-c-start').value;
  const end = document.getElementById('mt-c-end').value;
  if (!start || !end || start > end) { alert('Geçerli bir tarih aralığı seçin.'); return; }
  mtState.karsi.start = start;
  mtState.karsi.end = end;
  mtLoadKarsi();
}

function mtToggleKarsiDetay(kod) {
  mtState.karsi.expanded[kod] = !mtState.karsi.expanded[kod];
  mtRenderKarsi();
}

async function mtRenderKarsiDetay(kod) {
  const box = document.getElementById('mt-c-detay-' + kod);
  if (!box) return;

  const gercekUlke = (mtState.karsi.data.ulkeler || []).find(x => x.ulke === kod) || {};
  const gercekKalemler = gercekUlke.kalemler || [];
  box.innerHTML = `
    <div style="font-size:11px;font-weight:750;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;">Gerçek Maliyet Dağılımı</div>
    ${gercekKalemler.length ? `
      <div class="mt-table-wrap"><table class="mt-table">
        <thead><tr><th>Maliyet Kalemi</th><th style="text-align:right;">Gerçek Tutar (EUR)</th></tr></thead>
        <tbody>${gercekKalemler.map(k => `<tr><td><span class="mt-kalem-ad">${mtEsc(k.kalem_ad)}</span></td><td style="text-align:right;font-weight:700;color:var(--text);">${mtFmtEur(k.tutar_eur)}</td></tr>`).join('')}</tbody>
      </table></div>
    ` : '<div class="mt-empty">Bu faturalar henüz maliyet kalemlerine dağıtılmamış.</div>'}
  `;
  return;

  if (!mtState.karsi.detay[kod]) {
    const params = new URLSearchParams({
      ulke: kod, start: mtState.karsi.start, end: mtState.karsi.end, kirilim: 'ay',
    });
    try {
      const res = await fetch('/api/maliyet/beklenen?' + params.toString(), { cache: 'no-store' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Sunucu hatası');
      mtState.karsi.detay[kod] = data;
    } catch (e) {
      box.innerHTML = `<div class="mt-empty">Detay alınamadı: ${mtEsc(e.message)}</div>`;
      return;
    }
  }
  const detay = mtState.karsi.detay[kod];
  const kalemler = detay.kalemler || [];
  const uyarilar = detay.uyarilar || [];
  const ulkeSatiri = (mtState.karsi.data.ulkeler || []).find(x => x.ulke === kod) || {};
  const faturalar = ulkeSatiri.faturalar || [];

  const faturaEslesme = faturalar.length ? `
    <div style="font-size:11px;font-weight:750;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;">Fatura — Dönem Eşleşmesi</div>
    <div class="mt-table-wrap" style="margin-bottom:14px;">
      <table class="mt-table">
        <thead><tr><th>Fatura No</th><th>Dönem</th><th style="text-align:right;">Gerçek</th><th style="text-align:right;">Dönem Bekleneni</th><th style="text-align:right;">Fark</th><th>Fark %</th></tr></thead>
        <tbody>
          ${faturalar.map(f => `
            <tr>
              <td><span class="mt-kalem-ad">${mtEsc(f.fatura_no)}</span></td>
              <td style="white-space:nowrap;">${mtFmtTarih(f.donem_baslangic)} – ${mtFmtTarih(f.donem_bitis)}</td>
              <td style="text-align:right;font-weight:700;color:var(--text);">${mtFmtEur(f.tutar_eur)}</td>
              <td style="text-align:right;">${mtFmtEur(f.beklenen_eur)}</td>
              <td style="text-align:right;">${f.fark_eur != null ? mtFmtEur(f.fark_eur) : '—'}</td>
              <td>${mtFarkPill(f.fark_pct)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ${ulkeSatiri.beklenen && ulkeSatiri.beklenen.eur != null && ulkeSatiri.eslesen_beklenen_eur != null
      && ulkeSatiri.beklenen.eur - ulkeSatiri.eslesen_beklenen_eur > 0.005 ? `
      <div class="mt-uyari">Aralık bekleneni ${mtFmtEur(ulkeSatiri.beklenen.eur)}, faturalanan dönemlere düşen ${mtFmtEur(ulkeSatiri.eslesen_beklenen_eur)} —
      ${mtFmtEur(ulkeSatiri.beklenen.eur - ulkeSatiri.eslesen_beklenen_eur)} tutarındaki beklenen maliyet için henüz fatura girilmedi.</div>` : ''}
  ` : '';

  box.innerHTML = `
    ${uyarilar.map(u => `<div class="mt-uyari">${mtEsc(u)}</div>`).join('')}
    ${faturaEslesme}
    <div style="font-size:11px;font-weight:750;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;">Kalem Kırılımı (Aralık Bekleneni)</div>
    ${kalemler.length ? `
      <div class="mt-table-wrap">
        <table class="mt-table">
          <thead><tr><th>Kalem</th><th>Birim</th><th style="text-align:right;">Miktar</th><th style="text-align:right;">Tutar</th><th style="text-align:right;">EUR</th></tr></thead>
          <tbody>
            ${kalemler.map(k => `
              <tr>
                <td><span class="mt-kalem-ad">${mtEsc(k.kalem_ad)}</span></td>
                <td><span class="mt-pill birim">${mtEsc(mtBirimLabel(k.birim))}</span></td>
                <td style="text-align:right;">${k.tip === 'hareket' ? mtFmtMiktar(k.miktar) : '—'}</td>
                <td style="text-align:right;font-weight:700;color:var(--text);">${mtFmtFiyat(k.tutar, k.para_birimi)}</td>
                <td style="text-align:right;">${mtFmtEur(k.tutar_eur)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : '<div class="mt-empty">Bu dönemde hesaplanan kalem yok — tarife ve hareket girişlerini kontrol edin.</div>'}
  `;
}

// ── FATURALAR SEKMESİ ────────────────────────────────────────────────────────

async function mtLoadFatura() {
  const content = document.getElementById('mt-content');
  if (!content || !mtState.ulke) return;
  content.innerHTML = '<div class="mt-empty">Faturalar yükleniyor…</div>';
  try {
    const res = await fetch('/api/maliyet/fatura?ulke=' + encodeURIComponent(mtState.ulke), { cache: 'no-store' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');
    mtState.fatura.list = data.faturalar || [];
  } catch (e) {
    content.innerHTML = `<div class="mt-empty">Faturalar alınamadı: ${mtEsc(e.message)}</div>`;
    return;
  }
  mtRenderFatura();
}

function mtRenderFatura() {
  const content = document.getElementById('mt-content');
  if (!content) return;
  const ulke = mtUlkeObj();
  const rows = mtState.fatura.list || [];
  const edit = mtState.fatura.editId != null
    ? rows.find(f => f.id === mtState.fatura.editId)
    : null;

  content.innerHTML = `
    <div class="mt-grid">
      <div class="mt-card">
        <div class="mt-card-title">${mtEsc(ulke.label || '')} — Depo Faturaları</div>
        <div class="mt-card-sub">Gelen gerçek 3PL faturaları. "Dönem Bekleneni": faturanın kendi dönemine denk gelen, tarife + hareketlerden hesaplanan tutar — fark ve % bu eşleşmeden gelir.</div>
        <div id="mt-fatura-table">
          ${rows.length ? `
            <div class="mt-table-wrap">
              <table class="mt-table">
                <thead><tr><th>Fatura No</th><th>Dönem</th><th style="text-align:right;">Tutar</th><th style="text-align:right;">Dönem Bekleneni</th><th>Fark</th><th>Not</th><th></th></tr></thead>
                <tbody>
                  ${rows.map(f => `
                    <tr style="${f.id === mtState.fatura.editId ? 'outline:2px solid var(--accent-mid);' : ''}">
                      <td><span class="mt-kalem-ad">${mtEsc(f.fatura_no)}</span>${f.fatura_tarihi ? `<span class="mt-local-sub">${mtFmtTarih(f.fatura_tarihi)}</span>` : ''}</td>
                      <td style="white-space:nowrap;">${mtFmtTarih(f.donem_baslangic)} – ${mtFmtTarih(f.donem_bitis)}</td>
                      <td style="text-align:right;font-weight:750;color:var(--text);">${mtFmtFiyat(f.tutar, f.para_birimi)}</td>
                      <td style="text-align:right;">${f.beklenen_eur != null ? mtFmtEur(f.beklenen_eur) : '—'}${f.fark_eur != null ? `<span class="mt-local-sub">fark: ${mtFmtEur(f.fark_eur)}</span>` : ''}</td>
                      <td>${mtFarkPill(f.fark_pct)}</td>
                      <td>${f.notlar ? `<span title="${mtEsc(f.notlar)}">${mtEsc(f.notlar.length > 20 ? f.notlar.slice(0, 20) + '…' : f.notlar)}</span>` : ''}</td>
                      <td style="text-align:right;white-space:nowrap;">
                        <button class="mt-icon-btn" title="Düzenle" style="color:var(--accent);" onclick="mtEditFatura(${f.id})"><i class="ti ti-pencil"></i></button>
                        <button class="mt-icon-btn" title="Sil" onclick="mtDeleteFatura(${f.id})"><i class="ti ti-trash"></i></button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : '<div class="mt-empty">Bu ülke için fatura girilmedi.</div>'}
        </div>
      </div>
      <div class="mt-card">
        <div class="mt-card-title">${edit ? 'Fatura Düzenle' : 'Fatura Girişi'}</div>
        <div class="mt-card-sub">${edit ? mtEsc(edit.fatura_no) + ' güncelleniyor.' : 'Depodan gelen faturayı dönemiyle birlikte kaydedin.'}</div>
        <div class="mt-form">
          <label class="mt-field">
            <span class="mt-field-label">Fatura No</span>
            <input class="mt-input" id="mt-fa-no" type="text" maxlength="60" value="${edit ? mtEsc(edit.fatura_no) : ''}">
          </label>
          <div class="mt-form-row">
            <label class="mt-field">
              <span class="mt-field-label">Dönem Başlangıç</span>
              <input class="mt-input" id="mt-fa-bas" type="date" value="${edit ? edit.donem_baslangic : ''}">
            </label>
            <label class="mt-field">
              <span class="mt-field-label">Dönem Bitiş</span>
              <input class="mt-input" id="mt-fa-bit" type="date" value="${edit ? edit.donem_bitis : ''}">
            </label>
          </div>
          <div class="mt-form-row">
            <label class="mt-field">
              <span class="mt-field-label">Tutar</span>
              <input class="mt-input" id="mt-fa-tutar" type="number" step="0.01" min="0" value="${edit ? edit.tutar : ''}">
            </label>
            <label class="mt-field">
              <span class="mt-field-label">Para Birimi</span>
              <select class="mt-select" id="mt-fa-para">
                ${['EUR', 'USD', 'TRY'].map(p => `<option value="${p}" ${p === (edit ? edit.para_birimi : (ulke.currency || 'EUR')) ? 'selected' : ''}>${p}</option>`).join('')}
              </select>
            </label>
          </div>
          <div class="mt-form-row">
            <label class="mt-field">
              <span class="mt-field-label">Fatura Tarihi (ops.)</span>
              <input class="mt-input" id="mt-fa-tarih" type="date" value="${edit && edit.fatura_tarihi ? edit.fatura_tarihi : ''}">
            </label>
            <label class="mt-field">
              <span class="mt-field-label">Not (ops.)</span>
              <input class="mt-input" id="mt-fa-not" type="text" maxlength="200" value="${edit && edit.notlar ? mtEsc(edit.notlar) : ''}">
            </label>
          </div>
          <div class="mt-form-row">
            <button class="mt-btn" onclick="mtSubmitFatura()">${edit ? 'Güncelle' : 'Faturayı Kaydet'}</button>
            ${edit ? '<button class="mt-btn secondary" onclick="mtFaturaVazgec()">Vazgeç</button>' : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

function mtEditFatura(id) {
  mtState.fatura.editId = id;
  mtRenderFatura();
}

function mtFaturaVazgec() {
  mtState.fatura.editId = null;
  mtRenderFatura();
}

async function mtSubmitFatura() {
  const body = {
    ulke: mtState.ulke,
    fatura_no: document.getElementById('mt-fa-no').value.trim(),
    donem_baslangic: document.getElementById('mt-fa-bas').value,
    donem_bitis: document.getElementById('mt-fa-bit').value,
    tutar: document.getElementById('mt-fa-tutar').value,
    para_birimi: document.getElementById('mt-fa-para').value,
    fatura_tarihi: document.getElementById('mt-fa-tarih').value || null,
    notlar: document.getElementById('mt-fa-not').value.trim(),
  };
  if (!body.fatura_no) { alert('Fatura no girin.'); return; }
  if (!body.donem_baslangic || !body.donem_bitis || body.donem_baslangic > body.donem_bitis) {
    alert('Geçerli bir dönem aralığı girin.');
    return;
  }
  if (!body.tutar || Number(body.tutar) < 0) { alert('Geçerli bir tutar girin.'); return; }

  const editId = mtState.fatura.editId;
  const res = await fetch('/api/maliyet/fatura' + (editId != null ? '/' + editId : ''), {
    method: editId != null ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) { alert('Fatura kaydedilemedi: ' + (data.error || 'Sunucu hatası')); return; }
  mtState.fatura.editId = null;
  mtLoadFatura();
}

async function mtDeleteFatura(id) {
  const f = (mtState.fatura.list || []).find(x => x.id === id);
  const tanim = f ? `${f.fatura_no} = ${mtFmtFiyat(f.tutar, f.para_birimi)}` : '#' + id;
  if (!confirm(`Bu fatura kaydı silinecek:\n${tanim}\n\nDevam edilsin mi?`)) return;
  const res = await fetch('/api/maliyet/fatura/' + id, { method: 'DELETE' });
  const data = await res.json();
  if (!data.success) { alert('Silinemedi: ' + (data.error || 'Sunucu hatası')); return; }
  if (mtState.fatura.editId === id) mtState.fatura.editId = null;
  mtLoadFatura();
}

// Kırılımlı gerçek fatura editörü. Aynı isimli eski toplam-form fonksiyonlarını
// bilinçli olarak ezer; eski kayıtlar düzenlenene kadar veri kaybı olmadan listelenir.
function mtBosFaturaDraft() {
  const a = mtAyAralik(0);
  return { fatura_no: '', donem_baslangic: a.start, donem_bitis: a.end,
    fatura_tarihi: '', para_birimi: (mtUlkeObj().currency || 'EUR'), notlar: '',
    kalemler: [{ kalem_id: '', tarih: '', aciklama: '', referans: '', miktar: 1, birim_fiyat: '', tutar: '' }] };
}

function mtKalemOptions(secili) {
  return '<option value="">Maliyet türü seçin</option>' + (mtState.meta.kalemler || [])
    .filter(k => k.aktif)
    .map(k => `<option value="${k.id}" ${Number(secili) === k.id ? 'selected' : ''}>${mtEsc(k.ad)}</option>`).join('');
}

function mtCaptureFaturaDraft() {
  const no = document.getElementById('mt-fa-no');
  if (!no) return mtState.fatura.draft;
  const lines = [...document.querySelectorAll('.mt-fa-line')].map(row => ({
    kalem_id: row.querySelector('[data-f="kalem_id"]').value,
    tarih: row.querySelector('[data-f="tarih"]').value,
    aciklama: row.querySelector('[data-f="aciklama"]').value.trim(),
    referans: row.querySelector('[data-f="referans"]').value.trim(),
    miktar: row.querySelector('[data-f="miktar"]').value,
    birim_fiyat: row.querySelector('[data-f="birim_fiyat"]').value,
    tutar: row.querySelector('[data-f="tutar"]').value,
  }));
  mtState.fatura.draft = { fatura_no: no.value.trim(),
    donem_baslangic: document.getElementById('mt-fa-bas').value,
    donem_bitis: document.getElementById('mt-fa-bit').value,
    fatura_tarihi: document.getElementById('mt-fa-tarih').value,
    para_birimi: document.getElementById('mt-fa-para').value,
    notlar: document.getElementById('mt-fa-not').value.trim(), kalemler: lines };
  return mtState.fatura.draft;
}

function mtRenderFatura() {
  const content = document.getElementById('mt-content');
  if (!content) return;
  const ulke = mtUlkeObj();
  const rows = mtState.fatura.list || [];
  if (!mtState.fatura.draft) mtState.fatura.draft = mtBosFaturaDraft();
  const d = mtState.fatura.draft;
  const total = (d.kalemler || []).reduce((s, x) => s + (Number(x.tutar) || 0), 0);
  content.innerHTML = `
    <div class="mt-card" style="margin-bottom:12px;">
      <div class="mt-card-title">${mtEsc(ulke.label || '')} — Gerçek Faturalar</div>
      <div class="mt-card-sub">Her fatura satırı bir maliyet türüne bağlanır. Böylece gerçek maliyet dağılımı doğrudan faturadan oluşur.</div>
      ${rows.length ? `<div class="mt-table-wrap"><table class="mt-table">
        <thead><tr><th>Fatura No</th><th>Fatura Tarihi</th><th>Dönem</th><th style="text-align:right;">Gerçek Tutar</th><th>Dağılım</th><th></th></tr></thead>
        <tbody>${rows.map(f => `<tr style="${f.id === mtState.fatura.editId ? 'outline:2px solid var(--accent-mid);' : ''}">
          <td><span class="mt-kalem-ad">${mtEsc(f.fatura_no)}</span></td>
          <td>${f.fatura_tarihi ? mtFmtTarih(f.fatura_tarihi) : '—'}</td>
          <td style="white-space:nowrap;">${mtFmtTarih(f.donem_baslangic)} – ${mtFmtTarih(f.donem_bitis)}</td>
          <td style="text-align:right;font-weight:750;color:var(--text);">${mtFmtFiyat(f.tutar, f.para_birimi)}</td>
          <td>${(f.kalemler || []).length ? (f.kalemler || []).map(k => `${mtEsc(k.kalem_ad)}: ${mtFmtFiyat(k.tutar, f.para_birimi)}`).join('<br>') : '<span class="mt-pct none">dağıtılmamış</span>'}</td>
          <td style="text-align:right;white-space:nowrap;"><button class="mt-icon-btn" title="Düzenle" style="color:var(--accent);" onclick="mtEditFatura(${f.id})"><i class="ti ti-pencil"></i></button><button class="mt-icon-btn" title="Sil" onclick="mtDeleteFatura(${f.id})"><i class="ti ti-trash"></i></button></td>
        </tr>`).join('')}</tbody></table></div>` : '<div class="mt-empty">Bu ülke için fatura girilmedi.</div>'}
    </div>
    <div class="mt-card">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:start;flex-wrap:wrap;">
        <div><div class="mt-card-title">${mtState.fatura.editId != null ? 'Fatura Düzenle' : 'Yeni Fatura'}</div><div class="mt-card-sub">Manuel girin veya PDF ile alanları ön doldurun; kaydetmeden önce eşleştirmeleri kontrol edin.</div></div>
        <div><input id="mt-fa-pdf" type="file" accept="application/pdf" hidden onchange="mtFaturaPdfOku(this.files[0])"><button class="mt-btn secondary" onclick="document.getElementById('mt-fa-pdf').click()"><i class="ti ti-file-type-pdf"></i> PDF Oku</button><span id="mt-fa-pdf-status" class="mt-local-sub"></span></div>
      </div>
      <div class="mt-form">
        <div class="mt-form-row"><label class="mt-field"><span class="mt-field-label">Fatura No</span><input class="mt-input" id="mt-fa-no" value="${mtEsc(d.fatura_no)}"></label><label class="mt-field"><span class="mt-field-label">Fatura Tarihi</span><input class="mt-input" id="mt-fa-tarih" type="date" value="${d.fatura_tarihi || ''}"></label></div>
        <div class="mt-form-row"><label class="mt-field"><span class="mt-field-label">Hizmet Dönemi Başlangıç</span><input class="mt-input" id="mt-fa-bas" type="date" value="${d.donem_baslangic || ''}"></label><label class="mt-field"><span class="mt-field-label">Hizmet Dönemi Bitiş</span><input class="mt-input" id="mt-fa-bit" type="date" value="${d.donem_bitis || ''}"></label></div>
        <div class="mt-form-row"><label class="mt-field"><span class="mt-field-label">Para Birimi</span><select class="mt-select" id="mt-fa-para">${['EUR','USD','TRY'].map(p => `<option ${p === d.para_birimi ? 'selected' : ''}>${p}</option>`).join('')}</select></label><label class="mt-field"><span class="mt-field-label">Not</span><input class="mt-input" id="mt-fa-not" maxlength="200" value="${mtEsc(d.notlar || '')}"></label></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;"><div class="mt-card-title">Fatura Kırılımı</div><button class="mt-btn secondary" style="height:34px;" onclick="mtFaturaSatirEkle()">+ Kalem Ekle</button></div>
        <div class="mt-table-wrap"><table class="mt-table"><thead><tr><th>Maliyet Türü</th><th>Tarih</th><th>Açıklama</th><th>Referans</th><th style="text-align:right;">Miktar</th><th style="text-align:right;">Birim Fiyat</th><th style="text-align:right;">Tutar</th><th></th></tr></thead>
          <tbody>${(d.kalemler || []).map((k, i) => `<tr class="mt-fa-line">
            <td><select class="mt-select" data-f="kalem_id" style="min-width:180px;height:36px;">${mtKalemOptions(k.kalem_id)}</select></td>
            <td><input class="mt-input" data-f="tarih" type="date" value="${k.tarih || ''}" style="min-width:138px;height:36px;"></td>
            <td><input class="mt-input" data-f="aciklama" value="${mtEsc(k.aciklama || '')}" style="min-width:240px;height:36px;"></td>
            <td><input class="mt-input" data-f="referans" value="${mtEsc(k.referans || '')}" style="min-width:100px;height:36px;"></td>
            <td><input class="mt-input" data-f="miktar" type="number" min="0" step="0.0001" value="${k.miktar ?? 1}" oninput="mtFaturaHesapla(this)" style="width:90px;height:36px;text-align:right;"></td>
            <td><input class="mt-input" data-f="birim_fiyat" type="number" min="0" step="0.0001" value="${k.birim_fiyat ?? ''}" oninput="mtFaturaHesapla(this)" style="width:110px;height:36px;text-align:right;"></td>
            <td><input class="mt-input" data-f="tutar" type="number" min="0" step="0.01" value="${k.tutar ?? ''}" oninput="mtFaturaToplamGuncelle()" style="width:110px;height:36px;text-align:right;"></td>
            <td><button class="mt-icon-btn" onclick="mtFaturaSatirSil(${i})"><i class="ti ti-trash"></i></button></td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="6" style="text-align:right;font-weight:800;">FATURA TOPLAMI</td><td id="mt-fa-total" style="text-align:right;font-weight:800;color:var(--text);">${mtFmtFiyat(total, d.para_birimi)}</td><td></td></tr></tfoot>
        </table></div>
        <div class="mt-form-row"><button class="mt-btn" onclick="mtSubmitFatura()">${mtState.fatura.editId != null ? 'Faturayı Güncelle' : 'Faturayı Kaydet'}</button><button class="mt-btn secondary" onclick="mtFaturaVazgec()">Formu Temizle</button></div>
      </div>
    </div>`;
}

function mtFaturaSatirEkle() { const d = mtCaptureFaturaDraft(); d.kalemler.push({kalem_id:'',tarih:'',aciklama:'',referans:'',miktar:1,birim_fiyat:'',tutar:''}); mtRenderFatura(); }
function mtFaturaSatirSil(i) { const d = mtCaptureFaturaDraft(); d.kalemler.splice(i, 1); if (!d.kalemler.length) d.kalemler.push({kalem_id:'',tarih:'',aciklama:'',referans:'',miktar:1,birim_fiyat:'',tutar:''}); mtRenderFatura(); }
function mtFaturaHesapla(input) { const row=input.closest('.mt-fa-line'), m=Number(row.querySelector('[data-f="miktar"]').value)||0, b=Number(row.querySelector('[data-f="birim_fiyat"]').value)||0; row.querySelector('[data-f="tutar"]').value=(m*b).toFixed(2); mtFaturaToplamGuncelle(); }
function mtFaturaToplamGuncelle() { const t=[...document.querySelectorAll('[data-f="tutar"]')].reduce((s,e)=>s+(Number(e.value)||0),0), p=document.getElementById('mt-fa-para')?.value||'EUR'; const el=document.getElementById('mt-fa-total'); if(el) el.textContent=mtFmtFiyat(t,p); }

function mtEditFatura(id) {
  const f=(mtState.fatura.list||[]).find(x=>x.id===id); if(!f) return;
  mtState.fatura.editId=id; mtState.fatura.draft={...f, fatura_tarihi:f.fatura_tarihi||'', notlar:f.notlar||'', kalemler:(f.kalemler||[]).map(k=>({...k}))};
  if (!mtState.fatura.draft.kalemler.length) mtState.fatura.draft.kalemler=[{kalem_id:'',tarih:'',aciklama:'',referans:'',miktar:1,birim_fiyat:'',tutar:f.tutar}];
  mtRenderFatura();
}
function mtFaturaVazgec() { mtState.fatura.editId=null; mtState.fatura.draft=mtBosFaturaDraft(); mtRenderFatura(); }

async function mtSubmitFatura() {
  const body=mtCaptureFaturaDraft(); body.ulke=mtState.ulke;
  if(!body.fatura_no) return alert('Fatura no girin.');
  if(!body.donem_baslangic||!body.donem_bitis||body.donem_baslangic>body.donem_bitis) return alert('Geçerli hizmet dönemi girin.');
  if(!body.kalemler.length||body.kalemler.some(k=>!k.kalem_id||!k.aciklama||k.tutar==='')) return alert('Her satırda maliyet türü, açıklama ve tutar girin.');
  const id=mtState.fatura.editId, res=await fetch('/api/maliyet/fatura'+(id!=null?'/'+id:''),{method:id!=null?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}), data=await res.json();
  if(!data.success) return alert('Fatura kaydedilemedi: '+(data.error||'Sunucu hatası'));
  mtState.fatura.editId=null; mtState.fatura.draft=null; mtLoadFatura();
}

async function mtFaturaPdfOku(file) {
  if(!file) return; const status=document.getElementById('mt-fa-pdf-status'); if(status) status.textContent='PDF okunuyor…';
  try { const bytes=new Uint8Array(await file.arrayBuffer()); let binary=''; for(let i=0;i<bytes.length;i+=0x8000) binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
    const res=await fetch('/api/maliyet/fatura/pdf-oku',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pdf:btoa(binary),ulke:mtState.ulke})}), data=await res.json(); if(!data.success) throw new Error(data.error||'PDF okunamadı');
    const current=mtCaptureFaturaDraft()||mtBosFaturaDraft(), t=data.taslak||{}; mtState.fatura.draft={...current,...t, fatura_no:t.fatura_no||current.fatura_no, fatura_tarihi:t.fatura_tarihi||current.fatura_tarihi, donem_baslangic:t.donem_baslangic||current.donem_baslangic, donem_bitis:t.donem_bitis||current.donem_bitis, kalemler:(t.kalemler&&t.kalemler.length)?t.kalemler:current.kalemler}; mtRenderFatura();
    const next=document.getElementById('mt-fa-pdf-status'); if(next) next.textContent=data.uyari||`${t.kalemler?.length||0} satır okundu — eşleştirmeleri kontrol edin.`;
  } catch(e) { if(status) status.textContent=e.message; alert('PDF okunamadı: '+e.message); }
}

// ── ANALİZ SEKMESİ ───────────────────────────────────────────────────────────

const MT_AY_ADLARI = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

function mtFmtAy(ayKey) {
  const [y, m] = ayKey.split('-');
  return `${MT_AY_ADLARI[Number(m) - 1]} ${y.slice(2)}`;
}

function mtAnalizVarsayilanAralik() {
  // Son 6 ay: 5 ay önce ayın 1'i → bu ayın sonu
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: iso(start), end: iso(end) };
}

async function mtLoadAnaliz() {
  const content = document.getElementById('mt-content');
  if (!content || !mtState.ulke) return;
  if (!mtState.analiz.start) {
    const a = mtAnalizVarsayilanAralik();
    mtState.analiz.start = a.start;
    mtState.analiz.end = a.end;
  }
  content.innerHTML = '<div class="mt-empty">Analiz hesaplanıyor…</div>';

  const params = new URLSearchParams({
    ulke: mtState.ulke, start: mtState.analiz.start, end: mtState.analiz.end,
  });
  try {
    const res = await fetch('/api/maliyet/analiz?' + params.toString(), { cache: 'no-store' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');
    mtState.analiz.data = data;
  } catch (e) {
    content.innerHTML = `<div class="mt-empty">Analiz alınamadı: ${mtEsc(e.message)}</div>`;
    return;
  }
  mtRenderAnaliz();
}

function mtAnalizAralik(tip) {
  const now = new Date();
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (tip === 'yil') {
    mtState.analiz.start = `${now.getFullYear()}-01-01`;
    mtState.analiz.end = iso(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  } else {
    const a = mtAnalizVarsayilanAralik();
    mtState.analiz.start = a.start;
    mtState.analiz.end = a.end;
  }
  mtLoadAnaliz();
}

function mtAnalizUygula() {
  const start = document.getElementById('mt-a-start').value;
  const end = document.getElementById('mt-a-end').value;
  if (!start || !end || start > end) { alert('Geçerli bir tarih aralığı seçin.'); return; }
  mtState.analiz.start = start;
  mtState.analiz.end = end;
  mtLoadAnaliz();
}

function mtRenderAnaliz() {
  const content = document.getElementById('mt-content');
  const data = mtState.analiz.data;
  if (!content || !data) return;
  const ulke = mtUlkeObj();
  const aylik = data.aylik || [];
  const gercekVar = aylik.some(a => a.gercek_eur != null);

  content.innerHTML = `
    <div class="mt-card" style="margin-bottom:12px;">
      <div class="mt-filter-row" style="margin-bottom:0;">
        <label class="mt-field">
          <span class="mt-field-label">Başlangıç</span>
          <input class="mt-input" id="mt-a-start" type="date" value="${mtState.analiz.start}" style="height:38px;">
        </label>
        <label class="mt-field">
          <span class="mt-field-label">Bitiş</span>
          <input class="mt-input" id="mt-a-end" type="date" value="${mtState.analiz.end}" style="height:38px;">
        </label>
        <button class="mt-btn secondary" onclick="mtAnalizAralik('6ay')">Son 6 Ay</button>
        <button class="mt-btn secondary" onclick="mtAnalizAralik('yil')">Bu Yıl</button>
        <button class="mt-btn" onclick="mtAnalizUygula()">Uygula</button>
      </div>
    </div>
    <div class="mt-grid" style="grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);">
      <div class="mt-card">
        <div class="mt-card-title">Aylık Trend — ${mtEsc(ulke.label || '')}</div>
        <div class="mt-card-sub">Beklenen ve gerçek maliyet, EUR (gerçek: dönem başlangıcının ayına atanır)</div>
        <div class="mt-chart-box"><canvas id="mt-trend-canvas"></canvas></div>
        <table class="mt-mini-table">
          <thead><tr><th>Ay</th><th>Beklenen</th><th>Gerçek</th></tr></thead>
          <tbody>
            ${aylik.map(a => `
              <tr>
                <td>${mtFmtAy(a.ay)}</td>
                <td>${mtFmtEur(a.beklenen_eur)}</td>
                <td>${a.gercek_eur != null ? mtFmtEur(a.gercek_eur) : '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="mt-card">
        <div class="mt-card-title">Kalem Dağılımı — ${mtEsc(ulke.label || '')}</div>
        <div class="mt-card-sub">Seçili dönemde beklenen maliyetin kalemlere dağılımı (EUR)</div>
        <div id="mt-kalem-hbar"></div>
      </div>
    </div>
    <div class="mt-grid" style="margin-top:12px;">
      <div class="mt-card">
        <div class="mt-card-title">Ülkeler — Toplam Maliyet</div>
        <div class="mt-card-sub">Seçili dönemde beklenen toplam (EUR)</div>
        <div id="mt-ulke-toplam-hbar"></div>
      </div>
      <div class="mt-card">
        <div class="mt-card-title">Ülkeler — Palet Başına Maliyet</div>
        <div class="mt-card-sub">Beklenen toplam ÷ Pallet Out (EUR/palet) — hacimden bağımsız kıyas</div>
        <div id="mt-ulke-palet-hbar"></div>
      </div>
    </div>
    <div class="mt-card" style="margin-top:12px;">
      <div class="mt-card-title">Ülkeler Arası Karşılaştırma</div>
      <div class="mt-card-sub">Seçili dönem, EUR bazında</div>
      <div class="mt-table-wrap">
        <table class="mt-table">
          <thead>
            <tr><th>Ülke</th><th style="text-align:right;">Beklenen</th><th style="text-align:right;">Gerçek</th><th style="text-align:right;">Palet Out</th><th style="text-align:right;">€/Palet (Beklenen)</th><th style="text-align:right;">€/Palet (Gerçek)</th></tr>
          </thead>
          <tbody>
            ${(data.ulkeler || []).map(u => `
              <tr>
                <td><span class="mt-kalem-ad" style="display:inline-flex;align-items:center;gap:8px;">
                  <span style="width:9px;height:9px;border-radius:999px;background:${mtUlkeColor(u.ulke)};"></span>
                  ${mtEsc(u.label)}</span></td>
                <td style="text-align:right;">${mtFmtEur(u.beklenen_eur)}</td>
                <td style="text-align:right;">${u.gercek_eur != null ? mtFmtEur(u.gercek_eur) : '—'}</td>
                <td style="text-align:right;">${mtFmtMiktar(u.palet_out)}</td>
                <td style="text-align:right;font-weight:700;color:var(--text);">${u.palet_basina_beklenen != null ? mtFmtEur(u.palet_basina_beklenen) : '—'}</td>
                <td style="text-align:right;">${u.palet_basina_gercek != null ? mtFmtEur(u.palet_basina_gercek) : '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  mtRenderTrendChart(aylik, gercekVar);
  mtRenderHbar('mt-kalem-hbar',
    (data.kalemler || []).filter(k => k.tutar_eur > 0).map(k => ({
      label: k.kalem_ad, value: k.tutar_eur, display: mtFmtEur(k.tutar_eur), color: MT_VIZ.series1,
    })),
    'Bu dönemde hesaplanan kalem yok.');
  const ulkeler = (data.ulkeler || []).filter(u => (u.beklenen_eur || 0) > 0);
  mtRenderHbar('mt-ulke-toplam-hbar',
    ulkeler.slice().sort((a, b) => b.beklenen_eur - a.beklenen_eur).map(u => ({
      label: u.label, value: u.beklenen_eur, display: mtFmtEur(u.beklenen_eur), color: mtUlkeColor(u.ulke),
    })),
    'Hiçbir ülkede beklenen maliyet yok.');
  mtRenderHbar('mt-ulke-palet-hbar',
    ulkeler.filter(u => u.palet_basina_beklenen != null)
      .sort((a, b) => b.palet_basina_beklenen - a.palet_basina_beklenen).map(u => ({
        label: u.label, value: u.palet_basina_beklenen,
        display: mtFmtEur(u.palet_basina_beklenen), color: mtUlkeColor(u.ulke),
      })),
    'Palet başına maliyet için Pallet Out hareketi gerekli.');
}

function mtRenderHbar(elId, rows, emptyMsg) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = `<div class="mt-empty">${mtEsc(emptyMsg || 'Veri yok')}</div>`;
    return;
  }
  const max = Math.max(...rows.map(r => r.value), 1e-9);
  el.innerHTML = rows.map(r => `
    <div class="mt-hbar-row" title="${mtEsc(r.label)}: ${mtEsc(r.display)}">
      <div class="mt-hbar-label">${mtEsc(r.label)}</div>
      <div class="mt-hbar-track"><div class="mt-hbar-fill" style="width:${Math.max((r.value / max) * 100, 2)}%;background:${r.color};"></div></div>
      <div class="mt-hbar-val">${mtEsc(r.display)}</div>
    </div>
  `).join('');
}

// ── RAPOR SEKMESİ ────────────────────────────────────────────────────────────

function mtRenderRapor() {
  const content = document.getElementById('mt-content');
  if (!content || !mtState.meta) return;
  if (!mtState.rapor.start) {
    const a = mtAyAralik(-1);
    mtState.rapor.start = a.start;
    mtState.rapor.end = a.end;
  }
  if (mtState.rapor.secili === null) {
    mtState.rapor.secili = new Set(mtState.meta.ulkeler.map(u => u.kod));
  }

  content.innerHTML = `
    <div class="mt-card" style="max-width:760px;">
      <div class="mt-card-title">Excel Raporu</div>
      <div class="mt-card-sub">Seçilen ülkeler ve dönem için: Özet sheet (beklenen / gerçek / fark / palet başına maliyet) + ülke başına detay sheet (kalem kırılımı, toplamlar, gerçek faturalar). Master Excel stilinde.</div>
      <div class="mt-form">
        <div class="mt-field">
          <span class="mt-field-label">Ülkeler</span>
          <div class="mt-ulke-pills" id="mt-r-ulkeler" style="padding-top:2px;">
            ${mtState.meta.ulkeler.map(u => `
              <button class="mt-ulke-pill ${mtState.rapor.secili.has(u.kod) ? 'active' : ''}"
                      style="--ulke-color:${mtUlkeColor(u.kod)};"
                      onclick="mtRaporUlkeToggle('${u.kod}')">${mtEsc(u.label)}</button>
            `).join('')}
          </div>
          <div class="mt-hint" style="margin-top:4px;">
            <button class="mt-history-toggle" onclick="mtRaporTumu(true)">tümünü seç</button> ·
            <button class="mt-history-toggle" onclick="mtRaporTumu(false)">temizle</button>
          </div>
        </div>
        <div class="mt-form-row">
          <label class="mt-field">
            <span class="mt-field-label">Başlangıç</span>
            <input class="mt-input" id="mt-r-start" type="date" value="${mtState.rapor.start}">
          </label>
          <label class="mt-field">
            <span class="mt-field-label">Bitiş</span>
            <input class="mt-input" id="mt-r-end" type="date" value="${mtState.rapor.end}">
          </label>
        </div>
        <div class="mt-filter-row" style="margin-bottom:0;">
          <button class="mt-btn secondary" onclick="mtRaporAy(0)">Bu Ay</button>
          <button class="mt-btn secondary" onclick="mtRaporAy(-1)">Geçen Ay</button>
          <button class="mt-btn" id="mt-r-indir" onclick="mtRaporIndir()" style="flex:1;">
            ${mtState.rapor.indiriliyor ? 'Hazırlanıyor…' : 'Excel Raporu İndir'}
          </button>
        </div>
      </div>
    </div>
  `;
}

function mtRaporUlkeToggle(kod) {
  if (mtState.rapor.secili.has(kod)) mtState.rapor.secili.delete(kod);
  else mtState.rapor.secili.add(kod);
  mtRenderRapor();
}

function mtRaporTumu(sec) {
  mtState.rapor.secili = sec ? new Set(mtState.meta.ulkeler.map(u => u.kod)) : new Set();
  mtRenderRapor();
}

function mtRaporAy(offset) {
  const a = mtAyAralik(offset);
  mtState.rapor.start = a.start;
  mtState.rapor.end = a.end;
  mtRenderRapor();
}

async function mtRaporIndir() {
  const start = document.getElementById('mt-r-start').value;
  const end = document.getElementById('mt-r-end').value;
  if (!start || !end || start > end) { alert('Geçerli bir tarih aralığı seçin.'); return; }
  if (!mtState.rapor.secili.size) { alert('En az bir ülke seçin.'); return; }
  mtState.rapor.start = start;
  mtState.rapor.end = end;

  mtState.rapor.indiriliyor = true;
  mtRenderRapor();
  try {
    const params = new URLSearchParams({
      start, end, ulkeler: [...mtState.rapor.secili].join(','),
    });
    const res = await fetch('/api/maliyet/rapor?' + params.toString());
    const contentType = res.headers.get('Content-Type') || '';
    if (!res.ok || contentType.includes('application/json')) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      alert('Rapor indirilemedi: ' + (err.error || 'Sunucu hatası'));
      return;
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `maliyet_raporu_${start}_${end}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
  } finally {
    mtState.rapor.indiriliyor = false;
    mtRenderRapor();
  }
}

function mtRenderTrendChart(aylik, gercekVar) {
  const canvas = document.getElementById('mt-trend-canvas');
  if (!canvas) return;
  if (mtState.analiz.chart) {
    mtState.analiz.chart.destroy();
    mtState.analiz.chart = null;
  }
  if (typeof Chart === 'undefined') {
    canvas.parentElement.innerHTML = '<div class="mt-empty">Grafik kütüphanesi yüklenemedi (js/vendor/chart.umd.js).</div>';
    return;
  }
  if (!aylik.length) {
    canvas.parentElement.innerHTML = '<div class="mt-empty">Seçili aralıkta ay yok.</div>';
    return;
  }

  const datasets = [{
    label: 'Beklenen',
    data: aylik.map(a => a.beklenen_eur),
    backgroundColor: MT_VIZ.series1,
    borderRadius: 4,
    maxBarThickness: 26,
  }];
  if (gercekVar) {
    datasets.push({
      label: 'Gerçek',
      data: aylik.map(a => a.gercek_eur),
      backgroundColor: MT_VIZ.series2,
      borderRadius: 4,
      maxBarThickness: 26,
    });
  }

  mtState.analiz.chart = new Chart(canvas, {
    type: 'bar',
    data: { labels: aylik.map(a => mtFmtAy(a.ay)), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: datasets.length > 1,
          position: 'top',
          align: 'end',
          labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle',
                    color: MT_VIZ.muted, font: { family: 'Inter, system-ui, sans-serif', size: 11 } },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${mtFmtEur(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: MT_VIZ.muted, font: { family: 'Inter, system-ui, sans-serif', size: 11 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: MT_VIZ.grid },
          border: { display: false },
          ticks: {
            color: MT_VIZ.muted,
            font: { family: 'Inter, system-ui, sans-serif', size: 11 },
            callback: v => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(v) + ' €',
          },
        },
      },
    },
  });
}

// ── GERÇEK MALİYET ANALİZİ ──────────────────────────────────────────────────
// Eski beklenen/gerçek analizini, tüm ülkeleri ve fatura kırılımlarını kullanan
// gerçek maliyet analiziyle değiştirir.
async function mtLoadAnaliz() {
  const content = document.getElementById('mt-content');
  if (!content) return;
  if (!mtState.analiz.start) {
    const a = mtAnalizVarsayilanAralik();
    mtState.analiz.start = a.start;
    mtState.analiz.end = a.end;
  }
  content.innerHTML = '<div class="mt-empty">Gerçek maliyet analizi hazırlanıyor…</div>';
  const params = new URLSearchParams({ start: mtState.analiz.start, end: mtState.analiz.end });
  try {
    const res = await fetch('/api/maliyet/gercek?' + params.toString(), { cache: 'no-store' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');
    mtState.analiz.data = data;
    mtRenderAnaliz();
  } catch (e) {
    content.innerHTML = `<div class="mt-empty">Analiz alınamadı: ${mtEsc(e.message)}</div>`;
  }
}

function mtAnalizYuzde(value) {
  return `%${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(Number(value || 0))}`;
}

function mtAnalizChartTemizle() {
  if (mtState.analiz.chart) { mtState.analiz.chart.destroy(); mtState.analiz.chart = null; }
  (mtState.analiz.charts || []).forEach(c => c && c.destroy());
  mtState.analiz.charts = [];
}

function mtRenderAnaliz() {
  const content = document.getElementById('mt-content');
  const data = mtState.analiz.data;
  if (!content || !data) return;
  mtAnalizChartTemizle();
  const o = data.ozet || {};
  const ulkeler = (data.ulkeler || []).slice().sort((a, b) => (b.gercek_eur || 0) - (a.gercek_eur || 0));
  const kalemler = data.kalemler || [];
  const aylik = data.aylik || [];
  const zirveAy = aylik.slice().sort((a, b) => b.toplam_eur - a.toplam_eur)[0];
  const matrixToplam = kalemler.reduce((s, k) => s + (k.tutar_eur || 0), 0);

  content.innerHTML = `
    <style>
      .mt-an-hero{position:relative;overflow:hidden;border:1px solid rgba(37,99,235,.12);background:linear-gradient(135deg,#0f172a 0%,#172554 52%,#164e63 100%);color:#fff}
      .mt-an-hero:after{content:"";position:absolute;width:300px;height:300px;border-radius:50%;right:-100px;top:-170px;background:rgba(56,189,248,.16);filter:blur(2px)}
      .mt-an-hero .mt-card-title{color:#fff;font-size:18px}.mt-an-hero .mt-card-sub{color:rgba(255,255,255,.65);margin-bottom:0}
      .mt-an-toolbar{display:flex;justify-content:space-between;gap:16px;align-items:end;flex-wrap:wrap;position:relative;z-index:1}
      .mt-an-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:11px;margin:12px 0}
      .mt-an-kpi{position:relative;overflow:hidden;border:1px solid rgba(15,23,42,.08);border-radius:17px;background:rgba(255,255,255,.96);padding:15px;box-shadow:0 12px 34px rgba(15,23,42,.06);transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
      .mt-an-kpi:hover{transform:translateY(-3px);box-shadow:0 18px 38px rgba(15,23,42,.12);border-color:rgba(37,99,235,.25)}
      .mt-an-kpi i{position:absolute;right:13px;top:13px;font-size:19px;color:#2563eb;background:#eff6ff;padding:7px;border-radius:11px}
      .mt-an-kpi-label{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--text3);font-weight:800;padding-right:36px}
      .mt-an-kpi-value{font-size:23px;color:var(--text);font-weight:850;margin-top:9px;line-height:1}.mt-an-kpi-note{font-size:10.5px;color:var(--text3);margin-top:7px}
      .mt-an-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(320px,.75fr);gap:12px;margin-bottom:12px}.mt-an-chart{height:310px;position:relative}
      .mt-an-insights{display:grid;gap:9px;margin-top:12px}.mt-an-insight{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:13px;background:#f8fafc;border:1px solid #e2e8f0;transition:background .15s ease,transform .15s ease}.mt-an-insight:hover{background:#eff6ff;transform:translateX(3px)}
      .mt-an-insight i{color:#2563eb;font-size:17px}.mt-an-insight b{display:block;color:var(--text);font-size:11.5px}.mt-an-insight span{display:block;color:var(--text3);font-size:10.5px;margin-top:2px}
      .mt-an-country-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin-top:12px}.mt-an-country{border:1px solid rgba(15,23,42,.08);border-radius:15px;padding:13px;background:linear-gradient(180deg,#fff,#f8fafc);transition:transform .18s ease,box-shadow .18s ease}.mt-an-country:hover{transform:translateY(-3px);box-shadow:0 16px 30px rgba(15,23,42,.10)}
      .mt-an-country-head{display:flex;justify-content:space-between;gap:8px;align-items:center}.mt-an-country-name{display:flex;gap:8px;align-items:center;font-weight:800;color:var(--text);font-size:12px}.mt-an-dot{width:9px;height:9px;border-radius:50%}.mt-an-country-val{font-size:16px;font-weight:850;color:var(--text);margin-top:12px}.mt-an-country-sub{font-size:10.5px;color:var(--text3);margin-top:5px}.mt-an-progress{height:5px;border-radius:99px;background:#e2e8f0;margin-top:10px;overflow:hidden}.mt-an-progress span{display:block;height:100%;border-radius:99px}
      .mt-an-matrix th,.mt-an-matrix td{text-align:right!important}.mt-an-matrix th:first-child,.mt-an-matrix td:first-child{text-align:left!important;position:sticky;left:0;z-index:2}.mt-an-matrix th:first-child{background:var(--bg)}.mt-an-matrix td:first-child{background:#fff}.mt-an-matrix tr:hover td:first-child{background:#f0f9ff}.mt-an-matrix .mt-an-total{font-weight:850;color:var(--text)}
      @media(max-width:1100px){.mt-an-kpis{grid-template-columns:repeat(3,1fr)}.mt-an-grid{grid-template-columns:1fr}}@media(max-width:650px){.mt-an-kpis{grid-template-columns:1fr 1fr}.mt-an-chart{height:260px}}
    </style>
    <div class="mt-card mt-an-hero">
      <div class="mt-an-toolbar">
        <div><div class="mt-card-title">Gerçek Maliyet Analizi</div><div class="mt-card-sub">Tüm maliyet türleri, tüm ülkeler ve aylık gelişim — yalnızca kaydedilmiş gerçek faturalar.</div></div>
        <div class="mt-filter-row" style="margin:0;position:relative;z-index:2;">
          <label class="mt-field"><span class="mt-field-label" style="color:rgba(255,255,255,.65)">Başlangıç</span><input class="mt-input" id="mt-a-start" type="date" value="${mtState.analiz.start}" style="height:38px;"></label>
          <label class="mt-field"><span class="mt-field-label" style="color:rgba(255,255,255,.65)">Bitiş</span><input class="mt-input" id="mt-a-end" type="date" value="${mtState.analiz.end}" style="height:38px;"></label>
          <button class="mt-btn secondary" onclick="mtAnalizAralik('6ay')">Son 6 Ay</button><button class="mt-btn secondary" onclick="mtAnalizAralik('yil')">Bu Yıl</button><button class="mt-btn" onclick="mtAnalizUygula()">Uygula</button>
        </div>
      </div>
    </div>
    <div class="mt-an-kpis">
      <div class="mt-an-kpi" title="Seçili tarih aralığındaki tüm gerçek faturaların EUR karşılığı"><i class="ti ti-currency-euro"></i><div class="mt-an-kpi-label">Gerçek Toplam</div><div class="mt-an-kpi-value">${mtFmtEur(o.gercek_toplam_eur)}</div><div class="mt-an-kpi-note">${mtState.analiz.start} — ${mtState.analiz.end}</div></div>
      <div class="mt-an-kpi" title="Seçili dönemde kaydedilen toplam fatura"><i class="ti ti-receipt"></i><div class="mt-an-kpi-label">Fatura Sayısı</div><div class="mt-an-kpi-value">${o.fatura_sayisi || 0}</div><div class="mt-an-kpi-note">Ort. ${mtFmtEur(o.ortalama_fatura_eur)}</div></div>
      <div class="mt-an-kpi" title="Gerçek maliyet kaydı bulunan ülke sayısı"><i class="ti ti-world"></i><div class="mt-an-kpi-label">Aktif Ülke</div><div class="mt-an-kpi-value">${o.ulke_sayisi || 0}</div><div class="mt-an-kpi-note">En yüksek: ${mtEsc(o.en_yuksek_ulke || '—')}</div></div>
      <div class="mt-an-kpi" title="Fatura toplamının maliyet türlerine bağlanmış oranı"><i class="ti ti-chart-pie"></i><div class="mt-an-kpi-label">Dağıtım Oranı</div><div class="mt-an-kpi-value">${mtAnalizYuzde(o.dagitim_orani)}</div><div class="mt-an-kpi-note">Kalemlere ayrılan tutar</div></div>
      <div class="mt-an-kpi" title="Dönemde tutarı en yüksek maliyet türü"><i class="ti ti-trending-up"></i><div class="mt-an-kpi-label">Lider Maliyet</div><div class="mt-an-kpi-value" style="font-size:16px;line-height:1.2;margin-top:11px;">${mtEsc(o.en_yuksek_kalem || '—')}</div><div class="mt-an-kpi-note">Türe göre en yüksek pay</div></div>
    </div>
    ${o.fatura_sayisi ? `
      <div class="mt-an-grid">
        <div class="mt-card"><div class="mt-card-title">Aylık Maliyet Trendi</div><div class="mt-card-sub">Ülkelere göre yığılmış gerçek maliyet — sütunların üzerine gelerek detayı görün.</div><div class="mt-an-chart"><canvas id="mt-an-trend"></canvas></div></div>
        <div class="mt-card"><div class="mt-card-title">Ülke Dağılımı</div><div class="mt-card-sub">Toplam gerçek maliyet içindeki pay.</div><div class="mt-an-chart" style="height:235px"><canvas id="mt-an-country"></canvas></div>
          <div class="mt-an-insights">
            <div class="mt-an-insight"><i class="ti ti-building-warehouse"></i><div><b>${mtEsc(o.en_yuksek_ulke || '—')} en yüksek ülke maliyetine sahip</b><span>${ulkeler[0] ? `${mtFmtEur(ulkeler[0].gercek_eur)} · toplamın ${mtAnalizYuzde((ulkeler[0].gercek_eur || 0) / (o.gercek_toplam_eur || 1) * 100)}` : 'Veri yok'}</span></div></div>
            <div class="mt-an-insight"><i class="ti ti-calendar-stats"></i><div><b>${zirveAy ? mtFmtAy(zirveAy.ay) : '—'} en yüksek maliyetli dönem</b><span>${zirveAy ? mtFmtEur(zirveAy.toplam_eur) : 'Veri yok'}</span></div></div>
          </div>
        </div>
      </div>
      <div class="mt-card" style="margin-bottom:12px"><div class="mt-card-title">Maliyet Türü Dağılımı</div><div class="mt-card-sub">Tüm ülkelerin toplu gerçek maliyetleri; çubuk üzerinde ülke kırılımı hover ile görünür.</div><div class="mt-an-chart" style="height:${Math.max(280, kalemler.length * 42)}px"><canvas id="mt-an-items"></canvas></div></div>
      <div class="mt-card" style="margin-bottom:12px"><div class="mt-card-title">Ülke Kartları</div><div class="mt-card-sub">Toplam, pay, fatura sayısı ve o ülkedeki en büyük maliyet kalemi.</div><div class="mt-an-country-grid">${ulkeler.map(u => { const top=(u.kalemler||[])[0], pay=(u.gercek_eur||0)/(o.gercek_toplam_eur||1)*100; return `<div class="mt-an-country" title="${mtEsc(u.label)} toplam içindeki pay: ${mtAnalizYuzde(pay)}"><div class="mt-an-country-head"><div class="mt-an-country-name"><span class="mt-an-dot" style="background:${mtUlkeColor(u.ulke)}"></span>${mtEsc(u.label)}</div><span class="mt-pill birim">${u.fatura_sayisi} fatura</span></div><div class="mt-an-country-val">${mtFmtEur(u.gercek_eur)}</div><div class="mt-an-country-sub">${top ? `En yüksek: ${mtEsc(top.kalem_ad)} · ${mtFmtEur(top.tutar_eur)}` : 'Maliyet kırılımı yapılmamış'}</div><div class="mt-an-progress"><span style="width:${Math.max(pay,1)}%;background:${mtUlkeColor(u.ulke)}"></span></div></div>`; }).join('')}</div></div>
      <div class="mt-card"><div class="mt-card-title">Maliyet Türü × Ülke Matrisi</div><div class="mt-card-sub">Her maliyetin toplu tutarı ve ülke ülke dağılımı. Hücre üzerine gelerek pay bilgisini görün.</div><div class="mt-table-wrap"><table class="mt-table mt-an-matrix"><thead><tr><th>Maliyet Türü</th>${ulkeler.map(u=>`<th>${mtEsc(u.label)}</th>`).join('')}<th>Toplam</th><th>Pay</th></tr></thead><tbody>
        ${kalemler.map(k=>`<tr><td><span class="mt-kalem-ad">${mtEsc(k.kalem_ad)}</span></td>${ulkeler.map(u=>{const v=(k.ulkeler||{})[u.ulke]||0;return `<td title="${mtEsc(k.kalem_ad)} / ${mtEsc(u.label)}: ${mtFmtEur(v)}">${v ? mtFmtEur(v) : '—'}</td>`}).join('')}<td class="mt-an-total">${mtFmtEur(k.tutar_eur)}</td><td><span class="mt-pill birim">${mtAnalizYuzde(k.oran)}</span></td></tr>`).join('')}
        <tr><td class="mt-an-total">GENEL TOPLAM</td>${ulkeler.map(u=>`<td class="mt-an-total">${mtFmtEur(u.gercek_eur)}</td>`).join('')}<td class="mt-an-total">${mtFmtEur(matrixToplam)}</td><td class="mt-an-total">%100</td></tr>
      </tbody></table></div></div>
    ` : '<div class="mt-card"><div class="mt-empty">Seçili tarih aralığında analiz edilecek gerçek fatura bulunamadı.</div></div>'}
  `;
  if (o.fatura_sayisi) mtAnalizGrafikleri(data, ulkeler, kalemler, aylik);
}

function mtAnalizGrafikleri(data, ulkeler, kalemler, aylik) {
  if (typeof Chart === 'undefined') return;
  const commonTooltip = {
    backgroundColor: 'rgba(15,23,42,.96)', padding: 12, cornerRadius: 10,
    titleFont: { size: 12, weight: '600' }, bodyFont: { size: 11 }, displayColors: true,
  };
  const trend = document.getElementById('mt-an-trend');
  if (trend) {
    mtState.analiz.charts.push(new Chart(trend, {
      type: 'bar',
      data: {
        labels: aylik.map(a => mtFmtAy(a.ay)),
        datasets: ulkeler.map(u => ({
          label: u.label,
          data: aylik.map(a => (a.ulkeler || {})[u.ulke] || 0),
          backgroundColor: mtUlkeColor(u.ulke), borderRadius: 4, maxBarThickness: 46,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, font: { size: 10 } } },
          tooltip: { ...commonTooltip, callbacks: {
            label: c => ` ${c.dataset.label}: ${mtFmtEur(c.parsed.y)}`,
            footer: points => `Ay toplamı: ${mtFmtEur(points.reduce((s, x) => s + x.parsed.y, 0))}`,
          } },
        },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, border: { display: false }, grid: { color: '#e2e8f0' },
            ticks: { callback: v => new Intl.NumberFormat('tr-TR', { notation: 'compact' }).format(v) + ' €' } },
        },
      },
    }));
  }
  const country = document.getElementById('mt-an-country');
  if (country) {
    mtState.analiz.charts.push(new Chart(country, {
      type: 'doughnut',
      data: {
        labels: ulkeler.map(u => u.label),
        datasets: [{ data: ulkeler.map(u => u.gercek_eur || 0),
          backgroundColor: ulkeler.map(u => mtUlkeColor(u.ulke)), borderColor: '#fff', borderWidth: 3, hoverOffset: 9 }],
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '66%', plugins: {
        legend: { position: 'right', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, font: { size: 10 } } },
        tooltip: { ...commonTooltip, callbacks: { label: c =>
          ` ${c.label}: ${mtFmtEur(c.parsed)} (${mtAnalizYuzde(c.parsed / (data.ozet.gercek_toplam_eur || 1) * 100)})` } },
      } },
    }));
  }
  const items = document.getElementById('mt-an-items');
  if (items) {
    mtState.analiz.charts.push(new Chart(items, {
      type: 'bar',
      data: {
        labels: kalemler.map(k => k.kalem_ad),
        datasets: ulkeler.map(u => ({
          label: u.label, data: kalemler.map(k => (k.ulkeler || {})[u.ulke] || 0),
          backgroundColor: mtUlkeColor(u.ulke), borderRadius: 4, maxBarThickness: 25,
        })),
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, font: { size: 10 } } },
          tooltip: { ...commonTooltip, callbacks: {
            label: c => c.parsed.x ? ` ${c.dataset.label}: ${mtFmtEur(c.parsed.x)}` : null,
            footer: points => `Toplam: ${mtFmtEur(points.reduce((s, x) => s + x.parsed.x, 0))}`,
          } },
        },
        scales: {
          x: { stacked: true, beginAtZero: true, border: { display: false }, grid: { color: '#e2e8f0' },
            ticks: { callback: v => new Intl.NumberFormat('tr-TR', { notation: 'compact' }).format(v) + ' €' } },
          y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11, weight: '600' } } },
        },
      },
    }));
  }
}
