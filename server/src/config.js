/**
 * إعدادات الخادم — كلها تُقرأ من متغيرات البيئة مع قيم افتراضية آمنة.
 * انسخ ‎.env.example‎ إلى ‎.env‎ (أو اضبط المتغيرات في منصة الاستضافة).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "..");

const num = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const list = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export const config = {
  port: num(process.env.PORT, 8787),
  host: process.env.HOST || "0.0.0.0",

  // مكان تخزين ملفات الذاكرة (JSON على القرص)
  dataDir: process.env.DATA_DIR || path.join(serverRoot, "data"),

  // مستودع GitHub الذي نراقب تحديثاته
  github: {
    repo: process.env.GITHUB_REPO || "tahershawki1/noor",
    branch: process.env.GITHUB_BRANCH || "main",
    // توكن اختياري: يرفع حد الطلبات من 60 إلى 5000 في الساعة ويسمح بالمستودعات الخاصة
    token: process.env.GITHUB_TOKEN || "",
    // سر الويب هوك — بدونه يُرفض ‎/api/github/webhook‎
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || "",
    apiBase: process.env.GITHUB_API_BASE || "https://api.github.com",
    // مدة صلاحية نتيجة GitHub المخزّنة مؤقتاً
    cacheTtlMs: num(process.env.GITHUB_CACHE_TTL_MS, 60_000),
    // كل كم مللي ثانية يسأل الخادم GitHub تلقائياً (0 = تعطيل الاستطلاع)
    pollIntervalMs: num(process.env.GITHUB_POLL_INTERVAL_MS, 120_000),
  },

  // أصول الويب المسموح لها بالوصول ‎(CORS)‎ — فارغ = السماح للجميع
  allowedOrigins: list(process.env.ALLOWED_ORIGINS),

  // توكن اختياري لحماية واجهات الذاكرة: يُرسل في ترويسة ‎x-noor-token‎
  apiToken: process.env.API_TOKEN || "",

  limits: {
    // أقصى عدد مدخلات محفوظة لكل جهاز (الأقدم يُحذف أولاً)
    maxEntriesPerDevice: num(process.env.MAX_ENTRIES_PER_DEVICE, 5000),
    // أقصى حجم لجسم الطلب
    jsonBodyLimit: process.env.JSON_BODY_LIMIT || "1mb",
    // حد الطلبات لكل عنوان IP في النافذة الزمنية
    rateWindowMs: num(process.env.RATE_WINDOW_MS, 60_000),
    rateMax: num(process.env.RATE_MAX, 300),
  },

  // نسخة التطبيق التي يعلنها الخادم عند عدم توفر معلومات GitHub
  appVersion: process.env.APP_VERSION || "1.0.0",
};

export const isProduction = process.env.NODE_ENV === "production";
