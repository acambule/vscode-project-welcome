import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "artifacts", "vsix", "rolling");
const packageJsonPath = path.join(rootDir, "package.json");

await mkdir(outputDir, { recursive: true });

const originalPackageJsonText = await readFile(packageJsonPath, "utf8");
const packageJson = JSON.parse(originalPackageJsonText);
const extensionName = packageJson.name;
const baseVersion = String(packageJson.version);
const rollingVersion = createRollingVersion(baseVersion);
const outputFile = path.join(outputDir, `${extensionName}-${rollingVersion}.vsix`);

packageJson.version = rollingVersion;
await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

try {
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

  console.log(`Rolling VSIX erstellt: ${outputFile}`);
} finally {
  await writeFile(packageJsonPath, originalPackageJsonText, "utf8");
}

function createRollingVersion(baseVersion) {
  const runNumber = process.env.GITHUB_RUN_NUMBER ?? formatTimestamp(new Date());
  const sanitizedBaseVersion = String(baseVersion).split("-")[0];

  if (!/^\d+\.\d+\.\d+$/.test(sanitizedBaseVersion)) {
    throw new Error(`Basisversion "${baseVersion}" ist keine gueltige SemVer-Version im Format x.y.z.`);
  }

  return `${sanitizedBaseVersion}-main.${runNumber}`;
}

function formatTimestamp(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

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
