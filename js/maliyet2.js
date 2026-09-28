// js/maliyet2.js
// Maliyet Takip — gerçek fatura/Excel kırılımı, ülke tabloları ve L/T karşılaştırması.

let m2 = {
  view: 'ozet',
  ulke: 'all',
  start: '',
  end: '',
  meta: null,
  gercek: null,
  faturalar: [],
  drafts: [],
  expanded: {},
  charts: [],
  yukleniyor: false,
  hata: '',
  inboxMsg: '',
  bosnaRapor: null,
  bosnaKayit: null,
  bosnaOnizleme: false,
  bosnaYil: '',
  bosnaDraftsAcik: false,
  bosnaAktarim: null,
  bosnaRotalarAcik: false,
  bosnaFaturaQ: '',
  bosnaFaturaAcik: false,
  bosnaFaturaPanelAcik: false,
  bosnaTabloDuzenle: false,
  bosnaFaturaDuzenle: false,
  ulkeTablolar: {},
  ulkeTabloYil: '',
  ulkeTabloDuzenle: false,
  tabloDonem: 'year',
  oranKarsilastirma: null,
};

const M2_COLORS = {
  rs: '#0F766E', ba: '#16A34A', ge: '#DC2626', xk: '#7C3AED', mk: '#E11D48',
  be: '#D97706', de: '#2563EB', nl: '#EA580C', kz: '#0891B2',
};
const M2_AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const M2_AY_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function m2Esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function m2Color(kod) { return M2_COLORS[kod] || '#0F766E'; }
function m2Label(kod) {
  return (m2.meta?.ulkeler || []).find(u => u.kod === kod)?.label || kod || '—';
}
function m2Eur(v) {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    .format(Number(v || 0)) + '\u00a0€';
}
function m2KpiEur(v) {
  return `<span class="m2-kpi-num">${m2EurNum(v)}</span><span class="m2-kpi-cur">€</span>`;
}
function m2EurNum(v) {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    .format(Number(v || 0));
}
function m2Eur2(v) {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Number(v || 0)) + ' €';
}
function m2Bam2(v) {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Number(v || 0)) + ' BAM';
}
function m2BamDeger(item) {
  if (item && item.tutar_bam != null && item.tutar_bam !== '') return Number(item.tutar_bam);
  return Math.round(Number(item?.tutar || 0) * 1.95583 * 100) / 100;
}
function m2Tarih(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}
function m2AyAd(key) {
  const [y, m] = String(key).split('-');
  return `${M2_AY[Number(m) - 1] || m} ${String(y).slice(2)}`;
}
function m2AyAdEn(key) {
  return m2AyAd(key);
}

const M2_FATURA_TIP = { Warehouse: 'Depo', Transport: 'Nakliye', Taxes: 'Vergi' };

function m2FaturaTipAd(tip) {
  const t = String(tip || '').trim();
  if (M2_FATURA_TIP[t]) return M2_FATURA_TIP[t];
  const k = Object.keys(M2_FATURA_TIP).find(x => x.toLowerCase() === t.toLowerCase());
  return k ? M2_FATURA_TIP[k] : t;
}

function m2KalemAdGoster(ad) {
  const s = String(ad || '').trim();
  if (!s) return s;
  const map = {
    inbound: 'Giriş',
    'inbound (pallet)': 'Giriş (Palet)',
    storage: 'Depolama',
    outbound: 'Çıkış',
    'outbound (pallet)': 'Çıkış (Palet)',
    transport: 'Nakliye',
    'transportation (truck)': 'Nakliye (Kamyon)',
    'transportation (pallet)': 'Nakliye (Palet)',
    'transportation (delivery)': 'Nakliye (Teslimat)',
    taxes: 'Vergi',
    'taxes / customs': 'Vergi / Gümrük',
    warehouse: 'Depo',
    labeling: 'Etiketleme',
    'fuel surcharge': 'Yakıt Farkı',
    other: 'Diğer',
    logistics: 'Lojistik',
    turnover: 'Ciro',
    'turnover (ciro)': 'Ciro',
    'grand total': 'Genel Toplam',
    'total cost': 'Toplam Tutar',
    'stock & handling': 'Stok Ve Elleçleme',
    'stock (truck)': 'Stok (Kamyon)',
    'stock (avr. pallet)': 'Stok (Ort. Palet)',
    'stock (avr. box)': 'Stok (Ort. Koli)',
    'depolama (ortalama koli)': 'Depolama (Ortalama Koli)',
    'iç nakliye': 'İç Nakliye',
    'ic nakliye': 'İç Nakliye',
  };
  return map[s.toLowerCase()] || s;
}

const M2_DONEMLER = [
  { id: 'year', grup: 'Yıl', label: 'Tüm Yıl', kisa: '' },
  { id: 'h1', grup: 'Yarıyıl', label: 'H1 · Oca–Haz', kisa: 'H1' },
  { id: 'h2', grup: 'Yarıyıl', label: 'H2 · Tem–Ara', kisa: 'H2' },
  { id: 'q1', grup: 'Çeyrek', label: 'Q1 · Oca–Mar', kisa: 'Q1' },
  { id: 'q2', grup: 'Çeyrek', label: 'Q2 · Nis–Haz', kisa: 'Q2' },
  { id: 'q3', grup: 'Çeyrek', label: 'Q3 · Tem–Eyl', kisa: 'Q3' },
  { id: 'q4', grup: 'Çeyrek', label: 'Q4 · Eki–Ara', kisa: 'Q4' },
  { id: '01', grup: 'Ay', label: 'Ocak', kisa: 'Oca' },
  { id: '02', grup: 'Ay', label: 'Şubat', kisa: 'Şub' },
  { id: '03', grup: 'Ay', label: 'Mart', kisa: 'Mar' },
  { id: '04', grup: 'Ay', label: 'Nisan', kisa: 'Nis' },
  { id: '05', grup: 'Ay', label: 'Mayıs', kisa: 'May' },
  { id: '06', grup: 'Ay', label: 'Haziran', kisa: 'Haz' },
  { id: '07', grup: 'Ay', label: 'Temmuz', kisa: 'Tem' },
  { id: '08', grup: 'Ay', label: 'Ağustos', kisa: 'Ağu' },
  { id: '09', grup: 'Ay', label: 'Eylül', kisa: 'Eyl' },
  { id: '10', grup: 'Ay', label: 'Ekim', kisa: 'Eki' },
  { id: '11', grup: 'Ay', label: 'Kasım', kisa: 'Kas' },
  { id: '12', grup: 'Ay', label: 'Aralık', kisa: 'Ara' },
];

function m2DonemAylar(id) {
  const x = String(id || m2.tabloDonem || 'year');
  if (x === 'h1') return [1, 2, 3, 4, 5, 6];
  if (x === 'h2') return [7, 8, 9, 10, 11, 12];
  if (x === 'q1') return [1, 2, 3];
  if (x === 'q2') return [4, 5, 6];
  if (x === 'q3') return [7, 8, 9];
  if (x === 'q4') return [10, 11, 12];
  if (/^(0[1-9]|1[0-2])$/.test(x)) return [Number(x)];
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
}

function m2DonemMeta() {
  return M2_DONEMLER.find(d => d.id === (m2.tabloDonem || 'year')) || M2_DONEMLER[0];
}

function m2DonemFiltrele(aylar) {
  const set = new Set(m2DonemAylar());
  return (aylar || []).filter(a => set.has(Number(String(a.ay || '').slice(5, 7))));
}

function m2DonemSelectHtml() {
  const cur = m2.tabloDonem || 'year';
  const gruplar = [];
  M2_DONEMLER.forEach(d => {
    if (!gruplar.length || gruplar[gruplar.length - 1].label !== d.grup) {
      gruplar.push({ label: d.grup, items: [] });
    }
    gruplar[gruplar.length - 1].items.push(d);
  });
  return `<label class="m2-field" title="Dönem">
    <span>Dönem</span>
    <select class="m2-select m2-donem" aria-label="Dönem" onchange="m2.tabloDonem=this.value;m2Render()">
      ${gruplar.map(g => `<optgroup label="${m2Esc(g.label)}">${g.items.map(d =>
        `<option value="${d.id}" ${d.id === cur ? 'selected' : ''}>${m2Esc(d.label)}</option>`).join('')}</optgroup>`).join('')}
    </select>
  </label>`;
}

function m2DonemBaslik(yil) {
  const d = m2DonemMeta();
  return d.id === 'year' ? String(yil) : `${yil} · ${d.kisa || d.label}`;
}

function m2DonemToplamEtiket(yil) {
  const d = m2DonemMeta();
  return d.id === 'year' ? `${yil} Toplam` : `${d.kisa || d.label} Toplam`;
}

function m2DonemSlug() {
  const d = m2DonemMeta();
  return d.id === 'year' ? '' : `_${d.id}`;
}

function m2ExcelDonemPayload(yil) {
  const yy = String(yil || '');
  return {
    donem: m2.tabloDonem || 'year',
    donem_etiket: m2DonemBaslik(yy),
    aylar: m2DonemAylar().map(m => `${yy}-${String(m).padStart(2, '0')}`),
  };
}
function m2Iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function m2AySonu(y, m) {
  return m2Iso(new Date(y, m, 0));
}
function m2YilAralik() {
  const n = new Date();
  return { start: `${n.getFullYear()}-01-01`, end: m2Iso(new Date(n.getFullYear(), n.getMonth() + 1, 0)) };
}
function m2AyAralik(ym) {
  const [y, m] = String(ym || '').split('-').map(Number);
  if (!y || !m) return null;
  return { start: m2Iso(new Date(y, m - 1, 1)), end: m2AySonu(y, m) };
}
function m2AyInputDeger() {
  const key = (m2.start || '').slice(0, 7);
  const a = m2AyAralik(key);
  if (a && a.start === m2.start && a.end === m2.end) return key;
  return '';
}

function initMaliyet2Panel() {
  const panel = document.getElementById('stepMaliyetTakip2');
  if (!panel) return;
  if (panel.dataset.ready !== 'm2-37') {
    panel.dataset.ready = 'm2-37';
    panel.innerHTML = M2_SHELL;
  }
  if (!m2.start) {
    const a = m2YilAralik();
    m2.start = a.start;
    m2.end = a.end;
  }
  m2Load();
}

const M2_SHELL = `
<style>
  #stepMaliyetTakip2.panel { gap:0; flex:1; min-height:0; height:100%; }
  .m2 { --m2:#0F766E; --m2-ink:#1A1916; --m2-muted:#6F6B64; --m2-line:#E8E4DC;
    --m2-side-w:200px; --m2-pad:16px;
    height:100%; min-height:0; padding:0; color:var(--m2-ink); background:#FAF9F6;
    font-family:var(--font); display:flex; align-items:stretch;
  }
  .m2-side { width:var(--m2-side-w); flex-shrink:0; background:linear-gradient(180deg,#fff 0%,#FBF9F5 100%);
    border-right:1px solid var(--m2-line); display:flex; flex-direction:column; height:100%; min-height:0;
    box-sizing:border-box; overflow:hidden; }
  .m2-side-h { font:700 13px/1 var(--font); letter-spacing:.02em;
    color:var(--m2-muted); height:44px; padding:0 16px; display:flex; align-items:center;
    border-bottom:1px solid var(--m2-line); flex-shrink:0; }
  .m2-nav { flex:1; overflow:auto; padding:8px 8px 12px; display:flex; flex-direction:column; gap:2px; }
  .m2-nav-item { display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%;
    border:0; background:transparent; text-align:left; height:38px; padding:0 12px; border-radius:10px;
    font:600 13px/1 var(--font); color:var(--m2-ink); cursor:pointer; box-sizing:border-box;
    transition:background .12s ease, color .12s ease, box-shadow .12s ease; }
  .m2-nav-item span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .m2-nav-item b { font:600 12px/1 var(--font); color:var(--m2-muted); font-variant-numeric:tabular-nums; flex-shrink:0; }
  .m2-nav-item:hover { background:#F7F4EE; }
  .m2-nav-item.active { background:#F0FDFA; color:#115E59; box-shadow:inset 3px 0 0 var(--m2); }
  .m2-nav-item.active b { color:#0F766E; }
  .m2-main { flex:1; min-width:0; height:100%; overflow:auto; padding:16px 20px 28px; box-sizing:border-box;
    background:linear-gradient(180deg,#F7F5F1 0%,#FAF9F6 120px); }
  .m2-kicker { font-size:11px; font-weight:700; letter-spacing:.02em; color:var(--m2); }
  .m2-views { display:flex; gap:4px; padding:4px; background:rgba(255,255,255,.72); border:1px solid var(--m2-line); border-radius:14px; }
  .m2-view { border:0; background:transparent; color:var(--m2-muted); padding:8px 14px; border-radius:11px; font:750 12.5px var(--font); cursor:pointer; }
  .m2-view.active { background:#1A1916; color:#F7F4EE; }
  .m2-period { display:flex; gap:8px; align-items:end; flex-wrap:wrap; margin:0 0 14px;
    padding:12px 14px; background:#fff; border:1px solid rgba(232,228,220,.9); border-radius:16px;
    box-shadow:0 10px 28px rgba(26,25,22,.045); }
  .m2-field { display:flex; flex-direction:column; gap:5px; }
  .m2-field span { font-size:10.5px; font-weight:700; letter-spacing:.02em; color:var(--m2-muted); }
  .m2-input, .m2-select { height:38px; border:1px solid transparent; border-radius:12px; background:#F7F4EE;
    padding:0 12px; font:600 13px var(--font); color:var(--m2-ink);
    box-shadow:inset 0 0 0 1px rgba(26,25,22,.06); transition:background .12s ease, box-shadow .12s ease; }
  .m2-input:hover, .m2-select:hover { background:#fff; }
  .m2-input:focus, .m2-select:focus { outline:none; background:#fff; box-shadow:0 0 0 3px rgba(15,118,110,.16), inset 0 0 0 1px var(--m2); }
  .m2-input[type="month"] { min-width:168px; }
  .m2-btn { height:38px; border:0; border-radius:999px; background:var(--m2); color:#fff; padding:0 16px;
    font:650 13px var(--font); cursor:pointer; display:inline-flex; align-items:center; gap:7px;
    box-shadow:0 8px 18px rgba(15,118,110,.22); transition:transform .12s ease, box-shadow .12s ease, background .12s ease, color .12s ease, border-color .12s ease; }
  .m2-btn:hover { background:#0D9488; transform:translateY(-1px); }
  .m2-btn:active { transform:translateY(0); }
  .m2-btn.ghost { background:#F7F4EE; color:var(--m2-ink); border:1px solid transparent; box-shadow:none; }
  .m2-btn.ghost:hover { background:#fff; color:#115E59; box-shadow:0 6px 16px rgba(15,118,110,.1); border-color:rgba(15,118,110,.18); }
  .m2-btn.ghost.active { background:#1A1916; color:#F7F4EE; box-shadow:0 8px 18px rgba(26,25,22,.16); }
  .m2-btn.ghost.active:hover { background:#111110; color:#fff; }
  .m2-chips { display:flex; gap:7px; flex-wrap:wrap; margin:0 0 20px; }
  .m2-chip { border:1px solid var(--m2-line); background:rgba(255,255,255,.8); color:var(--m2-muted); border-radius:999px; padding:6px 11px; font:750 11.5px var(--font); cursor:pointer; display:inline-flex; align-items:center; gap:7px; }
  .m2-chip i { width:8px; height:8px; border-radius:50%; background:var(--c, var(--m2)); }
  .m2-chip.active { background:#1A1916; color:#F7F4EE; border-color:#1A1916; }
  .m2-kpis { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:0 0 12px; align-items:stretch; }
  .m2-kpis.cols-5 { grid-template-columns:repeat(5,minmax(0,1fr)); }
  .m2-kpi {
    display:grid; grid-template-rows:18px 28px 16px; align-content:center; gap:4px;
    background:#fff; border:1px solid rgba(232,228,220,.85); border-radius:16px;
    padding:14px 16px; min-height:88px; min-width:0;
    box-shadow:0 10px 28px rgba(26,25,22,.04);
  }
  .m2-kpi.accent { border-color:#99F6E4; background:linear-gradient(180deg,#F0FDFA 0%,#E6FAF6 100%);
    box-shadow:0 12px 28px rgba(15,118,110,.08); }
  .m2-kpi > span {
    display:block; margin:0; font:650 11px/1.2 var(--font); color:var(--m2-muted);
    letter-spacing:.01em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }
  .m2-kpi > b {
    display:flex; align-items:baseline; gap:5px; margin:0; min-width:0;
    font:700 20px/1 var(--font); letter-spacing:-.03em; color:var(--m2-ink);
    font-variant-numeric:tabular-nums;
  }
  .m2-kpi-num { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .m2-kpi-cur { font:650 12px/1 var(--font); color:var(--m2-muted); flex-shrink:0; letter-spacing:0; }
  .m2-kpi > small {
    display:block; margin:0;
    font:500 11.5px/1.25 var(--font); color:var(--m2-muted);
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }
  .m2-grid { display:grid; grid-template-columns:minmax(0,1.4fr) minmax(280px,.8fr); gap:12px; margin-bottom:12px; }
  .m2-card { background:#fff; border:1px solid rgba(232,228,220,.85); border-radius:16px; padding:16px;
    box-shadow:0 10px 28px rgba(26,25,22,.04); }
  .m2-h { font-size:14px; font-weight:780; }
  .m2-p { font-size:12px; color:var(--m2-muted); margin:2px 0 12px; }
  .m2-chart { height:280px; position:relative; }
  .m2-h + .m2-chart { margin-top:12px; }
  .m2-insights { display:grid; gap:8px; }
  .m2-insight { display:flex; gap:10px; padding:10px 12px; border-radius:14px; background:#F7F4EE; }
  .m2-insight b { display:block; font-size:12.5px; }
  .m2-insight span { display:block; font-size:11.5px; color:var(--m2-muted); margin-top:2px; }
  .m2-table { width:100%; border-collapse:collapse; font-size:12px; }
  .m2-table th { text-align:left; font-size:11px; letter-spacing:.01em; color:var(--m2-muted); padding:8px 8px; border-bottom:1px solid var(--m2-line); }
  .m2-table td { padding:9px 8px; border-bottom:1px solid #F0EBE3; vertical-align:middle; }
  .m2-table td.num { text-align:right; font-variant-numeric:tabular-nums; font-weight:700; white-space:nowrap; }
  .m2-table th.num { text-align:right; white-space:nowrap; }
  .m2-table tr:hover td { background:#FBFAF7; }
  .m2-scroll { overflow:auto; -webkit-overflow-scrolling:touch; }
  .m2-table.matrix { width:max-content; min-width:100%; border-collapse:separate; border-spacing:0; }
  .m2-table.matrix th:first-child,
  .m2-table.matrix td:first-child {
    position:sticky; left:0; z-index:1; background:#fff; min-width:168px; max-width:200px;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:650;
  }
  .m2-table.matrix thead th:first-child { background:#FBFAF7; z-index:2; }
  .m2-table.matrix tr:hover td:first-child { background:#FBFAF7; }
  .m2-table.matrix th.num,
  .m2-table.matrix td.num { min-width:88px; width:88px; padding:8px 10px; }
  .m2-table.matrix td.num.muted { color:var(--m2-muted); font-weight:550; }
  .m2-ba { overflow:auto; }
  .m2-ba-table { width:max-content; min-width:100%; border-collapse:collapse; font-size:12px; }
  .m2-ba-table th, .m2-ba-table td { border:1px solid #EDE8DF; padding:7px 10px; }
  .m2-ba-table th { background:#1A1916; color:#F7F4EE; font-size:11px; letter-spacing:.01em; }
  .m2-ba-table th.sub { background:#0F766E; font-weight:700; }
  .m2-ba-table td.lab { font-weight:750; white-space:nowrap; background:#FBFAF7; }
  .m2-ba-table td.lab.pad { padding-left:22px; font-weight:600; color:var(--m2-muted); background:#fff; }
  .m2-ba-table td.lab.rota { padding-left:36px; font-weight:550; font-size:11.5px; color:#3F3B36; background:#F8FAFC; }
  .m2-ba-table td.num { text-align:right; font-variant-numeric:tabular-nums; }
  .m2-ba-table tr.tot td { background:#F0FDFA; font-weight:800; }
  .m2-ba-table tr.grand td { background:#1A1916; color:#F7F4EE; font-weight:800; }
  .m2-ba-table tr.ciro td { background:#FFFBEB; font-style:italic; }
  .m2-ba-table tr.oran td { background:#F8FAFC; font-weight:800; }
  .m2-ba-table td.zero { color:#C4BFB6; font-weight:500; }
  .m2-ba-table td.num.yeni { background:#ECFDF5; color:#065F46; font-weight:750; }
  .m2-ba-table td.num.degis { background:#FFF7ED; color:#9A3412; font-weight:750; }
  .m2-ba-table tr.rota td.num { background:#F8FAFC; }
  .m2-ba-table tr.rota td.num.yeni { background:#D1FAE5; }
  .m2-ba-table tr.rota td.num.degis { background:#FFEDD5; }
  .m2-ba-birim { font-size:10.5px; font-weight:600; color:#64748B; margin-top:2px; }
  .m2-ba-caret { display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; margin-right:6px; border:0; border-radius:6px; background:#E7F6F3; color:var(--m2); font:800 13px var(--font); cursor:pointer; vertical-align:middle; }
  .m2-ba-caret:hover { background:#CCFBF1; }
  .m2-lt-bars { display:grid; gap:8px; margin-top:10px; }
  .m2-lt-row { display:grid; grid-template-columns:110px 1fr 64px; gap:10px; align-items:center; font-size:12.5px; }
  .m2-lt-row b { font-variant-numeric:tabular-nums; text-align:right; }
  .m2-lt-track { height:12px; border-radius:999px; background:#EDE8DF; overflow:hidden; }
  .m2-lt-track i { display:block; height:100%; border-radius:999px; }
  .m2-lt-delta { font-size:11px; font-weight:700; }
  .m2-lt-delta.up { color:#B45309; }
  .m2-lt-delta.down { color:#0F766E; }
  .m2-lt-delta.flat { color:var(--m2-muted); }
  .m2-lt-note { margin-top:10px; padding:10px 12px; border-radius:12px; background:#F7F4EE; font-size:12px; color:var(--m2-muted); line-height:1.45; }
  .m2-lt-note strong { color:var(--m2-ink); }
  .m2-heat-wrap { overflow:auto; margin-top:4px; }
  .m2-heat { width:100%; border-collapse:separate; border-spacing:4px; font-size:11.5px; }
  .m2-heat th { font-size:10.5px; font-weight:700; color:var(--m2-muted); text-align:center; padding:0 2px 6px; white-space:nowrap; }
  .m2-heat th.lab, .m2-heat td.lab { text-align:left; padding-left:2px; }
  .m2-heat td.lab { font-weight:650; white-space:nowrap; padding-right:8px; font-size:12.5px; }
  .m2-heat .lab-inner { display:flex; align-items:center; gap:10px; min-width:0; }
  .m2-heat .lab-inner span { min-width:88px; overflow:hidden; text-overflow:ellipsis; }
  .m2-lt-spark { display:block; flex-shrink:0; }
  .m2-heat-cell { text-align:center; font-variant-numeric:tabular-nums; font-weight:750; border-radius:9px; padding:9px 6px; min-width:52px; }
  .m2-heat-cell.empty { background:#F4F1EA; color:#B0AAA0; font-weight:550; }
  .m2-heat-cell.miss { background:#FFF7ED; color:#C2410C; font-weight:650; }
  .m2-heat-cell.lo2 { background:#5EEAD4; color:#115E59; }
  .m2-heat-cell.lo1 { background:#CCFBF1; color:#0F766E; }
  .m2-heat-cell.mid { background:#F7F4EE; color:#3F3B36; }
  .m2-heat-cell.hi1 { background:#FFEDD5; color:#9A3412; }
  .m2-heat-cell.hi2 { background:#FB923C; color:#7C2D12; }
  .m2-heat-cell.trend { background:transparent; min-width:76px; text-align:right; padding-right:6px; }
  .m2-heat-legend { display:flex; gap:12px; flex-wrap:wrap; align-items:center; margin-top:10px; font-size:11.5px; color:var(--m2-muted); }
  .m2-heat-legend i { display:inline-block; width:11px; height:11px; border-radius:3px; margin-right:5px; vertical-align:-1px; }
  .m2-heat-pills { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-top:10px; }
  .m2-heat-pill { display:flex; gap:8px; align-items:flex-start; padding:9px 12px; border-radius:12px; background:#F7F4EE; font-size:12px; line-height:1.4; color:var(--m2-ink); }
  .m2-heat-pill b { font-weight:750; }
  .m2-heat-pill span { color:var(--m2-muted); }
  @media (max-width:900px) { .m2-heat .m2-lt-spark { display:none; } .m2-heat-pills { grid-template-columns:1fr; } }
  .m2-drop { border:1.5px dashed rgba(15,118,110,.35); border-radius:22px; background:rgba(255,255,255,.7); padding:36px 20px; text-align:center; cursor:pointer; }
  .m2-drop:hover, .m2-drop.over { border-color:var(--m2); background:#F0FDFA; }
  .m2-drop i { font-size:28px; color:var(--m2); display:block; margin-bottom:8px; }
  .m2-drop.slim { padding:14px 16px; margin-bottom:12px; display:flex; align-items:center; justify-content:center; gap:10px; }
  .m2-drop.slim i { font-size:20px; margin:0; }
  .m2-drop.inline { margin:0; padding:0 14px; height:38px; border-radius:999px; display:inline-flex; align-items:center; justify-content:center; gap:8px; width:100%; max-width:none; background:#F7F4EE; box-sizing:border-box; box-shadow:inset 0 0 0 1px rgba(15,118,110,.08); }
  .m2-drop.inline i { font-size:17px; margin:0; }
  .m2-drop.inline .m2-h { font-size:12.5px; font-weight:750; line-height:1; }
  .m2-drop.inline .m2-p { display:none; }
  .m2-ba-head { display:flex; align-items:center; gap:12px; min-height:38px; }
  .m2-ba-head-title { min-width:0; flex:1; }
  .m2-ba-head-title .m2-kicker { margin-bottom:2px; }
  .m2-ba-head-title .m2-h { line-height:1.2; }
  .m2-ba-head-drop { flex:0 0 auto; }
  .m2-ba-head-drop .m2-drop.inline { width:168px; max-width:168px; }
  .m2-ba-head-actions { display:flex; gap:8px; align-items:center; margin-left:auto; flex-wrap:nowrap; }
  .m2-ba-head-actions .m2-field { flex-direction:row; align-items:center; gap:0; margin:0; flex-shrink:0; }
  .m2-ba-head-actions .m2-field > span { display:none; }
  .m2-ba-head-actions .m2-select { width:88px; min-width:88px; flex-shrink:0; border-radius:12px; }
  .m2-ba-head-actions .m2-select.m2-donem { width:148px; min-width:148px; }
  .m2-ba-head-actions .m2-select,
  .m2-ba-head-actions .m2-btn { height:38px; flex-shrink:0; }
  .m2-ba-head-actions .m2-btn { border-radius:999px; }
  .m2-empty { text-align:center; padding:48px 16px; color:var(--m2-muted); }
  .m2-empty i { font-size:32px; color:var(--m2); display:block; margin-bottom:10px; }
  .m2-draft { border:1px solid var(--m2-line); border-radius:16px; padding:14px; margin-bottom:10px; background:#fff; }
  .m2-warn { background:#FFF7ED; color:#9A3412; border-radius:12px; padding:9px 12px; font-size:12px; margin:8px 0; }
  .m2-ok { background:#ECFDF5; color:#065F46; border-radius:12px; padding:9px 12px; font-size:12px; margin:8px 0; }
  .m2-pill { display:inline-flex; border-radius:999px; padding:2px 8px; font-size:10.5px; font-weight:750; background:#F0EBE3; }
  .m2-ba-analiz { margin-top:14px; }
  .m2-insights-3 { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin:12px 0 14px; }
  .m2-insight { align-items:flex-start; border:1px solid var(--m2-line); background:#fff; box-shadow:0 8px 24px rgba(26,25,22,.03); }
  .m2-insight i { width:32px; height:32px; border-radius:10px; display:flex; align-items:center; justify-content:center; background:#F0FDFA; flex-shrink:0; }
  .m2-mix { display:flex; height:12px; border-radius:999px; overflow:hidden; background:#EDE8DF; margin:8px 0 10px; }
  .m2-mix i { display:block; height:100%; }
  .m2-mix.lg { height:28px; margin:10px 0 12px; border-radius:10px; }
  .m2-mix.lg > span { display:flex; align-items:center; justify-content:center; height:100%; min-width:0; color:#fff; font:780 11.5px/1 var(--font); letter-spacing:.02em; white-space:nowrap; overflow:hidden; }
  .m2-mix-legend { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:10px 14px; margin-top:2px; }
  .m2-mix-legend > div { display:grid; gap:2px; padding-left:14px; position:relative; font-size:12px; color:var(--m2-ink); }
  .m2-mix-legend > div::before { content:''; position:absolute; left:0; top:5px; width:8px; height:8px; border-radius:50%; background:var(--c); }
  .m2-mix-legend strong { font:750 12px var(--font); letter-spacing:0; text-transform:none; }
  .m2-mix-legend b { font:780 13px var(--font); letter-spacing:-.01em; }
  .m2-mix-legend em { font-style:normal; color:var(--m2-muted); font-size:11.5px; font-weight:650; }
  .m2-mix-note { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-top:12px; padding:10px 12px; border-radius:12px; background:#FFF7ED; border:1px solid #FED7AA; font-size:12px; color:#9A3412; }
  .m2-mix-note b { color:#7C2D12; font-weight:800; }
  .m2-mix-note small { color:#C2410C; font-size:11.5px; }
  .m2-chart-row { display:grid; grid-template-columns:minmax(0,1.45fr) minmax(260px,.75fr); gap:12px; margin-bottom:12px; }
  .m2-chart.rota { height:320px; }
  .m2-ba-en .m2-kicker,
  .m2-ba-en .m2-kpi span,
  .m2-ba-en .m2-field span,
  .m2-ba-en .m2-ba-table th { text-transform:none; }
  .m2-ba-inv-toggle { width:100%; display:flex; align-items:center; justify-content:space-between; gap:12px; border:0; background:transparent; padding:0; cursor:pointer; text-align:left; font:inherit; color:inherit; }
  .m2-ba-inv-toggle:hover .m2-h { color:var(--m2); }
  .m2-ba-inv-toggle .m2-ba-caret { margin-right:0; flex-shrink:0; }
  .m2-ba-inv-meta { font-size:12px; color:var(--m2-muted); font-weight:650; white-space:nowrap; }
  .m2-ba-inv-body { margin-top:14px; }
  .m2-ba-inv { margin-top:12px; }
  .m2-ba-inv.open { max-height:420px; overflow:auto; }
  .m2-ba-inv .m2-ba-table { width:100%; min-width:0; }
  .m2-ba-edit { width:100%; min-width:72px; height:28px; border:1px solid #99F6E4; border-radius:7px; padding:0 6px; font:650 11.5px var(--font); text-align:right; background:#F0FDFA; color:var(--m2-ink); }
  .m2-ba-edit.left { text-align:left; min-width:110px; }
  .m2-ba-del { height:28px; border:0; background:#FEE2E2; color:#991B1B; border-radius:7px; padding:0 8px; font:750 11px var(--font); cursor:pointer; }
  @media (max-width:1100px) { .m2-kpis,.m2-kpis.cols-5,.m2-grid,.m2-insights-3,.m2-chart-row { grid-template-columns:1fr 1fr; } .m2-ba-head { flex-wrap:wrap; } .m2-ba-head-actions { margin-left:0; width:100%; justify-content:flex-end; } }
  @media (max-width:800px) {
    .m2 { flex-direction:column; }
    .m2-side { width:100%; height:auto; max-height:148px; border-right:0; border-bottom:1px solid var(--m2-line); }
    .m2-side-h { height:36px; }
    .m2-nav { flex-direction:row; overflow-x:auto; padding:6px 8px; }
    .m2-nav-item { width:auto; flex-shrink:0; }
    .m2-main { padding:14px; }
  }
  @media (max-width:700px) { .m2-kpis,.m2-kpis.cols-5,.m2-grid,.m2-insights-3,.m2-chart-row { grid-template-columns:1fr; } .m2-ba-head-drop,.m2-ba-head-actions { justify-content:stretch; } .m2-ba-head-drop .m2-drop.inline { max-width:none; width:100%; } }
</style>
<div class="m2">
  <aside class="m2-side">
    <div class="m2-side-h">Ülkeler</div>
    <div class="m2-nav" id="m2-nav"></div>
  </aside>
  <div class="m2-main">
    <div class="m2-period" id="m2-period"></div>
    <div id="m2-body"></div>
  </div>
</div>`;

function m2SetView(v) {
  if (v === 'bosna') {
    m2.ulke = 'ba';
    m2.view = 'ozet';
  } else if (v === 'giris') {
    m2.view = 'ozet';
  } else {
    m2.view = v;
  }
  m2Render();
}

function m2EurKisa(v) {
  const n = Number(v || 0);
  if (!(n > 0.005)) return '—';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + 'M';
  if (n >= 10000) return Math.round(n / 1000) + 'k';
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.', ',') + 'k';
  return m2EurNum(n);
}

function m2UlkeLojistikEur(kod) {
  const data = m2.gercek;
  if (!data) return 0;
  return (data.kalemler || []).reduce((s, k) => {
    if (m2KalemSinif(k) === 'taxes') return s;
    return s + Number((k.ulkeler || {})[kod] || 0);
  }, 0);
}

function m2RenderNav() {
  const nav = document.getElementById('m2-nav');
  if (!nav) return;
  const ulkeler = m2.meta?.ulkeler || [];
  const tumLoj = m2KalemBag((m2.gercek && m2.gercek.kalemler) || []).loj;
  const tumOn = m2.ulke === 'all';
  let html = `<button type="button" class="m2-nav-item${tumOn ? ' active' : ''}" onclick="m2SetUlke('all')">
    <span>Tüm Ülkeler</span><b>${m2EurKisa(tumLoj)}</b>
  </button>`;
  html += ulkeler.map(u => {
    const on = m2.ulke === u.kod;
    return `<button type="button" class="m2-nav-item${on ? ' active' : ''}" onclick="m2SetUlke('${u.kod}')">
      <span>${m2Esc(u.label)}</span><b>${m2EurKisa(m2UlkeLojistikEur(u.kod))}</b>
    </button>`;
  }).join('');
  nav.innerHTML = html;
}

function m2SetUlke(kod) {
  m2.ulke = kod;
  m2.ulkeTabloDuzenle = false;
  m2.view = 'ozet';
  if (kod && kod !== 'all' && kod !== 'ba') {
    const body = document.getElementById('m2-body');
    if (body) body.innerHTML = '<div class="m2-empty">Yükleniyor…</div>';
    m2UlkeTabloYukle(kod).finally(() => m2Render());
    return;
  }
  m2Render();
}

async function m2UlkeTabloYukle(ulke, yil) {
  const yy = yil || m2.ulkeTabloYil || (m2.start || '').slice(0, 4) || String(new Date().getFullYear());
  m2.ulkeTabloYil = yy;
  try {
    const res = await fetch(
      `/api/maliyet/tablo?ulke=${encodeURIComponent(ulke)}&yil=${encodeURIComponent(yy)}`,
      { cache: 'no-store' },
    );
    const data = await res.json();
    if (data.success) m2.ulkeTablolar[ulke] = data.rapor;
  } catch (e) { /* boş tablo ile devam */ }
}

function m2ToEurLocal(tutar, para, kurlar) {
  const p = String(para || 'EUR').toUpperCase();
  const n = Number(tutar || 0);
  if (p === 'EUR') return n;
  const kur = Number((kurlar || {})[p] || 0);
  return kur > 0 ? n / kur : n;
}

/** Fatura listesinden Tümü özetini üretir — /api/maliyet/ozet engellenirse yedek. */
function m2BuildGercekFromFaturalar(faturalar, kurlar) {
  const labels = {};
  (m2.meta?.ulkeler || []).forEach(u => { labels[u.kod] = u.label; });
  const ulkeler = {};
  const tumKalemler = {};
  const aylik = {};
  let dagitilmis = 0;
  (faturalar || []).forEach(f => {
    const ulke = f.ulke;
    const u = ulkeler[ulke] || (ulkeler[ulke] = {
      ulke, label: labels[ulke] || ulke, fatura_sayisi: 0, gercek_eur: 0, dagitilmamis: 0, kalemler: {},
    });
    u.fatura_sayisi += 1;
    const fEur = m2ToEurLocal(f.tutar, f.para_birimi, kurlar);
    u.gercek_eur += fEur;
    const etkin = f.fatura_tarihi || f.donem_bitis || '';
    const ay = String(etkin).slice(0, 7);
    if (ay) {
      const a = aylik[ay] || (aylik[ay] = { ay, toplam_eur: 0, ulkeler: {} });
      a.toplam_eur += fEur;
      a.ulkeler[ulke] = (a.ulkeler[ulke] || 0) + fEur;
    }
    const satirlar = f.kalemler || [];
    if (!satirlar.length) {
      u.dagitilmamis += 1;
      const item = u.kalemler[0] || (u.kalemler[0] = { kalem_id: 0, kalem_ad: 'Dağıtılmamış', kalem_kod: '', tutar_eur: 0 });
      item.tutar_eur += fEur;
      const genel = tumKalemler[0] || (tumKalemler[0] = { kalem_id: 0, kalem_ad: 'Dağıtılmamış', kalem_kod: '', tutar_eur: 0, ulkeler: {} });
      genel.tutar_eur += fEur;
      genel.ulkeler[ulke] = (genel.ulkeler[ulke] || 0) + fEur;
      return;
    }
    satirlar.forEach(s => {
      const kid = s.kalem_id || 0;
      const e = m2ToEurLocal(s.tutar, f.para_birimi, kurlar);
      const item = u.kalemler[kid] || (u.kalemler[kid] = {
        kalem_id: kid, kalem_ad: s.kalem_ad || 'Kalem', kalem_kod: s.kalem_kod || '', tutar_eur: 0,
      });
      item.tutar_eur += e;
      dagitilmis += e;
      const genel = tumKalemler[kid] || (tumKalemler[kid] = {
        kalem_id: kid, kalem_ad: s.kalem_ad || 'Kalem', kalem_kod: s.kalem_kod || '', tutar_eur: 0, ulkeler: {},
      });
      genel.tutar_eur += e;
      genel.ulkeler[ulke] = (genel.ulkeler[ulke] || 0) + e;
    });
  });
  const out = Object.values(ulkeler).map(u => ({
    ...u,
    gercek_eur: Math.round(u.gercek_eur * 100) / 100,
    kalemler: Object.values(u.kalemler)
      .map(x => ({ ...x, tutar_eur: Math.round(x.tutar_eur * 100) / 100 }))
      .sort((a, b) => b.tutar_eur - a.tutar_eur),
  })).sort((a, b) => String(a.label).localeCompare(String(b.label), 'tr'));
  const genelToplam = Math.round(out.reduce((s, u) => s + (u.gercek_eur || 0), 0) * 100) / 100;
  const kalemOut = Object.values(tumKalemler).map(x => ({
    ...x,
    tutar_eur: Math.round(x.tutar_eur * 100) / 100,
    ulkeler: Object.fromEntries(Object.entries(x.ulkeler).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    oran: genelToplam ? Math.round(x.tutar_eur / genelToplam * 1000) / 10 : 0,
  })).sort((a, b) => b.tutar_eur - a.tutar_eur);
  const aylikOut = Object.keys(aylik).sort().map(k => {
    const a = aylik[k];
    return {
      ay: a.ay,
      toplam_eur: Math.round(a.toplam_eur * 100) / 100,
      ulkeler: Object.fromEntries(Object.entries(a.ulkeler).map(([kod, v]) => [kod, Math.round(v * 100) / 100])),
    };
  });
  const faturaSayisi = out.reduce((s, u) => s + u.fatura_sayisi, 0);
  const enUlke = out.slice().sort((a, b) => (b.gercek_eur || 0) - (a.gercek_eur || 0))[0];
  return {
    success: true,
    start: m2.start,
    end: m2.end,
    ulkeler: out,
    kalemler: kalemOut,
    aylik: aylikOut,
    kurlar: kurlar || {},
    ozet: {
      gercek_toplam_eur: genelToplam,
      fatura_sayisi: faturaSayisi,
      ulke_sayisi: out.length,
      ortalama_fatura_eur: faturaSayisi ? Math.round(genelToplam / faturaSayisi * 100) / 100 : 0,
      dagitim_orani: genelToplam ? Math.round(dagitilmis / genelToplam * 1000) / 10 : 0,
      en_yuksek_ulke: enUlke?.label || null,
      en_yuksek_kalem: kalemOut[0]?.kalem_ad || null,
    },
  };
}

async function m2FetchJson(url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    return await res.json();
  } catch (e) {
    return { success: false, error: e.message || 'Ağ Hatası' };
  }
}

async function m2Load() {
  const body = document.getElementById('m2-body');
  if (body) body.innerHTML = '<div class="m2-empty">Yükleniyor…</div>';
  m2.yukleniyor = true;
  try {
    if (!m2.meta) {
      const meta = await m2FetchJson('/api/maliyet/meta');
      if (!meta.success) throw new Error(meta.error || 'Meta Alınamadı');
      m2.meta = meta;
    }
    const params = new URLSearchParams({ start: m2.start, end: m2.end });
    const yil = (m2.start || '').slice(0, 4) || String(new Date().getFullYear());
    // /ozet tercih (bazı istemciler "gercek" yolunu engelliyor); fatura listesi yedek kaynak
    const [ozet, fatura, bosna, oran] = await Promise.all([
      m2FetchJson('/api/maliyet/ozet?' + params),
      m2FetchJson('/api/maliyet/fatura?' + params),
      m2FetchJson('/api/maliyet/bosna/rapor?yil=' + encodeURIComponent(yil)),
      m2FetchJson('/api/maliyet/oran-karsilastirma?' + params),
    ]);
    m2.faturalar = fatura.faturalar || [];
    if (bosna.success) m2.bosnaKayit = bosna.rapor;
    m2.oranKarsilastirma = oran.success ? oran : null;
    const fromList = m2BuildGercekFromFaturalar(m2.faturalar, ozet.kurlar || {});
    if (ozet.success) {
      const apiN = Number(ozet.ozet?.fatura_sayisi || 0);
      const listN = Number(fromList.ozet?.fatura_sayisi || 0);
      const apiU = Number(ozet.ozet?.ulke_sayisi || 0);
      const listU = Number(fromList.ozet?.ulke_sayisi || 0);
      m2.gercek = (listN > apiN || listU > apiU) ? fromList : ozet;
    } else if (m2.faturalar.length) {
      m2.gercek = fromList;
    } else {
      throw new Error(ozet.error || fatura.error || 'Analiz Alınamadı');
    }
    m2.hata = '';
    if (m2.ulke && m2.ulke !== 'all' && m2.ulke !== 'ba') {
      await m2UlkeTabloYukle(m2.ulke, yil);
    }
  } catch (e) {
    m2.hata = e.message || 'Veri Alınamadı';
  }
  m2.yukleniyor = false;
  m2Render();
}

function m2AySec(ym) {
  const a = m2AyAralik(ym || document.getElementById('m2-ay')?.value);
  if (!a) return alert('Geçerli Bir Ay Seçin.');
  m2.start = a.start;
  m2.end = a.end;
  m2Load();
}

function m2FiltreTemizle() {
  const a = m2YilAralik();
  m2.start = a.start;
  m2.end = a.end;
  m2Load();
}

function m2FiltreAktif(tip) {
  const n = new Date();
  if (tip === 'ay') {
    const a = m2AyAralik(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`);
    return !!(a && m2.start === a.start && m2.end === a.end);
  }
  if (tip === '6ay') {
    return m2.start === m2Iso(new Date(n.getFullYear(), n.getMonth() - 5, 1))
      && m2.end === m2Iso(new Date(n.getFullYear(), n.getMonth() + 1, 0));
  }
  if (tip === 'yil') {
    const a = m2YilAralik();
    return m2.start === a.start && m2.end === a.end;
  }
  return false;
}

async function m2TumExcelIndir() {
  if (m2.ulke !== 'all') return;
  const data = m2Gorunum();
  if (!data?.ozet?.fatura_sayisi) return alert('İndirilecek Tümü Verisi Yok.');
  const btn = document.querySelectorAll('[data-m2-tum-xlsx]');
  btn.forEach(b => { b.disabled = true; b.dataset.label = b.innerHTML; b.innerHTML = 'İndiriliyor…'; });
  try {
    const res = await fetch('/api/maliyet/tum/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start: m2.start,
        end: m2.end,
        ozet: data.ozet,
        ulkeler: data.ulkeler || [],
        kalemler: data.kalemler || [],
        oran: m2.oranKarsilastirma || {},
      }),
    });
    if (!res.ok) {
      let msg = 'Excel Oluşturulamadı';
      try { msg = (await res.json()).error || msg; } catch (_) {}
      throw new Error(msg);
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `maliyet_tumu_${m2.start}_${m2.end}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) {
    alert(e.message || 'Excel İndirme Başarısız');
  } finally {
    btn.forEach(b => { b.disabled = false; if (b.dataset.label) b.innerHTML = b.dataset.label; });
  }
}

function m2HazirDonem(tip) {
  const n = new Date();
  if (tip === 'yil') { const a = m2YilAralik(); m2.start = a.start; m2.end = a.end; }
  else if (tip === '6ay') {
    m2.start = m2Iso(new Date(n.getFullYear(), n.getMonth() - 5, 1));
    m2.end = m2Iso(new Date(n.getFullYear(), n.getMonth() + 1, 0));
  } else if (tip === 'ay') {
    m2.start = m2Iso(new Date(n.getFullYear(), n.getMonth(), 1));
    m2.end = m2Iso(new Date(n.getFullYear(), n.getMonth() + 1, 0));
  }
  m2Load();
}

function m2Gorunum() {
  const data = m2.gercek;
  if (!data) return null;
  if (m2.ulke === 'all') return data;
  const ulke = (data.ulkeler || []).find(u => u.ulke === m2.ulke);
  const toplam = Number(ulke?.gercek_eur || 0);
  const kalemler = (data.kalemler || []).map(k => {
    const tutar = Number((k.ulkeler || {})[m2.ulke] || 0);
    return { ...k, tutar_eur: tutar, ulkeler: { [m2.ulke]: tutar }, oran: toplam ? tutar / toplam * 100 : 0 };
  }).filter(k => k.tutar_eur > 0).sort((a, b) => b.tutar_eur - a.tutar_eur);
  const aylik = (data.aylik || []).map(a => {
    const tutar = Number((a.ulkeler || {})[m2.ulke] || 0);
    return { ...a, toplam_eur: tutar, ulkeler: { [m2.ulke]: tutar } };
  });
  return {
    ...data,
    ulkeler: ulke ? [ulke] : [],
    kalemler,
    aylik,
    ozet: {
      gercek_toplam_eur: toplam,
      fatura_sayisi: ulke?.fatura_sayisi || 0,
      ulke_sayisi: ulke ? 1 : 0,
      dagitim_orani: toplam && kalemler.length ? 100 : 0,
      en_yuksek_ulke: ulke?.label,
      en_yuksek_kalem: kalemler.find(k => m2KalemSinif(k) !== 'taxes')?.kalem_ad || kalemler[0]?.kalem_ad,
    },
  };
}

function m2Render() {
  m2RenderNav();
  const period = document.getElementById('m2-period');
  if (period) {
    const ulkeTablo = m2.view !== 'kayitlar' && m2.ulke && m2.ulke !== 'all';
    if (ulkeTablo) {
      period.style.display = 'none';
      period.innerHTML = '';
    } else {
      period.style.display = '';
      const tumXlsx = m2.ulke === 'all' && m2.view !== 'kayitlar'
        ? `<button class="m2-btn" data-m2-tum-xlsx type="button" onclick="m2TumExcelIndir()"><i class="ti ti-download"></i> Excel İndir</button>`
        : '';
      period.innerHTML = `
        <label class="m2-field" title="Ay">
          <span>Ay</span>
          <input class="m2-input" id="m2-ay" type="month" value="${m2Esc(m2AyInputDeger())}" onchange="m2AySec(this.value)">
        </label>
        <button class="m2-btn ghost${m2FiltreAktif('ay') ? ' active' : ''}" onclick="m2HazirDonem('ay')">Bu Ay</button>
        <button class="m2-btn ghost${m2FiltreAktif('6ay') ? ' active' : ''}" onclick="m2HazirDonem('6ay')">Son 6 Ay</button>
        <button class="m2-btn ghost${m2FiltreAktif('yil') ? ' active' : ''}" onclick="m2HazirDonem('yil')">Bu Yıl</button>
        <button class="m2-btn ghost" type="button" onclick="m2FiltreTemizle()">Filtre Temizle</button>
        ${tumXlsx}`;
    }
  }
  const body = document.getElementById('m2-body');
  if (!body) return;
  m2.charts.forEach(c => c.destroy());
  m2.charts = [];
  if (m2.hata) { body.innerHTML = `<div class="m2-empty">${m2Esc(m2.hata)}</div>`; return; }
  if (m2.view === 'kayitlar') m2RenderKayitlar(body);
  else if (m2.ulke === 'ba') m2RenderBosna(body);
  else if (m2.ulke && m2.ulke !== 'all') m2RenderUlkeTablo(body);
  else m2RenderOzet(body);
}

function m2Yorumlar(data) {
  const o = data.ozet || {};
  const { bag, lojKod, loj, liderLoj } = m2KalemBag(data.kalemler || []);
  const list = [];
  if (!o.fatura_sayisi) {
    list.push({ t: 'Henüz Gerçek Maliyet Yok', s: 'Ülke Seçip Belgeyi O Ülkenin Sayfasına Bırakın.' });
    return list;
  }
  if (!loj) {
    list.push({ t: 'Lojistik Kalemi Yok', s: 'Bu Aralıkta Giriş / Depolama / Çıkış / Nakliye Kaydı Bulunamadı.' });
    return list;
  }

  const ulkeLoj = {};
  (data.kalemler || []).forEach(k => {
    if (m2KalemSinif(k) === 'taxes') return;
    Object.entries(k.ulkeler || {}).forEach(([kod, tutar]) => {
      ulkeLoj[kod] = (ulkeLoj[kod] || 0) + Number(tutar || 0);
    });
  });
  const ulkeSirali = Object.entries(ulkeLoj)
    .map(([kod, tutar]) => ({ kod, label: m2Label(kod), tutar }))
    .filter(u => u.tutar > 0.005)
    .sort((a, b) => b.tutar - a.tutar);
  if (ulkeSirali[0]) {
    list.push({
      t: `${ulkeSirali[0].label} Lojistikte Lider`,
      s: `${m2Eur2(ulkeSirali[0].tutar)} · Lojistik Pay ${((ulkeSirali[0].tutar / loj) * 100).toFixed(1)}%`,
    });
  }

  if (liderLoj) {
    list.push({
      t: `Lider Lojistik: ${liderLoj.ad}`,
      s: `${m2Eur2(liderLoj.tutar)} · Lojistiğin ${(liderLoj.tutar / loj * 100).toFixed(1)}%`,
    });
  }

  const kirilim = lojKod.filter(c => bag[c].tutar > 0.005)
    .map(c => `${bag[c].ad} ${(bag[c].tutar / loj * 100).toFixed(1)}%`)
    .join(' · ');
  if (kirilim) list.push({ t: 'Lojistik Dağılım', s: kirilim });

  if (ulkeSirali.length >= 2) {
    const [a, b] = ulkeSirali;
    list.push({
      t: `${a.label} / ${b.label}`,
      s: `Lojistik Fark ${m2Eur2(a.tutar - b.tutar)} (${a.label} Önde)`,
    });
  }

  const kurumsal = (m2.meta?.ulkeler || []).map(u => u.kod);
  const dolu = new Set(Object.keys(ulkeLoj).filter(k => ulkeLoj[k] > 0.005));
  const eksik = kurumsal.filter(k => !dolu.has(k)).map(m2Label);
  if (eksik.length) list.push({ t: 'Lojistik Kaydı Olmayan', s: eksik.join(', ') + ' Bu Aralıkta Lojistik Kalemi İçermiyor.' });

  return list.slice(0, 5);
}

function m2KalemSinif(k) {
  const kod = String(k.kalem_kod || '').toLowerCase();
  const ad = String(k.kalem_ad || '').toLowerCase();
  if (kod === 'taxes' || /tax|customs|gümrük|gumruk|carinsko|zatezne/.test(ad)) return 'taxes';
  if (kod === 'pallet_in' || kod === 'box_in' || /inbound|istovar|pallet in|box in/.test(ad)) return 'inbound';
  if (kod === 'pallet_out' || kod === 'box_out' || /outbound|utovar|pallet out|box out/.test(ad)) return 'outbound';
  if (kod === 'storage' || /storage|depolama|depo|stock/.test(ad)) return 'storage';
  if (kod === 'transport' || /transport|nakliye|freight|iç nakliye|ic nakliye/.test(ad)) return 'transport';
  if (kod === 'labeling' || /label|etiket/.test(ad)) return 'labeling';
  if (kod === 'fuel_surcharge' || /fuel|yakıt|yakit|diesel|brandstof/.test(ad)) return 'fuel';
  return 'other';
}

function m2KalemBag(kalemler) {
  const bag = {
    taxes: { ad: 'Vergi / Gümrük', tutar: 0, color: '#DC2626' },
    inbound: { ad: 'Giriş', tutar: 0, color: '#0F766E' },
    storage: { ad: 'Depolama', tutar: 0, color: '#0891B2' },
    outbound: { ad: 'Çıkış', tutar: 0, color: '#14B8A6' },
    transport: { ad: 'Nakliye', tutar: 0, color: '#2563EB' },
    labeling: { ad: 'Etiketleme', tutar: 0, color: '#D97706' },
    fuel: { ad: 'Yakıt Farkı', tutar: 0, color: '#7C3AED' },
    other: { ad: 'Diğer', tutar: 0, color: '#64748B' },
  };
  (kalemler || []).forEach(k => {
    bag[m2KalemSinif(k)].tutar += Number(k.tutar_eur || 0);
  });
  const lojKod = ['inbound', 'storage', 'outbound', 'transport', 'labeling', 'fuel', 'other'];
  const loj = lojKod.reduce((s, c) => s + bag[c].tutar, 0);
  const liderLoj = lojKod.map(c => bag[c]).filter(s => s.tutar > 0.005)
    .sort((a, b) => b.tutar - a.tutar)[0] || null;
  return { bag, lojKod, loj, tax: bag.taxes.tutar, liderLoj };
}

function m2UlkeKalemOzet(ulkeKod) {
  const data = m2.gercek;
  if (!data) return { kalemler: [], toplam: 0 };
  if (!ulkeKod || ulkeKod === 'all') {
    return {
      kalemler: data.kalemler || [],
      toplam: Number(data.ozet?.gercek_toplam_eur || 0),
    };
  }
  const ulke = (data.ulkeler || []).find(u => u.ulke === ulkeKod);
  const toplam = Number(ulke?.gercek_eur || 0);
  const kalemler = (data.kalemler || []).map(k => {
    const tutar = Number((k.ulkeler || {})[ulkeKod] || 0);
    return { ...k, tutar_eur: tutar, ulkeler: { [ulkeKod]: tutar } };
  }).filter(k => k.tutar_eur > 0.005);
  return { kalemler, toplam };
}

function m2MixBarHtml(kalemler, toplam) {
  const tot = Number(toplam || 0);
  const { bag, lojKod, loj, tax } = m2KalemBag(kalemler);
  if (!loj && !tax) return '';
  const base = loj > 0.005 ? loj : tot;
  const pctLoj = (n) => base ? (n / base * 100) : 0;
  const pctTot = (n) => tot ? (n / tot * 100) : 0;
  const segments = lojKod.map(c => bag[c]).filter(s => s.tutar > 0.005)
    .sort((a, b) => b.tutar - a.tutar);
  const pctLabel = (p) => (p >= 8 ? `${p.toFixed(1)}%` : (p >= 5 ? `${Math.round(p)}%` : ''));
  return `
    <div class="m2-card" style="margin-bottom:12px">
      <div class="m2-h">Lojistik Kırılım</div>
      <div class="m2-mix lg">${segments.map(s =>
        `<span style="width:${pctLoj(s.tutar)}%;background:${s.color}" title="${m2Esc(s.ad)} ${m2Eur2(s.tutar)}">${pctLabel(pctLoj(s.tutar))}</span>`
      ).join('') || `<span style="width:100%;background:#EDE8DF;color:var(--m2-muted)">—</span>`}</div>
      <div class="m2-mix-legend">${segments.map(s =>
        `<div style="--c:${s.color}"><strong>${m2Esc(s.ad)}</strong><b>${m2Eur2(s.tutar)}</b><em>(${pctLoj(s.tutar).toFixed(1)}%)</em></div>`
      ).join('')}</div>
      ${tax > 0.005 ? `<div class="m2-mix-note">
        <span>Vergi / Gümrük <small>· Toplam Maliyetin ${pctTot(tax).toFixed(1)}%</small></span>
        <b>${m2Eur2(tax)}</b>
      </div>` : ''}
    </div>`;
}

function m2OranFmt(oran) {
  if (oran == null || Number.isNaN(Number(oran))) return '—';
  return `${Number(oran).toFixed(2).replace('.', ',')}%`;
}

function m2LtYorumlar(oranData) {
  const o = oranData?.ozet || {};
  const rows = oranData?.ulkeler || [];
  const list = [];
  if (!rows.length) {
    list.push({ t: 'Karşılaştırma Verisi Yok', s: 'Ülke Tablolarına Lojistik Ve Ciro Girince L/T Oranları Burada Toplanır.' });
    return list;
  }
  if (o.en_iyi) {
    list.push({
      t: `En Verimli: ${o.en_iyi.label}`,
      s: `Lojistik / Ciro ${m2OranFmt(o.en_iyi.oran)} — Dönem Ortalamasının Altında.`,
    });
  }
  if (o.en_yuksek && (!o.en_iyi || o.en_yuksek.ulke !== o.en_iyi.ulke)) {
    list.push({
      t: `En Yüksek Oran: ${o.en_yuksek.label}`,
      s: `${m2OranFmt(o.en_yuksek.oran)} — Lojistik Ciroya Göre Daha Ağır.`,
    });
  }
  if (o.genel_oran != null) {
    list.push({
      t: `Grup Genel Oranı ${m2OranFmt(o.genel_oran)}`,
      s: `${m2Eur2(o.toplam_lojistik_oran != null ? o.toplam_lojistik_oran : o.toplam_lojistik)} Lojistik (Cirolu Aylar) / ${m2Eur2(o.toplam_ciro)} Ciro (${o.oran_ulke_sayisi} Ülke).`,
    });
  }
  const eksik = rows.filter(r => Number(r.ay_sayisi_loj_eksik_ciro) > 0);
  if (eksik.length) {
    list.push({
      t: 'Ciro Eksik Aylar Var',
      s: eksik.map(r => `${r.label} (${r.ay_sayisi_loj_eksik_ciro} Ay)`).join(', ')
        + ' — Bu Aylar Dönem Oranına Lojistik Olarak Dahil Edilmez.',
    });
  }
  return list.slice(0, 4);
}

function m2LtPp(d) {
  const sign = d > 0 ? '+' : '';
  return `${sign}${d.toFixed(2).replace('.', ',')} pp`;
}

function m2LtAyHarita(oranData, rows) {
  const seen = new Set();
  const months = [];
  const add = (ay) => {
    if (!ay || seen.has(ay)) return;
    seen.add(ay);
    months.push(ay);
  };
  (oranData.aylik || []).forEach(a => add(a.ay));
  (rows || []).forEach(r => (r.aylik || []).forEach(a => add(a.ay)));
  months.sort();
  const byUlke = {};
  (rows || []).forEach(r => {
    const map = {};
    (r.aylik || []).forEach(a => { map[a.ay] = a; });
    byUlke[r.ulke] = map;
  });
  (oranData.aylik || []).forEach(a => {
    Object.entries(a.ulkeler || {}).forEach(([kod, oran]) => {
      if (!byUlke[kod]) byUlke[kod] = {};
      if (!byUlke[kod][a.ay]) byUlke[kod][a.ay] = { ay: a.ay, oran };
    });
  });
  return { months, byUlke };
}

function m2LtHeatSinif(oran, ort) {
  if (oran == null || ort == null) return 'mid';
  const d = oran - ort;
  if (d <= -2) return 'lo2';
  if (d <= -0.5) return 'lo1';
  if (d < 0.5) return 'mid';
  if (d < 2) return 'hi1';
  return 'hi2';
}

function m2LtSparkSvg(vals, color) {
  const nums = vals.filter(v => v != null && !Number.isNaN(v));
  if (nums.length < 2) return '';
  const w = 56, h = 22, pad = 2.5;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min;
  const xAt = (i) => pad + (vals.length <= 1 ? (w - 2 * pad) / 2 : i * (w - 2 * pad) / (vals.length - 1));
  const yAt = (v) => span < 0.05 ? h / 2 : h - pad - ((v - min) / span) * (h - 2 * pad);
  let d = '';
  let drawing = false;
  vals.forEach((v, i) => {
    if (v == null || Number.isNaN(v)) { drawing = false; return; }
    d += `${drawing ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)} `;
    drawing = true;
  });
  const lastIdx = vals.reduce((acc, v, i) => (v != null && !Number.isNaN(v) ? i : acc), -1);
  const last = lastIdx >= 0 ? vals[lastIdx] : null;
  return `<svg class="m2-lt-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <path d="${d.trim()}" fill="none" stroke="${m2Esc(color)}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
    ${lastIdx >= 0 ? `<circle cx="${xAt(lastIdx).toFixed(1)}" cy="${yAt(last).toFixed(1)}" r="2.3" fill="${m2Esc(color)}"/>` : ''}
  </svg>`;
}

function m2LtHeatHucre(hit, ort, label, ay) {
  const ayAd = m2AyAd(ay);
  if (!hit || hit.oran == null) {
    const eksik = !!(hit && Number(hit.lojistik) > 0.005 && !(Number(hit.ciro_eur) > 0.005));
    const title = eksik
      ? `${label} · ${ayAd}: lojistik var, ciro yok — oran hesaplanmaz`
      : `${label} · ${ayAd}: bu ayda ciro yok`;
    return `<td class="m2-heat-cell ${eksik ? 'miss' : 'empty'}" title="${m2Esc(title)}">${eksik ? 'n/a' : '—'}</td>`;
  }
  const d = ort != null ? hit.oran - ort : 0;
  const parts = [`${label} · ${ayAd}: ${m2OranFmt(hit.oran)}`];
  if (ort != null) parts.push(`Δ ort. ${m2LtPp(d)}`);
  if (hit.lojistik != null && hit.ciro_eur != null) {
    parts.push(`${m2Eur(hit.lojistik)} / ${m2Eur(hit.ciro_eur)}`);
  }
  return `<td class="m2-heat-cell ${m2LtHeatSinif(hit.oran, ort)}" title="${m2Esc(parts.join(' · '))}">${Number(hit.oran).toFixed(1).replace('.', ',')}</td>`;
}

function m2LtTrendHucre(hits) {
  const vals = hits.filter(h => h && h.oran != null);
  if (vals.length < 2) return '<td class="m2-heat-cell trend"><span class="m2-lt-delta flat">—</span></td>';
  const a = vals[0], b = vals[vals.length - 1];
  const d = b.oran - a.oran;
  const cls = Math.abs(d) < 0.05 ? 'flat' : (d > 0 ? 'up' : 'down');
  const title = `${m2AyAd(a.ay)} ${m2OranFmt(a.oran)} → ${m2AyAd(b.ay)} ${m2OranFmt(b.oran)}`;
  return `<td class="m2-heat-cell trend" title="${m2Esc(title)}"><span class="m2-lt-delta ${cls}">${m2LtPp(d)}</span></td>`;
}

function m2LtHeatPills(rows, months, byUlke, ort) {
  const pills = [];
  let zirve = null;
  let dusus = null;
  rows.forEach(r => {
    months.forEach(ay => {
      const hit = (byUlke[r.ulke] || {})[ay];
      if (!hit || hit.oran == null) return;
      if (!zirve || hit.oran > zirve.oran) zirve = { ...hit, label: r.label, ay };
    });
    const seri = months.map(ay => (byUlke[r.ulke] || {})[ay]).filter(h => h && h.oran != null);
    if (seri.length < 2) return;
    let maxDrop = null;
    for (let i = 1; i < seri.length; i++) {
      const d = seri[i].oran - seri[i - 1].oran;
      if (!maxDrop || Math.abs(d) > Math.abs(maxDrop.d)) {
        maxDrop = { d, from: seri[i - 1], to: seri[i], label: r.label };
      }
    }
    if (maxDrop && (!dusus || Math.abs(maxDrop.d) > Math.abs(dusus.d))) dusus = maxDrop;
  });
  if (zirve) {
    const vs = ort != null ? ` · dönem ort. ${m2OranFmt(ort)}` : '';
    pills.push({
      t: `En yüksek ay: ${zirve.label} · ${m2AyAd(zirve.ay)}`,
      s: `${m2OranFmt(zirve.oran)}${vs}. Koyu turuncu hücreler ortalamanın üstünü (pahalı) gösterir.`,
    });
  }
  if (dusus && Math.abs(dusus.d) >= 1) {
    const yon = dusus.d > 0 ? 'kötüleşti' : 'iyileşti';
    pills.push({
      t: `En sert aylık hareket: ${dusus.label}`,
      s: `${m2AyAd(dusus.from.ay)} ${m2OranFmt(dusus.from.oran)} → ${m2AyAd(dusus.to.ay)} ${m2OranFmt(dusus.to.oran)} (${m2LtPp(dusus.d)}, ${yon}).`,
    });
  }
  return pills.slice(0, 2);
}

function m2LtHeatHtml(oranData, rows, ort) {
  const { months, byUlke } = m2LtAyHarita(oranData, rows);
  if (!months.length) {
    return `<div class="m2-card">
      <div class="m2-h">Aylık L/T Haritası</div>
      <div class="m2-p">Cirosu Olan Ay Yok — Oran Hücresi Çizilemez.</div>
    </div>`;
  }
  const pills = m2LtHeatPills(rows, months, byUlke, ort);
  return `<div class="m2-card">
    <div class="m2-h">Aylık L/T Haritası</div>
    <div class="m2-p">Sayı = O Ayın Lojistik / Ciro Oranı. Renk, Dönem Ortalamasına Sapma. — = Ciro Yok (Oran Yok).</div>
    <div class="m2-heat-wrap"><table class="m2-heat">
      <thead><tr>
        <th class="lab">Ülke</th>
        ${months.map(ay => `<th>${m2Esc(m2AyAd(ay))}</th>`).join('')}
        <th>İlk→Son</th>
      </tr></thead>
      <tbody>${rows.map(r => {
        const hits = months.map(ay => (byUlke[r.ulke] || {})[ay]);
        const spark = m2LtSparkSvg(hits.map(h => (h && h.oran != null) ? h.oran : null), m2Color(r.ulke));
        return `<tr>
          <td class="lab"><div class="lab-inner">
            <span><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${m2Color(r.ulke)};margin-right:6px"></i>${m2Esc(r.label)}</span>
            ${spark}
          </div></td>
          ${months.map((ay, i) => m2LtHeatHucre(hits[i], ort, r.label, ay)).join('')}
          ${m2LtTrendHucre(hits)}
        </tr>`;
      }).join('')}</tbody>
    </table></div>
    <div class="m2-heat-legend">
      <span><i style="background:#5EEAD4"></i>Ort. altı</span>
      <span><i style="background:#F7F4EE"></i>Yakın</span>
      <span><i style="background:#FB923C"></i>Ort. üstü</span>
      <span><i style="background:#F4F1EA"></i>Ciro yok</span>
      ${ort != null ? `<span>Ort. <strong style="color:var(--m2-ink)">${m2OranFmt(ort)}</strong></span>` : ''}
    </div>
    ${pills.length ? `<div class="m2-heat-pills">${pills.map(p =>
      `<div class="m2-heat-pill"><div><b>${m2Esc(p.t)}</b><span> ${m2Esc(p.s)}</span></div></div>`
    ).join('')}</div>` : ''}
  </div>`;
}

function m2LtHtml(oranData) {
  if (!oranData || !(oranData.ulkeler || []).length) {
    return `<div class="m2-card" style="margin-bottom:12px">
      <div class="m2-h">Lojistik / Ciro</div>
      <div class="m2-p">Ülke Karşılaştırması İçin Henüz Ciro + Lojistik Verisi Yok.</div>
    </div>`;
  }
  const o = oranData.ozet || {};
  const rows = (oranData.ulkeler || []).slice().sort((a, b) => {
    if (a.oran == null && b.oran == null) return 0;
    if (a.oran == null) return 1;
    if (b.oran == null) return -1;
    return a.oran - b.oran;
  });
  const maxOran = Math.max(...rows.map(r => Number(r.oran) || 0), o.ortalama_oran || 0, 1);
  const ort = o.ortalama_oran;
  const yorum = m2LtYorumlar(oranData);
  const deltaHtml = (oran) => {
    if (oran == null || ort == null) return '<span class="m2-lt-delta flat">—</span>';
    const d = oran - ort;
    const cls = Math.abs(d) < 0.05 ? 'flat' : (d > 0 ? 'up' : 'down');
    const sign = d > 0 ? '+' : '';
    return `<span class="m2-lt-delta ${cls}">${sign}${d.toFixed(2).replace('.', ',')} pp</span>`;
  };
  return `
    <div class="m2-card" style="margin-bottom:12px">
      <div class="m2-h">Lojistik / Ciro Karşılaştırması</div>
      <div class="m2-p">Ülke Tablolarındaki Lojistik Maliyet ÷ Ciro. Düşük Oran Daha Verimli Kabul Edilir.</div>
      <div class="m2-kpis" style="margin-bottom:14px">
        <div class="m2-kpi accent"><span>Grup Oranı</span><b>${m2OranFmt(o.genel_oran)}</b><small>${m2Eur2(o.toplam_lojistik_oran != null ? o.toplam_lojistik_oran : o.toplam_lojistik)} / ${m2Eur2(o.toplam_ciro)}</small></div>
        <div class="m2-kpi"><span>Ülke Ortalaması</span><b>${m2OranFmt(o.ortalama_oran)}</b><small>${o.oran_ulke_sayisi || 0} Ülkede Oran</small></div>
        <div class="m2-kpi"><span>En Verimli</span><b>${m2Esc(o.en_iyi?.label || '—')}</b><small>${o.en_iyi ? m2OranFmt(o.en_iyi.oran) : ''}</small></div>
        <div class="m2-kpi"><span>En Yüksek</span><b>${m2Esc(o.en_yuksek?.label || '—')}</b><small>${o.en_yuksek ? m2OranFmt(o.en_yuksek.oran) : ''}</small></div>
      </div>
      <div class="m2-grid">
        <div>
          <div class="m2-h" style="font-size:13px;margin-bottom:4px">Ülke L/T %</div>
          <div class="m2-lt-bars">${rows.map(r => {
            const w = r.oran != null ? Math.max(4, (r.oran / maxOran) * 100) : 0;
            return `<div class="m2-lt-row">
              <span><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${m2Color(r.ulke)};margin-right:6px"></i>${m2Esc(r.label)}</span>
              <div class="m2-lt-track"><i style="width:${w}%;background:${m2Color(r.ulke)}"></i></div>
              <b>${m2OranFmt(r.oran)}</b>
            </div>`;
          }).join('')}</div>
          ${ort != null ? `<div class="m2-lt-note">Yatay Çubuklar Dönem L/T Oranını Gösterir. Ortalama: <strong>${m2OranFmt(ort)}</strong></div>` : ''}
        </div>
        <div>
          <div class="m2-h" style="font-size:13px;margin-bottom:4px">Ne Anlama Geliyor?</div>
          <div class="m2-insights">${yorum.map(x => `<div class="m2-insight"><i class="ti ti-percentage" style="color:var(--m2);font-size:16px"></i><div><b>${m2Esc(x.t)}</b><span>${m2Esc(x.s)}</span></div></div>`).join('')}</div>
        </div>
      </div>
    </div>
    <div class="m2-card" style="margin-bottom:12px">
      <div class="m2-h">Ülke Özet Tablosu</div>
      <div class="m2-p">Lojistik, Ciro Ve Dönem Oranı · Δ Ort. = Basit Ülke Ortalamasına Fark (Pp). Grup Oranı Cirolu Ayların Lojistiği ÷ Toplam Ciro.</div>
      <div style="overflow:auto"><table class="m2-table">
        <thead><tr><th>Ülke</th><th class="num">Lojistik</th><th class="num">Ciro</th><th class="num">L/T %</th><th class="num">Δ ort.</th></tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${m2Color(r.ulke)};margin-right:7px"></span>${m2Esc(r.label)}</td>
          <td class="num">${m2Eur(r.lojistik)}</td>
          <td class="num">${r.ciro_eur > 0.005 ? m2Eur(r.ciro_eur) : '—'}</td>
          <td class="num">${m2OranFmt(r.oran)}</td>
          <td class="num">${deltaHtml(r.oran)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>
    <div style="margin-bottom:12px">${m2LtHeatHtml(oranData, rows, ort)}</div>`;
}

function m2RenderOzet(body) {
  const data = m2Gorunum();
  if (!data) { body.innerHTML = '<div class="m2-empty">Veri Yok</div>'; return; }
  const o = data.ozet || {};
  const ulkeler = (data.ulkeler || []).slice().sort((a, b) => (b.gercek_eur || 0) - (a.gercek_eur || 0));
  const kalemler = data.kalemler || [];
  const aylik = data.aylik || [];
  const yorum = m2Yorumlar(data);
  const drop = m2UlkeDropHtml();
  const kuyruk = `<div id="m2-inbox">${m2.inboxMsg ? `<div class="m2-ok">${m2Esc(m2.inboxMsg)}</div>` : ''}</div><div id="m2-drafts"></div>`;
  if (!o.fatura_sayisi) {
    body.innerHTML = `${drop}${kuyruk}<div class="m2-card"><div class="m2-empty">
      <i class="ti ti-inbox"></i>
      <div class="m2-h">Bu Dönemde Kayıt Yok</div>
      <div class="m2-p">${m2.ulke === 'all' ? 'Ülke Seçin; Belgeyi O Ülkenin Sayfasına Bırakın. Her Ülkenin Dosya Yapısı Ayrıdır.' : 'Belgeyi Yukarı Bırakın. Bu Ülkenin Okuyucusu Bağlanınca Rapor Dolar.'}</div>
    </div></div>`;
    m2RenderDrafts();
    return;
  }
  const bagOzet = m2KalemBag(kalemler);
  const lojPay = o.gercek_toplam_eur ? (bagOzet.loj / o.gercek_toplam_eur * 100) : 0;
  const ulkeLoj = {};
  kalemler.forEach(k => {
    if (m2KalemSinif(k) === 'taxes') return;
    Object.entries(k.ulkeler || {}).forEach(([kod, tutar]) => {
      ulkeLoj[kod] = (ulkeLoj[kod] || 0) + Number(tutar || 0);
    });
  });
  const liderUlkeLoj = ulkeler.slice().sort((a, b) => (ulkeLoj[b.ulke] || 0) - (ulkeLoj[a.ulke] || 0))[0];
  const lojKalemler = kalemler.filter(k => m2KalemSinif(k) !== 'taxes');
  const ltBlock = m2.ulke === 'all' ? m2LtHtml(m2.oranKarsilastirma) : '';
  body.innerHTML = `
    ${kuyruk}
    <div class="m2-kpis cols-5">
      <div class="m2-kpi accent"><span>Toplam Lojistik</span><b>${m2KpiEur(bagOzet.loj)}</b><small>Toplamın ${lojPay.toFixed(1)}%</small></div>
      <div class="m2-kpi"><span>Toplam Maliyet</span><b>${m2KpiEur(o.gercek_toplam_eur)}</b><small>${m2.start} — ${m2.end}</small></div>
      <div class="m2-kpi"><span>Fatura</span><b>${o.fatura_sayisi || 0}</b><small>${o.ulke_sayisi || 0} Ülkede Kayıt</small></div>
      <div class="m2-kpi"><span>Lider Ülke</span><b>${m2Esc(liderUlkeLoj?.label || '—')}</b><small>${liderUlkeLoj ? m2Eur(ulkeLoj[liderUlkeLoj.ulke] || 0) + ' Lojistik' : ''}</small></div>
      <div class="m2-kpi"><span>Lider Lojistik</span><b>${m2Esc(bagOzet.liderLoj?.ad || '—')}</b><small>${bagOzet.liderLoj ? m2Eur(bagOzet.liderLoj.tutar) : ''}</small></div>
    </div>
    ${m2MixBarHtml(kalemler, o.gercek_toplam_eur)}
    ${ltBlock}
    ${drop}
    ${m2.ulke === 'all' ? `
    <div class="m2-card" style="margin-bottom:12px"><div class="m2-h">Lojistik Yorum</div>
      <div class="m2-insights">${yorum.map(x => `<div class="m2-insight"><i class="ti ti-sparkles" style="color:var(--m2);font-size:16px"></i><div><b>${m2Esc(x.t)}</b><span>${m2Esc(x.s)}</span></div></div>`).join('')}</div>
    </div>` : `
    <div class="m2-grid">
      <div class="m2-card"><div class="m2-h">Aylık Gelişim</div><div class="m2-p">Ülkelere Yığılmış Gerçekleşen Tutar.</div><div class="m2-chart"><canvas id="m2-trend"></canvas></div></div>
      <div class="m2-card"><div class="m2-h">Lojistik Yorum</div><div class="m2-p">Yalnız Lojistik Kalemlerinden.</div>
        <div class="m2-insights">${yorum.map(x => `<div class="m2-insight"><i class="ti ti-sparkles" style="color:var(--m2);font-size:16px"></i><div><b>${m2Esc(x.t)}</b><span>${m2Esc(x.s)}</span></div></div>`).join('')}</div>
      </div>
    </div>`}
    <div class="m2-card" style="margin-bottom:12px">
      <div class="m2-h">Lojistik × Ülke</div>
      <div class="m2-p">Tutarlar EUR · KDV Hariç</div>
      <div class="m2-scroll"><table class="m2-table matrix"><thead><tr>
        <th>Kalem</th>${ulkeler.map(u => `<th class="num" title="${m2Esc(u.label)}">${m2Esc((u.ulke || '').toUpperCase())}</th>`).join('')}<th class="num">Toplam</th>
      </tr></thead>
      <tbody>${lojKalemler.map(k => `<tr>
        <td title="${m2Esc(m2KalemAdGoster(k.kalem_ad))}">${m2Esc(m2KalemAdGoster(k.kalem_ad))}</td>
        ${ulkeler.map(u => {
          const t = Number((k.ulkeler || {})[u.ulke] || 0);
          return t > 0.005
            ? `<td class="num">${m2EurNum(t)}</td>`
            : `<td class="num muted">—</td>`;
        }).join('')}
        <td class="num">${m2EurNum(k.tutar_eur)}</td>
      </tr>`).join('') || `<tr><td colspan="${ulkeler.length + 2}" style="color:var(--m2-muted)">Lojistik Kalemi Yok</td></tr>`}</tbody></table></div>
    </div>
    <div class="m2-card" style="margin-bottom:12px"><div class="m2-h">Ülke Payı</div><div class="m2-p">Dönem İçi Lojistik Dağılım.</div><div class="m2-chart" style="height:260px"><canvas id="m2-pie"></canvas></div></div>`;
  m2RenderDrafts();
  m2Charts({ ...data, kalemler: lojKalemler, _ulkeLoj: ulkeLoj }, ulkeler, aylik);
}

function m2Charts(data, ulkeler, aylik) {
  if (typeof Chart === 'undefined') return;
  const tip = { backgroundColor: 'rgba(26,25,22,.94)', padding: 10, cornerRadius: 10 };
  const trend = document.getElementById('m2-trend');
  if (trend) {
    m2.charts.push(new Chart(trend, {
      type: 'bar',
      data: {
        labels: aylik.map(a => m2AyAd(a.ay)),
        datasets: ulkeler.map(u => ({
          label: u.label, data: aylik.map(a => (a.ulkeler || {})[u.ulke] || 0),
          backgroundColor: m2Color(u.ulke), borderRadius: 5, maxBarThickness: 42,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, usePointStyle: true, font: { size: 10 } } },
          tooltip: { ...tip, callbacks: { label: c => ` ${c.dataset.label}: ${m2Eur2(c.parsed.y)}` } } },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, border: { display: false }, grid: { color: '#EDE8DF' },
            ticks: { callback: v => new Intl.NumberFormat('tr-TR', { notation: 'compact' }).format(v) + ' €' } },
        },
      },
    }));
  }
  const pie = document.getElementById('m2-pie');
  if (pie && ulkeler.length) {
    const ulkeLoj = data._ulkeLoj;
    const pieData = ulkeler.map(u => (ulkeLoj ? (ulkeLoj[u.ulke] || 0) : (u.gercek_eur || 0)));
    m2.charts.push(new Chart(pie, {
      type: 'doughnut',
      data: {
        labels: ulkeler.map(u => u.label),
        datasets: [{ data: pieData, backgroundColor: ulkeler.map(u => m2Color(u.ulke)), borderWidth: 3, borderColor: '#fff' }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '64%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 8, usePointStyle: true, font: { size: 11 },
              padding: 12,
            },
          },
          tooltip: { ...tip, callbacks: { label: c => ` ${c.label}: ${m2Eur(c.parsed)}` } },
        },
      },
    }));
  }
}

function m2FnoKey(s) {
  return String(s || '').trim().replace(/\s+/g, ' ');
}

function m2BosnaDpuListesi() {
  const fromRapor = (m2BosnaAktifRapor() || {}).dpu_yedek;
  const fromAktarim = (m2.bosnaAktarim || {}).dpu_yedek;
  if (fromRapor && fromRapor.length) return fromRapor;
  return fromAktarim || [];
}

function m2BosnaDpuKutusu() {
  const list = m2BosnaDpuListesi();
  if (!list.length) return '';
  const satir = list.slice(0, 20).map(x => {
    const ay = x.donem ? m2AyAdEn(x.donem) : '';
    return `${m2Esc(x.fatura_no)}${ay ? ' · ' + m2Esc(ay) : ''}${x.tarih ? ' · DPU ' + m2Esc(x.tarih) : ''}`;
  }).join('<br>');
  return `<div class="m2-warn">
    <b>Datum Boş · DPU Kullanıldı.</b> Ay, ${list.length} Fatura İçin DPU’dan Alındı. Datum Varsa O Geçerlidir.
    <div style="margin-top:6px">${satir}${list.length > 20 ? '<br>…' : ''}</div>
  </div>`;
}

function m2BosnaAktarimKutusu() {
  const a = m2.bosnaAktarim;
  if (!a) return '';
  const yeni = Number(a.yeni_sayisi || 0);
  const kayitli = Number(a.kayitli_sayisi || 0);
  const ayni = Number(a.ayni_sayisi != null ? a.ayni_sayisi : kayitli);
  const guncelle = Number(a.guncelle_sayisi || a.cakisma_sayisi || 0);
  const disinda = Number(a.excel_disinda_kayitli || 0);
  if (!kayitli && !guncelle && !yeni) return '';
  if (!kayitli && !guncelle) return '';
  const ornek = (a.yeni_nolar || []).slice(0, 8).map(m2Esc).join(', ');
  const ayAd = (ay) => m2AyAdEn(ay);
  const ayFark = (a.ay_fark || []).slice(0, 8).map(f => {
    const mq = Number(f.excel_miktar) - Number(f.kayitli_miktar);
    const mt = Number(f.excel_tutar) - Number(f.kayitli_tutar);
    return `${m2Esc(ayAd(f.ay))} ${m2Esc(f.alan)}: ${f.kayitli_miktar} → ${f.excel_miktar}`
      + (mq ? ` (${mq > 0 ? '+' : ''}${mq})` : '')
      + ` · ${m2Eur2(f.kayitli_tutar)} → ${m2Eur2(f.excel_tutar)}`;
  }).join('<br>');
  const rotaFark = (a.rota_fark || []).slice(0, 8).map(f => {
    const mq = Number(f.excel_miktar) - Number(f.kayitli_miktar);
    return `${m2Esc(ayAd(f.ay))} ${m2Esc(f.rota)}: ${f.kayitli_miktar} → ${f.excel_miktar}`
      + (mq ? ` (${mq > 0 ? '+' : ''}${mq} Sefer)` : '')
      + ` · ${m2Eur2(f.kayitli_tutar)} → ${m2Eur2(f.excel_tutar)}`;
  }).join('<br>');
  const cakismaSatir = (a.cakisma || []).slice(0, 8).map(c => {
    const isaret = Number(c.fark) >= 0 ? '+' : '';
    let donemNot = '';
    if (c.kayitli_donem && c.excel_donem && c.kayitli_donem !== c.excel_donem) {
      donemNot = ` · ${m2Esc(c.kayitli_donem)} → ${m2Esc(c.excel_donem)}`;
    } else if (c.donem) {
      donemNot = ' · ' + m2Esc(c.donem);
    }
    return `${m2Esc(c.fatura_no)}${donemNot}: ${m2Eur2(c.kayitli_tutar)} → ${m2Eur2(c.excel_tutar)} (${isaret}${m2Eur2(c.fark)})`;
  }).join('<br>');
  if (!yeni && !guncelle && kayitli) {
    return `<div class="m2-ok">${kayitli} Fatura Dosyada Kayıtla Eşleşiyor. Hücrelere Dokunulmaz.
      ${disinda ? `<div style="margin-top:6px">${disinda} Kayıtlı Fatura Bu Dosyada Yok; Yerinde Kalır.</div>` : ''}
    </div>`;
  }
  return `<div class="m2-warn">
    <b>Dosya Kayıtla Karşılaştırıldı.</b> ${ayni} Değişmeyen Faturaya Dokunulmaz.
    ${yeni ? `<div style="margin-top:6px"><b>${yeni} Yeni Fatura</b> Eklenecek${ornek ? ` · ${ornek}${a.yeni_nolar.length > 8 ? '…' : ''}` : ''}.</div>` : ''}
    ${guncelle ? `<div style="margin-top:6px"><b>${guncelle} Fatura Değişmiş</b> (Aynı No, Farklı Tutar / Miktar Veya Ay). Excel’den Güncellemek İçin Onaylayın.<br>${cakismaSatir}</div>` : ''}
    ${ayFark ? `<div style="margin-top:8px"><b>Ay Özeti · Yeşil Yeni, Turuncu Değişen</b><br>${ayFark}</div>` : ''}
    ${rotaFark ? `<div style="margin-top:8px"><b>Rotalar</b><br>${rotaFark}</div>` : ''}
    ${disinda ? `<div style="margin-top:6px">${disinda} Kayıtlı Fatura Bu Dosyada Yok; Silinmez.</div>` : ''}
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
      ${(yeni || guncelle) ? `<button class="m2-btn" type="button" onclick="m2DraftHepsiniKaydet()">${yeni && guncelle ? `Yeni Ekle + ${guncelle} Güncelle` : guncelle ? `${guncelle} Faturayı Güncelle` : `${yeni} Yeni Fatura Ekle`}</button>` : ''}
      <button class="m2-btn ghost" data-ba-xlsx type="button" onclick="m2BosnaExcelIndir()">Excel İndir</button>
    </div>
  </div>`;
}

function m2KoliPalet(koli) {
  const n = Number(koli || 0);
  if (n <= 0) return 0;
  const ratio = n / 30;
  const whole = Math.trunc(ratio);
  return whole + ((ratio - whole) >= 0.5 ? 1 : 0);
}

function m2BosnaHucreSinif(ay, kod, rota) {
  const a = m2.bosnaAktarim;
  if (!a) return '';
  const fark = rota
    ? (a.rota_fark || []).find(x => x.ay === ay && x.rota === rota)
    : (a.ay_fark || []).find(x => x.ay === ay && x.kod === kod);
  if (!fark) return '';
  if (!Number(fark.kayitli_miktar) && !Number(fark.kayitli_tutar)) return ' yeni';
  return ' degis';
}

function m2BosnaRotaKisa(rota) {
  const s = String(rota || '');
  const m = s.match(/\(BA\)\s*-\s*(.+?)\s*-\s*\(BA\)\s*-\s*(.+)$/i);
  if (!m) return s;
  return `${m[1].trim()} → ${m[2].trim()}`;
}

const M2_ROTA_COLORS = [
  '#2563EB', '#0F766E', '#EA580C', '#7C3AED', '#DC2626', '#0891B2',
  '#CA8A04', '#DB2777', '#4F46E5', '#16A34A', '#9333EA', '#0E7490',
];

function m2BosnaRotaListesi(yilAylar, sirala) {
  const map = new Map();
  (yilAylar || []).forEach(a => (a.rotalar || []).forEach(r => {
    if (!r || !r.rota) return;
    const prev = map.get(r.rota) || { rota: r.rota, miktar: 0, tutar: 0 };
    prev.miktar += Number(r.miktar || 0);
    prev.tutar += Number(r.tutar || 0);
    map.set(r.rota, prev);
  }));
  const list = [...map.values()].map(rt => ({
    ...rt,
    birim: rt.miktar ? rt.tutar / rt.miktar : 0,
  }));
  if (sirala === 'miktar') {
    list.sort((a, b) => b.miktar - a.miktar || b.tutar - a.tutar || a.rota.localeCompare(b.rota, 'tr'));
  } else if (sirala === 'birim') {
    list.sort((a, b) => b.birim - a.birim || b.tutar - a.tutar || a.rota.localeCompare(b.rota, 'tr'));
  } else {
    list.sort((a, b) => b.tutar - a.tutar || b.miktar - a.miktar || a.rota.localeCompare(b.rota, 'tr'));
  }
  return list;
}

function m2BosnaRotaAy(ayObj, rota) {
  return (ayObj.rotalar || []).find(x => x.rota === rota) || { miktar: 0, tutar: 0, tutar_bam: 0 };
}

function m2BosnaRotaToggle() {
  m2.bosnaRotalarAcik = !m2.bosnaRotalarAcik;
  m2Render();
}

function m2BosnaAktifRapor() {
  return m2.bosnaRapor || m2.bosnaKayit;
}

async function m2BosnaExcelIndir() {
  const rapor = m2BosnaAktifRapor();
  if (!rapor || !(rapor.aylar || []).length) return alert('İndirilecek Bosna Raporu Yok. Önce SATR/SP Excel Bırakın.');
  const btn = document.querySelectorAll('[data-ba-xlsx]');
  btn.forEach(b => { b.disabled = true; b.dataset.label = b.innerHTML; b.innerHTML = 'İndiriliyor…'; });
  try {
    const res = await fetch('/api/maliyet/bosna/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yil: m2.bosnaYil, rapor, ...m2ExcelDonemPayload(m2.bosnaYil) }),
    });
    if (!res.ok) {
      let msg = 'Excel Oluşturulamadı';
      try { msg = (await res.json()).error || msg; } catch (e) {}
      return alert(msg);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bosna_lojistik_${m2.bosnaYil}${m2DonemSlug()}${m2.bosnaOnizleme ? '_onizleme' : ''}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) {
    alert(e.message || 'Excel İndirme Başarısız');
  } finally {
    btn.forEach(b => { b.disabled = false; if (b.dataset.label) b.innerHTML = b.dataset.label; });
  }
}

function m2BosnaFaturaKayitlari() {
  const yil = m2.bosnaYil;
  const q = String(m2.bosnaFaturaQ || '').trim().toLowerCase();
  return ((m2BosnaAktifRapor() || {}).faturalar || []).map((f, i) => ({ f, i })).filter(({ f }) => {
    const donem = String(f.donem || f.datum || '');
    if (yil && !donem.startsWith(yil)) return false;
    if (q && !String(f.fatura_no || '').toLowerCase().includes(q)) return false;
    return true;
  });
}

function m2BosnaFaturaGorunen() {
  const rows = m2BosnaFaturaKayitlari();
  if (m2.bosnaFaturaDuzenle || m2.bosnaFaturaAcik || m2.bosnaFaturaQ) return rows;
  return rows.slice(0, 5);
}

function m2BosnaFaturaSatirHtml(rows) {
  if (!rows.length) {
    return `<tr><td colspan="${m2.bosnaFaturaDuzenle ? 6 : 5}" class="lab" style="text-align:center;font-weight:600">Eşleşen Fatura Yok</td></tr>`;
  }
  const duzenle = m2.bosnaFaturaDuzenle;
  return rows.map(({ f, i }) => {
    let datumIso = String(f.datum || '').slice(0, 10);
    let datum = datumIso;
    if (datum.length === 10) {
      const [y, m, d] = datum.split('-');
      datum = `${d}.${m}.${y}`;
    }
    if ((f.tarih_kaynak || '') === 'dpu' && datum && !duzenle) datum += ' · DPU';
    if (duzenle) {
      return `<tr>
        <td><input class="m2-ba-edit left" data-fi="${i}" data-alan="fatura_no" value="${m2Esc(f.fatura_no || '')}"></td>
        <td><input class="m2-ba-edit left" type="date" data-fi="${i}" data-alan="datum" value="${m2Esc(datumIso)}"></td>
        <td class="num"><input class="m2-ba-edit" data-fi="${i}" data-alan="neto_bam" value="${Number(f.neto_bam || 0).toFixed(2)}"></td>
        <td class="num">${m2Eur2(f.neto_eur)}</td>
        <td><select class="m2-ba-edit left" data-fi="${i}" data-alan="tip">
          ${['Warehouse', 'Transport', 'Taxes'].concat(f.tip && !['Warehouse', 'Transport', 'Taxes'].includes(f.tip) ? [f.tip] : []).map(t => `<option value="${m2Esc(t)}" ${t === (f.tip || 'Taxes') ? 'selected' : ''}>${m2Esc(m2FaturaTipAd(t))}</option>`).join('')}
        </select></td>
        <td><button type="button" class="m2-ba-del" onclick="m2BosnaFaturaSatirSil(${i})">Sil</button></td>
      </tr>`;
    }
    return `<tr>
      <td class="lab">${m2Esc(f.fatura_no || '')}</td>
      <td>${m2Esc(datum || '—')}</td>
      <td class="num">${m2Bam2(f.neto_bam)}</td>
      <td class="num">${m2Eur2(f.neto_eur)}</td>
      <td>${m2Esc(m2FaturaTipAd(f.tip || ''))}</td>
    </tr>`;
  }).join('');
}

function m2BosnaFaturaHtml() {
  const all = m2BosnaFaturaKayitlari();
  if (!all.length && !m2.bosnaFaturaDuzenle) return '';
  const rows = m2BosnaFaturaGorunen();
  const yilHepsi = ((m2BosnaAktifRapor() || {}).faturalar || []).filter(f => String(f.donem || f.datum || '').startsWith(m2.bosnaYil));
  const bam = yilHepsi.reduce((s, f) => s + Number(f.neto_bam || 0), 0);
  const eur = yilHepsi.reduce((s, f) => s + Number(f.neto_eur || 0), 0);
  const fazla = all.length > 5 && !m2.bosnaFaturaDuzenle && !m2.bosnaFaturaQ;
  const listeAcik = m2.bosnaFaturaAcik;
  const duzenle = m2.bosnaFaturaDuzenle;
  const panelAcik = m2.bosnaFaturaPanelAcik || duzenle;
  return `<div class="m2-card" style="margin-top:12px">
      <button type="button" class="m2-ba-inv-toggle" onclick="m2BosnaFaturaPanelToggle()" aria-expanded="${panelAcik ? 'true' : 'false'}">
        <div style="display:flex;align-items:center;gap:10px;min-width:0">
          <span class="m2-ba-caret" aria-hidden="true">${panelAcik ? '▾' : '▸'}</span>
          <div>
            <div class="m2-kicker">Faturalar</div>
            <div class="m2-h">${yilHepsi.length} Fatura · ${m2Eur2(eur)}</div>
          </div>
        </div>
        <span class="m2-ba-inv-meta">${panelAcik ? 'Gizle' : 'Göster'} · ${m2Bam2(bam)}</span>
      </button>
      ${panelAcik ? `<div class="m2-ba-inv-body">
        <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;align-items:end;margin-bottom:12px">
          <label class="m2-field"><span>Ara</span>
            <input class="m2-input" id="m2-ba-fno" placeholder="Fatura No" value="${m2Esc(m2.bosnaFaturaQ || '')}" oninput="m2BosnaFaturaFiltre(this.value)">
          </label>
          ${duzenle
            ? `<button class="m2-btn" type="button" onclick="m2BosnaFaturaDuzenleBitir()">Tamam</button>
               <button class="m2-btn ghost" type="button" onclick="m2.bosnaFaturaDuzenle=false;m2Render()">İptal</button>
               <button class="m2-btn ghost" type="button" onclick="m2BosnaFaturaSatirEkle()">Fatura Ekle</button>`
            : `<button class="m2-btn ghost" type="button" onclick="m2BosnaFaturaDuzenleAc()">Listeyi Düzenle</button>
               <button class="m2-btn ghost" data-ba-inv type="button" onclick="m2BosnaFaturaIndir()"><i class="ti ti-download"></i> Faturaları İndir</button>`}
        </div>
        <div class="m2-ba-inv${listeAcik || duzenle || m2.bosnaFaturaQ ? ' open' : ''}">
          <table class="m2-ba-table">
            <thead><tr><th>Fatura No</th><th>Tarih</th><th>Net BAM</th><th>Net EUR</th><th>Tip</th>${duzenle ? '<th></th>' : ''}</tr></thead>
            <tbody id="m2-ba-fatura-body">${m2BosnaFaturaSatirHtml(rows)}</tbody>
            <tfoot><tr class="tot"><td class="lab" id="m2-ba-fatura-meta" colspan="2">${yilHepsi.length} Fatura${rows.length < all.length ? ` · ${rows.length} Gösterilen` : ''}</td><td class="num">${m2Bam2(bam)}</td><td class="num">${m2Eur2(eur)}</td><td colspan="${duzenle ? 2 : 1}"></td></tr></tfoot>
          </table>
        </div>
        ${fazla ? `<div style="margin-top:10px"><button class="m2-btn ghost" type="button" onclick="m2.bosnaFaturaAcik=${listeAcik ? 'false' : 'true'};m2Render()">${listeAcik ? '5 Göster' : `Tümünü Göster (${all.length})`}</button></div>` : ''}
      </div>` : ''}
    </div>`;
}

function m2BosnaFaturaPanelToggle() {
  if (m2.bosnaFaturaDuzenle) {
    m2BosnaFaturaFormOku();
    m2.bosnaFaturaDuzenle = false;
  }
  m2.bosnaFaturaPanelAcik = !m2.bosnaFaturaPanelAcik;
  m2Render();
}

function m2BosnaFaturaFiltre(q) {
  if (m2.bosnaFaturaDuzenle) {
    m2BosnaFaturaFormOku();
    m2.bosnaFaturaQ = q || '';
    m2Render();
    const el = document.getElementById('m2-ba-fno');
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    return;
  }
  m2.bosnaFaturaQ = q || '';
  const body = document.getElementById('m2-ba-fatura-body');
  const meta = document.getElementById('m2-ba-fatura-meta');
  const all = m2BosnaFaturaKayitlari();
  const rows = m2BosnaFaturaGorunen();
  if (body) body.innerHTML = m2BosnaFaturaSatirHtml(rows);
  if (meta) meta.textContent = `${all.length} Fatura${rows.length < all.length ? ` · ${rows.length} Gösterilen` : ''}`;
}

function m2BosnaRaporKopyala() {
  const src = m2BosnaAktifRapor();
  if (!src) return null;
  if (m2.bosnaRapor !== src) m2.bosnaRapor = JSON.parse(JSON.stringify(src));
  if (!Array.isArray(m2.bosnaRapor.faturalar)) m2.bosnaRapor.faturalar = [];
  if (!Array.isArray(m2.bosnaRapor.aylar)) m2.bosnaRapor.aylar = [];
  return m2.bosnaRapor;
}

function m2BosnaFaturaFormOku() {
  const rapor = m2BosnaRaporKopyala();
  if (!rapor) return null;
  document.querySelectorAll('#m2-ba-fatura-body [data-fi]').forEach(el => {
    const i = Number(el.dataset.fi);
    const f = rapor.faturalar[i];
    if (!f) return;
    const alan = el.dataset.alan;
    if (alan === 'fatura_no') f.fatura_no = el.value.trim();
    else if (alan === 'datum') {
      f.datum = el.value || '';
      f.donem = f.datum ? String(f.datum).slice(0, 7) : f.donem;
      f.tarih_kaynak = 'datum';
    } else if (alan === 'neto_bam') {
      f.neto_bam = Math.round(m2SayiOku(el.value) * 100) / 100;
      f.neto_eur = Math.round((f.neto_bam / 1.95583) * 100) / 100;
    } else if (alan === 'tip') f.tip = el.value;
  });
  return rapor;
}

function m2BosnaFaturaDuzenleAc() {
  m2BosnaRaporKopyala();
  m2.bosnaFaturaDuzenle = true;
  m2.bosnaFaturaAcik = true;
  m2.bosnaFaturaPanelAcik = true;
  m2Render();
}

function m2BosnaFaturaDuzenleBitir() {
  m2BosnaFaturaFormOku();
  m2.bosnaFaturaDuzenle = false;
  m2Render();
}

function m2BosnaFaturaSatirEkle() {
  const rapor = m2BosnaFaturaFormOku();
  if (!rapor) return;
  rapor.faturalar.push({
    fatura_no: '',
    datum: `${m2.bosnaYil}-01-01`,
    donem: `${m2.bosnaYil}-01`,
    neto_bam: 0,
    neto_eur: 0,
    tip: 'Taxes',
    tarih_kaynak: 'datum',
  });
  m2.bosnaFaturaDuzenle = true;
  m2.bosnaFaturaAcik = true;
  m2.bosnaFaturaPanelAcik = true;
  m2Render();
}

function m2BosnaFaturaSatirSil(i) {
  const rapor = m2BosnaFaturaFormOku();
  if (!rapor || !rapor.faturalar[i]) return;
  rapor.faturalar.splice(i, 1);
  m2Render();
}

function m2SayiOku(v) {
  let s = String(v == null ? '' : v).trim().replace(/\s/g, '');
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function m2BosnaTabloDuzenleAc() {
  m2BosnaRaporKopyala();
  m2.bosnaTabloDuzenle = true;
  m2Render();
}

function m2BosnaAyHesap(a) {
  if (!a) return;
  const tutar = (k) => Number((a[k] || {}).tutar || 0);
  const bam = (k) => m2BamDeger(a[k] || {});
  a.lojistik = Math.round((tutar('inbound') + tutar('outbound') + tutar('storage') + tutar('transport')) * 100) / 100;
  a.lojistik_bam = Math.round((bam('inbound') + bam('outbound') + bam('storage') + bam('transport')) * 100) / 100;
  a.genel = Math.round((a.lojistik + tutar('taxes')) * 100) / 100;
  a.genel_bam = Math.round((a.lojistik_bam + bam('taxes')) * 100) / 100;
  if (a.storage) a.storage.miktar_palet = m2KoliPalet(a.storage.miktar);
}

function m2BosnaAyBul(ay) {
  const rapor = m2BosnaRaporKopyala();
  let a = (rapor.aylar || []).find(x => x.ay === ay);
  if (!a) {
    const z = { miktar: 0, tutar: 0, tutar_bam: 0 };
    a = {
      ay, inbound: { ...z }, outbound: { ...z }, storage: { ...z },
      transport: { ...z }, taxes: { ...z }, rotalar: [],
      lojistik: 0, genel: 0, lojistik_bam: 0, genel_bam: 0, ciro_eur: 0,
    };
    rapor.aylar.push(a);
  }
  return a;
}

function m2BosnaTabloDuzenleBitir() {
  const rapor = m2BosnaRaporKopyala();
  if (!rapor) { m2.bosnaTabloDuzenle = false; m2Render(); return; }
  const dokunan = new Set();
  const ciroMap = {};
  document.querySelectorAll('#m2-body .m2-ba-edit[data-ay]').forEach(el => {
    const ay = el.dataset.ay;
    const kod = el.dataset.kod;
    const alan = el.dataset.alan;
    const n = m2SayiOku(el.value);
    const a = m2BosnaAyBul(ay);
    if (kod === 'ciro') {
      a.ciro_eur = Math.round(n * 100) / 100;
      ciroMap[ay] = a.ciro_eur;
      dokunan.add(ay);
      return;
    }
    if (!a[kod]) a[kod] = { miktar: 0, tutar: 0, tutar_bam: 0 };
    if (alan === 'miktar') a[kod].miktar = n;
    else if (alan === 'tutar') {
      a[kod].tutar = Math.round(n * 100) / 100;
      a[kod].tutar_bam = Math.round(a[kod].tutar * 1.95583 * 100) / 100;
    } else if (alan === 'tutar_bam') {
      a[kod].tutar_bam = Math.round(n * 100) / 100;
      a[kod].tutar = Math.round((a[kod].tutar_bam / 1.95583) * 100) / 100;
    }
    dokunan.add(ay);
  });
  dokunan.forEach(ay => m2BosnaAyHesap(m2BosnaAyBul(ay)));
  const yil = String(m2.bosnaYil || '');
  (rapor.aylar || []).forEach(a => {
    if (String(a.ay || '').startsWith(yil) && ciroMap[a.ay] === undefined) {
      ciroMap[a.ay] = Number(a.ciro_eur || 0);
    }
  });
  if (Object.keys(ciroMap).length) {
    fetch('/api/maliyet/bosna/ciro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aylar: ciroMap }),
    }).catch(() => {});
  }
  if (m2.bosnaKayit && Array.isArray(m2.bosnaKayit.aylar)) {
    m2.bosnaKayit.aylar.forEach(a => {
      if (ciroMap[a.ay] !== undefined) a.ciro_eur = ciroMap[a.ay];
    });
  }
  m2.bosnaTabloDuzenle = false;
  m2Render();
}

function m2BosnaOranFmt(loj, ciro) {
  if (!(Number(ciro) > 0)) return '—';
  const pct = Number(loj) / Number(ciro) * 100;
  return `${pct.toFixed(2).replace('.', ',')}%`;
}

function m2BosnaCiroCanli() {
  const rapor = m2.bosnaRapor || m2.bosnaKayit;
  if (!rapor) return;
  const yil = String(m2.bosnaYil || '');
  const by = {};
  (rapor.aylar || []).forEach(a => { if (String(a.ay || '').startsWith(yil)) by[a.ay] = a; });
  let yilCiro = 0;
  let yilLoj = 0;
  document.querySelectorAll('#m2-body .m2-ba-edit[data-kod="ciro"]').forEach(el => {
    const ay = el.dataset.ay;
    const ciro = m2SayiOku(el.value);
    const loj = Number((by[ay] || {}).lojistik || 0);
    yilCiro += ciro;
    yilLoj += loj;
    const cell = document.querySelector(`#m2-body tr.oran [data-oran-ay="${ay}"]`);
    if (cell) cell.textContent = m2BosnaOranFmt(loj, ciro);
  });
  const totCiro = document.querySelector('#m2-body tr.ciro [data-ciro-yil]');
  if (totCiro) totCiro.textContent = yilCiro ? m2Eur2(yilCiro) : '—';
  const totOran = document.querySelector('#m2-body tr.oran [data-oran-ay="yil"]');
  if (totOran) totOran.textContent = m2BosnaOranFmt(yilLoj, yilCiro);
}

async function m2BosnaFaturaIndir() {
  const rapor = m2BosnaAktifRapor();
  const rows = m2BosnaFaturaKayitlari();
  if (!rapor || !rows.length) return alert('İndirilecek Fatura Listesi Yok.');
  const btn = document.querySelectorAll('[data-ba-inv]');
  btn.forEach(b => { b.disabled = true; b.dataset.label = b.innerHTML; b.innerHTML = 'İndiriliyor…'; });
  try {
    const res = await fetch('/api/maliyet/bosna/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yil: m2.bosnaYil, rapor, sadece: 'faturalar', ...m2ExcelDonemPayload(m2.bosnaYil) }),
    });
    if (!res.ok) {
      let msg = 'Excel Oluşturulamadı';
      try { msg = (await res.json()).error || msg; } catch (e) {}
      return alert(msg);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bosna_invoices_${m2.bosnaYil}${m2.bosnaOnizleme ? '_onizleme' : ''}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) {
    alert(e.message || 'Excel İndirme Başarısız');
  } finally {
    btn.forEach(b => { b.disabled = false; if (b.dataset.label) b.innerHTML = b.dataset.label; });
  }
}

function m2UlkeTabloAktif() {
  return m2.ulkeTablolar[m2.ulke] || null;
}

function m2UlkeTabloYillar() {
  const y = m2.ulkeTabloYil || (m2.start || '').slice(0, 4) || String(new Date().getFullYear());
  const set = new Set([y, (m2.start || '').slice(0, 4), String(new Date().getFullYear())].filter(Boolean));
  const rapor = m2UlkeTabloAktif();
  (rapor?.aylar || []).forEach(a => { if (a.ay) set.add(String(a.ay).slice(0, 4)); });
  return [...set].sort();
}

function m2UlkeTabloDuzenleAc() {
  m2.ulkeTabloDuzenle = true;
  m2Render();
}

function m2UlkeCiroCanli() {
  const rapor = m2UlkeTabloAktif();
  if (!rapor) return;
  const items = rapor.schema?.items || [];
  const yil = String(m2.ulkeTabloYil || '');
  const by = {};
  (rapor.aylar || []).forEach(a => { if (String(a.ay || '').startsWith(yil)) by[a.ay] = a; });
  let yilCiro = 0;
  let yilLoj = 0;
  const izin = new Set(m2DonemAylar());
  const aylar = Array.from({ length: 12 }, (_, i) => `${yil}-${String(i + 1).padStart(2, '0')}`)
    .filter(ay => izin.has(Number(ay.slice(5, 7))));
  aylar.forEach(ay => {
    const ciroEl = document.querySelector(`#m2-body .m2-ut-edit[data-ay="${ay}"][data-kod="ciro"]`);
    const ciro = ciroEl ? m2SayiOku(ciroEl.value) : Number((by[ay] || {}).ciro_eur || 0);
    const costInputs = document.querySelectorAll(`#m2-body .m2-ut-edit[data-ay="${ay}"][data-alan="tutar"]:not([data-kod="ciro"])`);
    let loj = 0;
    if (costInputs.length) costInputs.forEach(inp => { loj += m2SayiOku(inp.value); });
    else items.forEach(it => { loj += Number(((by[ay] || {})[it.kod] || {}).tutar || 0); });
    yilCiro += ciro;
    yilLoj += loj;
    const cell = document.querySelector(`#m2-body tr.oran [data-oran-ay="${ay}"]`);
    if (cell) cell.textContent = m2BosnaOranFmt(loj, ciro);
  });
  const totCiro = document.querySelector('#m2-body tr.ciro [data-ciro-yil]');
  if (totCiro) totCiro.textContent = yilCiro ? m2Eur2(yilCiro) : '—';
  const totOran = document.querySelector('#m2-body tr.oran [data-oran-ay="yil"]');
  if (totOran) totOran.textContent = m2BosnaOranFmt(yilLoj, yilCiro);
}

function m2UlkeTabloDuzenleBitir() {
  const rapor = m2UlkeTabloAktif();
  if (!rapor) { m2.ulkeTabloDuzenle = false; m2Render(); return; }
  const items = rapor.schema?.items || [];
  const by = {};
  (rapor.aylar || []).forEach(a => { by[a.ay] = JSON.parse(JSON.stringify(a)); });
  document.querySelectorAll('#m2-body .m2-ut-edit[data-ay]').forEach(el => {
    const ay = el.dataset.ay;
    const kod = el.dataset.kod;
    const alan = el.dataset.alan;
    const n = m2SayiOku(el.value);
    if (!by[ay]) {
      by[ay] = { ay, ciro_eur: 0, lojistik: 0 };
      items.forEach(it => { by[ay][it.kod] = { miktar: 0, tutar: 0 }; });
    }
    if (kod === 'ciro') {
      by[ay].ciro_eur = Math.round(n * 100) / 100;
      return;
    }
    if (!by[ay][kod]) by[ay][kod] = { miktar: 0, tutar: 0 };
    if (alan === 'miktar') by[ay][kod].miktar = n;
    else if (alan === 'tutar') by[ay][kod].tutar = Math.round(n * 100) / 100;
  });
  const aylar = Object.values(by).sort((a, b) => String(a.ay).localeCompare(String(b.ay)));
  aylar.forEach(a => {
    a.lojistik = items.reduce((s, it) => s + Number((a[it.kod] || {}).tutar || 0), 0);
  });
  fetch('/api/maliyet/tablo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ulke: m2.ulke, aylar }),
  }).then(r => r.json()).then(data => {
    if (data.success) m2.ulkeTablolar[m2.ulke] = data.rapor;
    m2.ulkeTabloDuzenle = false;
    return m2UlkeTabloYukle(m2.ulke, m2.ulkeTabloYil);
  }).catch(() => {
    m2.ulkeTablolar[m2.ulke] = { ...rapor, aylar };
    m2.ulkeTabloDuzenle = false;
  }).finally(() => m2Render());
}

function m2UlkeYorumlar(yilAylar, items, yilLoj, yilCiro) {
  const q = (n) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Number(n || 0));
  const top = (kod) => ({
    miktar: yilAylar.reduce((s, a) => s + Number((a[kod] || {}).miktar || 0), 0),
    tutar: yilAylar.reduce((s, a) => s + Number((a[kod] || {}).tutar || 0), 0),
  });
  const dolu = yilAylar.filter(a => Number(a.lojistik) > 0.005 || Number(a.ciro_eur) > 0.005
    || items.some(it => Number((a[it.kod] || {}).miktar || 0) || Number((a[it.kod] || {}).tutar || 0)));
  const list = [];
  const zirve = dolu.slice().sort((a, b) => Number(b.lojistik) - Number(a.lojistik))[0];
  if (zirve && Number(zirve.lojistik) > 0) {
    list.push({
      ikon: 'ti-flame',
      t: `${m2AyAdEn(zirve.ay)} En Yüksek Ay`,
      s: `${m2Eur2(zirve.lojistik)} Lojistik`,
    });
  }
  const tr = items.find(it => /transport|nakliye/i.test(it.kod + it.label)) || items.find(it => it.kod === 'transport');
  if (tr) {
    const t = top(tr.kod);
    const pay = yilLoj ? t.tutar / yilLoj * 100 : 0;
    list.push({
      ikon: 'ti-truck',
      t: `Nakliye Lojistiğin %${pay.toFixed(0)}’i`,
      s: `${q(t.miktar)} Miktar · Ort. ${m2Eur2(t.miktar ? t.tutar / t.miktar : 0)} / Birim`,
    });
  }
  if (yilCiro > 0 && yilLoj > 0) {
    list.push({
      ikon: 'ti-percentage',
      t: `Lojistik / Ciro ${m2BosnaOranFmt(yilLoj, yilCiro)}`,
      s: `${m2Eur2(yilLoj)} / ${m2Eur2(yilCiro)}`,
    });
  }
  if (dolu.length >= 2) {
    const son = dolu[dolu.length - 1], once = dolu[dolu.length - 2];
    const fark = Number(son.lojistik || 0) - Number(once.lojistik || 0);
    const pct = Number(once.lojistik) ? fark / Number(once.lojistik) * 100 : 0;
    list.push({
      ikon: fark >= 0 ? 'ti-trending-up' : 'ti-trending-down',
      t: `${m2AyAdEn(son.ay)} / ${m2AyAdEn(once.ay)}`,
      s: `${fark >= 0 ? '+' : ''}${m2Eur2(fark)} Lojistik (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`,
    });
  }
  const inIt = items.find(it => it.kod === 'inbound');
  const outIt = items.find(it => it.kod === 'outbound');
  if (inIt && outIt) {
    const inQ = top(inIt.kod).miktar, outQ = top(outIt.kod).miktar;
    if (Math.abs(inQ - outQ) > 0.5) {
      list.push({
        ikon: 'ti-arrows-left-right',
        t: 'Giriş ≠ Çıkış',
        s: inQ > outQ ? 'Giriş Çıkıştan Fazla' : 'Çıkış Girişten Fazla',
      });
      list.push({
        ikon: 'ti-arrows-exchange',
        t: `Fark ${q(Math.abs(inQ - outQ))}`,
        s: `Giriş ${q(inQ)} · Çıkış ${q(outQ)}`,
      });
    }
  }
  const st = items.find(it => it.kod === 'depolama')
    || items.find(it => it.kod === 'storage' || /stock|depolama/i.test(it.label));
  if (st) {
    const s = top(st.kod);
    if (s.miktar > 0 || s.tutar > 0) {
      while (list.length % 3 !== 2) list.push({ empty: true });
      list.push({
        ikon: 'ti-box',
        t: `Depolama ${m2Eur2(s.tutar)}`,
        s: `${q(s.miktar)} Miktar · ${m2Esc(st.label)}`,
      });
    }
  }
  if (!list.length) {
    list.push({
      ikon: 'ti-edit',
      t: 'Henüz Lojistik Verisi Yok',
      s: 'Aylık Miktar / Tutar Ve Ciroyu Tabloyu Düzenle İle Girin.',
    });
  }
  return list.slice(0, 12);
}

function m2UlkeAnalizHtml(yilAylar, items, yilLoj, yilCiro) {
  const yorum = m2UlkeYorumlar(yilAylar, items, yilLoj, yilCiro);
  return `
    <div class="m2-ba-analiz">
      <div class="m2-insights-3">${yorum.map(x => x.empty
        ? `<div class="m2-insight" style="visibility:hidden;pointer-events:none;box-shadow:none;border:0;background:transparent" aria-hidden="true"></div>`
        : `<div class="m2-insight">
          <i class="ti ${m2Esc(x.ikon)}" style="color:var(--m2);font-size:16px"></i>
          <div><b>${m2Esc(x.t)}</b><span>${m2Esc(x.s)}</span></div>
        </div>`).join('')}
      </div>
      <div class="m2-chart-row">
        <div class="m2-card"><div class="m2-h">Nakliye: Kamyon × Tutar</div><div class="m2-chart"><canvas id="m2-ut-truck"></canvas></div></div>
        <div class="m2-card"><div class="m2-h">Faturalanan Depolama (Palet-Eşd.)</div><div class="m2-chart" style="height:240px"><canvas id="m2-ut-storage"></canvas></div></div>
      </div>
    </div>`;
}

function m2UlkeCharts(yilAylar, items) {
  if (typeof Chart === 'undefined') return;
  const tip = { backgroundColor: 'rgba(26,25,22,.94)', padding: 10, cornerRadius: 10 };
  const euroTick = (v) => new Intl.NumberFormat('tr-TR', { notation: 'compact' }).format(v) + ' €';
  const labels = yilAylar.map(a => m2AyAdEn(a.ay));
  const tr = items.find(it => it.kod === 'transport' || /transport|nakliye/i.test(it.label));
  const st = items.find(it => it.kod === 'depolama')
    || items.find(it => it.kod === 'storage' || /stock|depolama/i.test(it.label));
  const truck = document.getElementById('m2-ut-truck');
  if (truck && tr) {
    const nak = yilAylar.map(a => Number((a[tr.kod] || {}).tutar || 0));
    m2.charts.push(new Chart(truck, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { type: 'bar', label: 'Kamyon', data: yilAylar.map(a => Number((a[tr.kod] || {}).miktar || 0)), backgroundColor: 'rgba(37,99,235,.22)', borderColor: '#2563EB', borderWidth: 1.5, borderRadius: 6, yAxisID: 'y', maxBarThickness: 36, order: 2 },
          { type: 'line', label: 'Nakliye €', data: nak, borderColor: '#0F766E', backgroundColor: 'rgba(15,118,110,.12)', tension: .35, fill: true, pointRadius: 4, pointBackgroundColor: '#0F766E', yAxisID: 'y1', order: 1 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, usePointStyle: true, font: { size: 10 } } },
          tooltip: { ...tip, callbacks: { label: c => c.dataset.yAxisID === 'y1' ? ` ${c.dataset.label}: ${m2Eur2(c.parsed.y)}` : ` ${c.dataset.label}: ${c.parsed.y}` } } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, border: { display: false }, grid: { color: '#EDE8DF' }, ticks: { precision: 0 }, title: { display: true, text: 'Miktar', font: { size: 10 } } },
          y1: { beginAtZero: true, position: 'right', border: { display: false }, grid: { drawOnChartArea: false }, ticks: { callback: euroTick }, title: { display: true, text: 'EUR', font: { size: 10 } } },
        },
      },
    }));
  }
  const stEl = document.getElementById('m2-ut-storage');
  if (stEl && st) {
    const qty = yilAylar.map(a => Number((a[st.kod] || {}).miktar || 0));
    // NL/GE zaten palet; BA koli→palet. Burada miktarı olduğu gibi göster.
    m2.charts.push(new Chart(stEl, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Faturalanan Depolama (Palet-Eşd.)', data: qty, backgroundColor: '#0891B2', borderRadius: 6, maxBarThickness: 36 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false },
          tooltip: { ...tip, callbacks: { label: c => ` ${qty[c.dataIndex]} · ${m2Eur2((yilAylar[c.dataIndex][st.kod] || {}).tutar || 0)}` } } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, border: { display: false }, grid: { color: '#EDE8DF' }, ticks: { precision: 0 }, title: { display: true, text: 'Palet-Eşd.', font: { size: 10 } } },
        },
      },
    }));
  }
}

function m2RenderUlkeTablo(body) {
  const ulke = m2.ulke;
  let rapor = m2UlkeTabloAktif();
  if (!rapor) {
    body.innerHTML = `<div class="m2-empty">Yükleniyor…</div>`;
    m2UlkeTabloYukle(ulke).finally(() => m2Render());
    return;
  }
  const yillar = m2UlkeTabloYillar();
  if (!m2.ulkeTabloYil || !yillar.includes(m2.ulkeTabloYil)) m2.ulkeTabloYil = yillar[yillar.length - 1];
  const schema = rapor.schema || { title: m2Label(ulke), subtitle: 'Lojistik Maliyet', items: [] };
  const items = schema.items || [];
  const yil = m2.ulkeTabloYil;
  const z = { miktar: 0, tutar: 0 };
  const yilAylarHepsi = Array.from({ length: 12 }, (_, i) => {
    const ay = `${yil}-${String(i + 1).padStart(2, '0')}`;
    const found = (rapor.aylar || []).find(a => a.ay === ay);
    if (found) return found;
    const empty = { ay, ciro_eur: 0, lojistik: 0 };
    items.forEach(it => { empty[it.kod] = { ...z }; });
    return empty;
  });
  const yilAylar = m2DonemFiltrele(yilAylarHepsi);
  const duzenle = m2.ulkeTabloDuzenle;
  const q = (n) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Number(n || 0));
  const inp = (ay, kod, alan, val) =>
    `<input class="m2-ba-edit m2-ut-edit" data-ay="${ay}" data-kod="${kod}" data-alan="${alan}" value="${m2Esc(val)}" oninput="m2UlkeCiroCanli()">`;
  const cell = (item, ay, kod) => {
    const zc = !Number(item?.miktar) && !Number(item?.tutar);
    if (duzenle) {
      return `<td class="num">${inp(ay, kod, 'miktar', Number(item?.miktar || 0))}</td>`
        + `<td class="num">${inp(ay, kod, 'tutar', Number(item?.tutar || 0).toFixed(2))}</td>`;
    }
    return `<td class="num${zc ? ' zero' : ''}">${q(item?.miktar)}</td>`
      + `<td class="num${zc ? ' zero' : ''}">${m2Eur2(item?.tutar)}</td>`;
  };
  const lojOf = (a) => items.filter(it => !it.skip_total).reduce((s, it) => s + Number((a[it.kod] || {}).tutar || 0), 0);
  yilAylar.forEach(a => { a.lojistik = lojOf(a); });
  const yilLoj = yilAylar.reduce((s, a) => s + Number(a.lojistik || 0), 0);
  const yilCiro = yilAylar.reduce((s, a) => s + Number(a.ciro_eur || 0), 0);
  const yilTop = (kod) => ({
    miktar: yilAylar.reduce((s, a) => s + Number((a[kod] || {}).miktar || 0), 0),
    tutar: yilAylar.reduce((s, a) => s + Number((a[kod] || {}).tutar || 0), 0),
  });
  const totPair = (eur) => `<td class="num"></td><td class="num">${m2Eur2(eur)}</td>`;
  const cellCiro = (a) => {
    const v = Number(a.ciro_eur || 0);
    if (duzenle) {
      return `<td class="num"></td><td class="num">${inp(a.ay, 'ciro', 'tutar', v.toFixed(2))}</td>`;
    }
    return `<td class="num"></td><td class="num${v ? '' : ' zero'}" style="font-style:italic">${v ? m2Eur2(v) : '—'}</td>`;
  };
  const cellOran = (loj, ciro, ayKey) =>
    `<td class="num"></td><td class="num" style="font-weight:800" data-oran-ay="${ayKey || ''}">${m2BosnaOranFmt(loj, ciro)}</td>`;

  const groups = [];
  let cur = null;
  items.forEach(it => {
    const g = it.group || '';
    if (!cur || cur.label !== g) {
      cur = { label: g, items: [] };
      groups.push(cur);
    }
    cur.items.push(it);
  });
  const itemRows = groups.map(g => {
    const head = g.label
      ? `<tr><td class="lab" colspan="${2 + yilAylar.length * 2}">${m2Esc(g.label)}</td></tr>`
      : '';
    const rows = g.items.map(it =>
      `<tr><td class="lab${g.label ? ' pad' : ''}">${m2Esc(it.label)}</td>`
      + yilAylar.map(a => cell(a[it.kod], a.ay, it.kod)).join('')
      + `<td class="num">${q(yilTop(it.kod).miktar)}</td>`
      + `<td class="num">${m2Eur2(yilTop(it.kod).tutar)}</td></tr>`
    ).join('');
    return head + rows;
  }).join('');

  const trIt = items.find(it => it.kod === 'transport' || /transport|nakliye/i.test(it.label));
  const stIt = items.find(it => it.kod === 'depolama')
    || items.find(it => it.kod === 'storage' || /stock|depolama/i.test(it.label));
  const trTop = trIt ? yilTop(trIt.kod) : { miktar: 0, tutar: 0 };
  const stTop = stIt ? yilTop(stIt.kod) : { miktar: 0, tutar: 0 };
  const mixKalemler = items.filter(it => !it.skip_total).map(it => ({
    kalem_kod: it.kod === 'inbound' ? 'pallet_in' : it.kod === 'outbound' ? 'pallet_out' : it.kod,
    kalem_ad: it.label,
    tutar_eur: yilTop(it.kod).tutar,
  })).filter(k => Number(k.tutar_eur) > 0.005);
  const itemOzet = items.filter(it => !it.skip_total).map(it => it.label.split('(')[0].trim()).join(' + ')
    || 'Giriş + Depolama + Çıkış + Nakliye';

  body.innerHTML = `<div class="m2-ba-en" lang="tr">
    <div class="m2-kpis">
      <div class="m2-kpi"><span>Lojistik</span><b>${m2KpiEur(yilLoj)}</b><small>${m2Esc(itemOzet)}</small></div>
      <div class="m2-kpi"><span>Depolama</span><b>${m2KpiEur(stTop.tutar)}</b><small>${q(stTop.miktar)} Miktar</small></div>
      <div class="m2-kpi"><span>Genel Toplam</span><b>${m2KpiEur(yilLoj)}</b><small>Lojistik · KDV Hariç</small></div>
      <div class="m2-kpi"><span>Nakliye</span><b>${q(trTop.miktar)}</b><small>Kamyon / Rota · ${m2Eur2(trTop.tutar)}</small></div>
    </div>
    ${m2MixBarHtml(mixKalemler, yilLoj)}
    <div class="m2-card">
      <div class="m2-ba-head">
        <div class="m2-ba-head-title">
          <div class="m2-kicker">${m2Esc(schema.title || m2Label(ulke))}</div>
          <div class="m2-h">Lojistik Maliyet · ${m2Esc(m2DonemBaslik(yil))}</div>
        </div>
        <div class="m2-ba-head-drop">${m2DropHtml('', 'inline')}</div>
        <div class="m2-ba-head-actions">
        <label class="m2-field" title="Yıl">
          <span>Yıl</span>
          <select class="m2-select" aria-label="Yıl" onchange="m2.ulkeTabloYil=this.value;m2UlkeTabloYukle('${ulke}',this.value).then(()=>m2Render())">${yillar.map(y => `<option ${y === yil ? 'selected' : ''}>${y}</option>`).join('')}</select>
        </label>
        ${m2DonemSelectHtml()}
        ${duzenle
          ? `<button class="m2-btn" type="button" onclick="m2UlkeTabloDuzenleBitir()">Tamam</button>
             <button class="m2-btn ghost" type="button" onclick="m2.ulkeTabloDuzenle=false;m2Render()">İptal</button>`
          : `<button class="m2-btn ghost" type="button" onclick="m2UlkeTabloDuzenleAc()">Tabloyu Düzenle</button>
             <button class="m2-btn" data-ut-xlsx type="button" onclick="m2UlkeExcelIndir()"><i class="ti ti-download"></i> Excel İndir</button>`}
        </div>
      </div>
      <div class="m2-ba" style="margin-top:14px">
        <table class="m2-ba-table">
          <thead>
            <tr><th rowspan="2">Kalem</th>${yilAylar.map(a => `<th colspan="2">${m2AyAdEn(a.ay)}</th>`).join('')}<th colspan="2">${m2Esc(m2DonemToplamEtiket(yil))}</th></tr>
            <tr>${yilAylar.map(() => '<th class="sub">Miktar</th><th class="sub">Tutar €</th>').join('')}<th class="sub">Miktar</th><th class="sub">Tutar €</th></tr>
          </thead>
          <tbody>
            ${itemRows}
            <tr class="tot"><td class="lab">Toplam Tutar</td>${yilAylar.map(a => totPair(a.lojistik)).join('')}${totPair(yilLoj)}</tr>
            <tr class="ciro"><td class="lab">Ciro</td>${yilAylar.map(a => cellCiro(a)).join('')}<td class="num"></td><td class="num" style="font-style:italic;font-weight:800" data-ciro-yil="1">${yilCiro ? m2Eur2(yilCiro) : '—'}</td></tr>
            <tr class="oran"><td class="lab">Lojistik / Ciro</td>${yilAylar.map(a => cellOran(a.lojistik, a.ciro_eur, a.ay)).join('')}${cellOran(yilLoj, yilCiro, 'yil')}</tr>
          </tbody>
        </table>
      </div>
    </div>
    ${m2UlkeAnalizHtml(yilAylar, items, yilLoj, yilCiro)}
    <div id="m2-inbox">${m2.inboxMsg ? `<div class="m2-ok">${m2Esc(m2.inboxMsg)}</div>` : ''}</div>
    <div id="m2-drafts" style="margin-top:14px"></div>
  </div>`;
  m2RenderDrafts();
  m2UlkeCharts(yilAylar, items);
}

async function m2UlkeExcelIndir() {
  const rapor = m2UlkeTabloAktif();
  if (!rapor) return alert('İndirilecek Rapor Yok.');
  const btn = document.querySelectorAll('[data-ut-xlsx]');
  btn.forEach(b => { b.disabled = true; b.dataset.label = b.innerHTML; b.innerHTML = 'İndiriliyor…'; });
  try {
    const res = await fetch('/api/maliyet/tablo/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ulke: m2.ulke, yil: m2.ulkeTabloYil, rapor,
        ...m2ExcelDonemPayload(m2.ulkeTabloYil),
      }),
    });
    if (!res.ok) {
      let msg = 'Excel Oluşturulamadı';
      try { msg = (await res.json()).error || msg; } catch (e) {}
      return alert(msg);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${m2.ulke}_lojistik_${m2.ulkeTabloYil}${m2DonemSlug()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) {
    alert(e.message || 'Excel İndirme Başarısız');
  } finally {
    btn.forEach(b => { b.disabled = false; if (b.dataset.label) b.innerHTML = b.dataset.label; });
  }
}

function m2BosnaYillar(rapor) {
  const y = [...new Set([...(rapor?.yillar || []), m2.bosnaYil, (m2.start || '').slice(0, 4)].filter(Boolean))];
  y.sort();
  return y.length ? y : [String(new Date().getFullYear())];
}

function m2RenderBosna(body) {
  const rapor = m2BosnaAktifRapor();
  const yillar = m2BosnaYillar(rapor);
  if (!m2.bosnaYil || !yillar.includes(m2.bosnaYil)) m2.bosnaYil = yillar[yillar.length - 1];
  const aylar = (rapor?.aylar || []).filter(a => String(a.ay).startsWith(m2.bosnaYil));
  if (!aylar.length) {
    body.innerHTML = `<div class="m2-ba-en" lang="tr"><div class="m2-card"><div class="m2-empty">
      <i class="ti ti-chart-dots-3"></i>
      <div class="m2-h">Bosna Raporu Yok</div>
      ${m2DropHtml('', false)}
    </div></div></div>`;
    return;
  }
  const bos = { miktar: 0, tutar: 0, tutar_bam: 0 };
  const yilAylarHepsi = Array.from({ length: 12 }, (_, i) => {
    const ay = `${m2.bosnaYil}-${String(i + 1).padStart(2, '0')}`;
    return aylar.find(a => a.ay === ay) || {
      ay, inbound: { ...bos }, outbound: { ...bos }, storage: { ...bos },
      transport: { ...bos }, taxes: { ...bos }, rotalar: [], lojistik: 0, genel: 0,
      lojistik_bam: 0, genel_bam: 0, ciro_eur: 0,
    };
  });
  const yilAylar = m2DonemFiltrele(yilAylarHepsi);
  const q = (n) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Number(n || 0));
  const duzenle = m2.bosnaTabloDuzenle;
  const inp = (ay, kod, alan, val, extra) => `<input class="m2-ba-edit" data-ay="${ay}" data-kod="${kod}" data-alan="${alan}" value="${m2Esc(val)}" ${extra || ''}>`;
  const cell = (item, ay, kod, rota) => {
    const z = !Number(item?.miktar) && !Number(item?.tutar);
    const mark = m2BosnaHucreSinif(ay, kod, rota);
    if (duzenle && !rota) {
      return `<td class="num">${inp(ay, kod, 'miktar', Number(item?.miktar || 0))}</td><td class="num">${inp(ay, kod, 'tutar', Number(item?.tutar || 0).toFixed(2))}</td><td class="num">${inp(ay, kod, 'tutar_bam', m2BamDeger(item).toFixed(2))}</td>`;
    }
    return `<td class="num${z ? ' zero' : ''}${mark}">${q(item?.miktar)}</td><td class="num${z ? ' zero' : ''}${mark}">${m2Eur2(item?.tutar)}</td><td class="num${z ? ' zero' : ''}${mark}">${m2Bam2(m2BamDeger(item))}</td>`;
  };
  const storageQty = (item) => {
    const koli = Number(item?.miktar || 0);
    if (!koli) return q(0);
    const palet = item?.miktar_palet != null ? Number(item.miktar_palet) : m2KoliPalet(koli);
    return `${q(koli)} (${q(palet)})`;
  };
  const cellStorage = (item, ay) => {
    const z = !Number(item?.miktar) && !Number(item?.tutar);
    const mark = m2BosnaHucreSinif(ay, 'storage');
    if (duzenle) {
      return `<td class="num">${inp(ay, 'storage', 'miktar', Number(item?.miktar || 0))}</td><td class="num">${inp(ay, 'storage', 'tutar', Number(item?.tutar || 0).toFixed(2))}</td><td class="num">${inp(ay, 'storage', 'tutar_bam', m2BamDeger(item).toFixed(2))}</td>`;
    }
    return `<td class="num${z ? ' zero' : ''}${mark}" style="white-space:nowrap">${storageQty(item)}</td><td class="num${z ? ' zero' : ''}${mark}">${m2Eur2(item?.tutar)}</td><td class="num${z ? ' zero' : ''}${mark}">${m2Bam2(m2BamDeger(item))}</td>`;
  };
  const yilTop = (key) => ({
    miktar: yilAylar.reduce((s, a) => s + Number(a[key]?.miktar || 0), 0),
    tutar: yilAylar.reduce((s, a) => s + Number(a[key]?.tutar || 0), 0),
    tutar_bam: yilAylar.reduce((s, a) => s + m2BamDeger(a[key]), 0),
  });
  const yilLoj = yilAylar.reduce((s, a) => s + Number(a.lojistik || 0), 0);
  const yilGen = yilAylar.reduce((s, a) => s + Number(a.genel || 0), 0);
  const yilLojBam = yilAylar.reduce((s, a) => s + Number(a.lojistik_bam != null ? a.lojistik_bam : m2BamDeger({ tutar: a.lojistik })), 0);
  const yilGenBam = yilAylar.reduce((s, a) => s + Number(a.genel_bam != null ? a.genel_bam : m2BamDeger({ tutar: a.genel })), 0);
  const totCell = (key) => {
    const x = yilTop(key);
    return `<td class="num">${q(x.miktar)}</td><td class="num">${m2Eur2(x.tutar)}</td><td class="num">${m2Bam2(x.tutar_bam)}</td>`;
  };
  const totStorage = () => {
    const x = yilTop('storage');
    return `<td class="num" style="white-space:nowrap">${storageQty({ miktar: x.miktar })}</td><td class="num">${m2Eur2(x.tutar)}</td><td class="num">${m2Bam2(x.tutar_bam)}</td>`;
  };
  const rotaList = m2BosnaRotaListesi(yilAylar, 'miktar');
  const totRota = (rota) => {
    const miktar = yilAylar.reduce((s, a) => s + Number(m2BosnaRotaAy(a, rota).miktar || 0), 0);
    const tutar = yilAylar.reduce((s, a) => s + Number(m2BosnaRotaAy(a, rota).tutar || 0), 0);
    const tutarBam = yilAylar.reduce((s, a) => s + m2BamDeger(m2BosnaRotaAy(a, rota)), 0);
    const birim = miktar ? tutar / miktar : 0;
    return `<td class="num">${q(miktar)}</td><td class="num">${m2Eur2(tutar)}<div class="m2-ba-birim">${m2Eur2(birim)}/Sefer</div></td><td class="num">${m2Bam2(tutarBam)}</td>`;
  };
  const totPair = (eur, bam) => `<td class="num"></td><td class="num">${m2Eur2(eur)}</td><td class="num">${m2Bam2(bam)}</td>`;
  const yilCiro = yilAylar.reduce((s, a) => s + Number(a.ciro_eur || 0), 0);
  const cellCiro = (a) => {
    const v = Number(a.ciro_eur || 0);
    if (duzenle) {
      return `<td class="num"></td><td class="num">${inp(a.ay, 'ciro', 'tutar', v.toFixed(2), 'oninput="m2BosnaCiroCanli()"')}</td><td class="num"></td>`;
    }
    return `<td class="num"></td><td class="num${v ? '' : ' zero'}" style="font-style:italic">${v ? m2Eur2(v) : '—'}</td><td class="num"></td>`;
  };
  const cellOran = (loj, ciro, ayKey) => {
    const t = m2BosnaOranFmt(loj, ciro);
    return `<td class="num"></td><td class="num" style="font-weight:800" data-oran-ay="${ayKey || ''}">${t}</td><td class="num"></td>`;
  };
  const rotaRows = (!duzenle && m2.bosnaRotalarAcik) ? rotaList.map(rt => `
            <tr class="rota"><td class="lab rota">${m2Esc(rt.rota)}<div class="m2-ba-birim">${m2Eur2(rt.birim)}/Sefer</div></td>${yilAylar.map(a => cell(m2BosnaRotaAy(a, rt.rota), a.ay, 'transport', rt.rota)).join('')}${totRota(rt.rota)}</tr>`).join('') : '';
  const farkVar = !!(m2.bosnaAktarim && ((m2.bosnaAktarim.ay_fark || []).length || (m2.bosnaAktarim.rota_fark || []).length || m2.bosnaAktarim.yeni_sayisi || m2.bosnaAktarim.guncelle_sayisi));
  const ledgerMix = m2UlkeKalemOzet('ba');
  const mixKalemler = ledgerMix.kalemler.length ? ledgerMix.kalemler : [
    { kalem_kod: 'pallet_in', kalem_ad: 'Giriş', tutar_eur: yilTop('inbound').tutar },
    { kalem_kod: 'storage', kalem_ad: 'Depolama', tutar_eur: yilTop('storage').tutar },
    { kalem_kod: 'pallet_out', kalem_ad: 'Çıkış', tutar_eur: yilTop('outbound').tutar },
    { kalem_kod: 'transport', kalem_ad: 'Nakliye', tutar_eur: yilTop('transport').tutar },
    { kalem_kod: 'taxes', kalem_ad: 'Vergi / Gümrük', tutar_eur: yilTop('taxes').tutar },
  ].filter(k => Number(k.tutar_eur) > 0.005);
  const mixToplam = ledgerMix.kalemler.length ? ledgerMix.toplam : yilGen;
  body.innerHTML = `<div class="m2-ba-en" lang="tr">
    <div class="m2-kpis">
      <div class="m2-kpi"><span>Lojistik</span><b>${m2KpiEur(yilLoj)}</b><small>Giriş + Depolama + Çıkış + Nakliye</small></div>
      <div class="m2-kpi"><span>Vergi</span><b>${m2KpiEur(yilTop('taxes').tutar)}</b><small>${q(yilTop('taxes').miktar)} Gümrük / Faiz Faturası</small></div>
      <div class="m2-kpi"><span>Genel Toplam</span><b>${m2KpiEur(yilGen)}</b><small>Lojistik + Vergi · KDV Hariç</small></div>
      <div class="m2-kpi"><span>Nakliye</span><b>${q(yilTop('transport').miktar)}</b><small>Kamyon / Rota · ${m2Eur2(yilTop('transport').tutar)}</small></div>
    </div>
    ${m2MixBarHtml(mixKalemler, mixToplam)}
    ${m2BosnaDpuKutusu()}
    ${m2BosnaAktarimKutusu()}
    ${m2.bosnaOnizleme && !(m2.bosnaAktarim && m2.bosnaAktarim.kayitli_sayisi) ? `<div class="m2-ok">Önizleme · Henüz Kaydedilmedi. ${m2.drafts.filter(d => d.kind === 'bosna').length} Fatura Taslağı Hazır — Kayıt İsteğe Bağlı.
      <button class="m2-btn ghost" data-ba-xlsx style="margin-left:10px" type="button" onclick="m2BosnaExcelIndir()"><i class="ti ti-download"></i> Excel İndir</button>
      <button class="m2-btn" style="margin-left:8px" type="button" onclick="m2DraftHepsiniKaydet()">Kayıtlara Yaz</button></div>` : ''}
    <div class="m2-card">
      <div class="m2-ba-head">
        <div class="m2-ba-head-title">
          <div class="m2-kicker">Bosna Hersek</div>
          <div class="m2-h">Lojistik Maliyet · ${m2Esc(m2DonemBaslik(m2.bosnaYil))}</div>
        </div>
        <div class="m2-ba-head-drop">${m2DropHtml('', 'inline')}</div>
        <div class="m2-ba-head-actions">
        <label class="m2-field" title="Yıl">
          <span>Yıl</span>
          <select class="m2-select" aria-label="Yıl" onchange="m2.bosnaYil=this.value;m2Render()">${yillar.map(y => `<option ${y === m2.bosnaYil ? 'selected' : ''}>${y}</option>`).join('')}</select>
        </label>
        ${m2DonemSelectHtml()}
        ${duzenle
          ? `<button class="m2-btn" type="button" onclick="m2BosnaTabloDuzenleBitir()">Tamam</button>
             <button class="m2-btn ghost" type="button" onclick="m2.bosnaTabloDuzenle=false;m2Render()">İptal</button>`
          : `<button class="m2-btn ghost" type="button" onclick="m2BosnaTabloDuzenleAc()">Tabloyu Düzenle</button>
             <button class="m2-btn" data-ba-xlsx type="button" onclick="m2BosnaExcelIndir()"><i class="ti ti-download"></i> Excel İndir</button>`}
        </div>
      </div>
      <div class="m2-ba" style="margin-top:14px">
        <table class="m2-ba-table">
          <thead>
            <tr><th rowspan="2">Kalem</th>${yilAylar.map(a => `<th colspan="3">${m2AyAdEn(a.ay)}</th>`).join('')}<th colspan="3">${m2Esc(m2DonemToplamEtiket(m2.bosnaYil))}</th></tr>
            <tr>${yilAylar.map(() => '<th class="sub">Miktar</th><th class="sub">Tutar €</th><th class="sub">Tutar BAM</th>').join('')}<th class="sub">Miktar</th><th class="sub">Tutar €</th><th class="sub">Tutar BAM</th></tr>
          </thead>
          <tbody>
            <tr><td class="lab" colspan="${4 + yilAylar.length * 3}">Depo</td></tr>
            <tr><td class="lab pad">Giriş</td>${yilAylar.map(a => cell(a.inbound, a.ay, 'inbound')).join('')}${totCell('inbound')}</tr>
            <tr><td class="lab pad">Depolama</td>${yilAylar.map(a => cellStorage(a.storage, a.ay)).join('')}${totStorage()}</tr>
            <tr><td class="lab pad">Çıkış</td>${yilAylar.map(a => cell(a.outbound, a.ay, 'outbound')).join('')}${totCell('outbound')}</tr>
            <tr><td class="lab">${duzenle ? '' : `<button type="button" class="m2-ba-caret" onclick="m2BosnaRotaToggle()" title="Rota Kırılımı" aria-expanded="${m2.bosnaRotalarAcik ? 'true' : 'false'}">${m2.bosnaRotalarAcik ? '▾' : '▸'}</button>`}Nakliye (Kamyon)${rotaList.length ? ` <span style="font-weight:600;color:var(--m2-muted);font-size:11px">${rotaList.length} Rota</span>` : ''}</td>${yilAylar.map(a => cell(a.transport, a.ay, 'transport')).join('')}${totCell('transport')}</tr>
            ${rotaRows}
            <tr class="tot"><td class="lab">Toplam Tutar</td>${yilAylar.map(a => totPair(a.lojistik, a.lojistik_bam != null ? a.lojistik_bam : m2BamDeger({ tutar: a.lojistik }))).join('')}${totPair(yilLoj, yilLojBam)}</tr>
            <tr><td class="lab">Vergi</td>${yilAylar.map(a => cell(a.taxes, a.ay, 'taxes')).join('')}${totCell('taxes')}</tr>
            <tr class="grand"><td class="lab">Genel Toplam</td>${yilAylar.map(a => totPair(a.genel, a.genel_bam != null ? a.genel_bam : m2BamDeger({ tutar: a.genel }))).join('')}${totPair(yilGen, yilGenBam)}</tr>
            <tr class="ciro"><td class="lab">Ciro</td>${yilAylar.map(a => cellCiro(a)).join('')}<td class="num"></td><td class="num" style="font-style:italic;font-weight:800" data-ciro-yil="1">${yilCiro ? m2Eur2(yilCiro) : '—'}</td><td class="num"></td></tr>
            <tr class="oran"><td class="lab">Lojistik / Ciro</td>${yilAylar.map(a => cellOran(a.lojistik, a.ciro_eur, a.ay)).join('')}${cellOran(yilLoj, yilCiro, 'yil')}</tr>
          </tbody>
        </table>
      </div>
      ${farkVar ? `<div class="m2-ba-leg"><span><i style="background:#ECFDF5;border:1px solid #A7F3D0"></i>Yeşil: Yeni Eklenen</span><span><i style="background:#FFF7ED;border:1px solid #FDBA74"></i>Turuncu: Değişen (Güncellemek İçin Onaylayın)</span><span>Beyaz: Değişmeyen</span></div>` : ''}
    </div>
    ${m2BosnaFaturaHtml()}
    ${m2BosnaAnalizHtml(yilAylar, yilLoj, yilGen, yilTop)}
    </div>`;
  m2BosnaCharts(yilAylar.filter(a => Number(a.genel) || Number(a.lojistik) || Number(a.inbound?.miktar) || Number(a.transport?.miktar)));
}

function m2BosnaAnalizHtml(yilAylar, yilLoj, yilGen, yilTop) {
  const dolu = yilAylar.filter(a => Number(a.genel) || Number(a.lojistik) || Number(a.inbound?.miktar) || Number(a.transport?.miktar));
  const yorum = m2BosnaYorumlar(dolu, yilLoj, yilGen, yilTop, yilAylar);
  if (!yorum.length && !dolu.length) return '';
  return `
    <div class="m2-ba-analiz">
      <div class="m2-insights-3">${yorum.map(x => x.empty
        ? `<div class="m2-insight" style="visibility:hidden;pointer-events:none;box-shadow:none;border:0;background:transparent" aria-hidden="true"></div>`
        : `<div class="m2-insight">
          <i class="ti ${m2Esc(x.ikon)}" style="color:var(--m2);font-size:16px"></i>
          <div><b>${m2Esc(x.t)}</b><span>${m2Esc(x.s)}</span></div>
        </div>`).join('')}
      </div>
      <div class="m2-chart-row">
        <div class="m2-card"><div class="m2-h">Nakliye: Kamyon × Tutar</div><div class="m2-chart"><canvas id="m2-ba-truck"></canvas></div></div>
        <div class="m2-card"><div class="m2-h">Faturalanan Depolama (Palet-Eşd.)</div><div class="m2-chart" style="height:240px"><canvas id="m2-ba-storage"></canvas></div></div>
      </div>
    </div>`;
}

function m2BosnaRotaGrafikHtml(yilAylar) {
  const rotaList = m2BosnaRotaListesi(yilAylar);
  if (!rotaList.length) return '';
  return `
      <div class="m2-chart-row">
        <div class="m2-card"><div class="m2-h">Rotalar: Aylık Tutar</div><div class="m2-chart rota"><canvas id="m2-ba-rota-stack"></canvas></div></div>
        <div class="m2-card"><div class="m2-h">Rota Payı</div><div class="m2-chart rota"><canvas id="m2-ba-rota-pie"></canvas></div></div>
      </div>
      <div class="m2-chart-row">
        <div class="m2-card">
          <div class="m2-h">Sıralama: Sefer</div>
          <div class="m2-chart" style="height:${Math.max(220, rotaList.length * 42)}px"><canvas id="m2-ba-rota-bar"></canvas></div>
        </div>
        <div class="m2-card">
          <div class="m2-h">Sıralama: Birim Tutar</div>
          <div class="m2-chart" style="height:${Math.max(220, rotaList.length * 42)}px"><canvas id="m2-ba-rota-birim"></canvas></div>
        </div>
      </div>`;
}

function m2BosnaYorumlar(dolu, yilLoj, yilGen, yilTop, yilAylar) {
  const q = (n) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Number(n || 0));
  const list = [];
  const zirve = dolu.slice().sort((a, b) => Number(b.lojistik) - Number(a.lojistik))[0];
  if (zirve && Number(zirve.lojistik) > 0) list.push({
    ikon: 'ti-flame',
    t: `${m2AyAdEn(zirve.ay)} En Yüksek Ay`,
    s: `${m2Eur2(zirve.lojistik)} Lojistik`,
  });
  const kamyon = Number(yilTop('transport').miktar);
  const nak = Number(yilTop('transport').tutar);
  const lojPay = yilLoj ? nak / yilLoj * 100 : 0;
  list.push({
    ikon: 'ti-truck',
    t: `Nakliye Lojistiğin %${lojPay.toFixed(0)}’i`,
    s: `${q(kamyon)} Kamyon · Ort. ${m2Eur2(kamyon ? nak / kamyon : 0)} / Sefer`,
  });
  const rotaKaynak = yilAylar && yilAylar.length ? yilAylar : dolu;
  const enSefer = m2BosnaRotaListesi(rotaKaynak, 'miktar')[0];
  const enPahali = m2BosnaRotaListesi(rotaKaynak, 'tutar')[0];
  if (enSefer) {
    list.push({
      ikon: 'ti-route',
      t: m2BosnaRotaKisa(enSefer.rota),
      s: `En Çok Sefer · ${q(enSefer.miktar)} Kamyon · ${m2Eur2(enSefer.tutar)}`,
    });
  }
  if (enPahali && (!enSefer || enPahali.rota !== enSefer.rota)) {
    list.push({
      ikon: 'ti-coin',
      t: m2BosnaRotaKisa(enPahali.rota),
      s: `En Yüksek Tutar · ${q(enPahali.miktar)} Sefer · ${m2Eur2(enPahali.tutar)}`,
    });
  }
  const enBirim = m2BosnaRotaListesi(rotaKaynak, 'birim')[0];
  if (enBirim && enBirim.birim) {
    list.push({
      ikon: 'ti-calculator',
      t: m2BosnaRotaKisa(enBirim.rota),
      s: `En Yüksek Birim Tutar · ${m2Eur2(enBirim.birim)} / Sefer · ${q(enBirim.miktar)} Kamyon`,
    });
  }
  if (dolu.length >= 2) {
    const son = dolu[dolu.length - 1], once = dolu[dolu.length - 2];
    const fark = Number(son.lojistik || 0) - Number(once.lojistik || 0);
    const pct = Number(once.lojistik) ? fark / Number(once.lojistik) * 100 : 0;
    list.push({
      ikon: fark >= 0 ? 'ti-trending-up' : 'ti-trending-down',
      t: `${m2AyAdEn(son.ay)} / ${m2AyAdEn(once.ay)}`,
      s: `${fark >= 0 ? '+' : ''}${m2Eur2(fark)} Lojistik (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`,
    });
  }
  const inQ = Number(yilTop('inbound').miktar), outQ = Number(yilTop('outbound').miktar);
  if (Math.abs(inQ - outQ) > 0.5) {
    const fark = Math.abs(inQ - outQ);
    list.push({
      ikon: 'ti-arrows-left-right',
      t: 'Giriş ≠ Çıkış',
      s: inQ > outQ ? 'Giriş Çıkıştan Fazla' : 'Çıkış Girişten Fazla',
    });
    list.push({
      ikon: 'ti-arrows-exchange',
      t: `Fark ${q(fark)} Palet`,
      s: `Giriş ${q(inQ)} Palet · Çıkış ${q(outQ)} Palet`,
    });
  }
  const koli = Number(yilTop('storage').miktar);
  const palet = m2KoliPalet(koli);
  if (koli > 0 || Number(yilTop('storage').tutar) > 0) {
    while (list.length % 3 !== 2) list.push({ empty: true });
    list.push({
      ikon: 'ti-box',
      t: `Faturalanan Depolama ${m2Eur2(yilTop('storage').tutar)}`,
      s: `${q(koli)} Koli ≈ ${q(palet)} Palet-Eşd. (÷30) · Eldeki Stok Değil`,
    });
  }
  return list.slice(0, 12);
}

function m2BosnaCharts(aylar) {
  if (typeof Chart === 'undefined' || !aylar.length) return;
  const tip = { backgroundColor: 'rgba(26,25,22,.94)', padding: 10, cornerRadius: 10 };
  const labels = aylar.map(a => m2AyAdEn(a.ay));
  const nak = aylar.map(a => Number(a.transport?.tutar || 0));
  const euroTick = (v) => new Intl.NumberFormat('tr-TR', { notation: 'compact' }).format(v) + ' €';
  const truck = document.getElementById('m2-ba-truck');
  if (truck) {
    m2.charts.push(new Chart(truck, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { type: 'bar', label: 'Kamyon', data: aylar.map(a => Number(a.transport?.miktar || 0)), backgroundColor: 'rgba(37,99,235,.22)', borderColor: '#2563EB', borderWidth: 1.5, borderRadius: 6, yAxisID: 'y', maxBarThickness: 36, order: 2 },
          { type: 'line', label: 'Nakliye €', data: nak, borderColor: '#0F766E', backgroundColor: 'rgba(15,118,110,.12)', tension: .35, fill: true, pointRadius: 4, pointBackgroundColor: '#0F766E', yAxisID: 'y1', order: 1 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, usePointStyle: true, font: { size: 10 } } },
          tooltip: { ...tip, callbacks: { label: c => c.dataset.yAxisID === 'y1' ? ` ${c.dataset.label}: ${m2Eur2(c.parsed.y)}` : ` ${c.dataset.label}: ${c.parsed.y}` } } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, border: { display: false }, grid: { color: '#EDE8DF' }, ticks: { precision: 0 }, title: { display: true, text: 'Miktar', font: { size: 10 } } },
          y1: { beginAtZero: true, position: 'right', border: { display: false }, grid: { drawOnChartArea: false }, ticks: { callback: euroTick }, title: { display: true, text: 'EUR', font: { size: 10 } } },
        },
      },
    }));
  }
  const st = document.getElementById('m2-ba-storage');
  if (st) {
    const koli = aylar.map(a => Number(a.storage?.miktar || 0));
    const palet = koli.map(m2KoliPalet);
    m2.charts.push(new Chart(st, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Faturalanan Depolama (Palet-Eşd.)', data: palet, backgroundColor: '#0891B2', borderRadius: 6, maxBarThickness: 36 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false },
          tooltip: { ...tip, callbacks: { label: c => ` ${palet[c.dataIndex]} Palet-Eşd. · ${new Intl.NumberFormat('tr-TR').format(koli[c.dataIndex])} Koli Faturalandı` } } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, border: { display: false }, grid: { color: '#EDE8DF' }, ticks: { precision: 0 }, title: { display: true, text: 'Palet-Eşd.', font: { size: 10 } } },
        },
      },
    }));
  }
}

function m2BosnaRotaCharts(aylar, tip, euroTick) {
  const rotaMaliyet = m2BosnaRotaListesi(aylar, 'tutar');
  const rotaSefer = m2BosnaRotaListesi(aylar, 'miktar');
  const rotaBirim = m2BosnaRotaListesi(aylar, 'birim');
  if (!rotaMaliyet.length) return;
  const labels = aylar.map(a => m2AyAdEn(a.ay));
  const stackEl = document.getElementById('m2-ba-rota-stack');
  if (stackEl) {
    m2.charts.push(new Chart(stackEl, {
      type: 'bar',
      data: {
        labels,
        datasets: rotaMaliyet.map((rt, i) => ({
          label: m2BosnaRotaKisa(rt.rota),
          data: aylar.map(a => Number(m2BosnaRotaAy(a, rt.rota).tutar || 0)),
          backgroundColor: M2_ROTA_COLORS[i % M2_ROTA_COLORS.length],
          borderRadius: 4,
          maxBarThickness: 36,
          stack: 'r',
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 8, usePointStyle: true, font: { size: 10 } } },
          tooltip: { ...tip, callbacks: { label: c => ` ${c.dataset.label}: ${m2Eur2(c.parsed.y)}` } },
        },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, border: { display: false }, grid: { color: '#EDE8DF' }, ticks: { callback: euroTick } },
        },
      },
    }));
  }
  const pieEl = document.getElementById('m2-ba-rota-pie');
  if (pieEl) {
    m2.charts.push(new Chart(pieEl, {
      type: 'doughnut',
      data: {
        labels: rotaMaliyet.map(rt => m2BosnaRotaKisa(rt.rota)),
        datasets: [{
          data: rotaMaliyet.map(rt => rt.tutar),
          backgroundColor: rotaMaliyet.map((_, i) => M2_ROTA_COLORS[i % M2_ROTA_COLORS.length]),
          borderWidth: 3, borderColor: '#fff',
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '58%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 8, usePointStyle: true, font: { size: 10 } } },
          tooltip: {
            ...tip,
            callbacks: {
              label: c => {
                const rt = rotaMaliyet[c.dataIndex];
                const pay = rotaMaliyet.reduce((s, x) => s + x.tutar, 0);
                const pct = pay ? (rt.tutar / pay * 100).toFixed(1) : '0';
                return ` ${c.label}: ${m2Eur2(rt.tutar)} · ${rt.miktar} Sefer · ${m2Eur2(rt.birim)}/Sefer · ${pct}%`;
              },
            },
          },
        },
      },
    }));
  }
  const barEl = document.getElementById('m2-ba-rota-bar');
  if (barEl) {
    m2.charts.push(new Chart(barEl, {
      type: 'bar',
      data: {
        labels: rotaSefer.map(rt => m2BosnaRotaKisa(rt.rota)),
        datasets: [{
          label: 'Sefer',
          data: rotaSefer.map(rt => rt.miktar),
          backgroundColor: rotaSefer.map((_, i) => M2_ROTA_COLORS[i % M2_ROTA_COLORS.length]),
          borderRadius: 6,
          maxBarThickness: 22,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tip,
            callbacks: {
              label: c => {
                const rt = rotaSefer[c.dataIndex];
                return ` ${rt.miktar} Sefer · ${m2Eur2(rt.tutar)} · ${m2Eur2(rt.birim)}/Sefer`;
              },
            },
          },
        },
        scales: {
          y: { grid: { display: false }, ticks: { font: { size: 11 } } },
          x: { beginAtZero: true, border: { display: false }, grid: { color: '#EDE8DF' }, ticks: { precision: 0 } },
        },
      },
    }));
  }
  const birimEl = document.getElementById('m2-ba-rota-birim');
  if (birimEl) {
    m2.charts.push(new Chart(birimEl, {
      type: 'bar',
      data: {
        labels: rotaBirim.map(rt => m2BosnaRotaKisa(rt.rota)),
        datasets: [{
          label: 'EUR / Sefer',
          data: rotaBirim.map(rt => rt.birim),
          backgroundColor: rotaBirim.map((_, i) => M2_ROTA_COLORS[i % M2_ROTA_COLORS.length]),
          borderRadius: 6,
          maxBarThickness: 22,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tip,
            callbacks: {
              label: c => {
                const rt = rotaBirim[c.dataIndex];
                return ` ${m2Eur2(rt.birim)} / Sefer · ${rt.miktar} Kamyon · ${m2Eur2(rt.tutar)}`;
              },
            },
          },
        },
        scales: {
          y: { grid: { display: false }, ticks: { font: { size: 11 } } },
          x: { beginAtZero: true, border: { display: false }, grid: { color: '#EDE8DF' }, ticks: { callback: euroTick } },
        },
      },
    }));
  }
}

function m2UlkeDropAciklama() {
  if (m2.ulke === 'ba') return 'SATR/SP Excel Bırakın — Rapor Hemen Güncellenir.';
  if (m2.ulke === 'ge') return 'GW PDF Veya Ön Bildirim Excel. Yalnız Boş Hücreler Dolar; Kayıtlı Fatura Revize Edilmez.';
  if (m2.ulke === 'be') return 'TVP / Intertrans PDF (EUR). Yalnız Boş Hücreler Dolar; Kayıtlı Fatura Revize Edilmez.';
  if (m2.ulke === 'nl') return 'NedLine PDF (EUR, KDV Hariç). Yalnız Boş Hücreler Dolar; Kayıtlı Fatura Revize Edilmez.';
  if (m2.ulke === 'xk') return 'Dardania PDF (EUR Net). Yalnız Boş Hücreler Dolar; Kayıtlı Fatura Revize Edilmez.';
  if (m2.ulke === 'mk') return 'M&M Nalog Excel Veya BGLG PDF. Yalnız Boş Hücreler Dolar; Kayıtlı Fatura Revize Edilmez.';
  if (!m2.ulke || m2.ulke === 'all') return '';
  return `${m2Label(m2.ulke)} Excel / PDF Bırakın. Yalnız Boş Hücreler Dolar; Kayıtlı Fatura Değişmez.`;
}

function m2UlkeDropHtml(slim) {
  if (!m2.ulke || m2.ulke === 'all') return '';
  return m2DropHtml(m2UlkeDropAciklama(), slim !== false);
}

function m2DropHtml(aciklama, slim) {
  const cls = slim === 'inline' ? ' inline' : (slim ? ' slim' : '');
  const baslik = 'Excel / PDF Bırakın';
  return `<div class="m2-drop${cls}" id="m2-drop"
      onclick="document.getElementById('m2-file').click()"
      ondragover="event.preventDefault();this.classList.add('over')"
      ondragleave="this.classList.remove('over')"
      ondrop="event.preventDefault();this.classList.remove('over');m2Dosyalar(event.dataTransfer.files)">
      <input id="m2-file" type="file" accept=".xlsx,.xls,.pdf" multiple hidden onchange="m2Dosyalar(this.files);this.value='';">
      <i class="ti ti-cloud-upload"></i>
      <div><div class="m2-h">${baslik}</div>
      ${aciklama ? `<div class="m2-p" style="margin-bottom:0">${m2Esc(aciklama)}</div>` : ''}</div>
    </div>`;
}

function m2RenderGiris(body) {
  body.innerHTML = `
    ${m2DropHtml('Bosna SATR/SP Excel’ini Bırakın: Güzergâh Nakliye, Gümrük Vergi Olarak Ayrılır. Diğer Ülkeler Excel / PDF De Olur.')}
    <div id="m2-inbox">${m2.inboxMsg ? `<div class="m2-ok">${m2Esc(m2.inboxMsg)}</div>` : ''}</div>
    <div id="m2-drafts" style="margin-top:14px"></div>`;
  m2RenderDrafts();
}

function m2RenderDrafts() {
  const box = document.getElementById('m2-drafts');
  if (!box) return;
  if (!m2.drafts.length) { box.innerHTML = ''; return; }
  const kalemOpts = (secili) => '<option value="">Kalem Seçin</option>' + (m2.meta?.kalemler || [])
    .filter(k => k.aktif).map(k => `<option value="${k.id}" ${Number(secili) === k.id ? 'selected' : ''}>${m2Esc(k.ad)}</option>`).join('');
  const ulkeOpts = (secili) => '<option value="">Ülke Seçin</option>' + (m2.meta?.ulkeler || [])
    .map(u => `<option value="${u.kod}" ${u.kod === secili ? 'selected' : ''}>${m2Esc(u.label)}</option>`).join('');
  const bosnaSay = m2.drafts.filter(d => d.kind === 'bosna' || d.kind === 'bosna-guncelle').length;
  if (bosnaSay && !m2.bosnaDraftsAcik) {
    const a = m2.bosnaAktarim;
    const yeni = a ? Number(a.yeni_sayisi || 0) : bosnaSay;
    box.innerHTML = `${m2BosnaDpuKutusu()}${m2BosnaAktarimKutusu() || `<div class="m2-ok">${bosnaSay} Bosna Faturası Ayrıldı.
      <button class="m2-btn" style="margin-left:8px" onclick="m2DraftHepsiniKaydet()">Kayıtlara Yaz</button></div>`}
      ${a ? `<button class="m2-btn ghost" onclick="m2.bosnaDraftsAcik=true;m2RenderDrafts()">Yeni Taslakları Göster (${yeni})</button>` : `<button class="m2-btn ghost" onclick="m2.bosnaDraftsAcik=true;m2RenderDrafts()">Taslakları Göster</button>`}`;
    return;
  }
  const kayitUygun = m2.drafts.filter(d => d.ulke && d.fatura_no && d.donem_baslangic && d.donem_bitis &&
    (d.kalemler || []).some(k => k.kalem_id && k.tutar != null && k.tutar !== '')).length;
  box.innerHTML = (m2.drafts.length > 1 ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div class="m2-p" style="margin:0">${m2.drafts.length} Taslak · ${kayitUygun} Kayda Hazır</div>
      <button class="m2-btn" ${kayitUygun ? '' : 'disabled'} onclick="m2DraftHepsiniKaydet()">Hazır Olanları Kaydet</button>
    </div>` : '') + m2.drafts.map((d, i) => `
    <div class="m2-draft">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:start">
        <div><div class="m2-h">${m2Esc(d.dosya || d.fatura_no || 'Taslak')}</div>
          <div class="m2-p" style="margin:0">${d.kind === 'pdf' ? 'PDF Fatura' : 'Excel Kırılımı'} · ${d.kalemler.length} Satır · ${m2Eur2(d.kalemler.reduce((s, x) => s + Number(x.tutar || 0), 0))}</div></div>
        <button class="m2-btn ghost" onclick="m2DraftSil(${i})">Kaldır</button>
      </div>
      ${d.uyari ? `<div class="m2-warn">${m2Esc(d.uyari)}</div>` : ''}
      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:10px 0">
        <label class="m2-field"><span>Ülke</span><select class="m2-select" onchange="m2.drafts[${i}].ulke=this.value">${ulkeOpts(d.ulke)}</select></label>
        <label class="m2-field"><span>Fatura No</span><input class="m2-input" value="${m2Esc(d.fatura_no || '')}" oninput="m2.drafts[${i}].fatura_no=this.value"></label>
        <label class="m2-field"><span>Dönem Başı</span><input class="m2-input" type="date" value="${d.donem_baslangic || ''}" oninput="m2.drafts[${i}].donem_baslangic=this.value"></label>
        <label class="m2-field"><span>Dönem Sonu</span><input class="m2-input" type="date" value="${d.donem_bitis || ''}" oninput="m2.drafts[${i}].donem_bitis=this.value"></label>
      </div>
      <div style="overflow:auto;max-height:280px">
        <table class="m2-table"><thead><tr><th>Kalem</th><th>Açıklama</th><th class="num">Miktar</th><th class="num">Birim</th><th class="num">Tutar</th></tr></thead>
        <tbody>${d.kalemler.map((k, ki) => `<tr>
          <td><select class="m2-select" style="height:34px;min-width:160px" onchange="m2.drafts[${i}].kalemler[${ki}].kalem_id=this.value?Number(this.value):''">${kalemOpts(k.kalem_id)}</select></td>
          <td>${m2Esc(k.aciklama || k.kalem_ad || '')}</td>
          <td class="num">${k.miktar != null ? k.miktar : ''}</td>
          <td class="num">${k.birim_fiyat != null ? m2Eur2(k.birim_fiyat) : ''}</td>
          <td class="num">${m2Eur2(k.tutar)}</td>
        </tr>`).join('')}</tbody></table>
      </div>
      <div style="margin-top:10px"><button class="m2-btn" onclick="m2DraftKaydet(${i})">Kayıtlara Yaz</button></div>
    </div>`).join('');
}

function m2DraftSil(i) { m2.drafts.splice(i, 1); m2RenderDrafts(); }

function m2DropAyAd(ay) {
  return m2AyAdEn ? m2AyAdEn(ay) : ay;
}

function m2TabloDropOzet(ad, data) {
  const dold = data.doldurulan || [];
  const atla = data.atlanan || [];
  const yeni = data.fatura_yeni || [];
  const mevcut = data.fatura_mevcut || [];
  const parca = [];
  if (dold.length) {
    const aylar = [...new Set(dold.map(x => x.ay))];
    parca.push(`${aylar.map(m2DropAyAd).join(', ')}: ${dold.length} Boş Hücre Dolduruldu`);
  } else {
    parca.push('Boş Hücre Yok / Doldurulacak Alan Yok');
  }
  if (atla.length) parca.push(`${atla.length} Dolu Hücre Korundu`);
  if (yeni.length) parca.push(`Yeni Fatura: ${yeni.join(', ')}`);
  if (mevcut.length) parca.push(`${mevcut.join(', ')} Zaten Kayıtlı (Revize Yok)`);
  return `${ad}: ${parca.join(' · ')}`;
}

async function m2UlkeTabloDrop(files) {
  const inbox = document.getElementById('m2-inbox');
  if (inbox) inbox.innerHTML = '<div class="m2-p">Dosyalar Okunuyor… Yalnız Boş Hücreler Doldurulacak.</div>';
  const msgs = [];
  for (const file of files) {
    try {
      const fd = new FormData();
      fd.append('dosya', file);
      fd.append('ulke', m2.ulke);
      const res = await fetch('/api/maliyet/tablo/drop', { method: 'POST', body: fd });
      const data = await res.json();
      if (!data.success) {
        msgs.push(`${file.name}: ${data.error || 'Okunamadı'}`);
        continue;
      }
      if (data.rapor) m2.ulkeTablolar[m2.ulke] = data.rapor;
      msgs.push(m2TabloDropOzet(file.name, data));
    } catch (e) {
      msgs.push(`${file.name}: ${e.message}`);
    }
  }
  m2.inboxMsg = msgs.join(' · ');
  await m2UlkeTabloYukle(m2.ulke, m2.ulkeTabloYil);
  m2Render();
}

async function m2Dosyalar(fileList) {
  const files = [...(fileList || [])];
  if (!files.length) return;
  m2.inboxMsg = '';
  if (m2.ulke && m2.ulke !== 'all' && m2.ulke !== 'ba') {
    await m2UlkeTabloDrop(files);
    return;
  }
  const inbox = document.getElementById('m2-inbox');
  if (inbox) inbox.innerHTML = '<div class="m2-p">Dosyalar Okunuyor…</div>';
  for (const file of files) {
    const ad = (file.name || '').toLowerCase();
    try {
      if (ad.endsWith('.pdf')) await m2PdfOku(file);
      else if (/\.xlsx?$/.test(ad)) await m2ExcelOku(file);
      else m2.drafts.push({ kind: 'skip', dosya: file.name, uyari: 'Desteklenmeyen Uzantı', ulke: '', fatura_no: '', donem_baslangic: '', donem_bitis: '', kalemler: [] });
    } catch (e) {
      m2.drafts.push({ kind: 'hata', dosya: file.name, uyari: e.message, ulke: m2.ulke === 'all' ? '' : m2.ulke, fatura_no: '', donem_baslangic: m2.start, donem_bitis: m2.end, kalemler: [] });
    }
  }
  if (!m2.bosnaOnizleme && m2.view === 'giris') m2.view = 'ozet';
  m2Render();
}

async function m2PdfOku(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const ulke = m2.ulke === 'all' ? '' : m2.ulke;
  const res = await fetch('/api/maliyet/fatura/pdf-oku', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pdf: btoa(binary), ulke, dosya: file.name }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'PDF Okunamadı');
  const t = data.taslak || {};
  m2.drafts.push({
    kind: 'pdf', dosya: file.name, uyari: data.uyari || '',
    ulke: t.ulke || data.ulke_tahmini || ulke,
    fatura_no: t.fatura_no || file.name.replace(/\.pdf$/i, ''),
    fatura_tarihi: t.fatura_tarihi || '',
    donem_baslangic: t.donem_baslangic || m2.start,
    donem_bitis: t.donem_bitis || m2.end,
    para_birimi: t.para_birimi || 'EUR',
    kalemler: (t.kalemler || []).map(k => ({ ...k, aciklama: k.aciklama || k.kalem_ad })),
  });
}

function m2DonemGunleri(donem) {
  const [y, m] = String(donem || '').split('-').map(Number);
  if (!y || !m) return { start: m2.start, end: m2.end };
  return { start: `${y}-${String(m).padStart(2, '0')}-01`, end: m2AySonu(y, m) };
}

async function m2ExcelOku(file) {
  const fd = new FormData();
  fd.append('dosya', file);
  const res = await fetch('/api/maliyet/excel-onizle', { method: 'POST', body: fd });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Excel Okunamadı');
  if (data.tip !== 'fatura') {
    const tipAd = { tarife: 'Tarife Tablosu', hareket: 'Hareket Listesi' }[data.tip] || data.tip;
    m2.drafts.push({
      kind: 'excel-diger', dosya: file.name,
      uyari: `Bu Dosya ${tipAd} Olarak Okundu. Maliyet Takip Fatura Kırılımı Bekler (Ülke Sekmesi × Ay, Veya Tutar Sütunu).`,
      ulke: '', fatura_no: '', donem_baslangic: '', donem_bitis: '', kalemler: [],
    });
    return;
  }
  const bosna = data.kaynak === 'bosna' || !!data.bosna_rapor;
  if (bosna) m2.drafts = m2.drafts.filter(d => d.kind !== 'bosna' && d.kind !== 'bosna-guncelle');
  const aktarim = bosna ? (data.bosna_aktarim || null) : null;
  m2.bosnaAktarim = aktarim;
  const kayitliSet = new Set((aktarim && aktarim.kayitli_nolar) || []);
  const guncelleMap = new Map((aktarim && aktarim.cakisma || []).map(c => [m2FnoKey(c.fatura_no), c]));
  const groups = new Map();
  (data.satirlar || []).forEach(r => {
    const donem = r.donem || (r.tarih || '').slice(0, 7) || m2.start.slice(0, 7);
    const key = `${r.ulke || '?'}|${r.fatura_no || donem}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...r, donem });
  });
  for (const rows of groups.values()) {
    const ulke = rows[0].ulke || (m2.ulke === 'all' ? '' : m2.ulke);
    const donem = rows[0].donem;
    const gun = m2DonemGunleri(donem);
    const faturaNo = rows[0].fatura_no || `LC-${ulke || 'xx'}-${donem}`;
    if (bosna && kayitliSet.has(m2FnoKey(faturaNo))) continue;
    const gunc = bosna ? guncelleMap.get(m2FnoKey(faturaNo)) : null;
    const dpuUyari = rows.some(r => r.tarih_kaynak === 'dpu')
      ? 'Datum Boştu; Ay DPU’dan Yazıldı.'
      : '';
    m2.drafts.push({
      kind: data.kaynak === 'bosna' ? (gunc ? 'bosna-guncelle' : 'bosna') : 'excel',
      fatura_id: gunc ? gunc.id : null,
      dosya: `${file.name} · ${m2Label(ulke)} ${donem || ''}`.trim(),
      uyari: [gunc
        ? `Kayıtlı ${m2Eur2(gunc.kayitli_tutar)} → Excel ${m2Eur2(gunc.excel_tutar)}. Onaylarsanız Üzerine Yazılır.`
        : (rows.some(r => !r.kalem_id) ? `${rows.filter(r => !r.kalem_id).length} Satır Kaleme Bağlanamadı — Kaydetmeden Seçin.` : ''),
        dpuUyari].filter(Boolean).join(' '),
      ulke, fatura_no: faturaNo, para_birimi: rows[0].para_birimi || 'EUR',
      fatura_tarihi: rows[0].fatura_tarihi || '',
      donem_baslangic: gun.start, donem_bitis: gun.end,
      kalemler: rows.map(r => ({
        kalem_id: r.kalem_id || '', kalem_ad: r.kalem_ad, kalem_kod: r.kalem_kod,
        aciklama: r.aciklama || r.kalem_ad,
        miktar: r.miktar || 1, birim_fiyat: r.birim_fiyat || r.tutar, tutar: r.tutar,
        tutar_bam: r.tutar_bam, tarih: r.tarih || gun.start,
      })),
    });
  }
  if (bosna) {
    m2.bosnaRapor = data.bosna_rapor;
    const yeni = Number((aktarim && aktarim.yeni_sayisi) || 0);
    const kayitli = Number((aktarim && aktarim.kayitli_sayisi) || 0);
    const guncelle = Number((aktarim && aktarim.guncelle_sayisi) || 0);
    m2.bosnaOnizleme = yeni > 0 || guncelle > 0;
    m2.bosnaDraftsAcik = false;
    m2.ulke = 'ba';
    m2.bosnaYil = (data.bosna_rapor?.yillar || []).slice(-1)[0] || (m2.start || '').slice(0, 4);
    const dpuSay = Number((data.bosna_rapor && data.bosna_rapor.dpu_yedek && data.bosna_rapor.dpu_yedek.length)
      || (aktarim && aktarim.dpu_yedek_sayisi) || 0);
    const dpuNot = dpuSay ? ` · ${dpuSay} Faturada Datum Boş, DPU Yazıldı` : '';
    m2.view = 'ozet';
    if (guncelle && yeni) m2.inboxMsg = `${file.name}: ${yeni} Yeni · ${guncelle} Değişmiş (Onayla Güncellenir) · Aynı Kalanlar Durur.${dpuNot}.`;
    else if (guncelle) m2.inboxMsg = `${file.name}: ${guncelle} Fatura Değişmiş. Tablo Excel Halini Gösteriyor; Kayıt İçin Onaylayın.${dpuNot}`;
    else if (kayitli && yeni) m2.inboxMsg = `${file.name}: ${kayitli} Kayıtlı Fatura Duracak · ${yeni} Yeni Eklenecek.${dpuNot}`;
    else if (kayitli && !yeni) m2.inboxMsg = `${file.name}: Tüm Faturalar Kayıtlı Ve Aynı. Mevcut Verilere Dokunulmadı.${dpuNot}`;
    else m2.inboxMsg = `${file.name} Okundu · ${data.satir_sayisi || 0} Satır Ayrıldı (Nakliye / Vergi / Giriş-Çıkış-Depolama).${dpuNot}`;
  }
}

async function m2DraftYaz(i) {
  const d = m2.drafts[i];
  if (!d) return { ok: false, error: 'Taslak Yok' };
  if (!d.ulke) return { ok: false, error: 'Ülke Seçin.' };
  if (!d.fatura_no) return { ok: false, error: 'Fatura No Girin.' };
  if (!d.donem_baslangic || !d.donem_bitis) return { ok: false, error: 'Dönem Girin.' };
  const kalemler = (d.kalemler || []).filter(k => k.kalem_id && k.tutar !== '' && k.tutar != null);
  if (!kalemler.length) return { ok: false, error: 'En Az Bir Satırı Maliyet Kalemine Bağlayın.' };
  if (!d.fatura_id && d.ulke === 'ba' && (m2.faturalar || []).some(f => f.ulke === 'ba' && m2FnoKey(f.fatura_no) === m2FnoKey(d.fatura_no))) {
    m2.drafts.splice(i, 1);
    return { ok: true, fatura_no: d.fatura_no, atlandi: true };
  }
  const body = {
    ulke: d.ulke, fatura_no: d.fatura_no,
    donem_baslangic: d.donem_baslangic, donem_bitis: d.donem_bitis,
    fatura_tarihi: d.fatura_tarihi || d.donem_bitis, para_birimi: d.para_birimi || 'EUR',
    notlar: d.dosya || '',
    kalemler: kalemler.map(k => ({
      kalem_id: Number(k.kalem_id), aciklama: k.aciklama || k.kalem_ad || 'Kalem',
      referans: k.referans || '', miktar: k.miktar || 1, birim_fiyat: k.birim_fiyat || k.tutar, tutar: k.tutar,
      tutar_bam: k.tutar_bam, tarih: k.tarih || d.donem_baslangic,
    })),
  };
  const url = d.fatura_id ? '/api/maliyet/fatura/' + d.fatura_id : '/api/maliyet/fatura';
  const method = d.fatura_id ? 'PUT' : 'POST';
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let data;
  try { data = await res.json(); }
  catch (e) { return { ok: false, error: `Kayıt Başarısız (${res.status})` }; }
  if (data.kod === 'mevcut' && !d.fatura_id) {
    m2.drafts.splice(i, 1);
    return { ok: true, fatura_no: d.fatura_no, atlandi: true };
  }
  if (!data.success) return { ok: false, error: data.error || 'Kayıt Başarısız' };
  m2.drafts.splice(i, 1);
  return { ok: true, fatura_no: d.fatura_no, guncelle: !!d.fatura_id };
}

async function m2DraftKaydet(i) {
  const r = await m2DraftYaz(i);
  if (!r.ok) return alert(r.error);
  if (m2.drafts.length) {
    m2.inboxMsg = `${r.fatura_no} Kaydedildi. Kalan Taslakları Da Kaydedebilirsiniz.`;
    await m2Load();
    m2.view = 'ozet';
    m2Render();
    return;
  }
  m2.inboxMsg = `${r.fatura_no} Kaydedildi. Özet Güncellendi.`;
  if (m2.bosnaKayit || m2.bosnaRapor) {
    m2.bosnaOnizleme = false;
    m2.bosnaAktarim = null;
    m2.ulke = 'ba';
    m2.view = 'ozet';
  } else m2.view = 'ozet';
  await m2Load();
}

async function m2DraftHepsiniKaydet() {
  const guncelleSay = m2.drafts.filter(d => d.fatura_id).length;
  const yeniSay = m2.drafts.filter(d => (d.kind === 'bosna' || d.kind === 'excel') && !d.fatura_id).length;
  if (guncelleSay) {
    const okOnay = confirm(
      `${guncelleSay} Kayıtlı Fatura Excel Değerleriyle Üzerine Yazılacak.`
      + (yeniSay ? ` ${yeniSay} Yeni Fatura Eklenecek.` : '')
      + ' Değişmeyen Faturalara Dokunulmaz. Devam Edilsin Mi?'
    );
    if (!okOnay) return;
  }
  let ok = 0, skip = 0, atlanan = 0, guncellenen = 0, lastErr = '';
  for (let i = 0; i < m2.drafts.length; ) {
    const r = await m2DraftYaz(i);
    if (r.ok && r.atlandi) atlanan++;
    else if (r.ok && r.guncelle) guncellenen++;
    else if (r.ok) ok++;
    else { skip++; lastErr = r.error; i++; }
  }
  m2.inboxMsg = [
    ok ? `${ok} Yeni Eklendi` : '',
    guncellenen ? `${guncellenen} Güncellendi` : '',
    atlanan ? `${atlanan} Aynı Kaldı` : '',
    skip ? `${skip} Atlandı${lastErr ? ' (' + lastErr + ')' : ''}` : '',
  ].filter(Boolean).join(' · ') || 'Değişiklik Yok';
  if (!m2.drafts.some(d => d.kind === 'bosna' || d.kind === 'bosna-guncelle')) {
    m2.bosnaOnizleme = false;
    m2.bosnaRapor = null;
    m2.bosnaAktarim = null;
  }
  if (!m2.drafts.length) { m2.ulke = 'ba'; m2.view = 'ozet'; }
  else m2.view = 'ozet';
  await m2Load();
}

function m2RenderKayitlar(body) {
  const rows = m2.ulke === 'all' ? m2.faturalar : m2.faturalar.filter(f => f.ulke === m2.ulke);
  if (!rows.length) {
    body.innerHTML = `<div class="m2-card"><div class="m2-empty"><i class="ti ti-receipt"></i><div class="m2-h">Kayıt Yok</div><div class="m2-p">Bu Aralıkta Fatura Yok. Ülke Seçip Belgeyi O Sayfaya Bırakın.</div></div></div>`;
    return;
  }
  body.innerHTML = `<div class="m2-card"><div class="m2-h">Kayıtlı Faturalar</div><div class="m2-p">${rows.length} Belge · Tıklayınca Kırılım Açılır.</div>
    <table class="m2-table"><thead><tr><th>Ülke</th><th>Fatura</th><th>Dönem</th><th class="num">Tutar</th><th>Kırılım</th><th></th></tr></thead>
    <tbody>${rows.map(f => {
      const acik = !!m2.expanded[f.id];
      return `<tr onclick="m2Toggle(${f.id})" style="cursor:pointer">
        <td><span class="m2-pill" style="background:${m2Color(f.ulke)}22;color:${m2Color(f.ulke)}">${m2Esc(m2Label(f.ulke))}</span></td>
        <td><b>${m2Esc(f.fatura_no)}</b><div style="font-size:11px;color:var(--m2-muted)">${f.fatura_tarihi ? m2Tarih(f.fatura_tarihi) : ''}</div></td>
        <td>${m2Tarih(f.donem_baslangic)} – ${m2Tarih(f.donem_bitis)}</td>
        <td class="num">${m2Eur2(f.tutar)} ${m2Esc(f.para_birimi)}</td>
        <td>${(f.kalemler || []).length} Satır</td>
        <td>${acik ? '▾' : '▸'}</td></tr>
        ${acik ? `<tr><td colspan="6" style="background:#FBFAF7">${(f.kalemler || []).map(k => `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px"><span>${m2Esc(m2KalemAdGoster(k.kalem_ad))} · ${m2Esc(k.aciklama || '')}</span><b>${m2Eur2(k.tutar)}</b></div>`).join('') || 'Kırılım Yok'}
          <button class="m2-btn ghost" style="margin-top:8px" onclick="event.stopPropagation();m2Sil(${f.id})">Sil</button></td></tr>` : ''}`;
    }).join('')}</tbody></table></div>`;
}

function m2Toggle(id) {
  m2.expanded[id] = !m2.expanded[id];
  m2Render();
}

async function m2Sil(id) {
  if (!confirm('Bu Fatura Silinsin Mi? Özet Ve Grafikler Güncellenir.')) return;
  const res = await fetch('/api/maliyet/fatura/' + id, { method: 'DELETE' });
  let data;
  try { data = await res.json(); }
  catch (e) { return alert('Silinemedi (' + res.status + ')'); }
  if (!data.success) return alert(data.error || 'Silinemedi');
  await m2Load();
}
