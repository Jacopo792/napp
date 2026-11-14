const path = require("node:path");

function trustedRendererUrl(value, isDev) {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    return isDev
      ? url.origin === "http://localhost:5174"
      : url.protocol === "app:" && url.host === "notes";
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

module.exports = {
  trustedRendererUrl,
  trustedSender,
  rendererPermission,
  rendererFile,
  safeFileName,
};
