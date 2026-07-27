// js/shipments.js
// Sevkiyatlar sayfası — listeleme, filtreleme, güncelleme

// ── SÜTUN GENİŞLİKLERİ ───────────────────────────────────────────────────────
// ── SAYFALAMA STATE ───────────────────────────────────────────────────────────
const PAGE_SIZE = 10;
let currentPage = 1;
let filteredList = [];

const COL_KEYS = ['ihracat_dosya_no','fatura_no','palet','_depo','ulke','nakliye_firmasi','plaka','sefer_id','fatura_bedeli_eur','yukleme_tarihi','durum'];
const COL_DEFAULTS = { ihracat_dosya_no:75, fatura_no:140, palet:50, _depo:56, ulke:85, nakliye_firmasi:75, plaka:142, sefer_id:72, fatura_bedeli_eur:98, yukleme_tarihi:84, durum:96 };
const COL_MAX = { ihracat_dosya_no:120, fatura_no:160, palet:72, _depo:72, ulke:110, nakliye_firmasi:140, plaka:160, sefer_id:96, fatura_bedeli_eur:118, yukleme_tarihi:104, durum:118 };

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
    th.style.position = 'relative';
    th.style.width = (colWidths[colKey] || COL_DEFAULTS[colKey]) + 'px';
    th.style.minWidth = '40px';
    th.style.overflow = 'hidden';
    th.appendChild(handle);

    // Tüm td'leri de baştan genişliğe göre ayarla
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
      const td = row.cells[i];
      if (td) {
        td.style.width = (colWidths[colKey] || COL_DEFAULTS[colKey]) + 'px';
        td.style.maxWidth = (colWidths[colKey] || COL_DEFAULTS[colKey]) + 'px';
        td.style.overflow = 'hidden';
        td.style.textOverflow = 'ellipsis';
      }
    });

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
        const newW = Math.min(260, Math.max(40, startW + e.clientX - startX));
        th.style.width = newW + 'px';
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
          const td = row.cells[i];
          if (td) {
            td.style.width = newW + 'px';
            td.style.maxWidth = newW + 'px';
            td.style.overflow = 'hidden';
            td.style.textOverflow = 'ellipsis';
          }
        });
      };

      const onUp = e => {
        const newW = Math.min(260, Math.max(40, startW + e.clientX - startX));
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

    handle.addEventListener('dblclick', e => {
      e.preventDefault();
      e.stopPropagation();

      // O sütundaki tüm hücrelerin içerik genişliğini ölç
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
      maxW = Math.min(maxW, 400); // max 400px

      th.style.width = maxW + 'px';
      const rows = table.querySelectorAll('tbody tr');
      rows.forEach(row => {
        const td = row.cells[i];
        if (td) {
          td.style.width = maxW + 'px';
          td.style.maxWidth = maxW + 'px';
        }
      });
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

function applyFiltersAndRender() {
  const depo        = document.getElementById('filter-depo')?.value         || '';
  const durumlar    = getHiddenFilterValues('filter-durum');
  const musteriTipleri = getHiddenFilterValues('filter-musteri-tipi');
  const aylar       = getHiddenFilterValues('filter-ay');

  // Filtrelenmiş listeyi her zaman allShipments'tan sıfırdan hesapla
  let filtered = allShipments;
  if (selectedUlkeler && selectedUlkeler.size > 0)
    filtered = filtered.filter(s => selectedUlkeler.has(s.ulke?.toUpperCase()));
  if (durumlar.length > 0) filtered = filtered.filter(s => durumlar.includes(normalizeDurum(s.durum)));
  if (depo)        filtered = filtered.filter(s => s.fatura_no?.startsWith(depo));
  if (musteriTipleri.length > 0) filtered = filtered.filter(s => musteriTipleri.includes(s.musteri_tipi));
  if (aylar.length > 0) filtered = filtered.filter(s => aylar.includes((s.yukleme_tarihi || '').slice(5, 7)));
  if (dashboardSeferFilter === 'tek') filtered = filtered.filter(s => !s.sefer_id);
  if (dashboardSeferFilter === 'gruplu') filtered = filtered.filter(s => !!s.sefer_id);

  filteredList = sortShipments(filtered);
  currentPage  = 1;
  renderPage();
}

// Özet şeridi HTML'i — ayrı standalone pilller (Sevkiyat/Navlun/Sigorta) ve
// aralarında ince ayraç bulunan tek bir grup kutusu (Fatura/TL/USD) üretir.
function ozetHtml({ toplam, faturaEur, faturaTl, faturaUsd, navlunEur, sigortaEur, fmt, fmtTl, fmtUsd }) {
  const pill = (icon, label, val, iconColor) => `
    <div style="display:flex;align-items:center;gap:5px;padding:5px 11px;
                background:var(--surface);border:0.5px solid var(--border2);
                border-radius:20px;white-space:nowrap;">
      <i class="ti ti-${icon}" style="font-size:12.5px;color:${iconColor};" aria-hidden="true"></i>
      <span style="font-size:11.5px;color:var(--text3);">${label}</span>
      <span style="font-size:11.5px;font-weight:600;color:var(--text);">${val}</span>
    </div>`;
  const segment = (icon, label, val, iconColor, divider) => `
    <div style="display:flex;align-items:center;gap:5px;padding:5px 11px;white-space:nowrap;
                ${divider ? 'border-left:1px solid var(--border2);' : ''}">
      <i class="ti ti-${icon}" style="font-size:12.5px;color:${iconColor};" aria-hidden="true"></i>
      <span style="font-size:11.5px;color:var(--text3);">${label}</span>
      <span style="font-size:11.5px;font-weight:600;color:var(--text);">${val}</span>
    </div>`;
  const faturaGroup = `
    <div style="display:flex;align-items:center;
                background:var(--surface);border:0.5px solid var(--border2);
                border-radius:20px;overflow:hidden;">
      ${segment('currency-euro',   'Fatura', fmt(faturaEur),    '#185FA5', false)}
      ${segment('currency-lira',   'TL',     fmtTl(faturaTl),   '#3B6D11', true)}
      ${segment('currency-dollar', 'USD',    fmtUsd(faturaUsd), '#1B7A6B', true)}
    </div>`;
  return `
    ${pill('package', 'Sevkiyat', toplam, 'var(--text2)')}
    ${faturaGroup}
    ${pill('ship',    'Navlun',   fmt(navlunEur),  '#854F0B')}
    ${pill('shield',  'Sigorta',  fmt(sigortaEur), '#533AB7')}
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
function thCell(label, col, extraStyle = '') {
  return `<th class="shipments-th" onclick="onSort('${col}')" style="${extraStyle}">
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

async function loadShipments(ulke = '', durum = '') {
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
    window.addEventListener('resize', setWrapperHeight);
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
    currentPage  = 1;
    sortColumn   = 'ihracat_dosya_no';
    sortDir      = 'desc';

    applyPendingDashboardShipmentFilter();
    applyFiltersAndRender();
    if (!document.getElementById('fake-scrollbar')) initStickyScroll();
  } catch (e) {
    console.error('Sevkiyatlar yüklenemedi:', e);
  }
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

  pg.innerHTML = `
    <div style="display:grid;grid-template-columns:minmax(110px,1fr) auto minmax(110px,1fr);align-items:center;gap:14px;width:100%;padding:0 4px;">
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
      <span style="font-size:12px;color:var(--text3);white-space:nowrap;min-width:110px;">
        Sayfa ${currentPage}/${totalPages}
      </span>
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
    ozet.innerHTML = ozetHtml({ toplam, faturaEur, faturaTl, faturaUsd, navlunEur, sigortaEur, fmt, fmtTl, fmtUsd });
  }

  // Tablo — Varış sütunu yok
  wrapper.innerHTML = `
    <table class="shipments-modern-table" style="width:100%;min-width:0;table-layout:fixed;">
      <thead>
        <tr>
          <th class="shipments-th shipments-check-th" style="width:36px;">
            <input type="checkbox" id="chk-all" onclick="toggleTumSatirlar(this)" class="role-write-only"
              style="width:14px;height:14px;accent-color:var(--accent);cursor:pointer;">
          </th>
          ${thCell('Dosya No',        'ihracat_dosya_no', `width:${colWidths.ihracat_dosya_no}px;`)}
          ${thCell('Fatura No',       'fatura_no',        `width:${colWidths.fatura_no}px;overflow:hidden;text-overflow:ellipsis;`)}
          ${thCell('Palet',           'palet',            `width:${colWidths.palet}px;text-align:center;`)}
          ${thCell('Depo',            '_depo',            `width:${colWidths._depo}px;`)}
          ${thCell('Ülke',            'ulke',             `width:${colWidths.ulke}px;`)}
          ${thCell('Nakliyeci',       'nakliye_firmasi',  `width:${colWidths.nakliye_firmasi}px;`)}
          ${thCell('Plaka',           'plaka',            `width:${colWidths.plaka}px;`)}
          ${thCell('Grup',            'sefer_id',         `width:${colWidths.sefer_id}px;`)}
          ${thCell('Fatura EUR',      'fatura_bedeli_eur',`width:${colWidths.fatura_bedeli_eur}px;`)}
          ${thCell('Yükleme',         'yukleme_tarihi',   `width:${colWidths.yukleme_tarihi}px;`)}
          ${thCell('Durum',           'durum',            `width:${colWidths.durum}px;`)}
        </tr>
      </thead>
      <tbody id="shipments-tbody">
        ${list.length === 0
          ? `<tr><td colspan="12" style="text-align:center;padding:40px;color:var(--text3);font-size:13px;">Sevkiyat bulunamadı</td></tr>`
          : list.map((s, idx) => {
              const durumNorm = normalizeDurum(s.durum);
              const isAnt    = s.fatura_no?.startsWith('ANT');
              // Gruplu (sefer_id var) = mevcut renk; Komple (grupsuz) = ANT kırmızı / IHR yeşil
              const isGrouped = !!s.sefer_id;
              const depoCls  = isAnt
                ? (isGrouped ? 'shipment-pill-ant' : 'shipment-pill-ant-komple')
                : (isGrouped ? 'shipment-pill-ihr' : 'shipment-pill-ihr-komple');
              const depoTag  = `<span class="shipment-pill ${depoCls}">${isAnt ? 'ANT' : 'IHR'}</span>`;
              return `
                <tr class="shipments-row" data-id="${s.id}" onclick="openShipmentDetail(${s.id})">
                  <td class="shipments-td shipments-check-td" onclick="event.stopPropagation()">
                    <input type="checkbox" data-id="${s.id}" class="role-write-only"
                      ${seciliSatirlar.has(s.id) ? 'checked' : ''}
                      onclick="toggleSatirSec(event, ${s.id})"
                      style="width:14px;height:14px;accent-color:var(--accent);cursor:pointer;">
                  </td>
                  <td class="shipments-td shipments-cell-strong">${escapeHtml(s.ihracat_dosya_no) || '-'}</td>
                  <td class="shipments-td shipments-cell-mono shipments-cell-clip">${escapeHtml(s.fatura_no) || '-'}</td>
                  <td class="shipments-td shipments-cell-center">${escapeHtml(s.palet) || '-'}</td>
                  <td class="shipments-td">${depoTag}</td>
                  <td class="shipments-td shipments-cell-clip">${escapeHtml(s.ulke) || '-'}</td>
                  <td class="shipments-td shipments-cell-clip">${escapeHtml(s.nakliye_firmasi) || '-'}</td>
                  <td class="shipments-td shipments-cell-clip shipments-cell-plate">${escapeHtml(s.plaka) || '-'}</td>
                  <td class="shipments-td shipments-cell-group">
                    ${s.sefer_id ? `<span class="shipment-pill shipment-pill-group"><i class="ti ti-link" aria-hidden="true"></i>Grup ${escapeHtml(s.sefer_id)}</span>` : '<span class="shipments-empty">-</span>'}
                  </td>
                  <td class="shipments-td shipments-cell-money">${formatEUR(s.fatura_bedeli_eur)}</td>
                  <td class="shipments-td shipments-cell-date">${escapeHtml(s.yukleme_tarihi) || '-'}</td>
                  <td class="shipments-td">
                    <span class="shipment-pill" style="${durumStyle(durumNorm)}">${durumNorm}</span>
                  </td>
                </tr>`;
            }).join('')}
      </tbody>
    </table>`;
  if (!document.querySelector('#shipments-table-wrapper .col-resize-handle')) {
    setTimeout(initColResize, 0);
  }
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
  overlay.style.display = 'block';
  panel.style.display   = 'flex';
}

function closeShipmentDetail() {
  document.getElementById('shipment-detail-panel').style.display = 'none';
  document.getElementById('shipment-overlay').style.display      = 'none';
  const newFields = document.getElementById('new-shipment-fields');
  if (newFields) newFields.style.display = 'none';
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
    if (data.success) { closeShipmentDetail(); allShipments = []; filteredList = []; currentPage = 1; const tbody = document.getElementById('shipments-tbody'); if (tbody) tbody.innerHTML = ''; loadShipments(); }
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
   'edit-beyanname-tl','edit-beyanname-eur','edit-bekleme',
   'edit-brokerage','edit-gumruk-v','edit-kdv'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('edit-durum').value = 'YOLDA';

  document.getElementById('new-shipment-fields').style.display = 'block';
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
        if (data.success) { closeShipmentDetail(); allShipments = []; filteredList = []; currentPage = 1; loadShipments(); }
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
  }
}

// Dışarı tıklayınca kapat
document.addEventListener('click', e => {
  if (!e.target.closest('.custom-dd')) {
    document.querySelectorAll('.custom-dd.open').forEach(d => d.classList.remove('open'));
  }
});

function onDDChange(type, input) {
  if (['tip', 'durum', 'ay'].includes(type)) {
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
  commitMultiDropdownFilter(type);
  applyFiltersAndRender();
  document.getElementById(`dd-${type}`)?.classList.remove('open');
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
    countLabel: 'Durum',
    format: val => val
  },
  ay: {
    inputName: 'dd-ay-r',
    hiddenId: 'filter-ay',
    labelId: 'dd-ay-label',
    buttonSelector: '#dd-ay .custom-dd-btn',
    emptyLabel: 'Ay',
    countLabel: 'Ay',
    format: val => ayAdlari[val] || val
  }
};

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

function onUlkeChange() {
  const checkboxes = document.querySelectorAll('#dd-ulke-menu input[type=checkbox]');
  selectedUlkeler = new Set();
  checkboxes.forEach(cb => { if (cb.checked) selectedUlkeler.add(cb.value); });

  const btn = document.querySelector('#dd-ulke .custom-dd-btn');
  const label = document.getElementById('dd-ulke-label');
  if (selectedUlkeler.size === 0) {
    label.textContent = 'Ülkeler';
    btn.classList.remove('active');
  } else if (selectedUlkeler.size === 1) {
    label.textContent = [...selectedUlkeler][0].charAt(0) + [...selectedUlkeler][0].slice(1).toLowerCase();
    btn.classList.add('active');
  } else {
    label.textContent = `${selectedUlkeler.size} Ülke`;
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
  dashboardSeferFilter = '';

  selectedUlkeler = new Set();
  document.querySelectorAll('#dd-ulke-menu input[type=checkbox]').forEach(cb => cb.checked = false);
  document.querySelectorAll('input[name="dd-tip-r"]').forEach((input, index) => input.checked = index === 0);
  document.querySelectorAll('input[name="dd-durum-r"]').forEach((input, index) => input.checked = index === 0);
  document.querySelectorAll('input[name="dd-depo-r"]').forEach((input, index) => input.checked = index === 0);
  document.querySelectorAll('input[name="dd-ay-r"]').forEach((input, index) => input.checked = index === 0);

  document.getElementById('dd-tip-label').textContent   = 'Tipler';
  document.getElementById('dd-ulke-label').textContent  = 'Ülkeler';
  document.getElementById('dd-durum-label').textContent = 'Durumlar';
  document.getElementById('dd-depo-label').textContent  = 'Depolar';
  document.getElementById('dd-ay-label').textContent    = 'Ay';
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
    document.getElementById('dd-durum-label').textContent = filter.durum;
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
          allShipments = [];
          const tbody = document.getElementById('shipments-tbody');
          if (tbody) tbody.innerHTML = '';
          await loadShipments();
        } catch (e) {
          showMiniModal('⚠️ Hata', e.message, [{ label: 'Tamam', style: 'primary', action: null }]);
        }
      }}
    ]
  );
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
          allShipments = [];
          const tbody = document.getElementById('shipments-tbody');
          if (tbody) tbody.innerHTML = '';
          await loadShipments();
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
      overlay.remove();
      if (found?.action) await found.action();
    });
  });

  // Overlay tıklayınca kapat
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
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

// Sırbistan PDF — seçili sevkiyata otomatik yazar
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

  resultEl.innerHTML = detailHtml +
    `<div id="me-rs-save-status" style="margin-top:8px;font-size:12px;color:var(--text3);">⏳ Sevkiyata yazılıyor...</div>`;

  try {
    const token = localStorage.getItem('fa_auth_token');
    const sRes  = await fetch(`/api/shipments?id=${selectedId}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const sData = await sRes.json();
    if (!sData.success) throw new Error(sData.error);
    const s = sData.shipment;

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
      brokerage_eur:         data.tip === 'brokerage' ? data.eur.brokerage       : (s.brokerage_eur      || 0),
      gumruk_vergisi_eur:    data.tip === 'vergi'     ? data.eur.gumruk_vergisi  : (s.gumruk_vergisi_eur || 0),
      kdv_eur:               data.tip === 'vergi'     ? data.eur.kdv             : (s.kdv_eur            || 0),
    };

    const upRes  = await fetch('/api/shipments', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify(body),
    });
    const upData = await upRes.json();
    if (!upData.success) throw new Error(upData.error);

    const selLabel = selEl.options[selEl.selectedIndex]?.text || String(selectedId);
    document.getElementById('me-rs-save-status').innerHTML =
      `<span style="color:var(--success);">✓ Kaydedildi → ${selLabel}</span>`;
    const inp = document.getElementById('me-rs-input');
    if (inp) inp.value = '';
  } catch (saveErr) {
    const saveEl = document.getElementById('me-rs-save-status');
    if (saveEl) saveEl.innerHTML = `<span style="color:var(--error);">⚠ Kayıt hatası: ${escapeHtml(saveErr.message)}</span>`;
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
    const savePromises = [];

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
        savePromises.push(meGeSaveField(p, 'brokerage_eur', pay, token));
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

      for (const p of paylar) {
        const kdvPay = Math.round(toplamKdv * p.oran * 100) / 100;
        savePromises.push(meGeSaveField(p, 'kdv_eur', kdvPay, token));
      }

      const vergiTarget = antFatura || s;
      savePromises.push(meGeSaveField(vergiTarget, 'gumruk_vergisi_eur', toplamVergi, token));
    }

    resultEl.innerHTML = detailHtml +
      `<div id="me-ge-save-status" style="margin-top:8px;font-size:12px;color:var(--text3);">⏳ Kaydediliyor...</div>`;

    await Promise.all(savePromises);

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
  body[field] = value;
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

    const savePromises = paylar.map(p => meKoSaveFields(p, {
      gumruk_vergisi_eur: Math.round(toplamVergi * p.oran * 100) / 100,
      kdv_eur:            Math.round(toplamKdv * p.oran * 100) / 100,
      brokerage_eur:       KO_BROKERAGE_EUR,
    }, token));

    resultEl.innerHTML = detailHtml +
      `<div id="me-ko-save-status" style="margin-top:8px;font-size:12px;color:var(--text3);">⏳ Kaydediliyor...</div>`;

    await Promise.all(savePromises);

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
        const label = [s.ihracat_dosya_no, s.fatura_no].filter(Boolean).join(' · ');
        return `<option value="${s.id}">${escapeHtml(label)}</option>`;
      }).join('');
    if (prev && list.find(s => String(s.id) === prev)) sel.value = prev;
    if (statusEl) { statusEl.textContent = `${list.length} sevkiyat listelendi.`; statusEl.style.color = 'var(--text3)'; }
  } catch (err) {
    if (statusEl) { statusEl.textContent = '⚠ ' + err.message; statusEl.style.color = 'var(--error)'; }
  }
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
  // AVR/broker yanıtı (mevcut endpoint, tip alanı yok): {brokerage_kzt, other_costs_kzt, brokerage_eur, other_costs_eur, kzt_per_eur, kalemler}
  const isBeyanname = data.tip === 'beyanname';

  if (!selectedId) {
    let info = '';
    if (isBeyanname) {
      info = `<div style="color:var(--success);">✓ Gümrük Beyannamesi</div>
        <div style="margin-top:6px;">Vergi (1010+2010): <b>${fmt(data.kzt.vergi)} KZT → ${fmtEur(data.eur.vergi)}</b><br>
        KDV (5060): <b>${fmt(data.kzt.kdv)} KZT → ${fmtEur(data.eur.kdv)}</b><br>
        <span style="color:var(--text3);">Kur: 1 EUR = ${fmt(data.kur.kzt_per_eur)} KZT</span></div>`;
    } else {
      info = `<div style="color:var(--success);">✓ Broker faturası — Итого</div>
        <div style="margin-top:6px;">Brokerage: <b>${fmt(data.brokerage_kzt)} KZT → ${fmtEur(data.brokerage_eur)}</b><br>
        Diğer masraflar: <b>${fmt(data.other_costs_kzt)} KZT → ${fmtEur(data.other_costs_eur)}</b><br>
        <span style="color:var(--text3);">Kur: 1 EUR = ${fmt(data.kzt_per_eur)} KZT</span></div>`;
    }
    resultEl.innerHTML = info + `<div style="margin-top:8px;font-size:12px;color:var(--text3);">ℹ Üstten sevkiyat seçerek otomatik kaydedebilirsiniz.</div>`;
    return;
  }

  // Seçili sevkiyata uygula — her fatura/beyanname 1 sevke eşittir, gruplu araçlarda orantılı dağıtım yapılmaz
  try {
    const token   = localStorage.getItem('fa_auth_token');
    const sRes    = await fetch(`/api/shipments?id=${selectedId}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const sData   = await sRes.json();
    if (!sData.success) throw new Error(sData.error);
    const s = sData.shipment;

    let detailHtml = '';
    let saveFields;

    if (isBeyanname) {
      const vergi = data.eur.vergi;
      const kdv   = data.eur.kdv;

      detailHtml = `<div style="color:var(--success);">✓ Gümrük Beyannamesi — Vergi: ${fmtEur(vergi)} | KDV: ${fmtEur(kdv)}</div>
        <div style="margin-top:6px;">Vergi (1010+2010): <b>${fmt(data.kzt.vergi)} KZT</b> → ${fmtEur(vergi)}<br>
        KDV (5060): <b>${fmt(data.kzt.kdv)} KZT</b> → ${fmtEur(kdv)}</div>
        <div style="margin-top:6px;color:var(--text3);">Kur: 1 EUR = ${fmt(data.kur.kzt_per_eur)} KZT</div>`;

      saveFields = { gumruk_vergisi_eur: vergi, kdv_eur: kdv };

    } else {
      // Broker (AVR) faturası — brokerage_eur ve other_costs_eur tam olarak seçili sevkiyata yazılır
      const brokerage = data.brokerage_eur || 0;
      const other      = data.other_costs_eur || 0;

      const kalemHtml = (data.kalemler || []).length
        ? `<div style="margin-top:6px;font-size:11px;color:var(--text3);">Okunan kalemler:</div>
           <div style="margin-top:2px;">` +
           data.kalemler.map(k => `<div>${k.ad}: <b>${fmt(k.tutar)} KZT</b></div>`).join('') +
           `</div>`
        : '';

      detailHtml = `<div style="color:var(--success);">✓ Broker faturası — Brokerage: ${fmtEur(brokerage)} | Diğer: ${fmtEur(other)}</div>
        <div style="margin-top:6px;">Brokerage: <b>${fmt(data.brokerage_kzt)} KZT</b> → ${fmtEur(brokerage)}<br>
        Diğer masraflar: <b>${fmt(data.other_costs_kzt)} KZT</b> → ${fmtEur(other)}</div>
        ${kalemHtml}
        <div style="margin-top:6px;color:var(--text3);">Kur: 1 EUR = ${fmt(data.kzt_per_eur)} KZT</div>`;

      saveFields = { brokerage_eur: brokerage, other_costs_eur: other };
    }

    resultEl.innerHTML = detailHtml +
      `<div id="me-kz-save-status" style="margin-top:8px;font-size:12px;color:var(--text3);">⏳ Kaydediliyor...</div>`;

    await meKzSaveFields(s, saveFields, token);

    document.getElementById('me-kz-save-status').innerHTML =
      `<span style="color:var(--success);">✓ Kaydedildi</span>`;
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

    resultEl.innerHTML = detailHtml +
      `<div id="me-de-save-status" style="margin-top:8px;font-size:12px;color:var(--text3);">⏳ Kaydediliyor...</div>`;

    await meDeSaveFields(s, {
      gumruk_vergisi_eur: gumrukV,
      kdv_eur:            kdv,
      brokerage_eur:      brokerage,
      other_costs_eur:    otherCosts,
    }, token);

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

    resultEl.innerHTML = detailHtml +
      `<div id="me-nl-save-status" style="margin-top:8px;font-size:12px;color:var(--text3);">⏳ Kaydediliyor...</div>`;

    await meNlSaveFields(s, {
      brokerage_eur:      brokerage,
      gumruk_vergisi_eur: vergi,
    }, token);

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

function meBaManualPreview() {
  const fmt    = n => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const fmtEur = n => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' €';

  const osnovica = parseFloat(document.getElementById('me-ba-manual-osnovica')?.value) || 0;
  const carinski = parseFloat(document.getElementById('me-ba-manual-carinski')?.value) || 0;
  const broker   = osnovica - carinski;
  const brokerEl = document.getElementById('me-ba-manual-broker-eur');
  if (brokerEl) brokerEl.textContent = `Broker = ${fmt(broker)} BAM → ${fmtEur(broker / BA_BAM_PER_EUR)}`;

  for (const key of ['vergi', 'kdv']) {
    const input = document.getElementById(`me-ba-manual-${key}`);
    const out   = document.getElementById(`me-ba-manual-${key}-eur`);
    if (!input || !out) continue;
    const bam = parseFloat(input.value) || 0;
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

  const osnovicaBam = parseFloat(document.getElementById('me-ba-manual-osnovica').value) || 0;
  const carinskiBam = parseFloat(document.getElementById('me-ba-manual-carinski').value) || 0;
  const brokerBam   = osnovicaBam - carinskiBam;
  const vergiBam    = parseFloat(document.getElementById('me-ba-manual-vergi').value) || 0;
  const kdvBam      = parseFloat(document.getElementById('me-ba-manual-kdv').value) || 0;

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
    const mkd = parseFloat(input.value) || 0;
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

  const brokerEur = parseFloat(document.getElementById('me-mk-manual-broker').value) || 0;
  const vergiMkd  = parseFloat(document.getElementById('me-mk-manual-vergi').value) || 0;
  const kdvMkd    = parseFloat(document.getElementById('me-mk-manual-kdv').value) || 0;
  const otherMkd  = parseFloat(document.getElementById('me-mk-manual-other').value) || 0;

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
