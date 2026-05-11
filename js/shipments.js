// js/shipments.js
// Sevkiyatlar sayfası — listeleme, filtreleme, güncelleme

let allShipments = [];

async function loadShipments(ulke = '', durum = '') {
  try {
    const token = localStorage.getItem('auth_token');
    let url = '/api/shipments';
    const params = [];
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
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--color-text-secondary);">Sevkiyat bulunamadı</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(s => `
    <tr style="border-bottom:0.5px solid var(--color-border-tertiary);cursor:pointer;" onclick="openShipmentDetail(${s.id})">
      <td style="padding:12px 16px;font-size:13px;font-weight:500;color:var(--color-text-primary);">${s.ihracat_dosya_no || '-'}</td>
      <td style="padding:12px 16px;font-size:13px;color:var(--color-text-secondary);">${s.fatura_no || '-'}</td>
      <td style="padding:12px 16px;font-size:13px;color:var(--color-text-secondary);">${s.ulke || '-'}</td>
      <td style="padding:12px 16px;font-size:13px;color:var(--color-text-secondary);">${s.nakliye_firmasi || '-'}</td>
      <td style="padding:12px 16px;font-size:13px;color:var(--color-text-secondary);">${s.plaka || '-'}</td>
      <td style="padding:12px 16px;font-size:13px;color:var(--color-text-secondary);">${s.fatura_bedeli_eur ? s.fatura_bedeli_eur.toFixed(0) + ' €' : '-'}</td>
      <td style="padding:12px 16px;font-size:13px;color:var(--color-text-secondary);">${s.yukleme_tarihi || '-'}</td>
      <td style="padding:12px 16px;">
        <span style="font-size:11px;font-weight:500;padding:3px 8px;border-radius:4px;${durumStyle(s.durum)}">${s.durum}</span>
      </td>
    </tr>
  `).join('');
}

function durumStyle(durum) {
  if (durum === 'YOLDA') return 'background:var(--color-background-warning);color:var(--color-text-warning);';
  if (durum === 'TESLİM EDİLDİ') return 'background:var(--color-background-success);color:var(--color-text-success);';
  if (durum === 'Varış Gümrük') return 'background:var(--color-background-info);color:var(--color-text-info);';
  return 'background:var(--color-background-secondary);color:var(--color-text-secondary);';
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
  const panel = document.getElementById('shipment-detail-panel');
  const overlay = document.getElementById('shipment-overlay');
  if (!panel || !overlay) return;

  // Panel alanlarını doldur
  document.getElementById('detail-dosya-no').textContent   = s.ihracat_dosya_no || '-';
  document.getElementById('detail-fatura-no').textContent  = s.fatura_no || '-';
  document.getElementById('detail-ulke').textContent       = s.ulke || '-';
  document.getElementById('detail-id').value               = s.id;

  document.getElementById('edit-nakliye').value    = s.nakliye_firmasi || '';
  document.getElementById('edit-plaka').value      = s.plaka || '';
  document.getElementById('edit-durum').value      = s.durum || 'YOLDA';
  document.getElementById('edit-varis').value      = s.varis_tarihi || '';
  document.getElementById('edit-gumruk-bitis').value = s.gumrukleme_bitis || '';
  document.getElementById('edit-beyanname-tl').value = s.ihracat_beyanname_tl || '';
  document.getElementById('edit-beyanname-eur').value = s.ihracat_beyanname_eur || '';
  document.getElementById('edit-bekleme').value    = s.arac_bekleme || '';
  document.getElementById('edit-brokerage').value  = s.brokerage_fee_eur || '';
  document.getElementById('edit-gumruk-v').value   = s.gumruk_vergisi_eur || '';
  document.getElementById('edit-kdv').value        = s.kdv_eur || '';

  overlay.style.display = 'block';
  panel.style.display   = 'flex';
}

function closeShipmentDetail() {
  document.getElementById('shipment-detail-panel').style.display = 'none';
  document.getElementById('shipment-overlay').style.display      = 'none';
}

async function saveShipmentDetail() {
  const token = localStorage.getItem('auth_token');
  const id    = document.getElementById('detail-id').value;

  const body = {
    id:                    parseInt(id),
    nakliye_firmasi:       document.getElementById('edit-nakliye').value,
    plaka:                 document.getElementById('edit-plaka').value,
    durum:                 document.getElementById('edit-durum').value,
    varis_tarihi:          document.getElementById('edit-varis').value,
    gumrukleme_bitis:      document.getElementById('edit-gumruk-bitis').value,
    ihracat_beyanname_tl:  parseFloat(document.getElementById('edit-beyanname-tl').value) || 0,
    ihracat_beyanname_eur: parseFloat(document.getElementById('edit-beyanname-eur').value) || 0,
    arac_bekleme:          parseFloat(document.getElementById('edit-bekleme').value) || 0,
    brokerage_fee_eur:     parseFloat(document.getElementById('edit-brokerage').value) || 0,
    gumruk_vergisi_eur:    parseFloat(document.getElementById('edit-gumruk-v').value) || 0,
    kdv_eur:               parseFloat(document.getElementById('edit-kdv').value) || 0,
  };

  const res = await fetch('/api/shipments', {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body:    JSON.stringify(body),
  });
  const data = await res.json();
  if (data.success) {
    closeShipmentDetail();
    loadShipments();
  }
}

async function downloadMaliyetRaporu() {
  const token = localStorage.getItem('auth_token');
  const ulke  = document.getElementById('filter-ulke')?.value || '';
  let url = '/api/shipments/export';
  if (ulke) url += `?ulke=${encodeURIComponent(ulke)}`;

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const blob = await res.blob();
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `maliyet_raporu_${new Date().toISOString().slice(0,10)}.xlsx`;
  a.click();
}