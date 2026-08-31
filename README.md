# SEOAutoPilot

Birden fazla site için proje bazlı, insan onaylı Search Console fırsat motoru.

## Arayüz

Sol menüde **Ayarlar**: Türkçe/English/Deutsch arayüz dili, büyük yazı,
azaltılmış animasyon ve açılışta otomatik senkronizasyon tercihleri.
Dil üst çubuktan da değiştirilebilir. Tercihler yalnız bu tarayıcıdaki
`seo-ui-settings` kaydında saklanır; proje içerik dillerini etkilemez.
Sıfırlama yalnız bu tercihleri değiştirir, proje/anahtar/rapor silmez.
Menüler, ortak kontrol etiketleri ve Ayarlar ekranı çevrilir. Kaynak raporlar,
SEO metinleri, işlem geçmişi ve ham sunucu hata mesajları özgün dilinde korunur.

Uygulamayı başlat:

```powershell
npm start
```

Ardından `http://127.0.0.1:4173` adresini aç. Rapor bağlanmamış projeler veri
bekliyor olarak gösterilir. Sağ üstteki **Veri içe aktar** düğmesiyle Search Console dışa aktarım
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

Bağlı projeler uygulama açıldığında otomatik olarak senkronize edilir. Aynı
tarayıcı oturumundaki sayfa yenilemeleri gereksiz API çağrısı üretmez. Uygulama
Google hesabındaki yetkili Search Console mülklerini listeler ve proje alan
adıyla eşleşen Domain veya URL-prefix mülkünü kendisi seçer. Son başarılı
senkronizasyonun tarih ve saati üst durum rozetinde ve veri kaynağı kartında
gösterilir.

## Kontrollü otomasyon

### Toplu canlı yayın — 0.10.0

Onay kuyruğundaki **Toplu yayını incele** düğmesi, seçili projenin uygun
önerilerini ve kesin değişikliklerini tek listede gösterir. Onay kutusu ve
**Onaylananları topluca canlıya yayınla** düğmesi hem değişiklikleri hem canlı
yayını kapsar. Başlık/meta/H1 alanları uygulanır; editoryal maddeler açıkça ayrı
gösterilir. Dil/profil engelleri, yeni sayfalar, CTR varyant seçimi ve aynı hedefe
ikinci öneriler toplu kapsama girmez. İncelenen liste değişirse onay reddedilir.

Her sayfa güncel kaynak dalından sırayla hazırlanıp ayrı yayınlanır; tek Firebase
deploy değildir. İlk hatada kuyruk durur; önceki başarılı yayınlar geri alınmaz.
Her başarılı sayfada **İncele** bağlantısı gösterilir. İşlem sürerken değişiklik
uçları kilitlidir. Kuyruk proje verisinde saklanır. Sunucu kapanırsa belirsiz yayın
otomatik tekrar edilmez; sonuç kontrolü gerekir. Diğer projeler topluca yayınlanmaz.

Firebase önizleme kanalına ayrı yayın yapılmaz. Akış: değişiklikleri onayla →
ayrı çalışma alanında hazırla ve derlemeyi doğrula → açık canlı yayın onayı →
Firebase Hosting'e yayınla → Yeni sayfayı gör. Yayın hatası sonrası hazırlanmış
çalışma alanı korunur; tekrar Firebase önizlemesi gerekmez. Eski önizleme
kayıtlarıyla yayın uyumluluğu korunur. Derleme ve hedef proje kontrolleri sürer.

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

## Site kaynak bağlantıları

Her projenin Git/Firebase bağlantısı bağımsızdır. Vite projelerinde statik SEO
sayfaları `public/` içinden düzenlenir; izole Git çalışma kopyasında `npm ci`
ve `npm run build` çalıştırılır. `package-lock.json` kaynak depoda bulunmalı
ve temiz kurulumla uyumlu olmalıdır. Firebase Hosting'in yayın klasörü
`firebase.json` dosyasından okunur (standart Vite projesinde `dist/`).
Özel Vite `root`/`publicDir` yapılandırmaları bu adaptörün kapsamında değildir.

Hedef URL'nin `.html` uzantısı korunur. Derlenen hedef sayfa kaynak dosyayla
eşleşmeden önizleme yayınlanmaz. LingoDecoder'ın Flutter release betiği ayrı
adaptör üzerinden çalışmaya devam eder.

Yalnız yerel Git deposu olan projeler önizleme hazırlayabilir; canlı yayın
için ayrıca `origin` uzak deposu ve kullanıcının yayın onayı gerekir.
Bağlantıyı kaydetmek siteyi yayınlamaz. Gizli anahtarlar ve özel kullanıcı
verileri Git'e veya yayın klasörüne eklenmemelidir.

Firebase hesabı her proje için otomatik seçilir: CLI'de kayıtlı hesapların
ilgili proje ve Hosting sitesine erişimi sorgulanır. Eksik hesap bir kez
`firebase login:add eposta` ile eklenir; Search Console OAuth bağlantısından
bağımsızdır. Seçilen e-posta projede saklanır; tokenlar SEOAutoPilot'a kopyalanmaz.
Arayüz hesap ve kontrol zamanını gösterir. Erişim doğrulanamazsa önizleme ve
yayın kapalıdır; yeni bağlantı doğrulanmadan kaydedilmez.

Önizleme/yayın öncesinde erişim yeniden kontrol edilir ve Firebase komutlarına
açık `--account` verilir. Flutter release betiğinin iç komutları yalnız izole
çalışma kopyasında seçilen hesabı kullanır; global varsayılan hesap değiştirilmez.
Bu kontrol Hosting erişimini doğrular, tüm yayın/IAM izinlerinin garantisi
değildir; ek izinler Firebase tarafından yayın sırasında kontrol edilir.

## Bağlantı ve proje kaldırma

Veri kaynakları → Bağlantıları yönet / kaldır bölümünde:

- **Site bağlantısını kaldır:** Seçili projenin Git/Firebase eşleştirmesini keser,
  önceki önizlemenin yayın yetkisini iptal eder. Kaynak klasörü, GitHub, Firebase
  sitesi ve önizleme dosyaları silinmez. Aktif yayın/derleme bitmeden kullanılamaz.
- **Google bağlantısını kes:** Yalnız seçili projenin yerel tokenlarını siler.
  Devam eden OAuth/senkronizasyon istekleri bağlantıyı geri getiremez.
- **Ortak Google OAuth bilgilerini sil:** TÜM projelerin yerel tokenlarını ve
  kayıtlı OAuth bilgilerini kaldırır. Ortam değişkenlerinden gelen yapılandırmayı
  da bu uygulamada kalıcı olarak devre dışı bırakır; yeniden kurulum gerekir.
- **Projeyi kaldır:** Adını yazarak onayladıktan sonra uygulamadaki proje kaydı,
  raporları, görevleri ve tokenları kalıcı silinir. Gerçek site, kullanıcı kaynak
  dosyaları ve diğer projeler korunur. Projeler listesinden de kullanılabilir.

Bu işlemler Google Cloud'daki API/istemciyi silmez ve Google hesabındaki uygulama
iznini iptal etmez. Bunun için Google hesap bağlantıları/Cloud Console kullanılmalıdır.
Kaldırma uçları DELETE isteği ve hedefe özel açık onay gerektirir.

## Otomatik testler

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

## Site profili — 0.7.0

### Otomatik inceleme — 0.8.0

**Siteyi otomatik incele → özeti kontrol et → Bu bilgilerle devam et.**
Teknik form kapalı Gelişmiş ayarlar bölümüne taşındı. İnceleme aynı HTTPS alan
adındaki HTML sayfalarını, sitemap dosyalarını, dil bildirimlerini, alternatif
dil bağlantılarını ve stil dosyası bağlantılarını okur. İlk tarama en fazla
40 adres/60 saniye ile sınırlıdır; tüm site taranmış sayılmaz. Özel ağlara ve
başka alan adlarına yönlendirmeler engellenir. Google tokenı gönderilmez.

JavaScript çalıştırılmaz; görülen dil sunucu HTML bildiriminin kanıtıdır,
gerçek metnin dilinin veya Googlebot görünümünün garantisi değildir. Ana dil
belirsizse tek seçim sorulur. Ziyaretçi açılış kuralları tahmin edilmez ve
mevcut tercihler değiştirilmez. İnceleme kendi başına profil kaydetmez.
Kullanıcı onayı sonrası yalnız doğrulanan adreslere otomatik taslak izni verilir.
İnceleme özeti sunucu yeniden başlatılana kadar tutulur; onaylanan eşleştirmeler
proje profilinde kalıcıdır. Yeni inceleme eski dil tercihlerini silmez.

**Site profili** ekranından her projenin içerik dillerini, ana dilini, ilk ziyaret
varsayılanını, açılış tercihini, hedef pazarlarını ve marka bilgilerini kaydet.
Bir yazının bütün dillere çevrilmesi zorunlu değildir. İngilizce varsayılan açılış,
bütün yazıların İngilizce olduğu anlamına gelmez. Dili belirsiz veya kuralları
çelişen sayfalarda taslak onayı ve yayın durur; URL–dil eşleştirmesi gerekir.

Profil kullanıcı tarafından doğrulanmadan yeni yayın işlemleri kapalıdır. Profil
değişince henüz uygulanmamış önerilerin onayı/önizleme yetkisi sıfırlanır. Yayın
geçmişi korunur; yayın sırasında profil değiştirilemez. Eşzamanlı eski form
kayıtları sürüm kontrolüyle reddedilir.

Yeni projelerde Almanca eğitim veya belirli marka varsayımı yoktur. Mevcut
LingoDecoder içerik planı ve eski konu eşleştirmeleri yalnız o projenin geçiş
profilinde korunur; kullanıcı konu eşleştirmelerini kapatabilir. Taslaklar
kural tabanlı başlangıç önerileridir, kaynak sayfa doğrulaması veya AI analizi
değildir. Taslak desteği şimdilik Türkçe, İngilizce ve Almancadır; diğer diller
kaydedilebilir ama sessizce İngilizce taslak üretilmez.

İlk veri okumasında eski proje dosyasının birebir yedeği `data/backups/` içine
alınır ve şema 2'ye geçilir. Tokenlar, bağlantılar, raporlar ve görev geçmişi
korunur. Yedekler özel veri içerir; Git'e alınmaz. Bozuk dosya sıfırlanmaz.

Bu aşama yalnız SEOAutoPilot ayarlarını değiştirir. Bağlı sitelerde dil seçimi,
yönlendirme, tasarım veya içerik değişikliği yapmaz; Googlebot'un hangi dili
gördüğünü doğruladığı iddia edilmez.

## Sıradaki aşamalar

1. Kaynak/canlı URL envanteri: gerçek dil, karşılık sayfalar, canonical,
   hreflang, sitemap ve yönlendirme kontrolü; otomatik dil keşfi.
2. Sayfa dili ile ziyaretçi ülkesini ayıran Search Console analizi; yeterli
   kanıt yoksa öneriyi bekletme.
3. Projenin mevcut tasarımına uyan değişiklik farkı ve önizleme doğrulaması;
   kaynak değişiklikleri ve canlı yayın için ayrı kullanıcı onayı.
4. Yayın sonrası gerçek verilerle etki takibi; mevcut LingoDecoder içerik
   iyileştirme kuyruğunu koruma.
