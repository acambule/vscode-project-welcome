import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { ProjectEntry, ProjectGroup, ProjectsFile } from "./models";

const PROJECTS_FILE_NAME = "projects.json";
const DEFAULT_GROUP_NAME = "Allgemein";

export class ProjectStore {
  private readonly storageDir: string;
  private readonly filePath: string;

  public constructor(private readonly context: vscode.ExtensionContext) {
    this.storageDir = this.context.globalStorageUri.fsPath;
    this.filePath = path.join(this.storageDir, PROJECTS_FILE_NAME);
  }

  public get projectsFilePath(): string {
    return this.filePath;
  }

  public async listGroups(): Promise<ProjectGroup[]> {
    const data = await this.readFile();
    return data.groups.map((group) => ({
      ...group,
      projects: [...group.projects]
    }));
  }

  public async saveGroups(groups: ProjectGroup[]): Promise<void> {
    await this.ensureStorageDir();
    const payload: ProjectsFile = {
      version: 2,
      groups
    };

    await fs.writeFile(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }

  public async backup(destination: vscode.Uri): Promise<void> {
    await this.ensureStorageDir();
    await this.ensureFileExists();
    await vscode.workspace.fs.copy(vscode.Uri.file(this.filePath), destination, { overwrite: true });
  }

  private async readFile(): Promise<ProjectsFile> {
    await this.ensureStorageDir();

    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as {
        version?: number;
        projects?: ProjectEntry[];
        groups?: ProjectGroup[];
      };

      if (Array.isArray(parsed.groups)) {
        return {
          version: 2,
          groups: parsed.groups
        };
      }

      if (Array.isArray(parsed.projects)) {
        return {
          version: 2,
          groups: parsed.projects.length ? [createDefaultGroup(parsed.projects)] : []
        };
      }

      return {
        version: 2,
        groups: []
      };
    } catch (error) {
      if (this.isFileNotFound(error)) {
        const initial: ProjectsFile = { version: 2, groups: [] };
        await fs.writeFile(this.filePath, `${JSON.stringify(initial, null, 2)}\n`, "utf8");
        return initial;
      }

      throw error;
    }
  }

  private async ensureFileExists(): Promise<void> {
    await this.readFile();
  }

  private async ensureStorageDir(): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });
  }

  private isFileNotFound(error: unknown): boolean {
    return typeof error === "object"
      && error !== null
      && "code" in error
      && error.code === "ENOENT";
  }
}

function createDefaultGroup(projects: ProjectEntry[]): ProjectGroup {
  const now = new Date().toISOString();
  return {
    id: "default-group",
    name: DEFAULT_GROUP_NAME,
    createdAt: now,
    updatedAt: now,
    projects
  };
}
