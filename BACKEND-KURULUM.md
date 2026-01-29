# Backend Email API Kurulum Rehberi

## 📋 Gereksinimler

- Node.js (v14 veya üzeri) - https://nodejs.org/
- npm (Node.js ile birlikte gelir)

## 🚀 Kurulum Adımları

### 1. Node.js Kurulumunu Kontrol Edin

Terminal/Command Prompt'ta şu komutu çalıştırın:
```bash
node --version
npm --version
```

Eğer yüklü değilse: https://nodejs.org/ adresinden indirip kurun.

### 2. Bağımlılıkları Yükleyin

Proje klasöründe (backend-email-api.js dosyasının olduğu yerde) şu komutu çalıştırın:

```bash
npm install
```

Bu komut şunları yükleyecek:
- express (web server)
- nodemailer (SMTP e-posta gönderme)
- cors (browser'dan erişim için)

### 3. Backend API'yi Başlatın

```bash
node backend-email-api.js
```

Veya:

```bash
npm start
```

**Başarılı mesajı göreceksiniz:**
```
📧 Email API server çalışıyor: http://localhost:3000
🔗 Test: http://localhost:3000/test
📨 Send Email: POST http://localhost:3000/send-email
```

## ✅ Test Etme

1. Browser'da şu adrese gidin: http://localhost:3000/test
2. `{"success":true,"message":"Backend API çalışıyor!"}` mesajını görmelisiniz

## 🔧 Uygulamaya Bağlama

1. Uygulamayı açın: `inspection-portal-advanced.html`
2. Admin olarak giriş yapın
3. **Settings** (⚙️) sekmesine gidin
4. **Backend API URL** alanına şunu girin:
   ```
   http://localhost:3000/send-email
   ```
5. **Save Backend API** butonuna tıklayın

## 📧 E-posta Gönderme

Artık uygulamadan sertifika e-postaları gönderebilirsiniz!

1. **Certificates** sekmesine gidin
2. Herhangi bir sertifikanın yanındaki **📧 Email** butonuna tıklayın
3. E-posta gönderilecektir!

## 🔒 Güvenlik Notları

- ⚠️ **Şifre backend-email-api.js dosyasında saklanıyor**
- Production ortamı için şifreyi environment variable olarak kullanın
- API'yi sadece güvenilir network'lerde çalıştırın
- HTTPS kullanmak için reverse proxy (nginx) kullanın

## 🌐 Production İçin

Production ortamı için:
1. Backend API'yi bir sunucuya deploy edin
2. Domain/IP adresini kullanın (örn: https://api.yourdomain.com/send-email)
3. HTTPS kullanın (SSL sertifikası)
4. Şifreleri environment variable olarak saklayın

## 🐛 Sorun Giderme

**Port 3000 zaten kullanılıyorsa:**
- backend-email-api.js dosyasında `const PORT = 3000;` satırını değiştirin
- Örneğin: `const PORT = 3001;`

**E-posta gönderilemiyorsa:**
- SMTP ayarlarını kontrol edin (backend-email-api.js içinde)
- Port 465 ve SSL ayarlarının doğru olduğundan emin olun
- Firewall'ın 465 portunu engellemediğinden emin olun
- Terminal'de hata mesajlarını kontrol edin

**CORS hatası alıyorsanız:**
- cors paketinin yüklü olduğundan emin olun
- Backend API'nin çalıştığından emin olun
