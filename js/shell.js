// ── SHELL.JS ──────────────────────────────────────────────────────────────────
// Sidebar navigasyon, wizard adım yönetimi ve topbar güncellemeleri.

// ── TÜM PANELLERİ GİZLE ──────────────────────────────────────────────────────
// Sidebar toggle
function toggleSidebar() {
  const sb = document.querySelector(".sidebar");
  sb.classList.toggle("collapsed");
  const collapsed = sb.classList.contains("collapsed");
  const fs = document.getElementById("fake-scrollbar");
  if (fs) fs.style.left = collapsed ? "0" : "220px";
  // Tablo alanını genişlet
  const main = document.querySelector(".main-area");
  if (main) main.style.marginLeft = collapsed ? "0" : "";
}

function hideAllPanels() {
  document.getElementById('contentArea').style.padding = '';

  ['step2','step3','stepMense','stepTaslak','stepGtip','stepEvrak','stepGecmis','stepUsers','stepDashboard','stepSevkiyatlar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.getElementById('wizardSteps').style.display = 'none';
}

// ── SIDEBAR NAVİGASYON ────────────────────────────────────────────────────────
function sidebarSelect(mod) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById('nav-' + mod);
  if (navEl) navEl.classList.add('active');
  const navGecmis = document.getElementById('nav-gecmis-item');
  if (mod === 'gecmis' && navGecmis) navGecmis.classList.add('active');
  const navUsers = document.getElementById('nav-users-item');
  if (mod === 'users' && navUsers) navUsers.classList.add('active');

  hideAllPanels();

  const titles = {
    sonrasi:     'INV + PL Oluştur',
    taslak:      'Taslak Doldur',
    oncesi:      'Menşe Hesapla',
    gtip:        'GTİP Kontrol',
    evrak:       'Ek Evrak Üret',
    gecmis:      'Son İşlemler',
    users:       'Kullanıcılar',
    dashboard:   'Dashboard',
    sevkiyatlar: 'Sevkiyatlar',
  };
  document.getElementById('topbarTitle').textContent = titles[mod] || mod;
  document.getElementById('topbarCountry').style.display = 'none';
  document.getElementById('topbarDepo').style.display    = 'none';
  document.getElementById('topbarRight').innerHTML       = '';

  if (mod === 'sonrasi') {
    document.getElementById('wizardSteps').style.display = 'flex';
    document.getElementById('step2').style.display       = 'flex';
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

  } else if (mod === 'gecmis') {
    document.getElementById('stepGecmis').style.display = 'flex';
    if (typeof initGecmisPanel === 'function') initGecmisPanel();

  } else if (mod === 'users') {
    if (window.currentUser?.role !== 'admin') {
      sidebarSelect('sonrasi');
      return;
    }
    document.getElementById('stepUsers').style.display = 'flex';
    if (typeof initUsersPanel === 'function') initUsersPanel();

  } else if (mod === 'dashboard') {
    document.getElementById('stepDashboard').style.display = 'block';
    if (typeof loadDashboard === 'function') loadDashboard();

  } else if (mod === 'sevkiyatlar') {
    document.getElementById('stepSevkiyatlar').style.display = 'block';
    document.getElementById('contentArea').style.padding = '0';
    if (typeof loadShipments === 'function') loadShipments();
  }
}

// ── WIZARD ADIM GÖSTERGELERİ ─────────────────────────────────────────────────
function updateWizardDots(activeStep) {
  for (let i = 1; i <= 2; i++) {
    const dot  = document.getElementById('dot' + i);
    const lbl  = document.getElementById('lbl' + i);
    const line = document.getElementById('line' + i);
    if (!dot) continue;
    dot.className = 'step-dot ' + (i < activeStep ? 'done' : i === activeStep ? 'active' : 'idle');
    if (lbl) lbl.className = 'step-label' + (i === activeStep ? ' active' : i < activeStep ? ' done' : '');
    if (line) line.className = 'step-line' + (i < activeStep ? ' done' : '');
  }
}

function updateDots(n) { updateWizardDots(n); }

// ── GÖSTER / GİZLE ────────────────────────────────────────────────────────────
function showOnlyStep(n) {
  hideAllPanels();
  const map = { 1:'step2', 2:'step3' };
  const target = map[n];
  if (target) document.getElementById(target).style.display = 'block';
}

// ── ADIM GEÇİŞİ ──────────────────────────────────────────────────────────────
function goStep(n) {
  ['step2','step3'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const panelMap = { 1:'step2', 2:'step3' };
  const target = panelMap[n];
  if (target) document.getElementById(target).style.display = 'flex';
  updateWizardDots(n);
  updateTopbarBadges();

  if (n === 1 && typeof initStep4 === 'function') setTimeout(initStep4, 0);
  if (n === 2 && typeof initStep5 === 'function') setTimeout(initStep5, 0);
}

// ── TOPBAR BADGE GÜNCELLEMESİ ────────────────────────────────────────────────
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

// ── ÜLKE LİSTESİ — toggle, arama ─────────────────────────────────────────────
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
    const countEl = document.getElementById('ccount-' + gId);
    const body    = document.getElementById('cbody-' + gId);
    const chevron = document.getElementById('cchevron-' + gId);
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

// ── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.querySelectorAll('.country-row').forEach(row => {
    row.classList.add('country-btn');
  });
  await loadCountriesConfig();
  sidebarSelect('dashboard');
  if (typeof checkGecmisCount === 'function') checkGecmisCount();
});