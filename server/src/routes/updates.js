/**
 * واجهات التحديث.
 *
 *  GET  /api/version              نسخة الخادم وآخر ما يعرفه عن المستودع
 *  GET  /api/updates/check        هل يوجد تحديث أحدث من نسخة العميل؟
 *  GET  /api/updates/latest       آخر commit/إصدار (مع إجبار التحديث ‎?force=1‎)
 *  GET  /api/updates/stream       بثّ حيّ ‎(SSE)‎ — يصل الإشعار لحظة النشر
 *  POST /api/github/webhook       ويب هوك GitHub (يتطلب ‎GITHUB_WEBHOOK_SECRET‎)
 */
import { Router } from "express";
import { config } from "../config.js";
import {
  compareWithClient,
  getLatest,
  getStatus,
  handleWebhookEvent,
  refreshFromGitHub,
  verifyWebhookSignature,
} from "../github.js";
import { bus } from "../sse.js";
import { asyncRoute } from "../middleware.js";

export const updatesRouter = Router();

updatesRouter.get("/version", (_req, res) => {
  const latest = getLatest();
  res.json({
    app: "noor",
    appVersion: config.appVersion,
    repo: config.github.repo,
    branch: config.github.branch,
    sha: latest?.sha || null,
    shortSha: latest?.shortSha || null,
    release: latest?.release || null,
    checkedAt: latest?.checkedAt || null,
    liveClients: bus.size,
  });
});

updatesRouter.get(
  "/updates/check",
  asyncRoute(async (req, res) => {
    // ‎current‎ هو sha النسخة التي يعمل بها العميل الآن
    const current = String(req.query.current || req.query.sha || "").trim();
    try {
      await refreshFromGitHub({ force: req.query.force === "1" });
    } catch (err) {
      // لو فشل الاتصال بـ GitHub نردّ بآخر ما نعرفه بدل رفض الطلب
      if (!getLatest()) return res.status(503).json({ error: "تعذّر الوصول إلى GitHub", detail: err.message });
    }
    res.json({ ...compareWithClient(current), checkedAt: new Date().toISOString() });
  })
);

updatesRouter.get(
  "/updates/latest",
  asyncRoute(async (req, res) => {
    await refreshFromGitHub({ force: req.query.force === "1" }).catch(() => {});
    res.json(getStatus());
  })
);

updatesRouter.get("/updates/stream", (req, res) => {
  req.socket.setTimeout(0);
  req.socket.setNoDelay?.(true);
  req.socket.setKeepAlive?.(true);
  bus.subscribe(res, { latest: getLatest(), at: new Date().toISOString() });
});

updatesRouter.post("/github/webhook", (req, res) => {
  if (!config.github.webhookSecret) {
    return res.status(503).json({ error: "الويب هوك غير مُفعّل (اضبط GITHUB_WEBHOOK_SECRET)" });
  }
  // ‎req.rawBody‎ يملؤه المُحلّل في ‎app.js‎ — التوقيع يُحسب على البايتات الخام
  if (!verifyWebhookSignature(req.rawBody || Buffer.alloc(0), req.get("x-hub-signature-256"))) {
    return res.status(401).json({ error: "توقيع غير صالح" });
  }

  const event = req.get("x-github-event") || "unknown";
  const result = handleWebhookEvent(event, req.body || {});
  res.json(result);
});
