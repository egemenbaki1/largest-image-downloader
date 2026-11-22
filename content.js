// content.js - Fotoğraf, Video ve GIF Desteği, Sabit Kalan Menü & Stream'i MP4'e Çevirip İndirme

(function () {
  "use strict";

  const BADGE_ID = "__largest_img_corner_badge__";

  let activeMediaInView = null;
  let allScannedMedia = [];
  let currentBadgeItem = null;

  // Sekme bazlı çalıştırma ve kapatma durumu (Sadece çalıştırıldığı sekmelerde görünür)
  let isActivatedOnThisTab = false;
  let isDismissedOnThisTab = false;

  try {
    isActivatedOnThisTab = sessionStorage.getItem("__LRG_ACTIVE_TAB__") === "true";
    isDismissedOnThisTab = sessionStorage.getItem("__LRG_DISMISSED__") === "true";
  } catch (e) {}

  let autoShowEverywhere = false;
  try {
    chrome.storage.local.get({ autoShowEverywhere: false }, (data) => {
      autoShowEverywhere = !!data.autoShowEverywhere;
      if (autoShowEverywhere && !isDismissedOnThisTab && !document.hidden) {
        performScan();
      }
    });
  } catch (e) {}

  // 1. Sniffer Tarafından Ağdan Yakalanan Gerçek Video URL'leri
  const sniffedVideoUrls = [];

  window.addEventListener("message", (e) => {
    if (e.data && e.data.type === "__LRG_SNIFFED_VIDEO__" && e.data.url) {
      const u = e.data.url;
      if (!sniffedVideoUrls.includes(u)) {
        sniffedVideoUrls.push(u);
        if (
          activeMediaInView &&
          activeMediaInView.mediaType === "video" &&
          (activeMediaInView.isBlobStream || activeMediaInView.url.startsWith("blob:"))
        ) {
          activeMediaInView.url = u;
          activeMediaInView.isBlobStream = false;
          activeMediaInView.format = detectFormat(u);
          const badge = document.getElementById(BADGE_ID);
          if (badge) {
            renderCornerBadge(activeMediaInView);
          }
        }
      }
    }
  });

  const HIGH_RES_ATTRS = [
    "data-zoom-image",
    "data-high-res-src",
    "data-original",
    "data-large-file",
    "data-full-url",
    "data-large_image",
    "data-src-zoom",
    "data-orig-file",
    "data-lazy-src",
    "data-src",
    "data-url",
    "data-image",
    "data-video-src",
    "data-video-url",
    "data-mp4"
  ];

  function toAbsoluteUrl(url) {
    if (!url) return "";
    try {
      return new URL(url, document.baseURI).href;
    } catch (e) {
      return url;
    }
  }

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

  const BANNED_WORDS = new Set([
    "indir", "download", "resmi", "resim", "fotograf", "fotografi", "gorsel", "gorseli",
    "duvar", "kagidi", "wallpaper", "image", "photo", "picture", "yukle", "screenshot",
    "untitled", "ads", "banner", "logo", "jpg", "jpeg", "png", "webp", "gif", "svg",
    "mp4", "webm", "mov", "mkv", "video", "clip", "media", "default", "thumbnail", "thumb", "large", "full"
  ]);

  function extractMeaningfulSlug({ alt, title, caption, pageTitle, url }) {
    function cleanCandidate(text) {
      if (!text || typeof text !== "string") return null;
      let ascii = toAsciiEnglish(text).replace(/[^a-z0-9\s]/g, " ");
      let words = ascii.split(/\s+/).filter((w) => w.length > 1 && !BANNED_WORDS.has(w));
      return words.length > 0 ? words.slice(0, 5).join("-") : null;
    }

    let slug =
      cleanCandidate(alt) ||
      cleanCandidate(title) ||
      cleanCandidate(caption) ||
      cleanCandidate(pageTitle);

    if (!slug && url) {
      try {
        const p = new URL(url).pathname;
        const base = p.split("/").pop() || "";
        slug = cleanCandidate(base.replace(/\.[^/.]+$/, ""));
      } catch (e) {}
    }

    if (!slug) {
      slug = `video-${Date.now().toString().slice(-6)}`;
    }

    return slug;
  }

  function detectFormat(url) {
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
    if (u.includes(".svg")) return "SVG";

    try {
      const path = new URL(url).pathname;
      const cleanExt = path.split(".").pop().toUpperCase();
      if (cleanExt && cleanExt.length >= 2 && cleanExt.length <= 4) {
        return cleanExt;
      }
    } catch (e) {}

    return "WEBP";
  }

  async function detectRealMagicFormat(url) {
    if (!url || url.startsWith("blob:") || url.startsWith("data:")) return null;
    try {
      const res = await fetch(url, {
        cache: "force-cache",
        headers: { Accept: "image/avif,image/webp,image/apng,image/gif,video/webm,video/mp4,image/*,*/*;q=0.8" }
      });
      const blob = await res.blob();
      const buf = await blob.slice(0, 32).arrayBuffer();
      const bytes = new Uint8Array(buf);

      // 1. WebP
      if (
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
      ) {
        return "WEBP";
      }

      // 2. GIF
      if (
        bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 &&
        (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61
      ) {
        return "GIF";
      }

      // 3. MP4 (ftyp)
      if (bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
        return "MP4";
      }

      // 4. WebM
      if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) {
        return "WEBM";
      }

      // 5. PNG
      if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return "PNG";

      // 6. JPEG
      if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return "JPEG";

      const sub = String.fromCharCode.apply(null, bytes.subarray(4, 12));
      if (sub.includes("avif") || sub.includes("avis")) return "AVIF";

      if (blob.type) {
        const m = blob.type.toLowerCase();
        if (m.includes("mp4")) return "MP4";
        if (m.includes("webm")) return "WEBM";
        if (m.includes("gif")) return "GIF";
        if (m.includes("webp")) return "WEBP";
        if (m.includes("jpeg") || m.includes("jpg")) return "JPEG";
        if (m.includes("png")) return "PNG";
      }
    } catch (e) {}
    return null;
  }

  function parseSrcset(srcsetStr) {
    if (!srcsetStr) return [];
    return srcsetStr
      .split(",")
      .map((entry) => {
        const parts = entry.trim().split(/\s+/);
        if (!parts[0]) return null;
        const url = toAbsoluteUrl(parts[0]);
        let width = 0;
        let density = 1;

        if (parts[1]) {
          if (parts[1].endsWith("w")) {
            width = parseInt(parts[1], 10) || 0;
          } else if (parts[1].endsWith("x")) {
            density = parseFloat(parts[1]) || 1;
            width = Math.round(density * 1200);
          }
        }
        return { url, width, density };
      })
      .filter(Boolean);
  }

  function extractWidthHintFromUrl(url) {
    if (!url) return 0;
    const wMatch = url.match(/[?&](?:w|width|size)=(\d+)/i);
    if (wMatch && wMatch[1]) return parseInt(wMatch[1], 10);
    const dimMatch = url.match(/(\d{3,4})x(\d{3,4})/i);
    if (dimMatch && dimMatch[1]) return parseInt(dimMatch[1], 10);
    return 0;
  }

  function getViewportVisibilityScore(el) {
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const vw = window.innerWidth || document.documentElement.clientWidth;

    const vertOverlap = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
    const horizOverlap = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
    const visiblePx = vertOverlap * horizOverlap;

    if (visiblePx <= 0) return 0;

    const elCenterY = rect.top + rect.height / 2;
    const screenCenterY = vh / 2;
    const distToCenter = Math.abs(elCenterY - screenCenterY);
    const centerFactor = Math.max(0.1, 1 - distToCenter / vh);

    return visiblePx * centerFactor;
  }

  // Bir bağlantının gerçekten indirilebilir ikili bir video dosyası olup olmadığını denetleme (HTML / embed sayfalarını engeller)
  function isGenuineDirectVideoUrl(url) {
    if (!url || typeof url !== "string") return false;
    const u = url.toLowerCase().trim();
    if (u.startsWith("blob:") || u.startsWith("data:")) return false;

    // Web sayfaları, iframe'ler, YouTube, Vimeo, embed oynatıcılar veya HTML uzantıları ASLA video dosyası değildir!
    if (
      u.includes("/embed/") ||
      u.includes("/iframe/") ||
      u.includes("youtube.com") ||
      u.includes("youtu.be") ||
      u.includes("player.vimeo.com") ||
      u.includes("facebook.com/plugins") ||
      u.includes("dailymotion.com/embed") ||
      u.includes("tiktok.com/embed") ||
      u.endsWith(".html") ||
      u.endsWith(".htm") ||
      u.endsWith(".php") ||
      u.endsWith(".asp") ||
      u.endsWith(".aspx") ||
      u.includes(".m3u8") ||
      u.includes(".mpd")
    ) {
      return false;
    }

    // Doğrudan video dosyası formatı taşımalıdır veya bilinen video CDN'inde olmalıdır
    const hasVideoExt =
      u.includes(".mp4") ||
      u.includes(".webm") ||
      u.includes(".mov") ||
      u.includes(".mkv") ||
      u.includes(".m4v") ||
      u.includes(".ogv");

    const isKnownVideoCDN =
      u.includes("v1.pinimg.com/videos") ||
      u.includes("video.twimg.com") ||
      u.includes("v.redd.it") ||
      u.includes("cdninstagram.com") ||
      u.includes("tiktokcdn.com");

    return hasVideoExt || isKnownVideoCDN;
  }

  // Pinterest Sayfalarından Orijinal HD MP4 Video Bağlantısını Çıkarma
  function extractPinterestVideoUrl(videoEl) {
    // 1. Sniffer tarafından yakalanan Pinterest MP4 veya HLS-MP4 var mı?
    for (let i = sniffedVideoUrls.length - 1; i >= 0; i--) {
      const u = sniffedVideoUrls[i];
      if (u.includes("v1.pinimg.com/videos")) {
        if (u.includes(".mp4")) return u;
        if (u.includes("/hls/") || u.includes(".m3u8")) {
          return u.replace("/videos/mc/hls/", "/videos/mc/720p/").replace("/hls/", "/720p/").replace(/\.m3u8.*$/i, ".mp4");
        }
      }
    }

    const candidates = [];
    const seenUrls = new Set();

    const pushCandidate = (quality, rawUrl) => {
      if (!rawUrl || typeof rawUrl !== "string") return;
      let clean = rawUrl.split("\\/").join("/").trim();
      if (clean.includes("/hls/") || clean.includes(".m3u8")) {
        clean = clean.replace("/videos/mc/hls/", "/videos/mc/720p/").replace("/hls/", "/720p/").replace(/\.m3u8.*$/i, ".mp4");
      }
      if (seenUrls.has(clean)) return;
      seenUrls.add(clean);
      candidates.push({ quality, url: clean });
    };

    function inspectVList(vl) {
      if (!vl || typeof vl !== "object") return;
      if (vl.V_1080P && vl.V_1080P.url) pushCandidate(1080, vl.V_1080P.url);
      if (vl.V_720P && vl.V_720P.url) pushCandidate(720, vl.V_720P.url);
      if (vl.V_EXP7 && vl.V_EXP7.url) pushCandidate(700, vl.V_EXP7.url);
      if (vl.V_480P && vl.V_480P.url) pushCandidate(480, vl.V_480P.url);
      for (const key of Object.keys(vl)) {
        const item = vl[key];
        if (item && item.url && typeof item.url === "string") {
          pushCandidate(500, item.url);
        }
      }
    }

    function searchVideoList(obj) {
      if (!obj || typeof obj !== "object") return;
      if (Array.isArray(obj)) {
        for (const item of obj) searchVideoList(item);
        return;
      }
      if (obj.video_list && typeof obj.video_list === "object") {
        inspectVList(obj.video_list);
      }
      if (obj.V_720P || obj.V_1080P || obj.V_EXP7 || obj.V_HLSV4) {
        inspectVList(obj);
      }
      for (const k of Object.keys(obj)) {
        if (typeof obj[k] === "object") {
          searchVideoList(obj[k]);
        }
      }
    }

    // Hedef pin ID'si tespit edilebiliyorsa öncelikle ilgili pin'i ara
    let targetPinId = null;
    if (videoEl) {
      const pinLink = videoEl.closest('a[href*="/pin/"]');
      if (pinLink) {
        const m = pinLink.href.match(/\/pin\/(\d+)/);
        if (m) targetPinId = m[1];
      }
      if (!targetPinId) {
        const pinContainer = videoEl.closest("[data-test-pin-id]");
        if (pinContainer) targetPinId = pinContainer.getAttribute("data-test-pin-id");
      }
    }
    if (!targetPinId) {
      const m = window.location.pathname.match(/\/pin\/(\d+)/);
      if (m) targetPinId = m[1];
    }

    // 2. Sayfadaki <script id="__PWS_DATA__"> ve diğer JSON etiketlerini ayrıştır
    const pwsScript = document.getElementById("__PWS_DATA__") || document.querySelector('script[id*="PWS"]');
    if (pwsScript && pwsScript.textContent) {
      try {
        const data = JSON.parse(pwsScript.textContent);
        if (targetPinId && data?.props?.initialReduxState?.pins?.[targetPinId]) {
          const pinData = data.props.initialReduxState.pins[targetPinId];
          searchVideoList(pinData);
        }
        if (candidates.length === 0) {
          searchVideoList(data);
        }
      } catch (e) {}
    }

    // 3. Diğer script etiketlerini JSON olarak tara
    if (candidates.length === 0) {
      const scripts = document.querySelectorAll("script");
      for (const s of scripts) {
        if (s.id === "__PWS_DATA__") continue;
        const type = (s.getAttribute("type") || "").toLowerCase();
        if (type.includes("json") || (s.textContent && s.textContent.includes("video_list"))) {
          try {
            const parsed = JSON.parse(s.textContent);
            searchVideoList(parsed);
          } catch (e) {}
        }
      }
    }

    // 4. Regex ile sayfa içeriğinden v1.pinimg.com video linklerini yakala
    if (candidates.length === 0) {
      const scripts = document.querySelectorAll("script");
      for (const s of scripts) {
        const text = (s.textContent || "").split("\\/").join("/");
        if (text.includes("v1.pinimg.com/videos")) {
          const mp4Matches = text.match(/https?:\/\/v1\.pinimg\.com\/videos\/mc\/[A-Za-z0-9_\/\-\.]+\.mp4/g);
          if (mp4Matches) {
            for (const m of mp4Matches) {
              let q = 500;
              if (m.includes("1080p")) q = 1080;
              else if (m.includes("720p")) q = 720;
              pushCandidate(q, m);
            }
          }
          const hlsMatches = text.match(/https?:\/\/v1\.pinimg\.com\/videos\/mc\/hls\/[A-Za-z0-9_\/\-\.]+\.m3u8/g);
          if (hlsMatches) {
            for (const h of hlsMatches) {
              pushCandidate(715, h);
            }
          }
        }
      }
    }

    // 5. HTML body içinde regex araması
    if (candidates.length === 0 && document.body) {
      const bodyText = (document.body.innerHTML || "").split("\\/").join("/");
      if (bodyText.includes("v1.pinimg.com/videos")) {
        const mp4Matches = bodyText.match(/https?:\/\/v1\.pinimg\.com\/videos\/mc\/[A-Za-z0-9_\/\-\.]+\.mp4/g);
        if (mp4Matches) {
          for (const m of mp4Matches) {
            let q = 500;
            if (m.includes("1080p")) q = 1080;
            else if (m.includes("720p")) q = 720;
            pushCandidate(q, m);
          }
        }
        const hlsMatches = bodyText.match(/https?:\/\/v1\.pinimg\.com\/videos\/mc\/hls\/[A-Za-z0-9_\/\-\.]+\.m3u8/g);
        if (hlsMatches) {
          for (const h of hlsMatches) {
            pushCandidate(715, h);
          }
        }
      }
    }

    // DİKKAT: thumbnail / poster değişimi asla yapılmaz (403 AccessDenied hatasını önler)

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.quality - a.quality);
      return candidates[0].url;
    }

    return null;
  }

  // Sayfa Üzerindeki Gizli / Üst Düzey Video Bağlantılarını Bulma (Pinterest, Twitter, OpenGraph, JSON-LD, Sniffer)
  function findMetadataVideoUrl(videoEl) {
    // 1. Pinterest Özel HD Video Çıkarıcı
    const pinterestUrl = extractPinterestVideoUrl(videoEl);
    if (pinterestUrl && isGenuineDirectVideoUrl(pinterestUrl)) return pinterestUrl;

    // 2. Ağ dinleyicisi (Sniffer) tarafından bulunan URL'ler
    if (sniffedVideoUrls.length > 0) {
      for (let i = sniffedVideoUrls.length - 1; i >= 0; i--) {
        const u = sniffedVideoUrls[i];
        if (isGenuineDirectVideoUrl(u)) {
          return u;
        }
      }
    }

    // 3. Twitter / X Özel Video Çıkarıcı
    if (document.body) {
      const twText = (document.body.innerHTML || "").replace(/\\\//g, "/");
      const twMatches = twText.match(/https?:\/\/video\.twimg\.com\/[^\s"'<>]+\.mp4/g);
      if (twMatches && twMatches.length > 0 && isGenuineDirectVideoUrl(twMatches[0])) {
        return twMatches[0];
      }
    }

    // 4. OpenGraph ve Twitter Video Etiketleri (Yalnızca DOĞRULANMIŞ doğrudan video dosyası ise!)
    const ogVideo =
      document.querySelector('meta[property="og:video:secure_url"]') ||
      document.querySelector('meta[property="og:video"]') ||
      document.querySelector('meta[property="og:video:url"]') ||
      document.querySelector('meta[name="twitter:player:stream"]');
    if (ogVideo && ogVideo.content && isGenuineDirectVideoUrl(ogVideo.content)) {
      return ogVideo.content;
    }

    // 5. JSON-LD Yapılandırılmış Veriler (Yalnızca DOĞRULANMIŞ doğrudan video dosyası ise!)
    const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of ldScripts) {
      try {
        const json = JSON.parse(s.innerText);
        const cUrl = json.contentUrl || json.video?.contentUrl;
        if (cUrl && isGenuineDirectVideoUrl(cUrl)) {
          return cUrl;
        }
      } catch (e) {}
    }

    // 6. Kapsayıcı Elemanlardaki data- öznitelikleri (Yalnızca DOĞRULANMIŞ doğrudan video dosyası ise!)
    if (videoEl) {
      const container = videoEl.closest("[data-video-url], [data-mp4], [data-src], [data-url], [data-stream-url]");
      if (container) {
        for (const attr of ["data-video-url", "data-mp4", "data-src", "data-url", "data-stream-url"]) {
          const val = container.getAttribute(attr);
          if (val && isGenuineDirectVideoUrl(val)) return val;
        }
      }
    }

    return null;
  }

  // 1. Resim / Fotoğraf / GIF Elemanlarını Analiz Etme
  function analyzeImgElement(img) {
    let url = img.currentSrc || img.src || "";
    let width = img.naturalWidth || 0;
    let height = img.naturalHeight || 0;

    let srcsetCandidates = parseSrcset(img.getAttribute("srcset") || img.srcset);

    if (img.parentElement && img.parentElement.tagName.toLowerCase() === "picture") {
      const sources = img.parentElement.querySelectorAll("source");
      sources.forEach((s) => {
        srcsetCandidates = srcsetCandidates.concat(parseSrcset(s.getAttribute("srcset")));
      });
    }

    if (srcsetCandidates.length > 0) {
      srcsetCandidates.sort((a, b) => b.width - a.width);
      if (srcsetCandidates[0].width > 0) {
        url = srcsetCandidates[0].url;
        if (srcsetCandidates[0].width > width) {
          width = srcsetCandidates[0].width;
        }
      }
    }

    for (const attr of HIGH_RES_ATTRS) {
      const val = img.getAttribute(attr);
      if (val && !val.startsWith("data:image/svg") && val.trim().length > 4) {
        const absUrl = toAbsoluteUrl(val.trim());
        if (absUrl.includes(" ") && absUrl.includes("w")) {
          const parsed = parseSrcset(val);
          if (parsed.length > 0) {
            parsed.sort((a, b) => b.width - a.width);
            url = parsed[0].url;
            break;
          }
        } else {
          url = absUrl;
          break;
        }
      }
    }

    url = toAbsoluteUrl(url);

    if (!url || url.startsWith("data:image/gif;base64,R0lGODlhAQAB") || url.startsWith("data:image/svg+xml")) {
      return null;
    }

    const hintWidth = extractWidthHintFromUrl(url);
    if (hintWidth > width) width = hintWidth;

    if (width === 0) {
      width = parseInt(img.getAttribute("width"), 10) || img.offsetWidth || img.clientWidth || 0;
    }
    if (height === 0) {
      height = parseInt(img.getAttribute("height"), 10) || img.offsetHeight || img.clientHeight || 0;
    }

    // Gerçek fotoğraf veya GIF olmayan küçük görselleri, ikonları, avatarları ve reklamları ele
    if (width < 200 || height < 180 || (width * height < 40000)) {
      return null;
    }

    const rect = img.getBoundingClientRect();
    const visibilityScore = getViewportVisibilityScore(img);
    const isVisibleInDOM = rect.width > 0 && rect.height > 0 && window.getComputedStyle(img).display !== "none";
    const detectedFmt = detectFormat(url);
    const isGif = detectedFmt === "GIF" || url.toLowerCase().includes(".gif");

    const altText = img.alt || "";
    const titleText = img.title || img.getAttribute("aria-label") || "";
    const figCaption = img.closest("figure")?.querySelector("figcaption")?.innerText || "";
    const slug = extractMeaningfulSlug({
      alt: altText,
      title: titleText,
      caption: figCaption,
      pageTitle: document.title,
      url: url
    });

    return {
      element: img,
      url: url,
      width: width,
      height: height,
      area: width * height,
      isVisibleInDOM: isVisibleInDOM,
      visibilityScore: visibilityScore,
      isInViewport: visibilityScore > 0,
      format: detectedFmt,
      isWebp: detectedFmt === "WEBP",
      isGif: isGif,
      mediaType: isGif ? "gif" : "image",
      slug: slug,
      type: "img"
    };
  }

  // 2. Video (<video>) Elemanlarını Analiz Etme
  function analyzeVideoElement(video) {
    let url = "";

    // 1. Önce doğrudan meta verilerden (Pinterest, Twitter, OpenGraph, JSON-LD, Sniffer) gerçek HD video ara
    const metaUrl = findMetadataVideoUrl(video);
    if (metaUrl) {
      url = metaUrl;
    }

    // 2. Child <source> etiketlerine bak (Gerçek http/https URL'leri)
    if (!url) {
      const sources = Array.from(video.querySelectorAll("source"));
      const httpSources = sources.filter((s) => s.src && s.src.startsWith("http") && !s.src.includes(".m3u8"));
      if (httpSources.length > 0) {
        const mp4Src = httpSources.find(
          (s) => (s.type && s.type.includes("mp4")) || s.src.includes(".mp4")
        );
        url = mp4Src ? mp4Src.src : httpSources[0].src;
      }
    }

    // 3. data- özniteliklerine bak
    if (!url) {
      for (const attr of ["data-src", "data-video-src", "data-url", "data-orig", "data-mp4"]) {
        const val = video.getAttribute(attr);
        if (val && (val.startsWith("http") || val.startsWith("/")) && !val.includes(".m3u8")) {
          url = toAbsoluteUrl(val.trim());
          break;
        }
      }
    }

    // 4. video.src doğrudan http ile başlıyorsa al
    if (!url && video.src && video.src.startsWith("http") && !video.src.includes(".m3u8")) {
      url = video.src;
    }

    // 5. video.currentSrc doğrudan http ile başlıyorsa al
    if (!url && video.currentSrc && video.currentSrc.startsWith("http") && !video.currentSrc.includes(".m3u8")) {
      url = video.currentSrc;
    }

    // 6. Son çare olarak mevcut blob kaynağını al
    if (!url) {
      url = video.currentSrc || video.src || "";
    }

    url = toAbsoluteUrl(url);
    if (!url || url.startsWith("data:image/svg") || url.startsWith("blob:null")) return null;

    const isBlobStream = url.startsWith("blob:");

    let width = video.videoWidth || 0;
    let height = video.videoHeight || 0;

    if (width === 0 || height === 0) {
      if (video.readyState === 0) {
        video.addEventListener("loadedmetadata", () => {
          performScan();
        }, { once: true });
      }
      const rect = video.getBoundingClientRect();
      width = parseInt(video.getAttribute("width"), 10) || Math.round(rect.width) || video.offsetWidth || 0;
      height = parseInt(video.getAttribute("height"), 10) || Math.round(rect.height) || video.offsetHeight || 0;
    }

    if (width === 0 || height === 0) {
      const container = video.closest('[data-test-id="pin"], [role="listitem"], .pinWrapper, figure, article, div');
      if (container) {
        const cRect = container.getBoundingClientRect();
        if (cRect.width > width) width = Math.round(cRect.width);
        if (cRect.height > height) height = Math.round(cRect.height);
      }
    }

    // Video geçerli bir URL'ye veya akışa sahipse boyutlar henüz hazır olmasa bile varsayılan HD boyut ata (videoyu eleme)
    if (width < 200 || height < 150) {
      if (url && (url.includes("v1.pinimg.com") || url.includes(".mp4") || url.includes("blob:"))) {
        width = 1280;
        height = 720;
      } else {
        return null;
      }
    }

    const rect = video.getBoundingClientRect();
    const vScore = getViewportVisibilityScore(video) || (rect.width > 0 ? 0.8 : 0.5);
    const isVisibleInDOM = (rect.width > 0 && rect.height > 0) || window.getComputedStyle(video).display !== "none";
    let fmt = detectFormat(url);
    // Videolar ASLA JPEG veya görsel formatı olarak adlandırılamaz
    if (fmt !== "MP4" && fmt !== "WEBM" && fmt !== "MOV" && fmt !== "MKV" && fmt !== "OGG") {
      fmt = "MP4";
    }

    const titleText = video.title || video.getAttribute("aria-label") || "";
    const figCaption = video.closest("figure")?.querySelector("figcaption")?.innerText || "";
    const slug = extractMeaningfulSlug({
      alt: titleText,
      title: titleText,
      caption: figCaption,
      pageTitle: document.title,
      url: url
    });

    return {
      element: video,
      url: url,
      width: width,
      height: height,
      area: width * height,
      isVisibleInDOM: isVisibleInDOM,
      visibilityScore: vScore,
      isInViewport: vScore > 0,
      format: fmt,
      mediaType: "video",
      isBlobStream: isBlobStream,
      isWebp: false,
      isGif: false,
      slug: slug,
      type: "video"
    };
  }

  // 3. CSS Background-Image Elemanlarını Analiz Etme
  function analyzeBackgroundImages() {
    const list = [];
    // Yalnızca açıkça inline style veya style içinde background resmi belirtilen büyük blokları tara
    const elements = document.querySelectorAll('[style*="background"], [style*="url("]');

    elements.forEach((el) => {
      if (el.id && el.id.startsWith("__largest_img")) return;

      const rect = el.getBoundingClientRect();
      if (rect.width < 250 || rect.height < 200) return;

      let bgUrl = null;
      const inlineStyle = el.getAttribute("style") || "";
      if (inlineStyle.includes("url(")) {
        const m = inlineStyle.match(/url\(['"]?([^'"]+)['"]?\)/);
        if (m && m[1]) bgUrl = m[1];
      } else {
        const style = window.getComputedStyle(el);
        if (style.backgroundImage && style.backgroundImage !== "none" && style.backgroundImage.includes("url(")) {
          const m = style.backgroundImage.match(/url\(['"]?([^'"]+)['"]?\)/);
          if (m && m[1]) bgUrl = m[1];
        }
      }

      if (bgUrl) {
        const url = toAbsoluteUrl(bgUrl);
        const u = url.toLowerCase();
        const isRealImg =
          u.includes(".jpg") || u.includes(".jpeg") || u.includes(".png") ||
          u.includes(".webp") || u.includes(".avif") || u.includes(".gif");

        if (url && !url.startsWith("data:") && !url.endsWith(".svg") && isRealImg) {
          const w = Math.round(rect.width);
          const h = Math.round(rect.height);
          if (w < 250 || h < 200 || (w * h < 50000)) return;

          const fmt = detectFormat(url);
          const isGif = fmt === "GIF" || url.toLowerCase().includes(".gif");
          const vScore = getViewportVisibilityScore(el);
          const slug = extractMeaningfulSlug({
            alt: el.getAttribute("aria-label") || "",
            title: el.title || "",
            pageTitle: document.title,
            url: url
          });

          list.push({
            element: el,
            url: url,
            width: w,
            height: h,
            area: w * h,
            isVisibleInDOM: rect.width > 0 && rect.height > 0,
            visibilityScore: vScore,
            isInViewport: vScore > 0,
            format: fmt,
            isWebp: fmt === "WEBP",
            isGif: isGif,
            mediaType: isGif ? "gif" : "image",
            slug: slug,
            type: "background"
          });
        }
      }
    });

    return list;
  }

  // Sayfayı Tara ve En Uygun Medyayı Seç
  function performScan() {
    // 1. Sekme arka plandaysa veya gizliyse tarama yapma
    if (document.hidden) return allScannedMedia;

    // 2. Kullanıcı bu sekmede çarpıya basıp kapattıysa rozet gösterme
    if (isDismissedOnThisTab) {
      removeEl(BADGE_ID);
      return [];
    }

    // 3. Kullanıcı bu sekmede eklentiyi çalıştırmadıysa ve otomatik mod kapalıysa gösterme
    if (!isActivatedOnThisTab && !autoShowEverywhere) {
      removeEl(BADGE_ID);
      return [];
    }

    const existingBadge = document.getElementById(BADGE_ID);
    if (existingBadge && existingBadge.classList.contains("__lrg_menu_open")) {
      return allScannedMedia;
    }

    const candidates = [];
    const activeVideoContainers = new Set();

    // 1. Önce Videoları (<video>) tara ve kapsayıcılarını kaydet
    const videoEls = document.querySelectorAll("video");
    videoEls.forEach((v) => {
      if (v.id && v.id.startsWith("__largest")) return;
      const item = analyzeVideoElement(v);
      if (item && item.url) {
        candidates.push(item);
        const pin = v.closest('[data-test-id="pin"], [role="listitem"], .pinWrapper, figure, article, [data-grid-item]');
        if (pin) activeVideoContainers.add(pin);
      }
    });

    // 2. DOM'da henüz <video> etiketi yoksa ama sayfada Pinterest video pin varsa (Lazy loaded video)
    if (candidates.length === 0) {
      const pinterestVid = extractPinterestVideoUrl(null);
      if (pinterestVid) {
        const pinImg = document.querySelector('img[src*="videos_thumbnails"], [data-test-id="pin"] img, .pinWrapper img');
        const slug = pinImg ? extractMeaningfulSlug({
          alt: pinImg.alt || "",
          title: pinImg.title || "",
          pageTitle: document.title,
          url: pinterestVid
        }) : extractMeaningfulSlug({ pageTitle: document.title, url: pinterestVid });

        candidates.push({
          element: pinImg || document.body,
          url: pinterestVid,
          width: 1280,
          height: 720,
          area: 1280 * 720,
          isVisibleInDOM: true,
          visibilityScore: 1,
          isInViewport: true,
          format: "MP4",
          mediaType: "video",
          isBlobStream: false,
          isWebp: false,
          isGif: false,
          slug: slug,
          type: "video"
        });
        if (pinImg) {
          const p = pinImg.closest('[data-test-id="pin"], [role="listitem"], .pinWrapper, figure, article');
          if (p) activeVideoContainers.add(p);
        }
      }
    }

    // 3. Resimler (Video kapak / thumbnail görselleri elenir, videonun JPEG olarak görünmesi engellenir)
    const imgEls = document.querySelectorAll("img");
    imgEls.forEach((img) => {
      if (img.classList.contains("__lrg_preview_img")) return;

      // Video kapsayıcısının içindeki poster veya kapak görselini yoksay (Asıl video zaten algılandı)
      const parentPin = img.closest('[data-test-id="pin"], [role="listitem"], .pinWrapper, figure, article, [data-grid-item]');
      if (parentPin && activeVideoContainers.has(parentPin)) {
        return;
      }
      if ((img.src && img.src.includes("videos_thumbnails")) || (img.currentSrc && img.currentSrc.includes("videos_thumbnails"))) {
        return;
      }

      const item = analyzeImgElement(img);
      if (item && item.url) {
        candidates.push(item);
      }
    });

    // 4. Arka Plan Görselleri
    const bgItems = analyzeBackgroundImages();
    candidates.push(...bgItems);

    if (candidates.length === 0) {
      allScannedMedia = [];
      activeMediaInView = null;
      removeEl(BADGE_ID);
      return [];
    }

    const seen = new Set();
    const unique = [];
    for (const c of candidates) {
      if (!seen.has(c.url)) {
        seen.add(c.url);
        unique.push(c);
      }
    }

    unique.sort((a, b) => {
      // 1. Ekranda olanlar önce
      if (a.isInViewport && !b.isInViewport) return -1;
      if (!a.isInViewport && b.isInViewport) return 1;

      // 2. VİDEO ÖNCELİĞİ: Ekranda video varsa, video her zaman resimlerden önceliklidir (JPEG karışıklığını önler)
      const aIsVideo = a.mediaType === "video";
      const bIsVideo = b.mediaType === "video";
      if (aIsVideo && !bIsVideo) return -1;
      if (!aIsVideo && bIsVideo) return 1;

      // 3. İkisi de aynı türdeyse alana ve görünürlüğe göre sırala
      if (a.isInViewport && b.isInViewport) {
        return b.area * b.visibilityScore - a.area * a.visibilityScore;
      }
      return b.area - a.area;
    });

    allScannedMedia = unique;
    activeMediaInView = allScannedMedia[0];

    if (activeMediaInView && activeMediaInView.isInViewport && activeMediaInView.element) {
      renderCornerBadge(activeMediaInView);
    } else {
      removeEl(BADGE_ID);
    }

    return allScannedMedia;
  }

  // Ekran Kenarında Sabit Yüzen İndirme Çubuğunu Oluşturma (Sayfadaki öğeleri asla kapatmaz)
  function renderCornerBadge(item) {
    if (!item || !item.element || !item.element.isConnected) return;

    if (isDismissedOnThisTab || (!isActivatedOnThisTab && !autoShowEverywhere)) {
      removeEl(BADGE_ID);
      return;
    }

    let badge = document.getElementById(BADGE_ID);

    if (badge && currentBadgeItem && currentBadgeItem.url === item.url) {
      return;
    }

    if (badge && badge.classList.contains("__lrg_menu_open")) {
      return;
    }

    currentBadgeItem = item;

    if (!badge) {
      badge = document.createElement("div");
      badge.id = BADGE_ID;
      badge.className = "__lrg_badge_container";
      document.body.appendChild(badge);
    }

    // Video ise ve blob görünüyorsa, gerçek HD video bağlantısını bir kez daha sorgula
    if (item.mediaType === "video" && (item.isBlobStream || item.url.startsWith("blob:"))) {
      const realUrl = findMetadataVideoUrl(item.element);
      if (realUrl) {
        item.url = realUrl;
        item.isBlobStream = false;
        item.format = "MP4";
      }
    }

    const isVideo = item.mediaType === "video";
    const isGif = item.format === "GIF" || item.isGif;
    let fmt = item.format || (isVideo ? "MP4" : (isGif ? "GIF" : (item.isWebp ? "WEBP" : "GÖRSEL")));
    if (isVideo && fmt !== "WEBM" && fmt !== "MOV") {
      fmt = "MP4";
    }
    const size = `${item.width}×${item.height} px`;

    let icon = "📥";
    let title = "İndir";
    let fmtClass = "";

    if (isVideo) {
      icon = "🎬";
      title = "Video";
      fmtClass = "__lrg_fmt_video";
    } else if (isGif) {
      icon = "🎞️";
      title = "GIF";
      fmtClass = "__lrg_fmt_gif";
    }

    let menuContent = "";

    if (isVideo) {
      if (item.isBlobStream) {
        menuContent = `
          <div class="__lrg_menu_header">
            <span class="__lrg_fmt_header">🎬 VİDEO AKIŞI: MP4 DÖNÜŞTÜRÜCÜ</span>
            <span>${size}</span>
          </div>
          <button class="__lrg_btn __lrg_btn_video __lrg_btn_record" data-act="convert-mp4">
            🎬 Akışı MP4 Olarak İndir (%100 Çevir)
          </button>
          <button class="__lrg_btn __lrg_btn_snapshot" data-act="snapshot">
            📸 Video Karesi Yakala (PNG Snapshot)
          </button>
          <button class="__lrg_btn" data-act="copy">🔗 Akış Linkini Kopyala</button>
        `;
      } else {
        menuContent = `
          <div class="__lrg_menu_header">
            <span class="__lrg_fmt_header">🎬 ORİJİNAL VİDEO (${fmt})</span>
            <span>${size}</span>
          </div>
          <button class="__lrg_btn __lrg_btn_video __lrg_btn_orig_text" data-act="download" data-fmt="mp4">
            🎬 Orijinal Video İndir (.mp4)
          </button>
          <button class="__lrg_btn __lrg_btn_video __lrg_btn_record" data-act="convert-mp4">
            🔴 Akışı MP4 Olarak Canlı Kaydet
          </button>
          <button class="__lrg_btn __lrg_btn_snapshot" data-act="snapshot">
            📸 Video Karesi Yakala (PNG Snapshot)
          </button>
          <button class="__lrg_btn" data-act="copy">🔗 Video Linkini Kopyala</button>
        `;
      }
    } else if (isGif) {
      menuContent = `
        <div class="__lrg_menu_header">
          <span class="__lrg_fmt_header">🎞️ HAREKETLİ GIF (${fmt})</span>
          <span>${size}</span>
        </div>
        <button class="__lrg_btn __lrg_btn_gif __lrg_btn_orig_text" data-act="download" data-fmt="original">
          🎞️ Orijinal GIF İndir (.gif)
        </button>
        <button class="__lrg_btn __lrg_btn_webp" data-act="download" data-fmt="png">
          🖼️ PNG İndir (İlk Kare / Kayıpsız)
        </button>
        <button class="__lrg_btn __lrg_btn_webp" data-act="download" data-fmt="jpeg">
          🖼️ JPG İndir (İlk Kare %100)
        </button>
        <button class="__lrg_btn" data-act="copy">🔗 GIF Linkini Kopyala</button>
      `;
    } else {
      menuContent = `
        <div class="__lrg_menu_header">
          <span class="__lrg_fmt_header">ORİJİNAL FORMAT: ${fmt}</span>
          <span>${size}</span>
        </div>
        <button class="__lrg_btn __lrg_btn_primary __lrg_btn_orig_text" data-act="download" data-fmt="original">
          💾 Orijinal İndir (.${fmt.toLowerCase()})
        </button>
        <button class="__lrg_btn __lrg_btn_webp" data-act="download" data-fmt="png">
          🖼️ PNG İndir (%100 Kayıpsız)
        </button>
        <button class="__lrg_btn __lrg_btn_webp" data-act="download" data-fmt="jpeg">
          🖼️ JPG İndir (Maksimum Kalite %100)
        </button>
        <button class="__lrg_btn" data-act="copy">🔗 Linki Kopyala</button>
      `;
    }

    badge.innerHTML = `
      <div class="__lrg_badge_pill" title="Tıklayın: Menüyü Sabitle">
        <span class="__lrg_icon">${icon}</span>
        <span class="__lrg_title">${title}</span>
        <span class="__lrg_size_tag">${size}</span>
        <span class="__lrg_format_tag ${fmtClass}">${fmt}</span>
        <button class="__lrg_close_btn" title="Kapat">✕</button>
      </div>
      <div class="__lrg_menu">
        ${menuContent}
      </div>
    `;

    const pill = badge.querySelector(".__lrg_badge_pill");
    if (pill) {
      pill.onclick = (e) => {
        e.stopPropagation();
        badge.classList.toggle("__lrg_menu_open");
      };
    }

    const closeBtn = badge.querySelector(".__lrg_close_btn");
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        isDismissedOnThisTab = true;
        try {
          sessionStorage.setItem("__LRG_DISMISSED__", "true");
        } catch (err) {}
        removeEl(BADGE_ID);
        showToast("📌 Kenar çubuğu bu sekme için gizlendi.");
      };
    }

    bindActions(badge, item);

    // Magic Bytes ile arka planda kesin format doğrulaması (Videolar hariç, videonun JPEG'e dönüşmesini engeller)
    if (!item.url.startsWith("blob:") && item.mediaType !== "video") {
      detectRealMagicFormat(item.url).then((realF) => {
        if (realF) {
          item.format = realF;
          item.isWebp = realF === "WEBP";
          item.isGif = realF === "GIF";
          updateBadgeUI(badge, realF, item.mediaType);
        }
      });
    }

    badge.onmouseenter = () => item.element?.classList.add("__lrg_highlight_active");
    badge.onmouseleave = () => item.element?.classList.remove("__lrg_highlight_active");
  }

  function updateBadgeUI(badge, fmt, mediaType) {
    if (!badge) return;
    const isVid = mediaType === "video" || fmt === "MP4" || fmt === "WEBM" || fmt === "MOV";
    const isGif = fmt === "GIF";
    let safeFmt = fmt;
    if (isVid && safeFmt !== "WEBM" && safeFmt !== "MOV") {
      safeFmt = "MP4";
    }
    const ext = (isVid && safeFmt !== "WEBM" && safeFmt !== "MOV") ? "mp4" : (safeFmt.toLowerCase() === "jpeg" ? "jpg" : safeFmt.toLowerCase());

    const formatTag = badge.querySelector(".__lrg_format_tag");
    if (formatTag) {
      formatTag.textContent = safeFmt;
      if (isVid) {
        formatTag.style.background = "rgba(124, 58, 237, 0.4)";
        formatTag.style.color = "#c4b5fd";
        formatTag.style.border = "1px solid rgba(139, 92, 246, 0.5)";
      } else if (isGif) {
        formatTag.style.background = "rgba(217, 119, 6, 0.4)";
        formatTag.style.color = "#fde68a";
        formatTag.style.border = "1px solid rgba(245, 158, 11, 0.5)";
      } else if (fmt === "WEBP") {
        formatTag.style.background = "#059669";
        formatTag.style.color = "#ffffff";
      } else {
        formatTag.style.background = "#0284c7";
        formatTag.style.color = "#ffffff";
      }
    }

    const headerFmt = badge.querySelector(".__lrg_fmt_header");
    if (headerFmt) {
      if (isVid) headerFmt.textContent = `🎬 ORİJİNAL VİDEO: ${safeFmt}`;
      else if (isGif) headerFmt.textContent = `🎞️ HAREKETLİ GIF: GIF`;
      else headerFmt.textContent = `ORİJİNAL FORMAT: ${safeFmt}`;
    }

    const origBtn = badge.querySelector(".__lrg_btn_orig_text");
    if (origBtn) {
      if (isVid) origBtn.textContent = `🎬 Orijinal Video İndir (.${ext})`;
      else if (isGif) origBtn.textContent = `🎞️ Orijinal GIF İndir (.gif)`;
      else origBtn.textContent = `💾 Orijinal İndir (.${ext})`;
    }
  }

  function alignBadge(targetEl, badgeEl) {
    // Sabit kenar çubuğu tarayıcının sağ kenarına kenetlenir;
    // Sayfadaki öğelerin üzerini asla kapatmaz.
  }

  // 4. Doğrudan Bellekteki Blob'u MP4 Olarak İndirmeyi Dene
  async function tryDownloadDirectBlob(url, slug) {
    try {
      const res = await fetch(url);
      if (!res.ok) return false;
      const blob = await res.blob();
      if (blob && blob.size > 1000) {
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objUrl;
        a.download = `${slug}.mp4`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          a.remove();
          URL.revokeObjectURL(objUrl);
        }, 1500);
        showToast("🎬 Video MP4 olarak başarıyla indirildi!");
        return true;
      }
    } catch (e) {}
    return false;
  }

  // 5. Video Akışını MP4 veya WebM Olarak Kaydedip İndirme Motoru
  let streamRecorder = null;
  let streamChunks = [];
  let streamInterval = null;
  let recordSeconds = 0;
  let activeRecordingBtn = null;
  let activeRecordingCanvas = null;
  let activeRecordingAnimId = null;

  function convertStreamToMp4AndDownload(videoEl, item, btnEl) {
    // 1. Önce doğrudan HD video URL'si var mı kontrol et (SADECE doğrulanmış gerçek video dosyaları!)
    const directUrl = findMetadataVideoUrl(videoEl) || (item && isGenuineDirectVideoUrl(item.url) ? item.url : null);

    if (directUrl && isGenuineDirectVideoUrl(directUrl)) {
      showToast("🎬 Orijinal HD video doğrudan indiriliyor...");
      chrome.runtime.sendMessage(
        {
          action: "DOWNLOAD_IMAGE",
          url: directUrl,
          format: "mp4",
          filename: item.slug
        },
        (response) => {
          const lastErr = chrome.runtime.lastError;
          if (!lastErr && response && response.success) {
            showToast("🎬 Video MP4 olarak başarıyla indirildi!");
          } else {
            showToast("⚠️ Doğrudan dosya bağlantısı yok, video akışı yakalanıyor...");
            startLiveMediaRecorder(videoEl, item, btnEl);
          }
        }
      );
      return;
    }

    startLiveMediaRecorder(videoEl, item, btnEl);
  }

  function startLiveMediaRecorder(videoEl, item, btnEl) {
    // Eğer zaten kayıt yapılıyorsa durdurup indir
    if (streamRecorder && streamRecorder.state === "recording") {
      streamRecorder.stop();
      return;
    }

    // Aktif oynatılan veya ekranda görünen doğru video elemanını seç (YouTube Shorts vb. için)
    let actualVideo = videoEl;
    if (!actualVideo || actualVideo.tagName?.toLowerCase() !== "video" || actualVideo.paused) {
      const playingVid = Array.from(document.querySelectorAll("video")).find((v) => !v.paused && !v.ended && v.readyState > 1);
      if (playingVid) actualVideo = playingVid;
    }
    if (!actualVideo && videoEl) actualVideo = videoEl;
    if (!actualVideo) {
      showToast("⚠️ Oynatılan video bulunamadı.");
      return;
    }

    try {
      // 1. Video çözünürlüğünü 16'nın tam katlarına hizala (Windows donanım kodlayıcısındaki dikey çizgi / stride bozulmasını önler)
      const rawW = actualVideo.videoWidth || actualVideo.clientWidth || 720;
      const rawH = actualVideo.videoHeight || actualVideo.clientHeight || 1280;
      const cleanW = Math.max(32, Math.floor(rawW / 16) * 16);
      const cleanH = Math.max(32, Math.floor(rawH / 16) * 16);

      const canvas = document.createElement("canvas");
      canvas.width = cleanW;
      canvas.height = cleanH;
      const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
      activeRecordingCanvas = canvas;

      let isDrawing = true;
      function renderLoop() {
        if (!isDrawing) return;
        try {
          ctx.drawImage(actualVideo, 0, 0, cleanW, cleanH);
        } catch (e) {}
        if ("requestVideoFrameCallback" in actualVideo) {
          actualVideo.requestVideoFrameCallback(renderLoop);
        } else {
          activeRecordingAnimId = requestAnimationFrame(renderLoop);
        }
      }
      renderLoop();

      // Tuval üzerinden tam hizalı ve temiz kare akışı al
      const stream = canvas.captureStream(30);

      // Orijinal video ses parçasını dahil et
      try {
        const origStream = actualVideo.captureStream
          ? actualVideo.captureStream()
          : (actualVideo.mozCaptureStream ? actualVideo.mozCaptureStream() : null);
        if (origStream) {
          const aTracks = origStream.getAudioTracks();
          if (aTracks && aTracks.length > 0) {
            stream.addTrack(aTracks[0]);
          }
        }
      } catch (e) {}

      // Kodek seçimi (H.264 MP4 destekleniyorsa 16-stride hizalı güvenle kullan, yoksa VP9 WebM)
      let mimeType = "";
      let extension = "mp4";

      if (MediaRecorder.isTypeSupported("video/mp4;codecs=avc1,mp4a.40.2")) {
        mimeType = "video/mp4;codecs=avc1,mp4a.40.2";
        extension = "mp4";
      } else if (MediaRecorder.isTypeSupported("video/mp4;codecs=avc1")) {
        mimeType = "video/mp4;codecs=avc1";
        extension = "mp4";
      } else if (MediaRecorder.isTypeSupported("video/mp4")) {
        mimeType = "video/mp4";
        extension = "mp4";
      } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")) {
        mimeType = "video/webm;codecs=vp9,opus";
        extension = "webm";
      } else if (MediaRecorder.isTypeSupported("video/webm")) {
        mimeType = "video/webm";
        extension = "webm";
      }

      const options = mimeType ? { mimeType } : {};
      streamRecorder = new MediaRecorder(stream, options);
      streamChunks = [];
      recordSeconds = 0;
      activeRecordingBtn = btnEl;

      streamRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          streamChunks.push(e.data);
        }
      };

      const cleanupRecorder = () => {
        isDrawing = false;
        if (activeRecordingAnimId) {
          cancelAnimationFrame(activeRecordingAnimId);
          activeRecordingAnimId = null;
        }
        if (activeRecordingCanvas) {
          activeRecordingCanvas.remove();
          activeRecordingCanvas = null;
        }
        clearInterval(streamInterval);
        actualVideo.removeEventListener("ended", onEnded);
        actualVideo.removeEventListener("timeupdate", onTimeUpdate);
      };

      let maxTimeSeen = 0;
      const onTimeUpdate = () => {
        if (actualVideo.currentTime > maxTimeSeen) {
          maxTimeSeen = actualVideo.currentTime;
        }
        // YouTube Shorts / Reels döngü tamamlandığında otomatik durdur
        if (recordSeconds >= 3 && actualVideo.currentTime < maxTimeSeen - 1.5) {
          if (streamRecorder && streamRecorder.state === "recording") {
            streamRecorder.stop();
          }
        }
      };
      actualVideo.addEventListener("timeupdate", onTimeUpdate);

      const onEnded = () => {
        if (streamRecorder && streamRecorder.state === "recording") {
          streamRecorder.stop();
        }
      };
      actualVideo.addEventListener("ended", onEnded, { once: true });

      streamRecorder.onstop = () => {
        cleanupRecorder();
        if (streamChunks.length > 0) {
          const finalBlob = new Blob(streamChunks, { type: mimeType || "video/mp4" });
          const blobUrl = URL.createObjectURL(finalBlob);
          const a = document.createElement("a");
          a.href = blobUrl;
          const slug = item?.slug || extractMeaningfulSlug({ pageTitle: document.title, url: window.location.href });
          a.download = `${slug}.${extension}`;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            a.remove();
            URL.revokeObjectURL(blobUrl);
          }, 1500);
          showToast(`🎬 Video (.${extension}) olarak başarıyla indirildi!`);
        } else {
          showToast("⚠️ Video verisi kaydedilemedi.");
        }
        streamRecorder = null;
        if (activeRecordingBtn) {
          activeRecordingBtn.innerHTML = "🎬 Akışı İndir";
          activeRecordingBtn.classList.remove("__lrg_btn_recording");
          activeRecordingBtn = null;
        }
      };

      streamRecorder.start(500);

      // Video başa sarılıp oynatılıyor (videonun başından itibaren yakalanmasını sağlar)
      if (actualVideo.ended || actualVideo.currentTime > 0.5) {
        try {
          actualVideo.currentTime = 0;
        } catch (e) {}
      }
      if (actualVideo.paused) {
        actualVideo.play().catch(() => {});
      }

      if (btnEl) {
        btnEl.classList.add("__lrg_btn_recording");
        btnEl.innerHTML = "⏹️ Durdur ve İndir (00:00)";
      }

      streamInterval = setInterval(() => {
        recordSeconds++;
        const mins = String(Math.floor(recordSeconds / 60)).padStart(2, "0");
        const secs = String(recordSeconds % 60).padStart(2, "0");
        if (btnEl) {
          btnEl.innerHTML = `⏹️ Durdur ve İndir (${mins}:${secs})`;
        }
      }, 1000);

      showToast("🔴 Video akışı kaydediliyor... Video bitince veya butona bastığınızda indirilecek!");
    } catch (err) {
      console.error("Video akış kaydı hatası:", err);
      showToast("⚠️ Video yakalama başlatılamadı: " + err.message);
    }
  }

  function bindActions(container, item) {
    container.querySelectorAll("[data-act]").forEach((btn) => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const act = btn.getAttribute("data-act");
        const fmt = btn.getAttribute("data-fmt");

        if (act !== "convert-mp4" && act !== "record") {
          container.classList.remove("__lrg_menu_open");
        }

        // 1. Orijinal Video / MP4 İndirme
        if (act === "download") {
          // Yalnızca DOĞRULANMIŞ doğrudan video dosyası varsa arka plan motoruyla indir
          if (item.url && isGenuineDirectVideoUrl(item.url)) {
            chrome.runtime.sendMessage(
              {
                action: "DOWNLOAD_IMAGE",
                url: item.url,
                format: "mp4",
                filename: item.slug
              },
              (response) => {
                const lastErr = chrome.runtime.lastError;
                if (lastErr || !response || !response.success) {
                  showToast("⏳ Sunucu engeli, akış MP4'e çevrilerek indiriliyor...");
                  convertStreamToMp4AndDownload(item.element, item, btn);
                } else {
                  showToast("🎬 Video MP4 olarak indiriliyor!");
                }
              }
            );
            return;
          }

          // Eğer doğrudan video dosyası yoksa (YouTube, Shorts, blob, akış): Canlı MP4 yakalama motorunu başlat!
          convertStreamToMp4AndDownload(item.element, item, btn);
        }

        // 2. Akışı MP4'e Çevirip İndirme
        else if (act === "convert-mp4" || act === "record") {
          if (item.element && item.element.tagName && item.element.tagName.toLowerCase() === "video") {
            convertStreamToMp4AndDownload(item.element, item, btn);
          } else {
            showToast("⚠️ Video oynatıcı bulunamadı.");
          }
        }

        // 3. Video Karesi Yakalama (Snapshot)
        else if (act === "snapshot") {
          if (item.element && item.element.tagName && item.element.tagName.toLowerCase() === "video") {
            try {
              const video = item.element;
              const w = video.videoWidth || video.clientWidth || 1280;
              const h = video.videoHeight || video.clientHeight || 720;
              const canvas = document.createElement("canvas");
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext("2d");
              ctx.drawImage(video, 0, 0, w, h);
              const dataUrl = canvas.toDataURL("image/png");

              chrome.runtime.sendMessage(
                {
                  action: "DOWNLOAD_IMAGE",
                  url: dataUrl,
                  format: "png",
                  filename: `${item.slug}-kare`
                },
                () => {
                  const _ = chrome.runtime.lastError;
                  showToast("📸 Video karesi PNG olarak indirildi!");
                }
              );
            } catch (err) {
              showToast("⚠️ Video karesi yakalanamadı: " + err.message);
            }
          }
        }

        // 4. Link Kopyalama
        else if (act === "copy") {
          navigator.clipboard.writeText(item.url).then(() => {
            const old = btn.innerHTML;
            btn.innerHTML = "✓ Kopyalandı!";
            setTimeout(() => (btn.innerHTML = old), 1500);
          });
        }
      };
    });
  }

  // Sayfada başka bir yere tıklandığında menüyü kapat
  document.addEventListener("click", (e) => {
    const badge = document.getElementById(BADGE_ID);
    if (badge && !badge.contains(e.target)) {
      badge.classList.remove("__lrg_menu_open");
    }
  });

  function showToast(msg) {
    const t = document.createElement("div");
    t.style.cssText =
      "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0284c7;color:#fff;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;z-index:2147483647;box-shadow:0 4px 15px rgba(0,0,0,0.3);font-family:sans-serif;";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  function removeEl(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  let scrollThrottle = null;
  function handleScroll() {
    if (!scrollThrottle) {
      scrollThrottle = setTimeout(() => {
        if (isActivatedOnThisTab || autoShowEverywhere) {
          performScan();
        }
        scrollThrottle = null;
      }, 150);
    }
  }
  window.addEventListener("scroll", handleScroll, { passive: true });
  window.addEventListener("resize", handleScroll, { passive: true });

  // Fareyle fotoğraf veya videonun üzerine gelindiğinde kenar çubuğunu ilgili medyaya güncelle
  document.addEventListener("mouseover", (e) => {
    if (!isActivatedOnThisTab && !autoShowEverywhere) return;
    if (isDismissedOnThisTab) return;

    const badge = document.getElementById(BADGE_ID);
    if (badge && badge.classList.contains("__lrg_menu_open")) {
      return;
    }

    const target = e.target;
    if (!target || !target.tagName) return;
    const tag = target.tagName.toLowerCase();

    if (tag === "img") {
      if (target.offsetWidth >= 200 && target.offsetHeight >= 180) {
        const item = analyzeImgElement(target);
        if (item && item.url) {
          renderCornerBadge(item);
        }
      }
    } else if (tag === "video") {
      if (target.offsetWidth >= 200 && target.offsetHeight >= 150) {
        const item = analyzeVideoElement(target);
        if (item && item.url) {
          renderCornerBadge(item);
        }
      }
    }
  }, { passive: true });

  window.__LARGEST_IMG_SCAN_FUNC__ = performScan;

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "ACTIVATE_ON_TAB" || request.action === "TOGGLE_SIDE_DOCK") {
      isDismissedOnThisTab = false;
      try {
        sessionStorage.removeItem("__LRG_DISMISSED__");
        sessionStorage.setItem("__LRG_ACTIVE_TAB__", "true");
      } catch (e) {}
      isActivatedOnThisTab = true;

      if (request.action === "TOGGLE_SIDE_DOCK" && request.enabled === false) {
        isDismissedOnThisTab = true;
        try {
          sessionStorage.setItem("__LRG_DISMISSED__", "true");
        } catch (e) {}
        removeEl(BADGE_ID);
        sendResponse({ success: true, active: false });
        return false;
      }

      const res = performScan();
      sendResponse({ success: true, active: true, mediaCount: res?.length || 0 });
      return false;
    }

    if (request.action === "GET_DOCK_STATE") {
      sendResponse({ success: true, active: isActivatedOnThisTab && !isDismissedOnThisTab });
      return false;
    }

    if (request.action === "GET_PAGE_IMAGES" || request.action === "GET_PAGE_MEDIA") {
      const results = performScan();
      sendResponse({
        success: true,
        currentLargest: activeMediaInView || (results && results[0]),
        images: (results || []).slice(0, 10)
      });
      return false;
    }

    if (request.action === "START_STREAM_DOWNLOAD") {
      let targetEl = activeMediaInView?.element;
      if (!targetEl || targetEl.tagName?.toLowerCase() !== "video") {
        targetEl = Array.from(document.querySelectorAll("video")).find((v) => !v.paused) || document.querySelector("video");
      }
      if (targetEl) {
        const badge = document.getElementById(BADGE_ID);
        const btn = badge?.querySelector(".__lrg_btn_record");
        const slug = activeMediaInView?.slug || extractMeaningfulSlug({ pageTitle: document.title, url: window.location.href });
        convertStreamToMp4AndDownload(targetEl, activeMediaInView || { slug: slug }, btn);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: "Aktif video bulunamadı." });
      }
      return true;
    }
  });

  // Yalnızca kullanıcı eklentiyi bu sekmede açtıysa veya otomatik mod açıksa tarama yap
  if (isActivatedOnThisTab || autoShowEverywhere) {
    if (!isDismissedOnThisTab && !document.hidden) {
      performScan();
      setTimeout(performScan, 800);
    }
  }
})();
