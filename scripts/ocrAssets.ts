/* OCR's worker, WebAssembly and language data are shipped with both shells.
 * Fixed names matter: the worker picks a core according to CPU capabilities
 * and appends the language code to langPath. No third-party CDN is needed. */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import type { ViteDevServer } from "vite";

export function ocrAssets() {
  const require = createRequire(new URL("../packages/core/package.json", import.meta.url));
  const paths = new Map<string, string>([
    ["worker.min.js", require.resolve("tesseract.js/dist/worker.min.js")],
    ...["lstm", "simd-lstm", "relaxedsimd-lstm"].map(
      (name) =>
        [
          `tesseract-core-${name}.wasm.js`,
          require.resolve(`tesseract.js-core/tesseract-core-${name}.wasm.js`),
        ] as [string, string],
    ),
    ...["eng", "ita"].map(
      (language) =>
        [
          `${language}.traineddata.gz`,
          require.resolve(
            `@tesseract.js-data/${language}/4.0.0_best_int/${language}.traineddata.gz`,
          ),
        ] as [string, string],
    ),
  ]);
  return {
    name: "napp:ocr-assets",
    configureServer(server: Pick<ViteDevServer, "middlewares">) {
      server.middlewares.use((request, response, next) => {
        const name = request.url?.split("?")[0].replace(/^.*\/ocr\//, "");
        const path = name && paths.get(name);
        if (!path) return next();
        response.setHeader(
          "Content-Type",
          name!.endsWith(".js") ? "text/javascript" : "application/octet-stream",
        );
        response.end(readFileSync(path));
      });
    },
    generateBundle(this: {
      emitFile: (asset: { type: "asset"; fileName: string; source: Uint8Array }) => string;
    }) {
      for (const [name, path] of paths)
        this.emitFile({ type: "asset", fileName: `ocr/${name}`, source: readFileSync(path) });
    },
  };
}
