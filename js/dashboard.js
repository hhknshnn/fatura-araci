// js/dashboard.js
// Dashboard sayfası — sevkiyat istatistikleri ve özet

async function loadDashboard() {
  // Dashboard istatistiklerini API'den çek
  try {
    const token = sessionStorage.getItem('fa_auth_token');
    const res = await fetch('/api/shipments?mode=dashboard', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (!data.success) return;

    const s = data.stats;

    // Özet kartları güncelle
    document.getElementById('dash-toplam').textContent = s.toplam;
    document.getElementById('dash-yolda').textContent = s.yolda;
    document.getElementById('dash-teslim').textContent = s.teslim;
    document.getElementById('dash-eur').textContent = formatEur(s.toplam_eur);

    // Ülke bar chart
    renderUlkeChart(s.ulkeler);

  } catch (e) {
    console.error('Dashboard yüklenemedi:', e);
  }
}

function formatEur(val) {
  // EUR formatla — büyük sayılar için kısalt
  if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M €';
  if (val >= 1000) return (val / 1000).toFixed(0) + 'K €';
  return val.toFixed(0) + ' €';
}

function renderUlkeChart(ulkeler) {
  const container = document.getElementById('dash-ulke-chart');
  if (!container || !ulkeler.length) return;

  const max = ulkeler[0].sayi;
  const colors = ['#1a56db','#0e9f6e','#e3a008','#9061f9','#e02424','#057a55','#c27803','#6c2bd9'];

  container.innerHTML = ulkeler.map((u, i) => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <div style="font-size:12px;color:var(--color-text-secondary);width:80px;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${u.ulke}</div>
      <div style="flex:1;background:var(--color-background-secondary);border-radius:4px;height:8px;overflow:hidden;">
        <div style="width:${Math.round(u.sayi/max*100)}%;height:100%;background:${colors[i%colors.length]};border-radius:4px;"></div>
      </div>
      <div style="font-size:12px;color:var(--color-text-secondary);width:20px;">${u.sayi}</div>
    </div>
  `).join('');
}