#!/usr/bin/env node

/**
 * bump-version.mjs - One-command version bump for OpenCodeUI
 *
 * Usage:
 *   node scripts/bump-version.mjs <version>
 *
 * Examples:
 *   node scripts/bump-version.mjs 0.2.0            # stable release
 *   node scripts/bump-version.mjs 0.2.1-canary.1   # canary release
 *
 * What it does:
 *   1. Updates version in package.json, src-tauri/Cargo.toml, src-tauri/tauri.conf.json
 *   2. Prepends a new entry to CHANGELOG.md with git log since last tag
 *   3. Prints the git commands you need to run next (tag + push)
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Parse args
// ---------------------------------------------------------------------------
const version = process.argv[2];

if (!version) {
  console.error("Usage: node scripts/bump-version.mjs <version>");
  console.error("  e.g. node scripts/bump-version.mjs 0.2.0");
  console.error("  e.g. node scripts/bump-version.mjs 0.2.1-canary.1");
  process.exit(1);
}

// Basic semver validation (with optional prerelease)
const semverRe = /^\d+\.\d+\.\d+(-[a-zA-Z0-9]+(\.\d+)?)?$/;
if (!semverRe.test(version)) {
  console.error(`Invalid semver: "${version}"`);
  console.error("Expected format: MAJOR.MINOR.PATCH or MAJOR.MINOR.PATCH-prerelease.N");
  process.exit(1);
}

const tagName = `v${version}`;
const today = new Date().toISOString().slice(0, 10);
const isPrerelease = version.includes("-");

function replaceCargoPackageVersion(lockContent, packageName, nextVersion) {
  const packageBlocks = lockContent.split("[[package]]");
  const updatedBlocks = packageBlocks.map((block, index) => {
    if (index === 0) return block;
    if (!block.includes(`name = "${packageName}"`)) return block;
    return block.replace(/^(version\s*=\s*)"[^"]*"/m, `$1"${nextVersion}"`);
  });
  return updatedBlocks.join("[[package]]");
}

// ---------------------------------------------------------------------------
// 1. Update package.json
// ---------------------------------------------------------------------------
const pkgPath = resolve(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const oldVersion = pkg.version;

execSync(`npm version ${version} --no-git-tag-version --allow-same-version`, {
  cwd: root,
  stdio: "pipe",
});
console.log(`  package.json          ${oldVersion} -> ${version}`);
console.log(`  package-lock.json     ${oldVersion} -> ${version}`);

// ---------------------------------------------------------------------------
// 2. Update src-tauri/Cargo.toml
// ---------------------------------------------------------------------------
const cargoPath = resolve(root, "src-tauri/Cargo.toml");
let cargo = readFileSync(cargoPath, "utf-8");
const cargoPackageNameMatch = cargo.match(/^(name\s*=\s*)"([^"]+)"/m);
const cargoPackageName = cargoPackageNameMatch?.[2];
cargo = cargo.replace(
  /^(version\s*=\s*)"[^"]*"/m,
  `$1"${version}"`
);
writeFileSync(cargoPath, cargo);
console.log(`  src-tauri/Cargo.toml  ${oldVersion} -> ${version}`);

// ---------------------------------------------------------------------------
// 3. Update src-tauri/tauri.conf.json
// ---------------------------------------------------------------------------
const tauriConfPath = resolve(root, "src-tauri/tauri.conf.json");
const tauriConf = JSON.parse(readFileSync(tauriConfPath, "utf-8"));
tauriConf.version = version;
writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + "\n");
console.log(`  src-tauri/tauri.conf  ${oldVersion} -> ${version}`);

// ---------------------------------------------------------------------------
// 4. Update src-tauri/Cargo.lock (workspace package entry)
// ---------------------------------------------------------------------------
const cargoLockPath = resolve(root, "src-tauri/Cargo.lock");
if (cargoPackageName && existsSync(cargoLockPath)) {
  const cargoLock = readFileSync(cargoLockPath, "utf-8");
  const updatedCargoLock = replaceCargoPackageVersion(cargoLock, cargoPackageName, version);
  if (updatedCargoLock !== cargoLock) {
    writeFileSync(cargoLockPath, updatedCargoLock);
    console.log(`  src-tauri/Cargo.lock  ${oldVersion} -> ${version}`);
  }
}

// ---------------------------------------------------------------------------
// 5. Generate changelog entry from git log
// ---------------------------------------------------------------------------
let commits = "";
try {
  // Get the latest tag to use as the "since" reference
  const lastTag = execSync("git describe --tags --abbrev=0 2>/dev/null", {
    encoding: "utf-8",
    cwd: root,
  }).trim();

  commits = execSync(`git log ${lastTag}..HEAD --pretty=format:"- %s (%h)" --no-merges`, {
    encoding: "utf-8",
    cwd: root,
  }).trim();
} catch {
  // No previous tag — include all commits
  try {
    commits = execSync('git log --pretty=format:"- %s (%h)" --no-merges', {
      encoding: "utf-8",
      cwd: root,
    }).trim();
  } catch {
    commits = "- Initial release";
  }
}

if (!commits) {
  commits = "- No changes since last tag";
}

const releaseType = isPrerelease ? " (Pre-release)" : "";
const changelogEntry = `## [${tagName}] - ${today}${releaseType}\n\n${commits}\n`;

const changelogPath = resolve(root, "CHANGELOG.md");
if (existsSync(changelogPath)) {
  const existing = readFileSync(changelogPath, "utf-8");
  // Insert after the header line "# Changelog\n\n"
  const headerEnd = existing.indexOf("\n\n");
  if (headerEnd !== -1) {
    const header = existing.slice(0, headerEnd + 2);
    const body = existing.slice(headerEnd + 2);
    writeFileSync(changelogPath, header + changelogEntry + "\n" + body);
  } else {
    writeFileSync(changelogPath, existing + "\n" + changelogEntry);
  }
} else {
  writeFileSync(
    changelogPath,
    `# Changelog\n\n${changelogEntry}`
  );
}
console.log(`  CHANGELOG.md          added entry for ${tagName}`);

// ---------------------------------------------------------------------------
// 6. Print next steps
// ---------------------------------------------------------------------------
console.log(`
Done! Next steps:

  git add -A
  git commit -m "chore: bump version to ${version}"
  git tag ${tagName}
  git push && git push origin ${tagName}
`);
