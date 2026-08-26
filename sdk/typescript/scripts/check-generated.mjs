#!/usr/bin/env node
/**
 * Cross-platform check that src/generated/openapi.ts is in lockstep with
 * public/kyro-openapi.yaml.
 *
 * Regenerates types into an OS temp directory using the same
 * openapi-typescript CLI that `npm run generate:types` uses, then compares
 * the result to the committed file in Node. No hardcoded /tmp path, no
 * Unix diff, no shell: works on Windows, macOS and Linux.
 *
 * Line endings are normalized before comparison so a CRLF checkout
 * (git core.autocrlf on Windows) does not produce a false mismatch.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pkgDir = resolve(scriptDir, "..");
const specPath = resolve(pkgDir, "..", "..", "public", "kyro-openapi.yaml");
const committedPath = resolve(pkgDir, "src", "generated", "openapi.ts");

// Resolve the CLI entry point from the package's bin field and run it with
// the current Node executable. This avoids .cmd shims and PATH lookups,
// which are the usual Windows spawn failure modes.
const require = createRequire(import.meta.url);
const otPkgJsonPath = require.resolve("openapi-typescript/package.json");
const otPkg = JSON.parse(readFileSync(otPkgJsonPath, "utf8"));
const otBinRel =
  typeof otPkg.bin === "string" ? otPkg.bin : otPkg.bin["openapi-typescript"];
const cliPath = join(dirname(otPkgJsonPath), otBinRel);

const normalize = (text) => text.replace(/\r\n/g, "\n");

const tempDir = mkdtempSync(join(tmpdir(), "kyro-openapi-check-"));
const regenPath = join(tempDir, "openapi-regen.ts");

// The CLI resolves its input argument with new URL(input, cwd). An absolute
// Windows path like C:\repo\spec.yaml would parse as a "c:" scheme URL and
// fail, so the spec is passed as an explicit file:// URL. The -o output goes
// through the CLI's own path normalization and accepts a plain absolute path.
const specHref = pathToFileURL(specPath).href;

let exitCode = 0;
try {
  const run = spawnSync(process.execPath, [cliPath, specHref, "-o", regenPath], {
    stdio: "inherit",
  });
  if (run.error) {
    console.error(`check:generated: failed to run openapi-typescript: ${run.error.message}`);
    exitCode = 1;
  } else if (run.status !== 0) {
    console.error(`check:generated: openapi-typescript exited with status ${run.status ?? "(signal)"}`);
    exitCode = run.status || 1;
  } else {
    const committed = normalize(readFileSync(committedPath, "utf8"));
    const regenerated = normalize(readFileSync(regenPath, "utf8"));

    if (committed === regenerated) {
      console.log("check:generated: src/generated/openapi.ts matches public/kyro-openapi.yaml.");
    } else {
      const committedLines = committed.split("\n");
      const regeneratedLines = regenerated.split("\n");
      const shared = Math.min(committedLines.length, regeneratedLines.length);
      let firstDiff = 0;
      while (firstDiff < shared && committedLines[firstDiff] === regeneratedLines[firstDiff]) {
        firstDiff += 1;
      }
      console.error("check:generated: src/generated/openapi.ts is out of date with public/kyro-openapi.yaml.");
      console.error(`First difference at line ${firstDiff + 1}:`);
      console.error(`  committed:   ${committedLines[firstDiff] ?? "<end of file>"}`);
      console.error(`  regenerated: ${regeneratedLines[firstDiff] ?? "<end of file>"}`);
      console.error(`(committed ${committedLines.length} lines, regenerated ${regeneratedLines.length} lines)`);
      console.error("Fix: npm run generate:types, then commit the result.");
      exitCode = 1;
    }
  }
} finally {
  try {
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch (cleanupError) {
    // A transient file lock (antivirus, indexer) must not override the
    // gate's real outcome. Warn and keep the computed exit code.
    console.warn(`check:generated: temp cleanup failed (ignored): ${cleanupError.message}`);
  }
}
process.exit(exitCode);
