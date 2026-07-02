// js/nebim-delivery.js
// Kazakistan/Sirbistan fatura bazli Nebim irsaliye hazirlik ekrani.

let nebimDeliveryItems = [];
let nebimDeliveryFilter = 'all';
let nebimSortColumn = 'ihracat_dosya_no';
let nebimSortDirection = 'desc';
let nebimHideReady = false;
let nebimVisibleCount = 10;
const NEBIM_PAGE_SIZE = 10;

const NEBIM_COL_KEYS = ['ulke', 'ihracat_dosya_no', 'fatura_no', 'plaka', 'fatura_ref_no', 'ready_for_nebim', 'nebim_status'];
const NEBIM_COL_DEFAULTS = {
  ulke: 150,
  ihracat_dosya_no: 130,
  fatura_no: 190,
  plaka: 210,
  fatura_ref_no: 300,
  ready_for_nebim: 90,
  nebim_status: 120,
};

function loadNebimColWidths() {
  try {
    const saved = localStorage.getItem('nebim_delivery_col_widths');
    return saved ? Object.assign({}, NEBIM_COL_DEFAULTS, JSON.parse(saved)) : Object.assign({}, NEBIM_COL_DEFAULTS);
  } catch(e) {
    return Object.assign({}, NEBIM_COL_DEFAULTS);
  }
}

function saveNebimColWidths(widths) {
  try { localStorage.setItem('nebim_delivery_col_widths', JSON.stringify(widths)); } catch(e) {}
}

let nebimColWidths = loadNebimColWidths();

function nebimAuthHeaders() {
  const token = sessionStorage.getItem('fa_auth_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function nebimEscape(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function initNebimDeliveryPanel() {
  const panel = ensureNebimDeliveryPanel();
  if (!panel) return;
  panel.style.cssText = 'padding:0;min-height:100%;background:var(--bg);';
  panel.style.display = 'block';
  panel.innerHTML = `
    <div style="padding:18px 20px;border-bottom:0.5px solid var(--border2);background:var(--surface);display:flex;align-items:center;justify-content:space-between;gap:12px;">
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.08em;">Nebim v3 hazırlık</div>
        <div style="font-size:18px;font-weight:700;color:var(--text);margin-top:2px;">Kazakistan &amp; Sırbistan İrsaliye Referansları</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <input type="file" id="nebim-excel-input" accept=".xlsx,.xls" style="display:none;" onchange="handleNebimExcelImport(this.files[0]); this.value = '';">
        <button onclick="document.getElementById('nebim-excel-input').click()" title="Excel'den aktar"
          style="height:32px;padding:0 12px;border:0;border-radius:var(--radius-md);background:var(--accent);color:#fff;font:12px var(--font);font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">
          <i class="ti ti-file-spreadsheet" aria-hidden="true"></i><span>Excel'den Aktar</span>
        </button>
        <select id="nebim-country-filter" onchange="nebimSetCountryFilter(this.value)"
          style="height:32px;padding:0 10px;border:0.5px solid var(--border2);border-radius:var(--radius-md);background:var(--surface2);color:var(--text);font:12px var(--font);">
          <option value="all">Tüm ülkeler</option>
          <option value="KAZAKİSTAN">Kazakistan</option>
          <option value="SIRBİSTAN">Sırbistan</option>
        </select>
        <button onclick="loadNebimDeliveryItems()" title="Yenile"
          style="width:32px;height:32px;border:0.5px solid var(--border2);border-radius:var(--radius-md);background:var(--surface2);color:var(--text2);cursor:pointer;display:flex;align-items:center;justify-content:center;">
          <i class="ti ti-refresh" aria-hidden="true"></i>
        </button>
      </div>
    </div>
    <div style="padding:14px 20px 0;">
      <div id="nebim-delivery-summary" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;"></div>
      <div id="nebim-delivery-status" style="font-size:12px;color:var(--text3);margin-bottom:8px;"></div>
      <div id="nebim-delivery-table" style="background:var(--surface);border:0.5px solid var(--border2);border-radius:var(--radius-md);overflow:auto;max-width:100%;"></div>
    </div>
  `;
  loadNebimDeliveryItems();
}

function ensureNebimDeliveryPanel() {
  const appShell = document.getElementById('app-shell');
  if (appShell) appShell.style.display = 'flex';

  const loginOverlay = document.getElementById('loginOverlay');
  if (loginOverlay) loginOverlay.style.display = 'none';

  const contentArea = document.getElementById('contentArea');
  if (!contentArea) return null;
  contentArea.style.padding = '0';
  contentArea.classList.remove('fu-content-area');

  [
    'step2', 'step3', 'stepMense', 'stepTaslak', 'stepGtip', 'stepEvrak',
    'stepGecmis', 'stepUsers', 'stepDashboard', 'stepSevkiyatlar',
    'stepFaturaUret', 'stepMaliyetEvrak', 'stepLandedCost',
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  const wizardSteps = document.getElementById('wizardSteps');
  if (wizardSteps) wizardSteps.style.display = 'none';

  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById('nav-nebim-delivery');
  if (navEl) navEl.classList.add('active');

  let panel = document.getElementById('stepNebimDelivery');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'stepNebimDelivery';
    panel.className = 'panel';
    contentArea.appendChild(panel);
  }
  return panel;
}

document.addEventListener('DOMContentLoaded', () => {
  if (location.pathname.replace(/^\//, '') !== 'nebim-delivery') return;
  setTimeout(() => {
    if (document.getElementById('nebim-delivery-table')) return;
    initNebimDeliveryPanel();
  }, 0);
});

function nebimSetCountryFilter(value) {
  nebimDeliveryFilter = value || 'all';
  nebimVisibleCount = NEBIM_PAGE_SIZE;
  loadNebimDeliveryItems();
}

async function loadNebimDeliveryItems() {
  const status = document.getElementById('nebim-delivery-status');
  if (status) {
    status.textContent = 'Kayıtlar yükleniyor...';
    status.style.color = 'var(--text3)';
  }

  const params = new URLSearchParams();
  if (nebimDeliveryFilter && nebimDeliveryFilter !== 'all') params.set('ulke', nebimDeliveryFilter);

  try {
    const res = await fetch(`/api/nebim-delivery?${params.toString()}`, {
      headers: nebimAuthHeaders(),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Kayıtlar alınamadı');
    nebimDeliveryItems = data.items || [];
    sortNebimDeliveryItems();
    renderNebimDeliverySummary();
    renderNebimDeliveryTable();
    if (status) {
      status.textContent = `${nebimDeliveryItems.length} fatura listelendi.`;
      status.style.color = 'var(--text3)';
    }
  } catch (err) {
    if (status) {
      status.textContent = err.message || 'Kayıtlar alınamadı';
      status.style.color = 'var(--error)';
    }
  }
}

function renderNebimDeliverySummary() {
  const el = document.getElementById('nebim-delivery-summary');
  if (!el) return;
  const total = nebimDeliveryItems.length;
  const ready = nebimDeliveryItems.filter(x => x.ready_for_nebim).length;
  const missingRef = nebimDeliveryItems.filter(x => !String(x.fatura_ref_no || '').trim()).length;
  const missingPlate = nebimDeliveryItems.filter(x => !String(x.plaka || '').trim()).length;
  const pill = (label, value, color) => `
    <div style="padding:7px 10px;border-radius:var(--radius-md);background:var(--surface);border:0.5px solid var(--border2);font-size:12px;color:var(--text2);">
      ${label}: <span style="font-weight:700;color:${color};">${value}</span>
    </div>`;
  const hideToggle = `
    <label title="Dolu olanları gizle"
      style="display:flex;align-items:center;gap:6px;padding:7px 10px;border-radius:var(--radius-md);background:var(--surface);border:0.5px solid var(--border2);font-size:12px;color:var(--text2);cursor:pointer;">
      <input type="checkbox" ${nebimHideReady ? 'checked' : ''} onchange="nebimToggleHideReady(this.checked)"
        style="width:14px;height:14px;margin:0;accent-color:var(--accent);cursor:pointer;">
      Gizle
    </label>`;
  el.innerHTML = [
    pill('Toplam', total, 'var(--text)'),
    pill('Nebim hazır', ready, '#166534'),
    pill('Ref no bekleyen', missingRef, '#854F0B'),
    pill('Plaka bekleyen', missingPlate, '#991B1B'),
    hideToggle,
  ].join('');
}

function nebimToggleHideReady(checked) {
  nebimHideReady = Boolean(checked);
  nebimVisibleCount = NEBIM_PAGE_SIZE;
  renderNebimDeliverySummary();
  renderNebimDeliveryTable();
}

function nebimShowMoreItems() {
  nebimVisibleCount += NEBIM_PAGE_SIZE;
  renderNebimDeliveryTable();
}

function nebimCollapseItems() {
  nebimVisibleCount = NEBIM_PAGE_SIZE;
  renderNebimDeliveryTable();
  const el = document.getElementById('nebim-delivery-table');
  if (el) el.scrollTop = 0;
}

function renderNebimDeliveryTable() {
  const el = document.getElementById('nebim-delivery-table');
  if (!el) return;
  if (!nebimDeliveryItems.length) {
    el.innerHTML = '<div style="padding:36px;text-align:center;color:var(--text3);font-size:13px;">Kazakistan veya Sırbistan sevkiyatı bulunamadı.</div>';
    return;
  }

  const filteredItems = nebimHideReady ? nebimDeliveryItems.filter(x => !x.ready_for_nebim) : nebimDeliveryItems;
  if (!filteredItems.length) {
    el.innerHTML = '<div style="padding:36px;text-align:center;color:var(--text3);font-size:13px;">Filtreye uyan kayıt yok.</div>';
    return;
  }

  const visibleItems = filteredItems.slice(0, nebimVisibleCount);
  const remaining = filteredItems.length - visibleItems.length;

  nebimTh._idx = 0;
  const tableHtml = `
    <table style="width:max-content;min-width:100%;border-collapse:collapse;table-layout:fixed;">
      <colgroup>
        ${NEBIM_COL_KEYS.map(key => `<col data-col="${key}" style="width:${nebimColWidths[key] || NEBIM_COL_DEFAULTS[key]}px;">`).join('')}
      </colgroup>
      <thead>
        <tr style="background:var(--surface2);border-bottom:0.5px solid var(--border2);">
          ${nebimTh('Ülke')}
          ${nebimTh('Dosya No')}
          ${nebimTh('Fatura No')}
          ${nebimTh('Plaka')}
          ${nebimTh('Fatura Ref No')}
          ${nebimTh('Nebim')}
          ${nebimTh('Durum')}
        </tr>
      </thead>
      <tbody>
        ${visibleItems.map((item, idx) => nebimDeliveryRow(item, idx)).join('')}
      </tbody>
    </table>`;

  let footerHtml = '';
  if (remaining > 0 || nebimVisibleCount > NEBIM_PAGE_SIZE) {
    footerHtml = `
      <div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:10px;border-top:0.5px solid var(--border2);background:var(--surface);">
        ${remaining > 0 ? `
          <button onclick="nebimShowMoreItems()"
            style="height:30px;padding:0 12px;border:0.5px solid var(--border2);border-radius:var(--radius-md);background:var(--surface2);color:var(--text2);font:12px var(--font);font-weight:600;cursor:pointer;">
            + ${Math.min(NEBIM_PAGE_SIZE, remaining)} kayıt göster (${remaining} kaldı)
          </button>` : ''}
        ${nebimVisibleCount > NEBIM_PAGE_SIZE ? `
          <button onclick="nebimCollapseItems()"
            style="height:30px;padding:0 12px;border:0.5px solid var(--border2);border-radius:var(--radius-md);background:var(--surface2);color:var(--text2);font:12px var(--font);font-weight:600;cursor:pointer;">
            Daralt
          </button>` : ''}
      </div>`;
  }

  el.innerHTML = tableHtml + footerHtml;
  setTimeout(initNebimColResize, 0);
}

function nebimTh(label) {
  const key = NEBIM_COL_KEYS[nebimTh._idx || 0];
  nebimTh._idx = (nebimTh._idx || 0) + 1;
  const icon = nebimSortColumn === key ? (nebimSortDirection === 'asc' ? ' ↑' : ' ↓') : '';
  return `<th onclick="setNebimSort('${key}')" title="Sırala"
    style="padding:9px 14px;text-align:left;font-size:11px;color:var(--text2);font-weight:600;border-right:0.5px solid var(--border2);white-space:nowrap;position:relative;overflow:hidden;cursor:pointer;user-select:none;">
    ${label}<span style="color:var(--accent);font-weight:700;">${icon}</span>
  </th>`;
}

function nebimDeliveryRow(item, idx) {
  const bg = idx % 2 ? 'var(--surface2)' : 'var(--surface)';
  const disabled = !String(item.plaka || '').trim();
  const countryFlag = String(item.ulke || '').toUpperCase().includes('KAZ') ? 'kz' : 'rs';
  return `
    <tr style="background:${bg};border-bottom:0.5px solid var(--border2);">
      <td style="${nebimTdStyle()}"><img src="https://flagcdn.com/20x15/${countryFlag}.png" alt="" style="vertical-align:-2px;margin-right:6px;">${nebimEscape(item.ulke || '-')}</td>
      <td style="${nebimTdStyle()}">${nebimEscape(item.ihracat_dosya_no || '-')}</td>
      <td style="${nebimTdStyle()}font-family:var(--mono);">${nebimEscape(item.fatura_no || '-')}</td>
      <td style="${nebimTdStyle()}">${nebimEscape(item.plaka || '-')}</td>
      <td style="${nebimTdStyle()}">
        <input id="nebim-ref-${item.shipment_id}" value="${nebimEscape(item.fatura_ref_no || '')}" placeholder="Fatura ref no"
          onblur="saveNebimDeliveryRef(${item.shipment_id}, false, this)"
          style="width:100%;height:28px;box-sizing:border-box;padding:0 8px;border:0.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);font:12px var(--font);">
      </td>
      <td style="${nebimTdStyle()}text-align:center;">
        <input type="checkbox" ${item.ready_for_nebim ? 'checked' : ''} ${disabled ? 'disabled' : ''}
          title="${disabled ? 'Plaka olmadan Nebim onayı verilemez' : 'Nebim aktarımına hazır'}"
          onchange="saveNebimDeliveryRef(${item.shipment_id}, true, this)"
          style="width:15px;height:15px;accent-color:var(--accent);cursor:${disabled ? 'not-allowed' : 'pointer'};">
      </td>
      <td style="${nebimTdStyle()}">${nebimStatusBadge(item, disabled)}</td>
    </tr>`;
}

function setNebimSort(key) {
  if (!key) return;
  if (nebimSortColumn === key) {
    nebimSortDirection = nebimSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    nebimSortColumn = key;
    nebimSortDirection = key === 'ihracat_dosya_no' ? 'desc' : 'asc';
  }
  nebimVisibleCount = NEBIM_PAGE_SIZE;
  sortNebimDeliveryItems();
  renderNebimDeliveryTable();
}

function sortNebimDeliveryItems() {
  const key = nebimSortColumn || 'ihracat_dosya_no';
  const dir = nebimSortDirection === 'asc' ? 1 : -1;
  nebimDeliveryItems.sort((a, b) => {
    const cmp = compareNebimValues(a[key], b[key], key);
    if (cmp !== 0) return cmp * dir;
    return compareNebimValues(a.shipment_id, b.shipment_id, 'number') * -1;
  });
}

function compareNebimValues(a, b, key) {
  if (key === 'ready_for_nebim') {
    return Number(Boolean(a)) - Number(Boolean(b));
  }

  if (key === 'ihracat_dosya_no') {
    const na = parseDosyaNo(a);
    const nb = parseDosyaNo(b);
    if (na !== nb) return na - nb;
  }

  const sa = String(a == null ? '' : a).trim();
  const sb = String(b == null ? '' : b).trim();
  const an = Number(sa.replace(',', '.'));
  const bn = Number(sb.replace(',', '.'));
  if (sa && sb && !isNaN(an) && !isNaN(bn)) return an - bn;
  return sa.localeCompare(sb, 'tr', { numeric: true, sensitivity: 'base' });
}

function parseDosyaNo(value) {
  const parts = String(value == null ? '' : value).match(/\d+/g);
  if (!parts || !parts.length) return 0;
  const year = Number(parts[0] || 0);
  const seq = Number(parts[parts.length - 1] || 0);
  return year * 1000000 + seq;
}

function nebimTdStyle() {
  return 'padding:7px 14px;font-size:11.5px;color:var(--text2);white-space:nowrap;border-right:0.5px solid var(--border2);overflow:hidden;text-overflow:ellipsis;';
}

function initNebimColResize() {
  const table = document.querySelector('#nebim-delivery-table table');
  if (!table) return;

  const cols = table.querySelectorAll('colgroup col');
  const ths = table.querySelectorAll('thead th');

  ths.forEach((th, i) => {
    const colKey = NEBIM_COL_KEYS[i];
    if (!colKey) return;

    const width = nebimColWidths[colKey] || NEBIM_COL_DEFAULTS[colKey];
    th.style.width = width + 'px';
    th.style.minWidth = '56px';
    if (cols[i]) cols[i].style.width = width + 'px';

    const existing = th.querySelector('.nebim-col-resize-handle');
    if (existing) existing.remove();

    const handle = document.createElement('div');
    handle.className = 'nebim-col-resize-handle';
    handle.style.cssText = `
      position:absolute;right:0;top:0;bottom:0;width:7px;
      cursor:col-resize;z-index:10;user-select:none;background:transparent;
    `;
    th.appendChild(handle);

    let startX = 0;
    let startW = width;
    let isDragging = false;

    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      isDragging = false;
      startX = e.clientX;
      startW = th.offsetWidth || width;
      handle.style.background = 'var(--accent)';

      const onMove = moveEvent => {
        isDragging = true;
        const newW = Math.max(56, startW + moveEvent.clientX - startX);
        applyNebimColWidth(i, colKey, newW, false);
      };

      const onUp = upEvent => {
        const newW = Math.max(56, startW + upEvent.clientX - startX);
        if (isDragging) applyNebimColWidth(i, colKey, newW, true);
        handle.style.background = 'transparent';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    handle.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
    });

    handle.addEventListener('dblclick', e => {
      e.preventDefault();
      e.stopPropagation();
      applyNebimColWidth(i, colKey, measureNebimColWidth(table, i), true);
    });

    handle.addEventListener('mouseenter', () => handle.style.background = 'var(--accent-mid)');
    handle.addEventListener('mouseleave', () => handle.style.background = 'transparent');
  });
}

function applyNebimColWidth(index, colKey, width, persist) {
  const table = document.querySelector('#nebim-delivery-table table');
  if (!table) return;
  const col = table.querySelectorAll('colgroup col')[index];
  const th = table.querySelectorAll('thead th')[index];
  const finalW = Math.max(56, Math.round(width));
  if (col) col.style.width = finalW + 'px';
  if (th) th.style.width = finalW + 'px';
  nebimColWidths[colKey] = finalW;
  if (persist) saveNebimColWidths(nebimColWidths);
}

function measureNebimColWidth(table, index) {
  const measurer = document.createElement('span');
  measurer.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-size:12px;font-family:var(--font);padding:0 14px;';
  document.body.appendChild(measurer);

  let maxW = 70;
  table.querySelectorAll(`tr th:nth-child(${index + 1}), tr td:nth-child(${index + 1})`).forEach(cell => {
    const input = cell.querySelector('input[type="text"], input:not([type])');
    measurer.textContent = input ? (input.value || input.placeholder || '') : cell.textContent.trim();
    maxW = Math.max(maxW, measurer.offsetWidth + 28);
  });

  document.body.removeChild(measurer);
  return Math.min(maxW, 520);
}

function nebimStatusBadge(item, disabled) {
  if (disabled) return '<span style="color:#991B1B;font-weight:600;">Plaka yok</span>';
  if (item.ready_for_nebim) return '<span style="color:#166534;font-weight:600;">Hazır</span>';
  if (item.fatura_ref_no) return '<span style="color:#854F0B;font-weight:600;">Onay bekliyor</span>';
  return '<span style="color:var(--text3);">Bekliyor</span>';
}

async function saveNebimDeliveryRef(shipmentId, fromCheckbox, trigger) {
  const input = document.getElementById(`nebim-ref-${shipmentId}`);
  const row = nebimDeliveryItems.find(x => Number(x.shipment_id) === Number(shipmentId));
  const checkbox = trigger && trigger.type === 'checkbox' ? trigger : null;
  const ready = checkbox ? checkbox.checked : Boolean(row && row.ready_for_nebim);
  const status = document.getElementById('nebim-delivery-status');

  try {
    const res = await fetch('/api/nebim-delivery', {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, nebimAuthHeaders()),
      body: JSON.stringify({
        shipment_id: shipmentId,
        fatura_ref_no: input ? input.value : '',
        ready_for_nebim: ready,
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Kaydedilemedi');
    if (status) {
      status.textContent = fromCheckbox ? 'Nebim hazırlık durumu kaydedildi.' : 'Fatura ref no kaydedildi.';
      status.style.color = 'var(--text3)';
    }
    await loadNebimDeliveryItems();
  } catch (err) {
    if (checkbox) checkbox.checked = !checkbox.checked;
    if (status) {
      status.textContent = err.message || 'Kaydedilemedi';
      status.style.color = 'var(--error)';
    }
  }
}

async function handleNebimExcelImport(file) {
  const status = document.getElementById('nebim-delivery-status');
  if (!file) return;
  if (typeof XLSX === 'undefined') {
    if (status) {
      status.textContent = 'Excel okuyucu yüklenemedi. Sayfayı yenileyip tekrar deneyin.';
      status.style.color = 'var(--error)';
    }
    return;
  }

  try {
    if (status) {
      status.textContent = 'Excel okunuyor...';
      status.style.color = 'var(--text3)';
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    const parsed = parseNebimExcelRows(rows);

    if (!parsed.length) {
      throw new Error('Excel içinde fatura no ve ref no bulunan satır bulunamadı.');
    }

    const byInvoice = new Map();
    nebimDeliveryItems.forEach(item => {
      byInvoice.set(normalizeNebimInvoice(item.fatura_no), item);
    });

    let matched = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (const row of parsed) {
      const item = byInvoice.get(normalizeNebimInvoice(row.fatura_no));
      if (!item) {
        skipped += 1;
        continue;
      }
      matched += 1;
      try {
        const res = await fetch('/api/nebim-delivery', {
          method: 'PUT',
          headers: Object.assign({ 'Content-Type': 'application/json' }, nebimAuthHeaders()),
          body: JSON.stringify({
            shipment_id: item.shipment_id,
            fatura_ref_no: row.fatura_ref_no,
            ready_for_nebim: true,
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Kaydedilemedi');
        updated += 1;
      } catch (err) {
        errors.push(`${row.fatura_no}: ${err.message || 'Kaydedilemedi'}`);
      }
    }

    await loadNebimDeliveryItems();
    if (status) {
      status.textContent = `Excel aktarımı tamamlandı. Eşleşen: ${matched}, güncellenen: ${updated}, atlanan: ${skipped}${errors.length ? `, hata: ${errors.length}` : ''}.`;
      status.style.color = errors.length ? 'var(--warning)' : 'var(--text3)';
    }
    if (errors.length) console.warn('Nebim Excel aktarım hataları:', errors);
  } catch (err) {
    if (status) {
      status.textContent = err.message || 'Excel aktarımı başarısız.';
      status.style.color = 'var(--error)';
    }
  }
}

function parseNebimExcelRows(rows) {
  return (rows || []).map(raw => {
    const normalized = {};
    Object.keys(raw || {}).forEach(key => {
      normalized[normalizeNebimHeader(key)] = raw[key];
    });
    return {
      fatura_no: getNebimExcelValue(normalized, ['fatura_no', 'faturano', 'invoice_no', 'invoiceno', 'invoice']),
      fatura_ref_no: getNebimExcelValue(normalized, ['fatura_ref_no', 'faturarefno', 'ref_no', 'refno', 'referans_no', 'referansno', 'nebim_ref_no', 'nebimrefno']),
    };
  }).filter(row => String(row.fatura_no || '').trim() && String(row.fatura_ref_no || '').trim());
}

function normalizeNebimHeader(value) {
  return String(value || '')
    .trim()
    .replace(/[ıİI]/g, 'i')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[şŞ]/g, 's')
    .replace(/[öÖ]/g, 'o')
    .replace(/[çÇ]/g, 'c')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getNebimExcelValue(row, keys) {
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim() !== '') return String(row[key]).trim();
  }
  return '';
}

function normalizeNebimInvoice(value) {
  return String(value || '').trim().toLocaleUpperCase('tr-TR').replace(/\s+/g, '');
}
