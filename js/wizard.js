// ── WIZARD.JS ─────────────────────────────────────────────────────────────────
// Wizard akış yönetimi, state ve UI kontrolü

// ── STATE ─────────────────────────────────────────────────────────────────────
let currentStep    = 1;
let selectedMod    = null;
let selectedDepo   = null;
let currentCountry = null;
let currentMode    = 'grouped';

let lastFileData     = null;
let lastPdfData      = null;
let originalFileName = '';
let masterRows       = null;
let workingRows      = null;
let processedWB      = null;

let groupWeights  = {};
let exceptionSkus = {};

// ── CONFIG YÜKLE ──────────────────────────────────────────────────────────────
async function loadSharedConfig() {
  try {
    const res = await fetch('./config.json', { cache: 'no-store' });
    if (!res.ok) throw new Error();
    const cfg = await res.json();
    if (cfg.defaultGroupWeights)  groupWeights  = { ...cfg.defaultGroupWeights };
    if (cfg.defaultExceptionSkus) exceptionSkus = { ...cfg.defaultExceptionSkus };
  } catch(e) {
    console.warn('config.json yüklenemedi');
  }
}

// ── WIZARD NAV ────────────────────────────────────────────────────────────────
function goStep(n) {
  if (selectedMod === 'oncesi' && n === 2) {
    setupStepFaturaOncesi();
    showOnlyStep(4);
    updateDots(4);
    currentStep = 4;
    return;
  }
  showOnlyStep(n);
  updateDots(n);
  currentStep = n;
}

function showOnlyStep(n) {
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById('step' + i);
    if (el) el.style.display = (i === n) ? 'block' : 'none';
  }
}

function updateDots(active) {
  for (let i = 1; i <= 5; i++) {
    const dot  = document.getElementById('dot' + i);
    const line = document.getElementById('line' + i);
    if (!dot) continue;
    if (i < active) {
      dot.className = 'step-dot done';
      dot.textContent = '✓';
    } else if (i === active) {
      dot.className = 'step-dot active';
      dot.textContent = i;
    } else {
      dot.className = 'step-dot';
      dot.textContent = i;
    }
    if (line) {
      line.className = i < active ? 'step-line done' : (i === active ? 'step-line active' : 'step-line');
    }
  }
}

function setupStepFaturaOncesi() {
  document.getElementById('step4Title').textContent = 'Master Excel Yükle';
  document.getElementById('step4Desc').textContent  = 'Menşe ayrımı için master dosyayı yükleyin.';
  document.getElementById('pdfDropZone').style.display = 'none';
  document.getElementById('step4Back').onclick = () => goStep(1);
  document.getElementById('step4Next').onclick = () => {
    if (!masterRows) { alert('Önce Excel dosyası yükleyin.'); return; }
    goStep(5);
    initStep5();
  };
}

// ── ADIM 1: MOD SEÇ ───────────────────────────────────────────────────────────
function selectMod(mod) {
  selectedMod = mod;
  document.getElementById('card-taslak').classList.toggle('active', mod === 'taslak');
  document.getElementById('card-oncesi').classList.toggle('active', mod === 'oncesi');
  document.getElementById('card-sonrasi').classList.toggle('active', mod === 'sonrasi');

  if (mod === 'taslak') {
    showOnlyStep(0);
    document.getElementById('stepTaslak').style.display = 'block';
    updateDots(1);
    initTaslakPanel();
    return;
  }
  document.getElementById('step1Next').style.display = 'block';
}

// ── ADIM 2: DEPO SEÇ ──────────────────────────────────────────────────────────
function selectDepo(depo) {
  selectedDepo = depo;
  document.getElementById('mode-serbest').classList.toggle('active', depo === 'serbest');
  document.getElementById('mode-antrepo').classList.toggle('active', depo === 'antrepo');
  document.getElementById('step2Next').style.display = 'block';
}

// ── ADIM 3: ÜLKE SEÇ ──────────────────────────────────────────────────────────
function selectCountry(c) {
  currentCountry = c;

  document.querySelectorAll('.country-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById('country-' + c).classList.add('active');

  // EUR section: Belçika, Kosova, Makedonya
  document.getElementById('eurSection').classList.toggle('visible', ['be','de','nl','xk','mk'].includes(c));
  // Freight/Insurance inputları: sadece Kosova ve Makedonya
  document.getElementById('koFreightSection').style.display = 'none';

  // PDF drop zone: şablonlu backend ülkeleri
  document.getElementById('pdfDropZone').style.display = ['rs','ba','ge','xk','mk','be','de','nl'].includes(c) ? 'block' : 'none';

  document.getElementById('step3Next').style.display = 'block';
}

function setMode(m) {
  currentMode = m;
  document.getElementById('modeGrouped').classList.toggle('active', m === 'grouped');
  document.getElementById('modeRaw').classList.toggle('active', m === 'raw');
}

function onEurRateChanged() {
  if (workingRows && currentCountry === 'be') buildAndDownloadReady();
}

// ── ADIM 4: DOSYA YÜKLE ───────────────────────────────────────────────────────
function initStep4() {
  document.getElementById('step4Title').textContent = 'Dosya Yükle';
  document.getElementById('step4Desc').textContent  = 'Master Excel ve gerekiyorsa PDF yükleyin.';
  document.getElementById('step4Back').onclick = () => goStep(3);
  document.getElementById('step4Next').onclick = () => {
    if (!masterRows) { alert('Önce Excel dosyası yükleyin.'); return; }
    goStep(5);
    initStep5();
  };
}

// ── ADIM 5: KG HESAPLAMA ──────────────────────────────────────────────────────
function initStep5() {
  buildKgTable(masterRows);
  document.getElementById('kgPanel').style.display = 'block';
  document.getElementById('antrepoSection').style.display = 'none';
  document.getElementById('menseBox').classList.remove('visible');
  document.getElementById('downloadBtn').classList.remove('visible');
  if (selectedMod === 'sonrasi') {
    document.getElementById('downloadBtn').style.display = 'none';
  }
}

// ── KG TABLOSU ────────────────────────────────────────────────────────────────
function buildKgTable(rows) {
  const groups = [...new Set(
    rows.map(r => String(r['ÜRÜN ARA GRUBU'])).filter(g => g && g !== '')
  )].sort();

  const tbody = document.getElementById('kgTable');
  while (tbody.rows.length > 1) tbody.deleteRow(1);

  const needsInput = [];
  groups.forEach(g => {
    const zeroCount = rows.filter(r =>
      String(r['ÜRÜN ARA GRUBU']) === g && parseNum(r['Ürün Ağırlığı (KG)']) === 0
    ).length;
    if (zeroCount > 0) needsInput.push({ g, zeroCount });
  });

  document.getElementById('kgBadge').textContent =
    needsInput.length > 0 ? `${needsInput.length} grup eksik` : 'Tümü dolu';

  if (needsInput.length === 0) {
    const tr = tbody.insertRow();
    tr.innerHTML = '<td colspan="3" style="color:var(--success);padding:10px;">✓ Tüm satırlarda kilo değeri dolu.</td>';
  } else {
    document.getElementById('kgBody').style.display = 'block';
    document.getElementById('kgArrow').textContent = '▲';
    needsInput.forEach(({ g, zeroCount }) => {
      const id = 'gw_' + g.replace(/[^a-zA-Z0-9]/g, '_');
      const saved = groupWeights[g] !== undefined ? groupWeights[g] : '';
      const tr = tbody.insertRow();
      tr.innerHTML = `
        <td style="color:var(--text);">${g}</td>
        <td><input class="kg-input" id="${id}" type="text" inputmode="decimal" value="${saved}" placeholder="kg"></td>
        <td style="color:var(--gold);">${zeroCount}</td>`;
    });
  }
}

function toggleKgTable() {
  const b = document.getElementById('kgBody');
  const a = document.getElementById('kgArrow');
  const open = b.style.display === 'block';
  b.style.display = open ? 'none' : 'block';
  a.textContent   = open ? '▼' : '▲';
}

function toggleExSku() {
  const b = document.getElementById('skuBody');
  const a = document.getElementById('skuArrow');
  const open = b.style.display === 'block';
  b.style.display = open ? 'none' : 'block';
  a.textContent   = open ? '▼' : '▲';
}

// ── KİLO UYGULA ───────────────────────────────────────────────────────────────
function applyGroupWeights() {
  if (!masterRows) return;

  const groups = [...new Set(masterRows.map(r => String(r['ÜRÜN ARA GRUBU'])).filter(g => g && g !== ''))];
  groups.forEach(g => {
    const id = 'gw_' + g.replace(/[^a-zA-Z0-9]/g, '_');
    const el = document.getElementById(id);
    if (el && el.value !== '') groupWeights[g] = parseNum(el.value);
  });
  try { localStorage.setItem('gwData', JSON.stringify(groupWeights)); } catch(e) {}

  workingRows = masterRows.map(row => {
    const r = { ...row };
    const sku    = String(r['SKU']).trim();
    const grup   = String(r['ÜRÜN ARA GRUBU']).trim();
    const ag     = parseNum(r['Ürün Ağırlığı (KG)']);
    const miktar = parseNum(r['Miktar']);

    let kg;
    if (sku in exceptionSkus)    { kg = parseNum(exceptionSkus[sku]); }
    else if (ag > 0)              { kg = ag; }
    else                          { kg = parseNum(groupWeights[grup] || 0); }

    r['_kg']      = kg;
    r['_hamBrut'] = kg * miktar;
    r['BRÜT']     = r['_hamBrut'];
    r['NET']      = r['BRÜT'] * 0.9;
    return r;
  });

  const totalBrut = workingRows.reduce((s, r) => s + parseNum(r['BRÜT']), 0);
  document.getElementById('calcTotal').textContent = round2(totalBrut);
  document.getElementById('adjustSection').style.display = 'block';
  showStatus('info', `<div class="stat">Ham BRÜT: <span>${round2(totalBrut)} kg</span> — Hedef kilo girin</div>`);
}

// ── HEDEF BRÜT UYGULA ─────────────────────────────────────────────────────────
function applyWeightAdjust() {
  if (!workingRows) return;
  const target = parseNum(document.getElementById('targetWeight').value);
  if (!target || target <= 0) { alert('Geçerli bir hedef BRÜT kilo girin.'); return; }

  const hamTotal = workingRows.reduce((s, r) => s + parseNum(r['_hamBrut']), 0);
  if (hamTotal <= 0) { alert('Ham BRÜT hesaplanamadı.'); return; }

  const multiplier = target / hamTotal;
  const hedefNet   = Math.round(target * 0.9 * 100) / 100;

  let toplamBrut = 0, toplamNet = 0;
  const n = workingRows.length;
  workingRows = workingRows.map((row, i) => {
    const r = { ...row };
    if (i < n - 1) {
      r['BRÜT'] = Math.round(parseNum(r['_hamBrut']) * multiplier * 100) / 100;
      r['NET']  = Math.round(r['BRÜT'] * 0.9 * 100) / 100;
      toplamBrut += r['BRÜT'];
      toplamNet  += r['NET'];
    } else {
      r['BRÜT'] = Math.round((target - toplamBrut) * 100) / 100;
      r['NET']  = Math.round((hedefNet - toplamNet) * 100) / 100;
    }
    return r;
  });

  const finalBrut = workingRows.reduce((s, r) => s + parseNum(r['BRÜT']), 0);
  const finalNet  = workingRows.reduce((s, r) => s + parseNum(r['NET']),  0);

  const res = document.getElementById('adjustResult');
  res.className = 'adjust-result visible';
  res.innerHTML = `✓ BRÜT: ${round2(finalBrut)} kg &nbsp;|&nbsp; NET: ${round2(finalNet)} kg`;

  if (selectedDepo === 'antrepo') {
    document.getElementById('antrepoSection').style.display = 'block';
  }

  if (selectedMod === 'oncesi') {
    showMenseAyrim();
  } else {
    buildAndDownloadReady();
  }
}

// ── ANTREPO: HEDEF NET ────────────────────────────────────────────────────────
function applyNetAdjust() {
  if (!workingRows) return;
  const targetNet = parseNum(document.getElementById('targetNet').value);
  if (!targetNet || targetNet <= 0) { alert('Geçerli bir NET kilo girin.'); return; }

  const totalBrut = workingRows.reduce((s, r) => s + parseNum(r['BRÜT']), 0);
  if (totalBrut <= 0) { alert('Önce BRÜT hesaplayın.'); return; }

  let toplamNet = 0;
  const n2 = workingRows.length;
  workingRows = workingRows.map((row, i) => {
    const r = { ...row };
    if (i < n2 - 1) {
      r['NET'] = Math.round((parseNum(r['BRÜT']) / totalBrut) * targetNet * 100) / 100;
      toplamNet += r['NET'];
    } else {
      r['NET'] = Math.round((targetNet - toplamNet) * 100) / 100;
    }
    return r;
  });

  const finalNet = workingRows.reduce((s, r) => s + parseNum(r['NET']), 0);
  const res = document.getElementById('netResult');
  res.className = 'adjust-result visible';
  res.innerHTML = `✓ NET: ${round2(finalNet)} kg`;

  buildAndDownloadReady();
}

// ── MENŞE AYRIM ───────────────────────────────────────────────────────────────
function showMenseAyrim() {
  if (!workingRows) return;

  const trRows    = workingRows.filter(r => String(r['MENŞEİ Açıklama']).trim().toUpperCase() === 'TURKIYE');
  const otherRows = workingRows.filter(r => String(r['MENŞEİ Açıklama']).trim().toUpperCase() !== 'TURKIYE');

  const trBrut    = round2(trRows.reduce((s, r)    => s + parseNum(r['BRÜT']), 0));
  const trNet     = round2(trRows.reduce((s, r)    => s + parseNum(r['NET']),  0));
  const otherBrut = round2(otherRows.reduce((s, r) => s + parseNum(r['BRÜT']), 0));
  const otherNet  = round2(otherRows.reduce((s, r) => s + parseNum(r['NET']),  0));

  const fmt = n => n.toLocaleString('tr-TR', { minimumFractionDigits: 2 });

  document.getElementById('menseTrBrut').textContent    = fmt(trBrut)    + ' kg BRÜT';
  document.getElementById('menseTrNet').textContent     = 'NET: ' + fmt(trNet) + ' kg';
  document.getElementById('menseOtherBrut').textContent = fmt(otherBrut) + ' kg BRÜT';
  document.getElementById('menseOtherNet').textContent  = 'NET: ' + fmt(otherNet) + ' kg';

  document.getElementById('menseBox').classList.add('visible');
  document.getElementById('menseTaslakSection').style.display = 'block';

  showStatus('success',
    `<div class="stat">✓ Menşe ayrımı tamamlandı</div>
     <div class="stat">TR: <span>${fmt(trBrut)} kg</span> &nbsp;|&nbsp; Yabancı: <span>${fmt(otherBrut)} kg</span></div>`
  );
}

// ── BUILD OUTPUT ──────────────────────────────────────────────────────────────
function buildAndDownloadReady() {
  if (!workingRows) return;

  // Şablonlu backend ülkeleri — rs, ba, ge, xk, mk
  if (['rs','ba','ge','xk','mk','be','de','nl'].includes(currentCountry)) {
    document.getElementById('downloadBtn').style.display = 'block';
    document.getElementById('downloadBtn').classList.add('visible');
    showStatus('success', '<div class="stat">✓ Hazır — İndir butonuna basın</div>');
    return;
  }

  if (currentCountry === 'be' && !getEurRate()) {
    showStatus('error', '⚠ Euro kuru girin.');
    return;
  }

  buildOutput(workingRows);
}

function getEurRate() {
  const el = document.getElementById('eurRateInput');
  const v  = el ? parseNum(el.value) : 0;
  return (v && v > 0) ? v : null;
}

// ── STATUS ────────────────────────────────────────────────────────────────────
function showStatus(type, html) {
  const sb = document.getElementById('statusBox');
  sb.className = 'status-box visible ' + type;
  sb.innerHTML = html;
}

// ── DOWNLOAD ──────────────────────────────────────────────────────────────────
async function downloadResult() {
  // Şablonlu backend ülkeleri — rs, ba, ge, xk, mk
  if (['rs','ba','ge','xk','mk','be','de','nl'].includes(currentCountry)) { await downloadRS(); return; }

  if (!processedWB) return;
  let suffix = COUNTRIES[currentCountry]?.suffix || ('_' + currentCountry);
  if (currentCountry === 'kz') suffix += (currentMode === 'grouped' ? '_gruplu' : '_tum');
  XLSX.writeFile(processedWB, originalFileName + suffix + '.xlsx');
}

async function downloadRS() {
  if (!workingRows || !lastFileData) {
    showStatus('error', '⚠ Önce kiloları uygulayın.');
    return;
  }
  const btn = document.getElementById('downloadBtn');
  btn.textContent = '⏳ Hazırlanıyor...';
  btn.disabled = true;

  try {
    const excelB64 = arrayBufferToBase64(lastFileData);

    let logoB64 = '';
    try {
      const lr = await fetch('./logo.png');
      if (lr.ok) { const la = await lr.arrayBuffer(); logoB64 = arrayBufferToBase64(la); }
    } catch(e) {}

    let pdfB64 = '';
    if (lastPdfData) pdfB64 = arrayBufferToBase64(lastPdfData);

    const hedefBrut = workingRows.reduce((s, r) => s + (r['BRÜT'] || 0), 0);

    const resp = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        excel:         excelB64,
        logo:          logoB64,
        pdf:           pdfB64,
        ulkeKodu:      currentCountry,
        hedefBrut:     hedefBrut,
        hedefNet:      workingRows.reduce((s,r) => s+(r['NET']||0), 0),
        depoTipi:      selectedDepo,
        grupKilolari:  groupWeights,
        exceptionSkus: exceptionSkus,
        eurKuru:       getEurRate() || 1.0,
        koFreight:     parseNum(document.getElementById('koFreightInput')?.value || '0'),
        koInsurance:   parseNum(document.getElementById('koInsuranceInput')?.value || '0'),
      })
    });

    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');

    const bin   = atob(data.excel);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = originalFileName + '_INV_PL.xlsx'; a.click();
    URL.revokeObjectURL(url);

    if (data.pdfFields) {
      const pf = data.pdfFields;
      const fmt = n => n ? n.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' TRY' : '—';
      document.getElementById('pdfKap').textContent     = pf.kap || '—';
      document.getElementById('pdfNavlun').textContent  = fmt(pf.navlun);
      document.getElementById('pdfSigorta').textContent = fmt(pf.sigorta);
      document.getElementById('pdfInfo').classList.add('visible');
    }

    showStatus('success', `<div class="stat">✓ İndirildi: <span>${data.faturaNo}</span></div>`);

  } catch(err) {
    showStatus('error', '⚠ ' + err.message);
  } finally {
    btn.textContent = '⬇ INV + PL İndir';
    btn.disabled = false;
  }
}

function arrayBufferToBase64(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.byteLength; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadSharedConfig();
  try { const s = localStorage.getItem('exSkus'); if(s) { const l=JSON.parse(s); exceptionSkus={...exceptionSkus,...l}; } } catch(e) {}
  try { const s = localStorage.getItem('gwData');  if(s) { const l=JSON.parse(s); groupWeights={...groupWeights,...l};   } } catch(e) {}

  renderExSkuList();

  const dropZone = document.getElementById('dropZone');
  dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop',      e  => { e.preventDefault(); dropZone.classList.remove('dragover'); if(e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });

  const pdfDropZone = document.getElementById('pdfDropZone');
  pdfDropZone.addEventListener('dragover',  e => { e.preventDefault(); pdfDropZone.classList.add('dragover'); });
  pdfDropZone.addEventListener('dragleave', ()  => pdfDropZone.classList.remove('dragover'));
  pdfDropZone.addEventListener('drop',      e  => { e.preventDefault(); pdfDropZone.classList.remove('dragover'); if(e.dataTransfer.files[0]) handlePdf(e.dataTransfer.files[0]); });

  document.getElementById('step4Next').onclick = () => {
    if (!masterRows) { alert('Önce Excel dosyası yükleyin.'); return; }
    goStep(5);
    initStep5();
  };
});

// ── MENŞE → TASLAK TRİGGER ───────────────────────────────────────────────────
function triggerMenseTaslak() {
  if (!workingRows) { showStatus('error', '⚠ Önce menşe hesaplayın.'); return; }

  const trRows    = workingRows.filter(r => String(r['MENŞEİ Açıklama']).trim().toUpperCase() === 'TURKIYE');
  const otherRows = workingRows.filter(r => String(r['MENŞEİ Açıklama']).trim().toUpperCase() !== 'TURKIYE');

  const trKg      = round2(trRows.reduce((s,r)    => s + parseNum(r['BRÜT']), 0));
  const yabanciKg = round2(otherRows.reduce((s,r) => s + parseNum(r['BRÜT']), 0));
  const brutKg    = round2(workingRows.reduce((s,r) => s + parseNum(r['BRÜT']), 0));
  const netKg     = round2(workingRows.reduce((s,r) => s + parseNum(r['NET']),  0));

  indirMenseTaslak(trKg, yabanciKg, brutKg, netKg);
}