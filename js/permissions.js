// js/permissions.js
// Admin'e ozel duzenlenebilir rol ve ozellik portali.

const PERMISSION_ROLE_ORDER = ['viewer', 'editor', 'admin'];
const PERMISSION_ROLE_FALLBACK = {
  viewer: { key: 'viewer', label: 'Görüntüleyici', subtitle: '', icon: '', description: '' },
  editor: { key: 'editor', label: 'Düzenleyici', subtitle: '', icon: '', description: '' },
  admin:  { key: 'admin', label: 'Admin', subtitle: '', icon: '', description: '' },
};

let permissionsPortal = null;
let permissionsSaving = false;
window.permissionsAdminTab = window.permissionsAdminTab || 'permissions';

function permissionEscape(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function permissionNormalizePortal(portal) {
  const source = portal && typeof portal === 'object' ? portal : {};
  const roleMap = {};
  (Array.isArray(source.roles) ? source.roles : []).forEach(role => {
    if (role && PERMISSION_ROLE_ORDER.includes(role.key)) roleMap[role.key] = role;
  });
  const roles = PERMISSION_ROLE_ORDER.map(key => Object.assign({}, PERMISSION_ROLE_FALLBACK[key], roleMap[key] || {}));
  const features = (Array.isArray(source.features) ? source.features : []).map(feature => ({
    title: String(feature?.title || ''),
    detail: String(feature?.detail || ''),
    icon: String(feature?.icon || ''),
    roles: Array.isArray(feature?.roles) ? feature.roles.filter(role => PERMISSION_ROLE_ORDER.includes(role)) : [],
  })).filter(feature => feature.title.trim());

  return {
    title: String(source.title || 'Admin Portalı'),
    subtitle: String(source.subtitle || ''),
    roles,
    features,
  };
}

function permissionStatus(message, type) {
  const el = document.getElementById('permissionsStatus');
  if (!el) return;
  el.textContent = message || '';
  el.className = `permissions-status ${type || ''}`.trim();
}

async function initPermissionsPanel() {
  if (window.currentUser?.role !== 'admin') {
    sidebarSelect('dashboard');
    return;
  }

  const panel = document.getElementById('stepPermissions');
  if (!panel) return;
  panel.className = 'panel permissions-shell';
  panel.innerHTML = `
    <div class="permissions-loading">
      <i class="ti ti-loader-2" aria-hidden="true"></i>
      <span>Yükleniyor</span>
    </div>
  `;

  try {
    const resp = await fetch('/api/permissions-portal', { headers: getAuthHeaders() });
    const data = await resp.json();
    if (!resp.ok || !data.success) throw new Error(data.error || 'Yetki portalı yüklenemedi');
    permissionsPortal = permissionNormalizePortal(data.portal);
    renderPermissionsPortal();
  } catch (err) {
    panel.innerHTML = `
      <div class="permissions-error">
        <i class="ti ti-alert-triangle" aria-hidden="true"></i>
        <strong>Portal açılamadı</strong>
        <span>${permissionEscape(err.message || 'Bilinmeyen hata')}</span>
      </div>
    `;
  }
}

function renderPermissionsPortal() {
  const panel = document.getElementById('stepPermissions');
  if (!panel || !permissionsPortal) return;
  const portal = permissionsPortal;
  const activeTab = window.permissionsAdminTab || 'permissions';
  const featureCount = portal.features.length;
  const adminOnlyCount = portal.features.filter(feature => feature.roles.length === 1 && feature.roles[0] === 'admin').length;

  panel.innerHTML = `
    <div class="permissions-hero">
      <div class="permissions-hero-main">
        <div class="permissions-kicker">Admin portalı</div>
        <div class="permissions-hero-title">${permissionEscape(portal.title)}</div>
        <div class="permissions-hero-copy">Rolleri ve özellik erişimlerini sade bir matris üzerinden yönetin.</div>
      </div>
      <div class="permissions-hero-stats">
        <div class="permissions-stat">
          <span>${portal.roles.length}</span>
          <small>Üye tipi</small>
        </div>
        <div class="permissions-stat">
          <span>${featureCount}</span>
          <small>Özellik</small>
        </div>
        <div class="permissions-stat">
          <span>${adminOnlyCount}</span>
          <small>Admin özel</small>
        </div>
      </div>
    </div>

    <div class="permissions-toolbar">
      <div id="permissionsStatus" class="permissions-status"></div>
      <div class="permissions-actions" style="${activeTab === 'permissions' ? '' : 'display:none;'}">
        <button class="permissions-btn secondary" type="button" onclick="initPermissionsPanel()">
          <i class="ti ti-refresh" aria-hidden="true"></i><span>Yenile</span>
        </button>
        <button class="permissions-btn" type="button" onclick="savePermissionsPortal()" id="permissionsSaveBtn">
          <i class="ti ti-device-floppy" aria-hidden="true"></i><span>Kaydet</span>
        </button>
      </div>
    </div>

    <div class="admin-portal-tabs" role="tablist" aria-label="Admin portalı bölümleri">
      <button class="admin-portal-tab ${activeTab === 'permissions' ? 'active' : ''}" type="button" onclick="openAdminPortalTab('permissions')">
        <i class="ti ti-shield-check" aria-hidden="true"></i><span>Yetki Matrisi</span>
      </button>
      <button class="admin-portal-tab ${activeTab === 'users' ? 'active' : ''}" type="button" onclick="openAdminPortalTab('users')">
        <i class="ti ti-users" aria-hidden="true"></i><span>Kullanıcılar</span>
      </button>
    </div>

    ${activeTab === 'permissions' ? `
      <div class="permissions-layout">
      <section class="permissions-section">
        <div class="permissions-section-head">
          <div>
            <div class="permissions-section-title">Üye Tipleri</div>
            <div class="permissions-section-sub">Ekranda görünen rol adları</div>
          </div>
        </div>
        <div class="permissions-role-grid">
          ${portal.roles.map(role => renderRoleEditor(role)).join('')}
        </div>
      </section>

      <section class="permissions-section">
        <div class="permissions-section-head">
          <div>
            <div class="permissions-section-title">Özellikler</div>
            <div class="permissions-section-sub">Özellik adı ve erişebilen roller</div>
          </div>
          <button class="permissions-icon-btn" type="button" onclick="addPermissionFeature()" title="Özellik ekle">
            <i class="ti ti-plus" aria-hidden="true"></i>
          </button>
        </div>
        <div id="permissionsFeatureEditor" class="permissions-feature-editor">
          ${portal.features.map((feature, index) => renderFeatureEditor(feature, index)).join('')}
        </div>
      </section>
      </div>

      <section class="permissions-section permissions-preview-section">
      <div class="permissions-section-head">
        <div>
          <div class="permissions-section-title">Canlı Matris</div>
          <div class="permissions-section-sub">Kaydedilecek görünüm</div>
        </div>
      </div>
      <div class="permissions-matrix-wrap">
        ${renderPermissionMatrix(portal)}
      </div>
      </section>
    ` : `
      <div id="adminPortalUsersMount"></div>
    `}
  `;
  if (activeTab === 'permissions') {
    wirePermissionsLivePreview();
  } else if (typeof renderUsersPortalShell === 'function') {
    renderUsersPortalShell('adminPortalUsersMount');
    initUsersPanel();
  }
}

function openAdminPortalTab(tab) {
  window.permissionsAdminTab = tab === 'users' ? 'users' : 'permissions';
  renderPermissionsPortal();
}

function renderRoleEditor(role) {
  return `
    <div class="permissions-role-card" data-role-card="${permissionEscape(role.key)}">
      <div class="permissions-role-key">${permissionEscape(role.key)}</div>
      <input class="permissions-input role-label" data-role-field="${permissionEscape(role.key)}:label" value="${permissionEscape(role.label)}" maxlength="80">
      <div class="permissions-role-chip-row">
        ${PERMISSION_ROLE_ORDER.map(key => `<span class="permissions-mini-chip ${key === role.key ? 'active' : ''}">${permissionEscape(PERMISSION_ROLE_FALLBACK[key].label)}</span>`).join('')}
      </div>
    </div>
  `;
}

function renderFeatureEditor(feature, index) {
  return `
    <div class="permissions-feature-row" data-feature-index="${index}">
      <div class="permissions-feature-main">
        <input class="permissions-input" data-feature-field="${index}:title" value="${permissionEscape(feature.title)}" maxlength="140">
      </div>
      <div class="permissions-feature-side">
        <div class="permissions-role-toggles">
          ${PERMISSION_ROLE_ORDER.map(role => `
            <label>
              <input type="checkbox" data-feature-role="${index}:${role}" ${feature.roles.includes(role) ? 'checked' : ''}>
              <span>${permissionEscape(PERMISSION_ROLE_FALLBACK[role].label)}</span>
            </label>
          `).join('')}
        </div>
      </div>
      <button class="permissions-icon-btn danger" type="button" onclick="removePermissionFeature(${index})" title="Özelliği sil">
        <i class="ti ti-trash" aria-hidden="true"></i>
      </button>
    </div>
  `;
}

function renderPermissionMatrix(portal) {
  return `
    <table class="permissions-matrix">
      <thead>
        <tr>
          <th>Özellik</th>
          ${portal.roles.map(role => `<th>${permissionEscape(role.label)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${portal.features.map(feature => `
          <tr>
            <td>
              <div class="permissions-feature">
                <div>
                  <strong>${permissionEscape(feature.title)}</strong>
                </div>
              </div>
            </td>
            ${portal.roles.map(role => `<td>${permissionStatusHtml(feature.roles.includes(role.key))}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function permissionStatusHtml(allowed) {
  const klass = allowed ? 'yes' : 'no';
  const icon = allowed ? 'ti-check' : 'ti-minus';
  const label = allowed ? 'Var' : 'Yok';
  return `<span class="permission-status ${klass}" title="${label}" aria-label="${label}"><i class="ti ${icon}" aria-hidden="true"></i></span>`;
}

function collectPermissionsPortalFromDom() {
  const portal = permissionNormalizePortal(permissionsPortal);
  portal.title = portal.title || 'Admin Portalı';
  portal.subtitle = portal.subtitle || '';

  portal.roles = portal.roles.map(role => {
    const next = Object.assign({}, role);
    ['label'].forEach(field => {
      const el = document.querySelector(`[data-role-field="${role.key}:${field}"]`);
      if (el) next[field] = el.value.trim();
    });
    return next;
  });

  portal.features = portal.features.map((feature, index) => {
    const next = Object.assign({}, feature);
    ['title'].forEach(field => {
      const el = document.querySelector(`[data-feature-field="${index}:${field}"]`);
      if (el) next[field] = el.value.trim();
    });
    next.roles = PERMISSION_ROLE_ORDER.filter(role => {
      const el = document.querySelector(`[data-feature-role="${index}:${role}"]`);
      return !!el?.checked;
    });
    return next;
  }).filter(feature => feature.title);

  return permissionNormalizePortal(portal);
}

function wirePermissionsLivePreview() {
  const panel = document.getElementById('stepPermissions');
  if (!panel) return;
  const refreshPreview = () => {
    const wrap = panel.querySelector('.permissions-matrix-wrap');
    if (!wrap) return;
    const draft = collectPermissionsPortalFromDom();
    wrap.innerHTML = renderPermissionMatrix(draft);
  };
  panel.oninput = event => {
    if (event.target.matches('.permissions-input')) refreshPreview();
  };
  panel.onchange = event => {
    if (event.target.matches('[data-feature-role]')) refreshPreview();
  };
}

function addPermissionFeature() {
  permissionsPortal = collectPermissionsPortalFromDom();
  permissionsPortal.features.push({
    title: 'Yeni özellik',
    detail: '',
    icon: '',
    roles: ['admin'],
  });
  renderPermissionsPortal();
}

function removePermissionFeature(index) {
  permissionsPortal = collectPermissionsPortalFromDom();
  permissionsPortal.features.splice(index, 1);
  renderPermissionsPortal();
}

async function savePermissionsPortal() {
  if (permissionsSaving) return;
  permissionsPortal = collectPermissionsPortalFromDom();
  permissionsSaving = true;
  const btn = document.getElementById('permissionsSaveBtn');
  if (btn) btn.disabled = true;
  permissionStatus('Kaydediliyor...', 'pending');

  try {
    const resp = await fetch('/api/permissions-portal', {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
      body: JSON.stringify({ portal: permissionsPortal }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.success) throw new Error(data.error || 'Kaydedilemedi');
    permissionsPortal = permissionNormalizePortal(data.portal);
    renderPermissionsPortal();
    permissionStatus('Kaydedildi.', 'success');
  } catch (err) {
    permissionStatus(err.message || 'Kaydetme hatası', 'error');
  } finally {
    permissionsSaving = false;
    const freshBtn = document.getElementById('permissionsSaveBtn');
    if (freshBtn) freshBtn.disabled = false;
  }
}
