// ── NAVLUN.JS ─────────────────────────────────────────────────────────────────
// Navlun Tanımları admin ekranı: kurumsal ülkelerin 3 navlun senaryosu +
// para birimi + sigorta bazı düzenlenebilir tablo (satır başına Kaydet).
// Değer revize edilip kaydedilince eski değerler arşivlenir; alttaki grafik
// seçili ülkenin navlun değişim geçmişini ve değişim oranını gösterir.

// ── STATE ─────────────────────────────────────────────────────────────────────
let _navlunTanimlar = [];        // son yüklenen tanımlar
let _navlunGecmisChart = null;   // aktif Chart.js örneği

// ISO tarihi (YYYY-MM-DD) → GG.AA.YYYY; boşsa "—"
function navlunFmtTarih(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-');
  return `${d}.${m}.${y}`;
}

// ── PANELİ BAŞLAT ─────────────────────────────────────────────────────────────
function initNavlunTanimPanel() {
  const panel = document.getElementById('stepNavlunTanim');
  if (!panel) return;
  panel.innerHTML = `
    <div style="padding:20px 24px 40px;max-width:1280px;margin:0 auto;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
        <i class="ti ti-currency-euro" style="font-size:22px;color:var(--accent2);"></i>
        <h2 style="margin:0;font-size:19px;">Navlun Tanımları</h2>
      </div>
      <div style="font-size:13px;color:var(--text3);margin-bottom:18px;">
        Her kurumsal ülke için üç navlun senaryosu ve sigorta bazı. Taslak ekranında palet/kap oranına
        göre otomatik hesaplamada bu değerler kullanılır. Değer değiştirip <b>Kaydet</b>'e basınca eski
        değerler arşivlenir ve alttaki grafikte görünür.
      </div>
      <div id="navlunTanimStatus" class="status-box" style="margin-bottom:14px;"></div>
      <div style="overflow-x:auto;border:1px solid var(--surface3);border-radius:10px;">
        <table id="navlunTanimTablo" style="width:100%;border-collapse:collapse;font-size:13px;min-width:900px;">
          <thead>
            <tr style="text-align:left;background:var(--surface2);border-bottom:2px solid var(--surface3);">
              <th style="padding:11px 12px;">Ülke</th>
              <th style="padding:11px 8px;">Para Birimi</th>
              <th style="padding:11px 8px;" title="Komple İhracat sevki → navlun_ihr">Komple İhracat</th>
              <th style="padding:11px 8px;" title="Aynı sevkte İhracat + Transit → navlun_ant_ihr">İhracat + Transit</th>
              <th style="padding:11px 8px;" title="Komple Transit/Antrepo sevki → navlun_ant">Komple Transit</th>
              <th style="padding:11px 8px;">Sigorta Bazı</th>
              <th style="padding:11px 12px;text-align:center;width:240px;position:sticky;right:0;
                         background:var(--surface2);z-index:3;box-shadow:-6px 0 8px -6px rgba(0,0,0,.15);">Tarih</th>
            </tr>
          </thead>
          <tbody id="navlunTanimBody">
            <tr><td colspan="7" style="padding:20px;text-align:center;color:var(--text3);">Yükleniyor…</td></tr>
          </tbody>
        </table>
      </div>

      <!-- ── DEĞİŞİM GEÇMİŞİ & GRAFİK ── -->
      <div style="margin-top:30px;border:1px solid var(--surface3);border-radius:10px;overflow:hidden;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
                    padding:14px 16px;background:var(--surface2);border-bottom:1px solid var(--surface3);">
          <div style="display:flex;align-items:center;gap:10px;">
            <i class="ti ti-chart-line" style="font-size:18px;color:var(--accent2);"></i>
            <strong style="font-size:15px;">Navlun Değişim Geçmişi</strong>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:12px;color:var(--text3);">Ülke</span>
            <select id="navlunGecmisUlke" class="target-input" style="width:180px;padding:7px 10px;font-size:13px;"
                    onchange="navlunGecmisYukle()"></select>
          </div>
        </div>
        <div style="padding:16px;">
          <div id="navlunGecmisOzet" style="font-size:12.5px;color:var(--text2);margin-bottom:12px;"></div>
          <div style="position:relative;height:300px;">
            <canvas id="navlunGecmisChart"></canvas>
          </div>
        </div>
      </div>
    </div>`;

  navlunTanimYukle();
}

// ── VERİYİ YÜKLE ──────────────────────────────────────────────────────────────
async function navlunTanimYukle() {
  const body = document.getElementById('navlunTanimBody');
  if (!body) return;
  try {
    const resp = await fetch('/api/navlun/tanim', { cache: 'no-store' });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');
    _navlunTanimlar = data.tanimlar || [];
    navlunTanimRender(_navlunTanimlar);
    navlunGecmisSelectDoldur(_navlunTanimlar);
    navlunGecmisYukle();
  } catch (e) {
    body.innerHTML = `<tr><td colspan="7" style="padding:20px;text-align:center;color:var(--danger,#c0392b);">⚠ ${e.message}</td></tr>`;
  }
}

// ── TABLO SATIRLARINI OLUŞTUR ─────────────────────────────────────────────────
function navlunTanimRender(tanimlar) {
  const body = document.getElementById('navlunTanimBody');
  if (!body) return;
  body.innerHTML = '';

  tanimlar.forEach(t => {
    const tr = document.createElement('tr');
    tr.style.cssText = 'border-bottom:1px solid var(--surface3);';
    tr.dataset.kod = t.ulkeKodu;
    // Kompakt sayısal input — Kaydet butonunun görünür kalması için dar tutulur
    const numInput = (alan, val) =>
      `<input class="target-input navlun-inp" data-alan="${alan}" type="text" inputmode="decimal"
              value="${val ?? 0}" style="width:96px;padding:7px 9px;font-size:13px;">`;
    tr.innerHTML = `
      <td style="padding:9px 12px;white-space:nowrap;">
        <img src="https://flagcdn.com/20x15/${t.ulkeKodu}.png"
             alt="" style="vertical-align:middle;margin-right:7px;border-radius:2px;">
        <strong>${t.ulkeAdi}</strong>
        <span style="color:var(--text3);font-size:11px;margin-left:4px;">${t.ulkeKodu.toUpperCase()}</span>
      </td>
      <td style="padding:9px 8px;">
        <select class="target-input navlun-inp" data-alan="paraBirimi" style="width:78px;padding:7px 8px;font-size:13px;">
          <option value="EUR" ${t.paraBirimi === 'EUR' ? 'selected' : ''}>EUR</option>
          <option value="USD" ${t.paraBirimi === 'USD' ? 'selected' : ''}>USD</option>
          <option value="TRY" ${t.paraBirimi === 'TRY' ? 'selected' : ''}>TRY</option>
        </select>
      </td>
      <td style="padding:9px 8px;">${numInput('navlunIhr', t.navlunIhr)}</td>
      <td style="padding:9px 8px;">${numInput('navlunAntIhr', t.navlunAntIhr)}</td>
      <td style="padding:9px 8px;">${numInput('navlunAnt', t.navlunAnt)}</td>
      <td style="padding:9px 8px;">${numInput('sigortaBaz', t.sigortaBaz)}</td>
      <td style="padding:9px 12px;white-space:nowrap;position:sticky;right:0;
                 background:var(--surface,#fff);z-index:2;box-shadow:-6px 0 8px -6px rgba(0,0,0,.15);">
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;">
          <input type="date" class="target-input navlun-tarih" data-alan="guncellemeTarihi"
                 value="${t.guncellemeTarihi || ''}" title="Geçerlilik / güncelleme tarihi"
                 style="width:140px;padding:6px 8px;font-size:12.5px;">
          <button class="btn-primary visible" style="display:inline-flex;align-items:center;width:auto;
                         padding:7px 14px;font-size:12.5px;font-weight:600;white-space:nowrap;"
                  onclick="navlunTanimKaydet('${t.ulkeKodu}', this)">
            <i class="ti ti-device-floppy" style="font-size:13px;vertical-align:-2px;margin-right:3px;"></i>Kaydet
          </button>
        </div>
      </td>`;
    body.appendChild(tr);
  });
}

// ── SATIRI KAYDET (revize + arşiv) ────────────────────────────────────────────
async function navlunTanimKaydet(kod, btn) {
  const tr = document.querySelector(`#navlunTanimBody tr[data-kod="${kod}"]`);
  if (!tr) return;

  const oku = alan => tr.querySelector(`.navlun-inp[data-alan="${alan}"]`);
  const sayi = alan => {
    const v = (oku(alan)?.value || '').trim().replace(/\./g, '').replace(',', '.');
    // Binlik nokta olmadan yazılmış "2800.50" gibi değerleri de tolere et
    const raw = (oku(alan)?.value || '').trim();
    const n = raw.includes(',') ? parseFloat(v) : parseFloat(raw.replace(',', '.'));
    return isNaN(n) ? 0 : n;
  };

  const tarihEl = tr.querySelector('.navlun-tarih');
  const payload = {
    ulkeKodu: kod,
    paraBirimi: oku('paraBirimi')?.value || 'EUR',
    navlunIhr: sayi('navlunIhr'),
    navlunAntIhr: sayi('navlunAntIhr'),
    navlunAnt: sayi('navlunAnt'),
    sigortaBaz: sayi('sigortaBaz'),
    guncellemeTarihi: tarihEl?.value || '',  // elle girilen geçerlilik tarihi (opsiyonel)
  };

  const eskiMetin = btn ? btn.innerHTML : '';
  if (btn) { btn.innerHTML = '⏳'; btn.disabled = true; }
  try {
    const resp = await fetch('/api/navlun/tanim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');
    navlunTanimDurum('success',
      data.arsivlendi
        ? `✓ ${kod.toUpperCase()} revize edildi — önceki değerler arşivlendi.`
        : `✓ ${kod.toUpperCase()} navlun tanımı kaydedildi.`);
    // Yerel kopyayı + tablodaki tarih alanını güncelle (sunucunun uyguladığı tarih)
    const idx = _navlunTanimlar.findIndex(t => t.ulkeKodu === kod);
    if (idx >= 0) Object.assign(_navlunTanimlar[idx], payload, { guncellemeTarihi: data.guncellemeTarihi });
    if (tarihEl && data.guncellemeTarihi) tarihEl.value = data.guncellemeTarihi;
    if (document.getElementById('navlunGecmisUlke')?.value === kod) {
      navlunGecmisYukle();
    }
  } catch (e) {
    navlunTanimDurum('error', `⚠ ${e.message}`);
  } finally {
    if (btn) { btn.innerHTML = eskiMetin || 'Kaydet'; btn.disabled = false; }
  }
}

// ── DURUM MESAJI ──────────────────────────────────────────────────────────────
function navlunTanimDurum(tip, mesaj) {
  const sb = document.getElementById('navlunTanimStatus');
  if (!sb) return;
  sb.className = 'status-box visible ' + tip;
  sb.textContent = mesaj;
  if (tip === 'success') {
    setTimeout(() => { if (sb) { sb.className = 'status-box'; sb.textContent = ''; } }, 3500);
  }
}

// ── GEÇMİŞ ÜLKE SEÇİCİYİ DOLDUR ───────────────────────────────────────────────
function navlunGecmisSelectDoldur(tanimlar) {
  const sel = document.getElementById('navlunGecmisUlke');
  if (!sel) return;
  const oncekiDeger = sel.value;
  sel.innerHTML = tanimlar.map(t =>
    `<option value="${t.ulkeKodu}">${t.ulkeAdi} (${t.ulkeKodu.toUpperCase()})</option>`).join('');
  // Önceki seçim korunsun, yoksa Sırbistan (rs) varsayılan
  if (oncekiDeger && tanimlar.some(t => t.ulkeKodu === oncekiDeger)) {
    sel.value = oncekiDeger;
  } else if (tanimlar.some(t => t.ulkeKodu === 'rs')) {
    sel.value = 'rs';
  }
}

// ── DEĞİŞİM GEÇMİŞİNİ YÜKLE & ÇİZ ─────────────────────────────────────────────
async function navlunGecmisYukle() {
  const sel = document.getElementById('navlunGecmisUlke');
  const ozet = document.getElementById('navlunGecmisOzet');
  if (!sel || !sel.value) return;
  const kod = sel.value;

  try {
    const resp = await fetch('/api/navlun/gecmis?ulke=' + encodeURIComponent(kod), { cache: 'no-store' });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');
    navlunGecmisCiz(data.versiyonlar || []);
  } catch (e) {
    if (ozet) ozet.textContent = '⚠ ' + e.message;
  }
}

function navlunGecmisCiz(versiyonlar) {
  const ozet = document.getElementById('navlunGecmisOzet');
  const canvas = document.getElementById('navlunGecmisChart');
  if (!canvas) return;

  // Önceki grafiği temizle
  if (_navlunGecmisChart) { _navlunGecmisChart.destroy(); _navlunGecmisChart = null; }

  const para = versiyonlar.length ? versiyonlar[versiyonlar.length - 1].paraBirimi : 'EUR';
  const sembol = para === 'USD' ? '$' : para === 'TRY' ? '₺' : '€';

  // Özet: en son revizyon değişim oranı (İhracat+Transit baz)
  if (ozet) {
    if (versiyonlar.length <= 1) {
      ozet.innerHTML = `<span style="color:var(--text3);">Henüz revizyon yok — değeri değiştirip kaydedince geçmiş burada birikir.</span>`;
    } else {
      const son = versiyonlar[versiyonlar.length - 1];
      const onceki = versiyonlar[versiyonlar.length - 2];
      const yuzde = son.degisimYuzde;
      const yon = yuzde > 0 ? '▲' : yuzde < 0 ? '▼' : '■';
      const renk = yuzde > 0 ? '#c0392b' : yuzde < 0 ? '#1a7f37' : 'var(--text3)';
      ozet.innerHTML =
        `Toplam <b>${versiyonlar.length}</b> versiyon. Son revizyon (İhracat + Transit): ` +
        `<b>${onceki.navlunAntIhr.toLocaleString('tr-TR')} ${sembol}</b> → ` +
        `<b>${son.navlunAntIhr.toLocaleString('tr-TR')} ${sembol}</b> ` +
        `<span style="color:${renk};font-weight:700;">${yon} ${yuzde != null ? yuzde + '%' : '—'}</span>`;
    }
  }

  const labels = versiyonlar.map(v => navlunFmtTarih(v.tarih));
  const mkSeri = (label, key, renk) => ({
    label,
    data: versiyonlar.map(v => v[key]),
    borderColor: renk,
    backgroundColor: renk + '22',
    tension: 0.2,
    pointRadius: 4,
    pointHoverRadius: 6,
    borderWidth: 2,
    fill: false,
  });

  _navlunGecmisChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        mkSeri('Komple İhracat', 'navlunIhr', '#2563EB'),
        mkSeri('İhracat + Transit', 'navlunAntIhr', '#059669'),
        mkSeri('Komple Transit', 'navlunAnt', '#D97706'),
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top', align: 'end',
          labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle',
                    font: { family: 'Inter, system-ui, sans-serif', size: 11 } },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${Number(ctx.parsed.y).toLocaleString('tr-TR')} ${sembol}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: {
          beginAtZero: false,
          grid: { color: 'rgba(148,163,184,.18)' },
          border: { display: false },
          ticks: {
            font: { size: 11 },
            callback: v => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(v) + ' ' + sembol,
          },
        },
      },
    },
  });
}
