package com.noor.islamicapp.floating;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * الجسر بين الجافاسكريبت والزر العائم (System Overlay).
 *
 * كل شيء في الزر — النص، الأيقونة، اللون، الحواف، المكان، وسلوك النقر —
 * يُرسَل من كود الويب، لذلك يمكن تغيير الميزة بالكامل بتحديث ويب فقط دون
 * إعادة بناء الـ APK.
 *
 * الاستدعاء من الويب:
 *   const FloatingWidget = Capacitor.registerPlugin('FloatingWidget');
 *   await FloatingWidget.show({ text: 'ذِكر', style: { backgroundColor: '#0F7B6C' } });
 *
 * أو عبر الـ SDK الجاهز في www/floating-widget.js:
 *   FloatingWidget.show({ text: 'My Button', position: { x: 100, y: 200 } });
 */
@CapacitorPlugin(name = "FloatingWidget")
public class FloatingWidgetPlugin extends Plugin {

    private static final String ERR_NO_PERMISSION = "PERMISSION_DENIED";

    @Override
    public void load() {
        // كل حدث يخرج من الطبقة العائمة يُمرَّر إلى مستمعي الجافاسكريبت.
        // العلم الأخير (true) يحتفظ بالحدث حتى يُستهلك، حتى لا يضيع النقر إن
        // وصل قبل أن يسجّل الويب مستمعه (مثلاً بعد إعادة تحميل الصفحة).
        FloatingWidgetService.setEventListener((event, data) -> {
            try {
                notifyListeners(event, JSObject.fromJSONObject(data), true);
            } catch (JSONException e) {
                notifyListeners(event, new JSObject(), true);
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        FloatingWidgetService.setEventListener(null);
        super.handleOnDestroy();
    }

    // ==================== الصلاحية ====================

    /** هل مُنحت صلاحية "العرض فوق التطبيقات الأخرى"؟ */
    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", hasOverlayPermission());
        call.resolve(result);
    }

    /**
     * يفتح شاشة إعدادات النظام لمنح صلاحية SYSTEM_ALERT_WINDOW.
     * لا يمكن منحها عبر نافذة صلاحيات عادية — النظام يفرض شاشة الإعدادات.
     */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (hasOverlayPermission()) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        Intent intent = new Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:" + getContext().getPackageName())
        );
        startActivityForResult(call, intent, "overlayPermissionResult");
    }

    @ActivityCallback
    private void overlayPermissionResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        // النظام يعود دائماً بـ RESULT_CANCELED وقد يتأخر تحديث الحالة لحظة،
        // لذلك نعيد الفحص بعد تأخير قصير بدلاً من الاعتماد على resultCode.
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            JSObject response = new JSObject();
            response.put("granted", hasOverlayPermission());
            call.resolve(response);
        }, 400);
    }

    private boolean hasOverlayPermission() {
        return Settings.canDrawOverlays(getContext());
    }

    // ==================== التحكم بالزر ====================

    /** يعرض الزر العائم (أو يحدّثه إن كان ظاهراً) بالإعدادات المرسلة. */
    @PluginMethod
    public void show(PluginCall call) {
        if (!hasOverlayPermission()) {
            call.reject("لم تُمنح صلاحية العرض فوق التطبيقات الأخرى. استدعِ requestPermission() أولاً.", ERR_NO_PERMISSION);
            return;
        }
        startService(FloatingWidgetService.ACTION_SHOW, call.getData(), call);
    }

    /**
     * تحديث جزئي: أرسل المفاتيح التي تريد تغييرها فقط،
     * وتبقى بقية الإعدادات كما هي.
     */
    @PluginMethod
    public void update(PluginCall call) {
        if (!FloatingWidgetService.isRunning()) {
            call.reject("الزر العائم غير ظاهر — استدعِ show() أولاً.", "NOT_VISIBLE");
            return;
        }
        startService(FloatingWidgetService.ACTION_UPDATE, call.getData(), call);
    }

    /** اختصار لتغيير المكان فقط. */
    @PluginMethod
    public void setPosition(PluginCall call) {
        if (!FloatingWidgetService.isRunning()) {
            call.reject("الزر العائم غير ظاهر — استدعِ show() أولاً.", "NOT_VISIBLE");
            return;
        }
        JSObject data = new JSObject();
        data.put("x", call.getInt("x", 0));
        data.put("y", call.getInt("y", 0));
        String anchor = call.getString("anchor");
        if (anchor != null) {
            data.put("anchor", anchor);
        }
        startService(FloatingWidgetService.ACTION_UPDATE, data, call);
    }

    /** يخفي الزر ويوقف الخدمة والإشعار الملازم لها. */
    @PluginMethod
    public void hide(PluginCall call) {
        try {
            getContext().stopService(new Intent(getContext(), FloatingWidgetService.class));
            call.resolve();
        } catch (Exception e) {
            call.reject("تعذّر إيقاف الزر العائم: " + e.getMessage(), "HIDE_FAILED");
        }
    }

    @PluginMethod
    public void isVisible(PluginCall call) {
        JSObject result = new JSObject();
        result.put("visible", FloatingWidgetService.isRunning());
        call.resolve(result);
    }

    // ==================== تشغيل الخدمة ====================

    private void startService(String action, JSObject options, PluginCall call) {
        try {
            JSONObject config = options != null ? options : new JSObject();
            Intent intent = new Intent(getContext(), FloatingWidgetService.class);
            intent.setAction(action);
            intent.putExtra(FloatingWidgetService.EXTRA_CONFIG, config.toString());

            boolean keepAlive = !config.has("keepAliveInBackground") || config.optBoolean("keepAliveInBackground", true);
            if (keepAlive && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }

            JSObject result = new JSObject();
            result.put("visible", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("تعذّر تشغيل خدمة الزر العائم: " + e.getMessage(), "SERVICE_START_FAILED");
        }
    }
}
