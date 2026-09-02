// ── T1 AYRIMI ────────────────────────────────────────────────────────────────
// Fatura Üret > T1 Ayrımı sekmesi.
// INV+PL dosyasının M–R sütunlarını (Declarion No, Index, Total/Unit Gross-Net)
// Masterfile + T1 transit beyannamesi / talep formundan doldurur.
//
// Tek dropzone: dosyalar sunucuda içeriklerinden tanınır, sıra/isim önemsizdir.

let T1_SECILEN = [];   // [{ad, boyut, b64, rol}]

// Dosya rolü — arayüzde etiket göstermek için istemci tarafında da tahmin edilir.
// Nihai karar sunucuda içerik okunarak verilir.
const T1_ROLLER = {
  invpl:      { etiket: 'INV + PL',      ikon: 'ti-file-invoice'      },
  masterfile: { etiket: 'Masterfile',    ikon: 'ti-table'             },
  t1:         { etiket: 'T1 beyanname',  ikon: 'ti-file-text'         },
  talep:      { etiket: 'Talep formu',   ikon: 'ti-clipboard-list'    },
  ornek:      { etiket: 'gerek yok',     ikon: 'ti-file-off'          },
};

function initT1AyrimiPanel() {
  const container = document.getElementById('fu-content-t1');
  if (!container || container.dataset.ready === '1') return;
  container.dataset.ready = '1';

  container.innerHTML = `
    <div class="t1-panel">
      <div class="t1-intro">
        <h3>Belçika T1 Ayrımı</h3>
        <p>INV+PL dosyasındaki <b>M–R</b> sütunları (Declarion No, Index, Total Gross/Net,
           Unit Gross/Net) Masterfile ve T1 beyannamesinden doldurulur.
           Dosyaları hep birlikte bırakın — hangisinin ne olduğu içeriğinden anlaşılır.
           Referans örnek fatura uygulamada gömülü, yüklemeye gerek yok.</p>
      </div>

      <div class="t1-drop" id="t1-drop"
           onclick="document.getElementById('t1-input').click()">
        <input type="file" id="t1-input" multiple accept=".xlsx,.xls,.pdf"
               style="display:none" onchange="t1DosyaEkle(this.files); this.value='';">
        <div class="t1-drop-icon"><i class="ti ti-cloud-upload"></i></div>
        <div class="t1-drop-title">Dosyaları buraya sürükleyin veya seçmek için tıklayın</div>
        <div class="t1-drop-desc">
          INV+PL (.xlsx) · Masterfile (.xlsx) · T1 beyanname (.pdf) · Talep formu (.xls — opsiyonel)
        </div>
      </div>

      <div id="t1-liste" class="t1-liste"></div>

      <div class="t1-actions">
        <button class="btn t1-btn-uret" id="t1-uret-btn" onclick="t1AyrimiUret()" disabled>
          <i class="ti ti-wand"></i> Doldur ve İndir
        </button>
        <button class="btn btn-ghost" onclick="t1AyrimiSifirla()">
          <i class="ti ti-refresh"></i> Temizle
        </button>
      </div>

      <div id="t1-sonuc" class="t1-sonuc" style="display:none;"></div>
    </div>`;

  const drop = document.getElementById('t1-drop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => {
    e.preventDefault(); e.stopPropagation(); drop.classList.add('surukleniyor');
  }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => {
    e.preventDefault(); e.stopPropagation(); drop.classList.remove('surukleniyor');
  }));
  drop.addEventListener('drop', e => {
    if (e.dataTransfer && e.dataTransfer.files) t1DosyaEkle(e.dataTransfer.files);
  });
}

// ── Dosya listesi ────────────────────────────────────────────────────────────

function t1DosyaEkle(dosyalar) {
  [...dosyalar].forEach(dosya => {
    if (T1_SECILEN.some(d => d.ad === dosya.name && d.boyut === dosya.size)) return;
    const okuyucu = new FileReader();
    okuyucu.onload = () => {
      T1_SECILEN.push({
        ad:    dosya.name,
        boyut: dosya.size,
        b64:   okuyucu.result.split(',')[1],
        rol:   t1RolTahmin(dosya.name),
      });
      t1ListeCiz();
    };
    okuyucu.readAsDataURL(dosya);
  });
}

// Sadece görsel ipucu — kesin tanıma sunucuda yapılır
function t1RolTahmin(ad) {
  const a = ad.toLocaleUpperCase('tr');
  if (a.includes('ÖRNEK') || a.includes('ORNEK') || a.includes('SAMPLE')) return 'ornek';
  if (a.endsWith('.PDF'))                        return 't1';
  if (a.includes('TALEP'))                       return 'talep';
  if (a.includes('MASTER'))                      return 'masterfile';
  if (a.includes('INV') || a.includes('PL'))     return 'invpl';
  if (a.endsWith('.XLS'))                        return 'talep';
  return null;
}

function t1DosyaSil(i) {
  T1_SECILEN.splice(i, 1);
  t1ListeCiz();
}

function t1ListeCiz() {
  const liste = document.getElementById('t1-liste');
  if (!liste) return;

  liste.innerHTML = T1_SECILEN.map((d, i) => {
    const rol = T1_ROLLER[d.rol];
    return `
      <div class="t1-dosya">
        <i class="ti ${rol ? rol.ikon : 'ti-file-unknown'}"></i>
        <div class="t1-dosya-ad">
          ${escapeHtmlT1(d.ad)}
          <small>${t1Boyut(d.boyut)}</small>
        </div>
        <span class="t1-rozet${rol ? (d.rol === 'ornek' ? ' pasif' : '') : ' bilinmiyor'}">${rol ? rol.etiket : 'tanınmadı'}</span>
        <button class="t1-sil" onclick="t1DosyaSil(${i})" title="Kaldır" type="button">
          <i class="ti ti-x"></i>
        </button>
      </div>`;
  }).join('');

  t1ButonDurumu();
}

function t1Boyut(b) {
  return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB';
}

function t1ButonDurumu() {
  const btn = document.getElementById('t1-uret-btn');
  if (!btn) return;
  // Sunucu içerikten tanıyacağı için istemcide sadece dosya sayısına bakılır
  btn.disabled = T1_SECILEN.length < 3;
}

function t1AyrimiSifirla() {
  T1_SECILEN = [];
  const c = document.getElementById('fu-content-t1');
  if (c) { c.dataset.ready = ''; initT1AyrimiPanel(); }
}

// ── Üretim ───────────────────────────────────────────────────────────────────

async function t1AyrimiUret() {
  const btn = document.getElementById('t1-uret-btn');
  const sonuc = document.getElementById('t1-sonuc');
  const eskiMetin = btn.innerHTML;
  btn.innerHTML = '<i class="ti ti-loader"></i> Hazırlanıyor...';
  btn.disabled = true;
  sonuc.style.display = 'none';

  try {
    const invpl = T1_SECILEN.find(d => d.rol === 'invpl') || T1_SECILEN[0];
    const dosyaAdi = (invpl ? invpl.ad : 'INV-PL.xlsx')
      .replace(/\.(xlsx|xls)$/i, '') + ' - T1 Ayrimi.xlsx';

    const resp = await fetch('/api/t1-ayrimi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({
        dosyalar: T1_SECILEN.map(d => ({ ad: d.ad, veri: d.b64 })),
        dosyaAdi: dosyaAdi,
      })
    });

    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Sunucu hatası');

    const bin   = atob(data.excel);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = data.dosyaAdi;
    a.click();
    URL.revokeObjectURL(url);

    t1SonucGoster(data.ozet, data.dosyaAdi);

  } catch (e) {
    sonuc.style.display = 'block';
    sonuc.className = 't1-sonuc hata';
    sonuc.innerHTML = '<b>✕ Hata:</b> ' + escapeHtmlT1(e.message);
  } finally {
    btn.innerHTML = eskiMetin;
    t1ButonDurumu();
  }
}

function t1SonucGoster(ozet, dosyaAdi) {
  const sonuc = document.getElementById('t1-sonuc');
  const brutFark = Math.abs(ozet.toplam_brut - ozet.t1_toplam_brut);
  const netFark  = Math.abs(ozet.toplam_net  - ozet.t1_toplam_net);
  const tutarli  = brutFark < 0.05 && netFark < 0.05 &&
                   ozet.eslesen_kalem === ozet.beyanname_grubu;

  const dosyalar = ozet.dosyalar || {};
  const tanimaSatiri = Object.keys(dosyalar).length ? `
    <div class="t1-tanima">
      ${Object.entries(dosyalar).map(([rol, ad]) =>
        `<span><b>${escapeHtmlT1(rol)}:</b> ${escapeHtmlT1(ad)}</span>`).join('')}
    </div>` : '';

  sonuc.style.display = 'block';
  sonuc.className = 't1-sonuc ' + (ozet.uyarilar.length ? 'uyari' : 'ok');
  sonuc.innerHTML = `
    <div class="t1-sonuc-baslik">✓ İndirildi: <span>${escapeHtmlT1(dosyaAdi)}</span></div>
    ${tanimaSatiri}
    <div class="t1-ozet">
      <div><span>${ozet.satir}</span><small>doldurulan satır</small></div>
      <div><span>${ozet.eslesen_kalem}/${ozet.beyanname_grubu}</span><small>eşleşen beyanname</small></div>
      <div><span>${ozet.t1_kalem}</span><small>T1 kalemi</small></div>
      <div><span>${ozet.talep_kalem || '—'}</span><small>talep formu satırı</small></div>
      <div><span>${ozet.toplam_brut.toLocaleString('tr-TR')}</span><small>brüt kg (T1: ${ozet.t1_toplam_brut.toLocaleString('tr-TR')})</small></div>
      <div><span>${ozet.toplam_net.toLocaleString('tr-TR')}</span><small>net kg (T1: ${ozet.t1_toplam_net.toLocaleString('tr-TR')})</small></div>
      <div><span>${ozet.t1_toplam_kap}</span><small>T1 kap adedi</small></div>
    </div>
    ${tutarli
      ? '<div class="t1-kontrol ok">Ağırlık ve kalem kontrolleri tutuyor. Kalem numarası kaynağı: '
        + escapeHtmlT1(ozet.kaynak || 'T1 PDF') + '.</div>'
      : '<div class="t1-kontrol uyari">Toplamlar T1 ile tam örtüşmüyor — aşağıdaki uyarıları kontrol edin.</div>'}
    ${ozet.uyarilar.length ? `
      <div class="t1-uyarilar">
        <b>${ozet.uyarilar.length} uyarı</b>
        <ul>${ozet.uyarilar.slice(0, 50).map(u => '<li>' + escapeHtmlT1(u) + '</li>').join('')}</ul>
        ${ozet.uyarilar.length > 50 ? '<small>… ve ' + (ozet.uyarilar.length - 50) + ' uyarı daha</small>' : ''}
      </div>` : ''}
  `;
}

function escapeHtmlT1(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
