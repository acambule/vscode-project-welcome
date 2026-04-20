export type ProjectTargetType = "folder" | "workspace";

export interface ProjectEntry {
  id: string;
  name: string;
  description: string;
  targetType: ProjectTargetType;
  targetPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectGroup {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  projects: ProjectEntry[];
}

export interface ProjectsFile {
  version: 2;
  groups: ProjectGroup[];
}
