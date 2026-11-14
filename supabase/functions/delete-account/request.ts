/** Bound bytes while streaming: Content-Length may be absent or dishonest. */
export async function readErasureRequest(request: Request): Promise<Record<string, unknown>> {
  const limit = 8192;
  const tooLarge = () => new RangeError("Request too large");
  if (Number(request.headers.get("content-length")) > limit) {
    await request.body?.cancel();
    throw tooLarge();
  }
  if (!request.body) throw new SyntaxError("Invalid request");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new SyntaxError("Invalid request");
  return body as Record<string, unknown>;
}
