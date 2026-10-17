/* A phone cannot reach the desktop's loopback server from .env.local.
 * Native code and the bundled editor must use the same public service. */
module.exports = function mobileCollabUrl() {
  const value = process.env.NAPP_COLLAB_URL || "wss://notes-collab.onrender.com";
  const url = new URL(value);
  if (url.protocol !== "wss:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("NAPP_COLLAB_URL must point to a public wss:// collaboration server");
  return value;
};
