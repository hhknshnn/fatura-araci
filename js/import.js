// js/import.js
// Toplu Sevkiyat İçe Aktar sayfası
// Akış: Excel yükle → sütunları eşleştir → önizle → aktar

// ── SÜTUN EŞLEŞTİRME HARİTASI ────────────────────────────────────────────────
// DB sütunu → Excel'de olası başlık isimleri (büyük/küçük harf duyarsız)
const KOLON_MAP = {
  arac_sira_no:          ['araç sıra no', 'arac sira no', 'sıra no', 'sira no'],
  ulke:                  ['ülke', 'ulke'],
  ihracat_dosya_no:      ['ihracat dosya no', 'dosya no'],
  nakliye_firmasi:       ['nakliye firması', 'nakliye firmasi', 'nakliye'],
  plaka:                 ['plaka'],
  fatura_no:             ['fatura no', 'faturano', 'invoice no'],
  palet:                 ['palet', 'palet sayısı'],
  aciklama:              ['açıklama', 'aciklama'],
  fatura_bedeli_tl:      ['fatura bedeli tl', 'fatura bedeli \\ntl'],
  mal_bedeli_tl:         ['mal bedeli tl', 'mal bedeli \\ntl'],
  mal_bedeli_eur:        ['malbedeli döviz', 'mal bedeli döviz', 'mal bedeli eur', 'mal bedeli usd', 'malbedeli eur', 'mal bedeli usd'],
  navlun_eur:            ['navlun döviz', 'navlun eur', 'navlun usd', 'navlun \\nusd', 'freight'],
  sigorta_eur:           ['sigorta döviz', 'sigorta eur', 'sigorta usd', 'sigorta'],
  eur_kuru:              ['eur kur', 'eur kuru', 'usd kur', 'usd kuru'],
  fatura_bedeli_eur:     ['fatura bedeli döviz', 'fatura bedeli eur', 'fatura bedeli usd', 'fatura bedeli̇ döviz'],
  arac_bekleme:          ['araç bekleme masrafı', 'arac bekleme', 'araç bekleme masrafı usd'],
  ihracat_beyanname_tl:  ['ihracat beyanname tl', 'i̇hracatbeyanname tl', 'ihracatbeyanname tl'],
  ihracat_beyanname_eur: ['ihracat beyanname eur', 'ihracat beyanname usd', 'i̇hracatbeyanname eur', 'ihracat beyanname  eur'],
  brokerage_eur:         ['brokerage fee', 'brokerage eur', 'brokerage fee eur', 'brokerage fee\\n(ülke gümrükleme masrafı)'],
  gumruk_vergisi_eur:    ['gümrük vergisi döviz', 'gümrük vergisi eur', 'gümrükvergisi \\nusd', 'import duties döviz', 'customs clearance fee döviz'],
  kdv_eur:               ['kdv döviz', 'kdv eur', 'kdv\\neur'],
  toplam_maliyet_eur:    ['toplam \\nmaliyet', 'toplam maliyet', 'toplam \\nmaliyet usd'],
  yukleme_tarihi:        ['yükleme tarihi', 'yukleme tarihi'],
  gumruk_tarihi:         ['gümrük tarihi', 'gumruk tarihi', 'gümrük tari̇hi̇\\n(evrak gönderme)'],
  varis_tarihi:          ['varış tarihi', 'varis tarihi', 'variş tarihi m&m antrepo'],
  gumrukleme_bitis:      ['gümrükleme bitiş', 'gumrukleme bitis', 'gümrükleme bi̇ti̇ş'],
  durum:                 ['durum', 'statü durumu'],
  musteri_tipi:          ['müşteri tipi', 'musteri tipi'],
};

// DB sütunlarının Türkçe etiketleri
const KOLON_ETIKETLER = {
  arac_sira_no:          'Araç Sıra No',
  ulke:                  'Ülke ✱',
  ihracat_dosya_no:      'İhracat Dosya No',
  nakliye_firmasi:       'Nakliye Firması',
  plaka:                 'Plaka',
  fatura_no:             'Fatura No ✱',
  palet:                 'Palet',
  aciklama:              'Açıklama',
  fatura_bedeli_tl:      'Fatura Bedeli TL',
  mal_bedeli_tl:         'Mal Bedeli TL',
  mal_bedeli_eur:        'Mal Bedeli Döviz',
  navlun_eur:            'Navlun EUR',
  sigorta_eur:           'Sigorta EUR',
  eur_kuru:              'EUR/USD Kuru',
  fatura_bedeli_eur:     'Fatura Bedeli EUR',
  arac_bekleme:          'Araç Bekleme',
  ihracat_beyanname_tl:  'İhracat Beyanname TL',
  ihracat_beyanname_eur: 'İhracat Beyanname EUR',
  brokerage_eur:         'Brokerage EUR',
  gumruk_vergisi_eur:    'Gümrük Vergisi EUR',
  kdv_eur:               'KDV EUR',
  toplam_maliyet_eur:    'Toplam Maliyet EUR',
  yukleme_tarihi:        'Yükleme Tarihi',
  gumruk_tarihi:         'Gümrük Tarihi',
  varis_tarihi:          'Varış Tarihi',
  gumrukleme_bitis:      'Gümrükleme Bitiş',
  durum:                 'Durum',
  musteri_tipi:          'Müşteri Tipi',
};

// ── STATE ─────────────────────────────────────────────────────────────────────
let importExcelHeaders = [];   // Excel'deki sütun başlıkları
let importRawRows      = [];   // Excel'den okunan ham satırlar
let importMapping      = {};   // { db_kolonu: excel_baslik }
let importPreviewRows  = [];   // eşleştirme sonrası önizleme satırları
let importMode         = 'ekle'; // 'ekle' | 'guncelle'

// ── PANELİ BAŞLAT ─────────────────────────────────────────────────────────────
function initImportPanel() {
  importExcelHeaders = [];
  importRawRows      = [];
  importMapping      = {};
  importPreviewRows  = [];

  const panel = document.getElementById('stepImport');
  if (!panel) return;

  panel.innerHTML = `
    <div class="panel-label">Toplu İçe Aktar</div>

    <!-- Sekme Başlıkları -->
    <div style="display:flex;gap:0;border-bottom:1.5px solid var(--border2);margin-bottom:18px;">
      <button id="import-tab-excel" onclick="switchImportTab('excel')"
        style="padding:8px 18px;border:none;background:transparent;font-family:var(--font);
               font-size:13px;font-weight:600;color:var(--accent);border-bottom:2px solid var(--accent);
               margin-bottom:-1.5px;cursor:pointer;">
        📊 Excel Aktar
      </button>
      <button id="import-tab-aksu" onclick="switchImportTab('aksu')"
        style="padding:8px 18px;border:none;background:transparent;font-family:var(--font);
               font-size:13px;font-weight:600;color:var(--text3);border-bottom:2px solid transparent;
               margin-bottom:-1.5px;cursor:pointer;">
        📄 Aksu Beyanname PDF
      </button>
    </div>

    <!-- Excel Sekmesi -->
    <div id="import-tab-content-excel">
      <div class="panel-title">Excel'den Sevkiyat Aktar</div>
      <div class="panel-desc">Excel dosyanı yükle, sütunları eşleştir, önizle ve aktar.</div>

      <div class="status-box" id="importStatus"></div>

      <!-- ADIM 1: Dosya yükle -->
      <div id="importStep1">
      <div class="drop-zone" id="importDropZone" onclick="document.getElementById('importFileInput').click()">
        <input type="file" id="importFileInput" accept=".xlsx,.xls" style="display:none"
          onchange="handleImportFile(this.files[0])">
        <div class="drop-icon">📂</div>
        <h3>Excel dosyasını seçin veya sürükleyin</h3>
        <p>Almanya, Sırbistan, Belçika vb. maliyet Excel'leri desteklenir</p>
        <div class="drop-pills"><span class="drop-pill">.xlsx</span><span class="drop-pill">.xls</span></div>
      </div>
    </div>

    <!-- ADIM 2: Sütun eşleştirme -->
    <div id="importStep2" style="display:none;">
      <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px;">Sütun Eşleştirme</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:14px;">
        Sistem otomatik eşleştirdi. Yanlış olanları düzelt, boş bırakılanlar aktarılmaz.
      </div>
      <div id="importMappingGrid"></div>
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button class="btn-secondary" onclick="applyMapping()">Önizle →</button>
        <button class="btn-ghost" onclick="resetImport()">← Yeni Dosya</button>
      </div>
    </div>

    <!-- ADIM 3: Önizleme -->
    <div id="importStep3" style="display:none;">
      <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px;">Önizleme</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:14px;" id="importPreviewDesc"></div>

      <!-- Mod seçimi -->
      <div style="display:flex;gap:8px;margin-bottom:14px;">
        <div id="import-mode-ekle" onclick="setImportMode('ekle')"
          style="flex:1;padding:12px 16px;border-radius:var(--radius-md);border:1.5px solid var(--accent);
                 background:var(--accent-dim);cursor:pointer;transition:all 0.12s;">
          <div style="font-size:13px;font-weight:600;color:var(--accent-text);">➕ Yeni Ekle</div>
          <div style="font-size:11px;color:var(--text3);margin-top:3px;">Fatura No yoksa ekler, varsa atlar</div>
        </div>
        <div id="import-mode-guncelle" onclick="setImportMode('guncelle')"
          style="flex:1;padding:12px 16px;border-radius:var(--radius-md);border:1.5px solid var(--border2);
                 background:var(--surface2);cursor:pointer;transition:all 0.12s;">
          <div style="font-size:13px;font-weight:600;color:var(--text);">✏️ Güncelle</div>
          <div style="font-size:11px;color:var(--text3);margin-top:3px;">Fatura No eşleşirse üzerine yazar, yoksa atlar</div>
        </div>
      </div>

      <div style="overflow-x:auto;margin-bottom:14px;">
        <table id="importPreviewTable" style="width:100%;border-collapse:collapse;font-size:11px;"></table>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn-secondary" id="importBtn" onclick="doImport()">⬆ Aktar</button>
        <button class="btn-ghost" onclick="showImportStep(2)">← Geri</button>
      </div>
    </div>
    </div><!-- /import-tab-content-excel -->

    <!-- Aksu PDF Sekmesi -->
    <div id="import-tab-content-aksu" style="display:none;">
      <div class="panel-title">Aksu Beyanname PDF</div>
      <div class="panel-desc">Aksu Gümrük faturasını yükle — İhracat Beyanname TL/EUR otomatik dolar.</div>

      <div class="status-box" id="aksuStatus"></div>

      <div id="aksu-drop-zone"
        ondragover="event.preventDefault();this.classList.add('vergi-drag-over')"
        ondragleave="this.classList.remove('vergi-drag-over')"
        ondrop="event.preventDefault();this.classList.remove('vergi-drag-over');handleAksuPdf(event.dataTransfer.files[0])"
        onclick="document.getElementById('aksu-pdf-input').click()"
        style="display:flex;flex-direction:column;align-items:center;justify-content:center;
               gap:10px;padding:32px 20px;background:var(--surface2);
               border:1.5px dashed var(--border2);border-radius:var(--radius-md);
               cursor:pointer;transition:border-color 0.15s,background 0.15s;text-align:center;">
        <input type="file" id="aksu-pdf-input" accept=".pdf" style="display:none;"
          onchange="handleAksuPdf(this.files[0])">
        <span style="font-size:32px;">📄</span>
        <div style="font-size:13px;font-weight:600;color:var(--text);">PDF'i buraya sürükleyin veya tıklayın</div>
        <div style="font-size:12px;color:var(--text3);">Çok sayfalı PDF desteklenir — tüm faturalar taranır</div>
      </div>

      <div id="aksu-result" style="display:none;margin-top:16px;"></div>
    </div>

  `;

  // Drag-drop
  const dz = document.getElementById('importDropZone');
  if (dz) {
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.classList.remove('dragover');
      if (e.dataTransfer.files[0]) handleImportFile(e.dataTransfer.files[0]);
    });
  }
}

// ── ADIM GEÇİŞİ ──────────────────────────────────────────────────────────────
function showImportStep(n) {
  [1, 2, 3].forEach(i => {
    const el = document.getElementById('importStep' + i);
    if (el) el.style.display = i === n ? 'block' : 'none';
  });
}

// ── DOSYA YÜKLE ───────────────────────────────────────────────────────────────
function handleImportFile(file) {
  if (!file) return;
  showImportStatus('info', '⏳ Dosya okunuyor...');

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb   = XLSX.read(e.target.result, { type: 'array', cellDates: true });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });

      if (!rows.length) throw new Error('Dosya boş');

      importRawRows      = rows;
      importExcelHeaders = Object.keys(rows[0]);

      autoMap();
      buildMappingGrid();
      showImportStep(2);
      showImportStatus('success', `✓ ${rows.length} satır yüklendi — sütunları kontrol edin`);
    } catch (err) {
      showImportStatus('error', '⚠ ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

// ── OTOMATİK EŞLEŞTİRME ─────────────────────────────────────────────────────
function autoMap() {
  importMapping = {};
  const normalize = s => String(s)
    .replace(/İ/g, 'I').replace(/ı/g, 'i')
    .toLowerCase()
    .replace(/i̇/g, 'i').replace(/I/g, 'i')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\n/g, ' ');

  const normHeaders = importExcelHeaders.map(h => ({ orig: h, norm: normalize(h) }));

  for (const [dbCol, aliases] of Object.entries(KOLON_MAP)) {
    for (const alias of aliases) {
      const normAlias = normalize(alias);
      const found = normHeaders.find(h => h.norm.includes(normAlias) || normAlias.includes(h.norm));
      if (found) {
        importMapping[dbCol] = found.orig;
        break;
      }
    }
  }
}

// ── EŞLEŞTİRME GRID ──────────────────────────────────────────────────────────
function buildMappingGrid() {
  const grid = document.getElementById('importMappingGrid');
  if (!grid) return;

  const eslesmeyen = Object.keys(KOLON_MAP).filter(k => !importMapping[k]);
  const eslesen    = Object.keys(KOLON_MAP).filter(k =>  importMapping[k]);

  const options = ['(Eşleştirme)', ...importExcelHeaders]
    .map(h => `<option value="${h}" ${h === '(Eşleştirme)' ? '' : ''}>${h}</option>`)
    .join('');

  const buildRow = (dbCol) => {
    const mapped  = importMapping[dbCol] || '';
    const etiket  = KOLON_ETIKETLER[dbCol] || dbCol;
    const isAuto  = !!mapped;
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:0.5px solid var(--border);">
        <div style="width:180px;font-size:12px;font-weight:500;color:${isAuto ? 'var(--text)' : 'var(--text3)'};">
          ${etiket}
        </div>
        <div style="flex:1;">
          <select onchange="importMapping['${dbCol}']=this.value==='(Eşleştirme)'?'':this.value"
            style="width:100%;padding:5px 8px;border-radius:var(--radius-sm);border:0.5px solid var(--border2);
                   background:${isAuto ? 'var(--accent-dim)' : 'var(--surface2)'};
                   color:var(--text);font-family:var(--font);font-size:12px;outline:none;">
            ${['(Eşleştirme)', ...importExcelHeaders].map(h =>
              `<option value="${h}" ${h === (mapped || '(Eşleştirme)') ? 'selected' : ''}>${h}</option>`
            ).join('')}
          </select>
        </div>
        <div style="width:60px;text-align:center;font-size:11px;color:${isAuto ? 'var(--success)' : 'var(--text3)'};">
          ${isAuto ? '✓ auto' : '—'}
        </div>
      </div>`;
  };

  grid.innerHTML = `
    <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;
                letter-spacing:0.06em;margin-bottom:6px;">
      ✓ Otomatik eşleşen (${eslesen.length})
    </div>
    ${eslesen.map(buildRow).join('')}
    ${eslesmeyen.length ? `
    <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;
                letter-spacing:0.06em;margin:14px 0 6px;">
      ⚠ Eşleşmeyen (${eslesmeyen.length}) — isteğe bağlı
    </div>
    ${eslesmeyen.map(buildRow).join('')}` : ''}
  `;
}

// ── EŞLEŞTİRME UYGULA → ÖNİZLE ──────────────────────────────────────────────
function applyMapping() {
  // ulke ve fatura_no zorunlu
  if (!importMapping['ulke'] && !importMapping['fatura_no']) {
    showImportStatus('error', '⚠ En az Ülke veya Fatura No sütununu eşleştirin.');
    return;
  }

  importPreviewRows = importRawRows.map(row => {
    const mapped = {};
    for (const [dbCol, excelHeader] of Object.entries(importMapping)) {
      if (excelHeader && excelHeader !== '(Eşleştirme)') {
        mapped[dbCol] = row[excelHeader] ?? '';
      }
    }
    // Ülke boşsa bir önceki satırdan al (Excel'de birleşik hücreler)
    return mapped;
  });

  // Birleşik hücre fix: ülke boşsa yukarıdan al
  let lastUlke = '';
  let lastNakliye = '';
  let lastPlaka = '';
  importPreviewRows = importPreviewRows.map(row => {
    if (row.ulke && String(row.ulke).trim()) lastUlke = String(row.ulke).trim();
    else row.ulke = lastUlke;

    if (row.nakliye_firmasi && String(row.nakliye_firmasi).trim()) lastNakliye = String(row.nakliye_firmasi).trim();
    else if (!row.nakliye_firmasi) row.nakliye_firmasi = lastNakliye;

    if (row.plaka && String(row.plaka).trim()) lastPlaka = String(row.plaka).trim();
    else if (!row.plaka) row.plaka = lastPlaka;

    return row;
  });

  // Boş fatura_no'lu satırları filtrele
  const onceki = importPreviewRows.length;
  importPreviewRows = importPreviewRows.filter(r =>
    String(r.fatura_no || '').trim() !== '' ||
    String(r.ihracat_dosya_no || '').trim() !== ''
  );
  const sonraki = importPreviewRows.length;

  buildPreviewTable();
  document.getElementById('importPreviewDesc').textContent =
    `${sonraki} satır aktarılacak${onceki !== sonraki ? ` (${onceki - sonraki} boş satır atlandı)` : ''}.`;
  showImportStep(3);
  showImportStatus('info', `⏳ ${sonraki} satır hazır — kontrol edip Aktar'a basın`);
}

// ── ÖNİZLEME TABLOSU ─────────────────────────────────────────────────────────
function buildPreviewTable() {
  const table = document.getElementById('importPreviewTable');
  if (!table) return;

  // Sadece dolu sütunları göster
  const gosterilecek = ['ulke', 'ihracat_dosya_no', 'fatura_no', 'nakliye_firmasi',
                        'plaka', 'fatura_bedeli_eur', 'mal_bedeli_eur', 'navlun_eur',
                        'eur_kuru', 'yukleme_tarihi', 'durum']
    .filter(k => importPreviewRows.some(r => r[k] && String(r[k]).trim()));

  const thStyle = 'padding:6px 10px;background:var(--surface2);border:0.5px solid var(--border2);' +
                  'font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;white-space:nowrap;';
  const tdStyle = 'padding:5px 10px;border:0.5px solid var(--border);font-size:11px;white-space:nowrap;';

  const thead = `<thead><tr>${gosterilecek.map(k =>
    `<th style="${thStyle}">${KOLON_ETIKETLER[k] || k}</th>`).join('')}</tr></thead>`;

  const tbody = `<tbody>${importPreviewRows.slice(0, 20).map((row, i) =>
    `<tr style="background:${i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)'};">
      ${gosterilecek.map(k => `<td style="${tdStyle}">${row[k] ?? ''}</td>`).join('')}
    </tr>`
  ).join('')}${importPreviewRows.length > 20 ?
    `<tr><td colspan="${gosterilecek.length}" style="${tdStyle}color:var(--text3);text-align:center;">
      ... ve ${importPreviewRows.length - 20} satır daha
    </td></tr>` : ''}</tbody>`;

  table.innerHTML = thead + tbody;
}

// ── MOD SEÇ ───────────────────────────────────────────────────────────────────
function setImportMode(mode) {
  importMode = mode;
  const ekleEl     = document.getElementById('import-mode-ekle');
  const guncelleEl = document.getElementById('import-mode-guncelle');
  if (!ekleEl || !guncelleEl) return;

  if (mode === 'ekle') {
    ekleEl.style.border     = '1.5px solid var(--accent)';
    ekleEl.style.background = 'var(--accent-dim)';
    ekleEl.querySelector('div').style.color = 'var(--accent-text)';
    guncelleEl.style.border     = '1.5px solid var(--border2)';
    guncelleEl.style.background = 'var(--surface2)';
    guncelleEl.querySelector('div').style.color = 'var(--text)';
    document.getElementById('importBtn').textContent = '⬆ Ekle';
  } else {
    guncelleEl.style.border     = '1.5px solid var(--accent)';
    guncelleEl.style.background = 'var(--accent-dim)';
    guncelleEl.querySelector('div').style.color = 'var(--accent-text)';
    ekleEl.style.border     = '1.5px solid var(--border2)';
    ekleEl.style.background = 'var(--surface2)';
    ekleEl.querySelector('div').style.color = 'var(--text)';
    document.getElementById('importBtn').textContent = '✏️ Güncelle';
  }
}

// ── AKTAR ─────────────────────────────────────────────────────────────────────
async function doImport() {
  if (!importPreviewRows.length) return;

  const btn = document.getElementById('importBtn');
  btn.textContent = '⏳ İşleniyor...';
  btn.disabled = true;

  try {
    const token   = sessionStorage.getItem('fa_auth_token');
    const url     = importMode === 'guncelle'
      ? '/api/shipments/bulk-update'
      : '/api/shipments/bulk-import';

    const resp = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify({ rows: importPreviewRows }),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');

    let msg;
    if (importMode === 'guncelle') {
      msg = `✓ ${data.guncellenen} kayıt güncellendi.`;
      if (data.atlanan) msg += ` ${data.atlanan} satır atlandı (eşleşme yok).`;
    } else {
      msg = `✓ ${data.eklenen} kayıt eklendi.`;
      if (data.atlanan) msg += ` ${data.atlanan} satır atlandı (duplicate).`;
    }

    showImportStatus('success', msg);
    if (data.hatalar && data.hatalar.length) {
      console.warn('Import uyarıları:', data.hatalar);
    }
    setTimeout(() => sidebarSelect('sevkiyatlar'), 1500);

  } catch (err) {
    showImportStatus('error', '⚠ ' + err.message);
  } finally {
    btn.textContent = importMode === 'guncelle' ? '✏️ Güncelle' : '⬆ Ekle';
    btn.disabled = false;
  }
}

// ── SIFIRLA ───────────────────────────────────────────────────────────────────
function resetImport() {
  importExcelHeaders = [];
  importRawRows      = [];
  importMapping      = {};
  importPreviewRows  = [];
  importMode         = 'ekle';
  showImportStep(1);
  showImportStatus('', '');
  const input = document.getElementById('importFileInput');
  if (input) input.value = '';
  const dz = document.getElementById('importDropZone');
  if (dz) dz.classList.remove('loaded');
}

// ── STATUS ────────────────────────────────────────────────────────────────────
function openImportModal() {
  document.getElementById('import-overlay').style.display = 'block';
  document.getElementById('import-modal').style.display   = 'flex';
  initImportPanel();
}

function closeImportModal() {
  document.getElementById('import-overlay').style.display = 'none';
  document.getElementById('import-modal').style.display   = 'none';
}

function showImportStatus(type, html) {
  const sb = document.getElementById('importStatus');
  if (!sb) return;
  sb.className = type ? `status-box visible ${type}` : 'status-box';
  sb.innerHTML = html;
}

// ── SEKME GEÇİŞİ ─────────────────────────────────────────────────────────────
function switchImportTab(tab) {
  const tabs = ['excel', 'aksu'];
  tabs.forEach(t => {
    const btn     = document.getElementById('import-tab-' + t);
    const content = document.getElementById('import-tab-content-' + t);
    if (!btn || !content) return;
    const active = t === tab;
    btn.style.color       = active ? 'var(--accent)' : 'var(--text3)';
    btn.style.borderBottom = active ? '2px solid var(--accent)' : '2px solid transparent';
    content.style.display  = active ? 'block' : 'none';
  });
}

// ── AKSU PDF YÜKLE ────────────────────────────────────────────────────────────
async function handleAksuPdf(file) {
  if (!file) return;

  const statusEl = document.getElementById('aksuStatus');
  const resultEl = document.getElementById('aksu-result');
  statusEl.className = 'status-box visible info';
  statusEl.innerHTML = '⏳ PDF okunuyor ve eşleştiriliyor...';
  resultEl.style.display = 'none';

  try {
    const b     = await file.arrayBuffer();
    const bytes = new Uint8Array(b);
    let s = '';
    for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
    const pdf_b64 = btoa(s);

    const token = sessionStorage.getItem('fa_auth_token');
    const resp  = await fetch('/api/shipments/parse-aksu-pdf', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify({ pdf: pdf_b64 }),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);

    statusEl.className = 'status-box visible success';
    statusEl.innerHTML = `✓ ${data.eslesen} kayıt güncellendi, ${data.atlanan} atlandı.`;

    if (data.hatalar && data.hatalar.length) {
      resultEl.style.display = 'block';
      resultEl.innerHTML = `
        <div style="font-size:12px;font-weight:600;color:var(--text3);margin-bottom:8px;">Detaylar:</div>
        ${data.hatalar.map(h =>
          `<div style="font-size:12px;color:${h.startsWith('✓') ? 'var(--success)' : 'var(--text3)'};padding:4px 0;border-bottom:0.5px solid var(--border);">${h.startsWith('✓') ? '' : '⚠ '}${h}</div>`
        ).join('')}
      `;
    }

    if (data.eslesen > 0) {
      loadShipments();
    }

  } catch (err) {
    statusEl.className = 'status-box visible error';
    statusEl.innerHTML = '⚠ ' + err.message;
  }
}