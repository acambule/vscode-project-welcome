import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");

const refName = process.env.GITHUB_REF_NAME ?? "";
const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const packageVersion = String(packageJson.version ?? "");
const expectedTag = `v${packageVersion}`;

if (!refName) {
  throw new Error("GITHUB_REF_NAME fehlt. Der Release-Tag kann nicht validiert werden.");
}

if (refName !== expectedTag) {
  throw new Error(`Tag "${refName}" passt nicht zu package.json version "${packageVersion}". Erwartet: "${expectedTag}".`);
}

console.log(`Release-Tag validiert: ${refName}`);
