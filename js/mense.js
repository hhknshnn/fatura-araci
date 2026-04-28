// ── MENSE.JS ──────────────────────────────────────────────────────────────────
// Menşe Hesapla modülü — bağımsız, diğer akışları etkilemez.

// ── STATE ─────────────────────────────────────────────────────────────────────
let menseRows       = null;
let menseWorkingRows = null;

// ── PANELİ BAŞLAT ─────────────────────────────────────────────────────────────
function initMensePanel() {
  menseRows        = null;
  menseWorkingRows = null;

  const ids = ['menseFileBadge','mensePdfBadge','menseKgPanel','menseApplyBtn','menseAdjustSection','menseTaslakSection'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  const rb = document.getElementById('menseResultBox');
  if (rb) rb.classList.remove('visible');

  const sb = document.getElementById('menseStatus');
  if (sb) { sb.className = 'status-box'; sb.innerHTML = ''; }

  // Drag-drop
  const dz = document.getElementById('menseDropZone');
  if (dz && !dz._menseInit) {
    dz._menseInit = true;
    dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', ()  => dz.classList.remove('dragover'));
    dz.addEventListener('drop',      e  => {
      e.preventDefault();
      dz.classList.remove('dragover');
      if (e.dataTransfer.files.length) handleMenseMultiFile(e.dataTransfer.files);
    });
  }
}

// ── DOSYA YÜKLEME ─────────────────────────────────────────────────────────────
function handleMenseMultiFile(files) {
  for (const file of files) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'pdf') {
      handleMensePdf(file);
    } else if (ext === 'xlsx' || ext === 'xls') {
      handleMenseExcel(file);
    }
  }
}

function handleMenseExcel(file) {
  if (!file) return;
  const badge = document.getElementById('menseFileBadge');
  badge.textContent = '⏳ Yükleniyor...';
  badge.style.display = 'inline-flex';

  const r = new FileReader();
  r.onload = e => {
    try {
      const wb   = XLSX.read(e.target.result, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      if (!rows.length) throw new Error('Dosya boş');
      menseRows = rows;
      badge.textContent = '✓ ' + rows.length.toLocaleString('tr') + ' satır yüklendi';
      buildMenseKgTable(rows);
      document.getElementById('menseKgPanel').style.display  = 'block';
      document.getElementById('menseApplyBtn').style.display = 'block';
      showMenseStatus('info', '<div class="stat">✓ Dosya yüklendi — grup kilolarını girin ve hesaplayın</div>');
    } catch(err) {
      badge.textContent = '⚠ ' + err.message;
    }
  };
  r.readAsArrayBuffer(file);
}

async function handleMensePdf(file) {
  if (!file) return;
  const badge = document.getElementById('mensePdfBadge');
  badge.textContent = '⏳ PDF okunuyor...';
  badge.style.display = 'inline-flex';

  const buf = await fileToArrayBuffer(file);
  lastPdfData = buf;

  try {
    const b = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < b.byteLength; i++) s += String.fromCharCode(b[i]);
    const resp = await fetch('/api/taslak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'parsePdf', pdf: btoa(s) })
    });
    const data = await resp.json();
    if (data.success && data.pdfFields) {
      const pf  = data.pdfFields;
      const fmt = n => n ? n.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' TRY' : '—';
      badge.textContent = `✓ KAP: ${pf.kap || '—'} · Navlun: ${fmt(pf.navlun)} · Sigorta: ${fmt(pf.sigorta)}`;
      if (pf.brutKg && pf.brutKg > 0) window._pdfBrutKg = pf.brutKg;
      if (pf.netKg  && pf.netKg  > 0) window._pdfNetKg  = pf.netKg;
    } else {
      badge.textContent = '✓ PDF yüklendi';
    }
  } catch(e) {
    badge.textContent = '✓ PDF yüklendi';
    console.warn('Menşe PDF parse hatası:', e);
  }
}

// ── KG TABLOSU ────────────────────────────────────────────────────────────────
function buildMenseKgTable(rows) {
  const groups = [...new Set(
    rows.map(r => String(r['ÜRÜN ARA GRUBU'])).filter(g => g && g !== '')
  )].sort();

  const tbody = document.getElementById('menseKgTable');
  while (tbody.rows.length > 1) tbody.deleteRow(1);

  const needsInput = [];
  groups.forEach(g => {
    const zeroCount = rows.filter(r =>
      String(r['ÜRÜN ARA GRUBU']) === g && parseNum(r['Ürün Ağırlığı (KG)']) === 0
    ).length;
    if (zeroCount > 0) needsInput.push({ g, zeroCount });
  });

  document.getElementById('menseKgBadge').textContent =
    needsInput.length > 0 ? `${needsInput.length} grup eksik` : 'Tümü dolu';

  if (needsInput.length === 0) {
    const tr = tbody.insertRow();
    tr.innerHTML = '<td colspan="3" style="color:var(--success);padding:10px;">✓ Tüm satırlarda kilo değeri dolu.</td>';
  } else {
    document.getElementById('menseKgBody').style.display = 'block';
    document.getElementById('menseKgArrow').textContent  = '▲';
    needsInput.forEach(({ g, zeroCount }) => {
      const id    = 'mgw_' + g.replace(/[^a-zA-Z0-9]/g, '_');
      const saved = groupWeights[g] !== undefined ? groupWeights[g] : '';
      const tr    = tbody.insertRow();
      tr.innerHTML = `
        <td>${g}</td>
        <td><input class="kg-input" id="${id}" type="text" inputmode="decimal" value="${saved}" placeholder="kg"></td>
        <td style="color:var(--gold);">${zeroCount}</td>`;
    });
  }
}

function toggleMenseKgTable() {
  const b = document.getElementById('menseKgBody');
  const a = document.getElementById('menseKgArrow');
  const open = b.style.display === 'block';
  b.style.display = open ? 'none' : 'block';
  a.textContent   = open ? '▼' : '▲';
}

// ── KİLO UYGULA ───────────────────────────────────────────────────────────────
function applyMenseWeights() {
  if (!menseRows) return;

  const groups = [...new Set(menseRows.map(r => String(r['ÜRÜN ARA GRUBU'])).filter(g => g && g !== ''))];
  groups.forEach(g => {
    const id = 'mgw_' + g.replace(/[^a-zA-Z0-9]/g, '_');
    const el = document.getElementById(id);
    if (el && el.value !== '') groupWeights[g] = parseNum(el.value);
  });
  try { localStorage.setItem('gwData', JSON.stringify(groupWeights)); } catch(e) {}

  menseWorkingRows = menseRows.map(row => {
    const r    = { ...row };
    const sku  = String(r['SKU']).trim();
    const grup = String(r['ÜRÜN ARA GRUBU']).trim();
    const ag   = parseNum(r['Ürün Ağırlığı (KG)']);
    const mik  = parseNum(r['Miktar']);
    let kg;
    if (sku in exceptionSkus) { kg = parseNum(exceptionSkus[sku]); }
    else if (ag > 0)           { kg = ag; }
    else                       { kg = parseNum(groupWeights[grup] || 0); }
    r['_kg']      = kg;
    r['_hamBrut'] = kg * mik;
    r['BRÜT']     = r['_hamBrut'];
    r['NET']      = r['BRÜT'] * 0.9;
    return r;
  });

  const total = menseWorkingRows.reduce((s, r) => s + parseNum(r['BRÜT']), 0);
  document.getElementById('menseCalcTotal').textContent = round2(total);
  document.getElementById('menseAdjustSection').style.display = 'block';

  // PDF'ten kilo geldiyse otomatik doldur
  if (window._pdfBrutKg && window._pdfBrutKg > 0) {
    document.getElementById('menseTargetWeight').value = window._pdfBrutKg;
    applyMenseWeightAdjust();
  } else {
    showMenseStatus('info', `<div class="stat">Ham BRÜT: <span>${round2(total)} kg</span> — Hedef kilo girin</div>`);
  }
}

// ── HEDEF BRÜT UYGULA ─────────────────────────────────────────────────────────
function applyMenseWeightAdjust() {
  if (!menseWorkingRows) return;
  const target = parseNum(document.getElementById('menseTargetWeight').value);
  if (!target || target <= 0) { alert('Geçerli bir hedef BRÜT kilo girin.'); return; }

  const hamTotal = menseWorkingRows.reduce((s, r) => s + parseNum(r['_hamBrut']), 0);
  if (hamTotal <= 0) return;

  const mult     = target / hamTotal;
  const hedefNet = Math.round(target * 0.9 * 100) / 100;
  let topBrut = 0, topNet = 0;
  const n = menseWorkingRows.length;

  menseWorkingRows = menseWorkingRows.map((row, i) => {
    const r = { ...row };
    if (i < n - 1) {
      r['BRÜT'] = Math.round(parseNum(r['_hamBrut']) * mult * 100) / 100;
      r['NET']  = Math.round(r['BRÜT'] * 0.9 * 100) / 100;
      topBrut += r['BRÜT'];
      topNet  += r['NET'];
    } else {
      r['BRÜT'] = Math.round((target - topBrut) * 100) / 100;
      r['NET']  = Math.round((hedefNet - topNet) * 100) / 100;
    }
    return r;
  });

  showMenseResult();
}

// ── MENŞE SONUCU ─────────────────────────────────────────────────────────────
function showMenseResult() {
  if (!menseWorkingRows) return;

  const fmt       = n => n.toLocaleString('tr-TR', { minimumFractionDigits: 2 });
  const trRows    = menseWorkingRows.filter(r => String(r['MENŞEİ Açıklama']).trim().toUpperCase() === 'TURKIYE');
  const otherRows = menseWorkingRows.filter(r => String(r['MENŞEİ Açıklama']).trim().toUpperCase() !== 'TURKIYE');

  const trBrut    = round2(trRows.reduce((s, r)    => s + parseNum(r['BRÜT']), 0));
  const trNet     = round2(trRows.reduce((s, r)    => s + parseNum(r['NET']),  0));
  const otherBrut = round2(otherRows.reduce((s, r) => s + parseNum(r['BRÜT']), 0));
  const otherNet  = round2(otherRows.reduce((s, r) => s + parseNum(r['NET']),  0));

  document.getElementById('menseResTrBrut').textContent    = fmt(trBrut)    + ' kg BRÜT';
  document.getElementById('menseResTrNet').textContent     = 'NET: ' + fmt(trNet) + ' kg';
  document.getElementById('menseResOtherBrut').textContent = fmt(otherBrut) + ' kg BRÜT';
  document.getElementById('menseResOtherNet').textContent  = 'NET: ' + fmt(otherNet) + ' kg';

  document.getElementById('menseResultBox').classList.add('visible');
  showMenseStatus('success',
    `<div class="stat">✓ Menşe ayrımı tamamlandı</div>
     <div class="stat">TR: <span>${fmt(trBrut)} kg</span> &nbsp;|&nbsp; Yabancı: <span>${fmt(otherBrut)} kg</span></div>`);

  // wizard.js'in triggerMenseTaslak() fonksiyonu workingRows'u kullanır — senkronize et
  workingRows = menseWorkingRows;

  // menseTaslakSection'ı stepMense paneline taşı (DOM'da bir kez yapılır)
  const taslakSec = document.getElementById('menseTaslakSection');
  const stepMense = document.getElementById('stepMense');
  if (taslakSec && stepMense && taslakSec.parentElement.id !== 'stepMense') {
    stepMense.appendChild(taslakSec);
  }
  if (taslakSec) taslakSec.style.display = 'block';

  // taslak.js'teki buildMenseUlkeGrid fonksiyonunu çağır
  if (typeof buildMenseUlkeGrid === 'function') buildMenseUlkeGrid();
}

// ── STATUS ────────────────────────────────────────────────────────────────────
function showMenseStatus(type, html) {
  const sb = document.getElementById('menseStatus');
  if (!sb) return;
  sb.className = 'status-box visible ' + type;
  sb.innerHTML = html;
}