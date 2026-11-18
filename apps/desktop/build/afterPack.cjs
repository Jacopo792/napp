const { writeFile } = require("node:fs/promises");
const path = require("node:path");
const { default: adhocSign } = require("./adhoc-sign.cjs");
const { readLocalDriveCredentials } = require("../electron/googleDrive");

exports.default = async function afterPack(context) {
  const { appOutDir, packager, electronPlatformName } = context;
  const { clientId, clientSecret } = await readLocalDriveCredentials();
  if (clientId && !clientSecret) throw new Error("Missing GOOGLE_DRIVE_DESKTOP_CLIENT_SECRET");
  if (clientId) {
    const resources =
      electronPlatformName === "darwin"
        ? path.join(appOutDir, `${packager.appInfo.productFilename}.app`, "Contents", "Resources")
        : path.join(appOutDir, "resources");
    await writeFile(
      path.join(resources, "google-drive-oauth.json"),
      JSON.stringify({ clientId, clientSecret }),
    );
  }
  await adhocSign(context);
};
