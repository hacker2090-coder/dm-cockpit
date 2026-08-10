import fs from "node:fs";

function readText(path) {
  return fs.readFileSync(path, "utf8");
}

function readJson(path) {
  try {
    return JSON.parse(readText(path));
  } catch (error) {
    throw new Error(`${path} ist kein gueltiges JSON: ${error.message}`);
  }
}

const failures = [];
const warnings = [];
const fail = message => failures.push(message);
const warn = message => warnings.push(message);

const moduleManifest = readJson("module.json");
const companionPackage = readJson("companion/package.json");
const checkpoint = readJson("PROJECT-CHECKPOINT.json");
const discordScope = readJson("docs/DISCORD-BOT-EXPANSION-SCOPE-V1.json");
const uiScope = readJson("docs/UI-REDESIGN-SCOPE-V1.json");
const readme = readText("README.md");
const cockpitTemplate = readText("templates/cockpit.hbs");

if (moduleManifest.id !== "dm-cockpit") fail(`module.json id ist '${moduleManifest.id}' statt 'dm-cockpit'.`);
if (!/^\d+\.\d+\.\d+$/.test(String(moduleManifest.version ?? ""))) {
  fail(`module.json version '${moduleManifest.version}' ist keine erwartete x.y.z-Version.`);
}
if (!/^\d+\.\d+\.\d+$/.test(String(companionPackage.version ?? ""))) {
  fail(`companion/package.json version '${companionPackage.version}' ist keine erwartete x.y.z-Version.`);
}

if (checkpoint?.project?.foundry_repository_version !== moduleManifest.version) {
  fail(`PROJECT-CHECKPOINT.json Foundry-Version '${checkpoint?.project?.foundry_repository_version}' passt nicht zu module.json '${moduleManifest.version}'.`);
}
if (checkpoint?.project?.companion_repository_version !== companionPackage.version) {
  fail(`PROJECT-CHECKPOINT.json Companion-Version '${checkpoint?.project?.companion_repository_version}' passt nicht zu companion/package.json '${companionPackage.version}'.`);
}

const expectedReadmeHeading = `# DM Cockpit V${moduleManifest.version}`;
if (!readme.startsWith(expectedReadmeHeading)) {
  fail(`README.md beginnt nicht mit '${expectedReadmeHeading}'.`);
}
if (!readme.includes(`Companion ${companionPackage.version}`)) {
  fail(`README.md nennt die aktuelle Companion-Version ${companionPackage.version} nicht.`);
}

const runtimeSources = [
  ...(Array.isArray(moduleManifest.esmodules) ? moduleManifest.esmodules : []),
  ...(Array.isArray(moduleManifest.styles) ? moduleManifest.styles : []),
  "templates/cockpit.hbs"
];
for (const path of runtimeSources) {
  if (!fs.existsSync(path)) fail(`Manifest-/Runtime-Quelle fehlt: ${path}`);
}

if (discordScope.repository !== "hacker2090-coder/dm-cockpit") {
  fail(`Discord-Scope verweist auf unerwartetes Repository '${discordScope.repository}'.`);
}
if (discordScope.branch !== "main") {
  fail(`Discord-Scope verweist auf Branch '${discordScope.branch}' statt 'main'.`);
}

const oldUiPrecondition = uiScope?.source_of_truth_precondition?.status;
if (oldUiPrecondition === "must_be_resolved_before_large_ui_rewrite") {
  fail("UI-Scope enthaelt noch die veraltete Source-of-Truth-Blockade, obwohl die Kernquellen versioniert sind.");
}

const badgeMatch = cockpitTemplate.match(/dm-cockpit-badge\">V([^<]+)</);
if (badgeMatch && badgeMatch[1] !== moduleManifest.version) {
  warn(`Template-Fallback zeigt V${badgeMatch[1]}, Manifest ist V${moduleManifest.version}. module-version-badge.js korrigiert dies zur Laufzeit; Fallback spaeter bereinigen.`);
}

for (const message of warnings) console.warn(`[consistency][warn] ${message}`);

if (failures.length) {
  for (const message of failures) console.error(`[consistency][fail] ${message}`);
  process.exitCode = 1;
} else {
  console.log(`[consistency] OK: Foundry ${moduleManifest.version}, Companion ${companionPackage.version}, Checkpoint/Scopes/Runtime-Quellen konsistent.`);
}
