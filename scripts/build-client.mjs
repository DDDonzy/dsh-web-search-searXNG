import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const helper = fs.readFileSync(path.join(root, "ui", "test-control.js"), "utf8");
const toggle = fs.readFileSync(path.join(root, "ui", "toggle-control.js"), "utf8");
const source = fs.readFileSync(path.join(root, "ui", "client.js"), "utf8");
const css = ["styles.css", "toggle-styles.css"]
  .map((file) => fs.readFileSync(path.join(root, "ui", file), "utf8"))
  .join("\n");
const output = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(packageJson.name)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const CSS_TEXT = ${JSON.stringify(css)};
${helper}
${toggle}
${source}
    return module.exports;
  }
});
`;

fs.mkdirSync(path.join(root, "lib"), { recursive: true });
fs.writeFileSync(path.join(root, "lib", "client.js"), output);
console.log(`wrote lib/client.js for ${packageJson.name}`);
