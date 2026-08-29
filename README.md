# SEOAutoPilot

LingoDecoder için insan onaylı Search Console fırsat motoru ve yerel SEO
komuta merkezi.

## Arayüz

Uygulamayı başlat:

```powershell
npm start
```

Ardından `http://127.0.0.1:4173` adresini aç. İlk açılışta arayüz demo veriyle
çalışır. Sağ üstteki **Veri içe aktar** düğmesiyle Search Console dışa aktarım
klasörünün tam yolunu girerek gerçek raporu analiz edebilirsin.

Arayüzde:

- görünürlük skoru ve temel performans göstergeleri,
- önceliklendirilmiş SEO fırsatları,
- sorgu kümeleri ve sayfa performansları,
- öneri gerekçesi, güven seviyesi ve insan onay kontrol listesi,
- masaüstü ve mobil uyumlu görünüm bulunur.

## Çok projeli kullanım

Sol alttaki proje seçiciden istediğin kadar site ekleyebilirsin. Her projenin:

- Search Console mülkü,
- CSV klasörü,
- API bağlantısı ve yenileme belirteci,
- son senkronize raporu ayrı saklanır.

Yerel proje verileri `data/*.json` içinde tutulur ve GitHub'a gönderilmez.

## Search Console API

**Veri kaynakları → API'yi kur** ekranı OAuth bilgilerini ve gerekli geri dönüş
adresini gösterir. Google Cloud Console'da Search Console API'yi etkinleştirip
**Web application** türünde bir OAuth istemcisi oluşturmalısın. Uygulama yalnızca
`https://www.googleapis.com/auth/webmasters.readonly` salt okunur kapsamını ister.

Yerel geri dönüş adresi:

```text
http://127.0.0.1:4173/oauth/google/callback
```

İstemci gizli anahtarı kaynak koduna veya GitHub'a yazılmaz.

## Kontrollü otomasyon

Her analizden sonra fırsatlar otomatik olarak kalıcı iş akışlarına çevrilir:

1. Sinyal ve arama niyeti doğrulanır.
2. Etki, veri güveni ve ürün uyumundan 0–100 öncelik puanı hesaplanır.
3. Uygulama brifi ve sonraki adımlar hazırlanır.
4. Siteye etki edecek değişiklik kullanıcı onayına sunulur.
5. Onaylanan görev uygulama kuyruğuna alınır.
6. Uygulama sonrasında 14 ve 28 günlük izleme dönemi başlatılır.

Analiz, puanlama, brief ve izleme otomatik olabilir. İçerik yayınlama, mevcut
sayfayı değiştirme, yönlendirme ve silme işlemleri kullanıcı onayı olmadan
çalıştırılmaz.

Analiz motoru mevcut Search Console CSV dışa aktarımlarını okuyarak:

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
