// ── TASLAK.JS ─────────────────────────────────────────────────────────────────
// Taslak Doldur işlemi: form yönetimi, API çağrısı, dosya indirme.
// Fatura Öncesi → Taslak Doldur akışı buradan yönetilir.

// ── TASLAK ÜLKE CONFIG ────────────────────────────────────────────────────────
// Her ülke için form alanları tanımlanır.
// Yeni ülke eklemek için buraya ekle + config/ klasörüne JSON ekle.
const TASLAK_ULKELER = {
  rs: {
    label:    'Sırbistan',
    flag:     'rs',
    template: 'templates/taslak_rs.xlsx',
    alanlar: [
      { id: 'referansNo', label: 'Referans No',      tip: 'text',   prefix: '2026-', placeholder: 'örn: 100' },
      { id: 'navlun',     label: 'Navlun (EUR)',      tip: 'number', placeholder: 'örn: 3100,00' },
      { id: 'sigorta',    label: 'Sigorta (EUR)',      tip: 'number', placeholder: 'örn: 14,00' },
      { id: 'kap',        label: 'Kap Sayısı',        tip: 'number', placeholder: 'örn: 28' },
      { id: 'brutKg',     label: 'Toplam BRÜT (kg)',  tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg',      label: 'Toplam NET (kg)',    tip: 'number', placeholder: 'Otomatik hesaplanır' },
    ]
  },
  ba: {
    label:    'Bosna',
    flag:     'ba',
    template: 'templates/taslak_rs.xlsx',
        alanlar: [
      { id: 'referansNo', label: 'Referans No',      tip: 'text',   prefix: '2026-', placeholder: 'örn: 100' },
      { id: 'navlun',     label: 'Navlun (EUR)',      tip: 'number', placeholder: 'örn: 3100,00' },
      { id: 'sigorta',    label: 'Sigorta (EUR)',      tip: 'number', placeholder: 'örn: 14,00' },
      { id: 'kap',        label: 'Kap Sayısı',        tip: 'number', placeholder: 'örn: 28' },
      { id: 'brutKg',     label: 'Toplam BRÜT (kg)',  tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg',      label: 'Toplam NET (kg)',    tip: 'number', placeholder: 'Otomatik hesaplanır' },
    ]
  },
  ge: {
    label:    'Gürcistan',
    flag:     'ge',
    template: 'templates/taslak_rs.xlsx',
        alanlar: [
      { id: 'referansNo', label: 'Referans No',      tip: 'text',   prefix: '2026-', placeholder: 'örn: 100' },
      { id: 'navlun',     label: 'Navlun (EUR)',      tip: 'number', placeholder: 'örn: 3100,00' },
      { id: 'sigorta',    label: 'Sigorta (EUR)',      tip: 'number', placeholder: 'örn: 14,00' },
      { id: 'kap',        label: 'Kap Sayısı',        tip: 'number', placeholder: 'örn: 28' },
      { id: 'brutKg',     label: 'Toplam BRÜT (kg)',  tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg',      label: 'Toplam NET (kg)',    tip: 'number', placeholder: 'Otomatik hesaplanır' },
    ]
  },
  xk: {
    label:    'Kosova',
    flag:     'xk',
    template: 'templates/taslak_rs.xlsx',
        alanlar: [
      { id: 'referansNo', label: 'Referans No',      tip: 'text',   prefix: '2026-', placeholder: 'örn: 100' },
      { id: 'navlun',     label: 'Navlun (EUR)',      tip: 'number', placeholder: 'örn: 3100,00' },
      { id: 'sigorta',    label: 'Sigorta (EUR)',      tip: 'number', placeholder: 'örn: 14,00' },
      { id: 'kap',        label: 'Kap Sayısı',        tip: 'number', placeholder: 'örn: 28' },
      { id: 'brutKg',     label: 'Toplam BRÜT (kg)',  tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg',      label: 'Toplam NET (kg)',    tip: 'number', placeholder: 'Otomatik hesaplanır' },
    ]
  },
  mk: {
    label:    'Makedonya',
    flag:     'mk',
    template: 'templates/taslak_rs.xlsx',
        alanlar: [
      { id: 'referansNo', label: 'Referans No',      tip: 'text',   prefix: '2026-', placeholder: 'örn: 100' },
      { id: 'navlun',     label: 'Navlun (EUR)',      tip: 'number', placeholder: 'örn: 3100,00' },
      { id: 'sigorta',    label: 'Sigorta (EUR)',      tip: 'number', placeholder: 'örn: 14,00' },
      { id: 'kap',        label: 'Kap Sayısı',        tip: 'number', placeholder: 'örn: 28' },
      { id: 'brutKg',     label: 'Toplam BRÜT (kg)',  tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg',      label: 'Toplam NET (kg)',    tip: 'number', placeholder: 'Otomatik hesaplanır' },
    ]
  },
  be: {
    label:    'Belçika',
    flag:     'be',
    template: 'templates/taslak_be.xlsx',
    alanlar: [
      { id: 'kap',        label: 'Kap Sayısı',       tip: 'number', placeholder: 'örn: 28' },
      { id: 'brutKg',     label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg',      label: 'Toplam NET (kg)',   tip: 'number', placeholder: 'Otomatik hesaplanır' },
      { id: 'navlun',     label: 'Navlun (EUR)',      tip: 'number', placeholder: 'örn: 3100,00' },
      { id: 'sigorta',    label: 'Sigorta (EUR)',     tip: 'number', placeholder: 'örn: 14,00' },
      { id: 'referansNo', label: 'Referans No',       tip: 'text',   prefix: '2026-', placeholder: 'örn: 100' },
    ]
  },
  de: {
    label:    'Almanya',
    flag:     'de',
    template: 'templates/taslak_de.xlsx',
    alanlar: [
      { id: 'kap',        label: 'Kap Sayısı',       tip: 'number', placeholder: 'örn: 28' },
      { id: 'brutKg',     label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg',      label: 'Toplam NET (kg)',   tip: 'number', placeholder: 'Otomatik hesaplanır' },
      { id: 'navlun',     label: 'Navlun (EUR)',      tip: 'number', placeholder: 'örn: 3100,00' },
      { id: 'sigorta',    label: 'Sigorta (EUR)',     tip: 'number', placeholder: 'örn: 14,00' },
      { id: 'referansNo', label: 'Referans No',       tip: 'text',   prefix: '2026-', placeholder: 'örn: 100' },
    ]
  },
  nl: {
    label:    'Hollanda',
    flag:     'nl',
    template: 'templates/taslak_nl.xlsx',
    alanlar: [
      { id: 'kap',        label: 'Kap Sayısı',       tip: 'number', placeholder: 'örn: 28' },
      { id: 'brutKg',     label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg',      label: 'Toplam NET (kg)',   tip: 'number', placeholder: 'Otomatik hesaplanır' },
      { id: 'navlun',     label: 'Navlun (EUR)',      tip: 'number', placeholder: 'örn: 3100,00' },
      { id: 'sigorta',    label: 'Sigorta (EUR)',     tip: 'number', placeholder: 'örn: 14,00' },
      { id: 'referansNo', label: 'Referans No',       tip: 'text',   prefix: '2026-', placeholder: 'örn: 100' },
    ]
  },
  kz: {
    label:    'Kazakistan',
    flag:     'kz',
    template: 'templates/taslak_kz.xlsx',
    alanlar: [
      { id: 'navlun',     label: 'Freight (EUR)',     tip: 'number', placeholder: 'örn: 3100,00' },
      { id: 'sigorta',    label: 'Insurance (EUR)',   tip: 'number', placeholder: 'örn: 14,00' },
      { id: 'kap',        label: 'Packages',          tip: 'number', placeholder: 'örn: 28' },
      { id: 'brutKg',     label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg',      label: 'Toplam NET (kg)',   tip: 'number', placeholder: 'Otomatik hesaplanır' },
      { id: 'referansNo', label: 'Referans No',       tip: 'text',   prefix: '2026-', placeholder: 'örn: 100' },
    ]
  },
  // ── FRANCHISE ÜLKELER ──────────────────────────────────────────────────────
  cy: {
    grup: 'franchise', label: 'Kıbrıs', flag: 'cy',
    template: 'templates/taslak_cy.xlsx',
    tip: 'kibris',
    alanlar: [] // Özel form - buildKibrisForm ile oluşturulur
  },
  iq: {
    grup: 'franchise', label: 'Irak', flag: 'iq',
    template: 'templates/taslak_iq.xlsx',
    alanlar: [
      { id: 'kap',        label: 'Packages',         tip: 'text',   placeholder: 'örn: 43 (33 palet + 10 Koli)' },
      { id: 'brutKg',     label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg',      label: 'Toplam NET (kg)',   tip: 'number', placeholder: 'Otomatik hesaplanır' },
      { id: 'referansNo', label: 'Referans No',       tip: 'text',   prefix: '2026-', placeholder: 'örn: 100' },
    ]
  },
  lr: {
    grup: 'franchise', label: 'Liberya', flag: 'lr',
    template: 'templates/taslak_lr.xlsx',
    alanlar: [
      { id: 'kap',        label: 'Packages',         tip: 'text',   placeholder: 'örn: 28' },
      { id: 'brutKg',     label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg',      label: 'Toplam NET (kg)',   tip: 'number', placeholder: 'Otomatik hesaplanır' },
      { id: 'referansNo', label: 'Referans No',       tip: 'text',   prefix: '2026-', placeholder: 'örn: 100' },
    ]
  },
  ly: {
    grup: 'franchise', label: 'Libya', flag: 'ly',
    template: 'templates/taslak_ly.xlsx',
    alanlar: [
      { id: 'kap',        label: 'Packages',         tip: 'text',   placeholder: 'örn: 28' },
      { id: 'brutKg',     label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg',      label: 'Toplam NET (kg)',   tip: 'number', placeholder: 'Otomatik hesaplanır' },
      { id: 'referansNo', label: 'Referans No',       tip: 'text',   prefix: '2026-', placeholder: 'örn: 100' },
    ]
  },
  lb: {
    grup: 'franchise', label: 'Lübnan', flag: 'lb',
    template: 'templates/taslak_lb.xlsx',
    alanlar: [
      { id: 'kap',        label: 'Packages',         tip: 'text',   placeholder: 'örn: 28' },
      { id: 'brutKg',     label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg',      label: 'Toplam NET (kg)',   tip: 'number', placeholder: 'Otomatik hesaplanır' },
      { id: 'referansNo', label: 'Referans No',       tip: 'text',   prefix: '2026-', placeholder: 'örn: 100' },
    ]
  },
  uz: {
    grup: 'franchise', label: 'Özbekistan', flag: 'uz',
    template: 'templates/taslak_uz.xlsx',
    alanlar: [
      { id: 'kap',        label: 'Packages',         tip: 'text',   placeholder: 'örn: 28' },
      { id: 'brutKg',     label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg',      label: 'Toplam NET (kg)',   tip: 'number', placeholder: 'Otomatik hesaplanır' },
      { id: 'referansNo', label: 'Referans No',       tip: 'text',   prefix: '2026-', placeholder: 'örn: 100' },
    ]
  },
  ru: {
    grup: 'franchise', label: 'Rusya', flag: 'ru',
    template: 'templates/taslak_ru.xlsx',
    alanlar: [
      { id: 'kap',        label: 'Packages',         tip: 'text',   placeholder: 'örn: 28' },
      { id: 'brutKg',     label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg',      label: 'Toplam NET (kg)',   tip: 'number', placeholder: 'Otomatik hesaplanır' },
      { id: 'referansNo', label: 'Referans No',       tip: 'text',   prefix: '2026-', placeholder: 'örn: 100' },
    ]
  },
};

// ── STATE ─────────────────────────────────────────────────────────────────────
let taslakUlke     = null;   // seçili ülke kodu
let taslakBytes    = null;   // yüklenen taslak Excel'in binary verisi
let taslakDepoTipi   = null;
let menseTaslakBytes = null;   // menşe adımında yüklenen doldurulmuş taslak

// ── TASLAK PANELI BAŞLAT ──────────────────────────────────────────────────────
function initTaslakPanel() {
  // Wizard adımlarını gizle, taslak panelini göster
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById('step' + i);
    if (el) el.style.display = 'none';
  }
  document.getElementById('stepTaslak').style.display = 'block';

  // Ülke grid'ini oluştur
  buildTaslakUlkeGrid();

  // Depo tipi sıfırla
  taslakDepoTipi = null;
  taslakUlke     = null;
  taslakBytes    = null;

  document.getElementById('taslakDepoSection').style.display    = 'none';
  document.getElementById('taslakFormSection').style.display    = 'none';
  document.getElementById('taslakIndir').style.display          = 'none';
}

// ── ÜLKE GRİD ─────────────────────────────────────────────────────────────────
function buildTaslakUlkeGrid() {
  const grid = document.getElementById('taslakUlkeGrid');
  if (!grid) { return; }
  grid.innerHTML = '';

  const corporate = Object.entries(TASLAK_ULKELER).filter(([k,v]) => !v.grup || v.grup === 'corporate');
  const franchise  = Object.entries(TASLAK_ULKELER).filter(([k,v]) => v.grup === 'franchise');

  const addGroup = (title, entries) => {
    if (!entries.length) return;
    const label = document.createElement('div');
    label.style.cssText = 'grid-column:1/-1;font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:1.5px;padding:4px 0 2px;border-bottom:1px solid var(--border);margin-bottom:4px;font-family:var(--mono);';
    label.textContent = title;
    grid.appendChild(label);
    entries.forEach(([kod, cfg]) => {
      const btn = document.createElement('div');
      btn.className = 'country-btn';
      btn.id = 'taslak-ulke-' + kod;
      btn.addEventListener('click', () => selectTaslakUlke(kod));
      btn.innerHTML = `
        <div class="country-flag"><img src="https://flagcdn.com/40x30/${cfg.flag}.png"></div>
        <div class="country-name">${cfg.label}</div>`;
      grid.appendChild(btn);
    });
  };

  addGroup('Corporate Ülkeler', corporate);
  addGroup('Franchise Ülkeler', franchise);
}

// ── ÜLKE SEÇ ──────────────────────────────────────────────────────────────────
async function selectTaslakUlke(kod) {
  taslakUlke = kod;

  // Aktif ülkeyi işaretle
  document.querySelectorAll('#taslakUlkeGrid .country-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('taslak-ulke-' + kod).classList.add('active');

  // Template Excel'i otomatik yükle
  const cfg = TASLAK_ULKELER[kod];
  if (cfg.template) {
    try {
      showTaslakStatus('info', '⏳ Taslak yükleniyor...');
      const resp = await fetch('./' + cfg.template, { cache: 'no-store' });
      if (!resp.ok) throw new Error('Template bulunamadı');
      const buf = await resp.arrayBuffer();
      taslakBytes = buf;
      // Badge göster
      document.getElementById('taslakFileName').textContent = '✓ ' + cfg.label + ' taslağı yüklendi';
      document.getElementById('taslakFileName').style.display = 'inline-flex';
      showTaslakStatus('success', '<div class="stat">✓ Taslak otomatik yüklendi</div>');
    } catch(e) {
      showTaslakStatus('error', '⚠ Taslak yüklenemedi: ' + e.message);
    }
  }

  // Depo tipi seçimini göster
  document.getElementById('taslakDepoSection').style.display = 'block';
  document.getElementById('taslakFormSection').style.display = 'none';
  document.getElementById('taslakIndir').style.display       = 'none';
}

// ── DEPO TİPİ SEÇ ─────────────────────────────────────────────────────────────
function selectTaslakDepo(tip) {
  taslakDepoTipi = tip;

  document.getElementById('taslak-depo-serbest').classList.toggle('active', tip === 'serbest');
  document.getElementById('taslak-depo-antrepo').classList.toggle('active', tip === 'antrepo');

  // Formu oluştur ve göster
  buildTaslakForm();
  document.getElementById('taslakFormSection').style.display = 'block';
}

// ── FORM OLUŞTUR ──────────────────────────────────────────────────────────────
function buildTaslakForm() {
  if (!taslakUlke) return;
  const formCfg    = TASLAK_ULKELER[taslakUlke];
  const container = document.getElementById('taslakFormAlanlari');
  container.innerHTML = '';

  // Kıbrıs özel form
  if (formCfg.tip === 'kibris') {
    buildKibrisForm(container);
    if (taslakBytes) document.getElementById('taslakIndir').style.display = 'block';
    return;
  }

  formCfg.alanlar.forEach(alan => {
    const div = document.createElement('div');
    div.style.cssText = 'margin-bottom:14px;';

    // NET kg alanı için bilgi notu
    const isNetKg = alan.id === 'netKg';
    const note = isNetKg
      ? `<div style="font-family:var(--mono);font-size:10px;color:var(--text3);margin-top:4px;">
           ${taslakDepoTipi === 'serbest' ? 'Otomatik: BRÜT × 0.9' : 'Antrepo: elle girin'}
         </div>`
      : '';

    div.innerHTML = `
      <div style="font-size:13px;font-weight:500;margin-bottom:6px;">${alan.label}</div>
      <div style="display:flex;align-items:center;gap:8px;">
        ${alan.prefix ? `<span style="font-family:var(--mono);font-size:13px;color:var(--text3);white-space:nowrap;">${alan.prefix}</span>` : ''}
        <input
          class="target-input"
          id="taslak_${alan.id}"
          type="${alan.tip === 'number' ? 'text' : 'text'}"
          inputmode="${alan.tip === 'number' ? 'decimal' : 'text'}"
          placeholder="${alan.placeholder || ''}"
          ${alan.oninput ? `oninput="${alan.oninput}"` : ''}
          ${isNetKg && taslakDepoTipi === 'serbest' ? 'readonly style="opacity:0.7;"' : ''}
        >
      </div>
      ${note}`;
    container.appendChild(div);
  });

  // Template varsa indir butonunu göster
  if (taslakBytes) {
    document.getElementById('taslakIndir').style.display = 'block';
  }
}

// ── NET KG OTOMATİK HESAPLA ───────────────────────────────────────────────────
function hesaplaNet() {
  if (taslakDepoTipi !== 'serbest') return;
  const brutEl = document.getElementById('taslak_brutKg');
  const netEl  = document.getElementById('taslak_netKg');
  if (!brutEl || !netEl) return;

  const brut = parseFloat(brutEl.value.replace(',', '.'));
  if (!isNaN(brut) && brut > 0) {
    netEl.value = (Math.round(brut * 0.9 * 100) / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 });
  } else {
    netEl.value = '';
  }
}

// ── TASLAK EXCEL YÜKLEYİCİ ───────────────────────────────────────────────────
function initTaslakDropZone() {
  const dz = document.getElementById('taslakDropZone');
  if (!dz) return;

  dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', ()  => dz.classList.remove('dragover'));
  dz.addEventListener('drop',      e  => {
    e.preventDefault(); dz.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleTaslakFile(e.dataTransfer.files[0]);
  });
}

// ── KIBRIS ÖZEL FORM ──────────────────────────────────────────────────────────
function buildKibrisForm(container) {
  const gruplar = [
    { id: 'tekstil',     label: 'Tekstil' },
    { id: 'tekstilDisi', label: 'Tekstil Dışı' },
    { id: 'kozmetik',    label: 'Kozmetik' },
  ];

  // 3 grup yan yana
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;';

  gruplar.forEach(g => {
    const col = document.createElement('div');
    col.innerHTML = `
      <div style="font-size:12px;font-weight:700;color:var(--accent2);margin-bottom:10px;
                  padding:6px 10px;background:var(--surface2);border-radius:6px;text-align:center;">
        ${g.label}
      </div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:4px;">Kap</div>
      <input class="target-input" id="kibris_${g.id}_kap"
        style="margin-bottom:10px;font-size:12px;padding:8px 10px;"
        placeholder="örn: 10 koli">
      <div style="font-size:12px;color:var(--text2);margin-bottom:4px;">BRÜT (kg)</div>
      <input class="target-input" id="kibris_${g.id}_brutKg"
        type="text" inputmode="decimal"
        style="margin-bottom:10px;font-size:12px;padding:8px 10px;"
        oninput="kibrisHesaplaNet('${g.id}')"
        placeholder="örn: 1200,00">
      <div style="font-size:12px;color:var(--text2);margin-bottom:4px;">NET (kg)</div>
      <input class="target-input" id="kibris_${g.id}_netKg"
        type="text" inputmode="decimal"
        style="font-size:12px;padding:8px 10px;"
        placeholder="Otomatik">`;
    grid.appendChild(col);
  });
  container.appendChild(grid);

  // Referans No
  const refDiv = document.createElement('div');
  refDiv.innerHTML = `
    <div style="font-size:13px;font-weight:500;margin-bottom:6px;">Referans No</div>
    <div style="display:flex;gap:8px;align-items:center;">
      <span style="font-family:var(--mono);font-size:13px;color:var(--text3);">2026-</span>
      <input class="target-input" id="kibris_referansNo" placeholder="örn: 100" style="flex:1;">
    </div>`;
  container.appendChild(refDiv);
}

function kibrisHesaplaNet(grupId) {
  const brut = parseFloat(
    (document.getElementById(`kibris_${grupId}_brutKg`)?.value || '').replace(',','.')
  );
  const netEl = document.getElementById(`kibris_${grupId}_netKg`);
  if (netEl && !isNaN(brut) && brut > 0) {
    netEl.value = (Math.round(brut * 0.9 * 100) / 100).toLocaleString('tr-TR', {minimumFractionDigits:2});
  }
}

function getKibrisFormData() {
  const gruplar = ['tekstil', 'tekstilDisi', 'kozmetik'];
  const data = {};
  gruplar.forEach(g => {
    const kap  = document.getElementById(`kibris_${g}_kap`)?.value?.trim() || '';
    const brut = document.getElementById(`kibris_${g}_brutKg`)?.value?.trim() || '';
    const net  = document.getElementById(`kibris_${g}_netKg`)?.value?.trim() || '';
    if (kap || brut) {
      data[g + '_kap']    = kap;
      data[g + '_brutKg'] = parseFloat(brut.replace(',','.')) || 0;
      data[g + '_netKg']  = parseFloat(net.replace(',','.'))  || 0;
    }
  });
  // referansNo her zaman ekle — grup dolup dolmadığından bağımsız
  const refEl = document.getElementById('kibris_referansNo');
  data['referansNo'] = refEl ? refEl.value.trim() : '';
  return data;
}

function handleMenseTaslakFile(file) {
  if (!file) return;
  const badge = document.getElementById('menseTaslakDosya');
  if (badge) { badge.textContent = '✓ ' + file.name; badge.style.display = 'inline-flex'; }
  const r = new FileReader();
  r.onload = e => { menseTaslakBytes = e.target.result; };
  r.readAsArrayBuffer(file);
}

function handleTaslakFile(file) {
  if (!file) return;
  const badge = document.getElementById('taslakFileName');
  badge.textContent = '✓ ' + file.name;
  badge.style.display = 'inline-flex';

  const r = new FileReader();
  r.onload = e => {
    taslakBytes = e.target.result;
    document.getElementById('taslakIndir').style.display = 'block';
  };
  r.readAsArrayBuffer(file);
}

// ── FORM VERİLERİNİ TOPLA ────────────────────────────────────────────────────
function getTaslakFormData() {
  if (!taslakUlke) return null;
  const formDataCfg    = TASLAK_ULKELER[taslakUlke];
  const data   = {};

  for (const alan of formDataCfg.alanlar) {
    const el = document.getElementById('taslak_' + alan.id);
    if (!el) continue;
    const val = el.value.trim();
    if (!val) continue;

    if (alan.tip === 'number') {
      // Türkçe format: 1.234,56 → 1234.56
      let numStr = val;
      if (numStr.includes('.') && numStr.includes(',')) {
        numStr = numStr.replace(/\./g, '').replace(',', '.');
      } else {
        numStr = numStr.replace(',', '.');
      }
      data[alan.id] = parseFloat(numStr) || 0;
    } else {
      data[alan.id] = val;
    }
  }
  return data;
}

// ── TASLAK İNDİR ─────────────────────────────────────────────────────────────
async function indirTaslak() {
  if (!taslakUlke || !taslakBytes) {
    showTaslakStatus('error', '⚠ Ülke seçin ve taslak Excel yükleyin.');
    return;
  }

  const formData = getTaslakFormData();
  if (!formData) {
    showTaslakStatus('error', '⚠ Form verisi alınamadı.');
    return;
  }
  if (!formData.referansNo && formData.referansNo !== 0) {
    showTaslakStatus('error', '⚠ Referans No zorunludur.');
    return;
  }

  const btn = document.getElementById('taslakIndir');
  btn.textContent = '⏳ Hazırlanıyor...';
  btn.disabled = true;

  try {
    if (!taslakBytes) throw new Error('Taslak yüklenmemiş');
    const taslakB64 = arrayBufferToBase64(taslakBytes);
    if (!taslakB64) throw new Error('Base64 dönüşümü başarısız');

    const resp = await fetch('/api/taslak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ulkeKodu: taslakUlke,
        taslak:   taslakB64,
        formData: formData,
      })
    });

    const rawText = await resp.text();
    const data = JSON.parse(rawText);
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');

    // İndir
    indir(data.excel, data.dosyaAdi);
    showTaslakStatus('success', `<div class="stat">✓ İndirildi: <span>${data.dosyaAdi}</span></div>`);

  } catch(err) {
    showTaslakStatus('error', '⚠ ' + err.message);
  } finally {
    btn.textContent = '⬇ Taslak İndir';
    btn.disabled = false;
  }
}

// ── MENŞE → TASLAK ────────────────────────────────────────────────────────────
// Menşe hesabı tamamlandıktan sonra bu fonksiyon çağrılır.
// Referans No ile taslağı bulup menşe değerlerini ekler.
async function indirMenseTaslak(trKg, yabanciKg, brutKg, netKg) {
  const refNo = document.getElementById('menseRefNo')?.value?.trim();
  if (!refNo) {
    showTaslakStatus('error', '⚠ Referans No girin.');
    return;
  }
  if (!taslakBytes) {
    showTaslakStatus('error', '⚠ Taslak Excel yükleyin.');
    return;
  }

  const btn = document.getElementById('menseTaslakIndir');
  btn.textContent = '⏳ Hazırlanıyor...';
  btn.disabled = true;

  try {
    const taslakB64 = arrayBufferToBase64(menseTaslakBytes);

    const resp = await fetch('/api/taslak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ulkeKodu:  taslakUlke || 'rs',
        taslak:    taslakB64,
        formData:  { referansNo: refNo, brutKg, netKg },
        menseData: { trKg, yabanciKg },
      })
    });

    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');

    indir(data.excel, data.dosyaAdi);
    showTaslakStatus('success', `<div class="stat">✓ Menşe taslağı indirildi: <span>${data.dosyaAdi}</span></div>`);

  } catch(err) {
    showTaslakStatus('error', '⚠ ' + err.message);
  } finally {
    btn.textContent = '⬇ Menşe Taslak İndir';
    btn.disabled = false;
  }
}

// ── YARDIMCI ──────────────────────────────────────────────────────────────────
function indir(b64, dosyaAdi) {
  const bin   = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = dosyaAdi; a.click();
  URL.revokeObjectURL(url);
}

function showTaslakStatus(tip, html) {
  const sb = document.getElementById('taslakStatus');
  if (!sb) return;
  sb.className = 'status-box visible ' + tip;
  sb.innerHTML = html;
}

// ── MENŞE ÜLKE GRİD ──────────────────────────────────────────────────────────
function buildMenseUlkeGrid() {
  const grid = document.getElementById('menseUlkeGrid');
  if (!grid) return;
  grid.innerHTML = '';
  Object.entries(TASLAK_ULKELER).forEach(([kod, cfg]) => {
    const btn = document.createElement('div');
    btn.className = 'country-btn';
    btn.id = 'mense-ulke-' + kod;
    btn.addEventListener('click', () => selectMenseUlke(kod));
    btn.innerHTML = `
      <div class="country-flag"><img src="https://flagcdn.com/40x30/${cfg.flag}.png"></div>
      <div class="country-name">${cfg.label}</div>`;
    grid.appendChild(btn);
  });
}

async function selectMenseUlke(kod) {
  taslakUlke = kod;
  document.querySelectorAll('#menseUlkeGrid .country-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('mense-ulke-' + kod);
  if (btn) btn.classList.add('active');

  // Template otomatik yükle
  const cfg = TASLAK_ULKELER[kod];
  if (cfg && cfg.template) {
    try {
      const resp = await fetch('./' + cfg.template, { cache: 'no-store' });
      if (!resp.ok) throw new Error('Template bulunamadı');
      taslakBytes = await resp.arrayBuffer();
      const badge = document.getElementById('menseTaslakYuklendi');
      if (badge) { badge.textContent = '✓ ' + cfg.label + ' taslağı hazır'; badge.style.display = 'inline-flex'; }
    } catch(e) {
    }
  }
}

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTaslakDropZone();
  buildMenseUlkeGrid();

  // Menşe taslak drop zone
  const menseDZ = document.getElementById('menseTaslakDropZone');
  if (menseDZ) {
    menseDZ.addEventListener('dragover',  e => { e.preventDefault(); menseDZ.classList.add('dragover'); });
    menseDZ.addEventListener('dragleave', ()  => menseDZ.classList.remove('dragover'));
    menseDZ.addEventListener('drop',      e  => {
      e.preventDefault(); menseDZ.classList.remove('dragover');
      if (e.dataTransfer.files[0]) handleMenseTaslakFile(e.dataTransfer.files[0]);
    });
  }
});

function arrayBufferToBase64(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.byteLength; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}