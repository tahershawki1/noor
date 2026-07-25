/**
 * قناة بثّ حيّة ‎(Server-Sent Events)‎ — يستخدمها العميل ليعرف بالتحديث لحظة نشره
 * دون انتظار دورة الاستطلاع.
 */
const clients = new Set();
const HEARTBEAT_MS = 25_000;

function write(res, event, data) {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

export const bus = {
  /** يسجّل استجابة HTTP مفتوحة كمشترك في البثّ. */
  subscribe(res, hello) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(": متصل بقناة تحديثات نور\n\n");
    if (hello) write(res, "hello", hello);

    clients.add(res);
    const heartbeat = setInterval(() => {
      if (!write(res, "ping", { at: new Date().toISOString() })) cleanup();
    }, HEARTBEAT_MS);
    heartbeat.unref?.();

    const cleanup = () => {
      clearInterval(heartbeat);
      clients.delete(res);
    };
    res.on("close", cleanup);
    res.on("error", cleanup);
    return cleanup;
  },

  broadcast(event, data) {
    for (const res of clients) {
      if (!write(res, event, data)) clients.delete(res);
    }
    return clients.size;
  },

  get size() {
    return clients.size;
  },
};
