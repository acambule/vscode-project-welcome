import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "artifacts", "vsix");
const packageJson = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8"));

const args = process.argv.slice(2);
const profiles = [];
let cliCommand = "code";
let skipPackage = false;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];

  if (arg === "--profile") {
    const profileName = args[index + 1];
    if (!profileName) {
      throw new Error("Fehlender Profilname nach --profile.");
    }

    profiles.push(profileName);
    index += 1;
    continue;
  }

  if (arg === "--cli") {
    const commandName = args[index + 1];
    if (!commandName) {
      throw new Error("Fehlender CLI-Befehl nach --cli.");
    }

    cliCommand = commandName;
    index += 1;
    continue;
  }

  if (arg === "--no-package") {
    skipPackage = true;
    continue;
  }

  throw new Error(`Unbekanntes Argument: ${arg}`);
}

if (!skipPackage) {
  await run("npm", ["run", "package:local"], rootDir);
}

const vsixFile = await findVsixFile(outputDir, packageJson.name, packageJson.version);
if (!vsixFile) {
  throw new Error(`Keine VSIX-Datei unter ${outputDir} gefunden.`);
}

const extensionId = `${packageJson.publisher}.${packageJson.name}`;

console.log(`Installiere ${extensionId} aus ${vsixFile}`);

await installVsix(cliCommand, vsixFile);

for (const profileName of profiles) {
  await installVsix(cliCommand, vsixFile, profileName);
}

console.log("VSIX-Installation abgeschlossen.");

async function findVsixFile(directory, extensionName, version) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".vsix"))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));

  if (files.length === 0) {
    return null;
  }

  const exactMatch = `${extensionName}-${version}.vsix`;
  if (files.includes(exactMatch)) {
    return path.join(directory, exactMatch);
  }

  return path.join(directory, files[0]);
}

async function installVsix(command, vsixPath, profileName) {
  const installArgs = ["--install-extension", vsixPath, "--force"];

  if (profileName) {
    installArgs.push("--profile", profileName);
    console.log(`Aktualisiere Profil: ${profileName}`);
  } else {
    console.log("Aktualisiere globale VS Code Installation");
  }

  await run(command, installArgs, rootDir);
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
