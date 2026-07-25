/**
 * اختبارات الباك اند — تعمل بلا اتصال بالإنترنت (لا تلمس GitHub).
 * التشغيل: npm test  (من جذر المشروع أو من مجلد server)
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

// نضبط البيئة قبل تحميل الوحدات لأن config يُقرأ عند الاستيراد
const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "noor-test-"));
process.env.DATA_DIR = tmpDir;
process.env.GITHUB_POLL_INTERVAL_MS = "0";
process.env.GITHUB_WEBHOOK_SECRET = "test-secret";
process.env.RATE_MAX = "10000";

const { createApp } = await import("../src/app.js");

const app = createApp();
const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const device = "test-device-0001";
const api = (pathname, options) => fetch(`${base}${pathname}`, options);
const postJSON = (pathname, body, method = "POST") =>
  api(pathname, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test.after(async () => {
  server.close();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test("الفحص الصحي يعمل", async () => {
  const res = await api("/api/health");
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
});

test("يرفض معرّف جهاز غير صالح", async () => {
  const res = await api("/api/memory/..%2Fescape/entries");
  assert.equal(res.status, 400);
});

test("يحفظ المدخلات ويقرأها", async () => {
  const res = await postJSON(`/api/memory/${device}/entries`, {
    entries: [
      { id: "e1", type: "setting", key: "theme", value: "light", at: "2026-01-01T10:00:00.000Z" },
      { id: "e2", type: "search", key: "surahSearch", value: "الفاتحة", at: "2026-01-01T11:00:00.000Z" },
    ],
  });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).added, 2);

  const list = await (await api(`/api/memory/${device}/entries`)).json();
  assert.equal(list.total, 2);
  // الأحدث أولاً
  assert.equal(list.entries[0].id, "e2");
});

test("لا يكرّر المدخل بنفس المعرّف", async () => {
  const res = await postJSON(`/api/memory/${device}/entries`, {
    entries: [{ id: "e1", type: "setting", key: "theme", value: "light" }],
  });
  assert.equal((await res.json()).added, 0);
});

test("البحث والترشيح داخل المدخلات", async () => {
  const byType = await (await api(`/api/memory/${device}/entries?type=search`)).json();
  assert.equal(byType.total, 1);

  const byQuery = await (await api(`/api/memory/${device}/entries?q=الفاتحة`)).json();
  assert.equal(byQuery.total, 1);

  const noMatch = await (await api(`/api/memory/${device}/entries?q=لا-يوجد`)).json();
  assert.equal(noMatch.total, 0);
});

test("يدمج الحالة ويستبدلها عند الطلب", async () => {
  await postJSON(`/api/memory/${device}/state`, { state: { theme: "dark" } }, "PUT");
  await postJSON(`/api/memory/${device}/state`, { state: { quranFont: "amiri" } }, "PUT");

  let state = (await (await api(`/api/memory/${device}/state`)).json()).state;
  assert.deepEqual(state, { theme: "dark", quranFont: "amiri" });

  await postJSON(`/api/memory/${device}/state?replace=1`, { state: { theme: "light" } }, "PUT");
  state = (await (await api(`/api/memory/${device}/state`)).json()).state;
  assert.deepEqual(state, { theme: "light" });
});

test("الإحصاءات والتصدير", async () => {
  const stats = await (await api(`/api/memory/${device}/stats`)).json();
  assert.equal(stats.stored, 2);
  assert.equal(stats.byType.setting, 1);

  const exported = await (await api(`/api/memory/${device}/export`)).json();
  assert.equal(exported.format, "noor-memory@1");
  assert.equal(exported.entries.length, 2);
});

test("حذف مدخل واحد ثم مسح الكل", async () => {
  const one = await api(`/api/memory/${device}/entries/e1`, { method: "DELETE" });
  assert.equal((await one.json()).removed, 1);

  const missing = await api(`/api/memory/${device}/entries/e1`, { method: "DELETE" });
  assert.equal(missing.status, 404);

  const all = await api(`/api/memory/${device}/entries`, { method: "DELETE" });
  assert.equal((await all.json()).removed, 1);
});

test("الكتابات المتوازية لا تفقد مدخلات", async () => {
  const parallel = "test-device-parallel";
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      postJSON(`/api/memory/${parallel}/entries`, {
        entries: [{ id: `p${i}`, type: "field", key: "k", value: String(i) }],
      })
    )
  );
  const list = await (await api(`/api/memory/${parallel}/entries?limit=100`)).json();
  assert.equal(list.total, 20);
});

test("الويب هوك يرفض التوقيع الخاطئ", async () => {
  const res = await api("/api/github/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-github-event": "push", "x-hub-signature-256": "sha256=00" },
    body: JSON.stringify({ ref: "refs/heads/main" }),
  });
  assert.equal(res.status, 401);
});

test("الويب هوك يقبل التوقيع الصحيح ويحدّث النسخة", async () => {
  const payload = JSON.stringify({
    ref: "refs/heads/main",
    after: "a".repeat(40),
    head_commit: { id: "a".repeat(40), message: "تحديث تجريبي", timestamp: "2026-01-02T00:00:00Z" },
  });
  const signature = `sha256=${crypto.createHmac("sha256", "test-secret").update(payload).digest("hex")}`;

  const res = await api("/api/github/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-github-event": "push", "x-hub-signature-256": signature },
    body: payload,
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { accepted: true, changed: true, event: "push" });

  const version = await (await api("/api/version")).json();
  assert.equal(version.sha, "a".repeat(40));
});

test("فحص التحديث يقارن نسخة العميل", async () => {
  const same = await (await api(`/api/updates/check?current=${"a".repeat(40)}`)).json();
  assert.equal(same.updateAvailable, false);

  const older = await (await api("/api/updates/check?current=b1b1b1b")).json();
  assert.equal(older.updateAvailable, true);
});

test("الويب هوك يتجاهل الفروع غير المراقَبة", async () => {
  const payload = JSON.stringify({ ref: "refs/heads/other", after: "c".repeat(40) });
  const signature = `sha256=${crypto.createHmac("sha256", "test-secret").update(payload).digest("hex")}`;
  const res = await api("/api/github/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-github-event": "push", "x-hub-signature-256": signature },
    body: payload,
  });
  const body = await res.json();
  assert.equal(body.changed, false);
});

test("قناة البثّ ترسل ترويسة SSE وحدث hello", async () => {
  const controller = new AbortController();
  const res = await fetch(`${base}/api/updates/stream`, { signal: controller.signal });
  assert.equal(res.headers.get("content-type"), "text/event-stream; charset=utf-8");

  const reader = res.body.getReader();
  const chunk = new TextDecoder().decode((await reader.read()).value);
  assert.ok(chunk.includes("متصل"));
  controller.abort();
});

test("يعيد إنشاء مجلد البيانات إذا حُذف أثناء التشغيل", async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  const res = await postJSON(`/api/memory/${device}/entries`, {
    entries: [{ id: "after-rm", type: "action", key: "k", value: "v" }],
  });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).added, 1);
});
