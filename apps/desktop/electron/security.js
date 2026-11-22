const path = require("node:path");

/* Development only: a second checkout can serve its preview on its own port
   (`NAPP_DEV_PORT=5175`) so two windows never share one server. */
const DEV_ORIGIN = `http://localhost:${Number(process.env.NAPP_DEV_PORT) || 5174}`;

function trustedRendererUrl(value, isDev) {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    return isDev ? url.origin === DEV_ORIGIN : url.protocol === "app:" && url.host === "notes";
  } catch {
    return false;
  }
}

function trustedSender(event, isDev) {
  const frame = event.senderFrame;
  return !!frame && frame === event.sender.mainFrame && trustedRendererUrl(frame.url, isDev);
}

function rendererPermission(permission, url, isDev) {
  return (
    ["clipboard-sanitized-write", "local-fonts", "fullscreen"].includes(permission) &&
    trustedRendererUrl(url, isDev)
  );
}

/** Decode once and enforce a directory boundary, including Windows separators. */
function rendererFile(root, value) {
  const url = new URL(value);
  if (url.protocol !== "app:" || url.host !== "notes" || url.username || url.password)
    throw new Error("Invalid renderer origin");
  const pathname = decodeURIComponent(url.pathname);
  if (pathname.includes("\\") || pathname.includes("\0")) throw new Error("Invalid asset path");
  const asset = path.resolve(root, `.${pathname}`);
  const relative = path.relative(root, asset);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    throw new Error("Invalid asset path");
  return pathname === "/" || !path.extname(pathname) ? path.join(root, "index.html") : asset;
}

/** Attachments can come from another account; never interpret a name as a path. */
function safeFileName(value) {
  if (typeof value !== "string") throw new Error("Invalid filename");
  const name = path.posix.basename(value.replace(/\\/g, "/"));
  if (
    !name ||
    name === "." ||
    name === ".." ||
    /[\u0000-\u001f<>:"|?*]/u.test(name) ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
  )
    throw new Error("Invalid filename");
  return name;
}

/* The file is written without the mark a browser download carries, so neither
   Gatekeeper nor Office's Protected View inspects it. Script-capable kinds stay
   out: SVG opens in a browser, and legacy Office files carry macros. */
const OPENS_IN_A_VIEWER = new Set(
  (
    "pdf txt md csv rtf png jpg jpeg gif webp heic bmp tiff " +
    "mp3 m4a wav mp4 mov m4v webm docx xlsx pptx odt ods odp pages numbers key epub"
  ).split(" "),
);

function opensInViewer(filename) {
  return OPENS_IN_A_VIEWER.has(path.extname(filename).slice(1).toLowerCase());
}

module.exports = {
  DEV_ORIGIN,
  trustedRendererUrl,
  trustedSender,
  rendererPermission,
  rendererFile,
  safeFileName,
  opensInViewer,
};
