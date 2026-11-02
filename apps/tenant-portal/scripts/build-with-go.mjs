import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tenantDir = resolve(__dirname, "..");
const repoRoot = resolve(tenantDir, "../..");
const goDir = resolve(repoRoot, "apps/fauward-Go");
const goDist = resolve(goDir, "dist");
const tenantGoDist = resolve(tenantDir, "dist/go");
const npm = "npm";

// Windows needs a shell to resolve npm.cmd. Node 24 deprecates args + shell (DEP0190),
// so on Windows pass one command string; the args here are fixed literals.
function run(command, args, options = {}) {
  const useShell = process.platform === "win32";
  execFileSync(useShell ? [command, ...args].join(" ") : command, useShell ? [] : args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    shell: useShell,
    stdio: "inherit",
  });
}

run(npm, ["run", "build:portal"], { cwd: tenantDir });

run(npm, ["run", "build"], {
  cwd: goDir,
  env: {
    ...process.env,
    VITE_BASE_PATH: "/go/",
  },
});

rmSync(tenantGoDist, { recursive: true, force: true });
mkdirSync(tenantGoDist, { recursive: true });
cpSync(goDist, tenantGoDist, { recursive: true });
