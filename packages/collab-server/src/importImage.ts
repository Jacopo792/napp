import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";

const LIMIT = 20 * 1024 * 1024;
const FETCH_TIMEOUT = 15_000;
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

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];

/** Fetch only public HTTPS images. */
export async function importImage(source: string): Promise<{ bytes: Buffer; type: string }> {
  return fetchPublic(source, IMAGE_TYPES, LIMIT);
}

/** GET a public HTTPS address and return its body if it is one of `types`.
 *  Pin the validated DNS answer for each redirect, so a name cannot be
 *  checked as public and then connected to as private. */
export async function fetchPublic(
  source: string,
  types: string[],
  limit: number,
  redirects = 0,
  deadline = Date.now() + FETCH_TIMEOUT,
): Promise<{ bytes: Buffer; type: string; url: string }> {
  if (source.length > 8192) throw new Error("Address is too long");
  const url = new URL(source);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    redirects > 3
  )
    throw new Error("Address is not supported");
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("Request timed out");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(host, { all: true }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("DNS lookup timed out")), remaining);
    }),
  ]).finally(() => clearTimeout(timer));
  if (!addresses.length || addresses.some(({ address }) => !publicAddress(address)))
    throw new Error("Address is not public");
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
        lookup: (_hostname, _options, callback) => callback(null, [address]),
        headers: {
          accept: types.join(","),
          /* Sites hand their preview tags to link unfurlers, and some refuse
             a request that names no client at all. */
          "user-agent": "Mozilla/5.0 (compatible; NappLinkPreview/1.0)",
          "accept-language": "en,*;q=0.5",
        },
      },
      (response) => {
        response.on("error", reject);
        if (
          [301, 302, 303, 307, 308].includes(response.statusCode ?? 0) &&
          response.headers.location
        ) {
          const destination = URL.parse(response.headers.location, url);
          response.destroy();
          if (!destination) {
            reject(new Error("Invalid redirect address"));
            return;
          }
          resolve(fetchPublic(destination.href, types, limit, redirects + 1, deadline));
          return;
        }
        const rawType = response.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() ?? "";
        // Normalise jpeg aliases; the blob type is what prepareImageForNote checks.
        const type = rawType === "image/jpg" || rawType === "image/pjpeg" ? "image/jpeg" : rawType;
        if (response.statusCode !== 200 || !types.includes(type)) {
          response.destroy();
          reject(new Error("Source did not return what was asked for"));
          return;
        }
        /* A page's preview tags are in its head: a long page is read only
           as far as the limit, never refused for its length. */
        const partial = type === "text/html";
        if (!partial && Number(response.headers["content-length"]) > limit) {
          response.destroy();
          reject(new Error("Response is too large"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > limit) {
            if (partial) {
              chunks.push(chunk.subarray(0, limit - (size - chunk.length)));
              response.destroy();
              resolve({ bytes: Buffer.concat(chunks), type, url: url.href });
            } else response.destroy(new Error("Response is too large"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve({ bytes: Buffer.concat(chunks), type, url: url.href }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}
