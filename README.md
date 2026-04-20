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
```

Danach das Projekt in VS Code oeffnen und `F5` starten.

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

## Publishing Preparation

Das Projekt ist fuer eine spaetere GitHub-Repository-Verknuepfung und Marketplace-Veroeffentlichung vorbereitet.

Noch spaeter zu ergaenzen:

- `repository`
- `homepage`
- `bugs`
- optional ein Marketplace-Icon
