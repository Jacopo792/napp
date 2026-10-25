import WebSocket from "ws";

/** An accepted TCP connection or any non-403 response is not enough: the
 * server must actually upgrade the expected origins, and refuse foreign ones. */
export function checkOrigin(
  url: string,
  origin: string,
  accepted: boolean,
  timeout = 10_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, {
      origin,
      followRedirects: false,
      handshakeTimeout: timeout,
    });
    let settled = false;
    const timer = setTimeout(() => finish(new Error("WebSocket origin check timed out")), timeout);
    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.terminate();
      if (error) reject(error);
      else resolve();
    }
    socket.on("open", () =>
      finish(accepted ? undefined : new Error("A foreign origin was accepted")),
    );
    socket.on("unexpected-response", (_request, response) => {
      response.resume();
      finish(
        !accepted && response.statusCode === 403
          ? undefined
          : new Error(`Unexpected handshake HTTP ${response.statusCode}`),
      );
    });
    socket.on("error", () => finish(new Error("WebSocket handshake failed")));
  });
}

export async function checkRevision(url: URL, expected: string, timeout = 10_000): Promise<void> {
  const response = await fetch(new URL("/version", url), {
    signal: AbortSignal.timeout(timeout),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Version check returned HTTP ${response.status}`);
  const body = await response.json();
  if (body.revision !== expected)
    throw new Error("The server is not running the expected revision");
}
