# Performans Optimizasyonu Script - Tüm Sayfalara Uygulanacak

## Template - Head Bölümü Optimizasyonu

Tüm HTML sayfalarının `<head>` bölümüne şu optimizasyonlar eklenecek:

```html
<!-- Preconnect for performance - DNS lookup ve TCP handshake için -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="dns-prefetch" href="https://www.googletagmanager.com" />

<!-- Critical CSS - Inline olarak yükleniyor (above the fold için) -->
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;background:#f8fafc;margin:0;padding:0;line-height:1.6}.top-bar{background:#1f2a44;color:#e2e8f0;font-size:12px;padding:8px 0}.site-header{background:#fff;border-bottom:1px solid #e2e8f0;position:sticky;top:0;z-index:100}.hero{background:linear-gradient(135deg,#f8fafc 0%,#e2e8f0 100%);padding:80px 0}.hero-title{font-size:2.5rem;font-weight:700;line-height:1.2;margin:0 0 1rem 0;color:#0f172a}body.loaded{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
</style>

<!-- Main CSS - Preload ile non-blocking yükleme -->
<link rel="preload" href="/public-site.css" as="style" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="/public-site.css"></noscript>

<!-- Google Fonts - Async yükleme (non-blocking, font-display: swap) -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" media="print" onload="this.media='all';document.body.classList.add('loaded')">
<noscript><link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet"></noscript>
```

## Template - Footer Bölümü Optimizasyonu

Tüm HTML sayfalarının `</body>` öncesine şu eklenmeli:

```html
<!-- JavaScript - Defer ile non-blocking yükleme -->
<script src="/public-site.js" defer></script>
```

## Değiştirilecek Eski Kod

### Eski CSS yükleme:
```html
<link rel="stylesheet" href="/public-site.css" />
```

### Yeni CSS yükleme:
```html
<!-- Critical CSS inline -->
<style>...</style>
<!-- Main CSS preload -->
<link rel="preload" href="/public-site.css" as="style" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="/public-site.css"></noscript>
```

### Eski Font yükleme:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
```

### Yeni Font yükleme:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" media="print" onload="this.media='all';document.body.classList.add('loaded')">
<noscript><link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet"></noscript>
```

### Eski JavaScript yükleme:
```html
<script src="/public-site.js"></script>
```

### Yeni JavaScript yükleme:
```html
<script src="/public-site.js" defer></script>
```