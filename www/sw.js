'use strict';

/* ============================================================================
 * Service Worker — آلية التحديث التلقائي لتطبيق نور
 * ============================================================================
 * يعمل بجانب آلية Capgo الموجودة كضمان إضافي. عند كل فتح للتطبيق يُرسل له
 * رسالة CHECK_UPDATE، فيفحص version.json من GitHub Pages، وإن تغيّر contentHash
 * يُنزّل ملفات الكود المحدَّثة فرداً ويخزّنها في Cache API، ثم يطلب إعادة تحميل
 * الصفحة. البيانات الكبيرة (نص القرآن، الخطوط) تُخزَّن مرة واحدة فقط.
 * ============================================================================ */

var CACHE_NAME  = 'noor-app-v2';
var META_CACHE  = 'noor-meta-v1';
var GITHUB_BASE = 'https://tahershawki1.github.io/noor';

/* ملفات الكود — تُحدَّث عند كل تغيير في contentHash */
var CODE_FILES = [
  '/index.html',
  '/styles.css',
  '/app.js',
  '/prayer-times.js',
  '/auto-scroll.js',
  '/app-updates.js',
  '/live-updates.js',
  '/floating-widget.js',
  '/prayer-widget.js',
  '/backup.js',
  '/adhkar-data.js',
  '/quran-data.js',
  '/version.json'
];

/* ملفات ثابتة — تُخزَّن مرة واحدة ولا تُحدَّث تلقائياً (نادراً تتغير) */
var STATIC_FILES = [
  '/fonts/fonts.css',
  '/fonts/amiri-arabic-400-normal.woff2',
  '/fonts/amiri-arabic-700-normal.woff2',
  '/fonts/amiri-quran-arabic-400-normal.woff2',
  '/fonts/cairo-arabic-wght-normal.woff2',
  '/fonts/cairo-latin-wght-normal.woff2',
  '/fonts/lateef-arabic-400-normal.woff2',
  '/fonts/lateef-arabic-700-normal.woff2',
  '/fonts/noto-naskh-arabic-arabic-wght-normal.woff2',
  '/fonts/reem-kufi-arabic-wght-normal.woff2',
  '/fonts/scheherazade-new-arabic-400-normal.woff2',
  '/fonts/scheherazade-new-arabic-700-normal.woff2',
  '/data/cities.json',
  '/data/quran-meta.json',
  '/data/quran-text.json',
  '/data/tafsir-muyassar.json'
];

/* ─── قراءة/كتابة بيانات الميتا (contentHash) ─── */
function getMeta(key) {
  return caches.open(META_CACHE).then(function (c) {
    return c.match('/_/' + key).then(function (r) { return r ? r.text() : null; });
  });
}
function setMeta(key, val) {
  return caches.open(META_CACHE).then(function (c) {
    return c.put('/_/' + key, new Response(String(val)));
  });
}

/* ─── التثبيت: كاش أولي من أصول التطبيق المحلية ─── */
self.addEventListener('install', function (event) {
  var allFiles = CODE_FILES.concat(STATIC_FILES);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(allFiles); })
      .then(function () { return self.skipWaiting(); })
      .catch(function (err) {
        console.warn('[SW] الكاش الأولي فشل جزئياً:', err);
        return self.skipWaiting();
      })
  );
});

/* ─── التفعيل: حذف الكاشات القديمة + فحص أولي للتحديثات ─── */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) { return k !== CACHE_NAME && k !== META_CACHE; })
            .map(function (k) { return caches.delete(k); })
        );
      })
      .then(function () { return clients.claim(); })
      .then(function () { return checkAndUpdate(); })
  );
});

/* ─── رسائل الصفحة ─── */
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'CHECK_UPDATE') {
    checkAndUpdate();
  }
});

/* ─── اعتراض الطلبات: كاش أولاً ─── */
self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);

  /* فقط طلبات localhost — باقي الطلبات (APIs، GitHub…) تمرّ مباشرة */
  if (url.hostname !== 'localhost') return;
  /* لا تتدخل في تسجيل الـ SW نفسه */
  if (url.pathname === '/sw.js') return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true })
      .then(function (cached) {
        if (cached) return cached;
        /* غير مخزّن — جلب من أصول التطبيق المحلية */
        return fetch(event.request)
          .then(function (resp) {
            if (resp && resp.status === 200) {
              caches.open(CACHE_NAME).then(function (c) {
                c.put(event.request, resp.clone());
              });
            }
            return resp;
          })
          .catch(function () { return new Response('', { status: 503 }); });
      })
  );
});

/* ─── منطق التحديث ─── */
var _checking = false;

function checkAndUpdate() {
  if (_checking) return Promise.resolve();
  _checking = true;

  return fetch(GITHUB_BASE + '/version.json?t=' + Date.now(), { cache: 'no-store' })
    .then(function (resp) {
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return resp.json();
    })
    .then(function (manifest) {
      if (!manifest || !manifest.web || !manifest.web.contentHash) return;
      var newHash = manifest.web.contentHash;
      return getMeta('contentHash').then(function (stored) {
        if (stored === newHash) return; /* لا جديد */
        return applyUpdate(manifest.web, newHash);
      });
    })
    .catch(function (err) {
      /* لا إنترنت أو خطأ في الشبكة — نكمل بالكاش الموجود */
      console.log('[SW] لا تحديثات (ربما لا إنترنت):', err.message || err);
    })
    .then(function () { _checking = false; });
}

function applyUpdate(webInfo, newHash) {
  broadcast({ type: 'UPDATE_STARTED', version: webInfo.version });

  return caches.open(CACHE_NAME)
    .then(function (cache) {
      var jobs = CODE_FILES.map(function (path) {
        var ghUrl = GITHUB_BASE + path + '?t=' + Date.now();
        return fetch(ghUrl, { cache: 'no-store' })
          .then(function (resp) {
            if (!resp || !resp.ok) return;
            var tasks = [cache.put(path, resp.clone())];
            /* / و /index.html متطابقان */
            if (path === '/index.html') tasks.push(cache.put('/', resp.clone()));
            return Promise.all(tasks);
          })
          .catch(function (e) {
            console.warn('[SW] فشل تحديث ' + path + ':', e.message || e);
          });
      });
      return Promise.all(jobs);
    })
    .then(function () { return setMeta('contentHash', newHash); })
    .then(function () { broadcast({ type: 'RELOAD', version: webInfo.version }); });
}

function broadcast(msg) {
  return self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
    .then(function (cs) { cs.forEach(function (c) { c.postMessage(msg); }); });
}
