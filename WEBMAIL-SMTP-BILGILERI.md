# Webmail SMTP Ayarları (webmail.eysglobal.com.tr)

## 📧 SMTP Bilgilerinizi Bulma

cPanel webmail kullanıyorsanız, SMTP ayarlarınız genellikle şöyledir:

### Standart cPanel SMTP Ayarları:

```
SMTP Server: mail.eysglobal.com.tr
            veya
            smtp.eysglobal.com.tr
            veya  
            eysglobal.com.tr

SMTP Port: 587 (TLS - Önerilen)
          465 (SSL)
          25 (Normal)

Kullanıcı Adı: tam-e-posta-adresiniz@eysglobal.com.tr
Şifre: E-posta şifreniz

Güvenlik: TLS (587 için) veya SSL (465 için)
```

## 🔍 SMTP Bilgilerinizi Nereden Bulabilirsiniz?

1. **cPanel'e giriş yapın**
   - https://webmail.eysglobal.com.tr veya
   - Hosting panelinize giriş yapın

2. **E-posta hesap ayarlarına bakın**
   - "Email Accounts" bölümüne gidin
   - "Configure Email Client" veya "Mail Client Configuration" seçeneğine tıklayın
   - SMTP ayarlarını göreceksiniz

3. **Veya hosting sağlayıcınızdan isteyin**
   - Hosting destek ekibiniz SMTP bilgilerinizi verebilir

## ✅ Kullanım

Bu SMTP bilgilerini:
- **Backend API** ile kullanabilirsiniz (Node.js, PHP, Python)
- **EmailJS** ile kullanabilirsiniz (Custom SMTP - ücretli plan gerekir)

## 🚀 Hızlı Çözüm: EmailJS (Önerilen)

EmailJS kullanarak webmail SMTP'nizi bağlayabilirsiniz:

1. https://www.emailjs.com/ - Ücretsiz kayıt
2. Email Services > Add New Service > "Custom SMTP Server"
3. SMTP bilgilerinizi girin
4. Template oluşturun
5. API key'lerinizi uygulamaya girin

**Veya** Backend API oluşturup SMTP bilgilerinizi orada kullanabilirsiniz.
