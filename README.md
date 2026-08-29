# SEOAutoPilot

LingoDecoder için insan onaylı Search Console fırsat motoru.

İlk sürüm mevcut Search Console CSV dışa aktarımlarını okuyarak:

- sorguları ürünle ilişkili kümelere ayırır,
- veri güven seviyesini hesaplar,
- mevcut sayfayı geliştirme ile yeni sayfa açmayı ayırır,
- yetersiz veride `HOLD` kararı verir,
- JSON formatında denetlenebilir bir rapor üretir.

Otomatik yayın bu sürümün kapsamında değildir.

## Gereksinim

- Node.js 22 veya üzeri

Harici paket gerektirmez.

## Test

```powershell
npm test
```

## Search Console dışa aktarımını analiz etme

```powershell
npm run analyze -- "C:\path\to\Search-Console-export"
```

Raporu dosyaya yazmak için:

```powershell
npm run analyze -- "C:\path\to\Search-Console-export" `
  --output reports\latest.json
```

`reports/*.json` Git'e alınmaz; Search Console verisi özel kalır.

## Sonraki aşama

CSV ve Search Console API aynı ortak veri modeline bağlanacaktır. API erişimi
eklenene kadar mevcut dışa aktarımlar gerçek karar motorunu test etmek için
kullanılabilir.
