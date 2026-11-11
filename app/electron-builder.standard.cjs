const path = require("node:path");
const packageMetadata = require("./package.json");
const base = packageMetadata.build;
const { verifyMobileReleaseApk } = require("./scripts/mobile-release-artifact.cjs");
const { resolveReleaseVersions } = require("./scripts/release-version.cjs");
const { prepareLicenseArtifact } = require('./scripts/license-artifact.cjs');

const verified = verifyMobileReleaseApk({ quiet: true });
const { releaseVersion } = resolveReleaseVersions(packageMetadata);
const license = prepareLicenseArtifact();

module.exports = {
  ...base,
  buildVersion: releaseVersion,
  extraMetadata: {
    ...base.extraMetadata,
    multiAgentReleaseVersion: releaseVersion,
  },
  files: [
    ...base.files,
    "!electron/remote-pwa/downloads/**",
  ],
  extraResources: [
    ...(base.extraResources || []),
    { from: license.license, to: 'ACEDIA-LICENSE.txt' },
    { from: path.resolve(__dirname, '../licenses/ACEDIA-LEGACY-MIT.txt'), to: 'licenses/ACEDIA-LEGACY-MIT.txt' },
    { from: path.resolve(__dirname, '../THIRD-PARTY-NOTICES.md'), to: 'ACEDIA-THIRD-PARTY-NOTICES.md' },
    {
      from: path.resolve(verified.apkPath),
      to: "mobile/Acedia-Mobile.apk",
    },
  ],
  nsis: {
    ...base.nsis,
    license: license.file,
    artifactName: `Acedia-Setup-${releaseVersion}-\${arch}.\${ext}`,
    shortcutName: "Acedia",
    uninstallDisplayName: `Acedia ${releaseVersion}`,
  },
};
