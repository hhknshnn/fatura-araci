// js/shipments.js
// Sevkiyatlar sayfası — listeleme, filtreleme, güncelleme

let allShipments = [];


// Sticky yatay scroll bar — viewport'a yapışık
function initStickyScroll() {
  const wrapper = document.getElementById('shipments-table-wrapper');
  if (!wrapper) return;

  // Sahte scroll bar div'i oluştur
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

  // İçine tablo genişliğinde boş div
  const fakeInner = document.createElement('div');
  fakeInner.id = 'fake-scrollbar-inner';
  fakeScroll.appendChild(fakeInner);
  document.body.appendChild(fakeScroll);

  // Genişlikleri senkronize et
  function syncWidth() {
    fakeInner.style.width = wrapper.scrollWidth + 'px';
    // Wrapper görünür değilse gizle
    const rect = wrapper.getBoundingClientRect();
    fakeScroll.style.display = rect.width > 0 ? 'block' : 'none';
  }

  // Scroll senkronizasyonu
  wrapper.addEventListener('scroll', () => {
    fakeScroll.scrollLeft = wrapper.scrollLeft;
  });
  fakeScroll.addEventListener('scroll', () => {
    wrapper.scrollLeft = fakeScroll.scrollLeft;
  });

  // Tablo yüklenince ve resize'da genişliği güncelle
  syncWidth();
  window.addEventListener('resize', syncWidth);

  // renderShipments sonrası da güncelle
  const origRender = window.renderShipments;
  window.renderShipments = function (list) {
    origRender(list);
    setTimeout(syncWidth, 50);
  };
}
// Veritabanından gelen durum değerlerini normalize et
// İmport scriptinden 'Yolda', 'yolda', 'YOLDA' gibi farklı formlar gelebilir
function normalizeDurum(raw) {
  if (!raw) return 'YOLDA';
  const s = raw.toString().trim().toUpperCase()
    .replace('İ', 'İ')
    .replace('I', 'I');

  // Bilinen değerleri map'le
  if (s === 'YOLDA' || s === 'IN TRANSIT' || s === 'TRANSIT') return 'YOLDA';
  if (s === 'TESLİM EDİLDİ' || s === 'TESLIM EDILDI' || s === 'DELIVERED' || s === 'TESLIM') return 'TESLİM EDİLDİ';
  if (s === 'VARIŞ GÜMRÜK' || s === 'VARIS GUMRUK' || s === 'CUSTOMS' || s === 'GÜMRÜKTE') return 'Varış Gümrük';
  if (s === 'HAZIRLANYOR' || s === 'HAZIRLANIYOR' || s === 'PREPARING') return 'HAZIRLANIYOR';

  // Tanınmayan değeri olduğu gibi döndür (UI'da gri badge gösterir)
  return raw.toString().trim();
}

async function loadShipments(ulke = '', durum = '') {

  // Özet şerit yoksa oluştur
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

    // Ülke değerini backend'e göndermeden önce normalize et
    // DB'de büyük harf (SIRBİSTAN) olabilir — backend ILIKE ile eşleştirir
    if (ulke) params.push(`ulke=${encodeURIComponent(ulke)}`);
    if (durum) params.push(`durum=${encodeURIComponent(durum)}`);
    if (params.length) url += '?' + params.join('&');

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.success) return;

    allShipments = data.shipments;
    renderShipments(allShipments);
    // İlk yüklemede sticky scroll'u başlat
    if (!document.getElementById('fake-scrollbar')) initStickyScroll();
  } catch (e) {
    console.error('Sevkiyatlar yüklenemedi:', e);
  }
}

function renderShipments(list) {
  const tbody = document.getElementById('shipments-tbody');
  if (!tbody) return;
  
  // Özet şerit güncelle
  const toplam = list.length;
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

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text3);">Sevkiyat bulunamadı</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(s => {
    const durumNorm = normalizeDurum(s.durum);
    return `
      <tr style="border-bottom:0.5px solid var(--border);cursor:pointer;" onclick="openShipmentDetail(${s.id})">
        <td style="padding:6px 12px;font-size:12px;font-weight:500;color:var(--text);white-space:nowrap;">${s.ihracat_dosya_no || '-'}</td>
        <td style="padding:6px 12px;font-size:12px;color:var(--text2);white-space:nowrap;">${s.fatura_no || '-'}</td>
        <td style="padding:6px 12px;font-size:12px;white-space:nowrap;">
          <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;${s.fatura_no?.startsWith('ANT') ? 'background:var(--gold-dim);color:var(--gold);' : 'background:var(--accent-dim);color:var(--accent-text);'}">
            ${s.fatura_no?.startsWith('ANT') ? 'ANT' : 'IHR'}
          </span>
        </td>
        <td style="padding:6px 12px;font-size:12px;color:var(--text2);white-space:nowrap;">${s.ulke || '-'}</td>
        <td style="padding:6px 12px;font-size:12px;color:var(--text2);white-space:nowrap;">${s.nakliye_firmasi || '-'}</td>
        <td style="padding:6px 12px;font-size:12px;color:var(--text2);white-space:nowrap;">${s.plaka || '-'}</td>
        <td style="padding:6px 12px;font-size:12px;color:var(--text2);white-space:nowrap;">${formatEUR(s.fatura_bedeli_eur)}</td>
        <td style="padding:6px 12px;font-size:12px;color:var(--text2);white-space:nowrap;">${s.yukleme_tarihi || '-'}</td>
        <td style="padding:6px 12px;font-size:12px;color:var(--text2);white-space:nowrap;">${s.varis_tarihi || '-'}</td>
        <td style="padding:6px 12px;white-space:nowrap;">
          <span style="font-size:11px;font-weight:500;padding:3px 8px;border-radius:4px;${durumStyle(durumNorm)}">${durumNorm}</span>
        </td>
      </tr>`;
  }).join('');
}

function durumStyle(durum) {
  if (durum === 'YOLDA') return 'background:var(--gold-dim);color:var(--gold);';
  if (durum === 'TESLİM EDİLDİ') return 'background:var(--success-dim);color:var(--success);';
  if (durum === 'Varış Gümrük') return 'background:var(--accent-dim);color:var(--accent-text);';
  if (durum === 'HAZIRLANIYOR') return 'background:var(--surface2);color:var(--text2);border:0.5px solid var(--border2);';
  // Tanınmayan durum — nötr gri
  return 'background:var(--surface2);color:var(--text2);border:0.5px solid var(--border2);';
}

function filterShipments() {
  const ulke = document.getElementById('filter-ulke')?.value || '';
  const durum = document.getElementById('filter-durum')?.value || '';
  const depo = document.getElementById('filter-depo')?.value || '';

  let filtered = allShipments;
  if (ulke) filtered = filtered.filter(s => s.ulke?.toLowerCase().includes(ulke.toLowerCase()));
  if (durum) filtered = filtered.filter(s => normalizeDurum(s.durum) === durum);
  if (depo) filtered = filtered.filter(s => s.fatura_no?.startsWith(depo));

  renderShipments(filtered);
}

function formatDateInput(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
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
  const panel = document.getElementById('shipment-detail-panel');
  const overlay = document.getElementById('shipment-overlay');
  if (!panel || !overlay) return;

  // Panel alanlarını doldur
  document.getElementById('detail-dosya-no').textContent = s.ihracat_dosya_no || '-';
  document.getElementById('detail-fatura-no').textContent = s.fatura_no || '-';
  document.getElementById('detail-ulke').textContent = s.ulke || '-';
  document.getElementById('detail-id').value = s.id;

  document.getElementById('edit-nakliye').value = s.nakliye_firmasi || '';
  document.getElementById('edit-plaka').value = s.plaka || '';
  // Durum select'e normalize edilmiş değeri yaz
  document.getElementById('edit-durum').value = normalizeDurum(s.durum);
  document.getElementById('edit-varis').value = s.varis_tarihi || '';
  document.getElementById('edit-gumruk-bitis').value = s.gumrukleme_bitis || '';
  document.getElementById('edit-beyanname-tl').value = s.ihracat_beyanname_tl || '';
  document.getElementById('edit-beyanname-eur').value = s.ihracat_beyanname_eur || '';
  document.getElementById('edit-bekleme').value = s.arac_bekleme || '';
  document.getElementById('edit-brokerage').value = s.brokerage_eur || '';
  document.getElementById('edit-gumruk-v').value = s.gumruk_vergisi_eur || '';
  document.getElementById('edit-kdv').value = s.kdv_eur || '';
  document.getElementById('edit-fatura-tl').value = s.fatura_bedeli_tl || '';
  document.getElementById('edit-fatura-eur').value = s.fatura_bedeli_eur || '';
  document.getElementById('edit-mal-eur').value = s.mal_bedeli_eur || '';
  document.getElementById('edit-navlun').value = s.navlun_eur || '';
  document.getElementById('edit-sigorta').value = s.sigorta_eur || '';
  document.getElementById('edit-kur').value = s.eur_kuru || '';
  document.getElementById('edit-yukleme').value = formatDateInput(s.yukleme_tarihi);
  document.getElementById('edit-gumruk-tarihi').value = formatDateInput(s.gumruk_tarihi);
  document.getElementById('edit-varis').value = formatDateInput(s.varis_tarihi);
  document.getElementById('edit-gumruk-bitis').value = formatDateInput(s.gumrukleme_bitis);
  // Yeni kayıt alanlarını gizle — bu düzenleme modunda
  const newFields = document.getElementById('new-shipment-fields');
  if (newFields) newFields.style.display = 'none';

  overlay.style.display = 'block';
  panel.style.display = 'flex';
}

function closeShipmentDetail() {
  document.getElementById('shipment-detail-panel').style.display = 'none';
  document.getElementById('shipment-overlay').style.display = 'none';
  const newFields = document.getElementById('new-shipment-fields');
  if (newFields) newFields.style.display = 'none';
}

async function saveShipmentDetail() {
  const token = sessionStorage.getItem('fa_auth_token');
  const id = document.getElementById('detail-id').value;
  const isNew = !id; // id boşsa yeni kayıt

  if (isNew) {
    // Yeni kayıt
    const body = {
      ihracat_dosya_no: document.getElementById('new-dosya-no').value,
      fatura_no: document.getElementById('new-fatura-no').value,
      ulke: document.getElementById('new-ulke').value,
      nakliye_firmasi: document.getElementById('edit-nakliye').value,
      plaka: document.getElementById('edit-plaka').value,
      durum: document.getElementById('edit-durum').value,
      yukleme_tarihi: document.getElementById('new-yukleme').value,
      varis_tarihi: document.getElementById('edit-varis').value,
      gumrukleme_bitis: document.getElementById('edit-gumruk-bitis').value,
      fatura_bedeli_tl: parseFloat(document.getElementById('new-fatura-tl').value) || 0,
      fatura_bedeli_eur: parseFloat(document.getElementById('new-fatura-eur').value) || 0,
      mal_bedeli_eur: parseFloat(document.getElementById('new-mal-eur').value) || 0,
      navlun_eur: parseFloat(document.getElementById('new-navlun').value) || 0,
      sigorta_eur: parseFloat(document.getElementById('new-sigorta').value) || 0,
      eur_kuru: parseFloat(document.getElementById('new-kur').value) || 0,
    };

    const res = await fetch('/api/shipments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (data.success) {
      closeShipmentDetail();
      loadShipments();
    } else {
      alert('Kayıt hatası: ' + (data.error || 'Bilinmeyen hata'));
    }

  } else {
    // Mevcut kayıt güncelle
    const body = {
      id: parseInt(id),
      nakliye_firmasi: document.getElementById('edit-nakliye').value,
      plaka: document.getElementById('edit-plaka').value,
      durum: document.getElementById('edit-durum').value,
      varis_tarihi: document.getElementById('edit-varis').value,
      gumrukleme_bitis: document.getElementById('edit-gumruk-bitis').value,
      ihracat_beyanname_tl: parseFloat(document.getElementById('edit-beyanname-tl').value) || 0,
      ihracat_beyanname_eur: parseFloat(document.getElementById('edit-beyanname-eur').value) || 0,
      arac_bekleme: parseFloat(document.getElementById('edit-bekleme').value) || 0,
      brokerage_eur: parseFloat(document.getElementById('edit-brokerage').value) || 0,
      gumruk_vergisi_eur: parseFloat(document.getElementById('edit-gumruk-v').value) || 0,
      kdv_eur: parseFloat(document.getElementById('edit-kdv').value) || 0,
    };

    const res = await fetch('/api/shipments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (data.success) {
      closeShipmentDetail();
      loadShipments();
    } else {
      alert('Kayıt hatası: ' + (data.error || 'Bilinmeyen hata'));
    }
  }
}
// Maliyet raporu — önce JSON hata kontrolü yap, sonra blob indir
async function downloadMaliyetRaporu() {
  const token = sessionStorage.getItem('fa_auth_token');
  const ulke = document.getElementById('filter-ulke')?.value || '';
  const durum = document.getElementById('filter-durum')?.value || '';
  const depo = document.getElementById('filter-depo')?.value || '';
  let url = '/api/shipments/export';
  const params = [];
  if (ulke) params.push(`ulke=${encodeURIComponent(ulke)}`);
  if (durum) params.push(`durum=${encodeURIComponent(durum)}`);
  if (depo) params.push(`depo=${encodeURIComponent(depo)}`);
  if (params.length) url += '?' + params.join('&');

  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    // Backend hata dönmüş olabilir — Content-Type kontrolü
    const contentType = res.headers.get('Content-Type') || '';
    if (!res.ok || contentType.includes('application/json')) {
      // JSON hata mesajı — blob değil, text oku
      const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      alert('Rapor indirilemedi: ' + (errData.error || errData.message || 'Sunucu hatası'));
      return;
    }

    // Başarılı — blob olarak indir
    const blob = await res.blob();
    if (blob.size === 0) {
      alert('Rapor boş geldi. Veri olmayabilir.');
      return;
    }
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
  const panel = document.getElementById('shipment-detail-panel');
  const overlay = document.getElementById('shipment-overlay');
  if (!panel || !overlay) return;

  // Başlığı güncelle
  document.getElementById('detail-dosya-no').textContent = 'Yeni Sevkiyat';
  document.getElementById('detail-fatura-no').textContent = '';
  document.getElementById('detail-ulke').textContent = '';
  document.getElementById('detail-id').value = '';

  // Tüm alanları temizle
  document.getElementById('edit-nakliye').value = '';
  document.getElementById('edit-plaka').value = '';
  document.getElementById('edit-durum').value = 'YOLDA';
  document.getElementById('edit-varis').value = '';
  document.getElementById('edit-gumruk-bitis').value = '';
  document.getElementById('edit-beyanname-tl').value = '';
  document.getElementById('edit-beyanname-eur').value = '';
  document.getElementById('edit-bekleme').value = '';
  document.getElementById('edit-brokerage').value = '';
  document.getElementById('edit-gumruk-v').value = '';
  document.getElementById('edit-kdv').value = '';

  document.getElementById('new-shipment-fields').style.display = 'block';
  overlay.style.display = 'block';
  panel.style.display = 'flex';
}

async function deleteShipment() {
  const id = document.getElementById('detail-id').value;
  if (!id) return; // Yeni kayıtta silme butonu çalışmasın

  if (!confirm('Bu sevkiyatı silmek istediğinizden emin misiniz?')) return;

  const token = sessionStorage.getItem('fa_auth_token');
  const res = await fetch('/api/shipments', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ id: parseInt(id) }),
  });

  const data = await res.json();
  if (data.success) {
    closeShipmentDetail();
    loadShipments();
  } else {
    alert('Silme hatası: ' + (data.error || 'Bilinmeyen hata'));
  }
}

function clearFilters() {
  document.getElementById('filter-ulke').value = '';
  document.getElementById('filter-durum').value = '';
  document.getElementById('filter-depo').value = '';
  loadShipments();
}