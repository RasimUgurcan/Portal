# Güvenlik Açığı Temizleme Rehberi

## Tespit Edilen Zararlı Dosyalar

Google tarafından sosyal mühendislik içeriği olarak tespit edilen şüpheli URL'ler:

1. `http://eysglobal.com.tr/home/`
2. `http://eysglobal.com.tr/z0f76a1d14fd21a8fb5fd0d03e0fdc3d3cedae52f?wsidchk=...`
3. `http://eysglobal.com.tr/z0f76a1d14fd21a8fb5fd0d03e0fdc3d3cedae52f?wsidchk=...&pdata=...`

## Yapılan Güvenlik Önlemleri

### 1. .htaccess Güvenlik Kuralları ✅
- Şüpheli URL'ler engellendi
- Zararlı dosya yüklemeleri engellendi
- Şüpheli parametreler engellendi
- Ek güvenlik başlıkları eklendi

### 2. Engellenen Dosya/Dizinler
- `/home/` dizini
- `z0f76a1d14fd21a8fb5fd0d03e0fdc3d3cedae52f` dosyası
- `wsidchk` parametresi içeren istekler
- `pdata` parametresi içeren istekler

## Yapılması Gerekenler

### HEMEN YAPILMASI GEREKENLER:

1. **Sunucuda Dosyaları Kontrol Edin ve Silin:**
   ```bash
   # SSH ile sunucuya bağlanın ve şu komutları çalıştırın:
   
   # Şüpheli dizini kontrol edin
   ls -la /home/
   
   # Şüpheli dosyayı kontrol edin
   ls -la z0f76a1d14fd21a8fb5fd0d03e0fdc3d3cedae52f
   
   # Varsa silin
   rm -rf /home/
   rm -f z0f76a1d14fd21a8fb5fd0d03e0fdc3d3cedae52f
   ```

2. **Tüm Dosyaları Tarayın:**
   ```bash
   # Şüpheli dosyaları bulun
   find . -name "*z0f*" -o -name "*wsidchk*" -o -name "*pdata*"
   
   # Son 7 günde değiştirilmiş dosyaları kontrol edin
   find . -type f -mtime -7 -ls
   ```

3. **Dosya İzinlerini Kontrol Edin:**
   ```bash
   # Tüm dosyaların izinlerini kontrol edin
   find . -type f -perm 777
   find . -type f -perm 666
   
   # Şüpheli izinleri düzeltin
   chmod 644 *.html
   chmod 644 *.php
   chmod 755 *.php (sadece çalıştırılabilir dosyalar için)
   ```

4. **Sunucu Loglarını Kontrol Edin:**
   - Apache/Nginx erişim loglarını kontrol edin
   - Şüpheli IP adreslerini tespit edin
   - Başarısız giriş denemelerini kontrol edin

5. **Tüm Şifreleri Değiştirin:**
   - FTP/SSH şifreleri
   - cPanel şifresi
   - Veritabanı şifreleri
   - E-posta şifreleri

6. **Güvenlik Açıklarını Kontrol Edin:**
   - WordPress veya CMS kullanıyorsanız güncelleyin
   - Eski eklentileri kaldırın
   - Güvenlik eklentileri kurun

## Güvenlik Önlemleri

### 1. Dosya Yükleme Güvenliği
- Sadece belirli dosya türlerine izin verin
- Dosya boyutu limitleri koyun
- Yüklenen dosyaları tarayın

### 2. Dizin Listeleme
- `Options -Indexes` zaten aktif ✅
- Tüm dizinlerde `.htaccess` dosyası kontrol edin

### 3. PHP Güvenliği
- `display_errors` kapalı olmalı
- `allow_url_fopen` kapalı olmalı
- `allow_url_include` kapalı olmalı

### 4. Veritabanı Güvenliği
- SQL injection koruması aktif ✅
- Prepared statements kullanın ✅
- Veritabanı kullanıcı izinlerini sınırlayın

### 5. Rate Limiting
- Login denemeleri için rate limiting aktif ✅
- API istekleri için rate limiting aktif ✅

## Google Search Console'da Temizleme

1. **Google Search Console'a giriş yapın**
2. **"Güvenlik Sorunları" bölümüne gidin**
3. **"Sosyal Mühendislik" bölümünü kontrol edin**
4. **Zararlı dosyaları silin**
5. **"Sorunu Düzeltildi Olarak İşaretle" butonuna tıklayın**
6. **Google'dan yeniden tarama isteyin**

## Önleyici Önlemler

### 1. Düzenli Yedekleme
- Günlük otomatik yedekleme kurun
- Yedekleri güvenli bir yerde saklayın

### 2. Güvenlik İzleme
- Dosya değişikliklerini izleyin
- Şüpheli aktiviteleri loglayın
- Güvenlik uyarıları kurun

### 3. Güncellemeler
- Tüm yazılımları güncel tutun
- Güvenlik yamalarını hemen uygulayın
- Eski eklentileri kaldırın

### 4. Erişim Kontrolü
- Güçlü şifreler kullanın
- İki faktörlü kimlik doğrulama kurun
- Gereksiz kullanıcı hesaplarını kaldırın

## Kontrol Listesi

- [ ] Sunucuda şüpheli dosyaları kontrol ettim
- [ ] Şüpheli dosyaları sildim
- [ ] Tüm şifreleri değiştirdim
- [ ] Dosya izinlerini kontrol ettim
- [ ] Sunucu loglarını kontrol ettim
- [ ] Google Search Console'da sorunu işaretledim
- [ ] Güvenlik açıklarını kapattım
- [ ] Yedekleme sistemini kurdum
- [ ] Güvenlik izleme sistemini kurdum

## Destek

Güvenlik sorunlarıyla ilgili yardım için:
- Hosting sağlayıcınızın destek ekibiyle iletişime geçin
- Güvenlik uzmanına danışın
- Google Search Console yardım merkezini ziyaret edin

---

**Önemli:** Bu zararlı dosyalar muhtemelen bir güvenlik açığı yoluyla yüklenmiştir. Dosyaları sildikten sonra güvenlik açığını da kapatmanız gerekiyor, aksi takdirde tekrar yüklenebilirler.