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
let _sidebarAutoMini = false;
let _sidebarPrevMini = false;

function syncSidebarChrome() {
  const sb = document.getElementById('mainSidebar') || document.querySelector('.sidebar');
  if (!sb) return;
  const isMini = sb.classList.contains('mini');
  const fakeScroll = document.getElementById('fake-scrollbar');
  if (fakeScroll) {
    const sidebarW = isMini
      ? getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w-mini').trim()
      : getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w').trim();
    fakeScroll.style.left = sidebarW;
  }
  const icon = document.getElementById('toggleIcon');
  if (icon) {
    icon.className = isMini ? 'ti ti-layout-sidebar-right-collapse' : 'ti ti-layout-sidebar-left-collapse';
  }
}

function setSidebarMini(on) {
  const sb = document.getElementById('mainSidebar') || document.querySelector('.sidebar');
  if (!sb) return;
  sb.classList.toggle('mini', !!on);
  syncSidebarChrome();
}

function toggleSidebar() {
  const sb = document.getElementById('mainSidebar') || document.querySelector('.sidebar');
  if (!sb) return;
  sb.classList.toggle('mini');
  syncSidebarChrome();
}

function applySidebarForModule(mod) {
  const sb = document.getElementById('mainSidebar') || document.querySelector('.sidebar');
  if (!sb) return;
  const autoMini = mod === 'maliyet-takip';
  if (autoMini) {
    if (!_sidebarAutoMini) {
      _sidebarPrevMini = sb.classList.contains('mini');
      _sidebarAutoMini = true;
    }
    setSidebarMini(true);
  } else if (_sidebarAutoMini) {
    _sidebarAutoMini = false;
    setSidebarMini(_sidebarPrevMini);
  }
}

// ── TÜM PANELLERİ GİZLE ──────────────────────────────────────────────────────
function hideAllPanels() {
  const contentArea = document.getElementById('contentArea');
  contentArea.style.padding = '';
  contentArea.style.overflow = '';
  contentArea.classList.remove('fu-content-area');
  contentArea.classList.remove('ops-content-area');
  contentArea.classList.remove('m2-fill');

  ['step2', 'step3', 'stepMense', 'stepTaslak', 'stepGtip', 'stepEvrak',
    'stepGecmis', 'stepUsers', 'stepPermissions', 'stepAudit', 'stepDashboard', 'stepSevkiyatlar',
    'stepFaturaUret', 'stepMaliyetEvrak', 'stepLandedCost', 'stepNebimDelivery', 'stepMaliyetTakip',
    'stepMaliyetTakip2', 'stepNavlunTanim', 'stepKurYonetimi'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  document.getElementById('wizardSteps').style.display = 'none';

  // Sevkiyatlar'daki çoklu seçim çubuğu body'ye fixed ekleniyor; modül değişince
  // seçimi temizle ki başka sekmede alt çubuk asılı kalmasın.
  if (typeof secimIptal === 'function') secimIptal();
}

// ── SPA ROTASI ────────────────────────────────────────────────────────────────
// Adres çubuğu modül (+ Fatura Üret / Maliyet Evrak sekmesi) tutar.
// Yenileme ve paylaşılan link açılışta bu path'ten restore edilir.
const APP_MODULES = [
  'dashboard', 'sevkiyatlar', 'fatura-uret', 'maliyet-evrak', 'landed-cost',
  'nebim-delivery', 'navlun-tanim', 'maliyet-takip', 'kur-yonetimi',
  'gecmis', 'permissions', 'users', 'audit',
  'sonrasi', 'oncesi', 'taslak', 'gtip', 'evrak',
];
const APP_MODULE_ALIASES = {
  'maliyet-takip-2': 'maliyet-takip',
};
const FATURA_URET_TABS = ['taslak', 'gtip', 'invpl', 't1'];
const MALIYET_EVRAK_TABS = ['ulkeler', 'aksu'];
const FATURA_URET_TAB_ALIASES = {
  taslak: { mod: 'fatura-uret', tab: 'taslak' },
  gtip: { mod: 'fatura-uret', tab: 'gtip' },
  sonrasi: { mod: 'fatura-uret', tab: 'invpl' },
  oncesi: { mod: 'fatura-uret', tab: 'gtip' },
};

let _routeSyncing = false;
let _currentMod = '';
let _fuCurrentTab = 'taslak';
let _meCurrentTab = 'ulkeler';
let _fuPendingTab = null;
let _mePendingTab = null;
let _fuInvplOpened = false;
// Fatura Üret'te ülke seçimi adreste tutulan sekmeler: /fatura-uret/taslak/rs, /fatura-uret/invpl/rs
const FATURA_URET_ULKE_TABS = ['taslak', 'invpl'];
const _fuUlke = { taslak: null, invpl: null };
let _fuPendingUlke = null;

function normalizeAppPathname(pathname) {
  const raw = String(pathname || '/').split('?')[0].split('#')[0];
  const trimmed = raw.replace(/\/+$/, '');
  return trimmed || '/';
}

function canAccessModule(mod) {
  if (mod === 'permissions' || mod === 'users' || mod === 'audit') {
    return window.currentUser?.role === 'admin';
  }
  return true;
}

function fallbackModule(mod) {
  if (canAccessModule(mod)) return mod;
  return mod === 'audit' ? 'sonrasi' : 'dashboard';
}

function buildAppPath(mod, tab) {
  if (mod === 'fatura-uret') {
    const t = FATURA_URET_TABS.includes(tab) ? tab : (_fuCurrentTab || 'taslak');
    const ulke = FATURA_URET_ULKE_TABS.includes(t) ? _fuUlke[t] : null;
    return '/fatura-uret/' + t + (ulke ? '/' + ulke : '');
  }
  if (mod === 'maliyet-evrak') {
    const t = MALIYET_EVRAK_TABS.includes(tab) ? tab : (_meCurrentTab || 'ulkeler');
    return '/maliyet-evrak/' + t;
  }
  return '/' + (mod || 'dashboard');
}

function parseAppRoute(pathname) {
  const normalized = normalizeAppPathname(pathname);
  const parts = normalized.replace(/^\//, '').split('/').filter(Boolean).map(p => p.toLowerCase());
  if (!parts.length) {
    return { mod: 'dashboard', tab: null, path: '/dashboard' };
  }

  let mod = APP_MODULE_ALIASES[parts[0]] || parts[0];
  const mapped = FATURA_URET_TAB_ALIASES[mod];
  if (mapped) {
    return { mod: mapped.mod, tab: mapped.tab, path: buildAppPath(mapped.mod, mapped.tab) };
  }
  if (!APP_MODULES.includes(mod)) {
    return { mod: 'dashboard', tab: null, path: '/dashboard' };
  }

  let tab = null;
  let ulke = null;
  if (mod === 'fatura-uret') {
    tab = FATURA_URET_TABS.includes(parts[1]) ? parts[1] : 'taslak';
    if (FATURA_URET_ULKE_TABS.includes(tab) && /^[a-z]{2,3}$/.test(parts[2] || '')) ulke = parts[2];
  } else if (mod === 'maliyet-evrak') {
    tab = MALIYET_EVRAK_TABS.includes(parts[1]) ? parts[1] : 'ulkeler';
  }
  return { mod, tab, ulke, path: buildAppPath(mod, tab) };
}

function syncAppUrl(mod, tab) {
  if (_routeSyncing) return;
  const newPath = buildAppPath(mod, tab);
  if (normalizeAppPathname(location.pathname) === newPath) return;
  history.pushState(null, '', newPath);
}

// Taslak / INV+PL'de ülke seçilince (ya da kaldırılınca) adresi günceller.
// Geçmişe kayıt EKLEMEZ: yenileme ülkeyi korur, geri tuşu ülkeler arasında dolaşmaz.
function fuUlkeAdresGuncelle(tab, kod) {
  if (!FATURA_URET_ULKE_TABS.includes(tab)) return;
  _fuUlke[tab] = kod || null;
  if (_currentMod !== 'fatura-uret' || _fuCurrentTab !== tab) return;
  const yeni = buildAppPath('fatura-uret', tab);
  if (normalizeAppPathname(location.pathname) !== yeni) history.replaceState(null, '', yeni);
}

function applyRoute(route) {
  let mod = fallbackModule(route.mod);
  let tab = (mod === route.mod) ? route.tab : null;
  _routeSyncing = true;
  try {
    if (mod === 'fatura-uret') { _fuPendingTab = tab || 'taslak'; _fuPendingUlke = route.ulke || null; }
    if (mod === 'maliyet-evrak') _mePendingTab = tab || 'ulkeler';
    sidebarSelect(mod);
  } finally {
    _routeSyncing = false;
  }
  const actual = buildAppPath(
    _currentMod,
    _currentMod === 'fatura-uret' ? _fuCurrentTab
      : (_currentMod === 'maliyet-evrak' ? _meCurrentTab : null)
  );
  if (normalizeAppPathname(location.pathname) !== actual) {
    history.replaceState(null, '', actual);
  }
}

// ── SIDEBAR NAVİGASYON ────────────────────────────────────────────────────────
function sidebarSelect(mod) {
  if (typeof mod === 'string' && mod.includes('/')) {
    const nested = parseAppRoute('/' + mod);
    if (nested.mod === 'fatura-uret') _fuPendingTab = nested.tab;
    if (nested.mod === 'maliyet-evrak') _mePendingTab = nested.tab;
    mod = nested.mod;
  }
  // Eski /maliyet-takip-2 URL'leri yeni Maliyet Takip'e yönlendir
  if (mod === 'maliyet-takip-2') mod = 'maliyet-takip';

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
  applySidebarForModule(mod);

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
    'kur-yonetimi': 'Kur Yönetimi',
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
    // Hub'a başka modülden girişte INV+PL sekmesi ilk açılışında bir kez sıfırlansın
    if (_currentMod !== 'fatura-uret') _fuInvplOpened = false;
    // Fatura Üret — sekme yapısı: 3 sıralı adım (Taslak → GTİP & Menşe → INV/PL) + Belçika T1
    let panel = document.getElementById('stepFaturaUret');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'stepFaturaUret';
      panel.className = 'panel fu-shell';
      panel.innerHTML = `
        <div class="fu-bar">
          <div class="fu-tabs" role="tablist" aria-label="Fatura üret bölümleri">
            <button class="fu-tab active" id="fu-tab-taslak" onclick="switchFaturaUretTab('taslak')" type="button">
              <i class="fu-adim" aria-hidden="true">1</i><span>Fatura Taslağı</span>
            </button>
            <i class="ti ti-chevron-right fu-tab-ok" aria-hidden="true"></i>
            <button class="fu-tab" id="fu-tab-gtip" onclick="switchFaturaUretTab('gtip')" type="button">
              <i class="fu-adim" aria-hidden="true">2</i><span>GTİP &amp; Menşe Kontrolü</span>
            </button>
            <i class="ti ti-chevron-right fu-tab-ok" aria-hidden="true"></i>
            <button class="fu-tab" id="fu-tab-invpl" onclick="switchFaturaUretTab('invpl')" type="button">
              <i class="fu-adim" aria-hidden="true">3</i><span>INV / PL Üretimi</span>
            </button>
            <!-- <button class="fu-tab" id="fu-tab-evrak" onclick="switchFaturaUretTab('evrak')" type="button">
              <i class="ti ti-paperclip" aria-hidden="true"></i><span>Ek Evrak</span>
            </button> -->
          </div>
          <!-- Belçika T1 sıralı akışın parçası değil: ayrı araç olarak sağda -->
          <div class="fu-tabs fu-tabs-yan" role="tablist" aria-label="Ek işlemler">
            <button class="fu-tab" id="fu-tab-t1" onclick="switchFaturaUretTab('t1')" type="button">
              <i class="ti ti-truck-delivery" aria-hidden="true"></i><span>T1 Ayrımı · Belçika</span>
            </button>
          </div>
        </div>
        <div class="fu-workspace">
          <div id="fu-content-taslak" class="fu-tab-panel"></div>
          <div id="fu-content-gtip" class="fu-tab-panel" style="display:none;"></div>
          <div id="fu-content-invpl" class="fu-tab-panel" style="display:none;"></div>
          <div id="fu-content-t1" class="fu-tab-panel" style="display:none;"></div>
          <!-- <div id="fu-content-evrak" class="fu-tab-panel" style="display:none;"></div> -->
        </div>
      `;
      document.getElementById('contentArea').appendChild(panel);
    }
    panel.style.display = 'block';
    const fuTab = FATURA_URET_TABS.includes(_fuPendingTab) ? _fuPendingTab : 'taslak';
    _fuPendingTab = null;
    switchFaturaUretTab(fuTab, { skipHistory: true });

  } else if (mod === 'maliyet-evrak') {
    document.getElementById('contentArea').style.padding = '0';
    document.getElementById('contentArea').classList.add('ops-content-area');
    const panel = document.getElementById('stepMaliyetEvrak');
    panel.style.display = 'block';
    initMaliyetEvrakAccordion(panel);
    const meTab = MALIYET_EVRAK_TABS.includes(_mePendingTab) ? _mePendingTab : 'ulkeler';
    _mePendingTab = null;
    if (typeof switchMaliyetEvrakTab === 'function') switchMaliyetEvrakTab(meTab, { skipHistory: true });
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
    // BE sıfırla
    const meBeStatus = document.getElementById('me-be-status');
    const meBeResult = document.getElementById('me-be-result');
    const meBeInput  = document.getElementById('me-be-input');
    if (meBeStatus) { meBeStatus.textContent = 'PDF\'i buraya sürükleyin veya tıklayın'; meBeStatus.style.color = 'var(--text3)'; }
    if (meBeResult) meBeResult.style.display = 'none';
    if (meBeInput)  meBeInput.value = '';
    if (typeof meLoadBeShipments === 'function') meLoadBeShipments();
  } else if (mod === 'landed-cost') {
    const contentArea = document.getElementById('contentArea');
    contentArea.style.padding = '0';
    contentArea.style.overflow = 'hidden';
    contentArea.classList.add('ops-content-area');
    contentArea.classList.add('m2-fill');
    let panel = document.getElementById('stepLandedCost');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'stepLandedCost';
      panel.className = 'panel';
      contentArea.appendChild(panel);
    }
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.flex = '1';
    panel.style.minHeight = '0';
    panel.style.height = '100%';
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
    const contentArea = document.getElementById('contentArea');
    contentArea.style.padding = '0';
    contentArea.style.overflow = 'hidden';
    contentArea.classList.add('ops-content-area');
    contentArea.classList.add('m2-fill');
    let panel = document.getElementById('stepMaliyetTakip2');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'stepMaliyetTakip2';
      panel.className = 'panel';
      contentArea.appendChild(panel);
    }
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.flex = '1';
    panel.style.minHeight = '0';
    panel.style.height = '100%';
    if (typeof initMaliyet2Panel === 'function') initMaliyet2Panel();
  } else if (mod === 'kur-yonetimi') {
    document.getElementById('contentArea').style.padding = '0';
    document.getElementById('contentArea').classList.add('ops-content-area');
    let panel = document.getElementById('stepKurYonetimi');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'stepKurYonetimi';
      panel.className = 'panel';
      document.getElementById('contentArea').appendChild(panel);
    }
    panel.style.display = 'block';
    if (typeof initKurPanel === 'function') initKurPanel();
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

  _currentMod = mod;
  const tab = mod === 'fatura-uret' ? _fuCurrentTab
    : (mod === 'maliyet-evrak' ? _meCurrentTab : null);
  syncAppUrl(mod, tab);
}

// Maliyet Evrak > Ülke Evrakları: sol ülke listesi + sağda seçili ülkenin kartı.
// Liste mevcut .me-card'lardan üretilir (bayrak, ad, PDF/Elle Giriş); kartların
// form/yükleme içeriğine dokunulmaz — görünürlüğü is-open sınıfı yönetir.
// (Ad eski akordeon sürümünden kalma; sidebar açılışı bu adı çağırıyor.)
function initMaliyetEvrakAccordion(panel) {
  if (!panel || panel.dataset.accordionReady === '1') return;
  panel.dataset.accordionReady = '1';

  const liste = panel.querySelector('#meRailListe');
  const kartlar = [...panel.querySelectorAll('#me-tab-ulkeler .me-card')];
  if (!liste) return;

  kartlar.forEach((kart, i) => {
    const bayrak = kart.querySelector('.me-flag');
    const ad = kart.querySelector('.me-card-title')?.textContent.trim() || '';
    const elle = !!kart.querySelector('.me-pill-manual');
    kart.dataset.meIndex = String(i);

    const satir = document.createElement('button');
    satir.type = 'button';
    satir.className = 'me-rail-satir';
    satir.dataset.meIndex = String(i);
    if (bayrak) {
      const img = document.createElement('img');
      img.src = bayrak.src; img.alt = '';
      satir.appendChild(img);
    }
    const adEl = document.createElement('span');
    adEl.className = 'me-rail-ad';
    adEl.textContent = ad;
    // Evrak tipi: metin yerine küçük ikon (PDF yükleme / elle giriş), üzerine gelince açıklama
    const tip = document.createElement('i');
    tip.className = 'me-rail-tip ti ' + (elle ? 'ti-pencil' : 'ti-file-type-pdf');
    tip.title = elle ? 'Elle giriş' : 'PDF yükleme';
    tip.setAttribute('aria-label', tip.title);
    satir.append(adEl, tip);
    satir.addEventListener('click', () => maliyetEvrakUlkeSec(panel, i));
    liste.appendChild(satir);
  });
}

function maliyetEvrakUlkeSec(panel, index) {
  panel.querySelectorAll('#me-tab-ulkeler .me-card').forEach(kart => {
    const secili = kart.dataset.meIndex === String(index);
    kart.classList.toggle('is-open', secili);
    kart.classList.toggle('me-secili', secili);
  });
  panel.querySelectorAll('.me-rail-satir').forEach(satir =>
    satir.classList.toggle('active', satir.dataset.meIndex === String(index)));
  const bos = panel.querySelector('#meMd .fu-md-empty');
  if (bos) bos.hidden = true;
}

function switchMaliyetEvrakTab(tab, opts) {
  if (!MALIYET_EVRAK_TABS.includes(tab)) tab = 'ulkeler';
  _meCurrentTab = tab;
  const tabs = ['aksu', 'ulkeler'];
  tabs.forEach(t => {
    const btn = document.getElementById('me-tab-btn-' + t);
    const panel = document.getElementById('me-tab-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
  });
  if (tab === 'ulkeler') {
    ['Rs', 'Ba', 'Mk', 'Ge', 'Ko', 'Kz', 'De', 'Nl', 'Be'].forEach(code => {
      const fn = window['meLoad' + code + 'Shipments'];
      if (typeof fn === 'function') fn();
    });
  }
  if (!opts || !opts.skipHistory) {
    if (_currentMod === 'maliyet-evrak' || !_currentMod) syncAppUrl('maliyet-evrak', tab);
  }
}

// Tarayıcı geri/ileri düğmesi
window.addEventListener('popstate', () => {
  const route = parseAppRoute(location.pathname);
  const mod = fallbackModule(route.mod);
  const tab = (mod === route.mod) ? route.tab : null;
  if (_currentMod === 'fatura-uret' && mod === 'fatura-uret') {
    _fuPendingUlke = route.ulke || null;
    switchFaturaUretTab(tab || 'taslak', { skipHistory: true });
    return;
  }
  if (_currentMod === 'maliyet-evrak' && mod === 'maliyet-evrak') {
    switchMaliyetEvrakTab(tab || 'ulkeler', { skipHistory: true });
    return;
  }
  applyRoute({ mod, tab });
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
// Fatura Üret sol liste + sağ çalışma alanı: sağ başlığı seçili kartın
// bayrak/ad/para biriminden kurar; kart yoksa boş durumu gösterir.
function fuMdSecim(kokId, kart) {
  const kok = document.getElementById(kokId);
  if (!kok) return;
  const head = kok.querySelector('.fu-md-head');
  const bos = kok.querySelector('.fu-md-empty');
  if (!kart) {
    if (head) { head.hidden = true; head.innerHTML = ''; }
    if (bos) bos.hidden = false;
    return;
  }
  if (bos) bos.hidden = true;
  if (!head) return;
  const img = kart.querySelector('img');
  const ad = kart.querySelector('.cc-name, .cc2-name')?.textContent.trim() || '';
  head.innerHTML = '';
  if (img) {
    const bayrak = document.createElement('img');
    bayrak.src = img.src; bayrak.alt = '';
    head.appendChild(bayrak);
  }
  const baslik = document.createElement('div');
  baslik.className = 'fu-md-title';
  baslik.textContent = ad;
  head.appendChild(baslik);
  head.hidden = false;
}

function switchFaturaUretTab(tab, opts) {
  if (!FATURA_URET_TABS.includes(tab)) tab = 'taslak';
  _fuCurrentTab = tab;
  // Sekme butonlarını güncelle
  ['taslak', 'gtip', 'invpl', 't1' /*, 'evrak' */].forEach(t => {
    const btn = document.getElementById('fu-tab-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
  });

  // Panelleri gizle/göster — orijinal DOM elemanlarını direkt kullan
  const panelMap = {
    taslak: ['stepTaslak'],
    gtip:   ['stepGtip'],
    invpl:  ['wizardSteps', 'step2'],
    t1:     [],
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
  ['taslak','gtip','invpl','t1','evrak'].forEach(t => {
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

  // INV/PL 2. adımı (KG & Hesap) da sekmenin içinde dursun; aksi halde goStep(2)
  // onu sayfadaki eski yerinde (Fatura Üret kabuğunun üstünde) açar.
  // Görünürlüğüne dokunulmaz — onu goStep yönetir.
  if (tab === 'invpl') {
    const adim2 = document.getElementById('step3');
    if (adim2 && adim2.parentNode !== container) container.appendChild(adim2);
  }

  // Adresten gelen ülke (yenileme / paylaşılan link / geri tuşu) init'ten sonra seçilir
  const bekleyenUlke = _fuPendingUlke;
  _fuPendingUlke = null;

  // Init fonksiyonlarını çağır
  if (tab === 'taslak' && typeof initTaslakPanel === 'function') {
    setTimeout(() => {
      initTaslakPanel();
      if (bekleyenUlke && typeof TASLAK_ULKELER !== 'undefined' && TASLAK_ULKELER[bekleyenUlke]) {
        selectTaslakUlke(bekleyenUlke);
      }
    }, 0);
  } else if (tab === 'gtip' && typeof initGtipPanel === 'function') {
    setTimeout(initGtipPanel, 0);
  } else if (tab === 'invpl') {
    const ilkAcilis = !_fuInvplOpened && typeof resetSonrasiWizard === 'function';
    if (ilkAcilis) _fuInvplOpened = true;
    setTimeout(() => {
      if (ilkAcilis) resetSonrasiWizard();
      if (bekleyenUlke && bekleyenUlke !== currentCountry
          && document.getElementById('country-' + bekleyenUlke) && typeof selectCountry === 'function') {
        selectCountry(bekleyenUlke);
      }
    }, 0);
  } else if (tab === 't1' && typeof initT1AyrimiPanel === 'function') {
    setTimeout(initT1AyrimiPanel, 0);
  }
  // else if (tab === 'evrak' && typeof initEvrakPanel === 'function') {
  //   setTimeout(initEvrakPanel, 0);
  // }
  if (!opts || !opts.skipHistory) {
    if (_currentMod === 'fatura-uret' || !_currentMod) syncAppUrl('fatura-uret', tab);
  }
}

async function startAppFromRoute() {
  await initYilAyari();
  await loadCountriesConfig();
  updateYilSelects();
  applyRoute(parseAppRoute(location.pathname));
  if (typeof checkGecmisCount === 'function') checkGecmisCount();
  if (typeof checkNebimWarningCount === 'function') checkNebimWarningCount();
}

// Login ve eski çağrılar bu ismi kullanıyor; rota restore eder.
async function startAppAtDashboard() {
  return startAppFromRoute();
}

// ── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // window.currentUser'ın rol kontrollerinden (bkz. sidebarSelect) önce
  // kesin belirlenmiş olması için oturum kontrolünü bekle.
  if (window.authReadyPromise) await window.authReadyPromise;
  if (!window.currentUser) return;
  await startAppFromRoute();
});
