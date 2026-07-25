/**
 * واجهات الذاكرة — كل ما يُدخله المستخدم في التطبيق يُحفظ هنا.
 *
 *  POST   /api/memory/:deviceId/entries      إضافة مدخلات (دفعة واحدة)
 *  GET    /api/memory/:deviceId/entries      قراءة/بحث/ترشيح
 *  DELETE /api/memory/:deviceId/entries      مسح كل المدخلات
 *  DELETE /api/memory/:deviceId/entries/:id  حذف مدخل واحد
 *  GET    /api/memory/:deviceId/state        الحالة المحفوظة (إعدادات، محفوظات…)
 *  PUT    /api/memory/:deviceId/state        دمج/استبدال الحالة
 *  GET    /api/memory/:deviceId/export       تصدير كامل
 *  POST   /api/memory/:deviceId/import       استيراد كامل
 *  GET    /api/memory/:deviceId/stats        إحصاءات مختصرة
 */
import { Router } from "express";
import {
  appendEntries,
  deleteDevice,
  isValidDeviceId,
  newDeviceId,
  queryEntries,
  readDevice,
  updateDevice,
} from "../store.js";
import { asyncRoute, requireToken } from "../middleware.js";

export const memoryRouter = Router();

memoryRouter.use(requireToken);

/** يتحقق من معرّف الجهاز مرة واحدة لكل المسارات. */
memoryRouter.param("deviceId", (req, res, next, deviceId) => {
  if (!isValidDeviceId(deviceId)) {
    return res.status(400).json({ error: "معرّف جهاز غير صالح (6–64 حرفاً: أحرف وأرقام و - و _)" });
  }
  return next();
});

/** يولّد معرّف جهاز جديد للعميل عند أول تشغيل. */
memoryRouter.post("/device", (_req, res) => {
  res.status(201).json({ deviceId: newDeviceId() });
});

memoryRouter.post(
  "/:deviceId/entries",
  asyncRoute(async (req, res) => {
    const body = req.body;
    const entries = Array.isArray(body) ? body : Array.isArray(body?.entries) ? body.entries : null;
    if (!entries) return res.status(400).json({ error: "المتوقع مصفوفة entries" });
    if (entries.length > 1000) return res.status(413).json({ error: "أكثر من 1000 مدخل في الطلب الواحد" });

    const result = await appendEntries(req.params.deviceId, entries);
    res.status(201).json(result);
  })
);

memoryRouter.get(
  "/:deviceId/entries",
  asyncRoute(async (req, res) => {
    const record = await readDevice(req.params.deviceId);
    const { total, items } = queryEntries(record, req.query);
    res.json({
      deviceId: record.deviceId,
      total,
      count: items.length,
      updatedAt: record.updatedAt,
      entries: items,
    });
  })
);

memoryRouter.delete(
  "/:deviceId/entries",
  asyncRoute(async (req, res) => {
    const result = await updateDevice(req.params.deviceId, (record) => {
      const removed = record.entries.length;
      record.entries = [];
      return { removed };
    });
    res.json(result);
  })
);

memoryRouter.delete(
  "/:deviceId/entries/:entryId",
  asyncRoute(async (req, res) => {
    const { entryId } = req.params;
    const result = await updateDevice(req.params.deviceId, (record) => {
      const before = record.entries.length;
      record.entries = record.entries.filter((entry) => entry.id !== entryId);
      return { removed: before - record.entries.length };
    });
    if (!result.removed) return res.status(404).json({ error: "المدخل غير موجود" });
    res.json(result);
  })
);

memoryRouter.get(
  "/:deviceId/state",
  asyncRoute(async (req, res) => {
    const record = await readDevice(req.params.deviceId);
    res.json({ deviceId: record.deviceId, updatedAt: record.updatedAt, state: record.state });
  })
);

memoryRouter.put(
  "/:deviceId/state",
  asyncRoute(async (req, res) => {
    const incoming = req.body?.state ?? req.body;
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
      return res.status(400).json({ error: "المتوقع كائن state" });
    }
    // ‎replace=1‎ يستبدل الحالة كاملة، وإلا فالسلوك الافتراضي دمج المفاتيح
    const replace = req.query.replace === "1" || req.body?.replace === true;

    const record = await updateDevice(req.params.deviceId, (rec) => {
      rec.state = replace ? { ...incoming } : { ...rec.state, ...incoming };
      if (typeof req.body?.label === "string") rec.label = req.body.label.slice(0, 80);
    });
    res.json({ deviceId: record.deviceId, updatedAt: record.updatedAt, state: record.state });
  })
);

memoryRouter.get(
  "/:deviceId/stats",
  asyncRoute(async (req, res) => {
    const record = await readDevice(req.params.deviceId);
    const byType = {};
    for (const entry of record.entries) byType[entry.type] = (byType[entry.type] || 0) + 1;
    res.json({
      deviceId: record.deviceId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      stored: record.entries.length,
      totalEver: record.stats?.totalEntries || record.entries.length,
      dropped: record.stats?.droppedEntries || 0,
      stateKeys: Object.keys(record.state || {}).length,
      first: record.entries[0]?.at || null,
      last: record.entries.at(-1)?.at || null,
      byType,
    });
  })
);

memoryRouter.get(
  "/:deviceId/export",
  asyncRoute(async (req, res) => {
    const record = await readDevice(req.params.deviceId);
    res.setHeader("Content-Disposition", `attachment; filename="noor-memory-${record.deviceId}.json"`);
    res.json({ format: "noor-memory@1", exportedAt: new Date().toISOString(), ...record });
  })
);

memoryRouter.post(
  "/:deviceId/import",
  asyncRoute(async (req, res) => {
    const payload = req.body || {};
    const entries = Array.isArray(payload.entries) ? payload.entries : [];
    const state = payload.state && typeof payload.state === "object" ? payload.state : {};
    const replace = req.query.replace === "1";

    await updateDevice(req.params.deviceId, (record) => {
      if (replace) {
        record.entries = [];
        record.state = {};
      }
      record.state = { ...record.state, ...state };
    });

    const result = entries.length ? await appendEntries(req.params.deviceId, entries) : { added: 0 };
    const record = await readDevice(req.params.deviceId);
    res.status(201).json({ imported: result.added, stored: record.entries.length, replaced: replace });
  })
);

memoryRouter.delete(
  "/:deviceId",
  asyncRoute(async (req, res) => {
    await deleteDevice(req.params.deviceId);
    res.json({ deleted: true, deviceId: req.params.deviceId });
  })
);
