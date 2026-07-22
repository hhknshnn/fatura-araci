// ── YIL AYARI ─────────────────────────────────────────────────────────────────
// localStorage'dan yılı oku, yoksa config.json'dan defaultYil kullan
async function initYilAyari() {
  try {
    const cfg = await fetch('./config.json', { cache: 'no-store' }).then(r => r.json());
    const defaultYil = cfg.defaultYil || '2026';
    const secenekler = cfg.yilSecenekleri || ['2026', '2027', '2028'];
    const kayitliYil = localStorage.getItem('app_yil');
    window.APP_YIL = secenekler.includes(kayitliYil) ? kayitliYil : defaultYil;
  } catch (e) {
    window.APP_YIL = localStorage.getItem('app_yil') || '2026';
  }
}

// Tüm yıl select'lerini güncelle — buildTaslakForm sonrası da çağrılır
function updateYilSelects() {
  const yil = window.APP_YIL || '2026';
  document.querySelectorAll('select[id^="yilSecici"], select.yil-select').forEach(sel => {
    sel.value = yil;
  });
}

// ── SHELL.JS ──────────────────────────────────────────────────────────────────
// Sidebar navigasyon, wizard adım yönetimi ve topbar güncellemeleri.

// ── NAV GROUP TOGGLE ──────────────────────────────────────────────────────────
function toggleNavGroup(id) {
  const body    = document.getElementById('ngb-' + id);
  const chevron = document.getElementById('ngc-' + id);
  const header  = document.getElementById('ngh-' + id);
  if (!body) return;
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  header.classList.toggle('open', !isOpen);
  if (chevron) chevron.style.transform = isOpen ? 'rotate(-90deg)' : 'rotate(0deg)';
}

// ── SIDEBAR TOGGLE — mini mod ─────────────────────────────────────────────────
function toggleSidebar() {
  // Sidebar elementini al
  const sb = document.getElementById('mainSidebar') || document.querySelector('.sidebar');
  if (!sb) return;

  // mini class'ı toggle et (CSS transition ile 220px ↔ 60px geçişi)
  sb.classList.toggle('mini');

  // Fake scrollbar varsa konumunu güncelle
  const fakeScroll = document.getElementById('fake-scrollbar');
  if (fakeScroll) {
    const isMini = sb.classList.contains('mini');
    const sidebarW = isMini
      ? getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w-mini').trim()
      : getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w').trim();
    fakeScroll.style.left = sidebarW;
  }
}

// ── TÜM PANELLERİ GİZLE ──────────────────────────────────────────────────────
function hideAllPanels() {
  const contentArea = document.getElementById('contentArea');
  contentArea.style.padding = '';
  contentArea.classList.remove('fu-content-area');
  contentArea.classList.remove('ops-content-area');

  ['step2', 'step3', 'stepMense', 'stepTaslak', 'stepGtip', 'stepEvrak',
    'stepGecmis', 'stepUsers', 'stepPermissions', 'stepAudit', 'stepDashboard', 'stepSevkiyatlar',
    'stepFaturaUret', 'stepMaliyetEvrak', 'stepLandedCost', 'stepNebimDelivery', 'stepMaliyetTakip',
    'stepNavlunTanim'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  document.getElementById('wizardSteps').style.display = 'none';
}

// ── SIDEBAR NAVİGASYON ────────────────────────────────────────────────────────
function sidebarSelect(mod) {
  // Tüm nav-item'lardan active'i kaldır
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  // Seçilen nav-item'ı active yap
  const navEl = document.getElementById('nav-' + mod);
  if (navEl) navEl.classList.add('active');
  const navGecmis = document.getElementById('nav-gecmis-item');
  if (mod === 'gecmis' && navGecmis) navGecmis.classList.add('active');
  const navUsers = document.getElementById('nav-users-item');
  if (mod === 'users' && navUsers) navUsers.classList.add('active');
  const navPermissions = document.getElementById('nav-permissions-item');
  if (mod === 'permissions' && navPermissions) navPermissions.classList.add('active');
  const navAudit = document.getElementById('nav-audit-item');
  if (mod === 'audit' && navAudit) navAudit.classList.add('active');

  hideAllPanels();

  const titles = {
    sonrasi: 'INV + PL Oluştur',
    taslak: 'Taslak Doldur',
    oncesi: 'Menşe Hesapla',
    gtip: 'GTİP Kontrol',
    evrak: 'Ek Evrak Üret',
    gecmis: 'Son İşlemler',
    permissions: 'Admin Portalı',
    users: 'Kullanıcılar',
    audit: 'İşlem Kayıtları',
    dashboard: 'Dashboard',
    sevkiyatlar: 'Sevkiyatlar',
    'fatura-uret': 'Fatura Üret',
    'maliyet-evrak': 'Maliyet Evrak',
    'landed-cost': 'Landed Cost',
    'nebim-delivery': 'Nebim İrsaliye',
    'maliyet-takip': 'Maliyet Takip',
    'navlun-tanim': 'Navlun Tanımları',
  };
  document.getElementById('topbarTitle').textContent = titles[mod] || mod;
  document.getElementById('topbarCountry').style.display = 'none';
  document.getElementById('topbarDepo').style.display = 'none';
  document.getElementById('topbarRight').innerHTML = '';

  if (mod === 'sonrasi') {
    if (typeof resetSonrasiWizard === 'function') resetSonrasiWizard();
    document.getElementById('wizardSteps').style.display = 'flex';
    document.getElementById('step2').style.display = 'flex';
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

  } else if (mod === 'permissions') {
    if (window.currentUser?.role !== 'admin') {
      sidebarSelect('dashboard');
      return;
    }
    document.getElementById('stepPermissions').style.display = 'block';
    if (typeof initPermissionsPanel === 'function') initPermissionsPanel();

  } else if (mod === 'users') {
    if (window.currentUser?.role !== 'admin') {
      sidebarSelect('dashboard');
      return;
    }
    window.permissionsAdminTab = 'users';
    sidebarSelect('permissions');
    return;

  } else if (mod === 'audit') {
    if (window.currentUser?.role !== 'admin') {
      sidebarSelect('sonrasi');
      return;
    }
    document.getElementById('stepAudit').style.display = 'flex';
    if (typeof initAuditPanel === 'function') initAuditPanel();

  } else if (mod === 'dashboard') {
    document.getElementById('stepDashboard').style.display = 'block';
    if (window.currentUser && typeof loadDashboard === 'function') loadDashboard();

  } else if (mod === 'sevkiyatlar') {
    document.getElementById('stepSevkiyatlar').style.display = 'block';
    document.getElementById('contentArea').style.padding = '0';
    document.getElementById('contentArea').classList.add('ops-content-area');
    if (typeof loadShipments === 'function') loadShipments();

  } else if (mod === 'fatura-uret') {
    document.getElementById('contentArea').classList.add('fu-content-area');
    document.getElementById('contentArea').classList.add('ops-content-area');
    // Hub'a her yeni girişte INV+PL sekmesi ilk açılışında bir kez sıfırlansın
    _fuInvplOpened = false;
    // Fatura Üret — sekme yapısı (Taslak, GTİP & Menşe, INV+PL, Ek Evrak)
    let panel = document.getElementById('stepFaturaUret');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'stepFaturaUret';
      panel.className = 'panel fu-shell';
      panel.innerHTML = `
        <div class="fu-header">
          <div class="fu-heading">
            <div class="fu-kicker">Fatura operasyonları</div>
          </div>
          <div class="fu-header-metrics" aria-label="Fatura üret özeti">
            <div class="fu-metric">
              <i class="ti ti-files" aria-hidden="true"></i>
              <div>
                <span>3</span>
                <small>Aktif modül</small>
              </div>
            </div>
            <div class="fu-metric">
              <i class="ti ti-route" aria-hidden="true"></i>
              <div>
                <span>Tek akış</span>
                <small>Uçtan uca üretim</small>
              </div>
            </div>
            <div class="fu-metric">
              <i class="ti ti-shield-check" aria-hidden="true"></i>
              <div>
                <span>Kontrollü</span>
                <small>GTİP + menşe</small>
              </div>
            </div>
          </div>
        </div>
        <div class="fu-tabs" role="tablist" aria-label="Fatura üret bölümleri">
          <button class="fu-tab active" id="fu-tab-taslak" onclick="switchFaturaUretTab('taslak')" type="button">
            <i class="ti ti-file-description" aria-hidden="true"></i><span>Taslak</span>
          </button>
          <button class="fu-tab" id="fu-tab-gtip" onclick="switchFaturaUretTab('gtip')" type="button">
            <i class="ti ti-search" aria-hidden="true"></i><span>GTİP &amp; Menşe</span>
          </button>
          <button class="fu-tab" id="fu-tab-invpl" onclick="switchFaturaUretTab('invpl')" type="button">
            <i class="ti ti-file-invoice" aria-hidden="true"></i><span>INV + PL</span>
          </button>
          <!-- <button class="fu-tab" id="fu-tab-evrak" onclick="switchFaturaUretTab('evrak')" type="button">
            <i class="ti ti-paperclip" aria-hidden="true"></i><span>Ek Evrak</span>
          </button> -->
        </div>
        <div class="fu-workspace">
          <div id="fu-content-taslak" class="fu-tab-panel"></div>
          <div id="fu-content-gtip" class="fu-tab-panel" style="display:none;"></div>
          <div id="fu-content-invpl" class="fu-tab-panel" style="display:none;"></div>
          <!-- <div id="fu-content-evrak" class="fu-tab-panel" style="display:none;"></div> -->
        </div>
      `;
      document.getElementById('contentArea').appendChild(panel);
    }
    panel.style.display = 'block';
    // İlk açılışta Taslak sekmesini göster
    switchFaturaUretTab('taslak');

  } else if (mod === 'maliyet-evrak') {
    document.getElementById('contentArea').style.padding = '0';
    document.getElementById('contentArea').classList.add('ops-content-area');
    const panel = document.getElementById('stepMaliyetEvrak');
    panel.style.display = 'block';
    initMaliyetEvrakAccordion(panel);
    // Her navigate'te PDF upload state'ini sıfırla
    const meStatus = document.getElementById('me-rs-status');
    const meResult = document.getElementById('me-rs-result');
    const meInput  = document.getElementById('me-rs-input');
    if (meStatus) { meStatus.textContent = 'PDF\'i buraya sürükleyin veya tıklayın'; meStatus.style.color = 'var(--text3)'; }
    if (meResult) meResult.style.display = 'none';
    if (meInput)  meInput.value = '';
    if (typeof meLoadRsShipments === 'function') meLoadRsShipments();
    // BA sıfırla
    ['osnovica', 'carinski', 'vergi', 'kdv'].forEach(key => {
      const el = document.getElementById(`me-ba-manual-${key}`);
      if (el) el.value = '';
    });
    const meBaManualStatus = document.getElementById('me-ba-manual-status');
    if (meBaManualStatus) meBaManualStatus.textContent = '';
    if (typeof meBaManualPreview === 'function') meBaManualPreview();
    if (typeof meLoadBaShipments === 'function') meLoadBaShipments();
    // MK sıfırla
    const meMkBrokerEl = document.getElementById('me-mk-manual-broker');
    if (meMkBrokerEl) meMkBrokerEl.value = '120';
    ['vergi', 'kdv', 'other'].forEach(key => {
      const el = document.getElementById(`me-mk-manual-${key}`);
      if (el) el.value = '';
    });
    const meMkManualStatus = document.getElementById('me-mk-manual-status');
    if (meMkManualStatus) meMkManualStatus.textContent = '';
    if (typeof meMkManualPreview === 'function') meMkManualPreview();
    if (typeof meLoadMkShipments === 'function') meLoadMkShipments();
    // GE sıfırla
    const meGeStatus = document.getElementById('me-ge-status');
    const meGeResult = document.getElementById('me-ge-result');
    const meGeInput  = document.getElementById('me-ge-input');
    if (meGeStatus) { meGeStatus.textContent = 'PDF\'i buraya sürükleyin veya tıklayın (Broker veya IM)'; meGeStatus.style.color = 'var(--text3)'; }
    if (meGeResult) meGeResult.style.display = 'none';
    if (meGeInput)  meGeInput.value = '';
    if (typeof meLoadGeShipments === 'function') meLoadGeShipments();
    // KO sıfırla
    const meKoStatus = document.getElementById('me-ko-status');
    const meKoResult = document.getElementById('me-ko-result');
    const meKoInput  = document.getElementById('me-ko-input');
    if (meKoStatus) { meKoStatus.textContent = 'PDF\'i buraya sürükleyin veya tıklayın'; meKoStatus.style.color = 'var(--text3)'; }
    if (meKoResult) meKoResult.style.display = 'none';
    if (meKoInput)  meKoInput.value = '';
    if (typeof meLoadKoShipments === 'function') meLoadKoShipments();
    // KZ sıfırla
    const meKzStatus = document.getElementById('me-kz-status');
    const meKzResult = document.getElementById('me-kz-result');
    const meKzInput  = document.getElementById('me-kz-input');
    if (meKzStatus) { meKzStatus.textContent = 'PDF\'i buraya sürükleyin veya tıklayın (Beyanname veya Broker)'; meKzStatus.style.color = 'var(--text3)'; }
    if (meKzResult) meKzResult.style.display = 'none';
    if (meKzInput)  meKzInput.value = '';
    if (typeof meLoadKzShipments === 'function') meLoadKzShipments();
    // DE sıfırla
    const meDeStatus = document.getElementById('me-de-status');
    const meDeResult = document.getElementById('me-de-result');
    const meDeInput  = document.getElementById('me-de-input');
    if (meDeStatus) { meDeStatus.textContent = 'PDF\'i buraya sürükleyin veya tıklayın'; meDeStatus.style.color = 'var(--text3)'; }
    if (meDeResult) meDeResult.style.display = 'none';
    if (meDeInput)  meDeInput.value = '';
    if (typeof meLoadDeShipments === 'function') meLoadDeShipments();
    // NL sıfırla
    const meNlStatus = document.getElementById('me-nl-status');
    const meNlResult = document.getElementById('me-nl-result');
    const meNlInput  = document.getElementById('me-nl-input');
    if (meNlStatus) { meNlStatus.textContent = 'PDF\'i buraya sürükleyin veya tıklayın'; meNlStatus.style.color = 'var(--text3)'; }
    if (meNlResult) meNlResult.style.display = 'none';
    if (meNlInput)  meNlInput.value = '';
    if (typeof meLoadNlShipments === 'function') meLoadNlShipments();
  } else if (mod === 'landed-cost') {
    document.getElementById('contentArea').style.padding = '0';
    document.getElementById('contentArea').classList.add('ops-content-area');
    let panel = document.getElementById('stepLandedCost');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'stepLandedCost';
      panel.className = 'panel';
      document.getElementById('contentArea').appendChild(panel);
    }
    panel.style.display = 'block';
    if (typeof initLandedCostPanel === 'function') initLandedCostPanel();
  } else if (mod === 'nebim-delivery') {
    document.getElementById('contentArea').style.padding = '0';
    document.getElementById('contentArea').classList.add('ops-content-area');
    let panel = document.getElementById('stepNebimDelivery');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'stepNebimDelivery';
      panel.className = 'panel';
      document.getElementById('contentArea').appendChild(panel);
    }
    panel.style.display = 'block';
    if (typeof initNebimDeliveryPanel === 'function') initNebimDeliveryPanel();
  } else if (mod === 'maliyet-takip') {
    document.getElementById('contentArea').style.padding = '0';
    document.getElementById('contentArea').classList.add('ops-content-area');
    let panel = document.getElementById('stepMaliyetTakip');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'stepMaliyetTakip';
      panel.className = 'panel';
      document.getElementById('contentArea').appendChild(panel);
    }
    panel.style.display = 'block';
    if (typeof initMaliyetPanel === 'function') initMaliyetPanel();
  } else if (mod === 'navlun-tanim') {
    // Navlun Tanımları — kurumsal ülkelerin navlun/sigorta değerleri (admin)
    document.getElementById('contentArea').style.padding = '0';
    document.getElementById('contentArea').classList.add('ops-content-area');
    let panel = document.getElementById('stepNavlunTanim');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'stepNavlunTanim';
      panel.className = 'panel';
      document.getElementById('contentArea').appendChild(panel);
    }
    panel.style.display = 'block';
    if (typeof initNavlunTanimPanel === 'function') initNavlunTanimPanel();
  }

  // ── URL GÜNCELLEMESİ ───────────────────────────────────────────────────────
  const newPath = '/' + mod;
  if (location.pathname !== newPath) {
    history.pushState(null, '', newPath);
  }
}

function initMaliyetEvrakAccordion(panel) {
  if (!panel || panel.dataset.accordionReady === '1') return;
  panel.dataset.accordionReady = '1';

  panel.querySelectorAll('.me-card-head').forEach(head => {
    head.setAttribute('role', 'button');
    head.setAttribute('tabindex', '0');
    head.setAttribute('aria-expanded', 'false');
  });

  panel.addEventListener('click', event => {
    const head = event.target.closest('.me-card-head');
    if (!head || !panel.contains(head)) return;
    toggleMaliyetEvrakCard(head.closest('.me-card'));
  });

  panel.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const head = event.target.closest('.me-card-head');
    if (!head || !panel.contains(head)) return;
    event.preventDefault();
    toggleMaliyetEvrakCard(head.closest('.me-card'));
  });
}

function toggleMaliyetEvrakCard(card) {
  if (!card) return;
  const panel = card.closest('#stepMaliyetEvrak');
  const willOpen = !card.classList.contains('is-open');

  panel.querySelectorAll('.me-card.is-open').forEach(openCard => {
    openCard.classList.remove('is-open');
    openCard.querySelector('.me-card-head')?.setAttribute('aria-expanded', 'false');
  });

  if (willOpen) {
    card.classList.add('is-open');
    card.querySelector('.me-card-head')?.setAttribute('aria-expanded', 'true');
  }
}

// Tarayıcı geri/ileri düğmesi
window.addEventListener('popstate', () => {
  const mod = location.pathname.replace(/^\//, '') || 'dashboard';
  sidebarSelect(mod);
});

// ── WIZARD ADIM GÖSTERGELERİ ─────────────────────────────────────────────────
function updateWizardDots(activeStep) {
  for (let i = 1; i <= 2; i++) {
    const dot = document.getElementById('dot' + i);
    const lbl = document.getElementById('lbl' + i);
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
  const map = { 1: 'step2', 2: 'step3' };
  const target = map[n];
  if (target) document.getElementById(target).style.display = 'block';
}

// ── ADIM GEÇİŞİ ──────────────────────────────────────────────────────────────
function goStep(n) {
  ['step2', 'step3'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const panelMap = { 1: 'step2', 2: 'step3' };
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
  const depoBadge = document.getElementById('topbarDepo');

  const names = {
    rs: 'Sırbistan', ba: 'Bosna', ge: 'Gürcistan', xk: 'Kosova', mk: 'Makedonya',
    be: 'Belçika', de: 'Almanya', nl: 'Hollanda', kz: 'Kazakistan', cy: 'Kıbrıs',
    iq: 'Irak', ly: 'Libya', lr: 'Liberya', lb: 'Lübnan', uz: 'Özbekistan', ru: 'Rusya',
    abh: 'Abhazya', jo: 'Ürdün', mu: 'Mauritius'
  };

  if (typeof currentCountry !== 'undefined' && currentCountry) {
    countryBadge.textContent = names[currentCountry] || currentCountry;
    countryBadge.style.display = '';
  } else {
    countryBadge.style.display = 'none';
  }

  if (typeof selectedDepo !== 'undefined' && selectedDepo) {
    depoBadge.textContent = selectedDepo === 'antrepo' ? 'Antrepo' : 'Serbest Depo';
    depoBadge.style.display = '';
  } else {
    depoBadge.style.display = 'none';
  }
}

// ── ÜLKE LİSTESİ ARAMA — yeni kart yapısı (.cc) ──────────────────────────────
function filterCountryList() {
  // INV+PL wizard step2 arama kutusu
  const q = document.getElementById('countrySearchInput').value.toLowerCase().trim();
  let total = 0;

  // Tüm .cc kartlarını gez, data-name ile filtrele
  document.querySelectorAll('#cc-grid-kurumsal .cc, #cc-grid-franchise .cc').forEach(card => {
    const name = card.dataset.name || '';
    const show = !q || name.includes(q);
    card.style.display = show ? '' : 'none';
    if (show) total++;
  });

  // Grup grid + etiketini gizle/göster
  ['kurumsal', 'franchise'].forEach(grup => {
    const grid = document.getElementById('cc-grid-' + grup);
    const lbl = document.getElementById('cc-lbl-' + grup);
    if (!grid) return;
    const visible = [...grid.querySelectorAll('.cc')].some(c => c.style.display !== 'none');
    grid.style.display = visible ? '' : 'none';
    if (lbl) lbl.style.display = visible ? '' : 'none';
  });

  // Sonuç bulunamadı mesajı
  const nr = document.getElementById('countryNoResults');
  if (nr) nr.style.display = total === 0 ? 'block' : 'none';
}

// ── FATURA ÜRET — SEKME GEÇİŞİ ───────────────────────────────────────────────
// Orijinal panelleri taşır — innerHTML kopyası değil, gerçek DOM elemanları
let _fuInvplOpened = false;

function switchFaturaUretTab(tab) {
  // Sekme butonlarını güncelle
  ['taslak', 'gtip', 'invpl' /*, 'evrak' */].forEach(t => {
    const btn = document.getElementById('fu-tab-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
  });

  // Panelleri gizle/göster — orijinal DOM elemanlarını direkt kullan
  const panelMap = {
    taslak: ['stepTaslak'],
    gtip:   ['stepGtip'],
    invpl:  ['wizardSteps', 'step2'],
    // evrak:  ['stepEvrak'],
  };

  // Önce hepsini gizle
  Object.values(panelMap).flat().forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  // Seçili sekmenin panellerini fu-content içine taşı ve göster
  const container = document.getElementById('fu-content-' + tab);
  if (!container) return;

  // fu-content divlerini temizle (display none yeterli)
  ['taslak','gtip','invpl','evrak'].forEach(t => {
    const c = document.getElementById('fu-content-' + t);
    if (c) c.style.display = t === tab ? 'block' : 'none';
  });

  const ids = panelMap[tab] || [];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    // Eleman zaten container içinde değilse taşı
    if (el.parentNode !== container) container.appendChild(el);
    // Görünürlük ayarla
    if (id === 'wizardSteps') el.style.display = 'flex';
    else if (id === 'step2')  el.style.display = 'flex';
    else                       el.style.display = 'block';
  });

  // Init fonksiyonlarını çağır
  if (tab === 'taslak' && typeof initTaslakPanel === 'function') {
    setTimeout(initTaslakPanel, 0);
  } else if (tab === 'gtip' && typeof initGtipPanel === 'function') {
    setTimeout(initGtipPanel, 0);
  } else if (tab === 'invpl' && !_fuInvplOpened && typeof resetSonrasiWizard === 'function') {
    _fuInvplOpened = true;
    setTimeout(resetSonrasiWizard, 0);
  }
  // else if (tab === 'evrak' && typeof initEvrakPanel === 'function') {
  //   setTimeout(initEvrakPanel, 0);
  // }
}

async function startAppAtDashboard() {
  await initYilAyari();
  await loadCountriesConfig();
  updateYilSelects();
  const initMod = 'dashboard';
  if (location.pathname !== '/dashboard') {
    history.replaceState(null, '', '/dashboard');
  }
  sidebarSelect(initMod);
  if (typeof checkGecmisCount === 'function') checkGecmisCount();
  if (typeof checkNebimWarningCount === 'function') checkNebimWarningCount();
}

// ── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // window.currentUser'ın rol kontrollerinden (bkz. sidebarSelect) önce
  // kesin belirlenmiş olması için oturum kontrolünü bekle.
  if (window.authReadyPromise) await window.authReadyPromise;
  await startAppAtDashboard();
});
