import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";

const LIMIT = 20 * 1024 * 1024;
export function publicAddress(address: string): boolean {
  if (isIP(address) === 6)
    return (
      /^[23][0-9a-f]{3}:/i.test(address) &&
      !/^2001:(?:0:|db8:|10:|20:)/i.test(address) &&
      !/^2002:/i.test(address)
    );
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return (
    a !== 0 &&
    a !== 10 &&
    a !== 127 &&
    a < 224 &&
    !(a === 169 && b === 254) &&
    !(a === 172 && b >= 16 && b <= 31) &&
    !(a === 192 && (b === 168 || b === 0 || b === 2)) &&
    !(a === 100 && b >= 64 && b <= 127) &&
    !(a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) &&
    !(a === 203 && b === 0 && c === 113)
  );
}

/** Fetch only public HTTPS images. Pin the validated DNS answer for each redirect. */
export async function importImage(
  source: string,
  redirects = 0,
): Promise<{ bytes: Buffer; type: string }> {
  const url = new URL(source);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    redirects > 3
  )
    throw new Error("Image address is not supported");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await lookup(host, { all: true });
  if (!addresses.length || addresses.some(({ address }) => !publicAddress(address)))
    throw new Error("Image address is not public");
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        lookup: (_hostname, _options, callback) => callback(null, [address]),
        headers: {
          accept: "image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/avif",
        },
      },
      (response) => {
        if (
          [301, 302, 303, 307, 308].includes(response.statusCode ?? 0) &&
          response.headers.location
        ) {
          response.resume();
          resolve(importImage(new URL(response.headers.location, url).href, redirects + 1));
          return;
        }
        const rawType = response.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() ?? "";
        // Normalise jpeg aliases; the blob type is what prepareImageForNote checks.
        const type = rawType === "image/jpg" || rawType === "image/pjpeg" ? "image/jpeg" : rawType;
        if (
          response.statusCode !== 200 ||
          ![
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/gif",
            "image/svg+xml",
            "image/avif",
          ].includes(type)
        ) {
          response.resume();
          reject(new Error("Source did not return an image"));
          return;
        }
        if (Number(response.headers["content-length"]) > LIMIT) {
          response.destroy();
          reject(new Error("Image exceeds 20 MB"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > LIMIT) {
            response.destroy(new Error("Image exceeds 20 MB"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve({ bytes: Buffer.concat(chunks), type }));
        response.on("error", reject);
      },
    );
    const timer = setTimeout(() => req.destroy(new Error("Image request timed out")), 15000);
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
    req.end();
  });
}
