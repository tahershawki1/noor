/** وسائط مشتركة: حدّ الطلبات، توكن اختياري، تغليف الأخطاء. */
import { config } from "./config.js";

/** حدّ طلبات بسيط في الذاكرة (نافذة ثابتة لكل IP). */
export function rateLimit() {
  const hits = new Map();

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of hits) {
      if (now > record.resetAt) hits.delete(ip);
    }
  }, config.limits.rateWindowMs);
  sweep.unref?.();

  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    let record = hits.get(ip);

    if (!record || now > record.resetAt) {
      record = { count: 0, resetAt: now + config.limits.rateWindowMs };
      hits.set(ip, record);
    }
    record.count += 1;

    res.setHeader("X-RateLimit-Limit", config.limits.rateMax);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, config.limits.rateMax - record.count));

    if (record.count > config.limits.rateMax) {
      res.setHeader("Retry-After", Math.ceil((record.resetAt - now) / 1000));
      return res.status(429).json({ error: "طلبات كثيرة جداً، حاول بعد قليل" });
    }
    return next();
  };
}

/** يطلب ترويسة ‎x-noor-token‎ فقط إذا ضُبط ‎API_TOKEN‎ في البيئة. */
export function requireToken(req, res, next) {
  if (!config.apiToken) return next();
  const provided = req.get("x-noor-token") || "";
  if (provided === config.apiToken) return next();
  return res.status(401).json({ error: "توكن غير صالح" });
}

/** يلفّ معالجاً غير متزامن لتمرير أخطائه إلى معالج الأخطاء. */
export const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

export function notFound(_req, res) {
  res.status(404).json({ error: "المسار غير موجود" });
}

export function errorHandler(err, _req, res, _next) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error("[error]", err);
  res.status(status).json({
    error: status >= 500 ? "خطأ داخلي في الخادم" : err.message,
  });
}
