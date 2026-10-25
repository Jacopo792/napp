/* Metro's half of the arrangement Vite has in its configs: `@/` is the core's
   inside, from everywhere, and `NAPP_PREVIEW=1` swaps the modules that talk to
   Supabase for the in-memory stand-ins in preview/ — the same files, the same
   fixture, that `pnpm preview:ui` mounts the web app against. */
const path = require("node:path");
const { readFileSync } = require("node:fs");
const assertEditorMode = require("./editor-mode.cjs");
const { getDefaultConfig } = require("expo/metro-config");

const root = path.resolve(__dirname, "../..");
const core = path.join(root, "packages/core/src");
const config = getDefaultConfig(__dirname);

const PREVIEW = process.env.NAPP_PREVIEW === "1";
if (PREVIEW && process.env.NODE_ENV === "production") {
  throw new Error("A release must use the real backend: set NAPP_PREVIEW=0.");
}
assertEditorMode(readFileSync(path.join(__dirname, "editor/dist/index.html"), "utf8"), PREVIEW);
const MOCKED = [
  "supabaseClient",
  "supabase",
  "session",
  "sync",
  "presence",
  "accountPreferences",
  "collab",
  "comments",
  "history",
  "mediaText",
  "spaces",
];

config.watchFolders = [root];
/* The note page, built by `pnpm editor` into one HTML file, travels as an
   asset and is read as text by the note screen. */
config.resolver.assetExts.push("html");
config.resolver.resolveRequest = (context, name, platform) => {
  if (PREVIEW && name === "./supabaseClient" && context.originModulePath.startsWith(core))
    return context.resolveRequest(
      context,
      path.join(root, "preview/supabaseClient.mock.ts"),
      platform,
    );
  if (name.startsWith("@/")) {
    const inside = name.slice(2);
    const lib = inside.startsWith("lib/") && inside.slice(4);
    const target =
      PREVIEW && lib && MOCKED.includes(lib)
        ? path.join(root, "preview", `${lib}.mock.ts`)
        : path.join(core, inside);
    return context.resolveRequest(context, target, platform);
  }
  /* Yjs takes its random ids from lib0, whose React Native build wants a
     package nobody ships any more; expo-crypto answers `getRandomValues` with
     the same signature, and nothing Yjs does reaches `subtle`. */
  if (name === "lib0/webcrypto") return context.resolveRequest(context, "expo-crypto", platform);
  return context.resolveRequest(context, name, platform);
};

module.exports = config;
