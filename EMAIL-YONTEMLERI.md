# Browser'dan E-posta Gönderme Yöntemleri

## ❌ Neden Browser'dan Doğrudan SMTP Kullanılamaz?

Browser (tarayıcı) güvenlik nedeniyle doğrudan SMTP bağlantısına izin vermez:
- Güvenlik: Şifreler browser'da saklanamaz
- CORS: Cross-Origin kısıtlamaları
- Protokol: Browser'lar SMTP portlarına (25, 587, 465) izin vermez

## ✅ Daha Önce Kullandığınız Muhtemel Yöntemler:

### 1. **mailto: Linki** (E-posta göndermez, sadece açılır)
```html
<a href="mailto:example@email.com">Send Email</a>
```
- E-posta istemcisini (Outlook, Gmail, vb.) açar
- Gerçekten e-posta göndermez
- Kullanıcı manuel olarak gönderir

### 2. **Backend API (Sunucu tarafı)**
- Node.js, PHP, Python backend
- Backend SMTP kullanır, browser'dan API çağrısı yapılır
- Örnek: `fetch('/api/send-email', {...})`

### 3. **E-posta Servisleri (API)**
- SendGrid API
- Mailgun API  
- AWS SES API
- Bunlar backend'e ihtiyaç duyar

### 4. **EmailJS** (Frontend servisi)
- Browser'dan çalışır
- Ama aslında EmailJS'in backend'ini kullanır
- Ücretsiz plan: 200 email/ay

### 5. **Form Servisleri**
- Formspree
- EmailJS Forms
- Netlify Forms
- Bunlar da backend servisleridir

## 🔍 Sizin Durumunuz

Muhtemelen:
- Bir backend API'niz vardı (fark etmediniz)
- Veya bir servis kullanıyordunuz (SendGrid, Mailgun, vb.)
- Veya mailto: linki kullanıyordunuz (gerçekten göndermiyordu)

## 💡 Şu Anki En İyi Çözüm

**EmailJS** - Browser'dan çalışır, ücretsiz:
1. https://www.emailjs.com/ - Ücretsiz kayıt
2. Settings'ten API key'leri girin
3. Hazır! E-posta gönderir

**Veya Backend API oluşturun:**
- Node.js + Nodemailer
- PHP + PHPMailer
- Python + smtplib

Hangisini kullanıyordunuz? Size özel çözüm hazırlayabilirim!
