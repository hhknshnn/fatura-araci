// js/usd-backfill.js
// ══════════════════ GEÇİCİ MODÜL — USD BACKFILL ══════════════════
// İş bitince kaldırılacak: bu dosya + index.html'deki #usd-backfill-section
// bloğu + <script> satırı + api/usd_backfill.py + app.py route'ları
// ═══════════════════════════════════════════════════════════════════

let usdBackfillMissing = [];
let usdBackfillUnmatched = [];

async function loadUsdBackfillList() {
  const container = document.getElementById('usd-backfill-list');
  container.innerHTML = '<div style="font-size:12px;color:var(--text3);">⏳ Yükleniyor...</div>';
  try {
    const token = sessionStorage.getItem('fa_auth_token');
    const res = await fetch('/api/usd-backfill/list', { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Liste alınamadı');
    usdBackfillMissing = data.shipments || [];

    if (usdBackfillMissing.length === 0) {
      container.innerHTML = '<div style="font-size:12px;color:var(--success);">✓ Eksik kayıt yok.</div>';
      return;
    }

    const rows = usdBackfillMissing.map(s => `
      <tr data-id="${s.id}">
        <td style="padding:4px 8px;font-family:var(--mono);font-size:11px;">${s.ihracat_dosya_no || '-'}</td>
        <td style="padding:4px 8px;font-family:var(--mono);font-size:11px;">${s.fatura_no || '-'}</td>
        <td style="padding:4px 8px;font-size:11px;">${s.ulke || '-'}</td>
        <td style="padding:4px 8px;font-size:11px;" id="usd-bf-status-${s.id}">bekliyor</td>
      </tr>`).join('');

    container.innerHTML = `
      <div style="font-size:12px;font-weight:600;margin-bottom:6px;">${usdBackfillMissing.length} kayıt eksik:</div>
      <div style="max-height:240px;overflow-y:auto;border:0.5px solid var(--border2);border-radius:var(--radius-md);">
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead><tr style="background:var(--surface2);position:sticky;top:0;">
            <th style="padding:4px 8px;text-align:left;">Dosya No</th>
            <th style="padding:4px 8px;text-align:left;">Fatura No</th>
            <th style="padding:4px 8px;text-align:left;">Ülke</th>
            <th style="padding:4px 8px;text-align:left;">Durum</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  } catch (e) {
    container.innerHTML = `<div style="font-size:12px;color:var(--error);">⚠ ${e.message}</div>`;
  }
}

function findUsdBackfillMatch(filename) {
  const name = filename.replace(/\.pdf$/i, '').toUpperCase();
  let match = usdBackfillMissing.find(s => s.fatura_no && name.includes(s.fatura_no.toUpperCase()));
  if (match) return match;
  match = usdBackfillMissing.find(s => s.ihracat_dosya_no && name.includes(s.ihracat_dosya_no.toUpperCase()));
  return match || null;
}

async function uploadUsdBackfillPdf(match, buf) {
  try {
    const b64 = arrayBufferToBase64(buf);
    const token = sessionStorage.getItem('fa_auth_token');
    const res = await fetch('/api/usd-backfill/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ id: match.id, pdf: b64 }),
    });
    const data = await res.json();
    const rowStatus = document.getElementById(`usd-bf-status-${match.id}`);
    if (data.success) {
      if (rowStatus) { rowStatus.textContent = '✓ tamamlandı'; rowStatus.style.color = 'var(--success)'; }
      return { log: `✓ ${match.fatura_no}: Navlun ${data.navlun_usd} USD, Sigorta ${data.sigorta_usd} USD, Kur ${data.usd_kuru}` };
    } else {
      if (rowStatus) { rowStatus.textContent = '⚠ hata'; rowStatus.style.color = 'var(--error)'; }
      return { log: `⚠ ${match.fatura_no}: ${data.error}` };
    }
  } catch (e) {
    return { log: `⚠ ${match.fatura_no || ''}: ${e.message}` };
  }
}

async function handleUsdBackfillFiles(fileList) {
  const files = [...fileList].filter(f => f.name.toLowerCase().endsWith('.pdf'));
  if (!files.length) return;
  if (!usdBackfillMissing.length) await loadUsdBackfillList();

  const statusEl = document.getElementById('usd-backfill-status');
  statusEl.textContent = `⏳ ${files.length} PDF işleniyor...`;

  const logs = [];
  const unmatched = [];

  for (const file of files) {
    const match = findUsdBackfillMatch(file.name);
    const buf = await file.arrayBuffer();
    if (!match) {
      unmatched.push({ name: file.name, buf });
      continue;
    }
    const result = await uploadUsdBackfillPdf(match, buf);
    logs.push(result.log);
  }

  statusEl.textContent = 'Bir veya birden fazla PDF sürükleyin veya tıklayın — dosya adına göre otomatik eşleşir';
  renderUsdBackfillResults(logs, unmatched);
}

function renderUsdBackfillResults(logs, unmatched) {
  const resultsEl = document.getElementById('usd-backfill-results');
  let html = `<div style="font-size:11px;line-height:1.7;background:var(--surface2);border:0.5px solid var(--border2);border-radius:var(--radius-md);padding:10px 12px;margin-bottom:10px;">${logs.join('<br>') || '—'}</div>`;

  if (unmatched.length) {
    usdBackfillUnmatched = unmatched;
    const options = usdBackfillMissing.map(s => `<option value="${s.id}">${s.fatura_no} — ${s.ulke}</option>`).join('');
    html += unmatched.map((u, i) => `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--surface2);border:0.5px solid var(--border2);border-radius:var(--radius-md);margin-bottom:6px;">
        <span style="font-size:11px;flex:1;">⚠ ${u.name} — eşleşmedi</span>
        <select id="usd-bf-manual-${i}" style="font-size:11px;padding:4px 6px;">
          <option value="">— seç —</option>${options}
        </select>
        <button onclick="manualMatchUsdBackfill(${i})"
          style="font-size:11px;padding:4px 10px;border-radius:6px;border:none;background:var(--accent);color:#fff;cursor:pointer;">Yükle</button>
      </div>`).join('');
  }

  resultsEl.innerHTML = html;
}

async function manualMatchUsdBackfill(i) {
  const sel = document.getElementById(`usd-bf-manual-${i}`);
  const sid = sel.value;
  if (!sid) return;
  const match = usdBackfillMissing.find(s => String(s.id) === String(sid));
  const item = usdBackfillUnmatched[i];
  if (!match || !item) return;

  sel.disabled = true;
  const result = await uploadUsdBackfillPdf(match, item.buf);
  sel.closest('div').innerHTML = `<span style="font-size:11px;">${result.log}</span>`;
}

// ── EXCEL İLE MANUEL TOPLU GİRİŞ (fatura_no, navlun_usd, sigorta_usd) ────────
async function handleUsdBackfillExcel(file) {
  if (!file) return;
  const statusEl = document.getElementById('usd-backfill-excel-status');
  statusEl.textContent = '⏳ Excel okunuyor...';

  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    // Sütun adlarını normalize et — büyük/küçük harf ve boşluk toleranslı
    const rows = rawRows.map(r => {
      const norm = {};
      for (const key in r) {
        const k = key.toString().trim().toLowerCase().replace(/\s+/g, '_');
        norm[k] = r[key];
      }
      return {
        fatura_no: norm.fatura_no || norm.faturano || '',
        navlun_usd: norm.navlun_usd || norm.navlunusd || 0,
        sigorta_usd: norm.sigorta_usd || norm.sigortausd || 0,
      };
    }).filter(r => r.fatura_no);

    if (!rows.length) {
      statusEl.textContent = '⚠ Excel\'de geçerli satır bulunamadı. Sütunlar: fatura_no, navlun_usd, sigorta_usd';
      return;
    }

    statusEl.textContent = `⏳ ${rows.length} satır gönderiliyor...`;

    const token = sessionStorage.getItem('fa_auth_token');
    const res = await fetch('/api/usd-backfill/manual-excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ rows }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Bilinmeyen hata');

    statusEl.innerHTML = `✓ ${data.guncellenen} güncellendi, ${data.atlanan} atlandı.` +
      (data.hatalar && data.hatalar.length ? `<br><span style="color:var(--text3);">${data.hatalar.join('<br>')}</span>` : '');

    // Listeyi tazele
    if (typeof loadUsdBackfillList === 'function') loadUsdBackfillList();

  } catch (e) {
    statusEl.textContent = '⚠ ' + e.message;
  }
}