import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const codiconsDistDir = path.join(rootDir, "node_modules", "@vscode", "codicons", "dist");
const mediaDir = path.join(rootDir, "media");

await mkdir(mediaDir, { recursive: true });
await copyFile(path.join(codiconsDistDir, "codicon.css"), path.join(mediaDir, "codicon.css"));
await copyFile(path.join(codiconsDistDir, "codicon.ttf"), path.join(mediaDir, "codicon.ttf"));

console.log("Codicons nach media/ synchronisiert.");
