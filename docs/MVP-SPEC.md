# SEOAutoPilot — MVP spesifikasyonu

**Sürüm hedefi:** 0.10.x çizgisini “tek operatör, yerel makine, insan onaylı Search Console → Git/Firebase Hosting” ürünü olarak kilitlemek.

**Tek cümle:** Operatör Search Console verisini bağlar, site kurallarını onaylar, gerçek kaynak sayfayla karşılaştırılmış SEO değişikliklerini görür ve açık onayla tek tek veya toplu yayınlar; yazılım içerik uydurup sessizce yayınlamaz.

## 1. Problem ve ürün sınırı

Küçük ve çok dilli sitelerde Search Console fırsatları dağınıktır. Değişiklikler ya yapılmaz ya da mevcut sayfa ve içerik dili doğrulanmadan title/meta tahminiyle canlıya gider.

MVP şu ihtiyaçları karşılar:

- Hangi sayfanın neden öncelikli olduğunu gösterir.
- Mevcut title/meta/H1 ile öneriyi yan yana karşılaştırır.
- Taslağın öneri, canlı HTML olmadığını açıkça belirtir.
- Siteye dokunan her işlem için açık kullanıcı onayı ister.
- Birden fazla projeyi veri ve bağlantıları karıştırmadan yönetir.
- Yayın sonrası sonucu tarihleri ve metrikleriyle ölçer, tavsiye üretir.

MVP; makale yazan ajan, otomatik çeviri sistemi, rakip analiz aracı, genel CMS, WordPress/Shopify entegrasyonu veya çok kullanıcılı SaaS değildir.

## 2. Kullanıcı ve çalışma ortamı

- **Kullanıcı:** Tek site sahibi / SEO operatörü.
- **Çalıştırma:** Windows veya macOS üzerinde yerel Node uygulaması; varsayılan adres `http://127.0.0.1:4173`.
- **Siteler:** HTTPS; MVP yayın adaptörü Git + Firebase Hosting. Vite `public/` içindeki statik HTML ve açıkça desteklenen Flutter/LingoDecoder betiği.
- **Veri:** Salt okunur Google Search Console API veya GSC CSV klasörü.
- **Onay:** Tarayıcıdaki açık düğme ve değişiklik özeti. Arka planda sessiz canlı yayın yoktur.
- İnternete açık sunucu, paylaşılan hesap ve çok kiracılı panel kapsam dışıdır.

## 3. MVP başarı tanımı

MVP ancak aşağıdakilerin tümü gerçek bir HTTPS sitede elle doğrulandığında tamamlanır:

1. Boş kurulum belirli bir markayı varsaymaz; proje kullanıcı tarafından oluşturulur.
2. Site profili onaylanmadan taslak onayı ve yayın reddedilir.
3. GSC API veya CSV ile tarih aralığı belirtilmiş 28 günlük özet, fırsat, sorgu ve sayfa verisi görünür.
4. Yayınlanabilir öneriden önce hedef kaynak dosya, sayfa dili, mevcut title/meta/H1 ve canonical doğrulanır.
5. En az bir `UPDATE_EXISTING` önerisi mevcut değer → önerilen değer karşılaştırması üretir.
6. Tekil akışta taslak onayı ile canlı yayın onayı ayrıdır.
7. Toplu akışta gösterilen nihai liste için verilen açık onay hem listelenen değişiklikleri hem canlı yayını kapsar.
8. Git/Firebase bağlantısında hazırlık, izole derleme kontrolü, push, deploy ve canlı URL doğrulaması tamamlanır.
9. Toplu yayın jetonu liste değiştiğinde geçersiz olur; ilk hatada kuyruk durur; önceki başarılar otomatik geri alınmaz.
10. Süreç canlı yayın sırasında kapanırsa olası yayın otomatik tekrar edilmez.
11. Yayın anında karşılaştırma baseline’ı kaydedilir; 28 tam gün sonra güncel GSC dönemiyle sonuç raporu ve tavsiye üretilir.
12. Google/site bağlantısını kesmek veya projeyi silmek yalnız yerel kaydı etkiler; uzaktaki izinleri kaldırmadığı kullanıcıya bildirilir.
13. Tüm testler geçer; token ve gizli anahtar Git, API yanıtı ve loglarda bulunmaz.

## 4. Değişmez ürün ilkeleri

- Search Console çıktısı talimat değil, sayı ve URL kanıtıdır.
- Öneri üretmeden önce hedef sayfanın mevcut SEO alanları ve dili okunur.
- Gövde içeriği tam anlaşılmadan yeni bilgi, iddia veya bölüm canlıya yazılmaz.
- Dil belirsizliği, dil karışımı veya hedef dosya belirsizliği yayını bloklar.
- Analiz, öncelik, brief ve takip otomatik olabilir; HTML değişikliği, yönlendirme, silme ve canlı deploy onaysız yapılamaz.
- Profil veya brief değişirse bekleyen onay düşer; yayın geçmişi korunur.
- Aynı anda yalnız bir toplu yayın çalışır; çakışan değişiklik uçları kilitlenir.
- Mevcut metin öneriden daha güçlüyse sistem “mevcut metni koru” diyebilmelidir.

## 5. Çekirdek döngü

```text
Proje oluştur
→ Siteyi incele ve profil kurallarını onayla
→ GSC bağla veya CSV içe aktar
→ Fırsatları ve gerçek kaynak karşılaştırmasını gör
→ Değişiklikleri onayla
→ Hazırla ve derlemeyi doğrula
→ Canlı yayın onayı (veya açık toplu nihai onay)
→ Yayın anında baseline kaydet
→ 14 günlük ara kontrol
→ 28 günlük sonuç raporu ve tavsiye
```

Operatör herhangi bir aşamada durabilir. Bağlantı kaydı yayın anlamına gelmez.

## 6. Kapsam içi özellikler

### 6.1 Çalışma alanı

- Çok proje: ad, HTTPS site URL, ayrı GSC mülkü, CSV yolu, OAuth, son rapor, görevler ve Git/Firebase bağlantısı.
- Arayüz: Genel bakış, Fırsatlar, Onay kuyruğu, Sorgular, Sayfalar, Site profili, Veri kaynakları ve Ayarlar.
- Arayüz dili TR/EN/DE. Kullanıcıya görünen sabit ve dinamik metinler aynı çeviri katmanından geçer; SEO metni özgün dilinde kalır.
- Büyük yazı, azaltılmış animasyon ve oturum başına bir kez başlangıç senkronizasyonu.
- Yerel durum `data/*.json` altında, Git dışında tutulur.

### 6.2 Search Console

**API:** OAuth Web Client, `webmasters.readonly`, proje hostname’iyle Domain/URL-prefix eşlemesi, GSC gecikmesi için yaklaşık bugün−2 gün bitişli 28 günlük pencere; date/query/page/device/country boyutları.

**CSV:** Türkçe dosya adları MVP’de zorunlu; İngilizce ve Almanca dışa aktarım adları P1. Virgül, noktalı virgül ve tab ayırıcı otomatik algılanır. CSV içe aktarma API raporunu açık uyarıyla değiştirir.

### 6.3 Analiz motoru

- **Generic:** En çok 12 sayfa; HOLD, UPDATE_EXISTING ve başlık varyantı fırsatı. Yayınlanabilir taslak için sorgu–sayfa kanıtı ve kaynak sayfa doğrulaması gerekir.
- **Legacy LingoDecoder:** Yalnız profil tarafından açıkça seçilirse sabit kümeler/path/regex kullanır.

Özet eşikler: çok düşük gösterim HOLD; konum >20 UPDATE_EXISTING; yeterli gösterim ve düşük CTR başlık varyantı; aksi hâlde HOLD. `CTR_TEST` gerçek canlı A/B testi değildir ve kullanıcı arayüzünde **Başlık varyantı** olarak adlandırılır.

Minimum kalite kapıları:

- Önerilen title mevcut title ile aynıysa görev üretilmez.
- Sayfa diliyle öneri dili uyuşmuyorsa bloklanır.
- Marka tekrarı ve title/meta uzunluğu kontrol edilir.
- Mevcut metin daha açıklayıcıysa değişiklik yerine koruma tavsiyesi verilir.
- Kaynak doğrulanmadan title/meta/H1 uygulanabilir değişiklik sayılmaz.

### 6.4 Site profili ve kaynak incelemesi

- Diller, ana/yedek dil, açılış politikası, pazarlar ve marka kaydedilir.
- Aynı HTTPS origin; özel ağ ve harici origin taranmaz; JS çalıştırılmaz; Google token kullanılmaz.
- Kaynak doğrulamasında en az `html lang`, title, meta description, H1, canonical, hreflang ve hedef dosya okunur.
- Tam gövde analizi, JS render ve Googlebot simülasyonu yapılmaz.
- Ana dil belirsizse kullanıcı seçer. Dil/path kanıtı yoksa yayın bloklanır.

### 6.5 Görev ve ekran görünürlüğü

Durumlar: keşif → onay bekliyor → onaylı → hazırlanıyor → yayına hazır → yayınlanıyor → yayınlandı → izleme → tamamlandı / reddedildi / başarısız.

- Başlık varyantında A/B seçilir veya mevcut metin korunur.
- NEW_PAGE ve HOLD toplu yayına girmez.
- Profil/brief değişince onay sıfırlanır.
- Güncel analizden kaybolan eski görev kilitlenir.
- Onay kuyruğu yalnız kullanıcıdan işlem bekleyen kayıtları gösterir.
- MONITORING ve COMPLETED “İzlenen” filtresindedir.
- HOLD arka planda izlenir; REJECTED ve eski geçersiz kayıtlar varsayılan listede gösterilmez.
- Aynı hedef URL’nin eski ve güncel kayıtları kullanıcı kuyruğunda birlikte gösterilmez.

### 6.6 Kontrollü yayın

- Kaynak: doğrulanmış yerel Git kökü ve Firebase Hosting projesi.
- Hazırlık: izole worktree, kesin title/meta/H1 yaması, test/doğrulama, desteklenen build ve kaynak–çıktı eşleşmesi.
- Tekil canlı: temiz ve doğru dal, güvenli birleştirme, push ve Firebase deploy öncesi ayrı kullanıcı onayı.
- Toplu canlı: yalnız aynı projedeki doğrulanmış `UPDATE_EXISTING` görevleri; nihai ekranda sayfa ve kesin alan değerleri gösterilir. Bu açık onay hem değişiklik hem canlı yayın onayıdır.
- İlk hatada kalan kuyruk durur; yayınlanan sayfalar otomatik geri alınmaz.
- Firebase preview kanalı MVP’de yoktur.

### 6.7 İzleme, rapor ve bildirim

- Baseline operatörün geç basabileceği “İzlemeyi başlat” anında değil, canlı yayın anında alınır.
- Baseline: yayından önceki 28 tam gün; sonuç: yayından sonraki 28 tam gün. Dönemler ve GSC gecikmesi raporda açıkça gösterilir.
- 14. günde ara kontrol, 28. günde sonuç değerlendirmesi yapılır.
- Rapor tıklama, gösterim, CTR ve ortalama konum için önce/sonra değerini ve değişimi gösterir.
- Düşük hacimde yüzdeler tek başına karar verdirmez; minimum gösterim eşiği uygulanır.
- Sonuç: olumlu, sabit, gerileme, veri yetersiz veya güncel veri yok.
- Tavsiye: koru/güçlendir, daha fazla veri bekle, başlık–niyet uyumunu incele veya önceki metne dönüşü değerlendir.
- Yerel MVP’de bildirim, 28 gün dolduktan sonra uygulamanın ilk açılışı veya senkronizasyonunda görünür. Bilgisayar kapalıyken uzaktan anlık bildirim vaat edilmez.
- İzlenen özet kutusu tıklanabilir ve ilgili sayfaları/canlı URL’leri açar.

## 7. Kapsam dışı

- AI ile makale, çeviri veya yeni doğrulanmamış içerik üretimi
- Googlebot render simülasyonu ve tam JS crawl
- WordPress, Shopify, çoklu hosting target
- Çok kullanıcı, auth, uzak sunucu ve SaaS faturalama
- Otomatik yeniden yayın, otomatik rollback ve gerçek canlı A/B altyapısı
- GSC yazma, Indexing API ve Ads

## 8. Yerel API ve güvenlik sözleşmesi

- GET uçları okuma içindir. İzleme değerlendirmesi açılış/senkronizasyon işleminin açık bir parçası olarak ayrı mutasyon uçtan çalıştırılmalıdır.
- GET olmayan uçlar Origin yoksa veya etkin `127.0.0.1:<port>` origin’iyle eşleşmiyorsa reddedilir.
- OAuth callback etkin PORT değerinden üretilir.
- Token, refresh token ve client secret API yanıtına veya loga yazılmaz.
- Proje dışa aktarımı sırları içermez.
- `data/`, yedekler ve OAuth dosyaları Git dışında kalır; commit öncesi secret taraması yapılır.

## 9. Teknik çerçeve

- Node ≥22, `server.js + public/* + src/*`.
- Test: `node --test test/*.test.js`.
- CLI: `npm run analyze -- <csv-klasörü>`.
- Proje durumu atomik ve kilitli yazılır; geçici dosya + rename kullanılır. Paralel senkron/token/görev yazmaları birbirini ezemez.
- Raporların `projects.json` boyutunu büyütmesi izlenir; MVP sonrasında ayrı veri deposuna geçiş planlanır.

## 10. MVP kapanış öncelikleri

### P0 — tamamlanmadan MVP güvenilir sayılmaz

1. `projects.json` için kilitli/atomik yazma ve paralel istek testi.
2. Yayınlanabilir taslaktan önce gerçek sayfa dili + mevcut title/meta/H1/canonical doğrulaması.
3. Baseline’ı canlı yayın anında, dönem tarihleriyle kaydetme.
4. Tekil iki onay ve toplu birleşik nihai onay sözleşmesini UI/README/testlerde aynılaştırma.
5. Token/secret’ın API, log, Git ve yedeklere sızmadığını test etme.

### P1

1. Starter LingoDecoder projesini kaldırma; örnek proje yalnız opt-in.
2. Generic sorgu–sayfa eşlemesi ve yanıltıcı “0 eşleşme”yi kaldırma.
3. EN/DE CSV dosya adları.
4. Bütün dinamik UI metinlerinin TR/EN/DE çeviri testi.
5. İzleme mutasyonunu GET’ten ayrı açılış/senkronizasyon değerlendirmesine taşıma.
6. Aynı URL için geçmiş/güncel görev tekilleştirmesi.

### P2

1. SPA/işlenmiş HTML adaptör sınırlarını UI’da ayrıntılı gösterme.
2. Dönem karşılaştırma grafikleri ve gelişmiş sonuç açıklaması.
3. Raporları `projects.json` dışına taşıma.

## 11. Kabul testleri

- Yeni site: proje → kaynak inceleme → profil onayı → GSC → fırsat. Profilsiz onay reddedilir.
- Dil güvenliği: Almanca sayfaya Türkçe/İngilizce şablon önerilmez; mevcut daha iyi metin korunabilir.
- CSV: desteklenen klasör rapor oluşturur, yanlış klasör anlaşılır hata verir.
- HOLD, dil-engelli ve kaynak doğrulanmamış görev onaylanamaz.
- Tekil yayın: mevcut→önerilen karşılaştırması, taslak onayı, ayrı canlı onay ve URL doğrulaması.
- Toplu yayın: iki uygun sayfa; jeton değişiminde red; ilk hatada kuyruk durur.
- İzleme: yayın anı baseline; 14 gün ara durum; 28 gün önce/sonra raporu, tavsiye ve ilk açılışta bildirim.
- Bağlantı kesme/proje silme yalnız yerel kaydı değiştirir; kaynak site dosyaları korunur.
- Çökme sonrası olası canlı yayın otomatik tekrar edilmez.
- Paralel yazma testi hiçbir proje/token/görev alanını kaybetmez.

## 12. Teslim kontrol listesi

- [x] P0 maddeleri kapalı
- [x] Boş kurulum marka/starter proje dayatmıyor; legacy LingoDecoder yalnız taşınmış mevcut kayıtta opt-in
- [x] README gerçek onay/yayın modeliyle aynı
- [x] GermanChunks kaynak deposunda 34 dil eşleşmesi denetlendi; 33 sayfa geçti, değişiklik hedefi olmayan `/privacy.html` eksik canonical nedeniyle doğru biçimde bloklandı
- [x] Tüm testler yeşil
- [x] `data/`, OAuth, rapor ve yedekler `.gitignore` kapsamında
- [x] Secret taraması temiz
- [x] Google izninin ayrıca Google hesap sayfasından kaldırılması gerektiği belgeli

## 13. MVP sonrası

Tam kaynak/canlı URL envanteri, gelişmiş hreflang–canonical–sitemap grafiği, ülke ≠ dil analizi, tasarım uyumlu diff, generic semantik kümeleme, gerçek görev kuyruğu/veritabanı, uzak bildirim ve ek yayın adaptörleri.

**Özet:** MVP; yerel komuta merkezi, GSC kanıtı, gerçek kaynak karşılaştırması, açık onaylı Git/Firebase HTML yaması ve ölçülebilir sonuç raporudur. Yazar ajan veya genel CMS değildir.
