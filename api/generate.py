import sys as _sys, os as _os
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

from invoice.helpers   import parse_pdf
from invoice.constants import EXCEPTION_SKUS

# ── Engine importları ─────────────────────────────────────────────────────────
from invoice.try_engine import (
    generate_rs, generate_kz, generate_ru,
    generate_ba, generate_ge,
)
from invoice.eur_engine import (
    generate_xk, generate_mk, generate_be,
    generate_de, generate_nl,
)
from invoice.usd_engine import (
    generate_iq, generate_ly, generate_lr,
    generate_lb, generate_uz, generate_abh,
    generate_jo, generate_mu,
)
from invoice.cy_engine import generate_cy


# ── Dispatcher ────────────────────────────────────────────────────────────────

def dispatch(ulke_kodu, df, df_original, grup_kilolari, hedef_brut, hedef_net,
             depo_tipi, exception_skus, logo_bytes, pdf_fields,
             eur_kuru=1.0, usd_kuru=1.0):
    """
    Ülke koduna göre doğru engine fonksiyonunu çağırır.
    Dönen tuple: (excel_bytes, fatura_no, master_bytes, price_list_bytes|None, mill_test_bytes|None)
    """
    kw = dict(
        grup_kilolari=grup_kilolari,
        hedef_brut=hedef_brut,
        exception_skus=exception_skus,
        logo_bytes=logo_bytes,
        pdf_fields=pdf_fields,
        hedef_net=hedef_net,
        depo_tipi=depo_tipi,
        df_original=df_original,
    )

    # ── TRY ───────────────────────────────────────────────────────────────────
    if ulke_kodu == 'rs':
        excel_out, fatura_no, master_out = generate_rs(df, **kw)
        return excel_out, fatura_no, master_out, None, None

    if ulke_kodu == 'ba':
        excel_out, fatura_no, master_out = generate_ba(df, **kw)
        return excel_out, fatura_no, master_out, None, None

    if ulke_kodu == 'ge':
        excel_out, fatura_no, master_out = generate_ge(df, **kw)
        return excel_out, fatura_no, master_out, None, None

    if ulke_kodu == 'kz':
        # Kazakistan — price_list PDF ekstra
        excel_out, fatura_no, master_out, price_list_out = generate_kz(df, **kw)
        return excel_out, fatura_no, master_out, price_list_out, None

    if ulke_kodu == 'ru':
        excel_out, fatura_no, master_out = generate_ru(df, **kw)
        return excel_out, fatura_no, master_out, None, None

    # ── EUR ───────────────────────────────────────────────────────────────────
    if ulke_kodu == 'xk':
        excel_out, fatura_no, master_out = generate_xk(df, eur_kuru=eur_kuru, **kw)
        return excel_out, fatura_no, master_out, None, None

    if ulke_kodu == 'mk':
        excel_out, fatura_no, master_out = generate_mk(df, eur_kuru=eur_kuru, **kw)
        return excel_out, fatura_no, master_out, None, None

    if ulke_kodu == 'de':
        excel_out, fatura_no, master_out = generate_de(df, eur_kuru=eur_kuru, **kw)
        return excel_out, fatura_no, master_out, None, None

    if ulke_kodu == 'nl':
        excel_out, fatura_no, master_out = generate_nl(df, eur_kuru=eur_kuru, **kw)
        return excel_out, fatura_no, master_out, None, None

    if ulke_kodu == 'be':
        # Belçika — mill_test PDF ekstra
        excel_out, fatura_no, master_out, mill_test_out = generate_be(df, eur_kuru=eur_kuru, **kw)
        return excel_out, fatura_no, master_out, None, mill_test_out

    # ── USD ───────────────────────────────────────────────────────────────────
    if ulke_kodu == 'iq':
        excel_out, fatura_no, master_out = generate_iq(df, usd_kuru=usd_kuru, **kw)
        return excel_out, fatura_no, master_out, None, None

    if ulke_kodu == 'ly':
        excel_out, fatura_no, master_out = generate_ly(df, usd_kuru=usd_kuru, **kw)
        return excel_out, fatura_no, master_out, None, None

    if ulke_kodu == 'lr':
        excel_out, fatura_no, master_out = generate_lr(df, usd_kuru=usd_kuru, **kw)
        return excel_out, fatura_no, master_out, None, None

    if ulke_kodu == 'lb':
        excel_out, fatura_no, master_out = generate_lb(df, usd_kuru=usd_kuru, **kw)
        return excel_out, fatura_no, master_out, None, None

    if ulke_kodu == 'uz':
        excel_out, fatura_no, master_out = generate_uz(df, **kw)
        return excel_out, fatura_no, master_out, None, None

    if ulke_kodu == 'abh':
        excel_out, fatura_no, master_out = generate_abh(df, usd_kuru=usd_kuru, **kw)
        return excel_out, fatura_no, master_out, None, None

    if ulke_kodu == 'jo':
        excel_out, fatura_no, master_out = generate_jo(df, usd_kuru=usd_kuru, **kw)
        return excel_out, fatura_no, master_out, None, None

    if ulke_kodu == 'mu':
        excel_out, fatura_no, master_out = generate_mu(df, usd_kuru=usd_kuru, **kw)
        return excel_out, fatura_no, master_out, None, None

    raise ValueError(f'Bilinmeyen ülke kodu: {ulke_kodu}')
