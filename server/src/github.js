/**
 * مراقبة تحديثات GitHub.
 *
 * مصدران للحقيقة:
 *  1. استطلاع دوري لواجهة GitHub (‎/commits/<branch>‎ و ‎/releases/latest‎).
 *  2. ويب هوك ‎push‎ من GitHub — يصل خلال ثوانٍ من النشر ويُحدّث الحالة فوراً.
 *
 * أي تغيّر في آخر commit يُبثّ لكل العملاء المتصلين عبر SSE.
 */
import crypto from "node:crypto";
import { config } from "./config.js";
import { bus } from "./sse.js";

const state = {
  latest: null, // آخر معلومات معروفة عن المستودع
  fetchedAt: 0,
  lastError: null,
  source: "none", // poll | webhook | none
};

function ghHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "noor-backend",
  };
  if (config.github.token) headers.Authorization = `Bearer ${config.github.token}`;
  return headers;
}

async function ghFetch(pathname) {
  const url = `${config.github.apiBase}/repos/${config.github.repo}${pathname}`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const error = new Error(`GitHub ${res.status} على ${pathname}: ${body.slice(0, 200)}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

function shapeCommit(commit) {
  return {
    sha: commit.sha,
    shortSha: String(commit.sha || "").slice(0, 7),
    message: commit.commit?.message?.split("\n")[0] || "",
    author: commit.commit?.author?.name || commit.author?.login || "",
    date: commit.commit?.author?.date || commit.commit?.committer?.date || null,
    url: commit.html_url || "",
  };
}

/** يجلب آخر commit (وآخر إصدار إن وُجد) من GitHub ويحدّث الحالة. */
export async function refreshFromGitHub({ force = false } = {}) {
  const fresh = Date.now() - state.fetchedAt < config.github.cacheTtlMs;
  if (!force && fresh && state.latest) return state.latest;

  const branch = encodeURIComponent(config.github.branch);
  const commit = await ghFetch(`/commits/${branch}`);
  const latest = {
    repo: config.github.repo,
    branch: config.github.branch,
    ...shapeCommit(commit),
    release: null,
    checkedAt: new Date().toISOString(),
  };

  // الإصدار اختياري تماماً — غياب الإصدارات ليس خطأ
  try {
    const release = await ghFetch("/releases/latest");
    latest.release = {
      tag: release.tag_name,
      name: release.name,
      publishedAt: release.published_at,
      url: release.html_url,
      notes: String(release.body || "").slice(0, 4000),
    };
  } catch (err) {
    if (err.status !== 404) state.lastError = err.message;
  }

  applyLatest(latest, "poll");
  return state.latest;
}

/** يعتمد معلومات جديدة ويبثّها للعملاء إن تغيّر الـ sha. */
function applyLatest(latest, source) {
  const changed = state.latest?.sha !== latest.sha;
  const previous = state.latest;
  state.latest = { ...state.latest, ...latest };
  state.fetchedAt = Date.now();
  state.source = source;
  state.lastError = null;

  if (changed) {
    bus.broadcast("update", {
      latest: state.latest,
      previousSha: previous?.sha || null,
      source,
    });
  }
  return changed;
}

export function getLatest() {
  return state.latest;
}

export function getStatus() {
  return {
    repo: config.github.repo,
    branch: config.github.branch,
    authenticated: Boolean(config.github.token),
    webhookConfigured: Boolean(config.github.webhookSecret),
    pollIntervalMs: config.github.pollIntervalMs,
    lastCheckedAt: state.fetchedAt ? new Date(state.fetchedAt).toISOString() : null,
    lastError: state.lastError,
    source: state.source,
    latest: state.latest,
  };
}

/** يقارن نسخة العميل بآخر ما نعرفه. */
export function compareWithClient(currentSha) {
  const latest = state.latest;
  if (!latest) return { updateAvailable: false, latest: null, reason: "unknown" };
  if (!currentSha) return { updateAvailable: false, latest, reason: "no-client-version" };
  const same = latest.sha === currentSha || latest.sha.startsWith(currentSha) || currentSha.startsWith(latest.shortSha);
  return { updateAvailable: !same, latest, current: currentSha };
}

/** تحقّق توقيع ويب هوك GitHub — مقارنة ثابتة الزمن. */
export function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!config.github.webhookSecret) return false;
  if (typeof signatureHeader !== "string" || !signatureHeader.startsWith("sha256=")) return false;

  const expected = `sha256=${crypto
    .createHmac("sha256", config.github.webhookSecret)
    .update(rawBody)
    .digest("hex")}`;

  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** يعالج حمولة الويب هوك ويعيد ما إذا كان هناك تغيير فعلي. */
export function handleWebhookEvent(event, payload) {
  if (event === "ping") return { accepted: true, changed: false, event };

  if (event === "push") {
    const ref = payload.ref || "";
    if (ref !== `refs/heads/${config.github.branch}`) {
      return { accepted: true, changed: false, event, ignored: `فرع غير مراقَب: ${ref}` };
    }
    const head = payload.head_commit || {};
    const changed = applyLatest(
      {
        repo: config.github.repo,
        branch: config.github.branch,
        sha: head.id || payload.after,
        shortSha: String(head.id || payload.after || "").slice(0, 7),
        message: String(head.message || "").split("\n")[0],
        author: head.author?.name || payload.pusher?.name || "",
        date: head.timestamp || new Date().toISOString(),
        url: head.url || payload.compare || "",
        checkedAt: new Date().toISOString(),
      },
      "webhook"
    );
    return { accepted: true, changed, event };
  }

  if (event === "release" && payload.action === "published") {
    // إصدار جديد: نُجبر قراءة حديثة من GitHub لالتقاط الوسم والملاحظات
    refreshFromGitHub({ force: true }).catch(() => {});
    return { accepted: true, changed: true, event };
  }

  return { accepted: true, changed: false, event, ignored: "حدث غير مُعالَج" };
}

let timer = null;

/** يبدأ الاستطلاع الدوري لـ GitHub. */
export function startPolling() {
  if (timer || config.github.pollIntervalMs <= 0) return;

  const tick = () =>
    refreshFromGitHub({ force: true }).catch((err) => {
      state.lastError = err.message;
      console.warn("[github] تعذّر جلب التحديثات:", err.message);
    });

  tick();
  timer = setInterval(tick, config.github.pollIntervalMs);
  timer.unref?.();
}

export function stopPolling() {
  if (timer) clearInterval(timer);
  timer = null;
}
