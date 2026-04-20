import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "artifacts", "vsix");

await mkdir(outputDir, { recursive: true });

const packageJson = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8"));
const extensionName = packageJson.name;
const version = packageJson.version;
const outputFile = path.join(outputDir, `${extensionName}-${version}.vsix`);

await run("npm", ["run", "build"], rootDir);
await run(
  "npx",
  [
    "@vscode/vsce",
    "package",
    "--no-dependencies",
    "--allow-missing-repository",
    "--allow-star-activation",
    "--out",
    outputFile
  ],
  rootDir
);

console.log(`VSIX erstellt: ${outputFile}`);

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32"
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}`));
    });

    child.on("error", reject);
  });
}
