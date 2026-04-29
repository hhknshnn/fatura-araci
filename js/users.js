// ── USERS.JS ──────────────────────────────────────────────────────────────────
// Admin kullanıcı yönetimi paneli.
// Sadece admin rolündeki kullanıcılar görebilir.

// ── PANELİ BAŞLAT ─────────────────────────────────────────────────────────────
async function initUsersPanel() {
  showUsersStatus('info', '<div class="stat">⏳ Kullanıcılar yükleniyor...</div>');
  document.getElementById('usersListContainer').innerHTML = '';
  document.getElementById('usersAddForm').style.display   = 'none';
  document.getElementById('usersChangePassForm').style.display = 'none';

  await loadUsers();
}

// ── KULLANICILARI YÜKLE ───────────────────────────────────────────────────────
async function loadUsers() {
  try {
    const resp = await fetch('/api/users', {
      headers: { ...getAuthHeaders() }
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');
    renderUsersList(data.users || []);
    clearUsersStatus();
  } catch(e) {
    showUsersStatus('error', `<div class="stat">⚠ ${e.message}</div>`);
  }
}

// ── LİSTEYİ RENDER ET ────────────────────────────────────────────────────────
function renderUsersList(users) {
  const container = document.getElementById('usersListContainer');
  if (!users.length) {
    container.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:12px;">Henüz kullanıcı yok.</div>';
    return;
  }
  container.innerHTML = users.map(u => `
    <div class="card" style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="user-avatar" style="width:32px;height:32px;font-size:12px;">
            ${(u.displayName || u.username).slice(0,2).toUpperCase()}
          </div>
          <div>
            <div style="font-size:13px;font-weight:600;">${escHtml(u.displayName)}</div>
            <div style="font-size:11px;color:var(--text3);font-family:var(--mono);">@${escHtml(u.username)}</div>
          </div>
          <span class="badge ${u.role === 'admin' ? 'badge-amber' : 'badge-blue'}" style="margin-left:4px;">
            ${u.role === 'admin' ? 'Admin' : 'Kullanıcı'}
          </span>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn-ghost" style="font-size:11px;padding:5px 10px;"
            onclick="showResetPassForm('${escHtml(u.username)}', '${escHtml(u.displayName)}')">
            🔑 Şifre
          </button>
          ${u.username !== window.currentUser?.username ? `
          <button class="btn-ghost" style="font-size:11px;padding:5px 10px;color:var(--error);border-color:var(--error);"
            onclick="deleteUserConfirm('${escHtml(u.username)}', '${escHtml(u.displayName)}')">
            🗑 Sil
          </button>` : `<span style="font-size:11px;color:var(--text3);padding:5px 10px;">(Sen)</span>`}
        </div>
      </div>
    </div>`).join('');
}

// ── KULLANICI EKLE FORMU ──────────────────────────────────────────────────────
function showAddUserForm() {
  const form = document.getElementById('usersAddForm');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
  if (form.style.display === 'block') {
    document.getElementById('newUserName').value        = '';
    document.getElementById('newUserUsername').value    = '';
    document.getElementById('newUserPassword').value    = '';
    document.getElementById('newUserRole').value        = 'user';
    document.getElementById('newUserName').focus();
  }
}

async function submitAddUser() {
  const displayName = document.getElementById('newUserName').value.trim();
  const username    = document.getElementById('newUserUsername').value.trim();
  const password    = document.getElementById('newUserPassword').value.trim();
  const role        = document.getElementById('newUserRole').value;

  if (!displayName || !username || !password) {
    showUsersStatus('error', '<div class="stat">⚠ Tüm alanları doldurun.</div>');
    return;
  }

  try {
    const resp = await fetch('/api/users', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body:    JSON.stringify({ action: 'create', username, password, displayName, role }),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);
    showUsersStatus('success', `<div class="stat">✓ <span>${escHtml(displayName)}</span> eklendi.</div>`);
    document.getElementById('usersAddForm').style.display = 'none';
    await loadUsers();
  } catch(e) {
    showUsersStatus('error', `<div class="stat">⚠ ${escHtml(e.message)}</div>`);
  }
}

// ── ŞİFRE SIFIRLA FORMU ──────────────────────────────────────────────────────
function showResetPassForm(username, displayName) {
  const form = document.getElementById('usersChangePassForm');
  form.style.display = 'block';
  document.getElementById('resetPassUsername').value      = username;
  document.getElementById('resetPassDisplayName').textContent = displayName;
  document.getElementById('resetPassNew').value           = '';
  document.getElementById('resetPassNew').focus();
  form.scrollIntoView({ behavior: 'smooth' });
}

function hideResetPassForm() {
  document.getElementById('usersChangePassForm').style.display = 'none';
}

async function submitResetPass() {
  const username    = document.getElementById('resetPassUsername').value;
  const newPassword = document.getElementById('resetPassNew').value.trim();

  if (!newPassword) {
    showUsersStatus('error', '<div class="stat">⚠ Yeni şifre boş olamaz.</div>');
    return;
  }

  try {
    const resp = await fetch('/api/users', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body:    JSON.stringify({ action: 'reset_password', username, newPassword }),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);
    showUsersStatus('success', `<div class="stat">✓ Şifre güncellendi.</div>`);
    hideResetPassForm();
  } catch(e) {
    showUsersStatus('error', `<div class="stat">⚠ ${escHtml(e.message)}</div>`);
  }
}

// ── KENDİ ŞİFRENİ DEĞİŞTİR ──────────────────────────────────────────────────
function showSelfChangePassForm() {
  const form = document.getElementById('selfChangePassForm');
  if (!form) return;
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
  if (form.style.display === 'block') {
    document.getElementById('selfOldPass').value = '';
    document.getElementById('selfNewPass').value = '';
    document.getElementById('selfOldPass').focus();
  }
}

async function submitSelfChangePass() {
  const oldPassword = document.getElementById('selfOldPass').value.trim();
  const newPassword = document.getElementById('selfNewPass').value.trim();

  if (!oldPassword || !newPassword) {
    showUsersStatus('error', '<div class="stat">⚠ Eski ve yeni şifre gerekli.</div>');
    return;
  }

  try {
    const resp = await fetch('/api/auth', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body:    JSON.stringify({ action: 'change_password', oldPassword, newPassword }),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);
    showUsersStatus('success', '<div class="stat">✓ Şifren güncellendi.</div>');
    document.getElementById('selfChangePassForm').style.display = 'none';
  } catch(e) {
    showUsersStatus('error', `<div class="stat">⚠ ${escHtml(e.message)}</div>`);
  }
}

// ── KULLANICI SİL ─────────────────────────────────────────────────────────────
async function deleteUserConfirm(username, displayName) {
  if (!confirm(`"${displayName}" kullanıcısı silinsin mi? Bu işlem geri alınamaz.`)) return;
  try {
    const resp = await fetch('/api/users', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body:    JSON.stringify({ username }),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);
    showUsersStatus('success', `<div class="stat">✓ <span>${escHtml(displayName)}</span> silindi.</div>`);
    await loadUsers();
  } catch(e) {
    showUsersStatus('error', `<div class="stat">⚠ ${escHtml(e.message)}</div>`);
  }
}

// ── STATUS ────────────────────────────────────────────────────────────────────
function showUsersStatus(type, html) {
  const sb = document.getElementById('usersStatus');
  if (!sb) return;
  sb.className = 'status-box visible ' + type;
  sb.innerHTML = html;
}

function clearUsersStatus() {
  const sb = document.getElementById('usersStatus');
  if (!sb) return;
  sb.className = 'status-box';
  sb.innerHTML = '';
}

// ── YARDIMCI ─────────────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
