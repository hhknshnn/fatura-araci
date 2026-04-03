// ── STATE ────────────────────────────────────────────────────────────────────
// "State" = uygulamanın o anki durumu. Hangi ülke seçili, hangi dosya yüklü,
// hesaplamalar yapıldı mı gibi bilgileri bu değişkenlerde tutarız.

let currentCountry = 'kz';    // şu an seçili ülke kodu (varsayılan: Kazakistan)
let currentMode = 'grouped';  // Kazakistan için gruplandırma modu
let lastFileData = null;       // en son yüklenen Excel dosyasının ham verisi
let originalFileName = '';     // indirilen dosyaya isim vermek için orijinal dosya adı

let processedWB = null;        // işlenmiş Excel çalışma kitabı (indirmeye hazır)
let masterRows = null;         // yüklenen master Excel'in tüm satırları (ham)
let workingRows = null;        // BRÜT/NET hesabı yapılmış satırlar (işlenmiş)

let groupWeights = {};         // {grup adı: kg} — her ürün ara grubu için birim kilo
let exceptionSkus = {};        // {SKU: kg} — AG ne olursa olsun sabit kilo kullanan SKU'lar

// ── CONFIG ────────────────────────────────────────────────────────────────────
// Sayfa açılınca config.json dosyasını okur.
// config.json'da varsayılan istisna SKU'lar ve grup kiloları tanımlıdır.
// "async" = bu fonksiyon internet isteği yaptığı için beklemek zorunda kalır.
async function loadSharedConfig() {
  try {
    // config.json'ı tarayıcı önbelleğini atlayarak her seferinde taze oku
    const res = await fetch('./config.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(); // dosya bulunamazsa hata fırlat
    const cfg = await res.json();   // JSON formatındaki metni JavaScript nesnesine çevir

    // config'de tanımlı varsayılan değerleri state'e yükle
    if (cfg.defaultGroupWeights)  groupWeights  = { ...cfg.defaultGroupWeights  };
    if (cfg.defaultExceptionSkus) exceptionSkus = { ...cfg.defaultExceptionSkus };
  } catch (e) {
    console.warn('config.json yüklenemedi'); // hata olursa konsola yaz, uygulamayı durdurma
  }
}

// ── NUMBER PARSING ────────────────────────────────────────────────────────────
// Excel'den gelen sayılar bazen "1.234,56" (Türkçe) veya "1234.56" (İngilizce)
// formatında olabilir. Bu fonksiyon her iki formatı da doğru okur.
function parseNum(v) {
  if (v === null || v === undefined) return 0;          // boş değer → 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0; // zaten sayıysa direkt döndür

  let s = String(v).trim()
    .replace(/\s|\u00A0/g, '')     // boşlukları ve görünmez karakterleri sil
    .replace(/[^0-9,.\-]/g, '');   // sadece rakam, virgül, nokta ve eksi bırak

  // Hem nokta hem virgül varsa → Türkçe format: nokta=binlik, virgül=ondalık
  if (s.includes('.') && s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.'); // "1.234,56" → "1234.56"
  } else if (s.includes(',')) {
    s = s.replace(',', '.'); // "1234,56" → "1234.56"
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0; // geçerli sayı değilse 0 döndür
}

// Sayıyı 2 ondalık basamağa yuvarlar (fiyat/tutar gösterimi için)
function round2(n) {
  return Math.round(parseNum(n) * 100) / 100;
}

// ── UI FONKSİYONLARI ──────────────────────────────────────────────────────────
// Kullanıcı arayüzünü güncelleyen küçük fonksiyonlar

// Ülke butonu seçilince çalışır
function setCountry(c) {
  currentCountry = c;

  // Tüm ülke butonlarından "active" sınıfını kaldır, sadece seçilene ekle
  ['kz','rs','iq','ge','cy','ru','ba','be'].forEach(k => {
    const el = document.getElementById('country-' + k);
    if (el) el.classList.toggle('active', k === c);
  });

  // Gruplandırma seçeneği sadece Kazakistan'da görünür
  document.getElementById('modeSection').style.display = c === 'kz' ? 'block' : 'none';

  // EUR kur kutusu sadece Belçika'da görünür
  document.getElementById('eurSection').style.display = c === 'be' ? 'block' : 'none';

  // Eğer daha önce kilo hesabı yapıldıysa, ülke değişince çıktıyı yeniden üret
  if (workingRows) buildAndDownloadReady();
}

// Gruplandırma modu değişince çalışır (sadece Kazakistan için)
function setMode(m) {
  currentMode = m;
  // Aktif butonu güncelle
  document.getElementById('modeGrouped').classList.toggle('active', m === 'grouped');
  document.getElementById('modeRaw').classList.toggle('active', m === 'raw');
  // Çıktıyı yeniden üret
  if (workingRows) buildAndDownloadReady();
}

// Durum mesajı kutusunu günceller
// type: 'success' (yeşil) veya 'error' (kırmızı)
function showStatus(type, html) {
  const sb = document.getElementById('statusBox');
  sb.className = 'status-box visible ' + type;
  sb.innerHTML = html;
}

// Kilo tablosunu aç/kapat
function toggleKgTable() {
  const body  = document.getElementById('kgTableBody');
  const arrow = document.getElementById('kgTableArrow');
  if (body.style.display === 'none') {
    body.style.display = 'block';
    arrow.textContent = '▲'; // yukarı ok = açık
  } else {
    body.style.display = 'none';
    arrow.textContent = '▼'; // aşağı ok = kapalı
  }
}

// AG dolu gruplar bölümünü aç/kapat
function toggleSavedKg() {
  const body  = document.getElementById('savedKgBody');
  const arrow = document.getElementById('savedKgArrow');
  if (body.style.display === 'none') {
    body.style.display = 'block'; arrow.textContent = '▲';
  } else {
    body.style.display = 'none'; arrow.textContent = '▼';
  }
}

// İstisna SKU bölümünü aç/kapat
function toggleExSku() {
  const body  = document.getElementById('exSkuBody');
  const arrow = document.getElementById('exSkuArrow');
  if (body.style.display === 'none') {
    body.style.display = 'block'; arrow.textContent = '▲';
  } else {
    body.style.display = 'none'; arrow.textContent = '▼';
  }
}

// EUR kur kutusu değişince Belçika çıktısını yenile
function onEurRateChanged() {
  if (currentCountry === 'be' && workingRows) buildAndDownloadReady();
}

// ── DOWNLOAD ──────────────────────────────────────────────────────────────────
// İndir butonuna basılınca çalışır
function downloadResult() {
  if (!processedWB) return; // işlenmiş dosya yoksa çık

  // Belçika seçiliyse kur girilmeden indirme yapılamaz
  if (currentCountry === 'be' && !getEurRate()) {
    showStatus('error', '⚠ Belçika için Euro kuru girin.');
    return;
  }

  // Dosya adını oluştur: orijinal ad + ülke son eki
  let suffix = COUNTRIES[currentCountry]?.suffix || ('_' + currentCountry);
  // Kazakistan'da gruplandırma moduna göre ek bilgi ekle
  if (currentCountry === 'kz') suffix += (currentMode === 'grouped' ? '_gruplu' : '_tum');

  // xlsx kütüphanesi ile Excel dosyasını indir
  XLSX.writeFile(processedWB, originalFileName + suffix + '.xlsx');
}

// ── INIT ──────────────────────────────────────────────────────────────────────
// Sayfa tamamen yüklenince bir kez çalışır
document.addEventListener('DOMContentLoaded', async () => {
  await loadSharedConfig(); // önce config.json'ı yükle

  // localStorage'dan kişisel kayıtları yükle ve config üzerine ekle
  // (kullanıcı daha önce SKU veya grup kilosu eklemiş olabilir)
  try {
    const s = localStorage.getItem('exSkus');
    if (s) {
      const local = JSON.parse(s);
      exceptionSkus = { ...exceptionSkus, ...local }; // config + kişisel birleşir
    }
  } catch(e) {}

  try {
    const s = localStorage.getItem('gwData');
    if (s) {
      const local = JSON.parse(s);
      groupWeights = { ...groupWeights, ...local }; // config + kişisel birleşir
    }
  } catch(e) {}

  renderExSkuList(); // istisna SKU listesini ekranda göster
});
