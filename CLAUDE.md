# CLAUDE.md

## Zweck
VS-Code-Extension „Project Welcome Page" (`package.json`: Name `project-welcome-page`, Publisher `antonio-cambule`, MIT). Ersetzt die Standard-Startseite durch eine eigene Welcome Page (Webview-Panel) mit Projektgruppen, Recent-Listen (Ordner, Workspaces, Dateien), Drag-and-drop-Sortierung, JSON-Backup und optionalem Öffnen beim Start. Zusätzlich gibt es eine Activity-Bar-Ansicht „Projects" mit Webview „Welcome".

## Technik
- TypeScript (strict, ES2022, CommonJS), Kompilierung mit `tsc` nach `dist/` (kein Bundler). npm als Paketmanager (`package-lock.json`).
- Abhängigkeiten: `@vscode/codicons` (zur Laufzeit als Datei in `media/`), `@vscode/vsce` zum Packen. Mindestversion VS Code `^1.116.0`.
- Es gibt keine Tests und keinen Linter. Statische Prüfung nur über `npm run check` (`tsc --noEmit`).

## Struktur
- `src/extension.ts`: Einstieg (`activate` / `deactivate`), Befehle, Webview-Provider, kompletter Webview-HTML/CSS/JS-Code als Template-Strings, Projekt-/Gruppenlogik, Recent-Einträge, Startup- und Tab-Logik.
- `src/models.ts`: Typen `ProjectEntry`, `ProjectGroup`, `ProjectsFile` (`version: 2`).
- `src/storage.ts`: `ProjectStore`, Persistenz in `projects.json` unter `context.globalStorageUri`, inkl. Backup und Migration einer Altdatei.
- `media/`: Icons und die per Skript kopierten Codicon-Dateien. `scripts/`: Build-, Packaging- und Release-Hilfen. `.githooks/`: Pre-commit. `.github/workflows/`: VSIX-CI. `dist/` und `artifacts/` sind generiert und per `.gitignore` ausgeschlossen.

## Erweiterungsbeiträge
- Deklariert in `package.json` (`contributes`): Befehle, Keybinding `shift+f1` (nur bei `projectWelcome.enableOpenStartPageKeybinding`), Einstellungen `openOnStartup`, `enableOpenStartPageKeybinding`, `layout`, Activity-Bar-Container und Webview-Ansicht `projectWelcome.projects`.
- Befehle: `projectWelcome.openStartPage`, `createProject`, `createGroup`, `backupProjects`, `refreshProjects`. Registriert in `activate()` in `src/extension.ts`.
- Aktivierung über `"*"` (beim Start). `activate()` öffnet die Startseite, wenn `openOnStartup` aktiv ist.

## Architektur und Konventionen
- Kommunikation Webview → Extension per `postMessage` mit einer diskriminierten Union `WebviewRequest` (Feld `type`). Die Behandlung läuft über `handleSharedMessage` für Sidebar und Panel. Die Extension schickt den Zustand per `postProjectsToWebview` / `postProjectsToPanel` zurück.
- Webview-HTML mit Content-Security-Policy und Nonce (`getNonce`).
- Der Zustand „Startseite offen" liegt in `workspaceState` (`projectWelcome.startPageOpen`). `reconcileStartPageTabs` gleicht Tabs bei `tabGroups.onDidChangeTabs` ab.
- Ressourcen werden über `context.subscriptions` verwaltet. Diagnoseausgabe über `logProjectWelcome`.
- UI-Texte und Prompts im Code sind teils Deutsch, teils Englisch gemischt. Die Standardgruppe heißt „Allgemein".

## Befehle
- `npm install`, `npm run build` (synct Codicons, dann `tsc -p .`), `npm run watch`, `npm run check`.
- Debuggen: F5 mit Konfiguration „Run Project Welcome Extension" (`.vscode/launch.json`, Pre-Launch-Task `npm: build`).
- Packen: `npm run package:local` (VSIX nach `artifacts/vsix/`), `package:ci`, `install:vsix` (Installation in VS-Code-Profile).
- Release: `release:notes` zieht Notes aus `CHANGELOG.md`. Rolling-VSIX-Build bei Push auf `main`, Release-VSIX bei Tags `v*`.
- Versionierung: `npm run install:hooks` aktiviert den Pre-commit-Hook, der die Patch-Version in `package.json` erhöht. Überspringen mit `SKIP_VERSION_BUMP=1`.
