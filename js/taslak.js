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
  jo: {
    label: 'Ürdün', flag: 'jo', grup: 'franchise',
    template: 'templates/taslak_lb.xlsx',
    alanlar: [
      { id: 'kap', label: 'Packages', tip: 'text', placeholder: 'örn: 28' },
      { id: 'brutKg', label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg', label: 'Toplam NET (kg)', tip: 'number', placeholder: 'Otomatik hesaplanır' },
      { id: 'referansNo', label: 'Referans No', tip: 'text', prefix: '2026-', placeholder: 'örn: 100' },
    ]
  },
  mu: {
    label: 'Mauritius', flag: 'mu', grup: 'toptan',
    template: 'templates/taslak_lb.xlsx',
    alanlar: [
      { id: 'kap', label: 'Packages', tip: 'text', placeholder: 'örn: 28' },
      { id: 'brutKg', label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 8500,00', oninput: 'hesaplaNet()' },
      { id: 'netKg', label: 'Toplam NET (kg)', tip: 'number', placeholder: 'Otomatik hesaplanır' },
      { id: 'referansNo', label: 'Referans No', tip: 'text', prefix: '2026-', placeholder: 'örn: 100' },
    ]
  },
  ke: {
    label: 'Kenya', flag: 'ke', grup: 'devir',
    template: 'templates/taslak_ke.xlsx',
    alanlar: [
      { id: 'kap', label: 'Packages', tip: 'text', placeholder: 'örn: 470' },
      { id: 'brutKg', label: 'Toplam BRÜT (kg)', tip: 'number', placeholder: 'örn: 4388,65', oninput: 'hesaplaNet()' },
      { id: 'netKg', label: 'Toplam NET (kg)', tip: 'number', placeholder: 'Otomatik hesaplanır' },
      { id: 'referansNo', label: 'Dosya No', tip: 'text', prefix: '2026-', placeholder: 'örn: 105' },
    ]
  },
};

// ── STATE ─────────────────────────────────────────────────────────────────────
let taslakUlke = null;
let taslakBytes = null;
let taslakDepoTipi = null;
let taslakKomple = false;
let menseTaslakBytes = null;
// Kayıtlı taslak (form state) kalıcılığı — hangi kayıt üzerinde çalışıldığı
let taslakDraftId = null;

// ── NAVLUN OTOMATİK HESAP STATE ───────────────────────────────────────────────
// Navlun/sigorta otomatik hesaplaması olan kurumsal ülkeler (backend ile aynı küme)
const NAVLUN_ULKELER = new Set(['mk', 'xk', 'rs', 'ba', 'kz', 'ge', 'be', 'nl']);
// Partner taslağı bekleyen tahsisle dolduğunda formül YENİDEN çalışmasın diye kilit
let _navlunBekleyenAktif = false;
// Bu taslağın tükettiği bekleyen tahsisin dosya no'su (indirince kullanıldı işaretlenir)
let _navlunBekleyenDosyaNo = null;

// ── PANELİ BAŞLAT ─────────────────────────────────────────────────────────────
function initTaslakPanel() {
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById('step' + i);
    if (el) el.style.display = 'none';
  }
  document.getElementById('stepTaslak').style.display = 'block';

  taslakDepoTipi = null;
  taslakKomple = false;
  taslakUlke = null;
  taslakBytes = null;
  taslakDraftId = null;
  _navlunBekleyenAktif = false;
  _navlunBekleyenDosyaNo = null;

  buildTaslakUlkeGrid();

  document.getElementById('taslakDepoSection').style.display = 'none';
  document.getElementById('taslakFormSection').style.display = 'none';
  document.getElementById('taslakIndir').style.display = 'none';
  const kaydetBtn = document.getElementById('taslakKaydet');
  if (kaydetBtn) kaydetBtn.style.display = 'none';

  const status = document.getElementById('taslakStatus');
  if (status) { status.className = 'status-box'; status.innerHTML = ''; }

  loadTaslakDraftlar();
}

// ── TASLAK ÜLKE GRİD — .cc kart yapısı ───────────────────────────────────────
function buildTaslakUlkeGrid() {
  const kurBody = document.getElementById('tcbody-kurumsal');
  const fraBody = document.getElementById('tcbody-franchise');
  const toptanBody = document.getElementById('tcbody-toptan');
  const devirBody = document.getElementById('tcbody-devir');
  if (!kurBody || !fraBody) return;

  // Mevcut içeriği temizle, JS ile yeniden oluştur
  kurBody.innerHTML = '';
  fraBody.innerHTML = '';
  if (toptanBody) toptanBody.innerHTML = '';
  if (devirBody) devirBody.innerHTML = '';

  Object.entries(TASLAK_ULKELER).forEach(([kod, cfg]) => {
    // Para birimini belirle — config'de yoksa ülke kodundan çıkar
    const cur = cfg.currency ||
      (kod === 'be' || kod === 'de' || kod === 'nl' || kod === 'xk' || kod === 'mk' ? 'EUR' :
        kod === 'iq' || kod === 'ly' || kod === 'lr' || kod === 'lb' || kod === 'uz' || kod === 'abh' || kod === 'jo' || kod === 'mu' ? 'USD' : 'TRY');

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
    else if (cfg.grup === 'devir') {
      const devirBody = document.getElementById('tcbody-devir');
      if (devirBody) devirBody.appendChild(card);
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
  document.querySelectorAll('#tcbody-kurumsal .cc, #tcbody-franchise .cc, #tcbody-toptan .cc, #tcbody-devir .cc').forEach(card => {
    const name = card.dataset.name || '';
    const show = !q || name.includes(q);
    card.style.display = show ? '' : 'none';
    if (show) total++;
  });

  // Her grup için kart sayısını güncelle, arama varsa grubu aç
  ['kurumsal', 'franchise', 'toptan', 'devir'].forEach(grup => {
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
  // Manuel ülke seçimi her zaman "yeni taslak" başlangıcı sayılır; devam edilen
  // bir kayıt varsa çağıran (acTaslakDraft) bu satırdan SONRA taslakDraftId'yi geri yükler.
  taslakDraftId = null;
  taslakUlke = kod;

  // Önceki seçimi temizle, yeni kartı aktif yap
  document.querySelectorAll('#tcbody-kurumsal .cc, #tcbody-franchise .cc, #tcbody-toptan .cc, #tcbody-devir .cc').forEach(b => b.classList.remove('active'));
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
  const kaydetBtn0 = document.getElementById('taslakKaydet');
  if (kaydetBtn0) kaydetBtn0.style.display = 'none';
}

// ── DEPO TİPİ SEÇ ─────────────────────────────────────────────────────────────
function selectTaslakDepo(tip) {
  taslakDepoTipi = tip;
  document.getElementById('taslak-depo-serbest').classList.toggle('active', tip === 'serbest');
  document.getElementById('taslak-depo-antrepo').classList.toggle('active', tip === 'antrepo');

  // Depo tipi değişince komple seçimi sıfırlanır ve tetiklenirse formu ezmesin
  taslakKomple = false;
  const kompleEl = document.getElementById('taslakKomple');
  if (kompleEl) kompleEl.checked = false;

  buildTaslakForm();

  // "Komple depo/antrepo" seçeneği yalnız navlun tanımı olan ülkelerde çıkar;
  // etiketi seçilen depo tipine göre uyarlanır.
  const kompleWrap = document.getElementById('taslakKompleWrap');
  const kompleLabel = document.getElementById('taslakKompleLabel');
  if (kompleWrap) {
    const goster = NAVLUN_ULKELER.has(taslakUlke);
    kompleWrap.style.display = goster ? 'block' : 'none';
    if (goster && kompleLabel) {
      kompleLabel.textContent = tip === 'antrepo' ? 'Komple Antrepo' : 'Komple Depo';
    }
  }

  document.getElementById('taslakFormSection').style.display = 'block';
}

// ── KOMPLE DEPO/ANTREPO TOGGLE ────────────────────────────────────────────────
// İşaretlenince navlun ve sigortanın tamamı (kap oranına bölünmeden) yazılır;
// kaldırılınca normal kap bazlı otomatik hesaba dönülür.
function taslakKompleDegisti() {
  taslakKomple = document.getElementById('taslakKomple')?.checked || false;
  if (taslakKomple) {
    // Komple + gruplu birlikte anlamsız → gruplu seçimini kapat
    const grupluEl = document.getElementById('taslak_gruplu');
    if (grupluEl && grupluEl.checked) {
      grupluEl.checked = false;
      navlunGrupluDegisti();
    }
    navlunKompleHesapla();
  } else {
    navlunOtomatikHesapla();
  }
}

// ── KOMPLE: NAVLUN/SİGORTA TAMAMINI YAZ ───────────────────────────────────────
async function navlunKompleHesapla() {
  if (!taslakUlke || !NAVLUN_ULKELER.has(taslakUlke)) return;
  if (!taslakDepoTipi) return;
  try {
    const resp = await fetch('/api/navlun/hesapla', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ulkeKodu: taslakUlke, depoTipi: taslakDepoTipi, komple: true }),
    });
    const data = await resp.json();
    if (!data.success) return;

    const navEl = document.getElementById('taslak_navlun');
    const sigEl = document.getElementById('taslak_sigorta');
    if (navEl) navEl.value = data.navlun;
    if (sigEl) sigEl.value = data.sigorta;

    const not = document.getElementById('taslak_navlunNot');
    if (not) {
      not.style.display = 'block';
      not.style.color = 'var(--accent2)';
      not.textContent = `📦 Komple: navlun ${data.navlun} · sigorta ${data.sigorta} ${data.paraBirimi} — tamamı (değiştirilebilir)`;
    }
  } catch (e) {
    // Sessiz geç — kullanıcı elle girebilir
  }
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
    if (taslakBytes) {
      document.getElementById('taslakIndir').style.display = 'block';
      const kaydetBtn = document.getElementById('taslakKaydet');
      if (kaydetBtn) kaydetBtn.style.display = 'inline-block';
    }
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

  // ── NAVLUN OTOMATİK HESAP UI (yalnız tanımlı kurumsal ülkeler) ──────────────
  if (NAVLUN_ULKELER.has(taslakUlke)) {
    injectNavlunUI(container);
  }

  if (taslakBytes) {
    document.getElementById('taslakIndir').style.display = 'block';
    const kaydetBtn = document.getElementById('taslakKaydet');
    if (kaydetBtn) kaydetBtn.style.display = 'inline-block';
  }
}

// ── NAVLUN OTOMATİK HESAP: FORM ALTINA GRUPLU/PARTNER ALANLARI EKLE ───────────
function injectNavlunUI(container) {
  // Her yeni form kurulumunda bekleyen tahsis kilidini sıfırla
  _navlunBekleyenAktif = false;
  _navlunBekleyenDosyaNo = null;

  const yil = window.APP_YIL || '2026';
  const box = document.createElement('div');
  box.style.cssText = 'margin-top:6px;padding:12px 14px;border:1px dashed var(--surface3);border-radius:8px;background:var(--surface2);';
  box.innerHTML = `
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:500;">
      <input type="checkbox" id="taslak_gruplu" onchange="navlunGrupluDegisti()">
      Gruplu sevkiyat mı? (ANT + İHR aynı sevkte)
    </label>
    <div id="taslak_partnerWrap" style="display:none;margin-top:10px;">
      <div style="font-size:12px;color:var(--text2);margin-bottom:4px;">Partner Dosya No</div>
      <div style="display:flex;gap:8px;align-items:center;">
        <select id="taslak_partnerYil" class="yil-select" style="font-family:var(--mono);font-size:13px;color:var(--text3);border:none;background:transparent;cursor:pointer;outline:none;padding:0;">
          <option ${yil === '2026' ? 'selected' : ''}>2026</option>
          <option ${yil === '2027' ? 'selected' : ''}>2027</option>
          <option ${yil === '2028' ? 'selected' : ''}>2028</option>
        </select>
        <span style="font-family:var(--mono);font-size:13px;color:var(--text3);">-</span>
        <input class="target-input" id="taslak_partnerNo" placeholder="örn: 101" style="flex:1;">
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:6px;">
        Bu taslak kaydedilince kalan navlun/sigorta bu partner dosyaya otomatik aktarılır.
      </div>
    </div>
    <div id="taslak_navlunNot" style="font-size:11px;color:var(--accent2);margin-top:8px;display:none;"></div>`;
  container.appendChild(box);

  // KAP değişince otomatik hesap tetikle
  const kapEl = document.getElementById('taslak_kap');
  if (kapEl) kapEl.addEventListener('input', navlunOtomatikHesapla);

  // Referans No girilince bu dosya için bekleyen tahsis var mı diye sor
  const refEl = document.getElementById('taslak_referansNo');
  if (refEl) refEl.addEventListener('blur', navlunBekleyenKontrol);
}

// ── GRUPLU TOGGLE DEĞİŞTİ ─────────────────────────────────────────────────────
function navlunGrupluDegisti() {
  const gruplu = document.getElementById('taslak_gruplu')?.checked;
  const wrap = document.getElementById('taslak_partnerWrap');
  if (wrap) wrap.style.display = gruplu ? 'block' : 'none';
  // Gruplu + komple birlikte anlamsız → gruplu seçilince komple kapanır
  if (gruplu && taslakKomple) {
    taslakKomple = false;
    const kompleEl = document.getElementById('taslakKomple');
    if (kompleEl) kompleEl.checked = false;
  }
  // Gruplu durumu navlun bazını değiştirir → yeniden hesapla
  navlunOtomatikHesapla();
}

// ── OTOMATİK NAVLUN/SİGORTA HESAPLA ───────────────────────────────────────────
async function navlunOtomatikHesapla() {
  if (!taslakUlke || !NAVLUN_ULKELER.has(taslakUlke)) return;
  // Komple seçiliyken kap değişimi tam tutarı ezmesin
  if (taslakKomple) return;
  // Partner taslağı bekleyen tahsisle dolduysa formül alanları ezmez
  if (_navlunBekleyenAktif) return;
  if (!taslakDepoTipi) return;

  const kapEl = document.getElementById('taslak_kap');
  const kap = kapEl ? kapEl.value.trim() : '';
  if (!kap) return;

  const gruplu = document.getElementById('taslak_gruplu')?.checked || false;
  try {
    const resp = await fetch('/api/navlun/hesapla', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ulkeKodu: taslakUlke, depoTipi: taslakDepoTipi, kap, gruplu }),
    });
    const data = await resp.json();
    if (!data.success) return;

    const navEl = document.getElementById('taslak_navlun');
    const sigEl = document.getElementById('taslak_sigorta');
    if (navEl) navEl.value = data.navlun;
    if (sigEl) sigEl.value = data.sigorta;

    const not = document.getElementById('taslak_navlunNot');
    if (not) {
      const paletBilgi = taslakDepoTipi === 'antrepo' ? ` · ${data.palet} palet` : '';
      not.style.display = 'block';
      not.style.color = 'var(--accent2)';
      not.textContent = `⚡ Otomatik: navlun ${data.navlun} · sigorta ${data.sigorta} ${data.paraBirimi}${paletBilgi} (değiştirilebilir)`;
    }
  } catch (e) {
    // Sessiz geç — kullanıcı elle girebilir
  }
}

// ── BEKLEYEN TAHSİS KONTROLÜ (partner taslağı açılışı) ────────────────────────
async function navlunBekleyenKontrol() {
  if (!taslakUlke || !NAVLUN_ULKELER.has(taslakUlke)) return;
  const refEl = document.getElementById('taslak_referansNo');
  if (!refEl) return;
  const val = refEl.value.trim();
  if (!val) return;

  // Tam dosya no: yıl-no
  const yilEl = refEl.closest('div')?.querySelector('select');
  const yil = yilEl ? yilEl.value : (window.APP_YIL || '2026');
  const dosyaNo = val.startsWith(yil + '-') ? val : yil + '-' + val;

  try {
    const resp = await fetch('/api/navlun/bekleyen?dosyaNo=' + encodeURIComponent(dosyaNo), { cache: 'no-store' });
    const data = await resp.json();
    if (!data.success) return;

    if (data.var) {
      // Formülü kilitle, alanları bekleyen tahsisle doldur
      _navlunBekleyenAktif = true;
      _navlunBekleyenDosyaNo = dosyaNo;
      const navEl = document.getElementById('taslak_navlun');
      const sigEl = document.getElementById('taslak_sigorta');
      if (navEl) navEl.value = data.navlun;
      if (sigEl) sigEl.value = data.sigorta;
      const not = document.getElementById('taslak_navlunNot');
      if (not) {
        not.style.display = 'block';
        not.style.color = 'var(--success,#1a7f37)';
        not.textContent = `🔗 Bekleyen tahsis uygulandı (kaynak: ${data.kaynakDosyaNo}): navlun ${data.navlun} · sigorta ${data.sigorta} ${data.paraBirimi}`;
      }
    } else {
      // Bu dosya için tahsis yok → formül serbest
      _navlunBekleyenAktif = false;
      _navlunBekleyenDosyaNo = null;
    }
  } catch (e) {
    // Sessiz geç
  }
}

// ── GRUPLU/PARTNER BİLGİSİNİ TOPLA ────────────────────────────────────────────
function getNavlunGrupluBilgi() {
  const grupluEl = document.getElementById('taslak_gruplu');
  const gruplu = grupluEl ? grupluEl.checked : false;
  if (!gruplu) return { gruplu: false, partnerDosyaNo: null };
  const noEl = document.getElementById('taslak_partnerNo');
  const yilEl = document.getElementById('taslak_partnerYil');
  const no = noEl ? noEl.value.trim() : '';
  if (!no) return { gruplu: true, partnerDosyaNo: null };
  const yil = yilEl ? yilEl.value : (window.APP_YIL || '2026');
  const partnerDosyaNo = no.startsWith(yil + '-') ? no : yil + '-' + no;
  return { gruplu: true, partnerDosyaNo };
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
      body: JSON.stringify({ ulkeKodu: taslakUlke, taslak: taslakB64, formData, depoTipi: taslakDepoTipi })
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

    // ── Kayıtlı taslak (form state) artık indirildi → "devam ediyor" listesinden düş ──
    if (taslakDraftId) {
      const _dId = taslakDraftId;
      taslakDraftId = null;
      fetch('/api/taslak-form/' + _dId, { method: 'DELETE' }).catch(() => {});
      loadTaslakDraftlar();
    }

    // ── NAVLUN GRUPLU: kalanı partner dosyaya sakla / tükettiğini işaretle ─────
    if (NAVLUN_ULKELER.has(taslakUlke)) {
      try {
        // Hesaplanan (override edilmiş olabilen) navlun/sigortayı Sevkiyatlar'a besle.
        // Backend doğru para birimi kolonuna yazar (EUR ülke→EUR, ge/kz→USD).
        await fetch('/api/navlun/sevkiyat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ulkeKodu: taslakUlke,
            dosyaNo: formData.referansNo,
            navlun: formData.navlun || 0,
            sigorta: formData.sigorta || 0,
          }),
        });

        const gb = getNavlunGrupluBilgi();
        // İlk (gruplu) taslak: kalanı partner dosyaya bekleyen tahsis olarak yaz.
        // Nihai (override edilmiş olabilen) navlun/sigorta değerleri gönderilir.
        if (gb.gruplu && gb.partnerDosyaNo) {
          await fetch('/api/navlun/tahsis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ulkeKodu: taslakUlke,
              partnerDosyaNo: gb.partnerDosyaNo,
              kaynakDosyaNo: formData.referansNo,
              navlunFinal: formData.navlun || 0,
              sigortaFinal: formData.sigorta || 0,
            }),
          });
        }
        // Partner taslağı: bu dosyanın bekleyen tahsisini kullanıldı işaretle
        if (_navlunBekleyenAktif && _navlunBekleyenDosyaNo) {
          await fetch('/api/navlun/tahsis-kullan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dosyaNo: _navlunBekleyenDosyaNo }),
          });
        }
      } catch(e) {
        console.warn('Navlun tahsis hatası:', e);
      }
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

// ══════════════════════════════════════════════════════════════════════════
// ── KAYITLI TASLAKLAR — form state kalıcılığı (indirilmemiş/eksik taslaklar) ──
// ══════════════════════════════════════════════════════════════════════════

// ── Ham (parse edilmemiş) form değerlerini topla — Kaydet için, validasyonsuz ──
function collectStandardDraftFields() {
  const formCfg = TASLAK_ULKELER[taslakUlke];
  const fields = {};
  if (!formCfg) return fields;
  formCfg.alanlar.forEach(alan => {
    const el = document.getElementById('taslak_' + alan.id);
    fields[alan.id] = el ? el.value : '';
  });
  return fields;
}

function collectKibrisDraftFields() {
  const gruplar = ['tekstil', 'tekstilDisi', 'kozmetik'];
  const fields = {};
  gruplar.forEach(g => {
    fields[g + '_kap']    = document.getElementById(`kibris_${g}_kap`)?.value    || '';
    fields[g + '_brutKg'] = document.getElementById(`kibris_${g}_brutKg`)?.value || '';
    fields[g + '_netKg']  = document.getElementById(`kibris_${g}_netKg`)?.value  || '';
  });
  fields.referansNo = document.getElementById('kibris_referansNo')?.value || '';
  return fields;
}

function _yilSelectNear(inputId) {
  return document.getElementById(inputId)?.closest('div')?.querySelector('select');
}

function _setYilSelectNear(inputId, yil) {
  if (!yil) return;
  const sel = _yilSelectNear(inputId);
  if (sel) sel.value = yil;
}

// ── KAYDET — eksik alanlarla da çalışır, tek zorunluluk ülke seçili olması ──
async function kaydetTaslakDraft() {
  if (!taslakUlke) { showTaslakStatus('error', '⚠ Önce ülke seçin.'); return; }
  const cfg = TASLAK_ULKELER[taslakUlke];
  const isKibris = cfg?.tip === 'kibris';

  const fields = isKibris ? collectKibrisDraftFields() : collectStandardDraftFields();
  const rawRef = (fields.referansNo || '').trim();
  const yilSel = isKibris ? _yilSelectNear('kibris_referansNo') : _yilSelectNear('taslak_referansNo');
  const yil = yilSel ? yilSel.value : (window.APP_YIL || localStorage.getItem('app_yil') || '2026');
  const referansNoTam = rawRef ? (rawRef.includes('-') ? rawRef : `${yil}-${rawRef}`) : '';

  const formData = {
    yil,
    komple:     taslakKomple,
    gruplu:     document.getElementById('taslak_gruplu')?.checked || false,
    partnerYil: document.getElementById('taslak_partnerYil')?.value || '',
    partnerNo:  document.getElementById('taslak_partnerNo')?.value || '',
    fields,
  };

  const btn = document.getElementById('taslakKaydet');
  const eskiMetin = btn ? btn.textContent : '';
  if (btn) { btn.textContent = '⏳ Kaydediliyor...'; btn.disabled = true; }
  try {
    const resp = await fetch('/api/taslak-form/kaydet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id:         taslakDraftId,
        ulkeKodu:   taslakUlke,
        ulkeAdi:    cfg?.label || taslakUlke,
        depoTipi:   taslakDepoTipi,
        referansNo: referansNoTam,
        formData,
      }),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');
    taslakDraftId = data.id;
    const refInfo = referansNoTam ? `: <span>${escapeHtml(referansNoTam)}</span>` : ' (referans no henüz girilmedi)';
    showTaslakStatus('success', `<div class="stat">💾 Taslak kaydedildi${refInfo}</div>`);
    loadTaslakDraftlar();
  } catch (err) {
    showTaslakStatus('error', '⚠ ' + err.message);
  } finally {
    if (btn) { btn.textContent = eskiMetin; btn.disabled = false; }
  }
}

// ── LİSTELE ───────────────────────────────────────────────────────────────────
async function loadTaslakDraftlar() {
  const section = document.getElementById('taslakKayitliSection');
  const listEl  = document.getElementById('taslakKayitliListe');
  if (!section || !listEl) return;
  try {
    const resp = await fetch('/api/taslak-form/liste');
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');
    const taslaklar = data.taslaklar || [];
    if (taslaklar.length === 0) {
      section.style.display = 'none';
      listEl.innerHTML = '';
      return;
    }
    section.style.display = 'block';
    renderTaslakDraftListesi(taslaklar);
  } catch (e) {
    console.warn('Kayıtlı taslak listesi alınamadı:', e);
  }
}

function renderTaslakDraftListesi(taslaklar) {
  const listEl = document.getElementById('taslakKayitliListe');
  listEl.innerHTML = '';

  taslaklar.forEach(t => {
    const ulkeLabel = escapeHtml(t.ulkeAdi || t.ulkeKodu);
    const refLabel  = t.referansNo ? escapeHtml(t.referansNo) : 'Referans no girilmedi';

    let seritHtml = '';
    if (t.uyari === 'silinecek') {
      const kalanMetin = t.kalanGun === 0 ? 'bugün silinecek' : `${t.kalanGun} gün sonra silinecek`;
      seritHtml = `
        <div style="margin-top:8px;padding:8px 10px;border-radius:6px;background:var(--warning-dim);color:var(--gold);font-size:11px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <span>⚠ 5 gün doluyor, ${kalanMetin} — tutmak ister misin?</span>
          <span class="btn-secondary" style="padding:4px 10px;font-size:11px;" onclick="tutTaslakDraft(event, ${t.id})">🔒 Tut</span>
        </div>`;
    } else if (t.uyari === 'onbes_gecti') {
      seritHtml = `
        <div style="margin-top:8px;padding:8px 10px;border-radius:6px;background:var(--surface2);color:var(--text2);font-size:11px;">
          🔒 Korunuyor · 15 günü geçti, hâlâ duruyor
        </div>`;
    }

    const korunanRozet = (t.korunan && t.uyari !== 'onbes_gecti')
      ? `<span class="badge" style="background:var(--surface2);color:var(--text2);">🔒 Korunuyor</span>`
      : '';

    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = `margin-bottom:8px;cursor:pointer;transition:border-color 0.15s;${t.korunan ? 'border-color:var(--accent);' : ''}`;
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <span class="badge badge-blue">${ulkeLabel}</span>
          ${korunanRozet}
        </div>
        <span style="font-size:10px;color:var(--error);cursor:pointer;" onclick="silTaslakDraft(event, ${t.id})">🗑 Sil</span>
      </div>
      <div style="font-family:var(--mono);font-size:13px;font-weight:600;color:var(--text);">${refLabel}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px;">Son güncelleme: ${escapeHtml(t.guncellemeTarihi)}</div>
      ${seritHtml}`;
    card.addEventListener('click', () => acTaslakDraft(t.id));
    listEl.appendChild(card);
  });
}

// ── DEVAM ET — kaydı çek, formu doldur ───────────────────────────────────────
async function acTaslakDraft(id) {
  try {
    showTaslakStatus('info', '⏳ Taslak yükleniyor...');
    const resp = await fetch('/api/taslak-form/' + id);
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Taslak bulunamadı');

    const kod = data.ulkeKodu;
    if (!TASLAK_ULKELER[kod]) throw new Error('Bilinmeyen ülke: ' + kod);

    await selectTaslakUlke(kod);  // taslakDraftId'yi sıfırlar, şablonu yükler
    taslakDraftId = id;           // devam edilen taslağın kimliğini geri yükle

    const formData = data.formData || {};

    if (!data.depoTipi) {
      showTaslakStatus('success', '<div class="stat">✓ Taslak yüklendi — devam etmek için depo tipi seçin.</div>');
      return;
    }
    selectTaslakDepo(data.depoTipi); // formu kurar (buildTaslakForm), komple/gruplu'yu sıfırlar

    const isKibris = TASLAK_ULKELER[kod]?.tip === 'kibris';
    const fields = formData.fields || {};

    if (isKibris) {
      ['tekstil', 'tekstilDisi', 'kozmetik'].forEach(g => {
        const kapEl  = document.getElementById(`kibris_${g}_kap`);
        const brutEl = document.getElementById(`kibris_${g}_brutKg`);
        const netEl  = document.getElementById(`kibris_${g}_netKg`);
        if (kapEl)  kapEl.value  = fields[g + '_kap']    || '';
        if (brutEl) brutEl.value = fields[g + '_brutKg'] || '';
        if (netEl)  netEl.value  = fields[g + '_netKg']  || '';
      });
      const refEl = document.getElementById('kibris_referansNo');
      if (refEl) refEl.value = fields.referansNo || '';
      _setYilSelectNear('kibris_referansNo', formData.yil);
    } else {
      const formCfg = TASLAK_ULKELER[kod];
      formCfg.alanlar.forEach(alan => {
        const el = document.getElementById('taslak_' + alan.id);
        if (el) el.value = fields[alan.id] || '';
      });
      _setYilSelectNear('taslak_referansNo', formData.yil);

      // Komple/gruplu/partner alanlarını DOĞRUDAN geri yükle — otomatik hesap
      // fonksiyonlarını (navlunKompleHesapla/navlunOtomatikHesapla) TETİKLEME,
      // aksi halde kaydedilmiş navlun/sigorta override'ları API çağrısıyla ezilir.
      taslakKomple = !!formData.komple;
      const kompleEl = document.getElementById('taslakKomple');
      if (kompleEl) kompleEl.checked = taslakKomple;

      const grupluEl = document.getElementById('taslak_gruplu');
      if (grupluEl) grupluEl.checked = !!formData.gruplu;
      const partnerWrap = document.getElementById('taslak_partnerWrap');
      if (partnerWrap) partnerWrap.style.display = formData.gruplu ? 'block' : 'none';
      const partnerYilEl = document.getElementById('taslak_partnerYil');
      if (partnerYilEl) partnerYilEl.value = formData.partnerYil || (window.APP_YIL || '2026');
      const partnerNoEl = document.getElementById('taslak_partnerNo');
      if (partnerNoEl) partnerNoEl.value = formData.partnerNo || '';
    }

    showTaslakStatus('success', '<div class="stat">✓ Taslak yüklendi, kaldığınız yerden devam edin.</div>');
  } catch (err) {
    showTaslakStatus('error', '⚠ ' + err.message);
  }
}

// ── SİL — onaylı ─────────────────────────────────────────────────────────────
async function silTaslakDraft(event, id) {
  event.stopPropagation();
  if (!confirm('Bu taslak kalıcı olarak silinsin mi?')) return;
  try {
    const resp = await fetch('/api/taslak-form/' + id, { method: 'DELETE' });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');
    if (taslakDraftId === id) taslakDraftId = null;
    loadTaslakDraftlar();
  } catch (err) {
    showTaslakStatus('error', '⚠ ' + err.message);
  }
}

// ── TUT — 5 günlük otomatik silmeden muaf tut ────────────────────────────────
async function tutTaslakDraft(event, id) {
  event.stopPropagation();
  try {
    const resp = await fetch('/api/taslak-form/' + id + '/koru', { method: 'POST' });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');
    loadTaslakDraftlar();
  } catch (err) {
    showTaslakStatus('error', '⚠ ' + err.message);
  }
}
