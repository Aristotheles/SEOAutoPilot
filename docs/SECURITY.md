# Güvenlik modeli

## Desteklenen sürümler

| Sürüm | Destek |
| --- | --- |
| En son `0.11.x` | Güvenlik güncellemeleri alır |
| Daha eski sürümler | Desteklenmez; önce güncelleyin |

## Güvenlik açığı bildirme

Güvenlik açıklarını herkese açık issue olarak paylaşmayın. GitHub deposundaki
**Security → Report a vulnerability** bağlantısından özel güvenlik bildirimi gönderin.
Bildirimde etkilenen sürümü, yeniden üretim adımlarını ve olası etkiyi belirtin; gerçek
OAuth anahtarı, token, müşteri Search Console verisi veya kişisel klasör yolu eklemeyin.

İlk değerlendirme hedefi 7 gün, kritik açıklar için düzeltme hedefi doğrulama sonrasında
14 gündür. Bu süreler bir hizmet seviyesi garantisi değildir.

SEOAutoPilot tek operatörlü, yerel bir uygulamadır ve yalnız `127.0.0.1` üzerinde çalışır.
Yerel API her açılışta yenilenen HttpOnly oturum çerezi, kesin Host kontrolü ve aynı-origin
değişiklik kontrolü kullanır. Uygulama internet üzerinde sunucu olarak yayınlanmamalıdır.

OAuth istemci sırrı ile erişim/yenileme tokenları AES-256-GCM ile şifrelenir. Yerel anahtar ve
veri dosyaları işletim sistemi izinleriyle yalnız mevcut kullanıcı, SYSTEM ve yöneticilere
açılır. `.master-key`, JSON durum dosyaları ve güvenlik kayıtları Git kapsamı dışındadır.

Bağlı bir site deposu kendi derleme kodunu çalıştırabilir. Bu nedenle kullanıcı her depo için
açık güven onayı verir. Alt işlemler ortam değişkenlerinin yalnız gerekli, allowlist edilmiş
bölümünü alır; `npm ci` kurulum betikleri kapalı çalışır. Depoya ait özel doğrulama betikleri
otomatik çalıştırılmaz. Bilinmeyen veya güvenilmeyen depolar bağlanmamalıdır.

Yayın hâlâ insan onayı, temiz Git çalışma ağacı, kesin commit, kilit dosyası, derleme çıktısı
doğrulaması ve canlı sayfa doğrulaması gerektirir. Güvenlik olayları `data/security.log`
dosyasında sınırlı ve gizli bilgi içermeyen kayıtlarla tutulur.
