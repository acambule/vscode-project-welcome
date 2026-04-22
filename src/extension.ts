import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { ProjectEntry, ProjectGroup, ProjectTargetType } from "./models";
import { ProjectStore } from "./storage";

type WebviewRequest =
  | { type: "ready" }
  | { type: "createProject"; groupId?: string }
  | { type: "createGroup" }
  | { type: "renameGroup"; groupId: string }
  | { type: "updateGroups"; groups: ProjectGroup[] }
  | { type: "editProject"; id: string }
  | { type: "deleteProject"; id: string }
  | { type: "openProject"; id: string }
  | { type: "backupProjects" }
  | { type: "refreshProjects" }
  | { type: "toggleStartup"; enabled: boolean }
  | { type: "setLayout"; layout: WelcomeLayout }
  | { type: "openRecent"; path: string; targetType: RecentTargetType }
  | { type: "importRecentAsProject"; path: string; targetType: ProjectTargetType; label: string }
  | { type: "startAction"; action: StartActionType };

type WelcomeLayout = "balanced" | "tallProjectsRight" | "tallProjectsLeft";

type StartActionType =
  | "newFile"
  | "openFile"
  | "openFolder"
  | "cloneGit"
  | "connectTo"
  | "newWorkspace";

type RecentTargetType = ProjectTargetType | "file";

interface RecentEntry {
  label: string;
  description: string;
  targetPath: string;
  targetType: RecentTargetType;
}

interface RecentCollections {
  locations: RecentEntry[];
  files: RecentEntry[];
}

interface ExtensionUiMeta {
  version: string;
  shortcutLabel: string;
  shortcutEnabled: boolean;
}

const startPageViewType = "projectWelcome.startPage";
const startPageOpenStateKey = "projectWelcome.startPageOpen";

class ProjectsWelcomeViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "projectWelcome.projects";

  private view?: vscode.WebviewView;

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly extensionUri: vscode.Uri,
    private readonly store: ProjectStore
  ) {}

  public async resolveWebviewView(
    webviewView: vscode.WebviewView
  ): Promise<void> {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this.extensionUri
      ]
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(async (message: WebviewRequest) => {
      await this.handleMessage(message);
    });
    webviewView.onDidChangeVisibility(async () => {
      if (webviewView.visible) {
        await this.postProjects();
      }
    });
  }

  public async refresh(): Promise<void> {
    if (!this.view) {
      return;
    }

    await this.postProjects();
  }

  private async handleMessage(message: WebviewRequest): Promise<void> {
    switch (message.type) {
      case "ready":
      case "refreshProjects":
        await this.postProjects();
        break;
      case "createProject":
        await createOrEditProject(this.store, undefined, message.groupId);
        await this.postProjects();
        break;
      case "createGroup":
        await createGroup(this.store);
        await this.postProjects();
        break;
      case "renameGroup":
        await renameGroup(this.store, message.groupId);
        await this.postProjects();
        break;
      case "updateGroups":
        await this.store.saveGroups(message.groups);
        await this.postProjects();
        break;
      case "editProject": {
        const record = await findProject(this.store, message.id);
        if (!record) {
          return;
        }
        await createOrEditProject(this.store, record.project, record.group.id);
        await this.postProjects();
        break;
      }
      case "deleteProject":
        await deleteProject(this.store, message.id);
        await this.postProjects();
        break;
      case "openProject":
        await openProject(this.store, message.id);
        break;
      case "backupProjects":
        await backupProjects(this.store);
        await this.postProjects();
        break;
      case "toggleStartup":
        await setOpenOnStartupSetting(message.enabled);
        await this.postProjects();
        break;
      case "setLayout":
        await setWelcomeLayoutSetting(message.layout);
        await this.postProjects();
        break;
      case "openRecent":
        await openTargetPath(message.path, message.targetType);
        break;
      case "importRecentAsProject":
        await importRecentAsProject(this.store, message.label, message.path, message.targetType);
        await this.postProjects();
        break;
      case "startAction":
        await executeStartAction(message.action);
        break;
      default:
        break;
    }
  }

  private async postProjects(): Promise<void> {
    if (!this.view) {
      return;
    }

    await postProjectsToWebview(this.view.webview, this.context, this.store);
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const codiconCssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "codicon.css"));
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
      "img-src data:"
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Projects Welcome</title>
  <link href="${codiconCssUri}" rel="stylesheet" />
  <style>
    :root {
      color-scheme: dark;
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --muted: var(--vscode-descriptionForeground);
      --border: color-mix(in srgb, var(--vscode-panel-border) 75%, transparent);
      --panel: color-mix(in srgb, var(--vscode-sideBar-background) 92%, transparent);
      --panel-strong: color-mix(in srgb, var(--vscode-editorWidget-background) 88%, transparent);
      --accent: var(--vscode-button-background);
      --accent-fg: var(--vscode-button-foreground);
      --link: var(--vscode-textLink-foreground);
      --danger: var(--vscode-errorForeground);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 14px 12px 18px;
      background: var(--bg);
      color: var(--fg);
      font-family: var(--vscode-font-family);
    }

    .shell {
      display: grid;
      gap: 12px;
    }

    .hero {
      display: none;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    button {
      border: 1px solid transparent;
      background: var(--accent);
      color: var(--accent-fg);
      padding: 8px 12px;
      border-radius: 10px;
      cursor: pointer;
      font: inherit;
    }

    button.secondary {
      background: transparent;
      color: var(--fg);
      border-color: var(--border);
    }

    button.accent {
      background: color-mix(in srgb, var(--accent) 85%, white 15%);
      color: var(--accent-fg);
    }

    button.icon {
      min-width: auto;
      padding: 9px 14px;
      border-radius: 12px;
    }

    .hint {
      font-size: 12px;
      color: var(--fg);
      line-height: 1.45;
      overflow-wrap: anywhere;
    }

    .footer {
      display: grid;
      gap: 4px;
      padding-top: 2px;
      font-size: 11px;
      line-height: 1.45;
      color: var(--muted);
    }

    .footer strong {
      color: var(--fg);
      font-weight: 600;
    }

    .list {
      display: grid;
      gap: 12px;
    }

    .empty,
    .card {
      background: linear-gradient(180deg, var(--panel) 0%, var(--panel-strong) 100%);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 18px 18px 16px;
    }

    .empty {
      color: var(--muted);
      line-height: 1.5;
    }

    .row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }

    .meta {
      min-width: 0;
      flex: 1;
    }

    .meta button.link {
      background: transparent;
      color: var(--link);
      padding: 0;
      border: none;
      text-align: left;
      font-size: 17px;
      font-weight: 600;
    }

    .meta p {
      margin: 10px 0 0;
      color: var(--muted);
      line-height: 1.45;
    }

    .path {
      margin-top: 10px;
      font-size: 13px;
      color: var(--fg);
      overflow-wrap: anywhere;
    }

    .toolbar {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
      min-width: 190px;
    }

    .danger {
      color: var(--danger);
      border-color: color-mix(in srgb, var(--danger) 40%, transparent);
    }

    @media (max-width: 640px) {
      .row {
        flex-direction: column;
      }

      .toolbar {
        min-width: 0;
        width: 100%;
        justify-content: flex-start;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="actions">
      <button id="create">Neues Projekt</button>
      <button id="createGroup" class="secondary">Neue Gruppe</button>
      <button id="backup" class="secondary">Backup</button>
      <button id="refresh" class="secondary">Aktualisieren</button>
    </section>

    <div class="hint" id="storagePath"></div>

    <section class="list" id="projectList"></section>

    <footer class="footer">
      <div id="shortcutInfo"></div>
    </footer>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const list = document.getElementById("projectList");
    const storagePath = document.getElementById("storagePath");
    const shortcutInfo = document.getElementById("shortcutInfo");

    document.getElementById("create").addEventListener("click", () => {
      vscode.postMessage({ type: "createProject" });
    });
    document.getElementById("createGroup").addEventListener("click", () => {
      vscode.postMessage({ type: "createGroup" });
    });
    document.getElementById("backup").addEventListener("click", () => {
      vscode.postMessage({ type: "backupProjects" });
    });
    document.getElementById("refresh").addEventListener("click", () => {
      vscode.postMessage({ type: "refreshProjects" });
    });

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (message.type !== "projectsData") {
        return;
      }

      storagePath.textContent = "Dauerhafter Speicherort: " + message.payload.storagePath;
      shortcutInfo.innerHTML = "<strong>Shortcut:</strong> " + escapeHtml(message.payload.shortcutLabel);
      renderProjects(message.payload.groups || []);
    });

    function escapeHtml(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    function renderProjects(groups) {
      list.innerHTML = "";

      if (!groups.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "Noch keine Gruppen vorhanden.";
        list.appendChild(empty);
        return;
      }

      for (const group of groups) {
        const card = document.createElement("article");
        card.className = "card";

        const header = document.createElement("div");
        header.className = "row";

        const title = document.createElement("div");
        title.className = "meta";

        const label = document.createElement("strong");
        label.textContent = group.name;
        title.appendChild(label);

        const createProjectButton = document.createElement("button");
        createProjectButton.className = "icon secondary";
        createProjectButton.textContent = "Neues Projekt";
        createProjectButton.addEventListener("click", () => {
          vscode.postMessage({ type: "createProject", groupId: group.id });
        });

        header.appendChild(title);
        header.appendChild(createProjectButton);
        card.appendChild(header);

        if (!group.projects.length) {
          const emptyGroup = document.createElement("div");
          emptyGroup.className = "path";
          emptyGroup.textContent = "Noch keine Projekte in dieser Gruppe.";
          card.appendChild(emptyGroup);
          list.appendChild(card);
          continue;
        }

        for (const project of group.projects) {
        const row = document.createElement("div");
        row.className = "row";

        const meta = document.createElement("div");
        meta.className = "meta";

        const openButton = document.createElement("button");
        openButton.className = "link";
        openButton.textContent = project.name;
        openButton.addEventListener("click", () => {
          vscode.postMessage({ type: "openProject", id: project.id });
        });

        const description = document.createElement("p");
        description.textContent = project.description || "Keine Beschreibung hinterlegt.";

        const path = document.createElement("div");
        path.className = "path";
        path.textContent = (project.targetType === "workspace" ? "Workspace" : "Ordner") + ": " + project.targetPath;

        meta.appendChild(openButton);
        meta.appendChild(description);
        meta.appendChild(path);

        const toolbar = document.createElement("div");
        toolbar.className = "toolbar";

        const editButton = document.createElement("button");
        editButton.className = "icon secondary";
        editButton.textContent = "Bearbeiten";
        editButton.addEventListener("click", () => {
          vscode.postMessage({ type: "editProject", id: project.id });
        });

        const deleteButton = document.createElement("button");
        deleteButton.className = "icon secondary danger";
        deleteButton.textContent = "Löschen";
        deleteButton.addEventListener("click", () => {
          vscode.postMessage({ type: "deleteProject", id: project.id });
        });

        toolbar.appendChild(editButton);
        toolbar.appendChild(deleteButton);
        row.appendChild(meta);
        row.appendChild(toolbar);
        card.appendChild(row);
        }
        list.appendChild(card);
      }
    }

    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const store = new ProjectStore(context);
  const provider = new ProjectsWelcomeViewProvider(context, context.extensionUri, store);
  const panelRef: { current: vscode.WebviewPanel | undefined } = { current: undefined };
  let isReconcilingStartPageTabs = false;

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ProjectsWelcomeViewProvider.viewType, provider)
  );
  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs(() => {
      void reconcileStartPageTabs(panelRef, context, isReconcilingStartPageTabs, (nextValue) => {
        isReconcilingStartPageTabs = nextValue;
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("projectWelcome.openStartPage", async () => {
      panelRef.current = createOrRevealStartPage(panelRef, context, store);
    }),
    vscode.commands.registerCommand("projectWelcome.createProject", async () => {
      await createOrEditProject(store);
      await provider.refresh();
      await postProjectsToPanel(panelRef.current, context, store);
    }),
    vscode.commands.registerCommand("projectWelcome.createGroup", async () => {
      await createGroup(store);
      await provider.refresh();
      await postProjectsToPanel(panelRef.current, context, store);
    }),
    vscode.commands.registerCommand("projectWelcome.backupProjects", async () => {
      await backupProjects(store);
      await postProjectsToPanel(panelRef.current, context, store);
    }),
    vscode.commands.registerCommand("projectWelcome.refreshProjects", async () => {
      await provider.refresh();
      await postProjectsToPanel(panelRef.current, context, store);
    })
  );

  if (vscode.workspace.getConfiguration("projectWelcome").get<boolean>("openOnStartup", true)) {
    void openStartPageOnStartup(panelRef, context, store);
  }

  void reconcileStartPageTabs(panelRef, context, isReconcilingStartPageTabs, (nextValue) => {
    isReconcilingStartPageTabs = nextValue;
  });
}

export function deactivate(): void {
  // No cleanup required yet.
}

async function findProject(
  store: ProjectStore,
  id: string
): Promise<{ group: ProjectGroup; project: ProjectEntry } | undefined> {
  const groups = await store.listGroups();
  for (const group of groups) {
    const project = group.projects.find((entry) => entry.id === id);
    if (project) {
      return { group, project };
    }
  }
  return undefined;
}

async function createGroup(store: ProjectStore): Promise<void> {
  const name = await vscode.window.showInputBox({
    title: "Neue Gruppe",
    prompt: "Gruppenname",
    ignoreFocusOut: true,
    validateInput: (value) => value.trim() ? undefined : "Bitte einen Gruppennamen eingeben."
  });

  if (name === undefined) {
    return;
  }

  const groups = await store.listGroups();
  const now = new Date().toISOString();
  const group: ProjectGroup = {
    id: createGroupId(),
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
    projects: []
  };

  await store.saveGroups([...groups, group]);
}

async function renameGroup(store: ProjectStore, groupId: string): Promise<void> {
  const groups = await store.listGroups();
  const existing = groups.find((group) => group.id === groupId);
  if (!existing) {
    return;
  }

  const name = await vscode.window.showInputBox({
    title: "Gruppe umbenennen",
    prompt: "Gruppenname",
    value: existing.name,
    ignoreFocusOut: true,
    validateInput: (value) => value.trim() ? undefined : "Bitte einen Gruppennamen eingeben."
  });

  if (name === undefined) {
    return;
  }

  const now = new Date().toISOString();
  await store.saveGroups(groups.map((group) => (
    group.id === groupId
      ? { ...group, name: name.trim(), updatedAt: now }
      : group
  )));
}

async function importRecentAsProject(
  store: ProjectStore,
  label: string,
  targetPath: string,
  targetType: ProjectTargetType
): Promise<void> {
  const groups = await store.listGroups();
  if (!groups.length) {
    void vscode.window.showInformationMessage("Bitte zuerst eine Gruppe anlegen.");
    return;
  }

  if (hasProjectPath(groups, targetPath)) {
    void vscode.window.showInformationMessage("Dieser Ordner oder Workspace ist bereits als Projekt vorhanden.");
    return;
  }

  const selectedGroup = await pickGroup(groups);
  if (!selectedGroup) {
    return;
  }

  const now = new Date().toISOString();
  const project: ProjectEntry = {
    id: createProjectId(),
    name: label,
    description: "",
    targetType,
    targetPath,
    createdAt: now,
    updatedAt: now
  };

  await store.saveGroups(groups.map((group) => (
    group.id === selectedGroup.id
      ? { ...group, updatedAt: now, projects: [...group.projects, project] }
      : group
  )));
}

async function createOrEditProject(
  store: ProjectStore,
  existing?: ProjectEntry,
  preferredGroupId?: string
): Promise<void> {
  const groups = await store.listGroups();
  if (!groups.length) {
    void vscode.window.showInformationMessage("Bitte zuerst eine Gruppe anlegen.");
    return;
  }

  const existingRecord = existing ? await findProject(store, existing.id) : undefined;
  const selectedGroup = await pickGroup(groups, preferredGroupId ?? existingRecord?.group.id);
  if (!selectedGroup) {
    return;
  }

  const name = await vscode.window.showInputBox({
    title: existing ? "Projekt bearbeiten" : "Neues Projekt",
    prompt: "Projektname",
    value: existing?.name ?? "",
    ignoreFocusOut: true,
    validateInput: (value) => value.trim() ? undefined : "Bitte einen Projektnamen eingeben."
  });

  if (name === undefined) {
    return;
  }

  const description = await vscode.window.showInputBox({
    title: existing ? "Projekt bearbeiten" : "Neues Projekt",
    prompt: "Beschreibung",
    value: existing?.description ?? "",
    ignoreFocusOut: true
  });

  if (description === undefined) {
    return;
  }

  const targetType = await pickTargetType(existing?.targetType);
  if (!targetType) {
    return;
  }

  const selectedPath = await pickTargetPath(targetType, existing?.targetPath);
  if (!selectedPath) {
    return;
  }

  const now = new Date().toISOString();
  const project: ProjectEntry = {
    id: existing?.id ?? createProjectId(),
    name: name.trim(),
    description: description.trim(),
    targetType,
    targetPath: selectedPath,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  const nextGroups = groups.map((group) => {
    const withoutExisting = group.projects.filter((entry) => entry.id !== project.id);
    if (group.id !== selectedGroup.id) {
      return {
        ...group,
        projects: withoutExisting
      };
    }

    return {
      ...group,
      updatedAt: now,
      projects: [...withoutExisting, project]
    };
  });

  await store.saveGroups(nextGroups);
}

async function pickGroup(
  groups: ProjectGroup[],
  preferredGroupId?: string
): Promise<ProjectGroup | undefined> {
  if (preferredGroupId) {
    const preferred = groups.find((group) => group.id === preferredGroupId);
    if (preferred) {
      return preferred;
    }
  }

  if (groups.length === 1) {
    return groups[0];
  }

  const picked = await vscode.window.showQuickPick(
    groups.map((group) => ({
      label: group.name,
      description: `${group.projects.length} Projekt${group.projects.length === 1 ? "" : "e"}`,
      group
    })),
    {
      title: "Gruppe waehlen",
      ignoreFocusOut: true
    }
  );

  return picked?.group;
}

function hasProjectPath(groups: ProjectGroup[], targetPath: string): boolean {
  const normalizedTargetPath = normalizePath(targetPath);
  return groups.some((group) => group.projects.some((project) => normalizePath(project.targetPath) === normalizedTargetPath));
}

function normalizePath(targetPath: string): string {
  return targetPath.replace(/\\/g, "/").toLowerCase();
}

async function pickTargetType(current?: ProjectTargetType): Promise<ProjectTargetType | undefined> {
  const selection = await vscode.window.showQuickPick(
    [
      { label: "Ordner", value: "folder" as const, description: "Beliebigen Projektordner oeffnen" },
      { label: "Workspace", value: "workspace" as const, description: ".code-workspace Datei oeffnen" }
    ],
    {
      title: "Welcher Projekttyp soll geoeffnet werden?",
      ignoreFocusOut: true,
      placeHolder: current === "workspace" ? "Workspace" : "Ordner"
    }
  );

  return selection?.value;
}

async function pickTargetPath(
  targetType: ProjectTargetType,
  current?: string
): Promise<string | undefined> {
  if (current) {
    const reuseCurrent = await vscode.window.showQuickPick(
      [
        { label: "Vorhandenen Pfad beibehalten", value: "keep" as const, description: current },
        { label: "Neuen Pfad auswaehlen", value: "choose" as const }
      ],
      {
        title: "Zielpfad fuer das Projekt",
        ignoreFocusOut: true
      }
    );

    if (!reuseCurrent) {
      return undefined;
    }

    if (reuseCurrent.value === "keep") {
      return current;
    }
  }

  if (targetType === "folder") {
    const uri = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "Ordner auswaehlen"
    });
    return uri?.[0]?.fsPath;
  }

  const uri = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel: "Workspace auswaehlen",
    filters: {
      "VS Code Workspace": ["code-workspace"]
    }
  });
  return uri?.[0]?.fsPath;
}

async function deleteProject(store: ProjectStore, id: string): Promise<void> {
  const record = await findProject(store, id);
  if (!record) {
    return;
  }

  const confirmation = await vscode.window.showWarningMessage(
    `Projekt "${record.project.name}" wirklich loeschen?`,
    { modal: true },
    "Loeschen"
  );

  if (confirmation !== "Loeschen") {
    return;
  }

  const groups = await store.listGroups();
  await store.saveGroups(groups.map((group) => ({
    ...group,
    projects: group.projects.filter((entry) => entry.id !== id)
  })));
}

async function openProject(store: ProjectStore, id: string): Promise<void> {
  const record = await findProject(store, id);
  if (!record) {
    void vscode.window.showErrorMessage("Projekt wurde nicht gefunden.");
    return;
  }

  const target = vscode.Uri.file(record.project.targetPath);
  await closeStartPageTabs();
  await vscode.commands.executeCommand("vscode.openFolder", target, false);
}

async function backupProjects(store: ProjectStore): Promise<void> {
  const destination = await vscode.window.showSaveDialog({
    title: "Projektliste sichern",
    defaultUri: vscode.Uri.file("projects-backup.json"),
    filters: {
      JSON: ["json"]
    },
    saveLabel: "Backup speichern"
  });

  if (!destination) {
    return;
  }

  await store.backup(destination);
  void vscode.window.showInformationMessage(`Backup gespeichert: ${destination.fsPath}`);
}

function createProjectId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createGroupId(): string {
  return `group-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getNonce(): string {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let index = 0; index < 32; index += 1) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

function createOrRevealStartPage(
  panelRef: { current: vscode.WebviewPanel | undefined },
  context: vscode.ExtensionContext,
  store: ProjectStore,
  preserveFocus = false
): vscode.WebviewPanel | undefined {
  const existingPanel = panelRef.current;
  if (existingPanel) {
    existingPanel.reveal(vscode.ViewColumn.Active, preserveFocus);
    void postProjectsToPanel(existingPanel, context, store);
    return existingPanel;
  }

  if (hasStartPageTabOpen()) {
    return undefined;
  }

  const panel = vscode.window.createWebviewPanel(
    startPageViewType,
    "Welcome",
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        context.extensionUri
      ]
    }
  );

  return attachStartPagePanel(panel, panelRef, context, store);
}

function attachStartPagePanel(
  panel: vscode.WebviewPanel,
  panelRef: { current: vscode.WebviewPanel | undefined },
  context: vscode.ExtensionContext,
  store: ProjectStore
): vscode.WebviewPanel {
  panelRef.current = panel;
  void setStartPageOpenState(context, true);
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "vscode-welcome.svg");
  panel.webview.options = {
    enableScripts: true,
    localResourceRoots: [
      context.extensionUri
    ]
  };
  panel.webview.html = getStartPageHtml(panel.webview, context.extensionUri);
  panel.webview.onDidReceiveMessage(async (message: WebviewRequest) => {
    await handleSharedMessage(message, context, store, panel);
  });
  panel.onDidChangeViewState(async (event) => {
    if (event.webviewPanel.visible) {
      await postProjectsToPanel(panel, context, store);
    }
  });
  panel.onDidDispose(() => {
    if (panelRef.current === panel) {
      panelRef.current = undefined;
    }

    void setStartPageOpenState(context, false);
  });

  void postProjectsToPanel(panel, context, store);
  return panel;
}

function hasStartPageTabOpen(): boolean {
  return vscode.window.tabGroups.all.some((group) => group.tabs.some((tab) => {
    const input = tab.input;
    return input instanceof vscode.TabInputWebview && input.viewType === startPageViewType;
  }));
}

async function handleSharedMessage(
  message: WebviewRequest,
  context: vscode.ExtensionContext,
  store: ProjectStore,
  panel?: vscode.WebviewPanel
): Promise<void> {
  switch (message.type) {
    case "ready":
    case "refreshProjects":
      await postProjectsToPanel(panel, context, store);
      break;
    case "createProject":
      await createOrEditProject(store, undefined, message.groupId);
      await postProjectsToPanel(panel, context, store);
      break;
    case "createGroup":
      await createGroup(store);
      await postProjectsToPanel(panel, context, store);
      break;
    case "renameGroup":
      await renameGroup(store, message.groupId);
      await postProjectsToPanel(panel, context, store);
      break;
    case "updateGroups":
      await store.saveGroups(message.groups);
      await postProjectsToPanel(panel, context, store);
      break;
    case "editProject": {
      const record = await findProject(store, message.id);
      if (!record) {
        return;
      }
      await createOrEditProject(store, record.project, record.group.id);
      await postProjectsToPanel(panel, context, store);
      break;
    }
    case "deleteProject":
      await deleteProject(store, message.id);
      await postProjectsToPanel(panel, context, store);
      break;
    case "openProject":
      await openProject(store, message.id);
      break;
    case "backupProjects":
      await backupProjects(store);
      await postProjectsToPanel(panel, context, store);
      break;
    case "toggleStartup":
      await setOpenOnStartupSetting(message.enabled);
      await postProjectsToPanel(panel, context, store);
      break;
    case "setLayout":
      await setWelcomeLayoutSetting(message.layout);
      await postProjectsToPanel(panel, context, store);
      break;
    case "openRecent":
      await openTargetPath(message.path, message.targetType);
      break;
    case "importRecentAsProject":
      await importRecentAsProject(store, message.label, message.path, message.targetType);
      await postProjectsToPanel(panel, context, store);
      break;
    case "startAction":
      await executeStartAction(message.action);
      break;
    default:
      break;
  }
}

async function postProjectsToPanel(
  panel: vscode.WebviewPanel | undefined,
  context: vscode.ExtensionContext,
  store: ProjectStore
): Promise<void> {
  if (!panel) {
    return;
  }

  await postProjectsToWebview(panel.webview, context, store);
}

async function postProjectsToWebview(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  store: ProjectStore
): Promise<void> {
  const groups = await store.listGroups();
  const uiMeta = await getExtensionUiMeta(context);
  await webview.postMessage({
    type: "projectsData",
    payload: {
      groups,
      storagePath: store.projectsFilePath,
      openOnStartup: getOpenOnStartupSetting(),
      layout: getWelcomeLayoutSetting(),
      extensionVersion: uiMeta.version,
      shortcutLabel: uiMeta.shortcutLabel,
      shortcutEnabled: uiMeta.shortcutEnabled
    }
  });

  // Give the browser a short chance to paint the shell and project area first.
  await delay(40);

  const recent = await getRecentEntries();
  await webview.postMessage({
    type: "recentData",
    payload: {
      recentLocations: recent.locations,
      recentFiles: recent.files
    }
  });
}

function getStartPageHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = getNonce();
  const codiconCssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "codicon.css"));
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`
  ].join("; ");

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome</title>
  <link href="${codiconCssUri}" rel="stylesheet" />
  <style>
    :root {
      color-scheme: dark;
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --muted: var(--vscode-descriptionForeground);
      --border: color-mix(in srgb, var(--vscode-panel-border) 75%, transparent);
      --panel: color-mix(in srgb, var(--vscode-editorWidget-background) 90%, transparent);
      --panel-strong: color-mix(in srgb, var(--vscode-sideBar-background) 94%, transparent);
      --accent: var(--vscode-button-background);
      --accent-fg: var(--vscode-button-foreground);
      --link: var(--vscode-textLink-foreground);
      --danger: var(--vscode-errorForeground);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      padding: 88px 76px 110px;
      background:
        radial-gradient(circle at top left, rgba(82, 146, 255, 0.14), transparent 26%),
        linear-gradient(135deg, rgba(255, 255, 255, 0.02), transparent 40%),
        var(--bg);
      color: var(--fg);
      font-family: var(--vscode-font-family);
      display: flex;
      justify-content: center;
    }

    .page {
      display: grid;
      gap: 16px;
      width: min(1360px, 100%);
    }

    .contentGrid {
      display: grid;
      gap: 28px;
    }

    .headerGrid,
    .featureGrid,
    .recentGrid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 28px;
      align-items: start;
    }

    .left {
      align-self: start;
      display: grid;
      gap: 24px;
    }

    .brand h1 {
      margin: 0;
      font-size: 36px;
      line-height: 1.05;
      font-weight: 500;
      max-width: none;
      letter-spacing: -0.01em;
    }

    .brand h2 {
      margin: 8px 0 0;
      font-size: 16px;
      line-height: 1.25;
      font-weight: 500;
      color: var(--muted);
    }

    .controlPanel {
      display: grid;
      gap: 10px;
      align-content: start;
      min-width: 0;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    button {
      border: 1px solid transparent;
      background: var(--accent);
      color: var(--accent-fg);
      padding: 10px 14px;
      border-radius: 12px;
      cursor: pointer;
      font: inherit;
    }

    select {
      appearance: none;
      border: 1px solid var(--border);
      background: color-mix(in srgb, var(--panel) 92%, transparent);
      color: var(--fg);
      padding: 9px 34px 9px 12px;
      border-radius: 10px;
      font: inherit;
      cursor: pointer;
      background-image:
        linear-gradient(45deg, transparent 50%, var(--muted) 50%),
        linear-gradient(135deg, var(--muted) 50%, transparent 50%);
      background-position:
        calc(100% - 18px) calc(50% - 2px),
        calc(100% - 12px) calc(50% - 2px);
      background-size: 6px 6px, 6px 6px;
      background-repeat: no-repeat;
    }

    .layoutSelectWrap {
      display: inline-flex;
      align-items: center;
      position: relative;
    }

    .layoutSelect {
      min-width: 138px;
      padding: 5px 28px 5px 10px;
      border-radius: 8px;
      background-color: color-mix(in srgb, var(--bg) 76%, transparent);
      font-size: 12px;
      line-height: 1.2;
      color: var(--muted);
      background-position:
        calc(100% - 16px) calc(50% - 2px),
        calc(100% - 11px) calc(50% - 2px);
      background-size: 5px 5px, 5px 5px;
    }

    .layoutSelect:hover,
    .layoutSelect:focus {
      color: var(--fg);
      border-color: color-mix(in srgb, var(--link) 35%, var(--border));
      outline: none;
    }

    .layoutHint {
      position: absolute;
      left: 50%;
      bottom: calc(100% + 8px);
      transform: translateX(-50%);
      padding: 4px 7px;
      border-radius: 6px;
      background: color-mix(in srgb, var(--bg) 92%, black 8%);
      color: var(--muted);
      font-size: 11px;
      line-height: 1;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity 120ms ease;
      border: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
    }

    .layoutSelectWrap:hover .layoutHint,
    .layoutSelectWrap:focus-within .layoutHint {
      opacity: 1;
    }

    button.secondary {
      background: transparent;
      color: var(--fg);
      border-color: var(--border);
    }

    button.link {
      background: none;
      border: none;
      padding: 0;
      color: var(--link);
      font-size: 18px;
      font-weight: 600;
      text-align: left;
    }

    .storage {
      color: var(--muted);
      font-size: 11px;
      line-height: 1.3;
      overflow-wrap: anywhere;
      max-width: none;
    }

    .column {
      display: grid;
      gap: 12px;
      min-width: 0;
    }

    .sectionHeader {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .sectionHeader .secondary {
      padding: 7px 11px;
      border-radius: 10px;
    }

    .startList {
      display: grid;
      gap: 12px;
      align-content: start;
    }

    .startButton {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      width: fit-content;
      padding: 0;
      border: none;
      background: none;
      color: var(--link);
      font: inherit;
      font-size: 14px;
      line-height: 1.4;
      cursor: pointer;
    }

    .startIcon {
      width: 18px;
      color: var(--link);
      text-align: center;
      font-size: 16px;
      line-height: 1;
      flex: 0 0 18px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .startIcon.codicon {
      font-size: 16px;
    }

    .sectionTitle {
      margin: 0;
      font-size: 24px;
      font-weight: 500;
    }

    .empty,
    .card {
      padding: 18px 18px 16px;
      border: 1px solid var(--border);
      border-radius: 18px;
      background: linear-gradient(180deg, var(--panel) 0%, var(--panel-strong) 100%);
    }

    .groupList {
      display: grid;
      gap: 14px;
    }

    .groupShell {
      display: grid;
      grid-template-columns: 22px minmax(0, 1fr);
      gap: 10px;
      align-items: start;
    }

    .groupCard {
      padding: 16px 18px;
      border: 1px solid var(--border);
      border-radius: 18px;
      background: linear-gradient(180deg, var(--panel) 0%, var(--panel-strong) 100%);
      display: grid;
      gap: 14px;
    }

    .groupCard.drag-over,
    .projectShell.drag-over,
    .groupProjects.drag-over {
      outline: 1px dashed var(--link);
      outline-offset: 2px;
    }

    .groupHeader {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .groupTitle {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }

    .groupProjects {
      display: grid;
      gap: 12px;
    }

    .projectShell {
      display: grid;
      grid-template-columns: 22px minmax(0, 1fr);
      gap: 10px;
      align-items: start;
    }

    .projectRow {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding-top: 2px;
    }

    .projectRow + .projectRow {
      border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
      padding-top: 12px;
    }

    .dragHandle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 32px;
      padding: 0;
      border: none;
      background: transparent;
      color: var(--muted);
      cursor: grab;
    }

    .dragHandle.codicon {
      font-size: 16px;
    }

    .dragHandle:active {
      cursor: grabbing;
    }

    .empty {
      color: var(--muted);
      line-height: 1.5;
    }

    .cardRow {
      display: flex;
      gap: 18px;
      justify-content: space-between;
      align-items: flex-start;
    }

    .cardMeta {
      min-width: 0;
      flex: 1;
    }

    .description {
      margin: 4px 0 0;
      color: var(--muted);
      line-height: 1.35;
    }

    .path {
      margin-top: 12px;
      color: var(--fg);
      font-size: 13px;
      overflow-wrap: anywhere;
    }

    .path.tight {
      margin-top: 6px;
    }

    .toolbar {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
      min-width: 210px;
    }

    .iconToolbar {
      display: flex;
      gap: 6px;
      align-items: center;
    }

    .iconButton {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border-radius: 10px;
      background: transparent;
      color: var(--muted);
      border: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
      cursor: pointer;
    }

    .iconButton svg {
      width: 15px;
      height: 15px;
      stroke: currentColor;
      fill: none;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .iconButton.danger {
      color: var(--danger);
    }

    .iconButton .codicon {
      font-size: 15px;
    }

    .danger {
      color: var(--danger);
      border-color: color-mix(in srgb, var(--danger) 40%, transparent);
    }

    .bottomBar {
      position: fixed;
      left: 50%;
      bottom: 18px;
      transform: translateX(-50%);
      z-index: 10;
      display: inline-flex;
      align-items: center;
      gap: 12px;
      background: color-mix(in srgb, var(--bg) 86%, transparent);
      padding: 6px 10px;
      border-radius: 10px;
      max-width: min(calc(100vw - 32px), 1100px);
      flex-wrap: wrap;
      justify-content: center;
    }

    .toggle {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: var(--muted);
      font-size: 13px;
      user-select: none;
      cursor: pointer;
      position: fixed;
      position: static;
    }

    .toggle input {
      margin: 0;
      accent-color: var(--accent);
    }

    .recentSections {
      display: grid;
      gap: 18px;
    }

    .recentBlock {
      display: grid;
      gap: 4px;
      margin-top: 0;
    }

    .leftRail {
      display: grid;
      gap: 56px;
      align-content: start;
    }

    #projectsColumn {
      display: none;
    }

    .leftRail .recentBlock {
      gap: 12px;
    }

    body.layout-tallProjectsRight .contentGrid,
    body.layout-tallProjectsLeft .contentGrid {
      grid-template-columns: minmax(280px, 0.85fr) minmax(0, 1.15fr);
      gap: 36px;
      align-items: start;
    }

    body.layout-tallProjectsRight #projectsColumn,
    body.layout-tallProjectsLeft #projectsColumn {
      display: grid;
      align-content: start;
    }

    body.layout-tallProjectsRight .featureGrid,
    body.layout-tallProjectsRight .recentGrid,
    body.layout-tallProjectsLeft .featureGrid,
    body.layout-tallProjectsLeft .recentGrid {
      grid-template-columns: 1fr;
      gap: 18px;
    }

    body.layout-tallProjectsRight .featureGrid > .column:last-child,
    body.layout-tallProjectsLeft .featureGrid > .column:last-child {
      display: none;
    }

    body.layout-tallProjectsRight .recentBlock,
    body.layout-tallProjectsLeft .recentBlock {
      margin-top: 0;
    }

    body.layout-tallProjectsLeft .contentGrid {
      grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
    }

    body.layout-tallProjectsLeft .leftRail {
      order: 2;
    }

    body.layout-tallProjectsLeft #projectsColumn {
      order: 1;
    }

    .recentSection {
      display: grid;
      gap: 10px;
    }

    .recentSubheading {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      color: var(--muted);
      letter-spacing: 0.02em;
    }

    .recentList {
      display: grid;
      gap: 8px;
    }

    .recentItem {
      display: flex;
      align-items: baseline;
      gap: 10px;
      min-width: 0;
    }

    .recentLead {
      display: inline-flex;
      align-items: baseline;
      gap: 8px;
      flex: 0 0 auto;
    }

    .recentImportButton {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      padding: 0;
      border: none;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      flex: 0 0 18px;
      border-radius: 4px;
    }

    .recentImportButton .codicon {
      font-size: 14px;
    }

    .recentButton {
      background: none;
      border: none;
      padding: 0;
      color: var(--link);
      font: inherit;
      font-size: 13px;
      line-height: 1.35;
      text-align: left;
      cursor: pointer;
      flex: 0 0 auto;
    }

    .recentDescription {
      color: var(--muted);
      font-size: 11px;
      line-height: 1.35;
      overflow-wrap: anywhere;
      min-width: 0;
    }

    .loadingText {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.4;
    }

    .footerMeta {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.35;
    }

    .footerMeta strong {
      color: var(--fg);
      font-weight: 600;
    }

    @media (max-width: 960px) {
      body {
        padding: 64px 28px 110px;
      }

      .page {
        gap: 20px;
        width: min(1360px, 100%);
      }

      .headerGrid,
      .featureGrid,
      .recentGrid,
      .contentGrid {
        grid-template-columns: 1fr;
        gap: 36px;
      }

      .cardRow {
        flex-direction: column;
      }

      .toolbar {
        min-width: 0;
        width: 100%;
        justify-content: flex-start;
      }

      .toggle {
        bottom: 12px;
      }

      .leftRail {
        gap: 36px;
      }

      body.layout-tallProjectsRight .featureGrid > .column:last-child,
      body.layout-tallProjectsLeft .featureGrid > .column:last-child {
        display: grid;
      }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="headerGrid">
      <section class="left">
        <div class="brand">
          <h1>Visual Studio Code</h1>
          <h2>Projects evolved</h2>
        </div>
      </section>
      <section class="controlPanel">
        <div class="actions">
          <button id="backup" class="accent">Backup</button>
          <button id="refresh" class="secondary">Aktualisieren</button>
        </div>
        <div class="storage" id="storagePath"></div>
      </section>
    </section>
    <section class="contentGrid">
      <section class="leftRail">
        <section class="featureGrid">
          <section class="column">
            <h3 class="sectionTitle">Start</h3>
            <div class="startList">
              <button class="startButton" data-start-action="newFile"><span class="startIcon codicon codicon-new-file"></span><span>New File...</span></button>
              <button class="startButton" data-start-action="openFile"><span class="startIcon codicon codicon-go-to-file"></span><span>Open File...</span></button>
              <button class="startButton" data-start-action="openFolder"><span class="startIcon codicon codicon-folder-opened"></span><span>Open Folder...</span></button>
              <button class="startButton" data-start-action="cloneGit"><span class="startIcon codicon codicon-source-control"></span><span>Clone Git Repository...</span></button>
              <button class="startButton" data-start-action="connectTo"><span class="startIcon codicon codicon-remote"></span><span>Connect to...</span></button>
              <button class="startButton" data-start-action="newWorkspace"><span class="startIcon codicon codicon-workspace-unknown"></span><span>Generate New Workspace...</span></button>
            </div>
          </section>
          <section class="column">
            <div class="sectionHeader">
              <h3 class="sectionTitle">Projekte</h3>
              <button id="createGroup" class="secondary">Neue Gruppe</button>
            </div>
            <div class="groupList" id="projectList"></div>
          </section>
        </section>
        <section class="recentBlock">
          <section class="column">
            <h3 class="sectionTitle">Recent</h3>
          </section>
          <section class="recentGrid">
            <section class="column">
              <section class="recentSection">
                <h4 class="recentSubheading">Ordner &amp; Workspaces</h4>
                <div class="recentList" id="recentLocations"></div>
              </section>
            </section>
            <section class="column">
              <section class="recentSection">
                <h4 class="recentSubheading">Dateien</h4>
                <div class="recentList" id="recentFiles"></div>
              </section>
            </section>
          </section>
        </section>
      </section>
      <section class="column" id="projectsColumn">
        <div class="sectionHeader">
          <h3 class="sectionTitle">Projekte</h3>
          <button id="createGroupSecondary" class="secondary">Neue Gruppe</button>
        </div>
        <div class="groupList" id="projectListSecondary"></div>
      </section>
    </section>
  </main>
  <div class="bottomBar">
    <label class="toggle">
      <input id="startupToggle" type="checkbox" />
      <span>Show welcome page on startup</span>
    </label>
    <label class="layoutSelectWrap" for="layoutSelect">
      <span class="layoutHint">Layout</span>
      <select id="layoutSelect" class="layoutSelect" title="Layout">
        <option value="balanced">Klassisch</option>
        <option value="tallProjectsRight">Projekte rechts</option>
        <option value="tallProjectsLeft">Projekte links</option>
      </select>
    </label>
    <div class="footerMeta" id="footerVersion"></div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const primaryProjectList = document.getElementById("projectList");
    const secondaryProjectList = document.getElementById("projectListSecondary");
    const recentLocations = document.getElementById("recentLocations");
    const recentFiles = document.getElementById("recentFiles");
    const storagePath = document.getElementById("storagePath");
    const startupToggle = document.getElementById("startupToggle");
    const layoutSelect = document.getElementById("layoutSelect");
    const createGroupButton = document.getElementById("createGroup");
    const createGroupSecondaryButton = document.getElementById("createGroupSecondary");
    const footerVersion = document.getElementById("footerVersion");
    let currentGroups = [];
    let activeDrag = null;
    let hasRenderedProjects = false;

    createGroupButton.addEventListener("click", () => vscode.postMessage({ type: "createGroup" }));
    createGroupSecondaryButton.addEventListener("click", () => vscode.postMessage({ type: "createGroup" }));
    document.getElementById("backup").addEventListener("click", () => vscode.postMessage({ type: "backupProjects" }));
    document.getElementById("refresh").addEventListener("click", () => vscode.postMessage({ type: "refreshProjects" }));
    document.querySelectorAll("[data-start-action]").forEach((element) => {
      element.addEventListener("click", () => {
        vscode.postMessage({ type: "startAction", action: element.getAttribute("data-start-action") });
      });
    });
    layoutSelect.addEventListener("change", () => {
      applyLayout(layoutSelect.value);
      vscode.postMessage({ type: "setLayout", layout: layoutSelect.value });
    });
    startupToggle.addEventListener("change", () => {
      vscode.postMessage({ type: "toggleStartup", enabled: startupToggle.checked });
    });

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (message.type === "projectsData") {
        const storageText = "Dauerhafter Speicherort: " + message.payload.storagePath;
        storagePath.textContent = storageText;
        startupToggle.checked = Boolean(message.payload.openOnStartup);
        layoutSelect.value = message.payload.layout || "balanced";
        footerVersion.innerHTML = "<strong>Version:</strong> " + escapeHtml(message.payload.extensionVersion);
        applyLayout(layoutSelect.value);
        currentGroups = cloneGroups(message.payload.groups || []);
        renderProjects(currentGroups);
        hasRenderedProjects = true;
        return;
      }

      if (message.type === "recentData") {
        renderRecentList(recentLocations, message.payload.recentLocations || [], "Noch keine zuletzt geoeffneten Ordner oder Workspaces verfuegbar.", true);
        renderRecentList(recentFiles, message.payload.recentFiles || [], "Noch keine zuletzt geoeffneten Dateien verfuegbar.", false);
      }
    });

    function renderProjects(groups) {
      const list = getActiveProjectList();
      const inactiveList = list === primaryProjectList ? secondaryProjectList : primaryProjectList;
      list.innerHTML = "";
      inactiveList.innerHTML = "";

      if (!groups.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "Noch keine Gruppen vorhanden. Lege zuerst eine Gruppe an.";
        list.appendChild(empty);
        return;
      }

      for (const group of groups) {
        const shell = document.createElement("div");
        shell.className = "groupShell";
        shell.dataset.groupId = group.id;

        const dragHandle = document.createElement("button");
        dragHandle.className = "dragHandle codicon codicon-gripper";
        dragHandle.title = "Gruppe verschieben";
        dragHandle.draggable = true;
        dragHandle.addEventListener("dragstart", (event) => {
          activeDrag = { kind: "group", groupId: group.id };
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", group.id);
          }
        });
        dragHandle.addEventListener("dragend", () => {
          activeDrag = null;
          clearDragStates();
        });

        const card = document.createElement("section");
        card.className = "groupCard";
        card.dataset.groupId = group.id;
        card.addEventListener("dragover", (event) => {
          if (activeDrag?.kind !== "group" || activeDrag.groupId === group.id) {
            return;
          }
          event.preventDefault();
          card.classList.add("drag-over");
        });
        card.addEventListener("dragleave", () => {
          card.classList.remove("drag-over");
        });
        card.addEventListener("drop", (event) => {
          if (activeDrag?.kind !== "group" || activeDrag.groupId === group.id) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          currentGroups = moveGroupBefore(currentGroups, activeDrag.groupId, group.id);
          persistGroupState();
        });

        const header = document.createElement("div");
        header.className = "groupHeader";

        const title = document.createElement("h4");
        title.className = "groupTitle";
        title.textContent = group.name;

        const createProjectButton = document.createElement("button");
        createProjectButton.className = "secondary";
        createProjectButton.textContent = "Neues Projekt";
        createProjectButton.addEventListener("click", () => {
          vscode.postMessage({ type: "createProject", groupId: group.id });
        });

        const renameGroupButton = document.createElement("button");
        renameGroupButton.className = "iconButton";
        renameGroupButton.innerHTML = '<span class="codicon codicon-settings-gear" aria-hidden="true"></span>';
        renameGroupButton.title = "Gruppe umbenennen";
        renameGroupButton.addEventListener("click", () => {
          vscode.postMessage({ type: "renameGroup", groupId: group.id });
        });

        const headerActions = document.createElement("div");
        headerActions.className = "iconToolbar";
        headerActions.appendChild(createProjectButton);
        headerActions.appendChild(renameGroupButton);

        header.appendChild(title);
        header.appendChild(headerActions);
        card.appendChild(header);

        const projects = document.createElement("div");
        projects.className = "groupProjects";
        projects.dataset.groupId = group.id;
        projects.addEventListener("dragover", (event) => {
          if (activeDrag?.kind !== "project") {
            return;
          }
          event.preventDefault();
          projects.classList.add("drag-over");
        });
        projects.addEventListener("dragleave", () => {
          projects.classList.remove("drag-over");
        });
        projects.addEventListener("drop", (event) => {
          if (activeDrag?.kind !== "project") {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          currentGroups = moveProject(currentGroups, activeDrag.projectId, group.id);
          persistGroupState();
        });

        if (!group.projects.length) {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.textContent = "Noch keine Projekte in dieser Gruppe.";
          projects.appendChild(empty);
        }

        for (const project of group.projects) {
          const shell = document.createElement("div");
          shell.className = "projectShell";
          shell.dataset.projectId = project.id;
          shell.dataset.groupId = group.id;
          shell.addEventListener("dragover", (event) => {
            if (activeDrag?.kind !== "project" || activeDrag.projectId === project.id) {
              return;
            }
            event.preventDefault();
            shell.classList.add("drag-over");
          });
          shell.addEventListener("dragleave", () => {
            shell.classList.remove("drag-over");
          });
          shell.addEventListener("drop", (event) => {
            if (activeDrag?.kind !== "project" || activeDrag.projectId === project.id) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            currentGroups = moveProject(currentGroups, activeDrag.projectId, group.id, project.id);
            persistGroupState();
          });

          const handle = document.createElement("button");
          handle.className = "dragHandle codicon codicon-grabber";
          handle.title = "Projekt verschieben";
          handle.draggable = true;
          handle.addEventListener("dragstart", (event) => {
            activeDrag = { kind: "project", projectId: project.id };
            if (event.dataTransfer) {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", project.id);
            }
          });
          handle.addEventListener("dragend", () => {
            activeDrag = null;
            clearDragStates();
          });

          const row = document.createElement("div");
          row.className = "projectRow";

          const left = document.createElement("div");
          left.className = "cardMeta";

          const open = document.createElement("button");
          open.className = "link";
          open.textContent = project.name;
          open.addEventListener("click", () => vscode.postMessage({ type: "openProject", id: project.id }));

          const description = document.createElement("div");
          if (project.description) {
            description.className = "description";
            description.textContent = project.description;
          }

          const path = document.createElement("div");
          path.className = project.description ? "path" : "path tight";
          path.textContent = (project.targetType === "workspace" ? "Workspace" : "Ordner") + ": " + project.targetPath;

          left.appendChild(open);
          if (project.description) {
            left.appendChild(description);
          }
          left.appendChild(path);

          const toolbar = document.createElement("div");
          toolbar.className = "iconToolbar";

          const edit = document.createElement("button");
          edit.className = "iconButton";
          edit.innerHTML = '<span class="codicon codicon-edit" aria-hidden="true"></span>';
          edit.title = "Bearbeiten";
          edit.addEventListener("click", () => vscode.postMessage({ type: "editProject", id: project.id }));

          const del = document.createElement("button");
          del.className = "iconButton danger";
          del.innerHTML = '<span class="codicon codicon-trash" aria-hidden="true"></span>';
          del.title = "Loeschen";
          del.addEventListener("click", () => vscode.postMessage({ type: "deleteProject", id: project.id }));

          toolbar.appendChild(edit);
          toolbar.appendChild(del);
          row.appendChild(left);
          row.appendChild(toolbar);
          shell.appendChild(handle);
          shell.appendChild(row);
          projects.appendChild(shell);
        }

        card.appendChild(projects);
        shell.appendChild(dragHandle);
        shell.appendChild(card);
        list.appendChild(shell);
      }
    }

    function clearDragStates() {
      document.querySelectorAll(".drag-over").forEach((element) => {
        element.classList.remove("drag-over");
      });
    }

    function persistGroupState() {
      clearDragStates();
      activeDrag = null;
      renderProjects(currentGroups);
      vscode.postMessage({ type: "updateGroups", groups: currentGroups });
    }

    function cloneGroups(groups) {
      return JSON.parse(JSON.stringify(groups));
    }

    function moveGroupBefore(groups, sourceGroupId, targetGroupId) {
      const next = cloneGroups(groups);
      const sourceIndex = next.findIndex((group) => group.id === sourceGroupId);
      const targetIndex = next.findIndex((group) => group.id === targetGroupId);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
        return next;
      }

      const [moved] = next.splice(sourceIndex, 1);
      const insertionIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      next.splice(insertionIndex, 0, moved);
      return next;
    }

    function moveProject(groups, projectId, targetGroupId, beforeProjectId = null) {
      const next = cloneGroups(groups);
      let movedProject = null;

      for (const group of next) {
        const index = group.projects.findIndex((project) => project.id === projectId);
        if (index >= 0) {
          [movedProject] = group.projects.splice(index, 1);
          break;
        }
      }

      if (!movedProject) {
        return next;
      }

      const targetGroup = next.find((group) => group.id === targetGroupId);
      if (!targetGroup) {
        return next;
      }

      if (beforeProjectId) {
        const insertionIndex = targetGroup.projects.findIndex((project) => project.id === beforeProjectId);
        if (insertionIndex >= 0) {
          targetGroup.projects.splice(insertionIndex, 0, movedProject);
          return next;
        }
      }

      targetGroup.projects.push(movedProject);
      return next;
    }

    function renderRecentList(container, recent, emptyText, allowImport) {
      container.innerHTML = "";

      if (!recent.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = emptyText;
        container.appendChild(empty);
        return;
      }

      for (const item of recent) {
        const row = document.createElement("div");
        row.className = "recentItem";

        const lead = document.createElement("div");
        lead.className = "recentLead";

        if (allowImport && (item.targetType === "folder" || item.targetType === "workspace") && !isKnownProjectPath(item.targetPath)) {
          const importButton = document.createElement("button");
          importButton.className = "recentImportButton";
          importButton.title = "Als Projekt uebernehmen";
          importButton.innerHTML = '<span class="codicon codicon-add" aria-hidden="true"></span>';
          importButton.addEventListener("click", () => {
            vscode.postMessage({ type: "importRecentAsProject", path: item.targetPath, targetType: item.targetType, label: item.label });
          });
          lead.appendChild(importButton);
        }

        const button = document.createElement("button");
        button.className = "recentButton";
        button.textContent = item.label;
        button.addEventListener("click", () => {
          vscode.postMessage({ type: "openRecent", path: item.targetPath, targetType: item.targetType });
        });

        const description = document.createElement("div");
        description.className = "recentDescription";
        description.textContent = item.description;

        lead.appendChild(button);
        row.appendChild(lead);
        row.appendChild(description);
        container.appendChild(row);
      }
    }

    function renderLoadingState() {
      if (!hasRenderedProjects) {
        getActiveProjectList().innerHTML = '<div class="loadingText">Projekte werden geladen...</div>';
      }
      recentLocations.innerHTML = '<div class="loadingText">Recent wird geladen...</div>';
      recentFiles.innerHTML = '<div class="loadingText">Recent wird geladen...</div>';
    }

    function isKnownProjectPath(targetPath) {
      const normalized = normalizePath(targetPath);
      return currentGroups.some((group) => group.projects.some((project) => normalizePath(project.targetPath) === normalized));
    }

    function normalizePath(targetPath) {
      return String(targetPath || "").replace(/\\\\/g, "/").toLowerCase();
    }

    function applyLayout(layout) {
      document.body.classList.remove("layout-balanced", "layout-tallProjectsRight", "layout-tallProjectsLeft");
      if (layout === "tallProjectsRight") {
        document.body.classList.add("layout-tallProjectsRight");
      } else if (layout === "tallProjectsLeft") {
        document.body.classList.add("layout-tallProjectsLeft");
      } else {
        document.body.classList.add("layout-balanced");
      }
      primaryProjectList.innerHTML = "";
      secondaryProjectList.innerHTML = "";
      if (hasRenderedProjects) {
        renderProjects(currentGroups);
      } else {
        renderLoadingState();
      }
    }

    function getActiveProjectList() {
      return document.body.classList.contains("layout-tallProjectsRight")
        || document.body.classList.contains("layout-tallProjectsLeft")
        ? secondaryProjectList
        : primaryProjectList;
    }

    function escapeHtml(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    renderLoadingState();
    applyLayout(layoutSelect.value);
    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
}

function getOpenOnStartupSetting(): boolean {
  return vscode.workspace.getConfiguration("projectWelcome").get<boolean>("openOnStartup", true);
}

async function getExtensionUiMeta(context: vscode.ExtensionContext): Promise<ExtensionUiMeta> {
  const version = String(context.extension.packageJSON.version ?? "unbekannt");
  const shortcut = await resolveOpenStartPageShortcut(context);

  return {
    version,
    shortcutLabel: shortcut,
    shortcutEnabled: shortcut !== "deaktiviert"
  };
}

async function resolveOpenStartPageShortcut(context: vscode.ExtensionContext): Promise<string> {
  if (!vscode.workspace.getConfiguration("projectWelcome").get<boolean>("enableOpenStartPageKeybinding", false)) {
    return "deaktiviert";
  }

  const resolvedUserShortcut = await findConfiguredShortcutForCommand(
    context,
    "projectWelcome.openStartPage"
  );

  return resolvedUserShortcut ?? getDefaultOpenStartPageShortcut();
}

async function findConfiguredShortcutForCommand(
  context: vscode.ExtensionContext,
  commandId: string
): Promise<string | undefined> {
  const keybindingsPath = await resolveActiveProfileKeybindingsPath(context);
  if (!keybindingsPath) {
    return undefined;
  }

  try {
    const raw = await fs.readFile(keybindingsPath, "utf8");
    const parsed = JSON.parse(stripJsonComments(raw)) as Array<{
      key?: string;
      command?: string;
    }>;

    let resolvedShortcut: string | undefined;
    let isDisabled = false;
    for (const entry of parsed) {
      if (!entry || typeof entry.command !== "string") {
        continue;
      }

      if (entry.command === `-${commandId}`) {
        isDisabled = true;
        continue;
      }

      if (entry.command === commandId && typeof entry.key === "string" && entry.key.trim()) {
        resolvedShortcut = formatShortcutLabel(entry.key);
      }
    }

    if (resolvedShortcut) {
      return resolvedShortcut;
    }

    return isDisabled ? "deaktiviert" : undefined;
  } catch {
    return undefined;
  }
}

async function resolveActiveProfileKeybindingsPath(
  context: vscode.ExtensionContext
): Promise<string | undefined> {
  const userDir = path.resolve(context.globalStorageUri.fsPath, "..", "..");
  const defaultKeybindingsPath = path.join(userDir, "keybindings.json");
  const storagePath = path.join(userDir, "globalStorage", "storage.json");

  try {
    const raw = await fs.readFile(storagePath, "utf8");
    const storage = JSON.parse(raw) as {
      profileAssociations?: {
        workspaces?: Record<string, string>;
        emptyWindows?: Record<string, string>;
      };
      userDataProfiles?: Array<{ location?: string; name?: string }>;
    };

    const workspaceKey = getCurrentWorkspaceAssociationKey();
    if (!workspaceKey) {
      return defaultKeybindingsPath;
    }

    const profileId = storage.profileAssociations?.workspaces?.[workspaceKey];
    if (!profileId || profileId === "__default__profile__") {
      return defaultKeybindingsPath;
    }

    const knownProfile = storage.userDataProfiles?.some((profile) => profile.location === profileId);
    if (!knownProfile) {
      return defaultKeybindingsPath;
    }

    return path.join(userDir, "profiles", profileId, "keybindings.json");
  } catch {
    return defaultKeybindingsPath;
  }
}

function getCurrentWorkspaceAssociationKey(): string | undefined {
  if (vscode.workspace.workspaceFile) {
    return vscode.workspace.workspaceFile.toString();
  }

  if (vscode.workspace.workspaceFolders?.length) {
    return vscode.workspace.workspaceFolders[0].uri.toString();
  }

  return undefined;
}

function stripJsonComments(value: string): string {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function getDefaultOpenStartPageShortcut(): string {
  return process.platform === "darwin" ? "Shift+F1" : "Shift+F1";
}

function formatShortcutLabel(shortcut: string): string {
  return shortcut
    .split(" ")
    .map((part) => part
      .split("+")
      .map((segment) => formatShortcutSegment(segment))
      .join("+"))
    .join(" then ");
}

function formatShortcutSegment(segment: string): string {
  const normalized = segment.trim();
  if (!normalized) {
    return normalized;
  }

  const lower = normalized.toLowerCase();
  const replacements: Record<string, string> = {
    cmd: "Cmd",
    ctrl: "Ctrl",
    shift: "Shift",
    alt: "Alt",
    option: "Option",
    meta: "Meta"
  };

  if (replacements[lower]) {
    return replacements[lower];
  }

  if (/^\[[^\]]+\]$/.test(normalized)) {
    return normalized.slice(1, -1);
  }

  if (/^f\d+$/i.test(normalized)) {
    return normalized.toUpperCase();
  }

  if (normalized.length === 1) {
    return normalized.toUpperCase();
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

async function setOpenOnStartupSetting(enabled: boolean): Promise<void> {
  await vscode.workspace.getConfiguration("projectWelcome").update(
    "openOnStartup",
    enabled,
    vscode.ConfigurationTarget.Global
  );
}

function getWelcomeLayoutSetting(): WelcomeLayout {
  const value = vscode.workspace.getConfiguration("projectWelcome").get<string>("layout", "balanced");
  if (value === "tallProjectsRight" || value === "tallProjectsLeft") {
    return value;
  }

  return "balanced";
}

async function setWelcomeLayoutSetting(layout: WelcomeLayout): Promise<void> {
  await vscode.workspace.getConfiguration("projectWelcome").update(
    "layout",
    layout,
    vscode.ConfigurationTarget.Global
  );
}

async function getRecentEntries(): Promise<RecentCollections> {
  try {
    const recent = await vscode.commands.executeCommand<any>("_workbench.getRecentlyOpened");
    const locationEntries = (Array.isArray(recent?.workspaces) ? recent.workspaces : [])
      .map((entry: any) => mapRecentLocationEntry(entry))
      .filter((entry: RecentEntry | undefined): entry is RecentEntry => Boolean(entry))
      .slice(0, 8);
    const fileEntries = (Array.isArray(recent?.files) ? recent.files : [])
      .map((entry: any) => mapRecentFileEntry(entry))
      .filter((entry: RecentEntry | undefined): entry is RecentEntry => Boolean(entry))
      .slice(0, 8);

    return {
      locations: locationEntries,
      files: fileEntries
    };
  } catch {
    return {
      locations: [],
      files: []
    };
  }
}

function mapRecentLocationEntry(entry: any): RecentEntry | undefined {
  const folderUri = entry?.folderUri;
  const workspace = entry?.workspace;

  if (folderUri?.fsPath) {
    return {
      label: getBaseName(folderUri.fsPath),
      description: folderUri.fsPath,
      targetPath: folderUri.fsPath,
      targetType: "folder"
    };
  }

  if (workspace?.configPath?.fsPath) {
    return {
      label: workspace?.label || getBaseName(workspace.configPath.fsPath),
      description: workspace.configPath.fsPath,
      targetPath: workspace.configPath.fsPath,
      targetType: "workspace"
    };
  }

  return undefined;
}

function mapRecentFileEntry(entry: any): RecentEntry | undefined {
  const fileUri = entry?.fileUri;

  if (fileUri?.fsPath && fileUri.fsPath.endsWith(".code-workspace")) {
    return {
      label: getBaseName(fileUri.fsPath),
      description: fileUri.fsPath,
      targetPath: fileUri.fsPath,
      targetType: "workspace"
    };
  }

  if (fileUri?.fsPath) {
    return {
      label: getBaseName(fileUri.fsPath),
      description: fileUri.fsPath,
      targetPath: fileUri.fsPath,
      targetType: "file"
    };
  }

  return undefined;
}

function getBaseName(targetPath: string): string {
  const normalized = targetPath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || targetPath;
}

async function openTargetPath(targetPath: string, targetType: RecentTargetType): Promise<void> {
  const target = vscode.Uri.file(targetPath);
  if (targetType === "file") {
    await vscode.commands.executeCommand("vscode.open", target);
    return;
  }

  await closeStartPageTabs();
  await vscode.commands.executeCommand("vscode.openFolder", target, false);
}

async function executeStartAction(action: StartActionType): Promise<void> {
  switch (action) {
    case "newFile":
      await vscode.commands.executeCommand("workbench.action.files.newUntitledFile");
      break;
    case "openFile":
      await vscode.commands.executeCommand("workbench.action.files.openFile");
      break;
    case "openFolder":
      await vscode.commands.executeCommand("workbench.action.files.openFolder");
      break;
    case "cloneGit":
      await vscode.commands.executeCommand("git.clone");
      break;
    case "connectTo":
      await vscode.commands.executeCommand("workbench.action.remote.showMenu");
      break;
    case "newWorkspace":
      await vscode.commands.executeCommand("workbench.action.files.saveWorkspaceAs");
      break;
    default:
      break;
  }
}

async function openStartPageOnStartup(
  panelRef: { current: vscode.WebviewPanel | undefined },
  context: vscode.ExtensionContext,
  store: ProjectStore
): Promise<void> {
  const wasOpenPreviously = context.workspaceState.get<boolean>(startPageOpenStateKey, false);
  await delay(wasOpenPreviously ? 1600 : 350);

  if (panelRef.current || hasStartPageTabOpen()) {
    return;
  }

  panelRef.current = createOrRevealStartPage(panelRef, context, store, true);
}

async function closeStartPageTabs(): Promise<void> {
  const tabs = getStartPageTabs();
  if (!tabs.length) {
    return;
  }

  await vscode.window.tabGroups.close(tabs, true);
}

function getStartPageTabs(): vscode.Tab[] {
  return vscode.window.tabGroups.all.flatMap((group) => group.tabs.filter((tab) => {
    const input = tab.input;
    return input instanceof vscode.TabInputWebview && input.viewType === startPageViewType;
  }));
}

async function reconcileStartPageTabs(
  panelRef: { current: vscode.WebviewPanel | undefined },
  context: vscode.ExtensionContext,
  isReconciling: boolean,
  setReconciling: (value: boolean) => void
): Promise<void> {
  if (isReconciling) {
    return;
  }

  const tabs = getStartPageTabs();
  if (tabs.length <= 1) {
    await setStartPageOpenState(context, tabs.length === 1 || Boolean(panelRef.current));
    return;
  }

  setReconciling(true);

  try {
    const activeTab = tabs.find((tab) => tab.isActive);
    const tabToKeep = activeTab ?? tabs[tabs.length - 1];
    const tabsToClose = tabs.filter((tab) => tab !== tabToKeep);

    if (tabsToClose.length) {
      await vscode.window.tabGroups.close(tabsToClose, true);
    }

    await setStartPageOpenState(context, true);
  } finally {
    setReconciling(false);
  }
}

async function setStartPageOpenState(context: vscode.ExtensionContext, isOpen: boolean): Promise<void> {
  await context.workspaceState.update(startPageOpenStateKey, isOpen);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
