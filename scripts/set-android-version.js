#!/usr/bin/env node
// Bumps the app version in lockstep across app.json and the hand-patched
// android/app/build.gradle, without touching anything else in that file
// (signingConfigs / release keystore config must survive untouched).
//
// android/ is gitignored and NOT regenerated via `expo prebuild` for this
// project (see AGENTS.md / CLAUDE.md notes) — this script edits the already
// generated build.gradle directly instead of relying on prebuild templating.
//
// Usage: npm run android:version -- 1.0.2

const fs = require("fs");
const path = require("path");

const APP_JSON_PATH = path.join(__dirname, "..", "app.json");
const BUILD_GRADLE_PATH = path.join(
  __dirname,
  "..",
  "android",
  "app",
  "build.gradle",
);

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

const nextVersion = process.argv[2];

if (!nextVersion) {
  fail("Usage: npm run android:version -- 1.0.2");
}
if (!/^\d+\.\d+\.\d+$/.test(nextVersion)) {
  fail(`"${nextVersion}" doesn't look like a semver version (e.g. 1.0.2)`);
}

if (!fs.existsSync(BUILD_GRADLE_PATH)) {
  fail(
    `android/app/build.gradle not found at ${BUILD_GRADLE_PATH}.\n` +
      "This script only edits the existing native project — it never runs " +
      "expo prebuild, so the android/ folder must already exist.",
  );
}

let gradle = fs.readFileSync(BUILD_GRADLE_PATH, "utf8");

const versionCodeMatch = gradle.match(/versionCode\s+(\d+)/);
const versionNameMatch = gradle.match(/versionName\s+"([^"]+)"/);

if (!versionCodeMatch || !versionNameMatch) {
  fail(
    "Could not find versionCode/versionName in android/app/build.gradle — " +
      "expected lines like `versionCode 1` and `versionName \"1.0.1\"`.",
  );
}

const currentVersionCode = Number(versionCodeMatch[1]);
const currentVersionName = versionNameMatch[1];
const nextVersionCode = currentVersionCode + 1;

if (currentVersionName === nextVersion) {
  fail(
    `android/app/build.gradle is already at version ${nextVersion}. ` +
      "Pass the *new* version you're about to release.",
  );
}

gradle = gradle.replace(
  /versionCode\s+\d+/,
  `versionCode ${nextVersionCode}`,
);
gradle = gradle.replace(
  /versionName\s+"[^"]+"/,
  `versionName "${nextVersion}"`,
);
fs.writeFileSync(BUILD_GRADLE_PATH, gradle);

let appJson = fs.readFileSync(APP_JSON_PATH, "utf8");
const appJsonVersionMatch = appJson.match(/"version":\s*"([^"]+)"/);
if (!appJsonVersionMatch) {
  fail('Could not find a "version" field in app.json.');
}
appJson = appJson.replace(
  /"version":\s*"[^"]+"/,
  `"version": "${nextVersion}"`,
);
fs.writeFileSync(APP_JSON_PATH, appJson);

console.log(`
✓ Version bumped:
  app.json               "version": "${currentVersionName}" -> "${nextVersion}"
  android/app/build.gradle versionName "${currentVersionName}" -> "${nextVersion}"
  android/app/build.gradle versionCode ${currentVersionCode} -> ${nextVersionCode}

Signing config (signingConfigs.release / android/signing.properties) was not touched.

Next: build the release APK, publish it via Cloudinary, then create the
AppRelease record with version="${nextVersion}", versionCode=${nextVersionCode}.
`);
