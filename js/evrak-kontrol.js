// Evrak Kontrol: ihracat beyannamesi + EUR.1 / menşe şahadetnamesi PDF'lerini fatura (INV/PL) ile karşılaştırır.
// Yalnızca okur ve gösterir; hiçbir kayıt yazmaz. Backend: POST /api/evrak-kontrol/karsilastir
let evrakKontrolDosyalar = [];
let evrakKontrolSon = null;

const EK_BTN = 'padding:8px 16px;border-radius:var(--radius-md);font-family:var(--font);font-size:12.5px;font-weight:600;cursor:pointer;';
const EK_BTN_GHOST = EK_BTN + 'background:transparent;color:var(--text2);border:0.5px solid var(--border2);';
const EK_TUR_ADI = { beyanname: 'İhracat Beyannamesi', eur1: 'EUR.1 Dolaşım Belgesi', mense: 'Menşe Şahadetnamesi' };
const EK_DURUM = {
  ok:    { ikon: '✓', renk: '#15803D', ad: 'Uyumlu' },
  uyari: { ikon: '!', renk: '#B45309', ad: 'Kontrol' },
  hata:  { ikon: '✕', renk: '#B91C1C', ad: 'Uyumsuz' },
  yok:   { ikon: '–', renk: '#6B7280', ad: 'Referans yok' },
};

function evrakKontrolModal(baslik, icerikHtml, altHtml = '') {
  document.getElementById('evrak-kontrol-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'evrak-kontrol-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:400;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:var(--surface);border:0.5px solid var(--border2);border-radius:var(--radius-xl);
                width:min(720px,95vw);max-height:88vh;display:flex;flex-direction:column;box-shadow:0 8px 40px rgba(0,0,0,0.18);">
      <div style="padding:16px 22px;border-bottom:0.5px solid var(--border2);display:flex;align-items:center;gap:10px;">
        <div style="font-size:16px;font-weight:700;color:var(--text);margin-right:auto;">${baslik}</div>
        <button onclick="document.getElementById('evrak-kontrol-overlay')?.remove()"
          style="border:none;background:none;font-size:20px;cursor:pointer;color:var(--text3);">×</button>
      </div>
      <div style="padding:14px 22px;overflow:auto;flex:1;">${icerikHtml}</div>
      ${altHtml ? `<div style="padding:12px 22px;border-top:0.5px solid var(--border2);display:flex;gap:10px;justify-content:flex-end;align-items:center;">${altHtml}</div>` : ''}
    </div>`;
  document.body.appendChild(overlay);
  ['dragover', 'drop'].forEach(ev => overlay.addEventListener(ev, e => e.preventDefault()));
}

function evrakKontrolAc() {
  evrakKontrolDosyalar = [];
  evrakKontrolModal('🧾 Evrak Kontrol', `
    <div class="drop-zone" id="evrak-kontrol-dropzone" onclick="document.getElementById('evrak-kontrol-input').click()" style="padding:22px 20px;">
      <div class="drop-icon">🧾</div>
      <h3>Beyanname, menşe ve (varsa) EUR.1 PDF'lerini bırakın</h3>
      <div id="evrak-kontrol-hata" style="display:none;margin-top:6px;font-size:12px;color:#B91C1C;"></div>
    </div>
    <input type="file" id="evrak-kontrol-input" accept=".pdf,.xlsx" multiple style="display:none"
      onchange="evrakKontrolYukle(this.files)">`);
  const dz = document.getElementById('evrak-kontrol-dropzone');
  const engelle = e => { e.preventDefault(); e.stopPropagation(); };
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { engelle(e); dz.classList.add('dragover'); }));
  dz.addEventListener('dragleave', e => { engelle(e); if (!dz.contains(e.relatedTarget)) dz.classList.remove('dragover'); });
  dz.addEventListener('drop', e => { engelle(e); dz.classList.remove('dragover'); evrakKontrolYukle(e.dataTransfer?.files); });
}

async function evrakKontrolYukle(files) {
  const liste = [...(files || [])].filter(f => /\.(pdf|xlsx)$/i.test(f.name));
  if (!liste.length) {
    const h = document.getElementById('evrak-kontrol-hata');
    if (h) { h.style.display = 'block'; h.textContent = '⚠ Yalnızca .pdf (ve isteğe bağlı .xlsx) bırakın.'; }
    return;
  }
  evrakKontrolModal('🧾 Evrak Kontrol', `<div style="padding:30px;text-align:center;color:var(--text2);font-size:13px;">⏳ ${liste.length} belge okunuyor...</div>`);
  try {
    const dosyalar = [];
    for (const f of liste) dosyalar.push({ ad: f.name, b64: await fileToBase64(f) });
    const token = localStorage.getItem('fa_auth_token');
    const resp = await fetch('/api/evrak-kontrol/karsilastir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ dosyalar }),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Belgeler karşılaştırılamadı');
    evrakKontrolSonucCiz(data);
  } catch (e) {
    evrakKontrolModal('🧾 Evrak Kontrol', `<div style="padding:20px;color:#B91C1C;font-size:13px;">⚠ ${escapeHtml(e.message)}</div>`,
      `<button onclick="evrakKontrolAc()" style="${EK_BTN_GHOST}">← Geri</button>`);
  }
}

function evrakKontrolDeger(v) {
  if (typeof v === 'number') return v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  return escapeHtml(v == null || v === '' ? '—' : v);
}

function evrakKontrolSonucCiz(d) {
  let durum;
  if (d.tamamlandi) {
    durum = `<div style="padding:10px 12px;border-radius:var(--radius-md);background:#DCFCE7;color:#166534;font-size:13px;font-weight:600;">
      ✓ Tüm belgeler faturayla uyumlu</div>`;
  } else {
    const nedenler = [];
    if ((d.eksikBelgeler || []).length) nedenler.push(`Eksik: ${d.eksikBelgeler.map(escapeHtml).join(', ')}`);
    if ((d.belgeler || []).some(b => b.ozet.hata || b.ozet.uyari)) nedenler.push('Uyumsuz alan var');
    (d.uyarilar || []).forEach(u => nedenler.push(escapeHtml(u)));
    durum = `<div style="padding:10px 12px;border-radius:var(--radius-md);background:#FEF3C7;color:#92400E;font-size:13px;">
      ${nedenler.join(' · ')}</div>`;
  }
  const baslik = `<div style="margin:10px 0 14px;font-size:12.5px;color:var(--text2);">
    <b style="color:var(--text);">${escapeHtml(d.faturaNo || '')}</b>${d.dosyaNo ? ` · ${escapeHtml(d.dosyaNo)}` : ''}</div>`;

  const bloklar = (d.belgeler || []).map(b => {
    const sorun = b.ozet.hata + b.ozet.uyari;
    const renk = b.ozet.hata ? '#B91C1C' : (b.ozet.uyari ? '#B45309' : '#15803D');
    const satirlar = b.kontroller.map(k => {
      const s = EK_DURUM[k.durum] || EK_DURUM.yok;
      const sorunlu = k.durum === 'hata' || k.durum === 'uyari';
      return `<tr style="border-top:0.5px solid var(--border2);${sorunlu ? 'background:rgba(185,28,28,0.05);' : ''}">
        <td style="padding:6px 8px;">${escapeHtml(k.alan)}</td>
        <td style="padding:6px 8px;color:var(--text2);">${evrakKontrolDeger(k.beklenen)}</td>
        <td style="padding:6px 8px;${sorunlu ? `color:${s.renk};font-weight:600;` : ''}">${evrakKontrolDeger(k.bulunan)}
          ${sorunlu && k.not ? `<div style="font-size:11px;font-weight:400;color:var(--text3);">${escapeHtml(k.not)}</div>` : ''}</td>
        <td style="padding:6px 8px;width:24px;text-align:center;color:${s.renk};font-weight:700;" title="${s.ad}">${s.ikon}</td></tr>`;
    }).join('');
    return `<div style="margin-bottom:18px;">
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px;">
        <div style="font-weight:700;font-size:13.5px;color:var(--text);">${EK_TUR_ADI[b.tur] || b.tur}</div>
        <div style="font-size:12px;font-weight:600;color:${renk};margin-left:auto;">${sorun ? `${sorun} sorun` : 'Uyumlu'}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
        <thead><tr style="text-align:left;color:var(--text3);font-size:11px;font-weight:600;">
          <th style="padding:3px 8px;">Alan</th><th style="padding:3px 8px;">Fatura</th>
          <th style="padding:3px 8px;">Belge</th><th></th></tr></thead>
        <tbody>${satirlar}</tbody></table></div>`;
  }).join('');

  evrakKontrolSon = d;
  const hataVar = (d.belgeler || []).some(b => b.ozet.hata);
  const onayBtn = (d.kayitSayisi && !hataVar)
    ? `<button onclick="evrakKontrolOnayla()" style="${EK_BTN}background:var(--accent);color:#fff;border:none;">Onayla ve faturayı sil</button>` : '';
  evrakKontrolModal('🧾 Evrak Kontrol', durum + baslik + bloklar,
    `<button onclick="evrakKontrolAc()" style="${EK_BTN_GHOST}">Yeni kontrol</button>
     <button onclick="document.getElementById('evrak-kontrol-overlay')?.remove()" style="${EK_BTN_GHOST}">Kapat</button>${onayBtn}`);
}

// Kullanıcı onaylarsa fatura INV/PL kaydı sunucudan silinir (otomatik silme yok).
async function evrakKontrolOnayla() {
  const d = evrakKontrolSon;
  if (!d?.faturaNo) return;
  if (!d.tamamlandi && !confirm('Kontrol tamamlanmadı (eksik belge veya uyarı var). Yine de faturayı silmek istiyor musunuz?')) return;
  try {
    const token = localStorage.getItem('fa_auth_token');
    const resp = await fetch('/api/evrak-kontrol/onayla', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ faturaNo: d.faturaNo, ulke: d.ulke || '' }),
    });
    const r = await resp.json();
    if (!r.success) throw new Error(r.error || 'Silinemedi');
    evrakKontrolModal('🧾 Evrak Kontrol',
      `<div style="padding:10px 12px;border-radius:var(--radius-md);background:#DCFCE7;color:#166534;font-size:13px;font-weight:600;">
        ✓ Onaylandı, ${escapeHtml(d.faturaNo)} fatura kaydı silindi</div>`,
      `<button onclick="evrakKontrolAc()" style="${EK_BTN_GHOST}">Yeni kontrol</button>
       <button onclick="document.getElementById('evrak-kontrol-overlay')?.remove()" style="${EK_BTN_GHOST}">Kapat</button>`);
  } catch (e) {
    alert('⚠ ' + e.message);
  }
}
