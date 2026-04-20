# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and follows semantic versioning.

## [1.0.3] - 2026-04-20

### Added

- Custom welcome page for VS Code with project-focused layouts and startup integration
- Persistent project groups with JSON-backed storage in VS Code global storage
- Drag-and-drop sorting for groups and projects, including moving projects across groups
- Recent sections for folders, workspaces, and files, including import of recent folders/workspaces as projects
- Local VSIX packaging into `artifacts/vsix/`
- Rolling VSIX builds on `main` via GitHub Actions
- Official tag-based release workflow for stable VSIX builds
- Extension icon setup for GitHub, VSIX, and later Marketplace publication

### Changed

- GitHub metadata, README, and packaging metadata prepared for open-source distribution
- Rolling builds now update a persistent GitHub pre-release test channel

### Fixed

- Workflow and packaging setup cleaned up so release artifacts contain only the files needed at runtime
