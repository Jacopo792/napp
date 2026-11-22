import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const dist = new URL("../apps/web/dist/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL(".vite/manifest.json", dist), "utf8"));
const entry = "index.html";

function routeSize(routeName) {
  const route = manifest[entry].dynamicImports.find((key) => manifest[key].name === routeName);
  if (!route) throw new Error(`Missing lazy web route: ${routeName}`);
  const visited = new Set();
  const files = new Set();
  function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const { file, imports = [], css = [] } = manifest[key];
    files.add(file);
    for (const stylesheet of css) files.add(stylesheet);
    for (const dependency of imports) visit(dependency);
  }
  visit(entry);
  visit(route);
  return [...files].reduce(
    (bytes, file) => bytes + gzipSync(readFileSync(new URL(file, dist))).byteLength,
    0,
  );
}

for (const [route, limit] of [
  ["Login", 240],
  ["Notes", 550],
]) {
  const kib = routeSize(route) / 1024;
  console.log(`${route}: ${kib.toFixed(1)} KiB gzip (budget: ${limit} KiB)`);
  if (kib > limit) process.exitCode = 1;
}
