# Fotoğraf, Video ve GIF İndirici (En Yüksek Kalite) Chrome Eklentisi 🚀

Web sayfalarındaki **en yüksek çözünürlüklü fotoğrafları, videoları (HLS Stream / Blob / MSE dahil) ve hareketli GIF'leri** anında tespit eden, kayıpsız dönüştürüp indiren modern Chrome eklentisi (Manifest V3).

---

## ✨ Özellikler

### 1. 🎬 Gelişmiş Video İndirme & Akış (Stream / Blob / MSE) Dönüştürücü
- **Doğrudan MP4 / WebM İndirme:** Web sayfalarında oynatılan veya sayfada bulunan videoları anında orijinal bağlantılarından tespit eder.
- **Canlı Akış & Blob Dönüştürme:** Normal indirme araçlarının "Stream/Blob Hatası" verdiği (Pinterest, YouTube Shorts, Twitter/X, Instagram, TikTok vb.) parçalı HLS / m3u8 / blob akışlarını doğrudan tarayıcı belleğinde tam uyumlu ve bozulmasız MP4 video dosyasına dönüştürür.
- **Hardware Stride / VLC Tearing Koruması:** Video çözünürlüklerini 16-piksel hizalamalı işleyerek VLC ve Windows Medya Oynatıcı'da oluşan yeşil çizgi veya piksel kayması sorunlarını engeller.
- **📸 Anlık Kare Yakalama (Snapshot):** Videonun istediğiniz anını tek tıkla tam çözünürlüklü ve kayıpsız PNG fotoğrafı olarak kaydeder.

### 2. 🎞️ Hareketli GIF Tespiti & İndirme
- Sayfadaki hareketli GIF'leri dosya uzantısına bağımlı kalmadan binary **Magic Bytes** başlıklarıyla tespit eder.
- Animasyonlu `.gif` olarak ya da ilk karesini kayıpsız PNG/JPG olarak kaydetme imkanı sunar.

### 3. 🖼️ Yüksek Çözünürlüklü Görsel & WebP Dönüştürme
- Sayfadaki en büyük ve en kaliteli görseli akıllı ağırlıklandırma algoritmasıyla otomatik bulur.
- WebP formatındaki fotoğrafları %100 kayıpsız PNG veya maksimum kalitede (%100) JPG formatına dönüştürür.

### 4. 🎛️ Sayfayı Rahatsız Etmeyen Akıllı Yan Panel & Popup Arayüzü
- Yalnızca çalıştığı sayfada ve ekranın sağ kenarında ince, modern ve katlanabilir bir çubuk olarak yer alır.
- Menü açıldığında kilitlenir; fare kaysa veya sayfa kaydırılsa dahi siz işlem yapana kadar kapanmaz.
- Sayfadaki diğer tıklanabilir butonları ve içerikleri asla engellemez.

---

## 🛠️ Kurulum Adımları

1. Bu depoyu bilgisayarınıza indirin (ZIP olarak) veya klonlayın:
   ```bash
   git clone https://github.com/egemenbaki1/largest-image-downloader.git
   ```
2. Google Chrome'u açın ve adres çubuğuna şunu yazın:
   ```text
   chrome://extensions/
   ```
3. Sağ üst köşedeki **"Geliştirici modu" (Developer mode)** anahtarını açın.
4. Sol üstteki **"Paketlenmemiş öğe yükle" (Load unpacked)** butonuna tıklayın.
5. Klonladığınız veya açtığınız `largest-image-downloader` klasörünü seçin.
6. Kurulum tamamlandı! Herhangi bir web sayfasına girerek sağ üstteki eklenti simgesinden veya kenardaki indirme çubuğundan medyaları indirebilirsiniz.

---

## 📄 Lisans
Bu proje MIT lisansı ile lisanslanmıştır.
