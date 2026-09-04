/* An ad-hoc signature, which is not the same thing as no signature.
 *
 * `identity: null` in electron-builder.yml does not mean "sign it lightly", it
 * means `handleNullIdentity()` — skip signing entirely. What is left in the
 * bundle is then the *linker's* own ad-hoc signature on the Electron binary
 * that was downloaded: `Identifier=Electron`, `Info.plist=not bound`. And
 * electron-builder has since replaced the Info.plist, the icon and the
 * resources, so the bundle's seal no longer describes what is inside it:
 *
 *   codesign --verify → code has no resources but signature indicates they
 *                       must be present
 *
 * Gatekeeper does not report that as "an app from an unidentified developer",
 * which is the mild dialog with an Open button behind a right-click. It reports
 * it as **"Napp is damaged and can't be opened"**, which offers only the Bin —
 * so the download is unusable, and every instruction we have written about
 * right-clicking is wrong.
 *
 * Signing the whole bundle ad-hoc costs nothing, needs no certificate, and is
 * the difference between the two dialogs: the seal is valid, there is simply no
 * Developer ID behind it, which is exactly what "unidentified developer" means
 * and exactly what right-click → Open is for. A real identity still changes
 * nothing here — set CSC_LINK and drop `identity: null`, and electron-builder
 * signs before this ever runs. */
const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function adhocSign({ appOutDir, packager, electronPlatformName }) {
  if (electronPlatformName !== "darwin") return;
  const app = path.join(appOutDir, `${packager.appInfo.productFilename}.app`);
  /* `--deep` is deprecated for distribution signing and is the right tool here:
     the helpers and the framework inside an Electron bundle each carry their
     own seal, and every one of them has to be re-made for the outer one to
     verify. */
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--strict", app], { stdio: "inherit" });
};
