# api/maliyet/oran_karsilastirma.py
# Tümü: ülke bazlı Logistics / Turnover karşılaştırması.

import calendar
import datetime
import logging
import os
import re

from flask import jsonify, request

from api.maliyet.meta import kurumsal_ulkeler, MALIYET_HARIC_ULKELER
from api.maliyet.ulke_tablo import tablo_yukle, ulke_ciro_yukle, _ay_hesap, _schema

_BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_TABLO_DIR = os.path.join(_BASE, 'data', 'maliyet_tablo')


def _parse_date(value):
    try:
        return datetime.date.fromisoformat(str(value or '').strip())
    except ValueError:
        return None


def _ay_aralik(start, end):
    if not start or not end or start > end:
        return []
    cur = datetime.date(start.year, start.month, 1)
    last = datetime.date(end.year, end.month, 1)
    out = []
    while cur <= last:
        out.append(cur.strftime('%Y-%m'))
        if cur.month == 12:
            cur = datetime.date(cur.year + 1, 1, 1)
        else:
            cur = datetime.date(cur.year, cur.month + 1, 1)
    return out


def _bosna_aylik_map(yil):
    """{YYYY-MM: {lojistik, ciro_eur}} — taxes hariç lojistik."""
    from api.maliyet.bosna_excel import (
        bosna_aylik_rapor, bosna_ciro_uygula, ensure_tutar_bam_kolon,
    )
    from api.db import get_conn

    yil = str(yil)
    start = datetime.date(int(yil), 1, 1)
    end = datetime.date(int(yil), 12, 31)
    conn = get_conn()
    cur = conn.cursor()
    try:
        ensure_tutar_bam_kolon(cur)
        conn.commit()
        cur.execute('''
            SELECT f.fatura_no, f.donem_baslangic, k.kod, fk.miktar, fk.tutar, fk.tarih, fk.aciklama, fk.tutar_bam
            FROM maliyet_faturalari f
            JOIN maliyet_fatura_kalemleri fk ON fk.fatura_id = f.id
            JOIN maliyet_kalemleri k ON k.id = fk.kalem_id
            WHERE f.ulke = 'ba'
              AND COALESCE(fk.tarih, f.donem_baslangic) BETWEEN %s AND %s
        ''', (start, end))
        satirlar = []
        for fno, donem_bas, kod, miktar, tutar, tarih, aciklama, tutar_bam in cur.fetchall():
            gun = tarih or donem_bas
            satirlar.append({
                'fatura_no': fno,
                'donem': gun.strftime('%Y-%m') if gun else None,
                'tarih': gun.isoformat() if gun else None,
                'kalem_kod': kod,
                'miktar': float(miktar or 0),
                'tutar': float(tutar or 0),
                'tutar_bam': float(tutar_bam) if tutar_bam is not None else None,
                'aciklama': aciklama or '',
            })
    finally:
        cur.close()
        conn.close()
    rapor = bosna_ciro_uygula(bosna_aylik_rapor(satirlar), overwrite=True)
    out = {}
    for a in rapor.get('aylar') or []:
        ay = a.get('ay')
        if not ay:
            continue
        out[ay] = {
            'lojistik': float(a.get('lojistik') or 0),
            'ciro_eur': float(a.get('ciro_eur') or 0),
        }
    return out


def _ulke_aylik_map(ulke, yil):
    rapor = tablo_yukle(ulke)
    schema = _schema(ulke)
    items = schema['items']
    ciro = (ulke_ciro_yukle().get(ulke) or {})
    by = {}
    for a in rapor.get('aylar') or []:
        ay = a.get('ay')
        if not ay or not str(ay).startswith(str(yil)):
            continue
        row = _ay_hesap(dict(a), items)
        if not row.get('ciro_eur') and ciro.get(ay):
            row['ciro_eur'] = float(ciro[ay])
        by[ay] = {
            'lojistik': float(row.get('lojistik') or 0),
            'ciro_eur': float(row.get('ciro_eur') or 0),
        }
    for ay, v in ciro.items():
        if str(ay).startswith(str(yil)) and ay not in by:
            by[ay] = {'lojistik': 0.0, 'ciro_eur': float(v or 0)}
    return by


def maliyet_oran_karsilastirma_get():
    """GET /api/maliyet/oran-karsilastirma?start=&end="""
    start = _parse_date(request.args.get('start'))
    end = _parse_date(request.args.get('end'))
    if not start or not end or start > end:
        n = datetime.date.today()
        start = datetime.date(n.year, 1, 1)
        last = calendar.monthrange(n.year, n.month)[1]
        end = datetime.date(n.year, n.month, last)

    aylar = _ay_aralik(start, end)
    yillar = sorted({a[:4] for a in aylar}) or [str(datetime.date.today().year)]

    labels = {u['kod']: u['label'] for u in kurumsal_ulkeler()}
    kodlar = set(labels)
    kodlar.update(ulke_ciro_yukle().keys())
    if os.path.isdir(_TABLO_DIR):
        for fn in os.listdir(_TABLO_DIR):
            if fn.endswith('.json') and re.fullmatch(r'[a-z]{2}\.json', fn):
                kodlar.add(fn[:-5])
    kodlar -= set(MALIYET_HARIC_ULKELER)

    ulke_maps = {}
    for yil in yillar:
        try:
            ba = _bosna_aylik_map(yil)
            if ba:
                ulke_maps.setdefault('ba', {}).update(ba)
        except Exception:
            logging.exception('oran ba %s', yil)
        for kod in sorted(kodlar):
            if kod == 'ba':
                continue
            try:
                mp = _ulke_aylik_map(kod, yil)
                if mp:
                    ulke_maps.setdefault(kod, {}).update(mp)
            except Exception:
                logging.exception('oran %s', kod)

    rows = []
    aylik_ortak = set()
    for kod, mp in ulke_maps.items():
        filt = {ay: mp[ay] for ay in aylar if ay in mp}
        if not filt:
            continue
        # Dönem oranı: yalnız ciro'su olan ayların lojistiği (ciro'suz ay oranı şişirmesin)
        loj_oran = sum(v['lojistik'] for v in filt.values() if v['ciro_eur'] > 0.005)
        ciro = sum(v['ciro_eur'] for v in filt.values())
        loj = sum(v['lojistik'] for v in filt.values())
        aylik = []
        for ay in sorted(filt):
            v = filt[ay]
            oran = (v['lojistik'] / v['ciro_eur'] * 100) if v['ciro_eur'] > 0.005 else None
            aylik.append({
                'ay': ay,
                'lojistik': round(v['lojistik'], 2),
                'ciro_eur': round(v['ciro_eur'], 2),
                'oran': round(oran, 2) if oran is not None else None,
            })
            if oran is not None:
                aylik_ortak.add(ay)
        donem_oran = (loj_oran / ciro * 100) if ciro > 0.005 else None
        rows.append({
            'ulke': kod,
            'label': labels.get(kod, kod.upper()),
            'lojistik': round(loj, 2),
            'lojistik_oran': round(loj_oran, 2),
            'ciro_eur': round(ciro, 2),
            'oran': round(donem_oran, 2) if donem_oran is not None else None,
            'aylik': aylik,
            'ay_sayisi_ciro': sum(1 for a in aylik if a['ciro_eur'] > 0.005),
            'ay_sayisi_loj_eksik_ciro': sum(
                1 for a in aylik if a['lojistik'] > 0.005 and a['ciro_eur'] <= 0.005
            ),
        })

    rows = [r for r in rows if r['lojistik'] > 0.005 or r['ciro_eur'] > 0.005]
    rows.sort(key=lambda r: (r['oran'] is None, r['oran'] if r['oran'] is not None else 999))

    oranli = [r for r in rows if r['oran'] is not None]
    ort = round(sum(r['oran'] for r in oranli) / len(oranli), 2) if oranli else None
    en_iyi = min(oranli, key=lambda r: r['oran']) if oranli else None
    en_yuksek = max(oranli, key=lambda r: r['oran']) if oranli else None
    tot_loj = sum(r['lojistik'] for r in rows)
    tot_loj_oran = sum(r.get('lojistik_oran') or 0 for r in rows)
    tot_ciro = sum(r['ciro_eur'] for r in rows)

    aylik_seri = []
    for ay in sorted(aylik_ortak):
        nokta = {'ay': ay, 'ulkeler': {}}
        for r in rows:
            hit = next((x for x in r['aylik'] if x['ay'] == ay), None)
            if hit and hit['oran'] is not None:
                nokta['ulkeler'][r['ulke']] = hit['oran']
        if nokta['ulkeler']:
            aylik_seri.append(nokta)

    return jsonify({
        'success': True,
        'start': start.isoformat(),
        'end': end.isoformat(),
        'ozet': {
            'ulke_sayisi': len(rows),
            'oran_ulke_sayisi': len(oranli),
            'ortalama_oran': ort,
            'en_iyi': {'ulke': en_iyi['ulke'], 'label': en_iyi['label'], 'oran': en_iyi['oran']} if en_iyi else None,
            'en_yuksek': {'ulke': en_yuksek['ulke'], 'label': en_yuksek['label'], 'oran': en_yuksek['oran']} if en_yuksek else None,
            'toplam_lojistik': round(tot_loj, 2),
            'toplam_lojistik_oran': round(tot_loj_oran, 2),
            'toplam_ciro': round(tot_ciro, 2),
            'genel_oran': round(tot_loj_oran / tot_ciro * 100, 2) if tot_ciro > 0.005 else None,
        },
        'ulkeler': rows,
        'aylik': aylik_seri,
    })
