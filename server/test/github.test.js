/**
 * اختبار طبقة GitHub مقابل واجهة وهمية محلية — بلا إنترنت.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

// خادم وهمي يحاكي api.github.com
let currentSha = "1".repeat(40);
const mock = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/repos/owner/repo/commits/main") {
    return res.end(
      JSON.stringify({
        sha: currentSha,
        commit: {
          message: "عنوان التغيير\n\nتفاصيل إضافية",
          author: { name: "طاهر", date: "2026-02-01T09:00:00Z" },
        },
        html_url: `https://github.com/owner/repo/commit/${currentSha}`,
      })
    );
  }
  if (req.url === "/repos/owner/repo/releases/latest") {
    res.statusCode = 404;
    return res.end(JSON.stringify({ message: "Not Found" }));
  }
  res.statusCode = 404;
  res.end("{}");
});

mock.listen(0);
await new Promise((resolve) => mock.once("listening", resolve));

process.env.GITHUB_API_BASE = `http://127.0.0.1:${mock.address().port}`;
process.env.GITHUB_REPO = "owner/repo";
process.env.GITHUB_BRANCH = "main";
process.env.GITHUB_CACHE_TTL_MS = "60000";
process.env.GITHUB_POLL_INTERVAL_MS = "0";

const { refreshFromGitHub, getLatest, compareWithClient } = await import("../src/github.js");
const { bus } = await import("../src/sse.js");

test.after(() => mock.close());

test("يقرأ آخر commit ويهذّب حقوله", async () => {
  const latest = await refreshFromGitHub({ force: true });
  assert.equal(latest.sha, currentSha);
  assert.equal(latest.shortSha, currentSha.slice(0, 7));
  // نأخذ السطر الأول من رسالة الـ commit فقط
  assert.equal(latest.message, "عنوان التغيير");
  assert.equal(latest.author, "طاهر");
  // غياب الإصدارات (404) ليس خطأ
  assert.equal(latest.release, null);
});

test("غياب الإصدار لا يمنع النتيجة ولا يفقد الـ sha", () => {
  assert.equal(getLatest().sha, currentSha);
});

test("المقارنة مع نسخة العميل", () => {
  assert.equal(compareWithClient(currentSha).updateAvailable, false);
  assert.equal(compareWithClient(currentSha.slice(0, 7)).updateAvailable, false);
  assert.equal(compareWithClient("9".repeat(40)).updateAvailable, true);
  // بلا نسخة عميل لا ندّعي وجود تحديث
  assert.equal(compareWithClient("").updateAvailable, false);
});

test("تغيّر الـ sha يُبثّ للمشتركين", async () => {
  const received = [];
  const fakeClient = {
    write: (chunk) => received.push(chunk),
    writeHead: () => {},
    on: () => {},
  };
  bus.subscribe(fakeClient, { latest: getLatest() });

  currentSha = "2".repeat(40);
  await refreshFromGitHub({ force: true });

  const payload = received.join("");
  assert.ok(payload.includes("event: update"), "توقّعنا حدث update");
  assert.ok(payload.includes(currentSha), "توقّعنا الـ sha الجديد في الحمولة");
});

test("الذاكرة المؤقتة تمنع الطلب المتكرر", async () => {
  const before = getLatest().checkedAt;
  currentSha = "3".repeat(40);
  const cached = await refreshFromGitHub(); // بلا force
  assert.equal(cached.checkedAt, before);
  assert.notEqual(cached.sha, currentSha);
});
