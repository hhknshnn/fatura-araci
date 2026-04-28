// ── SHELL.JS ──────────────────────────────────────────────────────────────────
// Sidebar navigasyon, wizard adım yönetimi ve topbar güncellemeleri.
// HTML/CSS ile arasındaki köprü — iş logic'i ilgili modüllerde.

// ── TÜM PANELLERİ GİZLE ──────────────────────────────────────────────────────
function hideAllPanels() {
  ['step1','step2','step3','stepMense','stepTaslak','stepGtip','stepEvrak'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.getElementById('wizardSteps').style.display = 'none';
}

// ── SIDEBAR NAVİGASYON ────────────────────────────────────────────────────────
function sidebarSelect(mod) {
  // Nav item'ları güncelle
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById('nav-' + mod);
  if (navEl) navEl.classList.add('active');

  hideAllPanels();

  // Topbar
  const titles = {
    sonrasi: 'INV + PL Oluştur',
    taslak:  'Taslak Doldur',
    oncesi:  'Menşe Hesapla',
    gtip:    'GTİP Kontrol',
    evrak:   'Ek Evrak Üret',
  };
  document.getElementById('topbarTitle').textContent = titles[mod] || mod;
  document.getElementById('topbarCountry').style.display = 'none';
  document.getElementById('topbarDepo').style.display    = 'none';
  document.getElementById('topbarRight').innerHTML       = '';

  if (mod === 'sonrasi') {
    document.getElementById('wizardSteps').style.display = 'flex';
    document.getElementById('step1').style.display       = 'flex';
    updateWizardDots(1);
    if (typeof selectMod === 'function') selectMod('sonrasi');

  } else if (mod === 'oncesi') {
    document.getElementById('stepMense').style.display = 'block';
    if (typeof initMensePanel === 'function') initMensePanel();

  } else if (mod === 'taslak') {
    document.getElementById('stepTaslak').style.display = 'flex';
    if (typeof initTaslakPanel === 'function') initTaslakPanel();

  } else if (mod === 'gtip') {
    document.getElementById('stepGtip').style.display = 'flex';
    if (typeof initGtipPanel === 'function') initGtipPanel();

  } else if (mod === 'evrak') {
    document.getElementById('stepEvrak').style.display = 'flex';
    if (typeof initEvrakPanel === 'function') initEvrakPanel();
  }
}

// ── WIZARD ADIM GÖSTERGELERİ ──────────────────────────────────────────────────
function updateWizardDots(activeStep) {
  for (let i = 1; i <= 3; i++) {
    const dot  = document.getElementById('dot' + i);
    const lbl  = document.getElementById('lbl' + i);
    const line = document.getElementById('line' + i);
    if (!dot) continue;
    dot.className = 'step-dot ' + (i < activeStep ? 'done' : i === activeStep ? 'active' : 'idle');
    if (lbl) lbl.className = 'step-label' + (i === activeStep ? ' active' : i < activeStep ? ' done' : '');
    if (line) line.className = 'step-line' + (i < activeStep ? ' done' : '');
  }
}

// wizard.js updateDots → buraya yönlendir
function updateDots(n) { updateWizardDots(n); }

// ── GÖSTER / GİZLE (wizard.js'in showOnlyStep'i bunu çağırır) ────────────────
function showOnlyStep(n) {
  hideAllPanels();
  // Eski adım numarası → yeni panel mapping
  // 0 = hepsi gizli
  // 1,2 = step1 (depo)
  // 3,4 = step2 (ülke+dosya)
  // 5   = step3 (kg+hesap)
  const map = { 1:'step1', 2:'step1', 3:'step2', 4:'step2', 5:'step3' };
  const target = map[n];
  if (target) document.getElementById(target).style.display = 'block';
}

// ── ADIM GEÇİŞİ (wizard.js'in goStep'ini override eder) ──────────────────────
function goStep(n) {
  const panelMap = { 1:'step1', 2:'step2', 3:'step3' };
  ['step1','step2','step3'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const target = panelMap[n];
  if (target) document.getElementById(target).style.display = 'flex';
  updateWizardDots(n);
  updateTopbarBadges();

  if (n === 2 && typeof initStep4 === 'function') setTimeout(initStep4, 0);
  if (n === 3 && typeof initStep5 === 'function') setTimeout(initStep5, 0);
}

// ── TOPBAR BADGE GÜNCELLEMESİ ─────────────────────────────────────────────────
function updateTopbarBadges() {
  const countryBadge = document.getElementById('topbarCountry');
  const depoBadge    = document.getElementById('topbarDepo');

  const names = {
    rs:'Sırbistan', ba:'Bosna', ge:'Gürcistan', xk:'Kosova', mk:'Makedonya',
    be:'Belçika', de:'Almanya', nl:'Hollanda', kz:'Kazakistan', cy:'Kıbrıs',
    iq:'Irak', ly:'Libya', lr:'Liberya', lb:'Lübnan', uz:'Özbekistan', ru:'Rusya'
  };

  if (typeof currentCountry !== 'undefined' && currentCountry) {
    countryBadge.textContent   = names[currentCountry] || currentCountry;
    countryBadge.style.display = '';
  } else {
    countryBadge.style.display = 'none';
  }

  if (typeof selectedDepo !== 'undefined' && selectedDepo) {
    depoBadge.textContent   = selectedDepo === 'antrepo' ? 'Antrepo' : 'Serbest Depo';
    depoBadge.style.display = '';
  } else {
    depoBadge.style.display = 'none';
  }
}

// ── Ülke listesi — toggle, arama, active sync ─────────────────────────────────
function toggleCountryGroup(id) {
  const body    = document.getElementById('cbody-' + id);
  const chevron = document.getElementById('cchevron-' + id);
  if (!body) return;
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  if (chevron) chevron.classList.toggle('open', !isOpen);
}

function filterCountryList() {
  const q = document.getElementById('countrySearchInput').value.toLowerCase().trim();
  let total = 0;

  ['kurumsal', 'franchise'].forEach(gId => {
    const rows = document.querySelectorAll('#cbody-' + gId + ' .country-row');
    let visible = 0;
    rows.forEach(row => {
      const name = row.querySelector('.country-row-name').textContent.toLowerCase();
      const show = !q || name.includes(q);
      row.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    const countEl   = document.getElementById('ccount-' + gId);
    const body      = document.getElementById('cbody-' + gId);
    const chevron   = document.getElementById('cchevron-' + gId);
    if (countEl) countEl.textContent = visible;
    if (q && visible > 0 && body) {
      body.classList.add('open');
      if (chevron) chevron.classList.add('open');
    }
    total += visible;
  });

  const nr = document.getElementById('countryNoResults');
  if (nr) nr.style.display = total === 0 ? 'block' : 'none';
}

// wizard.js selectCountry uyumluluğu — country-row'lara country-btn class'ı DOMContentLoaded'da ekleniyor
document.addEventListener('DOMContentLoaded', () => {
  // country-row'lara country-btn class'ı ekle — wizard.js uyumluluğu için
  document.querySelectorAll('.country-row').forEach(row => {
    row.classList.add('country-btn');
  });

  // Kullanıcı adı
  const savedName = localStorage.getItem('fa_username') || 'Kullanıcı';
  document.getElementById('sidebarUserName').textContent = savedName;
  const initials = savedName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  document.getElementById('sidebarAvatar').textContent = initials || '?';

  // Başlangıç ekranı
  sidebarSelect('sonrasi');
});