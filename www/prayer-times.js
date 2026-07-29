/* ============================================================================
 * PrayerCalc — حساب مواقيت الصلاة محلياً على الجهاز (دون إنترنت)
 * ============================================================================
 *
 * يحل محل api.aladhan.com. الحساب فلكي بحت من إحداثيات الموقع وتاريخ اليوم،
 * ولا يحتاج أي اتصال. معرّفات طرق الحساب هي نفسها التي كان يستعملها التطبيق
 * مع Aladhan، فتبقى إعدادات المستخدم المحفوظة صالحة كما هي.
 *
 * الخوارزمية قياسية (المستعملة في PrayTimes وأمثالها):
 *   1. نحسب اليوم اليولياني من التاريخ الميلادي.
 *   2. منه نستخرج ميل الشمس (declination) ومعادلة الزمن (equation of time).
 *   3. الظهر = لحظة عبور الشمس خط الزوال، مصحّحة بمعادلة الزمن وخط الطول.
 *   4. الفجر والعشاء زوايا انخفاض تحت الأفق، والشروق والمغرب عند الأفق مع
 *      تصحيح ارتفاع الراصد.
 *   5. العصر حين يصير ظل الشيء مثله (أو مثليه عند الحنفية) زيادةً على ظل الظهر.
 *
 * الدقة مقارنةً بـ Aladhan: فروق أقل من دقيقة في الأحوال العادية، لأن كليهما
 * يستعمل نفس النموذج الشمسي ونفس الزوايا.
 * ========================================================================== */

(function (global) {
  'use strict';

  var DEG = Math.PI / 180;

  function sin(d) { return Math.sin(d * DEG); }
  function cos(d) { return Math.cos(d * DEG); }
  function tan(d) { return Math.tan(d * DEG); }
  function arcsin(x) { return Math.asin(x) / DEG; }
  function arccos(x) { return Math.acos(x) / DEG; }
  function arccot(x) { return Math.atan(1 / x) / DEG; }

  function fixAngle(a) { return fixRange(a, 360); }
  function fixHour(a) { return fixRange(a, 24); }
  function fixRange(value, max) {
    var result = value - max * Math.floor(value / max);
    return result < 0 ? result + max : result;
  }

  /**
   * طرق الحساب — نفس معرّفات Aladhan حتى لا تتغيّر إعدادات المستخدم.
   * fajr / isha زوايا بالدرجات. ishaMinutes: دقائق بعد المغرب بدل الزاوية.
   * maghrib: زاوية انخفاض للمغرب (تستعملها الطريقة الجعفرية وطهران).
   */
  var METHODS = {
    0:  { name: 'جعفري — الشيعة الإثنا عشرية', fajr: 16,   maghrib: 4,   isha: 14 },
    1:  { name: 'جامعة العلوم الإسلامية — كراتشي', fajr: 18, isha: 18 },
    2:  { name: 'الجمعية الإسلامية لأمريكا الشمالية (ISNA)', fajr: 15, isha: 15 },
    3:  { name: 'رابطة العالم الإسلامي', fajr: 18, isha: 17 },
    4:  { name: 'أم القرى — مكة المكرمة', fajr: 18.5, ishaMinutes: 90 },
    5:  { name: 'الهيئة المصرية العامة للمساحة', fajr: 19.5, isha: 17.5 },
    7:  { name: 'طهران', fajr: 17.7, maghrib: 4.5, isha: 14 },
    8:  { name: 'مجلس الإفتاء الأوروبي', fajr: 12, isha: 12 },
    10: { name: 'دبي', fajr: 18.2, isha: 18.2 },
    15: { name: 'تركيا (ديانت)', fajr: 18, isha: 17 },
  };

  var DEFAULT_METHOD = 5;

  /** اليوم اليولياني من تاريخ ميلادي. */
  function julianDate(year, month, day) {
    if (month <= 2) {
      year -= 1;
      month += 12;
    }
    var a = Math.floor(year / 100);
    var b = 2 - a + Math.floor(a / 4);
    return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + b - 1524.5;
  }

  /** ميل الشمس ومعادلة الزمن ليوم يولياني. */
  function sunPosition(jd) {
    var d = jd - 2451545.0;
    var g = fixAngle(357.529 + 0.98560028 * d);      // الشذوذ الوسطي
    var q = fixAngle(280.459 + 0.98564736 * d);      // خط الطول الوسطي
    var l = fixAngle(q + 1.915 * sin(g) + 0.020 * sin(2 * g)); // خط الطول الظاهري

    var e = 23.439 - 0.00000036 * d;                 // ميل دائرة البروج
    var declination = arcsin(sin(e) * sin(l));
    var rightAscension = fixRange(arctan2(cos(e) * sin(l), cos(l)) / 15, 24);
    var equationOfTime = q / 15 - rightAscension;

    return { declination: declination, equationOfTime: equationOfTime };
  }

  function arctan2(y, x) {
    return Math.atan2(y, x) / DEG;
  }

  /** لحظة عبور الشمس خط الزوال (بالساعات، توقيت عالمي نسبي). */
  function midDay(jd, fractionOfDay) {
    var eqt = sunPosition(jd + fractionOfDay).equationOfTime;
    return fixHour(12 - eqt);
  }

  /** الفارق الزمني عن الظهر لزاوية انخفاض معيّنة تحت الأفق. */
  function sunAngleTime(jd, fractionOfDay, angle, latitude, afternoon) {
    var declination = sunPosition(jd + fractionOfDay).declination;
    var noon = midDay(jd, fractionOfDay);
    var ratio =
      (-sin(angle) - sin(declination) * sin(latitude)) /
      (cos(declination) * cos(latitude));

    // في خطوط العرض العالية قد لا تبلغ الشمس الزاوية أصلاً (شمس منتصف الليل)
    if (ratio > 1 || ratio < -1) {
      return null;
    }
    var offset = arccos(ratio) / 15;
    return noon + (afternoon ? offset : -offset);
  }

  /** وقت العصر: shadowFactor = 1 للجمهور، 2 للحنفية. */
  function asrTime(jd, fractionOfDay, shadowFactor, latitude) {
    var declination = sunPosition(jd + fractionOfDay).declination;
    var angle = -arccot(shadowFactor + tan(Math.abs(latitude - declination)));
    return sunAngleTime(jd, fractionOfDay, angle, latitude, true);
  }

  /** تصحيح ارتفاع الراصد عن سطح البحر على زاوية الأفق. */
  function horizonAngle(elevation) {
    return 0.833 + 0.0347 * Math.sqrt(Math.max(0, elevation || 0));
  }

  function hoursToTime(hours) {
    if (hours === null || !isFinite(hours)) {
      return null;
    }
    var total = Math.round(fixHour(hours) * 60);
    var h = Math.floor(total / 60) % 24;
    var m = total % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  var PrayerCalc = {
    METHODS: METHODS,

    /**
     * يحسب مواقيت يوم واحد.
     *
     * @param {object} options
     *   latitude, longitude  — بالدرجات
     *   date                 — كائن Date (افتراضياً اليوم)
     *   method               — معرّف طريقة الحساب (نفس معرّفات Aladhan)
     *   school               — 0 قياسي، 1 حنفي (لصلاة العصر)
     *   elevation            — الارتفاع بالأمتار (اختياري)
     *   timezone             — فرق التوقيت بالساعات (افتراضياً توقيت الجهاز)
     * @returns {object} { Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha } بصيغة "HH:MM"
     */
    calculate: function (options) {
      var latitude = Number(options.latitude);
      var longitude = Number(options.longitude);
      var date = options.date || new Date();
      var config = METHODS[options.method] || METHODS[DEFAULT_METHOD];
      var shadowFactor = String(options.school) === '1' ? 2 : 1;
      var elevation = options.elevation || 0;

      // فرق التوقيت المحلي لهذا اليوم تحديداً (يشمل التوقيت الصيفي تلقائياً)
      var timezone =
        options.timezone !== undefined
          ? Number(options.timezone)
          : -date.getTimezoneOffset() / 60;

      var jd = julianDate(date.getFullYear(), date.getMonth() + 1, date.getDate()) - longitude / (15 * 24);

      // تقديرات أولية ثم تكرار للوصول لقيم مستقرة (الشمس تتحرك خلال اليوم)
      var times = {
        fajr: 5 / 24,
        sunrise: 6 / 24,
        dhuhr: 12 / 24,
        asr: 13 / 24,
        maghrib: 18 / 24,
        isha: 19 / 24,
      };

      var horizon = horizonAngle(elevation);
      var raw = null;

      for (var pass = 0; pass < 3; pass++) {
        var fajr = sunAngleTime(jd, times.fajr, config.fajr, latitude, false);
        var sunrise = sunAngleTime(jd, times.sunrise, horizon, latitude, false);
        var dhuhr = midDay(jd, times.dhuhr);
        var asr = asrTime(jd, times.asr, shadowFactor, latitude);
        var maghrib = config.maghrib !== undefined
          ? sunAngleTime(jd, times.maghrib, config.maghrib, latitude, true)
          : sunAngleTime(jd, times.maghrib, horizon, latitude, true);
        var isha = config.ishaMinutes !== undefined
          ? (maghrib === null ? null : maghrib + config.ishaMinutes / 60)
          : sunAngleTime(jd, times.isha, config.isha, latitude, true);

        times = {
          fajr: fajr === null ? times.fajr : fajr / 24,
          sunrise: sunrise === null ? times.sunrise : sunrise / 24,
          dhuhr: dhuhr / 24,
          asr: asr === null ? times.asr : asr / 24,
          maghrib: maghrib === null ? times.maghrib : maghrib / 24,
          isha: isha === null ? times.isha : isha / 24,
        };
        raw = { fajr: fajr, sunrise: sunrise, dhuhr: dhuhr, asr: asr, maghrib: maghrib, isha: isha };
      }

      // تحويل الساعات الشمسية إلى التوقيت المحلي للمنطقة الزمنية
      var toLocal = function (hours) {
        return hours === null ? null : hours + timezone - longitude / 15;
      };

      return {
        Fajr: hoursToTime(toLocal(raw.fajr)),
        Sunrise: hoursToTime(toLocal(raw.sunrise)),
        Dhuhr: hoursToTime(toLocal(raw.dhuhr)),
        Asr: hoursToTime(toLocal(raw.asr)),
        Maghrib: hoursToTime(toLocal(raw.maghrib)),
        Isha: hoursToTime(toLocal(raw.isha)),
      };
    },

    /** التاريخ الهجري محلياً عبر Intl (أم القرى) — بلا إنترنت. */
    hijriDate: function (date) {
      var d = date || new Date();
      try {
        var parts = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }).formatToParts(d);
        var get = function (type) {
          var part = parts.find(function (p) { return p.type === type; });
          return part ? part.value : '';
        };
        return { day: get('day'), month: get('month'), year: get('year') };
      } catch (error) {
        return null;
      }
    },
  };

  global.PrayerCalc = PrayerCalc;
})(typeof window !== 'undefined' ? window : this);
