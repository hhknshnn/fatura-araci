// ── TASLAK.JS ─────────────────────────────────────────────────────────────────

const TASLAK_ULKELER = {
  rs: {
    label: 'Sırbistan', flag: 'rs', grup: 'kurumsal',
    template: 'templates/taslak_rs.xlsx',
    alanlar: [
      { id: 'referansNo', label: 'Referans No', tip: 'text', prefix: '2026-', placeholder: 'örn: 100' },
      { id: 'navlun', label: 'Navlun (EUR)', tip: 'number', placeholder: 'örn: 3100,00' },
      { id: 'sigorta', label: 'Sigorta (EUR)', tip: 'number', placeholder: 'örn: 14,00' },
      { id: 'kap', label: 'Kap Sayısı', tip: 'number', placeholder: 'örn: 28' },
      { id: 'brutKg', label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg', label: 'Toplam NET (kg)', tip: 'number', placeholder: 'Otomatik hesaplanır' },
    ]
  },
  ba: {
    label: 'Bosna', flag: 'ba', grup: 'kurumsal',
    template: 'templates/taslak_rs.xlsx',
    alanlar: [
      { id: 'referansNo', label: 'Referans No', tip: 'text', prefix: '2026-', placeholder: 'örn: 100' },
      { id: 'navlun', label: 'Navlun (EUR)', tip: 'number', placeholder: 'örn: 3100,00' },
      { id: 'sigorta', label: 'Sigorta (EUR)', tip: 'number', placeholder: 'örn: 14,00' },
      { id: 'kap', label: 'Kap Sayısı', tip: 'number', placeholder: 'örn: 28' },
      { id: 'brutKg', label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg', label: 'Toplam NET (kg)', tip: 'number', placeholder: 'Otomatik hesaplanır' },
    ]
  },
  ge: {
    label: 'Gürcistan', flag: 'ge', grup: 'kurumsal',
    template: 'templates/taslak_ge.xlsx',
    alanlar: [
      { id: 'referansNo', label: 'Referans No', tip: 'text', prefix: '2026-', placeholder: 'örn: 100' },
      { id: 'navlun', label: 'Navlun (USD)', tip: 'number', placeholder: 'örn: 3100,00' },
      { id: 'sigorta', label: 'Sigorta (USD)', tip: 'number', placeholder: 'örn: 14,00' },
      { id: 'kap', label: 'Kap Sayısı', tip: 'number', placeholder: 'örn: 28' },
      { id: 'brutKg', label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg', label: 'Toplam NET (kg)', tip: 'number', placeholder: 'Otomatik hesaplanır' },
    ]
  },
  xk: {
    label: 'Kosova', flag: 'xk', grup: 'kurumsal',
    template: 'templates/taslak_rs.xlsx',
    alanlar: [
      { id: 'referansNo', label: 'Referans No', tip: 'text', prefix: '2026-', placeholder: 'örn: 100' },
      { id: 'navlun', label: 'Navlun (EUR)', tip: 'number', placeholder: 'örn: 3100,00' },
      { id: 'sigorta', label: 'Sigorta (EUR)', tip: 'number', placeholder: 'örn: 14,00' },
      { id: 'kap', label: 'Kap Sayısı', tip: 'number', placeholder: 'örn: 28' },
      { id: 'brutKg', label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg', label: 'Toplam NET (kg)', tip: 'number', placeholder: 'Otomatik hesaplanır' },
    ]
  },
  mk: {
    label: 'Makedonya', flag: 'mk', grup: 'kurumsal',
    template: 'templates/taslak_rs.xlsx',
    alanlar: [
      { id: 'referansNo', label: 'Referans No', tip: 'text', prefix: '2026-', placeholder: 'örn: 100' },
      { id: 'navlun', label: 'Navlun (EUR)', tip: 'number', placeholder: 'örn: 3100,00' },
      { id: 'sigorta', label: 'Sigorta (EUR)', tip: 'number', placeholder: 'örn: 14,00' },
      { id: 'kap', label: 'Kap Sayısı', tip: 'number', placeholder: 'örn: 28' },
      { id: 'brutKg', label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg', label: 'Toplam NET (kg)', tip: 'number', placeholder: 'Otomatik hesaplanır' },
    ]
  },
  be: {
    label: 'Belçika', flag: 'be', grup: 'kurumsal',
    template: 'templates/taslak_be.xlsx',
    alanlar: [
      { id: 'kap', label: 'Kap Sayısı', tip: 'number', placeholder: 'örn: 28' },
      { id: 'brutKg', label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg', label: 'Toplam NET (kg)', tip: 'number', placeholder: 'Otomatik hesaplanır' },
      { id: 'navlun', label: 'Navlun (EUR)', tip: 'number', placeholder: 'örn: 3100,00' },
      { id: 'sigorta', label: 'Sigorta (EUR)', tip: 'number', placeholder: 'örn: 14,00' },
      { id: 'referansNo', label: 'Referans No', tip: 'text', prefix: '2026-', placeholder: 'örn: 100' },
    ]
  },
  de: {
    label: 'Almanya', flag: 'de', grup: 'kurumsal',
    template: 'templates/taslak_de.xlsx',
    alanlar: [
      { id: 'kap', label: 'Kap Sayısı', tip: 'number', placeholder: 'örn: 28' },
      { id: 'brutKg', label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg', label: 'Toplam NET (kg)', tip: 'number', placeholder: 'Otomatik hesaplanır' },
      { id: 'navlun', label: 'Navlun (EUR)', tip: 'number', placeholder: 'örn: 3100,00' },
      { id: 'sigorta', label: 'Sigorta (EUR)', tip: 'number', placeholder: 'örn: 14,00' },
      { id: 'referansNo', label: 'Referans No', tip: 'text', prefix: '2026-', placeholder: 'örn: 100' },
    ]
  },
  nl: {
    label: 'Hollanda', flag: 'nl', grup: 'kurumsal',
    template: 'templates/taslak_nl.xlsx',
    alanlar: [
      { id: 'kap', label: 'Kap Sayısı', tip: 'number', placeholder: 'örn: 28' },
      { id: 'brutKg', label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg', label: 'Toplam NET (kg)', tip: 'number', placeholder: 'Otomatik hesaplanır' },
      { id: 'navlun', label: 'Navlun (EUR)', tip: 'number', placeholder: 'örn: 3100,00' },
      { id: 'sigorta', label: 'Sigorta (EUR)', tip: 'number', placeholder: 'örn: 14,00' },
      { id: 'referansNo', label: 'Referans No', tip: 'text', prefix: '2026-', placeholder: 'örn: 100' },
    ]
  },
  kz: {
    label: 'Kazakistan', flag: 'kz', grup: 'kurumsal',
    template: 'templates/taslak_kz.xlsx',
    alanlar: [
      { id: 'navlun', label: 'Freight (TL)', tip: 'number', placeholder: 'örn: 102186,04' },
      { id: 'sigorta', label: 'Insurance (TL)', tip: 'number', placeholder: 'örn: 371,59' },
      { id: 'kap', label: 'Packages', tip: 'text', placeholder: 'örn: 33 (22 Palet + 11 Koli)' },
      { id: 'brutKg', label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg', label: 'Toplam NET (kg)', tip: 'number', placeholder: 'Otomatik hesaplanır' },
      { id: 'referansNo', label: 'Referans No', tip: 'text', prefix: '2026-', placeholder: 'örn: 100' },
    ]
  },
  cy: {
    label: 'Kıbrıs', flag: 'cy', grup: 'franchise',
    template: 'templates/taslak_cy.xlsx',
    tip: 'kibris',
    alanlar: []
  },
  iq: {
    label: 'Irak', flag: 'iq', grup: 'franchise',
    template: 'templates/taslak_iq.xlsx',
    alanlar: [
      { id: 'kap', label: 'Packages', tip: 'text', placeholder: 'örn: 43 (33 palet + 10 Koli)' },
      { id: 'brutKg', label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg', label: 'Toplam NET (kg)', tip: 'number', placeholder: 'Otomatik hesaplanır' },
      { id: 'referansNo', label: 'Referans No', tip: 'text', prefix: '2026-', placeholder: 'örn: 100' },
    ]
  },
  lr: {
    label: 'Liberya', flag: 'lr', grup: 'franchise',
    template: 'templates/taslak_lr.xlsx',
    alanlar: [
      { id: 'kap', label: 'Packages', tip: 'text', placeholder: 'örn: 28' },
      { id: 'brutKg', label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg', label: 'Toplam NET (kg)', tip: 'number', placeholder: 'Otomatik hesaplanır' },
      { id: 'referansNo', label: 'Referans No', tip: 'text', prefix: '2026-', placeholder: 'örn: 100' },
    ]
  },
  ly: {
    label: 'Libya', flag: 'ly', grup: 'franchise',
    template: 'templates/taslak_ly.xlsx',
    alanlar: [
      { id: 'kap', label: 'Packages', tip: 'text', placeholder: 'örn: 28' },
      { id: 'brutKg', label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg', label: 'Toplam NET (kg)', tip: 'number', placeholder: 'Otomatik hesaplanır' },
      { id: 'referansNo', label: 'Referans No', tip: 'text', prefix: '2026-', placeholder: 'örn: 100' },
    ]
  },
  lb: {
    label: 'Lübnan', flag: 'lb', grup: 'franchise',
    template: 'templates/taslak_lb.xlsx',
    alanlar: [
      { id: 'kap', label: 'Packages', tip: 'text', placeholder: 'örn: 28' },
      { id: 'brutKg', label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg', label: 'Toplam NET (kg)', tip: 'number', placeholder: 'Otomatik hesaplanır' },
      { id: 'referansNo', label: 'Referans No', tip: 'text', prefix: '2026-', placeholder: 'örn: 100' },
    ]
  },
  uz: {
    label: 'Özbekistan', flag: 'uz', grup: 'franchise',
    template: 'templates/taslak_uz.xlsx',
    alanlar: [
      { id: 'kap', label: 'Packages', tip: 'text', placeholder: 'örn: 28' },
      { id: 'brutKg', label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg', label: 'Toplam NET (kg)', tip: 'number', placeholder: 'Otomatik hesaplanır' },
      { id: 'referansNo', label: 'Referans No', tip: 'text', prefix: '2026-', placeholder: 'örn: 100' },
    ]
  },
  ru: {
    label: 'Rusya', flag: 'ru', grup: 'franchise',
    template: 'templates/taslak_ru.xlsx',
    alanlar: [
      { id: 'kap', label: 'Packages', tip: 'text', placeholder: 'örn: 28' },
      { id: 'brutKg', label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg', label: 'Toplam NET (kg)', tip: 'number', placeholder: 'Otomatik hesaplanır' },
      { id: 'referansNo', label: 'Referans No', tip: 'text', prefix: '2026-', placeholder: 'örn: 100' },
    ]
  },
  abh: {
    label: 'Abhazya', flag: 'un', grup: 'toptan',
    template: 'templates/taslak_abh.xlsx',
    alanlar: [
      { id: 'kap', label: 'Packages', tip: 'text', placeholder: 'örn: 28' },
      { id: 'brutKg', label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg', label: 'Toplam NET (kg)', tip: 'number', placeholder: 'Otomatik hesaplanır' },
      { id: 'referansNo', label: 'Referans No', tip: 'text', prefix: '2026-', placeholder: 'örn: 100' },
    ]
  },
};

// ── STATE ─────────────────────────────────────────────────────────────────────
let taslakUlke = null;
let taslakBytes = null;
let taslakDepoTipi = null;
let menseTaslakBytes = null;

// ── PANELİ BAŞLAT ─────────────────────────────────────────────────────────────
function initTaslakPanel() {
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById('step' + i);
    if (el) el.style.display = 'none';
  }
  document.getElementById('stepTaslak').style.display = 'block';

  taslakDepoTipi = null;
  taslakUlke = null;
  taslakBytes = null;

  buildTaslakUlkeGrid();

  document.getElementById('taslakDepoSection').style.display = 'none';
  document.getElementById('taslakFormSection').style.display = 'none';
  document.getElementById('taslakIndir').style.display = 'none';

  const status = document.getElementById('taslakStatus');
  if (status) { status.className = 'status-box'; status.innerHTML = ''; }
}

// ── TASLAK ÜLKE GRİD — .cc kart yapısı ───────────────────────────────────────
function buildTaslakUlkeGrid() {
  const kurBody = document.getElementById('tcbody-kurumsal');
  const fraBody = document.getElementById('tcbody-franchise');
  const toptanBody = document.getElementById('tcbody-toptan');
  if (!kurBody || !fraBody) return;

  // Mevcut içeriği temizle, JS ile yeniden oluştur
  kurBody.innerHTML = '';
  fraBody.innerHTML = '';
  if (toptanBody) toptanBody.innerHTML = '';

  Object.entries(TASLAK_ULKELER).forEach(([kod, cfg]) => {
    // Para birimini belirle — config'de yoksa ülke kodundan çıkar
    const cur = cfg.currency ||
      (kod === 'be' || kod === 'de' || kod === 'nl' || kod === 'xk' || kod === 'mk' ? 'EUR' :
        kod === 'iq' || kod === 'ly' || kod === 'lr' || kod === 'lb' || kod === 'uz' || kod === 'abh' ? 'USD' : 'TRY');

    const curClass = cur === 'EUR' ? 'cur-eur' : cur === 'USD' ? 'cur-usd' : 'cur-try';
    const card = document.createElement('div');
    card.className = 'cc';
    card.id = 'taslak-ulke-' + kod;
    card.dataset.name = cfg.label.toLowerCase();
    card.innerHTML = `
      <div class="cc-check"><i class="ti ti-check" aria-hidden="true"></i></div>
      <div class="cc-top">
        <img class="cc-flag" src="https://flagcdn.com/40x30/${cfg.flag}.png" alt="${cfg.label}">
        <div>
          <div class="cc-name">${cfg.label}</div>
          <div class="cc-code">${kod.toUpperCase()}</div>
        </div>
      </div>
      <div class="cc-footer">
        <span class="cc-currency ${curClass}">${cur}</span>
      </div>`;

    card.addEventListener('click', () => selectTaslakUlke(kod));

    // Gruba göre doğru container'a ekle
    if (cfg.grup === 'franchise') fraBody.appendChild(card);
    else if (cfg.grup === 'toptan') {
      const toptanBody = document.getElementById('tcbody-toptan');
      if (toptanBody) toptanBody.appendChild(card);
    }
    else kurBody.appendChild(card);
  });
}

// ── TASLAK ÜLKE GRİD TOGGLE ───────────────────────────────────────────────────
function toggleTaslakCountryGroup(id) {
  const body = document.getElementById('tcbody-' + id);
  const chevron = document.getElementById('tcchevron-' + id);
  if (!body) return;
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  if (chevron) chevron.classList.toggle('open', !isOpen);
}

// ── TASLAK ÜLKE ARAMA ─────────────────────────────────────────────────────────
function filterTaslakCountryList() {
  const q = document.getElementById('taslakCountrySearch').value.toLowerCase().trim();
  let total = 0;

  // Tüm taslak kartlarını gez
  document.querySelectorAll('#tcbody-kurumsal .cc, #tcbody-franchise .cc, #tcbody-toptan .cc').forEach(card => {
    const name = card.dataset.name || '';
    const show = !q || name.includes(q);
    card.style.display = show ? '' : 'none';
    if (show) total++;
  });

  // Her grup için kart sayısını güncelle, arama varsa grubu aç
  ['kurumsal', 'franchise', 'toptan'].forEach(grup => {
    const body = document.getElementById('tcbody-' + grup);
    const countEl = document.getElementById('tccount-' + grup);
    const chevron = document.getElementById('tcchevron-' + grup);
    if (!body) return;
    const visible = [...body.querySelectorAll('.cc')].filter(c => c.style.display !== 'none').length;
    if (countEl) countEl.textContent = visible;
    if (q && visible > 0) {
      body.classList.add('open');
      if (chevron) chevron.classList.add('open');
    }
  });

  // Sonuç bulunamadı mesajı
  const nr = document.getElementById('taslakCountryNoResults');
  if (nr) nr.style.display = total === 0 ? 'block' : 'none';
}

// ── ÜLKE SEÇ ──────────────────────────────────────────────────────────────────
async function selectTaslakUlke(kod) {
  taslakUlke = kod;

  // Önceki seçimi temizle, yeni kartı aktif yap
  document.querySelectorAll('#tcbody-kurumsal .cc, #tcbody-franchise .cc, #tcbody-toptan .cc').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('taslak-ulke-' + kod);
  if (btn) btn.classList.add('active');

  const cfg = TASLAK_ULKELER[kod];
  if (cfg && cfg.template) {
    try {
      showTaslakStatus('info', '⏳ Taslak yükleniyor...');
      const resp = await fetch('./' + cfg.template, { cache: 'no-store' });
      if (!resp.ok) throw new Error('Template bulunamadı');
      const buf = await resp.arrayBuffer();
      taslakBytes = buf;
      document.getElementById('taslakFileName').textContent = '✓ ' + cfg.label + ' taslağı yüklendi';
      document.getElementById('taslakFileName').style.display = 'inline-flex';
      showTaslakStatus('success', '<div class="stat">✓ Taslak otomatik yüklendi</div>');
    } catch (e) {
      showTaslakStatus('error', '⚠ Taslak yüklenemedi: ' + e.message);
    }
  }

  document.getElementById('taslakDepoSection').style.display = 'block';
  document.getElementById('taslakFormSection').style.display = 'none';
  document.getElementById('taslakIndir').style.display = 'none';
}

// ── DEPO TİPİ SEÇ ─────────────────────────────────────────────────────────────
function selectTaslakDepo(tip) {
  taslakDepoTipi = tip;
  document.getElementById('taslak-depo-serbest').classList.toggle('active', tip === 'serbest');
  document.getElementById('taslak-depo-antrepo').classList.toggle('active', tip === 'antrepo');
  buildTaslakForm();
  document.getElementById('taslakFormSection').style.display = 'block';
}

// ── FORM OLUŞTUR ──────────────────────────────────────────────────────────────
function buildTaslakForm() {
  if (!taslakUlke) return;
  const formCfg = TASLAK_ULKELER[taslakUlke];
  const container = document.getElementById('taslakFormAlanlari');
  container.innerHTML = '';

  // Kıbrıs özel form
  if (formCfg.tip === 'kibris') {
    buildKibrisForm(container);
    if (taslakBytes) document.getElementById('taslakIndir').style.display = 'block';
    return;
  }

  // Standart form alanları
  formCfg.alanlar.forEach(alan => {
    const div = document.createElement('div');
    div.style.cssText = 'margin-bottom:14px;';
    const isNetKg = alan.id === 'netKg';
    const note = isNetKg
      ? `<div style="font-family:var(--mono);font-size:10px;color:var(--text3);margin-top:4px;">
           ${taslakDepoTipi === 'serbest' ? 'Otomatik: BRÜT × 0.9' : 'Antrepo: elle girin'}
         </div>`
      : '';
    div.innerHTML = `
      <div style="font-size:13px;font-weight:500;margin-bottom:6px;">${alan.label}</div>
      <div style="display:flex;align-items:center;gap:8px;">
        ${alan.prefix ? `<select class="yil-select" onchange="localStorage.setItem('app_yil',this.value);window.APP_YIL=this.value;" style="font-family:var(--mono);font-size:13px;color:var(--text3);border:none;background:transparent;cursor:pointer;outline:none;padding:0;"><option ${(window.APP_YIL || '2026') === '2026' ? 'selected' : ''}>2026</option><option ${(window.APP_YIL || '2026') === '2027' ? 'selected' : ''}>2027</option><option ${(window.APP_YIL || '2026') === '2028' ? 'selected' : ''}>2028</option></select><span style="font-family:var(--mono);font-size:13px;color:var(--text3);">-</span>` : ''}
        <input
          class="target-input"
          id="taslak_${alan.id}"
          type="text"
          inputmode="${alan.tip === 'number' ? 'decimal' : 'text'}"
          placeholder="${alan.placeholder || ''}"
          ${alan.oninput ? `oninput="${alan.oninput}"` : ''}
          ${isNetKg && taslakDepoTipi === 'serbest' ? 'readonly style="opacity:0.7;"' : ''}
        >
      </div>
      ${note}`;
    container.appendChild(div);
  });

  if (taslakBytes) {
    document.getElementById('taslakIndir').style.display = 'block';
  }
}

// ── NET KG OTOMATİK ──────────────────────────────────────────────────────────
function hesaplaNet() {
  if (taslakDepoTipi !== 'serbest') return;
  const brutEl = document.getElementById('taslak_brutKg');
  const netEl = document.getElementById('taslak_netKg');
  if (!brutEl || !netEl) return;
  const brut = parseFloat(brutEl.value.replace(',', '.'));
  if (!isNaN(brut) && brut > 0) {
    netEl.value = (Math.round(brut * 0.9 * 100) / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 });
  } else {
    netEl.value = '';
  }
}

// ── KIBRIS ÖZEL FORM ──────────────────────────────────────────────────────────
function buildKibrisForm(container) {
  const gruplar = [
    { id: 'tekstil', label: 'Tekstil' },
    { id: 'tekstilDisi', label: 'Tekstil Dışı' },
    { id: 'kozmetik', label: 'Kozmetik' },
  ];
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

  const refDiv = document.createElement('div');
  refDiv.innerHTML = `
    <div style="font-size:13px;font-weight:500;margin-bottom:6px;">Referans No</div>
    <div style="display:flex;gap:8px;align-items:center;">
      <select class="yil-select" onchange="localStorage.setItem('app_yil',this.value)" style="font-family:var(--mono);font-size:13px;color:var(--text3);border:none;background:transparent;cursor:pointer;outline:none;padding:0;"><option selected>2026</option><option>2027</option><option>2028</option></select><span style="font-family:var(--mono);font-size:13px;color:var(--text3);">-</span>
      <input class="target-input" id="kibris_referansNo" placeholder="örn: 100" style="flex:1;">
    </div>`;
  container.appendChild(refDiv);
}

function kibrisHesaplaNet(grupId) {
  const brut = parseFloat(
    (document.getElementById(`kibris_${grupId}_brutKg`)?.value || '').replace(',', '.')
  );
  const netEl = document.getElementById(`kibris_${grupId}_netKg`);
  if (netEl && !isNaN(brut) && brut > 0) {
    netEl.value = (Math.round(brut * 0.9 * 100) / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 });
  }
}

function getKibrisFormData() {
  const gruplar = ['tekstil', 'tekstilDisi', 'kozmetik'];
  const data = {};
  gruplar.forEach(g => {
    const kap = document.getElementById(`kibris_${g}_kap`)?.value?.trim() || '';
    const brut = document.getElementById(`kibris_${g}_brutKg`)?.value?.trim() || '';
    const net = document.getElementById(`kibris_${g}_netKg`)?.value?.trim() || '';
    if (kap || brut) {
      data[g + '_kap'] = kap;
      data[g + '_brutKg'] = parseFloat(brut.replace(',', '.')) || 0;
      data[g + '_netKg'] = parseFloat(net.replace(',', '.')) || 0;
    }
  });
  const refEl = document.getElementById('kibris_referansNo');
  data['referansNo'] = refEl ? refEl.value.trim() : '';
  return data;
}

// ── MENŞE TASLAK DOSYA ────────────────────────────────────────────────────────
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

// ── FORM VERİLERİNİ TOPLA ─────────────────────────────────────────────────────
function getTaslakFormData() {
  if (!taslakUlke) return null;
  if (TASLAK_ULKELER[taslakUlke]?.tip === 'kibris') return getKibrisFormData();
  const formDataCfg = TASLAK_ULKELER[taslakUlke];
  const data = {};
  for (const alan of formDataCfg.alanlar) {
    const el = document.getElementById('taslak_' + alan.id);
    if (!el) continue;
    const val = el.value.trim();
    if (!val) continue;
    if (alan.tip === 'number') {
      let numStr = val;
      if (numStr.includes('.') && numStr.includes(',')) {
        numStr = numStr.replace(/\./g, '').replace(',', '.');
      } else {
        numStr = numStr.replace(',', '.');
      }
      data[alan.id] = parseFloat(numStr) || 0;
    } else {
      // Referans No ise dropdown'dan seçilen yılı prefix olarak ekle
      if (alan.id === 'referansNo' && alan.prefix) {
        const yilEl = document.querySelector(`#taslak_${alan.id}`)?.closest('div')?.querySelector('select');
        const yil = yilEl ? yilEl.value : (localStorage.getItem('app_yil') || '2026');
        // val içinde zaten yıl varsa tekrar ekleme
        data[alan.id] = val.startsWith(yil + '-') ? val : yil + '-' + val;
      } else {
        data[alan.id] = val;
      }
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
  if (!formData) { showTaslakStatus('error', '⚠ Form verisi alınamadı.'); return; }
  if (!formData.referansNo && formData.referansNo !== 0) {
    showTaslakStatus('error', '⚠ Referans No zorunludur.');
    return;
  }
  const btn = document.getElementById('taslakIndir');
  btn.textContent = '⏳ Hazırlanıyor...';
  btn.disabled = true;
  try {
    const taslakB64 = arrayBufferToBase64(taslakBytes);
    if (!taslakB64) throw new Error('Base64 dönüşümü başarısız');
    const resp = await fetch('/api/taslak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ulkeKodu: taslakUlke, taslak: taslakB64, formData })
    });
    const data = JSON.parse(await resp.text());
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');
    indir(data.excel, data.dosyaAdi);
    showTaslakStatus('success', `<div class="stat">✓ İndirildi: <span>${data.dosyaAdi}</span></div>`);

    // Taslağı DB'ye kaydet (arka planda, hata olsa indirme etkilenmez)
    try {
      await fetch('/api/taslak-store/kaydet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referansNo: formData.referansNo,
          ulkeKodu:   taslakUlke,
          ulkeAdi:    TASLAK_ULKELER[taslakUlke]?.label || taslakUlke,
          depoTipi:   taslakDepoTipi,
          excel:      data.excel,
          kullanici:  window.currentUser?.displayName || window.currentUser?.username || '',
        })
      });
    } catch(e) {
      console.warn('Taslak DB kayıt hatası:', e);
    }
  } catch (err) {
    showTaslakStatus('error', '⚠ ' + err.message);
  } finally {
    btn.textContent = '⬇ Taslak İndir';
    btn.disabled = false;
  }
}

// ── MENŞE → TASLAK ────────────────────────────────────────────────────────────
async function indirMenseTaslak(trKg, yabanciKg, brutKg, netKg) {
  // Referans no: seçili taslaktan al (window._menseTaslakRefNo), yoksa input'tan
  const refNo = window._menseTaslakRefNo || (() => {
    const refNoEl  = document.getElementById('menseRefNo');
    const yilEl    = refNoEl?.closest('div')?.querySelector('select');
    const yil      = yilEl ? yilEl.value : (localStorage.getItem('app_yil') || '2026');
    const refNoVal = refNoEl?.value?.trim();
    return refNoVal ? yil + '-' + refNoVal : null;
  })();

  if (!menseTaslakBytes) { showTaslakStatus('error', '⚠ Kayıtlı taslak seçin.'); return; }
  if (!refNo) { showTaslakStatus('error', '⚠ Referans No girin.'); return; }
  const btn = document.getElementById('menseTaslakIndir');
  btn.textContent = '⏳ Hazırlanıyor...';
  btn.disabled = true;
  try {
    const taslakB64 = arrayBufferToBase64(menseTaslakBytes);
    const resp = await fetch('/api/taslak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ulkeKodu: taslakUlke || 'rs',
        taslak: taslakB64,
        formData: { referansNo: refNo, brutKg, netKg },
        menseData: { trKg, yabanciKg },
      })
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');
    indir(data.excel, data.dosyaAdi);
    showTaslakStatus('success', `<div class="stat">✓ Menşe taslağı indirildi: <span>${data.dosyaAdi}</span></div>`);
  } catch (err) {
    showTaslakStatus('error', '⚠ ' + err.message);
  } finally {
    btn.textContent = '⬇ Menşe Taslak İndir';
    btn.disabled = false;
  }
}

// ── MENŞE ÜLKE GRİD — eski country-btn yapısı korundu ────────────────────────
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
  const cfg = TASLAK_ULKELER[kod];
  if (cfg && cfg.template) {
    try {
      const resp = await fetch('./' + cfg.template, { cache: 'no-store' });
      if (!resp.ok) throw new Error('Template bulunamadı');
      taslakBytes = await resp.arrayBuffer();
      const badge = document.getElementById('menseTaslakYuklendi');
      if (badge) { badge.textContent = '✓ ' + cfg.label + ' taslağı hazır'; badge.style.display = 'inline-flex'; }
    } catch (e) { }
  }
}

// ── YARDIMCI ──────────────────────────────────────────────────────────────────
function indir(b64, dosyaAdi) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = dosyaAdi; a.click();
  URL.revokeObjectURL(url);
}

function showTaslakStatus(tip, html) {
  const sb = document.getElementById('taslakStatus');
  if (!sb) return;
  sb.className = 'status-box visible ' + tip;
  sb.innerHTML = html;
}

function initTaslakDropZone() {
  const menseDZ = document.getElementById('menseTaslakDropZone');
  if (menseDZ) {
    menseDZ.addEventListener('dragover', e => { e.preventDefault(); menseDZ.classList.add('dragover'); });
    menseDZ.addEventListener('dragleave', () => menseDZ.classList.remove('dragover'));
    menseDZ.addEventListener('drop', e => {
      e.preventDefault(); menseDZ.classList.remove('dragover');
      if (e.dataTransfer.files[0]) handleMenseTaslakFile(e.dataTransfer.files[0]);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initTaslakDropZone();
  buildMenseUlkeGrid();
});

function arrayBufferToBase64(buf) {
  const b = new Uint8Array(buf);
  const chunkSize = 8192;
  let s = '';
  for (let i = 0; i < b.byteLength; i += chunkSize) {
    s += String.fromCharCode(...b.subarray(i, i + chunkSize));
  }
  return btoa(s);
}
