// ── EVRAK.JS ──────────────────────────────────────────────────────────────────
// Ek Evrak Üretimi modülü — bağımsız çalışır, diğer akışları etkilemez.
// Backend: /api/evrak
// Her ülkenin ek evrakları config/evrak_{xx}.json içinde tanımlı.
// Tüm hatalar try/catch ile sarmalanır, global state'e dokunmaz.

// ── STATE (yalıtılmış — sadece bu modül kullanır) ─────────────────────────────
const EVRAK_ULKELER = {
  be: { label: 'Belçika', flag: 'be' },
  // Yeni ülke geldikçe buraya eklenir. Her ülke için config/evrak_XX.json
  // dosyası da gerekir (backend'in okuyacağı yer).
};

// Her ülke için hangi evraklar var + alan tanımları (frontend cache).
// Backend de aynı bilgiyi config dosyasından okur. Tutarlı tutmak önemli.
const EVRAK_TIPLERI = {
  be: [
    {
      id: 'mill_test',
      label: 'MILL TEST',
      aciklama: 'Rus menşeli ürün/hammadde kullanılmadığına dair beyan',
      alanlar: [
        { id: 'faturaNo',     label: 'Fatura No',     tip: 'text', placeholder: 'örn: DEH2026000000123' },
        { id: 'faturaTarihi', label: 'Fatura Tarihi', tip: 'date' },
      ],
    },
  ],
};

let evrakUlke  = null;
let evrakTipi  = null;

// ── PANELİ AÇ ─────────────────────────────────────────────────────────────────
function initEvrakPanel() {
  try {
    for (let i = 1; i <= 5; i++) {
      const el = document.getElementById('step' + i);
      if (el) el.style.display = 'none';
    }
    const taslakPanel = document.getElementById('stepTaslak');
    if (taslakPanel) taslakPanel.style.display = 'none';
    const gtipPanel = document.getElementById('stepGtip');
    if (gtipPanel) gtipPanel.style.display = 'none';

    const panel = document.getElementById('stepEvrak');
    if (!panel) { console.error('stepEvrak paneli bulunamadı'); return; }
    panel.style.display = 'block';

    // State sıfırla
    evrakUlke = null;
    evrakTipi = null;

    // UI sıfırla
    const status = document.getElementById('evrakStatus');
    if (status) { status.className = 'status-box'; status.innerHTML = ''; }

    const tipSec = document.getElementById('evrakTipSection');
    if (tipSec) tipSec.style.display = 'none';

    const formSec = document.getElementById('evrakFormSection');
    if (formSec) formSec.style.display = 'none';

    const indirBtn = document.getElementById('evrakIndir');
    if (indirBtn) indirBtn.style.display = 'none';

    buildEvrakUlkeGrid();
  } catch(err) {
    console.error('initEvrakPanel hatası:', err);
  }
}

// ── PANELDEN ÇIK ──────────────────────────────────────────────────────────────
function exitEvrakPanel() {
  try {
    const panel = document.getElementById('stepEvrak');
    if (panel) panel.style.display = 'none';

    const step1 = document.getElementById('step1');
    if (step1) step1.style.display = 'block';

    const cards = ['card-taslak', 'card-gtip', 'card-oncesi', 'card-sonrasi', 'card-evrak'];
    cards.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    });

    const next = document.getElementById('step1Next');
    if (next) next.style.display = 'none';

    if (typeof updateDots === 'function') updateDots(1);

    evrakUlke = null;
    evrakTipi = null;
  } catch(err) {
    console.error('exitEvrakPanel hatası:', err);
  }
}

// ── ÜLKE GRİD OLUŞTUR ────────────────────────────────────────────────────────
function buildEvrakUlkeGrid() {
  try {
    const grid = document.getElementById('evrakUlkeGrid');
    if (!grid) return;
    grid.innerHTML = '';

    Object.entries(EVRAK_ULKELER).forEach(([kod, cfg]) => {
      const btn = document.createElement('div');
      btn.className = 'country-btn';
      btn.id = 'evrak-ulke-' + kod;
      btn.addEventListener('click', () => selectEvrakUlke(kod));
      btn.innerHTML = `
        <div class="country-flag"><img src="https://flagcdn.com/40x30/${cfg.flag}.png"></div>
        <div class="country-name">${cfg.label}</div>`;
      grid.appendChild(btn);
    });
  } catch(err) {
    console.error('buildEvrakUlkeGrid hatası:', err);
  }
}

// ── ÜLKE SEÇ ──────────────────────────────────────────────────────────────────
function selectEvrakUlke(kod) {
  try {
    evrakUlke = kod;
    evrakTipi = null;

    document.querySelectorAll('#evrakUlkeGrid .country-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('evrak-ulke-' + kod);
    if (btn) btn.classList.add('active');

    const tipler = EVRAK_TIPLERI[kod] || [];
    if (!tipler.length) {
      showEvrakStatus('info', '<div class="stat">⚠ Bu ülke için henüz ek evrak tanımlanmamış.</div>');
      document.getElementById('evrakTipSection').style.display = 'none';
      document.getElementById('evrakFormSection').style.display = 'none';
      document.getElementById('evrakIndir').style.display = 'none';
      return;
    }

    // Evrak tipi grid'ini göster
    buildEvrakTipGrid(tipler);
    document.getElementById('evrakTipSection').style.display = 'block';
    document.getElementById('evrakFormSection').style.display = 'none';
    document.getElementById('evrakIndir').style.display = 'none';

    showEvrakStatus('info', `<div class="stat">${EVRAK_ULKELER[kod].label} — Evrak türünü seçin</div>`);
  } catch(err) {
    console.error('selectEvrakUlke hatası:', err);
  }
}

// ── EVRAK TİPİ GRİD OLUŞTUR ──────────────────────────────────────────────────
function buildEvrakTipGrid(tipler) {
  try {
    const grid = document.getElementById('evrakTipGrid');
    if (!grid) return;
    grid.innerHTML = '';

    tipler.forEach(tip => {
      const card = document.createElement('div');
      card.className = 'choice-card';
      card.id = 'evrak-tip-' + tip.id;
      card.addEventListener('click', () => selectEvrakTipi(tip.id));
      card.innerHTML = `
        <span class="choice-icon">📄</span>
        <div class="choice-name">${escapeHtmlEvrak(tip.label)}</div>
        <div class="choice-desc">${escapeHtmlEvrak(tip.aciklama || '')}</div>`;
      grid.appendChild(card);
    });
  } catch(err) {
    console.error('buildEvrakTipGrid hatası:', err);
  }
}

// ── EVRAK TİPİ SEÇ ────────────────────────────────────────────────────────────
function selectEvrakTipi(tipId) {
  try {
    evrakTipi = tipId;

    document.querySelectorAll('#evrakTipGrid .choice-card').forEach(c => c.classList.remove('active'));
    const card = document.getElementById('evrak-tip-' + tipId);
    if (card) card.classList.add('active');

    const tipler = EVRAK_TIPLERI[evrakUlke] || [];
    const tip = tipler.find(t => t.id === tipId);
    if (!tip) return;

    buildEvrakForm(tip);
    document.getElementById('evrakFormSection').style.display = 'block';
    document.getElementById('evrakIndir').style.display = 'block';
  } catch(err) {
    console.error('selectEvrakTipi hatası:', err);
  }
}

// ── FORM OLUŞTUR ──────────────────────────────────────────────────────────────
function buildEvrakForm(tip) {
  try {
    const container = document.getElementById('evrakFormAlanlari');
    if (!container) return;
    container.innerHTML = '';

    tip.alanlar.forEach(alan => {
      const div = document.createElement('div');
      div.style.cssText = 'margin-bottom:14px;';

      let inputType     = 'text';
      let inputMode     = 'text';
      if (alan.tip === 'date')   inputType = 'date';
      if (alan.tip === 'number') { inputType = 'text'; inputMode = 'decimal'; }

      div.innerHTML = `
        <div style="font-size:13px;font-weight:500;margin-bottom:6px;">${escapeHtmlEvrak(alan.label)}</div>
        <input
          class="target-input"
          id="evrak_${alan.id}"
          type="${inputType}"
          inputmode="${inputMode}"
          placeholder="${escapeHtmlEvrak(alan.placeholder || '')}"
          style="width:100%;">`;
      container.appendChild(div);
    });
  } catch(err) {
    console.error('buildEvrakForm hatası:', err);
  }
}

// ── FORM VERİSİNİ TOPLA ──────────────────────────────────────────────────────
function getEvrakFormData() {
  try {
    if (!evrakUlke || !evrakTipi) return null;
    const tipler = EVRAK_TIPLERI[evrakUlke] || [];
    const tip = tipler.find(t => t.id === evrakTipi);
    if (!tip) return null;

    const data = {};
    for (const alan of tip.alanlar) {
      const el = document.getElementById('evrak_' + alan.id);
      if (!el) continue;
      data[alan.id] = el.value.trim();
    }
    return data;
  } catch(err) {
    console.error('getEvrakFormData hatası:', err);
    return null;
  }
}

// ── PDF İNDİR ─────────────────────────────────────────────────────────────────
async function indirEvrak() {
  try {
    if (!evrakUlke || !evrakTipi) {
      showEvrakStatus('error', '<div class="stat">⚠ Ülke ve evrak tipi seçin.</div>');
      return;
    }

    const formData = getEvrakFormData();
    if (!formData) {
      showEvrakStatus('error', '<div class="stat">⚠ Form verisi alınamadı.</div>');
      return;
    }

    // Zorunlu alan kontrolü
    const tipler = EVRAK_TIPLERI[evrakUlke] || [];
    const tip = tipler.find(t => t.id === evrakTipi);
    for (const alan of (tip ? tip.alanlar : [])) {
      if (!formData[alan.id]) {
        showEvrakStatus('error', `<div class="stat">⚠ ${alan.label} boş olamaz.</div>`);
        return;
      }
    }

    const btn = document.getElementById('evrakIndir');
    const eskiMetin = btn.textContent;
    btn.textContent = '⏳ PDF hazırlanıyor...';
    btn.disabled = true;

    try {
      const resp = await fetch('/api/evrak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ulkeKodu:  evrakUlke,
          evrakTipi: evrakTipi,
          formData:  formData,
        })
      });

      const data = await resp.json();
      if (!data.success) throw new Error(data.error || 'Sunucu hatası');

      // PDF'i indir
      const bin   = atob(data.pdf);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = data.dosyaAdi;
      a.click();
      URL.revokeObjectURL(url);

      showEvrakStatus('success', `<div class="stat">✓ İndirildi: <span>${escapeHtmlEvrak(data.dosyaAdi)}</span></div>`);

    } finally {
      btn.textContent = eskiMetin;
      btn.disabled = false;
    }

  } catch(err) {
    console.error('indirEvrak hatası:', err);
    showEvrakStatus('error', '<div class="stat">⚠ ' + escapeHtmlEvrak(err.message) + '</div>');
  }
}

// ── STATUS ─────────────────────────────────────────────────────────────────────
function showEvrakStatus(type, html) {
  try {
    const box = document.getElementById('evrakStatus');
    if (!box) return;
    box.className = 'status-box visible ' + type;
    box.innerHTML = html;
  } catch(err) {
    console.error('showEvrakStatus hatası:', err);
  }
}

// ── HTML ESCAPE ───────────────────────────────────────────────────────────────
function escapeHtmlEvrak(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
