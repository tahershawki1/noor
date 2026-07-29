package com.noor.islamicapp.backup;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * نسخة احتياطية لبيانات المستخدم تنجو من حذف التطبيق.
 *
 * <h3>لماذا لا تكفي ذاكرة التطبيق؟</h3>
 * حذف أي تطبيق أندرويد يمحو معه مجلّده الخاص بالكامل — وهو حيث يعيش
 * {@code localStorage} الخاص بالـ WebView. وينطبق ذلك أيضاً على
 * {@code getExternalFilesDir()} رغم وقوعه على البطاقة. فأي مكان «مملوك
 * للتطبيق» يذهب مع التطبيق.
 *
 * الناجي الوحيد هو <b>التخزين المشترك</b> (مجلد المستندات)، وهو ما نكتب فيه.
 *
 * <h3>لماذا الاسترجاع باختيار الملف؟</h3>
 * منذ أندرويد 10 تُنسب الملفات في التخزين المشترك إلى التطبيق الذي أنشأها،
 * وحذف التطبيق يفقده تلك النسبة. فالنسخة تبقى على الجهاز لكن التطبيق المُعاد
 * تثبيته لا يراها إلا بصلاحية تخزين واسعة لا تستحقّها ميزة كهذه. لذلك:
 * <ul>
 *   <li><b>الحفظ</b> تلقائي وصامت — بلا أي صلاحية على أندرويد 10 فأحدث.</li>
 *   <li><b>الاسترجاع</b> عبر منتقي ملفات النظام — بلا صلاحية كذلك، ويعمل حتى
 *       لو كان الملف على Google Drive أو نُقل من جهاز آخر.</li>
 * </ul>
 */
@CapacitorPlugin(name = "NoorBackup")
public class BackupPlugin extends Plugin {

    /** مجلد النسخ داخل «المستندات» — ظاهر للمستخدم ليأخذ منه نسخة بنفسه. */
    private static final String FOLDER = "Noor";
    private static final String MIME = "application/json";

    // ==================== الحفظ ====================

    /**
     * يحفظ النسخة في التخزين المشترك، ويستبدل نسخة سابقة بنفس الاسم.
     *
     * @param call json (مطلوب)، fileName (افتراضياً noor-backup.json)
     */
    @PluginMethod
    public void save(PluginCall call) {
        String json = call.getString("json");
        if (json == null || json.isEmpty()) {
            call.reject("لا توجد بيانات لحفظها", "EMPTY");
            return;
        }
        String fileName = call.getString("fileName", "noor-backup.json");

        try {
            String location = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? saveViaMediaStore(json, fileName)
                : saveViaFile(json, fileName);

            JSObject result = new JSObject();
            result.put("saved", true);
            result.put("location", location);
            call.resolve(result);
        } catch (SecurityException e) {
            // أندرويد 9 فأقدم بلا صلاحية التخزين — الويب يعرض التصدير اليدوي
            JSObject result = new JSObject();
            result.put("saved", false);
            result.put("reason", "PERMISSION");
            call.resolve(result);
        } catch (Exception e) {
            call.reject("تعذّر حفظ النسخة: " + e.getMessage(), "SAVE_FAILED");
        }
    }

    /** أندرويد 10 فأحدث: الكتابة عبر MediaStore بلا أي صلاحية. */
    private String saveViaMediaStore(String json, String fileName) throws IOException {
        ContentResolver resolver = getContext().getContentResolver();
        String relativePath = Environment.DIRECTORY_DOCUMENTS + File.separator + FOLDER;
        Uri collection = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);

        // استبدال النسخة السابقة بدل تكديس "noor-backup (1).json"
        Uri existing = findExisting(resolver, collection, fileName, relativePath);
        Uri target = existing;

        if (target == null) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
            values.put(MediaStore.MediaColumns.MIME_TYPE, MIME);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath);
            target = resolver.insert(collection, values);
        }
        if (target == null) {
            throw new IOException("تعذّر إنشاء الملف في المستندات");
        }

        // "wt" تقتطع المحتوى القديم، وإلا بقيت ذيول نسخة أطول
        try (OutputStream out = resolver.openOutputStream(target, "wt")) {
            if (out == null) {
                throw new IOException("تعذّر فتح الملف للكتابة");
            }
            out.write(json.getBytes(StandardCharsets.UTF_8));
        }
        return relativePath + File.separator + fileName;
    }

    private Uri findExisting(ContentResolver resolver, Uri collection, String fileName, String relativePath) {
        String selection = MediaStore.MediaColumns.DISPLAY_NAME + "=? AND "
            + MediaStore.MediaColumns.RELATIVE_PATH + " LIKE ?";
        String[] args = { fileName, relativePath + "%" };
        try (Cursor cursor = resolver.query(collection, new String[] { MediaStore.MediaColumns._ID },
            selection, args, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                return Uri.withAppendedPath(collection, String.valueOf(cursor.getLong(0)));
            }
        } catch (Exception ignored) {
            // استعلام فاشل يعني ببساطة "لا نسخة سابقة"
        }
        return null;
    }

    /** أندرويد 9 فأقدم: كتابة مباشرة، وتحتاج صلاحية التخزين. */
    private String saveViaFile(String json, String fileName) throws IOException {
        if (ContextCompat.checkSelfPermission(getContext(),
            android.Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            throw new SecurityException("لم تُمنح صلاحية التخزين");
        }
        File folder = new File(
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), FOLDER);
        if (!folder.exists() && !folder.mkdirs()) {
            throw new IOException("تعذّر إنشاء مجلد " + FOLDER);
        }
        File file = new File(folder, fileName);
        try (FileOutputStream out = new FileOutputStream(file, false)) {
            out.write(json.getBytes(StandardCharsets.UTF_8));
        }
        return file.getAbsolutePath();
    }

    // ==================== القراءة التلقائية ====================

    /**
     * يحاول قراءة النسخة دون إزعاج المستخدم.
     *
     * ينجح ما دام التطبيق هو من كتبها ولم يُحذف بينهما. بعد إعادة التثبيت
     * يفشل غالباً — وهنا يأتي دور {@link #pickAndRead}.
     */
    @PluginMethod
    public void readAuto(PluginCall call) {
        String fileName = call.getString("fileName", "noor-backup.json");
        JSObject result = new JSObject();
        try {
            String json = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? readViaMediaStore(fileName)
                : readViaFile(fileName);
            result.put("found", json != null);
            if (json != null) {
                result.put("json", json);
            }
        } catch (Exception e) {
            result.put("found", false);
        }
        call.resolve(result);
    }

    private String readViaMediaStore(String fileName) throws IOException {
        ContentResolver resolver = getContext().getContentResolver();
        Uri collection = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        String relativePath = Environment.DIRECTORY_DOCUMENTS + File.separator + FOLDER;
        Uri uri = findExisting(resolver, collection, fileName, relativePath);
        if (uri == null) {
            return null;
        }
        try (InputStream in = resolver.openInputStream(uri)) {
            return in == null ? null : readAll(in);
        }
    }

    private String readViaFile(String fileName) throws IOException {
        File file = new File(
            new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), FOLDER),
            fileName);
        if (!file.exists()) {
            return null;
        }
        try (InputStream in = new java.io.FileInputStream(file)) {
            return readAll(in);
        }
    }

    // ==================== الاسترجاع باختيار الملف ====================

    /**
     * يفتح منتقي ملفات النظام ليختار المستخدم ملف النسخة.
     * هذا هو المسار الموثوق بعد إعادة تثبيت التطبيق، ولا يحتاج أي صلاحية.
     */
    @PluginMethod
    public void pickAndRead(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            // بعض مديري الملفات يعطون النسخة نوعاً عاماً، فنقبل الاثنين
            .setType("*/*")
            .putExtra(Intent.EXTRA_MIME_TYPES, new String[] { MIME, "text/plain", "*/*" });
        startActivityForResult(call, intent, "pickResult");
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        JSObject response = new JSObject();
        Intent data = result.getData();
        Uri uri = data == null ? null : data.getData();

        if (uri == null) {
            response.put("found", false);
            response.put("reason", "CANCELLED");
            call.resolve(response);
            return;
        }
        try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
            if (in == null) {
                throw new IOException("تعذّر فتح الملف المختار");
            }
            response.put("found", true);
            response.put("json", readAll(in));
            call.resolve(response);
        } catch (Exception e) {
            call.reject("تعذّر قراءة الملف: " + e.getMessage(), "READ_FAILED");
        }
    }

    /**
     * يفتح نافذة «حفظ باسم» ليختار المستخدم مكان النسخة بنفسه.
     * خطة بديلة على أندرويد 9 فأقدم حين تُرفض صلاحية التخزين، ومفيدة كذلك
     * لمن يريد وضع النسخة على Google Drive مباشرةً.
     */
    @PluginMethod
    public void exportViaPicker(PluginCall call) {
        String json = call.getString("json");
        if (json == null || json.isEmpty()) {
            call.reject("لا توجد بيانات لحفظها", "EMPTY");
            return;
        }
        pendingExport = json;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType(MIME)
            .putExtra(Intent.EXTRA_TITLE, call.getString("fileName", "noor-backup.json"));
        startActivityForResult(call, intent, "exportResult");
    }

    /** محتوى في انتظار أن يختار المستخدم مكانه — عمر قصير جداً. */
    private String pendingExport = null;

    @ActivityCallback
    private void exportResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        String json = pendingExport;
        pendingExport = null;

        Intent data = result.getData();
        Uri uri = data == null ? null : data.getData();
        JSObject response = new JSObject();

        if (uri == null || json == null) {
            response.put("saved", false);
            response.put("reason", "CANCELLED");
            call.resolve(response);
            return;
        }
        try (OutputStream out = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (out == null) {
                throw new IOException("تعذّر فتح الوجهة للكتابة");
            }
            out.write(json.getBytes(StandardCharsets.UTF_8));
            response.put("saved", true);
            call.resolve(response);
        } catch (Exception e) {
            call.reject("تعذّر حفظ الملف: " + e.getMessage(), "EXPORT_FAILED");
        }
    }

    // ==================== أدوات ====================

    private static String readAll(InputStream in) throws IOException {
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            char[] buffer = new char[8192];
            int read;
            while ((read = reader.read(buffer)) != -1) {
                builder.append(buffer, 0, read);
            }
        }
        return builder.toString();
    }
}
