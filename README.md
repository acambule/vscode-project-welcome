# Project Welcome Page

A custom welcome page for Visual Studio Code with persistent project groups, recent items, drag-and-drop organization, and startup integration.

Created by Antonio Cambule.

## Features

- Eigene Startseite als Webview-Panel, optional automatisch beim Start
- Seitenleistenansicht fuer Projekte
- Projektgruppen mit mehreren Projekten
- Projekte mit Name, Beschreibung und Zielpfad
- Drag-and-drop Sortierung fuer Gruppen und Projekte
- Recent-Bereiche fuer Ordner, Workspaces und Dateien
- Oeffnen von Ordnern und `.code-workspace` Dateien
- Bearbeiten, Loeschen und JSON-Backup
- Dauerhafte Speicherung in `context.globalStorageUri`

## Development

```bash
npm install
npm run build
npm run install:hooks
```

Danach das Projekt in VS Code oeffnen und `F5` starten.

## Automatic Version Bump

Dieses Projekt kann die Patch-Version in `package.json` automatisch bei jedem Commit erhoehen.

Einmalig aktivieren:

```bash
npm run install:hooks
```

Danach fuehrt der `pre-commit` Hook vor jedem Commit automatisch aus:

- Patch-Version erhoehen, zum Beispiel `0.0.1` -> `0.0.2`
- `package.json` erneut zum Commit hinzufuegen

Wenn du den Automatismus in einem Einzelfall ueberspringen willst:

```bash
SKIP_VERSION_BUMP=1 git commit -m "..."
```

## Local Packaging

Die lokale VSIX-Ausgabe landet gesammelt in `artifacts/vsix/`.

```bash
npm run package:local
```

Das Skript:

- baut zuerst die Extension neu
- erstellt bei Bedarf den Ordner `artifacts/vsix/`
- legt dort die fertige `.vsix` Datei ab

Die erzeugte Datei kann anschliessend in VS Code ueber `Extensions: Install from VSIX...` installiert werden.

## Rolling VSIX Build On Main

Bei jedem Push auf `main` erzeugt GitHub Actions automatisch eine Rolling-VSIX, laedt sie als Workflow-Artefakt hoch und aktualisiert zusaetzlich ein festes GitHub Pre-Release fuer Testzwecke.

Eigenschaften:

- GitHub Pre-Release als dauerhafter Test-Kanal
- keine Marketplace-Veroeffentlichung
- keine dauerhafte Aenderung an der `package.json` im Repository
- Vorab-Version im Format `x.y.z-main.<run-number>`
- immer eine stabile Download-Datei im Pre-Release: `project-welcome-page-rolling-latest.vsix`

Lokal kannst du denselben Typ Build auch manuell erzeugen:

```bash
npm run package:ci
```

Die Rolling-VSIX landet dann unter `artifacts/vsix/rolling/`.

Online findest du sie anschliessend an zwei Stellen:

- unter `Actions` als Workflow-Artefakt des jeweiligen Runs
- unter `Releases` als stets aktualisiertes Pre-Release `Rolling Build`

## Official Release Build

Ein offizielles GitHub Release wird erzeugt, sobald du einen Versions-Tag im Format `vX.Y.Z` auf den Remote pushst.

Beispiel:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Dabei gilt:

- der Tag muss exakt zur `version` in `package.json` passen
- es wird eine normale VSIX mit der stabilen Versionsnummer gebaut
- die VSIX wird als Workflow-Artefakt hochgeladen
- zusaetzlich wird ein GitHub Release mit angehaengter VSIX erstellt

Wenn `package.json` zum Beispiel `0.1.0` enthaelt, dann muss der Tag `v0.1.0` sein.

## Publishing Preparation

Das Projekt ist fuer GitHub und eine spaetere Marketplace-Veroeffentlichung vorbereitet.

Noch spaeter zu ergaenzen:

- optional ein Marketplace-Icon

## Links

- Repository: https://github.com/acambule/vscode-project-welcome
- Issues: https://github.com/acambule/vscode-project-welcome/issues
