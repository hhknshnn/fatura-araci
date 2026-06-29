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
  brokerage_eur:         ['brokerage fee', 'brokerage eur', 'brokerage fee eur', 'brokerage fee (ulke gumrukleme masrafi)', 'brokerage fee (ulke gumrukleme masrafi) eur'],
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
  brokerage_eur:         'Brokerage Fee & Other Costs EUR',
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
      <button id="import-tab-fr" onclick="switchImportTab('fr')"
        style="padding:8px 18px;border:none;background:transparent;font-family:var(--font);
               font-size:13px;font-weight:600;color:var(--text3);border-bottom:2px solid transparent;
               margin-bottom:-1.5px;cursor:pointer;">
        📄 FR PDF Import
      </button>
      <button id="import-tab-palet" onclick="switchImportTab('palet')"
        style="padding:8px 18px;border:none;background:transparent;font-family:var(--font);
               font-size:13px;font-weight:600;color:var(--text3);border-bottom:2px solid transparent;
               margin-bottom:-1.5px;cursor:pointer;">
        📦 Palet Güncelle
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

  <!-- FR PDF Sekmesi -->
    <div id="import-tab-content-fr" style="display:none;">
      <div class="panel-title">FR Fatura Import</div>
      <div class="panel-desc">PDF ve/veya Excel dosyalarını aynı alana sürükleyin. PDF'ten fatura no, tarih, tutar ve palet okunur; Excel varsa tüm alanlar oradan tamamlanır.</div>

      <div class="status-box" id="frStatus"></div>

      <!-- Adım 1: Yükle -->
      <div id="fr-step1">
        <div id="fr-drop-zone"
          ondragover="event.preventDefault();this.classList.add('vergi-drag-over')"
          ondragleave="this.classList.remove('vergi-drag-over')"
          ondrop="event.preventDefault();this.classList.remove('vergi-drag-over');handleFrFiles(event.dataTransfer.files)"
          onclick="document.getElementById('fr-file-input').click()"
          style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                 gap:10px;padding:32px 20px;background:var(--surface2);
                 border:1.5px dashed var(--border2);border-radius:var(--radius-md);
                 cursor:pointer;transition:border-color 0.15s,background 0.15s;text-align:center;">
          <input type="file" id="fr-file-input" accept=".pdf,.xlsx,.xls" multiple style="display:none;"
            onchange="handleFrFiles(this.files)">
          <span style="font-size:32px;">📂</span>
          <div style="font-size:13px;font-weight:600;color:var(--text);">PDF ve/veya Excel dosyalarını sürükleyin veya tıklayın</div>
          <div style="font-size:12px;color:var(--text3);">Çoklu seçim desteklenir — ANT, IHR ve Excel formatları</div>
          <div style="display:flex;gap:6px;margin-top:4px;">
            <span class="drop-pill">.pdf</span>
            <span class="drop-pill">.xlsx</span>
            <span class="drop-pill">.xls</span>
          </div>
        </div>

        <!-- Yüklenen dosyalar listesi -->
        <div id="fr-files-list" style="display:none;margin-top:12px;"></div>

        <button id="fr-parse-btn" onclick="parseFrFiles()"
          style="display:none;margin-top:12px;width:100%;padding:10px;border-radius:var(--radius-md);
                 border:none;background:var(--accent);color:#fff;font-family:var(--font);
                 font-size:13px;font-weight:600;cursor:pointer;">
          ▶ Dosyaları İşle
        </button>
      </div>

      <!-- Adım 2: Önizleme -->
      <div id="fr-step2" style="display:none;margin-top:16px;">
        <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px;">Önizleme</div>
        <div style="font-size:12px;color:var(--text3);margin-bottom:12px;" id="fr-preview-desc"></div>

        <!-- Ülke + EUR kuru -->
        <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
          <div style="flex:1;min-width:160px;padding:12px 16px;background:var(--surface2);
                      border-radius:var(--radius-md);border:0.5px solid var(--border2);">
            <div style="font-size:11px;font-weight:600;color:var(--text3);margin-bottom:6px;text-transform:uppercase;">Ülke</div>
            <select id="fr-ulke-select"
              style="width:100%;padding:6px 8px;border-radius:var(--radius-sm);border:0.5px solid var(--border2);
                     background:var(--surface);color:var(--text);font-family:var(--font);font-size:12px;outline:none;">
              <option value="IRAK">Irak</option>
              <option value="KIBRIS">Kıbrıs</option>
              <option value="LİBYA">Libya</option>
              <option value="LİBERYA">Liberya</option>
              <option value="LÜBNAN">Lübnan</option>
              <option value="ÖZBEKİSTAN">Özbekistan</option>
              <option value="RUSYA">Rusya</option>
              <option value="SIRBİSTAN">Sırbistan</option>
              <option value="BOSNA">Bosna</option>
              <option value="GÜRCİSTAN">Gürcistan</option>
              <option value="KOSOVA">Kosova</option>
              <option value="MAKEDONYA">Makedonya</option>
              <option value="BELÇİKA">Belçika</option>
              <option value="ALMANYA">Almanya</option>
              <option value="HOLLANDA">Hollanda</option>
              <option value="KAZAKİSTAN">Kazakistan</option>
            </select>
          </div>
          <div style="flex:1;min-width:160px;padding:12px 16px;background:var(--surface2);
                      border-radius:var(--radius-md);border:0.5px solid var(--border2);">
            <div style="font-size:11px;font-weight:600;color:var(--text3);margin-bottom:6px;text-transform:uppercase;">EUR Kuru (TL)</div>
            <div style="display:flex;align-items:center;gap:8px;">
              <div id="fr-eur-kuru-display" style="font-size:13px;font-weight:600;color:var(--accent);">⏳</div>
              <input type="hidden" id="fr-eur-kuru">
            </div>
          </div>
        </div>

        <div style="overflow-x:auto;margin-bottom:14px;">
          <table id="fr-preview-table"
            style="width:max-content;min-width:100%;border-collapse:collapse;font-size:11px;"></table>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn-secondary" id="fr-import-btn" onclick="doFrImport()">⬆ Aktar</button>
          <button class="btn-ghost" onclick="resetFrImport()">← Yeni Dosyalar</button>
        </div>
      </div>
    </div>

  <!-- Palet Güncelle Sekmesi -->
    <div id="import-tab-content-palet" style="display:none;">
      <div class="panel-title">Palet Güncelle</div>
      <div class="panel-desc">ANT/IHR fatura PDF'lerini yükle — fatura no eşleşimine göre palet alanı güncellenir.</div>

      <div class="status-box" id="paletStatus"></div>

      <!-- Adım 1: Yükle -->
      <div id="palet-step1">
        <div id="palet-drop-zone"
          ondragover="event.preventDefault();this.classList.add('vergi-drag-over')"
          ondragleave="this.classList.remove('vergi-drag-over')"
          ondrop="event.preventDefault();this.classList.remove('vergi-drag-over');handlePaletPdfDrop(event.dataTransfer.files)"
          onclick="document.getElementById('palet-pdf-input').click()"
          style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                 gap:10px;padding:32px 20px;background:var(--surface2);
                 border:1.5px dashed var(--border2);border-radius:var(--radius-md);
                 cursor:pointer;transition:border-color 0.15s,background 0.15s;text-align:center;">
          <input type="file" id="palet-pdf-input" accept=".pdf" multiple style="display:none;"
            onchange="handlePaletPdfDrop(this.files)">
          <span style="font-size:32px;">📦</span>
          <div style="font-size:13px;font-weight:600;color:var(--text);">PDF'leri buraya sürükleyin veya tıklayın</div>
          <div style="font-size:12px;color:var(--text3);">Çoklu seçim desteklenir — ANT ve IHR formatları</div>
        </div>
      </div>

      <!-- Adım 2: Önizleme -->
      <div id="palet-step2" style="display:none;margin-top:16px;">
        <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px;">Önizleme</div>
        <div style="font-size:12px;color:var(--text3);margin-bottom:10px;" id="palet-preview-desc"></div>
        <div style="overflow-x:auto;margin-bottom:14px;">
          <table id="palet-preview-table" style="width:100%;border-collapse:collapse;font-size:11px;"></table>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn-secondary" id="palet-import-btn" onclick="doPaletImport()">📦 Palet Güncelle</button>
          <button class="btn-ghost" onclick="resetPaletImport()">← Yeni Dosyalar</button>
        </div>
      </div>
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
    .replace(/\r\n/g, ' ').replace(/\r/g, ' ').replace(/\n/g, ' ')
    .replace(/İ/g, 'I').replace(/ı/g, 'i')
    .toLowerCase()
    .replace(/i̇/g, 'i').replace(/I/g, 'i')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');

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

  // \r\n içeren key'leri normalize et — XLSX.js \r\n, importMapping \n kullanıyor
  const normalizeKey = s => String(s).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const normalizedRowCache = importRawRows.map(row => {
    const normalized = {};
    for (const [k, v] of Object.entries(row)) {
      normalized[normalizeKey(k)] = v;
    }
    return normalized;
  });

  importPreviewRows = normalizedRowCache.map(row => {
    const mapped = {};
    for (const [dbCol, excelHeader] of Object.entries(importMapping)) {
      if (excelHeader && excelHeader !== '(Eşleştirme)') {
        const normHeader = normalizeKey(excelHeader);
        const raw = row[normHeader] ?? '';
        mapped[dbCol] = String(raw).replace(/€\s*/g, '').replace(/^\s+|\s+$/g, '') || '';
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

  // Sabit sütunlar — her zaman göster (boş olsa bile)
  const zorunlu = ['ulke', 'ihracat_dosya_no', 'fatura_no', 'nakliye_firmasi', 'plaka', 'yukleme_tarihi', 'durum'];
  // EUR sütunları — her zaman göster, boşsa uyarı ver
  const eurSutunlar = ['fatura_bedeli_eur', 'mal_bedeli_eur', 'navlun_eur',
                       'sigorta_eur', 'ihracat_beyanname_eur', 'brokerage_eur',
                       'gumruk_vergisi_eur', 'kdv_eur', 'toplam_maliyet_eur', 'eur_kuru'];
  const gosterilecek = [...zorunlu, ...eurSutunlar];

  // Hangi EUR sütunları tamamen boş?
  const tamBosSutunlar = new Set(
    eurSutunlar.filter(k => !importPreviewRows.some(r => r[k] && String(r[k]).trim()))
  );

  const thStyle = 'padding:6px 10px;background:var(--surface2);border:0.5px solid var(--border2);' +
                  'font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;white-space:nowrap;';
  const thBosStyle = 'padding:6px 10px;background:#FFF3F3;border:0.5px solid #FECACA;' +
                     'font-size:10px;font-weight:600;color:#EF4444;text-transform:uppercase;white-space:nowrap;';
  const tdStyle = 'padding:5px 10px;border:0.5px solid var(--border);font-size:11px;white-space:nowrap;';
  const tdBosStyle = 'padding:5px 10px;border:0.5px solid #FECACA;font-size:11px;white-space:nowrap;' +
                     'background:#FFF8F8;color:#FCA5A5;text-align:center;';

  const thead = `<thead>
    <tr>${gosterilecek.map(k =>
      `<th style="${tamBosSutunlar.has(k) ? thBosStyle : thStyle}">
        ${KOLON_ETIKETLER[k] || k}${tamBosSutunlar.has(k) ? ' ⚠' : ''}
      </th>`).join('')}
    </tr>
  </thead>`;

  const tbody = `<tbody>${importPreviewRows.slice(0, 20).map((row, i) =>
    `<tr style="background:${i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)'};">
      ${gosterilecek.map(k => {
        const val = row[k];
        const bos = !val || !String(val).trim();
        if (eurSutunlar.includes(k) && bos) {
          return `<td style="${tdBosStyle}">—</td>`;
        }
        return `<td style="${tdStyle}">${val ?? ''}</td>`;
      }).join('')}
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
  const tabs = ['excel', 'aksu', 'fr', 'palet'];
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
// ── FR IMPORT FONKSİYONLARI ───────────────────────────────────────────────────
let frSonuclar  = [];   // önizleme satırları
let frPdfFiles  = [];   // File[] — PDF dosyaları
let frExcelRows = [];   // Excel'den parse edilmiş satırlar (fatura_no key'li map)

// Dosya seçimi — PDF ve Excel karıştırılabilir
async function handleFrFiles(files) {
  if (!files || !files.length) return;

  frPdfFiles  = [];
  frExcelRows = [];

  const listEl  = document.getElementById('fr-files-list');
  const parseBtn = document.getElementById('fr-parse-btn');

  const pdfList   = [];
  const excelList = [];

  for (const f of files) {
    const ext = f.name.split('.').pop().toLowerCase();
    if (ext === 'pdf') pdfList.push(f);
    else if (ext === 'xlsx' || ext === 'xls') excelList.push(f);
  }

  frPdfFiles = pdfList;

  // Excel varsa hemen parse et
  if (excelList.length) {
    for (const excelFile of excelList) {
      const buf  = await excelFile.arrayBuffer();
      const wb   = XLSX.read(buf, { type: 'array', cellDates: true });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      for (const row of rows) {
        // fatura_no key'ini normalize ederek bul
        const faturaNo = _frFindField(row, ['fatura no', 'faturano', 'invoice no', 'fatura_no']);
        if (faturaNo) frExcelRows[String(faturaNo).trim()] = row;
      }
    }
  }

  // Dosya listesini göster
  const total = pdfList.length + excelList.length;
  listEl.style.display = 'block';
  listEl.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:6px;">
      ${[...pdfList, ...excelList].map(f => `
        <div style="display:flex;align-items:center;gap:8px;padding:7px 12px;
                    background:var(--surface2);border-radius:var(--radius-md);
                    border:0.5px solid var(--border2);">
          <span style="font-size:16px;">${f.name.endsWith('.pdf') ? '📄' : '📊'}</span>
          <span style="font-size:12px;color:var(--text);flex:1;">${f.name}</span>
          <span style="font-size:11px;color:var(--text3);">${(f.size/1024).toFixed(0)} KB</span>
        </div>`).join('')}
    </div>
    <div style="font-size:12px;color:var(--text3);margin-top:8px;">
      ${pdfList.length} PDF, ${excelList.length} Excel — toplam ${total} dosya
    </div>`;

  parseBtn.style.display = total > 0 ? 'block' : 'none';
}

// Fatura numarasına göre key normalize
function _frFindField(row, aliases) {
  const normalize = s => String(s).toLowerCase()
    .replace(/\r\n|\r|\n/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/[İı]/g, 'i').replace(/[Şş]/g, 's').replace(/[Ğğ]/g, 'g')
    .replace(/[Üü]/g, 'u').replace(/[Öö]/g, 'o').replace(/[Çç]/g, 'c');

  for (const key of Object.keys(row)) {
    const nk = normalize(key);
    if (aliases.some(a => nk === normalize(a) || nk.includes(normalize(a)))) {
      const v = row[key];
      if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim();
    }
  }
  return null;
}

// PDF + Excel işle → önizleme oluştur
async function parseFrFiles() {
  const statusEl  = document.getElementById('frStatus');
  const parseBtn  = document.getElementById('fr-parse-btn');
  parseBtn.textContent = '⏳ İşleniyor...';
  parseBtn.disabled = true;

  statusEl.className = 'status-box visible info';
  statusEl.innerHTML = '⏳ Dosyalar işleniyor...';

  try {
    frSonuclar = [];

    // PDF varsa backend'e gönder
    if (frPdfFiles.length) {
      const pdfs = [];
      for (const file of frPdfFiles) {
        const b64 = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = e => res(e.target.result.split(',')[1]);
          r.onerror = () => rej(new Error('Dosya okunamadı'));
          r.readAsDataURL(file);
        });
        pdfs.push({ name: file.name, data: b64 });
      }

      const token = sessionStorage.getItem('fa_auth_token');
      const resp  = await fetch('/api/shipments/parse-fr-pdf', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body:    JSON.stringify({ pdfs }),
      });
      const data = await resp.json();
      if (!data.success) throw new Error(data.error);

      for (const s of data.sonuclar) {
        const row = { ...s };

        // Excel verisi varsa PDF'teki boş alanları tamamla
        const excelRow = s.fatura_no ? frExcelRows[s.fatura_no] : null;
        if (excelRow) {
          const _get = (aliases) => _frFindField(excelRow, aliases) || '';
          row.ihracat_dosya_no  = row.ihracat_dosya_no  || _get(['ihracat dosya no', 'dosya no']);
          row.nakliye_firmasi   = row.nakliye_firmasi   || _get(['nakliye firmasi', 'nakliye firması', 'nakliye']);
          row.plaka             = row.plaka             || _get(['plaka']);
          row.fatura_bedeli_tl  = row.fatura_bedeli_tl  || parseFloat(String(_get(['fatura bedeli tl'])).replace(/[^\d,]/g, '').replace(',', '.')) || 0;
          row.fatura_bedeli_usd = row.fatura_bedeli_usd || parseFloat(String(_get(['fatura bedeli usd', 'fatura bedeli doviz'])).replace(/[^\d,]/g, '').replace(',', '.')) || 0;
          row.navlun_eur        = parseFloat(String(_get(['navlun eur', 'navlun usd', 'freight'])).replace(/[^\d,]/g, '').replace(',', '.')) || 0;
          row.sigorta_eur       = parseFloat(String(_get(['sigorta eur', 'sigorta usd'])).replace(/[^\d,]/g, '').replace(',', '.')) || 0;
          row.mal_bedeli_eur    = parseFloat(String(_get(['mal bedeli eur', 'malbedeli doviz'])).replace(/[^\d,]/g, '').replace(',', '.')) || 0;
          row.eur_kuru          = parseFloat(String(_get(['eur kuru', 'usd kuru', 'eur kur'])).replace(/[^\d,]/g, '').replace(',', '.')) || 0;
        }

        frSonuclar.push(row);
      }
    }

    // Sadece Excel, PDF yoksa — Excel satırlarından önizleme yap
    if (!frPdfFiles.length && Object.keys(frExcelRows).length) {
      for (const [faturaNo, excelRow] of Object.entries(frExcelRows)) {
        const _get = (aliases) => _frFindField(excelRow, aliases) || '';
        const toF  = (v) => parseFloat(String(v).replace(/[^\d,]/g, '').replace(',', '.')) || 0;

        frSonuclar.push({
          dosya_adi:         'Excel',
          fatura_no:         faturaNo,
          fatura_tipi:       faturaNo.startsWith('ANT') ? 'ANT' : 'IHR',
          para_birimi:       _get(['para birimi']) || 'TL',
          yukleme_tarihi:    _get(['yukleme tarihi', 'yükleme tarihi']),
          ihracat_dosya_no:  _get(['ihracat dosya no', 'dosya no']),
          nakliye_firmasi:   _get(['nakliye firmasi', 'nakliye firması']),
          plaka:             _get(['plaka']),
          palet:             _get(['palet']),
          fatura_bedeli_tl:  toF(_get(['fatura bedeli tl'])),
          fatura_bedeli_usd: toF(_get(['fatura bedeli usd', 'fatura bedeli doviz'])),
          navlun_eur:        toF(_get(['navlun eur', 'navlun usd', 'freight'])),
          sigorta_eur:       toF(_get(['sigorta eur', 'sigorta usd'])),
          mal_bedeli_eur:    toF(_get(['mal bedeli eur', 'malbedeli doviz'])),
          eur_kuru:          toF(_get(['eur kuru', 'usd kuru'])),
          hata:              null,
        });
      }
    }

    const basarili = frSonuclar.filter(s => !s.hata).length;
    const hatali   = frSonuclar.filter(s =>  s.hata).length;

    statusEl.className = 'status-box visible success';
    statusEl.innerHTML = `✓ ${basarili} fatura hazırlandı${hatali ? `, ${hatali} hatalı` : ''}.`;

    buildFrPreviewTable();
    document.getElementById('fr-preview-desc').textContent =
      `${basarili} fatura aktarılacak. Alanları kontrol edip Aktar'a basın.`;
    document.getElementById('fr-step1').style.display = 'none';
    document.getElementById('fr-step2').style.display = 'block';
    loadFrEurKuru();

  } catch (err) {
    statusEl.className = 'status-box visible error';
    statusEl.innerHTML = '⚠ ' + err.message;
  } finally {
    parseBtn.textContent = '▶ Dosyaları İşle';
    parseBtn.disabled = false;
  }
}

function buildFrPreviewTable() {
  const table = document.getElementById('fr-preview-table');
  if (!table) return;

  const thStyle = 'padding:6px 10px;background:var(--surface2);border:0.5px solid var(--border2);' +
                  'font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;white-space:nowrap;';
  const tdStyle = 'padding:5px 8px;border:0.5px solid var(--border);font-size:11px;white-space:nowrap;';
  const tdErrStyle = tdStyle + 'color:#EF4444;';

  const inpStyle = `width:90px;padding:4px 6px;border-radius:var(--radius-sm);
    border:0.5px solid var(--border2);background:var(--surface);
    color:var(--text);font-family:var(--font);font-size:11px;outline:none;`;

  const headers = [
    'Dosya', 'Fatura No', 'Tip', 'Tarih', 'Para Birimi', 'TL Tutar', 'EUR Tutar', 'USD Tutar', 'USD Kuru', 'EUR Kuru',
    'Navlun €', 'Sigorta €', 'Palet',
    'Dosya No', 'Nakliye', 'Plaka', 'Durum'
  ];

  const thead = `<thead><tr>${headers.map(h => `<th style="${thStyle}">${h}</th>`).join('')}</tr></thead>`;

  const tbody = `<tbody>${frSonuclar.map((s, i) => {
    const bg = i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)';
    if (s.hata) {
      return `<tr style="background:${bg};">
        <td style="${tdStyle}">${s.dosya_adi}</td>
        <td colspan="12" style="${tdErrStyle}">⚠ ${s.hata}</td>
        <td style="${tdErrStyle}">Hata</td>
      </tr>`;
    }

    const fmt = (n) => n ? parseFloat(n).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '—';

    return `<tr style="background:${bg};">
      <td style="${tdStyle};max-width:120px;overflow:hidden;text-overflow:ellipsis;" title="${s.dosya_adi}">${s.dosya_adi}</td>
      <td style="${tdStyle};font-family:var(--mono);">${s.fatura_no || '—'}</td>
      <td style="${tdStyle};">
        <span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px;
          ${(s.fatura_tipi||'').toUpperCase() === 'ANT'
            ? 'background:#FAEEDA;color:#633806;'
            : 'background:#E6F1FB;color:#0C447C;'}">
          ${s.fatura_tipi || '—'}
        </span>
      </td>
      <td style="${tdStyle}">${s.yukleme_tarihi || '—'}</td>
      <td style="${tdStyle}">${s.para_birimi || '—'}</td>
      <td style="${tdStyle}">${fmt(s.fatura_bedeli_tl)}</td>
      <td style="${tdStyle}">${fmt(s.fatura_bedeli_eur)}</td>
      <td style="${tdStyle}">${fmt(s.fatura_bedeli_usd)}</td>
      <td style="${tdStyle}">${s.usd_kuru ? parseFloat(s.usd_kuru).toFixed(4) : '—'}</td>
      <td style="${tdStyle}">${s.eur_kuru ? parseFloat(s.eur_kuru).toFixed(4) : '—'}</td>
      <td style="${tdStyle}">
        <input type="number" step="0.01" value="${s.navlun_eur || ''}" placeholder="0"
          onchange="frSonuclar[${i}].navlun_eur = parseFloat(this.value)||0"
          style="${inpStyle}">
      </td>
      <td style="${tdStyle}">
        <input type="number" step="0.01" value="${s.sigorta_eur || ''}" placeholder="0"
          onchange="frSonuclar[${i}].sigorta_eur = parseFloat(this.value)||0"
          style="${inpStyle}">
      </td>
      <td style="${tdStyle};font-weight:600;color:var(--accent);">${s.palet || '—'}</td>
      <td style="${tdStyle}">
        <input type="text" value="${s.ihracat_dosya_no || ''}" placeholder="2026-xxx"
          onchange="frSonuclar[${i}].ihracat_dosya_no = this.value.trim()"
          style="${inpStyle}">
      </td>
      <td style="${tdStyle}">
        <input type="text" value="${s.nakliye_firmasi || ''}" placeholder="Firma"
          onchange="frSonuclar[${i}].nakliye_firmasi = this.value.trim()"
          style="${inpStyle}">
      </td>
      <td style="${tdStyle}">
        <input type="text" value="${s.plaka || ''}" placeholder="Plaka"
          onchange="frSonuclar[${i}].plaka = this.value.trim()"
          style="${inpStyle}">
      </td>
      <td style="${tdStyle};color:var(--success);">✓ Hazır</td>
    </tr>`;
  }).join('')}</tbody>`;

  table.innerHTML = thead + tbody;
}

async function handleFrPdfDrop(files) {
  if (!files || !files.length) return;

  const statusEl = document.getElementById('frStatus');
  statusEl.className = 'status-box visible info';
  statusEl.innerHTML = `⏳ ${files.length} PDF okunuyor...`;

  const pdfs = [];
  for (const file of files) {
    const b64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result.split(',')[1]);
      r.onerror = () => rej(new Error('Dosya okunamadı'));
      r.readAsDataURL(file);
    });
    pdfs.push({ name: file.name, data: b64 });
  }

  try {
    const token = sessionStorage.getItem('fa_auth_token');
    const resp  = await fetch('/api/shipments/parse-fr-pdf', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify({ pdfs }),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);

    frSonuclar = data.sonuclar;

    const basarili = frSonuclar.filter(s => !s.hata).length;
    const hatali   = frSonuclar.filter(s =>  s.hata).length;

    statusEl.className = 'status-box visible success';
    statusEl.innerHTML = `✓ ${basarili} PDF parse edildi${hatali ? `, ${hatali} hatalı` : ''}.`;

    buildFrPreviewTable();
    document.getElementById('fr-preview-desc').textContent =
      `${basarili} fatura aktarılacak. EUR kurunu girin ve Aktar'a basın.`;
    document.getElementById('fr-step1').style.display = 'none';
    document.getElementById('fr-step2').style.display = 'block';
    loadFrEurKuru();

  } catch (err) {
    statusEl.className = 'status-box visible error';
    statusEl.innerHTML = '⚠ ' + err.message;
  }
}

function buildFrPreviewTable() {
  const table = document.getElementById('fr-preview-table');
  if (!table) return;

  const thStyle = 'padding:6px 10px;background:var(--surface2);border:0.5px solid var(--border2);' +
                  'font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;white-space:nowrap;';
  const tdStyle = 'padding:5px 10px;border:0.5px solid var(--border);font-size:11px;white-space:nowrap;';
  const tdErrStyle = tdStyle + 'color:#EF4444;';

  const headers = ['Dosya', 'Fatura No', 'İhracat Dosya No', 'Nakliye Firması', 'Plaka', 'Tarih', 'USD Tutar', 'USD Kuru', 'TL Tutar', 'Palet', 'Durum'];

  const thead = `<thead><tr>${headers.map(h => `<th style="${thStyle}">${h}</th>`).join('')}</tr></thead>`;

  const tbody = `<tbody>${frSonuclar.map((s, i) => {
    const bg = i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)';
    if (s.hata) {
      return `<tr style="background:${bg};">
        <td style="${tdStyle}">${s.dosya_adi}</td>
        <td colspan="8" style="${tdErrStyle}">⚠ ${s.hata}</td>
        <td style="${tdErrStyle}">Hata</td>
      </tr>`;
    }
    return `<tr style="background:${bg};">
      <td style="${tdStyle}">${s.dosya_adi}</td>
      <td style="${tdStyle}">${s.fatura_no || '—'}</td>
      <td style="${tdStyle}">
        <input type="text" placeholder="ör: 2026-284"
          value="${s.ihracat_dosya_no || ''}"
          onchange="frSonuclar[${i}].ihracat_dosya_no = this.value.trim()"
          style="width:90px;padding:4px 6px;border-radius:var(--radius-sm);
                 border:0.5px solid var(--border2);background:var(--surface);
                 color:var(--text);font-family:var(--font);font-size:11px;outline:none;">
      </td>
      <td style="${tdStyle}">
        <input type="text" placeholder="ör: RAPID"
          value="${s.nakliye_firmasi || ''}"
          onchange="frSonuclar[${i}].nakliye_firmasi = this.value.trim()"
          style="width:90px;padding:4px 6px;border-radius:var(--radius-sm);
                 border:0.5px solid var(--border2);background:var(--surface);
                 color:var(--text);font-family:var(--font);font-size:11px;outline:none;">
      </td>
      <td style="${tdStyle}">
        <input type="text" placeholder="ör: 34ABC123"
          value="${s.plaka || ''}"
          onchange="frSonuclar[${i}].plaka = this.value.trim()"
          style="width:90px;padding:4px 6px;border-radius:var(--radius-sm);
                 border:0.5px solid var(--border2);background:var(--surface);
                 color:var(--text);font-family:var(--font);font-size:11px;outline:none;">
      </td>
      <td style="${tdStyle}">${s.yukleme_tarihi || '—'}</td>
      <td style="${tdStyle}">${s.fatura_bedeli_usd ? s.fatura_bedeli_usd.toLocaleString('tr-TR', {minimumFractionDigits:2}) : '—'}</td>
      <td style="${tdStyle}">${s.usd_kuru ? s.usd_kuru.toFixed(4) : '—'}</td>
      <td style="${tdStyle}">${s.fatura_bedeli_tl ? s.fatura_bedeli_tl.toLocaleString('tr-TR', {minimumFractionDigits:2}) : '—'}</td>
      <td style="${tdStyle};font-weight:600;color:var(--accent);">${s.palet || '—'}</td>
      <td style="${tdStyle};color:var(--success);">✓ Hazır</td>
    </tr>`;
  }).join('')}</tbody>`;

  table.innerHTML = thead + tbody;
}

async function doFrImport() {
  const eur_kuru    = parseFloat(document.getElementById('fr-eur-kuru')?.value || '0');
  const usd_per_eur = parseFloat(document.getElementById('fr-eur-kuru')?.dataset?.usdPerEur || '0');
  const ulke        = document.getElementById('fr-ulke-select')?.value || 'IRAK';

  if (!eur_kuru) {
    document.getElementById('frStatus').className = 'status-box visible error';
    document.getElementById('frStatus').innerHTML = '⚠ EUR kuru yüklenemedi, lütfen sayfayı yenileyin.';
    return;
  }

  const aktarilacak = frSonuclar.filter(s => !s.hata && s.fatura_no);
  if (!aktarilacak.length) {
    document.getElementById('frStatus').className = 'status-box visible error';
    document.getElementById('frStatus').innerHTML = '⚠ Aktarılacak geçerli fatura yok.';
    return;
  }

  const btn = document.getElementById('fr-import-btn');
  btn.textContent = '⏳ Aktarılıyor...';
  btn.disabled = true;

  try {
    const rows = aktarilacak.map(s => ({
      ...s,
      ulke,
      eur_kuru,
      usd_per_eur,
      ihracat_dosya_no: s.ihracat_dosya_no || '',
      nakliye_firmasi:  s.nakliye_firmasi  || '',
      plaka:            s.plaka            || '',
      navlun_eur:       s.navlun_eur       || 0,
      sigorta_eur:      s.sigorta_eur      || 0,
    }));

    const token = sessionStorage.getItem('fa_auth_token');
    const resp  = await fetch('/api/shipments/bulk-import-fr', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify({ rows }),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);

    let msg = `✓ ${data.eklenen} fatura eklendi.`;
    if (data.atlanan) msg += ` ${data.atlanan} atlandı (duplicate).`;
    if (data.hatalar?.length) console.warn('FR import uyarıları:', data.hatalar);

    document.getElementById('frStatus').className = 'status-box visible success';
    document.getElementById('frStatus').innerHTML = msg;

    if (data.eklenen > 0) setTimeout(() => sidebarSelect('sevkiyatlar'), 1500);

  } catch (err) {
    document.getElementById('frStatus').className = 'status-box visible error';
    document.getElementById('frStatus').innerHTML = '⚠ ' + err.message;
  } finally {
    btn.textContent = '⬆ Aktar';
    btn.disabled = false;
  }
}

async function loadFrEurKuru() {
  try {
    const token = sessionStorage.getItem('fa_auth_token');
    const resp  = await fetch('/api/kur', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await resp.json();
    const eur_try = data?.kurlar?.TRY;
    const usd_per_eur = data?.kurlar?.USD;
    if (!eur_try) throw new Error('EUR kuru bulunamadı');

    document.getElementById('fr-eur-kuru').value = eur_try;
    document.getElementById('fr-eur-kuru').dataset.usdPerEur = usd_per_eur || '';
    document.getElementById('fr-eur-kuru-display').textContent = `${parseFloat(eur_try).toFixed(4)} TL`;
  } catch (e) {
    document.getElementById('fr-eur-kuru-display').textContent = '⚠ Kur alınamadı';
  }
}

function resetFrImport() {
  frSonuclar  = [];
  frPdfFiles  = [];
  frExcelRows = [];
  document.getElementById('fr-step1').style.display  = 'block';
  document.getElementById('fr-step2').style.display  = 'none';
  document.getElementById('frStatus').className = 'status-box';
  document.getElementById('frStatus').innerHTML = '';
  const filesListEl = document.getElementById('fr-files-list');
  if (filesListEl) { filesListEl.style.display = 'none'; filesListEl.innerHTML = ''; }
  const parseBtn = document.getElementById('fr-parse-btn');
  if (parseBtn) parseBtn.style.display = 'none';
  const input = document.getElementById('fr-file-input');
  if (input) input.value = '';
}

function setFrMode(mode) {
  frMode = mode;
  const importEl = document.getElementById('fr-mode-import');
  const paletEl  = document.getElementById('fr-mode-palet');
  const btn      = document.getElementById('fr-import-btn');
  if (!importEl || !paletEl) return;

  if (mode === 'import') {
    importEl.style.border     = '1.5px solid var(--accent)';
    importEl.style.background = 'var(--accent-dim)';
    importEl.querySelector('div').style.color = 'var(--accent-text)';
    paletEl.style.border     = '1.5px solid var(--border2)';
    paletEl.style.background = 'var(--surface2)';
    paletEl.querySelector('div').style.color = 'var(--text)';
    if (btn) btn.textContent = '⬆ Yeni Kayıt Ekle';
  } else {
    paletEl.style.border     = '1.5px solid var(--accent)';
    paletEl.style.background = 'var(--accent-dim)';
    paletEl.querySelector('div').style.color = 'var(--accent-text)';
    importEl.style.border     = '1.5px solid var(--border2)';
    importEl.style.background = 'var(--surface2)';
    importEl.querySelector('div').style.color = 'var(--text)';
    if (btn) btn.textContent = '📦 Palet Güncelle';
  }
}

// ── PALET GÜNCELLE FONKSİYONLARI ─────────────────────────────────────────────
let paletSonuclar = [];

async function handlePaletPdfDrop(files) {
  if (!files || !files.length) return;

  const statusEl = document.getElementById('paletStatus');
  statusEl.className = 'status-box visible info';
  statusEl.innerHTML = `⏳ ${files.length} PDF okunuyor...`;

  const pdfs = [];
  for (const file of files) {
    const b64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result.split(',')[1]);
      r.onerror = () => rej(new Error('Dosya okunamadı'));
      r.readAsDataURL(file);
    });
    pdfs.push({ name: file.name, data: b64 });
  }

  try {
    const token = sessionStorage.getItem('fa_auth_token');
    const resp  = await fetch('/api/shipments/parse-fr-pdf', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify({ pdfs }),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);

    paletSonuclar = data.sonuclar;

    const basarili = paletSonuclar.filter(s => !s.hata && s.palet).length;
    const hatali   = paletSonuclar.filter(s =>  s.hata || !s.palet).length;

    statusEl.className = 'status-box visible success';
    statusEl.innerHTML = `✓ ${basarili} PDF parse edildi${hatali ? `, ${hatali} palet bulunamadı` : ''}.`;

    buildPaletPreviewTable();
    document.getElementById('palet-preview-desc').textContent =
      `${basarili} kayıt güncellenecek.`;
    document.getElementById('palet-step1').style.display = 'none';
    document.getElementById('palet-step2').style.display = 'block';

  } catch (err) {
    statusEl.className = 'status-box visible error';
    statusEl.innerHTML = '⚠ ' + err.message;
  }
}

function buildPaletPreviewTable() {
  const table = document.getElementById('palet-preview-table');
  if (!table) return;

  const thStyle = 'padding:6px 10px;background:var(--surface2);border:0.5px solid var(--border2);' +
                  'font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;white-space:nowrap;';
  const tdStyle = 'padding:5px 10px;border:0.5px solid var(--border);font-size:11px;white-space:nowrap;';
  const tdErrStyle = tdStyle + 'color:#EF4444;';

  const headers = ['Dosya', 'Fatura No', 'Palet'];
  const thead = `<thead><tr>${headers.map(h => `<th style="${thStyle}">${h}</th>`).join('')}</tr></thead>`;

  const tbody = `<tbody>${paletSonuclar.map((s, i) => {
    const bg = i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)';
    if (s.hata || !s.palet) {
      return `<tr style="background:${bg};">
        <td style="${tdStyle}">${s.dosya_adi}</td>
        <td style="${tdStyle}">${s.fatura_no || '—'}</td>
        <td style="${tdErrStyle}">⚠ ${s.hata || 'Palet bulunamadı'}</td>
      </tr>`;
    }
    return `<tr style="background:${bg};">
      <td style="${tdStyle}">${s.dosya_adi}</td>
      <td style="${tdStyle}">${s.fatura_no || '—'}</td>
      <td style="${tdStyle};font-weight:600;color:var(--accent);">${s.palet}</td>
    </tr>`;
  }).join('')}</tbody>`;

  table.innerHTML = thead + tbody;
}

async function doPaletImport() {
  const aktarilacak = paletSonuclar.filter(s => !s.hata && s.fatura_no && s.palet);
  if (!aktarilacak.length) {
    document.getElementById('paletStatus').className = 'status-box visible error';
    document.getElementById('paletStatus').innerHTML = '⚠ Güncellenecek geçerli kayıt yok.';
    return;
  }

  const btn = document.getElementById('palet-import-btn');
  btn.textContent = '⏳ Güncelleniyor...';
  btn.disabled = true;

  try {
    const rows  = aktarilacak.map(s => ({ fatura_no: s.fatura_no, palet: s.palet }));
    const token = sessionStorage.getItem('fa_auth_token');
    const resp  = await fetch('/api/shipments/bulk-update-palet', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify({ rows }),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);

    let msg = `✓ ${data.guncellenen} kayıt güncellendi.`;
    if (data.atlanan) msg += ` ${data.atlanan} atlandı.`;

    document.getElementById('paletStatus').className = 'status-box visible success';
    document.getElementById('paletStatus').innerHTML = msg;
    if (data.guncellenen > 0) setTimeout(() => sidebarSelect('sevkiyatlar'), 1500);

  } catch (err) {
    document.getElementById('paletStatus').className = 'status-box visible error';
    document.getElementById('paletStatus').innerHTML = '⚠ ' + err.message;
  } finally {
    btn.textContent = '📦 Palet Güncelle';
    btn.disabled = false;
  }
}

function resetPaletImport() {
  paletSonuclar = [];
  document.getElementById('palet-step1').style.display = 'block';
  document.getElementById('palet-step2').style.display = 'none';
  document.getElementById('paletStatus').className = 'status-box';
  document.getElementById('paletStatus').innerHTML = '';
  const input = document.getElementById('palet-pdf-input');
  if (input) input.value = '';
}

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
