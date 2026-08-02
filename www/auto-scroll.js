/* ================================================================
 * التمرير التلقائي مع مراقبة النظرة — نور
 * ================================================================
 *
 * AutoScroll: يُمرّر #ayahContainer بسلاسة باستخدام requestAnimationFrame،
 *   بسرعة مستمرة (٠٫٥× إلى ٤×) تُضبَط بسحب شريط انزلاق حي، وشريط تحكم عائم
 *   أسفل الشاشة. لمس/سحب المحتوى يدوياً أثناء التشغيل لا يُقاوَم — التمرير
 *   يُزامِن نفسه مع الموضع الجديد ويكمل منه (انظر onManualScroll).
 *
 * GazeWatcher: يستخدم MediaPipe Tasks Vision (كشف وجه محلي عبر WASM، بلا
 *   اتصال إنترنت — انظر islamic-app/vendor/mediapipe/) للكشف عن وجه
 *   المستخدم أمام الكاميرا الأمامية — إن أزاح نظره يتوقف التمرير تلقائياً
 *   حتى يعود، دون أن يضيع المكان. يستبدل FaceDetector الأصلي (Shape
 *   Detection API) غير المطبَّق إطلاقاً في Android WebView.
 * ================================================================ */

(function (global) {
  'use strict';

  /* ─── الثوابت ─── */
  var SPEED_MIN = 0.5;
  var SPEED_MAX = 4;
  var SPEED_DEFAULT = 1;
  var SPEED_NUDGE = 0.25;  // مقدار التغيير عند استخدام faster()/slower()
  var GAZE_POLL_MS = 700;

  /* رقم عربي بدل اللاتيني، بنفس أسلوب toArabicNum في app.js — نسخة محلية
     حتى يبقى هذا الملف مستقلاً بلا اعتماد على ترتيب تحميل app.js. */
  function toArabicDigits(str) {
    return String(str).replace(/\d/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; });
  }
  function speedLabel(value) {
    // بدون كسر عشري لو القيمة صحيحة (١×)، وإلا رقم عشري واحد (١٫٥×)
    var rounded = Math.round(value * 10) / 10;
    var text = (rounded % 1 === 0) ? String(rounded) : rounded.toFixed(1);
    return '×' + toArabicDigits(text);
  }

  /* ─── الحالة ─── */
  var running = false;
  var speed = SPEED_DEFAULT;
  var rafId = null;
  var lastTs = null;
  var scrollAccPx = null;    // مُراكِم كسري لموضع التمرير — منفصل عن scrollTop
                              // لأن المتصفح يقرّب scrollTop لأقرب بكسل صحيح،
                              // فتُفقَد أي زيادة أقل من ١px في كل إطار بدونه.
  var lastSetScrollTop = null; // آخر قيمة ضبطناها نحن — لتمييز تمرير المستخدم
                                // اليدوي (سحب/لمس) عن تمريرنا الذاتي في tick().

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
      scrollAccPx += speed * (dt / 16.667);
      el.scrollTop = Math.round(scrollAccPx);
      lastSetScrollTop = el.scrollTop; // حتى يميّز مستمع scroll هذا التغيير عن تمرير المستخدم
      // وصل للنهاية — أوقف
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
        _pause();
        syncUI();
        return;
      }
    }
    rafId = requestAnimationFrame(tick);
  }

  /* المستخدم لمس/سحب المحتوى أثناء التمرير — بدل تجاهله (وبالتالي "قفزه"
     رجّيعاً كل إطار) نُزامِن المُراكِم مع موضعه الجديد فيكمل التمرير من هناك،
     فيقدر المستخدم يسحب لأعلى/أسفل بحرّية دون أن يقاوم التمرير التلقائي حركته. */
  function onManualScroll() {
    if (!running) return;
    var el = getEl();
    if (!el) return;
    if (Math.abs(el.scrollTop - lastSetScrollTop) > 1) {
      scrollAccPx = el.scrollTop;
      lastSetScrollTop = el.scrollTop;
    }
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

  function setSpeed(value) {
    speed = Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round(value * 10) / 10));
    syncSpeed();
  }

  function faster() { setSpeed(speed + SPEED_NUDGE); }
  function slower() { setSpeed(speed - SPEED_NUDGE); }

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
    if (lbl) lbl.textContent = speedLabel(speed);
    var slider = document.getElementById('asSpeedSlider');
    if (slider && Math.abs(parseFloat(slider.value) - speed) > 0.01) slider.value = speed;
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
    var speedSlider = document.getElementById('asSpeedSlider');
    var closeBtn  = document.getElementById('asClose');
    var gazeBtn   = document.getElementById('asGaze');

    if (toggleBtn) toggleBtn.addEventListener('click', toggle);
    // 'input' يُطلَق باستمرار أثناء السحب — تحكّم حي بلا خطوات ثابتة
    if (speedSlider) speedSlider.addEventListener('input', function (e) {
      setSpeed(parseFloat(e.target.value));
    });
    if (closeBtn)  closeBtn.addEventListener('click', hideBar);

    // تمرير المستخدم اليدوي (سحب/لمس/عجلة) أثناء التشغيل يُزامَن بدل أن يُقاوَم
    var container = getEl();
    if (container) container.addEventListener('scroll', onManualScroll, { passive: true });

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
