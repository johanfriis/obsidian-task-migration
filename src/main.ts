import { Plugin } from "obsidian";
import {
  ObsidianPluginStarterTab,
  DEFAULT_SETTINGS,
  Settings,
} from "./settings";

export default class ObsidianPluginStarter extends Plugin {
  settings: Settings;

  async onload() {
    console.log("Loading Obsidian Plugin Starter ...");

    await this.loadSettings();
    this.addSettingTab(new ObsidianPluginStarterTab(this.app, this));

    this.startPlugin();

    console.log("Obsidian Plugin Starter running ...");
  }

  startPlugin() {
    console.log("Obsidian Plugin starter is starting");

    /**
     * Here we can actually start manipulating the view
     */
    this.app.workspace.onLayoutReady(async () => {});
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.startPlugin();
  }
}
