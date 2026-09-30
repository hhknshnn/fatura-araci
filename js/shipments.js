// js/shipments.js
// Sevkiyatlar sayfası — listeleme, filtreleme, güncelleme

// ── SÜTUN GENİŞLİKLERİ ───────────────────────────────────────────────────────
// ── SAYFALAMA STATE ───────────────────────────────────────────────────────────
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
let PAGE_SIZE = parseInt(localStorage.getItem('shipmentsPageSize'), 10) || 25;
if (!PAGE_SIZE_OPTIONS.includes(PAGE_SIZE)) PAGE_SIZE = 25;
let currentPage = 1;
let filteredList = [];

function changePageSize(val) {
  const size = parseInt(val, 10);
  PAGE_SIZE = PAGE_SIZE_OPTIONS.includes(size) ? size : 25;
  localStorage.setItem('shipmentsPageSize', PAGE_SIZE);
  currentPage = 1;
  renderPage();
}

const COL_KEYS = ['ihracat_dosya_no','fatura_no','palet','_depo','ulke','nakliye_firmasi','plaka','sefer_id','fatura_bedeli_eur','durum'];
// Başlangıç genişlikleri (px). Tablo `width:100%; table-layout:fixed` olduğu için
// tarayıcı bu değerleri ORANTI olarak kullanır ve tüm sütunlar görünür alana
// sığar — yatay kaydırma çıkmaz. Kullanıcı tutamaçla sürükleyince o sütunun
// değeri localStorage'a yazılır; çift tık içeriğe göre otomatik sığdırır.
const COL_DEFAULTS = { ihracat_dosya_no:75, fatura_no:140, palet:50, _depo:56, ulke:85, nakliye_firmasi:75, plaka:142, sefer_id:72, fatura_bedeli_eur:98, durum:96 };
const COL_MAX = { ihracat_dosya_no:120, fatura_no:160, palet:72, _depo:72, ulke:110, nakliye_firmasi:140, plaka:160, sefer_id:96, fatura_bedeli_eur:118, durum:118 };
const SECIM_KOLON_GENISLIK = 36;

function normalizeColWidths(widths) {
  return COL_KEYS.reduce((acc, key) => {
    const min = Math.min(COL_DEFAULTS[key], 54);
    const max = COL_MAX[key] || COL_DEFAULTS[key];
    const raw = Number(widths?.[key]);
    acc[key] = Number.isFinite(raw) ? Math.min(Math.max(raw, min), max) : COL_DEFAULTS[key];
    return acc;
  }, {});
}

function loadColWidths() {
  try {
    const saved = localStorage.getItem('shipments_col_widths');
    return saved ? normalizeColWidths({ ...COL_DEFAULTS, ...JSON.parse(saved) }) : { ...COL_DEFAULTS };
  } catch(e) { return { ...COL_DEFAULTS }; }
}

function saveColWidths(widths) {
  try { localStorage.setItem('shipments_col_widths', JSON.stringify(widths)); } catch(e) {}
}

let colWidths = loadColWidths();

/** Sol sabit sütunun offset'ini seçim kolonunun gerçek genişliğiyle hizalar. */
function hizalaSabitKolonOffset(wrapper) {
  const ilkTh = wrapper?.querySelector('thead th');
  const genislik = ilkTh?.getBoundingClientRect().width;
  if (!genislik) return;
  wrapper.querySelectorAll('.shipments-sticky-l1').forEach(el => {
    el.style.left = genislik + 'px';
  });
}

function initColResize() {
  const table = document.querySelector('#shipments-table-wrapper table');
  if (!table) return;

  const ths = table.querySelectorAll('thead th');
  ths.forEach((th, i) => {
    if (i === 0) return;
    const colKey = COL_KEYS[i - 1];
    if (!colKey) return;

    const existing = th.querySelector('.col-resize-handle');
    if (existing) existing.remove();

    const handle = document.createElement('div');
    handle.className = 'col-resize-handle';
    handle.style.cssText = `
      position:absolute;right:0;top:0;bottom:0;width:6px;
      cursor:col-resize;z-index:10;user-select:none;
      background:transparent;
    `;
    // NOT: position YAZILMAZ. Başlıklar zaten sticky (konumlandırılmış) olduğu
    // için absolute tutamaç onların içinde kalır; inline 'relative' yazmak
    // sticky-l1 (Dosya No) başlığının left offset'ini gerçek kaydırmaya
    // çevirip onu Fatura No'nun üstüne bindiriyordu.
    if (getComputedStyle(th).position === 'static') th.style.position = 'relative';
    th.style.overflow = 'hidden';
    th.appendChild(handle);

    const uygula = w => {
      th.style.width = w + 'px';
      table.querySelectorAll('tbody tr').forEach(row => {
        const td = row.cells[i];
        if (td) {
          td.style.width = w + 'px';
          td.style.maxWidth = w + 'px';
          td.style.overflow = 'hidden';
          td.style.textOverflow = 'ellipsis';
        }
      });
      hizalaSabitKolonOffset(table.parentElement);
    };

    let startX, startW, isDragging = false;

    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      isDragging = false;
      startX = e.clientX;
      startW = th.offsetWidth;
      handle.style.background = 'var(--accent)';

      const onMove = e => {
        isDragging = true;
        uygula(Math.min(400, Math.max(40, startW + e.clientX - startX)));
      };

      const onUp = e => {
        const newW = Math.min(400, Math.max(40, startW + e.clientX - startX));
        if (isDragging) {
          colWidths[colKey] = newW;
          saveColWidths(colWidths);
        }
        handle.style.background = 'transparent';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    handle.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
    });

    // Çift tık: sütunu içeriğine göre sığdır
    handle.addEventListener('dblclick', e => {
      e.preventDefault();
      e.stopPropagation();
      let maxW = 60;
      const allCells = table.querySelectorAll(`tr td:nth-child(${i + 1}), tr th:nth-child(${i + 1})`);
      const measurer = document.createElement('span');
      measurer.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-size:12px;font-family:var(--font);padding:0 8px;';
      document.body.appendChild(measurer);
      allCells.forEach(cell => {
        measurer.textContent = cell.textContent.trim();
        maxW = Math.max(maxW, measurer.offsetWidth + 16);
      });
      document.body.removeChild(measurer);
      maxW = Math.min(maxW, 400);
      uygula(maxW);
      colWidths[colKey] = maxW;
      saveColWidths(colWidths);
    });

    handle.addEventListener('mouseenter', () => handle.style.background = 'var(--accent-mid)');
    handle.addEventListener('mouseleave', () => handle.style.background = 'transparent');
  });
}

let allShipments    = [];
let seciliSatirlar  = new Set(); // çoklu silme için seçili id'ler
let dashboardSeferFilter = '';

// ── SIRALAMA STATE ────────────────────────────────────────────────────────────
let sortColumn = null;   // hangi sütun: 'ihracat_dosya_no', 'fatura_no', vb.
let sortDir    = 'asc';  // 'asc' | 'desc'

function sortShipments(list) {
  if (!sortColumn) return list;

  // Saf sayısal sütunlar
  const numericCols = ['fatura_bedeli_eur', 'fatura_bedeli_tl', 'navlun_eur',
                       'sigorta_eur', 'eur_kuru', 'toplam_maliyet_eur'];

  // "2026-003" → 2026003 gibi numeric karşılaştırma için yardımcı
  function toSortKey(val) {
    if (val === null || val === undefined || val === '') return '';
    const s = String(val).trim();
    // Tamamen sayısal mı?
    if (!isNaN(s) && s !== '') return parseFloat(s);
    // "2026-003" gibi tire içeren dosya/fatura no → rakamları birleştir
    const onlyDigits = s.replace(/\D/g, '');
    if (onlyDigits.length > 0 && onlyDigits.length === s.replace(/[^0-9\-]/g, '').replace(/-/g,'').length) {
      return parseInt(onlyDigits, 10);
    }
    return s.toLowerCase();
  }

  return [...list].sort((a, b) => {
    let va, vb;

    if (numericCols.includes(sortColumn)) {
      va = parseFloat(a[sortColumn]) || 0;
      vb = parseFloat(b[sortColumn]) || 0;
    } else {
      va = toSortKey(a[sortColumn]);
      vb = toSortKey(b[sortColumn]);
    }

    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });
}

function onSort(col) {
  if (sortColumn === col) {
    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    sortColumn = col;
    sortDir = 'asc';
  }
  applyFiltersAndRender();
}

function getHiddenFilterValues(id) {
  const raw = document.getElementById(id)?.value || '';
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch(e) {
    return raw ? [raw] : [];
  }
}

let shipmentsSearchQuery = '';

// Arama için: küçük harf + Türkçe karakterleri sadeleştir ("sirbistan" = "SIRBİSTAN")
function aramaNormalize(val) {
  return String(val || '').trim().toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');
}
let shipmentsSearchDebounce = null;

function onShipmentsSearch(val) {
  clearTimeout(shipmentsSearchDebounce);
  shipmentsSearchDebounce = setTimeout(() => {
    shipmentsSearchQuery = aramaNormalize(val);
    document.getElementById('shipments-search-btn')?.classList.toggle('active', !!shipmentsSearchQuery);
    applyFiltersAndRender();
  }, 200);
}

function toggleShipmentsSearch(event) {
  event.stopPropagation();
  const panel = document.getElementById('shipments-search-panel');
  const btn   = document.getElementById('shipments-search-btn');
  if (!panel || !btn) return;
  const isOpen = panel.style.display === 'block';
  if (isOpen) {
    panel.style.display = 'none';
  } else {
    const rect = btn.getBoundingClientRect();
    panel.style.top  = (rect.bottom + 6) + 'px';
    panel.style.left = rect.left + 'px';
    panel.style.display = 'block';
    setTimeout(() => document.getElementById('shipments-search')?.focus(), 0);
  }
}

document.addEventListener('click', e => {
  if (!e.target.closest('#shipments-search-wrap')) {
    const panel = document.getElementById('shipments-search-panel');
    if (panel) panel.style.display = 'none';
  }
});

function applyFiltersAndRender() {
  const depo        = document.getElementById('filter-depo')?.value         || '';
  const durumlar    = getHiddenFilterValues('filter-durum');
  const musteriTipleri = getHiddenFilterValues('filter-musteri-tipi');
  const aylar       = getHiddenFilterValues('filter-ay');
  const yillar      = getHiddenFilterValues('filter-yil');

  // Filtrelenmiş listeyi her zaman allShipments'tan sıfırdan hesapla
  let filtered = allShipments;
  if (selectedUlkeler && selectedUlkeler.size > 0)
    filtered = filtered.filter(s => selectedUlkeler.has(s.ulke?.toUpperCase()));
  if (durumlar.length > 0) filtered = filtered.filter(s => durumlar.includes(durumGoster(s, allShipments)));
  if (depo)        filtered = filtered.filter(s => s.fatura_no?.startsWith(depo));
  if (musteriTipleri.length > 0) filtered = filtered.filter(s => musteriTipleri.includes(s.musteri_tipi));
  if (aylar.length > 0) filtered = filtered.filter(s => aylar.includes((s.yukleme_tarihi || '').slice(5, 7)));
  if (yillar.length > 0) filtered = filtered.filter(s => yillar.includes((s.yukleme_tarihi || '').slice(0, 4)));
  if (dashboardSeferFilter === 'tek') filtered = filtered.filter(s => !s.sefer_id);
  if (dashboardSeferFilter === 'gruplu') filtered = filtered.filter(s => !!s.sefer_id);
  if (shipmentsSearchQuery) {
    const q = shipmentsSearchQuery;
    filtered = filtered.filter(s =>
      [s.ihracat_dosya_no, s.fatura_no, s.plaka, s.nakliye_firmasi, s.ulke]
        .some(alan => aramaNormalize(alan).includes(q))
    );
  }

  filteredList = sortShipments(filtered);
  currentPage  = 1;
  renderPage();

  const aktifFiltre = [
    selectedUlkeler && selectedUlkeler.size > 0, durumlar.length > 0, !!depo,
    musteriTipleri.length > 0, aylar.length > 0 || yillar.length > 0,
    !!dashboardSeferFilter, !!shipmentsSearchQuery
  ].filter(Boolean).length;
  updateTemizleButonu(aktifFiltre);
}

// Temizle butonu: filtre yokken soluk, varsa kırmızı + aktif filtre sayısı
function updateTemizleButonu(sayi) {
  const btn = document.getElementById('filter-clear-btn');
  if (!btn) return;
  btn.classList.toggle('has-filter', sayi > 0);
  document.getElementById('filter-clear-count').textContent = sayi || '';
  btn.title = sayi ? `${sayi} aktif filtreyi temizle` : 'Aktif filtre yok';
}

// Özet şeridi HTML'i — kart görünümü; stiller css/style.css "ÖZET KARTLARI" bloğunda.
// Renk sadece ikon rozetinde (--c); değerler koyu ve büyük.
function ozetHtml({ toplam, kayit, faturaEur, faturaTl, faturaUsd, navlunEur, sigortaEur, fmt, fmtTl, fmtUsd }) {
  const kalem = (icon, label, val, renk, title = '') => `
    <div class="oz-item" ${title ? `title="${title}"` : ''} style="--c:${renk};">
      <span class="oz-ic"><i class="ti ti-${icon}" aria-hidden="true"></i></span>
      <span class="oz-txt"><span class="oz-lbl">${label}</span><span class="oz-val">${val}</span></span>
    </div>`;
  // Gruplu sevkiyatlar tek sefer sayılır; alt bilgideki ham kayıt sayısıyla
  // çelişki izlenimi doğmasın diye ikisi birlikte gösterilir.
  const seferVal = (kayit != null && kayit !== toplam)
    ? `${toplam} <small>· ${kayit} kayıt</small>`
    : `${toplam}`;
  return `
    <div class="oz-card">${kalem('truck', 'Sefer', seferVal, '#475569', 'Gruplu sevkiyatlar tek sefer sayılır')}</div>
    <div class="oz-card oz-group">
      ${kalem('currency-euro',   'Fatura (EUR)', fmt(faturaEur),    '#2563EB')}
      ${kalem('currency-lira',   'Fatura (TL)',  fmtTl(faturaTl),   '#16A34A')}
      ${kalem('currency-dollar', 'Fatura (USD)', fmtUsd(faturaUsd), '#0D9488')}
    </div>
    <div class="oz-card">${kalem('ship',   'Navlun',  fmt(navlunEur),  '#D97706')}</div>
    <div class="oz-card">${kalem('shield', 'Sigorta', fmt(sigortaEur), '#7C3AED')}</div>
  `;
}

// Sıralama ok ikonu
function sortIcon(col) {
  if (sortColumn !== col) return '<i class="ti ti-arrows-sort shipments-sort-icon muted" aria-hidden="true"></i>';
  return sortDir === 'asc'
    ? '<i class="ti ti-arrow-up shipments-sort-icon active" aria-hidden="true"></i>'
    : '<i class="ti ti-arrow-down shipments-sort-icon active" aria-hidden="true"></i>';
}

// Tıklanabilir başlık hücresi
function thCell(label, col, extraStyle = '', cls = '') {
  return `<th class="shipments-th ${cls}" onclick="onSort('${col}')" style="${extraStyle}">
    <span class="shipments-th-inner">${label}${sortIcon(col)}</span>
  </th>`;
}


// Sticky yatay scroll bar — viewport'a yapışık
function initStickyScroll() {
  // fake scrollbar kaldırıldı — wrapper direkt scroll yapıyor
}

// Durum normalize
function normalizeDurum(raw) {
  if (!raw) return 'YOLDA';
  const s = raw.toString().trim().toUpperCase()
    .replace('İ', 'İ')
    .replace('I', 'I');
  if (s === 'YÜKLENECEK' || s === 'YUKLENECEK' || s === 'TO BE LOADED') return 'Yüklenecek';
  if (s === 'YOLDA' || s === 'IN TRANSIT' || s === 'TRANSIT') return 'YOLDA';
  if (s === 'TESLİM EDİLDİ' || s === 'TESLIM EDILDI' || s === 'DELIVERED' || s === 'TESLIM') return 'TESLİM EDİLDİ';
  if (s === 'VARIŞ GÜMRÜK' || s === 'VARIS GUMRUK' || s === 'CUSTOMS' || s === 'GÜMRÜKTE') return 'Varış Gümrük';
  if (s === 'HAZIRLANYOR' || s === 'HAZIRLANIYOR' || s === 'PREPARING') return 'HAZIRLANIYOR';
  return raw.toString().trim();
}

function durumGoster(s, kaynak) {
  const own = normalizeDurum(s.durum);
  if (!s.sefer_id) return own;
  const liste = kaynak || (typeof allShipments !== 'undefined' ? allShipments : null) || [s];
  const grup = liste.filter(x => x.sefer_id === s.sefer_id);
  const antYuklenecek = grup.some(x =>
    String(x.fatura_no || '').toUpperCase().startsWith('ANT') &&
    normalizeDurum(x.durum) === 'Yüklenecek'
  );
  return antYuklenecek ? 'Yüklenecek' : own;
}

/**
 * Sevkiyat listesini yeniden yükler.
 * `opts.gorunumuKoru` true ise sayfa no, sıralama ve scroll konumu korunur —
 * toplu işlem/kayıt güncelleme sonrası kullanıcı bulunduğu yerde kalır.
 */
async function loadShipments(ulke = '', durum = '', opts = {}) {
  const gorunumuKoru = opts.gorunumuKoru === true;
  const oncekiSayfa  = currentPage;
  const oncekiSortCol = sortColumn;
  const oncekiSortDir = sortDir;
  const oncekiScrollTop  = document.getElementById('shipments-table-wrapper')?.scrollTop  || 0;
  const oncekiScrollLeft = document.getElementById('shipments-table-wrapper')?.scrollLeft || 0;

  // Wrapper scroll ayarları
  const wrapper = document.getElementById('shipments-table-wrapper');
  if (wrapper) {
    wrapper.style.overflowX = 'auto';
    wrapper.style.overflowY = 'auto';
    wrapper.style.background = 'var(--surface2)';
    // Yüksekliği DOM ölçümüyle hesapla — pagination render sonrası çağrılır
    function setWrapperHeight() {
      const panel = document.getElementById('stepSevkiyatlar');
      if (!panel) return;
      const panelTop  = panel.getBoundingClientRect().top;
      const ozet      = document.getElementById('shipments-ozet');
      const pg        = document.getElementById('shipments-pagination');
      const ozetH     = ozet  ? ozet.offsetHeight  : 42;
      const pgH       = pg    ? pg.offsetHeight     : 52;
      // wrapper = viewport yüksekliği - panelin başlangıcı - özet - pagination - küçük boşluk
      const h = window.innerHeight - panelTop - ozetH - pgH - 12;
      wrapper.style.maxHeight = Math.max(200, h) + 'px';
    }
    wrapper._adjustHeight = setWrapperHeight;
    // İlk render sonrası ve resize'da çağır — önceki loadShipments() çağrısından
    // kalan listener'ı temizle, aksi halde her çağrıda bir tane daha birikir.
    if (wrapper._resizeHandler) {
      window.removeEventListener('resize', wrapper._resizeHandler);
    }
    wrapper._resizeHandler = setWrapperHeight;
    setTimeout(setWrapperHeight, 100);
    window.addEventListener('resize', wrapper._resizeHandler);
  }

  if (!document.getElementById('shipments-ozet')) {
    const ozet = document.createElement('div');
    ozet.id = 'shipments-ozet';
    ozet.style.cssText = 'display:flex;gap:8px;align-items:center;padding:8px 16px;background:var(--surface2);border-bottom:0.5px solid var(--border2);flex-wrap:wrap;';
    if (wrapper) wrapper.parentNode.insertBefore(ozet, wrapper);
  }
  try {
    const token = localStorage.getItem('fa_auth_token');
    let url = '/api/shipments';
    const params = [];
    if (ulke)  params.push(`ulke=${encodeURIComponent(ulke)}`);
    if (durum) params.push(`durum=${encodeURIComponent(durum)}`);
    if (params.length) url += '?' + params.join('&');

    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    if (!data.success) return;

    allShipments = data.shipments;
    filteredList = [];
    // Görünüm korunuyorsa sayfa/sıralama sıfırlanmaz. Silinen kayıt yüzünden
    // sayfa sayısı azalırsa renderPage() zaten son sayfaya kırpıyor.
    currentPage  = gorunumuKoru ? oncekiSayfa : 1;
    sortColumn   = gorunumuKoru && oncekiSortCol ? oncekiSortCol : 'ihracat_dosya_no';
    sortDir      = gorunumuKoru && oncekiSortCol ? oncekiSortDir : 'desc';

    populateYilFilterOptions();
    decorateFilterMenuleri();
    if (typeof bildirimGuncelle === 'function') bildirimGuncelle(allShipments);
    applyPendingDashboardShipmentFilter();
    applyFiltersAndRender();
    if (!document.getElementById('fake-scrollbar')) initStickyScroll();

    if (gorunumuKoru && (oncekiScrollTop || oncekiScrollLeft)) {
      // Yükseklik hesabı setTimeout(...,0) ile yapılıyor; scroll'u ondan sonra geri al
      setTimeout(() => {
        const w = document.getElementById('shipments-table-wrapper');
        if (!w) return;
        w.scrollTop  = oncekiScrollTop;
        w.scrollLeft = oncekiScrollLeft;
      }, 0);
    }
  } catch (e) {
    console.error('Sevkiyatlar yüklenemedi:', e);
  }
}

/** Toplu/tekil işlem sonrası: listeyi tazele ama kullanıcının yerini koru. */
async function yenileGorunumuKoruyarak() {
  allShipments = [];
  const tbody = document.getElementById('shipments-tbody');
  if (tbody) tbody.innerHTML = '';
  await loadShipments('', '', { gorunumuKoru: true });
}

// ── SAYFA RENDER ─────────────────────────────────────────────────────────────
function renderPage() {
  const totalPages = Math.max(1, Math.ceil(filteredList.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageList = filteredList.slice(start, start + PAGE_SIZE);
  renderShipments(pageList, filteredList);
  renderPagination(totalPages);
  // Pagination DOM'a eklendikten sonra yüksekliği hesapla
  const wrapper = document.getElementById('shipments-table-wrapper');
  if (wrapper?._adjustHeight) setTimeout(wrapper._adjustHeight, 0);
}

function renderPagination(totalPages) {
  let pg = document.getElementById('shipments-pagination');
  if (!pg) {
    pg = document.createElement('div');
    pg.id = 'shipments-pagination';
    pg.style.cssText = `
      display:flex;align-items:center;justify-content:center;gap:6px;
      padding:10px 16px;background:var(--surface);
      border-top:0.5px solid var(--border2);flex-wrap:wrap;
    `;
    const wrapper = document.getElementById('shipments-table-wrapper');
    wrapper?.parentNode?.insertBefore(pg, wrapper.nextSibling);
  }

  const total = filteredList.length;
  const start = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const end   = Math.min(currentPage * PAGE_SIZE, total);

  const navBtn = (label, onclick, active = false, disabled = false) => `
    <button onclick="${disabled ? '' : onclick}"
      style="width:34px;height:34px;border-radius:10px;
             border:0.5px solid ${active ? 'var(--accent)' : 'transparent'};
             background:${active ? 'var(--accent)' : disabled ? 'transparent' : 'var(--surface)'};
             color:${active ? '#fff' : disabled ? 'var(--text3)' : 'var(--text2)'};
             font-family:var(--font);font-size:13px;font-weight:${active ? '600' : '400'};
             cursor:${disabled ? 'default' : 'pointer'};
             opacity:${disabled ? '0.35' : '1'};
             display:flex;align-items:center;justify-content:center;
             box-shadow:${active ? '0 2px 6px rgba(24, 95, 165, 0.20)' : 'none'};
             transition:background 0.12s,border-color 0.12s,color 0.12s,box-shadow 0.12s;
             flex-shrink:0;"
      ${disabled ? 'disabled' : ''}
      onmouseover="${!active && !disabled ? "this.style.background='var(--accent-dim)';this.style.color='var(--accent)'" : ''}"
      onmouseout="${!active && !disabled ? "this.style.background='var(--surface)';this.style.color='var(--text2)'" : ''}">
      ${label}
    </button>`;

  const dot = `<span style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:13px;color:var(--text3);">...</span>`;
  const emptySlot = `<span style="width:34px;height:34px;visibility:hidden;"></span>`;

  function getPageSlots() {
    if (totalPages <= 7) {
      const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
      const leftPad = Math.floor((7 - pages.length) / 2);
      const rightPad = 7 - pages.length - leftPad;
      return [
        ...Array(leftPad).fill(null),
        ...pages,
        ...Array(rightPad).fill(null),
      ];
    }

    if (currentPage <= 4) return [1, 2, 3, 4, 5, 'dots', totalPages];
    if (currentPage >= totalPages - 3) {
      return [1, 'dots', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, 'dots', currentPage - 1, currentPage, currentPage + 1, 'dots', totalPages];
  }

  const pageButtons = getPageSlots().map(slot => {
    if (slot === null) return emptySlot;
    if (slot === 'dots') return dot;
    return navBtn(slot, `goPageNum(${slot})`, slot === currentPage);
  }).join('');

  const pageSizeSelect = `
    <select onchange="changePageSize(this.value)" title="Sayfa başına kayıt"
      style="height:26px;padding:0 6px;border-radius:8px;border:0.5px solid var(--border2);
             background:var(--surface);color:var(--text2);font-family:var(--font);
             font-size:11.5px;cursor:pointer;">
      ${PAGE_SIZE_OPTIONS.map(n => `<option value="${n}" ${n === PAGE_SIZE ? 'selected' : ''}>${n} / sayfa</option>`).join('')}
    </select>`;

  pg.innerHTML = `
    <div style="display:grid;grid-template-columns:minmax(150px,1fr) auto minmax(150px,1fr);align-items:center;gap:14px;width:100%;padding:0 4px;">
      <span style="font-size:12px;color:var(--text3);white-space:nowrap;min-width:110px;text-align:right;">
        ${total} kayıt · ${start}–${end}
      </span>
      <div style="display:flex;align-items:center;gap:4px;padding:4px;
                  border:0.5px solid var(--border2);border-radius:14px;
                  background:var(--surface2);box-shadow:0 1px 2px rgba(15, 23, 42, 0.04);">
        ${navBtn('‹', 'goPageDelta(-1)', false, currentPage === 1)}
        <div style="width:262px;display:grid;grid-template-columns:repeat(7,34px);align-items:center;justify-content:center;gap:4px;flex-shrink:0;">
          ${pageButtons}
        </div>
        ${navBtn('›', 'goPageDelta(1)', false, currentPage === totalPages)}
      </div>
      <div style="display:flex;align-items:center;gap:10px;justify-content:flex-end;white-space:nowrap;">
        <span style="font-size:12px;color:var(--text3);">Sayfa ${currentPage}/${totalPages}</span>
        ${pageSizeSelect}
      </div>
    </div>
  `;
}

function goPageNum(n) {
  currentPage = n;
  renderPage();
  // Tablonun başına scroll
  document.getElementById('shipments-table-wrapper')?.scrollTo({top: 0, behavior: 'smooth'});
}

function goPageDelta(d) {
  const totalPages = Math.max(1, Math.ceil(filteredList.length / PAGE_SIZE));
  currentPage = Math.max(1, Math.min(totalPages, currentPage + d));
  renderPage();
  document.getElementById('shipments-table-wrapper')?.scrollTo({top: 0, behavior: 'smooth'});
}

function renderShipments(list, fullList) {
  // Özet: her zaman tüm filtrelenmiş listeden hesapla
  const summaryList = fullList || list;
  const wrapper = document.getElementById('shipments-table-wrapper');
  if (!wrapper) return;

  // Özet şerit — her zaman tüm filtrelenmiş listeden hesapla (sayfalama etkilemez)
  const grupTemsilciOzet = new Set();
  let toplam = 0;
  summaryList.forEach(item => {
    if (!item.sefer_id) {
      toplam++;
    } else if (!grupTemsilciOzet.has(item.sefer_id)) {
      grupTemsilciOzet.add(item.sefer_id);
      toplam++;
    }
  });
  const faturaEur  = summaryList.reduce((s, r) => s + (parseFloat(r.fatura_bedeli_eur) || 0), 0);
  const faturaTl   = summaryList.reduce((s, r) => s + (parseFloat(r.fatura_bedeli_tl)  || 0), 0);
  const faturaUsd  = summaryList.reduce((s, r) => {
    const tl  = parseFloat(r.fatura_bedeli_tl) || 0;
    const kur = parseFloat(r.usd_kuru) || 0;
    return s + (kur > 0 ? tl / kur : 0);
  }, 0);
  const navlunEur  = summaryList.reduce((s, r) => s + (parseFloat(r.navlun_eur) || 0), 0);
  const sigortaEur = summaryList.reduce((s, r) => s + (parseFloat(r.sigorta_eur) || 0), 0);
  const fmt    = val => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + ' €';
  const fmtTl  = val => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + ' ₺';
  const fmtUsd = val => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + ' $';

  const ozet = document.getElementById('shipments-ozet');
  if (ozet) {
    ozet.innerHTML = ozetHtml({ toplam, kayit: summaryList.length, faturaEur, faturaTl, faturaUsd, navlunEur, sigortaEur, fmt, fmtTl, fmtUsd });
  }

  // Sütun genişlikleri kullanıcı ayarından (localStorage) gelir; tablo %100
  // genişlikte olduğu için px değerleri orantı olarak kullanılır ve hepsi sığar.
  const g = k => `width:${colWidths[k]}px;`;

  wrapper.innerHTML = `
    <table class="shipments-modern-table" style="width:100%;min-width:0;table-layout:fixed;">
      <thead>
        <tr>
          <th class="shipments-th shipments-check-th shipments-sticky-l0" style="width:${SECIM_KOLON_GENISLIK}px;">
            <input type="checkbox" id="chk-all" onclick="toggleTumSatirlar(this)" class="role-write-only"
              style="width:14px;height:14px;accent-color:var(--accent);cursor:pointer;">
          </th>
          ${thCell('Dosya No',        'ihracat_dosya_no', `${g('ihracat_dosya_no')}left:${SECIM_KOLON_GENISLIK}px;`, 'shipments-sticky-l1')}
          ${thCell('Fatura No',       'fatura_no',        `${g('fatura_no')}overflow:hidden;text-overflow:ellipsis;`)}
          ${thCell('Palet',           'palet',            `${g('palet')}`, 'th-ortala')}
          ${thCell('Depo',            '_depo',            `${g('_depo')}`, 'th-ortala')}
          ${thCell('Ülke',            'ulke',             `${g('ulke')}`)}
          ${thCell('Nakliyeci',       'nakliye_firmasi',  `${g('nakliye_firmasi')}`)}
          ${thCell('Plaka',           'plaka',            `${g('plaka')}`)}
          ${thCell('Grup',            'sefer_id',         `${g('sefer_id')}`, 'th-ortala')}
          ${thCell('Fatura EUR',      'fatura_bedeli_eur',`${g('fatura_bedeli_eur')}`, 'th-saga')}
          ${thCell('Durum',           'durum',            `${g('durum')}right:0;`, 'th-ortala shipments-sticky-r')}
        </tr>
      </thead>
      <tbody id="shipments-tbody">
        ${list.length === 0
          ? `<tr><td colspan="11" style="text-align:center;padding:40px;color:var(--text3);font-size:13px;">Sevkiyat bulunamadı</td></tr>`
          : list.map((s, idx) => {
              const durumNorm = durumGoster(s, allShipments);
              const isAnt    = s.fatura_no?.startsWith('ANT');
              // Gruplu (sefer_id var) = mevcut renk; Komple (grupsuz) = ANT kırmızı / IHR yeşil
              const isGrouped = !!s.sefer_id;
              const depoCls  = isAnt
                ? (isGrouped ? 'shipment-pill-ant' : 'shipment-pill-ant-komple')
                : (isGrouped ? 'shipment-pill-ihr' : 'shipment-pill-ihr-komple');
              const depoTag  = `<span class="shipment-pill ${depoCls}">${isAnt ? 'ANT' : 'IHR'}</span>`;
              return `
                <tr class="shipments-row" data-id="${s.id}" onclick="openShipmentDetail(${s.id})"
                    style="--durum-renk:${durumRenk(durumNorm)};">
                  <td class="shipments-td shipments-check-td shipments-sticky-l0" onclick="event.stopPropagation()">
                    <input type="checkbox" data-id="${s.id}" class="role-write-only"
                      ${seciliSatirlar.has(s.id) ? 'checked' : ''}
                      onclick="toggleSatirSec(event, ${s.id})"
                      style="width:14px;height:14px;accent-color:var(--accent);cursor:pointer;">
                  </td>
                  <td class="shipments-td shipments-cell-strong shipments-sticky-l1" style="left:${SECIM_KOLON_GENISLIK}px;">${escapeHtml(s.ihracat_dosya_no) || '-'}</td>
                  <td class="shipments-td shipments-cell-mono shipments-cell-clip">${escapeHtml(s.fatura_no) || '-'}</td>
                  <td class="shipments-td shipments-cell-center">${escapeHtml(s.palet) || '-'}</td>
                  <td class="shipments-td shipments-cell-depo">${depoTag}</td>
                  <td class="shipments-td shipments-cell-clip">${escapeHtml(s.ulke) || '-'}</td>
                  <td class="shipments-td shipments-cell-clip">${escapeHtml(s.nakliye_firmasi) || '-'}</td>
                  <td class="shipments-td shipments-cell-clip shipments-cell-plate">${escapeHtml(s.plaka) || '-'}</td>
                  <td class="shipments-td shipments-cell-group">
                    ${s.sefer_id ? `<span class="shipment-pill shipment-pill-group"><i class="ti ti-link" aria-hidden="true"></i>G${escapeHtml(s.sefer_id)}</span>` : '<span class="shipments-empty">-</span>'}
                  </td>
                  <td class="shipments-td shipments-cell-money">${formatEUR(s.fatura_bedeli_eur)}</td>
                  <td class="shipments-td shipments-cell-durum shipments-sticky-r" style="right:0;">
                    <span class="shipment-pill" style="${durumStyle(durumNorm)}">${durumNorm}</span>${gecikmeBadge(durumNorm, s.yukleme_tarihi)}
                  </td>
                </tr>`;
            }).join('')}
      </tbody>
    </table>`;
  if (!document.querySelector('#shipments-table-wrapper .col-resize-handle')) {
    setTimeout(initColResize, 0);
  }

  // Sabitlenen sütunların kenar gölgesi yalnızca yatay kaydırma varken görünsün
  if (!wrapper._xScrollBound) {
    wrapper._xScrollBound = true;
    const isaretle = () => {
      wrapper.classList.toggle('x-sol-kaydi', wrapper.scrollLeft > 0);
      wrapper.classList.toggle('x-sag-var', wrapper.scrollLeft + wrapper.clientWidth < wrapper.scrollWidth - 1);
    };
    wrapper.addEventListener('scroll', isaretle, { passive: true });
    wrapper._markXScroll = isaretle;
  }
  // Sabit kolon offset'i seçim kolonunun gerçek genişliğine göre hizalanır
  requestAnimationFrame(() => {
    hizalaSabitKolonOffset(wrapper);
    wrapper._markXScroll?.();
  });
}

// ── GECİKME GÖSTERGESİ (yükleme tarihinden bu yana geçen süre) ───────────────
const GECIKME_UYARI_GUN  = 15;
const GECIKME_KRITIK_GUN = 30;

function gecikmeGunSayisi(yuklemeTarihi) {
  if (!yuklemeTarihi) return null;
  const t = Date.parse(yuklemeTarihi);
  if (isNaN(t)) return null;
  const gun = Math.floor((Date.now() - t) / 86400000);
  return gun >= 0 ? gun : null;
}

function gecikmeBadge(durumNorm, yuklemeTarihi) {
  if (durumNorm === 'TESLİM EDİLDİ') return '';
  const gun = gecikmeGunSayisi(yuklemeTarihi);
  if (gun === null || gun < GECIKME_UYARI_GUN) return '';
  const renk = gun >= GECIKME_KRITIK_GUN ? 'var(--error)' : 'var(--warning)';
  return `<span title="Yüklemeden bu yana ${gun} gün geçti" style="margin-left:6px;font-size:10.5px;font-weight:700;color:${renk};white-space:nowrap;">${gun}g</span>`;
}

// Satır sol kenarındaki durum şeridi için tam doygunlukta renk
function durumRenk(durum) {
  if (durum === 'Yüklenecek')    return '#7C3AED';
  if (durum === 'YOLDA')         return '#C2751A';
  if (durum === 'TESLİM EDİLDİ') return '#3F7A14';
  if (durum === 'Varış Gümrük')  return '#1668B8';
  return '#9CA3AF';
}

function durumStyle(durum) {
  if (durum === 'Yüklenecek')    return 'background:#F3E8FD;color:#6B21A8;';
  if (durum === 'YOLDA')         return 'background:#FAEEDA;color:#633806;';
  if (durum === 'TESLİM EDİLDİ') return 'background:#EAF3DE;color:#27500A;';
  if (durum === 'Varış Gümrük')  return 'background:#E6F1FB;color:#0C447C;';
  if (durum === 'HAZIRLANIYOR')  return 'background:#F1EFE8;color:#5F5E5A;';
  return 'background:#F1EFE8;color:#5F5E5A;';
}

function formatDateInput(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  return d.toISOString().split('T')[0];
}

function formatEUR(val) {
  if (!val && val !== 0) return '-';
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + ' €';
}

function needsFreightRepair(s) {
  const ulke = String(s?.ulke || '').toUpperCase();
  const navlun = parseFloat(s?.navlun_eur) || 0;
  const sigorta = parseFloat(s?.sigorta_eur) || 0;
  const faturaEur = parseFloat(s?.fatura_bedeli_eur) || 0;
  const malEur = parseFloat(s?.mal_bedeli_eur) || 0;
  if (ulke === 'SIRBİSTAN' || ulke === 'SIRBISTAN') {
    return malEur < 0 || (faturaEur > 0 && navlun > faturaEur);
  }
  if (ulke === 'BOSNA') return navlun === 0 && sigorta === 0;
  if (ulke === 'GÜRCİSTAN' || ulke === 'GURCISTAN') {
    return navlun > 0 && navlun < 100 && sigorta >= 0 && sigorta < 1;
  }
  return false;
}

async function repairShipmentFreightIfNeeded(shipment, token) {
  if (!needsFreightRepair(shipment)) return shipment;
  try {
    const res = await fetch('/api/shipments/repair-freight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ id: shipment.id, fatura_no: shipment.fatura_no }),
    });
    const data = await res.json();
    if (data.success && data.shipment) {
      allShipments = [];
      filteredList = [];
      return data.shipment;
    }
  } catch (e) {
    console.warn('Navlun/sigorta onarım hatası:', e);
  }
  return shipment;
}

async function openShipmentDetail(id) {
  const token = localStorage.getItem('fa_auth_token');
  const res = await fetch(`/api/shipments?id=${id}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  if (!data.success) return;

  renderShipmentDetail(data.shipment);

  repairShipmentFreightIfNeeded(data.shipment, token).then(repaired => {
    if (!repaired || repaired === data.shipment) return;
    const activeId = document.getElementById('detail-id')?.value;
    if (String(activeId) !== String(id)) return;
    renderShipmentDetail(repaired);
    const tbody = document.getElementById('shipments-tbody');
    if (tbody) tbody.innerHTML = '';
    if (typeof loadShipments === 'function') loadShipments();
  });
}

function renderShipmentDetail(s) {
  const panel   = document.getElementById('shipment-detail-panel');
  const overlay = document.getElementById('shipment-overlay');
  if (!panel || !overlay) return;

  document.getElementById('detail-dosya-no').textContent  = s.ihracat_dosya_no || '-';
  document.getElementById('detail-fatura-no').textContent = s.fatura_no || '-';
  document.getElementById('detail-ulke').textContent      = s.ulke || '-';
  document.getElementById('detail-id').value              = s.id;

  document.getElementById('edit-dosya-no').value      = s.ihracat_dosya_no || '';
  document.getElementById('edit-nakliye').value       = s.nakliye_firmasi || '';
  document.getElementById('edit-plaka').value         = s.plaka || '';
  document.getElementById('edit-palet').value         = s.palet || '';
  document.getElementById('edit-durum').value         = normalizeDurum(s.durum);
  document.getElementById('edit-varis').value         = s.varis_tarihi || '';
  document.getElementById('edit-gumruk-bitis').value  = s.gumrukleme_bitis || '';
  document.getElementById('edit-beyanname-tl').value  = s.ihracat_beyanname_tl || '';
  document.getElementById('edit-beyanname-eur').value = s.ihracat_beyanname_eur || '';
  const beyannameUsd = document.getElementById('edit-beyanname-usd');
  if (beyannameUsd) beyannameUsd.value = s.ihracat_beyanname_usd || '';
  document.getElementById('edit-bekleme').value       = s.arac_bekleme || '';
  document.getElementById('edit-brokerage').value     = s.brokerage_eur || '';
  document.getElementById('edit-other-costs').value   = s.other_costs_eur || '';
  document.getElementById('edit-gumruk-v').value      = s.gumruk_vergisi_eur || '';
  document.getElementById('edit-kdv').value           = s.kdv_eur || '';
  document.getElementById('edit-fatura-tl').value     = s.fatura_bedeli_tl || '';
  document.getElementById('edit-fatura-eur').value    = s.fatura_bedeli_eur || '';
  document.getElementById('edit-mal-eur').value       = s.mal_bedeli_eur || '';
  document.getElementById('edit-navlun').value        = s.navlun_eur || '';
  document.getElementById('edit-sigorta').value       = s.sigorta_eur || '';
  document.getElementById('edit-kur').value           = s.eur_kuru || '';
  document.getElementById('edit-navlun-usd').value    = s.navlun_usd || '';
  document.getElementById('edit-sigorta-usd').value   = s.sigorta_usd || '';
  document.getElementById('edit-usd-kur').value       = s.usd_kuru || '';
  document.getElementById('edit-yukleme').value       = formatDateInput(s.yukleme_tarihi);
  document.getElementById('edit-gumruk-tarihi').value = formatDateInput(s.gumruk_tarihi);
  document.getElementById('edit-varis').value         = formatDateInput(s.varis_tarihi);
  document.getElementById('edit-gumruk-bitis').value  = formatDateInput(s.gumrukleme_bitis);

  const newFields = document.getElementById('new-shipment-fields');
  if (newFields) newFields.style.display = 'none';

  // Gruptan çıkar butonu — gruplanmışsa göster
  const gruplaBtn = document.getElementById('grupla-btn');
  if (gruplaBtn) {
    if (s.sefer_id) {
      gruplaBtn.innerHTML = '🔗 Grubu Düzenle';
      gruplaBtn.onclick = () => openGruplaModal();
    } else {
      gruplaBtn.innerHTML = '🔗 Grupla';
      gruplaBtn.onclick = () => openGruplaModal();
    }
  }

  // Gruptan çıkar butonunu göster/gizle
  let ungroupBtn = document.getElementById('ungroup-btn');
  if (!ungroupBtn) {
    ungroupBtn = document.createElement('button');
    ungroupBtn.id = 'ungroup-btn';
    ungroupBtn.style.cssText = 'padding:7px 14px;border-radius:var(--radius-md);border:0.5px solid var(--text3);background:transparent;color:var(--text3);font-family:var(--font);font-size:12.5px;font-weight:500;cursor:pointer;';
    ungroupBtn.onclick = () => ungroupShipment();
    const footer = document.querySelector('.detail-footer');
    const gruplaB = document.getElementById('grupla-btn');
    footer.insertBefore(ungroupBtn, gruplaB);
  }
  if (s.sefer_id) {
    ungroupBtn.style.display = 'inline-block';
    ungroupBtn.innerHTML = '🔓 Gruptan Çıkar';
  } else {
    ungroupBtn.style.display = 'none';
  }
  // Sırbistan ise vergi PDF alanını göster, değilse gizle
  const vergiPdfSection = document.getElementById('vergi-pdf-section');
  if (vergiPdfSection) {
    vergiPdfSection.style.display = s.ulke?.toUpperCase() === 'SIRBİSTAN' ? 'block' : 'none';
  }
  // Her popup açılışında vergi PDF status ve input'u sıfırla
  const vergiStatus = document.getElementById('vergi-pdf-status');
  if (vergiStatus) {
    vergiStatus.textContent = 'PDF\'i buraya sürükleyin veya tıklayın — Gümrük, KDV veya Brokerage Fee & Other Costs EUR otomatik dolar';
    vergiStatus.style.color = 'var(--text3)';
  }
  const vergiInput = document.getElementById('vergi-pdf-input');
  if (vergiInput) vergiInput.value = '';
  _shipmentDetailAcAnim(panel, overlay);
  overlay.style.display = 'block';
  panel.style.display   = 'flex';
}

// Çekmece kapanırken sağa kayar; gizleme animasyon bitince yapılır.
// Bu arada panel yeniden açılırsa (is-closing kalkar) gizleme iptal olur.
let _shipmentDetailKapatTimer = null;
function _shipmentDetailAcAnim(panel, overlay) {
  clearTimeout(_shipmentDetailKapatTimer);
  panel.classList.remove('is-closing');
  overlay.classList.remove('is-closing');
}

function closeShipmentDetail() {
  const panel   = document.getElementById('shipment-detail-panel');
  const overlay = document.getElementById('shipment-overlay');
  if (!panel || !overlay || panel.style.display === 'none' || panel.style.display === '') {
    if (panel)   panel.style.display   = 'none';
    if (overlay) overlay.style.display = 'none';
    const nf = document.getElementById('new-shipment-fields');
    if (nf) nf.style.display = 'none';
    return;
  }
  panel.classList.add('is-closing');
  overlay.classList.add('is-closing');
  clearTimeout(_shipmentDetailKapatTimer);
  _shipmentDetailKapatTimer = setTimeout(() => {
    if (!panel.classList.contains('is-closing')) return;
    panel.style.display   = 'none';
    overlay.style.display = 'none';
    panel.classList.remove('is-closing');
    overlay.classList.remove('is-closing');
    const newFields = document.getElementById('new-shipment-fields');
    if (newFields) newFields.style.display = 'none';
  }, 220);
}

async function saveShipmentDetail() {
  const token = localStorage.getItem('fa_auth_token');
  const id    = document.getElementById('detail-id').value;
  const isNew = !id;

  if (isNew) {
    const body = {
      ihracat_dosya_no:  document.getElementById('new-dosya-no').value,
      fatura_no:         document.getElementById('new-fatura-no').value,
      ulke:              document.getElementById('new-ulke').value,
      nakliye_firmasi:   document.getElementById('edit-nakliye').value,
      plaka:             document.getElementById('edit-plaka').value,
      durum:             document.getElementById('edit-durum').value,
      yukleme_tarihi:    document.getElementById('new-yukleme').value,
      gumruk_tarihi:     document.getElementById('edit-gumruk-tarihi').value || null,
      varis_tarihi:      document.getElementById('edit-varis').value || null,
      gumrukleme_bitis:  document.getElementById('edit-gumruk-bitis').value || null,
      fatura_bedeli_tl:  parseFloat(document.getElementById('new-fatura-tl').value)  || 0,
      fatura_bedeli_eur: parseFloat(document.getElementById('new-fatura-eur').value) || 0,
      mal_bedeli_eur:    parseFloat(document.getElementById('new-mal-eur').value)     || 0,
      navlun_eur:        parseFloat(document.getElementById('new-navlun').value)      || 0,
      sigorta_eur:       parseFloat(document.getElementById('new-sigorta').value)     || 0,
      eur_kuru:          parseFloat(document.getElementById('new-kur').value)         || 0,
      navlun_usd:        parseFloat(document.getElementById('new-navlun-usd').value)  || 0,
      sigorta_usd:       parseFloat(document.getElementById('new-sigorta-usd').value) || 0,
      usd_kuru:          parseFloat(document.getElementById('new-usd-kur').value)     || 0,
    };
    const res  = await fetch('/api/shipments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.success) { closeShipmentDetail(); allShipments = []; filteredList = []; currentPage = 1; const tbody = document.getElementById('shipments-tbody'); if (tbody) tbody.innerHTML = ''; loadShipments(); }
    else alert('Kayıt hatası: ' + (data.error || 'Bilinmeyen hata'));

  } else {
    const body = {
      id:                    parseInt(id),
      ihracat_dosya_no:      document.getElementById('edit-dosya-no').value.trim(),
      nakliye_firmasi:       document.getElementById('edit-nakliye').value,
      plaka:                 document.getElementById('edit-plaka').value,
      palet:                 document.getElementById('edit-palet').value.trim() || null,
      durum:                 document.getElementById('edit-durum').value,
      yukleme_tarihi:        document.getElementById('edit-yukleme').value || null,
      gumruk_tarihi:         document.getElementById('edit-gumruk-tarihi').value || null,
      varis_tarihi:          document.getElementById('edit-varis').value || null,
      gumrukleme_bitis:      document.getElementById('edit-gumruk-bitis').value || null,
      fatura_bedeli_tl:      parseFloat(document.getElementById('edit-fatura-tl').value)  || 0,
      fatura_bedeli_eur:     parseFloat(document.getElementById('edit-fatura-eur').value) || 0,
      mal_bedeli_eur:        parseFloat(document.getElementById('edit-mal-eur').value)     || 0,
      navlun_eur:            parseFloat(document.getElementById('edit-navlun').value)      || 0,
      sigorta_eur:           parseFloat(document.getElementById('edit-sigorta').value)     || 0,
      eur_kuru:              parseFloat(document.getElementById('edit-kur').value)         || 0,
      navlun_usd:            parseFloat(document.getElementById('edit-navlun-usd').value)  || 0,
      sigorta_usd:           parseFloat(document.getElementById('edit-sigorta-usd').value) || 0,
      usd_kuru:              parseFloat(document.getElementById('edit-usd-kur').value)     || 0,
      ihracat_beyanname_tl:  parseFloat(document.getElementById('edit-beyanname-tl').value)  || 0,
      ihracat_beyanname_eur: parseFloat(document.getElementById('edit-beyanname-eur').value) || 0,
      ihracat_beyanname_usd: parseFloat(document.getElementById('edit-beyanname-usd')?.value) || 0,
      arac_bekleme:          parseFloat(document.getElementById('edit-bekleme').value)        || 0,
      brokerage_eur:         parseFloat(document.getElementById('edit-brokerage').value)      || 0,
      other_costs_eur:       parseFloat(document.getElementById('edit-other-costs').value)    || 0,
      gumruk_vergisi_eur:    parseFloat(document.getElementById('edit-gumruk-v').value)       || 0,
      kdv_eur:               parseFloat(document.getElementById('edit-kdv').value)            || 0,
    };
    const res  = await fetch('/api/shipments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.success) { closeShipmentDetail(); filteredList = []; yenileGorunumuKoruyarak(); }
    else alert('Kayıt hatası: ' + (data.error || 'Bilinmeyen hata'));
  }
}

// Ülke filtresine göre Maliyet Raporu dosya adını üretir.
// Hiç seçim yok veya tüm ülkeler seçili ise "Tüm Ülkeler Maliyet Raporu",
// aksi halde seçili ülkeler "Belçika, Sırbistan Maliyet Raporu" biçiminde yazılır.
function buildMaliyetDosyaAdi() {
  const checkboxes = [...document.querySelectorAll('#dd-ulke-menu input[type=checkbox]')];
  const secili = checkboxes.filter(cb => cb.checked);

  let etiket;
  if (secili.length === 0 || secili.length === checkboxes.length) {
    etiket = 'Tüm Ülkeler';
  } else {
    etiket = secili
      .map(cb => cb.closest('.dd-item')?.querySelector('span')?.textContent.trim() || cb.value)
      .join(', ');
  }
  return `${etiket} Maliyet Raporu.xlsx`;
}

async function downloadMaliyetRaporu() {
  const token = localStorage.getItem('fa_auth_token');

  // Tüm filtrelenmiş listeyi kullan (sadece mevcut sayfa değil)
  const allFilteredIds = filteredList.map(s => s.id);

  let url = '/api/shipments/export';
  const params = [];
  if (allFilteredIds.length > 0)
    params.push(`ids=${allFilteredIds.join(',')}`);
  if (params.length) url += '?' + params.join('&');

  try {
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    const contentType = res.headers.get('Content-Type') || '';
    if (!res.ok || contentType.includes('application/json')) {
      const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      alert('Rapor indirilemedi: ' + (errData.error || errData.message || 'Sunucu hatası'));
      return;
    }
    const blob = await res.blob();
    if (blob.size === 0) { alert('Rapor boş geldi.'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = buildMaliyetDosyaAdi();
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) {
    console.error('Rapor indirme hatası:', e);
    alert('Rapor indirilemedi: ' + e.message);
  }
}

function openNewShipmentForm() {
  const panel   = document.getElementById('shipment-detail-panel');
  const overlay = document.getElementById('shipment-overlay');
  if (!panel || !overlay) return;

  document.getElementById('detail-dosya-no').textContent  = 'Yeni Sevkiyat';
  document.getElementById('detail-fatura-no').textContent = '';
  document.getElementById('detail-ulke').textContent      = '';
  document.getElementById('detail-id').value              = '';

  ['edit-nakliye','edit-plaka','edit-varis','edit-gumruk-bitis',
   'edit-beyanname-tl','edit-beyanname-eur','edit-beyanname-usd','edit-bekleme',
   'edit-brokerage','edit-gumruk-v','edit-kdv'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('edit-durum').value = 'YOLDA';

  document.getElementById('new-shipment-fields').style.display = 'block';
  _shipmentDetailAcAnim(panel, overlay);
  overlay.style.display = 'block';
  panel.style.display   = 'flex';
}

function deleteShipment() {
  const id = document.getElementById('detail-id').value;
  if (!id) return;

  const dosyaNo = document.getElementById('detail-dosya-no')?.textContent || '';
  const faturaNo = document.getElementById('detail-fatura-no')?.textContent || '';

  showMiniModal('🗑 Sevkiyatı Sil', `
    <div style="padding:12px 14px;background:#FFF5F5;border:0.5px solid #FECACA;
                border-radius:var(--radius-md);
                display:flex;gap:10px;align-items:flex-start;">
      <span style="font-size:20px;flex-shrink:0;">⚠️</span>
      <div>
        <div style="font-size:13px;font-weight:600;color:#B91C1C;margin-bottom:4px;">
          Bu işlem geri alınamaz!
        </div>
        <div style="font-size:12px;color:#DC2626;">
          <b>${dosyaNo}${faturaNo ? ' · ' + faturaNo : ''}</b> kalıcı olarak silinecek.
        </div>
      </div>
    </div>`,
    [
      { label: 'Vazgeç', style: 'ghost', action: null },
      { label: '🗑 Evet, Sil', style: 'danger', action: async () => {
        const token = localStorage.getItem('fa_auth_token');
        const res   = await fetch('/api/shipments', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ id: parseInt(id) }),
        });
        const data = await res.json();
        if (data.success) { closeShipmentDetail(); filteredList = []; yenileGorunumuKoruyarak(); }
        else showMiniModal('⚠️ Hata', 'Silme hatası: ' + (data.error || 'Bilinmeyen hata'), [{ label: 'Tamam', style: 'primary', action: null }]);
      }}
    ]
  );
}

// ── CUSTOM DROPDOWN ───────────────────────────────────────────────────────────
let selectedUlkeler = new Set();

function toggleDD(id) {
  const dd = document.getElementById(id);
  const isOpen = dd.classList.contains('open');
  document.querySelectorAll('.custom-dd.open').forEach(d => d.classList.remove('open'));
  if (!isOpen) {
    dd.classList.add('open');
    // Menü pozisyonunu butonun altına fixed olarak ayarla
    const btn = dd.querySelector('.custom-dd-btn');
    const menu = dd.querySelector('.custom-dd-menu');
    const rect = btn.getBoundingClientRect();
    menu.style.top  = (rect.bottom + 6) + 'px';
    menu.style.left = rect.left + 'px';
    // Menü ekranın altına taşmasın; sığmazsa kendi içinde kaydırılır
    menu.style.maxHeight = Math.max(200, window.innerHeight - rect.bottom - 18) + 'px';
  }
}

// Dışarı tıklayınca kapat
document.addEventListener('click', e => {
  if (!e.target.closest('.custom-dd')) {
    document.querySelectorAll('.custom-dd.open').forEach(d => d.classList.remove('open'));
  }
});

function onDDChange(type, input) {
  if (['tip', 'durum', 'ay', 'yil'].includes(type)) {
    updateMultiDropdownFilter(type, input);
    return;
  }

  document.querySelectorAll('.custom-dd.open').forEach(d => d.classList.remove('open'));
  const val = input.value;
  if (type === 'depo') {
    document.getElementById('filter-depo').value = val;
    const btn = document.querySelector('#dd-depo .custom-dd-btn');
    const label = document.getElementById('dd-depo-label');
    label.textContent = val ? val : 'Depolar';
    btn.classList.toggle('active', !!val);
  }
  applyFiltersAndRender();
}

function onMultiDDApply(type) {
  if (type === 'donem') {
    commitMultiDropdownFilter('ay');
    commitMultiDropdownFilter('yil');
  } else {
    commitMultiDropdownFilter(type);
  }
  applyFiltersAndRender();
  document.getElementById(`dd-${type}`)?.classList.remove('open');
}

// Dönem (Ay + Yıl) butonunun etiketini seçili chip'lere göre günceller.
function updateDonemLabel() {
  const secili = name => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(i => i.value);
  const aylar  = secili('dd-ay-r');
  const yillar = secili('dd-yil-r');
  const ayText  = aylar.length === 1 ? ayAdlari[aylar[0]] : aylar.length ? `${aylar.length} Ay` : '';
  const yilText = yillar.length === 1 ? yillar[0] : yillar.length ? `${yillar.length} Yıl` : '';

  let text = 'Dönem';
  if (ayText && yilText) text = (aylar.length === 1 && yillar.length === 1) ? `${ayText} ${yilText}` : `${ayText} · ${yilText}`;
  else if (ayText || yilText) text = ayText || yilText;

  document.getElementById('dd-donem-label').textContent = text;
  decorateDonemSayilari();
  document.querySelector('#dd-donem .custom-dd-btn')?.classList.toggle('active', text !== 'Dönem');
}

function clearDonemFilter() {
  document.querySelectorAll('input[name="dd-ay-r"], input[name="dd-yil-r"]').forEach(i => i.checked = false);
  updateDonemLabel();
  onMultiDDApply('donem');
}

const ayAdlari = {'01':'Ocak','02':'Şubat','03':'Mart','04':'Nisan','05':'Mayıs','06':'Haziran','07':'Temmuz','08':'Ağustos','09':'Eylül','10':'Ekim','11':'Kasım','12':'Aralık'};

const multiDropdownFilters = {
  tip: {
    inputName: 'dd-tip-r',
    hiddenId: 'filter-musteri-tipi',
    labelId: 'dd-tip-label',
    buttonSelector: '#dd-tip .custom-dd-btn',
    emptyLabel: 'Tipler',
    countLabel: 'Tip',
    format: val => val.charAt(0).toUpperCase() + val.slice(1)
  },
  durum: {
    inputName: 'dd-durum-r',
    hiddenId: 'filter-durum',
    labelId: 'dd-durum-label',
    buttonSelector: '#dd-durum .custom-dd-btn',
    emptyLabel: 'Durumlar',
    countLabel: 'seçili',
    // Menüdeki okunur adı göster (YOLDA → Yolda)
    format: val => document.querySelector(`input[name="dd-durum-r"][value="${val}"] + span`)?.textContent || val
  },
  ay: {
    inputName: 'dd-ay-r',
    hiddenId: 'filter-ay',
    donem: true
  },
  yil: {
    inputName: 'dd-yil-r',
    hiddenId: 'filter-yil',
    donem: true
  }
};

// Sevkiyat verisindeki mevcut yıllara göre Yıl filtresi seçeneklerini üretir.
function populateYilFilterOptions() {
  const menu = document.getElementById('dd-yil-menu');
  if (!menu) return;
  const yillar = [...new Set(allShipments
    .map(s => (s.yukleme_tarihi || '').slice(0, 4))
    .filter(y => /^\d{4}$/.test(y)))]
    .sort((a, b) => b.localeCompare(a));

  // Mevcut seçimleri koru (liste yeniden üretilince kaybolmasın)
  const secili = new Set([...menu.querySelectorAll('input:checked')].map(i => i.value));
  menu.innerHTML = '';
  yillar.forEach(y => {
    const label = document.createElement('label');
    label.className = 'dd-chip';
    label.innerHTML = `<input type="checkbox" name="dd-yil-r" value="${y}" onchange="onDDChange('yil',this)"><span>${y}</span>`;
    label.querySelector('input').checked = secili.has(y);
    menu.appendChild(label);
  });
}

function updateMultiDropdownFilter(type, changedInput) {
  const config = multiDropdownFilters[type];
  if (!config) return;

  const inputs = [...document.querySelectorAll(`input[name="${config.inputName}"]`)];
  const allInput = inputs.find(input => input.value === '');

  if (changedInput.value === '' && changedInput.checked) {
    inputs.forEach(input => {
      if (input.value !== '') input.checked = false;
    });
  } else {
    if (allInput) allInput.checked = false;
  }

  const selected = inputs
    .filter(input => input.value !== '' && input.checked)
    .map(input => input.value);

  if (selected.length === 0 && allInput) allInput.checked = true;

  if (config.donem) {
    updateDonemLabel();
    return;
  }

  const btn = document.querySelector(config.buttonSelector);
  const label = document.getElementById(config.labelId);
  if (selected.length === 0) {
    label.textContent = config.emptyLabel;
    btn.classList.remove('active');
  } else if (selected.length === 1) {
    label.textContent = config.format(selected[0]);
    btn.classList.add('active');
  } else {
    label.textContent = `${selected.length} ${config.countLabel}`;
    btn.classList.add('active');
  }
}

function commitMultiDropdownFilter(type) {
  const config = multiDropdownFilters[type];
  if (!config) return;

  const selected = [...document.querySelectorAll(`input[name="${config.inputName}"]`)]
    .filter(input => input.value !== '' && input.checked)
    .map(input => input.value);

  document.getElementById(config.hiddenId).value = selected.length ? JSON.stringify(selected) : '';
}

// Filtre menüleri görsel zenginleştirme: renk (--grp) + kayıt sayısı.
// Sadece görünüm; filtre mantığına dokunmaz.
const DEPO_RENK = { '': '#64748b', IHR: '#047857', ANT: '#B45309' };

// Sayı gösterilmez (kompakt); kaydı olmayan seçenek soluklaşır, sayı tooltip'te
function setFiltreSayac(item, sayi) {
  item.classList.toggle('dd-bos', sayi === 0);
  item.title = `${sayi} kayıt`;
}

function decorateFilterMenuleri() {
  decorateUlkeMenu();

  const durumSay = {};
  allShipments.forEach(s => {
    const d = durumGoster(s, allShipments);
    durumSay[d] = (durumSay[d] || 0) + 1;
  });
  document.querySelectorAll('input[name="dd-durum-r"]').forEach(input => {
    const item = input.closest('.dd-item');
    item.style.setProperty('--grp', input.value ? durumRenk(input.value) : '#64748b');
    setFiltreSayac(item, input.value ? (durumSay[input.value] || 0) : allShipments.length);
  });

  document.querySelectorAll('input[name="dd-depo-r"]').forEach(input => {
    const item = input.closest('.dd-item');
    item.style.setProperty('--grp', DEPO_RENK[input.value] || '#64748b');
    const sayi = input.value
      ? allShipments.filter(s => (s.fatura_no || '').startsWith(input.value)).length
      : allShipments.length;
    setFiltreSayac(item, sayi);
  });

  decorateDonemSayilari();
}

// Yıl sayıları toplam; ay sayıları seçili yıllara göre (yıl seçili değilse tümü)
function decorateDonemSayilari() {
  const seciliYillar = [...document.querySelectorAll('input[name="dd-yil-r"]:checked')].map(i => i.value);
  const yilSay = {}, aySay = {};
  allShipments.forEach(s => {
    const t = s.yukleme_tarihi || '';
    const y = t.slice(0, 4), m = t.slice(5, 7);
    yilSay[y] = (yilSay[y] || 0) + 1;
    if (!seciliYillar.length || seciliYillar.includes(y)) aySay[m] = (aySay[m] || 0) + 1;
  });
  document.querySelectorAll('input[name="dd-yil-r"]').forEach(input => {
    const chip = input.closest('.dd-chip');
    setFiltreSayac(chip, yilSay[input.value] || 0);
  });
  document.querySelectorAll('input[name="dd-ay-r"]').forEach(input => {
    const chip = input.closest('.dd-chip');
    setFiltreSayac(chip, aySay[input.value] || 0);
  });
}

function decorateUlkeMenu() {
  const menu = document.getElementById('dd-ulke-menu');
  if (!menu) return;
  const sayilar = {};
  allShipments.forEach(s => {
    const u = (s.ulke || '').toUpperCase();
    sayilar[u] = (sayilar[u] || 0) + 1;
  });

  menu.querySelectorAll('.dd-group-toggle').forEach(header => {
    ulkeGrubuInputlari(header).forEach(input => {
      const item = input.closest('.dd-item');
      item.dataset.grup = header.dataset.grup;
      setFiltreSayac(item, sayilar[input.value] || 0);
    });
  });
}

// Ülke menüsündeki grup başlığının altındaki (bir sonraki başlığa kadar) checkbox'lar
function ulkeGrubuInputlari(header) {
  const inputs = [];
  let el = header.nextElementSibling;
  while (el && !el.classList.contains('dd-group-toggle') && !el.classList.contains('dd-apply-row')) {
    const input = el.querySelector('input[type=checkbox]');
    if (input) inputs.push(input);
    el = el.nextElementSibling;
  }
  return inputs;
}

// Grup başlığına tıklama: hepsi seçiliyse kaldırır, değilse tümünü seçer
function toggleUlkeGrubu(header) {
  const inputs = ulkeGrubuInputlari(header);
  const hepsiSecili = inputs.length > 0 && inputs.every(i => i.checked);
  inputs.forEach(i => i.checked = !hepsiSecili);
  onUlkeChange();
}

// Başlık ikonlarını günceller; tam seçili grupların adlarını döner
function updateUlkeGrupDurumu() {
  const tamGruplar = [];
  document.querySelectorAll('#dd-ulke-menu .dd-group-toggle').forEach(header => {
    const inputs = ulkeGrubuInputlari(header);
    const secili = inputs.filter(i => i.checked).length;
    const tam = secili > 0 && secili === inputs.length;
    header.classList.toggle('active', tam);
    header.classList.toggle('partial', secili > 0 && !tam);
    const icon = header.querySelector('.ti');
    if (icon) icon.className = 'ti ' + (tam ? 'ti-square-check' : secili ? 'ti-square-minus' : 'ti-square');
    if (tam) tamGruplar.push({ ad: header.textContent.trim(), sayi: inputs.length });
  });
  return tamGruplar;
}

function onUlkeChange() {
  const checkboxes = document.querySelectorAll('#dd-ulke-menu input[type=checkbox]');
  selectedUlkeler = new Set();
  checkboxes.forEach(cb => { if (cb.checked) selectedUlkeler.add(cb.value); });

  const tamGruplar = updateUlkeGrupDurumu();
  const btn = document.querySelector('#dd-ulke .custom-dd-btn');
  const label = document.getElementById('dd-ulke-label');
  const grupSayisi = tamGruplar.reduce((t, g) => t + g.sayi, 0);
  if (tamGruplar.length > 0 && grupSayisi === selectedUlkeler.size) {
    // Seçim tam olarak bir/birkaç grubun kendisiyse grup adıyla göster
    label.textContent = tamGruplar.map(g => g.ad).join(' + ');
    btn.classList.add('active');
  } else if (selectedUlkeler.size === 0) {
    label.textContent = 'Ülkeler';
    btn.classList.remove('active');
  } else if (selectedUlkeler.size === 1) {
    label.textContent = [...selectedUlkeler][0].charAt(0) + [...selectedUlkeler][0].slice(1).toLowerCase();
    btn.classList.add('active');
  } else {
    label.textContent = `${selectedUlkeler.size} seçili`;
    btn.classList.add('active');
  }
  applyFiltersAndRender();
}

function resetShipmentFilterControls() {
  document.getElementById('filter-ulke').value  = '';
  document.getElementById('filter-durum').value = '';
  document.getElementById('filter-depo').value  = '';
  document.getElementById('filter-musteri-tipi').value = '';
  document.getElementById('filter-ay').value = '';
  document.getElementById('filter-yil').value = '';
  dashboardSeferFilter = '';

  shipmentsSearchQuery = '';
  const searchInput = document.getElementById('shipments-search');
  if (searchInput) searchInput.value = '';
  document.getElementById('shipments-search-btn')?.classList.remove('active');
  const searchPanel = document.getElementById('shipments-search-panel');
  if (searchPanel) searchPanel.style.display = 'none';

  selectedUlkeler = new Set();
  document.querySelectorAll('#dd-ulke-menu input[type=checkbox]').forEach(cb => cb.checked = false);
  updateUlkeGrupDurumu();
  document.querySelectorAll('input[name="dd-tip-r"]').forEach((input, index) => input.checked = index === 0);
  document.querySelectorAll('input[name="dd-durum-r"]').forEach((input, index) => input.checked = index === 0);
  document.querySelectorAll('input[name="dd-depo-r"]').forEach((input, index) => input.checked = index === 0);
  document.querySelectorAll('input[name="dd-ay-r"], input[name="dd-yil-r"]').forEach(input => input.checked = false);

  document.getElementById('dd-tip-label').textContent   = 'Tipler';
  document.getElementById('dd-ulke-label').textContent  = 'Ülkeler';
  document.getElementById('dd-durum-label').textContent = 'Durumlar';
  document.getElementById('dd-depo-label').textContent  = 'Depolar';
  document.getElementById('dd-donem-label').textContent = 'Dönem';
  decorateDonemSayilari();
  document.querySelectorAll('.custom-dd-btn').forEach(b => b.classList.remove('active'));
}

function setRadioFilter(name, value) {
  document.querySelectorAll(`input[name="${name}"]`).forEach(input => {
    input.checked = input.value === value;
  });
}

function applyPendingDashboardShipmentFilter() {
  const filter = window.pendingDashboardShipmentFilter;
  if (!filter) return;
  resetShipmentFilterControls();
  window.pendingDashboardShipmentFilter = null;
  const title = document.getElementById('topbarTitle');
  if (title) title.textContent = 'Sevkiyatlar';

  if (filter.durum) {
    document.getElementById('filter-durum').value = filter.durum;
    document.getElementById('dd-durum-label').textContent = multiDropdownFilters.durum.format(filter.durum);
    document.querySelector('#dd-durum .custom-dd-btn')?.classList.add('active');
    setRadioFilter('dd-durum-r', filter.durum);
    if (title) title.textContent = `Sevkiyatlar · ${filter.durum}`;
  }

  if (filter.seferTipi) {
    dashboardSeferFilter = filter.seferTipi;
    if (title) title.textContent = filter.seferTipi === 'tek'
      ? 'Sevkiyatlar · Tek Araç'
      : 'Sevkiyatlar · Gruplu';
  }
}

function clearFilters() {
  resetShipmentFilterControls();
  const title = document.getElementById('topbarTitle');
  if (title) title.textContent = 'Sevkiyatlar';

  sortColumn = 'ihracat_dosya_no';
  sortDir    = 'desc';
  const tbody = document.getElementById('shipments-tbody');
  if (tbody) tbody.dataset.sortKey = '';
  applyFiltersAndRender();
}

// ── GRUPLAMA ──────────────────────────────────────────────────────────────────
let gruplaHedefId = null;     // popup'ta açık olan sevkiyat id'si
let gruplaSecilen = new Set(); // kullanıcının seçtiği id'ler

function openGruplaModal() {
  const id = document.getElementById('detail-id').value;
  if (!id) return;
  gruplaHedefId = parseInt(id);
  gruplaSecilen = new Set([gruplaHedefId]);

  // Mevcut gruptaki tüm üyeleri baştan ekle
  const hedef = allShipments.find(x => x.id === gruplaHedefId);
  if (hedef?.sefer_id) {
    allShipments.forEach(s => {
      if (s.sefer_id === hedef.sefer_id) gruplaSecilen.add(s.id);
    });
  }

  const liste = document.getElementById('grupla-liste');
  liste.innerHTML = '';

  // Arama kutusu
  const aramaWrapper = document.getElementById('grupla-arama-wrapper');
  if (!aramaWrapper) {
    const aw = document.createElement('div');
    aw.id = 'grupla-arama-wrapper';
    aw.style.cssText = 'margin-bottom:10px;';
    aw.innerHTML = `<input id="grupla-arama" type="text" placeholder="Dosya no, fatura no veya ülke ara..."
      style="width:100%;padding:8px 12px;border-radius:var(--radius-md);border:0.5px solid var(--border2);
             background:var(--surface2);font-family:var(--font);font-size:12px;color:var(--text);outline:none;box-sizing:border-box;"
      oninput="filterGruplaListe()">`;
    liste.parentNode.insertBefore(aw, liste);
  } else {
    document.getElementById('grupla-arama').value = '';
  }

  // Mevcut sevkiyatları listele — kendisi hariç
  allShipments.forEach(s => {
    if (s.id === gruplaHedefId) return;

    // Zaten aynı gruptaysa işaretle
    const hedefItem = allShipments.find(x => x.id === gruplaHedefId);
    const ayniGrup = hedefItem?.sefer_id && s.sefer_id === hedefItem.sefer_id;
    if (ayniGrup) gruplaSecilen.add(s.id);

    const checked = ayniGrup;
    const item = document.createElement('label');
    item.style.cssText = `display:flex;align-items:center;gap:10px;padding:8px 12px;
      border-radius:var(--radius-md);border:0.5px solid var(--border2);
      background:var(--surface2);cursor:pointer;font-size:12px;`;
    item.innerHTML = `
      <input type="checkbox" data-id="${s.id}" ${checked ? 'checked' : ''}
        style="width:14px;height:14px;accent-color:var(--accent);">
      <div style="flex:1;">
        <span style="font-weight:600;color:var(--text);">${escapeHtml(s.ihracat_dosya_no) || '-'}</span>
        <span style="color:var(--text3);margin:0 6px;">·</span>
        <span style="color:var(--text2);font-family:var(--mono);font-size:11px;">${escapeHtml(s.fatura_no) || '-'}</span>
        <span style="color:var(--text3);margin:0 6px;">·</span>
        <span style="color:var(--text3);">${escapeHtml(s.ulke) || '-'}</span>
      </div>
      <span style="font-size:11px;color:var(--text3);">${escapeHtml(s.plaka) || '-'}</span>`;

    item.querySelector('input').addEventListener('change', e => {
      if (e.target.checked) gruplaSecilen.add(s.id);
      else gruplaSecilen.delete(s.id);
    });

    liste.appendChild(item);
  });

  document.getElementById('grupla-status').innerHTML = '';
  document.getElementById('grupla-overlay').style.display = 'block';
  document.getElementById('grupla-modal').style.display  = 'block';
}

function closeGruplaModal() {
  document.getElementById('grupla-overlay').style.display = 'none';
  document.getElementById('grupla-modal').style.display   = 'none';
}

async function saveGruplama() {
  if (gruplaSecilen.size < 2) {
    document.getElementById('grupla-status').innerHTML =
      '<span style="color:var(--error);">⚠ En az 2 sevkiyat seçin.</span>';
    return;
  }

  const token = localStorage.getItem('fa_auth_token');
  const ids   = [...gruplaSecilen];

  const res  = await fetch('/api/shipments/group', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ ids }),
  });
  const data = await res.json();

  if (data.success) {
    closeGruplaModal();
    closeShipmentDetail();
    loadShipments();
  } else {
    document.getElementById('grupla-status').innerHTML =
      `<span style="color:var(--error);">⚠ ${data.error}</span>`;
  }
}

async function ungroupShipment() {
  const id    = document.getElementById('detail-id').value;
  if (!id) return;
  if (!confirm('Bu sevkiyatı gruptan çıkarmak istiyor musunuz?')) return;
  const token = localStorage.getItem('fa_auth_token');
  await fetch('/api/shipments/ungroup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ id: parseInt(id) }),
  });
  closeShipmentDetail();
  loadShipments();
}

function filterGruplaListe() {
  const q = (document.getElementById('grupla-arama')?.value || '').toLowerCase().trim();
  document.querySelectorAll('#grupla-liste label').forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = !q || text.includes(q) ? '' : 'none';
  });
}

// ── ÇOKLU SEÇİM & SİLME ──────────────────────────────────────────────────────
function toggleSatirSec(event, id) {
  event.stopPropagation();
  if (seciliSatirlar.has(id)) {
    seciliSatirlar.delete(id);
  } else {
    seciliSatirlar.add(id);
  }
  updateSecimToolbar();
}

function toggleTumSatirlar(chk) {
  const checkboxes = document.querySelectorAll('#shipments-tbody input[type=checkbox]');
  checkboxes.forEach(cb => {
    const id = parseInt(cb.dataset.id);
    if (chk.checked) {
      seciliSatirlar.add(id);
      cb.checked = true;
    } else {
      seciliSatirlar.delete(id);
      cb.checked = false;
    }
  });
  updateSecimToolbar();
}

function updateSecimToolbar() {
  const count = seciliSatirlar.size;
  let toolbar = document.getElementById('secim-toolbar');

  if (count === 0) {
    if (toolbar) toolbar.style.display = 'none';
    return;
  }

  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.id = 'secim-toolbar';
    toolbar.style.cssText = `
      position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
      background:#1E293B;color:#F1F5F9;
      padding:12px 20px;border-radius:12px;
      display:flex;align-items:center;gap:14px;
      box-shadow:0 8px 32px rgba(0,0,0,0.3);
      z-index:200;font-size:13px;font-weight:500;
    `;
    toolbar.innerHTML = `
      <span id="secim-count"></span>
      <button onclick="topluDurumGuncelle()" class="role-write-only"
        style="padding:7px 16px;border-radius:8px;border:none;
               background:#185FA5;color:#fff;font-family:var(--font);
               font-size:12px;font-weight:600;cursor:pointer;">
        ⟳ Durum Güncelle
      </button>
      <button onclick="topluGrupla()" class="role-write-only"
        style="padding:7px 16px;border-radius:8px;border:none;
               background:#7C3AED;color:#fff;font-family:var(--font);
               font-size:12px;font-weight:600;cursor:pointer;">
        🔗 Grupla
      </button>
      <button onclick="topluSil()" class="role-write-only"
        style="padding:7px 16px;border-radius:8px;border:none;
               background:#EF4444;color:#fff;font-family:var(--font);
               font-size:12px;font-weight:600;cursor:pointer;">
        🗑 Seçilenleri Sil
      </button>
      <button onclick="secimIptal()"
        style="padding:7px 14px;border-radius:8px;
               border:0.5px solid rgba(255,255,255,0.2);
               background:transparent;color:#CBD5E1;
               font-family:var(--font);font-size:12px;cursor:pointer;">
        İptal
      </button>
    `;
    document.body.appendChild(toolbar);
  }

  toolbar.style.display = 'flex';
  document.getElementById('secim-count').textContent = `${count} satır seçildi`;
}

function secimIptal() {
  seciliSatirlar.clear();
  document.querySelectorAll('#shipments-tbody input[type=checkbox]').forEach(cb => cb.checked = false);
  const chkAll = document.getElementById('chk-all');
  if (chkAll) chkAll.checked = false;
  updateSecimToolbar();
}

async function topluSil() {
  const count = seciliSatirlar.size;
  if (!count) return;

  const seciliListesi = [...seciliSatirlar].map(id => {
    const s = allShipments.find(x => x.id === id);
    return s ? `<span style="font-family:var(--mono);font-size:12px;color:#EF4444;">${escapeHtml(s.ihracat_dosya_no || s.fatura_no)}</span>` : '';
  }).filter(Boolean).join(', ');

  showMiniModal('🗑 Kalıcı Silme', `
    <div style="padding:12px 14px;background:#FFF5F5;border:0.5px solid #FECACA;
                border-radius:var(--radius-md);margin-bottom:12px;
                display:flex;gap:10px;align-items:flex-start;">
      <span style="font-size:20px;flex-shrink:0;">⚠️</span>
      <div>
        <div style="font-size:13px;font-weight:600;color:#B91C1C;margin-bottom:4px;">
          Bu işlem geri alınamaz!
        </div>
        <div style="font-size:12px;color:#DC2626;">
          <b>${count} sevkiyat</b> kalıcı olarak silinecek. Veriler kurtarılamaz.
        </div>
      </div>
    </div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:6px;">Silinecek kayıtlar:</div>
    <div style="padding:10px 12px;background:var(--surface2);border-radius:var(--radius-md);
                border:0.5px solid var(--border2);line-height:1.8;">
      ${seciliListesi}
    </div>`,
    [
      { label: 'Vazgeç', style: 'ghost', action: null },
      { label: '🗑 Evet, Kalıcı Sil', style: 'danger', action: async () => {
        const token = localStorage.getItem('fa_auth_token');
        try {
          const resp = await fetch('/api/shipments/bulk-delete', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body:    JSON.stringify({ ids: [...seciliSatirlar] }),
          });
          const data = await resp.json();
          if (!data.success) throw new Error(data.error);
          seciliSatirlar.clear();
          updateSecimToolbar();
          await yenileGorunumuKoruyarak();
        } catch (e) {
          showMiniModal('⚠️ Hata', e.message, [{ label: 'Tamam', style: 'primary', action: null }]);
        }
      }}
    ]
  );
}

// ── TOPLU DURUM GÜNCELLE ─────────────────────────────────────────────────────
const TOPLU_DURUM_SECENEKLERI = ['Yüklenecek', 'YOLDA', 'Varış Gümrük', 'Gümrükleme', 'TESLİM EDİLDİ'];

// Durum → yazılacak tarih kolonu ve ekranda görünen etiket.
// Backend'deki DURUM_TARIH_KOLONU ile birebir aynı olmalı (api/shipments.py).
// Yüklenecek/YOLDA burada yok: o durumlarda tarih sorulmaz, alan gizlenir.
const DURUM_TARIH_ALANI = {
  'Varış Gümrük':  { kolon: 'varis_tarihi',     etiket: 'Varış Tarihi'      },
  'Gümrükleme':    { kolon: 'gumruk_tarihi',    etiket: 'Gümrük Tarihi'     },
  'TESLİM EDİLDİ': { kolon: 'gumrukleme_bitis', etiket: 'Gümrükleme Bitiş'  },
};

function bugunISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function topluDurumGuncelle() {
  const count = seciliSatirlar.size;
  if (!count) return;

  const seciliKayitlar = [...seciliSatirlar]
    .map(id => allShipments.find(x => x.id === id))
    .filter(Boolean);

  const seciliListesi = seciliKayitlar
    .map(s => `<span style="font-family:var(--mono);font-size:12px;color:var(--accent);">${escapeHtml(s.ihracat_dosya_no || s.fatura_no)}</span>`)
    .join(', ');

  // Kurumsal olmayan (franchise/toptan/devir) ülkelerde tarih bugünle dolu gelir.
  // Seçimde tek bir kurumsal kayıt bile varsa tarih boş bırakılır, elle girilir.
  const hepsiKurumsalDisi = seciliKayitlar.length > 0 &&
    seciliKayitlar.every(s => (s.musteri_tipi || 'kurumsal') !== 'kurumsal');
  const varsayilanTarih = hepsiKurumsalDisi ? bugunISO() : '';

  showMiniModal('⟳ Toplu Durum Güncelle', `
    <div style="margin-bottom:10px;font-size:13px;color:var(--text2);">
      <b>${count} sevkiyat</b> için yeni durum seçin:
    </div>
    <select id="toplu-durum-select" style="width:100%;height:36px;padding:0 10px;margin-bottom:12px;
           border-radius:var(--radius-md);border:0.5px solid var(--border2);
           background:var(--surface2);color:var(--text);font-family:var(--font);font-size:13px;">
      ${TOPLU_DURUM_SECENEKLERI.map(d => `<option value="${d}">${d}</option>`).join('')}
    </select>
    <div id="toplu-tarih-wrap" style="margin-bottom:12px;">
      <label id="toplu-tarih-label" for="toplu-durum-tarih"
             style="display:block;font-size:12px;font-weight:600;color:var(--text2);margin-bottom:5px;"></label>
      <input id="toplu-durum-tarih" type="date" value="${varsayilanTarih}"
             style="width:100%;height:36px;padding:0 10px;
                    border-radius:var(--radius-md);border:0.5px solid var(--border2);
                    background:var(--surface2);color:var(--text);font-family:var(--font);font-size:13px;">
      <div id="toplu-tarih-uyari" style="display:none;font-size:12px;color:#EF4444;margin-top:5px;">
        Tarih zorunludur.
      </div>
    </div>
    <div style="padding:10px 12px;background:var(--surface2);border-radius:var(--radius-md);
                border:0.5px solid var(--border2);line-height:1.8;">
      ${seciliListesi}
    </div>`,
    [
      { label: 'İptal', style: 'ghost', action: null },
      { label: '⟳ Güncelle', style: 'primary',
        // Tarih boşsa modal kapanmaz, kayıt güncellenmez
        validate: (formValues) => {
          const durum = formValues?.['toplu-durum-select'] || '';
          const tarih = (formValues?.['toplu-durum-tarih'] || '').trim();
          if (DURUM_TARIH_ALANI[durum] && !tarih) {
            const uyari = document.getElementById('toplu-tarih-uyari');
            const input = document.getElementById('toplu-durum-tarih');
            if (uyari) uyari.style.display = 'block';
            if (input) { input.style.borderColor = '#EF4444'; input.focus(); }
            return false;
          }
          return true;
        },
        action: async (formValues) => {
        const durum = formValues?.['toplu-durum-select'] || TOPLU_DURUM_SECENEKLERI[0];
        const tarih = (formValues?.['toplu-durum-tarih'] || '').trim();
        if (!durum) return;
        const token = localStorage.getItem('fa_auth_token');
        try {
          const resp = await fetch('/api/shipments/bulk-status', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body:    JSON.stringify({ ids: [...seciliSatirlar], durum, tarih }),
          });
          const data = await resp.json();
          if (!data.success) throw new Error(data.error);
          seciliSatirlar.clear();
          updateSecimToolbar();
          await yenileGorunumuKoruyarak();
        } catch (e) {
          showMiniModal('⚠️ Hata', e.message, [{ label: 'Tamam', style: 'primary', action: null }]);
        }
      }}
    ]
  );

  // Seçilen duruma göre tarih alanının etiketi değişir (hangi kolona yazılacağı)
  const durumSelect = document.getElementById('toplu-durum-select');
  const tarihLabel  = document.getElementById('toplu-tarih-label');
  const tarihWrap   = document.getElementById('toplu-tarih-wrap');
  const tarihInput  = document.getElementById('toplu-durum-tarih');

  function tarihAlaniniGuncelle() {
    const alan = DURUM_TARIH_ALANI[durumSelect?.value || ''];
    if (!tarihWrap) return;
    if (!alan) { tarihWrap.style.display = 'none'; return; }
    tarihWrap.style.display = '';
    if (tarihLabel) tarihLabel.textContent = alan.etiket + ' *';
    const uyari = document.getElementById('toplu-tarih-uyari');
    if (uyari) uyari.style.display = 'none';
    if (tarihInput) tarihInput.style.borderColor = 'var(--border2)';
  }

  durumSelect?.addEventListener('change', tarihAlaniniGuncelle);
  tarihInput?.addEventListener('input', () => {
    const uyari = document.getElementById('toplu-tarih-uyari');
    if (uyari) uyari.style.display = 'none';
    tarihInput.style.borderColor = 'var(--border2)';
  });
  tarihAlaniniGuncelle();
}

// ── TOPLU GRUPLA ─────────────────────────────────────────────────────────────
function topluGrupla() {
  const count = seciliSatirlar.size;
  if (count < 2) {
    showMiniModal('⚠️ Uyarı', 'Gruplamak için en az 2 satır seçin.', [
      { label: 'Tamam', style: 'primary', action: null }
    ]);
    return;
  }

  // Seçili satırların dosya no listesi
  const seciliListesi = [...seciliSatirlar].map(id => {
    const s = allShipments.find(x => x.id === id);
    return s ? `<span style="font-family:var(--mono);font-size:12px;color:var(--accent);">${escapeHtml(s.ihracat_dosya_no || s.fatura_no)}</span>` : '';
  }).filter(Boolean).join(', ');

  showMiniModal('🔗 Grupla', `
    <div style="margin-bottom:10px;font-size:13px;color:var(--text2);">
      <b>${count} sevkiyat</b> bir sefer grubu olarak işaretlenecek:
    </div>
    <div style="padding:10px 12px;background:var(--surface2);border-radius:var(--radius-md);
                border:0.5px solid var(--border2);line-height:1.8;">
      ${seciliListesi}
    </div>`,
    [
      { label: 'İptal', style: 'ghost', action: null },
      { label: '🔗 Grupla', style: 'primary', action: async () => {
        const token = localStorage.getItem('fa_auth_token');
        try {
          const resp = await fetch('/api/shipments/group', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body:    JSON.stringify({ ids: [...seciliSatirlar] }),
          });
          const data = await resp.json();
          if (!data.success) throw new Error(data.error);
          seciliSatirlar.clear();
          updateSecimToolbar();
          await yenileGorunumuKoruyarak();
        } catch (e) {
          showMiniModal('⚠️ Hata', e.message, [{ label: 'Tamam', style: 'primary', action: null }]);
        }
      }}
    ]
  );
}

function showMiniModal(title, bodyHtml, buttons) {
  // Varsa eskiyi kaldır
  document.getElementById('mini-modal-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'mini-modal-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:400;
    display:flex;align-items:center;justify-content:center;
    animation:fadeIn 0.15s ease;
  `;

  const btnHtml = buttons.map(b => {
    const styles = {
      primary: 'background:var(--accent);color:#fff;border:none;',
      ghost:   'background:transparent;color:var(--text2);border:0.5px solid var(--border2);',
      danger:  'background:#EF4444;color:#fff;border:none;',
    };
    return `<button data-action="${b.label}"
      style="padding:9px 20px;border-radius:var(--radius-md);font-family:var(--font);
             font-size:13px;font-weight:600;cursor:pointer;transition:opacity 0.1s;
             ${styles[b.style] || styles.ghost}"
      onmouseover="this.style.opacity='0.85'"
      onmouseout="this.style.opacity='1'">
      ${b.label}
    </button>`;
  }).join('');

  overlay.innerHTML = `
    <div style="background:var(--surface);border:0.5px solid var(--border2);
                border-radius:var(--radius-xl);padding:28px 32px;
                max-width:440px;width:90%;
                box-shadow:0 8px 40px rgba(0,0,0,0.18);
                animation:slideUp 0.2s ease;">
      <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:14px;">${title}</div>
      <div style="margin-bottom:22px;">${bodyHtml}</div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">${btnHtml}</div>
    </div>
    <style>
      @keyframes fadeIn  { from { opacity:0 } to { opacity:1 } }
      @keyframes slideUp { from { transform:translateY(12px);opacity:0 } to { transform:translateY(0);opacity:1 } }
    </style>
  `;

  // Buton aksiyonları
  overlay.querySelectorAll('button').forEach(btn => {
    const label = btn.dataset.action;
    const found = buttons.find(b => b.label === label);
    btn.addEventListener('click', async () => {
      // Overlay kapanmadan once form degerlerini al — aksi halde action icinde
      // document.getElementById(...) null doner (modal DOM'dan silinmis olur).
      const formValues = {};
      overlay.querySelectorAll('input, select, textarea').forEach(el => {
        if (!el.id) return;
        formValues[el.id] = (el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value;
      });
      // validate false donerse modal acik kalir, action calismaz
      if (found?.validate && found.validate(formValues) === false) return;
      overlay.remove();
      if (found?.action) await found.action(formValues);
    });
  });

  // Overlay tıklayınca kapat
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
  return overlay;
}

// ── SIRBİSTAN VERGİ PDF PARSE ─────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Dosya okunamadı'));
    reader.readAsDataURL(file);
  });
}

async function parseVergiPdf(file) {
  const pdf_b64 = await fileToBase64(file);
  const token = localStorage.getItem('fa_auth_token');
  const resp  = await fetch('/api/shipments/parse-vergi-pdf', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body:    JSON.stringify({ pdf: pdf_b64 }),
  });
  const data = await resp.json();
  if (!data.success) throw new Error(data.error);
  return data;
}

async function handleVergiPdf(file) {
  if (!file) return;
  const statusEl = document.getElementById('vergi-pdf-status');
  statusEl.textContent = '⏳ PDF okunuyor...';
  statusEl.style.color = 'var(--text3)';

  try {
    const data = await parseVergiPdf(file);

    const fmt = n => new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(n);

    if (data.tip === 'vergi') {
      // Gümrük vergisi faturası
      document.getElementById('edit-gumruk-v').value = data.eur.gumruk_vergisi;
      document.getElementById('edit-kdv').value       = data.eur.kdv;

      statusEl.style.color = 'var(--success)';
      statusEl.textContent =
        `✓ Gümrük: ${fmt(data.rsd.carina)} RSD → ${fmt(data.eur.gumruk_vergisi)} € | ` +
        `KDV: ${fmt(data.rsd.pdv)} RSD → ${fmt(data.eur.kdv)} € | ` +
        `Kur: 1 EUR = ${fmt(data.kur.rsd_per_eur)} RSD`;

    } else if (data.tip === 'brokerage') {
      // Spediter faturası
      document.getElementById('edit-brokerage').value = data.eur.brokerage;

      statusEl.style.color = 'var(--success)';
      statusEl.textContent =
        `✓ Brokerage Fee & Other Costs EUR: ${fmt(data.rsd.nasi_troskovi)} RSD → ${fmt(data.eur.brokerage)} € | ` +
        `Kur: 1 EUR = ${fmt(data.kur.rsd_per_eur)} RSD`;
    }

  } catch (err) {
    statusEl.style.color = 'var(--error)';
    statusEl.textContent = '⚠ ' + err.message;
  }
}

async function meLoadRsShipments() {
  const sel      = document.getElementById('me-rs-select');
  const statusEl = document.getElementById('me-rs-select-status');
  if (!sel) return;
  if (statusEl) { statusEl.textContent = 'Yükleniyor...'; statusEl.style.color = 'var(--text3)'; }
  try {
    const token = localStorage.getItem('fa_auth_token');
    const res  = await fetch('/api/shipments?ulke=SIRBİSTAN', { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    const parseNo = s => { const m = (s || '').match(/^(\d+)-(\d+)$/); return m ? [+m[1], +m[2]] : [0, 0]; };
    const list = (data.shipments || []).sort((a, b) => {
      const [ay, an] = parseNo(a.ihracat_dosya_no);
      const [by, bn] = parseNo(b.ihracat_dosya_no);
      return by !== ay ? by - ay : bn - an;
    });
    const prev = sel.value;
    sel.innerHTML = '<option value="">— Sevkiyat seçin —</option>' +
      list.map(s => {
        const label = [s.ihracat_dosya_no, s.fatura_no].filter(Boolean).join(' · ');
        return `<option value="${s.id}">${escapeHtml(label)}</option>`;
      }).join('');
    if (prev && list.find(s => String(s.id) === prev)) sel.value = prev;
    if (statusEl) { statusEl.textContent = `${list.length} sevkiyat listelendi.`; statusEl.style.color = 'var(--text3)'; }
  } catch (err) {
    if (statusEl) { statusEl.textContent = '⚠ ' + err.message; statusEl.style.color = 'var(--error)'; }
  }
}

// ── MALİYET EVRAK — KONTROL & DÜZENLE ADIMI ──────────────────────────────────
// PDF okunduktan sonra yazılacak değerler düzenlenebilir tabloda gösterilir;
// kullanıcı "Kaydet" demeden hiçbir sevkiyata yazılmaz.
// plan: [{ shipment, fields: { brokerage_eur: 12.5, ... } }]
// Döner: düzenlenmiş plan (Kaydet) veya null (İptal).
const ME_KONTROL_ALANLAR = [
  ['gumruk_vergisi_eur', 'Gümrük Vergisi €'],
  ['kdv_eur',            'KDV €'],
  ['brokerage_eur',      'Brokerage €'],
  ['other_costs_eur',    'Other Costs €'],
];

function meKontrolSayi(v) {
  let s = String(v ?? '').trim().replace(/\s|€/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

function meKontrolEt(resultEl, prefix, detailHtml, plan) {
  const fmt = n => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  const alanlar = ME_KONTROL_ALANLAR.filter(([k]) => plan.some(r => k in r.fields));
  const coklu = plan.length > 1;

  const satirlar = plan.map((r, i) => {
    const s = r.shipment;
    const etiket = [s.ihracat_dosya_no, s.fatura_no].filter(Boolean).join(' · ') || `#${s.id}`;
    const hucreler = alanlar.map(([k]) => {
      if (!(k in r.fields)) return '<td class="me-kontrol-bos">—</td>';
      const mevcut = parseFloat(s[k]) || 0;
      return `<td>
        <input type="text" inputmode="decimal" autocomplete="off" class="me-kontrol-input"
          data-row="${i}" data-field="${k}" value="${fmt(r.fields[k])}">
        <div class="me-kontrol-mevcut">mevcut: ${fmt(mevcut)}</div>
      </td>`;
    }).join('');
    return `<tr><td class="me-kontrol-etiket">${escapeHtml(etiket)}</td>${hucreler}</tr>`;
  }).join('');

  const toplamSatir = coklu
    ? `<tfoot><tr><td>Toplam</td>${alanlar.map(([k]) =>
        `<td data-toplam="${k}"></td>`).join('')}</tr></tfoot>`
    : '';

  resultEl.style.display = 'block';
  resultEl.innerHTML = detailHtml + `
    <div class="me-kontrol">
      <div class="me-kontrol-baslik"><i class="ti ti-checklist"></i> Kontrol &amp; Düzenle
        <span>Değerleri kontrol edin, gerekirse düzeltin. Kaydet'e basmadan hiçbir şey yazılmaz.</span></div>
      <div class="me-kontrol-wrap">
        <table class="me-kontrol-tablo">
          <thead><tr><th>Sevkiyat</th>${alanlar.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead>
          <tbody>${satirlar}</tbody>
          ${toplamSatir}
        </table>
      </div>
      <div class="me-kontrol-aksiyon">
        <button type="button" class="me-kontrol-iptal">İptal</button>
        <button type="button" class="me-btn-save me-kontrol-kaydet"><i class="ti ti-device-floppy"></i> Kaydet</button>
      </div>
      <div id="me-${prefix}-save-status" class="me-manual-status"></div>
    </div>`;

  const box = resultEl.querySelector('.me-kontrol');
  const inputs = [...box.querySelectorAll('.me-kontrol-input')];

  const toplamGuncelle = () => {
    if (!coklu) return;
    alanlar.forEach(([k]) => {
      const td = box.querySelector(`[data-toplam="${k}"]`);
      const t = inputs.filter(inp => inp.dataset.field === k)
        .reduce((sum, inp) => sum + (meKontrolSayi(inp.value) || 0), 0);
      if (td) td.textContent = fmt(t);
    });
  };
  inputs.forEach(inp => inp.addEventListener('input', () => {
    inp.classList.toggle('hatali', Number.isNaN(meKontrolSayi(inp.value)));
    toplamGuncelle();
  }));
  toplamGuncelle();

  return new Promise(resolve => {
    box.querySelector('.me-kontrol-iptal').addEventListener('click', () => {
      box.querySelectorAll('input, button').forEach(el => { el.disabled = true; });
      const st = document.getElementById(`me-${prefix}-save-status`);
      st.innerHTML = '<span style="color:var(--text3);">İptal edildi — hiçbir sevkiyata yazılmadı.</span>';
      const inp = document.getElementById(`me-${prefix}-input`);
      if (inp) inp.value = '';
      resolve(null);
    });
    box.querySelector('.me-kontrol-kaydet').addEventListener('click', () => {
      const yeni = plan.map(r => ({ shipment: r.shipment, fields: { ...r.fields } }));
      let hata = false;
      inputs.forEach(inp => {
        const v = meKontrolSayi(inp.value);
        if (Number.isNaN(v)) { inp.classList.add('hatali'); hata = true; return; }
        yeni[+inp.dataset.row].fields[inp.dataset.field] = v;
      });
      const st = document.getElementById(`me-${prefix}-save-status`);
      if (hata) {
        st.innerHTML = '<span style="color:var(--error);">⚠ Geçersiz tutar var (ör. 1.234,56).</span>';
        return;
      }
      box.querySelectorAll('input, button').forEach(el => { el.disabled = true; });
      st.innerHTML = '<span style="color:var(--text3);">⏳ Kaydediliyor...</span>';
      resolve(yeni);
    });
  });
}

// Sırbistan PDF — okunan değerler kontrol edilir, Kaydet ile seçili sevkiyata yazılır
async function meHandleRsPdf(file) {
  if (!file) return;
  const statusEl = document.getElementById('me-rs-status');
  const resultEl = document.getElementById('me-rs-result');
  statusEl.textContent = '⏳ PDF okunuyor...';
  statusEl.style.color = 'var(--text3)';
  resultEl.style.display = 'none';

  let data;
  try {
    data = await parseVergiPdf(file);
  } catch (err) {
    statusEl.style.color = 'var(--error)';
    statusEl.textContent = '⚠ ' + err.message;
    return;
  }

  const fmt = n => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  statusEl.style.color = 'var(--success)';
  statusEl.textContent = `✓ ${file.name} okundu`;
  resultEl.style.display = 'block';

  let detailHtml = '';
  if (data.tip === 'vergi') {
    detailHtml = `
      <div style="color:var(--success);">✓ Gümrük Vergisi faturası</div>
      <div style="margin-top:6px;font-size:12px;">
        Gümrük: <b>${fmt(data.rsd.carina)} RSD → ${fmt(data.eur.gumruk_vergisi)} €</b> &nbsp;|&nbsp;
        KDV: <b>${fmt(data.rsd.pdv)} RSD → ${fmt(data.eur.kdv)} €</b><br>
        <span style="color:var(--text3);">Kur: 1 EUR = ${fmt(data.kur.rsd_per_eur)} RSD</span>
      </div>`;
  } else if (data.tip === 'brokerage') {
    detailHtml = `
      <div style="color:var(--success);">✓ Spediter (Brokerage Fee & Other Costs EUR) faturası</div>
      <div style="margin-top:6px;font-size:12px;">
        Brokerage Fee & Other Costs EUR: <b>${fmt(data.rsd.nasi_troskovi)} RSD → ${fmt(data.eur.brokerage)} €</b><br>
        <span style="color:var(--text3);">Kur: 1 EUR = ${fmt(data.kur.rsd_per_eur)} RSD</span>
      </div>`;
  }

  const selEl     = document.getElementById('me-rs-select');
  const selectedId = selEl?.value;

  if (!selectedId) {
    resultEl.innerHTML = detailHtml + `
      <div style="margin-top:8px;font-size:12px;color:var(--text3);">ℹ Üstten sevkiyat seçerek otomatik kaydedebilirsiniz.</div>`;
    return;
  }

  try {
    const token = localStorage.getItem('fa_auth_token');
    const sRes  = await fetch(`/api/shipments?id=${selectedId}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const sData = await sRes.json();
    if (!sData.success) throw new Error(sData.error);
    const s = sData.shipment;

    const fields = data.tip === 'brokerage'
      ? { brokerage_eur: data.eur.brokerage }
      : { gumruk_vergisi_eur: data.eur.gumruk_vergisi, kdv_eur: data.eur.kdv };

    const plan = await meKontrolEt(resultEl, 'rs', detailHtml, [{ shipment: s, fields }]);
    if (!plan) return;
    await meGeSaveFields(plan[0].shipment, plan[0].fields, token);

    const selLabel = selEl.options[selEl.selectedIndex]?.text || String(selectedId);
    document.getElementById('me-rs-save-status').innerHTML =
      `<span style="color:var(--success);">✓ Kaydedildi → ${escapeHtml(selLabel)}</span>`;
    const inp = document.getElementById('me-rs-input');
    if (inp) inp.value = '';
  } catch (saveErr) {
    const saveEl = document.getElementById('me-rs-save-status');
    if (saveEl) saveEl.innerHTML = `<span style="color:var(--error);">⚠ Kayıt hatası: ${escapeHtml(saveErr.message)}</span>`;
    else resultEl.innerHTML += `<div style="color:var(--error);">⚠ ${escapeHtml(saveErr.message)}</div>`;
  }
}

// ── GÜRCİSTAN MALİYET EVRAK ──────────────────────────────────────────────────

async function meLoadGeShipments() {
  const sel      = document.getElementById('me-ge-select');
  const statusEl = document.getElementById('me-ge-select-status');
  if (!sel) return;
  if (statusEl) { statusEl.textContent = 'Yükleniyor...'; statusEl.style.color = 'var(--text3)'; }
  try {
    const token = localStorage.getItem('fa_auth_token');
    const res   = await fetch('/api/shipments?ulke=G%C3%9CRC%C4%B0STAN', { headers: { 'Authorization': `Bearer ${token}` } });
    const data  = await res.json();
    if (!data.success) throw new Error(data.error);
    const parseNo = s => { const m = (s || '').match(/^(\d+)-(\d+)$/); return m ? [+m[1], +m[2]] : [0, 0]; };
    const list = (data.shipments || []).sort((a, b) => {
      const [ay, an] = parseNo(a.ihracat_dosya_no);
      const [by, bn] = parseNo(b.ihracat_dosya_no);
      return by !== ay ? by - ay : bn - an;
    });
    const prev = sel.value;
    sel.innerHTML = '<option value="">— Sevkiyat seçin —</option>' +
      list.map(s => {
        const label = [s.ihracat_dosya_no, s.fatura_no, s.sefer_id ? `[Grup ${s.sefer_id}]` : ''].filter(Boolean).join(' · ');
        return `<option value="${s.id}">${escapeHtml(label)}</option>`;
      }).join('');
    if (prev && list.find(s => String(s.id) === prev)) sel.value = prev;
    if (statusEl) { statusEl.textContent = `${list.length} sevkiyat listelendi.`; statusEl.style.color = 'var(--text3)'; }
  } catch (err) {
    if (statusEl) { statusEl.textContent = '⚠ ' + err.message; statusEl.style.color = 'var(--error)'; }
  }
}

async function meHandleGePdf(file) {
  if (!file) return;
  const statusEl = document.getElementById('me-ge-status');
  const resultEl = document.getElementById('me-ge-result');
  statusEl.textContent = '⏳ PDF okunuyor...';
  statusEl.style.color = 'var(--text3)';
  resultEl.style.display = 'none';

  let data;
  try {
    const b64 = await fileToBase64(file);
    const token = localStorage.getItem('fa_auth_token');
    const res   = await fetch('/api/shipments/parse-ge-pdf', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify({ pdf: b64 }),
    });
    data = await res.json();
    if (!data.success) throw new Error(data.error);
  } catch (err) {
    statusEl.style.color = 'var(--error)';
    statusEl.textContent = '⚠ ' + err.message;
    return;
  }

  const fmt    = n => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const fmtEur = n => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' €';
  statusEl.style.color = 'var(--success)';
  statusEl.textContent = `✓ ${file.name} okundu`;
  resultEl.style.display = 'block';

  const selEl      = document.getElementById('me-ge-select');
  const selectedId = selEl?.value;

  if (!selectedId) {
    let info = '';
    if (data.tip === 'broker') {
      info = `<div style="color:var(--success);">✓ Broker faturası (GW)</div>
        <div style="margin-top:6px;">Brokerage: <b>${fmt(data.gel.brokerage)} GEL → ${fmtEur(data.eur.brokerage)}</b><br>
        <span style="color:var(--text3);">Kur: 1 EUR = ${fmt(data.kur.gel_per_eur)} GEL</span></div>`;
    } else {
      info = `<div style="color:var(--success);">✓ İthalat Beyannamesi (IM)</div>
        <div style="margin-top:6px;">KDV: <b>${fmt(data.gel.kdv)} GEL → ${fmtEur(data.eur.kdv)}</b><br>
        Vergi: <b>${fmt(data.gel.vergi)} GEL → ${fmtEur(data.eur.vergi)}</b><br>
        <span style="color:var(--text3);">Kur: 1 EUR = ${fmt(data.kur.gel_per_eur)} GEL</span></div>`;
    }
    resultEl.innerHTML = info + `<div style="margin-top:8px;font-size:12px;color:var(--text3);">ℹ Üstten sevkiyat seçerek otomatik kaydedebilirsiniz.</div>`;
    return;
  }

  // Seçili sevkiyatı ve varsa sefer grubunu getir
  try {
    const token   = localStorage.getItem('fa_auth_token');
    const sRes    = await fetch(`/api/shipments?id=${selectedId}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const sData   = await sRes.json();
    if (!sData.success) throw new Error(sData.error);
    const s = sData.shipment;

    let group = [s];  // tek sevkiyat varsayılan

    // Gruplu araç ise tüm grup üyelerini çek
    if (s.sefer_id) {
      const gRes  = await fetch(`/api/shipments?sefer_id=${s.sefer_id}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const gData = await gRes.json();
      if (gData.success && gData.shipments?.length > 0) group = gData.shipments;
    }

    // Toplam fatura bedeli
    const toplamEur = group.reduce((sum, x) => sum + (parseFloat(x.fatura_bedeli_eur) || 0), 0);

    // Her sevkiyat için pay hesapla
    const paylar = group.map(x => {
      const bedel = parseFloat(x.fatura_bedeli_eur) || 0;
      const oran  = toplamEur > 0 ? bedel / toplamEur : 1 / group.length;
      return { ...x, oran };
    });

    // Dağıtım gösterimi ve kayıt
    let detailHtml = '';
    const plan = [];

    if (data.tip === 'broker') {
      const toplam = data.eur.brokerage;
      detailHtml = `<div style="color:var(--success);">✓ Broker faturası — ${fmt(data.gel.brokerage)} GEL → ${fmtEur(toplam)}</div>
        <div style="margin-top:6px;color:var(--text3);">Kur: 1 EUR = ${fmt(data.kur.gel_per_eur)} GEL</div>`;

      if (group.length > 1) {
        detailHtml += `<div style="margin-top:8px;font-size:11px;color:var(--text3);">Orantılı dağıtım (fatura_bedeli_eur'a göre):</div>
          <div style="margin-top:4px;">` +
          paylar.map(p => `<div>${p.ihracat_dosya_no || p.fatura_no}: <b>${fmtEur(Math.round(toplam * p.oran * 100) / 100)}</b> (%${Math.round(p.oran * 100)})</div>`).join('') +
          `</div>`;
      }

      for (const p of paylar) {
        const pay = Math.round(toplam * p.oran * 100) / 100;
        plan.push({ shipment: p, fields: { brokerage_eur: pay } });
      }

    } else {
      // IM beyannamesi — KDV orantılı, vergi ANT faturasına
      const toplamKdv   = data.eur.kdv;
      const toplamVergi = data.eur.vergi;

      detailHtml = `<div style="color:var(--success);">✓ İthalat Beyannamesi — KDV: ${fmtEur(toplamKdv)} | Vergi: ${fmtEur(toplamVergi)}</div>
        <div style="margin-top:6px;color:var(--text3);">Kur: 1 EUR = ${fmt(data.kur.gel_per_eur)} GEL</div>`;

      // KDV dağıtımı
      if (group.length > 1) {
        detailHtml += `<div style="margin-top:8px;font-size:11px;color:var(--text3);">KDV orantılı dağıtım:</div>
          <div style="margin-top:4px;">` +
          paylar.map(p => `<div>${p.ihracat_dosya_no || p.fatura_no}: <b>${fmtEur(Math.round(toplamKdv * p.oran * 100) / 100)}</b></div>`).join('') +
          `</div>`;
      }

      // ANT faturasını bul
      const antFatura = group.find(x => (x.fatura_no || '').startsWith('ANT'));
      if (antFatura) {
        detailHtml += `<div style="margin-top:6px;font-size:11px;">Vergi → <b>${antFatura.fatura_no}</b> (ANT)</div>`;
      } else {
        detailHtml += `<div style="margin-top:6px;font-size:11px;color:var(--text3);">ℹ ANT faturası bulunamadı; vergi seçili sevkiyata yazılacak.</div>`;
      }

      const vergiTarget = antFatura || s;

      // Aynı sevkiyata (ANT) hem KDV hem vergi yazılacaksa, güncellemeleri TEK
      // kayıtta birleştir. meGeSaveField tam satırı gönderdiğinden, aynı id'ye
      // iki eşzamanlı PUT atılırsa sonra biteni öndekini eski (stale) değerle
      // ezip alanı sıfırlıyordu (KDV veya vergi kayboluyordu).
      for (const p of paylar) {
        const kdvPay = Math.round(toplamKdv * p.oran * 100) / 100;
        const fields = { kdv_eur: kdvPay };
        if (p.id === vergiTarget.id) fields.gumruk_vergisi_eur = toplamVergi;
        plan.push({ shipment: p, fields });
      }
      if (!paylar.some(p => p.id === vergiTarget.id)) {
        plan.push({ shipment: vergiTarget, fields: { gumruk_vergisi_eur: toplamVergi } });
      }
    }

    const onayli = await meKontrolEt(resultEl, 'ge', detailHtml, plan);
    if (!onayli) return;
    await Promise.all(onayli.map(r => meGeSaveFields(r.shipment, r.fields, token)));

    document.getElementById('me-ge-save-status').innerHTML =
      `<span style="color:var(--success);">✓ Kaydedildi (${group.length} sevkiyat güncellendi)</span>`;
    const inp = document.getElementById('me-ge-input');
    if (inp) inp.value = '';

  } catch (saveErr) {
    const saveEl = document.getElementById('me-ge-save-status');
    if (saveEl) saveEl.innerHTML = `<span style="color:var(--error);">⚠ Kayıt hatası: ${escapeHtml(saveErr.message)}</span>`;
    else resultEl.innerHTML += `<div style="color:var(--error);">⚠ ${escapeHtml(saveErr.message)}</div>`;
  }
}

async function meGeSaveField(shipment, field, value, token) {
  return meGeSaveFields(shipment, { [field]: value }, token);
}

async function meGeSaveFields(shipment, fields, token) {
  const s = shipment;
  const body = {
    id:                    s.id,
    ihracat_dosya_no:      s.ihracat_dosya_no || '',
    nakliye_firmasi:       s.nakliye_firmasi || '',
    plaka:                 s.plaka || '',
    palet:                 s.palet || null,
    durum:                 s.durum || '',
    varis_tarihi:          s.varis_tarihi || '',
    gumrukleme_bitis:      s.gumrukleme_bitis || '',
    fatura_bedeli_tl:      s.fatura_bedeli_tl || 0,
    fatura_bedeli_eur:     s.fatura_bedeli_eur || 0,
    mal_bedeli_eur:        s.mal_bedeli_eur || 0,
    navlun_eur:            s.navlun_eur || 0,
    sigorta_eur:           s.sigorta_eur || 0,
    eur_kuru:              s.eur_kuru || 0,
    navlun_usd:            s.navlun_usd || 0,
    sigorta_usd:           s.sigorta_usd || 0,
    usd_kuru:              s.usd_kuru || 0,
    ihracat_beyanname_tl:  s.ihracat_beyanname_tl || 0,
    ihracat_beyanname_eur: s.ihracat_beyanname_eur || 0,
    arac_bekleme:          s.arac_bekleme || 0,
    other_costs_eur:       s.other_costs_eur || 0,
    brokerage_eur:         s.brokerage_eur || 0,
    gumruk_vergisi_eur:    s.gumruk_vergisi_eur || 0,
    kdv_eur:               s.kdv_eur || 0,
  };
  Object.assign(body, fields);
  const res  = await fetch('/api/shipments', {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body:    JSON.stringify(body),
  });
  const d = await res.json();
  if (!d.success) throw new Error(d.error || 'Kayıt hatası');
}

// ── KOSOVA MALİYET EVRAK ─────────────────────────────────────────────────────

async function meLoadKoShipments() {
  const sel      = document.getElementById('me-ko-select');
  const statusEl = document.getElementById('me-ko-select-status');
  if (!sel) return;
  if (statusEl) { statusEl.textContent = 'Yükleniyor...'; statusEl.style.color = 'var(--text3)'; }
  try {
    const token = localStorage.getItem('fa_auth_token');
    const res   = await fetch('/api/shipments?ulke=KOSOVA', { headers: { 'Authorization': `Bearer ${token}` } });
    const data  = await res.json();
    if (!data.success) throw new Error(data.error);
    const parseNo = s => { const m = (s || '').match(/^(\d+)-(\d+)$/); return m ? [+m[1], +m[2]] : [0, 0]; };
    const list = (data.shipments || []).sort((a, b) => {
      const [ay, an] = parseNo(a.ihracat_dosya_no);
      const [by, bn] = parseNo(b.ihracat_dosya_no);
      return by !== ay ? by - ay : bn - an;
    });
    const prev = sel.value;
    sel.innerHTML = '<option value="">— Sevkiyat seçin —</option>' +
      list.map(s => {
        const label = [s.ihracat_dosya_no, s.fatura_no, s.sefer_id ? `[Grup ${s.sefer_id}]` : ''].filter(Boolean).join(' · ');
        return `<option value="${s.id}">${escapeHtml(label)}</option>`;
      }).join('');
    if (prev && list.find(s => String(s.id) === prev)) sel.value = prev;
    if (statusEl) { statusEl.textContent = `${list.length} sevkiyat listelendi.`; statusEl.style.color = 'var(--text3)'; }
  } catch (err) {
    if (statusEl) { statusEl.textContent = '⚠ ' + err.message; statusEl.style.color = 'var(--error)'; }
  }
}

async function meHandleKoPdf(file) {
  if (!file) return;
  const statusEl = document.getElementById('me-ko-status');
  const resultEl = document.getElementById('me-ko-result');
  statusEl.textContent = '⏳ PDF okunuyor...';
  statusEl.style.color = 'var(--text3)';
  resultEl.style.display = 'none';

  let data;
  try {
    const b64 = await fileToBase64(file);
    const token = localStorage.getItem('fa_auth_token');
    const res   = await fetch('/api/shipments/parse-ko-pdf', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify({ pdf: b64 }),
    });
    data = await res.json();
    if (!data.success) throw new Error(data.error);
  } catch (err) {
    statusEl.style.color = 'var(--error)';
    statusEl.textContent = '⚠ ' + err.message;
    return;
  }

  const fmtEur = n => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' €';
  statusEl.style.color = 'var(--success)';
  statusEl.textContent = `✓ ${file.name} okundu`;
  resultEl.style.display = 'block';

  const selEl      = document.getElementById('me-ko-select');
  const selectedId = selEl?.value;

  if (!selectedId) {
    resultEl.innerHTML = `<div style="color:var(--success);">✓ Gümrük Ödeme Emri (Urdhërpagesë)</div>
      <div style="margin-top:6px;">Vergi (Dogana): <b>${fmtEur(data.eur.vergi)}</b><br>
      KDV (TVSH): <b>${fmtEur(data.eur.kdv)}</b></div>
      <div style="margin-top:8px;font-size:12px;color:var(--text3);">ℹ Üstten sevkiyat seçerek otomatik kaydedebilirsiniz.</div>`;
    return;
  }

  // Seçili sevkiyatı ve varsa sefer grubunu getir
  try {
    const token   = localStorage.getItem('fa_auth_token');
    const sRes    = await fetch(`/api/shipments?id=${selectedId}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const sData   = await sRes.json();
    if (!sData.success) throw new Error(sData.error);
    const s = sData.shipment;

    let group = [s];  // tek sevkiyat varsayılan

    // Gruplu araç ise tüm grup üyelerini çek
    if (s.sefer_id) {
      const gRes  = await fetch(`/api/shipments?sefer_id=${s.sefer_id}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const gData = await gRes.json();
      if (gData.success && gData.shipments?.length > 0) group = gData.shipments;
    }

    // Toplam fatura bedeli
    const toplamEur = group.reduce((sum, x) => sum + (parseFloat(x.fatura_bedeli_eur) || 0), 0);

    // Her sevkiyat için pay hesapla
    const paylar = group.map(x => {
      const bedel = parseFloat(x.fatura_bedeli_eur) || 0;
      const oran  = toplamEur > 0 ? bedel / toplamEur : 1 / group.length;
      return { ...x, oran };
    });

    const toplamVergi = data.eur.vergi;
    const toplamKdv    = data.eur.kdv;
    const KO_BROKERAGE_EUR = 300;

    let detailHtml = `<div style="color:var(--success);">✓ Gümrük Ödeme Emri — Vergi: ${fmtEur(toplamVergi)} | KDV: ${fmtEur(toplamKdv)}</div>
      <div style="margin-top:4px;color:var(--text3);">Broker masrafı her sevkiyata otomatik <b>${fmtEur(KO_BROKERAGE_EUR)}</b> yazılacak.</div>`;

    // Vergi + KDV dağıtımı — ikisi de fatura_bedeli_eur oranına göre
    if (group.length > 1) {
      detailHtml += `<div style="margin-top:8px;font-size:11px;color:var(--text3);">Orantılı dağıtım (fatura_bedeli_eur'a göre):</div>
        <div style="margin-top:4px;">` +
        paylar.map(p => `<div>${p.ihracat_dosya_no || p.fatura_no}: Vergi <b>${fmtEur(Math.round(toplamVergi * p.oran * 100) / 100)}</b> · KDV <b>${fmtEur(Math.round(toplamKdv * p.oran * 100) / 100)}</b> · Broker <b>${fmtEur(KO_BROKERAGE_EUR)}</b> (%${Math.round(p.oran * 100)})</div>`).join('') +
        `</div>`;
    }

    const plan = paylar.map(p => ({ shipment: p, fields: {
      gumruk_vergisi_eur: Math.round(toplamVergi * p.oran * 100) / 100,
      kdv_eur:            Math.round(toplamKdv * p.oran * 100) / 100,
      brokerage_eur:       KO_BROKERAGE_EUR,
    } }));

    const onayli = await meKontrolEt(resultEl, 'ko', detailHtml, plan);
    if (!onayli) return;
    await Promise.all(onayli.map(r => meKoSaveFields(r.shipment, r.fields, token)));

    document.getElementById('me-ko-save-status').innerHTML =
      `<span style="color:var(--success);">✓ Kaydedildi (${group.length} sevkiyat güncellendi)</span>`;
    const inp = document.getElementById('me-ko-input');
    if (inp) inp.value = '';

  } catch (saveErr) {
    const saveEl = document.getElementById('me-ko-save-status');
    if (saveEl) saveEl.innerHTML = `<span style="color:var(--error);">⚠ Kayıt hatası: ${escapeHtml(saveErr.message)}</span>`;
    else resultEl.innerHTML += `<div style="color:var(--error);">⚠ ${escapeHtml(saveErr.message)}</div>`;
  }
}

async function meKoSaveFields(shipment, fields, token) {
  const s = shipment;
  const body = {
    id:                    s.id,
    ihracat_dosya_no:      s.ihracat_dosya_no || '',
    nakliye_firmasi:       s.nakliye_firmasi || '',
    plaka:                 s.plaka || '',
    palet:                 s.palet || null,
    durum:                 s.durum || '',
    varis_tarihi:          s.varis_tarihi || '',
    gumrukleme_bitis:      s.gumrukleme_bitis || '',
    fatura_bedeli_tl:      s.fatura_bedeli_tl || 0,
    fatura_bedeli_eur:     s.fatura_bedeli_eur || 0,
    mal_bedeli_eur:        s.mal_bedeli_eur || 0,
    navlun_eur:            s.navlun_eur || 0,
    sigorta_eur:           s.sigorta_eur || 0,
    eur_kuru:              s.eur_kuru || 0,
    navlun_usd:            s.navlun_usd || 0,
    sigorta_usd:           s.sigorta_usd || 0,
    usd_kuru:              s.usd_kuru || 0,
    ihracat_beyanname_tl:  s.ihracat_beyanname_tl || 0,
    ihracat_beyanname_eur: s.ihracat_beyanname_eur || 0,
    arac_bekleme:          s.arac_bekleme || 0,
    other_costs_eur:       s.other_costs_eur || 0,
    brokerage_eur:         s.brokerage_eur || 0,
    gumruk_vergisi_eur:    s.gumruk_vergisi_eur || 0,
    kdv_eur:               s.kdv_eur || 0,
    ...fields,
  };
  const res  = await fetch('/api/shipments', {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body:    JSON.stringify(body),
  });
  const d = await res.json();
  if (!d.success) throw new Error(d.error || 'Kayıt hatası');
}

// ── KAZAKİSTAN MALİYET EVRAK ─────────────────────────────────────────────────

async function meLoadKzShipments() {
  const sel      = document.getElementById('me-kz-select');
  const statusEl = document.getElementById('me-kz-select-status');
  if (!sel) return;
  if (statusEl) { statusEl.textContent = 'Yükleniyor...'; statusEl.style.color = 'var(--text3)'; }
  try {
    const token = localStorage.getItem('fa_auth_token');
    const res   = await fetch(`/api/shipments?ulke=${encodeURIComponent('KAZAKİSTAN')}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data  = await res.json();
    if (!data.success) throw new Error(data.error);
    const parseNo = s => { const m = (s || '').match(/^(\d+)-(\d+)$/); return m ? [+m[1], +m[2]] : [0, 0]; };
    const list = (data.shipments || []).sort((a, b) => {
      const [ay, an] = parseNo(a.ihracat_dosya_no);
      const [by, bn] = parseNo(b.ihracat_dosya_no);
      return by !== ay ? by - ay : bn - an;
    });
    const prev = sel.value;
    sel.innerHTML = '<option value="">— Sevkiyat seçin —</option>' +
      list.map(s => {
        const label = [s.ihracat_dosya_no, s.fatura_no, s.sefer_id ? `[Grup ${s.sefer_id}]` : ''].filter(Boolean).join(' · ');
        return `<option value="${s.id}">${escapeHtml(label)}</option>`;
      }).join('');
    if (prev && list.find(s => String(s.id) === prev)) sel.value = prev;
    if (statusEl) { statusEl.textContent = `${list.length} sevkiyat listelendi.`; statusEl.style.color = 'var(--text3)'; }
  } catch (err) {
    if (statusEl) { statusEl.textContent = '⚠ ' + err.message; statusEl.style.color = 'var(--error)'; }
  }
}

function meKzNormFatura(no) {
  return String(no || '').toUpperCase().replace(/^AMT/, 'ANT').replace(/[^A-Z0-9]/g, '');
}

function meKzPaylar(targets) {
  const n = targets.length || 1;
  return targets.map(x => ({ ...x, oran: 1 / n }));
}

function meKzSplitAmount(total, paylar) {
  const amounts = [];
  let allocated = 0;
  paylar.forEach((p, i) => {
    if (i === paylar.length - 1) {
      amounts.push(Math.round((total - allocated) * 100) / 100);
    } else {
      const v = Math.round(total * p.oran * 100) / 100;
      amounts.push(v);
      allocated += v;
    }
  });
  return amounts;
}

async function meHandleKzPdf(file) {
  if (!file) return;
  const statusEl = document.getElementById('me-kz-status');
  const resultEl = document.getElementById('me-kz-result');
  statusEl.textContent = '⏳ PDF okunuyor...';
  statusEl.style.color = 'var(--text3)';
  resultEl.style.display = 'none';

  let data;
  try {
    const b64 = await fileToBase64(file);
    const token = localStorage.getItem('fa_auth_token');
    const res   = await fetch('/api/shipments/parse-kz-pdf', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify({ pdf: b64 }),
    });
    data = await res.json();
    if (!data.success) throw new Error(data.error);
  } catch (err) {
    statusEl.style.color = 'var(--error)';
    statusEl.textContent = '⚠ ' + err.message;
    return;
  }

  const fmt    = n => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const fmtEur = n => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' €';
  statusEl.style.color = 'var(--success)';
  statusEl.textContent = `✓ ${file.name} okundu`;
  resultEl.style.display = 'block';

  const selEl      = document.getElementById('me-kz-select');
  const selectedId = selEl?.value;

  // Beyanname yanıtı: {tip:'beyanname', kzt:{vergi,kdv}, eur:{vergi,kdv}, kur:{kzt_per_eur}}
  // AVR/broker: {tip:'broker', brokerage_*, fatura_nolar:[ANT..., IHR...]}
  const isBeyanname = data.tip === 'beyanname';
  const faturaNolar = (data.fatura_nolar || []).map(meKzNormFatura).filter(Boolean);

  if (isBeyanname && !selectedId && !faturaNolar.length) {
    resultEl.innerHTML = `<div style="color:var(--success);">✓ Gümrük Beyannamesi</div>
        <div style="margin-top:6px;">Vergi (1010+2010): <b>${fmt(data.kzt.vergi)} KZT → ${fmtEur(data.eur.vergi)}</b><br>
        KDV (5060): <b>${fmt(data.kzt.kdv)} KZT → ${fmtEur(data.eur.kdv)}</b><br>
        <span style="color:var(--text3);">Kur: 1 EUR = ${fmt(data.kur.kzt_per_eur)} KZT</span></div>` +
      `<div style="margin-top:8px;font-size:12px;color:var(--text3);">ℹ Üstten sevkiyat seçerek otomatik kaydedebilirsiniz.</div>`;
    return;
  }

  try {
    const token = localStorage.getItem('fa_auth_token');

    if (isBeyanname) {
      const kztPerEur = Number(data.kur?.kzt_per_eur || 0);
      const vergiToplam = Number(data.eur?.vergi || 0);
      const kdvToplam = Number(data.eur?.kdv || 0);
      const kztKdv = Number(data.kzt?.kdv || 0);
      if (kztPerEur < 50 || kztPerEur > 2000) {
        throw new Error('KZT/EUR kuru geçersiz. Tenge tutarı EUR alanına yazılmadı.');
      }
      if (kztKdv > 0 && !(kdvToplam > 0)) {
        throw new Error('KDV EUR çevrilemedi. Tenge tutarı olduğu gibi yazılmadı.');
      }
      if (kdvToplam >= 50000 || (kztKdv > 1000 && Math.abs(kdvToplam - kztKdv) / kztKdv < 0.05)) {
        throw new Error('KDV hâlâ tenge görünüyor; EUR alanına yazılmadı.');
      }

      const listRes  = await fetch(`/api/shipments?ulke=${encodeURIComponent('KAZAKİSTAN')}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const listData = await listRes.json();
      if (!listData.success) throw new Error(listData.error);
      const list = listData.shipments || [];

      let targets = [];
      let grupNotu = '';
      for (const no of faturaNolar) {
        const hit = list.find(x => meKzNormFatura(x.fatura_no) === no);
        if (hit) targets.push(hit);
      }
      const seenIds = new Set();
      targets = targets.filter(s => {
        if (seenIds.has(s.id)) return false;
        seenIds.add(s.id);
        return true;
      });

      if (!targets.length && selectedId) {
        const sRes  = await fetch(`/api/shipments?id=${selectedId}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const sData = await sRes.json();
        if (!sData.success) throw new Error(sData.error);
        targets = [sData.shipment];
      }
      if (!targets.length) {
        throw new Error('Sevkiyat seçin veya PDF içindeki fatura no eşleşsin.');
      }

      const seed = targets[0];
      if (targets.length === 1 && seed.sefer_id) {
        const gRes  = await fetch(`/api/shipments?sefer_id=${seed.sefer_id}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const gData = await gRes.json();
        const group = (gData.success && gData.shipments) ? gData.shipments : [];
        const fatura = parseFloat(seed.fatura_bedeli_eur) || 0;
        const pdfTekFatura = faturaNolar.length === 1;
        const kdvCokBuyuk = fatura > 0 && kdvToplam > fatura * 0.35;
        if (group.length > 1 && !pdfTekFatura && kdvCokBuyuk) {
          targets = group;
          grupNotu = `Grup ${seed.sefer_id}: KDV/vergi fatura bedeline göre dağıtıldı`;
        }
      }

      const toplamEur = targets.reduce((sum, x) => sum + (parseFloat(x.fatura_bedeli_eur) || 0), 0);
      const paylar = targets.map(x => {
        const bedel = parseFloat(x.fatura_bedeli_eur) || 0;
        const oran = toplamEur > 0 ? bedel / toplamEur : 1 / targets.length;
        return { ...x, oran };
      });
      const vergiPays = meKzSplitAmount(vergiToplam, paylar);
      const kdvPays = meKzSplitAmount(kdvToplam, paylar);

      let detailHtml = `<div style="color:var(--success);">✓ Gümrük Beyannamesi — Vergi: ${fmtEur(vergiToplam)} | KDV: ${fmtEur(kdvToplam)}</div>
        <div style="margin-top:6px;">Vergi (1010+2010): <b>${fmt(data.kzt.vergi)} KZT</b> → ${fmtEur(vergiToplam)}<br>
        KDV (5060): <b>${fmt(data.kzt.kdv)} KZT</b> → ${fmtEur(kdvToplam)}</div>
        <div style="margin-top:6px;color:var(--text3);">Kur: 1 EUR = ${fmt(kztPerEur)} KZT</div>`;
      if (faturaNolar.length) {
        detailHtml += `<div style="margin-top:6px;font-size:12px;">PDF fatura no: <b>${faturaNolar.map(n => escapeHtml(n)).join(' · ')}</b></div>`;
      }
      if (paylar.length > 1) {
        detailHtml += `<div style="margin-top:8px;font-size:11px;color:var(--text3);">${escapeHtml(grupNotu || 'Orantılı dağıtım (fatura_bedeli_eur)')}:</div>
          <div style="margin-top:4px;">` +
          paylar.map((p, i) =>
            `<div>${escapeHtml(p.fatura_no || p.ihracat_dosya_no)}: vergi <b>${fmtEur(vergiPays[i])}</b> · KDV <b>${fmtEur(kdvPays[i])}</b></div>`
          ).join('') +
          `</div>`;
      }

      const onayli = await meKontrolEt(resultEl, 'kz', detailHtml,
        paylar.map((p, i) => ({ shipment: p, fields: { gumruk_vergisi_eur: vergiPays[i], kdv_eur: kdvPays[i] } })));
      if (!onayli) return;
      for (const r of onayli) {
        await meKzSaveFields(r.shipment, r.fields, token);
      }
      document.getElementById('me-kz-save-status').innerHTML =
        `<span style="color:var(--success);">✓ Kaydedildi (${onayli.length} sevkiyat güncellendi)</span>`;
      const inp = document.getElementById('me-kz-input');
      if (inp) inp.value = '';
      return;
    }

    // Broker (AVR) — PDF'de ANT+IHR varsa yarı yarıya böl
    const brokerage = data.brokerage_eur || 0;
    const other     = data.other_costs_eur || 0;
    const kalemHtml = (data.kalemler || []).length
      ? `<div style="margin-top:6px;font-size:11px;color:var(--text3);">Okunan kalemler:</div>
         <div style="margin-top:2px;">` +
         data.kalemler.map(k => `<div>${k.ad}: <b>${fmt(k.tutar)} KZT</b></div>`).join('') +
         `</div>`
      : '';
    let detailHtml = `<div style="color:var(--success);">✓ Broker faturası — Brokerage: ${fmtEur(brokerage)} | Diğer: ${fmtEur(other)}</div>
      <div style="margin-top:6px;">Brokerage: <b>${fmt(data.brokerage_kzt)} KZT</b> → ${fmtEur(brokerage)}<br>
      Diğer masraflar: <b>${fmt(data.other_costs_kzt)} KZT</b> → ${fmtEur(other)}</div>
      ${kalemHtml}
      <div style="margin-top:6px;color:var(--text3);">Kur: 1 EUR = ${fmt(data.kzt_per_eur)} KZT</div>`;
    if (faturaNolar.length) {
      detailHtml += `<div style="margin-top:6px;font-size:12px;">PDF fatura no: <b>${faturaNolar.map(n => escapeHtml(n)).join(' · ')}</b></div>`;
    }
    resultEl.innerHTML = detailHtml;

    let targets = [];
    let grupNotu = '';
    if (faturaNolar.length >= 1) {
      const listRes  = await fetch(`/api/shipments?ulke=${encodeURIComponent('KAZAKİSTAN')}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const listData = await listRes.json();
      if (!listData.success) throw new Error(listData.error);
      const list = listData.shipments || [];
      const missing = [];
      for (const no of faturaNolar) {
        const hit = list.find(x => meKzNormFatura(x.fatura_no) === no);
        if (hit) targets.push(hit);
        else missing.push(no);
      }
      if (missing.length && !targets.length) {
        throw new Error(`PDF'deki fatura no sevkiyatlarda bulunamadı: ${missing.join(', ')}`);
      }
    } else if (selectedId) {
      const sRes  = await fetch(`/api/shipments?id=${selectedId}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const sData = await sRes.json();
      if (!sData.success) throw new Error(sData.error);
      targets = [sData.shipment];
    } else {
      resultEl.innerHTML = detailHtml +
        `<div style="margin-top:8px;font-size:12px;color:var(--text3);">ℹ Üstten sevkiyat seçerek otomatik kaydedebilirsiniz.</div>`;
      return;
    }

    // Tekrarları düş (OCR aynı numarayı iki kez okursa)
    const seenIds = new Set();
    targets = targets.filter(s => {
      if (seenIds.has(s.id)) return false;
      seenIds.add(s.id);
      return true;
    });

    // OCR tek numara / hiç numara bulamazsa: seçili (veya bulunan) sevkiyatın
    // ANT+IHR grubuna yarı yarıya yay.
    if (targets.length < 2) {
      const seed = targets[0];
      if (seed?.sefer_id) {
        const gRes  = await fetch(`/api/shipments?sefer_id=${seed.sefer_id}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const gData = await gRes.json();
        if (gData.success && gData.shipments?.length) {
          const ant = gData.shipments.find(x => (x.fatura_no || '').startsWith('ANT'));
          const ihr = gData.shipments.find(x => (x.fatura_no || '').startsWith('IHR'));
          if (ant && ihr) {
            targets = [ant, ihr];
            grupNotu = `Grup ${seed.sefer_id}: ANT+IHR eşit bölündü`;
          }
        }
      }
    }

    const paylar = meKzPaylar(targets);
    const brokerPays = meKzSplitAmount(brokerage, paylar);
    const otherPays  = meKzSplitAmount(other, paylar);

    if (paylar.length > 1) {
      detailHtml += `<div style="margin-top:8px;font-size:11px;color:var(--text3);">Eşit dağıtım (yarı yarıya)${grupNotu ? ' — ' + escapeHtml(grupNotu) : ''}:</div>
        <div style="margin-top:4px;">` +
        paylar.map((p, i) =>
          `<div>${escapeHtml(p.fatura_no || p.ihracat_dosya_no)}: brokerage <b>${fmtEur(brokerPays[i])}</b>` +
          (otherPays[i] ? ` · diğer <b>${fmtEur(otherPays[i])}</b>` : '') +
          `</div>`
        ).join('') +
        `</div>`;
    }

    const onayli = await meKontrolEt(resultEl, 'kz', detailHtml,
      paylar.map((p, i) => ({ shipment: p, fields: { brokerage_eur: brokerPays[i], other_costs_eur: otherPays[i] } })));
    if (!onayli) return;
    for (const r of onayli) {
      await meKzSaveFields(r.shipment, r.fields, token);
    }

    document.getElementById('me-kz-save-status').innerHTML =
      `<span style="color:var(--success);">✓ Kaydedildi (${onayli.length} sevkiyat güncellendi)</span>`;
    const inp = document.getElementById('me-kz-input');
    if (inp) inp.value = '';

  } catch (saveErr) {
    const saveEl = document.getElementById('me-kz-save-status');
    if (saveEl) saveEl.innerHTML = `<span style="color:var(--error);">⚠ Kayıt hatası: ${escapeHtml(saveErr.message)}</span>`;
    else resultEl.innerHTML += `<div style="color:var(--error);">⚠ ${escapeHtml(saveErr.message)}</div>`;
  }
}

async function meKzSaveFields(shipment, fields, token) {
  const s = shipment;
  const body = {
    id:                    s.id,
    ihracat_dosya_no:      s.ihracat_dosya_no || '',
    nakliye_firmasi:       s.nakliye_firmasi || '',
    plaka:                 s.plaka || '',
    palet:                 s.palet || null,
    durum:                 s.durum || '',
    varis_tarihi:          s.varis_tarihi || '',
    gumrukleme_bitis:      s.gumrukleme_bitis || '',
    fatura_bedeli_tl:      s.fatura_bedeli_tl || 0,
    fatura_bedeli_eur:     s.fatura_bedeli_eur || 0,
    mal_bedeli_eur:        s.mal_bedeli_eur || 0,
    navlun_eur:            s.navlun_eur || 0,
    sigorta_eur:           s.sigorta_eur || 0,
    eur_kuru:              s.eur_kuru || 0,
    navlun_usd:            s.navlun_usd || 0,
    sigorta_usd:           s.sigorta_usd || 0,
    usd_kuru:              s.usd_kuru || 0,
    ihracat_beyanname_tl:  s.ihracat_beyanname_tl || 0,
    ihracat_beyanname_eur: s.ihracat_beyanname_eur || 0,
    arac_bekleme:          s.arac_bekleme || 0,
    other_costs_eur:       s.other_costs_eur || 0,
    brokerage_eur:         s.brokerage_eur || 0,
    gumruk_vergisi_eur:    s.gumruk_vergisi_eur || 0,
    kdv_eur:               s.kdv_eur || 0,
    ...fields,
  };
  const res  = await fetch('/api/shipments', {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body:    JSON.stringify(body),
  });
  const d = await res.json();
  if (!d.success) throw new Error(d.error || 'Kayıt hatası');
}

// ── ALMANYA MALİYET EVRAK ─────────────────────────────────────────────────────

async function meLoadDeShipments() {
  const sel      = document.getElementById('me-de-select');
  const statusEl = document.getElementById('me-de-select-status');
  if (!sel) return;
  if (statusEl) { statusEl.textContent = 'Yükleniyor...'; statusEl.style.color = 'var(--text3)'; }
  try {
    const token = localStorage.getItem('fa_auth_token');
    const res   = await fetch(`/api/shipments?ulke=${encodeURIComponent('ALMANYA')}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data  = await res.json();
    if (!data.success) throw new Error(data.error);
    const parseNo = s => { const m = (s || '').match(/^(\d+)-(\d+)$/); return m ? [+m[1], +m[2]] : [0, 0]; };
    const list = (data.shipments || []).sort((a, b) => {
      const [ay, an] = parseNo(a.ihracat_dosya_no);
      const [by, bn] = parseNo(b.ihracat_dosya_no);
      return by !== ay ? by - ay : bn - an;
    });
    const prev = sel.value;
    sel.innerHTML = '<option value="">— Sevkiyat seçin —</option>' +
      list.map(s => {
        const label = [s.ihracat_dosya_no, s.fatura_no].filter(Boolean).join(' · ');
        return `<option value="${s.id}">${escapeHtml(label)}</option>`;
      }).join('');
    if (prev && list.find(s => String(s.id) === prev)) sel.value = prev;
    if (statusEl) { statusEl.textContent = `${list.length} sevkiyat listelendi.`; statusEl.style.color = 'var(--text3)'; }
  } catch (err) {
    if (statusEl) { statusEl.textContent = '⚠ ' + err.message; statusEl.style.color = 'var(--error)'; }
  }
}

async function meHandleDePdf(file) {
  if (!file) return;
  const statusEl = document.getElementById('me-de-status');
  const resultEl = document.getElementById('me-de-result');
  statusEl.textContent = '⏳ PDF okunuyor...';
  statusEl.style.color = 'var(--text3)';
  resultEl.style.display = 'none';

  let data;
  try {
    const b64 = await fileToBase64(file);
    const token = localStorage.getItem('fa_auth_token');
    const res   = await fetch('/api/shipments/parse-de-pdf', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify({ pdf: b64 }),
    });
    data = await res.json();
    if (!data.success) throw new Error(data.error);
  } catch (err) {
    statusEl.style.color = 'var(--error)';
    statusEl.textContent = '⚠ ' + err.message;
    return;
  }

  const fmtEur = n => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' €';
  statusEl.style.color = 'var(--success)';
  statusEl.textContent = `✓ ${file.name} okundu`;
  resultEl.style.display = 'block';

  const gumrukV    = data.eur.gumruk_vergisi || 0;
  const kdv        = data.eur.kdv || 0;
  const brokerage  = data.eur.brokerage || 0;
  const otherCosts = data.eur.other_costs || 0;

  const detailHtml = `<div style="color:var(--success);">✓ Gümrük Faturası (Rechnung)</div>
    <div style="margin-top:6px;">Gümrük Vergisi (Zoll + Antidumping): <b>${fmtEur(gumrukV)}</b><br>
    KDV (Einfuhrumsatzsteuer): <b>${fmtEur(kdv)}</b><br>
    Brokerage Fee & Other Costs (Weitere Tarifposition + Zollabfertigung): <b>${fmtEur(brokerage)}</b><br>
    Other Costs (Vorauskassenabwicklung + Speditionsversicherung + ATLAS + Porti/Papiere): <b>${fmtEur(otherCosts)}</b></div>`;

  const selEl      = document.getElementById('me-de-select');
  const selectedId = selEl?.value;

  if (!selectedId) {
    resultEl.innerHTML = detailHtml + `<div style="margin-top:8px;font-size:12px;color:var(--text3);">ℹ Üstten sevkiyat seçerek otomatik kaydedebilirsiniz.</div>`;
    return;
  }

  // Seçili sevkiyata uygula — tek evrak tek sevkiyat, oranlama yapılmaz
  try {
    const token = localStorage.getItem('fa_auth_token');
    const sRes  = await fetch(`/api/shipments?id=${selectedId}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const sData = await sRes.json();
    if (!sData.success) throw new Error(sData.error);
    const s = sData.shipment;

    const onayli = await meKontrolEt(resultEl, 'de', detailHtml, [{ shipment: s, fields: {
      gumruk_vergisi_eur: gumrukV,
      kdv_eur:            kdv,
      brokerage_eur:      brokerage,
      other_costs_eur:    otherCosts,
    } }]);
    if (!onayli) return;
    await meDeSaveFields(onayli[0].shipment, onayli[0].fields, token);

    document.getElementById('me-de-save-status').innerHTML =
      `<span style="color:var(--success);">✓ Kaydedildi</span>`;
    const inp = document.getElementById('me-de-input');
    if (inp) inp.value = '';

  } catch (saveErr) {
    const saveEl = document.getElementById('me-de-save-status');
    if (saveEl) saveEl.innerHTML = `<span style="color:var(--error);">⚠ Kayıt hatası: ${escapeHtml(saveErr.message)}</span>`;
    else resultEl.innerHTML += `<div style="color:var(--error);">⚠ ${escapeHtml(saveErr.message)}</div>`;
  }
}

async function meDeSaveFields(shipment, fields, token) {
  const s = shipment;
  const body = {
    id:                    s.id,
    ihracat_dosya_no:      s.ihracat_dosya_no || '',
    nakliye_firmasi:       s.nakliye_firmasi || '',
    plaka:                 s.plaka || '',
    palet:                 s.palet || null,
    durum:                 s.durum || '',
    varis_tarihi:          s.varis_tarihi || '',
    gumrukleme_bitis:      s.gumrukleme_bitis || '',
    fatura_bedeli_tl:      s.fatura_bedeli_tl || 0,
    fatura_bedeli_eur:     s.fatura_bedeli_eur || 0,
    mal_bedeli_eur:        s.mal_bedeli_eur || 0,
    navlun_eur:            s.navlun_eur || 0,
    sigorta_eur:           s.sigorta_eur || 0,
    eur_kuru:              s.eur_kuru || 0,
    navlun_usd:            s.navlun_usd || 0,
    sigorta_usd:           s.sigorta_usd || 0,
    usd_kuru:              s.usd_kuru || 0,
    ihracat_beyanname_tl:  s.ihracat_beyanname_tl || 0,
    ihracat_beyanname_eur: s.ihracat_beyanname_eur || 0,
    arac_bekleme:          s.arac_bekleme || 0,
    other_costs_eur:       s.other_costs_eur || 0,
    brokerage_eur:         s.brokerage_eur || 0,
    gumruk_vergisi_eur:    s.gumruk_vergisi_eur || 0,
    kdv_eur:               s.kdv_eur || 0,
    ...fields,
  };
  const res  = await fetch('/api/shipments', {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body:    JSON.stringify(body),
  });
  const d = await res.json();
  if (!d.success) throw new Error(d.error || 'Kayıt hatası');
}

// ── HOLLANDA MALİYET EVRAK ────────────────────────────────────────────────

async function meLoadNlShipments() {
  const sel      = document.getElementById('me-nl-select');
  const statusEl = document.getElementById('me-nl-select-status');
  if (!sel) return;
  if (statusEl) { statusEl.textContent = 'Yükleniyor...'; statusEl.style.color = 'var(--text3)'; }
  try {
    const token = localStorage.getItem('fa_auth_token');
    const res   = await fetch(`/api/shipments?ulke=${encodeURIComponent('HOLLANDA')}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data  = await res.json();
    if (!data.success) throw new Error(data.error);
    const parseNo = s => { const m = (s || '').match(/^(\d+)-(\d+)$/); return m ? [+m[1], +m[2]] : [0, 0]; };
    const list = (data.shipments || []).sort((a, b) => {
      const [ay, an] = parseNo(a.ihracat_dosya_no);
      const [by, bn] = parseNo(b.ihracat_dosya_no);
      return by !== ay ? by - ay : bn - an;
    });
    const prev = sel.value;
    sel.innerHTML = '<option value="">— Sevkiyat seçin —</option>' +
      list.map(s => {
        const label = [s.ihracat_dosya_no, s.fatura_no].filter(Boolean).join(' · ');
        return `<option value="${s.id}">${escapeHtml(label)}</option>`;
      }).join('');
    if (prev && list.find(s => String(s.id) === prev)) sel.value = prev;
    if (statusEl) { statusEl.textContent = `${list.length} sevkiyat listelendi.`; statusEl.style.color = 'var(--text3)'; }
  } catch (err) {
    if (statusEl) { statusEl.textContent = '⚠ ' + err.message; statusEl.style.color = 'var(--error)'; }
  }
}

async function meHandleNlPdf(file) {
  if (!file) return;
  const statusEl = document.getElementById('me-nl-status');
  const resultEl = document.getElementById('me-nl-result');
  statusEl.textContent = '⏳ PDF okunuyor...';
  statusEl.style.color = 'var(--text3)';
  resultEl.style.display = 'none';

  let data;
  try {
    const b64 = await fileToBase64(file);
    const token = localStorage.getItem('fa_auth_token');
    const res   = await fetch('/api/shipments/parse-nl-pdf', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify({ pdf: b64 }),
    });
    data = await res.json();
    if (!data.success) throw new Error(data.error);
  } catch (err) {
    statusEl.style.color = 'var(--error)';
    statusEl.textContent = '⚠ ' + err.message;
    return;
  }

  const fmtEur = n => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' €';
  statusEl.style.color = 'var(--success)';
  statusEl.textContent = `✓ ${file.name} okundu`;
  resultEl.style.display = 'block';

  const brokerage = data.eur.brokerage || 0;
  const vergi     = data.eur.vergi || 0;

  const detailHtml = `<div style="color:var(--success);">✓ NedLine Gümrük/Broker Faturası</div>
    <div style="margin-top:6px;">Broker and other costs (CC + T1 + CCHS): <b>${fmtEur(brokerage)}</b><br>
    Tax (Invoerrechten + Fee): <b>${fmtEur(vergi)}</b></div>`;

  const selEl      = document.getElementById('me-nl-select');
  const selectedId = selEl?.value;

  if (!selectedId) {
    resultEl.innerHTML = detailHtml + `<div style="margin-top:8px;font-size:12px;color:var(--text3);">ℹ Üstten sevkiyat seçerek otomatik kaydedebilirsiniz.</div>`;
    return;
  }

  // Seçili sevkiyata uygula — tek evrak tek sevkiyat, oranlama yapılmaz
  try {
    const token = localStorage.getItem('fa_auth_token');
    const sRes  = await fetch(`/api/shipments?id=${selectedId}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const sData = await sRes.json();
    if (!sData.success) throw new Error(sData.error);
    const s = sData.shipment;

    const onayli = await meKontrolEt(resultEl, 'nl', detailHtml, [{ shipment: s, fields: {
      brokerage_eur:      brokerage,
      gumruk_vergisi_eur: vergi,
    } }]);
    if (!onayli) return;
    await meNlSaveFields(onayli[0].shipment, onayli[0].fields, token);

    document.getElementById('me-nl-save-status').innerHTML =
      `<span style="color:var(--success);">✓ Kaydedildi</span>`;
    const inp = document.getElementById('me-nl-input');
    if (inp) inp.value = '';

  } catch (saveErr) {
    const saveEl = document.getElementById('me-nl-save-status');
    if (saveEl) saveEl.innerHTML = `<span style="color:var(--error);">⚠ Kayıt hatası: ${escapeHtml(saveErr.message)}</span>`;
    else resultEl.innerHTML += `<div style="color:var(--error);">⚠ ${escapeHtml(saveErr.message)}</div>`;
  }
}

async function meNlSaveFields(shipment, fields, token) {
  const s = shipment;
  const body = {
    id:                    s.id,
    ihracat_dosya_no:      s.ihracat_dosya_no || '',
    nakliye_firmasi:       s.nakliye_firmasi || '',
    plaka:                 s.plaka || '',
    palet:                 s.palet || null,
    durum:                 s.durum || '',
    varis_tarihi:          s.varis_tarihi || '',
    gumrukleme_bitis:      s.gumrukleme_bitis || '',
    fatura_bedeli_tl:      s.fatura_bedeli_tl || 0,
    fatura_bedeli_eur:     s.fatura_bedeli_eur || 0,
    mal_bedeli_eur:        s.mal_bedeli_eur || 0,
    navlun_eur:            s.navlun_eur || 0,
    sigorta_eur:           s.sigorta_eur || 0,
    eur_kuru:              s.eur_kuru || 0,
    navlun_usd:            s.navlun_usd || 0,
    sigorta_usd:           s.sigorta_usd || 0,
    usd_kuru:              s.usd_kuru || 0,
    ihracat_beyanname_tl:  s.ihracat_beyanname_tl || 0,
    ihracat_beyanname_eur: s.ihracat_beyanname_eur || 0,
    arac_bekleme:          s.arac_bekleme || 0,
    other_costs_eur:       s.other_costs_eur || 0,
    brokerage_eur:         s.brokerage_eur || 0,
    gumruk_vergisi_eur:    s.gumruk_vergisi_eur || 0,
    kdv_eur:               s.kdv_eur || 0,
    ...fields,
  };
  const res  = await fetch('/api/shipments', {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body:    JSON.stringify(body),
  });
  const d = await res.json();
  if (!d.success) throw new Error(d.error || 'Kayıt hatası');
}

// ── BELÇİKA MALİYET EVRAK ─────────────────────────────────────────────────

async function meLoadBeShipments() {
  const sel      = document.getElementById('me-be-select');
  const statusEl = document.getElementById('me-be-select-status');
  if (!sel) return;
  if (statusEl) { statusEl.textContent = 'Yükleniyor...'; statusEl.style.color = 'var(--text3)'; }
  try {
    const token = localStorage.getItem('fa_auth_token');
    const res   = await fetch(`/api/shipments?ulke=${encodeURIComponent('BELÇİKA')}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data  = await res.json();
    if (!data.success) throw new Error(data.error);
    const parseNo = s => { const m = (s || '').match(/^(\d+)-(\d+)$/); return m ? [+m[1], +m[2]] : [0, 0]; };
    const list = (data.shipments || []).sort((a, b) => {
      const [ay, an] = parseNo(a.ihracat_dosya_no);
      const [by, bn] = parseNo(b.ihracat_dosya_no);
      return by !== ay ? by - ay : bn - an;
    });
    const prev = sel.value;
    sel.innerHTML = '<option value="">— Sevkiyat seçin —</option>' +
      list.map(s => {
        const label = [s.ihracat_dosya_no, s.fatura_no, s.sefer_id ? `[Grup ${s.sefer_id}]` : ''].filter(Boolean).join(' · ');
        return `<option value="${s.id}">${escapeHtml(label)}</option>`;
      }).join('');
    if (prev && list.find(s => String(s.id) === prev)) sel.value = prev;
    if (statusEl) { statusEl.textContent = `${list.length} sevkiyat listelendi.`; statusEl.style.color = 'var(--text3)'; }
  } catch (err) {
    if (statusEl) { statusEl.textContent = '⚠ ' + err.message; statusEl.style.color = 'var(--error)'; }
  }
}

async function meHandleBePdf(file) {
  if (!file) return;
  const statusEl = document.getElementById('me-be-status');
  const resultEl = document.getElementById('me-be-result');
  statusEl.textContent = '⏳ PDF okunuyor...';
  statusEl.style.color = 'var(--text3)';
  resultEl.style.display = 'none';

  let data;
  try {
    const b64 = await fileToBase64(file);
    const token = localStorage.getItem('fa_auth_token');
    const res   = await fetch('/api/shipments/parse-be-pdf', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify({ pdf: b64 }),
    });
    data = await res.json();
    if (!data.success) throw new Error(data.error);
  } catch (err) {
    statusEl.style.color = 'var(--error)';
    statusEl.textContent = '⚠ ' + err.message;
    return;
  }

  const fmtEur = n => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' €';
  statusEl.style.color = 'var(--success)';
  statusEl.textContent = `✓ ${file.name} okundu`;
  resultEl.style.display = 'block';

  // 605 INVOERRECHTEN → ANT vergi | 522 BIJKOMENDE DOUANE-TARIEVEN → IHR vergi
  // 112 ADMINISTRATIEVE KOSTEN + 511 IMPORT DOUANEFORMALITEITEN → yarı yarıya her iki broker alanına
  const invoerrechten       = data.eur.invoerrechten || 0;
  const bijkomende          = data.eur.bijkomende || 0;
  const brokerFixedToplam   = (data.eur.administratieve || 0) + (data.eur.douaneformaliteiten || 0);
  const brokerFixedPerTaraf = Math.round((brokerFixedToplam / 2) * 100) / 100;

  const detailHtml = `<div style="color:var(--success);">✓ Intertrans Broker Faturası</div>
    <div style="margin-top:6px;">INVOERRECHTEN (605) → ANT vergi: <b>${fmtEur(invoerrechten)}</b><br>
    BIJKOMENDE DOUANE-TARIEVEN (522) → IHR vergi: <b>${fmtEur(bijkomende)}</b><br>
    ADMINISTRATIEVE KOSTEN + IMPORT DOUANEFORMALITEITEN = ${fmtEur(brokerFixedToplam)} → her iki tarafa: <b>${fmtEur(brokerFixedPerTaraf)}</b></div>`;

  const selEl      = document.getElementById('me-be-select');
  const selectedId = selEl?.value;

  if (!selectedId) {
    resultEl.innerHTML = detailHtml + `<div style="margin-top:8px;font-size:12px;color:var(--text3);">ℹ Üstten sevkiyat seçerek otomatik kaydedebilirsiniz.</div>`;
    return;
  }

  // ANT/IHR çiftini sefer_id grubundan bul — fatura tek başına ikisini birden kapsar
  try {
    const token = localStorage.getItem('fa_auth_token');
    const sRes  = await fetch(`/api/shipments?id=${selectedId}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const sData = await sRes.json();
    if (!sData.success) throw new Error(sData.error);
    const s = sData.shipment;

    if (!s.sefer_id) throw new Error('Bu sevkiyatın bir sefer grubu yok — ANT/IHR eşleşmesi için önce iki sevkiyatı aynı gruba (sefer_id) almalısınız.');

    const gRes  = await fetch(`/api/shipments?sefer_id=${s.sefer_id}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const gData = await gRes.json();
    if (!gData.success || !gData.shipments?.length) throw new Error('Grup sevkiyatları alınamadı');
    const group = gData.shipments;

    const antShip = group.find(x => (x.fatura_no || '').startsWith('ANT'));
    const ihrShip = group.find(x => (x.fatura_no || '').startsWith('IHR'));
    if (!antShip || !ihrShip) throw new Error('Grupta hem ANT hem IHR fatura numaralı bir sevkiyat bulunamadı.');

    const onayli = await meKontrolEt(resultEl, 'be',
      detailHtml + `<div style="margin-top:8px;font-size:11px;">Vergi → ANT: <b>${escapeHtml(antShip.fatura_no)}</b> · IHR: <b>${escapeHtml(ihrShip.fatura_no)}</b></div>`,
      [
        { shipment: antShip, fields: { gumruk_vergisi_eur: invoerrechten, brokerage_eur: brokerFixedPerTaraf, kdv_eur: 0 } },
        { shipment: ihrShip, fields: { gumruk_vergisi_eur: bijkomende,    brokerage_eur: brokerFixedPerTaraf, kdv_eur: 0 } },
      ]);
    if (!onayli) return;
    await Promise.all(onayli.map(r => meBeSaveFields(r.shipment, r.fields, token)));

    document.getElementById('me-be-save-status').innerHTML =
      `<span style="color:var(--success);">✓ Kaydedildi (2 sevkiyat güncellendi)</span>`;
    const inp = document.getElementById('me-be-input');
    if (inp) inp.value = '';

  } catch (saveErr) {
    const saveEl = document.getElementById('me-be-save-status');
    if (saveEl) saveEl.innerHTML = `<span style="color:var(--error);">⚠ Kayıt hatası: ${escapeHtml(saveErr.message)}</span>`;
    else resultEl.innerHTML += `<div style="color:var(--error);">⚠ ${escapeHtml(saveErr.message)}</div>`;
  }
}

async function meBeSaveFields(shipment, fields, token) {
  const s = shipment;
  const body = {
    id:                    s.id,
    ihracat_dosya_no:      s.ihracat_dosya_no || '',
    nakliye_firmasi:       s.nakliye_firmasi || '',
    plaka:                 s.plaka || '',
    palet:                 s.palet || null,
    durum:                 s.durum || '',
    varis_tarihi:          s.varis_tarihi || '',
    gumrukleme_bitis:      s.gumrukleme_bitis || '',
    fatura_bedeli_tl:      s.fatura_bedeli_tl || 0,
    fatura_bedeli_eur:     s.fatura_bedeli_eur || 0,
    mal_bedeli_eur:        s.mal_bedeli_eur || 0,
    navlun_eur:            s.navlun_eur || 0,
    sigorta_eur:           s.sigorta_eur || 0,
    eur_kuru:              s.eur_kuru || 0,
    navlun_usd:            s.navlun_usd || 0,
    sigorta_usd:           s.sigorta_usd || 0,
    usd_kuru:              s.usd_kuru || 0,
    ihracat_beyanname_tl:  s.ihracat_beyanname_tl || 0,
    ihracat_beyanname_eur: s.ihracat_beyanname_eur || 0,
    arac_bekleme:          s.arac_bekleme || 0,
    other_costs_eur:       s.other_costs_eur || 0,
    brokerage_eur:         s.brokerage_eur || 0,
    gumruk_vergisi_eur:    s.gumruk_vergisi_eur || 0,
    kdv_eur:               s.kdv_eur || 0,
    ...fields,
  };
  const res  = await fetch('/api/shipments', {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body:    JSON.stringify(body),
  });
  const d = await res.json();
  if (!d.success) throw new Error(d.error || 'Kayıt hatası');
}

// ── BOSNA MALİYET EVRAK ───────────────────────────────────────────────────

async function meLoadBaShipments() {
  const sel      = document.getElementById('me-ba-select');
  const statusEl = document.getElementById('me-ba-select-status');
  if (!sel) return;
  if (statusEl) { statusEl.textContent = 'Yükleniyor...'; statusEl.style.color = 'var(--text3)'; }
  try {
    const token = localStorage.getItem('fa_auth_token');
    const res   = await fetch(`/api/shipments?ulke=${encodeURIComponent('BOSNA')}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data  = await res.json();
    if (!data.success) throw new Error(data.error);
    const parseNo = s => { const m = (s || '').match(/^(\d+)-(\d+)$/); return m ? [+m[1], +m[2]] : [0, 0]; };
    const list = (data.shipments || []).sort((a, b) => {
      const [ay, an] = parseNo(a.ihracat_dosya_no);
      const [by, bn] = parseNo(b.ihracat_dosya_no);
      return by !== ay ? by - ay : bn - an;
    });
    const prev = sel.value;
    sel.innerHTML = '<option value="">— Sevkiyat seçin —</option>' +
      list.map(s => {
        const label = [s.ihracat_dosya_no, s.fatura_no].filter(Boolean).join(' · ');
        return `<option value="${s.id}">${escapeHtml(label)}</option>`;
      }).join('');
    if (prev && list.find(s => String(s.id) === prev)) sel.value = prev;
    if (statusEl) { statusEl.textContent = `${list.length} sevkiyat listelendi.`; statusEl.style.color = 'var(--text3)'; }
  } catch (err) {
    if (statusEl) { statusEl.textContent = '⚠ ' + err.message; statusEl.style.color = 'var(--error)'; }
  }
}

// ── BOSNA MANUEL GİRİŞ ─────────────────────────────────────────────────────

const BA_BAM_PER_EUR = 1.95583;

function parseLocaleAmount(raw) {
  if (raw == null) return 0;
  let s = String(raw).trim().replace(/\u00a0/g, ' ').replace(/\s+/g, '');
  if (!s) return 0;
  s = s.replace(/[^\d,.\-]/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    s = s.replace(',', '.');
  } else if (lastDot >= 0 && s.split('.').length > 2) {
    s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function meBaManualPreview() {
  const fmt    = n => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const fmtEur = n => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' €';

  const osnovica = parseLocaleAmount(document.getElementById('me-ba-manual-osnovica')?.value);
  const carinski = parseLocaleAmount(document.getElementById('me-ba-manual-carinski')?.value);
  const broker   = osnovica - carinski;
  const brokerEl = document.getElementById('me-ba-manual-broker-eur');
  if (brokerEl) brokerEl.textContent = `Broker = ${fmt(broker)} BAM → ${fmtEur(broker / BA_BAM_PER_EUR)}`;

  for (const key of ['vergi', 'kdv']) {
    const input = document.getElementById(`me-ba-manual-${key}`);
    const out   = document.getElementById(`me-ba-manual-${key}-eur`);
    if (!input || !out) continue;
    const bam = parseLocaleAmount(input.value);
    out.textContent = `= ${fmtEur(bam / BA_BAM_PER_EUR)}`;
  }
}

async function meBaManualSave() {
  const statusEl    = document.getElementById('me-ba-manual-status');
  const selEl       = document.getElementById('me-ba-select');
  const selectedId  = selEl?.value;

  if (!selectedId) {
    if (statusEl) { statusEl.textContent = '⚠ Önce sevkiyat seçin.'; statusEl.style.color = 'var(--error)'; }
    return;
  }

  const osnovicaBam = parseLocaleAmount(document.getElementById('me-ba-manual-osnovica').value);
  const carinskiBam = parseLocaleAmount(document.getElementById('me-ba-manual-carinski').value);
  const brokerBam   = osnovicaBam - carinskiBam;
  const vergiBam    = parseLocaleAmount(document.getElementById('me-ba-manual-vergi').value);
  const kdvBam      = parseLocaleAmount(document.getElementById('me-ba-manual-kdv').value);

  const saveFields = {};
  if (brokerBam) saveFields.brokerage_eur      = Math.round(brokerBam / BA_BAM_PER_EUR * 100) / 100;
  if (vergiBam)  saveFields.gumruk_vergisi_eur = Math.round(vergiBam  / BA_BAM_PER_EUR * 100) / 100;
  if (kdvBam)    saveFields.kdv_eur            = Math.round(kdvBam    / BA_BAM_PER_EUR * 100) / 100;

  if (Object.keys(saveFields).length === 0) {
    if (statusEl) { statusEl.textContent = '⚠ En az bir tutar girin.'; statusEl.style.color = 'var(--error)'; }
    return;
  }

  if (statusEl) { statusEl.textContent = '⏳ Kaydediliyor...'; statusEl.style.color = 'var(--text3)'; }
  try {
    const token = localStorage.getItem('fa_auth_token');
    const sRes  = await fetch(`/api/shipments?id=${selectedId}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const sData = await sRes.json();
    if (!sData.success) throw new Error(sData.error);

    await meKzSaveFields(sData.shipment, saveFields, token);

    if (statusEl) { statusEl.textContent = '✓ Kaydedildi'; statusEl.style.color = 'var(--success)'; }
    ['osnovica', 'carinski', 'vergi', 'kdv'].forEach(key => {
      const input = document.getElementById(`me-ba-manual-${key}`);
      if (input) input.value = '';
    });
    meBaManualPreview();
  } catch (err) {
    if (statusEl) { statusEl.textContent = '⚠ ' + err.message; statusEl.style.color = 'var(--error)'; }
  }
}

// ── MAKEDONYA MALİYET EVRAK ────────────────────────────────────────────────

async function meLoadMkShipments() {
  const sel      = document.getElementById('me-mk-select');
  const statusEl = document.getElementById('me-mk-select-status');
  if (!sel) return;
  if (statusEl) { statusEl.textContent = 'Yükleniyor...'; statusEl.style.color = 'var(--text3)'; }
  try {
    const token = localStorage.getItem('fa_auth_token');
    const res   = await fetch(`/api/shipments?ulke=${encodeURIComponent('MAKEDONYA')}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data  = await res.json();
    if (!data.success) throw new Error(data.error);
    const parseNo = s => { const m = (s || '').match(/^(\d+)-(\d+)$/); return m ? [+m[1], +m[2]] : [0, 0]; };
    const list = (data.shipments || []).sort((a, b) => {
      const [ay, an] = parseNo(a.ihracat_dosya_no);
      const [by, bn] = parseNo(b.ihracat_dosya_no);
      return by !== ay ? by - ay : bn - an;
    });
    const prev = sel.value;
    sel.innerHTML = '<option value="">— Sevkiyat seçin —</option>' +
      list.map(s => {
        const label = [s.ihracat_dosya_no, s.fatura_no].filter(Boolean).join(' · ');
        return `<option value="${s.id}">${escapeHtml(label)}</option>`;
      }).join('');
    if (prev && list.find(s => String(s.id) === prev)) sel.value = prev;
    if (statusEl) { statusEl.textContent = `${list.length} sevkiyat listelendi.`; statusEl.style.color = 'var(--text3)'; }
  } catch (err) {
    if (statusEl) { statusEl.textContent = '⚠ ' + err.message; statusEl.style.color = 'var(--error)'; }
  }
}

// ── MAKEDONYA MANUEL GİRİŞ ───────────────────────────────────────────────────
// MKD, Makedon Dinarı'nın Euro'ya sabit çapası (Merkez Bankası paritesi ~61,5).

const MK_MKD_PER_EUR = 61.5;

function meMkManualPreview() {
  const fmtEur = n => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' €';
  for (const key of ['vergi', 'kdv', 'other']) {
    const input = document.getElementById(`me-mk-manual-${key}`);
    const out   = document.getElementById(`me-mk-manual-${key}-eur`);
    if (!input || !out) continue;
    const mkd = parseLocaleAmount(input.value);
    out.textContent = `= ${fmtEur(mkd / MK_MKD_PER_EUR)}`;
  }
}

async function meMkManualSave() {
  const statusEl   = document.getElementById('me-mk-manual-status');
  const selEl      = document.getElementById('me-mk-select');
  const selectedId = selEl?.value;

  if (!selectedId) {
    if (statusEl) { statusEl.textContent = '⚠ Önce sevkiyat seçin.'; statusEl.style.color = 'var(--error)'; }
    return;
  }

  const brokerEur = parseLocaleAmount(document.getElementById('me-mk-manual-broker').value);
  const vergiMkd  = parseLocaleAmount(document.getElementById('me-mk-manual-vergi').value);
  const kdvMkd    = parseLocaleAmount(document.getElementById('me-mk-manual-kdv').value);
  const otherMkd  = parseLocaleAmount(document.getElementById('me-mk-manual-other').value);

  const saveFields = {};
  if (brokerEur) saveFields.brokerage_eur      = Math.round(brokerEur * 100) / 100;
  if (vergiMkd)  saveFields.gumruk_vergisi_eur = Math.round(vergiMkd / MK_MKD_PER_EUR * 100) / 100;
  if (kdvMkd)    saveFields.kdv_eur            = Math.round(kdvMkd   / MK_MKD_PER_EUR * 100) / 100;
  if (otherMkd)  saveFields.other_costs_eur    = Math.round(otherMkd / MK_MKD_PER_EUR * 100) / 100;

  if (Object.keys(saveFields).length === 0) {
    if (statusEl) { statusEl.textContent = '⚠ En az bir tutar girin.'; statusEl.style.color = 'var(--error)'; }
    return;
  }

  if (statusEl) { statusEl.textContent = '⏳ Kaydediliyor...'; statusEl.style.color = 'var(--text3)'; }
  try {
    const token = localStorage.getItem('fa_auth_token');
    const sRes  = await fetch(`/api/shipments?id=${selectedId}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const sData = await sRes.json();
    if (!sData.success) throw new Error(sData.error);

    await meKzSaveFields(sData.shipment, saveFields, token);

    if (statusEl) { statusEl.textContent = '✓ Kaydedildi'; statusEl.style.color = 'var(--success)'; }
    ['vergi', 'kdv', 'other'].forEach(key => {
      const input = document.getElementById(`me-mk-manual-${key}`);
      if (input) input.value = '';
    });
    meMkManualPreview();
  } catch (err) {
    if (statusEl) { statusEl.textContent = '⚠ ' + err.message; statusEl.style.color = 'var(--error)'; }
  }
}

async function meHandleAksuFile(file) {
  if (!file) return;

  const statusEl = document.getElementById('me-aksu-status');
  const resultEl = document.getElementById('me-aksu-result');
  if (!statusEl || !resultEl) return;

  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const isExcel = ext === 'xlsx' || ext === 'xls';
  const isPdf = ext === 'pdf';
  if (!isExcel && !isPdf) {
    statusEl.style.color = 'var(--error)';
    statusEl.textContent = '⚠ PDF veya Excel (.xlsx / .xls) yükleyin';
    return;
  }

  statusEl.style.color = 'var(--text3)';
  statusEl.textContent = isExcel
    ? '⏳ Excel okunuyor ve eşleştiriliyor...'
    : '⏳ PDF okunuyor ve eşleştiriliyor...';
  resultEl.style.display = 'none';

  try {
    const b64 = await fileToBase64(file);
    const token = localStorage.getItem('fa_auth_token');
    const payload = isExcel ? { excel: b64 } : { pdf: b64 };
    const resp = await fetch('/api/shipments/parse-aksu-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);

    const okunan = data.okunan != null ? data.okunan + ' satır okundu, ' : '';
    statusEl.style.color = 'var(--success)';
    statusEl.textContent = `✓ ${okunan}${data.eslesen} kayıt güncellendi, ${data.atlanan} atlandı.`;

    if (data.hatalar && data.hatalar.length) {
      resultEl.style.display = 'block';
      resultEl.innerHTML = `
        <div style="font-size:12px;font-weight:600;color:var(--text3);margin-bottom:8px;">Detaylar</div>
        <div class="me-aksu-log">
          ${data.hatalar.map(h => {
            const ok = String(h).startsWith('✓');
            return `<div class="me-aksu-log-row" style="color:${ok ? 'var(--success)' : 'var(--text3)'}">${ok ? '' : '⚠ '}${escapeHtml(h)}</div>`;
          }).join('')}
        </div>`;
    }

    if (data.eslesen > 0 && typeof loadShipments === 'function') {
      loadShipments();
    }
  } catch (err) {
    statusEl.style.color = 'var(--error)';
    statusEl.textContent = '⚠ ' + (err.message || err);
  } finally {
    const input = document.getElementById('me-aksu-input');
    if (input) input.value = '';
  }
}

// ── KONUM RAPORU → VARIŞ GÜMRÜK ──────────────────────────────────────────────
// "Konum Raporu" butonu sürükle-bırak penceresini açar; Excel yüklenince varış
// tarihi gelen sevkiyatlar listelenir. Yükleme HİÇBİR ŞEY YAZMAZ: hiçbir satır
// işaretli gelmez, tarihler elle düzeltilebilir; yalnız kullanıcının işaretleyip
// "Varış Gümrük Yap" ile onayladıkları yazılır.
// Backend: api/shipments.py (konum_raporu_onizle, konum_raporu_uygula).
let konumRaporuSonuc = null;
function konumRaporuSec() {
  konumYuklemeAc();
}

function konumExcelSec() {
  const input = document.getElementById('konum-raporu-input');
  if (!input) return;
  input.value = '';
  input.click();
}

function konumTarihGoster(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

function konumModal(baslik, icerikHtml, altHtml = '') {
  document.getElementById('konum-raporu-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'konum-raporu-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:400;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:var(--surface);border:0.5px solid var(--border2);border-radius:var(--radius-xl);
                width:min(1040px,95vw);max-height:88vh;display:flex;flex-direction:column;box-shadow:0 8px 40px rgba(0,0,0,0.18);">
      <div style="padding:16px 22px;border-bottom:0.5px solid var(--border2);display:flex;align-items:center;gap:10px;">
        <div style="font-size:16px;font-weight:700;color:var(--text);margin-right:auto;">${baslik}</div>
        <button onclick="document.getElementById('konum-raporu-overlay')?.remove()"
          style="border:none;background:none;font-size:20px;cursor:pointer;color:var(--text3);">×</button>
      </div>
      <div id="konum-raporu-govde" style="padding:14px 22px;overflow:auto;flex:1;">${icerikHtml}</div>
      ${altHtml ? `<div style="padding:12px 22px;border-top:0.5px solid var(--border2);display:flex;gap:10px;justify-content:flex-end;align-items:center;">${altHtml}</div>` : ''}
    </div>`;
  document.body.appendChild(overlay);
}

// Sürükle-bırak alanı (yalnız .xlsx). Modal çizildikten sonra konumDropzoneBagla() çağrılır.
function konumDropzoneHtml(kucuk = false) {
  return `<div class="drop-zone role-write-only" id="konum-dropzone" onclick="konumExcelSec()"
      style="${kucuk ? 'padding:12px 16px;' : 'padding:22px 20px;'}margin-bottom:14px;">
    ${kucuk ? '' : '<div class="drop-icon">📍</div>'}
    <h3 style="${kucuk ? 'margin:0;' : ''}">Konum raporu Excel'lerini buraya sürükleyin</h3>
    <div id="konum-dropzone-hata" style="display:none;margin-top:6px;font-size:12px;color:#B91C1C;"></div>
  </div>`;
}

function konumDropzoneBagla() {
  const dz = document.getElementById('konum-dropzone');
  if (!dz) return;
  const engelle = e => { e.preventDefault(); e.stopPropagation(); };
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { engelle(e); dz.classList.add('dragover'); }));
  dz.addEventListener('dragleave', e => { engelle(e); if (!dz.contains(e.relatedTarget)) dz.classList.remove('dragover'); });
  dz.addEventListener('drop', e => {
    engelle(e);
    dz.classList.remove('dragover');
    const hepsi = [...(e.dataTransfer?.files || [])];
    const excel = hepsi.filter(f => /\.xlsx$/i.test(f.name));
    const hataEl = document.getElementById('konum-dropzone-hata');
    if (!excel.length) {
      if (hataEl) { hataEl.style.display = 'block'; hataEl.textContent = '⚠ Yalnızca .xlsx dosyası bırakın.'; }
      return;
    }
    if (excel.length < hepsi.length && hataEl) {
      hataEl.style.display = 'block';
      hataEl.textContent = `⚠ ${hepsi.length - excel.length} dosya .xlsx olmadığı için atlandı.`;
    }
    konumRaporuYukle(excel);
  });
  // Modal dışına/yanına bırakılan dosya tarayıcıda açılmasın
  const overlay = document.getElementById('konum-raporu-overlay');
  ['dragover', 'drop'].forEach(ev => overlay?.addEventListener(ev, e => e.preventDefault()));
}

const KONUM_BTN = 'padding:8px 16px;border-radius:var(--radius-md);font-family:var(--font);font-size:12.5px;font-weight:600;cursor:pointer;';
const KONUM_BTN_GHOST = KONUM_BTN + 'background:transparent;color:var(--text2);border:0.5px solid var(--border2);';
const KONUM_BTN_PRIMARY = KONUM_BTN + 'background:var(--accent);color:#fff;border:none;';
const KONUM_TH = 'text-align:left;padding:6px 8px;font-size:11px;color:var(--text3);font-weight:600;border-bottom:0.5px solid var(--border2);white-space:nowrap;';
const KONUM_TD = 'padding:6px 8px;font-size:12px;color:var(--text);border-bottom:0.5px solid var(--border);vertical-align:top;';
const KONUM_MONO = 'font-family:var(--mono);';

// ── Yük konumları paneli ─────────────────────────────────────────────────────
// Yükleme penceresi: sürükle-bırak alanı (+ son işlemin sonucu). Hiçbir şey kaydetmez.
function konumYuklemeAc(bilgi = '') {
  const bilgiHtml = bilgi
    ? `<div style="font-size:12.5px;padding:8px 12px;margin-bottom:12px;border-radius:var(--radius-md);background:#EAF3DE;color:#27500A;">${bilgi}</div>`
    : '';
  konumModal('📍 Konum Raporu', `${bilgiHtml}${konumDropzoneHtml()}`,
    `<button onclick="document.getElementById('konum-raporu-overlay')?.remove()" style="${KONUM_BTN_GHOST}">Kapat</button>`);
  konumDropzoneBagla();
}

// ── Excel yükleme → (gerekirse) varış onayı ──────────────────────────────────
async function konumRaporuYukle(files) {
  const liste = [...(files || [])];
  if (!liste.length) return;
  konumModal('📍 Konum Raporu', `<div style="padding:30px;text-align:center;color:var(--text2);font-size:13px;">
    ⏳ ${liste.length} rapor okunuyor...</div>`);
  try {
    const excels = [];
    for (const f of liste) excels.push({ ad: f.name, b64: await fileToBase64(f) });
    const token = localStorage.getItem('fa_auth_token');
    const resp = await fetch('/api/shipments/konum-raporu/onizle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ excels }),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Rapor okunamadı');
    konumRaporuSonuc = data;

    const onayBekleyen = (data.guncellenecek || []).length + (data.belirsiz || []).length + (data.hatali || []).length;
    if (!onayBekleyen) {
      konumYuklemeAc('Raporda varış tarihi gelen yeni sevkiyat yok. Hiçbir şey değiştirilmedi.');
      return;
    }
    konumRaporuOnizlemeCiz();
  } catch (e) {
    konumModal('📍 Konum Raporu', `<div style="padding:20px;color:#B91C1C;font-size:13px;">⚠ ${escapeHtml(e.message)}</div>`,
      `<button onclick="konumYuklemeAc()" style="${KONUM_BTN_GHOST}">← Geri</button>`);
  }
}

// Tek tablo: varış tarihi gelen sevkiyatlar. Hiçbiri işaretli gelmez; tarih düzenlenebilir.
// Belirsiz / tarihi okunamayan satırlar da burada, tarihi boş ve kısa uyarıyla.
function konumRaporuOnizlemeCiz() {
  const d = konumRaporuSonuc || {};
  const th = KONUM_TH, td = KONUM_TD;
  const satirlar = [
    // tahmin_notu: raporda varış tarihi yok, açıklamadan (Gümrükte/Boşaltıldı) çıkarıldı
    ...(d.guncellenecek || []).map(s => ({ s, tarih: s.yeni_tarih, uyari: s.tahmin_notu || '' })),
    ...(d.belirsiz || []).map(s => ({ s, tarih: '', uyari: 'Raporda birden fazla satır uyuyor, tarihi siz girin' })),
    ...(d.hatali || []).map(s => ({ s, tarih: '', uyari: `Rapordaki tarih okunamadı: "${s.hatali_deger || ''}"` })),
  ];

  const satirHtml = ({ s, tarih, uyari }) => `<tr>
    <td style="${td}"><input type="checkbox" class="konum-sec" data-id="${s.id}" data-sefer="${s.sefer_id || ''}" onchange="konumGrupSec(this)"></td>
    <td style="${td}font-family:var(--mono);color:var(--accent);white-space:nowrap;">${escapeHtml(s.ihracat_dosya_no || '')}</td>
    <td style="${td}">${escapeHtml(s.ulke || '')}</td>
    <td style="${td}font-family:var(--mono);font-size:11px;">${escapeHtml(s.plaka || '')}</td>
    <td style="${td}color:var(--text2);">${escapeHtml((s.satir || {}).aciklama || '')}</td>
    <td style="${td}white-space:nowrap;">
      <input type="date" class="konum-tarih" data-id="${s.id}" data-rapor="${escapeHtml(tarih || '')}"
             data-yukleme="${escapeHtml(s.yukleme_tarihi || '')}" value="${escapeHtml(tarih || '')}"
             oninput="konumTarihDegisti(this)"
             style="height:30px;padding:0 6px;border-radius:var(--radius-md);border:0.5px solid var(--border2);
                    background:var(--surface2);color:var(--text);font-family:var(--font);font-size:12.5px;">
      <div class="konum-tarih-not" data-id="${s.id}" data-uyari="${escapeHtml(uyari)}"
           style="font-size:11px;margin-top:2px;color:#B45309;">${escapeHtml(uyari)}</div>
    </td></tr>`;

  const html = `
    <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">
      <tr>
        <th style="${th}"><input type="checkbox" title="Tümünü seç"
          onclick="document.querySelectorAll('.konum-sec').forEach(c=>c.checked=this.checked);konumRaporuSecimSay();"></th>
        <th style="${th}">Dosya No</th><th style="${th}">Ülke</th><th style="${th}">Plaka</th>
        <th style="${th}">Konum</th><th style="${th}">Varış Tarihi</th>
      </tr>
      ${satirlar.map(satirHtml).join('')}
    </table></div>`;

  konumModal('📍 Varış Tarihi Gelenler', html, `
    <span id="konum-raporu-secim" style="font-size:12px;color:var(--text2);margin-right:auto;"></span>
    <button onclick="konumYuklemeAc()" style="${KONUM_BTN_GHOST}">Vazgeç</button>
    <button id="konum-raporu-uygula" onclick="konumRaporuUygula()" style="${KONUM_BTN_PRIMARY}">Varış Gümrük Yap</button>`);
  document.querySelectorAll('.konum-tarih').forEach(el => konumTarihKontrol(el));
  konumRaporuSecimSay();
}

// Gruplu sevkiyatlar (aynı sefer_id) aynı araçtadır: biri seçilince/tarihi değişince eşleri de
function konumGrupEsleri(cb) {
  const sefer = cb?.dataset.sefer;
  if (!sefer) return [];
  return [...document.querySelectorAll(`.konum-sec[data-sefer="${sefer}"]`)].filter(x => x !== cb);
}

function konumGrupSec(cb) {
  konumGrupEsleri(cb).forEach(x => { x.checked = cb.checked; });
  konumRaporuSecimSay();
}

// Tarih hücresi değişince: raporla farkı işaretle, geçerliliği kontrol et, satırı seç
function konumTarihDegisti(el) {
  const cb = document.querySelector(`.konum-sec[data-id="${el.dataset.id}"]`);
  const hedefler = [el, ...konumGrupEsleri(cb).map(x => document.querySelector(`.konum-tarih[data-id="${x.dataset.id}"]`)).filter(Boolean)];
  hedefler.forEach(t => {
    if (t !== el) t.value = el.value;
    konumTarihKontrol(t);
    const c = document.querySelector(`.konum-sec[data-id="${t.dataset.id}"]`);
    if (c && t.value) c.checked = true;
  });
  konumRaporuSecimSay();
}

function konumTarihKontrol(el) {
  const not = document.querySelector(`.konum-tarih-not[data-id="${el.dataset.id}"]`);
  const hata = konumTarihHatasi(el);
  el.style.borderColor = hata ? '#EF4444' : (el.value && el.value !== el.dataset.rapor ? '#B45309' : 'var(--border2)');
  if (!not) return;
  if (hata) { not.style.color = '#B91C1C'; not.textContent = hata; }
  else if (el.value && el.dataset.rapor && el.value !== el.dataset.rapor) {
    not.style.color = '#B45309'; not.textContent = `elle değiştirildi (rapor: ${konumTarihGoster(el.dataset.rapor)})`;
  } else { not.style.color = '#B45309'; not.textContent = el.value && !el.dataset.rapor ? '' : (not.dataset.uyari || ''); }
}

function konumTarihHatasi(el) {
  const v = el.value;
  if (!v) return '';
  if (v > bugunISO()) return 'bugünden ileri olamaz';
  if (el.dataset.yukleme && v < el.dataset.yukleme) return 'yüklemeden önce olamaz';
  return '';
}

function konumRaporuSecimSay() {
  const n = document.querySelectorAll('.konum-sec:checked').length;
  const el = document.getElementById('konum-raporu-secim');
  if (el) el.textContent = document.querySelector('.konum-sec') ? `${n} kayıt seçili` : '';
  const btn = document.getElementById('konum-raporu-uygula');
  if (btn) { btn.disabled = !n; btn.style.opacity = n ? '1' : '0.5'; }
}

async function konumRaporuUygula() {
  const secili = [...document.querySelectorAll('.konum-sec:checked')];
  if (!secili.length) return;

  // Seçili her satırda geçerli bir tarih olmalı; biri eksik/hatalıysa hiçbiri yazılmaz
  const kalemler = [], sorunlu = [];
  secili.forEach(cb => {
    const inp = document.querySelector(`.konum-tarih[data-id="${cb.dataset.id}"]`);
    const hata = inp ? (inp.value ? konumTarihHatasi(inp) : 'tarih boş') : 'tarih yok';
    if (hata) { sorunlu.push(inp); if (inp) { inp.style.borderColor = '#EF4444'; } }
    else kalemler.push({ id: Number(cb.dataset.id), tarih: inp.value });
  });
  if (sorunlu.length) {
    sorunlu.forEach(inp => {
      const not = inp && document.querySelector(`.konum-tarih-not[data-id="${inp.dataset.id}"]`);
      if (not && !not.textContent) { not.style.color = '#B91C1C'; not.textContent = 'tarih gerekli'; }
    });
    sorunlu[0]?.scrollIntoView({ block: 'center' });
    sorunlu[0]?.focus();
    return;
  }


  const btn = document.getElementById('konum-raporu-uygula');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Güncelleniyor...'; }
  try {
    const token = localStorage.getItem('fa_auth_token');
    const resp = await fetch('/api/shipments/konum-raporu/uygula', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ kalemler }),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);
    await yenileGorunumuKoruyarak();
    const atlanan = data.atlanan || [];
    konumYuklemeAc(`${data.guncellenen} sevkiyat güncellendi (Bosna/Sırbistan doğrudan Teslim Edildi).` + (atlanan.length
      ? ` Yazılmayan: ${atlanan.map(a => `${escapeHtml(a.dosya_no || ('#' + a.id))} (${escapeHtml(a.neden)})`).join(', ')}` : ''));
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Varış Gümrük Yap'; }
    showMiniModal('⚠️ Hata', escapeHtml(e.message), [{ label: 'Tamam', style: 'primary', action: null }]);
  }
}
