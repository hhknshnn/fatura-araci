// ── PROCESSOR.JS ──────────────────────────────────────────────────────────────
// Excel dosyası işleme ve çıktı üretme fonksiyonları.

// ── SAYI PARSE ────────────────────────────────────────────────────────────────
function parseNum(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v).trim()
    .replace(/\s|\u00A0/g, '')
    .replace(/[^0-9,.\-]/g, '');
  if (s.includes('.') && s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round(parseNum(n) * 100) / 100;
}

// ── DOSYA YÜKLEME ─────────────────────────────────────────────────────────────
function handleMultiFile(files) {
  for (const file of files) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'pdf') {
      handlePdf(file);
    } else if (ext === 'xlsx' || ext === 'xls') {
      handleFile(file);
    }
  }
}

function handleFile(file) {
  if (!file) return;
  originalFileName = file.name.replace(/\.xlsx?$/, '');
  const badge = document.getElementById('fileName');
  badge.textContent = '✓ ' + file.name;
  badge.style.display = 'inline-flex';
  const r = new FileReader();
  r.onload = e => {
    lastFileData = e.target.result;
    loadFile(lastFileData);
  };
  r.readAsArrayBuffer(file);
}

function handlePdf(file) {
  if (!file) return;
  const badge = document.getElementById('pdfFileName');
  badge.textContent = '⏳ PDF okunuyor... (0s)';
  badge.style.display = 'inline-flex';

  let elapsed = 0;
  const timer = setInterval(() => {
    elapsed++;
    badge.textContent = `⏳ PDF okunuyor... (${elapsed}s)`;
  }, 1000);

  const r = new FileReader();
  r.onload = async e => {
    lastPdfData = e.target.result;
    try {
      const b = new Uint8Array(lastPdfData);
      let s = '';
      for (let i = 0; i < b.byteLength; i++) s += String.fromCharCode(b[i]);
      const pdfB64 = btoa(s);
      const resp = await fetch('/api/taslak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'parsePdf', pdf: pdfB64 })
      });
      const data = await resp.json();
      if (data.success && data.pdfFields) {
        const pf = data.pdfFields;
        if (pf.brutKg && pf.brutKg > 0) window._pdfBrutKg = pf.brutKg;
        if (pf.netKg  && pf.netKg  > 0) window._pdfNetKg  = pf.netKg;
      }
    } catch(e) {
      console.warn('PDF parse hatası:', e);
    } finally {
      clearInterval(timer);
      badge.textContent = `✓ PDF okundu (${elapsed}s)`;
    }
  };
  r.readAsArrayBuffer(file);
}

function loadFile(data) {
  processedWB = null; workingRows = null; masterRows = null;

  const nextBtn = document.getElementById('step4Next');
  if (nextBtn) nextBtn.style.display = 'none';

  try {
    const wb   = XLSX.read(data, { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });

    if (!rows.length) throw new Error('Dosya boş.');

    const keys = Object.keys(rows[0]);
    if (keys.includes('BRÜT') || keys.includes('NET'))
      throw new Error('Eski format (BRÜT/NET var). Revize master kullanın.');
    if (!keys.includes('Ürün Ağırlığı (KG)') || !keys.includes('ÜRÜN ARA GRUBU'))
      throw new Error('Zorunlu sütunlar bulunamadı: Ürün Ağırlığı (KG), ÜRÜN ARA GRUBU');

    masterRows = rows;

    // Devam butonunu göster
    if (nextBtn) nextBtn.style.display = 'block';

    // fileName badge güncelle
    const badge = document.getElementById('fileName');
    if (badge) badge.textContent = '✓ ' + rows.length.toLocaleString('tr') + ' satır yüklendi';

  } catch(err) {
    // Hata durumunda badge'e yaz — statusBox adım 5'te olduğu için güvenli değil
    const badge = document.getElementById('fileName');
    if (badge) { badge.textContent = '⚠ ' + err.message; badge.style.color = 'var(--error)'; }
    console.error('loadFile hatası:', err.message);
  }
}

// ── EXCEL ÇIKTI ÜRETME ────────────────────────────────────────────────────────
function buildOutput(rows) {
  try {
    if      (currentCountry === 'kz') buildKZ(rows);
    else if (currentCountry === 'rs') buildRS(rows);
    else if (SIMPLE_MAPS[currentCountry]) buildSimple(rows, SIMPLE_MAPS[currentCountry]);
    else {
      showStatus('error', '⚠ Bu ülke için sütun tanımı henüz eklenmemiş.');
      document.getElementById('downloadBtn').classList.remove('visible');
    }
  } catch(err) {
    showStatus('error', '⚠ ' + err.message);
    document.getElementById('downloadBtn').classList.remove('visible');
  }
}

function getVal(row, src) {
  if (src === '__CALC__') return round2(parseNum(row['Miktar']) * parseNum(row['Fiyat']));
  if (src === 'Birim Cinsi (1)') {
    const v = row[src] !== undefined ? row[src] : '';
    return String(v).trim() === 'AD' ? 'PCS' : v;
  }
  if (src === '__EUR__') {
    const rate = getEurRate();
    if (!rate) return '';
    return parseNum(row['Fiyat']) / rate;
  }
  if (src === '__EUR_TOTAL__') {
    const rate = getEurRate();
    if (!rate) return '';
    return (parseNum(row['Fiyat']) / rate) * parseNum(row['Miktar']);
  }
  return row[src] !== undefined ? row[src] : '';
}

function getEurRate() {
  const el = document.getElementById('eurRateInput');
  const v  = el ? parseNum(el.value) : 0;
  return (v && v > 0) ? v : null;
}

function makeWS(result, headers) {
  const ws = XLSX.utils.json_to_sheet(result, { header: headers });
  ws['!cols'] = headers.map(c => ({ wch: Math.min(Math.max(c.length + 4, 14), 35) }));
  return ws;
}

// ── KAZAKİSTAN ────────────────────────────────────────────────────────────────
function buildKZ(rows) {
  const before = rows.length;
  let result;
  if (currentMode === 'grouped') {
    const grouped = {}, order = [];
    for (const row of rows) {
      const sku = row['SKU'];
      if (!grouped[sku]) { grouped[sku] = { ...row }; order.push(sku); }
      else {
        grouped[sku]['Miktar'] = parseNum(grouped[sku]['Miktar']) + parseNum(row['Miktar']);
        grouped[sku]['BRÜT']   = parseNum(grouped[sku]['BRÜT'])   + parseNum(row['BRÜT']);
        grouped[sku]['NET']    = parseNum(grouped[sku]['NET'])     + parseNum(row['NET']);
      }
    }
    result = order.map(sku => { const r = {}; KZ_COLS.forEach(c => r[c] = grouped[sku][c] ?? ''); return r; });
  } else {
    result = rows.map(row => { const r = {}; KZ_COLS.forEach(c => r[c] = row[c] ?? ''); return r; });
  }
  processedWB = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(processedWB, makeWS(result, KZ_COLS), 'Sheet');
  showStatus('success', currentMode === 'grouped'
    ? `<div class="stat">✓ Kazakistan — Gruplandırma tamamlandı</div><div class="stat">Orijinal: <span>${before.toLocaleString('tr')} satır</span> → Sonuç: <span>${result.length.toLocaleString('tr')} satır</span></div>`
    : `<div class="stat">✓ Kazakistan — Tüm satırlar: <span>${result.length.toLocaleString('tr')} satır</span></div>`
  );
  document.getElementById('downloadBtn').style.display = 'block';
  document.getElementById('downloadBtn').classList.add('visible');
}

// ── SIRBİSTAN ─────────────────────────────────────────────────────────────────
function buildRS(rows) {
  document.getElementById('downloadBtn').style.display = 'block';
  document.getElementById('downloadBtn').classList.add('visible');
  showStatus('success', '<div class="stat">✓ Sırbistan — Hazır. İndir butonuna basın.</div>');
}

// ── DİĞER ÜLKELER ─────────────────────────────────────────────────────────────
function buildSimple(rows, colMap) {
  const headers = colMap.map(m => m.out);
  const result  = rows.map(row => { const r = {}; colMap.forEach(m => r[m.out] = getVal(row, m.src)); return r; });
  processedWB = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(processedWB, makeWS(result, headers), 'Sheet');
  const label = COUNTRIES[currentCountry]?.label || currentCountry;
  showStatus('success',
    `<div class="stat">✓ ${label} — Tamamlandı</div><div class="stat">Toplam: <span>${result.length.toLocaleString('tr')} satır · ${headers.length} sütun</span></div>`
  );
  document.getElementById('downloadBtn').style.display = 'block';
  document.getElementById('downloadBtn').classList.add('visible');
}