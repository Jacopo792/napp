/* One worker for an explicit indexing run, loaded only when asked. Both shells
 * recognize locally; an Electron Vision bridge would fork the recognizer and
 * leave Windows and the web needing this one anyway. */
export async function textRecognizer() {
  const { createWorker, OEM } = await import("tesseract.js");
  const path = new URL(`${import.meta.env.BASE_URL}ocr/`, window.location.href).href;
  const worker = await createWorker("ita+eng", OEM.LSTM_ONLY, {
    workerPath: `${path}worker.min.js`,
    corePath: path,
    langPath: path,
  });
  return {
    async read(blob: Blob | HTMLCanvasElement): Promise<string> {
      const result = await worker.recognize(blob);
      return result.data.text.trim();
    },
    close: () => worker.terminate(),
  };
}
