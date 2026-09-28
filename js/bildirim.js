// ── ÜST ŞERİT BİLDİRİMLERİ (zil) ─────────────────────────────────────────────
// Kurallar (bir sevkiyat yalnızca bir bölümde görünür, öncelik sırasıyla):
//  1) Durumu güncellenmemiş olabilir: teslim edilmemiş ama broker ve gümrük KDV
//     girilmiş, yüklemeden bu yana BILDIRIM_BROKER_KDV_GUN gün geçmiş.
//  2) Ülke süresi tanımlıysa (ULKE_TESLIM_SURELERI) gümrük tarihinden itibaren:
//     - teslim gününü aştı ve TESLİM EDİLDİ değil → "Teslim edilmedi"
//     - varış gününü aştı ve hâlâ Yüklenecek/Yolda → "Varış gümrüğe geçmedi"
//     Gruplu sevkiyatlarda sayaç iki kaydın en yeni gümrük/yükleme tarihinden başlar.
//  3) Süresi tanımsız ülkeler: yola çıkmış, yüklemeden bu yana
//     BILDIRIM_GECIKME_GUN gün geçmiş ve teslim edilmemiş.
// Veri: açılışta /api/shipments; Sevkiyatlar listesi her yüklendiğinde
// shipments.js bildirimGuncelle(allShipments) çağırır.
// Yardımcılar (durumGoster, gecikmeGunSayisi) js/shipments.js'ten gelir.

const BILDIRIM_GECIKME_GUN    = 15;
const BILDIRIM_BROKER_KDV_GUN = 7;

// Gümrük tarihinden itibaren gün sınırları (sınır aşılınca uyarı: gün > sınır)
const ULKE_TESLIM_SURELERI = {
  'KOSOVA':     { varis: 3,  teslim: 5 },
  'MAKEDONYA':  { varis: 3,  teslim: 5 },
  'SIRBİSTAN':  { varis: 3,  teslim: 5 },
  'GÜRCİSTAN':  { varis: 3,  teslim: 5 },
  'BOSNA':      { varis: 3,  teslim: 5 },
  'KAZAKİSTAN': { varis: 15, teslim: 18 },
};

let bildirimVeri = { varis: [], teslim: [], gecikenler: [], guncellenmemis: [] };

// Gruplu sevkiyatta (aynı sefer_id) iki kaydın verilen tarih alanlarından en
// yenisini döner; sayaç oradan başlar. Grupsuzsa kaydın kendi tarihleri.
function grupEnYeniTarih(s, list, alanlar) {
  const grup = s.sefer_id ? list.filter(x => x.sefer_id === s.sefer_id) : [s];
  let enYeni = null;
  grup.forEach(x => alanlar.forEach(alan => {
    const t = x[alan];
    if (t && (!enYeni || t > enYeni)) enYeni = t;
  }));
  return enYeni;
}

function bildirimHesapla(list) {
  const veri = { varis: [], teslim: [], gecikenler: [], guncellenmemis: [] };
  (list || []).forEach(s => {
    const durum = durumGoster(s, list);
    if (durum === 'TESLİM EDİLDİ') return;
    const yuklemeGun = gecikmeGunSayisi(grupEnYeniTarih(s, list, ['yukleme_tarihi']));
    // Gümrük sayacı: grubun en yeni gümrük/yükleme tarihinden başlar
    const gumrukGun  = gecikmeGunSayisi(grupEnYeniTarih(s, list, ['gumruk_tarihi', 'yukleme_tarihi']));
    const sure = ULKE_TESLIM_SURELERI[(s.ulke || '').toUpperCase()];

    const brokerKdvDolu = (parseFloat(s.brokerage_eur) || 0) > 0 && (parseFloat(s.kdv_eur) || 0) > 0;
    if (brokerKdvDolu && yuklemeGun !== null && yuklemeGun >= BILDIRIM_BROKER_KDV_GUN) {
      veri.guncellenmemis.push({ s, gun: yuklemeGun, durum, sinir: BILDIRIM_BROKER_KDV_GUN, baz: 'yükleme' });
      return;
    }

    if (sure) {
      if (gumrukGun === null) return;
      if (gumrukGun > sure.teslim) {
        veri.teslim.push({ s, gun: gumrukGun, durum, sinir: sure.teslim, baz: 'gümrük' });
      } else if (gumrukGun > sure.varis && (durum === 'Yüklenecek' || durum === 'YOLDA')) {
        veri.varis.push({ s, gun: gumrukGun, durum, sinir: sure.varis, baz: 'gümrük' });
      }
      return;
    }

    if (durum !== 'Yüklenecek' && yuklemeGun !== null && yuklemeGun >= BILDIRIM_GECIKME_GUN) {
      veri.gecikenler.push({ s, gun: yuklemeGun, durum, sinir: BILDIRIM_GECIKME_GUN, baz: 'yükleme' });
    }
  });
  Object.values(veri).forEach(arr => arr.sort((a, b) => (b.gun - b.sinir) - (a.gun - a.sinir)));
  return veri;
}

function bildirimGuncelle(list) {
  bildirimVeri = bildirimHesapla(list);
  const toplam = Object.values(bildirimVeri).reduce((t, arr) => t + arr.length, 0);
  const badge = document.getElementById('bildirim-badge');
  const btn   = document.getElementById('bildirim-btn');
  if (!badge || !btn) return;
  badge.textContent = toplam > 99 ? '+99' : `+${toplam}`;
  badge.style.display = toplam ? '' : 'none';
  btn.title = toplam ? `${toplam} sevkiyat dikkat gerektiriyor` : 'Bildirim yok';
  if (document.getElementById('bildirim-panel')?.classList.contains('open')) bildirimPanelCiz();
}

// Panel kategorileri (görünüm sırası)
const BILDIRIM_KATEGORI = [
  { key: 'teslim',         baslik: 'Teslim edilmedi',       kisa: 'Teslim' },
  { key: 'varis',          baslik: 'Varış gümrüğe geçmedi', kisa: 'Varış' },
  { key: 'guncellenmemis', baslik: 'Durum güncellenmemiş',  kisa: 'Durum' },
  { key: 'gecikenler',     baslik: 'Gecikenler',            kisa: 'Diğer' },
];

let bildirimSekme = 'tumu';

function bildirimSatir({ s, gun, durum, sinir, baz }) {
  const ulke = (s.ulke || '').charAt(0) + (s.ulke || '').slice(1).toLocaleLowerCase('tr-TR');
  const durumAd = durum === 'YOLDA' ? 'Yolda' : durum;
  const asim = gun - sinir;
  return `
    <button type="button" class="bn-row" onclick="bildirimAc(${s.id})"
      title="${baz === 'gümrük' ? 'Gümrükten' : 'Yüklemeden'} ${gun} gün geçti (sınır ${sinir})">
      <b>${s.ihracat_dosya_no || '—'}</b>
      <span class="bn-ulke">${ulke}</span>
      <span class="bn-durum">${durumAd}</span>
      <span class="bn-gun">${asim > 0 ? `+${asim}` : gun} gün</span>
    </button>`;
}

function bildirimSekmeSec(key, e) {
  e?.stopPropagation();
  bildirimSekme = key;
  bildirimPanelCiz();
}

function bildirimPanelCiz() {
  const panel = document.getElementById('bildirim-panel');
  if (!panel) return;
  const doluKat = BILDIRIM_KATEGORI.filter(k => bildirimVeri[k.key].length);
  const toplam = doluKat.reduce((t, k) => t + bildirimVeri[k.key].length, 0);
  if (bildirimSekme !== 'tumu' && !bildirimVeri[bildirimSekme]?.length) bildirimSekme = 'tumu';

  const sekme = (key, ad, sayi) =>
    `<button type="button" class="${bildirimSekme === key ? 'on' : ''}" onclick="bildirimSekmeSec('${key}', event)">${ad} <em>${sayi}</em></button>`;
  const sekmeler = doluKat.length > 1
    ? `<div class="bn-tabs">${sekme('tumu', 'Tümü', toplam)}${doluKat.map(k => sekme(k.key, k.kisa, bildirimVeri[k.key].length)).join('')}</div>`
    : '';

  const gorunen = bildirimSekme === 'tumu' ? doluKat : doluKat.filter(k => k.key === bildirimSekme);
  const liste = gorunen.map(k => `
    <div class="bn-section">
      ${bildirimSekme === 'tumu' ? `<div class="bn-section-head">${k.baslik}</div>` : ''}
      ${bildirimVeri[k.key].map(bildirimSatir).join('')}
    </div>`).join('');

  panel.innerHTML = `
    <div class="bn-head">Bildirimler</div>
    ${sekmeler}
    <div class="bn-list">${liste || '<div class="bn-empty">Bildirim yok</div>'}</div>`;
}

function toggleBildirimPanel(e) {
  e?.stopPropagation();
  const panel = document.getElementById('bildirim-panel');
  if (!panel) return;
  const acik = panel.classList.toggle('open');
  if (acik) bildirimPanelCiz();
}

function bildirimAc(id) {
  document.getElementById('bildirim-panel')?.classList.remove('open');
  if (typeof sidebarSelect === 'function') sidebarSelect('sevkiyatlar');
  if (id != null && typeof openShipmentDetail === 'function') openShipmentDetail(id);
}

document.addEventListener('click', e => {
  if (!e.target.closest('#bildirim-wrap')) {
    document.getElementById('bildirim-panel')?.classList.remove('open');
  }
});

// Açılışta bir kez yükle (Sevkiyatlar'a girilmese de zil dolsun)
document.addEventListener('DOMContentLoaded', async () => {
  if (window.authReadyPromise) await window.authReadyPromise;
  if (!window.currentUser) return;
  try {
    const headers = typeof getAuthHeaders === 'function' ? getAuthHeaders() : {};
    const res  = await fetch('/api/shipments', { headers });
    const data = await res.json();
    if (data.success) bildirimGuncelle(data.shipments);
  } catch (err) {
    console.warn('Bildirimler yüklenemedi', err);
  }
});
