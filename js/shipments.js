// js/shipments.js
// Sevkiyatlar sayfası — listeleme, filtreleme, güncelleme

let allShipments    = [];
let seciliSatirlar  = new Set(); // çoklu silme için seçili id'ler

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

  // Özet şerit — sefer bazlı say (grupluları 1 say)
  const grupTemsilciOzet = new Set();
  let toplam = 0;
  list.forEach(item => {
    if (!item.sefer_id) {
      toplam++;
    } else if (!grupTemsilciOzet.has(item.sefer_id)) {
      grupTemsilciOzet.add(item.sefer_id);
      toplam++;
    }
  });
  const faturaEur = list.reduce((s, r) => s + (parseFloat(r.fatura_bedeli_eur) || 0), 0);
  const faturaTl  = list.reduce((s, r) => s + (parseFloat(r.fatura_bedeli_tl)  || 0), 0);
  const navlunEur = list.reduce((s, r) => s + (parseFloat(r.navlun_eur) || 0), 0);
  const sigortaEur = list.reduce((s, r) => s + (parseFloat(r.sigorta_eur) || 0), 0);
  const fmt   = val => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + ' €';
  const fmtTl = val => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + ' ₺';

  const ozet = document.getElementById('shipments-ozet');
  if (ozet) {
    ozet.innerHTML = `
      <span>📦 <b>${toplam}</b> sevkiyat</span>
      <span style="color:var(--border2);">|</span>
      <span>Fatura: <b>${fmt(faturaEur)}</b></span>
      <span style="color:var(--border2);">·</span>
      <span><b>${fmtTl(faturaTl)}</b></span>
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
          <th style="padding:8px 12px;width:36px;">
            <input type="checkbox" id="chk-all" onclick="toggleTumSatirlar(this)"
              style="width:14px;height:14px;accent-color:var(--accent);cursor:pointer;">
          </th>
          ${thCell('Dosya No',        'ihracat_dosya_no')}
          ${thCell('Fatura No',       'fatura_no')}
          ${thCell('Depo',            '_depo')}
          ${thCell('Ülke',            'ulke')}
          ${thCell('Nakliye Firması', 'nakliye_firmasi')}
          ${thCell('Plaka',           'plaka')}
          ${thCell('Grup', 'sefer_id', 'width:70px;')}
          ${thCell('Fatura EUR',      'fatura_bedeli_eur')}
          ${thCell('Yükleme',         'yukleme_tarihi')}
          ${thCell('Durum',           'durum')}
        </tr>
      </thead>
      <tbody id="shipments-tbody">
        ${list.length === 0
          ? `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text3);font-size:13px;">Sevkiyat bulunamadı</td></tr>`
          : list.map((s, idx) => {
              const durumNorm = normalizeDurum(s.durum);
              const isAnt    = s.fatura_no?.startsWith('ANT');
              const depoTag  = isAnt
                ? `<span style="font-size:11px;font-weight:600;padding:2px 10px;border-radius:20px;background:#FAEEDA;color:#633806;">ANT</span>`
                : `<span style="font-size:11px;font-weight:600;padding:2px 10px;border-radius:20px;background:#E6F1FB;color:#0C447C;">IHR</span>`;
              const rowBg = idx % 2 === 1 ? 'var(--surface2)' : 'transparent';
              return `
                <tr style="border-bottom:0.5px solid var(--border);cursor:pointer;background:${rowBg};transition:background 0.1s;"
                    onmouseover="this.style.background='var(--accent-dim)'"
                    onmouseout="this.style.background='${rowBg}'">
                  <td style="padding:8px 12px;width:36px;" onclick="event.stopPropagation()">
                    <input type="checkbox" data-id="${s.id}"
                      ${seciliSatirlar.has(s.id) ? 'checked' : ''}
                      onclick="toggleSatirSec(event, ${s.id})"
                      style="width:14px;height:14px;accent-color:var(--accent);cursor:pointer;">
                  </td>
                  <td style="padding:8px 12px;font-size:12px;font-weight:500;color:var(--text);white-space:nowrap;" onclick="openShipmentDetail(${s.id})">${s.ihracat_dosya_no || '-'}</td>
                  <td style="padding:8px 12px;font-size:11px;color:var(--text2);white-space:nowrap;font-family:var(--mono);" onclick="openShipmentDetail(${s.id})">${s.fatura_no || '-'}</td>
                  <td style="padding:8px 12px;white-space:nowrap;" onclick="openShipmentDetail(${s.id})">${depoTag}</td>
                  <td style="padding:8px 12px;font-size:12px;color:var(--text2);white-space:nowrap;" onclick="openShipmentDetail(${s.id})">${s.ulke || '-'}</td>
                  <td style="padding:8px 12px;font-size:12px;color:var(--text2);white-space:nowrap;" onclick="openShipmentDetail(${s.id})">${s.nakliye_firmasi || '-'}</td>
                  <td style="padding:8px 12px;font-size:12px;color:var(--text2);white-space:nowrap;" onclick="openShipmentDetail(${s.id})">${s.plaka || '-'}</td>
                  <td style="padding:8px 12px;white-space:nowrap;width:70px;" onclick="openShipmentDetail(${s.id})">
                    ${s.sefer_id ? `<span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;background:#EEF2FF;color:#4338CA;">🔗 Grup ${s.sefer_id}</span>` : '<span style="color:var(--text3);font-size:12px;">-</span>'}
                  </td>
                  <td style="padding:8px 12px;font-size:12px;font-weight:500;color:var(--text);white-space:nowrap;" onclick="openShipmentDetail(${s.id})">${formatEUR(s.fatura_bedeli_eur)}</td>
                  <td style="padding:8px 12px;font-size:12px;color:var(--text2);white-space:nowrap;" onclick="openShipmentDetail(${s.id})">${s.yukleme_tarihi || '-'}</td>
                  <td style="padding:8px 12px;white-space:nowrap;" onclick="openShipmentDetail(${s.id})">
                    <span style="font-size:11px;font-weight:500;padding:3px 10px;border-radius:20px;${durumStyle(durumNorm)}">${durumNorm}</span>
                  </td>
                </tr>`;
            }).join('')}
      </tbody>
    </table>`;
}

function durumStyle(durum) {
  if (durum === 'YOLDA')         return 'background:#FAEEDA;color:#633806;';
  if (durum === 'TESLİM EDİLDİ') return 'background:#EAF3DE;color:#27500A;';
  if (durum === 'Varış Gümrük')  return 'background:#E6F1FB;color:#0C447C;';
  if (durum === 'HAZIRLANIYOR')  return 'background:#F1EFE8;color:#5F5E5A;';
  return 'background:#F1EFE8;color:#5F5E5A;';
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

  document.getElementById('edit-dosya-no').value      = s.ihracat_dosya_no || '';
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
    vergiStatus.textContent = 'PDF\'i buraya sürükleyin veya tıklayın — Gümrük, KDV veya Brokerage otomatik dolar';
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
      ihracat_dosya_no:      document.getElementById('edit-dosya-no').value.trim(),
      nakliye_firmasi:       document.getElementById('edit-nakliye').value,
      plaka:                 document.getElementById('edit-plaka').value,
      durum:                 document.getElementById('edit-durum').value,
      varis_tarihi:          document.getElementById('edit-varis').value,
      gumrukleme_bitis:      document.getElementById('edit-gumruk-bitis').value,
      fatura_bedeli_tl:      parseFloat(document.getElementById('edit-fatura-tl').value)  || 0,
      fatura_bedeli_eur:     parseFloat(document.getElementById('edit-fatura-eur').value) || 0,
      mal_bedeli_eur:        parseFloat(document.getElementById('edit-mal-eur').value)     || 0,
      navlun_eur:            parseFloat(document.getElementById('edit-navlun').value)      || 0,
      sigorta_eur:           parseFloat(document.getElementById('edit-sigorta').value)     || 0,
      eur_kuru:              parseFloat(document.getElementById('edit-kur').value)         || 0,
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
        <span style="font-weight:600;color:var(--text);">${s.ihracat_dosya_no || '-'}</span>
        <span style="color:var(--text3);margin:0 6px;">·</span>
        <span style="color:var(--text2);font-family:var(--mono);font-size:11px;">${s.fatura_no || '-'}</span>
        <span style="color:var(--text3);margin:0 6px;">·</span>
        <span style="color:var(--text3);">${s.ulke || '-'}</span>
      </div>
      <span style="font-size:11px;color:var(--text3);">${s.plaka || '-'}</span>`;

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

  const token = sessionStorage.getItem('fa_auth_token');
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
  const token = sessionStorage.getItem('fa_auth_token');
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
      <button onclick="topluGrupla()"
        style="padding:7px 16px;border-radius:8px;border:none;
               background:#7C3AED;color:#fff;font-family:var(--font);
               font-size:12px;font-weight:600;cursor:pointer;">
        🔗 Grupla
      </button>
      <button onclick="topluSil()"
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
    return s ? `<span style="font-family:var(--mono);font-size:12px;color:#EF4444;">${s.ihracat_dosya_no || s.fatura_no}</span>` : '';
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
        const token = sessionStorage.getItem('fa_auth_token');
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
          loadShipments();
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
    return s ? `<span style="font-family:var(--mono);font-size:12px;color:var(--accent);">${s.ihracat_dosya_no || s.fatura_no}</span>` : '';
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
        const token = sessionStorage.getItem('fa_auth_token');
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
          loadShipments();
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
    btn.addEventListener('click', () => {
      overlay.remove();
      if (found?.action) found.action();
    });
  });

  // Overlay tıklayınca kapat
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}

// ── SIRBİSTAN VERGİ PDF PARSE ─────────────────────────────────────────────────
async function parseVergiPdf(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const b = new Uint8Array(e.target.result);
        let s = '';
        for (let i = 0; i < b.byteLength; i++) s += String.fromCharCode(b[i]);
        const pdf_b64 = btoa(s);

        const token = sessionStorage.getItem('fa_auth_token');
        const resp  = await fetch('/api/shipments/parse-vergi-pdf', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body:    JSON.stringify({ pdf: pdf_b64 }),
        });
        const data = await resp.json();
        if (!data.success) throw new Error(data.error);
        resolve(data);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Dosya okunamadı'));
    reader.readAsArrayBuffer(file);
  });
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
        `✓ Brokerage: ${fmt(data.rsd.nasi_troskovi)} RSD → ${fmt(data.eur.brokerage)} € | ` +
        `Kur: 1 EUR = ${fmt(data.kur.rsd_per_eur)} RSD`;
    }

  } catch (err) {
    statusEl.style.color = 'var(--error)';
    statusEl.textContent = '⚠ ' + err.message;
  }
}