// ── FILE HANDLING ─────────────────────────────────────────────────────────────
// Kullanıcının Excel dosyasını tarayıcıya yüklemesiyle ilgili kodlar

// Sürükle-bırak alanını seç
const dropZone = document.getElementById('dropZone');

// Dosya sürüklenince mavi kenarlık göster
dropZone.addEventListener('dragover', e => {
  e.preventDefault(); // tarayıcının varsayılan davranışını engelle (dosyayı açmasın)
  dropZone.classList.add('dragover');
});

// Dosya sürükleme alanından çıkınca mavi kenarlığı kaldır
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

// Dosya bırakılınca işle
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); // ilk dosyayı al
});

// Dosya seçilince (tıklama ile) veya sürükle-bırak ile çalışır
function handleFile(file) {
  if (!file) return;

  // Dosya adını kaydet (.xlsx veya .xls uzantısını kaldır)
  originalFileName = file.name.replace(/\.xlsx?$/, '');
  document.getElementById('fileName').textContent = '📄 ' + file.name;

  // FileReader: tarayıcıda dosyayı binary olarak okur (Excel kütüphanesi binary ister)
  const r = new FileReader();
  r.onload = e => {
    lastFileData = e.target.result; // ham binary veriyi sakla
    loadFile(lastFileData);         // dosyayı işle
  };
  r.readAsArrayBuffer(file); // binary formatta oku
}

// Excel dosyasını okur, doğrular ve KG tablosunu hazırlar
function loadFile(data) {
  // Her yeni dosya yüklenince önceki sonuçları sıfırla
  processedWB = null; workingRows = null; masterRows = null;
  document.getElementById('statusBox').className = 'status-box';
  document.getElementById('downloadBtn').classList.remove('visible');
  document.getElementById('kgSection').style.display = 'none';
  document.getElementById('adjustSection').style.display = 'none';
  document.getElementById('adjustResult').style.display = 'none';

  try {
    // XLSX kütüphanesi ile Excel'i oku
    const wb = XLSX.read(data, { type: 'array' });

    // İlk sayfayı JSON'a çevir: her satır bir nesne, sütun adları anahtar
    // defval:'' → boş hücreler boş string olur (null/undefined değil)
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });

    if (!rows.length) throw new Error('Dosya boş.');

    const keys = Object.keys(rows[0]); // ilk satırdan sütun adlarını al

    // Eski format kontrolü: BRÜT/NET sütunu varsa hata ver
    if (keys.includes('BRÜT') || keys.includes('NET'))
      throw new Error('Eski format (BRÜT/NET var). Revize master kullanın.');

    // Zorunlu sütunlar var mı kontrol et
    if (!keys.includes('Ürün Ağırlığı (KG)') || !keys.includes('ÜRÜN ARA GRUBU'))
      throw new Error('Ürün Ağırlığı (KG) veya ÜRÜN ARA GRUBU sütunu bulunamadı.');

    masterRows = rows; // ham satırları state'e kaydet

    showStatus('success',
      `<div class="stat">✓ Dosya yüklendi: <span>${rows.length.toLocaleString('tr')} satır</span></div>
       <div class="stat">Kilo hesaplaması için tabloyu doldurun, ardından ülke seçip indirin.</div>`
    );

    buildKgTable(rows);                                        // kilo giriş tablosunu oluştur
    document.getElementById('kgSection').style.display = 'block'; // kilo bölümünü göster

  } catch (err) {
    showStatus('error', '⚠ ' + err.message);
  }
}

// ── KG TABLE ──────────────────────────────────────────────────────────────────
// ÜRÜN ARA GRUBU değerlerini tarar, kilo girilmesi gereken grupları listeler

function buildKgTable(rows) {
  // Tüm benzersiz ÜRÜN ARA GRUBU değerlerini bul ve alfabetik sırala
  const groups = [...new Set(
    rows.map(r => String(r['ÜRÜN ARA GRUBU'])).filter(g => g && g !== '')
  )].sort();

  // Tabloyu temizle (başlık satırı hariç)
  const tbody = document.getElementById('kgTable');
  while (tbody.rows.length > 1) tbody.deleteRow(1);

  const needsInput = []; // kilo girilmesi gereken gruplar
  const alreadyFull = []; // AG sütunu zaten dolu olan gruplar

  groups.forEach(g => {
    // Bu grupta AG değeri 0 olan kaç satır var?
    const zeroCount = rows.filter(r =>
      String(r['ÜRÜN ARA GRUBU']) === g && parseNum(r['Ürün Ağırlığı (KG)']) === 0
    ).length;

    if (zeroCount > 0) needsInput.push({ g, zeroCount }); // kilo girilmeli
    else alreadyFull.push(g);                              // zaten dolu
  });

  // Kilo girilmesi gereken grup varsa tabloyu aç, yoksa kapalı tut
  const kgBody  = document.getElementById('kgTableBody');
  const kgArrow = document.getElementById('kgTableArrow');
  if (needsInput.length > 0) { kgBody.style.display = 'block'; kgArrow.textContent = '▲'; }
  else                        { kgBody.style.display = 'none';  kgArrow.textContent = '▼'; }

  if (needsInput.length === 0) {
    // Tüm gruplar dolu → bilgi mesajı göster
    const tr = tbody.insertRow();
    tr.innerHTML = '<td colspan="3" style="color:var(--accent);padding:12px;">✓ Tüm satırlarda kilo değeri dolu.</td>';
  } else {
    // Her grup için tablo satırı oluştur
    needsInput.forEach(({ g, zeroCount }) => {
      // Özel karakterleri _ ile değiştirerek HTML id'sine uygun isim yap
      const id    = 'gw_' + g.replace(/[^a-zA-Z0-9]/g, '_');
      const saved = groupWeights[g] !== undefined ? groupWeights[g] : ''; // daha önce kayıtlı kilo

      const tr = tbody.insertRow();
      tr.innerHTML = `
        <td style="color:var(--text);">${g}</td>
        <td><input class="kg-input" id="${id}" type="text" inputmode="decimal" value="${saved}" placeholder="kg"></td>
        <td style="color:#ff9d72;">${zeroCount} satır</td>`; // turuncu = dikkat gerekiyor
    });
  }

  // AG dolu gruplar bölümü
  const savedSection = document.getElementById('savedKgSection');
  const savedTable   = document.getElementById('savedKgTable');
  savedTable.innerHTML = '';

  if (alreadyFull.length > 0) {
    savedSection.style.display = 'block';
    alreadyFull.forEach(g => {
      const saved = groupWeights[g] !== undefined ? groupWeights[g] : '—';
      const div = document.createElement('div');
      div.style.cssText = 'display:flex;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #1f1f1f;font-family:"DM Mono",monospace;font-size:12px;';
      div.innerHTML = `
        <span style="color:var(--text);">${g}</span>
        <span style="color:var(--muted);">AG dolu &nbsp;|&nbsp; kayıtlı: <span style="color:var(--accent);">${saved} kg</span></span>`;
      savedTable.appendChild(div);
    });
  } else {
    savedSection.style.display = 'none';
  }
}

// ── APPLY GROUP WEIGHTS ───────────────────────────────────────────────────────
// "Kiloları Uygula ve Hesapla" butonuna basılınca çalışır
function applyGroupWeights() {
  if (!masterRows) return;

  // Tablodaki input alanlarından kilo değerlerini oku ve kaydet
  const groups = [...new Set(masterRows.map(r => String(r['ÜRÜN ARA GRUBU'])).filter(g => g && g !== ''))];
  groups.forEach(g => {
    const id = 'gw_' + g.replace(/[^a-zA-Z0-9]/g, '_');
    const el = document.getElementById(id);
    if (el && el.value !== '') groupWeights[g] = parseNum(el.value);
  });

  // localStorage'a kaydet (sayfa yenilenince de hatırlanır)
  try { localStorage.setItem('gwData', JSON.stringify(groupWeights)); } catch(e) {}

  // Her satır için BRÜT ve NET hesapla
  workingRows = masterRows.map(row => {
    const r = { ...row }; // satırın kopyasını al (orijinali değiştirme)
    const sku = String(r['SKU']);
    let kg;

    // Kilo öncelik sırası:
    // 1. İstisna SKU listesinde mi? → o kiloyı kullan (AG ne olursa olsun)
    // 2. AG sütununda değer var mı? → onu kullan
    // 3. AG sıfırsa → grup kilosunu kullan
    if (sku in exceptionSkus) {
      kg = parseNum(exceptionSkus[sku]);
    } else {
      kg = parseNum(r['Ürün Ağırlığı (KG)']);
      if (kg === 0) kg = parseNum(groupWeights[String(r['ÜRÜN ARA GRUBU'])] || 0);
    }

    const miktar = parseNum(r['Miktar']);

    r['_kg']      = kg;           // birim kilo (gizli alan, çıktıya gelmez)
    r['_hamBrut'] = kg * miktar;  // ham BRÜT = kilo × miktar (hedef kilo ayarından önce)
    r['BRÜT']     = r['_hamBrut']; // başlangıçta ham değer
    r['NET']      = r['BRÜT'] * 0.9; // NET = BRÜT'ün %90'ı

    return r;
  });

  // Toplam BRÜT'ü ekranda göster
  const totalBrut = workingRows.reduce((s, r) => s + parseNum(r['BRÜT']), 0);
  document.getElementById('calcTotal').textContent = round2(totalBrut);

  // "Olması gereken kilo" giriş bölümünü göster
  document.getElementById('adjustSection').style.display = 'block';
  document.getElementById('adjustResult').style.display  = 'none';

  // Çıktıyı üret ve indir butonunu göster
  buildAndDownloadReady();
}

// ── WEIGHT ADJUSTMENT ─────────────────────────────────────────────────────────
// "Uygula" butonuna basılınca çalışır — hedef kiloya göre tüm satırları ölçekler
function applyWeightAdjust() {
  if (!workingRows) return;

  const target = parseNum(document.getElementById('targetWeight').value);
  if (!target || target <= 0) { alert('Lütfen geçerli bir hedef kilo girin.'); return; }

  // Ham BRÜT toplamı (istisna SKU ve grup kiloları uygulandıktan sonraki değer)
  const hamTotal = workingRows.reduce((s, r) => s + parseNum(r['_hamBrut']), 0);
  if (hamTotal <= 0) { alert('Ham BRÜT hesaplanamadı.'); return; }

  // Ölçekleme çarpanı: hedef / mevcut toplam
  // Örnek: ham toplam 3700, hedef 5220 → çarpan = 5220/3700 = 1.41
  // Her satırın ham BRÜT'ü bu çarpanla çarpılır → toplam tam olarak hedefe eşit olur
  const multiplier = target / hamTotal;

  workingRows = workingRows.map(row => {
    const r = { ...row };
    r['BRÜT'] = parseNum(r['_hamBrut']) * multiplier; // orantılı ölçekleme
    r['NET']  = r['BRÜT'] * 0.9;                       // NET = BRÜT'ün %90'ı
    return r;
  });

  // Sonuçları ekranda göster
  const finalBrut = workingRows.reduce((s, r) => s + parseNum(r['BRÜT']), 0);
  const finalNet  = workingRows.reduce((s, r) => s + parseNum(r['NET']),  0);
  const res = document.getElementById('adjustResult');
  res.style.display = 'block';
  res.innerHTML = `✓ Orantılı ölçekleme &nbsp;|&nbsp; BRÜT: ${round2(finalBrut)} kg &nbsp;|&nbsp; NET: ${round2(finalNet)} kg`;

  buildAndDownloadReady();
}

// ── BUILD OUTPUT ──────────────────────────────────────────────────────────────
// Seçili ülkeye göre çıktı Excel'ini oluşturur

function buildAndDownloadReady() {
  if (!workingRows) return;
  // Belçika için kur zorunlu
  if (currentCountry === 'be' && !getEurRate()) {
    showStatus('error', '⚠ Belçika için Euro kuru girin.');
    document.getElementById('downloadBtn').classList.remove('visible');
    return;
  }
  buildOutput(workingRows);
}

function buildOutput(rows) {
  try {
    if      (currentCountry === 'kz') buildKZ(rows);
    else if (currentCountry === 'rs') buildRS(rows);
    else if (SIMPLE_MAPS[currentCountry]) buildSimple(rows, SIMPLE_MAPS[currentCountry]);
    else {
      showStatus('error', '⚠ Bu ülke için sütun tanımı henüz eklenmemiş.');
      document.getElementById('downloadBtn').classList.remove('visible');
    }
  } catch (err) {
    showStatus('error', '⚠ ' + err.message);
    document.getElementById('downloadBtn').classList.remove('visible');
  }
}

// EUR kur değerini okur — geçerli değil ise null döndürür
function getEurRate() {
  const el = document.getElementById('eurRateInput');
  const v  = el ? parseNum(el.value) : 0;
  return (v && v > 0) ? v : null;
}

// Bir sütunun değerini döndürür — özel src kodlarını işler
function getVal(row, src) {
  if (src === '__CALC__') {
    // Miktar × Fiyat — 2 ondalıkla yuvarla
    return round2(parseNum(row['Miktar']) * parseNum(row['Fiyat']));
  }
  if (src === 'Birim Cinsi (1)') {
    // "AD" (Türkçe adet) → "PCS" (İngilizce piece) dönüşümü
    const v = row[src] !== undefined ? row[src] : '';
    return String(v).trim() === 'AD' ? 'PCS' : v;
  }
  if (src === '__EUR__') {
    // Belçika: TL fiyatı EUR'ya çevir (yuvarlama yok → hassas değer)
    const rate = getEurRate();
    if (!rate) return '';
    return parseNum(row['Fiyat']) / rate;
  }
  if (src === '__EUR_TOTAL__') {
    // Belçika: birim EUR × miktar (ara yuvarlama yok → doğru toplam)
    const rate = getEurRate();
    if (!rate) return '';
    return (parseNum(row['Fiyat']) / rate) * parseNum(row['Miktar']);
  }
  // Normal sütun: master'dan direkt al
  return row[src] !== undefined ? row[src] : '';
}

// Excel worksheet oluşturur ve sütun genişliklerini ayarlar
function makeWS(result, headers) {
  const ws = XLSX.utils.json_to_sheet(result, { header: headers });
  // Her sütunun genişliğini sütun adı uzunluğuna göre ayarla (min 14, max 35 karakter)
  ws['!cols'] = headers.map(c => ({ wch: Math.min(Math.max(c.length + 4, 14), 35) }));
  return ws;
}

// ── KAZAKISTAN ────────────────────────────────────────────────────────────────
function buildKZ(rows) {
  const before = rows.length;
  let result;

  if (currentMode === 'grouped') {
    // SKU'ya göre gruplandır: aynı SKU'ya sahip satırları birleştir
    const grouped = {}, order = [];
    for (const row of rows) {
      const sku = row['SKU'];
      if (!grouped[sku]) {
        grouped[sku] = { ...row }; // ilk kez görülen SKU → kaydet
        order.push(sku);            // sırayı koru
      } else {
        // Daha önce görülen SKU → miktarları ve kiloları topla
        grouped[sku]['Miktar'] = parseNum(grouped[sku]['Miktar']) + parseNum(row['Miktar']);
        grouped[sku]['BRÜT']   = parseNum(grouped[sku]['BRÜT'])   + parseNum(row['BRÜT']);
        grouped[sku]['NET']    = parseNum(grouped[sku]['NET'])    + parseNum(row['NET']);
      }
    }
    // Gruplandırılmış satırlardan sadece KZ_COLS sütunlarını al
    result = order.map(sku => {
      const r = {};
      KZ_COLS.forEach(c => r[c] = grouped[sku][c] ?? '');
      return r;
    });
  } else {
    // Gruplandırma yok: tüm satırlar, sadece sütunları seç
    result = rows.map(row => {
      const r = {};
      KZ_COLS.forEach(c => r[c] = row[c] ?? '');
      return r;
    });
  }

  // Excel çalışma kitabı oluştur
  processedWB = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(processedWB, makeWS(result, KZ_COLS), 'Sheet');

  showStatus('success', currentMode === 'grouped'
    ? `<div class="stat">✓ Kazakistan — Gruplandırma tamamlandı</div>
       <div class="stat">Orijinal: <span>${before.toLocaleString('tr')} satır</span> → Sonuç: <span>${result.length.toLocaleString('tr')} satır</span></div>`
    : `<div class="stat">✓ Kazakistan — Tüm satırlar: <span>${result.length.toLocaleString('tr')} satır</span></div>`
  );
  document.getElementById('downloadBtn').classList.add('visible');
}

// ── SIRBISTAN ─────────────────────────────────────────────────────────────────
function buildRS(rows) {
  // RS_INV sütun haritasını kullanarak her satırı dönüştür
  const invResult = rows.map(row => {
    const r = {};
    RS_INV.forEach(m => r[m.out] = getVal(row, m.src));
    return r;
  });
  const invH = RS_INV.map(m => m.out); // sütun başlıkları

  processedWB = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(processedWB, makeWS(invResult, invH), 'INV');

  showStatus('success',
    `<div class="stat">✓ Sırbistan — INV</div>
     <div class="stat">Toplam: <span>${invResult.length.toLocaleString('tr')} satır · ${invH.length} sütun</span></div>`
  );
  document.getElementById('downloadBtn').classList.add('visible');
}

// ── DİĞER ÜLKELER ────────────────────────────────────────────────────────────
// Irak, Gürcistan, KKTC, Rusya, Bosna, Belçika için ortak fonksiyon
// Her ülkenin SIMPLE_MAPS'teki sütun haritasını kullanır
function buildSimple(rows, colMap) {
  const headers = colMap.map(m => m.out); // çıktı sütun başlıkları

  const result = rows.map(row => {
    const r = {};
    colMap.forEach(m => r[m.out] = getVal(row, m.src)); // her sütunu dönüştür
    return r;
  });

  processedWB = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(processedWB, makeWS(result, headers), 'Sheet');

  const label = COUNTRIES[currentCountry]?.label || currentCountry;
  showStatus('success',
    `<div class="stat">✓ ${label} — Tamamlandı</div>
     <div class="stat">Toplam: <span>${result.length.toLocaleString('tr')} satır · ${headers.length} sütun</span></div>`
  );
  document.getElementById('downloadBtn').classList.add('visible');
}
