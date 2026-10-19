import { mkdir, readdir, copyFile, rename } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(import.meta.dirname, ".."), source = resolve(root, "extension"), output = resolve(root, "public/downloads");
await mkdir(output, { recursive: true });
await mkdir(resolve(source, "icons"), { recursive: true });
await copyFile(resolve(root, "public/icons/icon-192.png"), resolve(source, "icons/icon-192.png"));
const files = [];
async function walk(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, item.name);
    if (item.isDirectory()) await walk(path);
    else if (/\.(?:json|js|mjs|html|css|md|png)$/.test(item.name)) files.push(relative(source, path));
  }
}
await walk(source);
// A fresh temporary archive avoids keeping removed files from an older release.
const temp = resolve(output, "reader-build-" + process.pid + ".zip");
execFileSync("zip", ["-q", "-X", temp, ...files.sort()], { cwd: source });
await rename(temp, resolve(output, "unitify-moodle-reader.zip"));
console.log(`Moodle Reader: ${files.length} files packaged`);
