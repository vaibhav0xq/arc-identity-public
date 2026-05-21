import fs from "node:fs";
import path from "node:path";

const failures = [];

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full.includes(`${path.sep}api${path.sep}`)) continue;
      walk(full, files);
    } else if (entry.name.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const publicSource = [
  ...walk("app"),
  ...walk("components"),
  "lib/intelligence-state.ts"
].map((file) => ({ file, source: read(file) }));

const forbiddenPublicCopy = [
  /Supabase/i,
  /profile row/i,
  /indexing job/i,
  /Provider unavailable\s+[—-]\s+showing baseline data/i,
  /Cached fallback/i
];

for (const { file, source } of publicSource) {
  for (const pattern of forbiddenPublicCopy) {
    expect(!pattern.test(source), `${file} contains launch-unfriendly public wording: ${pattern}`);
  }
}

const dashboard = read("app/dashboard/page.tsx");
const directory = read("components/DirectoryBrowser.tsx");
const profile = read(path.join("app", "profile", "[username]", "page.tsx"));
const chainExplorer = read("components/ChainCoverageExplorer.tsx");
const apiUsers = read("app/api/users/route.ts");

expect(dashboard.includes("Refresh failed. Cached wallet intelligence is still shown."), "dashboard refresh failure should keep cached intelligence visible");
expect(dashboard.includes("Using cached wallet intelligence."), "dashboard cached state should use calm user-facing copy");
expect(dashboard.includes("Cached snapshot"), "dashboard cache badge should clarify that cached means latest saved snapshot");
expect(directory.includes("Loading registered identities..."), "directory should show loading copy before empty states");
expect(directory.includes("Current results remain visible."), "directory refresh failure should preserve existing results");
expect(profile.includes("This profile could not be found."), "public profile not-found state should be clear");
expect(chainExplorer.includes("Some chain data is temporarily unavailable."), "chain explorer should use calm provider-limited copy");
expect(apiUsers.includes("Could not load registered identities. Please retry."), "users API should not return raw backend errors to the Directory");

const result = {
  ok: failures.length === 0,
  failures,
  scenario: "launch error and empty-state wording checks"
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
