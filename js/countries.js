// ── ÜLKE TANIMLARI ──────────────────────────────────────────────────────────
// Bu dosya tüm ülkelerin çıktı sütunlarını tanımlar.
// Yeni ülke eklemek için sadece bu dosyayı düzenlemen yeterli.

// Her ülkenin kısa kodu, Türkçe adı ve indirilen dosyanın son eki burada tanımlanır.
const COUNTRIES = {
  kz: { label: 'Kazakistan', suffix: '_kazakistan' },
  rs: { label: 'Sırbistan',  suffix: '_sirbistan'  },
  iq: { label: 'Irak',       suffix: '_irak'        },
  ge: { label: 'Gürcistan',  suffix: '_gurcistan'   },
  cy: { label: 'KKTC',       suffix: '_kktc'        },
  ru: { label: 'Rusya',      suffix: '_rusya'        },
  ba: { label: 'Bosna',      suffix: '_bosna'        },
  be: { label: 'Belçika',    suffix: '_belcika'      },
};

// Kazakistan için çıktıya alınacak sütunlar — sıra önemlidir!
// Bu sütun adları hem master Excel'deki sütun adlarıyla hem de çıktı başlıklarıyla eşleşir.
// BRÜT ve NET otomatik hesaplanır, bu yüzden en sona eklenir.
const KZ_COLS = [
  'E-Fatura Seri Numarası', // fatura numarası
  'Madde Kodu',             // ürün kodu
  'MENŞEİ -EN',             // menşei İngilizce
  'MENŞEİ -RU',             // menşei Rusça
  'Asorti Barkodu',         // asorti barkod
  'SKU',                    // stok kodu
  'Renk Açıkmalası EN',     // renk açıklaması İngilizce
  'GTİP',                   // gümrük tarife kodu
  'ALT GRUBU -EN',          // alt grup İngilizce
  'Ürün Açıklaması EN',     // ürün açıklaması İngilizce
  'Ürün Açıklaması RU',     // ürün açıklaması Rusça
  'Miktar',                 // adet
  'Fiyat',                  // birim fiyat
  'MATERYAL -EN',           // materyal İngilizce
  'MATERYAL -RU',           // materyal Rusça
  'ALT GRUBU Açıklama',     // alt grup açıklaması
  'EBAT Açıklama',          // ebat açıklaması
  'BRÜT',                   // brüt ağırlık (hesaplanır)
  'NET',                    // net ağırlık (BRÜT × 0.9)
];

// Sırbistan INV sheet sütunları
// "out" → çıktı dosyasında görünecek sütun adı
// "src" → master Excel'deki kaynak sütun adı
// "__CALC__" → özel kod: Miktar × Fiyat hesaplar
// "Birim Cinsi (1)" → özel: "AD" değerini otomatik "PCS" yapar
const RS_INV = [
  { out: 'COUNTRY OF ORIGIN', src: 'MENŞEİ -EN'         },
  { out: 'MASTER ITEM CODE',  src: 'Asorti Barkodu'      },
  { out: 'ITEM CODE',         src: 'SKU'                 },
  { out: 'ITEM DESCRIPTION',  src: 'ALT GRUBU -EN'       },
  { out: 'ITEM NAME',         src: 'Ürün Açıklaması EN'  },
  { out: 'UNIT',              src: 'Birim Cinsi (1)'     }, // AD → PCS dönüşümü otomatik
  { out: 'QTY',               src: 'Miktar'              },
  { out: 'UNIT PRICE',        src: 'Fiyat'               },
  { out: 'TOTAL AMOUNT TRY',  src: '__CALC__'            }, // Miktar × Fiyat hesaplanır
  { out: 'HS CODE',           src: 'GTİP'                },
  { out: 'MATERIAL',          src: 'MATERYAL -EN'        },
  { out: 'ITEM NAME-Serb',    src: 'Ürün Açıklaması XS'  }, // Sırpça ürün adı
  { out: 'COLOR SERB',        src: 'Renk Açıkmalası XS'  }, // Sırpça renk
  { out: 'MATERIAL SERB',     src: 'MATERYAL -XS'        }, // Sırpça materyal
  { out: 'DIMENSION',         src: 'EBAT Açıklama'       },
  { out: 'BRÜT',              src: 'BRÜT'                }, // hesaplanmış brüt kilo
  { out: 'NET',               src: 'NET'                 }, // hesaplanmış net kilo
];

// Diğer ülkeler için sütun haritası
// Her ülke bir dizi olarak tanımlanır: { out: çıktı adı, src: kaynak sütun }
// __CALC__     → Miktar × Fiyat
// __EUR__      → Fiyat ÷ Kur (Belçika için)
// __EUR_TOTAL__→ (Fiyat ÷ Kur) × Miktar (Belçika için, yuvarlama yok)
const SIMPLE_MAPS = {

  // 🇮🇶 Irak — 9 sütun, gruplandırma yok
  iq: [
    { out: 'MENŞEİ -EN',         src: 'MENŞEİ -EN'         },
    { out: 'SKU',                src: 'SKU'                 },
    { out: 'ALT GRUBU -EN',      src: 'ALT GRUBU -EN'       },
    { out: 'Ürün Açıklaması EN', src: 'Ürün Açıklaması EN'  },
    { out: 'Madde Açıklaması',   src: 'Madde Açıklaması'    },
    { out: 'Miktar',             src: 'Miktar'              },
    { out: 'Fiyat',              src: 'Fiyat'               },
    { out: 'Miktar X Fiyat',     src: '__CALC__'            }, // hesaplanır
    { out: 'GTİP',               src: 'GTİP'                },
    { out: 'BRÜT',               src: 'BRÜT'                },
    { out: 'NET',                src: 'NET'                 },
  ],

  // 🇬🇪 Gürcistan — 12 sütun
  ge: [
    { out: 'MENŞEİ -EN',         src: 'MENŞEİ -EN'         },
    { out: 'Asorti Barkodu',     src: 'Asorti Barkodu'      },
    { out: 'SKU',                src: 'SKU'                 },
    { out: 'GTİP',               src: 'GTİP'                },
    { out: 'Ürün Açıklaması EN', src: 'Ürün Açıklaması EN'  },
    { out: 'Miktar',             src: 'Miktar'              },
    { out: 'Fiyat',              src: 'Fiyat'               },
    { out: 'Miktar X Fiyat',     src: '__CALC__'            },
    { out: 'ALT GRUBU -EN',      src: 'ALT GRUBU -EN'       },
    { out: 'Barkod',             src: 'Barkod'              },
    { out: 'MATERYAL -EN',       src: 'MATERYAL -EN'        },
    { out: 'EBAT Açıklama',      src: 'EBAT Açıklama'       },
    { out: 'BRÜT',               src: 'BRÜT'                },
    { out: 'NET',                src: 'NET'                 },
  ],

  // 🇨🇾 KKTC — 8 sütun
  cy: [
    { out: 'MENŞEİ Açıklama',        src: 'MENŞEİ Açıklama'       },
    { out: 'Asorti Barkodu',         src: 'Asorti Barkodu'         },
    { out: 'SKU',                    src: 'SKU'                    },
    { out: 'ALT GRUBU Açıklama',     src: 'ALT GRUBU Açıklama'     },
    { out: 'Madde Açıklaması',       src: 'Madde Açıklaması'       },
    { out: 'Miktar',                 src: 'Miktar'                 },
    { out: 'ÜRÜN ANA GRUBU',         src: 'ÜRÜN ANA GRUBU'         },
    { out: 'E-Fatura Seri Numarası', src: 'E-Fatura Seri Numarası' },
    { out: 'BRÜT',                   src: 'BRÜT'                   },
    { out: 'NET',                    src: 'NET'                    },
  ],

  // 🇷🇺 Rusya — 20 sütun
  ru: [
    { out: 'E-Fatura Seri Numarası', src: 'E-Fatura Seri Numarası' },
    { out: 'Madde Kodu',             src: 'Madde Kodu'             },
    { out: 'MENŞEİ -EN',             src: 'MENŞEİ -EN'             },
    { out: 'MENŞEİ -RU',             src: 'MENŞEİ -RU'             },
    { out: 'Asorti Barkodu',         src: 'Asorti Barkodu'         },
    { out: 'SKU',                    src: 'SKU'                    },
    { out: 'Barkod',                 src: 'Barkod'                 },
    { out: 'Renk Açıkmalası EN',     src: 'Renk Açıkmalası EN'     },
    { out: 'GTİP',                   src: 'GTİP'                   },
    { out: 'ALT GRUBU -EN',          src: 'ALT GRUBU -EN'          },
    { out: 'Ürün Açıklaması EN',     src: 'Ürün Açıklaması EN'     },
    { out: 'ALT GRUBU -RU',          src: 'ALT GRUBU -RU'          },
    { out: 'Ürün Açıklaması RU',     src: 'Ürün Açıklaması RU'     },
    { out: 'Miktar',                 src: 'Miktar'                 },
    { out: 'Fiyat',                  src: 'Fiyat'                  },
    { out: 'Net Tutar (D)',          src: 'Net Tutar (D)'          },
    { out: 'MATERYAL -EN',           src: 'MATERYAL -EN'           },
    { out: 'MATERYAL -RU',           src: 'MATERYAL -RU'           },
    { out: 'ALT GRUBU Açıklama',     src: 'ALT GRUBU Açıklama'     },
    { out: 'EBAT Açıklama',          src: 'EBAT Açıklama'          },
    { out: 'BRÜT',                   src: 'BRÜT'                   },
    { out: 'NET',                    src: 'NET'                    },
  ],

  // 🇧🇦 Bosna — 12 sütun
  ba: [
    { out: 'MENŞEİ -EN',         src: 'MENŞEİ -EN'        },
    { out: 'Asorti Barkodu',     src: 'Asorti Barkodu'     },
    { out: 'SKU',                src: 'SKU'                },
    { out: 'ALT GRUBU -EN',      src: 'ALT GRUBU -EN'      },
    { out: 'Ürün Açıklaması EN', src: 'Ürün Açıklaması EN' },
    { out: 'Miktar',             src: 'Miktar'             },
    { out: 'Fiyat (D)',          src: 'Fiyat (D)'          }, // döviz fiyatı
    { out: 'Net Tutar (D)',      src: 'Net Tutar (D)'      }, // döviz net tutar
    { out: 'GTİP',               src: 'GTİP'               },
    { out: 'MATERYAL -EN',       src: 'MATERYAL -EN'       },
    { out: 'Renk Açıkmalası EN', src: 'Renk Açıkmalası EN' },
    { out: 'EBAT Açıklama',      src: 'EBAT Açıklama'      },
    { out: 'BRÜT',               src: 'BRÜT'               },
    { out: 'NET',                src: 'NET'                },
  ],

  // 🇧🇪 Belçika — 11 sütun + EUR dönüşümü
  // __EUR__       → Fiyat ÷ girilen kur (yuvarlama yok, tam değer)
  // __EUR_TOTAL__ → (Fiyat ÷ kur) × Miktar (ara yuvarlama yok → doğru toplam)
  be: [
    { out: 'MENŞEİ -EN',             src: 'MENŞEİ -EN'             },
    { out: 'E-Fatura Seri Numarası', src: 'E-Fatura Seri Numarası'  },
    { out: 'Asorti Barkodu',         src: 'Asorti Barkodu'          },
    { out: 'SKU',                    src: 'SKU'                     },
    { out: 'ALT GRUBU -EN',          src: 'ALT GRUBU -EN'           },
    { out: 'Ürün Açıklaması EN',     src: 'Ürün Açıklaması EN'      },
    { out: 'Miktar',                 src: 'Miktar'                  },
    { out: 'UNIT PRICE EUR',         src: '__EUR__'                 }, // TL fiyat ÷ kur
    { out: 'TOTAL AMOUNT EUR',       src: '__EUR_TOTAL__'           }, // birim EUR × miktar
    { out: 'GTİP',                   src: 'GTİP'                    },
    { out: 'MATERYAL -EN',           src: 'MATERYAL -EN'            },
    { out: 'BRÜT',                   src: 'BRÜT'                    },
    { out: 'NET',                    src: 'NET'                     },
  ],
};