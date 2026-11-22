// sniffer.js - Web Sayfası İçinde Video İsteklerini Dinleme ve Doğrudan MP4 Yakalama (Main World)

(function () {
  "use strict";

  if (window.__LARGEST_IMG_SNIFFER_LOADED__) return;
  window.__LARGEST_IMG_SNIFFER_LOADED__ = true;

  function notifyVideoFound(url) {
    if (!url || typeof url !== "string") return;
    if (url.startsWith("blob:") || url.startsWith("data:")) return;

    let targetUrl = url;
    const u = url.toLowerCase();

    // 1. Pinterest HLS Akışını veya Parçalarını Doğrudan 720p MP4'e Dönüştürme
    if (u.includes("v1.pinimg.com/videos")) {
      if (u.includes("/hls/") || u.includes(".m3u8") || u.includes(".ts")) {
        targetUrl = url
          .replace("/videos/mc/hls/", "/videos/mc/720p/")
          .replace("/hls/", "/720p/")
          .replace(/[-_]\d+\.ts.*$/i, ".mp4")
          .replace(/\.ts.*$/i, ".mp4")
          .replace(/\.m3u8.*$/i, ".mp4");
      }
    }

    // 2. Parça / Playlist dosyalarını filtrele
    const cleanLower = targetUrl.toLowerCase();
    if (
      cleanLower.endsWith(".ts") ||
      cleanLower.endsWith(".m3u8") ||
      cleanLower.endsWith(".mpd") ||
      cleanLower.endsWith(".key") ||
      cleanLower.includes("playlist.m3u8")
    ) {
      return;
    }

    // 3. Geçerli Video Kontrolü
    const isVideo =
      cleanLower.includes(".mp4") ||
      cleanLower.includes(".webm") ||
      cleanLower.includes(".mov") ||
      cleanLower.includes(".mkv") ||
      cleanLower.includes("video.twimg.com") ||
      cleanLower.includes("v.redd.it") ||
      cleanLower.includes("cdninstagram.com") ||
      cleanLower.includes("tiktokcdn.com");

    if (isVideo) {
      window.postMessage({ type: "__LRG_SNIFFED_VIDEO__", url: targetUrl }, "*");
    }
  }

  // 1. Fetch Kancası
  if (window.fetch) {
    const origFetch = window.fetch;
    window.fetch = function (...args) {
      try {
        const input = args[0];
        let url = "";
        if (typeof input === "string") url = input;
        else if (input && input.url) url = input.url;
        notifyVideoFound(url);
      } catch (e) {}
      return origFetch.apply(this, args);
    };
  }

  // 2. XMLHttpRequest Kancası
  if (window.XMLHttpRequest) {
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      try {
        if (typeof url === "string") {
          notifyVideoFound(url);
        }
      } catch (e) {}
      return origOpen.apply(this, [method, url, ...rest]);
    };
  }

  // 3. HTMLMediaElement.src Kancası
  try {
    const videoProto = HTMLMediaElement.prototype;
    const origSrcDescriptor = Object.getOwnPropertyDescriptor(videoProto, "src");
    if (origSrcDescriptor && origSrcDescriptor.set) {
      Object.defineProperty(videoProto, "src", {
        set: function (val) {
          notifyVideoFound(val);
          return origSrcDescriptor.set.call(this, val);
        },
        get: origSrcDescriptor.get,
        configurable: true
      });
    }
  } catch (e) {}
})();
