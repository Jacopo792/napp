/* The editor is an asset: Gradle cannot tell a stale preview from a real one.
 * Rebuild it before Metro collects assets, even if the last run was a preview. */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const store = process.argv.includes("--store");
if (store) {
  for (const name of [
    "NAPP_ANDROID_KEYSTORE",
    "NAPP_ANDROID_KEY_ALIAS",
    "NAPP_ANDROID_STORE_PASSWORD",
    "NAPP_ANDROID_KEY_PASSWORD",
  ])
    if (!process.env[name]) throw new Error(`Missing ${name} for Google Play bundle`);
}

const mobile = path.resolve(__dirname, "..");
const env = { ...process.env, NAPP_PREVIEW: "0", NODE_ENV: "production" };
for (const [command, args, cwd] of [
  ["pnpm", ["editor"], mobile],
  [
    process.platform === "win32" ? "gradlew.bat" : "./gradlew",
    [store ? "bundleRelease" : "assembleRelease"],
    path.join(mobile, "android"),
  ],
]) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
