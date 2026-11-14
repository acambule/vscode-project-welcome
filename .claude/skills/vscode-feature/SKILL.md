---
name: vscode-feature
description: >-
  Implementiere oder ändere eine Funktion in diesem VS-Code-Plugin —
  Befehle, Editor-Aktionen, Ansichten, Webviews, Einstellungen oder
  Integrationen. Verwende diesen Skill immer dann, wenn eine Anfrage
  das Verhalten oder die Bedienung des Plugins erweitert oder verändert
  (z. B. „füge einen Befehl hinzu“, „ergänze eine Einstellung“ oder
  „zeige Ergebnisse in einer Seitenleiste“), auch wenn das Wort
  „Feature“ nicht genannt wird.
---

# Implementierung von VS-Code-Plugin-Funktionen

1. Lies CLAUDE.md und halte dich an die dort dokumentierten Architektur-, Programmier- und Kommunikationskonventionen.

2. Lies gegebenenfalls vorhandene Referenzdokumente im Ordner references/, soweit sie für die angefragte Funktion relevant sind.

3. Prüfe vor der Verwendung von Befehlen, Einstellungen, Tastenkombinationen oder Aktivierungsmechanismen die package.json und die zugehörigen Implementierungen und Registrierungen im Code. Verwende vorhandene Definitionen und Bezeichner wieder. Falls eine neue Definition tatsächlich erforderlich ist, benenne sie ausdrücklich und ergänze die dafür notwendigen Stellen konsistent. Setze keine nicht vorhandenen Befehle oder Konfigurationen voraus. Falls der Nutzer selbst etwas konfigurieren muss, nenne die genaue Einstellung und den benötigten Wert.

4. Finde die relevanten Dateien und nimm die kleinstmögliche Änderung vor, die zu den bestehenden Mustern passt. Beachte die verwendete Sprache, Typisierung, Fehlerbehandlung sowie die bestehende Verwaltung von Ressourcen und Event-Listenern. Vermeide sachfremde Refactorings und neue Abhängigkeiten.

5. Fasse kurz zusammen, was geändert wurde, und beschreibe einen konkreten manuellen Test im Extension Development Host von VS Code mit Aktion und erwartetem Ergebnis. Behaupte nicht, dass die Funktion funktioniert — das manuelle Ausführen und Prüfen übernimmt der Nutzer. Falls du automatisierte Prüfungen ausgeführt hast, nenne diese und ihre tatsächlichen Ergebnisse getrennt davon.