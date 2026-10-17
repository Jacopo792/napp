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
