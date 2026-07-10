// js/utils.js
// Ortak yardımcı fonksiyonlar — diğer tüm js/*.js dosyalarından önce yüklenir.

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
