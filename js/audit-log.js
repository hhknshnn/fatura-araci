// ── AUDIT-LOG.JS ──────────────────────────────────────────────────────────────
// İşlem kayıtları paneli. Sadece admin görebilir.

const AUDIT_ACTION_LABELS = {
  login:                 'Giriş',
  logout:                'Çıkış',
  shipment_create:       'Sevkiyat Ekle',
  shipment_update:       'Sevkiyat Güncelle',
  shipment_delete:       'Sevkiyat Sil',
  shipment_bulk_import:  'Toplu İçe Aktar',
  shipment_bulk_update:  'Toplu Güncelle',
  shipment_bulk_delete:  'Toplu Sil',
  shipment_group:        'Gruplama',
  invoice_generate:      'Fatura Üret',
  taslak_fill:           'Taslak Doldur',
  evrak_generate:        'Maliyet Evrak Üret',
  nebim_approve:         'Nebim Onayı',
  nebim_unapprove:       'Nebim Onayı Kaldırıldı',
  nebim_ref_update:      'Nebim Ref No Değişti',
  user_create:           'Kullanıcı Oluştur',
  user_delete:           'Kullanıcı Sil',
  user_update_role:      'Rol Değiştir',
  user_reset_password:   'Şifre Sıfırla',
};

async function initAuditPanel() {
  showAuditStatus('info', '<div class="stat">⏳ Kayıtlar yükleniyor...</div>');
  document.getElementById('auditLogContainer').innerHTML = '';
  await loadAuditLog();
}

async function loadAuditLog() {
  try {
    const resp = await fetch('/api/audit-log', { headers: { ...getAuthHeaders() } });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');
    renderAuditLog(data.entries || []);
    clearAuditStatus();
  } catch (e) {
    showAuditStatus('error', `<div class="stat">⚠ ${escHtml(e.message)}</div>`);
  }
}

function renderAuditLog(entries) {
  const container = document.getElementById('auditLogContainer');
  if (!entries.length) {
    container.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:12px;">Henüz kayıt yok.</div>';
    return;
  }
  const rows = entries.map(e => {
    const d = new Date(e.createdAt * 1000);
    const dateStr = d.toLocaleString('tr-TR');
    const label = AUDIT_ACTION_LABELS[e.action] || e.action;
    return `
      <tr style="border-bottom:1px solid var(--border2);">
        <td style="padding:8px 10px;font-size:12px;color:var(--text3);white-space:nowrap;font-family:var(--mono);">${dateStr}</td>
        <td style="padding:8px 10px;font-size:12.5px;font-weight:600;white-space:nowrap;">${escHtml(e.displayName || e.username)}</td>
        <td style="padding:8px 10px;font-size:11.5px;white-space:nowrap;"><span class="badge badge-blue">${escHtml(label)}</span></td>
        <td style="padding:8px 10px;font-size:12.5px;color:var(--text2);">${escHtml(e.description)}</td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="card" style="overflow-x:auto;padding:0;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:var(--surface2);border-bottom:1px solid var(--border2);">
            <th style="padding:8px 10px;text-align:left;font-size:11px;color:var(--text3);">Zaman</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;color:var(--text3);">Kullanıcı</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;color:var(--text3);">İşlem</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;color:var(--text3);">Detay</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

async function downloadAuditLogExcel() {
  try {
    const res = await fetch('/api/audit-log/export', { headers: { ...getAuthHeaders() } });
    const contentType = res.headers.get('Content-Type') || '';
    if (!res.ok || contentType.includes('application/json')) {
      const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      showAuditStatus('error', `<div class="stat">⚠ ${escHtml(errData.error || 'Excel indirilemedi')}</div>`);
      return;
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `islem_kayitlari_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) {
    showAuditStatus('error', `<div class="stat">⚠ ${escHtml(e.message)}</div>`);
  }
}

function showAuditStatus(type, html) {
  const sb = document.getElementById('auditStatus');
  if (!sb) return;
  sb.className = 'status-box visible ' + type;
  sb.innerHTML = html;
}

function clearAuditStatus() {
  const sb = document.getElementById('auditStatus');
  if (!sb) return;
  sb.className = 'status-box';
  sb.innerHTML = '';
}
