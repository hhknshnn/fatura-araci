// js/shipments.js
// Sevkiyatlar sayfası — listeleme, filtreleme, güncelleme

let allShipments = [];

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

function applyFiltersAndRender() {
  const ulke         = document.getElementById('filter-ulke')?.value         || '';
  const durum        = document.getElementById('filter-durum')?.value        || '';
  const depo         = document.getElementById('filter-depo')?.value         || '';
  const musteriTipi  = document.getElementById('filter-musteri-tipi')?.value || '';

  let filtered = allShipments;
  if (ulke)        filtered = filtered.filter(s => s.ulke?.toLowerCase().includes(ulke.toLowerCase()));
  if (durum)       filtered = filtered.filter(s => normalizeDurum(s.durum) === durum);
  if (depo)        filtered = filtered.filter(s => s.fatura_no?.startsWith(depo));
  if (musteriTipi) filtered = filtered.filter(s => s.musteri_tipi === musteriTipi);

  renderShipments(sortShipments(filtered));
}

// Sıralama ok ikonu
function sortIcon(col) {
  if (sortColumn !== col) return '<span style="opacity:0.3;font-size:10px;margin-left:3px;">⇅</span>';
  return sortDir === 'asc'
    ? '<span style="font-size:10px;margin-left:3px;color:var(--accent);">▲</span>'
    : '<span style="font-size:10px;margin-left:3px;color:var(--accent);">▼</span>';
}

// Tıklanabilir başlık hücresi
function thCell(label, col, extraStyle = '') {
  return `<th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text3);font-weight:500;cursor:pointer;user-select:none;${extraStyle}"
    onclick="onSort('${col}')">
    ${label}${sortIcon(col)}
  </th>`;
}


// Sticky yatay scroll bar — viewport'a yapışık
function initStickyScroll() {
  const wrapper = document.getElementById('shipments-table-wrapper');
  if (!wrapper) return;

  const fakeScroll = document.createElement('div');
  fakeScroll.id = 'fake-scrollbar';
  fakeScroll.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0; right: 0;
    height: 12px;
    overflow-x: auto;
    overflow-y: hidden;
    z-index: 50;
    background: var(--surface2);
    border-top: 0.5px solid var(--border2);
  `;

  const fakeInner = document.createElement('div');
  fakeInner.id = 'fake-scrollbar-inner';
  fakeScroll.appendChild(fakeInner);
  document.body.appendChild(fakeScroll);

  function syncWidth() {
    fakeInner.style.width = wrapper.scrollWidth + 'px';
    const rect = wrapper.getBoundingClientRect();
    fakeScroll.style.display = rect.width > 0 ? 'block' : 'none';
  }

  wrapper.addEventListener('scroll', () => { fakeScroll.scrollLeft = wrapper.scrollLeft; });
  fakeScroll.addEventListener('scroll', () => { wrapper.scrollLeft = fakeScroll.scrollLeft; });

  syncWidth();
  window.addEventListener('resize', syncWidth);

  const origRender = window.renderShipments;
  window.renderShipments = function(list) {
    origRender(list);
    setTimeout(syncWidth, 50);
  };
}

// Durum normalize
function normalizeDurum(raw) {
  if (!raw) return 'YOLDA';
  const s = raw.toString().trim().toUpperCase()
    .replace('İ', 'İ')
    .replace('I', 'I');
  if (s === 'YOLDA' || s === 'IN TRANSIT' || s === 'TRANSIT') return 'YOLDA';
  if (s === 'TESLİM EDİLDİ' || s === 'TESLIM EDILDI' || s === 'DELIVERED' || s === 'TESLIM') return 'TESLİM EDİLDİ';
  if (s === 'VARIŞ GÜMRÜK' || s === 'VARIS GUMRUK' || s === 'CUSTOMS' || s === 'GÜMRÜKTE') return 'Varış Gümrük';
  if (s === 'HAZIRLANYOR' || s === 'HAZIRLANIYOR' || s === 'PREPARING') return 'HAZIRLANIYOR';
  return raw.toString().trim();
}

async function loadShipments(ulke = '', durum = '') {
  if (!document.getElementById('shipments-ozet')) {
    const ozet = document.createElement('div');
    ozet.id = 'shipments-ozet';
    ozet.style.cssText = 'display:flex;gap:16px;align-items:center;padding:8px 24px;background:var(--accent-dim);border-bottom:0.5px solid var(--accent-mid);font-size:12.5px;color:var(--accent-text);flex-wrap:wrap;';
    const wrapper = document.getElementById('shipments-table-wrapper');
    if (wrapper) wrapper.parentNode.insertBefore(ozet, wrapper);
  }
  try {
    const token = sessionStorage.getItem('fa_auth_token');
    let url = '/api/shipments';
    const params = [];
    if (ulke)  params.push(`ulke=${encodeURIComponent(ulke)}`);
    if (durum) params.push(`durum=${encodeURIComponent(durum)}`);
    if (params.length) url += '?' + params.join('&');

    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    if (!data.success) return;

    allShipments = data.shipments;
    applyFiltersAndRender();
    if (!document.getElementById('fake-scrollbar')) initStickyScroll();
  } catch (e) {
    console.error('Sevkiyatlar yüklenemedi:', e);
  }
}

function renderShipments(list) {
  const wrapper = document.getElementById('shipments-table-wrapper');
  if (!wrapper) return;

  // Özet şerit
  const toplam    = list.length;
  const faturaEur = list.reduce((s, r) => s + (parseFloat(r.fatura_bedeli_eur) || 0), 0);
  const navlunEur = list.reduce((s, r) => s + (parseFloat(r.navlun_eur) || 0), 0);
  const sigortaEur = list.reduce((s, r) => s + (parseFloat(r.sigorta_eur) || 0), 0);
  const fmt = val => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + ' €';

  const ozet = document.getElementById('shipments-ozet');
  if (ozet) {
    ozet.innerHTML = `
      <span>📦 <b>${toplam}</b> sevkiyat</span>
      <span style="color:var(--border2);">|</span>
      <span>Fatura: <b>${fmt(faturaEur)}</b></span>
      <span style="color:var(--border2);">|</span>
      <span>Navlun: <b>${fmt(navlunEur)}</b></span>
      <span style="color:var(--border2);">|</span>
      <span>Sigorta: <b>${fmt(sigortaEur)}</b></span>
    `;
  }

  // Tablo — Varış sütunu yok
  wrapper.innerHTML = `
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:var(--surface2);border-bottom:0.5px solid var(--border2);">
          ${thCell('Dosya No',       'ihracat_dosya_no')}
          ${thCell('Fatura No',      'fatura_no')}
          ${thCell('Depo',           'fatura_no')}
          ${thCell('Ülke',           'ulke')}
          ${thCell('Nakliye Firması','nakliye_firmasi')}
          ${thCell('Plaka',          'plaka')}
          ${thCell('Fatura EUR',     'fatura_bedeli_eur')}
          ${thCell('Yükleme',        'yukleme_tarihi')}
          ${thCell('Durum',          'durum')}
        </tr>
      </thead>
      <tbody id="shipments-tbody">
        ${list.length === 0
          ? `<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text3);">Sevkiyat bulunamadı</td></tr>`
          : list.map(s => {
              const durumNorm = normalizeDurum(s.durum);
              const depoTag = s.fatura_no?.startsWith('ANT')
                ? `<span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;background:var(--gold-dim);color:var(--gold);">ANT</span>`
                : `<span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;background:var(--accent-dim);color:var(--accent-text);">IHR</span>`;
              return `
                <tr style="border-bottom:0.5px solid var(--border);cursor:pointer;" onclick="openShipmentDetail(${s.id})">
                  <td style="padding:6px 12px;font-size:12px;font-weight:500;color:var(--text);white-space:nowrap;">${s.ihracat_dosya_no || '-'}</td>
                  <td style="padding:6px 12px;font-size:12px;color:var(--text2);white-space:nowrap;">${s.fatura_no || '-'}</td>
                  <td style="padding:6px 12px;font-size:12px;white-space:nowrap;">${depoTag}</td>
                  <td style="padding:6px 12px;font-size:12px;color:var(--text2);white-space:nowrap;">${s.ulke || '-'}</td>
                  <td style="padding:6px 12px;font-size:12px;color:var(--text2);white-space:nowrap;">${s.nakliye_firmasi || '-'}</td>
                  <td style="padding:6px 12px;font-size:12px;color:var(--text2);white-space:nowrap;">${s.plaka || '-'}</td>
                  <td style="padding:6px 12px;font-size:12px;color:var(--text2);white-space:nowrap;">${formatEUR(s.fatura_bedeli_eur)}</td>
                  <td style="padding:6px 12px;font-size:12px;color:var(--text2);white-space:nowrap;">${s.yukleme_tarihi || '-'}</td>
                  <td style="padding:6px 12px;white-space:nowrap;">
                    <span style="font-size:11px;font-weight:500;padding:3px 8px;border-radius:4px;${durumStyle(durumNorm)}">${durumNorm}</span>
                  </td>
                </tr>`;
            }).join('')}
      </tbody>
    </table>`;
}

function durumStyle(durum) {
  if (durum === 'YOLDA')         return 'background:var(--gold-dim);color:var(--gold);';
  if (durum === 'TESLİM EDİLDİ') return 'background:var(--success-dim);color:var(--success);';
  if (durum === 'Varış Gümrük')  return 'background:var(--accent-dim);color:var(--accent-text);';
  if (durum === 'HAZIRLANIYOR')  return 'background:var(--surface2);color:var(--text2);border:0.5px solid var(--border2);';
  return 'background:var(--surface2);color:var(--text2);border:0.5px solid var(--border2);';
}

function filterShipments() {
  applyFiltersAndRender();
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

function formatTL(val) {
  if (!val && val !== 0) return '-';
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + ' ₺';
}

async function openShipmentDetail(id) {
  const token = sessionStorage.getItem('fa_auth_token');
  const res = await fetch(`/api/shipments?id=${id}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  if (!data.success) return;

  const s = data.shipment;
  const panel   = document.getElementById('shipment-detail-panel');
  const overlay = document.getElementById('shipment-overlay');
  if (!panel || !overlay) return;

  document.getElementById('detail-dosya-no').textContent  = s.ihracat_dosya_no || '-';
  document.getElementById('detail-fatura-no').textContent = s.fatura_no || '-';
  document.getElementById('detail-ulke').textContent      = s.ulke || '-';
  document.getElementById('detail-id').value              = s.id;

  document.getElementById('edit-nakliye').value       = s.nakliye_firmasi || '';
  document.getElementById('edit-plaka').value         = s.plaka || '';
  document.getElementById('edit-durum').value         = normalizeDurum(s.durum);
  document.getElementById('edit-varis').value         = s.varis_tarihi || '';
  document.getElementById('edit-gumruk-bitis').value  = s.gumrukleme_bitis || '';
  document.getElementById('edit-beyanname-tl').value  = s.ihracat_beyanname_tl || '';
  document.getElementById('edit-beyanname-eur').value = s.ihracat_beyanname_eur || '';
  document.getElementById('edit-bekleme').value       = s.arac_bekleme || '';
  document.getElementById('edit-brokerage').value     = s.brokerage_eur || '';
  document.getElementById('edit-gumruk-v').value      = s.gumruk_vergisi_eur || '';
  document.getElementById('edit-kdv').value           = s.kdv_eur || '';
  document.getElementById('edit-fatura-tl').value     = s.fatura_bedeli_tl || '';
  document.getElementById('edit-fatura-eur').value    = s.fatura_bedeli_eur || '';
  document.getElementById('edit-mal-eur').value       = s.mal_bedeli_eur || '';
  document.getElementById('edit-navlun').value        = s.navlun_eur || '';
  document.getElementById('edit-sigorta').value       = s.sigorta_eur || '';
  document.getElementById('edit-kur').value           = s.eur_kuru || '';
  document.getElementById('edit-yukleme').value       = formatDateInput(s.yukleme_tarihi);
  document.getElementById('edit-gumruk-tarihi').value = formatDateInput(s.gumruk_tarihi);
  document.getElementById('edit-varis').value         = formatDateInput(s.varis_tarihi);
  document.getElementById('edit-gumruk-bitis').value  = formatDateInput(s.gumrukleme_bitis);

  const newFields = document.getElementById('new-shipment-fields');
  if (newFields) newFields.style.display = 'none';

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
  const token = sessionStorage.getItem('fa_auth_token');
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
      varis_tarihi:      document.getElementById('edit-varis').value,
      gumrukleme_bitis:  document.getElementById('edit-gumruk-bitis').value,
      fatura_bedeli_tl:  parseFloat(document.getElementById('new-fatura-tl').value)  || 0,
      fatura_bedeli_eur: parseFloat(document.getElementById('new-fatura-eur').value) || 0,
      mal_bedeli_eur:    parseFloat(document.getElementById('new-mal-eur').value)     || 0,
      navlun_eur:        parseFloat(document.getElementById('new-navlun').value)      || 0,
      sigorta_eur:       parseFloat(document.getElementById('new-sigorta').value)     || 0,
      eur_kuru:          parseFloat(document.getElementById('new-kur').value)         || 0,
    };
    const res  = await fetch('/api/shipments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.success) { closeShipmentDetail(); loadShipments(); }
    else alert('Kayıt hatası: ' + (data.error || 'Bilinmeyen hata'));

  } else {
    const body = {
      id:                    parseInt(id),
      nakliye_firmasi:       document.getElementById('edit-nakliye').value,
      plaka:                 document.getElementById('edit-plaka').value,
      durum:                 document.getElementById('edit-durum').value,
      varis_tarihi:          document.getElementById('edit-varis').value,
      gumrukleme_bitis:      document.getElementById('edit-gumruk-bitis').value,
      ihracat_beyanname_tl:  parseFloat(document.getElementById('edit-beyanname-tl').value)  || 0,
      ihracat_beyanname_eur: parseFloat(document.getElementById('edit-beyanname-eur').value) || 0,
      arac_bekleme:          parseFloat(document.getElementById('edit-bekleme').value)        || 0,
      brokerage_eur:         parseFloat(document.getElementById('edit-brokerage').value)      || 0,
      gumruk_vergisi_eur:    parseFloat(document.getElementById('edit-gumruk-v').value)       || 0,
      kdv_eur:               parseFloat(document.getElementById('edit-kdv').value)            || 0,
    };
    const res  = await fetch('/api/shipments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.success) { closeShipmentDetail(); loadShipments(); }
    else alert('Kayıt hatası: ' + (data.error || 'Bilinmeyen hata'));
  }
}

async function downloadMaliyetRaporu() {
  const token = sessionStorage.getItem('fa_auth_token');
  const ulke  = document.getElementById('filter-ulke')?.value  || '';
  const durum = document.getElementById('filter-durum')?.value || '';
  const depo  = document.getElementById('filter-depo')?.value  || '';
  let url = '/api/shipments/export';
  const params = [];
  if (ulke)  params.push(`ulke=${encodeURIComponent(ulke)}`);
  if (durum) params.push(`durum=${encodeURIComponent(durum)}`);
  if (depo)  params.push(`depo=${encodeURIComponent(depo)}`);
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
    a.download = `maliyet_raporu_${new Date().toISOString().slice(0, 10)}.xlsx`;
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

async function deleteShipment() {
  const id = document.getElementById('detail-id').value;
  if (!id) return;
  if (!confirm('Bu sevkiyatı silmek istediğinizden emin misiniz?')) return;

  const token = sessionStorage.getItem('fa_auth_token');
  const res   = await fetch('/api/shipments', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ id: parseInt(id) }),
  });
  const data = await res.json();
  if (data.success) { closeShipmentDetail(); loadShipments(); }
  else alert('Silme hatası: ' + (data.error || 'Bilinmeyen hata'));
}

function clearFilters() {
  document.getElementById('filter-ulke').value  = '';
  document.getElementById('filter-durum').value = '';
  document.getElementById('filter-depo').value  = '';
  const mt = document.getElementById('filter-musteri-tipi');
  if (mt) mt.value = '';
  sortColumn = null;
  sortDir    = 'asc';
  loadShipments();
}