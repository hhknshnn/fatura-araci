# api/kur.py
# Günlük döviz kurları (exchangerate-api, EUR bazlı) + Kur Yönetimi paneli.

import json
import os
import urllib.request
from datetime import datetime

from flask import jsonify

# Operasyonda kullanılan / maliyet panellerinde görülen para birimleri
_OPERASYON_PARALAR = ('EUR', 'TRY', 'USD', 'GEL', 'BAM', 'MKD', 'RSD', 'KZT')

# BAM resmi sabit kur (KM → EUR)
BAM_EUR_SABIT = 1.95583
_LAST_META = {'date': None, 'source': 'exchangerate-api.com'}

_PARA_META = {
    'EUR': {'ad': 'Euro', 'sembol': '€', 'bayrak': '🇪🇺'},
    'TRY': {'ad': 'Türk Lirası', 'sembol': '₺', 'bayrak': '🇹🇷'},
    'USD': {'ad': 'ABD Doları', 'sembol': '$', 'bayrak': '🇺🇸'},
    'GEL': {'ad': 'Gürcistan Larisi', 'sembol': '₾', 'bayrak': '🇬🇪'},
    'BAM': {'ad': 'Bosna Markı', 'sembol': 'KM', 'bayrak': '🇧🇦'},
    'MKD': {'ad': 'Makedon Dinarı', 'sembol': 'ден', 'bayrak': '🇲🇰'},
    'RSD': {'ad': 'Sırp Dinarı', 'sembol': 'дин', 'bayrak': '🇷🇸'},
    'KZT': {'ad': 'Kazak Tengesi', 'sembol': '₸', 'bayrak': '🇰🇿'},
}

# Çalışılan ülkeler — fatura / maliyet yerel para bağlamı
_ULKE_KUR = [
    # Kurumsal
    {'kod': 'rs', 'label': 'Sırbistan', 'grup': 'kurumsal', 'fatura': 'TRY', 'yerel': ['RSD'], 'not': 'INV TRY; yerel RSD'},
    {'kod': 'ba', 'label': 'Bosna', 'grup': 'kurumsal', 'fatura': 'TRY', 'yerel': ['BAM'], 'not': 'INV TRY; maliyet BAM (EUR’a sabit)'},
    {'kod': 'ge', 'label': 'Gürcistan', 'grup': 'kurumsal', 'fatura': 'TRY', 'yerel': ['GEL', 'USD'], 'not': 'INV TRY; depo GEL; navlun USD'},
    {'kod': 'xk', 'label': 'Kosova', 'grup': 'kurumsal', 'fatura': 'EUR', 'yerel': ['EUR'], 'not': 'EUR (resmi)'},
    {'kod': 'mk', 'label': 'Makedonya', 'grup': 'kurumsal', 'fatura': 'EUR', 'yerel': ['MKD', 'EUR'], 'not': 'Lojistik EUR; vergi MKD'},
    {'kod': 'be', 'label': 'Belçika', 'grup': 'kurumsal', 'fatura': 'EUR', 'yerel': ['EUR'], 'not': 'EUR'},
    {'kod': 'de', 'label': 'Almanya', 'grup': 'kurumsal', 'fatura': 'EUR', 'yerel': ['EUR'], 'not': 'EUR'},
    {'kod': 'nl', 'label': 'Hollanda', 'grup': 'kurumsal', 'fatura': 'EUR', 'yerel': ['EUR'], 'not': 'EUR'},
    {'kod': 'kz', 'label': 'Kazakistan', 'grup': 'kurumsal', 'fatura': 'TRY', 'yerel': ['KZT', 'USD'], 'not': 'INV TRY; yerel KZT; navlun USD'},
    # Franchise / toptan
    {'kod': 'ru', 'label': 'Rusya', 'grup': 'franchise', 'fatura': 'TRY', 'yerel': ['TRY'], 'not': 'INV TRY'},
    {'kod': 'cy', 'label': 'Kıbrıs', 'grup': 'franchise', 'fatura': 'TRY', 'yerel': ['EUR', 'TRY'], 'not': 'INV TRY; yerel EUR'},
    {'kod': 'uz', 'label': 'Özbekistan', 'grup': 'franchise', 'fatura': 'USD', 'yerel': ['USD'], 'not': 'INV USD'},
    {'kod': 'iq', 'label': 'Irak', 'grup': 'franchise', 'fatura': 'USD', 'yerel': ['USD'], 'not': 'INV USD'},
    {'kod': 'ly', 'label': 'Libya', 'grup': 'franchise', 'fatura': 'USD', 'yerel': ['USD'], 'not': 'INV USD'},
    {'kod': 'lr', 'label': 'Liberya', 'grup': 'franchise', 'fatura': 'USD', 'yerel': ['USD'], 'not': 'INV USD'},
    {'kod': 'lb', 'label': 'Lübnan', 'grup': 'franchise', 'fatura': 'USD', 'yerel': ['USD'], 'not': 'INV USD'},
    {'kod': 'jo', 'label': 'Ürdün', 'grup': 'franchise', 'fatura': 'USD', 'yerel': ['USD'], 'not': 'INV USD'},
    {'kod': 'abh', 'label': 'Abhazya', 'grup': 'toptan', 'fatura': 'USD', 'yerel': ['USD'], 'not': 'INV USD'},
    {'kod': 'mu', 'label': 'Mauritius', 'grup': 'toptan', 'fatura': 'USD', 'yerel': ['USD'], 'not': 'INV USD'},
]


def get_tcmb_kurlar():
    """EUR bazlı kurlar. Geriye uyumlu: en az EUR/TRY/USD/GEL."""
    try:
        url = 'https://api.exchangerate-api.com/v4/latest/EUR'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read())

        rates = data.get('rates', {}) or {}
        out = {'EUR': 1.0}
        for kod in _OPERASYON_PARALAR:
            if kod == 'EUR':
                continue
            if kod == 'BAM':
                out['BAM'] = float(rates.get('BAM') or BAM_EUR_SABIT)
            else:
                v = rates.get(kod)
                if v is not None:
                    out[kod] = float(v)
        _LAST_META['date'] = data.get('date')
        _LAST_META['source'] = 'exchangerate-api.com'
        return out
    except Exception as e:
        print(f'Kur API hatası: {e}')
        return {}


def try_to_eur(try_amount, eur_kuru):
    """TRY tutarı EUR'ya çevirir."""
    if not eur_kuru or eur_kuru <= 0:
        return 0.0
    return round(float(try_amount) / float(eur_kuru), 2)


def usd_to_eur(usd_amount, kurlar):
    """USD tutarı EUR'ya çevirir."""
    usd_rate = kurlar.get('USD', 0)
    if not usd_rate or usd_rate <= 0:
        return 0.0
    return round(float(usd_amount) / float(usd_rate), 2)


def _cevir(amount, from_cur, to_cur, kurlar):
    """EUR-bazlı ara geçiş: amount in from → to."""
    from_cur = (from_cur or 'EUR').upper()
    to_cur = (to_cur or 'EUR').upper()
    if from_cur == to_cur:
        return float(amount)
    fr = float(kurlar.get(from_cur) or 0)
    to = float(kurlar.get(to_cur) or 0)
    if from_cur == 'EUR':
        fr = 1.0
    if to_cur == 'EUR':
        to = 1.0
    if fr <= 0 or to <= 0:
        return None
    # amount_from / fr = EUR, * to = target
    return round(float(amount) / fr * to, 6)


def maliyet_kur_panel_get():
    """GET /api/kur/panel — Kur Yönetimi için zengin yanıt."""
    kurlar = get_tcmb_kurlar()
    if not kurlar or not kurlar.get('TRY'):
        return jsonify({'success': False, 'error': 'Kurlar alınamadı'}), 502

    tarih = _LAST_META.get('date') or datetime.utcnow().strftime('%Y-%m-%d')
    kaynak = _LAST_META.get('source') or 'exchangerate-api.com'

    paralar = []
    for kod in _OPERASYON_PARALAR:
        rate = kurlar.get(kod)
        if rate is None and kod != 'EUR':
            continue
        meta = _PARA_META.get(kod, {})
        item = {
            'kod': kod,
            'ad': meta.get('ad', kod),
            'sembol': meta.get('sembol', kod),
            'bayrak': meta.get('bayrak', ''),
            'eur_kuru': 1.0 if kod == 'EUR' else float(rate),
            'try_kuru': _cevir(1, kod, 'TRY', {**kurlar, 'EUR': 1.0}),
            'usd_kuru': _cevir(1, kod, 'USD', {**kurlar, 'EUR': 1.0}),
        }
        if kod == 'BAM':
            item['sabit_eur'] = BAM_EUR_SABIT
            item['not'] = f'Resmi sabit: 1 € = {BAM_EUR_SABIT} BAM'
        paralar.append(item)

    ulkeler = []
    for u in _ULKE_KUR:
        fatura = u['fatura']
        ulkeler.append({
            **u,
            'fatura_meta': _PARA_META.get(fatura, {}),
            'kurlar': {
                p: kurlar.get(p) if p != 'EUR' else 1.0
                for p in ([fatura] + list(u.get('yerel') or []))
                if p == 'EUR' or kurlar.get(p) is not None
            },
        })

    return jsonify({
        'success': True,
        'baz': 'EUR',
        'tarih': tarih,
        'kaynak': kaynak,
        'guncelleme': datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC'),
        'kurlar': {k: v for k, v in kurlar.items() if not str(k).startswith('_')},
        'paralar': paralar,
        'ulkeler': ulkeler,
        'bam_sabit': BAM_EUR_SABIT,
    })
