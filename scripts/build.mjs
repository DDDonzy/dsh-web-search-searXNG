import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lib = path.join(root, "lib");
fs.mkdirSync(lib, { recursive: true });

// src/ is the authoritative readable implementation. The lib wrappers keep
// the existing package entrypoints stable for DSH and Node consumers.
fs.writeFileSync(path.join(lib, "index.js"), 'export * from "../src/index.js";\n');
fs.writeFileSync(path.join(lib, "provider.js"), 'export * from "../src/provider.js";\n');
execFileSync(process.execPath, [path.join(root, "scripts", "build-client.mjs")], {
  cwd: root,
  stdio: "inherit",
});
console.log("built host wrappers and client bundle");
