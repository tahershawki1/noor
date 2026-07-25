/**
 * مخزن الذاكرة — ملف JSON لكل جهاز داخل ‎DATA_DIR/devices‎.
 * الكتابة ذرّية (ملف مؤقت ثم إعادة تسمية) ومتسلسلة لكل جهاز لمنع تضارب الكتابات.
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config.js";

const DEVICE_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

/** يتحقق أن معرّف الجهاز آمن للاستخدام كاسم ملف (يمنع تجاوز المسارات). */
export function isValidDeviceId(deviceId) {
  return typeof deviceId === "string" && DEVICE_ID_RE.test(deviceId);
}

export function newDeviceId() {
  return crypto.randomBytes(16).toString("hex");
}

const devicesDir = () => path.join(config.dataDir, "devices");
const deviceFile = (deviceId) => path.join(devicesDir(), `${deviceId}.json`);

/**
 * ينشئ مجلد البيانات إن لم يوجد.
 * لا نخزّن النتيجة: لو حُذف المجلد أثناء التشغيل (تنظيف، إعادة ربط قرص)
 * فإن أول عملية لاحقة تعيد إنشاءه بدل أن تفشل كل الكتابات إلى الأبد.
 */
function ensureDir() {
  return fs.mkdir(devicesDir(), { recursive: true });
}

function emptyRecord(deviceId) {
  const now = new Date().toISOString();
  return {
    deviceId,
    createdAt: now,
    updatedAt: now,
    label: "",
    state: {},
    entries: [],
    stats: { totalEntries: 0, droppedEntries: 0 },
  };
}

/** قائمة انتظار كتابة لكل جهاز: تضمن تنفيذ العمليات على نفس الملف بالتسلسل. */
const queues = new Map();
function enqueue(deviceId, task) {
  const previous = queues.get(deviceId) || Promise.resolve();
  const next = previous.then(task, task);
  // الحلقة التالية تنتظر انتهاء هذه المهمة سواء نجحت أو فشلت
  const settled = next.then(
    () => undefined,
    () => undefined
  );
  queues.set(deviceId, settled);
  settled.then(() => {
    // تنظيف المدخل متى انتهى آخر عمل عليه حتى لا تنمو الخريطة بلا حدود
    if (queues.get(deviceId) === settled) queues.delete(deviceId);
  });
  return next;
}

export async function readDevice(deviceId) {
  await ensureDir();
  try {
    const raw = await fs.readFile(deviceFile(deviceId), "utf8");
    const parsed = JSON.parse(raw);
    return { ...emptyRecord(deviceId), ...parsed, deviceId };
  } catch (err) {
    if (err.code === "ENOENT") return emptyRecord(deviceId);
    if (err instanceof SyntaxError) {
      // ملف تالف: نحتفظ بنسخة منه ونبدأ من جديد بدل إسقاط الطلب
      await fs
        .rename(deviceFile(deviceId), `${deviceFile(deviceId)}.corrupt-${Date.now()}`)
        .catch(() => {});
      return emptyRecord(deviceId);
    }
    throw err;
  }
}

async function writeDevice(record) {
  await ensureDir();
  const target = deviceFile(record.deviceId);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(record), "utf8");
  await fs.rename(tmp, target);
  return record;
}

/** يقرأ السجل، يمرّره لدالة التعديل، ثم يحفظ الناتج — كل ذلك داخل قفل الجهاز. */
export function updateDevice(deviceId, mutator) {
  return enqueue(deviceId, async () => {
    const record = await readDevice(deviceId);
    const result = await mutator(record);
    record.updatedAt = new Date().toISOString();
    await writeDevice(record);
    return result === undefined ? record : result;
  });
}

const MAX_VALUE_CHARS = 20_000;

/** يهذّب مدخلاً واحداً قادماً من العميل قبل حفظه. */
export function normalizeEntry(input = {}) {
  const at = typeof input.at === "string" && !Number.isNaN(Date.parse(input.at))
    ? new Date(input.at).toISOString()
    : new Date().toISOString();

  let value = input.value;
  if (value !== undefined && typeof value !== "string") {
    try {
      value = JSON.stringify(value);
    } catch {
      value = String(value);
    }
  }
  if (typeof value === "string" && value.length > MAX_VALUE_CHARS) {
    value = `${value.slice(0, MAX_VALUE_CHARS)}…`;
  }

  return {
    id: typeof input.id === "string" && input.id.length <= 64 ? input.id : crypto.randomUUID(),
    type: String(input.type || "input").slice(0, 40),
    key: String(input.key ?? "").slice(0, 200),
    value: value ?? "",
    label: String(input.label ?? "").slice(0, 200),
    section: String(input.section ?? "").slice(0, 60),
    at,
  };
}

/** يضيف مدخلات جديدة مع تجاهل المكرر (نفس المعرّف) وقصّ الأقدم عند تجاوز الحد. */
export async function appendEntries(deviceId, rawEntries) {
  return updateDevice(deviceId, (record) => {
    const known = new Set(record.entries.map((entry) => entry.id));
    let added = 0;

    for (const raw of rawEntries) {
      const entry = normalizeEntry(raw);
      if (known.has(entry.id)) continue;
      known.add(entry.id);
      record.entries.push(entry);
      added += 1;
    }

    record.entries.sort((a, b) => a.at.localeCompare(b.at));

    const max = config.limits.maxEntriesPerDevice;
    if (record.entries.length > max) {
      const dropped = record.entries.length - max;
      record.entries = record.entries.slice(dropped);
      record.stats.droppedEntries = (record.stats.droppedEntries || 0) + dropped;
    }

    record.stats.totalEntries = (record.stats.totalEntries || 0) + added;
    return { added, stored: record.entries.length, deviceId };
  });
}

/** بحث/ترشيح داخل مدخلات جهاز. */
export function queryEntries(record, { type, q, since, limit = 200, offset = 0 } = {}) {
  let items = record.entries;

  if (type) {
    const types = new Set(String(type).split(",").map((t) => t.trim()).filter(Boolean));
    items = items.filter((entry) => types.has(entry.type));
  }
  if (since) {
    items = items.filter((entry) => entry.at > since);
  }
  if (q) {
    const needle = String(q).toLowerCase();
    items = items.filter((entry) =>
      `${entry.key} ${entry.value} ${entry.label} ${entry.section}`.toLowerCase().includes(needle)
    );
  }

  const total = items.length;
  const start = Math.max(0, Number(offset) || 0);
  const size = Math.min(Math.max(1, Number(limit) || 200), 1000);
  // الأحدث أولاً في العرض
  const page = items.slice().reverse().slice(start, start + size);
  return { total, items: page };
}

export async function listDevices() {
  await ensureDir();
  const files = await fs.readdir(devicesDir()).catch(() => []);
  return files.filter((name) => name.endsWith(".json")).map((name) => name.replace(/\.json$/, ""));
}

export async function deleteDevice(deviceId) {
  await ensureDir();
  await fs.rm(deviceFile(deviceId), { force: true });
}
