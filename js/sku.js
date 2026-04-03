// ── İSTİSNA SKU YÖNETİMİ ─────────────────────────────────────────────────────
// Bazı SKU'ların AG sütununda yanlış veya 0 kilo olabilir.
// Bu SKU'lar için sabit kilo değeri tanımlanır — AG ne olursa olsun bu kilo kullanılır.
// Örnek: ambalaj malzemeleri her zaman 0.01 kg olmalı.

// İstisna SKU listesini ekranda gösterir
function renderExSkuList() {
  const container = document.getElementById('exSkuList');
  if (!container) return;

  // Listeyi alfabetik sırala (Türkçe karakterlere duyarlı)
  const entries = Object.entries(exceptionSkus)
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'tr'));

  if (!entries.length) {
    container.innerHTML = '<div style="color:var(--muted);font-family:DM Mono,monospace;font-size:12px;">Henüz istisna SKU yok.</div>';
    return;
  }

  // Her SKU için bir satır oluştur: SKU adı | kilo | sil butonu
  container.innerHTML = entries.map(([sku, kg]) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border-bottom:1px solid #1f1f1f;font-family:'DM Mono',monospace;font-size:12px;">
      <span style="color:var(--text);">${sku}</span>
      <span style="color:var(--accent);">${parseNum(kg)} kg</span>
      <button
        onclick="removeExceptionSku('${sku.replace(/'/g, "\\'")}')"
        style="background:none;border:none;color:var(--error);cursor:pointer;font-size:14px;padding:0 4px;">✕</button>
    </div>`
  ).join('');
}

// "Ekle" butonuna basılınca çalışır — yeni istisna SKU ekler
function addExceptionSku() {
  const sku = document.getElementById('newExSku').value.trim(); // SKU kodunu al
  const kg  = parseNum(document.getElementById('newExKg').value); // kilo değerini al

  if (!sku || !kg || kg <= 0) {
    alert('SKU ve geçerli bir kilo girin.');
    return;
  }

  exceptionSkus[sku] = kg; // state'e ekle

  // localStorage'a kaydet → sayfa yenilenince kaybolmaz
  try { localStorage.setItem('exSkus', JSON.stringify(exceptionSkus)); } catch(e) {}

  // Giriş alanlarını temizle
  document.getElementById('newExSku').value = '';
  document.getElementById('newExKg').value  = '';

  renderExSkuList(); // listeyi güncelle
}

// "✕" butonuna basılınca çalışır — SKU'yu listeden siler
function removeExceptionSku(sku) {
  if (!confirm(`"${sku}" silinsin mi?`)) return; // onay iste

  delete exceptionSkus[sku]; // state'den sil

  // localStorage'ı güncelle
  try { localStorage.setItem('exSkus', JSON.stringify(exceptionSkus)); } catch(e) {}

  renderExSkuList(); // listeyi güncelle
}
