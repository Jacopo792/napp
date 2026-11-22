export function contentSecurityPolicy(env: Record<string, string | undefined>, web = false) {
  const remote = [env.VITE_SUPABASE_URL, env.VITE_COLLAB_URL]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => {
      const url = new URL(value);
      const secure = url.protocol === "https:" || url.protocol === "wss:";
      return [
        `${secure ? "https" : "http"}://${url.host}`,
        `${secure ? "wss" : "ws"}://${url.host}`,
      ];
    });
  const scripts = ["'self'", "'wasm-unsafe-eval'"];
  const connect = ["'self'", "data:", "blob:", ...remote];
  const frames: string[] = [];
  const images = ["'self'", "data:", "blob:", ...remote];
  const styles = ["'self'", "'unsafe-inline'"];

  if (web) {
    scripts.push("https://js.stripe.com", "https://*.js.stripe.com", "https://checkout.stripe.com");
    frames.push(
      "https://js.stripe.com",
      "https://*.js.stripe.com",
      "https://checkout.stripe.com",
      "https://hooks.stripe.com",
      "https://link.com",
      "https://*.link.com",
    );
    connect.push(
      "https://api.stripe.com",
      "https://checkout.stripe.com",
      "https://r.stripe.com",
      "https://link.com",
      "https://*.link.com",
    );
    images.push("https://*.stripe.com", "https://*.link.com");
    // GIPHY requests are served by the collaboration origin above.
    if (env.VITE_GOOGLE_DRIVE_CLIENT_ID?.trim()) {
      scripts.push("https://accounts.google.com/gsi/client", "https://apis.google.com");
      frames.push(
        "https://accounts.google.com",
        "https://docs.google.com",
        "https://drive.google.com",
      );
      connect.push(
        "https://accounts.google.com",
        "https://www.googleapis.com",
        "https://content.googleapis.com",
      );
      images.push("https://*.googleusercontent.com", "https://*.gstatic.com");
      styles.push("https://accounts.google.com/gsi/style");
    }
  } else if (env.VITE_GOOGLE_DRIVE_DESKTOP_CLIENT_ID?.trim()) {
    connect.push("https://www.googleapis.com");
  }

  if (env.VITE_AUTH_CAPTCHA_SITE_KEY?.trim()) {
    const provider = env.VITE_AUTH_CAPTCHA_PROVIDER?.trim() || "turnstile";
    if (provider !== "hcaptcha" && provider !== "turnstile")
      throw new Error("Invalid Auth CAPTCHA provider");
    const hosts =
      provider === "hcaptcha"
        ? ["https://hcaptcha.com", "https://*.hcaptcha.com"]
        : ["https://challenges.cloudflare.com"];
    scripts.push(...hosts);
    frames.push(...hosts);
    connect.push(...hosts);
    styles.push(...hosts);
  }

  const policy = [
    "default-src 'self'",
    `script-src ${scripts.join(" ")}`,
    `style-src ${styles.join(" ")}`,
    `img-src ${images.join(" ")}`,
    "font-src 'self' data:",
    `connect-src ${connect.join(" ")}`,
    `media-src 'self' data: blob: ${remote.join(" ")}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    `frame-src ${frames.length ? frames.join(" ") : "'none'"}`,
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; ");

  return {
    name: "napp:content-security-policy",
    transformIndexHtml: {
      order: "pre" as const,
      handler: (html: string, context: { server?: unknown }) =>
        context.server
          ? html
          : html.replace(
              "<!--content-security-policy-->",
              `<meta http-equiv="Content-Security-Policy" content="${policy}" />`,
            ),
    },
  };
}
