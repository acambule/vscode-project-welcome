import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const changelogPath = path.join(rootDir, "CHANGELOG.md");
const packageJsonPath = path.join(rootDir, "package.json");
const outputDir = path.join(rootDir, "artifacts", "release");
const outputFile = path.join(outputDir, "release-notes.md");

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const version = String(packageJson.version ?? "");
const changelog = await readFile(changelogPath, "utf8");
const notes = extractVersionNotes(changelog, version);

await mkdir(outputDir, { recursive: true });
await writeFile(outputFile, `${notes.trim()}\n`, "utf8");
console.log(`Release Notes erstellt: ${outputFile}`);
await writeGithubOutput("release_notes_path", outputFile);

function extractVersionNotes(markdown, version) {
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingRegex = new RegExp(`^## \\[${escapedVersion}\\].*$`, "m");
  const match = headingRegex.exec(markdown);
  if (!match || match.index === undefined) {
    throw new Error(`Kein CHANGELOG-Abschnitt fuer Version ${version} gefunden.`);
  }

  const start = match.index + match[0].length;
  const rest = markdown.slice(start);
  const nextHeadingMatch = /^## \[.*$/m.exec(rest);
  const end = nextHeadingMatch && nextHeadingMatch.index !== undefined ? nextHeadingMatch.index : rest.length;
  const sectionBody = rest.slice(0, end).trim();

  if (!sectionBody) {
    throw new Error(`Der CHANGELOG-Abschnitt fuer Version ${version} ist leer.`);
  }

  return `## ${version}\n\n${sectionBody}`;
}

async function writeGithubOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }

  await writeFile(outputPath, `${name}=${value}\n`, { encoding: "utf8", flag: "a" });
}
