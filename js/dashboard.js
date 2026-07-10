// js/dashboard.js
// Dashboard sayfası — animasyonlu KPI kartları, trend, maliyet özeti, hbar, son sevkiyatlar

// ── SAYI ANIMASYONU ───────────────────────────────────────────────────────────
function animateCount(el, target, formatter) {
  if (!el) return;
  const duration = 1200;
  const startTime = performance.now();
  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = formatter(Math.round(eased * target));
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ── EUR FORMATLAMA ────────────────────────────────────────────────────────────
function formatEur(val) {
  if (!val && val !== 0) return '-';
  if (val >= 1000000) return (val / 1000000).toFixed(2).replace('.', ',') + 'M €';
  if (val >= 1000) return (val / 1000).toFixed(0) + 'K €';
  return val.toFixed(0) + ' €';
}

function openShipmentsFromDashboard(filter = {}) {
  window.pendingDashboardShipmentFilter = filter;
  sidebarSelect('sevkiyatlar');
}

// ── BAR CHART ─────────────────────────────────────────────────────────────────
function renderBarChart(container, monthCounts) {
  const aylar = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const max = Math.max(...monthCounts, 1);
  const maxH = 110; // piksel — barın max yüksekliği

  container.innerHTML = '';
  container.style.cssText = 'display:flex;align-items:flex-end;gap:6px;height:140px;padding-top:20px;';

  monthCounts.forEach((count, i) => {
    const barH = count > 0 ? Math.max(Math.round((count / max) * maxH), 6) : 4;
    const isCur = i === new Date().getMonth();
    const col = document.createElement('div');
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

// ── MALİYET ÖZETİ ────────────────────────────────────────────────────────────
function renderCostSummary(container, shipments) {
  const kurumsalUlkeler = new Set([
    'SIRBİSTAN', 'BOSNA', 'GÜRCİSTAN', 'KOSOVA', 'MAKEDONYA',
    'BELÇİKA', 'ALMANYA', 'HOLLANDA', 'KAZAKİSTAN',
  ]);
  const all = (shipments || []).filter(s => {
    const tip = (s.musteri_tipi || '').toString().trim().toLowerCase();
    const ulke = (s.ulke || '').toString().trim().toUpperCase();
    return tip === 'kurumsal' || (!tip && kurumsalUlkeler.has(ulke));
  });

  const calcCost = list => {
    const sum = key => list.reduce((total, s) => total + (parseFloat(s[key]) || 0), 0);
    const fatura = sum('fatura_bedeli_eur');
    const navlun = sum('navlun_eur');
    const sigorta = sum('sigorta_eur');
    const gumruk = sum('gumruk_vergisi_eur');
    const operasyon = sum('ihracat_beyanname_eur') + sum('arac_bekleme') + sum('brokerage_eur');
    const maliyet = operasyon + navlun + gumruk + sigorta;
    return { fatura, navlun, sigorta, gumruk, operasyon, maliyet };
  };

  const { fatura, navlun, sigorta, gumruk, operasyon, maliyet } = calcCost(all);
  const oran = fatura > 0 ? Math.round((maliyet / fatura) * 100) : 0;
  const kalemler = [
    { label: 'Operasyon', value: operasyon, color: '#2563EB' },
    { label: 'Navlun', value: navlun, color: '#F59E0B' },
    { label: 'Vergi', value: gumruk, color: '#EF4444' },
    { label: 'Sigorta', value: sigorta, color: '#06B6D4' },
  ].filter(k => k.value > 0);
  const max = Math.max(...kalemler.map(k => k.value), 1);
  const byCountry = {};
  all.forEach(s => {
    const ulke = s.ulke || 'Belirsiz';
    if (!byCountry[ulke]) byCountry[ulke] = [];
    byCountry[ulke].push(s);
  });
  const countryRows = Object.entries(byCountry)
    .map(([ulke, list]) => {
      const c = calcCost(list);
      return {
        ulke,
        maliyet: c.maliyet,
        oran: c.fatura > 0 ? Math.round((c.maliyet / c.fatura) * 100) : 0,
      };
    })
    .sort((a, b) => b.maliyet - a.maliyet);

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
      <div style="background:#F8FAFC;border:0.5px solid #E2E8F0;border-radius:10px;padding:12px;">
        <div style="font-size:10.5px;color:#64748B;margin-bottom:6px;">Toplam maliyet</div>
        <div style="font-size:22px;font-weight:700;color:#0F172A;line-height:1;">${formatEur(maliyet)}</div>
      </div>
      <div style="background:#FFF7ED;border:0.5px solid #FED7AA;border-radius:10px;padding:12px;">
        <div style="font-size:10.5px;color:#9A3412;margin-bottom:6px;">Maliyet / fatura</div>
        <div style="font-size:22px;font-weight:700;color:#C2410C;line-height:1;">%${oran}</div>
      </div>
    </div>

    <div style="height:9px;background:#F1F5F9;border-radius:999px;overflow:hidden;margin-bottom:12px;display:flex;">
      ${kalemler.map(k => {
        const width = maliyet > 0 ? Math.max((k.value / maliyet) * 100, 3) : 0;
        return `<div title="${k.label}" style="width:${width}%;background:${k.color};"></div>`;
      }).join('')}
    </div>

    ${kalemler.length ? kalemler.map((k, i) => {
      const pct = Math.round((k.value / max) * 100);
      return `
        <div style="margin-bottom:9px;animation:dashFadeIn 0.3s ease both;animation-delay:${0.22 + i * 0.06}s;opacity:0;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
            <span style="font-size:11.5px;color:#475569;font-weight:500;">${k.label}</span>
            <span style="font-size:11px;color:#64748B;font-weight:600;">${formatEur(k.value)}</span>
          </div>
          <div style="height:6px;background:#F1F5F9;border-radius:999px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${k.color};border-radius:999px;"></div>
          </div>
        </div>`;
    }).join('') : `
      <div style="color:#94A3B8;font-size:12px;padding:14px 0;text-align:center;border:0.5px dashed #E2E8F0;border-radius:10px;">
        Maliyet kalemi yok
      </div>`}

    <div style="font-size:11px;font-weight:600;color:#475569;margin:12px 0 7px;">Ülke bazında</div>
    ${countryRows.length ? countryRows.map((c, i) => `
      <div style="
        display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center;
        padding:6px 0;border-top:${i === 0 ? '0' : '0.5px solid #EEF2F7'};
        animation:dashFadeIn 0.3s ease both;animation-delay:${0.38 + i * 0.04}s;opacity:0;">
        <div style="font-size:11.5px;color:#475569;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.ulke}</div>
        <div style="font-size:11px;color:#0F172A;font-weight:700;">${formatEur(c.maliyet)}</div>
        <div style="font-size:10.5px;color:#64748B;font-weight:600;min-width:34px;text-align:right;">%${c.oran}</div>
      </div>
    `).join('') : `
      <div style="color:#94A3B8;font-size:12px;padding:10px 0;">Kurumsal ülke kaydı yok</div>
    `}
  `;
}

// ── HORIZONTAL BAR ────────────────────────────────────────────────────────────
function renderHbar(container, ulkeler) {
  if (!ulkeler || !ulkeler.length) { container.innerHTML = '<div style="color:#94A3B8;font-size:12px;padding:8px 0;">Veri yok</div>'; return; }
  const max = ulkeler[0].sayi || 1;
  const colors = ['#2563EB', '#8B5CF6', '#22C55E', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899', '#F97316'];

  container.innerHTML = ulkeler.slice(0, 7).map((u, i) => {
    const pct = Math.round((u.sayi / max) * 100);
    return `
      <div style="display:flex;flex-direction:column;gap:3px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:12px;color:#475569;font-weight:500;">${escapeHtml(u.ulke)}</span>
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
      <div style="font-size:12px;font-weight:600;color:#0F172A;min-width:72px;">${escapeHtml(s.ihracat_dosya_no) || '-'}</div>
      <div style="font-size:11px;color:#94A3B8;flex:1;">${escapeHtml(s.ulke) || '-'}</div>
      <span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px;${durumStyle(s.durum)}">${escapeHtml(durumLabel(s.durum))}</span>
      <div style="font-size:12px;font-weight:500;color:#475569;min-width:72px;text-align:right;">${formatEur(s.fatura_bedeli_eur)}</div>
    </div>`).join('');
}

// ── ANA FONKSİYON ─────────────────────────────────────────────────────────────
async function loadDashboard() {
  if (!window.currentUser) return;
  try {
    const authHeaders = typeof getAuthHeaders === 'function' ? getAuthHeaders() : {};

    // İstatistikler
    const statsRes = await fetch('/api/shipments?mode=dashboard', {
      headers: authHeaders
    });
    const statsData = await statsRes.json();

    // Son sevkiyatlar
    const listRes = await fetch('/api/shipments', {
      headers: authHeaders
    });
    const listData = await listRes.json();

    if (!statsData.success) return;
    const s = statsData.stats;
    const all = listData.success ? listData.shipments : [];

    // ── KPI Kartları ─────────────────────────────────────────────────────────
    const kv1 = document.getElementById('dash-kv1');
    const kv2 = document.getElementById('dash-kv2');
    const kv3 = document.getElementById('dash-kv3');
    const kv4 = document.getElementById('dash-kv4');
    const kv5 = document.getElementById('dash-kv5');

    animateCount(kv1, s.sefer_sayisi ?? s.toplam, n => n.toLocaleString('tr-TR'));
    animateCount(kv2, s.yolda, n => n.toLocaleString('tr-TR'));
    animateCount(kv3, s.teslim, n => n.toLocaleString('tr-TR'));
    animateCount(kv4, s.varis_gumruk ?? 0, n => n.toLocaleString('tr-TR'));

    // EUR sayacı
    if (kv5) {
      const target = s.toplam_eur;
      const duration = 1200;
      const startTime = performance.now();
      function stepEur(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        kv5.textContent = formatEur(eased * target);
        if (progress < 1) requestAnimationFrame(stepEur);
      }
      requestAnimationFrame(stepEur);
    }

    // ── Sefer Bilgi Şeridi ───────────────────────────────────────────────────
    let seritEl = document.getElementById('dash-serit');
    if (!seritEl) {
      seritEl = document.createElement('div');
      seritEl.id = 'dash-serit';
      seritEl.style.cssText = `
        display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;
        animation:dashFadeIn 0.4s ease both;animation-delay:0.25s;opacity:0;
      `;
      const barChart = document.getElementById('dash-bar-chart');
      barChart?.closest('.dash-card')?.parentNode?.insertBefore(seritEl, barChart?.closest('.dash-card'));
    }

    const seritItems = [
      {
        icon: '📄',
        label: 'Toplam Fatura',
        value: s.toplam_fatura ?? s.toplam,
        color: '#2563EB',
        bg: '#EFF6FF',
        filter: {},
      },
      {
        icon: '🚛',
        label: 'Tek Araç Sefer',
        value: s.tek_arac,
        color: '#16A34A',
        bg: '#F0FDF4',
        filter: { seferTipi: 'tek' },
      },
      {
        icon: '🔗',
        label: 'Gruplu Sefer',
        value: s.gruplu_sefer,
        color: '#4338CA',
        bg: '#EEF2FF',
        filter: { seferTipi: 'gruplu' },
      },
      {
        icon: '📦',
        label: 'Gruplu Fatura',
        value: s.gruplu_fatura,
        color: '#B45309',
        bg: '#FFFBEB',
        filter: { seferTipi: 'gruplu' },
      },
    ];

    seritEl.innerHTML = seritItems.map((item, i) => `
      <div onclick='openShipmentsFromDashboard(${JSON.stringify(item.filter)})' style="
        flex:1;min-width:140px;
        background:${item.bg};
        border:0.5px solid ${item.color}22;
        border-radius:12px;
        padding:14px 16px;
        display:flex;align-items:center;gap:12px;
        animation:dashCardIn 0.4s ease both;
        animation-delay:${0.1 + i * 0.07}s;
        transition:transform 0.2s,box-shadow 0.2s,border-color 0.2s;
        cursor:pointer;
      "
      onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(0,0,0,0.08)';this.style.borderColor='${item.color}55';"
      onmouseleave="this.style.transform='translateY(0)';this.style.boxShadow='none';this.style.borderColor='${item.color}22';">
        <div style="font-size:22px;line-height:1;">${item.icon}</div>
        <div>
          <div style="font-size:11px;color:${item.color};font-weight:500;margin-bottom:3px;">${item.label}</div>
          <div class="dash-serit-val" data-target="${item.value ?? 0}"
            style="font-size:22px;font-weight:700;color:${item.color};line-height:1;">0</div>
        </div>
      </div>`).join('');

    // Sayı animasyonu
    setTimeout(() => {
      seritEl.querySelectorAll('.dash-serit-val').forEach(el => {
        const target = parseInt(el.dataset.target) || 0;
        animateCount(el, target, n => n.toLocaleString('tr-TR'));
      });
    }, 200);

    // ── Aylık Trend — sefer bazlı (grupluları MIN id ile 1 say) ──────────────
    const monthCounts = Array(12).fill(0);
    const grupTemsilci = {};
    const tekSeferler  = [];

    all.forEach(item => {
      if (!item.sefer_id) {
        tekSeferler.push(item);
      } else {
        const mevcut = grupTemsilci[item.sefer_id];
        if (!mevcut || item.id < mevcut.id) {
          grupTemsilci[item.sefer_id] = item;
        }
      }
    });

    const sayilacaklar = [...tekSeferler, ...Object.values(grupTemsilci)];
    sayilacaklar.forEach(item => {
      if (!item.yukleme_tarihi) return;
      const m = new Date(item.yukleme_tarihi).getMonth();
      if (m >= 0 && m <= 11) monthCounts[m]++;
    });

    const barContainer = document.getElementById('dash-bar-chart');
    if (barContainer) renderBarChart(barContainer, monthCounts);

    // ── Maliyet özeti ───────────────────────────────────────────────────────
    const costContainer = document.getElementById('dash-cost-summary');
    if (costContainer) renderCostSummary(costContainer, all);

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
