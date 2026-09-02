# Fatura Araci

VDS uzerinde calisan Python Flask tabanli fatura, taslak, evrak ve shipment yonetim uygulamasi.

Bu proje Vercel/serverless degildir. Ana giris noktasi `app.py` dosyasidir.

## Hızlı Başlangıç

```bash
python3 app.py
```

Port `config.json` icinden okunur; yoksa `8080` kullanilir.

## Ana Bilesenler

- `app.py`: Flask route'lari, statik dosya servisi ve API girisleri.
- `api/generate.py`: `/api/generate` icin ulke bazli dispatcher.
- `api/invoice/*`: INV/PL/master uretim motorlari.
- `api/taslak.py`: Taslak Excel doldurma motoru.
- `api/evrak.py`: PDF sablon uzerine ek evrak uretimi.
- `api/shipments.py`: Shipment kayitlari, parserlar ve toplu islemler.
- `js/*`: Frontend ekranlari ve API cagri mantigi.
- `templates/*`: Excel/PDF sablonlari.
- `config/*`: Ulke, taslak ve evrak mapping ayarlari.

Detayli mimari ve gelistirme notlari icin [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) dosyasina bakin.
