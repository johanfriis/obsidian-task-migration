import { App, TFile } from "obsidian";

export function getAllFilePaths(app: App) {
  return app.vault
    .getAllLoadedFiles()
    .filter((f) => f instanceof TFile && f.path !== "/")
    .map((f) => f.path);
}
