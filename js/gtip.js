// ── GTIP.JS ───────────────────────────────────────────────────────────────────

let gtipRefSet     = null;
let gtipRefLoading = false;
let gtipRefError   = null;
let gtipMasterRows = null;
let gtipFileName   = '';

function gtipNormalize(val) {
  if (val === null || val === undefined || val === '') return '';
  const s = String(val).trim();
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 48 && c <= 57) out += s[i];
  }
  return out;
}

async function loadGtipRef() {
  if (gtipRefSet) return gtipRefSet;
  if (gtipRefLoading) {
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
    const set  = new Set();
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

function initGtipPanel() {
  try {
    for (let i = 1; i <= 5; i++) {
      const el = document.getElementById('step' + i);
      if (el) el.style.display = 'none';
    }
    const taslakPanel = document.getElementById('stepTaslak');
    if (taslakPanel) taslakPanel.style.display = 'none';

    const panel = document.getElementById('stepGtip');
    if (!panel) { console.error('stepGtip paneli bulunamadı'); return; }
    panel.style.display = 'block';

    gtipMasterRows = null;
    gtipFileName   = '';
    gtipPdfData    = null;
    const pdfBadge = document.getElementById('gtipPdfName');
    if (pdfBadge) { pdfBadge.style.display = 'none'; pdfBadge.textContent = ''; }

    const fileBadge = document.getElementById('gtipFileName');
    if (fileBadge) { fileBadge.style.display = 'none'; fileBadge.textContent = ''; }
    // Panel sıfırlanınca loaded class'ı temizle
    const dzReset = document.getElementById('gtipDropZone');
    if (dzReset) dzReset.classList.remove('loaded');

    const resultBox = document.getElementById('gtipResultBox');
    if (resultBox) { resultBox.className = 'status-box'; resultBox.innerHTML = ''; }

    const errorList = document.getElementById('gtipErrorList');
    if (errorList) errorList.innerHTML = '';

    const errorPanel = document.getElementById('gtipErrorPanel');
    if (errorPanel) errorPanel.style.display = 'none';

    // Referans listeyi arka planda yükle ama UI'ya herhangi bir onay mesajı YAZMA.
    // Sadece hata varsa göster — başarı mesajı dosya yüklenince gelecek.
    loadGtipRef().then(() => {
      // Referans hazır ama dosya henüz yüklenmedi — boş bırak
      // (Önceki sürümde burada "✓ Referans liste hazır" yazıyordu, bu yanıltıcıydı)
    }).catch(err => {
      showGtipStatus('error',
        `<div class="stat">⚠ Referans liste yüklenemedi: ${err.message}</div>
         <div class="stat">GTİP Kontrol şu an kullanılamıyor. Diğer işlemler etkilenmedi.</div>`);
    });

  } catch(err) {
    console.error('initGtipPanel hatası:', err);
  }
}

function exitGtipPanel() {
  try {
    const panel = document.getElementById('stepGtip');
    if (panel) panel.style.display = 'none';
    const step1 = document.getElementById('step1');
    if (step1) step1.style.display = 'block';
    const cards = ['card-taslak', 'card-gtip', 'card-oncesi', 'card-sonrasi'];
    cards.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    });
    const next = document.getElementById('step1Next');
    if (next) next.style.display = 'none';
    if (typeof updateDots === 'function') updateDots(1);
    gtipMasterRows = null;
    gtipFileName   = '';
  } catch(err) {
    console.error('exitGtipPanel hatası:', err);
  }
}

// GTİP için PDF data — menşe taslağına aktarılacak
let gtipPdfData = null;

function handleGtipMultiFile(files) {
  if (!files || !files.length) return;
  let excelFile = null;
  let pdfFile   = null;

  for (const f of files) {
    const ext = f.name.split('.').pop().toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') excelFile = f;
    else if (ext === 'pdf') pdfFile = f;
  }

  // PDF varsa arka planda oku ve sakla
  if (pdfFile) {
    const pdfBadge = document.getElementById('gtipPdfName');
    if (pdfBadge) { pdfBadge.textContent = '✓ ' + pdfFile.name; pdfBadge.style.display = 'inline-flex'; }
    const rPdf = new FileReader();
    rPdf.onload = e => { gtipPdfData = e.target.result; };
    rPdf.readAsArrayBuffer(pdfFile);
  }

  if (!excelFile) {
    showGtipStatus('error', '<div class="stat">⚠ Excel dosyası (.xlsx) seçmediniz</div>');
    return;
  }

  handleGtipFile(excelFile);
}

function handleGtipFile(file) {
  try {
    if (!file) return;
    gtipFileName = file.name;
    const badge = document.getElementById('gtipFileName');
    if (badge) { badge.textContent = '✓ ' + file.name; badge.style.display = 'inline-flex'; }
    const dz = document.getElementById('gtipDropZone');
    if (dz) dz.classList.add('loaded');

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
    r.onerror = () => { showGtipStatus('error', '<div class="stat">⚠ Dosya okunamadı</div>'); };
    r.readAsArrayBuffer(file);
  } catch(err) {
    console.error('handleGtipFile hatası:', err);
    showGtipStatus('error', '<div class="stat">⚠ ' + err.message + '</div>');
  }
}

async function runGtipCheck() {
  try {
    if (!gtipMasterRows || !gtipMasterRows.length) return;
    if (!gtipRefSet) {
      try { await loadGtipRef(); }
      catch(err) {
        showGtipStatus('error', '<div class="stat">⚠ Referans liste yüklenemedi: ' + err.message + '</div>');
        return;
      }
    }

    const errorPanel = document.getElementById('gtipErrorPanel');
    if (errorPanel) errorPanel.style.display = 'none';

    const invalid = [];
    const empty   = [];
    let checked   = 0;

    for (const row of gtipMasterRows) {
      const rawGtip  = row['GTİP'];
      const sku      = String(row['SKU'] || '').trim();
      const urun     = String(
        row['Madde Açıklaması'] || row['Ürün Açıklaması EN'] ||
        row['ALT GRUBU Açıklama'] || row['ALT GRUBU -EN'] || ''
      ).trim();
      const materyal = String(row['MATERYAL -EN'] || row['MATERYAL'] || '').trim();
      const normalized = gtipNormalize(rawGtip);

      if (!normalized) {
        empty.push({ sku, urun, materyal });
        continue;
      }
      checked++;
      if (!gtipRefSet.has(normalized)) {
        invalid.push({ gtip: String(rawGtip).trim(), sku, urun, materyal });
      }
    }

    const totalRows = gtipMasterRows.length;
    const okCount   = checked - invalid.length;

    if (invalid.length === 0 && empty.length === 0) {
      showGtipStatus('success',
        `<div class="stat">✓ Tüm GTİP'ler doğru</div>
         <div class="stat">Kontrol edilen: <span>${checked.toLocaleString('tr')} satır</span></div>`);
    } else if (invalid.length === 0 && empty.length > 0) {
      showGtipStatus('info',
        `<div class="stat">⚠ ${empty.length} satırda GTİP boş</div>
         <div class="stat">Kontrol edilen: <span>${checked.toLocaleString('tr')} satır</span> · Yanlış GTİP yok</div>`);
      renderEmptyGtipList(empty);
    } else {
      showGtipStatus('error',
        `<div class="stat">⚠ ${invalid.length} yanlış GTİP bulundu</div>
         <div class="stat">Toplam: <span>${totalRows.toLocaleString('tr')} satır</span> · Doğru: <span>${okCount.toLocaleString('tr')}</span> · Yanlış: <span style="color:var(--error);">${invalid.length}</span>${empty.length ? ' · Boş: <span style="color:var(--gold);">'+empty.length+'</span>' : ''}</div>`);
      renderInvalidGtipList(invalid, empty);
    }

    // ── Menşe sorusu — GTİP sonucundan bağımsız her zaman göster ────────────
    showMenseSorusu();
  } catch(err) {
    console.error('runGtipCheck hatası:', err);
    showGtipStatus('error', '<div class="stat">⚠ Kontrol sırasında hata: ' + err.message + '</div>');
  }
}

function renderEmptyGtipList(empty) {
  const panel = document.getElementById('gtipErrorPanel');
  const list  = document.getElementById('gtipErrorList');
  if (!panel || !list) return;
  if (!empty.length) { panel.style.display = 'none'; return; }
  list.innerHTML = `
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
          </div>`).join('')}
      </div>
    </div>`;
  panel.style.display = 'block';
}

function renderInvalidGtipList(invalid, empty) {
  const panel = document.getElementById('gtipErrorPanel');
  const list  = document.getElementById('gtipErrorList');
  if (!panel || !list) return;
  const groups = {};
  for (const item of invalid) {
    const key = item.gtip || '(boş)';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  const sorted = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  let html = '';
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
            </div>`).join('')}
        </div>
      </div>`;
  }
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
            </div>`).join('')}
        </div>
      </div>`;
  }
  list.innerHTML = html;
  panel.style.display = 'block';
}

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

function showGtipStatus(type, html) {
  const box = document.getElementById('gtipResultBox');
  if (!box) return;
  box.className = 'status-box visible ' + type;
  box.innerHTML = html;
}

// ── MENŞE SORUSU ─────────────────────────────────────────────────────────────
function showMenseSorusu() {
  // Varsa eskiyi kaldır
  const eskiSoru = document.getElementById('gtip-mense-soru');
  if (eskiSoru) eskiSoru.remove();

  const panel = document.getElementById('stepGtip');
  if (!panel) return;

  const soru = document.createElement('div');
  soru.id = 'gtip-mense-soru';
  soru.style.cssText = `
    margin-top:16px;padding:16px 20px;
    background:var(--surface2);border:0.5px solid var(--border2);
    border-radius:var(--radius-md);
    display:flex;align-items:center;justify-content:space-between;gap:16px;
  `;
  soru.innerHTML = `
    <div>
      <div style="font-size:13px;font-weight:600;color:var(--text);">Menşe ayrımı yapılsın mı?</div>
      <div style="font-size:12px;color:var(--text3);margin-top:2px;">
        TR / Yabancı ayrımı hesaplanır, taslağa aktarılır
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-shrink:0;">
      <button onclick="gtipMenseHayir()"
        style="padding:7px 16px;border-radius:var(--radius-md);border:0.5px solid var(--border2);
               background:transparent;color:var(--text2);font-family:var(--font);
               font-size:12px;font-weight:500;cursor:pointer;">
        Hayır
      </button>
      <button onclick="gtipMenseEvet()"
        style="padding:7px 16px;border-radius:var(--radius-md);border:none;
               background:var(--accent);color:#fff;font-family:var(--font);
               font-size:12px;font-weight:600;cursor:pointer;">
        Evet →
      </button>
    </div>
  `;
  panel.appendChild(soru);
}

function gtipMenseHayir() {
  // Soruyu kaldır, GTİP sonucunda kal
  const soru = document.getElementById('gtip-mense-soru');
  if (soru) soru.remove();
}

function gtipMenseEvet() {
  // Soruyu kaldır, Menşe panelini aç
  const soru = document.getElementById('gtip-mense-soru');
  if (soru) soru.remove();

  // stepMense'yi GTİP panelinin altında göster
  const gtipPanel = document.getElementById('stepGtip');
  const mensePanel = document.getElementById('stepMense');
  if (!gtipPanel || !mensePanel) return;

  // Menşe panelini GTİP'in hemen altına yerleştir
  if (mensePanel.parentNode !== gtipPanel.parentNode) {
    gtipPanel.parentNode.insertBefore(mensePanel, gtipPanel.nextSibling);
  }
  mensePanel.style.display = 'block';

  // Menşe paneline scroll et
  setTimeout(() => {
    mensePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);

  // PDF zaten yüklüyse global'e aktar — mense.js bunu kullanır
  if (gtipPdfData) {
    window._mensePdfDataFromGtip = gtipPdfData;
  }
  // Excel satırları da global'e aktar
  if (gtipMasterRows) {
    window._gtipRowsForMense = gtipMasterRows;
  }

  if (typeof initMensePanel === 'function') initMensePanel();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    const dz = document.getElementById('gtipDropZone');
    if (!dz) return;
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.classList.remove('dragover');
      if (e.dataTransfer.files.length) handleGtipMultiFile(e.dataTransfer.files);
    });
  } catch(err) {
    console.error('gtip.js init hatası:', err);
  }
});