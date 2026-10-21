/* The editor is an asset: Gradle cannot tell a stale preview from a real one.
 * Rebuild it before Metro collects assets, even if the last run was a preview. */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const mobile = path.resolve(__dirname, "..");
const env = { ...process.env, NAPP_PREVIEW: "0", NODE_ENV: "production" };
for (const [command, args, cwd] of [
  ["pnpm", ["editor"], mobile],
  [
    process.platform === "win32" ? "gradlew.bat" : "./gradlew",
    ["assembleRelease"],
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
