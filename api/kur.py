# api/kur.py
# exchangerate-api.com'dan günlük döviz kurlarını çeker

import urllib.request
import json

def get_tcmb_kurlar():
    """EUR bazlı TRY ve USD kurlarını çeker."""
    try:
        url = 'https://api.exchangerate-api.com/v4/latest/EUR'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
        
        rates = data.get('rates', {})
        return {
            'EUR': 1.0,
            'TRY': float(rates.get('TRY', 0)),
            'USD': float(rates.get('USD', 0)),
        }
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
    # EUR bazlı: 1 EUR = X USD, yani 1 USD = 1/X EUR
    return round(float(usd_amount) / float(usd_rate), 2)
