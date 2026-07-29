/* ============================================================================
 * FloatingWidget — واجهة الجافاسكريبت للزر العائم (System Overlay)
 * ============================================================================
 *
 * ملف ويب عادي: أي تعديل عليه يصل للمستخدمين عبر تحديث Capgo المباشر،
 * دون إعادة بناء الـ APK إطلاقاً (انظر live-updates.js).
 *
 * الاستعمال:
 *
 *   await FloatingWidget.requestPermission();      // مرة واحدة لكل جهاز
 *
 *   await FloatingWidget.show({
 *     text: "My Button",
 *     icon: "path/or/url",
 *     position: { x: 100, y: 200 },
 *     style: { backgroundColor: "#000", borderRadius: "50%" }
 *   });
 *
 *   FloatingWidget.onClick(() => console.log("تم النقر على الزر العائم"));
 *
 *   await FloatingWidget.update({ text: "نص جديد" });   // تحديث جزئي
 *   await FloatingWidget.hide();
 *
 * كل القياسات بوحدة dp (وليست بكسل) حتى يظهر الزر بنفس الحجم على كل الشاشات.
 * ========================================================================== */

(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1) الاتصال بالبلاجن الأصلي
  // ---------------------------------------------------------------------------
  var capacitor = global.Capacitor;
  var isNative = !!(capacitor && capacitor.isNativePlatform && capacitor.isNativePlatform());
  var native = null;

  if (isNative) {
    if (capacitor.registerPlugin) {
      native = capacitor.registerPlugin('FloatingWidget');
    } else if (capacitor.Plugins) {
      native = capacitor.Plugins.FloatingWidget;
    }
  }

  // ---------------------------------------------------------------------------
  // 2) الخيارات الافتراضية
  // ---------------------------------------------------------------------------
  var DEFAULTS = {
    text: null,
    icon: null,
    textColor: '#FFFFFF',
    textSize: 14,
    textBold: false,
    iconSize: 26,
    anchor: 'top-left',           // top-left | top-right | bottom-left | bottom-right
    x: 16,
    y: 200,
    width: 'wrap',                // رقم بالـ dp أو 'wrap'
    height: 'wrap',
    backgroundColor: '#0F7B6C',
    borderRadius: '50%',          // رقم dp أو '24px' أو '50%'
    borderColor: null,
    borderWidth: 0,
    paddingHorizontal: 16,
    paddingVertical: 16,
    opacity: 1,
    elevation: 8,
    gap: 8,
    draggable: true,              // قابل للسحب بالإصبع
    snapToEdge: false,            // يلتصق بأقرب حافة بعد السحب
    vibrateOnClick: false,
    clickAction: 'event',         // event | openApp | openUrl | eventAndOpenApp
    clickUrl: null,
    payload: null,                // بيانات حرة تعود إليك مع حدث النقر
    keepAliveInBackground: true,  // يبقى ظاهراً بعد الخروج من التطبيق
    notification: { title: 'نور', text: 'الزر العائم يعمل' }
  };

  var listeners = { widgetClick: [], widgetLongPress: [], widgetMove: [] };
  var nativeListenersBound = false;
  var lastOptions = null;

  function emit(event, data) {
    (listeners[event] || []).forEach(function (fn) {
      try {
        fn(data || {});
      } catch (e) {
        console.error('[FloatingWidget] خطأ داخل مستمع ' + event, e);
      }
    });
  }

  function bindNativeListeners() {
    if (!native || nativeListenersBound) {
      return;
    }
    nativeListenersBound = true;
    Object.keys(listeners).forEach(function (event) {
      native.addListener(event, function (data) {
        emit(event, data);
      });
    });
  }

  /**
   * يسطّح الخيارات المتداخلة (position/style) إلى الشكل الذي يفهمه الجانب الأصلي،
   * **دون** إضافة أي افتراضيات: النتيجة تحوي المفاتيح التي أرسلتها فقط.
   * هذا ما يجعل update() تحديثاً جزئياً حقيقياً — تغيير اللون وحده لا يعيد
   * ضبط الحواف أو النص إلى قيمها الافتراضية.
   */
  function flatten(options) {
    var input = options || {};
    var style = input.style || {};
    var position = input.position || {};
    var out = {};

    // المفاتيح المسطّحة كما هي
    Object.keys(input).forEach(function (key) {
      if (key !== 'style' && key !== 'position' && key !== 'onClick' && key !== 'autoRequestPermission') {
        out[key] = input[key];
      }
    });

    // position: { x, y, anchor }
    if (position.x !== undefined) out.x = position.x;
    if (position.y !== undefined) out.y = position.y;
    if (position.anchor !== undefined) out.anchor = position.anchor;

    // style: أسماء CSS مألوفة → أسماء الجانب الأصلي
    if (style.backgroundColor !== undefined) out.backgroundColor = style.backgroundColor;
    if (style.borderRadius !== undefined) out.borderRadius = String(style.borderRadius);
    if (style.color !== undefined) out.textColor = style.color;
    if (style.fontSize !== undefined) out.textSize = parseFloat(style.fontSize);
    if (style.fontWeight !== undefined) out.textBold = style.fontWeight === 'bold' || Number(style.fontWeight) >= 600;
    if (style.borderColor !== undefined) out.borderColor = style.borderColor;
    if (style.borderWidth !== undefined) out.borderWidth = parseFloat(style.borderWidth);
    if (style.opacity !== undefined) out.opacity = parseFloat(style.opacity);
    if (style.padding !== undefined) {
      out.paddingHorizontal = parseFloat(style.padding);
      out.paddingVertical = parseFloat(style.padding);
    }
    if (style.paddingHorizontal !== undefined) out.paddingHorizontal = parseFloat(style.paddingHorizontal);
    if (style.paddingVertical !== undefined) out.paddingVertical = parseFloat(style.paddingVertical);
    if (style.elevation !== undefined) out.elevation = parseFloat(style.elevation);
    if (style.gap !== undefined) out.gap = parseFloat(style.gap);

    return out;
  }

  /** خيارات كاملة (افتراضيات + ما أرسلته) — تُستعمل مع show(). */
  function normalize(options) {
    var merged = {};
    Object.keys(DEFAULTS).forEach(function (key) {
      merged[key] = DEFAULTS[key];
    });
    var flat = flatten(options);
    Object.keys(flat).forEach(function (key) {
      merged[key] = flat[key];
    });
    return merged;
  }

  // ---------------------------------------------------------------------------
  // 3) بديل المتصفح (Web fallback)
  //    يرسم زراً عائماً داخل الصفحة نفسها حتى تُجرّب الواجهة على الديسكتوب.
  //    طبعاً لا يستطيع الخروج خارج نافذة المتصفح — هذا حصري للتطبيق الأصلي.
  // ---------------------------------------------------------------------------
  var webFallback = {
    element: null,

    show: function (options) {
      this.hide();
      var element = document.createElement('button');
      element.type = 'button';
      element.id = 'noor-floating-widget';
      element.style.position = 'fixed';
      element.style.zIndex = '2147483000';
      element.style.border = 'none';
      element.style.cursor = 'pointer';
      element.style.display = 'flex';
      element.style.alignItems = 'center';
      element.style.gap = options.gap + 'px';
      element.addEventListener('click', function () {
        emit('widgetClick', { x: options.x, y: options.y, payload: options.payload });
      });
      document.body.appendChild(element);
      this.element = element;
      this.update(options);
      return element;
    },

    update: function (options) {
      var element = this.element;
      if (!element) {
        return;
      }
      element.style.backgroundColor = options.backgroundColor;
      element.style.color = options.textColor;
      element.style.fontSize = options.textSize + 'px';
      element.style.fontWeight = options.textBold ? '700' : '400';
      element.style.opacity = options.opacity;
      element.style.padding = options.paddingVertical + 'px ' + options.paddingHorizontal + 'px';
      element.style.boxShadow = '0 ' + options.elevation + 'px ' + options.elevation * 2 + 'px rgba(0,0,0,.35)';
      element.style.borderRadius = /%|px$/.test(String(options.borderRadius))
        ? options.borderRadius
        : options.borderRadius + 'px';
      element.style.width = options.width === 'wrap' ? 'auto' : options.width + 'px';
      element.style.height = options.height === 'wrap' ? 'auto' : options.height + 'px';
      if (options.borderWidth) {
        element.style.border = options.borderWidth + 'px solid ' + (options.borderColor || 'transparent');
      }

      element.style.top = element.style.bottom = element.style.left = element.style.right = 'auto';
      element.style[options.anchor.indexOf('bottom') === 0 ? 'bottom' : 'top'] = options.y + 'px';
      element.style[options.anchor.indexOf('right') > -1 ? 'right' : 'left'] = options.x + 'px';

      element.innerHTML = '';
      if (options.icon) {
        var img = document.createElement('img');
        img.src = options.icon;
        img.width = options.iconSize;
        img.height = options.iconSize;
        img.style.objectFit = 'contain';
        element.appendChild(img);
      }
      if (options.text) {
        element.appendChild(document.createTextNode(options.text));
      }
    },

    hide: function () {
      if (this.element && this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
      this.element = null;
    }
  };

  // ---------------------------------------------------------------------------
  // 4) الواجهة العامة
  // ---------------------------------------------------------------------------
  var FloatingWidget = {
    /** true إذا كنّا داخل الغلاف الأصلي والبلاجن مُسجَّل. */
    isSupported: function () {
      return !!native;
    },

    /** هل مُنحت صلاحية SYSTEM_ALERT_WINDOW؟ → { granted } */
    checkPermission: function () {
      if (!native) {
        return Promise.resolve({ granted: true, web: true });
      }
      return native.checkPermission();
    },

    /** يفتح شاشة إعدادات النظام لمنح الصلاحية → { granted } */
    requestPermission: function () {
      if (!native) {
        return Promise.resolve({ granted: true, web: true });
      }
      return native.requestPermission();
    },

    /**
     * يعرض الزر العائم.
     * @param {object} options انظر DEFAULTS أعلاه — يقبل الشكل المسطّح أو
     *        المتداخل { position: {x,y}, style: {...} }.
     * @param {boolean} [options.autoRequestPermission=true] يطلب الصلاحية تلقائياً إن كانت ناقصة.
     * @param {function} [options.onClick] اختصار لتسجيل مستمع النقر.
     */
    show: function (options) {
      var normalized = normalize(options);
      lastOptions = normalized;

      if (options && typeof options.onClick === 'function') {
        this.onClick(options.onClick);
      }

      if (!native) {
        webFallback.show(normalized);
        return Promise.resolve({ visible: true, web: true });
      }

      bindNativeListeners();

      var autoRequest = !options || options.autoRequestPermission !== false;
      return native.checkPermission().then(function (status) {
        if (status && status.granted) {
          return native.show(normalized);
        }
        if (!autoRequest) {
          return Promise.reject(new Error('PERMISSION_DENIED'));
        }
        return native.requestPermission().then(function (result) {
          if (!result || !result.granted) {
            return Promise.reject(new Error('PERMISSION_DENIED'));
          }
          return native.show(normalized);
        });
      });
    },

    /** تحديث جزئي — أرسل المفاتيح التي تريد تغييرها فقط. */
    update: function (options) {
      var patch = flatten(options);
      if (!native) {
        lastOptions = Object.assign({}, lastOptions || DEFAULTS, patch);
        webFallback.update(lastOptions);
        return Promise.resolve({ visible: true, web: true });
      }
      return native.update(patch);
    },

    /** اختصار لتغيير المكان: setPosition({ x, y, anchor }) */
    setPosition: function (position) {
      return this.update({ position: position || {} });
    },

    hide: function () {
      if (!native) {
        webFallback.hide();
        return Promise.resolve();
      }
      return native.hide();
    },

    isVisible: function () {
      if (!native) {
        return Promise.resolve({ visible: !!webFallback.element });
      }
      return native.isVisible();
    },

    /** يسجّل مستمعاً للنقر على الزر. يعيد دالة لإلغاء التسجيل. */
    onClick: function (handler) {
      return this.on('widgetClick', handler);
    },

    /** الأحداث المتاحة: widgetClick | widgetLongPress | widgetMove */
    on: function (event, handler) {
      if (!listeners[event]) {
        listeners[event] = [];
      }
      listeners[event].push(handler);
      bindNativeListeners();
      return function off() {
        var index = listeners[event].indexOf(handler);
        if (index > -1) {
          listeners[event].splice(index, 1);
        }
      };
    },

    /** الإعدادات الافتراضية — للاطلاع أو التعديل قبل أول show(). */
    defaults: DEFAULTS
  };

  global.FloatingWidget = FloatingWidget;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FloatingWidget;
  }
})(typeof window !== 'undefined' ? window : this);
