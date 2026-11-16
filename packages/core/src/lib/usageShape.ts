export interface UsageDevice {
  client: "web" | "desktop" | "mobile";
  device: string;
  os: string;
  browser: string;
}

export const USAGE_CLIENT = { web: "Web", desktop: "Desktop app", mobile: "Phone app" } as const;

/** "Now", "42 minutes ago", "3 days ago", then a date. */
export function usageAgo(iso: string, now = Date.now()) {
  const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const minutes = Math.round((Date.parse(iso) - now) / 60_000);
  if (minutes > -1) return "Now";
  if (minutes > -60) return relative.format(minutes, "minute");
  if (minutes > -1440) return relative.format(Math.round(minutes / 60), "hour");
  if (minutes > -10080) return relative.format(Math.round(minutes / 1440), "day");
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Deliberately coarse: browsers do not reliably expose a hardware model. */
export function webUsageDevice(
  client: UsageDevice["client"],
  ua: string,
  touchPoints = 0,
): UsageDevice {
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
  const os =
    ipad || /iPhone|iPod/.test(ua)
      ? "iOS"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac/.test(ua)
            ? "macOS"
            : /Linux/.test(ua)
              ? "Linux"
              : "Unknown";
  const device = ipad
    ? "iPad"
    : /iPhone/.test(ua)
      ? "iPhone"
      : /Android/.test(ua)
        ? /Mobile/.test(ua)
          ? "Android phone"
          : "Android tablet"
        : "Computer";
  const browser =
    client !== "web"
      ? ""
      : /Edg(?:e|A|iOS)?\//.test(ua)
        ? "Edge"
        : /OPR\//.test(ua)
          ? "Opera"
          : /Firefox|FxiOS/.test(ua)
            ? "Firefox"
            : /Chrome|CriOS/.test(ua)
              ? "Chrome"
              : /Safari/.test(ua)
                ? "Safari"
                : "Unknown";
  return { client, device, os, browser };
}

/** Send on real interactions only; an idle open window never gets a heartbeat. */
export function createActivityReporter(send: () => PromiseLike<unknown>, now = Date.now) {
  let last = -Infinity;
  let busy = false;
  return async () => {
    if (busy || now() - last < 60_000) return;
    last = now();
    busy = true;
    try {
      await send();
    } catch {
      /* Usage must never interrupt writing. */
    } finally {
      busy = false;
    }
  };
}
