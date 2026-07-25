/** نقطة تشغيل باك اند نور. */
import { createApp } from "./src/app.js";
import { config } from "./src/config.js";
import { startPolling, stopPolling } from "./src/github.js";

const app = createApp();
const server = app.listen(config.port, config.host, () => {
  console.log(`✔ باك اند نور يعمل على http://${config.host}:${config.port}`);
  console.log(`  المستودع المراقَب: ${config.github.repo}#${config.github.branch}`);
  console.log(`  مجلد البيانات: ${config.dataDir}`);
  if (!config.github.webhookSecret) {
    console.log("  ℹ الويب هوك غير مُفعّل — سيُعتمد الاستطلاع الدوري فقط");
  }
  startPolling();
});

const shutdown = (signal) => {
  console.log(`\n${signal} — إيقاف الخادم...`);
  stopPolling();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 8000).unref();
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
