const { withAppBuildGradle } = require("expo/config-plugins");

// Native projects are generated. Keep store signing reproducible here and
// read credentials only at Gradle execution, never into generated source.
module.exports = (config) =>
  withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== "groovy") throw new Error("Expected Groovy app Gradle file");
    const marker = "// Napp store signing";
    if (!mod.modResults.contents.includes(marker))
      mod.modResults.contents += `
${marker}
def nappKeyStore = System.getenv('NAPP_ANDROID_KEYSTORE')
def nappKeyAlias = System.getenv('NAPP_ANDROID_KEY_ALIAS')
def nappStorePassword = System.getenv('NAPP_ANDROID_STORE_PASSWORD')
def nappKeyPassword = System.getenv('NAPP_ANDROID_KEY_PASSWORD')
def nappHasSigning = nappKeyStore && nappKeyAlias && nappStorePassword && nappKeyPassword
if (nappHasSigning) {
    android.signingConfigs.create('nappUpload') {
        storeFile file(nappKeyStore)
        storePassword nappStorePassword
        keyAlias nappKeyAlias
        keyPassword nappKeyPassword
    }
    android.buildTypes.release.signingConfig = android.signingConfigs.nappUpload
} else {
    // Local QA can build an unsigned release; a store bundle needs its upload key.
    android.buildTypes.release.signingConfig = null
}
tasks.configureEach { task ->
    if (task.name == 'bundleRelease') {
        task.doFirst {
            if (!nappHasSigning) throw new GradleException('Set NAPP_ANDROID_KEYSTORE, NAPP_ANDROID_KEY_ALIAS, NAPP_ANDROID_STORE_PASSWORD and NAPP_ANDROID_KEY_PASSWORD for a store bundle')
        }
    }
}
`;
    return mod;
  });
