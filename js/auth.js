// ── AUTH.JS ───────────────────────────────────────────────────────────────────
// Login overlay, session yönetimi, token saklama.
// Mevcut hiçbir koda dokunmaz — sadece sayfa açılışında devreye girer.

const AUTH_TOKEN_KEY = 'fa_auth_token';
const AUTH_REMEMBER_KEY = 'fa_auth_remember';
const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 dakika işlemsizlikte oturumu sonlandır

function getStoredToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || sessionStorage.getItem(AUTH_TOKEN_KEY);
}

function isRememberedSession() {
  return localStorage.getItem(AUTH_REMEMBER_KEY) === '1' && !!localStorage.getItem(AUTH_TOKEN_KEY);
}

function storeToken(token, rememberMe) {
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);

  if (rememberMe) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_REMEMBER_KEY, '1');
  } else {
    sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.removeItem(AUTH_REMEMBER_KEY);
  }
}

function clearStoredSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_REMEMBER_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  window.currentUser = null;
}

function normalizeSessionPayload(data) {
  const session = data?.session || data || {};
  return {
    success:     !!data?.success,
    token:       getStoredToken(),
    username:    session.username || data?.username || '',
    displayName: session.displayName || data?.displayName || session.display_name || '',
    role:        session.role || data?.role || 'editor',
    expiresAt:   session.expiresAt || data?.expiresAt || session.expires_at || null,
  };
}

function clearSessionAndShowLogin() {
  clearStoredSession();
  showLoginOverlay();
}

// ── OTOMATİK AUTHORIZATION HEADER ─────────────────────────────────────────────
// Aynı origin'deki /api/ isteklerine token'ı otomatik ekler; diğer JS dosyalarındaki
// mevcut fetch() çağrılarının tek tek değiştirilmesine gerek bırakmaz.
(function() {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const isApiCall = url.startsWith('/api/') || url.startsWith(window.location.origin + '/api/');

    if (isApiCall) {
      const token = getStoredToken();
      if (token) {
        init = init || {};
        const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
        const currentAuth = headers.get('Authorization');
        if (!currentAuth || currentAuth === 'Bearer null' || currentAuth === 'Bearer undefined') {
          headers.set('Authorization', `Bearer ${token}`);
        }
        init.headers = headers;
      }
    }

    const resp = await nativeFetch(input, init);

    if (isApiCall && resp.status === 401 && url !== '/api/auth') {
      clearSessionAndShowLogin();
    }

    return resp;
  };
})();

// ── MEVCUT OTURUMU KONTROL ET ─────────────────────────────────────────────────
async function authCheck() {
  const token = getStoredToken();
  if (!token) {
    showLoginOverlay();
    return;
  }
  try {
    const resp = await fetch('/api/auth', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await resp.json();
    if (data.success) {
      applySession(normalizeSessionPayload(data));
      hideLoginOverlay();
    } else {
      clearSessionAndShowLogin();
    }
  } catch(e) {
    showLoginOverlay();
  }
}

// ── LOGIN OVERLAY GÖSTER ──────────────────────────────────────────────────────
function showLoginOverlay() {
  const overlay = document.getElementById('loginOverlay');
  const shell = document.getElementById('app-shell');
  const usernameEl = document.getElementById('loginUsername');
  const passwordEl = document.getElementById('loginPassword');
  const rememberEl = document.getElementById('rememberMe');

  if (overlay) overlay.style.display = 'flex';
  if (shell) shell.style.display = 'none';
  if (usernameEl) usernameEl.value = '';
  if (passwordEl) passwordEl.value = '';
  if (rememberEl) rememberEl.checked = localStorage.getItem(AUTH_REMEMBER_KEY) === '1';

  const errorEl = document.getElementById('loginError');
  const reason  = sessionStorage.getItem('fa_logout_reason');
  if (errorEl && reason === 'idle') {
    errorEl.textContent   = 'Uzun süre işlem yapılmadığı için oturumunuz sonlandırıldı. Tekrar giriş yapın.';
    errorEl.style.display = 'block';
    sessionStorage.removeItem('fa_logout_reason');
  } else if (errorEl) {
    errorEl.style.display = 'none';
  }
  setTimeout(() => usernameEl?.focus(), 100);
}

// ── LOGIN OVERLAY GİZLE ───────────────────────────────────────────────────────
function hideLoginOverlay() {
  const overlay = document.getElementById('loginOverlay');
  const shell = document.getElementById('app-shell');
  if (overlay) overlay.style.display = 'none';
  if (shell) shell.style.display = 'flex';
}

// ── GİRİŞ YAP ────────────────────────────────────────────────────────────────
async function doLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const rememberMe = !!document.getElementById('rememberMe')?.checked;
  const errorEl  = document.getElementById('loginError');
  const btnEl    = document.getElementById('loginBtn');

  if (!username || !password) {
    errorEl.textContent = 'Kullanıcı adı ve şifre gerekli.';
    errorEl.style.display = 'block';
    return;
  }

  btnEl.disabled    = true;
  btnEl.textContent = 'Giriş yapılıyor...';
  errorEl.style.display = 'none';

  try {
    const resp = await fetch('/api/auth', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'login', username, password, rememberMe }),
    });
    const data = await resp.json();

    if (data.success) {
      storeToken(data.token, rememberMe);
      applySession(normalizeSessionPayload(data));
      hideLoginOverlay();
      if (typeof startAppAtDashboard === 'function') {
        await startAppAtDashboard();
      } else if (typeof loadDashboard === 'function') {
        await loadDashboard();
      }
    } else {
      errorEl.textContent   = data.error || 'Giriş başarısız.';
      errorEl.style.display = 'block';
    }
  } catch(e) {
    errorEl.textContent   = 'Sunucuya bağlanılamadı.';
    errorEl.style.display = 'block';
  } finally {
    btnEl.disabled    = false;
    btnEl.textContent = 'Giriş Yap';
  }
}

// ── SESSION UYGULA ────────────────────────────────────────────────────────────
function applySession(data) {
  // Sidebar kullanıcı bilgisi güncelle
  const nameEl   = document.getElementById('sidebarUserName');
  const avatarEl = document.getElementById('sidebarAvatar');
  const roleEl   = document.getElementById('sidebarUserRole');

  const roleLabels = { admin: 'Admin', editor: 'Düzenleyici', viewer: 'Görüntüleyici' };
  const role = roleLabels[data.role] ? data.role : 'editor'; // legacy 'user' vb. -> editor

  if (nameEl)   nameEl.textContent   = data.displayName || data.username;
  if (avatarEl) avatarEl.textContent = (data.displayName || data.username).slice(0, 2).toUpperCase();
  if (roleEl)   roleEl.textContent   = roleLabels[role] || 'Düzenleyici';

  // Global session state
  window.currentUser = {
    username:    data.username,
    displayName: data.displayName,
    role:        role,
    token:       getStoredToken(),
    remembered:  isRememberedSession(),
  };

  // Rol bazlı UI: CSS/JS için tek noktadan erişim
  document.body.dataset.role = role;

  // Admin sekmelerini göster/gizle
  const adminNav = document.getElementById('nav-users-item');
  if (adminNav) {
    adminNav.style.display = 'none';
  }
  const auditNav = document.getElementById('nav-audit-item');
  if (auditNav) {
    auditNav.style.display = role === 'admin' ? 'flex' : 'none';
  }
  const permissionsNav = document.getElementById('nav-permissions-item');
  if (permissionsNav) {
    permissionsNav.style.display = role === 'admin' ? 'flex' : 'none';
  }

  // localStorage'daki eski username'i de güncelle (shell.js uyumluluğu)
  try { localStorage.setItem('fa_username', data.displayName || data.username); } catch(e) {}
  if (typeof checkGecmisCount === 'function') checkGecmisCount();

  resetIdleTimer();
}

// ── ÇIKIŞ YAP ────────────────────────────────────────────────────────────────
async function doLogout(reason) {
  const token = getStoredToken();
  try {
    await fetch('/api/auth', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ action: 'logout', token }),
    });
  } catch(e) {}
  clearStoredSession();
  if (reason) {
    try { sessionStorage.setItem('fa_logout_reason', reason); } catch(e) {}
  }
  // Login ekranına yönlendir
  window.location.reload();
}

// ── İŞLEMSİZLİK (IDLE) TAKİBİ ──────────────────────────────────────────────────
// Fare/klavye/dokunma aktivitesi olmadan IDLE_TIMEOUT_MS geçerse oturumu sonlandırır.
let idleTimer = null;

function resetIdleTimer() {
  if (!window.currentUser) return;
  if (idleTimer) clearTimeout(idleTimer);
  if (window.currentUser.remembered) return;
  idleTimer = setTimeout(() => {
    doLogout('idle');
  }, IDLE_TIMEOUT_MS);
}

['mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach(evt => {
  document.addEventListener(evt, resetIdleTimer, { passive: true });
});

// ── AUTH HEADER YARDIMCISI ────────────────────────────────────────────────────
// Diğer modüllerin API çağrılarında kullanması için
function getAuthHeaders() {
  const token = getStoredToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// ── ENTER TUŞU ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('loginOverlay');
  if (overlay) {
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Enter') doLogin();
    });
  }
});

// ── SAYFA AÇILIŞINDA OTURUM KONTROLÜ ──────────────────────────────────────────
// shell.js'in DOMContentLoaded'daki modül yönlendirmesi (örn. admin sayfaları
// için rol kontrolü) window.currentUser'ın burada belirlenmesini bekler —
// aksi halde authCheck() henüz bitmeden yapılan rol kontrolü kullanıcıyı
// (session hâlâ geçerliyken) yanlışlıkla yetkisiz sanıp başka modüle atar.
window.authReadyPromise = authCheck();
