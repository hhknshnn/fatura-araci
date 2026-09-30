// js/landed-cost.js
// Kurumsal ülkeler için KDV hariç landed cost analizi ve raporu

const LC_COUNTRIES = ['ALMANYA', 'BELÇİKA', 'BOSNA', 'GÜRCİSTAN', 'HOLLANDA', 'KAZAKİSTAN', 'KOSOVA', 'MAKEDONYA', 'SIRBİSTAN'];
let landedCostState = { data: null, pendingExpanded: false, pendingOpen: false, navlunYeni: null, senaryoDepo: 'all', view: 'ozet' };
const LC_COUNTRY_COLORS = {
  'ALMANYA': '#2563EB',
  'BELÇİKA': '#F59E0B',
  'BOSNA': '#16A34A',
  'GÜRCİSTAN': '#DC2626',
  'HOLLANDA': '#EA580C',
  'KAZAKİSTAN': '#0891B2',
  'KOSOVA': '#7C3AED',
  'MAKEDONYA': '#E11D48',
  'SIRBİSTAN': '#0F766E',
};
const LC_KOD_ULKE = {
  rs: 'SIRBİSTAN', ba: 'BOSNA', ge: 'GÜRCİSTAN', xk: 'KOSOVA',
  mk: 'MAKEDONYA', be: 'BELÇİKA', nl: 'HOLLANDA', kz: 'KAZAKİSTAN', de: 'ALMANYA',
};
const LC_KZ_TARIFE = {
  ulke: 'KAZAKİSTAN',
  dateFrom: '2026-04-02',
  ref: '2026-164',
  fatura: 'IHR2026000000124',
  label: '2 Nisan 2026',
};

function lcFormatEur(value) {
  const val = Number(value || 0);
  if (Math.abs(val) >= 1000000) return (val / 1000000).toFixed(2).replace('.', ',') + 'M €';
  if (Math.abs(val) >= 1000) return (val / 1000).toFixed(0) + 'K €';
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(val) + ' €';
}

function lcFormatFullEur(value) {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0)) + ' €';
}

function lcDeltaClass(value) {
  const n = Number(value || 0);
  if (Math.abs(n) < 0.005) return 'flat';
  return n > 0 ? 'up' : 'down';
}

function lcFormatDeltaEur(value, compact) {
  const n = Number(value || 0);
  const abs = Math.abs(n);
  const formatted = compact
    ? new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(abs) + ' €'
    : lcFormatFullEur(abs);
  if (abs < 0.005) return compact ? '0 €' : '0,00 €';
  return (n > 0 ? '+' : '−') + formatted;
}

function lcFormatPp(value) {
  const n = Number(value || 0);
  if (Math.abs(n) < 0.005) return '0,00 pp';
  const sign = n > 0 ? '+' : '−';
  return sign + Math.abs(n).toFixed(2).replace('.', ',') + ' pp';
}

function lcFormatPct(value) {
  return '%' + Number(value || 0).toFixed(1).replace('.', ',');
}

function lcFormatAmt(value, para) {
  const body = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Number(value || 0));
  return para === 'USD' ? body + ' $' : body + ' €';
}

function lcSenaryoEtiket(kod) {
  if (kod === 'gruplu') return 'İhracat + Transit';
  if (kod === 'ant') return 'Komple Transit';
  return 'Komple İhracat';
}

function lcDepoBucket() {
  return { n: 0, oldEur: 0, newEur: 0, oldLc: 0, newLc: 0, fatura: 0, komple: 0, gruplu: 0 };
}

function lcEurKisa(v) {
  const n = Number(v || 0);
  if (!(n > 0.005)) return '—';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + 'M';
  if (n >= 10000) return Math.round(n / 1000) + 'k';
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.', ',') + 'k';
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(n);
}

function lcUlkeEtiket(ad) {
  const map = {
    'ALMANYA': 'Almanya', 'BELÇİKA': 'Belçika', 'BOSNA': 'Bosna', 'GÜRCİSTAN': 'Gürcistan',
    'HOLLANDA': 'Hollanda', 'KAZAKİSTAN': 'Kazakistan', 'KOSOVA': 'Kosova',
    'MAKEDONYA': 'Makedonya', 'SIRBİSTAN': 'Sırbistan',
  };
  return map[ad] || ad;
}

function lcAktifUlkeAdlari() {
  return [...document.querySelectorAll('#lc-nav .lc-nav-item.active[data-country]')].map(btn => btn.dataset.country);
}

function lcUlkeKey(ad) {
  return String(ad || '').trim().toLocaleUpperCase('tr-TR');
}

function lcSeciliUlkeSet() {
  const names = lcAktifUlkeAdlari();
  return names.length ? new Set(names.map(lcUlkeKey)) : null;
}

function lcSeferSayisi(rows) {
  const groups = new Set();
  let singles = 0;
  (rows || []).forEach(row => {
    if (row.sefer_id) groups.add(row.sefer_id);
    else singles += 1;
  });
  return singles + groups.size;
}

function lcSumCostRows(rows) {
  const list = rows || [];
  const fatura = list.reduce((s, r) => s + Number(r.fatura_eur || r.fatura_bedeli_eur || 0), 0);
  const operasyon = list.reduce((s, r) => s + Number(r.operasyon_eur || 0), 0);
  const navlun = list.reduce((s, r) => s + Number(r.navlun_eur || 0), 0);
  const vergi = list.reduce((s, r) => s + Number(r.vergi_eur || 0), 0);
  const sigorta = list.reduce((s, r) => s + Number(r.sigorta_eur || 0), 0);
  const landed = operasyon + navlun + vergi + sigorta;
  const sefer = lcSeferSayisi(list);
  return {
    fatura_eur: fatura,
    operasyon_eur: operasyon,
    navlun_eur: navlun,
    vergi_eur: vergi,
    sigorta_eur: sigorta,
    landed_cost_eur: landed,
    oran: fatura ? (landed / fatura) * 100 : 0,
    fatura_sayisi: list.length,
    sefer_sayisi: sefer,
    ortalama_sefer_maliyeti_eur: sefer ? landed / sefer : 0,
  };
}

function lcPendingScoped(pending, set) {
  if (!pending || !set) return pending;
  const detail = (pending.detail || []).filter(r => set.has(lcUlkeKey(r.ulke)));
  const byStatus = {};
  const byCountry = {};
  detail.forEach(row => {
    const status = row.durum || 'Belirsiz';
    const country = row.ulke || 'Belirsiz';
    byStatus[status] = (byStatus[status] || 0) + 1;
    byCountry[country] = (byCountry[country] || 0) + 1;
  });
  return {
    ...pending,
    detail,
    summary: {
      fatura_sayisi: detail.length,
      sefer_sayisi: lcSeferSayisi(detail),
      fatura_eur: detail.reduce((s, r) => s + Number(r.fatura_eur || 0), 0),
      by_status: Object.keys(byStatus).sort().map(durum => ({ durum, sayi: byStatus[durum] })),
      by_country: Object.keys(byCountry).sort().map(ulke => ({ ulke, sayi: byCountry[ulke] })),
    },
  };
}

function lcScopedData(data) {
  const set = lcSeciliUlkeSet();
  if (!data || !set) return data;
  const countries = (data.countries || []).filter(c => set.has(lcUlkeKey(c.ulke)));
  const detail = (data.detail || []).filter(r => set.has(lcUlkeKey(r.ulke)));
  const monthly = {};
  detail.forEach(row => {
    const month = String(row.yukleme_tarihi || '').slice(0, 7) || 'Tarihsiz';
    (monthly[month] ||= []).push(row);
  });
  const months = Object.keys(monthly).sort().map(month => ({ month, ...lcSumCostRows(monthly[month]) }));
  return {
    ...data,
    summary: lcSumCostRows(detail),
    countries,
    months,
    detail,
    pending: lcPendingScoped(data.pending, set),
  };
}

function lcShowCountryView() {
  if (landedCostState.data) renderLandedCost(landedCostState.data);
  else loadLandedCost();
}

function lcAktifUlkeKodlari() {
  const names = lcAktifUlkeAdlari();
  if (!names.length) return null;
  const kodlar = new Set();
  names.forEach(name => {
    Object.entries(LC_KOD_ULKE).forEach(([kod, ad]) => {
      if (ad === name) kodlar.add(kod);
    });
  });
  return kodlar;
}

function lcKzSecili() {
  return lcAktifUlkeAdlari().includes(LC_KZ_TARIFE.ulke);
}

function lcKzTarifeAktif() {
  if (!lcKzSecili()) return false;
  const from = document.getElementById('lc-date-from')?.value || '';
  return from >= LC_KZ_TARIFE.dateFrom;
}

function applyLcKzTarifeDonemi() {
  document.querySelectorAll('#lc-nav .lc-nav-item[data-country]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.country === LC_KZ_TARIFE.ulke);
  });
  document.getElementById('lc-nav-all')?.classList.remove('active');
  const from = document.getElementById('lc-date-from');
  const to = document.getElementById('lc-date-to');
  const depo = document.getElementById('lc-depo');
  const group = document.getElementById('lc-group-type');
  if (from) from.value = LC_KZ_TARIFE.dateFrom;
  if (to) to.value = '';
  if (depo) depo.value = '';
  if (group) group.value = 'all';
  loadLandedCost();
}

function lcSatirRef(row) {
  return String(row.ihracat_dosya_no || '').trim() === LC_KZ_TARIFE.ref;
}

function lcFilterTanimlar(tanimlar, satirlar) {
  const kodlar = lcAktifUlkeKodlari();
  if (kodlar) return (tanimlar || []).filter(t => kodlar.has(t.ulkeKodu));
  const used = new Set((satirlar || []).map(r => r.ulkeKodu).filter(Boolean));
  if (used.size) return (tanimlar || []).filter(t => used.has(t.ulkeKodu));
  return tanimlar || [];
}

function lcFilterSatirlar(satirlar) {
  const names = lcAktifUlkeAdlari();
  const kodlar = lcAktifUlkeKodlari();
  if (!names.length) return satirlar || [];
  return (satirlar || []).filter(r => names.includes(r.ulke) || (kodlar && kodlar.has(r.ulkeKodu)));
}

function lcNavlunYeniAl(tanimlar) {
  if (!landedCostState.navlunYeni) landedCostState.navlunYeni = {};
  (tanimlar || []).forEach(t => {
    if (!landedCostState.navlunYeni[t.ulkeKodu]) {
      landedCostState.navlunYeni[t.ulkeKodu] = {
        navlunIhr: t.navlunIhr,
        navlunAntIhr: t.navlunAntIhr,
        navlunAnt: t.navlunAnt,
      };
    }
  });
  return landedCostState.navlunYeni;
}

function lcNavlunTutarInput(kod, alan, raw, el) {
  const text = String(raw ?? '').trim().replace(',', '.');
  if (text === '') return;
  const n = Number(text);
  if (Number.isNaN(n) || n < 0) return;
  if (!landedCostState.navlunYeni) landedCostState.navlunYeni = {};
  if (!landedCostState.navlunYeni[kod]) landedCostState.navlunYeni[kod] = {};
  landedCostState.navlunYeni[kod][alan] = n;
  if (el) {
    const eski = Number(el.dataset.eski || 0);
    el.closest('td')?.classList.toggle('dirty', Math.abs(n - eski) > 0.005);
  }
  if (landedCostState.data) renderLcNavlunScenario(landedCostState.data, { skipEditor: true });
}

function lcNavlunSenaryoSifirla() {
  landedCostState.navlunYeni = null;
  const box = document.getElementById('lc-scenario-tanim');
  if (box) delete box.dataset.built;
  if (landedCostState.data) renderLcNavlunScenario(landedCostState.data);
}

function lcNavlunNative(row, para) {
  if (para === 'USD') {
    const usd = Number(row.navlun_usd || 0);
    if (usd > 0.005) return usd;
  }
  return Number(row.navlun_eur || 0);
}

function lcNavlunToEur(native, row, para) {
  if (para !== 'USD') return Number(native || 0);
  const usdK = Number(row.usd_kuru || 0);
  const eurK = Number(row.eur_kuru || 0);
  if (usdK > 0.0001 && eurK > 0.0001) return Number(native || 0) * usdK / eurK;
  const oldUsd = Number(row.navlun_usd || 0);
  const oldEur = Number(row.navlun_eur || 0);
  if (oldUsd > 0.005 && oldEur > 0.005) return Number(native || 0) * (oldEur / oldUsd);
  return Number(row.navlun_eur || 0);
}

function lcNavlunBaz(tanim, senaryo) {
  if (!tanim) return 0;
  if (senaryo === 'gruplu') return Number(tanim.navlunAntIhr || 0);
  if (senaryo === 'ant') return Number(tanim.navlunAnt || 0);
  return Number(tanim.navlunIhr || 0);
}

function lcNavlunScenario(data, yeniMap) {
  const tanimlarAll = data.navlun_tanimlar || [];
  const satirlar = lcFilterSatirlar(data.navlun_satirlar || []);
  const tanimlar = lcFilterTanimlar(tanimlarAll, satirlar);
  const eskiByKod = {};
  tanimlarAll.forEach(t => { eskiByKod[t.ulkeKodu] = t; });
  const detailById = {};
  (data.detail || []).forEach(d => { if (d && d.id != null) detailById[d.id] = d; });
  const byUlke = {};
  const mix = { gruplu: { n: 0, oldEur: 0, newEur: 0, oldLc: 0 }, ihr: { n: 0, oldEur: 0, newEur: 0, oldLc: 0 }, ant: { n: 0, oldEur: 0, newEur: 0, oldLc: 0 } };
  const depoMix = { IHR: lcDepoBucket(), ANT: lcDepoBucket() };
  const computed = [];

  satirlar.forEach(row => {
    const kod = row.ulkeKodu;
    const eski = eskiByKod[kod];
    const oldEur = Number(row.navlun_eur || 0);
    let newEur = oldEur;
    const senaryo = row.senaryo || 'ihr';
    let newNative = null;
    if (eski) {
      const yeni = { ...eski, ...(yeniMap && yeniMap[kod]) };
      const para = eski.paraBirimi || 'EUR';
      const native = lcNavlunNative(row, para);
      const oldBaz = lcNavlunBaz(eski, senaryo);
      const newBaz = lcNavlunBaz(yeni, senaryo);
      if (Math.abs(newBaz - oldBaz) < 0.005) {
        newEur = oldEur;
        newNative = native;
      } else {
        const oran = oldBaz > 0.005 ? newBaz / oldBaz : 1;
        newNative = native * oran;
        newEur = lcNavlunToEur(newNative, row, para);
      }
    }
    const det = detailById[row.id] || {};
    const oldLc = Number(row.landed_cost_eur ?? det.landed_cost_eur ?? 0);
    const faturaEur = Number(row.fatura_eur ?? det.fatura_eur ?? 0);
    const deltaN = newEur - oldEur;
    const newLc = oldLc + deltaN;
    const lcPct = oldLc > 0.005 ? (deltaN / oldLc) * 100 : 0;
    const depo = row.depo === 'ANT' ? 'ANT' : 'IHR';
    const bucket = mix[senaryo] || mix.ihr;
    bucket.n += 1;
    bucket.oldEur += oldEur;
    bucket.newEur += newEur;
    bucket.oldLc += oldLc;
    const dBucket = depoMix[depo];
    dBucket.n += 1;
    dBucket.oldEur += oldEur;
    dBucket.newEur += newEur;
    dBucket.oldLc += oldLc;
    dBucket.newLc += newLc;
    dBucket.fatura += faturaEur;
    if (senaryo === 'gruplu') dBucket.gruplu += 1;
    else dBucket.komple += 1;
    const ulke = row.ulke || 'Belirsiz';
    if (!byUlke[ulke]) {
      byUlke[ulke] = { ulke, oldEur: 0, newEur: 0, gruplu: 0, komple: 0, paraBirimi: eski ? eski.paraBirimi : 'EUR' };
    }
    byUlke[ulke].oldEur += oldEur;
    byUlke[ulke].newEur += newEur;
    if (senaryo === 'gruplu') byUlke[ulke].gruplu += 1;
    else byUlke[ulke].komple += 1;
    computed.push({
      ...row,
      oldEur, newEur, newNative, senaryo, depo,
      paraBirimi: eski ? eski.paraBirimi : 'EUR',
      oldLc, newLc, lcPct, faturaEur,
      navlunPay: oldLc > 0.005 ? (oldEur / oldLc) * 100 : 0,
      yeniNavlunPay: newLc > 0.005 ? (newEur / newLc) * 100 : 0,
    });
  });

  ['IHR', 'ANT'].forEach(d => {
    const m = depoMix[d];
    const delta = m.newEur - m.oldEur;
    m.delta = delta;
    m.lcPct = m.oldLc > 0.005 ? (delta / m.oldLc) * 100 : 0;
    m.navlunPay = m.oldLc > 0.005 ? (m.oldEur / m.oldLc) * 100 : 0;
    m.yeniNavlunPay = m.newLc > 0.005 ? (m.newEur / m.newLc) * 100 : 0;
    m.oran = m.fatura > 0.005 ? (m.oldLc / m.fatura) * 100 : 0;
    m.yeniOran = m.fatura > 0.005 ? (m.newLc / m.fatura) * 100 : 0;
    m.oranDelta = m.yeniOran - m.oran;
  });

  const names = lcAktifUlkeAdlari();
  const countrySrc = (data.countries || []).filter(c => !names.length || names.includes(c.ulke));
  const countryMap = {};
  countrySrc.forEach(c => { countryMap[c.ulke] = c; });
  const navlun = Object.values(byUlke).reduce((s, c) => s + c.oldEur, 0);
  const yeniNavlun = Object.values(byUlke).reduce((s, c) => s + c.newEur, 0);
  const landed = countrySrc.reduce((s, c) => s + Number(c.landed_cost_eur || 0), 0);
  const fatura = countrySrc.reduce((s, c) => s + Number(c.fatura_eur || 0), 0);
  const sefer = countrySrc.reduce((s, c) => s + Number(c.sefer_sayisi || 0), 0);
  const delta = yeniNavlun - navlun;
  const yeniLanded = landed + delta;
  const oran = fatura > 0.005 ? (landed / fatura) * 100 : 0;
  const yeniOran = fatura > 0.005 ? (yeniLanded / fatura) * 100 : 0;
  const navlunPay = landed > 0.005 ? (navlun / landed) * 100 : 0;
  const yeniNavlunPay = yeniLanded > 0.005 ? (yeniNavlun / yeniLanded) * 100 : 0;
  const lcDegisimPct = landed > 0.005 ? (delta / landed) * 100 : 0;
  const navlunDegisimPct = navlun > 0.005 ? (delta / navlun) * 100 : 0;
  const countries = Object.values(byUlke).map(c => {
    const base = countryMap[c.ulke] || { fatura_eur: 0, landed_cost_eur: 0, oran: 0 };
    const cDelta = c.newEur - c.oldEur;
    const cLanded = Number(base.landed_cost_eur || 0);
    const cYeniLanded = cLanded + cDelta;
    const cFatura = Number(base.fatura_eur || 0);
    return {
      ...base,
      ulke: c.ulke,
      navlun_eur: c.oldEur,
      yeni_navlun_eur: c.newEur,
      navlun_delta_eur: cDelta,
      landed_cost_eur: cLanded,
      yeni_landed_cost_eur: cYeniLanded,
      navlun_pay: cLanded > 0.005 ? (c.oldEur / cLanded) * 100 : 0,
      yeni_navlun_pay: cYeniLanded > 0.005 ? (c.newEur / cYeniLanded) * 100 : 0,
      oran_delta: cFatura > 0.005 ? ((cYeniLanded / cFatura) * 100) - Number(base.oran || 0) : 0,
      lc_degisim_pct: cLanded > 0.005 ? (cDelta / cLanded) * 100 : 0,
      gruplu: c.gruplu,
      komple: c.komple,
      paraBirimi: c.paraBirimi,
    };
  }).sort((a, b) => Math.abs(b.navlun_delta_eur) - Math.abs(a.navlun_delta_eur));

  return {
    navlun, yeniNavlun, delta, landed, yeniLanded, oran, yeniOran,
    oranDelta: yeniOran - oran,
    navlunPay, yeniNavlunPay, lcDegisimPct, navlunDegisimPct,
    sefer,
    yeniSeferOrt: sefer ? yeniLanded / sefer : 0,
    seferOrt: sefer ? landed / sefer : 0,
    countries,
    mix,
    depoMix,
    tanimlar,
    satirlar: computed,
    seciliUlkeler: names,
  };
}

function renderLcNavlunEditor(tanimlar, yeniMap) {
  const box = document.getElementById('lc-scenario-tanim');
  if (!box) return;
  if (!tanimlar.length) {
    const secili = lcAktifUlkeAdlari();
    box.innerHTML = `
      <div class="lc-tanim-head">
        <div class="lc-tanim-legend">${secili.length ? secili.join(', ') + ' için Navlun Tanımı yok.' : 'Navlun tanımı yok'}</div>
        <div class="lc-tanim-actions">
          <button type="button" class="lc-btn" onclick="downloadLcNavlunSenaryo()">Senaryo Excel</button>
        </div>
      </div>`;
    return;
  }
  const inp = (kod, alan, val, eski) =>
    `<input class="lc-input lc-tanim-inp" type="number" min="0" step="50" value="${val}" data-eski="${eski}"
       oninput="lcNavlunTutarInput('${kod}','${alan}',this.value,this)">`;
  box.innerHTML = `
    <div class="lc-tanim-head">
      <div class="lc-tanim-legend"></div>
      <div class="lc-tanim-actions">
        <button type="button" class="lc-btn secondary" onclick="lcNavlunSenaryoSifirla()">Kayıtlıya dön</button>
        <button type="button" class="lc-btn" onclick="downloadLcNavlunSenaryo()">Senaryo Excel</button>
      </div>
    </div>
    <div class="lc-table-wrap">
      <table class="lc-table lc-tanim-table">
        <thead>
          <tr>
            <th>Ülke</th>
            <th>PB</th>
            <th>Komple İhracat</th>
            <th>İhracat + Transit</th>
            <th>Komple Transit</th>
          </tr>
        </thead>
        <tbody>
          ${tanimlar.map(t => {
            const y = yeniMap[t.ulkeKodu] || t;
            const dirty = (a, b) => Math.abs(Number(a || 0) - Number(b || 0)) > 0.005 ? 'dirty' : '';
            const ulkeAd = LC_KOD_ULKE[t.ulkeKodu] || t.ulkeAdi;
            return `<tr>
              <td>
                <span class="lc-country-cell" style="--country-color:${lcCountryColor(ulkeAd)};">
                  <span class="lc-country-dot"></span>${t.ulkeAdi}
                </span>
              </td>
              <td><b>${t.paraBirimi}</b></td>
              <td class="${dirty(y.navlunIhr, t.navlunIhr)}">${inp(t.ulkeKodu, 'navlunIhr', y.navlunIhr, t.navlunIhr)}<small>kayıtlı ${lcFormatAmt(t.navlunIhr, t.paraBirimi)}</small></td>
              <td class="${dirty(y.navlunAntIhr, t.navlunAntIhr)}">${inp(t.ulkeKodu, 'navlunAntIhr', y.navlunAntIhr, t.navlunAntIhr)}<small>kayıtlı ${lcFormatAmt(t.navlunAntIhr, t.paraBirimi)}</small></td>
              <td class="${dirty(y.navlunAnt, t.navlunAnt)}">${inp(t.ulkeKodu, 'navlunAnt', y.navlunAnt, t.navlunAnt)}<small>kayıtlı ${lcFormatAmt(t.navlunAnt, t.paraBirimi)}</small></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
  box.dataset.built = '1';
}

// Değişmeyen oranı tek değer, değişeni "eski → yeni" gösterir (tablodaki ok gürültüsünü azaltır)
function lcOkluPct(eski, yeni) {
  const a = lcFormatPct(eski), b = lcFormatPct(yeni);
  return a === b ? b : `${a} → ${b}`;
}

function renderLcNavlunScenario(data, opts) {
  const kpis = document.getElementById('lc-scenario-kpis');
  const table = document.getElementById('lc-scenario-table');
  const note = document.getElementById('lc-scenario-note');
  const mixEl = document.getElementById('lc-scenario-mix');
  if (!kpis || !table || !note) return;
  const tanimlar = lcFilterTanimlar(data.navlun_tanimlar || [], data.navlun_satirlar || []);
  const yeniMap = lcNavlunYeniAl(data.navlun_tanimlar || []);
  const editor = document.getElementById('lc-scenario-tanim');
  if (editor && !opts?.skipEditor) {
    renderLcNavlunEditor(tanimlar, yeniMap);
  }
  const s = lcNavlunScenario(data, yeniMap);
  renderLcNavlunScope(s);
  const tone = lcDeltaClass(s.delta);
  kpis.innerHTML = `
    <div class="lc-scenario-kpi ${tone}">
      <span>Yeni landed cost</span>
      <b>${lcFormatEur(s.yeniLanded)}</b>
      <small>${lcFormatEur(s.landed)} → ${lcFormatDeltaEur(s.delta, true)}</small>
    </div>
    <div class="lc-scenario-kpi ${tone}">
      <span>Navlun</span>
      <b>${lcFormatEur(s.yeniNavlun)}</b>
      <small>${lcFormatEur(s.navlun)} → ${lcFormatDeltaEur(s.delta, true)} · navlun ${lcFormatPct(s.navlunDegisimPct)}</small>
    </div>
    <div class="lc-scenario-kpi ${tone}">
      <span>LC değişimi</span>
      <b>${lcFormatPct(s.lcDegisimPct)}</b>
      <small>Navlun ${lcFormatPct(s.navlunDegisimPct)} × pay ${lcFormatPct(s.navlunPay)}</small>
    </div>
  `;
  if (mixEl) {
    const ihr = s.depoMix.IHR;
    const ant = s.depoMix.ANT;
    const depoCard = (m, ad) => {
      const d = m.delta || 0;
      const agirlik = s.landed > 0.005 ? (m.oldLc / s.landed) * 100 : 0;
      return `<div class="lc-depo-card ${lcDeltaClass(d)}">
        <div class="lc-depo-head">
          <span class="lc-depo-tag">${ad}</span>
          <b class="lc-delta ${lcDeltaClass(m.lcPct)}">${lcFormatPct(m.lcPct)}</b>
        </div>
        <div class="lc-depo-line">${m.n} fatura · Landed Cost ${lcOkluPct(m.oran, m.yeniOran)}</div>
      </div>`;
    };
    mixEl.innerHTML = `
      <div class="lc-depo-grid">${depoCard(ihr, 'Serbest (IHR)')}${depoCard(ant, 'Antrepo (ANT)')}</div>
`;
  }
  const rows = s.countries.filter(c => Number(c.navlun_eur || 0) > 0.005 || Number(c.landed_cost_eur || 0) > 0.005);
  if (!rows.length) {
    table.innerHTML = '<div style="color:#94A3B8;font-size:12px;padding:8px 0;">Seçili ülkede navlun kaydı yok</div>';
  } else {
    table.innerHTML = `
      <div class="lc-table-wrap">
        <table class="lc-table">
          <thead>
            <tr>
              <th>Ülke</th>
              <th>Komple / Gruplu</th>
              <th>Kayıtlı LC</th>
              <th>Yeni LC</th>
              <th>Navlun payı</th>
              <th>Δ Navlun</th>
              <th>LC değişimi</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(c => `
              <tr>
                <td>
                  <span class="lc-country-cell" style="--country-color:${lcCountryColor(c.ulke)};">
                    <span class="lc-country-dot"></span>${lcUlkeEtiket(c.ulke)}
                  </span>
                </td>
                <td>${c.komple || 0} / ${c.gruplu || 0}</td>
                <td>${lcFormatFullEur(c.landed_cost_eur)}</td>
                <td>${lcFormatFullEur(c.yeni_landed_cost_eur)}</td>
                <td>${lcOkluPct(c.navlun_pay, c.yeni_navlun_pay)}</td>
                <td><span class="lc-delta ${lcDeltaClass(c.navlun_delta_eur)}">${lcFormatDeltaEur(c.navlun_delta_eur)}</span></td>
                <td><span class="lc-delta ${lcDeltaClass(c.lc_degisim_pct)}">${lcFormatPct(c.lc_degisim_pct)}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  let shipEl = document.getElementById('lc-scenario-shipments');
  if (!shipEl && table) {
    shipEl = document.createElement('div');
    shipEl.id = 'lc-scenario-shipments';
    table.after(shipEl);
  }
  if (shipEl) renderLcNavlunShipments(s);
  const kim = (s.seciliUlkeler && s.seciliUlkeler.length) ? s.seciliUlkeler.join(', ') : 'tüm ülkeler';
  const ihr = s.depoMix.IHR;
  const ant = s.depoMix.ANT;
  note.innerHTML = s.navlun > 0.005
    ? `<strong>${kim}</strong>${lcKzTarifeAktif() ? ` · dönem <strong>${LC_KZ_TARIFE.ref}</strong> / ${LC_KZ_TARIFE.label} dahil ve sonrası` : ''}
       · Gruplu faturalar da IHR/ANT faturasına göre ayrılır.
       LC % = o grubun navlun farkı ÷ kayıtlı landed cost. Ortalama <strong>${lcFormatPct(s.lcDegisimPct)}</strong>
       (IHR ${lcFormatPct(ihr.lcPct)}, ANT ${lcFormatPct(ant.lcPct)}).
       Sefer başına <strong>${lcFormatEur(s.seferOrt)}</strong> → <strong>${lcFormatEur(s.yeniSeferOrt)}</strong>.`
    : 'Seçili ülkede / dönemde kayıtlı navlun yok.';
}

function renderLcNavlunScope(s) {
  let el = document.getElementById('lc-scenario-scope');
  if (!el) {
    const card = document.querySelector('.lc-card.lc-scenario');
    if (!card) return;
    el = document.createElement('div');
    el.id = 'lc-scenario-scope';
    const tanim = document.getElementById('lc-scenario-tanim');
    card.insertBefore(el, tanim || card.children[2] || null);
  }
  if (!lcKzSecili()) {
    el.className = 'lc-scope lc-scope-off';
    el.innerHTML = '';
    return;
  }
  const n = (s.satirlar || []).length;
  const hasRef = (s.satirlar || []).some(lcSatirRef);
  if (lcKzTarifeAktif()) {
    el.className = 'lc-scope lc-scope-on';
    el.innerHTML = `
      <div>
        <div class="lc-scope-kicker">Kazakistan analiz penceresi</div>
        <h4>${LC_KZ_TARIFE.label} dahil ve sonrası</h4>
        <p>
          Oranlar yalnız bu dönemdeki KZ yüklemelerinden hesaplanır. Dönem
          <strong>${LC_KZ_TARIFE.ref}</strong> referansı ile başlar
          (${LC_KZ_TARIFE.fatura}, 2 Nisan 2026, komple IHR).
          Bu tarihten önceki sevkiyatlar (ör. 2026-148 / 27 Mart) LC ve navlun yüzdelerine <strong>girmez</strong>.
        </p>
      </div>
      <div class="lc-scope-meta">
        <span class="lc-ref-chip">${LC_KZ_TARIFE.ref} dahil</span>
        <span class="lc-scope-count">${n} fatura · ${hasRef ? 'başlangıç satırı listede' : '2026-164 bu filtrede yok'}</span>
      </div>`;
    return;
  }
  el.className = 'lc-scope lc-scope-warn';
  el.innerHTML = `
    <div>
      <div class="lc-scope-kicker">Tarif dönemi uygulanmadı</div>
      <h4>KZ yeni navlun 2 Nisan 2026’dan geçerli</h4>
      <p>
        Şu an önceki yüklemeler de karışıyor. Oranları
        <strong>${LC_KZ_TARIFE.ref}</strong> dahil, <strong>${LC_KZ_TARIFE.label}</strong> ve sonrası için yeniden hesaplamak üzere dönemi uygulayın.
      </p>
    </div>
    <div class="lc-scope-meta">
      <button type="button" class="lc-btn" onclick="applyLcKzTarifeDonemi()">2 Nisan 2026 · 2026-164+</button>
    </div>`;
}

function lcSenaryoDepoFiltre(depo) {
  landedCostState.senaryoDepo = depo;
  if (landedCostState.data) renderLcNavlunScenario(landedCostState.data, { skipEditor: true });
}

function renderLcNavlunShipments(s) {
  const el = document.getElementById('lc-scenario-shipments');
  if (!el) return;
  const filtre = landedCostState.senaryoDepo || 'all';
  const rows = (s.satirlar || [])
    .filter(r => filtre === 'all' || r.depo === filtre)
    .slice()
    .sort((a, b) => {
      const da = String(a.yukleme_tarihi || '');
      const db = String(b.yukleme_tarihi || '');
      if (da !== db) return db.localeCompare(da);
      return String(b.fatura_no || '').localeCompare(String(a.fatura_no || ''), undefined, { numeric: true });
    });
  const chip = (id, label) =>
    `<button type="button" class="lc-ship-chip${filtre === id ? ' active' : ''}" onclick="lcSenaryoDepoFiltre('${id}')">${label}</button>`;
  if (!rows.length) {
    el.innerHTML = `
      <div class="lc-ship-head">
        <div class="lc-ship-title">Sevkiyat bazında LC</div>
        <div class="lc-ship-filters">${chip('all', 'Tümü')} ${chip('IHR', 'IHR')} ${chip('ANT', 'ANT')}</div>
      </div>
      <div style="color:#94A3B8;font-size:12px;padding:8px 0;">Bu filtrede sevkiyat yok</div>`;
    return;
  }
  el.innerHTML = `
    <div class="lc-ship-head">
      <div class="lc-ship-title">Sevkiyat bazında LC · ${rows.length} fatura</div>
      <div class="lc-ship-filters">${chip('all', 'Tümü')} ${chip('IHR', 'IHR')} ${chip('ANT', 'ANT')}</div>
    </div>
    <div class="lc-table-wrap lc-ship-wrap">
      <table class="lc-table">
        <thead>
          <tr>
            <th>Fatura / dosya</th>
            <th>Depo</th>
            <th>Senaryo</th>
            <th>Kayıtlı LC</th>
            <th>Yeni LC</th>
            <th>Navlun payı</th>
            <th>Δ Navlun</th>
            <th>LC değişimi</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr class="${lcSatirRef(r) ? 'lc-ship-anchor' : ''}">
              <td>
                <b>${r.fatura_no || '—'}</b>${lcSatirRef(r) ? '<span class="lc-anchor-flag">tarif başlangıcı</span>' : ''}
                <small class="lc-ship-sub">${[r.ihracat_dosya_no, r.yukleme_tarihi, r.sefer_id ? 'grup ' + r.sefer_id : ''].filter(Boolean).join(' · ')}</small>
              </td>
              <td>${r.depo}</td>
              <td>${lcSenaryoEtiket(r.senaryo)}</td>
              <td>${lcFormatFullEur(r.oldLc)}</td>
              <td>${lcFormatFullEur(r.newLc)}</td>
              <td>${lcOkluPct(r.navlunPay, r.yeniNavlunPay)}</td>
              <td><span class="lc-delta ${lcDeltaClass(r.newEur - r.oldEur)}">${lcFormatDeltaEur(r.newEur - r.oldEur)}</span></td>
              <td><span class="lc-delta ${lcDeltaClass(r.lcPct)}">${lcFormatPct(r.lcPct)}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function downloadLcNavlunSenaryo() {
  const data = landedCostState.data;
  if (!data) {
    alert('Önce Landed Cost verisini yükleyin.');
    return;
  }
  const yeniMap = lcNavlunYeniAl(data.navlun_tanimlar || []);
  const s = lcNavlunScenario(data, yeniMap);
  const params = getLandedCostParams();
  const round2 = n => Math.round(Number(n || 0) * 100) / 100;
  const nvl = v => (v === '' || v == null ? null : round2(v));

  const payload = {
    meta: {
      ulkeler: (s.seciliUlkeler && s.seciliUlkeler.length) ? s.seciliUlkeler.join(', ') : 'Tüm ülkeler',
      date_from: params.get('date_from') || '',
      date_to: params.get('date_to') || '',
      depo: params.get('depo') || 'Tümü',
      group_type: params.get('group_type') || 'all',
      kz_tarife: lcKzTarifeAktif() ? 'Evet: 2026-04-02 dahil, ref 2026-164 ve sonrası' : 'Hayır',
      kz_ref: [LC_KZ_TARIFE.ref, LC_KZ_TARIFE.fatura, LC_KZ_TARIFE.label].filter(Boolean).join(' · '),
    },
    tutarlar: [
      { kalem: 'Landed cost', kayitli: round2(s.landed), senaryo: round2(s.yeniLanded), fark: round2(s.delta) },
      { kalem: 'Navlun', kayitli: round2(s.navlun), senaryo: round2(s.yeniNavlun), fark: round2(s.delta) },
      { kalem: 'Sefer başına landed cost', kayitli: round2(s.seferOrt), senaryo: round2(s.yeniSeferOrt), fark: round2(s.yeniSeferOrt - s.seferOrt) },
    ],
    oranlar: [
      { kalem: 'Navlun payı (LC içi)', kayitli: nvl(s.navlunPay), senaryo: nvl(s.yeniNavlunPay), fark: nvl(s.yeniNavlunPay - s.navlunPay), fark_pp: true },
      { kalem: 'Navlun değişimi', kayitli: null, senaryo: nvl(s.navlunDegisimPct), fark: nvl(s.navlunDegisimPct), fark_pp: false },
      { kalem: 'LC değişimi', kayitli: null, senaryo: nvl(s.lcDegisimPct), fark: nvl(s.lcDegisimPct), fark_pp: false },
      { kalem: 'IHR LC değişimi', kayitli: null, senaryo: nvl(s.depoMix.IHR.lcPct), fark: nvl(s.depoMix.IHR.lcPct), fark_pp: false },
      { kalem: 'ANT LC değişimi', kayitli: null, senaryo: nvl(s.depoMix.ANT.lcPct), fark: nvl(s.depoMix.ANT.lcPct), fark_pp: false },
      { kalem: 'Landed Cost', kayitli: nvl(s.oran), senaryo: nvl(s.yeniOran), fark: nvl(s.oranDelta), fark_pp: true },
      { kalem: 'IHR Landed Cost', kayitli: nvl(s.depoMix.IHR.oran), senaryo: nvl(s.depoMix.IHR.yeniOran), fark: nvl(s.depoMix.IHR.oranDelta), fark_pp: true },
      { kalem: 'ANT Landed Cost', kayitli: nvl(s.depoMix.ANT.oran), senaryo: nvl(s.depoMix.ANT.yeniOran), fark: nvl(s.depoMix.ANT.oranDelta), fark_pp: true },
    ],
    tarifeler: [],
    kirilim: [],
    ulkeler: [],
    faturalar: [],
  };

  (s.tanimlar || []).forEach(t => {
    const y = (yeniMap && yeniMap[t.ulkeKodu]) || t;
    const ulkeAdi = LC_KOD_ULKE[t.ulkeKodu] || t.ulkeAdi;
    payload.tarifeler.push({ ulke: ulkeAdi, pb: t.paraBirimi, kolon: 'Komple İhracat', kayitli: round2(t.navlunIhr), yeni: round2(y.navlunIhr) });
    payload.tarifeler.push({ ulke: ulkeAdi, pb: t.paraBirimi, kolon: 'İhracat + Transit', kayitli: round2(t.navlunAntIhr), yeni: round2(y.navlunAntIhr) });
    payload.tarifeler.push({ ulke: ulkeAdi, pb: t.paraBirimi, kolon: 'Komple Transit', kayitli: round2(t.navlunAnt), yeni: round2(y.navlunAnt) });
  });

  [['IHR', s.depoMix.IHR], ['ANT', s.depoMix.ANT]].forEach(([ad, m]) => {
    payload.kirilim.push({
      depo: ad, tip: 'Toplam', fatura_sayisi: m.n,
      kayitli_lc: round2(m.oldLc), yeni_lc: round2(m.newLc), delta_navlun: round2(m.delta),
      lc_pct: round2(m.lcPct), navlun_pay: round2(m.navlunPay), yeni_navlun_pay: round2(m.yeniNavlunPay),
      kayitli_oran: round2(m.oran), yeni_oran: round2(m.yeniOran), oran_delta: round2(m.oranDelta),
    });
  });
  [
    ['IHR', 'komple', r => r.depo === 'IHR' && r.senaryo !== 'gruplu'],
    ['IHR', 'gruplu', r => r.depo === 'IHR' && r.senaryo === 'gruplu'],
    ['ANT', 'komple', r => r.depo === 'ANT' && r.senaryo !== 'gruplu'],
    ['ANT', 'gruplu', r => r.depo === 'ANT' && r.senaryo === 'gruplu'],
  ].forEach(([depo, tip, fn]) => {
    const rows = (s.satirlar || []).filter(fn);
    const oldLc = rows.reduce((a, r) => a + r.oldLc, 0);
    const newLc = rows.reduce((a, r) => a + r.newLc, 0);
    const oldEur = rows.reduce((a, r) => a + r.oldEur, 0);
    const newEur = rows.reduce((a, r) => a + r.newEur, 0);
    const fatura = rows.reduce((a, r) => a + Number(r.faturaEur || 0), 0);
    const delta = newEur - oldEur;
    const oran = fatura > 0.005 ? (oldLc / fatura) * 100 : 0;
    const yeniOran = fatura > 0.005 ? (newLc / fatura) * 100 : 0;
    payload.kirilim.push({
      depo, tip, fatura_sayisi: rows.length,
      kayitli_lc: round2(oldLc), yeni_lc: round2(newLc), delta_navlun: round2(delta),
      lc_pct: round2(oldLc > 0.005 ? (delta / oldLc) * 100 : 0),
      navlun_pay: round2(oldLc > 0.005 ? (oldEur / oldLc) * 100 : 0),
      yeni_navlun_pay: round2(newLc > 0.005 ? (newEur / newLc) * 100 : 0),
      kayitli_oran: round2(oran), yeni_oran: round2(yeniOran), oran_delta: round2(yeniOran - oran),
    });
  });

  s.countries.forEach(c => {
    payload.ulkeler.push({
      ulke: c.ulke,
      komple: c.komple || 0,
      gruplu: c.gruplu || 0,
      kayitli_lc: round2(c.landed_cost_eur),
      yeni_lc: round2(c.yeni_landed_cost_eur),
      kayitli_navlun: round2(c.navlun_eur),
      yeni_navlun: round2(c.yeni_navlun_eur),
      navlun_pay: round2(c.navlun_pay),
      yeni_navlun_pay: round2(c.yeni_navlun_pay),
      delta_navlun: round2(c.navlun_delta_eur),
      lc_pct: round2(c.lc_degisim_pct),
    });
  });

  (s.satirlar || []).forEach(r => {
    payload.faturalar.push({
      ulke: r.ulke || '',
      fatura_no: r.fatura_no || '',
      dosya_no: r.ihracat_dosya_no || '',
      depo: r.depo || '',
      senaryo: lcSenaryoEtiket(r.senaryo),
      sefer_id: r.sefer_id || '',
      palet: r.palet || '',
      kayitli_lc: round2(r.oldLc),
      yeni_lc: round2(r.newLc),
      kayitli_navlun: round2(r.oldEur),
      yeni_navlun: round2(r.newEur),
      delta_navlun: round2(r.newEur - r.oldEur),
      navlun_pay: round2(r.navlunPay),
      yeni_navlun_pay: round2(r.yeniNavlunPay),
      lc_pct: round2(r.lcPct),
      para_birimi: r.paraBirimi || '',
    });
  });

  try {
    const token = localStorage.getItem('fa_auth_token');
    const res = await fetch('/api/landed-cost/senaryo-export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const contentType = res.headers.get('Content-Type') || '';
    if (!res.ok || contentType.includes('application/json')) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || 'Sunucu hatası');
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const slug = String((s.seciliUlkeler && s.seciliUlkeler[0]) || 'TUM').replace(/[^\wÇĞİÖŞÜçğıöşü-]+/g, '_');
    a.download = `navlun_senaryo_${slug}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    alert('Senaryo Excel indirilemedi: ' + (err.message || err));
  }
}

function lcCountryColor(country) {
  return LC_COUNTRY_COLORS[country] || '#2563EB';
}

function initLandedCostPanel() {
  const panel = document.getElementById('stepLandedCost');
  if (!panel) return;
  if (panel.dataset.ready !== 'lc-nav-all-1') {
    panel.dataset.ready = 'lc-nav-all-1';
    panel.innerHTML = `
      <style>
        #stepLandedCost.panel { gap:0; flex:1; min-height:0; height:100%; }
        .lc { --lc:#2563EB; --lc-ink:#0F172A; --lc-muted:#64748B; --lc-line:#E2E8F0;
          height:100%; min-height:0; padding:0; color:var(--lc-ink); background:#F8FAFC;
          font-family:var(--font); display:flex; align-items:stretch; }
        .lc-side { width:200px; flex-shrink:0; background:linear-gradient(180deg,#fff 0%,#FFFFFF 100%);
          border-right:1px solid var(--lc-line); display:flex; flex-direction:column; height:100%; min-height:0;
          box-sizing:border-box; overflow:hidden; }
        .lc-side-h { font:700 13px/1 var(--font); letter-spacing:.02em; color:var(--lc-muted);
          height:44px; padding:0 16px; display:flex; align-items:center; border-bottom:1px solid var(--lc-line); flex-shrink:0; }
        .lc-nav { flex:1; overflow:auto; padding:8px 8px 12px; display:flex; flex-direction:column; gap:2px; }
        .lc-nav-item { display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%;
          border:0; background:transparent; text-align:left; height:38px; padding:0 12px; border-radius:10px;
          font:600 13px/1 var(--font); color:var(--lc-ink); cursor:pointer; box-sizing:border-box;
          user-select:none; -webkit-user-select:none;
          transition:background .12s ease, color .12s ease, box-shadow .12s ease; }
        .lc-nav-item span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .lc-nav-item b { font:600 12px/1 var(--font); color:var(--lc-muted); font-variant-numeric:tabular-nums; flex-shrink:0; }
        .lc-nav-item:hover { background:#F1F5F9; }
        .lc-nav-item.active { background:#EFF6FF; color:#1D4ED8; box-shadow:inset 3px 0 0 var(--lc); }
        .lc-nav-item.active b { color:#2563EB; }
        .lc-nav-dot { width:8px; height:8px; border-radius:50%; background:var(--country-color,#94A3B8); flex-shrink:0; }
        .lc-main { flex:1; min-width:0; height:100%; overflow:auto; padding:16px 20px 28px; box-sizing:border-box;
          background:linear-gradient(180deg,#F8FAFC 0%,#F8FAFC 120px); }
        .lc-views { display:flex; gap:4px; padding:4px; width:fit-content; margin:0 0 12px;
          background:rgba(255,255,255,.72); border:1px solid var(--lc-line); border-radius:14px; }
        .lc-view { border:0; background:transparent; color:var(--lc-muted); padding:8px 14px; border-radius:11px;
          font:750 12.5px var(--font); cursor:pointer; user-select:none; -webkit-user-select:none; }
        .lc-view.active { background:#0F172A; color:#F1F5F9; }
        .lc-period { display:flex; gap:8px; align-items:end; flex-wrap:wrap; margin:0 0 14px;
          padding:12px 14px; background:#fff; border:1px solid rgba(226,232,240,.9); border-radius:16px;
          box-shadow:0 10px 28px rgba(15,23,42,.045); }
        .lc-field { display:flex; flex-direction:column; gap:5px; }
        .lc-field-label { font-size:10.5px; font-weight:700; letter-spacing:.02em; color:var(--lc-muted); }
        .lc-input, .lc-select { height:38px; border:1px solid transparent; border-radius:12px; background:#F1F5F9;
          padding:0 12px; font:600 13px var(--font); color:var(--lc-ink);
          box-shadow:inset 0 0 0 1px rgba(15,23,42,.06); transition:background .12s ease, box-shadow .12s ease; }
        .lc-input:hover, .lc-select:hover { background:#fff; }
        .lc-input:focus, .lc-select:focus { outline:none; background:#fff; box-shadow:0 0 0 3px rgba(37,99,235,.16), inset 0 0 0 1px var(--lc); }
        #stepLandedCost .lc-btn { height:38px; border:0; border-radius:999px; background:var(--lc); color:#fff; padding:0 16px;
          font:650 13px var(--font); cursor:pointer; display:inline-flex; align-items:center; gap:7px;
          box-shadow:0 8px 18px rgba(37,99,235,.22); }
        #stepLandedCost .lc-btn:hover { background:#1D4ED8; }
        #stepLandedCost .lc-btn.secondary { background:#F1F5F9; color:var(--lc-ink); box-shadow:none; }
        #stepLandedCost .lc-btn.secondary:hover { background:#fff; color:#1D4ED8; }
        .lc-kpis { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:10px; margin:0 0 12px; }
        #stepLandedCost .lc-kpi { position:relative; overflow:hidden; border:1px solid rgba(226,232,240,.85); border-radius:14px;
          background:#fff; padding:14px 15px; min-height:78px; box-shadow:0 10px 28px rgba(15,23,42,.04); }
        #stepLandedCost .lc-kpi::before { display:none; }
        .lc-kpi-label { font-size:11px; color:var(--lc-muted); margin-bottom:6px; font-weight:650; }
        .lc-kpi-value { font-size:18px; font-weight:750; color:var(--lc-ink); line-height:1.1; letter-spacing:-.02em; }
        .lc-grid { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr); gap:12px; margin-bottom:12px; }
        #stepLandedCost .lc-card { border:1px solid rgba(226,232,240,.85); border-radius:14px; background:#fff;
          padding:16px; min-height:0; box-shadow:0 10px 28px rgba(15,23,42,.04); }
        .lc-card-title { font-size:14px; font-weight:750; color:var(--lc-ink); margin-bottom:2px; }
        .lc-card-sub { font-size:12px; color:var(--lc-muted); margin-bottom:12px; }
        .lc-pending-card { border:1px solid #FDE68A; border-radius:14px; background:#FFFBEB; padding:14px 16px; margin-bottom:12px; }
        .lc-pending-head { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; margin-bottom:10px; }
        .lc-pending-title { font-size:13px; font-weight:750; color:#9A3412; }
        .lc-pending-sub { font-size:12px; color:#C2410C; margin-top:3px; }
        .lc-pending-badge { white-space:nowrap; border-radius:999px; background:#FFEDD5; color:#9A3412; padding:5px 10px; font-size:11px; font-weight:750; }
        .lc-pending-more { display:flex; align-items:center; gap:8px; margin-top:10px; }
        .lc-pending-toggle { border:1px solid #FDBA74; border-radius:999px; background:#fff; color:#C2410C; padding:6px 11px; font-size:11.5px; font-weight:750; cursor:pointer; }
        .lc-status-pills { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px; }
        .lc-status-pill { border:1px solid #FDBA74; border-radius:999px; background:#fff; color:#9A3412; padding:4px 9px; font-size:11px; font-weight:650; }
        .lc-chart-row { display:grid; grid-template-columns:96px minmax(0,1fr) 72px; gap:8px; align-items:center; margin-bottom:9px; }
        .lc-chart-label { font-size:12px; color:#475569; font-weight:650; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .lc-track { height:9px; border-radius:999px; background:#EEF2F6; overflow:hidden; }
        .lc-fill { height:100%; border-radius:999px; }
        .lc-chart-val { font-size:11px; color:var(--lc-muted); font-weight:700; text-align:right; }
        .lc-country-mix { border-top:1px solid var(--lc-line); margin-top:14px; padding-top:12px; }
        .lc-country-mix-title { font-size:11px; font-weight:750; color:var(--lc-muted); margin-bottom:10px; }
        .lc-country-mix-row { display:grid; grid-template-columns:92px minmax(0,1fr) 58px; gap:8px; align-items:center; margin-bottom:8px; }
        .lc-stacked { height:14px; border-radius:999px; background:#F1F5F9; overflow:hidden; display:flex; }
        .lc-stacked-part { height:100%; min-width:3px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:9px; font-weight:800; }
        .lc-stacked-part.light { color:#1F2937; }
        .lc-table-wrap { overflow-x:auto; border:1px solid var(--lc-line); border-radius:12px; background:#fff; }
        .lc-table { width:100%; border-collapse:collapse; font-size:12px; }
        .lc-table th { text-align:left; color:var(--lc-muted); font-size:10.5px; text-transform:uppercase; letter-spacing:.04em; padding:9px 10px; border-bottom:1px solid var(--lc-line); background:#F1F5F9; }
        .lc-table td { padding:9px 10px; border-bottom:1px solid #EEF2F6; color:#334155; background:#fff; }
        .lc-table tbody tr:nth-child(even) td { background:#F8FAFC; }
        .lc-table tbody tr:hover td { background:#EFF6FF; }
        .lc-country-cell { display:flex; align-items:center; gap:8px; font-weight:750; color:var(--lc-ink); }
        .lc-country-dot { width:8px; height:8px; border-radius:999px; background:var(--country-color); }
        .lc-scenario { margin-bottom:12px; }
        .lc-scope { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; flex-wrap:wrap;
          padding:12px 14px; border-radius:12px; margin:8px 0 12px; }
        .lc-scope-on { background:#EFF6FF; border:1px solid #99F6E4; }
        .lc-scope-warn { background:#FFFBEB; border:1px solid #FDE68A; }
        .lc-scope-off { display:none; }
        .lc-scope-kicker { font-size:10.5px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; color:#2563EB; margin-bottom:4px; }
        .lc-scope-warn .lc-scope-kicker { color:#B45309; }
        .lc-scope h4 { margin:0 0 6px; font-size:14px; font-weight:750; }
        .lc-scope p { margin:0; font-size:12.5px; color:#334155; line-height:1.5; max-width:720px; }
        .lc-scope-meta { display:flex; flex-direction:column; gap:6px; align-items:flex-end; }
        .lc-ref-chip { display:inline-flex; border-radius:999px; background:#2563EB; color:#fff; padding:4px 10px; font-size:11px; font-weight:750; }
        .lc-scope-warn .lc-ref-chip { background:#B45309; }
        .lc-scope-count { font-size:11.5px; font-weight:700; color:#2563EB; }
        .lc-scenario-kpis { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin:12px 0; }
        .lc-scenario-kpi { border:1px solid var(--lc-line); border-radius:12px; padding:12px 14px; background:#F8FAFC; }
        .lc-scenario-kpi span { display:block; font-size:10.5px; font-weight:750; color:var(--lc-muted); margin-bottom:6px; }
        .lc-scenario-kpi b { display:block; font-size:17px; font-weight:750; color:var(--lc-ink); line-height:1.1; }
        .lc-scenario-kpi small { display:block; margin-top:5px; font-size:11px; color:var(--lc-muted); }
        .lc-scenario-kpi.up { background:#FFF7ED; border-color:#FED7AA; }
        .lc-scenario-kpi.up b { color:#9A3412; }
        .lc-scenario-kpi.down { background:#EFF6FF; border-color:#99F6E4; }
        .lc-scenario-kpi.down b { color:#2563EB; }
        .lc-delta.up { color:#B45309; font-weight:750; }
        .lc-delta.down { color:#2563EB; font-weight:750; }
        .lc-delta.flat { color:#94A3B8; font-weight:650; }
        .lc-scenario-note { margin-top:12px; font-size:12px; color:var(--lc-muted); line-height:1.45; }
        .lc-tanim-head { display:flex; justify-content:space-between; gap:12px; align-items:center; margin:4px 0 10px; }
        .lc-tanim-actions { display:flex; gap:8px; flex-wrap:wrap; }
        .lc-tanim-legend { font-size:12px; color:var(--lc-muted); }
        .lc-tanim-table td { vertical-align:top; }
        .lc-tanim-table td small { display:block; margin-top:4px; font-size:10.5px; color:var(--lc-muted); }
        .lc-tanim-table td.dirty { background:#FFFBEB; }
        .lc-tanim-inp { height:34px; text-align:right; min-width:96px; }
        .lc-scenario-mix { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; margin:0 0 12px; }
        .lc-scenario-mix-item { display:flex; justify-content:space-between; gap:8px; align-items:center;
          padding:8px 12px; border:1px solid var(--lc-line); border-radius:10px; background:#fff; font-size:12px; }
        .lc-scenario-mix-item span { color:var(--lc-muted); font-weight:650; }
        .lc-depo-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:0 0 8px; }
        .lc-depo-card { border:1px solid var(--lc-line); border-radius:12px; padding:12px 14px; background:#fff; }
        .lc-depo-card.up { background:#FFF7ED; border-color:#FED7AA; }
        .lc-depo-card.down { background:#EFF6FF; border-color:#99F6E4; }
        .lc-depo-head { display:flex; justify-content:space-between; align-items:center; gap:8px; }
        .lc-depo-tag { font-size:11px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; color:var(--lc-muted); }
        .lc-depo-card b { font-size:20px; }
        .lc-depo-card small { display:block; margin-top:6px; font-size:11px; color:var(--lc-muted); }
        .lc-depo-line { margin-top:6px; font-size:12px; color:#334155; font-weight:650; }
        .lc-depo-avg { font-size:12px; color:var(--lc-muted); line-height:1.45; margin:0 0 10px; }
        .lc-ship-head { display:flex; justify-content:space-between; align-items:center; gap:10px; margin:16px 0 8px; flex-wrap:wrap; }
        .lc-ship-title { font-size:12.5px; font-weight:750; }
        .lc-ship-filters { display:flex; gap:6px; }
        .lc-ship-chip { border:1px solid var(--lc-line); background:#fff; color:#475569; border-radius:999px;
          padding:5px 10px; font-size:11px; font-weight:750; cursor:pointer; }
        .lc-ship-chip.active { background:#0F172A; color:#fff; border-color:#0F172A; }
        .lc-ship-wrap { max-height:440px; overflow:auto; }
        .lc-ship-sub { display:block; margin-top:3px; font-size:10.5px; color:var(--lc-muted); }
        .lc-table tbody tr.lc-ship-anchor td { background:#EFF6FF; }
        .lc-anchor-flag { display:inline-block; margin-left:6px; border-radius:999px; background:#2563EB; color:#fff; padding:2px 7px; font-size:10px; font-weight:750; }
        @media (max-width: 1100px) {
          .lc-scenario-kpis, .lc-scenario-mix { grid-template-columns:1fr 1fr; }
          .lc-kpis { grid-template-columns:repeat(2,minmax(0,1fr)); }
          .lc-grid { grid-template-columns:1fr; }
        }
        @media (max-width: 820px) {
          .lc { flex-direction:column; }
          .lc-side { width:100%; height:auto; max-height:148px; border-right:0; border-bottom:1px solid var(--lc-line); }
          .lc-nav { flex-direction:row; overflow:auto; }
          .lc-nav-item { width:auto; flex-shrink:0; }
        }
        @media (max-width: 640px) {
          .lc-main { padding:14px; }
          .lc-kpis, .lc-scenario-kpis, .lc-scenario-mix, .lc-depo-grid { grid-template-columns:1fr; }
          .lc-period { flex-direction:column; align-items:stretch; }
          .lc-chart-row { grid-template-columns:86px minmax(0,1fr) 66px; }
        }
        /* ── Sadeleştirme (2026-09) ─────────────────────────────────────────── */
        .lc-grid.lc-grid-esit { grid-template-columns:minmax(0,1fr) minmax(0,1fr); }
        .lc-pending-bar { display:flex; align-items:center; gap:10px; width:100%; margin:0 0 12px; padding:9px 14px;
          border:1px solid #FDE68A; border-radius:10px; background:#FFFBEB; color:#92400E; font:12.5px var(--font);
          text-align:left; cursor:pointer; }
        .lc-pending-bar i { font-size:15px; color:#D97706; }
        .lc-pending-bar b { font-weight:650; }
        .lc-pending-bar em { margin-left:auto; font-style:normal; font-weight:600; color:#B45309; white-space:nowrap; }
        .lc-pending-bar:hover { border-color:#FCD34D; }
        .lc-scenario-kpis { grid-template-columns:repeat(3,minmax(0,1fr)) !important; }
        .lc-tanim-legend:empty { display:none; }
        .lc-tanim-head:has(.lc-tanim-legend:empty) { justify-content:flex-end; }
        .lc-tanim-table td:not(.dirty) small { display:none; }
        #lc-scenario-note { display:none; }
        /* ── Fatura Üret / Maliyet Evrak ile aynı dil (2026-09) ─────────────── */
        .lc-side { background:#FFFFFF; }
        .lc-side-h { height:40px; font-size:10.5px; font-weight:600; letter-spacing:.07em; text-transform:uppercase; color:#94A3B8; }
        .lc-nav-item { height:32px; padding:0 10px; border-radius:6px; font-size:12.5px; font-weight:500; color:#334155; }
        .lc-nav-item b { font-size:10.5px; font-weight:500; color:#94A3B8; font-family:var(--mono); }
        .lc-nav-item:hover { background:#F1F5F9; }
        .lc-nav-item.active { position:relative; background:#FFFFFF; color:#0F172A; font-weight:600;
          box-shadow:0 0 0 1px rgba(15,23,42,.08), 0 1px 3px rgba(15,23,42,.06); }
        .lc-nav-item.active::before { content:""; position:absolute; left:0; top:8px; bottom:8px; width:2px; border-radius:2px; background:var(--lc); }
        .lc-nav-item.active b { color:#64748B; }
        .lc-main { padding:14px 20px 24px; background:#F8FAFC; }
        .lc-views { gap:2px; padding:3px; background:#F1F5F9; border:1px solid rgba(15,23,42,.06); border-radius:10px; }
        .lc-view { height:32px; padding:0 14px; border-radius:8px; font-size:12.5px; font-weight:500; color:#64748B; }
        .lc-view:hover { color:#0F172A; background:rgba(255,255,255,.55); }
        .lc-view.active { background:#FFFFFF; color:#0F172A; font-weight:600;
          box-shadow:0 1px 2px rgba(15,23,42,.08), 0 0 0 1px rgba(15,23,42,.04); }
        .lc-period { padding:10px 12px; border-radius:10px; box-shadow:0 1px 2px rgba(15,23,42,.04); align-items:flex-end; }
        .lc-field-label { font-size:10.5px; font-weight:600; color:#64748B; }
        .lc-input, .lc-select { height:34px; border-radius:8px; background:#FFFFFF; font-weight:500; font-size:12.5px;
          box-shadow:inset 0 0 0 1px rgba(15,23,42,.12); }
        .lc-input:hover, .lc-select:hover { box-shadow:inset 0 0 0 1px rgba(15,23,42,.22); }
        .lc-input:focus, .lc-select:focus { box-shadow:0 0 0 3px rgba(37,99,235,.12), inset 0 0 0 1px var(--lc); }
        #stepLandedCost .lc-btn { height:34px; border-radius:8px; padding:0 14px; font-size:12.5px; font-weight:600; box-shadow:none; }
        #stepLandedCost .lc-btn.secondary { background:#FFFFFF; color:#334155; box-shadow:inset 0 0 0 1px rgba(15,23,42,.12); }
        #stepLandedCost .lc-btn.secondary:hover { background:#F8FAFC; color:#0F172A; }
        #stepLandedCost .lc-kpi { border-radius:10px; min-height:0; padding:12px 14px; box-shadow:0 1px 2px rgba(15,23,42,.04); }
        .lc-kpi-label { font-weight:500; }
        .lc-kpi-value { font-size:17px; font-weight:700; }
        #stepLandedCost .lc-card { border-radius:10px; box-shadow:0 1px 2px rgba(15,23,42,.04); }
        .lc-card-title { font-size:13.5px; font-weight:650; }
        .lc-pending-card { border-radius:10px; }
        .lc-pending-badge, .lc-pending-toggle, .lc-status-pill, .lc-ship-chip { border-radius:6px; }
        .lc-table-wrap { border-radius:8px; }
        .lc-table th { background:#FAFBFC; font-weight:600; }
      </style>
      <div class="lc">
        <aside class="lc-side">
          <div class="lc-side-h">Ülkeler</div>
          <div class="lc-nav" id="lc-nav"></div>
        </aside>
        <div class="lc-main">
          <div class="lc-views">
            <button type="button" class="lc-view active" data-view="ozet" onclick="lcSetView('ozet')">Landed Cost</button>
            <button type="button" class="lc-view" data-view="senaryo" onclick="lcSetView('senaryo')">Navlun senaryosu</button>
          </div>
          <div class="lc-period">
            <label class="lc-field">
              <span class="lc-field-label">Başlangıç</span>
              <input class="lc-input" id="lc-date-from" type="date">
            </label>
            <label class="lc-field">
              <span class="lc-field-label">Bitiş</span>
              <input class="lc-input" id="lc-date-to" type="date">
            </label>
            <label class="lc-field">
              <span class="lc-field-label">Depo</span>
              <select class="lc-select" id="lc-depo">
                <option value="">Tümü</option>
                <option value="IHR">Serbest (IHR)</option>
                <option value="ANT">Antrepo (ANT)</option>
              </select>
            </label>
            <label class="lc-field">
              <span class="lc-field-label">Sefer</span>
              <select class="lc-select" id="lc-group-type">
                <option value="all">Tümü</option>
                <option value="single">Tek araç</option>
                <option value="grouped">Gruplu</option>
              </select>
            </label>
            <button class="lc-btn secondary" onclick="clearLandedCostFilters()">Temizle</button>
            <button class="lc-btn secondary" onclick="applyLcKzTarifeDonemi()">KZ · 2 Nisan 2026+</button>
            <button class="lc-btn" onclick="loadLandedCost()">Uygula</button>
            <button class="lc-btn secondary" onclick="downloadLandedCostReport()"><i class="ti ti-file-spreadsheet" aria-hidden="true"></i>Excel</button>
          </div>
          <div id="lc-view-ozet">
          <div class="lc-kpis" id="lc-kpis"></div>
          <div id="lc-pending-panel"></div>
          <div class="lc-grid lc-grid-esit">
            <div class="lc-card">
              <div class="lc-card-title">Maliyet kalemi dağılımı</div>
              <div class="lc-card-sub">Operasyon, navlun, vergi, sigorta</div>
              <div id="lc-cost-mix"></div>
              <div id="lc-country-mix" hidden></div>
            </div>
            <div class="lc-card">
              <div class="lc-card-title">Aylık trend</div>
              <div class="lc-card-sub">Yükleme tarihine göre</div>
              <div id="lc-month-chart"></div>
            </div>
          </div>
          <!-- Ülke grafikleri alttaki detay tablosunu tekrarladığı için gösterilmiyor -->
          <div hidden><div id="lc-country-chart"></div><div id="lc-ratio-chart"></div></div>
          <div class="lc-card">
            <div class="lc-card-title">Ülke bazlı detay</div>
            <div class="lc-card-sub">Seçili filtrelere göre kurumsal ülkeler</div>
            <div id="lc-country-table"></div>
          </div>
          </div>
          <div id="lc-view-senaryo" hidden>
          <div class="lc-card lc-scenario">
            <div class="lc-card-title">Navlun senaryosu</div>
            <div class="lc-card-sub">Soldan ülke seçin; tarife değişince landed cost yeniden hesaplanır.</div>
            <div id="lc-scenario-scope"></div>
            <div id="lc-scenario-tanim"></div>
            <div class="lc-scenario-kpis" id="lc-scenario-kpis"></div>
            <div id="lc-scenario-mix"></div>
            <div id="lc-scenario-table"></div>
            <div id="lc-scenario-shipments"></div>
            <div class="lc-scenario-note" id="lc-scenario-note"></div>
          </div>
          </div>
        </div>
      </div>`;
    renderLandedCostCountryNav();
  }
  lcSetView(landedCostState.view || 'ozet');
  clearLandedCostFilters();
}

function lcSetView(v) {
  landedCostState.view = v === 'senaryo' ? 'senaryo' : 'ozet';
  const ozet = document.getElementById('lc-view-ozet');
  const senaryo = document.getElementById('lc-view-senaryo');
  if (ozet) ozet.hidden = landedCostState.view !== 'ozet';
  if (senaryo) senaryo.hidden = landedCostState.view !== 'senaryo';
  document.querySelectorAll('#stepLandedCost .lc-view').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === landedCostState.view);
  });
}

function renderLandedCostCountryNav() {
  const box = document.getElementById('lc-nav');
  if (!box) return;
  const selected = new Set([...box.querySelectorAll('.lc-nav-item.active[data-country]')].map(b => b.dataset.country));
  const byName = {};
  (landedCostState.data && landedCostState.data.countries || []).forEach(c => {
    byName[c.ulke] = Number(c.landed_cost_eur || 0);
  });
  const total = LC_COUNTRIES.reduce((s, n) => s + (byName[n] || 0), 0);
  const tumOn = selected.size === 0;
  let html = `<button type="button" class="lc-nav-item${tumOn ? ' active' : ''}" id="lc-nav-all" onclick="toggleLandedCostCountry('all')">
    <span>Tüm ülkeler</span><b>${lcEurKisa(total)}</b>
  </button>`;
  html += LC_COUNTRIES.map(country => {
    const on = selected.has(country);
    return `<button type="button" class="lc-nav-item${on ? ' active' : ''}" data-country="${country}"
      style="--country-color:${lcCountryColor(country)};" onclick="toggleLandedCostCountry('${country}')">
      <span style="display:flex;align-items:center;gap:8px;min-width:0;">
        <i class="lc-nav-dot"></i>${lcUlkeEtiket(country)}
      </span>
      <b>${lcEurKisa(byName[country])}</b>
    </button>`;
  }).join('');
  box.innerHTML = html;
}

function getLandedCostParams(opts) {
  const params = new URLSearchParams();
  if (opts && opts.includeCountries) {
    const selected = lcAktifUlkeAdlari();
    if (selected.length) params.set('countries', selected.join(','));
  }
  const dateFrom = document.getElementById('lc-date-from')?.value;
  const dateTo = document.getElementById('lc-date-to')?.value;
  const depo = document.getElementById('lc-depo')?.value;
  const groupType = document.getElementById('lc-group-type')?.value || 'all';
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo) params.set('date_to', dateTo);
  if (depo) params.set('depo', depo);
  if (groupType !== 'all') params.set('group_type', groupType);
  return params;
}

function toggleLandedCostCountry(country) {
  if (country === 'all') {
    document.querySelectorAll('#lc-nav .lc-nav-item[data-country]').forEach(b => b.classList.remove('active'));
    document.getElementById('lc-nav-all')?.classList.add('active');
    lcShowCountryView();
    return;
  }
  document.querySelectorAll('#lc-nav .lc-nav-item[data-country]').forEach(b => {
    b.classList.toggle('active', b.dataset.country === country);
  });
  document.getElementById('lc-nav-all')?.classList.remove('active');
  const btn = document.querySelector(`#lc-nav .lc-nav-item[data-country="${country}"]`);
  if (country === LC_KZ_TARIFE.ulke && btn?.classList.contains('active')) {
    const from = document.getElementById('lc-date-from');
    if (from && (!from.value || from.value < LC_KZ_TARIFE.dateFrom)) {
      from.value = LC_KZ_TARIFE.dateFrom;
      loadLandedCost();
      return;
    }
  }
  lcShowCountryView();
}

function clearLandedCostFilters() {
  const from = document.getElementById('lc-date-from');
  const to = document.getElementById('lc-date-to');
  const depo = document.getElementById('lc-depo');
  const group = document.getElementById('lc-group-type');
  if (from) from.value = '';
  if (to) to.value = '';
  if (depo) depo.value = '';
  if (group) group.value = 'all';
  document.querySelectorAll('#lc-nav .lc-nav-item[data-country]').forEach(btn => btn.classList.remove('active'));
  document.getElementById('lc-nav-all')?.classList.add('active');
  loadLandedCost();
}

async function loadLandedCost() {
  const params = getLandedCostParams();
  const token = localStorage.getItem('fa_auth_token');
  const res = await fetch('/api/landed-cost?' + params.toString(), {
    cache: 'no-store',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await res.json();
  if (!data.success) return;
  landedCostState.data = data;
  renderLandedCost(data);
}

function renderLandedCost(data) {
  const view = lcScopedData(data) || data;
  const summary = view.summary || {};
  const pending = Object.prototype.hasOwnProperty.call(view, 'pending') ? view.pending : null;
  const countries = view.countries || [];
  const months = view.months || [];
  const costItems = [
    { label: 'Operasyon', value: summary.operasyon_eur, color: '#2563EB' },
    { label: 'Navlun', value: summary.navlun_eur, color: '#F59E0B' },
    { label: 'Vergi', value: summary.vergi_eur, color: '#EF4444' },
    { label: 'Sigorta', value: summary.sigorta_eur, color: '#06B6D4' },
  ];

  document.getElementById('lc-kpis').innerHTML = [
    ['Fatura Toplamı', lcFormatEur(summary.fatura_eur)],
    ['Landed Cost', lcFormatEur(summary.landed_cost_eur)],
    ['Maliyet / Fatura', '%' + Math.round(summary.oran || 0)],
    ['Ortalama Sefer Maliyeti', lcFormatEur(summary.ortalama_sefer_maliyeti_eur)],
    ['Sefer / Fatura', `${summary.sefer_sayisi || 0} / ${summary.fatura_sayisi || 0}`],
  ].map(([label, value]) => `
    <div class="lc-kpi"><div class="lc-kpi-label">${label}</div><div class="lc-kpi-value">${value}</div></div>
  `).join('');

  renderLcBarChart('lc-country-chart', countries.slice(0, 9).map(c => ({
    label: lcUlkeEtiket(c.ulke), value: c.landed_cost_eur, display: lcFormatEur(c.landed_cost_eur), color: lcCountryColor(c.ulke),
  })));
  renderLcCountryMix(countries);
  renderLcBarChart('lc-ratio-chart', countries.slice().sort((a, b) => b.oran - a.oran).slice(0, 8).map(c => ({
    label: lcUlkeEtiket(c.ulke), value: c.oran, display: '%' + Math.round(c.oran || 0), color: '#F59E0B',
  })));
  renderLcBarChart('lc-month-chart', months.map(m => ({
    label: m.month, value: m.landed_cost_eur, display: lcFormatEur(m.landed_cost_eur), color: '#22C55E',
  })));
  renderLcMix(costItems);
  renderLcCountryTable(countries);
  landedCostState.pending = pending;
  renderLcPending(pending);
  renderLcNavlunScenario(data);
  renderLandedCostCountryNav();
}

function renderLcBarChart(id, rows) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = '<div style="color:#94A3B8;font-size:12px;padding:16px 0;">Veri yok</div>';
    return;
  }
  const max = Math.max(...rows.map(r => Number(r.value || 0)), 1);
  el.innerHTML = rows.map(r => `
    <div class="lc-chart-row">
      <div class="lc-chart-label">${r.label}</div>
      <div class="lc-track"><div class="lc-fill" style="--bar-color:${r.color};width:${Math.max((r.value / max) * 100, 2)}%;background:${r.color};"></div></div>
      <div class="lc-chart-val">${r.display}</div>
    </div>
  `).join('');
}

function renderLcMix(items) {
  const total = items.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const rows = items.filter(item => item.value > 0);
  const el = document.getElementById('lc-cost-mix');
  if (!el || !rows.length) {
    if (el) el.innerHTML = '<div style="color:#94A3B8;font-size:12px;padding:16px 0;">Veri yok</div>';
    return;
  }
  el.innerHTML = `
    <div style="height:12px;border-radius:999px;background:#F1F5F9;overflow:hidden;display:flex;margin-bottom:14px;">
      ${rows.map(item => `<div style="width:${Math.max((item.value / total) * 100, 3)}%;background:${item.color};"></div>`).join('')}
    </div>
    ${rows.map(item => `
      <div class="lc-chart-row" style="grid-template-columns:92px minmax(0,1fr) 76px;">
        <div class="lc-chart-label">${item.label}</div>
        <div class="lc-track"><div class="lc-fill" style="--bar-color:${item.color};width:${Math.max((item.value / total) * 100, 2)}%;background:${item.color};"></div></div>
        <div class="lc-chart-val">${lcFormatEur(item.value)}</div>
      </div>
    `).join('')}
  `;
}

function renderLcCountryMix(countries) {
  const el = document.getElementById('lc-country-mix');
  if (!el) return;
  const rows = countries.filter(c => Number(c.landed_cost_eur || 0) > 0).slice(0, 9);
  if (!rows.length) {
    el.innerHTML = '';
    return;
  }
  const parts = [
    { key: 'operasyon_eur', color: '#2563EB' },
    { key: 'navlun_eur', color: '#F59E0B', className: 'light' },
    { key: 'vergi_eur', color: '#EF4444' },
    { key: 'sigorta_eur', color: '#06B6D4' },
  ];
  el.innerHTML = `
    <div class="lc-country-mix">
      <div class="lc-country-mix-title">Ülke Bazlı Maliyet Dağılımı</div>
      ${rows.map(country => {
        const total = Math.max(Number(country.landed_cost_eur || 0), 1);
        return `
          <div class="lc-country-mix-row">
            <div class="lc-chart-label">${lcUlkeEtiket(country.ulke || '-')}</div>
            <div class="lc-stacked">
              ${parts.map(part => {
                const value = Number(country[part.key] || 0);
                if (value <= 0) return '';
                const pct = (value / total) * 100;
                const label = pct >= 7 ? `%${Math.round(pct)}` : '';
                return `<div class="lc-stacked-part ${part.className || ''}" style="width:${pct}%;background:${part.color};">${label}</div>`;
              }).join('')}
            </div>
            <div class="lc-chart-val">${lcFormatEur(country.landed_cost_eur)}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderLcCountryTable(countries) {
  const el = document.getElementById('lc-country-table');
  if (!el) return;
  if (!countries.length) {
    el.innerHTML = '<div style="color:#94A3B8;font-size:12px;padding:16px 0;">Kurumsal ülke kaydı yok</div>';
    return;
  }
  el.innerHTML = `
    <div class="lc-table-wrap">
      <table class="lc-table">
        <thead>
          <tr>
            <th>Ülke</th><th>Fatura</th><th>Landed Cost</th><th>Oran</th><th>Operasyon</th><th>Navlun</th><th>Vergi</th><th>Sigorta</th><th>Sefer</th>
          </tr>
        </thead>
        <tbody>
          ${countries.map(c => `
            <tr>
              <td>
                <span class="lc-country-cell" style="--country-color:${lcCountryColor(c.ulke)};">
                  <span class="lc-country-dot"></span>${lcUlkeEtiket(c.ulke)}
                </span>
              </td>
              <td>${lcFormatFullEur(c.fatura_eur)}</td>
              <td>${lcFormatFullEur(c.landed_cost_eur)}</td>
              <td><b>%${Math.round(c.oran || 0)}</b></td>
              <td>${lcFormatFullEur(c.operasyon_eur)}</td>
              <td>${lcFormatFullEur(c.navlun_eur)}</td>
              <td>${lcFormatFullEur(c.vergi_eur)}</td>
              <td>${lcFormatFullEur(c.sigorta_eur)}</td>
              <td>${c.sefer_sayisi || 0}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function toggleLcPendingPanel() {
  landedCostState.pendingOpen = !landedCostState.pendingOpen;
  renderLcPending(landedCostState.pending);
}

function renderLcPending(pending) {
  const el = document.getElementById('lc-pending-panel');
  if (!el) return;

  if (!pending) {
    el.innerHTML = `
      <div class="lc-pending-card">
        <div class="lc-pending-head" style="margin-bottom:0;">
          <div>
            <div class="lc-pending-title">Bekleyen kayıt bilgisi alınamadı</div>
            <div class="lc-pending-sub">API yanıtında pending alanı yok. Sunucu eski kodla çalışıyor olabilir; backend yeniden başlatılınca Brokerage Fee & Other Costs EUR boş/0 olan kurumsal sevkiyatlar burada görünecek.</div>
          </div>
          <div class="lc-pending-badge">kontrol gerekli</div>
        </div>
      </div>
    `;
    return;
  }

  const summary = pending.summary || {};
  const rows = pending.detail || [];
  const count = summary.fatura_sayisi || 0;
  if (!count) {
    el.innerHTML = '';
    return;
  }
  if (!landedCostState.pendingOpen) {
    el.innerHTML = `
      <button type="button" class="lc-pending-bar" onclick="toggleLcPendingPanel()">
        <i class="ti ti-alert-triangle" aria-hidden="true"></i>
        <span><b>${count} fatura</b> (${summary.sefer_sayisi || 0} sefer) hesaba dahil değil — Brokerage / Other Costs EUR eksik</span>
        <em>Listeyi göster</em>
      </button>`;
    return;
  }
  if (!count) {
    el.innerHTML = `
      <div class="lc-pending-card" style="border-color:#BBF7D0;background:#F0FDF4;">
        <div class="lc-pending-head" style="margin-bottom:0;">
          <div>
            <div class="lc-pending-title" style="color:#166534;">Bekleyen landed cost kaydı yok</div>
            <div class="lc-pending-sub" style="color:#15803D;">Seçili filtrelerde Brokerage Fee & Other Costs EUR eksik olan kurumsal sevkiyat bulunmuyor.</div>
          </div>
          <div class="lc-pending-badge" style="background:#DCFCE7;color:#166534;">0 bekleyen</div>
        </div>
      </div>
    `;
    return;
  }

  const statusPills = (summary.by_status || []).map(item => `
    <span class="lc-status-pill">${item.durum}: ${item.sayi}</span>
  `).join('');
  const hasMore = rows.length > 8;
  const shownRows = landedCostState.pendingExpanded ? rows : rows.slice(0, 8);
  const moreText = hasMore
    ? `
      <div class="lc-pending-more">
        <button class="lc-pending-toggle" onclick="toggleLcPendingRows()">
          ${landedCostState.pendingExpanded ? 'Daha az göster' : `+${rows.length - 8} kaydı daha göster`}
        </button>
        ${landedCostState.pendingExpanded ? `<span style="font-size:11px;color:#C2410C;">${rows.length} kaydın tamamı gösteriliyor.</span>` : ''}
      </div>
    `
    : '';

  el.innerHTML = `
    <div class="lc-pending-card">
      <div class="lc-pending-head">
        <div>
          <div class="lc-pending-title">Landed Cost hesabına dahil edilmeyenler</div>
          <div class="lc-pending-sub">Brokerage Fee & Other Costs EUR boş ya da 0 olduğu için bu kurumsal sevkiyatlar ana hesaplardan çıkarıldı.</div>
        </div>
        <button type="button" class="lc-pending-toggle" onclick="toggleLcPendingPanel()">Gizle</button>
      </div>
      <div class="lc-status-pills">${statusPills}</div>
      <div class="lc-table-wrap">
        <table class="lc-table">
          <thead>
            <tr>
              <th>Fatura</th><th>Dosya</th><th>Ülke</th><th>Depo</th><th>Yükleme</th><th>Durum</th><th>Fatura EUR</th>
            </tr>
          </thead>
          <tbody>
            ${shownRows.map(row => `
              <tr>
                <td><b>${row.fatura_no || '-'}</b></td>
                <td>${row.ihracat_dosya_no || '-'}</td>
                <td>${row.ulke || '-'}</td>
                <td>${row.depo || '-'}</td>
                <td>${row.yukleme_tarihi || '-'}</td>
                <td>${row.durum || '-'}</td>
                <td>${lcFormatFullEur(row.fatura_eur)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${moreText}
    </div>
  `;
}

function toggleLcPendingRows() {
  landedCostState.pendingExpanded = !landedCostState.pendingExpanded;
  if (landedCostState.data) renderLandedCost(landedCostState.data);
}

async function downloadLandedCostReport() {
  const params = getLandedCostParams({ includeCountries: true });
  const token = localStorage.getItem('fa_auth_token');
  const res = await fetch('/api/landed-cost/export?' + params.toString(), {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const contentType = res.headers.get('Content-Type') || '';
  if (!res.ok || contentType.includes('application/json')) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    alert('Rapor indirilemedi: ' + (err.error || 'Sunucu hatası'));
    return;
  }
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `landed_cost_raporu_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}
