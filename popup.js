// popup.js - Medya İndirici (Fotoğraf, Video & GIF)

document.addEventListener("DOMContentLoaded", () => {
  const loadingState = document.getElementById("loadingState");
  const emptyState = document.getElementById("emptyState");
  const mainContent = document.getElementById("mainContent");
  const warningNotice = document.getElementById("warningNotice");
  const rescanBtn = document.getElementById("rescanBtn");
  const emptyRetryBtn = document.getElementById("emptyRetryBtn");

  const screenBadge = document.getElementById("screenBadge");
  const mainImgPreview = document.getElementById("mainImgPreview");
  const mainVideoPreview = document.getElementById("mainVideoPreview");
  const mainImgFormat = document.getElementById("mainImgFormat");
  const mainImgDims = document.getElementById("mainImgDims");
  const mainImgStatus = document.getElementById("mainImgStatus");

  const mainDownloadOrig = document.getElementById("mainDownloadOrig");
  const mainDownloadPng = document.getElementById("mainDownloadPng");
  const mainDownloadJpg = document.getElementById("mainDownloadJpg");
  const copyUrlBtn = document.getElementById("copyUrlBtn");

  const otherImagesSection = document.getElementById("otherImagesSection");
  const otherImagesList = document.getElementById("otherImagesList");
  const sideDockToggle = document.getElementById("sideDockToggle");

  let currentMainMedia = null;

  if (sideDockToggle) {
    chrome.storage.local.get({ sideDockEnabled: true }, (data) => {
      sideDockToggle.checked = data.sideDockEnabled;
    });

    sideDockToggle.addEventListener("change", () => {
      const isEnabled = sideDockToggle.checked;
      chrome.storage.local.set({ sideDockEnabled: isEnabled });
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: "TOGGLE_SIDE_DOCK",
            enabled: isEnabled
          });
        }
      });
    });
  }

  function showLoading() {
    loadingState.classList.remove("hidden");
    emptyState.classList.add("hidden");
    mainContent.classList.add("hidden");
    warningNotice.classList.add("hidden");
  }

  function showEmpty(msg) {
    loadingState.classList.add("hidden");
    emptyState.classList.remove("hidden");
    mainContent.classList.add("hidden");
    if (msg) {
      const textEl = emptyState.querySelector(".empty-text");
      if (textEl) textEl.textContent = msg;
    }
  }

  function showWarning(html) {
    loadingState.classList.add("hidden");
    warningNotice.innerHTML = html;
    warningNotice.classList.remove("hidden");
  }

  // Bir bağlantının gerçekten indirilebilir ikili bir video dosyası olup olmadığını denetleme (HTML / embed sayfalarını engeller)
  function isGenuineDirectVideoUrl(url) {
    if (!url || typeof url !== "string") return false;
    const u = url.toLowerCase().trim();
    if (u.startsWith("blob:") || u.startsWith("data:")) return false;

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

  // Magic Bytes tespiti
  async function detectRealMagicFormat(url) {
    try {
      const res = await fetch(url, {
        cache: "force-cache",
        headers: { Accept: "image/avif,image/webp,image/apng,image/gif,video/webm,video/mp4,image/*,*/*;q=0.8" }
      });
      const blob = await res.blob();
      const buf = await blob.slice(0, 32).arrayBuffer();
      const bytes = new Uint8Array(buf);

      // WebP
      if (
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
      ) {
        return "WEBP";
      }

      // GIF
      if (
        bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 &&
        (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61
      ) {
        return "GIF";
      }

      // MP4
      if (bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
        return "MP4";
      }

      // WebM
      if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) {
        return "WEBM";
      }

      if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return "PNG";
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

  function fetchPageImages() {
    showLoading();

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const _ = chrome.runtime.lastError;
      if (!tabs || !tabs[0] || !tabs[0].id) {
        showEmpty("Aktif sekme bulunamadı.");
        return;
      }

      const activeTab = tabs[0];
      const url = activeTab.url || "";

      if (
        url.startsWith("chrome://") ||
        url.startsWith("chrome-extension://") ||
        url.startsWith("edge://") ||
        url.startsWith("about:") ||
        url.startsWith("view-source:")
      ) {
        showWarning(
          "⚠️ <strong>Chrome Sistem Sayfası:</strong><br>Tarayıcı güvenlik kuralları gereği bu sistem sayfasında eklentiler çalışamaz. Lütfen normal bir web sitesinde test edin."
        );
        return;
      }

      // Eklenti çalıştırıldığında bu sekmede kenar çubuğunu yetkilendir
      chrome.tabs.sendMessage(activeTab.id, { action: "ACTIVATE_ON_TAB" }, (res) => {
        const _ = chrome.runtime.lastError;
        if (res && typeof res.active === "boolean" && sideDockToggle) {
          sideDockToggle.checked = res.active;
        }
      });

      runDirectScan(activeTab.id);
    });
  }

  function standaloneDOMScanner() {
    function toAbs(u) {
      if (!u) return "";
      try {
        return new URL(u, document.baseURI).href;
      } catch (e) {
        return u;
      }
    }

    function extractSlug({ alt, title, pageTitle, url }) {
      const genericWords = [
        "image", "photo", "resim", "fotograf", "screenshot", "untitled", "ads", "banner",
        "logo", "indir", "download", "video", "clip", "mp4", "webm"
      ];
      function isMeaningful(str) {
        if (!str || typeof str !== "string") return false;
        const clean = str.trim().toLowerCase();
        if (clean.length < 3) return false;
        if (genericWords.includes(clean)) return false;
        return true;
      }

      let chosen = "";
      if (isMeaningful(alt)) chosen = alt;
      else if (isMeaningful(title)) chosen = title;
      else if (isMeaningful(pageTitle)) chosen = pageTitle.split(/[-|_|•]/)[0].trim();
      else if (url) {
        try {
          const p = new URL(url).pathname;
          const base = p.split("/").pop() || "";
          const noExt = base.replace(/\.[^/.]+$/, "");
          if (isMeaningful(noExt) && !noExt.startsWith("photo-") && !noExt.match(/^[0-9a-f]{16,}$/i)) {
            chosen = noExt;
          }
        } catch (e) {}
      }

      if (!chosen) chosen = `media-${Date.now().toString().slice(-6)}`;

      const charMap = {
        'ç': 'c', 'Ç': 'c', 'ğ': 'g', 'Ğ': 'g', 'ı': 'i', 'I': 'i', 'İ': 'i',
        'ö': 'o', 'Ö': 'o', 'ş': 's', 'Ş': 's', 'ü': 'u', 'Ü': 'u', 'â': 'a'
      };
      let ascii = chosen.replace(/[çÇğĞıIİöÖşŞüÜâ]/g, (m) => charMap[m] || m).toLowerCase();
      ascii = ascii.replace(/[^a-z0-9\s]/g, " ");
      const words = ascii.split(/\s+/).filter((w) => w.length > 1 && !genericWords.includes(w));
      return words.length > 0 ? words.slice(0, 5).join("-") : `media-${Date.now().toString().slice(-6)}`;
    }

    function detectFmt(s) {
      if (!s) return "IMG";
      s = s.toLowerCase();

      // Video
      if (s.includes(".mp4") || s.includes("video/mp4")) return "MP4";
      if (s.includes(".webm") || s.includes("video/webm")) return "WEBM";
      if (s.includes(".mov")) return "MOV";
      if (s.includes(".mkv")) return "MKV";

      // GIF
      if (s.includes(".gif") || s.includes("format=gif") || s.includes("fm=gif")) return "GIF";

      // Görsel
      if (
        s.includes(".webp") ||
        s.includes("auto=webp") ||
        s.includes("fm=webp") ||
        s.includes("format=webp") ||
        s.includes("f=webp") ||
        s.includes("ext=webp") ||
        s.includes("output=webp") ||
        s.includes("image/webp")
      ) {
        return "WEBP";
      }
      if (s.includes("fm=png") || s.includes("format=png") || s.includes(".png")) return "PNG";
      if (s.includes("fm=jpg") || s.includes("format=jpg") || s.includes(".jpg") || s.includes(".jpeg")) return "JPEG";
      if (s.includes("fm=avif") || s.includes("format=avif") || s.includes(".avif")) return "AVIF";

      return "WEBP";
    }

    const vh = window.innerHeight || document.documentElement.clientHeight;
    const vw = window.innerWidth || document.documentElement.clientWidth;

    const list = [];

    // 1. Videolar
    const videos = document.querySelectorAll("video");
    videos.forEach((video) => {
      let src = "";

      // Pinterest / JSON-LD / __PWS_DATA__ video_list derinlemesine arama
      const candidates = [];
      const seen = new Set();
      const addCand = (quality, rawUrl) => {
        if (!rawUrl || typeof rawUrl !== "string") return;
        let c = rawUrl.split("\\/").join("/").trim();
        if (c.includes("/hls/") || c.includes(".m3u8")) {
          c = c.replace("/videos/mc/hls/", "/videos/mc/720p/").replace("/hls/", "/720p/").replace(/\.m3u8.*$/i, ".mp4");
        }
        if (seen.has(c)) return;
        seen.add(c);
        candidates.push({ quality, url: c });
      };

      function scanObj(obj) {
        if (!obj || typeof obj !== "object") return;
        if (Array.isArray(obj)) {
          for (const item of obj) scanObj(item);
          return;
        }
        const vl = obj.video_list || (obj.V_720P || obj.V_1080P || obj.V_HLSV4 ? obj : null);
        if (vl && typeof vl === "object") {
          if (vl.V_1080P && vl.V_1080P.url) addCand(1080, vl.V_1080P.url);
          if (vl.V_720P && vl.V_720P.url) addCand(720, vl.V_720P.url);
          if (vl.V_EXP7 && vl.V_EXP7.url) addCand(700, vl.V_EXP7.url);
          if (vl.V_480P && vl.V_480P.url) addCand(480, vl.V_480P.url);
          for (const k of Object.keys(vl)) {
            if (vl[k]?.url) addCand(500, vl[k].url);
          }
        }
        for (const k of Object.keys(obj)) {
          if (typeof obj[k] === "object") scanObj(obj[k]);
        }
      }

      const pws = document.getElementById("__PWS_DATA__");
      if (pws && pws.textContent) {
        try { scanObj(JSON.parse(pws.textContent)); } catch (e) {}
      }

      if (candidates.length === 0) {
        document.querySelectorAll('script[type*="json"]').forEach((s) => {
          try { scanObj(JSON.parse(s.textContent)); } catch (e) {}
        });
      }

      if (candidates.length > 0) {
        candidates.sort((a, b) => b.quality - a.quality);
        src = candidates[0].url;
      }

      // Sayfa içi regex araması
      if (!src && document.body) {
        const bodyText = (document.body.innerHTML || "").split("\\/").join("/");
        const pMatches = bodyText.match(/https?:\/\/v1\.pinimg\.com\/videos\/mc\/[^\s"'<>]+\.mp4/g);
        if (pMatches && pMatches.length > 0) {
          const sorted = pMatches.sort((a, b) => {
            const score = (u) => (u.includes("1080p") ? 4 : (u.includes("720p") ? 3 : (u.includes("expmp4") ? 2 : 1)));
            return score(b) - score(a);
          });
          src = sorted[0];
        }

        if (!src) {
          const hlsMatches = bodyText.match(/https?:\/\/v1\.pinimg\.com\/videos\/mc\/hls\/[^\s"'<>]+\.m3u8/g);
          if (hlsMatches && hlsMatches.length > 0) {
            src = hlsMatches[0].replace("/videos/mc/hls/", "/videos/mc/720p/").replace("/hls/", "/720p/").replace(/\.m3u8.*$/i, ".mp4");
          }
        }

        if (!src) {
          const twMatches = bodyText.match(/https?:\/\/video\.twimg\.com\/[^\s"'<>]+\.mp4/g);
          if (twMatches && twMatches.length > 0) {
            src = twMatches[0];
          }
        }
      }

      if (!src) {
        const og = document.querySelector('meta[property="og:video"], meta[property="og:video:url"], meta[property="og:video:secure_url"]');
        if (og && og.content && isGenuineDirectVideoUrl(og.content)) {
          src = og.content;
        }
      }

      if (!src) {
        src = video.currentSrc || video.src || "";
      }
      if (!src) {
        const s = video.querySelector("source");
        if (s && s.src) src = s.src;
      }
      if (!src) {
        for (const attr of ["data-src", "data-video-src", "data-url"]) {
          const val = video.getAttribute(attr);
          if (val) {
            src = val;
            break;
          }
        }
      }
      src = toAbs(src);
      if (src && !src.startsWith("blob:null") && !src.startsWith("data:image/svg")) {
        const rect = video.getBoundingClientRect();
        const vert = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
        const horiz = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
        const visibleArea = vert * horiz;
        const isInViewport = visibleArea > 200;

        let w = video.videoWidth || parseInt(video.getAttribute("width"), 10) || rect.width || 1280;
        let h = video.videoHeight || parseInt(video.getAttribute("height"), 10) || rect.height || 720;

        const fmt = detectFmt(src);
        const slug = extractSlug({
          alt: video.getAttribute("aria-label") || "",
          title: video.title || "",
          pageTitle: document.title,
          url: src
        });

        list.push({
          url: src,
          width: Math.round(w),
          height: Math.round(h),
          area: Math.round(w) * Math.round(h),
          isInViewport: isInViewport,
          visibleArea: visibleArea,
          format: fmt === "IMG" || fmt === "WEBP" ? "MP4" : fmt,
          mediaType: "video",
          isWebp: false,
          isGif: false,
          slug: slug
        });
      }
    });

    // 2. Resimler & GIF'ler
    const activeVideoContainers = new Set();
    videos.forEach((v) => {
      const pin = v.closest('[data-test-id="pin"], [role="listitem"], .pinWrapper, figure, article, [data-grid-item]');
      if (pin) activeVideoContainers.add(pin);
    });

    const imgs = document.querySelectorAll("img");
    imgs.forEach((img) => {
      // Video kapak / poster görsellerini filtrele (videoların JPEG olarak algılanmasını önler)
      const parentPin = img.closest('[data-test-id="pin"], [role="listitem"], .pinWrapper, figure, article, [data-grid-item]');
      if (parentPin && activeVideoContainers.has(parentPin)) {
        return;
      }
      if ((img.src && img.src.includes("videos_thumbnails")) || (img.currentSrc && img.currentSrc.includes("videos_thumbnails"))) {
        return;
      }

      let src = img.currentSrc || img.src || "";
      const dataSrc =
        img.getAttribute("data-src") ||
        img.getAttribute("data-original") ||
        img.getAttribute("data-zoom-image") ||
        img.getAttribute("data-high-res-src") ||
        img.getAttribute("data-full-url");
      if (dataSrc) src = dataSrc;

      const srcset = img.getAttribute("srcset");
      if (srcset) {
        const parts = srcset.split(",").map((s) => s.trim().split(/\s+/));
        let maxW = 0;
        parts.forEach((p) => {
          if (p[0] && p[1] && p[1].endsWith("w")) {
            const w = parseInt(p[1], 10);
            if (w > maxW) {
              maxW = w;
              src = p[0];
            }
          }
        });
      }

      src = toAbs(src);

      if (src && !src.startsWith("data:image/gif;base64,R0lGODlhAQAB") && !src.startsWith("data:image/svg")) {
        const rect = img.getBoundingClientRect();

        const vert = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
        const horiz = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
        const visibleArea = vert * horiz;
        const isInViewport = visibleArea > 200;

        let w = img.naturalWidth || img.width || rect.width || 0;
        let h = img.naturalHeight || img.height || rect.height || 0;

        const wMatch = src.match(/[?&](?:w|width|size)=(\d+)/i);
        if (wMatch && wMatch[1]) {
          const hint = parseInt(wMatch[1], 10);
          if (hint > w) w = hint;
        }

        if (w === 0) w = 800;
        if (h === 0) h = 600;

        const fmt = detectFmt(src);
        const isGif = fmt === "GIF" || src.toLowerCase().includes(".gif");
        const slug = extractSlug({
          alt: img.alt || "",
          title: img.title || img.getAttribute("aria-label") || "",
          pageTitle: document.title,
          url: src
        });

        list.push({
          url: src,
          width: Math.round(w),
          height: Math.round(h),
          area: Math.round(w) * Math.round(h),
          isInViewport: isInViewport,
          visibleArea: visibleArea,
          format: fmt,
          mediaType: isGif ? "gif" : "image",
          isWebp: fmt === "WEBP",
          isGif: isGif,
          slug: slug
        });
      }
    });

    list.sort((a, b) => {
      if (a.isInViewport && !b.isInViewport) return -1;
      if (!a.isInViewport && b.isInViewport) return 1;

      // VİDEO ÖNCELİĞİ: Ekranda video varsa video her zaman resimlerden önceliklidir
      const aIsVideo = a.mediaType === "video";
      const bIsVideo = b.mediaType === "video";
      if (aIsVideo && !bIsVideo) return -1;
      if (!aIsVideo && bIsVideo) return 1;

      if (a.isInViewport && b.isInViewport) {
        return b.visibleArea * b.area - a.visibleArea * a.area;
      }
      return b.area - a.area;
    });

    const seen = new Set();
    const unique = [];
    list.forEach((item) => {
      if (!seen.has(item.url)) {
        seen.add(item.url);
        unique.push(item);
      }
    });

    return unique;
  }

  function runDirectScan(tabId) {
    chrome.tabs.sendMessage(tabId, { action: "GET_PAGE_IMAGES" }, (response) => {
      const _ = chrome.runtime.lastError;
      if (response && response.success && response.currentLargest) {
        renderUI(response.currentLargest, response.images);
        return;
      }

      chrome.scripting.executeScript(
        {
          target: { tabId: tabId },
          func: standaloneDOMScanner
        },
        (results) => {
          const err = chrome.runtime.lastError;
          if (err || !results || !results[0] || !results[0].result || results[0].result.length === 0) {
            showEmpty("Ekranda uygun fotoğraf veya video bulunamadı.");
            return;
          }

          const mediaList = results[0].result;
          renderUI(mediaList[0], mediaList);
        }
      );
    });
  }

  async function renderUI(mainMedia, allMedia) {
    loadingState.classList.add("hidden");
    emptyState.classList.add("hidden");
    warningNotice.classList.add("hidden");
    mainContent.classList.remove("hidden");

    currentMainMedia = mainMedia;

    const isVideo = mainMedia.mediaType === "video";
    const isGif = mainMedia.format === "GIF" || mainMedia.isGif;

    // 1. Önizleme Elemanını Ayarlama
    if (isVideo) {
      mainImgPreview.classList.add("hidden");
      mainVideoPreview.src = mainMedia.url;
      mainVideoPreview.classList.remove("hidden");
      screenBadge.textContent = "🎬 EKRANDA GÖRÜNEN VİDEO";
      screenBadge.className = "badge-ribbon ribbon-video";
    } else {
      mainVideoPreview.classList.add("hidden");
      mainImgPreview.src = mainMedia.url;
      mainImgPreview.classList.remove("hidden");
      if (isGif) {
        screenBadge.textContent = "🎞️ EKRANDA GÖRÜNEN GIF";
        screenBadge.className = "badge-ribbon ribbon-gif";
      } else {
        screenBadge.textContent = "👁️ EKRANDA GÖRÜNEN FOTOĞRAF";
        screenBadge.className = "badge-ribbon";
      }
    }

    mainImgDims.textContent = `${mainMedia.width} × ${mainMedia.height} px`;

    // 2. Format ve Butonları Ayarlama
    let initialFmt = isVideo ? "MP4" : (isGif ? "GIF" : (mainMedia.isWebp ? "WEBP" : (mainMedia.format || "GÖRSEL")));
    if (isVideo && initialFmt !== "WEBM" && initialFmt !== "MOV") {
      initialFmt = "MP4";
    }
    updateFormatUI(initialFmt, mainMedia.mediaType);

    // 3. Anında Magic Bytes ile GERÇEK formatı doğrula (Videolar hariç, videonun JPEG'e dönüşmesini engeller)
    if (!isVideo && !mainMedia.url.startsWith("blob:")) {
      const verifiedFmt = await detectRealMagicFormat(mainMedia.url);
      if (verifiedFmt) {
        mainMedia.format = verifiedFmt;
        mainMedia.isWebp = verifiedFmt === "WEBP";
        mainMedia.isGif = verifiedFmt === "GIF";
        updateFormatUI(verifiedFmt, mainMedia.mediaType);
      } else {
        chrome.runtime.sendMessage(
          { action: "INSPECT_IMAGE_URL", url: mainMedia.url },
          (res) => {
            const _ = chrome.runtime.lastError;
            if (res && res.format) {
              mainMedia.format = res.format;
              mainMedia.isWebp = res.isWebp;
              mainMedia.isGif = res.isGif;
              updateFormatUI(res.format, mainMedia.mediaType);
            }
          }
        );
      }
    }

    // 4. Sayfadaki Diğer Medyalar Listesi
    const others = (allMedia || []).filter((m) => m.url !== mainMedia.url).slice(0, 6);

    if (others.length > 0) {
      otherImagesSection.classList.remove("hidden");
      otherImagesList.innerHTML = "";

      others.forEach((item, idx) => {
        const itemEl = document.createElement("div");
        itemEl.className = "image-list-item";

        const dims = `${item.width}×${item.height} px`;
        const itemIsVideo = item.mediaType === "video";
        const itemIsGif = item.format === "GIF" || item.isGif;
        const f = item.format || (itemIsVideo ? "MP4" : (itemIsGif ? "GIF" : "IMG"));

        let thumbHtml = "";
        if (itemIsVideo) {
          thumbHtml = `<div class="list-thumb" style="background:#2e1065;">🎬</div>`;
        } else {
          thumbHtml = `<img class="list-thumb" src="${item.url}" alt="#${idx + 2}" />`;
        }

        let actionBtns = `
          <button class="btn-tiny" data-url="${item.url}" data-format="original" data-slug="${item.slug || ''}">Orijinal</button>
        `;
        if (!itemIsVideo) {
          actionBtns += `
            <button class="btn-tiny" data-url="${item.url}" data-format="png" data-slug="${item.slug || ''}" style="background:#059669;color:#fff;">PNG</button>
            <button class="btn-tiny" data-url="${item.url}" data-format="jpeg" data-slug="${item.slug || ''}" style="background:#0284c7;color:#fff;">JPG</button>
          `;
        }

        itemEl.innerHTML = `
          ${thumbHtml}
          <div class="list-info">
            <span class="list-dims">${dims}</span>
            <span class="list-fmt" id="other_fmt_${idx}">${f} ${item.isInViewport ? "(Ekranda)" : ""}</span>
          </div>
          <div class="list-actions">
            ${actionBtns}
          </div>
        `;

        otherImagesList.appendChild(itemEl);

        detectRealMagicFormat(item.url).then((realF) => {
          if (realF) {
            const fmtEl = document.getElementById(`other_fmt_${idx}`);
            if (fmtEl) fmtEl.textContent = `${realF} ${item.isInViewport ? "(Ekranda)" : ""}`;
          }
        });
      });

      otherImagesList.querySelectorAll(".btn-tiny").forEach((btn) => {
        btn.onclick = () => {
          const u = btn.getAttribute("data-url");
          const f = btn.getAttribute("data-format");
          const s = btn.getAttribute("data-slug");
          triggerDownload(u, f, s);
        };
      });
    } else {
      otherImagesSection.classList.add("hidden");
    }
  }

  function updateFormatUI(fmt, mediaType) {
    const isVid = mediaType === "video" || fmt === "MP4" || fmt === "WEBM" || fmt === "MOV";
    const isGif = fmt === "GIF";
    let safeFmt = fmt;
    if (isVid && safeFmt !== "WEBM" && safeFmt !== "MOV") {
      safeFmt = "MP4";
    }
    const extName = (isVid && safeFmt !== "WEBM" && safeFmt !== "MOV") ? "mp4" : (safeFmt.toLowerCase() === "jpeg" ? "jpg" : safeFmt.toLowerCase());

    mainImgFormat.textContent = safeFmt;
    mainImgStatus.textContent = safeFmt;

    if (isVid) {
      mainImgStatus.className = "info-val status-tag status-video";
      mainDownloadOrig.textContent = `🎬 Orijinal Video İndir (.${extName})`;
      mainDownloadOrig.className = "btn btn-purple";
      mainDownloadPng.classList.add("hidden");
      mainDownloadJpg.classList.add("hidden");
    } else if (isGif) {
      mainImgStatus.className = "info-val status-tag status-gif";
      mainDownloadOrig.textContent = `🎞️ Orijinal GIF İndir (.gif)`;
      mainDownloadOrig.className = "btn btn-amber";
      mainDownloadPng.textContent = "🖼️ PNG İndir (İlk Kare / Kayıpsız)";
      mainDownloadPng.className = "btn btn-emerald";
      mainDownloadPng.classList.remove("hidden");
      mainDownloadJpg.textContent = "🖼️ JPG İndir (İlk Kare %100)";
      mainDownloadJpg.className = "btn btn-emerald";
      mainDownloadJpg.classList.remove("hidden");
    } else {
      mainImgStatus.className = "info-val status-tag";
      if (fmt === "WEBP") {
        mainImgStatus.style.background = "#059669";
        mainImgStatus.style.color = "#ffffff";
      } else {
        mainImgStatus.style.background = "#0284c7";
        mainImgStatus.style.color = "#ffffff";
      }
      mainDownloadOrig.textContent = `💾 Orijinal İndir (.${extName})`;
      mainDownloadOrig.className = "btn btn-primary";
      mainDownloadPng.textContent = "🖼️ PNG İndir (%100 Kayıpsız)";
      mainDownloadPng.className = "btn btn-emerald";
      mainDownloadPng.classList.remove("hidden");
      mainDownloadJpg.textContent = "🖼️ JPG İndir (Maksimum Kalite %100)";
      mainDownloadJpg.className = "btn btn-emerald";
      mainDownloadJpg.classList.remove("hidden");
    }
  }

  function triggerDownload(url, format, slug) {
    const isVid = format === "mp4" || format === "webm" || currentMainMedia?.mediaType === "video";

    // Eğer doğrudan video dosyası linki yoksa (YouTube, Shorts, blob, akış vb.), canlı akış motoruna yönlendir
    if (isVid && (!url || url.startsWith("blob:") || !isGenuineDirectVideoUrl(url))) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, { action: "START_STREAM_DOWNLOAD" }, () => {
            const _ = chrome.runtime.lastError;
            window.close();
          });
        }
      });
      return;
    }
    const filenameToUse = slug || (currentMainMedia ? currentMainMedia.slug : "");
    chrome.runtime.sendMessage(
      {
        action: "DOWNLOAD_IMAGE",
        url: url,
        format: format || "original",
        filename: filenameToUse
      },
      (res) => {
        const lastErr = chrome.runtime.lastError;
        if (lastErr || !res || !res.success) {
          const isVid = (format === "mp4" || format === "webm" || (url && (url.includes(".mp4") || url.includes("video"))));
          if (isVid) {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs && tabs[0] && tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "START_STREAM_DOWNLOAD" }, () => {
                  const _ = chrome.runtime.lastError;
                  window.close();
                });
              }
            });
            return;
          }
          const errMsg = lastErr?.message || res?.error || "İndirme başlatılamadı.";
          alert(`⚠️ İndirme Hatası: ${errMsg}`);
        }
      }
    );
  }

  mainDownloadOrig.onclick = () => {
    if (currentMainMedia) triggerDownload(currentMainMedia.url, "original", currentMainMedia.slug);
  };

  mainDownloadPng.onclick = () => {
    if (currentMainMedia) triggerDownload(currentMainMedia.url, "png", currentMainMedia.slug);
  };

  mainDownloadJpg.onclick = () => {
    if (currentMainMedia) triggerDownload(currentMainMedia.url, "jpeg", currentMainMedia.slug);
  };

  copyUrlBtn.onclick = () => {
    if (currentMainMedia) {
      navigator.clipboard
        .writeText(currentMainMedia.url)
        .then(() => {
          copyUrlBtn.textContent = "✓ Bağlantı Kopyalandı!";
          setTimeout(() => (copyUrlBtn.textContent = "🔗 Orijinal Linki Kopyala"), 1500);
        })
        .catch(() => {
          copyUrlBtn.textContent = "Kopyalanamadı";
        });
    }
  };

  rescanBtn.onclick = () => {
    fetchPageImages();
  };

  if (emptyRetryBtn) {
    emptyRetryBtn.onclick = () => {
      fetchPageImages();
    };
  }

  fetchPageImages();
});
