/** تجميع تطبيق Express: الوسائط، المسارات، خدمة ملفات الواجهة. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { errorHandler, notFound, rateLimit } from "./middleware.js";
import { memoryRouter } from "./routes/memory.js";
import { updatesRouter } from "./routes/updates.js";
import { bus } from "./sse.js";
import { getStatus } from "./github.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "../../islamic-app");

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(
    cors({
      origin: config.allowedOrigins.length ? config.allowedOrigins : true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "x-noor-token"],
      maxAge: 86_400,
    })
  );

  app.use(
    express.json({
      limit: config.limits.jsonBodyLimit,
      // نحتفظ بالبايتات الخام للتحقق من توقيع ويب هوك GitHub
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  app.use("/api", rateLimit());

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      uptimeSeconds: Math.round(process.uptime()),
      liveClients: bus.size,
      github: {
        repo: config.github.repo,
        branch: config.github.branch,
        lastCheckedAt: getStatus().lastCheckedAt,
      },
    });
  });

  app.use("/api", updatesRouter);
  app.use("/api/memory", memoryRouter);

  // خدمة واجهة التطبيق من نفس الخادم (مفيد للتشغيل المحلي والاستضافة الذاتية)
  app.use(
    express.static(webRoot, {
      // ملفات الواجهة قصيرة العمر حتى يصل التحديث فوراً، والخطوط/الصور أطول
      setHeaders: (res, filePath) => {
        if (/\.(html|json)$/.test(filePath)) res.setHeader("Cache-Control", "no-cache");
        else res.setHeader("Cache-Control", "public, max-age=300");
      },
    })
  );

  app.use("/api", notFound);
  app.use(errorHandler);
  return app;
}
