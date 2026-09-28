// js/kur.js
// Kur Yönetimi — operasyon para birimleri, ülke eşlemesi, çevirici.

const KurState = {
  data: null,
  baz: 'EUR',
  amount: 100,
  from: 'EUR',
  yukleniyor: false,
  hata: '',
};

function kurEsc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function kurFmt(n, dig = 4) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const x = Number(n);
  const d = Math.abs(x) >= 100 ? 2 : (Math.abs(x) >= 10 ? 3 : dig);
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(x);
}

function kurRate(from, to) {
  const k = KurState.data?.kurlar || {};
  from = (from || 'EUR').toUpperCase();
  to = (to || 'EUR').toUpperCase();
  if (from === to) return 1;
  const fr = from === 'EUR' ? 1 : Number(k[from] || 0);
  const tt = to === 'EUR' ? 1 : Number(k[to] || 0);
  if (fr <= 0 || tt <= 0) return null;
  return tt / fr;
}

function initKurPanel() {
  const panel = document.getElementById('stepKurYonetimi');
  if (!panel) return;
  if (panel.dataset.ready !== 'kur-5') {
    panel.dataset.ready = 'kur-5';
    panel.innerHTML = `<style>
#stepKurYonetimi.panel { gap:0; }
.kur { --kur:#0F766E; --kur-ink:#1A1916; --kur-muted:#6B6560; --kur-line:#E8E2D8;
  font-family:var(--font); color:var(--kur-ink); padding:22px 24px 40px; max-width:1120px; margin:0 auto;
  background:#FAF9F6; min-height:100%; box-sizing:border-box; }
.kur-head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:18px; flex-wrap:wrap; }
.kur-head h1 { margin:0; font:700 22px/1.2 var(--font); letter-spacing:-.02em; }
.kur-meta { margin:6px 0 0; font:500 12.5px/1.4 var(--font); color:var(--kur-muted); }
.kur-btn { height:36px; border:1px solid var(--kur-line); border-radius:8px; padding:0 14px; font:650 12.5px var(--font);
  cursor:pointer; display:inline-flex; align-items:center; gap:7px; background:#fff; color:var(--kur-ink); }
.kur-btn:hover { border-color:var(--kur); color:var(--kur); }
.kur-btn:disabled { opacity:.55; cursor:wait; }
.kur-layout { display:grid; grid-template-columns:minmax(0,1.4fr) minmax(280px,.7fr); gap:12px; margin-bottom:12px; }
.kur-panel { background:#fff; border:1px solid var(--kur-line); border-radius:10px; padding:16px 18px; }
.kur-h { font:700 14px/1.2 var(--font); margin:0 0 2px; }
.kur-p { font:500 12px/1.4 var(--font); color:var(--kur-muted); margin:0 0 12px; }
.kur-baz { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; }
.kur-baz button { height:32px; border:1px solid var(--kur-line); border-radius:8px; background:#fff;
  padding:0 12px; font:700 12px var(--font); cursor:pointer; color:var(--kur-muted); }
.kur-baz button:hover { border-color:var(--kur); color:var(--kur); }
.kur-baz button.active { background:#1A1916; color:#F7F4EE; border-color:#1A1916; }
.kur-table { width:100%; border-collapse:collapse; font-size:13px; }
.kur-table th { text-align:left; font:650 11px var(--font); color:var(--kur-muted); padding:8px 8px;
  border-bottom:1px solid var(--kur-line); }
.kur-table th.num, .kur-table td.num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
.kur-table td { padding:9px 8px; border-bottom:1px solid #F0EBE3; vertical-align:middle; }
.kur-table td.code { font-weight:750; letter-spacing:.04em; }
.kur-table td.muted { color:var(--kur-muted); font-size:12px; }
.kur-table tr.kur-grup td { padding:10px 8px 6px; font:700 10.5px var(--font); letter-spacing:.08em;
  text-transform:uppercase; color:var(--kur-muted); background:#FAF9F6; border-bottom:1px solid var(--kur-line); }
.kur-note { display:block; margin-top:2px; font:500 11px var(--font); color:var(--kur); }
.kur-conv { display:grid; gap:10px; }
.kur-conv .row { display:grid; grid-template-columns:1fr 1fr; gap:8px; align-items:end; }
.kur-field span { display:block; font:650 10.5px var(--font); color:var(--kur-muted); margin-bottom:5px; }
.kur-field input, .kur-field select { width:100%; height:38px; border:1px solid var(--kur-line); border-radius:8px;
  padding:0 10px; font:650 13.5px var(--font); background:#fff; box-sizing:border-box; }
.kur-field input.kur-tutar { font-variant-numeric:tabular-nums; text-align:right; letter-spacing:.02em; }
.kur-eq { margin-top:2px; border:1px solid #CCFBF1; border-radius:8px; overflow:hidden; background:#fff; }
.kur-eq-row { display:grid; grid-template-columns:48px 1fr auto; gap:8px; align-items:center;
  padding:8px 12px; border-bottom:1px solid #F0EBE3; }
.kur-eq-row:last-child { border-bottom:0; }
.kur-eq-row.is-src { background:#F0FDFA; }
.kur-eq-row .kod { font-weight:750; letter-spacing:.04em; font-size:12.5px; }
.kur-eq-row .ad { color:var(--kur-muted); font:500 11.5px var(--font); }
.kur-eq-row .amt { font:750 13.5px/1.2 var(--font); font-variant-numeric:tabular-nums; text-align:right; white-space:nowrap; }
.kur-eq-row.is-src .amt { color:var(--kur); }
.kur-empty { text-align:center; padding:48px 16px; color:var(--kur-muted); }
@media (max-width:900px) {
  .kur-layout { grid-template-columns:1fr; }
  .kur { padding:16px; }
}
</style>
<div class="kur" id="kur-root"><div class="kur-empty">Kurlar yükleniyor…</div></div>`;
  }
  kurLoad();
}

async function kurLoad() {
  KurState.yukleniyor = true;
  KurState.hata = '';
  kurRender();
  try {
    const res = await fetch('/api/kur/panel', { cache: 'no-store' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Kurlar alınamadı');
    KurState.data = data;
  } catch (e) {
    KurState.hata = e.message || 'Kurlar alınamadı';
    KurState.data = null;
  }
  KurState.yukleniyor = false;
  kurRender();
}

function kurSetBaz(b) {
  KurState.baz = b;
  kurRender();
}

function kurRender() {
  const root = document.getElementById('kur-root');
  if (!root) return;
  if (KurState.yukleniyor && !KurState.data) {
    root.innerHTML = `<div class="kur-empty">Kurlar yükleniyor…</div>`;
    return;
  }
  if (KurState.hata && !KurState.data) {
    root.innerHTML = `<div class="kur-empty">${kurEsc(KurState.hata)}<div style="margin-top:12px"><button class="kur-btn" onclick="kurLoad()">Yenile</button></div></div>`;
    return;
  }
  const d = KurState.data;
  const baz = KurState.baz;
  const paralar = d.paralar || [];
  const colB = baz === 'TRY' ? 'EUR' : 'TRY';

  const paraRows = paralar.map(p => {
    const a = kurRate(baz, p.kod);
    const b = kurRate(colB, p.kod);
    const note = p.not ? `<span class="kur-note">${kurEsc(p.not)}</span>` : '';
    return `<tr>
      <td class="code">${kurEsc(p.kod)}</td>
      <td>${kurEsc(p.ad)}${note}</td>
      <td class="num">${kurFmt(a)} ${kurEsc(p.sembol || p.kod)}</td>
      <td class="num">${kurFmt(b)} ${kurEsc(p.sembol || p.kod)}</td>
    </tr>`;
  }).join('');

  const paraOpts = (sel) => paralar.map(p =>
    `<option value="${p.kod}"${p.kod === sel ? ' selected' : ''}>${p.kod} · ${kurEsc(p.ad)}</option>`
  ).join('');

  const grupLabel = { kurumsal: 'Kurumsal', franchise: 'Franchise', toptan: 'Toptan' };
  const ulkeRowsGrouped = (() => {
    const rows = d.ulkeler || [];
    const order = ['kurumsal', 'franchise', 'toptan'];
    let html = '';
    for (const g of order) {
      const part = rows.filter(u => (u.grup || 'kurumsal') === g);
      if (!part.length) continue;
      html += `<tr class="kur-grup"><td colspan="3">${grupLabel[g] || g}</td></tr>`;
      html += part.map(u => {
        const yerel = (u.yerel || []).join(', ') || '—';
        return `<tr>
          <td><b>${kurEsc(u.label)}</b></td>
          <td>${kurEsc(u.fatura)}</td>
          <td>${kurEsc(yerel)}</td>
        </tr>`;
      }).join('');
    }
    return html;
  })();

  const kaynak = [d.tarih, d.kaynak, d.guncelleme].filter(Boolean).join(' · ');

  root.innerHTML = `
    <div class="kur-head">
      <div>
        <h1>Kur Yönetimi</h1>
        <p class="kur-meta">${kurEsc(kaynak)} · EUR bazlı</p>
      </div>
      <button class="kur-btn" type="button" onclick="kurLoad()" ${KurState.yukleniyor ? 'disabled' : ''}>
        <i class="ti ti-refresh"></i> Yenile
      </button>
    </div>

    <div class="kur-layout">
      <div class="kur-panel">
        <div class="kur-h">Para birimleri</div>
        <div class="kur-p">1 ${kurEsc(baz)} ve 1 ${kurEsc(colB)} karşılıkları.</div>
        <div class="kur-baz">
          ${paralar.map(p =>
            `<button type="button" class="${baz === p.kod ? 'active' : ''}" onclick="kurSetBaz('${kurEsc(p.kod)}')">${kurEsc(p.kod)}</button>`
          ).join('')}
        </div>
        <div style="overflow:auto">
          <table class="kur-table">
            <thead><tr>
              <th>Kod</th><th>Ad</th>
              <th class="num">1 ${kurEsc(baz)} =</th>
              <th class="num">1 ${kurEsc(colB)} =</th>
            </tr></thead>
            <tbody>${paraRows}</tbody>
          </table>
        </div>
      </div>

      <div class="kur-panel" id="kur-conv">
        <div class="kur-h">Çevirici</div>
        <div class="kur-p">Girilen tutarın tüm para birimlerindeki karşılığı.</div>
        <div class="kur-conv">
          <div class="row">
            <label class="kur-field"><span>Tutar</span>
              <input class="kur-tutar" type="text" inputmode="decimal" autocomplete="off"
                value="${kurEsc(kurFmtTutar(KurState.amount))}"
                oninput="kurOnTutarInput(this)" onblur="kurOnTutarBlur(this)">
            </label>
            <label class="kur-field"><span>Kaynak</span>
              <select id="kur-from" onchange="KurState.from=this.value;kurRenderConvOnly()">${paraOpts(KurState.from)}</select>
            </label>
          </div>
          <div class="kur-eq" id="kur-conv-result">${kurConvListHtml()}</div>
        </div>
      </div>
    </div>

    <div class="kur-panel">
      <div class="kur-h">Ülke eşlemesi</div>
      <div class="kur-p">Fatura para birimi ve yerel / maliyet kuru.</div>
      <div style="overflow:auto">
        <table class="kur-table">
          <thead><tr><th>Ülke</th><th>Fatura para birimi</th><th>Yerel</th></tr></thead>
          <tbody>${ulkeRowsGrouped}</tbody>
        </table>
      </div>
    </div>`;
}

function kurFmtTutar(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '0,00';
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);
}

function kurParseTutar(raw) {
  let s = String(raw == null ? '' : raw)
    .replace(/[\u00a0\u202f\u2009\u2007]/g, ' ')
    .replace(/[€$₺₸₾]/g, '')
    .trim();
  if (!s) return 0;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let decDigits = '';
  let intSrc = s;

  if (lastComma !== -1 && lastDot !== -1) {
    const decIdx = Math.max(lastComma, lastDot);
    decDigits = s.slice(decIdx + 1).replace(/\D/g, '').slice(0, 2);
    intSrc = s.slice(0, decIdx);
  } else if (lastComma !== -1) {
    const after = s.slice(lastComma + 1).replace(/\D/g, '');
    const commaCount = (s.match(/,/g) || []).length;
    if (commaCount > 1 || after.length === 3) intSrc = s;
    else {
      decDigits = after.slice(0, 2);
      intSrc = s.slice(0, lastComma);
    }
  } else if (lastDot !== -1) {
    const after = s.slice(lastDot + 1).replace(/\D/g, '');
    const dotCount = (s.match(/\./g) || []).length;
    if (dotCount > 1 && after.length === 3) intSrc = s;
    else if (after.length <= 2) {
      decDigits = after;
      intSrc = s.slice(0, lastDot);
    } else if (after.length === 3) intSrc = s;
    else {
      decDigits = after.slice(0, 2);
      intSrc = s.slice(0, lastDot);
    }
  }

  const intDigits = intSrc.replace(/\D/g, '') || '0';
  const n = Number(intDigits + (decDigits ? '.' + decDigits : ''));
  return Number.isFinite(n) ? n : 0;
}

function kurIsTrTyping(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return true;
  if (/[^\d,.]/.test(s)) return false;
  return /^\d{1,3}(\.\d{3})*(,\d{0,2})?$/.test(s) || /^\d+(,\d{0,2})?$/.test(s);
}

function kurNormalizeTutarDisplay(raw) {
  let s = String(raw == null ? '' : raw);
  s = s.replace(/[^\d,.]/g, '');
  if (!s.includes(',') && s.includes('.')) {
    const last = s.lastIndexOf('.');
    const after = s.slice(last + 1);
    const before = s.slice(0, last);
    if (after.length <= 2 && !before.includes('.')) s = before + ',' + after;
    else s = s.replace(/\./g, '');
  }
  const comma = s.indexOf(',');
  let intPart = (comma === -1 ? s : s.slice(0, comma)).replace(/\D/g, '').slice(0, 12);
  intPart = intPart.replace(/^0+(?=\d)/, '');
  const decPart = comma === -1 ? null : s.slice(comma + 1).replace(/\D/g, '').slice(0, 2);
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (decPart == null) return grouped;
  return grouped + ',' + decPart;
}

function kurOnTutarInput(el) {
  const raw = el.value;
  if (!String(raw).trim()) {
    KurState.amount = 0;
    kurRenderConvOnly();
    return;
  }
  if (!kurIsTrTyping(raw)) {
    const n = kurParseTutar(raw);
    KurState.amount = n;
    el.value = kurFmtTutar(n);
    try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* ignore */ }
    kurRenderConvOnly();
    return;
  }
  const caret = el.selectionStart ?? el.value.length;
  const before = el.value.slice(0, caret);
  const hadSep = /[.,]$/.test(before);
  const digitsBefore = before.replace(/\D/g, '').length;
  const formatted = kurNormalizeTutarDisplay(el.value);
  el.value = formatted;
  KurState.amount = kurParseTutar(formatted);
  let pos = formatted.length;
  if (digitsBefore === 0) {
    const c = formatted.indexOf(',');
    pos = c === -1 ? formatted.length : c;
  } else {
    let seen = 0;
    for (let i = 0; i < formatted.length; i++) {
      if (/\d/.test(formatted[i])) {
        seen++;
        if (seen >= digitsBefore) { pos = i + 1; break; }
      }
    }
  }
  if (hadSep && formatted.includes(',')) {
    const c = formatted.indexOf(',');
    if (pos <= c) pos = c + 1;
  }
  try { el.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
  kurRenderConvOnly();
}

function kurOnTutarBlur(el) {
  const n = kurParseTutar(el.value);
  KurState.amount = n;
  el.value = kurFmtTutar(n);
  kurRenderConvOnly();
}

function kurConvListHtml() {
  const paralar = KurState.data?.paralar || [];
  const amt = Number(KurState.amount || 0);
  return paralar.map(p => {
    const conv = kurRate(KurState.from, p.kod);
    const sonuc = conv == null ? null : amt * conv;
    const src = p.kod === KurState.from;
    return `<div class="kur-eq-row${src ? ' is-src' : ''}">
      <span class="kod">${kurEsc(p.kod)}</span>
      <span class="ad">${kurEsc(p.ad)}</span>
      <span class="amt">${sonuc == null ? '—' : kurFmt(sonuc, 2)} ${kurEsc(p.sembol || p.kod)}</span>
    </div>`;
  }).join('');
}

function kurRenderConvOnly() {
  const box = document.getElementById('kur-conv-result');
  if (!box || !KurState.data) return kurRender();
  box.innerHTML = kurConvListHtml();
}
