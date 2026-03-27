import { spawnSync } from "node:child_process";
import { join } from "node:path";

const args = process.argv.slice(2);
const builderArgs = [];
const env = { ...process.env };

if (args.includes("--publish")) {
  builderArgs.push("--publish", "always");
}

if (args.includes("--no-sign")) {
  env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
  builderArgs.push("-c.win.signAndEditExecutable=false");
}

const command = join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32"
    ? "electron-builder.exe"
    : "electron-builder",
);
const result = spawnSync(
  command,
  builderArgs,
  {
    stdio: "inherit",
    cwd: process.cwd(),
    env,
  },
);

process.exit(result.status ?? 1);
