import { App, PluginSettingTab, Setting } from "obsidian";
import TaskMigrationPlugin from "../main";
import { Settings } from "./Settings.types";

export const DEFAULT_SETTINGS: Settings = {
  taskHeadingLevel: "2",
  taskHeadingName: "Tasks",
};

export class TaskMigrationSettings extends PluginSettingTab {
  plugin: TaskMigrationPlugin;

  constructor(app: App, plugin: TaskMigrationPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    this.addHeading();
    this.addTaskHeadingLevel();
    this.addTaskHeadingName();
  }

  addHeading(): void {
    this.containerEl.createEl("h2", {
      text: "Obsidian Task Migration Settings",
    });
  }

  addTaskHeadingLevel(): void {
    new Setting(this.containerEl)
      .setName("Task Heading Level")
      .setDesc("What heading level are tasks nested beneath?")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("1", "1")
          .addOption("2", "2")
          .addOption("3", "3")
          .addOption("4", "4")
          .addOption("5", "5")
          .addOption("6", "6")
          .setValue(this.plugin.settings.taskHeadingLevel)
          .onChange(async (value) => {
            this.plugin.settings.taskHeadingLevel = value;
            await this.plugin.saveSettings();
          })
      );
  }

  addTaskHeadingName(): void {
    new Setting(this.containerEl)
      .setName("Task Heading Name")
      .setDesc("What heading name are tasks nested beneath?")
      .addText((text) =>
        text
          .setPlaceholder("Tasks")
          .setValue(this.plugin.settings.taskHeadingName)
          .onChange(async (value) => {
            this.plugin.settings.taskHeadingName = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
