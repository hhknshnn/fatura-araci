// ── AUTH.JS ───────────────────────────────────────────────────────────────────
// Login overlay, session yönetimi, token saklama.
// Mevcut hiçbir koda dokunmaz — sadece sayfa açılışında devreye girer.

const AUTH_TOKEN_KEY = 'fa_auth_token';

// ── MEVCUT OTURUMU KONTROL ET ─────────────────────────────────────────────────
async function authCheck() {
  const token = sessionStorage.getItem(AUTH_TOKEN_KEY);
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
      applySession(data);
    } else {
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
      showLoginOverlay();
    }
  } catch(e) {
    showLoginOverlay();
  }
}

// ── LOGIN OVERLAY GÖSTER ──────────────────────────────────────────────────────
function showLoginOverlay() {
  document.getElementById('loginOverlay').style.display = 'flex';
  document.getElementById('app-shell').style.display    = 'none';
  document.getElementById('loginError').style.display   = 'none';
  document.getElementById('loginUsername').value        = '';
  document.getElementById('loginPassword').value        = '';
  setTimeout(() => document.getElementById('loginUsername').focus(), 100);
}

// ── LOGIN OVERLAY GİZLE ───────────────────────────────────────────────────────
function hideLoginOverlay() {
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('app-shell').style.display    = 'flex';
}

// ── GİRİŞ YAP ────────────────────────────────────────────────────────────────
async function doLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
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
      body:    JSON.stringify({ action: 'login', username, password }),
    });
    const data = await resp.json();

    if (data.success) {
      sessionStorage.setItem(AUTH_TOKEN_KEY, data.token);
      applySession(data);
      hideLoginOverlay();
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

  if (nameEl)   nameEl.textContent   = data.displayName || data.username;
  if (avatarEl) avatarEl.textContent = (data.displayName || data.username).slice(0, 2).toUpperCase();
  if (roleEl)   roleEl.textContent   = data.role === 'admin' ? 'Admin' : 'Lojistik Ekibi';

  // Global session state
  window.currentUser = {
    username:    data.username,
    displayName: data.displayName,
    role:        data.role,
    token:       sessionStorage.getItem(AUTH_TOKEN_KEY),
  };

  // Admin sekmesini göster/gizle
  const adminNav = document.getElementById('nav-users-item');
  if (adminNav) {
    adminNav.style.display = data.role === 'admin' ? 'flex' : 'none';
  }

  // localStorage'daki eski username'i de güncelle (shell.js uyumluluğu)
  try { localStorage.setItem('fa_username', data.displayName || data.username); } catch(e) {}
}

// ── ÇIKIŞ YAP ────────────────────────────────────────────────────────────────
async function doLogout() {
  const token = sessionStorage.getItem(AUTH_TOKEN_KEY);
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
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  window.currentUser = null;
  // Login ekranına yönlendir
  window.location.reload();
}

// ── AUTH HEADER YARDIMCISI ────────────────────────────────────────────────────
// Diğer modüllerin API çağrılarında kullanması için
function getAuthHeaders() {
  const token = sessionStorage.getItem(AUTH_TOKEN_KEY);
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
