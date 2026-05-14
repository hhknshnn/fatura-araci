// ── WIZARD.JS ─────────────────────────────────────────────────────────────────

// ── STATE ─────────────────────────────────────────────────────────────────────
let currentStep = 1;
let selectedMod = null;
let selectedDepo = null;
let currentCountry = null;
let currentMode = 'grouped';

let lastFileData = null;
let lastPdfData = null;
let originalFileName = '';
let masterRows = null;
let workingRows = null;
let processedWB = null;
let cyExcelFiles = [];
let cyPdfFiles = [];
let cyMasterRows = [];

let groupWeights = {};
let exceptionSkus = {};

// ── CONFIG YÜKLE ──────────────────────────────────────────────────────────────
async function loadSharedConfig() {
  try {
    const res = await fetch('./config.json', { cache: 'no-store' });
    if (!res.ok) throw new Error();
    const cfg = await res.json();
    if (cfg.defaultGroupWeights) groupWeights = { ...cfg.defaultGroupWeights };
    if (cfg.defaultExceptionSkus) exceptionSkus = { ...cfg.defaultExceptionSkus };
  } catch (e) {
    console.warn('config.json yüklenemedi');
  }
}

// ── WIZARD NAV ────────────────────────────────────────────────────────────────
// Eski: step sayıları 1-5 arası, step1=depo, step2=ülke+dosya, step5=kg
// Yeni: goStep(1)=ülke+dosya (step2 paneli), goStep(2)=kg (step3 paneli)
function goStep(n) {
  // oncesi modu: geri butonu step2'ye döner
  if (selectedMod === 'oncesi' && n === 1) {
    setupStepFaturaOncesi();
    showOnlyStep(1);
    updateDots(1);
    currentStep = 1;
    return;
  }
  showOnlyStep(n);
  updateDots(n);
  currentStep = n;
  if (n === 1) initStep4(); // ülke+dosya paneli açılırken kur alanını güncelle
  if (n === 2) initStep5(); // kg paneli açılırken tabloyu kur
}

function showOnlyStep(n) {
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById('step' + i);
    if (el) el.style.display = (i === n) ? 'block' : 'none';
  }
}

function updateDots(active) {
  for (let i = 1; i <= 5; i++) {
    const dot = document.getElementById('dot' + i);
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

// Eski: step4Next'e bakıyordu
// Yeni: step2Next'e bakıyor
function setupStepFaturaOncesi() {
  const nextBtn = document.getElementById('step2Next');
  if (nextBtn) {
    nextBtn.style.display = masterRows ? 'block' : 'none';
    nextBtn.onclick = () => { goStep(2); };
  }
}
// ── ADIM 1: MOD SEÇ ───────────────────────────────────────────────────────────
// step1Next butonu artık yok, selectMod sonrasi için ekstra iş yapmıyor
function selectMod(mod) {
  selectedMod = mod;
  ['card-taslak', 'card-oncesi', 'card-sonrasi', 'card-gtip', 'card-evrak'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', id === 'card-' + mod);
  });

  if (mod === 'taslak') {
    showOnlyStep(0);
    const p = document.getElementById('stepTaslak');
    if (p) p.style.display = 'block';
    updateDots(1);
    if (typeof initTaslakPanel === 'function') initTaslakPanel();
    return;
  }
  if (mod === 'gtip') {
    showOnlyStep(0);
    if (typeof initGtipPanel === 'function') initGtipPanel();
    updateDots(1);
    return;
  }
  if (mod === 'evrak') {
    showOnlyStep(0);
    if (typeof initEvrakPanel === 'function') initEvrakPanel();
    updateDots(1);
    return;
  }
  // sonrasi modu — step2 shell.js tarafından zaten açıldı, burada iş yok
}
// ── ADIM 2: DEPO SEÇ ──────────────────────────────────────────────────────────
// Eski: depo seçince step1Next butonunu gösteriyordu
// Yeni: sadece state set eder, buton mantığı yok (step2Next dosya+ülkeye bağlı)
function selectDepo(depo) {
  selectedDepo = depo;
  document.getElementById('mode-serbest').classList.toggle('active', depo === 'serbest');
  document.getElementById('mode-antrepo').classList.toggle('active', depo === 'antrepo');
  if (typeof updateTopbarBadges === 'function') updateTopbarBadges();
}
// ── ADIM 3: ÜLKE SEÇ ──────────────────────────────────────────────────────────
function selectCountry(c) {
  currentCountry = c;

  document.querySelectorAll('.country-btn, .country-row').forEach(btn => btn.classList.remove('active'));
  const el = document.getElementById('country-' + c);
  if (el) el.classList.add('active');

  // USD kur satırlarını gizle
  const usdRateRow = document.getElementById('usdRateRow');
  const usdLabel = document.getElementById('usdLabel');
  if (usdRateRow) usdRateRow.style.display = 'none';
  if (usdLabel) usdLabel.style.display = 'none';

  // EUR kur satırlarını varsayılan göster
  const eurInputRow = document.getElementById('eurRateInput')?.parentElement;
  const eurLabel = document.getElementById('eurLabel');
  if (eurInputRow) eurInputRow.style.display = 'flex';
  if (eurLabel) eurLabel.style.display = 'block';

  // Kur ekranını gizle — adım 4'te gerekirse açılacak
  const eurSection = document.getElementById('eurSection');
  if (eurSection) {
    eurSection.classList.remove('visible');
    eurSection.style.display = 'none';
  }

  document.getElementById('koFreightSection').style.display = 'none';
  document.getElementById('kzModeSection').style.display = 'none';

  // ── DROPZONE: Ülke seçilince göster ──────────────────────────────────────
  const backendUlkeler = ['rs', 'ba', 'ge', 'xk', 'mk', 'be', 'de', 'nl', 'kz', 'ru', 'uz', 'iq', 'ly', 'lr', 'lb'];
  const dropZone = document.getElementById('dropZone');
  if (dropZone) dropZone.style.display = 'block';

  // Kıbrıs özel: çoklu dosya modunda da dropZone görünür
  // pdfDropZone eski uyumluluk için gizli kalır — asıl dropZone her şeyi alır
  const pdfDZ = document.getElementById('pdfDropZone');
  if (pdfDZ) pdfDZ.style.display = 'none';

  const step2Next = document.getElementById('step2Next');
  // Devam butonu dosya yüklenince processor.js'in loadFile() tarafından açılır
  // Kıbrıs'ta cyExcelFiles yüklüyse hemen göster
  if (c === 'cy' && step2Next) {
    step2Next.style.display = cyExcelFiles.length > 0 ? 'block' : 'none';
  }
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
  const nextBtn = document.getElementById('step4Next');
  if (nextBtn) {
    nextBtn.style.display = masterRows ? 'block' : 'none';
    nextBtn.onclick = () => { goStep4Next(); };
  }
  updateEurSectionStep4();
}

function updateEurSectionStep4() {
  const eurSection = document.getElementById('eurSection');
  if (!eurSection) return;

  const cfg = window.COUNTRIES_CACHE?.[currentCountry];

  if (!cfg || cfg.invKurKaynagi !== 'pdf_eur') {
    eurSection.classList.remove('visible');
    eurSection.style.display = 'none';
    return;
  }

  // Her zaman göster
  eurSection.classList.add('visible');
  eurSection.style.display = '';

  // PDF'ten kur geldiyse doldur
  const el = document.getElementById('eurRateInput');
  if (el && window._pdfKur && window._pdfKur > 0) {
    if (!el.value || parseNum(el.value) <= 0) {
      el.value = String(window._pdfKur).replace('.', ',');
    }
  }
}

function goStep4Next() {
  const isEurUlke = ['be', 'de', 'nl', 'xk', 'mk'].includes(currentCountry);
  if (isEurUlke) {
    if (!lastPdfData) { alert('⚠ Fatura PDF yükleyin.'); return; }
    const kur = getEurRate();
    if (!kur || kur <= 0) {
      const eurSection = document.getElementById('eurSection');
      if (eurSection) { eurSection.classList.add('visible'); eurSection.style.display = ''; }
      alert('⚠ Kur bilgisi giriniz!');
      return;
    }
  }
  goStep(5);
}

// ── ADIM 5: KG HESAPLAMA ──────────────────────────────────────────────────────
function initStep5() {
  if (currentCountry === 'cy') { initStep5CY(); return; }
  buildKgTable(masterRows);
  document.getElementById('kgPanel').style.display = 'block';
  document.getElementById('antrepoSection').style.display = 'none';
  document.getElementById('menseBox').classList.remove('visible');
  document.getElementById('downloadBtn').classList.remove('visible');
  if (selectedMod === 'sonrasi') {
    document.getElementById('downloadBtn').style.display = 'none';
  }
}

async function initStep5CY() {
  if (cyExcelFiles.length === 0) { showStatus('error', '⚠ Önce Excel dosyası seçin.'); return; }
  cyMasterRows = [];
  for (const file of cyExcelFiles) {
    const buf = await fileToArrayBuffer(file);
    const wb = XLSX.read(buf, { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    cyMasterRows = cyMasterRows.concat(rows);
  }
  buildKgTable(cyMasterRows);
  document.getElementById('kgPanel').style.display = 'block';
  document.getElementById('skuPanel').style.display = 'block';
  document.getElementById('antrepoSection').style.display = 'none';
  document.getElementById('menseBox').classList.remove('visible');
  document.getElementById('menseTaslakSection').style.display = 'none';
  document.getElementById('downloadBtn').style.display = 'none';
  document.getElementById('downloadBtn').classList.remove('visible');
  showStatus('info', `<div class="stat">⏳ ${cyExcelFiles.length} Excel yüklendi — grup kilolarını girin</div>`);
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
  a.textContent = open ? '▼' : '▲';
}

function toggleExSku() {
  const b = document.getElementById('skuBody');
  const a = document.getElementById('skuArrow');
  const open = b.style.display === 'block';
  b.style.display = open ? 'none' : 'block';
  a.textContent = open ? '▼' : '▲';
}

// ── KİLO UYGULA ───────────────────────────────────────────────────────────────
function applyGroupWeights() {
  const rows = currentCountry === 'cy' ? cyMasterRows : masterRows;
  if (!rows) return;
  const groups = [...new Set(rows.map(r => String(r['ÜRÜN ARA GRUBU'])).filter(g => g && g !== ''))];
  groups.forEach(g => {
    const id = 'gw_' + g.replace(/[^a-zA-Z0-9]/g, '_');
    const el = document.getElementById(id);
    if (el && el.value !== '') groupWeights[g] = parseNum(el.value);
  });
  try { localStorage.setItem('gwData', JSON.stringify(groupWeights)); } catch (e) { }

  workingRows = rows.map(row => {
    const r = { ...row };
    const sku = String(r['SKU']).trim();
    const grup = String(r['ÜRÜN ARA GRUBU']).trim();
    const ag = parseNum(r['Ürün Ağırlığı (KG)']);
    const miktar = parseNum(r['Miktar']);
    let kg;
    if (sku in exceptionSkus) { kg = parseNum(exceptionSkus[sku]); }
    else if (ag > 0) { kg = ag; }
    else { kg = parseNum(groupWeights[grup] || 0); }
    r['_kg'] = kg;
    r['_hamBrut'] = kg * miktar;
    r['BRÜT'] = r['_hamBrut'];
    r['NET'] = r['BRÜT'] * 0.9;
    return r;
  });

  const totalBrut = workingRows.reduce((s, r) => s + parseNum(r['BRÜT']), 0);
  document.getElementById('calcTotal').textContent = round2(totalBrut);
  document.getElementById('adjustSection').style.display = 'block';

  if (window._pdfBrutKg && window._pdfBrutKg > 0) {
    const brutEl = document.getElementById('targetWeight');
    if (brutEl) brutEl.value = window._pdfBrutKg;
    applyWeightAdjust();
    if (selectedDepo === 'antrepo' && window._pdfNetKg && window._pdfNetKg > 0) {
      const netEl = document.getElementById('targetNet');
      if (netEl) netEl.value = window._pdfNetKg;
      applyNetAdjust();
    }
  } else {
    if (currentCountry === 'cy') {
      document.getElementById('adjustSection').style.display = 'none';
      document.getElementById('downloadBtn').style.display = 'block';
      document.getElementById('downloadBtn').classList.add('visible');
      showStatus('success', '<div class="stat">✓ Kilolar hesaplandı — İndir butonuna basın</div><div class="stat">BRÜT/NET her PDF\'den otomatik okunacak</div>');
      return;
    }
    showStatus('info', `<div class="stat">Ham BRÜT: <span>${round2(totalBrut)} kg</span> — Hedef kilo girin</div>`);
  }
}

// ── HEDEF BRÜT UYGULA ─────────────────────────────────────────────────────────
function applyWeightAdjust() {
  if (!workingRows) return;
  const target = parseNum(document.getElementById('targetWeight').value);
  if (!target || target <= 0) { alert('Geçerli bir hedef BRÜT kilo girin.'); return; }

  const hamTotal = workingRows.reduce((s, r) => s + parseNum(r['_hamBrut']), 0);
  if (hamTotal <= 0) { alert('Ham BRÜT hesaplanamadı.'); return; }

  const multiplier = target / hamTotal;
  const hedefNet = Math.round(target * 0.9 * 100) / 100;
  let toplamBrut = 0, toplamNet = 0;
  const n = workingRows.length;

  workingRows = workingRows.map((row, i) => {
    const r = { ...row };
    if (i < n - 1) {
      r['BRÜT'] = Math.round(parseNum(r['_hamBrut']) * multiplier * 100) / 100;
      r['NET'] = Math.round(r['BRÜT'] * 0.9 * 100) / 100;
      toplamBrut += r['BRÜT'];
      toplamNet += r['NET'];
    } else {
      r['BRÜT'] = Math.round((target - toplamBrut) * 100) / 100;
      r['NET'] = Math.round((hedefNet - toplamNet) * 100) / 100;
    }
    return r;
  });

  const finalBrut = workingRows.reduce((s, r) => s + parseNum(r['BRÜT']), 0);
  const finalNet = workingRows.reduce((s, r) => s + parseNum(r['NET']), 0);

  const res = document.getElementById('adjustResult');
  res.className = 'adjust-result visible';
  if (selectedDepo === 'antrepo') {
    res.innerHTML = `✓ BRÜT: ${round2(finalBrut)} kg &nbsp;|&nbsp; NET: Hedef NET girin`;
    document.getElementById('antrepoSection').style.display = 'block';
  } else {
    res.innerHTML = `✓ BRÜT: ${round2(finalBrut)} kg &nbsp;|&nbsp; NET: ${round2(finalNet)} kg`;
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
  const finalBrut = workingRows.reduce((s, r) => s + parseNum(r['BRÜT']), 0);
  const res = document.getElementById('netResult');
  res.className = 'adjust-result visible';
  res.innerHTML = `✓ BRÜT: ${round2(finalBrut)} kg &nbsp;|&nbsp; NET: ${round2(finalNet)} kg`;
  buildAndDownloadReady();
}

// ── MENŞE AYRIM ───────────────────────────────────────────────────────────────
function showMenseAyrim() {
  if (!workingRows) return;
  const trRows = workingRows.filter(r => String(r['MENŞEİ Açıklama']).trim().toUpperCase() === 'TURKIYE');
  const otherRows = workingRows.filter(r => String(r['MENŞEİ Açıklama']).trim().toUpperCase() !== 'TURKIYE');
  const trBrut = round2(trRows.reduce((s, r) => s + parseNum(r['BRÜT']), 0));
  const trNet = round2(trRows.reduce((s, r) => s + parseNum(r['NET']), 0));
  const otherBrut = round2(otherRows.reduce((s, r) => s + parseNum(r['BRÜT']), 0));
  const otherNet = round2(otherRows.reduce((s, r) => s + parseNum(r['NET']), 0));
  const fmt = n => n.toLocaleString('tr-TR', { minimumFractionDigits: 2 });
  document.getElementById('menseTrBrut').textContent = fmt(trBrut) + ' kg BRÜT';
  document.getElementById('menseTrNet').textContent = 'NET: ' + fmt(trNet) + ' kg';
  document.getElementById('menseOtherBrut').textContent = fmt(otherBrut) + ' kg BRÜT';
  document.getElementById('menseOtherNet').textContent = 'NET: ' + fmt(otherNet) + ' kg';
  document.getElementById('menseBox').classList.add('visible');
  document.getElementById('menseTaslakSection').style.display = 'block';
  showStatus('success',
    `<div class="stat">✓ Menşe ayrımı tamamlandı</div>
     <div class="stat">TR: <span>${fmt(trBrut)} kg</span> &nbsp;|&nbsp; Yabancı: <span>${fmt(otherBrut)} kg</span></div>`);
}

// ── BUILD OUTPUT ──────────────────────────────────────────────────────────────
function buildAndDownloadReady() {
  if (!workingRows) return;
  const backendUlkeler = ['rs', 'ba', 'ge', 'xk', 'mk', 'be', 'de', 'nl', 'kz', 'ru', 'uz', 'iq', 'ly', 'lr', 'lb'];
  if (backendUlkeler.includes(currentCountry)) {
    document.getElementById('downloadBtn').style.display = 'block';
    document.getElementById('downloadBtn').classList.add('visible');
    showStatus('success', '<div class="stat">✓ Hazır — İndir butonuna basın</div>');
    return;
  }
  buildOutput(workingRows);
}

function getEurRate() {
  const el = document.getElementById('eurRateInput');
  const v = el ? parseNum(el.value) : 0;
  return (v && v > 0) ? v : null;
}

function getUsdRate() {
  const el = document.getElementById('usdRateInput');
  const v = el ? parseNum(el.value) : 0;
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
  const backendUlkeler = ['rs', 'ba', 'ge', 'xk', 'mk', 'be', 'de', 'nl', 'kz', 'ru', 'uz', 'iq', 'ly', 'lr', 'lb', 'cy'];
  if (backendUlkeler.includes(currentCountry)) { await downloadRS(); return; }
  if (!processedWB) return;
  const suffix = COUNTRIES[currentCountry]?.suffix || ('_' + currentCountry);
  XLSX.writeFile(processedWB, originalFileName + suffix + '.xlsx');
}

async function downloadRS() {
  if (currentCountry === 'cy') { await downloadCY(); return; }
  if (!workingRows || !lastFileData) { showStatus('error', '⚠ Önce kiloları uygulayın.'); return; }

  const btn = document.getElementById('downloadBtn');
  btn.textContent = '⏳ Hazırlanıyor... (0s)';
  btn.disabled = true;
  let elapsed = 0;
  const timer = setInterval(() => { elapsed++; btn.textContent = `⏳ Hazırlanıyor... (${elapsed}s)`; }, 1000);

  try {
    const excelB64 = arrayBufferToBase64(lastFileData);
    let logoB64 = '';
    try {
      const lr = await fetch('./logo.png');
      if (lr.ok) { const la = await lr.arrayBuffer(); logoB64 = arrayBufferToBase64(la); }
    } catch (e) { }
    let pdfB64 = '';
    if (lastPdfData) pdfB64 = arrayBufferToBase64(lastPdfData);

    const hedefBrut = workingRows.reduce((s, r) => s + (r['BRÜT'] || 0), 0);

    const resp = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        excel: excelB64,
        logo: logoB64,
        pdf: pdfB64,
        ulkeKodu: currentCountry,
        hedefBrut,
        hedefNet: workingRows.reduce((s, r) => s + (r['NET'] || 0), 0),
        depoTipi: selectedDepo,
        grupKilolari: groupWeights,
        exceptionSkus,
        eurKuru: getEurRate() || 1.0,
        usdKuru: getUsdRate() || 1.0,
        koFreight: parseNum(document.getElementById('koFreightInput')?.value || '0'),
        koInsurance: parseNum(document.getElementById('koInsuranceInput')?.value || '0'),
      })
    });

    const data = await resp.json();
    console.log('RS pdfFields:', data.pdfFields, 'kur:', data.pdfFields?.kur);
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');

    // INV+PL
    _downloadBlob(data.excel, `INV-PL- ${data.faturaNo} - ${selectedDepo === 'antrepo' ? 'Bonded Warehouse' : 'Warehouse'}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    // Master
    if (data.master) _downloadBlob(data.master, `${data.faturaNo}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    // Price List (KZ)
    if (data.priceList) _downloadBlob(data.priceList, `Price List - ${data.faturaNo}.pdf`, 'application/pdf');

    // Mill Test (BE)
    if (data.millTest) _downloadBlob(data.millTest, `MILL TEST - ${data.faturaNo}.pdf`, 'application/pdf');

    if (data.pdfFields) {
      const pf = data.pdfFields;
      const fmt = n => n ? n.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' TRY' : '—';
      document.getElementById('pdfKap').textContent = pf.kap || '—';
      document.getElementById('pdfNavlun').textContent = fmt(pf.navlun);
      document.getElementById('pdfSigorta').textContent = fmt(pf.sigorta);
      document.getElementById('pdfInfo').classList.add('visible');
    }

    // ── STORAGE'A KAYDET (arka planda, hata olsa indirme etkilenmez) ──────────────
    try {
      await fetch('/api/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ulke: currentCountry,
          user: window.currentUser?.displayName || window.currentUser?.username || '',
          faturaNo: data.faturaNo,
          dosyaTuru: 'inv_pl',
          excel: data.excel,
          pdf: pdfB64 || '',
          master: data.master || '',
          priceList: data.priceList || '',
          millTest: data.millTest || '',
        })
      });
    } catch (e) {
      console.warn('Storage kayıt hatası:', e);
    }

    // ── SEVKİYAT TABLOSUNA OTOMATIK KAYDET ───────────────────────────────────
    try {
      // Güncel kur bilgisini çek
      const kurResp = await fetch('/api/kur');
      const kurData = await kurResp.json();
      const kurlar = kurData.kurlar || {};

      // Ülkeye göre EUR dönüşümü
      const EUR_ULKELER = ['be', 'de', 'nl', 'xk', 'mk'];
      const USD_ULKELER = ['iq', 'ly', 'lr', 'lb', 'uz'];
      const TRY_ULKELER = ['rs', 'ba', 'ge', 'kz', 'ru', 'cy'];

      let fatura_bedeli_eur = 0;
      let mal_bedeli_eur = 0;
      let navlun_eur = 0;
      let sigorta_eur = 0;
      let eur_kuru = 0;

      // Fatura tutarını hesapla
      const pdfKur = data.pdfFields?.kur || 0; // PDF'ten gelen TRY/EUR kur
      // Config'e göre kur kaynağını belirle
      const countryCfg = window.COUNTRIES_CACHE?.[currentCountry] || {};
      const sevkiyatKurKaynagi = countryCfg.sevkiyatKurKaynagi || 'api_eur';

      if (EUR_ULKELER.includes(currentCountry)) {
        // EUR kuru — önce PDF'ten, sonra API'den al
        eur_kuru = pdfKur > 0 ? pdfKur : (kurlar.TRY || 0);
        const mal_toplam_eur = workingRows.reduce((s, r) => s + (parseNum(r['Fiyat'] || 0) / eur_kuru * parseNum(r['Miktar'] || 0)), 0);
        navlun_eur = parseFloat(data.pdfFields?.navlun || 0) / eur_kuru;
        sigorta_eur = parseFloat(data.pdfFields?.sigorta || 0) / eur_kuru;
        fatura_bedeli_eur = mal_toplam_eur + navlun_eur + sigorta_eur;
        mal_bedeli_eur = mal_toplam_eur;
      } else if (USD_ULKELER.includes(currentCountry)) {
        // USD → EUR
        eur_kuru = kurlar.TRY || 0;
        const usdRate = kurlar.USD || 1;
        fatura_bedeli_eur = workingRows.reduce((s, r) => s + parseNum(r['Fiyat'] || 0) * parseNum(r['Miktar'] || 0), 0) / usdRate;
        navlun_eur = 0;
        sigorta_eur = 0;
      } else {
        // TRY bazlı ülkeler
        if (sevkiyatKurKaynagi === 'pdf_eur' && pdfKur > 0) {
          eur_kuru = pdfKur;
        } else {
          eur_kuru = kurlar.TRY || 0;
        }

        if (eur_kuru > 0) {
          const mal_toplam = workingRows.reduce((s, r) =>
            s + (parseNum(r['Fiyat'] || 0) * parseNum(r['Miktar'] || 0)), 0);
          mal_bedeli_eur = mal_toplam / eur_kuru;
          navlun_eur = parseFloat(data.pdfFields?.navlun || 0) / eur_kuru;
          sigorta_eur = parseFloat(data.pdfFields?.sigorta || 0) / eur_kuru;
          fatura_bedeli_eur = mal_bedeli_eur + navlun_eur + sigorta_eur;
        }
      }

      // Ülke adını DB formatına çevir
      const ULKE_MAP = {
        rs: 'SIRBİSTAN', ba: 'BOSNA', ge: 'GÜRCİSTAN', xk: 'KOSOVA',
        mk: 'MAKEDONYA', be: 'BELÇİKA', de: 'ALMANYA', nl: 'HOLLANDA',
        kz: 'KAZAKİSTAN', ru: 'RUSYA', uz: 'ÖZBEKİSTAN', cy: 'KIBRIS',
        iq: 'IRAK', ly: 'LİBYA', lr: 'LİBERYA', lb: 'LÜBNAN',
      };

      const dosyaNoEl = document.getElementById('ihracatDosyaNo');
      const ihracatDosyaNo = dosyaNoEl?.value?.trim() ? '2026-' + dosyaNoEl.value.trim() : '';
      const sevkRes = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('fa_auth_token')}` },
        body: JSON.stringify({
          ihracat_dosya_no: ihracatDosyaNo,
          fatura_no: data.faturaNo,
          ulke: ULKE_MAP[currentCountry] || currentCountry.toUpperCase(),
          durum: 'YOLDA',
          fatura_bedeli_eur: Math.round(fatura_bedeli_eur * 100) / 100,
          navlun_eur: Math.round(navlun_eur * 100) / 100,
          sigorta_eur: Math.round(sigorta_eur * 100) / 100,
          eur_kuru: Math.round(eur_kuru * 10000) / 10000,
        })
      });
      const sevkData = await sevkRes.json();
      if (!sevkData.success) {
        if (sevkData.error?.includes('zaten kay')) {
          // Fatura no duplicate — popup göster
          showDuplicateWarning(data.faturaNo, 'fatura');
        } else {
          console.warn('Sevkiyat kayıt hatası:', sevkData.error);
        }
      }
    } catch (e) {
      console.warn('Sevkiyat otomatik kayıt hatası:', e);
    }

    showStatus('success', `<div class="stat">✓ İndirildi: <span>${data.faturaNo}</span></div>`);

  } catch (err) {
    showStatus('error', '⚠ ' + err.message);
  } finally {
    clearInterval(timer);
    btn.textContent = `⬇ INV + PL İndir (${elapsed}s)`;
    btn.disabled = false;
  }
}

function _downloadBlob(b64, fileName, mimeType) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  URL.revokeObjectURL(url);
}

async function downloadCY() {
  if (cyExcelFiles.length === 0) { showStatus('error', '⚠ En az 1 Excel dosyası seçin.'); return; }
  const btn = document.getElementById('downloadBtn');
  btn.textContent = '⏳ Hazırlanıyor...';
  btn.disabled = true;
  try {
    const faturalar = [];
    for (const excelFile of cyExcelFiles) {
      const excelBuf = await fileToArrayBuffer(excelFile);
      const excelB64 = arrayBufferToBase64(excelBuf);
      const wb = XLSX.read(excelBuf, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      const faturaNo = String(rows[0]?.['E-Fatura Seri Numarası'] || '').trim();
      let pdfB64 = '';
      for (const pdfFile of cyPdfFiles) {
        if (pdfFile.name.includes(faturaNo)) {
          pdfB64 = arrayBufferToBase64(await fileToArrayBuffer(pdfFile));
          break;
        }
      }
      faturalar.push({ excel: excelB64, pdf: pdfB64, faturaNo });
    }
    faturalar.sort((a, b) => a.faturaNo.localeCompare(b.faturaNo));
    showStatus('info', `<div class="stat">⏳ ${faturalar.length} fatura gönderiliyor...</div>`);
    const resp = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ulkeKodu: 'cy', faturalar, grupKilolari: groupWeights, exceptionSkus })
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');
    _downloadBlob(data.excel, `PL_Kibris_${faturalar.map(f => f.faturaNo).join('_')}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    showStatus('success', `<div class="stat">✓ İndirildi: ${faturalar.length} fatura</div>`);
  } catch (err) {
    showStatus('error', '⚠ ' + err.message);
  } finally {
    btn.textContent = '⬇ PL İndir';
    btn.disabled = false;
  }
}

function arrayBufferToBase64(buf) {
  const b = new Uint8Array(buf);
  const chunkSize = 8192;
  let s = '';
  for (let i = 0; i < b.byteLength; i += chunkSize) {
    s += String.fromCharCode(...b.subarray(i, i + chunkSize));
  }
  return btoa(s);
}

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadSharedConfig();
  try { const s = localStorage.getItem('exSkus'); if (s) { const l = JSON.parse(s); exceptionSkus = { ...exceptionSkus, ...l }; } } catch (e) { }
  try { const s = localStorage.getItem('gwData'); if (s) { const l = JSON.parse(s); groupWeights = { ...groupWeights, ...l }; } } catch (e) { }
  renderExSkuList();

  // dropZone drag-drop
  const dropZone = document.getElementById('dropZone');
  if (dropZone) {
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length) handleMultiFile(e.dataTransfer.files);
    });
  }
  // Sayfa açılışında geçmiş kayıt sayısını kontrol et
  if (typeof checkGecmisCount === 'function') checkGecmisCount();
});

// ── MENŞE → TASLAK TRİGGER ───────────────────────────────────────────────────
function triggerMenseTaslak() {
  if (!workingRows) { showStatus('error', '⚠ Önce menşe hesaplayın.'); return; }
  const trRows = workingRows.filter(r => String(r['MENŞEİ Açıklama']).trim().toUpperCase() === 'TURKIYE');
  const otherRows = workingRows.filter(r => String(r['MENŞEİ Açıklama']).trim().toUpperCase() !== 'TURKIYE');
  const trKg = round2(trRows.reduce((s, r) => s + parseNum(r['BRÜT']), 0));
  const yabanciKg = round2(otherRows.reduce((s, r) => s + parseNum(r['BRÜT']), 0));
  const brutKg = round2(workingRows.reduce((s, r) => s + parseNum(r['BRÜT']), 0));
  const netKg = round2(workingRows.reduce((s, r) => s + parseNum(r['NET']), 0));
  indirMenseTaslak(trKg, yabanciKg, brutKg, netKg);
}

function fileToArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.onerror = () => reject(new Error('Dosya okunamadı'));
    r.readAsArrayBuffer(file);
  });
}

async function checkDosyaNoAndProceed() {
  const dosyaNoEl = document.getElementById('ihracatDosyaNo');
  const dosyaNo = dosyaNoEl?.value?.trim();

  try {
    const token = sessionStorage.getItem('fa_auth_token');
    const res = await fetch('/api/shipments', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      // Dosya no kontrolü
      if (dosyaNo) {
        const tamDosyaNo = '2026-' + dosyaNo;
        const dupDosya = data.shipments.find(s => s.ihracat_dosya_no === tamDosyaNo);
        if (dupDosya) {
          showDuplicateWarning(tamDosyaNo, 'dosya');
          return;
        }
      }
    }
  } catch (e) {
    console.warn('Duplicate kontrol hatası:', e);
  }

  goStep(2);
}

function showDuplicateWarning(no, tip = 'dosya') {
  const existing = document.getElementById('duplicate-popup');
  if (existing) existing.remove();

  const baslik = tip === 'fatura' ? 'Fatura No Zaten Mevcut' : 'Dosya No Zaten Mevcut';
  const aciklama = tip === 'fatura'
    ? `<b>${no}</b> numaralı fatura Sevkiyatlar'da zaten kayıtlı.`
    : `<b>${no}</b> numaralı dosya Sevkiyatlar'da zaten kayıtlı.`;

  const overlay = document.createElement('div');
  overlay.id = 'duplicate-popup';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:200;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:var(--surface);border:0.5px solid var(--border2);border-radius:var(--radius-xl);padding:28px 32px;max-width:400px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.16);text-align:center;">
      <div style="font-size:32px;margin-bottom:12px;">⚠️</div>
      <div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:8px;">${baslik}</div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:20px;">${aciklama}<br>Devam etmek istiyor musunuz?</div>
      <div style="display:flex;gap:10px;justify-content:center;">
        <button onclick="document.getElementById('duplicate-popup').remove()"
          style="padding:9px 20px;border-radius:var(--radius-md);border:0.5px solid var(--border2);background:transparent;color:var(--text2);font-family:var(--font);font-size:13px;cursor:pointer;">
          İptal
        </button>
        <button onclick="document.getElementById('duplicate-popup').remove();goStep(2);"
          style="padding:9px 20px;border-radius:var(--radius-md);border:none;background:var(--error);color:#fff;font-family:var(--font);font-size:13px;font-weight:600;cursor:pointer;">
          Yine de Devam Et
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}