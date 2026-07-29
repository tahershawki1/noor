package com.noor.islamicapp.floating;

import android.graphics.Color;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Locale;

/**
 * نموذج إعدادات الزر العائم.
 *
 * كل خاصية هنا يتحكم بها كود الجافاسكريبت مباشرة — الشكل، اللون، النص،
 * المكان، والأكشن عند النقر. الكائن يُمرَّر بين الـ Plugin والـ Service على
 * هيئة JSON، ويدعم "التحديث الجزئي": أي مفتاح غير موجود في الـ patch يبقى
 * على قيمته الحالية، لذلك يستطيع الويب تغيير لون الزر مثلاً دون إعادة إرسال
 * بقية الإعدادات.
 *
 * كل القياسات (x, y, width, height, iconSize, padding, borderWidth) بوحدة dp
 * وليست بكسل، حتى يظهر الزر بنفس الحجم على جميع كثافات الشاشات.
 */
public class FloatingWidgetConfig {

    /** قيمة تعني "احسب الحجم من المحتوى" (WRAP_CONTENT). */
    public static final int SIZE_WRAP = -2;

    // ------- المحتوى -------
    public String text = null;
    public String icon = null;

    // ------- النص -------
    public String textColor = "#FFFFFF";
    public float textSize = 14f;          // sp
    public boolean textBold = false;

    // ------- الأيقونة -------
    public int iconSize = 26;             // dp

    // ------- المكان -------
    /** top-left | top-right | bottom-left | bottom-right */
    public String anchor = "top-left";
    public int x = 16;                    // dp من حافة الـ anchor الأفقية
    public int y = 200;                   // dp من حافة الـ anchor الرأسية

    // ------- الحجم -------
    public int width = SIZE_WRAP;         // dp أو SIZE_WRAP
    public int height = SIZE_WRAP;        // dp أو SIZE_WRAP

    // ------- الستايل -------
    public String backgroundColor = "#0F7B6C";
    /** رقم (dp) أو "24px" أو "50%" — النسبة تُحسب من أصغر بُعد للزر. */
    public String borderRadius = "50%";
    public String borderColor = null;
    public int borderWidth = 0;           // dp
    public int paddingHorizontal = 16;    // dp
    public int paddingVertical = 16;      // dp
    public float opacity = 1f;            // 0..1
    public int elevation = 8;             // dp
    public int gap = 8;                   // dp بين الأيقونة والنص

    // ------- السلوك -------
    public boolean draggable = true;
    public boolean snapToEdge = false;
    public boolean vibrateOnClick = false;
    /** event | openApp | openUrl | eventAndOpenApp */
    public String clickAction = "event";
    public String clickUrl = null;
    /** أي بيانات حرة يرسلها الويب وتعود إليه مع حدث النقر. */
    public JSONObject payload = null;

    // ------- دورة الحياة -------
    public boolean keepAliveInBackground = true;
    public boolean hideWhenAppInForeground = false;
    public String notificationTitle = "نور";
    public String notificationText = "الزر العائم يعمل";

    /**
     * يطبّق patch جزئي: المفاتيح الموجودة فقط هي التي تُكتب فوق القيم الحالية.
     * يقبل أيضاً الشكل المتداخل الذي يستعمله الـ JS SDK:
     * { position: { x, y }, style: { backgroundColor, borderRadius, ... } }
     */
    public void applyFrom(JSONObject patch) {
        if (patch == null) {
            return;
        }

        JSONObject position = patch.optJSONObject("position");
        JSONObject style = patch.optJSONObject("style");
        JSONObject notification = patch.optJSONObject("notification");

        text = optString(patch, "text", text);
        icon = optString(patch, "icon", icon);

        textColor = optString(style, "color", optString(patch, "textColor", textColor));
        textSize = (float) optDouble(style, "fontSize", optDouble(patch, "textSize", textSize));
        textBold = optBoolean(patch, "textBold", textBold);

        iconSize = optInt(patch, "iconSize", iconSize);

        anchor = normalizeAnchor(optString(position, "anchor", optString(patch, "anchor", anchor)));
        x = optInt(position, "x", optInt(patch, "x", x));
        y = optInt(position, "y", optInt(patch, "y", y));

        width = optSize(patch, "width", width);
        height = optSize(patch, "height", height);

        backgroundColor = optString(style, "backgroundColor", optString(patch, "backgroundColor", backgroundColor));
        borderRadius = optString(style, "borderRadius", optString(patch, "borderRadius", borderRadius));
        borderColor = optString(style, "borderColor", optString(patch, "borderColor", borderColor));
        borderWidth = optInt(style, "borderWidth", optInt(patch, "borderWidth", borderWidth));
        paddingHorizontal = optInt(style, "paddingHorizontal", optInt(patch, "paddingHorizontal", paddingHorizontal));
        paddingVertical = optInt(style, "paddingVertical", optInt(patch, "paddingVertical", paddingVertical));
        opacity = (float) optDouble(style, "opacity", optDouble(patch, "opacity", opacity));
        elevation = optInt(style, "elevation", optInt(patch, "elevation", elevation));
        gap = optInt(style, "gap", optInt(patch, "gap", gap));

        draggable = optBoolean(patch, "draggable", draggable);
        snapToEdge = optBoolean(patch, "snapToEdge", snapToEdge);
        vibrateOnClick = optBoolean(patch, "vibrateOnClick", vibrateOnClick);
        clickAction = optString(patch, "clickAction", clickAction);
        clickUrl = optString(patch, "clickUrl", clickUrl);
        if (patch.has("payload")) {
            payload = patch.optJSONObject("payload");
        }

        keepAliveInBackground = optBoolean(patch, "keepAliveInBackground", keepAliveInBackground);
        hideWhenAppInForeground = optBoolean(patch, "hideWhenAppInForeground", hideWhenAppInForeground);
        notificationTitle = optString(notification, "title", optString(patch, "notificationTitle", notificationTitle));
        notificationText = optString(notification, "text", optString(patch, "notificationText", notificationText));

        // حراسة القيم خارج المدى
        if (opacity < 0f) opacity = 0f;
        if (opacity > 1f) opacity = 1f;
        if (textSize < 1f) textSize = 1f;
        if (iconSize < 0) iconSize = 0;
    }

    public JSONObject toJson() {
        JSONObject json = new JSONObject();
        try {
            json.put("text", text);
            json.put("icon", icon);
            json.put("textColor", textColor);
            json.put("textSize", textSize);
            json.put("textBold", textBold);
            json.put("iconSize", iconSize);
            json.put("anchor", anchor);
            json.put("x", x);
            json.put("y", y);
            json.put("width", width);
            json.put("height", height);
            json.put("backgroundColor", backgroundColor);
            json.put("borderRadius", borderRadius);
            json.put("borderColor", borderColor);
            json.put("borderWidth", borderWidth);
            json.put("paddingHorizontal", paddingHorizontal);
            json.put("paddingVertical", paddingVertical);
            json.put("opacity", opacity);
            json.put("elevation", elevation);
            json.put("gap", gap);
            json.put("draggable", draggable);
            json.put("snapToEdge", snapToEdge);
            json.put("vibrateOnClick", vibrateOnClick);
            json.put("clickAction", clickAction);
            json.put("clickUrl", clickUrl);
            json.put("payload", payload);
            json.put("keepAliveInBackground", keepAliveInBackground);
            json.put("hideWhenAppInForeground", hideWhenAppInForeground);
            json.put("notificationTitle", notificationTitle);
            json.put("notificationText", notificationText);
        } catch (JSONException ignored) {
            // مفاتيح ثابتة — لا يمكن أن ترمي عملياً
        }
        return json;
    }

    public static FloatingWidgetConfig fromJson(JSONObject json) {
        FloatingWidgetConfig config = new FloatingWidgetConfig();
        config.applyFrom(json);
        return config;
    }

    // ==================== أدوات مساعدة ====================

    private static String normalizeAnchor(String value) {
        if (value == null) {
            return "top-left";
        }
        String normalized = value.trim().toLowerCase(Locale.US).replace('_', '-');
        switch (normalized) {
            case "top-left":
            case "top-right":
            case "bottom-left":
            case "bottom-right":
                return normalized;
            case "topleft":
                return "top-left";
            case "topright":
                return "top-right";
            case "bottomleft":
                return "bottom-left";
            case "bottomright":
                return "bottom-right";
            default:
                return "top-left";
        }
    }

    private static String optString(JSONObject source, String key, String fallback) {
        if (source == null || !source.has(key)) {
            return fallback;
        }
        if (source.isNull(key)) {
            return null;
        }
        return source.optString(key, fallback);
    }

    private static int optInt(JSONObject source, String key, int fallback) {
        if (source == null || !source.has(key) || source.isNull(key)) {
            return fallback;
        }
        return source.optInt(key, fallback);
    }

    private static double optDouble(JSONObject source, String key, double fallback) {
        if (source == null || !source.has(key) || source.isNull(key)) {
            return fallback;
        }
        return source.optDouble(key, fallback);
    }

    private static boolean optBoolean(JSONObject source, String key, boolean fallback) {
        if (source == null || !source.has(key) || source.isNull(key)) {
            return fallback;
        }
        return source.optBoolean(key, fallback);
    }

    /** يقبل رقماً بالـ dp أو النص "wrap"/"auto" الذي يعني WRAP_CONTENT. */
    private static int optSize(JSONObject source, String key, int fallback) {
        if (source == null || !source.has(key) || source.isNull(key)) {
            return fallback;
        }
        Object raw = source.opt(key);
        if (raw instanceof Number) {
            return ((Number) raw).intValue();
        }
        String value = String.valueOf(raw).trim().toLowerCase(Locale.US);
        if (value.isEmpty() || value.equals("wrap") || value.equals("auto") || value.equals("wrap_content")) {
            return SIZE_WRAP;
        }
        try {
            return (int) Float.parseFloat(value.replace("dp", "").replace("px", ""));
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    /**
     * محلّل ألوان متسامح مع صيغ الويب: ‎#RGB و ‎#RRGGBB و ‎#AARRGGBB
     * و ‎rgb(r,g,b) و ‎rgba(r,g,b,a) وأسماء الألوان القياسية.
     */
    public static int parseColor(String value, int fallback) {
        if (value == null) {
            return fallback;
        }
        String color = value.trim();
        if (color.isEmpty()) {
            return fallback;
        }
        try {
            if (color.toLowerCase(Locale.US).startsWith("rgb")) {
                String body = color.substring(color.indexOf('(') + 1, color.lastIndexOf(')'));
                String[] parts = body.split(",");
                int r = (int) Float.parseFloat(parts[0].trim());
                int g = (int) Float.parseFloat(parts[1].trim());
                int b = (int) Float.parseFloat(parts[2].trim());
                int a = parts.length > 3 ? Math.round(Float.parseFloat(parts[3].trim()) * 255f) : 255;
                return Color.argb(clamp(a), clamp(r), clamp(g), clamp(b));
            }
            if (color.startsWith("#") && color.length() == 4) {
                // ‎#RGB → ‎#RRGGBB
                char r = color.charAt(1), g = color.charAt(2), b = color.charAt(3);
                color = "#" + r + r + g + g + b + b;
            }
            return Color.parseColor(color);
        } catch (Exception e) {
            return fallback;
        }
    }

    private static int clamp(int value) {
        return Math.max(0, Math.min(255, value));
    }
}
