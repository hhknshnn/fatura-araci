// js/shipments.js
// Sevkiyatlar sayfası — listeleme, filtreleme, güncelleme

let allShipments = [];

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
  try {
    const token = localStorage.getItem('auth_token');
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
  } catch (e) {
    console.error('Sevkiyatlar yüklenemedi:', e);
  }
}

function renderShipments(list) {
  const tbody = document.getElementById('shipments-tbody');
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text3);">Sevkiyat bulunamadı</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(s => {
      const durumNorm = normalizeDurum(s.durum);
      return `
      <tr style="border-bottom:0.5px solid var(--border);cursor:pointer;" onclick="openShipmentDetail(${s.id})">
        <td style="padding:10px 16px;font-size:13px;font-weight:500;color:var(--text);white-space:nowrap;">${s.ihracat_dosya_no || '-'}</td>
        <td style="padding:10px 16px;font-size:13px;color:var(--text2);white-space:nowrap;">${s.fatura_no || '-'}</td>
        <td style="padding:10px 16px;font-size:13px;color:var(--text2);white-space:nowrap;">${s.ulke || '-'}</td>
        <td style="padding:10px 16px;font-size:13px;color:var(--text2);white-space:nowrap;">${s.nakliye_firmasi || '-'}</td>
        <td style="padding:10px 16px;font-size:13px;color:var(--text2);white-space:nowrap;">${s.plaka || '-'}</td>
        <td style="padding:10px 16px;font-size:13px;color:var(--text2);white-space:nowrap;">${s.fatura_bedeli_eur ? s.fatura_bedeli_eur.toFixed(0) + ' €' : '-'}</td>
        <td style="padding:10px 16px;font-size:13px;color:var(--text2);white-space:nowrap;">${s.yukleme_tarihi || '-'}</td>
        <td style="padding:10px 16px;white-space:nowrap;">
          <span style="font-size:11px;font-weight:500;padding:3px 8px;border-radius:4px;${durumStyle(durumNorm)}">${durumNorm}</span>
        </td>
      </tr>`;
    }).join('');
  }

function durumStyle(durum) {
  if (durum === 'YOLDA')        return 'background:var(--gold-dim);color:var(--gold);';
  if (durum === 'TESLİM EDİLDİ') return 'background:var(--success-dim);color:var(--success);';
  if (durum === 'Varış Gümrük') return 'background:var(--accent-dim);color:var(--accent-text);';
  if (durum === 'HAZIRLANIYOR') return 'background:var(--surface2);color:var(--text2);border:0.5px solid var(--border2);';
  // Tanınmayan durum — nötr gri
  return 'background:var(--surface2);color:var(--text2);border:0.5px solid var(--border2);';
}

function filterShipments() {
  const ulke  = document.getElementById('filter-ulke')?.value || '';
  const durum = document.getElementById('filter-durum')?.value || '';
  loadShipments(ulke, durum);
}

async function openShipmentDetail(id) {
  const token = localStorage.getItem('auth_token');
  const res = await fetch(`/api/shipments?id=${id}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  if (!data.success) return;

  const s = data.shipment;
  const panel   = document.getElementById('shipment-detail-panel');
  const overlay = document.getElementById('shipment-overlay');
  if (!panel || !overlay) return;

  // Panel alanlarını doldur
  document.getElementById('detail-dosya-no').textContent  = s.ihracat_dosya_no || '-';
  document.getElementById('detail-fatura-no').textContent = s.fatura_no || '-';
  document.getElementById('detail-ulke').textContent      = s.ulke || '-';
  document.getElementById('detail-id').value              = s.id;

  document.getElementById('edit-nakliye').value       = s.nakliye_firmasi || '';
  document.getElementById('edit-plaka').value         = s.plaka || '';
  // Durum select'e normalize edilmiş değeri yaz
  document.getElementById('edit-durum').value         = normalizeDurum(s.durum);
  document.getElementById('edit-varis').value         = s.varis_tarihi || '';
  document.getElementById('edit-gumruk-bitis').value  = s.gumrukleme_bitis || '';
  document.getElementById('edit-beyanname-tl').value  = s.ihracat_beyanname_tl || '';
  document.getElementById('edit-beyanname-eur').value = s.ihracat_beyanname_eur || '';
  document.getElementById('edit-bekleme').value       = s.arac_bekleme || '';
  document.getElementById('edit-brokerage').value     = s.brokerage_fee_eur || '';
  document.getElementById('edit-gumruk-v').value      = s.gumruk_vergisi_eur || '';
  document.getElementById('edit-kdv').value           = s.kdv_eur || '';

  overlay.style.display = 'block';
  panel.style.display   = 'flex';
}

function closeShipmentDetail() {
  document.getElementById('shipment-detail-panel').style.display = 'none';
  document.getElementById('shipment-overlay').style.display      = 'none';
}

async function saveShipmentDetail() {
  const token = localStorage.getItem('auth_token');
  const id = document.getElementById('detail-id').value;

  // Backend'deki update_shipment (Python) fonksiyonunun beklediği 
  // anahtar isimleriyle (dict keys) birebir aynı olmalı.
  const body = {
    id:                    parseInt(id),
    nakliye_firmasi:       document.getElementById('edit-nakliye').value,
    plaka:                 document.getElementById('edit-plaka').value,
    durum:                 document.getElementById('edit-durum').value,
    varis_tarihi:          document.getElementById('edit-varis').value, // 'Varış Tarihi' değil, varis_tarihi olmalı
    gumrukleme_bitis:      document.getElementById('edit-gumruk-bitis').value,
    ihracat_beyanname_tl:  parseFloat(document.getElementById('edit-beyanname-tl').value)  || 0,
    ihracat_beyanname_eur: parseFloat(document.getElementById('edit-beyanname-eur').value) || 0,
    arac_bekleme:          parseFloat(document.getElementById('edit-bekleme').value)       || 0,
    brokerage_eur:         parseFloat(document.getElementById('edit-brokerage').value)     || 0,
    gumruk_vergisi_eur:    parseFloat(document.getElementById('edit-gumruk-v').value)      || 0,
    kdv_eur:               parseFloat(document.getElementById('edit-kdv').value)           || 0,
  };

  const res = await fetch('/api/shipments', {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body:    JSON.stringify(body),
  });

  const data = await res.json();
  if (data.success) {
    closeShipmentDetail();
    loadShipments(); // Listeyi yenile
  } else {
    alert('Kayıt hatası: ' + (data.error || 'Bilinmeyen hata'));
  }
}

// Maliyet raporu — önce JSON hata kontrolü yap, sonra blob indir
async function downloadMaliyetRaporu() {
  const token = localStorage.getItem('auth_token');
  const ulke  = document.getElementById('filter-ulke')?.value || '';
  let url = '/api/shipments/export';
  if (ulke) url += `?ulke=${encodeURIComponent(ulke)}`;

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
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `maliyet_raporu_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);

  } catch (e) {
    console.error('Rapor indirme hatası:', e);
    alert('Rapor indirilemedi: ' + e.message);
  }
}