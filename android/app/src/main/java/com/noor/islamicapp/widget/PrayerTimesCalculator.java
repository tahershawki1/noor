package com.noor.islamicapp.widget;

import java.util.Calendar;
import java.util.HashMap;
import java.util.Map;
import java.util.TimeZone;

/**
 * حساب مواقيت الصلاة محلياً على الجهاز — نسخة جافا مطابقة لـ islamic-app/prayer-times.js
 *
 * سبب وجود نسخة جافا: ودجت الشاشة الرئيسية يعمل والتطبيق مغلق تماماً، فلا
 * WebView ولا جافاسكريبت. لذلك يحتاج الودجت أن يحسب المواقيت بنفسه من إحداثيات
 * الموقع، وأن يستطيع حساب فجر الغد بعد انتهاء عشاء اليوم.
 *
 * الخوارزمية والزوايا ومعرّفات الطرق مطابقة حرفياً لنسخة الجافاسكريبت، حتى لا
 * تختلف الأوقات بين شاشة التطبيق والودجت ولو بدقيقة واحدة. أي تعديل هنا يجب أن
 * ينعكس هناك والعكس.
 */
public final class PrayerTimesCalculator {

    /** ترتيب المواقيت الستة كما يعرضها التطبيق. */
    public static final String[] ALL = { "Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha" };

    /** الصلوات الخمس فقط — الشروق ليس صلاة فلا يُحسب ضمن "الصلاة القادمة". */
    public static final String[] MAIN = { "Fajr", "Dhuhr", "Asr", "Maghrib", "Isha" };

    /** قيمة تعني "الوقت غير معرَّف في هذا الموقع" (شمس منتصف الليل مثلاً). */
    public static final int UNDEFINED = -1;

    public static final int DEFAULT_METHOD = 5;

    private static final double DEG = Math.PI / 180.0;

    private PrayerTimesCalculator() {
    }

    // ==================== طرق الحساب ====================

    /**
     * طريقة حساب: زوايا الانخفاض تحت الأفق.
     * maghrib غير معرَّفة إلا في الطرق التي تستعمل زاوية للمغرب (الجعفرية وطهران).
     * ishaMinutes بديل عن زاوية العشاء: دقائق ثابتة بعد المغرب (أم القرى).
     */
    private static final class Method {
        final double fajr;
        final Double maghrib;
        final Double isha;
        final Integer ishaMinutes;

        Method(double fajr, Double maghrib, Double isha, Integer ishaMinutes) {
            this.fajr = fajr;
            this.maghrib = maghrib;
            this.isha = isha;
            this.ishaMinutes = ishaMinutes;
        }
    }

    private static final Map<Integer, Method> METHODS = new HashMap<>();

    static {
        METHODS.put(0, new Method(16.0, 4.0, 14.0, null));      // جعفري
        METHODS.put(1, new Method(18.0, null, 18.0, null));     // كراتشي
        METHODS.put(2, new Method(15.0, null, 15.0, null));     // ISNA
        METHODS.put(3, new Method(18.0, null, 17.0, null));     // رابطة العالم الإسلامي
        METHODS.put(4, new Method(18.5, null, null, 90));       // أم القرى
        METHODS.put(5, new Method(19.5, null, 17.5, null));     // الهيئة المصرية
        METHODS.put(7, new Method(17.7, 4.5, 14.0, null));      // طهران
        METHODS.put(8, new Method(12.0, null, 12.0, null));     // مجلس الإفتاء الأوروبي
        METHODS.put(10, new Method(18.2, null, 18.2, null));    // دبي
        METHODS.put(15, new Method(18.0, null, 17.0, null));    // تركيا (ديانت)
    }

    // ==================== الواجهة العامة ====================

    /**
     * يحسب مواقيت يوم واحد.
     *
     * @param latitude  خط العرض بالدرجات
     * @param longitude خط الطول بالدرجات
     * @param methodId  معرّف طريقة الحساب (نفس معرّفات التطبيق)
     * @param school    0 قياسي، 1 حنفي (لصلاة العصر)
     * @param elevation ارتفاع الراصد بالأمتار
     * @param day       اليوم المطلوب (تُستعمل منه السنة/الشهر/اليوم والمنطقة الزمنية)
     * @return مصفوفة من ست قيم بترتيب {@link #ALL}، كل قيمة عدد الدقائق منذ
     *         منتصف الليل المحلي، أو {@link #UNDEFINED} إن تعذّر الحساب.
     */
    public static int[] calculate(
        double latitude,
        double longitude,
        int methodId,
        int school,
        double elevation,
        Calendar day
    ) {
        Method config = METHODS.containsKey(methodId) ? METHODS.get(methodId) : METHODS.get(DEFAULT_METHOD);
        double shadowFactor = school == 1 ? 2.0 : 1.0;

        // فرق التوقيت لهذا اليوم تحديداً — يشمل التوقيت الصيفي تلقائياً
        TimeZone zone = day.getTimeZone();
        double timezone = zone.getOffset(day.getTimeInMillis()) / 3600000.0;

        double jd = julianDate(
            day.get(Calendar.YEAR),
            day.get(Calendar.MONTH) + 1,
            day.get(Calendar.DAY_OF_MONTH)
        ) - longitude / (15.0 * 24.0);

        // تقديرات أولية ثم تكرار للوصول لقيم مستقرة (الشمس تتحرك خلال اليوم)
        double fFajr = 5.0 / 24.0;
        double fSunrise = 6.0 / 24.0;
        double fDhuhr = 12.0 / 24.0;
        double fAsr = 13.0 / 24.0;
        double fMaghrib = 18.0 / 24.0;
        double fIsha = 19.0 / 24.0;

        double horizon = horizonAngle(elevation);

        Double fajr = null, sunrise = null, dhuhr = null, asr = null, maghrib = null, isha = null;

        for (int pass = 0; pass < 3; pass++) {
            fajr = sunAngleTime(jd, fFajr, config.fajr, latitude, false);
            sunrise = sunAngleTime(jd, fSunrise, horizon, latitude, false);
            dhuhr = midDay(jd, fDhuhr);
            asr = asrTime(jd, fAsr, shadowFactor, latitude);
            maghrib = config.maghrib != null
                ? sunAngleTime(jd, fMaghrib, config.maghrib, latitude, true)
                : sunAngleTime(jd, fMaghrib, horizon, latitude, true);
            isha = config.ishaMinutes != null
                ? (maghrib == null ? null : maghrib + config.ishaMinutes / 60.0)
                : sunAngleTime(jd, fIsha, config.isha, latitude, true);

            if (fajr != null) fFajr = fajr / 24.0;
            if (sunrise != null) fSunrise = sunrise / 24.0;
            fDhuhr = dhuhr / 24.0;
            if (asr != null) fAsr = asr / 24.0;
            if (maghrib != null) fMaghrib = maghrib / 24.0;
            if (isha != null) fIsha = isha / 24.0;
        }

        double shift = timezone - longitude / 15.0;
        return new int[] {
            toMinutes(fajr, shift),
            toMinutes(sunrise, shift),
            toMinutes(dhuhr, shift),
            toMinutes(asr, shift),
            toMinutes(maghrib, shift),
            toMinutes(isha, shift),
        };
    }

    /** موضع الاسم في مصفوفة {@link #ALL}، أو -1 إن لم يوجد. */
    public static int indexOf(String name) {
        for (int i = 0; i < ALL.length; i++) {
            if (ALL[i].equals(name)) {
                return i;
            }
        }
        return -1;
    }

    // ==================== الحساب الفلكي ====================

    /** اليوم اليولياني من تاريخ ميلادي. */
    private static double julianDate(int year, int month, int day) {
        if (month <= 2) {
            year -= 1;
            month += 12;
        }
        int a = (int) Math.floor(year / 100.0);
        int b = 2 - a + (int) Math.floor(a / 4.0);
        return Math.floor(365.25 * (year + 4716))
            + Math.floor(30.6001 * (month + 1))
            + day + b - 1524.5;
    }

    /** ميل الشمس (declination) بالدرجات. */
    private static double declination(double jd) {
        double d = jd - 2451545.0;
        double g = fixAngle(357.529 + 0.98560028 * d);
        double q = fixAngle(280.459 + 0.98564736 * d);
        double l = fixAngle(q + 1.915 * sin(g) + 0.020 * sin(2 * g));
        double e = 23.439 - 0.00000036 * d;
        return arcsin(sin(e) * sin(l));
    }

    /** معادلة الزمن بالساعات. */
    private static double equationOfTime(double jd) {
        double d = jd - 2451545.0;
        double g = fixAngle(357.529 + 0.98560028 * d);
        double q = fixAngle(280.459 + 0.98564736 * d);
        double l = fixAngle(q + 1.915 * sin(g) + 0.020 * sin(2 * g));
        double e = 23.439 - 0.00000036 * d;
        double rightAscension = fixRange(arctan2(cos(e) * sin(l), cos(l)) / 15.0, 24.0);
        return q / 15.0 - rightAscension;
    }

    /** لحظة عبور الشمس خط الزوال (بالساعات). */
    private static double midDay(double jd, double fractionOfDay) {
        return fixHour(12.0 - equationOfTime(jd + fractionOfDay));
    }

    /** الفارق الزمني عن الظهر لزاوية انخفاض معيّنة تحت الأفق. */
    private static Double sunAngleTime(double jd, double fractionOfDay, double angle, double latitude, boolean afternoon) {
        double decl = declination(jd + fractionOfDay);
        double noon = midDay(jd, fractionOfDay);
        double ratio = (-sin(angle) - sin(decl) * sin(latitude)) / (cos(decl) * cos(latitude));

        // في خطوط العرض العالية قد لا تبلغ الشمس الزاوية أصلاً (شمس منتصف الليل)
        if (ratio > 1 || ratio < -1) {
            return null;
        }
        double offset = arccos(ratio) / 15.0;
        return noon + (afternoon ? offset : -offset);
    }

    /** وقت العصر: shadowFactor = 1 للجمهور، 2 للحنفية. */
    private static Double asrTime(double jd, double fractionOfDay, double shadowFactor, double latitude) {
        double decl = declination(jd + fractionOfDay);
        double angle = -arccot(shadowFactor + tan(Math.abs(latitude - decl)));
        return sunAngleTime(jd, fractionOfDay, angle, latitude, true);
    }

    /** تصحيح ارتفاع الراصد عن سطح البحر على زاوية الأفق. */
    private static double horizonAngle(double elevation) {
        return 0.833 + 0.0347 * Math.sqrt(Math.max(0, elevation));
    }

    /** يحوّل الساعات الشمسية إلى عدد دقائق منذ منتصف الليل المحلي. */
    private static int toMinutes(Double hours, double shift) {
        if (hours == null || Double.isNaN(hours) || Double.isInfinite(hours)) {
            return UNDEFINED;
        }
        long total = Math.round(fixHour(hours + shift) * 60.0);
        return (int) (((total % 1440) + 1440) % 1440);
    }

    // ==================== دوال مثلثية بالدرجات ====================

    private static double sin(double d) { return Math.sin(d * DEG); }
    private static double cos(double d) { return Math.cos(d * DEG); }
    private static double tan(double d) { return Math.tan(d * DEG); }
    private static double arcsin(double x) { return Math.asin(x) / DEG; }
    private static double arccos(double x) { return Math.acos(x) / DEG; }
    private static double arccot(double x) { return Math.atan(1.0 / x) / DEG; }
    private static double arctan2(double y, double x) { return Math.atan2(y, x) / DEG; }

    private static double fixAngle(double a) { return fixRange(a, 360.0); }
    private static double fixHour(double a) { return fixRange(a, 24.0); }

    private static double fixRange(double value, double max) {
        double result = value - max * Math.floor(value / max);
        return result < 0 ? result + max : result;
    }
}
