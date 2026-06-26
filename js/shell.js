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

  ['step2', 'step3', 'stepMense', 'stepTaslak', 'stepGtip', 'stepEvrak',
    'stepGecmis', 'stepUsers', 'stepDashboard', 'stepSevkiyatlar',
    'stepFaturaUret', 'stepMaliyetEvrak', 'stepLandedCost'].forEach(id => {
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

  hideAllPanels();

  const titles = {
    sonrasi: 'INV + PL Oluştur',
    taslak: 'Taslak Doldur',
    oncesi: 'Menşe Hesapla',
    gtip: 'GTİP Kontrol',
    evrak: 'Ek Evrak Üret',
    gecmis: 'Son İşlemler',
    users: 'Kullanıcılar',
    dashboard: 'Dashboard',
    sevkiyatlar: 'Sevkiyatlar',
    'fatura-uret': 'Fatura Üret',
    'maliyet-evrak': 'Maliyet Evrak',
    'landed-cost': 'Landed Cost',
  };
  document.getElementById('topbarTitle').textContent = titles[mod] || mod;
  document.getElementById('topbarCountry').style.display = 'none';
  document.getElementById('topbarDepo').style.display = 'none';
  document.getElementById('topbarRight').innerHTML = '';

  if (mod === 'sonrasi') {
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
    document.getElementById('topbarRight').innerHTML = `
      <button onclick="openImportModal()"
        style="height:30px;padding:0 12px;border-radius:var(--radius-md);border:none;
               background:#7C3AED;color:#fff;font-family:var(--font);font-size:12px;
               font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;">
        ⬆ İçe Aktar
      </button>`;
    if (typeof loadShipments === 'function') loadShipments();

  } else if (mod === 'fatura-uret') {
    document.getElementById('contentArea').classList.add('fu-content-area');
    // Fatura Üret — sekme yapısı (Taslak, GTİP & Menşe, INV+PL, Ek Evrak)
    let panel = document.getElementById('stepFaturaUret');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'stepFaturaUret';
      panel.className = 'panel fu-shell';
      panel.innerHTML = `
        <div class="fu-header">
          <div>
            <div class="fu-kicker">Fatura operasyonları</div>
            <div class="fu-title">Fatura Üret</div>
            <div class="fu-subtitle">Taslak, GTİP, menşe, INV + PL ve ek evrak süreçlerini tek çalışma alanından yönetin.</div>
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
    // Maliyet Evrak — ileride doldurulacak
    let panel = document.getElementById('stepMaliyetEvrak');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'stepMaliyetEvrak';
      panel.className = 'panel';
      panel.innerHTML = `
        <div class="panel-label">Maliyet Evrak</div>
        <div class="panel-title">Maliyet Evrak Yükle</div>
        <div class="panel-desc">Beyanname, vergi ve gümrük PDF'lerini yükleyerek ilgili sevkiyatlara otomatik aktar.</div>
        <div style="margin-top:32px;padding:32px;background:var(--surface2);border:1.5px dashed var(--border2);
                    border-radius:var(--radius-md);text-align:center;color:var(--text3);">
          <div style="font-size:32px;margin-bottom:12px;">📋</div>
          <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:6px;">Yakında</div>
          <div style="font-size:13px;">Sırbistan, Kosova ve diğer ülke evrakları burada toplanacak.</div>
        </div>
      `;
      document.getElementById('contentArea').appendChild(panel);
    }
    panel.style.display = 'block';
  } else if (mod === 'landed-cost') {
    let panel = document.getElementById('stepLandedCost');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'stepLandedCost';
      panel.className = 'panel';
      document.getElementById('contentArea').appendChild(panel);
    }
    panel.style.display = 'block';
    if (typeof initLandedCostPanel === 'function') initLandedCostPanel();
  }
}

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
    abh: 'Abhazya'
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
  }
  // else if (tab === 'evrak' && typeof initEvrakPanel === 'function') {
  //   setTimeout(initEvrakPanel, 0);
  // }
}

// ── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await initYilAyari();
  await loadCountriesConfig();
  updateYilSelects();
  sidebarSelect('dashboard');
  if (typeof checkGecmisCount === 'function') checkGecmisCount();
});
