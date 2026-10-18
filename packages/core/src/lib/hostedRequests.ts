/* The two halves of the hosted editor use the same request lifetime. A late
 * response from a closed note cannot settle a request in the next one. */
export class HostedRequests {
  private pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (reason: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  request<T>(id: string, send: () => void, timeoutMs: number): Promise<T> {
    if (this.pending.has(id)) return Promise.reject(new Error("Duplicate editor request"));
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => this.settle(id, null, "The editor operation timed out"),
        timeoutMs,
      );
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
      try {
        send();
      } catch (reason) {
        this.settle(id, null, reason instanceof Error ? reason.message : String(reason));
      }
    });
  }

  settle(id: string, value?: unknown, error?: string | null): boolean {
    const pending = this.pending.get(id);
    if (!pending) return false;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    if (error) pending.reject(new Error(error));
    else pending.resolve(value);
    return true;
  }

  reset(message: string): void {
    for (const id of this.pending.keys()) this.settle(id, null, message);
  }
}

/** Whether an access token will still be honoured `marginMs` from `now`.
 *  The hosted page holds an access token and no refresh token, so a token it
 *  cannot use is one it must ask the app for — never one it tries to refresh,
 *  because that refresh fails, signs the page out and drops every open note. */
export function tokenUsable(token: string | null, now: number, marginMs = 60_000): boolean {
  try {
    const part = token?.split(".")[1];
    if (!part) return false;
    const { exp } = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as {
      exp?: unknown;
    };
    return typeof exp === "number" && exp * 1000 - now > marginMs;
  } catch {
    return false;
  }
}
