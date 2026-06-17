// js/dashboard.js
// Dashboard sayfası — animasyonlu KPI kartları, bar chart, donut, hbar, son sevkiyatlar

// ── SAYI ANIMASYONU ───────────────────────────────────────────────────────────
function animateCount(el, target, formatter) {
  if (!el) return;
  const duration = 1200;
  const startTime = performance.now();
  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased    = 1 - Math.pow(1 - progress, 3);
    el.textContent = formatter(Math.round(eased * target));
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ── EUR FORMATLAMA ────────────────────────────────────────────────────────────
function formatEur(val) {
  if (!val && val !== 0) return '-';
  if (val >= 1000000) return (val / 1000000).toFixed(2).replace('.', ',') + 'M €';
  if (val >= 1000)    return (val / 1000).toFixed(0) + 'K €';
  return val.toFixed(0) + ' €';
}

// ── BAR CHART ─────────────────────────────────────────────────────────────────
function renderBarChart(container, monthCounts) {
  const aylar  = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
  const max    = Math.max(...monthCounts, 1);
  const maxH   = 110; // piksel — barın max yüksekliği

  container.innerHTML = '';
  container.style.cssText = 'display:flex;align-items:flex-end;gap:6px;height:140px;padding-top:20px;';

  monthCounts.forEach((count, i) => {
    const barH  = count > 0 ? Math.max(Math.round((count / max) * maxH), 6) : 4;
    const isCur = i === new Date().getMonth();
    const col   = document.createElement('div');
    col.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;';

    // Değer etiketi — barın üstünde sabit alanda, her zaman görünür
    const valEl = document.createElement('div');
    valEl.style.cssText = 'font-size:10px;font-weight:600;color:#475569;height:14px;display:flex;align-items:center;justify-content:center;';
    valEl.textContent = count > 0 ? count : '';

    // Bar
    const bar = document.createElement('div');
    bar.style.cssText = [
      'width:100%',
      'border-radius:5px 5px 0 0',
      `height:${barH}px`,
      `background:${count > 0 ? (isCur ? '#2563EB' : '#93C5FD') : '#E2E8F0'}`,
      'transform:scaleY(0)',
      'transform-origin:bottom',
      `transition:transform 0.7s cubic-bezier(0.4,0,0.2,1) ${i * 0.05}s, opacity 0.2s`,
      'opacity:0.85',
      'cursor:default',
    ].join(';');

    bar.addEventListener('mouseenter', () => { bar.style.opacity = '1'; bar.style.transform = 'scaleY(1.04)'; });
    bar.addEventListener('mouseleave', () => { bar.style.opacity = '0.85'; bar.style.transform = 'scaleY(1)'; });

    // Ay etiketi
    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:10px;color:#94A3B8;';
    lbl.textContent = aylar[i];

    col.appendChild(valEl);
    col.appendChild(bar);
    col.appendChild(lbl);
    container.appendChild(col);

    // Animasyon — kısa gecikme sonrası
    setTimeout(() => {
      bar.style.transform = 'scaleY(1)';
    }, 100 + i * 50);
  });
}

// ── DONUT CHART ───────────────────────────────────────────────────────────────
function renderDonut(container, teslim, yolda, diger) {
  const total = teslim + yolda + diger || 1;
  const circ  = 239;
  const tDash = (teslim / total) * circ;
  const yDash = (yolda  / total) * circ;

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;">
      <div style="position:relative;flex-shrink:0;">
        <svg width="110" height="110" viewBox="0 0 110 110">
          <circle cx="55" cy="55" r="38" fill="none" stroke="#F1F5F9" stroke-width="14"/>
          <circle id="dash-donut-green" cx="55" cy="55" r="38" fill="none" stroke="#22C55E" stroke-width="14"
            stroke-dasharray="0 ${circ}" stroke-linecap="round" transform="rotate(-90 55 55)"
            style="transition:stroke-dasharray 1.2s cubic-bezier(0.4,0,0.2,1);"/>
          <circle id="dash-donut-amber" cx="55" cy="55" r="38" fill="none" stroke="#F59E0B" stroke-width="14"
            stroke-dasharray="0 ${circ}" stroke-linecap="round" transform="rotate(-90 55 55)"
            style="transition:stroke-dasharray 1.2s cubic-bezier(0.4,0,0.2,1) 0.1s, stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1) 0.1s;"/>
        </svg>
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;">
          <div style="font-size:20px;font-weight:700;color:#0F172A;line-height:1;" id="dash-donut-num">${teslim}</div>
          <div style="font-size:9px;color:#94A3B8;margin-top:2px;">teslim</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;flex:1;">
        ${_legItem('#22C55E', 'Teslim edildi', teslim, total)}
        ${_legItem('#F59E0B', 'Yolda',         yolda,  total)}
        ${_legItem('#E2E8F0', 'Diğer',         diger,  total, '#94A3B8')}
      </div>
    </div>`;

  // Animasyon
  setTimeout(() => {
    const g = document.getElementById('dash-donut-green');
    const a = document.getElementById('dash-donut-amber');
    if (g) g.setAttribute('stroke-dasharray', `${tDash} ${circ}`);
    if (a) {
      a.setAttribute('stroke-dasharray',  `${yDash} ${circ}`);
      a.setAttribute('stroke-dashoffset', -tDash);
    }
    // Legend bar animasyonu
    container.querySelectorAll('.dash-leg-fill').forEach(el => {
      el.style.width = el.dataset.w + '%';
    });
  }, 400);
}

function _legItem(color, label, count, total, textColor) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return `
    <div style="display:flex;align-items:center;gap:8px;">
      <div style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></div>
      <div style="font-size:11.5px;color:#475569;flex:1;">${label}</div>
      <div style="flex:2;height:4px;background:#F1F5F9;border-radius:2px;overflow:hidden;">
        <div class="dash-leg-fill" data-w="${pct}"
          style="height:100%;border-radius:2px;background:${color};width:0;transition:width 1s cubic-bezier(0.4,0,0.2,1) 0.5s;"></div>
      </div>
      <div style="font-size:12px;font-weight:600;color:${textColor || '#0F172A'};min-width:20px;text-align:right;">${count}</div>
    </div>`;
}

// ── HORIZONTAL BAR ────────────────────────────────────────────────────────────
function renderHbar(container, ulkeler) {
  if (!ulkeler || !ulkeler.length) { container.innerHTML = '<div style="color:#94A3B8;font-size:12px;padding:8px 0;">Veri yok</div>'; return; }
  const max = ulkeler[0].sayi || 1;
  const colors = ['#2563EB','#8B5CF6','#22C55E','#F59E0B','#EF4444','#06B6D4','#EC4899','#F97316'];

  container.innerHTML = ulkeler.slice(0, 7).map((u, i) => {
    const pct = Math.round((u.sayi / max) * 100);
    return `
      <div style="display:flex;flex-direction:column;gap:3px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:12px;color:#475569;font-weight:500;">${u.ulke}</span>
          <span style="font-size:11px;color:#94A3B8;">${u.sayi}</span>
        </div>
        <div style="height:6px;background:#F1F5F9;border-radius:3px;overflow:hidden;">
          <div class="dash-hbar-fill" data-w="${pct}"
            style="height:100%;border-radius:3px;background:${colors[i % colors.length]};width:0;transition:width 1.2s cubic-bezier(0.4,0,0.2,1) ${0.1 + i * 0.08}s;"></div>
        </div>
      </div>`;
  }).join('');

  setTimeout(() => {
    container.querySelectorAll('.dash-hbar-fill').forEach(el => {
      el.style.width = el.dataset.w + '%';
    });
  }, 300);
}

// ── SON SEVKİYATLAR ───────────────────────────────────────────────────────────
function renderSonSevkiyatlar(container, shipments) {
  if (!shipments || !shipments.length) {
    container.innerHTML = '<div style="color:#94A3B8;font-size:12px;padding:8px 0;">Veri yok</div>';
    return;
  }

  const durumStyle = (d) => {
    const n = (d || '').toUpperCase();
    if (n.includes('TESLİM') || n.includes('TESLIM')) return 'background:#F0FDF4;color:#16A34A;';
    if (n === 'YOLDA') return 'background:#FFFBEB;color:#B45309;';
    return 'background:#EFF6FF;color:#1D4ED8;';
  };

  const durumLabel = (d) => {
    const n = (d || '').toUpperCase();
    if (n.includes('TESLİM') || n.includes('TESLIM')) return 'Teslim';
    if (n === 'YOLDA') return 'Yolda';
    return d;
  };

  container.innerHTML = shipments.slice(0, 6).map((s, i) => `
    <div onclick="sidebarSelect('sevkiyatlar')"
      style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:10px;
             border:0.5px solid rgba(0,0,0,0.07);background:#FAFAFA;
             transition:background 0.15s,border-color 0.15s,transform 0.15s;
             cursor:pointer;margin-bottom:6px;
             animation:dashFadeIn 0.3s ease both;animation-delay:${0.3 + i * 0.06}s;opacity:0;"
      onmouseenter="this.style.background='#EFF6FF';this.style.borderColor='#BFDBFE';this.style.transform='translateX(3px)'"
      onmouseleave="this.style.background='#FAFAFA';this.style.borderColor='rgba(0,0,0,0.07)';this.style.transform='translateX(0)'">
      <div style="font-size:12px;font-weight:600;color:#0F172A;min-width:72px;">${s.ihracat_dosya_no || '-'}</div>
      <div style="font-size:11px;color:#94A3B8;flex:1;">${s.ulke || '-'}</div>
      <span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px;${durumStyle(s.durum)}">${durumLabel(s.durum)}</span>
      <div style="font-size:12px;font-weight:500;color:#475569;min-width:72px;text-align:right;">${formatEur(s.fatura_bedeli_eur)}</div>
    </div>`).join('');
}

// ── ANA FONKSİYON ─────────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const token = sessionStorage.getItem('fa_auth_token');

    // İstatistikler
    const statsRes = await fetch('/api/shipments?mode=dashboard', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const statsData = await statsRes.json();

    // Son sevkiyatlar
    const listRes = await fetch('/api/shipments', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const listData = await listRes.json();

    if (!statsData.success) return;
    const s   = statsData.stats;
    const all = listData.success ? listData.shipments : [];

    // ── KPI Kartları ─────────────────────────────────────────────────────────
    const kv1 = document.getElementById('dash-kv1');
    const kv2 = document.getElementById('dash-kv2');
    const kv3 = document.getElementById('dash-kv3');
    const kv4 = document.getElementById('dash-kv4');

    animateCount(kv1, s.sefer_sayisi ?? s.toplam, n => n.toLocaleString('tr-TR'));
    animateCount(kv2, s.yolda,  n => n.toLocaleString('tr-TR'));
    animateCount(kv3, s.teslim, n => n.toLocaleString('tr-TR'));

    // EUR sayacı
    if (kv4) {
      const target = s.toplam_eur;
      const duration = 1200;
      const startTime = performance.now();
      function stepEur(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased    = 1 - Math.pow(1 - progress, 3);
        kv4.textContent = formatEur(eased * target);
        if (progress < 1) requestAnimationFrame(stepEur);
      }
      requestAnimationFrame(stepEur);
    }

    // ── Aylık Trend ──────────────────────────────────────────────────────────
    const monthCounts = Array(12).fill(0);
    all.forEach(item => {
      if (!item.yukleme_tarihi) return;
      const m = new Date(item.yukleme_tarihi).getMonth();
      if (m >= 0 && m <= 11) monthCounts[m]++;
    });

    const barContainer = document.getElementById('dash-bar-chart');
    if (barContainer) renderBarChart(barContainer, monthCounts);

    // ── Donut ────────────────────────────────────────────────────────────────
    const teslim = s.teslim || 0;
    const yolda  = s.yolda  || 0;
    const diger  = (s.toplam || 0) - teslim - yolda;
    const donutContainer = document.getElementById('dash-donut');
    if (donutContainer) renderDonut(donutContainer, teslim, yolda, Math.max(diger, 0));

    // ── Horizontal Bar ───────────────────────────────────────────────────────
    const hbarContainer = document.getElementById('dash-hbar');
    if (hbarContainer) renderHbar(hbarContainer, s.ulkeler || []);

    // ── Son Sevkiyatlar ──────────────────────────────────────────────────────
    const recentContainer = document.getElementById('dash-recent');
    if (recentContainer) renderSonSevkiyatlar(recentContainer, all);

  } catch (e) {
    console.error('Dashboard yüklenemedi:', e);
  }
}
