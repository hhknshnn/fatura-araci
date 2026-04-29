// ── GECMIS.JS ─────────────────────────────────────────────────────────────────
// Son İşlemler paneli — Cloudflare KV + R2 entegrasyonu

const ULKE_LABELS = {
  rs:'Sırbistan', ba:'Bosna', ge:'Gürcistan', xk:'Kosova', mk:'Makedonya',
  be:'Belçika', de:'Almanya', nl:'Hollanda', kz:'Kazakistan', cy:'Kıbrıs',
  iq:'Irak', ly:'Libya', lr:'Liberya', lb:'Lübnan', uz:'Özbekistan', ru:'Rusya'
};

const DOSYA_TURU_LABELS = {
  inv_pl: 'INV + PL',
  taslak: 'Taslak',
  mense:  'Menşe',
};

// ── PANELİ BAŞLAT ─────────────────────────────────────────────────────────────
async function initGecmisPanel() {
  showGecmisStatus('info', '<div class="stat">⏳ Kayıtlar yükleniyor...</div>');
  document.getElementById('gecmisList').innerHTML = '';

  try {
    const resp = await fetch('/api/storage');
    const data = await resp.json();

    if (!data.success) throw new Error(data.error || 'Sunucu hatası');

    const records = data.records || [];

    if (records.length === 0) {
      showGecmisStatus('info', '<div class="stat">Henüz kayıtlı işlem yok.</div>');
      // Sidebar ikonunu gizle
      const navEl = document.getElementById('nav-gecmis-item');
      if (navEl) navEl.style.display = 'none';
      return;
    }

    showGecmisStatus('success',
      `<div class="stat">✓ <span>${records.length}</span> kayıt bulundu</div>`);

    renderGecmisList(records);

  } catch(err) {
    showGecmisStatus('error', '<div class="stat">⚠ ' + err.message + '</div>');
  }
}

// ── LİSTEYİ RENDER ET ────────────────────────────────────────────────────────
function renderGecmisList(records) {
  const container = document.getElementById('gecmisList');
  container.innerHTML = '';

  records.forEach(rec => {
    const tarih     = new Date(rec.tarih * 1000);
    const tarihStr  = tarih.toLocaleString('tr-TR');
    const kalanMs   = (rec.expiresAt * 1000) - Date.now();
    const kalanSaat = Math.max(0, Math.floor(kalanMs / 3600000));
    const ulkeLabel = ULKE_LABELS[rec.ulke] || rec.ulke;
    const turlabel  = DOSYA_TURU_LABELS[rec.dosyaTuru] || rec.dosyaTuru;

    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'margin-bottom:8px;cursor:pointer;transition:border-color 0.15s;';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="badge badge-blue">${ulkeLabel}</span>
          <span class="badge badge-amber">${turlabel}</span>
        </div>
        <span style="font-size:10px;color:var(--text3);">⏱ ${kalanSaat}s kaldı</span>
      </div>
      <div style="font-family:var(--mono);font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px;">
        ${rec.faturaNo}
      </div>
      <div style="font-size:11px;color:var(--text3);display:flex;justify-content:space-between;">
        <span>${tarihStr}</span>
        <span style="color:var(--error);cursor:pointer;" onclick="silGecmisKayit(event, '${rec.key}', this)">🗑 Sil</span>
      </div>`;

    card.addEventListener('click', () => indirGecmisKayit(rec.key, rec.faturaNo));
    container.appendChild(card);
  });
}

// ── İNDİR ────────────────────────────────────────────────────────────────────
async function indirGecmisKayit(key, faturaNo) {
  showGecmisStatus('info', '<div class="stat">⏳ Dosya indiriliyor...</div>');
  try {
    const resp = await fetch('/api/storage?key=' + encodeURIComponent(key));
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');

    const files = data.files || {};

    if (files.excel) {
      _downloadB64(files.excel,
        `${faturaNo}.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
    if (files.pdf) {
      _downloadB64(files.pdf, `${faturaNo}.pdf`, 'application/pdf');
    }

    showGecmisStatus('success',
      `<div class="stat">✓ İndirildi: <span>${faturaNo}</span></div>`);

  } catch(err) {
    showGecmisStatus('error', '<div class="stat">⚠ ' + err.message + '</div>');
  }
}

// ── SİL ──────────────────────────────────────────────────────────────────────
async function silGecmisKayit(event, key, el) {
  event.stopPropagation();
  if (!confirm('Bu kayıt silinsin mi?')) return;
  try {
    await fetch('/api/storage', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
    // Kartı DOM'dan kaldır
    el.closest('.card').remove();
    const remaining = document.querySelectorAll('#gecmisList .card').length;
    if (remaining === 0) {
      showGecmisStatus('info', '<div class="stat">Henüz kayıtlı işlem yok.</div>');
    }
  } catch(err) {
    showGecmisStatus('error', '<div class="stat">⚠ ' + err.message + '</div>');
  }
}

// ── YARDIMCI ─────────────────────────────────────────────────────────────────
function _downloadB64(b64, fileName, mimeType) {
  const bin   = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  URL.revokeObjectURL(url);
}

function showGecmisStatus(type, html) {
  const sb = document.getElementById('gecmisStatus');
  if (!sb) return;
  sb.className = 'status-box visible ' + type;
  sb.innerHTML = html;
}

// ── SIDEBAR İKONUNU GÖSTER ───────────────────────────────────────────────────
// Uygulama açılışında kayıt varsa sidebar'da göster
async function checkGecmisCount() {
  try {
    const resp = await fetch('/api/storage');
    const data = await resp.json();
    const navEl = document.getElementById('nav-gecmis-item');
    if (!navEl) return;
    if (data.success && data.records && data.records.length > 0) {
      navEl.style.display = 'flex';
    } else {
      navEl.style.display = 'none';
    }
  } catch(e) {
    // sessizce geç
  }
}