# EYS Portal Backend Kurulumu (cPanel)

Bu doküman, portal giriş/kayıt ve tüm portal verileri için hazırlanan **PHP + SQLite** backend'ini anlatır.
Kullanıcılar, denetimler, sertifikalar ve ayarlar `storage/portal.sqlite` dosyasında saklanır.

## ✅ Ne sağlar?
- Üye kayıt (register)
- Giriş (login)
- Denetim, sertifika, bildirim, ayar verileri
- Şifreler güvenli şekilde **hash** edilir
- Veritabanı dosyası **otomatik** oluşur

## 1) Dosyaları cPanel'e yükleyin
`public_html/` içerisine aşağıdaki klasörleri yükleyin:
- `api/`
- `storage/`
- `portal.html`
- `portal-advanced-script.js`
- `portal-advanced-styles.css`

## 2) İlk çalıştırma
Herhangi bir işlem yapmanız gerekmez. İlk login/register isteğinde:
- `storage/portal.sqlite` otomatik oluşturulur
- İlk admin kullanıcı otomatik eklenir

### Varsayılan Admin:
- **E-posta:** `admin@eysglobal.com.tr`
- **Şifre:** `Admin123!`

> Güvenlik için ilk girişte şifreyi değiştirmeniz önerilir.

## 3) Endpointler
- `POST /api/auth/register.php`
- `POST /api/auth/login.php`
- `POST /api/data/store.php`
- `POST /api/data/users.php`
- `POST /api/send-email.php` (Webmail SMTP üzerinden e-posta gönderir)

## 4) Webmail SMTP Ayarı (cPanel)
Portal içindeki e-posta gönderimi için `api/send-email.php` kullanılır. SMTP bilgilerini **env** ile verin.

### Önerilen kurulum (cPanel + .htaccess)
`public_html/api/.htaccess` içine (varsa en alta) **kendi bilgilerinizle** ekleyin:

```
SetEnv SMTP_HOST mail.eysglobal.com.tr
SetEnv SMTP_PORT 465
SetEnv SMTP_USER danisman@eysglobal.com.tr
SetEnv SMTP_PASS YOUR_EMAIL_PASSWORD
SetEnv SMTP_FROM danisman@eysglobal.com.tr
SetEnv SMTP_FROM_NAME "EYS Global"
SetEnv SMTP_SECURITY ssl
```

> Şifreyi dosyalara yazmak istemiyorsanız, cPanel “Environment Variables” alanından da ekleyebilirsiniz.

### Portal ayarı
Portal → Settings → **Backend API URL**:
`https://eysglobal.com.tr/api/send-email.php`

## 5) Güvenlik

## 4) Güvenlik
- `storage/` dizini `.htaccess` ile dış erişime kapalıdır
- `.sqlite` dosyalarına erişim engellidir

## 6) Sorun giderme
**Kayıt olmuyor / giriş çalışmıyor**
- `storage/` klasörü yazılabilir olmalı (cPanel File Manager → permissions 755/775)
- `api/` klasörü aynı dizinde olmalı
- Tarayıcıyı gizli sekmeden test edin (cache)
