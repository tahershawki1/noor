/* ============================================================================
 * QuranAudioOffline — تلاوة محلية اختيارية عبر Cache API
 * ============================================================================
 *
 * التلاوة الافتراضية تُبَث من everyayah.com (انظر quran-reader.js). هذه الوحدة
 * تضيف مساراً بديلاً: نسخة مضغوطة (Opus 10kbps) من كل آية مستضافة عبر
 * GitHub Pages من نفس مجلد islamic-app (islamic-app/audio/*.opus)، يمكن
 * تنزيلها سورة بسورة وتخزينها محلياً عبر Cache API لتعمل بدون إنترنت.
 *
 * لا تُستخدم Filesystem الأصلية عمداً — لا اعتماد جديد، Cache API متاحة
 * فعلاً في WebView أندرويد والمتصفح على حد سواء.
 * ========================================================================== */

(function (global) {
  'use strict';

  var CACHE_NAME = 'noor-quran-audio';
  var OWN_AUDIO_BASE = 'https://tahershawki1.github.io/noor/audio/';
  var supported = typeof caches !== 'undefined';

  function pad3(n) {
    return String(n).padStart(3, '0');
  }

  function urlFor(surah, ayah) {
    return OWN_AUDIO_BASE + pad3(surah) + pad3(ayah) + '.opus';
  }

  function isAyahCached(surah, ayah) {
    if (!supported) return Promise.resolve(false);
    return caches
      .open(CACHE_NAME)
      .then(function (cache) { return cache.match(urlFor(surah, ayah)); })
      .then(function (res) { return !!res; });
  }

  /** يرجع object URL محلي صالح للتشغيل الفوري، أو null لو الآية غير مخزَّنة. */
  function getCachedAyahObjectUrl(surah, ayah) {
    if (!supported) return Promise.resolve(null);
    return caches
      .open(CACHE_NAME)
      .then(function (cache) { return cache.match(urlFor(surah, ayah)); })
      .then(function (res) {
        if (!res) return null;
        return res.blob().then(function (blob) { return URL.createObjectURL(blob); });
      });
  }

  async function isSurahFullyCached(surahNumber, ayahCount) {
    if (!supported) return false;
    var cache = await caches.open(CACHE_NAME);
    for (var ayah = 1; ayah <= ayahCount; ayah++) {
      var res = await cache.match(urlFor(surahNumber, ayah));
      if (!res) return false;
    }
    return true;
  }

  /** عدد التنزيلات المتوازية — آية تلو آية كان يجعل البقرة (٢٨٦ آية) تستغرق دقائق. */
  var DOWNLOAD_CONCURRENCY = 5;

  /** يجلب آيات السورة على دفعات متوازية ويخزّنها؛ onProgress(done, total) بعد كل آية. */
  async function downloadSurah(surahNumber, ayahCount, onProgress) {
    if (!supported) throw new Error('التخزين المؤقت غير مدعوم في هذا المتصفح');
    var cache = await caches.open(CACHE_NAME);
    var failed = 0;
    var done = 0;
    var nextAyah = 1;

    async function worker() {
      while (nextAyah <= ayahCount) {
        var ayah = nextAyah++;
        var url = urlFor(surahNumber, ayah);
        var existing = await cache.match(url);
        if (!existing) {
          try {
            var response = await fetch(url);
            if (response.ok) {
              await cache.put(url, response);
            } else {
              failed++;
            }
          } catch (e) {
            failed++;
          }
        }
        done++;
        if (onProgress) onProgress(done, ayahCount);
      }
    }

    var workers = [];
    for (var i = 0; i < DOWNLOAD_CONCURRENCY; i++) workers.push(worker());
    await Promise.all(workers);
    return { total: ayahCount, failed: failed };
  }

  function clearOfflineAudio() {
    if (!supported) return Promise.resolve(false);
    return caches.delete(CACHE_NAME);
  }

  /**
   * حجم وعدد الآيات المخزَّنة فعلياً — لعرضها في الإعدادات.
   * الحجم من ترويسة Content-Length لا بقراءة الـ blob كاملاً: قراءة مئات
   * الملفات كانت تجعل فتح الإعدادات ثقيلاً كلما زادت الصوتيات المحمّلة.
   */
  async function getOfflineAudioStats() {
    if (!supported) return { count: 0, bytes: 0 };
    var cache = await caches.open(CACHE_NAME);
    var keys = await cache.keys();
    var bytes = 0;
    for (var i = 0; i < keys.length; i++) {
      var res = await cache.match(keys[i]);
      if (!res) continue;
      var len = Number(res.headers.get('content-length') || 0);
      if (len > 0) {
        bytes += len;
      } else {
        var blob = await res.blob();
        bytes += blob.size;
      }
    }
    return { count: keys.length, bytes: bytes };
  }

  global.QuranAudioOffline = {
    isAyahCached: isAyahCached,
    getCachedAyahObjectUrl: getCachedAyahObjectUrl,
    isSurahFullyCached: isSurahFullyCached,
    downloadSurah: downloadSurah,
    clearOfflineAudio: clearOfflineAudio,
    getOfflineAudioStats: getOfflineAudioStats,
  };
})(typeof window !== 'undefined' ? window : this);
