// ── USERS.JS ──────────────────────────────────────────────────────────────────
// Admin kullanıcı yönetimi. Admin Portalı içinde modern yönetim yüzeyi olarak açılır.

const ROLE_LABELS = { admin: 'Admin', editor: 'Düzenleyici', viewer: 'Görüntüleyici', user: 'Düzenleyici' };
const ROLE_BADGE  = { admin: 'badge-amber', editor: 'badge-blue', viewer: 'badge-gray', user: 'badge-blue' };
const ROLE_HINTS = {
  admin: 'Tüm yönetim ve kritik toplu işlemler',
  editor: 'Operasyonel kayıt oluşturma ve güncelleme',
  viewer: 'Salt görüntüleme',
  user: 'Operasyonel kayıt oluşturma ve güncelleme',
};

function renderUsersPortalShell(mountId = 'stepUsers') {
  const mount = document.getElementById(mountId);
  if (!mount) return;
  mount.innerHTML = `
    <section class="admin-users-shell">
      <div class="admin-users-hero">
        <div>
          <div class="admin-users-kicker">Kullanıcı yönetimi</div>
          <div class="admin-users-title">Ekip üyeleri ve erişim rolleri</div>
          <div class="admin-users-desc">Kullanıcı ekleyin, rolünü değiştirin, şifre işlemlerini yönetin. Kritik işlemler sadece admin oturumunda görünür.</div>
        </div>
        <div class="admin-users-stats">
          <div class="admin-users-stat"><span id="usersTotalCount">0</span><small>Toplam</small></div>
          <div class="admin-users-stat"><span id="usersAdminCount">0</span><small>Admin</small></div>
          <div class="admin-users-stat"><span id="usersViewerCount">0</span><small>Görüntüleyici</small></div>
        </div>
      </div>

      <div class="admin-users-actions">
        <div class="status-box" id="usersStatus"></div>
        <div class="admin-users-action-buttons">
          <button class="permissions-btn secondary" type="button" onclick="showSelfChangePassForm()">
            <i class="ti ti-key" aria-hidden="true"></i><span>Şifremi Değiştir</span>
          </button>
          <button class="permissions-btn" type="button" onclick="showAddUserForm()">
            <i class="ti ti-user-plus" aria-hidden="true"></i><span>Kullanıcı Ekle</span>
          </button>
        </div>
      </div>

      <div class="admin-users-forms">
        <div class="users-add-form admin-users-form" id="usersAddForm" style="display:none;">
          <div class="users-form-title">Yeni Kullanıcı</div>
          <div class="admin-users-form-grid">
            <div class="users-field"><label>Ad Soyad</label><input class="users-input" id="newUserName" type="text" placeholder="örn: Ayşe Kaya"></div>
            <div class="users-field"><label>Kullanıcı Adı</label><input class="users-input" id="newUserUsername" type="text" placeholder="örn: ayse"></div>
            <div class="users-field"><label>Şifre</label><input class="users-input" id="newUserPassword" type="password" placeholder="en az 4 karakter"></div>
            <div class="users-field"><label>Rol</label><select class="users-select" id="newUserRole">
              <option value="editor" selected>Düzenleyici</option>
              <option value="viewer">Görüntüleyici</option>
              <option value="admin">Admin</option>
            </select></div>
          </div>
          <div class="users-form-btns">
            <button class="permissions-btn" type="button" onclick="submitAddUser()"><i class="ti ti-check"></i><span>Ekle</span></button>
            <button class="permissions-btn secondary" type="button" onclick="showAddUserForm()">İptal</button>
          </div>
        </div>

        <div class="users-change-pass-form admin-users-form" id="usersChangePassForm" style="display:none;">
          <div class="users-form-title">Şifre Sıfırla: <span id="resetPassDisplayName"></span></div>
          <input type="hidden" id="resetPassUsername">
          <div class="admin-users-form-grid compact">
            <div class="users-field"><label>Yeni Şifre</label><input class="users-input" id="resetPassNew" type="password" placeholder="en az 4 karakter"></div>
          </div>
          <div class="users-form-btns">
            <button class="permissions-btn" type="button" onclick="submitResetPass()"><i class="ti ti-check"></i><span>Kaydet</span></button>
            <button class="permissions-btn secondary" type="button" onclick="hideResetPassForm()">İptal</button>
          </div>
        </div>

        <div class="admin-users-form" id="selfChangePassForm" style="display:none;">
          <div class="users-form-title">Kendi Şifremi Değiştir</div>
          <div class="admin-users-form-grid compact">
            <div class="users-field"><label>Mevcut Şifre</label><input class="users-input" id="selfOldPass" type="password" placeholder="••••••"></div>
            <div class="users-field"><label>Yeni Şifre</label><input class="users-input" id="selfNewPass" type="password" placeholder="en az 4 karakter"></div>
          </div>
          <div class="users-form-btns">
            <button class="permissions-btn" type="button" onclick="submitSelfChangePass()"><i class="ti ti-check"></i><span>Kaydet</span></button>
            <button class="permissions-btn secondary" type="button" onclick="document.getElementById('selfChangePassForm').style.display='none'">İptal</button>
          </div>
        </div>
      </div>

      <div class="admin-users-table-card">
        <div class="admin-users-table-head">
          <div>
            <div class="permissions-section-title">Kullanıcı Listesi</div>
            <div class="permissions-section-sub">Rol değişiklikleri kaydedilmeden uygulanmaz.</div>
          </div>
          <button class="permissions-icon-btn" type="button" onclick="loadUsers()" title="Listeyi yenile">
            <i class="ti ti-refresh" aria-hidden="true"></i>
          </button>
        </div>
        <div id="usersListContainer"></div>
      </div>
    </section>
  `;
}

async function initUsersPanel() {
  if (!document.getElementById('usersListContainer')) renderUsersPortalShell();
  showUsersStatus('info', '<div class="stat">Kullanıcılar yükleniyor...</div>');
  document.getElementById('usersListContainer').innerHTML = '';
  document.getElementById('usersAddForm').style.display = 'none';
  document.getElementById('usersChangePassForm').style.display = 'none';
  document.getElementById('selfChangePassForm').style.display = 'none';
  await loadUsers();
}

async function loadUsers() {
  try {
    const resp = await fetch('/api/users', { headers: { ...getAuthHeaders() } });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');
    renderUsersList(data.users || []);
    clearUsersStatus();
  } catch(e) {
    showUsersStatus('error', `<div class="stat">⚠ ${escHtml(e.message)}</div>`);
  }
}

function updateUsersStats(users) {
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  setText('usersTotalCount', users.length);
  setText('usersAdminCount', users.filter(u => u.role === 'admin').length);
  setText('usersViewerCount', users.filter(u => u.role === 'viewer').length);
}

function renderUsersList(users) {
  const container = document.getElementById('usersListContainer');
  updateUsersStats(users);
  if (!users.length) {
    container.innerHTML = '<div class="admin-users-empty">Henüz kullanıcı yok.</div>';
    return;
  }
  container.innerHTML = `
    <div class="admin-users-table">
      <div class="admin-users-row admin-users-row-head">
        <div>Kullanıcı</div>
        <div>Rol</div>
        <div>Açıklama</div>
        <div>İşlemler</div>
      </div>
      ${users.map(u => renderUserRow(u)).join('')}
    </div>
  `;
}

function renderUserRow(u) {
  const isSelf = u.username === window.currentUser?.username;
  const role = u.role || 'editor';
  const initials = (u.displayName || u.username || '?').slice(0, 2).toUpperCase();
  return `
    <div class="admin-users-row">
      <div class="admin-users-person">
        <div class="user-avatar admin-users-avatar">${escHtml(initials)}</div>
        <div>
          <strong>${escHtml(u.displayName || u.username)}</strong>
          <span>@${escHtml(u.username)}${isSelf ? ' · sen' : ''}</span>
        </div>
      </div>
      <div>
        ${isSelf ? `
          <span class="badge ${ROLE_BADGE[role] || 'badge-blue'}">${ROLE_LABELS[role] || 'Düzenleyici'}</span>
        ` : `
          <select class="users-select admin-users-role-select" id="roleSelect_${escHtml(u.username)}">
            <option value="editor" ${role === 'editor' || role === 'user' ? 'selected' : ''}>Düzenleyici</option>
            <option value="viewer" ${role === 'viewer' ? 'selected' : ''}>Görüntüleyici</option>
            <option value="admin" ${role === 'admin' ? 'selected' : ''}>Admin</option>
          </select>
        `}
      </div>
      <div class="admin-users-role-hint">${escHtml(ROLE_HINTS[role] || ROLE_HINTS.editor)}</div>
      <div class="admin-users-row-actions">
        ${isSelf ? '' : `
          <button class="admin-users-mini-btn" type="button" onclick="submitUpdateRole('${escHtml(u.username)}')" title="Rolü kaydet">
            <i class="ti ti-device-floppy"></i>
          </button>
        `}
        <button class="admin-users-mini-btn" type="button" onclick="showResetPassForm('${escHtml(u.username)}', '${escHtml(u.displayName || u.username)}')" title="Şifre sıfırla">
          <i class="ti ti-key"></i>
        </button>
        ${isSelf ? '' : `
          <button class="admin-users-mini-btn danger" type="button" onclick="deleteUserConfirm('${escHtml(u.username)}', '${escHtml(u.displayName || u.username)}')" title="Kullanıcıyı sil">
            <i class="ti ti-trash"></i>
          </button>
        `}
      </div>
    </div>
  `;
}

async function submitUpdateRole(username) {
  const sel = document.getElementById(`roleSelect_${username}`);
  const role = sel ? sel.value : null;
  if (!role) return;
  try {
    const resp = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ action: 'update_role', username, role }),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);
    showUsersStatus('success', '<div class="stat">Rol güncellendi.</div>');
    await loadUsers();
  } catch(e) {
    showUsersStatus('error', `<div class="stat">⚠ ${escHtml(e.message)}</div>`);
  }
}

function showAddUserForm() {
  const form = document.getElementById('usersAddForm');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
  if (form.style.display === 'block') {
    document.getElementById('newUserName').value = '';
    document.getElementById('newUserUsername').value = '';
    document.getElementById('newUserPassword').value = '';
    document.getElementById('newUserRole').value = 'editor';
    document.getElementById('newUserName').focus();
  }
}

async function submitAddUser() {
  const displayName = document.getElementById('newUserName').value.trim();
  const username = document.getElementById('newUserUsername').value.trim();
  const password = document.getElementById('newUserPassword').value.trim();
  const role = document.getElementById('newUserRole').value;

  if (!displayName || !username || !password) {
    showUsersStatus('error', '<div class="stat">⚠ Tüm alanları doldurun.</div>');
    return;
  }

  try {
    const resp = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ action: 'create', username, password, displayName, role }),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);
    showUsersStatus('success', `<div class="stat">${escHtml(displayName)} eklendi.</div>`);
    document.getElementById('usersAddForm').style.display = 'none';
    await loadUsers();
  } catch(e) {
    showUsersStatus('error', `<div class="stat">⚠ ${escHtml(e.message)}</div>`);
  }
}

function showResetPassForm(username, displayName) {
  const form = document.getElementById('usersChangePassForm');
  form.style.display = 'block';
  document.getElementById('resetPassUsername').value = username;
  document.getElementById('resetPassDisplayName').textContent = displayName;
  document.getElementById('resetPassNew').value = '';
  document.getElementById('resetPassNew').focus();
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideResetPassForm() {
  document.getElementById('usersChangePassForm').style.display = 'none';
}

async function submitResetPass() {
  const username = document.getElementById('resetPassUsername').value;
  const newPassword = document.getElementById('resetPassNew').value.trim();

  if (!newPassword) {
    showUsersStatus('error', '<div class="stat">⚠ Yeni şifre boş olamaz.</div>');
    return;
  }

  try {
    const resp = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ action: 'reset_password', username, newPassword }),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);
    showUsersStatus('success', '<div class="stat">Şifre güncellendi.</div>');
    hideResetPassForm();
  } catch(e) {
    showUsersStatus('error', `<div class="stat">⚠ ${escHtml(e.message)}</div>`);
  }
}

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
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ action: 'change_password', oldPassword, newPassword }),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);
    showUsersStatus('success', '<div class="stat">Şifren güncellendi.</div>');
    document.getElementById('selfChangePassForm').style.display = 'none';
  } catch(e) {
    showUsersStatus('error', `<div class="stat">⚠ ${escHtml(e.message)}</div>`);
  }
}

async function deleteUserConfirm(username, displayName) {
  if (!confirm(`"${displayName}" kullanıcısı silinsin mi? Bu işlem geri alınamaz.`)) return;
  try {
    const resp = await fetch('/api/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ username }),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);
    showUsersStatus('success', `<div class="stat">${escHtml(displayName)} silindi.</div>`);
    await loadUsers();
  } catch(e) {
    showUsersStatus('error', `<div class="stat">⚠ ${escHtml(e.message)}</div>`);
  }
}

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

const escHtml = escapeHtml;
