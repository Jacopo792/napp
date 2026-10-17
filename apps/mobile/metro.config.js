/* Metro's half of the arrangement Vite has in its configs: `@/` is the core's
   inside, from everywhere, and `NAPP_PREVIEW=1` swaps the modules that talk to
   Supabase for the in-memory stand-ins in preview/ — the same files, the same
   fixture, that `pnpm preview:ui` mounts the web app against. */
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const root = path.resolve(__dirname, "../..");
const core = path.join(root, "packages/core/src");
const config = getDefaultConfig(__dirname);

const PREVIEW = process.env.NAPP_PREVIEW === "1";
const MOCKED = [
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
config.resolver.resolveRequest = (context, name, platform) => {
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
