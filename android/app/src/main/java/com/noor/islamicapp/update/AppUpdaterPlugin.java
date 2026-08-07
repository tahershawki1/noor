package com.noor.islamicapp.update;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * تحديث التطبيق نفسه (الـ APK) دون متجر.
 *
 * <h3>الدورة كاملة</h3>
 * <ol>
 *   <li>الـ CI تنشر إصداراً جديداً وتكتب رابطه المباشر ورقمه في
 *       {@code version.json} على GitHub Pages.</li>
 *   <li>كود الويب ({@code app-updates.js}) يقرأ الملف عند كل فتح.</li>
 *   <li>لو رقم النسخة هناك أكبر من المثبَّتة، يظهر شريط داخل التطبيق وإشعار
 *       في شريط الإشعارات.</li>
 *   <li>عند الموافقة ينزّل هذا البلاجن الـ APK ويفتح شاشة التثبيت.</li>
 * </ol>
 *
 * المقارنة تعتمد على {@code versionCode} لا على الاسم، لأنه الرقم الذي يفهمه
 * أندرويد ويرفض التثبيت فوق نسخة أحدث منه.
 *
 * <h3>الصلاحية</h3>
 * تثبيت APK من خارج المتجر يحتاج {@code REQUEST_INSTALL_PACKAGES} + موافقة
 * المستخدم مرة واحدة من شاشة إعدادات مستقلة ({@link #requestInstallPermission}).
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    /** أحداث تُرسل للويب أثناء التنزيل. */
    private static final String EVENT_PROGRESS = "downloadProgress";
    private static final String EVENT_FAILED = "downloadFailed";
    private static final String EVENT_READY = "downloadReady";
    /** أحداث تنزيل ملف المشاركة (منفصلة عن تنزيل التحديث). */
    private static final String EVENT_SHARE_PROGRESS = "shareProgress";
    private static final String EVENT_SHARE_FAILED = "shareFailed";

    private static final long POLL_INTERVAL_MS = 500L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private long downloadId = -1L;
    private Runnable poller;
    /** هل نفتح شاشة التثبيت تلقائياً عند اكتمال التنزيل؟ */
    private boolean autoInstall = true;

    /** تنزيل ملف المشاركة — مسار مستقل عن تنزيل التحديث. */
    private long shareDownloadId = -1L;
    private Runnable sharePoller;

    // ==================== معلومات النسخة المثبّتة ====================

    /**
     * نسخة التطبيق المثبّتة على الجهاز الآن، ومعها بصمة شهادة التوقيع.
     *
     * البصمة هي ما يكشف الحالة التي لا يمكن فيها التحديث فوق المثبَّت: أندرويد
     * يرفض استبدال تطبيق بآخر موقّع بمفتاح مختلف، فلا حلّ إلا حذف القديم —
     * وحذفه يمحو بيانات المستخدم. مقارنة هذه البصمة بنظيرتها في version.json
     * تجعل التطبيق يعرف ذلك <em>قبل</em> التنزيل فينبّه المستخدم لحفظ بياناته.
     */
    @PluginMethod
    public void getInstalled(PluginCall call) {
        JSObject result = new JSObject();
        try {
            Context context = getContext();
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            result.put("packageName", info.packageName);
            result.put("versionName", info.versionName);
            result.put("versionCode", versionCodeOf(info));
            result.put("signature", signingCertificateSha256());
            call.resolve(result);
        } catch (PackageManager.NameNotFoundException e) {
            call.reject("تعذّر قراءة نسخة التطبيق: " + e.getMessage(), "VERSION_UNAVAILABLE");
        }
    }

    /**
     * بصمة SHA-256 لشهادة التوقيع، بنفس الصيغة التي يطبعها
     * {@code apksigner verify --print-certs} فتُقارن بها مباشرة.
     */
    @SuppressWarnings("deprecation")
    private String signingCertificateSha256() {
        try {
            Context context = getContext();
            PackageManager manager = context.getPackageManager();
            String packageName = context.getPackageName();
            Signature[] signatures;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                PackageInfo info = manager.getPackageInfo(packageName, PackageManager.GET_SIGNING_CERTIFICATES);
                if (info.signingInfo == null) {
                    return null;
                }
                signatures = info.signingInfo.hasMultipleSigners()
                    ? info.signingInfo.getApkContentsSigners()
                    : info.signingInfo.getSigningCertificateHistory();
            } else {
                PackageInfo info = manager.getPackageInfo(packageName, PackageManager.GET_SIGNATURES);
                signatures = info.signatures;
            }

            if (signatures == null || signatures.length == 0) {
                return null;
            }
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(signatures[0].toByteArray());
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                hex.append(Character.forDigit((b >> 4) & 0xF, 16));
                hex.append(Character.forDigit(b & 0xF, 16));
            }
            return hex.toString();
        } catch (PackageManager.NameNotFoundException | NoSuchAlgorithmException e) {
            return null;
        }
    }

    @SuppressWarnings("deprecation")
    private static long versionCodeOf(PackageInfo info) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? info.getLongVersionCode()
            : info.versionCode;
    }

    // ==================== صلاحية التثبيت ====================

    /** هل يسمح النظام لتطبيقنا بتثبيت حزم من خارج المتجر؟ */
    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", hasInstallPermission());
        call.resolve(result);
    }

    /**
     * يفتح شاشة «السماح بتثبيت تطبيقات غير معروفة».
     * لا يمكن منح هذه الصلاحية بنافذة صلاحيات عادية — النظام يفرض شاشة الإعدادات.
     */
    @PluginMethod
    public void requestInstallPermission(PluginCall call) {
        if (hasInstallPermission()) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        Intent intent = new Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:" + getContext().getPackageName())
        );
        startActivityForResult(call, intent, "installPermissionResult");
    }

    @ActivityCallback
    private void installPermissionResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        // النظام يعود دون نتيجة مفيدة، وقد تتأخر الحالة لحظة — نعيد الفحص بعد مهلة قصيرة
        handler.postDelayed(() -> {
            JSObject response = new JSObject();
            response.put("granted", hasInstallPermission());
            call.resolve(response);
        }, 400);
    }

    private boolean hasInstallPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return true;
        }
        return getContext().getPackageManager().canRequestPackageInstalls();
    }

    // ==================== الإشعار ====================

    /** يعرض إشعار «يوجد تحديث» في شريط إشعارات النظام. */
    @PluginMethod
    public void notifyUpdateAvailable(PluginCall call) {
        String version = call.getString("version", "");
        UpdateNotifier.show(getContext(), version, call.getString("notes", ""));
        call.resolve();
    }

    @PluginMethod
    public void cancelNotification(PluginCall call) {
        UpdateNotifier.cancel(getContext());
        call.resolve();
    }

    // ==================== التنزيل والتثبيت ====================

    /**
     * ينزّل الـ APK عبر DownloadManager ثم يفتح شاشة التثبيت.
     *
     * DownloadManager اختيار مقصود: يكمل التنزيل إن خرج المستخدم من التطبيق،
     * يستأنف بعد انقطاع الشبكة، ويعرض تقدّمه في شريط الإشعارات مجاناً.
     *
     * @param call url (مطلوب)، version (لتسمية الملف)
     */
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("رابط التحديث مفقود", "INVALID_URL");
            return;
        }
        if (!hasInstallPermission()) {
            call.reject("لم يُسمح بتثبيت التطبيقات غير المعروفة", "INSTALL_PERMISSION_DENIED");
            return;
        }

        String version = call.getString("version", "latest");
        String fileName = "noor-" + version + ".apk";

        // حين يتغيّر مفتاح التوقيع يجب حذف التطبيق قبل تثبيت الجديد — وحذفه
        // يمحو مجلده الخاص ومعه أي ملف نزّلناه هناك. لذلك ننزّل في «التنزيلات»
        // العامة التي تبقى بعد الحذف، ونترك التثبيت للمستخدم من مدير الملفات.
        boolean publicDownloads = Boolean.TRUE.equals(call.getBoolean("publicDownloads", false));
        boolean autoInstall = Boolean.TRUE.equals(call.getBoolean("autoInstall", true));

        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            call.reject("خدمة التنزيل غير متاحة على هذا الجهاز", "NO_DOWNLOAD_MANAGER");
            return;
        }

        File target = publicDownloads
            ? new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), fileName)
            : new File(getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName);

        // ملف قديم بنفس الاسم يُحذف أولاً وإلا أضاف DownloadManager لاحقة للاسم
        if (target.exists() && !target.delete()) {
            call.reject("تعذّر حذف ملف تحديث قديم", "STALE_FILE");
            return;
        }

        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url))
                .setTitle("تحديث نور " + version)
                .setDescription("جارٍ تنزيل النسخة الجديدة")
                .setMimeType("application/vnd.android.package-archive")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                .setAllowedOverRoaming(false);

            if (publicDownloads) {
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
            } else {
                request.setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, fileName);
            }

            cancelActiveDownload(manager);
            this.autoInstall = autoInstall;
            downloadId = manager.enqueue(request);
            startPolling(manager, target);

            JSObject result = new JSObject();
            result.put("started", true);
            result.put("destination", target.getAbsolutePath());
            call.resolve(result);
        } catch (Exception e) {
            call.reject("تعذّر بدء التنزيل: " + e.getMessage(), "DOWNLOAD_START_FAILED");
        }
    }

    /**
     * يفتح شاشة حذف التطبيق. الخطوة التي لا مفرّ منها حين يختلف مفتاح التوقيع،
     * ولا تُستدعى إلا بعد أن يؤكّد الويب أن النسخة الاحتياطية حُفظت.
     */
    @PluginMethod
    public void uninstallSelf(PluginCall call) {
        try {
            Intent intent = new Intent(Intent.ACTION_DELETE)
                .setData(Uri.parse("package:" + getContext().getPackageName()))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("تعذّر فتح شاشة الحذف: " + e.getMessage(), "UNINSTALL_FAILED");
        }
    }

    /** يلغي تنزيلاً جارياً. */
    @PluginMethod
    public void cancelDownload(PluginCall call) {
        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager != null) {
            cancelActiveDownload(manager);
        }
        call.resolve();
    }

    private void cancelActiveDownload(DownloadManager manager) {
        stopPolling();
        if (downloadId != -1L) {
            manager.remove(downloadId);
            downloadId = -1L;
        }
    }

    /**
     * يتابع تقدّم التنزيل ويُبلّغ الويب.
     *
     * الاستطلاع كل نصف ثانية بدل BroadcastReceiver لأننا نريد نسبة التقدّم لا
     * مجرّد لحظة الانتهاء، والاستطلاع يتوقف تلقائياً عند أول حالة نهائية.
     */
    private void startPolling(DownloadManager manager, File target) {
        stopPolling();
        poller = new Runnable() {
            @Override
            public void run() {
                DownloadManager.Query query = new DownloadManager.Query().setFilterById(downloadId);
                try (Cursor cursor = manager.query(query)) {
                    if (cursor == null || !cursor.moveToFirst()) {
                        fail("اختفى التنزيل من طابور النظام");
                        return;
                    }
                    int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                    long done = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                    long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));

                    if (status == DownloadManager.STATUS_FAILED) {
                        int reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                        fail("فشل التنزيل (رمز " + reason + ")");
                        return;
                    }

                    if (status == DownloadManager.STATUS_SUCCESSFUL) {
                        stopPolling();
                        emitProgress(total, total);
                        notifyListeners(EVENT_READY, new JSObject().put("path", target.getAbsolutePath()), true);
                        if (autoInstall) {
                            install(target);
                        }
                        return;
                    }

                    emitProgress(done, total);
                } catch (IllegalArgumentException e) {
                    fail("تعذّر قراءة حالة التنزيل: " + e.getMessage());
                    return;
                }
                handler.postDelayed(this, POLL_INTERVAL_MS);
            }
        };
        handler.post(poller);
    }

    private void stopPolling() {
        if (poller != null) {
            handler.removeCallbacks(poller);
            poller = null;
        }
    }

    private void emitProgress(long done, long total) {
        JSObject payload = new JSObject();
        payload.put("downloaded", done);
        payload.put("total", total);
        payload.put("percent", total > 0 ? (int) ((done * 100L) / total) : 0);
        notifyListeners(EVENT_PROGRESS, payload, true);
    }

    private void fail(String message) {
        stopPolling();
        downloadId = -1L;
        notifyListeners(EVENT_FAILED, new JSObject().put("message", message), true);
    }

    /** يفتح شاشة تثبيت الحزمة التي نُزّلت. */
    private void install(File apk) {
        try {
            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apk
            );
            Intent intent = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            UpdateNotifier.cancel(getContext());
        } catch (Exception e) {
            fail("تعذّر فتح شاشة التثبيت: " + e.getMessage());
        }
    }

    // ==================== مشاركة ملف التطبيق (APK) ====================

    /**
     * يشارك ملف الـ APK لآخر إصدار نُزّل من GitHub، عبر ورقة مشاركة النظام.
     *
     * يبحث أولاً عن الملف المنزَّل مسبقاً (مسار تحديث التطبيق نفسه). إن لم يجده
     * وأُعطي رابطاً نزّله ثم شاركه. الملف يُقدَّم عبر FileProvider كـ content://
     * حتى تقرأه التطبيقات الأخرى.
     *
     * @param call url (اختياري — للتنزيل عند غياب الملف)، version (لاسم الملف)
     */
    @PluginMethod
    public void shareApk(PluginCall call) {
        String version = call.getString("version", null);
        String url = call.getString("url", null);
        File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);

        File target = null;
        if (version != null && !version.trim().isEmpty() && dir != null) {
            File named = new File(dir, "noor-" + version + ".apk");
            if (named.exists() && named.length() > 0) {
                target = named;
            }
        }
        // وإلا: آخر ملف نزّلناه فعلاً (أحدث noor-*.apk)
        if (target == null) {
            target = newestDownloadedApk(dir);
        }

        if (target != null) {
            try {
                shareFile(target);
                JSObject result = new JSObject();
                result.put("shared", true);
                result.put("path", target.getAbsolutePath());
                call.resolve(result);
            } catch (Exception e) {
                call.reject("تعذّر فتح ورقة المشاركة: " + e.getMessage(), "SHARE_FAILED");
            }
            return;
        }

        // لا ملف محلي — ننزّل الأحدث ثم نشاركه
        if (url == null || url.trim().isEmpty()) {
            call.reject("لا يوجد ملف تطبيق منزَّل للمشاركة", "NO_APK");
            return;
        }
        downloadThenShare(call, url, version != null ? version : "latest");
    }

    /** أحدث ملف noor-*.apk في مجلد التنزيلات الخاص بالتطبيق، أو null. */
    private File newestDownloadedApk(File dir) {
        if (dir == null) {
            return null;
        }
        File[] files = dir.listFiles();
        if (files == null) {
            return null;
        }
        File newest = null;
        for (File f : files) {
            String name = f.getName();
            if (f.isFile() && name.startsWith("noor-") && name.endsWith(".apk") && f.length() > 0) {
                if (newest == null || f.lastModified() > newest.lastModified()) {
                    newest = f;
                }
            }
        }
        return newest;
    }

    /** ينزّل الـ APK إلى مجلد التطبيق ثم يفتح ورقة المشاركة عند الاكتمال. */
    private void downloadThenShare(PluginCall call, String url, String version) {
        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            call.reject("خدمة التنزيل غير متاحة على هذا الجهاز", "NO_DOWNLOAD_MANAGER");
            return;
        }
        String fileName = "noor-" + version + ".apk";
        File target = new File(getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName);
        if (target.exists() && !target.delete()) {
            call.reject("تعذّر حذف ملف قديم", "STALE_FILE");
            return;
        }
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url))
                .setTitle("تجهيز ملف نور للمشاركة")
                .setDescription("جارٍ تنزيل ملف التطبيق")
                .setMimeType("application/vnd.android.package-archive")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                .setAllowedOverRoaming(false)
                .setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, fileName);

            stopSharePolling();
            if (shareDownloadId != -1L) {
                manager.remove(shareDownloadId);
            }
            shareDownloadId = manager.enqueue(request);
            startSharePolling(manager, target, call);
        } catch (Exception e) {
            call.reject("تعذّر بدء التنزيل: " + e.getMessage(), "DOWNLOAD_START_FAILED");
        }
    }

    private void startSharePolling(DownloadManager manager, File target, PluginCall call) {
        stopSharePolling();
        sharePoller = new Runnable() {
            @Override
            public void run() {
                DownloadManager.Query query = new DownloadManager.Query().setFilterById(shareDownloadId);
                try (Cursor cursor = manager.query(query)) {
                    if (cursor == null || !cursor.moveToFirst()) {
                        shareFail(call, "اختفى التنزيل من طابور النظام");
                        return;
                    }
                    int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                    long done = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                    long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));

                    if (status == DownloadManager.STATUS_FAILED) {
                        int reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                        shareFail(call, "فشل التنزيل (رمز " + reason + ")");
                        return;
                    }
                    if (status == DownloadManager.STATUS_SUCCESSFUL) {
                        stopSharePolling();
                        shareDownloadId = -1L;
                        emitShareProgress(total, total);
                        try {
                            shareFile(target);
                            JSObject result = new JSObject();
                            result.put("shared", true);
                            result.put("path", target.getAbsolutePath());
                            call.resolve(result);
                        } catch (Exception e) {
                            shareFail(call, "تعذّر فتح ورقة المشاركة: " + e.getMessage());
                        }
                        return;
                    }
                    emitShareProgress(done, total);
                } catch (IllegalArgumentException e) {
                    shareFail(call, "تعذّر قراءة حالة التنزيل: " + e.getMessage());
                    return;
                }
                handler.postDelayed(this, POLL_INTERVAL_MS);
            }
        };
        handler.post(sharePoller);
    }

    private void stopSharePolling() {
        if (sharePoller != null) {
            handler.removeCallbacks(sharePoller);
            sharePoller = null;
        }
    }

    private void emitShareProgress(long done, long total) {
        JSObject payload = new JSObject();
        payload.put("downloaded", done);
        payload.put("total", total);
        payload.put("percent", total > 0 ? (int) ((done * 100L) / total) : 0);
        notifyListeners(EVENT_SHARE_PROGRESS, payload, true);
    }

    private void shareFail(PluginCall call, String message) {
        stopSharePolling();
        shareDownloadId = -1L;
        notifyListeners(EVENT_SHARE_FAILED, new JSObject().put("message", message), true);
        call.reject(message, "SHARE_DOWNLOAD_FAILED");
    }

    /** يفتح ورقة مشاركة النظام لملف الـ APK. */
    private void shareFile(File apk) {
        Uri uri = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            apk
        );
        Intent send = new Intent(Intent.ACTION_SEND)
            .setType("application/vnd.android.package-archive")
            .putExtra(Intent.EXTRA_STREAM, uri)
            .putExtra(Intent.EXTRA_SUBJECT, "تطبيق نور")
            .putExtra(Intent.EXTRA_TEXT, "تطبيق نور — القرآن الكريم والأذكار ومواقيت الصلاة")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(send, "مشاركة تطبيق نور")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(chooser);
    }

    @Override
    protected void handleOnDestroy() {
        stopPolling();
        stopSharePolling();
        super.handleOnDestroy();
    }
}
