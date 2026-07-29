package com.noor.islamicapp.floating;

import android.animation.ValueAnimator;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.Base64;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

import com.noor.islamicapp.MainActivity;
import com.noor.islamicapp.R;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * الخدمة المسؤولة عن رسم الزر العائم فوق التطبيقات الأخرى.
 *
 * تعمل كـ Foreground Service (النوع specialUse) حتى يبقى الزر ظاهراً حتى بعد
 * خروج المستخدم من التطبيق، ولا تفعل أي شيء من تلقاء نفسها: كل ما تعرضه يأتي
 * من {@link FloatingWidgetConfig} الذي يرسله كود الجافاسكريبت عبر
 * {@link FloatingWidgetPlugin}.
 */
public class FloatingWidgetService extends Service {

    private static final String TAG = "FloatingWidget";

    public static final String ACTION_SHOW = "com.noor.islamicapp.floating.SHOW";
    public static final String ACTION_UPDATE = "com.noor.islamicapp.floating.UPDATE";
    public static final String ACTION_HIDE = "com.noor.islamicapp.floating.HIDE";
    public static final String EXTRA_CONFIG = "config";

    public static final String EVENT_CLICK = "widgetClick";
    public static final String EVENT_LONG_PRESS = "widgetLongPress";
    public static final String EVENT_MOVE = "widgetMove";

    private static final String CHANNEL_ID = "noor_floating_widget";
    private static final int NOTIFICATION_ID = 8801;
    private static final String PREFS = "noor_floating_widget_prefs";
    private static final String PREF_LAST_CONFIG = "last_config";

    /** جسر الأحداث نحو الـ Plugin (ومنه إلى الجافاسكريبت). */
    public interface EventListener {
        void onWidgetEvent(String event, JSONObject data);
    }

    private static EventListener eventListener;
    private static volatile boolean running = false;

    public static void setEventListener(EventListener listener) {
        eventListener = listener;
    }

    public static boolean isRunning() {
        return running;
    }

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService ioExecutor = Executors.newSingleThreadExecutor();

    private WindowManager windowManager;
    private WindowManager.LayoutParams layoutParams;
    private LinearLayout rootView;
    private ImageView iconView;
    private TextView textView;
    private GradientDrawable background;

    private FloatingWidgetConfig config = new FloatingWidgetConfig();
    private String loadedIconRef = null;
    private boolean foregroundStarted = false;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;

        if (ACTION_HIDE.equals(action)) {
            removeOverlay();
            stopSelf();
            return START_NOT_STICKY;
        }

        JSONObject patch = null;
        if (intent != null && intent.hasExtra(EXTRA_CONFIG)) {
            patch = parseJson(intent.getStringExtra(EXTRA_CONFIG));
        } else if (action == null) {
            // أعاد النظام تشغيل الخدمة بعد قتلها — نستعيد آخر إعداد محفوظ
            patch = parseJson(getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PREF_LAST_CONFIG, null));
            if (patch == null) {
                stopSelf();
                return START_NOT_STICKY;
            }
        }

        config.applyFrom(patch);
        persistConfig();
        ensureForeground();
        showOrUpdateOverlay();

        running = true;
        return config.keepAliveInBackground ? START_STICKY : START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        removeOverlay();
        ioExecutor.shutdownNow();
        running = false;
        super.onDestroy();
    }

    // ==================== الإشعار الدائم (شرط الـ Foreground Service) ====================

    private void ensureForeground() {
        if (!config.keepAliveInBackground || foregroundStarted) {
            return;
        }
        createNotificationChannel();

        Intent openApp = new Intent(this, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, openApp, pendingFlags);

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(config.notificationTitle)
            .setContentText(config.notificationText)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(contentIntent)
            .build();

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
            ? ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            : 0;
        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type);
        foregroundStarted = true;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "الزر العائم",
            NotificationManager.IMPORTANCE_MIN
        );
        channel.setDescription("إشعار صامت مطلوب من نظام أندرويد لإبقاء الزر العائم يعمل");
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    // ==================== بناء وتحديث الطبقة العائمة ====================

    private void showOrUpdateOverlay() {
        if (rootView == null) {
            createOverlay();
        }
        applyConfig();
    }

    private void createOverlay() {
        windowManager = (WindowManager) getSystemService(Context.WINDOW_SERVICE);

        background = new GradientDrawable();

        iconView = new ImageView(this);
        iconView.setScaleType(ImageView.ScaleType.FIT_CENTER);

        textView = new TextView(this);
        textView.setSingleLine(true);

        rootView = new LinearLayout(this);
        rootView.setOrientation(LinearLayout.HORIZONTAL);
        rootView.setGravity(Gravity.CENTER);
        rootView.setBackground(background);
        rootView.addView(iconView, new LinearLayout.LayoutParams(0, 0));
        rootView.addView(textView, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ));
        rootView.setOnTouchListener(new DragTouchListener());

        // "50%" في borderRadius يحتاج المقاس الفعلي، لذلك نعيد الحساب بعد كل layout
        rootView.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> {
            if (r - l != or - ol || b - t != ob - ot) {
                applyCornerRadius(r - l, b - t);
            }
        });

        layoutParams = buildLayoutParams();
        try {
            windowManager.addView(rootView, layoutParams);
        } catch (Exception e) {
            // يحدث عندما تُسحب صلاحية العرض فوق التطبيقات أثناء التشغيل
            Log.e(TAG, "تعذّر إضافة الطبقة العائمة: " + e.getMessage());
            rootView = null;
            stopSelf();
        }
    }

    private WindowManager.LayoutParams buildLayoutParams() {
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;

        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = gravityForAnchor();
        params.x = dp(config.x);
        params.y = dp(config.y);
        return params;
    }

    private int gravityForAnchor() {
        switch (config.anchor) {
            case "top-right":
                return Gravity.TOP | Gravity.END;
            case "bottom-left":
                return Gravity.BOTTOM | Gravity.START;
            case "bottom-right":
                return Gravity.BOTTOM | Gravity.END;
            case "top-left":
            default:
                return Gravity.TOP | Gravity.START;
        }
    }

    private void applyConfig() {
        if (rootView == null) {
            return;
        }

        // ---- الخلفية والحدود ----
        background.setShape(GradientDrawable.RECTANGLE);
        background.setColor(FloatingWidgetConfig.parseColor(config.backgroundColor, 0xFF0F7B6C));
        if (config.borderWidth > 0 && config.borderColor != null) {
            background.setStroke(dp(config.borderWidth), FloatingWidgetConfig.parseColor(config.borderColor, 0xFFFFFFFF));
        } else {
            background.setStroke(0, 0);
        }
        applyCornerRadius(rootView.getWidth(), rootView.getHeight());

        // ---- الحشو والظل والشفافية ----
        rootView.setPadding(dp(config.paddingHorizontal), dp(config.paddingVertical),
            dp(config.paddingHorizontal), dp(config.paddingVertical));
        rootView.setElevation(dp(config.elevation));
        rootView.setAlpha(config.opacity);

        // ---- النص ----
        boolean hasText = config.text != null && !config.text.trim().isEmpty();
        textView.setVisibility(hasText ? View.VISIBLE : View.GONE);
        if (hasText) {
            textView.setText(config.text);
            textView.setTextColor(FloatingWidgetConfig.parseColor(config.textColor, 0xFFFFFFFF));
            textView.setTextSize(TypedValue.COMPLEX_UNIT_SP, config.textSize);
            textView.setTypeface(textView.getTypeface(), config.textBold ? android.graphics.Typeface.BOLD : android.graphics.Typeface.NORMAL);
        }

        // ---- الأيقونة ----
        boolean hasIcon = config.icon != null && !config.icon.trim().isEmpty();
        iconView.setVisibility(hasIcon ? View.VISIBLE : View.GONE);
        if (hasIcon) {
            LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(dp(config.iconSize), dp(config.iconSize));
            iconParams.setMarginEnd(hasText ? dp(config.gap) : 0);
            iconView.setLayoutParams(iconParams);
            loadIcon(config.icon);
        } else {
            loadedIconRef = null;
        }

        // ---- الحجم والمكان ----
        layoutParams.width = config.width == FloatingWidgetConfig.SIZE_WRAP
            ? WindowManager.LayoutParams.WRAP_CONTENT : dp(config.width);
        layoutParams.height = config.height == FloatingWidgetConfig.SIZE_WRAP
            ? WindowManager.LayoutParams.WRAP_CONTENT : dp(config.height);
        layoutParams.gravity = gravityForAnchor();
        layoutParams.x = dp(config.x);
        layoutParams.y = dp(config.y);

        safeUpdateLayout();
    }

    private void applyCornerRadius(int widthPx, int heightPx) {
        if (background == null) {
            return;
        }
        String radius = config.borderRadius == null ? "0" : config.borderRadius.trim();
        float radiusPx;
        if (radius.endsWith("%")) {
            float percent;
            try {
                percent = Float.parseFloat(radius.substring(0, radius.length() - 1));
            } catch (NumberFormatException e) {
                percent = 0f;
            }
            int smallestSide = Math.min(
                widthPx > 0 ? widthPx : dp(56),
                heightPx > 0 ? heightPx : dp(56)
            );
            radiusPx = smallestSide * (percent / 100f);
        } else {
            try {
                radiusPx = dp(Float.parseFloat(radius.replace("dp", "").replace("px", "")));
            } catch (NumberFormatException e) {
                radiusPx = 0f;
            }
        }
        background.setCornerRadius(radiusPx);
    }

    private void safeUpdateLayout() {
        if (windowManager == null || rootView == null || !rootView.isAttachedToWindow()) {
            return;
        }
        try {
            windowManager.updateViewLayout(rootView, layoutParams);
        } catch (Exception e) {
            Log.e(TAG, "تعذّر تحديث الطبقة العائمة: " + e.getMessage());
        }
    }

    private void removeOverlay() {
        if (windowManager != null && rootView != null) {
            try {
                windowManager.removeViewImmediate(rootView);
            } catch (Exception ignored) {
                // النافذة مُزالة أصلاً
            }
        }
        rootView = null;
        iconView = null;
        textView = null;
        loadedIconRef = null;
        running = false;
        if (foregroundStarted) {
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
            foregroundStarted = false;
        }
    }

    // ==================== تحميل الأيقونة ====================

    /**
     * يدعم ثلاث صيغ يرسلها الويب:
     *   1. data:image/png;base64,....   (Base64 مضمّن)
     *   2. https://example.com/icon.png (تحميل من الشبكة)
     *   3. icons/star.png               (ملف داخل أصول الويب — assets/public)
     */
    private void loadIcon(final String iconRef) {
        if (iconRef.equals(loadedIconRef)) {
            return;
        }
        loadedIconRef = iconRef;

        if (iconRef.startsWith("data:")) {
            int comma = iconRef.indexOf(',');
            if (comma < 0) {
                return;
            }
            try {
                byte[] bytes = Base64.decode(iconRef.substring(comma + 1), Base64.DEFAULT);
                setIconBitmap(BitmapFactory.decodeByteArray(bytes, 0, bytes.length), iconRef);
            } catch (Exception e) {
                Log.e(TAG, "فشل فك ترميز أيقونة Base64: " + e.getMessage());
            }
            return;
        }

        ioExecutor.execute(() -> {
            Bitmap bitmap = null;
            try {
                if (iconRef.startsWith("http://") || iconRef.startsWith("https://")) {
                    bitmap = downloadBitmap(iconRef);
                } else {
                    bitmap = readAssetBitmap(iconRef);
                }
            } catch (Exception e) {
                Log.e(TAG, "فشل تحميل الأيقونة " + iconRef + ": " + e.getMessage());
            }
            final Bitmap loaded = bitmap;
            if (loaded != null) {
                mainHandler.post(() -> setIconBitmap(loaded, iconRef));
            }
        });
    }

    private void setIconBitmap(Bitmap bitmap, String iconRef) {
        if (bitmap != null && iconView != null && iconRef.equals(loadedIconRef)) {
            iconView.setImageBitmap(bitmap);
        }
    }

    private Bitmap downloadBitmap(String url) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(15000);
        connection.setInstanceFollowRedirects(true);
        try (InputStream stream = connection.getInputStream()) {
            return BitmapFactory.decodeStream(stream);
        } finally {
            connection.disconnect();
        }
    }

    /** أصول الويب في Capacitor تُحزم تحت assets/public. */
    private Bitmap readAssetBitmap(String path) {
        String clean = path
            .replace("file:///android_asset/", "")
            .replace("https://localhost/", "")
            .replaceFirst("^/+", "");
        String[] candidates = { "public/" + clean, clean };
        for (String candidate : candidates) {
            try (InputStream stream = getAssets().open(candidate)) {
                return BitmapFactory.decodeStream(stream);
            } catch (IOException ignored) {
                // جرّب المسار التالي
            }
        }
        Log.e(TAG, "لم يُعثر على الأيقونة داخل الأصول: " + path);
        return null;
    }

    // ==================== السحب والنقر ====================

    private class DragTouchListener implements View.OnTouchListener {

        private int initialX;
        private int initialY;
        private float touchStartX;
        private float touchStartY;
        private long pressStartTime;
        private boolean dragging;
        private boolean longPressFired;

        private final Runnable longPressRunnable = () -> {
            if (!dragging) {
                longPressFired = true;
                emit(EVENT_LONG_PRESS, positionPayload());
            }
        };

        @Override
        public boolean onTouch(View view, MotionEvent event) {
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    initialX = layoutParams.x;
                    initialY = layoutParams.y;
                    touchStartX = event.getRawX();
                    touchStartY = event.getRawY();
                    pressStartTime = System.currentTimeMillis();
                    dragging = false;
                    longPressFired = false;
                    mainHandler.postDelayed(longPressRunnable, ViewConfiguration.getLongPressTimeout());
                    return true;

                case MotionEvent.ACTION_MOVE: {
                    float dx = event.getRawX() - touchStartX;
                    float dy = event.getRawY() - touchStartY;
                    int slop = ViewConfiguration.get(FloatingWidgetService.this).getScaledTouchSlop();
                    if (!dragging && Math.hypot(dx, dy) > slop) {
                        dragging = true;
                        mainHandler.removeCallbacks(longPressRunnable);
                    }
                    if (dragging && config.draggable) {
                        // إشارة الإزاحة تنعكس عندما يكون المرجع الحافة اليمنى/السفلية
                        int signX = config.anchor.endsWith("right") ? -1 : 1;
                        int signY = config.anchor.startsWith("bottom") ? -1 : 1;
                        layoutParams.x = initialX + (int) (dx * signX);
                        layoutParams.y = initialY + (int) (dy * signY);
                        safeUpdateLayout();
                    }
                    return true;
                }

                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    mainHandler.removeCallbacks(longPressRunnable);
                    boolean isTap = !dragging
                        && !longPressFired
                        && System.currentTimeMillis() - pressStartTime < ViewConfiguration.getLongPressTimeout();
                    if (isTap && event.getActionMasked() == MotionEvent.ACTION_UP) {
                        handleClick();
                    } else if (dragging && config.draggable) {
                        config.x = px2dp(layoutParams.x);
                        config.y = px2dp(layoutParams.y);
                        if (config.snapToEdge) {
                            snapToNearestEdge();
                        } else {
                            persistConfig();
                            emit(EVENT_MOVE, positionPayload());
                        }
                    }
                    return true;

                default:
                    return false;
            }
        }
    }

    private void snapToNearestEdge() {
        int screenWidth = getResources().getDisplayMetrics().widthPixels;
        int widgetWidth = rootView != null && rootView.getWidth() > 0 ? rootView.getWidth() : dp(56);
        boolean anchoredRight = config.anchor.endsWith("right");
        int startX = layoutParams.x;
        // layoutParams.x يُقاس من حافة الـ anchor، فنحوّله إلى إحداثي مطلق ثم نعود
        int absoluteLeft = anchoredRight ? screenWidth - startX - widgetWidth : startX;
        int targetAbsoluteLeft = absoluteLeft + widgetWidth / 2 < screenWidth / 2 ? 0 : screenWidth - widgetWidth;
        int targetX = anchoredRight ? screenWidth - targetAbsoluteLeft - widgetWidth : targetAbsoluteLeft;

        ValueAnimator animator = ValueAnimator.ofInt(startX, targetX);
        animator.setDuration(180);
        animator.addUpdateListener(animation -> {
            layoutParams.x = (int) animation.getAnimatedValue();
            safeUpdateLayout();
        });
        animator.addListener(new android.animation.AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(android.animation.Animator animation) {
                config.x = px2dp(layoutParams.x);
                persistConfig();
                emit(EVENT_MOVE, positionPayload());
            }
        });
        animator.start();
    }

    private void handleClick() {
        if (config.vibrateOnClick) {
            vibrate();
        }

        String action = config.clickAction == null ? "event" : config.clickAction.toLowerCase(Locale.US);
        if (action.contains("openurl") && config.clickUrl != null) {
            try {
                Intent view = new Intent(Intent.ACTION_VIEW, Uri.parse(config.clickUrl));
                view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(view);
            } catch (Exception e) {
                Log.e(TAG, "تعذّر فتح الرابط: " + e.getMessage());
            }
        }
        if (action.contains("openapp")) {
            Intent openApp = new Intent(this, MainActivity.class);
            openApp.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(openApp);
        }

        emit(EVENT_CLICK, positionPayload());
    }

    private void vibrate() {
        try {
            Vibrator vibrator;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager manager = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                vibrator = manager != null ? manager.getDefaultVibrator() : null;
            } else {
                vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (vibrator == null) {
                return;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(30, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                vibrator.vibrate(30);
            }
        } catch (Exception e) {
            Log.e(TAG, "تعذّر الاهتزاز: " + e.getMessage());
        }
    }

    // ==================== أدوات ====================

    private JSONObject positionPayload() {
        JSONObject data = new JSONObject();
        try {
            data.put("x", config.x);
            data.put("y", config.y);
            data.put("anchor", config.anchor);
            data.put("text", config.text);
            if (config.payload != null) {
                data.put("payload", config.payload);
            }
        } catch (JSONException ignored) {
        }
        return data;
    }

    private void emit(String event, JSONObject data) {
        EventListener listener = eventListener;
        if (listener != null) {
            listener.onWidgetEvent(event, data);
        }
    }

    private void persistConfig() {
        SharedPreferences.Editor editor = getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        editor.putString(PREF_LAST_CONFIG, config.toJson().toString());
        editor.apply();
    }

    private static JSONObject parseJson(String raw) {
        if (raw == null || raw.isEmpty()) {
            return null;
        }
        try {
            return new JSONObject(raw);
        } catch (JSONException e) {
            Log.e(TAG, "إعدادات غير صالحة: " + e.getMessage());
            return null;
        }
    }

    private int dp(float value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private int px2dp(int value) {
        return Math.round(value / getResources().getDisplayMetrics().density);
    }
}
