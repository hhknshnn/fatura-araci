# Vercel Cleanup Backup - 2026-07-02

Bu klasor, Vercel/serverless kalintilari ve kullanilmayan backup dosyalari silinmeden once alinan yedektir.

## Aktif dosyalardan temizlenen bloklar

- `api/generate.py`: `BaseHTTPRequestHandler` tabanli eski HTTP handler ve sadece ona ait importlar kaldirildi.
- `api/evrak.py`: eski Vercel handler sinifi ve sadece ona ait importlar kaldirildi.
- `api/taslak.py`: eski Vercel handler sinifi ve sadece ona ait importlar kaldirildi.

## Calisma agacindan kaldirilan dosyalar

- `vercel.json`
- `api_backup/`
- `api/auth_cloudflare_backup.py`
- `app.py.bak`

## Bilerek dokunulmayanlar

- `api/invoice/*`
- `app.py`
- `api/shipments.py`
- frontend dosyalari
- `.zip` arsivleri
