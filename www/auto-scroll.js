/* ================================================================
 * التمرير التلقائي مع مراقبة النظرة — نور
 * ================================================================
 *
 * AutoScroll: يُمرّر #ayahContainer بسلاسة باستخدام requestAnimationFrame
 *   مع خمس عشرة درجة سرعة وشريط تحكم عائم أسفل الشاشة.
 *
 * GazeWatcher: يستخدم MediaPipe Tasks Vision (كشف وجه محلي عبر WASM، بلا
 *   اتصال إنترنت — انظر islamic-app/vendor/mediapipe/) للكشف عن وجه
 *   المستخدم أمام الكاميرا الأمامية — إن أزاح نظره يتوقف التمرير تلقائياً
 *   حتى يعود، دون أن يضيع المكان. يستبدل FaceDetector الأصلي (Shape
 *   Detection API) غير المطبَّق إطلاقاً في Android WebView.
 *
 * مستويات السرعة: ١٥ درجة خطية من ٠٫٥× إلى ٤× (بكسل/إطار عند 60fps)،
 * بفارق ٠٫٢٥ بين كل درجة والتالية.
 * ================================================================ */

(function (global) {
  'use strict';

  /* ─── الثوابت ─── */
  var SPEED_MIN = 0.5;
  var SPEED_MAX = 4;
  var SPEED_LEVELS = 15;
  var SPEED_STEP = (SPEED_MAX - SPEED_MIN) / (SPEED_LEVELS - 1); // 0.25
  var SPEEDS = [];
  for (var _i = 0; _i < SPEED_LEVELS; _i++) {
    SPEEDS.push(Math.round((SPEED_MIN + _i * SPEED_STEP) * 100) / 100);
  }
  var DEFAULT_IDX = 2;   // 1×
  var GAZE_POLL_MS = 700;

  /* رقم عربي بدل اللاتيني، بنفس أسلوب toArabicNum في app.js — نسخة محلية
     حتى يبقى هذا الملف مستقلاً بلا اعتماد على ترتيب تحميل app.js. */
  function toArabicDigits(str) {
    return String(str).replace(/\d/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; });
  }
  function speedLabel(idx) {
    return '×' + toArabicDigits(SPEEDS[idx]);
  }

  /* ─── الحالة ─── */
  var running = false;
  var speedIdx = DEFAULT_IDX;
  var rafId = null;
  var lastTs = null;
  var scrollAccPx = null; // مُراكِم كسري لموضع التمرير — منفصل عن scrollTop
                           // لأن المتصفح يقرّب scrollTop لأقرب بكسل صحيح،
                           // فتُفقَد أي زيادة أقل من ١px في كل إطار بدونه.

  /* ─── حالة مراقبة النظرة ─── */
  var gazeEnabled = false;
  var gazeVideo = null;
  var gazeStream = null;
  var gazePollTimer = null;

  /* كاشف MediaPipe — يُحمَّل مرة واحدة (~12 ميجابايت WASM) ويبقى مُخزَّناً
     عبر جلسة الصفحة كلها، حتى لا يُعاد تحميله كل مرة يُشغَّل فيها الزر. */
  var gazeDetector = null;
  var gazeDetectorLoading = null;

  /* ─── عنصر التمرير ─── */
  function getEl() {
    return document.getElementById('ayahContainer');
  }

  /* ─── حلقة التمرير ─── */
  function tick(ts) {
    if (!running) return;
    if (!lastTs) lastTs = ts;
    var dt = ts - lastTs;
    lastTs = ts;

    var el = getEl();
    if (el) {
      if (scrollAccPx === null) scrollAccPx = el.scrollTop;
      scrollAccPx += SPEEDS[speedIdx] * (dt / 16.667);
      el.scrollTop = Math.round(scrollAccPx);
      // وصل للنهاية — أوقف
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
        _pause();
        syncUI();
        return;
      }
    }
    rafId = requestAnimationFrame(tick);
  }

  function _play() {
    if (running) return;
    running = true;
    lastTs = null;
    scrollAccPx = null;
    rafId = requestAnimationFrame(tick);
    syncUI();
  }

  function _pause() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    rafId = null;
    lastTs = null;
    scrollAccPx = null;
    syncUI();
  }

  function toggle() {
    if (running) _pause(); else _play();
  }

  function faster() {
    if (speedIdx < SPEEDS.length - 1) { speedIdx++; syncSpeed(); }
  }

  function slower() {
    if (speedIdx > 0) { speedIdx--; syncSpeed(); }
  }

  /* ─── مزامنة الواجهة ─── */
  function syncUI() {
    var btn = document.getElementById('asToggle');
    if (!btn) return;
    var use = btn.querySelector('use');
    if (use) use.setAttribute('href', running ? '#i-pause' : '#i-play');
    btn.setAttribute('aria-label', running ? 'إيقاف مؤقت' : 'تشغيل');
    btn.title = running ? 'إيقاف مؤقت' : 'تشغيل';
  }

  function syncSpeed() {
    var lbl = document.getElementById('asSpeedLabel');
    if (lbl) lbl.textContent = speedLabel(speedIdx);
  }

  /* ─── إظهار / إخفاء الشريط ─── */
  function showBar() {
    var bar = document.getElementById('autoScrollBar');
    if (!bar) return;
    bar.classList.remove('hidden');
    // تحديث حالة زر التشغيل في شريط القراءة
    var trigger = document.getElementById('autoScrollTrigger');
    if (trigger) trigger.classList.add('as-trigger-on');
    syncUI();
    syncSpeed();
    _play();
  }

  function hideBar() {
    _pause();
    var bar = document.getElementById('autoScrollBar');
    if (bar) bar.classList.add('hidden');
    var trigger = document.getElementById('autoScrollTrigger');
    if (trigger) trigger.classList.remove('as-trigger-on');
    _stopGaze();
    // إعادة ضبط زر النظرة
    var gazeBtn = document.getElementById('asGaze');
    if (gazeBtn) gazeBtn.classList.remove('as-gaze-on');
  }

  /* ─── مراقبة النظرة بالكاميرا (MediaPipe Face Detector) ─── */

  function gazeSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  /* مسارات الأصول محلية دائماً — لا CDN، حتى لا تخرق استقلالية أوفلاين
     التطبيق (انظر tests/offline.mjs). تُحمَّل مرة واحدة فقط عند أول ضغطة
     فعلية على زر مراقبة النظرة، لا عند فتح التطبيق. */
  function _loadGazeDetector() {
    if (gazeDetector) return Promise.resolve(gazeDetector);
    if (gazeDetectorLoading) return gazeDetectorLoading;

    gazeDetectorLoading = import('./vendor/mediapipe/vision_bundle.mjs')
      .then(function (mp) {
        // WasmFileset يدوي بدل FilesetResolver.forVisionTasks: نُحزّم نسخة
        // SIMD فقط (تدعمها كل أجهزة أندرويد الحديثة عملياً) لا كل النسخ
        // الثلاث التي ينشرها المسار التلقائي — يوفّر ~23 ميجابايت.
        var wasmFileset = {
          wasmLoaderPath: 'vendor/mediapipe/vision_wasm_internal.js',
          wasmBinaryPath: 'vendor/mediapipe/vision_wasm_internal.wasm'
        };
        return mp.FaceDetector.createFromOptions(wasmFileset, {
          baseOptions: { modelAssetPath: 'vendor/mediapipe/blaze_face_short_range.tflite' },
          runningMode: 'VIDEO'
        });
      })
      .then(function (detector) {
        gazeDetector = detector;
        gazeDetectorLoading = null;
        return detector;
      })
      .catch(function (err) {
        gazeDetectorLoading = null;
        throw err;
      });

    return gazeDetectorLoading;
  }

  function _startGaze(onResult) {
    if (gazeEnabled) { onResult(true); return; }

    var hint = document.getElementById('asGazeHint');
    if (hint) { hint.textContent = 'جارِ تجهيز مراقبة النظرة…'; hint.classList.remove('hidden'); }

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 240 }, height: { ideal: 180 } }
    }).then(function (stream) {
      gazeStream = stream;
      gazeVideo = document.createElement('video');
      gazeVideo.srcObject = stream;
      gazeVideo.autoplay = true;
      gazeVideo.playsInline = true;
      gazeVideo.muted = true;
      gazeVideo.setAttribute('playsinline', '');
      gazeVideo.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';
      document.body.appendChild(gazeVideo);
      return _loadGazeDetector();
    }).then(function () {
      if (hint) hint.classList.add('hidden');
      gazeEnabled = true;
      _schedulePoll();
      onResult(true);
    }).catch(function (err) {
      console.warn('[AutoScroll] تعذّر تفعيل مراقبة النظرة:', err);
      if (hint) {
        hint.textContent = 'الكاميرا أو مراقبة النظرة غير متاحة';
        setTimeout(function () { hint.classList.add('hidden'); }, 3000);
      }
      if (gazeStream) { gazeStream.getTracks().forEach(function (t) { t.stop(); }); gazeStream = null; }
      if (gazeVideo) { gazeVideo.remove(); gazeVideo = null; }
      onResult(false);
    });
  }

  function _stopGaze() {
    gazeEnabled = false;
    clearTimeout(gazePollTimer); gazePollTimer = null;
    if (gazeStream) {
      gazeStream.getTracks().forEach(function (t) { t.stop(); });
      gazeStream = null;
    }
    if (gazeVideo) { gazeVideo.remove(); gazeVideo = null; }
    // gazeDetector يبقى مُخزَّناً عمداً — إعادة تحميل ~12 ميجابايت WASM في
    // كل تشغيل/إيقاف للميزة داخل نفس الجلسة مكلفة وغير ضرورية.
  }

  function _schedulePoll() {
    gazePollTimer = setTimeout(_pollFace, GAZE_POLL_MS);
  }

  function _pollFace() {
    if (!gazeEnabled || !gazeVideo || gazeVideo.readyState < 2 || !gazeDetector) {
      if (gazeEnabled) _schedulePoll();
      return;
    }
    var looking = false;
    try {
      var result = gazeDetector.detectForVideo(gazeVideo, performance.now());
      looking = !!(result && result.detections && result.detections.length > 0);
    } catch (e) { /* إطار عابر غير صالح — تجاهله وحاول في الجولة التالية */ }

    // يراقب — شغّل التمرير لو كان موقوفاً بسبب النظرة
    if (looking && !running) _play();
    // بعيد — أوقف التمرير لو كان شغّالاً
    else if (!looking && running) _pause();
    if (gazeEnabled) _schedulePoll();
  }

  /* ─── التهيئة ─── */
  function init() {
    var bar = document.getElementById('autoScrollBar');
    if (!bar) return;

    // أزرار الشريط
    var toggleBtn = document.getElementById('asToggle');
    var fasterBtn = document.getElementById('asFaster');
    var slowerBtn = document.getElementById('asSlower');
    var closeBtn  = document.getElementById('asClose');
    var gazeBtn   = document.getElementById('asGaze');

    if (toggleBtn) toggleBtn.addEventListener('click', toggle);
    if (fasterBtn) fasterBtn.addEventListener('click', faster);
    if (slowerBtn) slowerBtn.addEventListener('click', slower);
    if (closeBtn)  closeBtn.addEventListener('click', hideBar);

    // زر النظرة — إخفاؤه فقط إن لم يكن getUserMedia متاحاً
    if (gazeBtn) {
      if (!gazeSupported()) {
        gazeBtn.style.display = 'none';
      }
      gazeBtn.addEventListener('click', function () {
        if (!gazeEnabled) {
          _startGaze(function (ok) {
            if (ok) {
              gazeBtn.classList.add('as-gaze-on');
              gazeBtn.title = 'إيقاف مراقبة النظرة';
              // إذا كان التمرير متوقفاً ابدأه مع النظرة
              if (!running) _play();
            } else {
              // الكاميرا مرفوضة — أخبر المستخدم
              var hint = document.getElementById('asGazeHint');
              if (hint) { hint.classList.remove('hidden'); setTimeout(function () { hint.classList.add('hidden'); }, 3000); }
            }
          });
        } else {
          _stopGaze();
          gazeBtn.classList.remove('as-gaze-on');
          gazeBtn.title = 'مراقبة النظرة';
        }
      });
    }

    // زر التشغيل في شريط القراءة (يفتح/يغلق الشريط)
    var triggerBtn = document.getElementById('autoScrollTrigger');
    if (triggerBtn) {
      triggerBtn.addEventListener('click', function () {
        var isVisible = !bar.classList.contains('hidden');
        if (isVisible) hideBar(); else showBar();
      });
    }

    syncUI();
    syncSpeed();
  }

  // التهيئة بعد تحميل الصفحة
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

  // الواجهة العامة
  global.AutoScroll = {
    show:   showBar,
    hide:   hideBar,
    toggle: toggle,
    play:   _play,
    pause:  _pause,
    faster: faster,
    slower: slower
  };

}(typeof window !== 'undefined' ? window : this));
