function loadHeader() {
    const headerHTML = `
  <header class="site-header">
    <div class="container nav-wrapper">
      <a class="logo" href="/">
        <img class="logo-mark" src="/assets/eys-monogram.svg" alt="" />
        EYS Global
      </a>
      <nav class="main-nav" id="mainNav">
        <a href="/">Ana Sayfa</a>
        <div class="nav-item has-submenu">
          <button class="nav-link" type="button">Kurumsal</button>
          <div class="submenu">
            <a href="/hakkimizda">Hakkımızda</a>
            <a href="/sss">SSS</a>
            <a href="/referanslar">Referanslarımız</a>
          </div>
        </div>
        <a href="/denetim">Denetim</a>
        <div class="nav-item has-submenu">
          <button class="nav-link" type="button">Danışmanlık</button>
          <div class="submenu">
            <a href="/danismanlik/sosyal-uygunluk">Sosyal Uygunluk Danışmanlığı</a>
            <a href="/danismanlik/surdurulebilirlik">Sürdürülebilirlik Danışmanlığı</a>
            <a href="/danismanlik/iso-sertifikalari">İSO Sertifikaları Danışmanlığı</a>
            <a href="/danismanlik/gida-guvenligi">Gıda Güvenliği Danışmanlığı</a>
            <a href="/danismanlik/musteri-denetimleri">Müşteri Denetimleri Danışmanlığı</a>
          </div>
        </div>
        <div class="nav-item has-submenu">
          <button class="nav-link" type="button">Belgelendirme</button>
          <div class="submenu">
            <a href="/belgelendirme/iso-belgelendirme">ISO Belgelendirme</a>
            <a href="/belgelendirme/ce-belgesi">CE Belgesi</a>
            <a href="/belgelendirme/marka-tescil">Marka Tescil Belgelendirme</a>
            <a href="/belgelendirme/gida-sektoru">Gıda Sektörü Belgelendirme</a>
          </div>
        </div>
        <div class="nav-item has-submenu">
          <button class="nav-link" type="button">Eğitim</button>
          <div class="submenu">
            <a href="/egitim/sosyal-uygunluk-egitimleri">Sosyal Uygunluk Eğitimleri</a>
            <a href="/egitim/gida-sektoru-egitimleri">Gıda Sektörü Eğitimleri</a>
          </div>
        </div>
        <a href="/blog">Blog</a>
        <a href="/eys-portal">EYS Portal</a>
        <a href="/iletisim">İletişim</a>
      </nav>
      <div class="nav-actions">
        <a class="btn ghost" href="/portal">Portal Girişi</a>
        <a class="btn primary" href="/iletisim">Teklif Al</a>
        <button class="nav-toggle" id="navToggle" aria-label="Menüyü aç">
          <span></span><span></span><span></span>
        </button>
      </div>
    </div>
  </header>
  `;

    document.getElementById('site-header-container').innerHTML = headerHTML;

    // Re-initialize active state and event listeners
    if (typeof updateActiveNavLink === 'function') {
        updateActiveNavLink();
    }
}
