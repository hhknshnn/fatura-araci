# Proje: Excel Fatura ve Evrak Hazırlama Uygulaması

## Amaç
Excel verilerini kullanarak otomatik olarak INV (Invoice) ve PL (Packing List) evrakları oluşturmak.

---

## Genel Kurallar

- Mevcut çalışan kodu ASLA bozma
- Gereksiz refactor yapma
- Minimum değişiklik ile ilerle
- Yeni bağımlılık ekleme
- Kod sade ve okunabilir olsun
- Aynı işi tekrar eden kod yazma

---

## Uygulama Akışı

Kullanıcı seçim yapar:

1. Fatura Öncesi / Fatura Sonrası
2. Serbest Depo / Antrepo
3. Menşe ayrımı var / yok
4. Ülke seçimi

---

## Ülke Grupları

### Menşe ayrımı gerekmeyen:
- Bosna
- Gürcistan
- Kosova
- Makedonya
- Sırbistan

### Diğer ülkeler:
- Standart akış

---

## Evrak Tipleri

- INV (Invoice)
- PL (Packing List)

Her ülkenin:
- kolon yapısı farklı olabilir
- mapping farklı olabilir

---

## Veri Kaynağı

- Excel dosyası kullanıcı tarafından seçilir
- Kaynak sheet adı sabit olmayabilir
- Header kopyalanmaz
- Veri belirli kolonlardan alınır

---

## Mapping Mantığı

- Kolonlar sabit hücrelere yazılır
- Örnek:
  - AC → B13
  - AJ → C13
  - E → D13
  - AE → E13
  - Y → F13
  - J → G13
  - K → H13
  - L → I13
  - R → K13
  - AB → L13
  - AR → M13
  - AS → N13
  - AT → O13
  - AL → P13

---

## Hesaplamalar

- Bazı kolonlar formül içerir
- Örnek:
  - J sütunu = H * I

---

## UI Kuralları

- Basit ve modern arayüz
- Dropdown ile seçim
- Kullanıcıyı yönlendiren yapı
- Gereksiz karmaşıklık yok

---

## Dosya İşleme

- Kullanıcı dosya seçer
- Çıktı otomatik oluşturulur
- Dosya indirilebilir olmalı

---

## Geliştirme Prensibi

Claude şu şekilde çalışmalı:

1. Önce ilgili dosyaları bul
2. Tüm projeyi analiz etme (sadece gerekli kısım)
3. Küçük ve güvenli değişiklik yap
4. Gereksiz dosyaya dokunma
5. Büyük değişiklik yapmadan önce plan sun

---

## Yasaklar

- Tüm projeyi baştan yazma
- Gereksiz optimizasyon yapma
- UI’yı durduk yere değiştirme
- Mapping mantığını bozma

---

## Hedef

- Modüler yapı
- Ülke bazlı config sistemi
- Tek kod → çok ülke desteği