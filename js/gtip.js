// ── GTIP.JS ───────────────────────────────────────────────────────────────────
// GTİP Kontrol modülü — bağımsız çalışır, diğer akışları etkilemez.
// Referans liste: templates/gtip_ref.xlsx (17K+ normalize GTIP)
// Tüm hatalar try/catch ile sarmalanır, global state'e dokunmaz.

// ── STATE (yalıtılmış — sadece bu modül kullanır) ─────────────────────────────
let gtipRefSet       = null;   // Set<string> — normalize GTIP referansları
let gtipRefLoading   = false;
let gtipRefError     = null;
let gtipMasterRows   = null;   // yüklenen fatura Excel satırları
let gtipFileName     = '';     // yüklenen dosya adı

// ── YARDIMCI: GTIP NORMALIZE ──────────────────────────────────────────────────
// Noktaları, boşlukları, özel karakterleri siler — sadece rakam bırakır
function gtipNormalize(val) {
  if (val === null || val === undefined || val === '') return '';
  const s = String(val).trim();
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 48 && c <= 57) out += s[i];  // 0-9
  }
  return out;
}

// ── REFERANS LİSTEYİ YÜKLE ────────────────────────────────────────────────────
async function loadGtipRef() {
  if (gtipRefSet) return gtipRefSet;                    // cached
  if (gtipRefLoading) {                                  // başka çağrı yüklüyorsa bekle
    while (gtipRefLoading) await new Promise(r => setTimeout(r, 100));
    return gtipRefSet;
  }

  gtipRefLoading = true;
  gtipRefError   = null;

  try {
    const resp = await fetch('./templates/gtip_ref.xlsx', { cache: 'force-cache' });
    if (!resp.ok) throw new Error('Referans dosya bulunamadı (HTTP ' + resp.status + ')');

    const buf  = await resp.arrayBuffer();
    const wb   = XLSX.read(buf, { type: 'array' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    const set = new Set();
    // İlk satır başlık — 2. satırdan başla
    for (let i = 1; i < rows.length; i++) {
      const val = rows[i][0];
      if (val === '' || val === null || val === undefined) continue;
      const n = gtipNormalize(val);
      if (n) set.add(n);
    }

    if (set.size === 0) throw new Error('Referans liste boş');
    gtipRefSet = set;
    return gtipRefSet;

  } catch(err) {
    gtipRefError = err.message;
    gtipRefSet   = null;
    throw err;
  } finally {
    gtipRefLoading = false;
  }
}

// ── PANELİ AÇ ─────────────────────────────────────────────────────────────────
function initGtipPanel() {
  try {
    // Diğer adım panellerini gizle
    for (let i = 1; i <= 5; i++) {
      const el = document.getElementById('step' + i);
      if (el) el.style.display = 'none';
    }
    const taslakPanel = document.getElementById('stepTaslak');
    if (taslakPanel) taslakPanel.style.display = 'none';

    // GTIP panelini göster
    const panel = document.getElementById('stepGtip');
    if (!panel) {
      console.error('stepGtip paneli bulunamadı');
      return;
    }
    panel.style.display = 'block';

    // State temizle
    gtipMasterRows = null;
    gtipFileName   = '';

    // UI temizle
    const fileBadge = document.getElementById('gtipFileName');
    if (fileBadge) { fileBadge.style.display = 'none'; fileBadge.textContent = ''; }

    const resultBox = document.getElementById('gtipResultBox');
    if (resultBox) { resultBox.className = 'status-box'; resultBox.innerHTML = ''; }

    const errorList = document.getElementById('gtipErrorList');
    if (errorList) errorList.innerHTML = '';

    const errorPanel = document.getElementById('gtipErrorPanel');
    if (errorPanel) errorPanel.style.display = 'none';

    // Referans listeyi arka planda yükle — hata olursa bile panel açık kalır
    loadGtipRef().then(() => {
      showGtipStatus('info',
        `<div class="stat">✓ Referans liste hazır: <span>${gtipRefSet.size.toLocaleString('tr')} GTİP</span></div>
         <div class="stat">Master Excel yükleyin, otomatik kontrol edilecek</div>`);
    }).catch(err => {
      showGtipStatus('error',
        `<div class="stat">⚠ Referans liste yüklenemedi: ${err.message}</div>
         <div class="stat">GTİP Kontrol şu an kullanılamıyor. Diğer işlemler etkilenmedi.</div>`);
    });

  } catch(err) {
    console.error('initGtipPanel hatası:', err);
  }
}

// ── PANELDEN ÇIK (ana menüye dön) ─────────────────────────────────────────────
function exitGtipPanel() {
  try {
    const panel = document.getElementById('stepGtip');
    if (panel) panel.style.display = 'none';

    const step1 = document.getElementById('step1');
    if (step1) step1.style.display = 'block';

    // Adım 1'deki kartların seçimini temizle
    const cards = ['card-taslak', 'card-gtip', 'card-oncesi', 'card-sonrasi'];
    cards.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    });

    // Adım 1 devam butonunu gizle
    const next = document.getElementById('step1Next');
    if (next) next.style.display = 'none';

    // Wizard dots'u sıfırla (globalde tanımlıysa)
    if (typeof updateDots === 'function') updateDots(1);

    // State temizle — bellekte boşuna yer tutmasın
    gtipMasterRows = null;
    gtipFileName   = '';
  } catch(err) {
    console.error('exitGtipPanel hatası:', err);
  }
}

// ── DOSYA YÜKLEME ─────────────────────────────────────────────────────────────
function handleGtipFile(file) {
  try {
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls') {
      showGtipStatus('error', '<div class="stat">⚠ Sadece Excel dosyası yükleyin (.xlsx / .xls)</div>');
      return;
    }

    gtipFileName = file.name;
    const badge = document.getElementById('gtipFileName');
    if (badge) { badge.textContent = '✓ ' + file.name; badge.style.display = 'inline-flex'; }

    const r = new FileReader();
    r.onload = e => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });

        if (!rows.length) throw new Error('Dosya boş');

        gtipMasterRows = rows;
        runGtipCheck();
      } catch(err) {
        showGtipStatus('error', '<div class="stat">⚠ Dosya okunamadı: ' + err.message + '</div>');
      }
    };
    r.onerror = () => {
      showGtipStatus('error', '<div class="stat">⚠ Dosya okunamadı</div>');
    };
    r.readAsArrayBuffer(file);

  } catch(err) {
    console.error('handleGtipFile hatası:', err);
    showGtipStatus('error', '<div class="stat">⚠ ' + err.message + '</div>');
  }
}

// ── KONTROL ÇALIŞTIR ─────────────────────────────────────────────────────────
async function runGtipCheck() {
  try {
    if (!gtipMasterRows || !gtipMasterRows.length) return;

    // Referans listeyi garanti altına al
    if (!gtipRefSet) {
      try { await loadGtipRef(); }
      catch(err) {
        showGtipStatus('error', '<div class="stat">⚠ Referans liste yüklenemedi: ' + err.message + '</div>');
        return;
      }
    }

    const errorPanel = document.getElementById('gtipErrorPanel');
    if (errorPanel) errorPanel.style.display = 'none';

    // Satırları tara — eşleşmeyen ve boş GTIP'leri topla
    const invalid = []; // {gtip, sku, urun, materyal}
    const empty   = []; // {sku, urun, materyal}
    let checked   = 0;

    for (const row of gtipMasterRows) {
      const rawGtip = row['GTİP'];
      const sku     = String(row['SKU'] || '').trim();
      const urun    = String(
        row['Madde Açıklaması'] ||
        row['Ürün Açıklaması EN'] ||
        row['ALT GRUBU Açıklama'] ||
        row['ALT GRUBU -EN'] || ''
      ).trim();
      const materyal = String(
        row['MATERYAL -EN'] ||
        row['MATERYAL'] || ''
      ).trim();

      const normalized = gtipNormalize(rawGtip);
      if (!normalized) {
        empty.push({ sku, urun, materyal });
        continue;
      }
      checked++;
      if (!gtipRefSet.has(normalized)) {
        invalid.push({
          gtip: String(rawGtip).trim(),
          sku, urun, materyal
        });
      }
    }

    const totalRows = gtipMasterRows.length;
    const okCount   = checked - invalid.length;

    // Sonuçları göster
    if (invalid.length === 0 && empty.length === 0) {
      showGtipStatus('success',
        `<div class="stat">✓ Tüm GTİP'ler doğru</div>
         <div class="stat">Kontrol edilen: <span>${checked.toLocaleString('tr')} satır</span></div>`);
    } else if (invalid.length === 0 && empty.length > 0) {
      showGtipStatus('success',
        `<div class="stat">✓ Tüm GTİP'ler doğru</div>
         <div class="stat">Kontrol edilen: <span>${checked.toLocaleString('tr')} satır</span></div>
         <div class="stat" style="color:var(--gold);">⚠ ${empty.length} satırda GTİP boş</div>`);
      renderEmptyGtipList(empty);
    } else {
      showGtipStatus('error',
        `<div class="stat">⚠ ${invalid.length} yanlış GTİP bulundu</div>
         <div class="stat">Toplam: <span>${totalRows.toLocaleString('tr')} satır</span> · Doğru: <span>${okCount.toLocaleString('tr')}</span> · Yanlış: <span style="color:var(--error);">${invalid.length}</span>${empty.length ? ' · Boş: <span style="color:var(--gold);">'+empty.length+'</span>' : ''}</div>`);
      renderInvalidGtipList(invalid, empty);
    }

  } catch(err) {
    console.error('runGtipCheck hatası:', err);
    showGtipStatus('error', '<div class="stat">⚠ Kontrol sırasında hata: ' + err.message + '</div>');
  }
}

// ── SADECE BOŞ GTIP LİSTESİ (hata yoksa) ─────────────────────────────────────
function renderEmptyGtipList(empty) {
  const panel = document.getElementById('gtipErrorPanel');
  const list  = document.getElementById('gtipErrorList');
  if (!panel || !list) return;

  if (!empty.length) { panel.style.display = 'none'; return; }

  // GTIP'siz satırlar — ayrı bir grup olarak göster
  let html = `
    <div class="gtip-group">
      <div class="gtip-group-header" onclick="toggleGtipGroup(this)">
        <div class="gtip-group-title">
          <span style="color:var(--gold);">⚠ GTİP Boş</span>
          <span class="gtip-group-count">${empty.length} ürün</span>
        </div>
        <span class="gtip-group-arrow">▼</span>
      </div>
      <div class="gtip-group-body" style="display:none;">
        ${empty.map(e => `
          <div class="gtip-item">
            <div class="gtip-item-sku">${escapeHtml(e.sku)}</div>
            <div class="gtip-item-urun">${escapeHtml(e.urun)}</div>
            ${e.materyal ? `<div class="gtip-item-mat">🧵 ${escapeHtml(e.materyal)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>`;

  list.innerHTML = html;
  panel.style.display = 'block';
}

// ── YANLIŞ GTIP LİSTESİ (gruplandırılmış) ────────────────────────────────────
function renderInvalidGtipList(invalid, empty) {
  const panel = document.getElementById('gtipErrorPanel');
  const list  = document.getElementById('gtipErrorList');
  if (!panel || !list) return;

  // GTIP bazında grupla
  const groups = {};
  for (const item of invalid) {
    const key = item.gtip || '(boş)';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }

  // Adet çok olandan aza sırala
  const sorted = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);

  let html = '';

  // Yanlış GTIP grupları
  for (const [gtip, items] of sorted) {
    html += `
      <div class="gtip-group">
        <div class="gtip-group-header" onclick="toggleGtipGroup(this)">
          <div class="gtip-group-title">
            <span class="gtip-group-code">${escapeHtml(gtip)}</span>
            <span class="gtip-group-count">${items.length} ürün</span>
          </div>
          <span class="gtip-group-arrow">▼</span>
        </div>
        <div class="gtip-group-body" style="display:none;">
          ${items.map(it => `
            <div class="gtip-item">
              <div class="gtip-item-sku">${escapeHtml(it.sku)}</div>
              <div class="gtip-item-urun">${escapeHtml(it.urun)}</div>
              ${it.materyal ? `<div class="gtip-item-mat">🧵 ${escapeHtml(it.materyal)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>`;
  }

  // Boş GTIP grubu (varsa)
  if (empty && empty.length) {
    html += `
      <div class="gtip-group">
        <div class="gtip-group-header" onclick="toggleGtipGroup(this)">
          <div class="gtip-group-title">
            <span style="color:var(--gold);">⚠ GTİP Boş</span>
            <span class="gtip-group-count">${empty.length} ürün</span>
          </div>
          <span class="gtip-group-arrow">▼</span>
        </div>
        <div class="gtip-group-body" style="display:none;">
          ${empty.map(e => `
            <div class="gtip-item">
              <div class="gtip-item-sku">${escapeHtml(e.sku)}</div>
              <div class="gtip-item-urun">${escapeHtml(e.urun)}</div>
              ${e.materyal ? `<div class="gtip-item-mat">🧵 ${escapeHtml(e.materyal)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>`;
  }

  list.innerHTML = html;
  panel.style.display = 'block';
}

// ── GRUP AÇ/KAPA ─────────────────────────────────────────────────────────────
function toggleGtipGroup(headerEl) {
  try {
    const body  = headerEl.nextElementSibling;
    const arrow = headerEl.querySelector('.gtip-group-arrow');
    if (!body) return;
    const open = body.style.display === 'block';
    body.style.display = open ? 'none' : 'block';
    if (arrow) arrow.textContent = open ? '▼' : '▲';
  } catch(err) {
    console.error('toggleGtipGroup hatası:', err);
  }
}

// ── STATUS ─────────────────────────────────────────────────────────────────────
function showGtipStatus(type, html) {
  const box = document.getElementById('gtipResultBox');
  if (!box) return;
  box.className = 'status-box visible ' + type;
  box.innerHTML = html;
}

// ── HTML ESCAPE (XSS güvenliği) ──────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── INIT: DROP ZONE ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  try {
    const dz = document.getElementById('gtipDropZone');
    if (!dz) return;

    dz.addEventListener('dragover', e => {
      e.preventDefault();
      dz.classList.add('dragover');
    });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.classList.remove('dragover');
      if (e.dataTransfer.files[0]) handleGtipFile(e.dataTransfer.files[0]);
    });
  } catch(err) {
    console.error('gtip.js init hatası:', err);
  }
});
