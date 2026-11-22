// background.js - Akıllı İsimlendirme, Video & GIF Desteği, Magic Bytes & chrome.downloads.onDeterminingFilename

chrome.runtime.onInstalled.addListener(() => {
  console.log("En Büyük Medya İndirici (Fotoğraf, Video & GIF) Arka Plan Servisi Aktif.");
});

// Türkçe karakterleri İngilizce ASCII karşılıklarına dönüştür
function toAsciiEnglish(text) {
  if (!text) return "";
  const charMap = {
    'ç': 'c', 'Ç': 'c',
    'ğ': 'g', 'Ğ': 'g',
    'ı': 'i', 'I': 'i', 'İ': 'i',
    'ö': 'o', 'Ö': 'o',
    'ş': 's', 'Ş': 's',
    'ü': 'u', 'Ü': 'u',
    'â': 'a', 'î': 'i', 'û': 'u'
  };
  return text.replace(/[çÇğĞıIİöÖşŞüÜâîû]/g, (m) => charMap[m] || m).toLowerCase();
}

// "indir", "download" gibi anlamsız kelimeleri temizleyip konuya uygun İngilizce slug üretme
const BANNED_WORDS = new Set([
  "indir", "download", "resmi", "resim", "fotograf", "fotografi", "gorsel", "gorseli",
  "duvar", "kagidi", "wallpaper", "image", "photo", "picture", "yukle", "screenshot",
  "untitled", "ads", "banner", "logo", "jpg", "jpeg", "png", "webp", "gif", "svg",
  "mp4", "webm", "mov", "mkv", "video", "clip", "media", "default", "thumbnail", "thumb", "large", "full"
]);

function buildCleanEnglishSlug(rawText, fallbackUrl) {
  let ascii = toAsciiEnglish(rawText || "");
  ascii = ascii.replace(/[^a-z0-9\s]/g, " ");
  let words = ascii.split(/\s+/).filter((w) => w.length > 1 && !BANNED_WORDS.has(w));

  // Eğer metin sadece "indir"den ibaretse veya boşsa URL'den konu çıkarmayı dene
  if (words.length === 0 && fallbackUrl) {
    try {
      const p = new URL(fallbackUrl).pathname;
      const base = p.split("/").pop() || "";
      const baseAscii = toAsciiEnglish(base.replace(/\.[^/.]+$/, "")).replace(/[^a-z0-9\s]/g, " ");
      words = baseAscii.split(/\s+/).filter((w) => w.length > 2 && !BANNED_WORDS.has(w));
    } catch (e) {}
  }

  // Hala boşsa rastgele numarayla isimlendir (asla "indir" yapma)
  if (words.length === 0) {
    return `media-${Date.now().toString().slice(-6)}`;
  }

  return words.slice(0, 5).join("-");
}

// Magic bytes (İkili dosya başlığı) üzerinden kesin format bulma
function detectFormatFromMagicBytes(buffer, mimeType) {
  if (buffer && buffer.byteLength >= 12) {
    const bytes = new Uint8Array(buffer);

    // 1. WebP: "RIFF" .... "WEBP"
    if (
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // RIFF
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50    // WEBP
    ) {
      return "WEBP";
    }

    // 2. GIF ("GIF87a" veya "GIF89a")
    if (
      bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 &&
      (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61
    ) {
      return "GIF";
    }

    // 3. MP4 (ftyp box: byte 4-7 = 0x66, 0x74, 0x79, 0x70)
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
      return "MP4";
    }

    // 4. WebM (EBML: 0x1A, 0x45, 0xDF, 0xA3)
    if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) {
      return "WEBM";
    }

    // 5. PNG
    if (
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
      bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A
    ) {
      return "PNG";
    }

    // 6. JPEG
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
      return "JPEG";
    }

    // 7. AVIF
    const subStr = String.fromCharCode.apply(null, bytes.subarray(4, 12));
    if (subStr.includes("avif") || subStr.includes("avis")) {
      return "AVIF";
    }
  }

  if (mimeType) {
    const m = mimeType.toLowerCase();
    if (m.includes("mp4")) return "MP4";
    if (m.includes("webm")) return "WEBM";
    if (m.includes("gif")) return "GIF";
    if (m.includes("webp")) return "WEBP";
    if (m.includes("jpeg") || m.includes("jpg")) return "JPEG";
    if (m.includes("png")) return "PNG";
    if (m.includes("avif")) return "AVIF";
    if (m.includes("quicktime")) return "MOV";
  }

  return null;
}

function detectFormatFromUrl(url) {
  if (!url) return "IMG";
  const u = url.toLowerCase();

  // Video
  if (u.includes(".mp4") || u.includes("video/mp4") || u.includes("format=mp4")) return "MP4";
  if (u.includes(".webm") || u.includes("video/webm") || u.includes("format=webm")) return "WEBM";
  if (u.includes(".mov")) return "MOV";
  if (u.includes(".mkv")) return "MKV";
  if (u.includes(".ogg") || u.includes(".ogv")) return "OGG";

  // GIF
  if (u.includes(".gif") || u.includes("format=gif") || u.includes("fm=gif")) return "GIF";

  // Görsel
  if (
    u.includes(".webp") ||
    u.includes("auto=webp") ||
    u.includes("fm=webp") ||
    u.includes("format=webp") ||
    u.includes("f=webp") ||
    u.includes("ext=webp") ||
    u.includes("output=webp") ||
    u.includes("image/webp")
  ) {
    return "WEBP";
  }

  if (u.includes("fm=png") || u.includes("format=png") || u.includes(".png")) return "PNG";
  if (u.includes("fm=jpg") || u.includes("format=jpg") || u.includes(".jpg") || u.includes(".jpeg")) return "JPEG";
  if (u.includes("fm=avif") || u.includes("format=avif") || u.includes(".avif")) return "AVIF";

  return "WEBP";
}

// İndirilecek dosya adlarını belirleme haritası (Chrome'un "indir" ismini koymasını engeller)
const downloadFilenameMap = new Map();

// DİKKAT: suggest senkron çağrıldığında kesinlikle 'return true' döndürülmemelidir!
// Aksi takdirde Chrome asenkron suggest bekleyip indirmeyi sonsuza kadar kilitler.
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  let targetName = null;

  if (downloadFilenameMap.has(item.id)) {
    targetName = downloadFilenameMap.get(item.id);
    downloadFilenameMap.delete(item.id);
  } else if (downloadFilenameMap.has(item.url)) {
    targetName = downloadFilenameMap.get(item.url);
    downloadFilenameMap.delete(item.url);
  }

  if (targetName) {
    suggest({ filename: targetName, conflictAction: "uniquify" });
  } else {
    suggest();
  }
});

// İstek Dinleyicisi
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "DOWNLOAD_IMAGE" || request.action === "DOWNLOAD_MEDIA") {
    handleDownload(request)
      .then((res) => sendResponse({ success: true, res }))
      .catch((err) => {
        console.error("İndirme hatası:", err);
        sendResponse({ success: false, error: err.message || "İndirme başlatılamadı" });
      });
    return true;
  }

  if (request.action === "INSPECT_IMAGE_URL") {
    inspectImageUrl(request.url)
      .then((info) => sendResponse({ success: true, info }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function inspectImageUrl(url) {
  try {
    const res = await fetch(url, {
      cache: "force-cache",
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/gif,video/webm,video/mp4,image/*,*/*;q=0.8"
      }
    });

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const blob = await res.blob();
    const buf = await blob.slice(0, 32).arrayBuffer();

    let realFormat = detectFormatFromMagicBytes(buf, contentType || blob.type);
    if (!realFormat) realFormat = detectFormatFromUrl(url);

    return {
      format: realFormat,
      isWebp: realFormat === "WEBP",
      isGif: realFormat === "GIF",
      isVideo: realFormat === "MP4" || realFormat === "WEBM" || realFormat === "MOV",
      contentType: contentType || blob.type
    };
  } catch (e) {
    const f = detectFormatFromUrl(url);
    return {
      format: f,
      isWebp: f === "WEBP",
      isGif: f === "GIF",
      isVideo: f === "MP4" || f === "WEBM" || f === "MOV",
      contentType: ""
    };
  }
}

// İndirme ve %100 Kalite Dönüştürme
async function handleDownload({ url, format = "original", filename }) {
  if (!url) throw new Error("Medya URL'si bulunamadı.");

  const u = url.toLowerCase();
  const baseSlug = buildCleanEnglishSlug(filename, url);

  // 1. Data URL (Video karesi snapshot veya Canvas verisi)
  if (url.startsWith("data:")) {
    const ext = url.includes("image/jpeg") ? "jpg" : "png";
    const downloadFilename = `${baseSlug}.${ext}`;
    downloadFilenameMap.set(url, downloadFilename);

    try {
      const downloadId = await chrome.downloads.download({
        url: url,
        filename: downloadFilename
      });
      if (downloadId) {
        downloadFilenameMap.set(downloadId, downloadFilename);
      }
      return downloadId;
    } catch (err) {
      throw new Error(`DataURL indirme hatası: ${err.message}`);
    }
  }

  // 2. Video Dosyaları (.mp4, .webm, .mov vb.)
  const isVideoUrl =
    u.includes(".mp4") ||
    u.includes(".webm") ||
    u.includes(".mov") ||
    u.includes(".mkv") ||
    u.includes(".ogg") ||
    u.includes(".ogv") ||
    u.includes("video/") ||
    format === "mp4" ||
    format === "webm";

  if (isVideoUrl && (format === "original" || format === "mp4" || format === "webm")) {
    let ext = "mp4";
    if (u.includes(".webm") || format === "webm") ext = "webm";
    else if (u.includes(".mov")) ext = "mov";
    else if (u.includes(".mkv")) ext = "mkv";
    else if (u.includes(".ogg") || u.includes(".ogv")) ext = "ogg";

    const downloadFilename = `${baseSlug}.${ext}`;

    // Önce videonun gerçekten geçerli olduğunu doğrula (403/404 veya XML/HTML hata sayfalarını engelle)
    let finalUrlToDownload = url;
    let createdBlobUrl = null;

    try {
      const res = await fetch(url, {
        headers: {
          Accept: "video/mp4,video/webm,video/*;q=0.9,*/*;q=0.8"
        }
      });

      if (!res.ok) {
        throw new Error(`Video sunucudan alınamadı: HTTP ${res.status}`);
      }

      const cType = (res.headers.get("content-type") || "").toLowerCase();
      // XML veya HTML hata sayfalarını engelle (örn. AWS S3 403 AccessDenied XML)
      if (cType.includes("xml") || cType.includes("html") || cType.includes("text")) {
        throw new Error("Sunucu geçerli bir video dosyası döndürmedi (Hata sayfası).");
      }

      const videoBlob = await res.blob();
      if (videoBlob.size < 10000) {
        throw new Error("İndirilen video boyutu çok küçük veya geçersiz.");
      }

      const buf = await videoBlob.slice(0, 32).arrayBuffer();
      const detected = detectFormatFromMagicBytes(buf, cType);
      if (detected && detected !== "MP4" && detected !== "WEBM" && detected !== "MOV") {
        throw new Error(`İndirilen dosya video formatında değil (${detected}).`);
      }

      // Doğrulanmış yerel Blob URL'si üzerinden güvenle indir
      createdBlobUrl = URL.createObjectURL(videoBlob);
      finalUrlToDownload = createdBlobUrl;
    } catch (fetchErr) {
      console.warn("Video fetch doğrulama uyarısı:", fetchErr.message);
      // Eğer fetch CORS yüzünden engellendiyse ve URL zaten .mp4 ise doğrudan indirmeyi dene
      if (fetchErr.name === "TypeError" && url.includes(".mp4")) {
        finalUrlToDownload = url;
      } else {
        throw fetchErr;
      }
    }

    downloadFilenameMap.set(finalUrlToDownload, downloadFilename);

    try {
      const downloadId = await chrome.downloads.download({
        url: finalUrlToDownload,
        filename: downloadFilename
      });
      if (downloadId) {
        downloadFilenameMap.set(downloadId, downloadFilename);
      }
      if (createdBlobUrl) {
        setTimeout(() => URL.revokeObjectURL(createdBlobUrl), 60000);
      }
      return downloadId;
    } catch (err) {
      if (createdBlobUrl) URL.revokeObjectURL(createdBlobUrl);
      console.error("chrome.downloads.download video hatası:", err);
      throw new Error(`Video dosyası indirilemedi: ${err.message}`);
    }
  }

  // 3. GIF Orijinal İndirme (Hareketli animasyonu %100 korumak için doğrudan indir)
  if ((u.includes(".gif") || format === "gif") && format === "original") {
    const downloadFilename = `${baseSlug}.gif`;
    downloadFilenameMap.set(url, downloadFilename);

    try {
      const downloadId = await chrome.downloads.download({
        url: url,
        filename: downloadFilename
      });
      if (downloadId) {
        downloadFilenameMap.set(downloadId, downloadFilename);
      }
      return downloadId;
    } catch (err) {
      throw new Error(`GIF indirme hatası: ${err.message}`);
    }
  }

  // 4. Görselleri İnceleme ve İsteğe Göre Dönüştürme
  if (u.includes("youtube.com") || u.includes("youtu.be") || u.includes("/embed/")) {
    throw new Error("YouTube ve web sayfası bağlantıları doğrudan indirilemez. Lütfen sayfadaki akış yakalama motorunu kullanın.");
  }

  let blob;
  let response;
  try {
    response = await fetch(url, {
      cache: "force-cache",
      headers: { Accept: "image/avif,image/webp,image/apng,image/gif,image/*,*/*;q=0.8" }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("html") || contentType.includes("text/html")) {
      throw new Error("Sunucu bir medya dosyası yerine web sayfası (HTML) döndürdü.");
    }
    blob = await response.blob();
  } catch (fetchErr) {
    if (url.includes("youtube.com") || url.includes("youtu.be") || url.includes("/embed/")) {
      throw new Error("YouTube bağlantıları doğrudan indirilemez.");
    }
    // Fetch CORS yüzünden engellenirse doğrudan chrome.downloads ile indir
    console.warn("Fetch başarısız, doğrudan indiriliyor:", fetchErr);
    const downloadFilename = `${baseSlug}.jpg`;
    downloadFilenameMap.set(url, downloadFilename);
    return chrome.downloads.download({
      url: url,
      filename: downloadFilename
    });
  }

  const buffer = await blob.slice(0, 32).arrayBuffer();
  const realFormat = detectFormatFromMagicBytes(buffer, blob.type) || detectFormatFromUrl(url);
  const realExt = realFormat.toLowerCase() === "jpeg" ? "jpg" : realFormat.toLowerCase();

  // 5. Orijinal Görsel İndirme
  if (format === "original") {
    const downloadFilename = `${baseSlug}.${realExt}`;
    const dataUrl = await blobToDataUrl(blob, blob.type || "application/octet-stream");

    downloadFilenameMap.set(dataUrl, downloadFilename);

    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: downloadFilename
    });

    if (downloadId) {
      downloadFilenameMap.set(downloadId, downloadFilename);
    }
    return downloadId;
  }

  // 6. PNG veya JPEG Formatına En Üst Kalitede Dönüştürme
  const targetFormat = format.toLowerCase();
  const targetMime = targetFormat === "jpeg" || targetFormat === "jpg" ? "image/jpeg" : "image/png";
  const targetExt = targetMime === "image/jpeg" ? "jpg" : "png";

  try {
    const bitmap = await createImageBitmap(blob, {
      premultiplyAlpha: "premultiply",
      colorSpaceConversion: "default"
    });

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d", {
      alpha: targetMime === "image/png",
      desynchronized: false
    });

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    if (targetMime === "image/jpeg") {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, bitmap.width, bitmap.height);
    }

    ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);

    // KALİTE: JPEG için 1.0 (Maksimum %100 kalite), PNG için kayıpsız
    const convertedBlob = await canvas.convertToBlob({
      type: targetMime,
      quality: 1.0
    });

    const dataUrl = await blobToDataUrl(convertedBlob, targetMime);
    const downloadFilename = `${baseSlug}.${targetExt}`;

    downloadFilenameMap.set(dataUrl, downloadFilename);

    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: downloadFilename
    });

    if (downloadId) {
      downloadFilenameMap.set(downloadId, downloadFilename);
    }
    return downloadId;
  } catch (err) {
    console.warn("Dönüştürme hatası, doğrudan indiriliyor:", err);
    const downloadFilename = `${baseSlug}.${realExt}`;
    downloadFilenameMap.set(url, downloadFilename);
    return chrome.downloads.download({
      url: url,
      filename: downloadFilename
    });
  }
}

async function blobToDataUrl(blob, mimeType) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.byteLength));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}
