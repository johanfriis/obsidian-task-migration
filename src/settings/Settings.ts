import { App, PluginSettingTab, Setting } from "obsidian";
import TaskMigrationPlugin from "../main";
import { Settings } from "./Settings.types";
import { getAllFilePaths } from "../helpers";

export const DEFAULT_SETTINGS: Settings = {
  taskHeadingLevel: "2",
  taskHeadingName: "Tasks",
  sidewaysFile: null,
  refLinkAlias: undefined,
  migrationTag: undefined,
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
    this.addRefLinkAlias();
    this.addMigrationTag();
    this.addSidewaysMigrationFile();
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

  addRefLinkAlias(): void {
    new Setting(this.containerEl)
      .setName("Reference Link Alias")
      .setDesc("An optional alias to use for reference links.")
      .addText((text) =>
        text
          .setPlaceholder("ref")
          .setValue(this.plugin.settings.refLinkAlias ?? "")
          .onChange(async (value) => {
            this.plugin.settings.refLinkAlias =
              value === "" ? undefined : value;
            await this.plugin.saveSettings();
          })
      );
  }

  addMigrationTag(): void {
    new Setting(this.containerEl)
      .setName("Migration Tag")
      .setDesc("Tag to add to migrated tasks (without #).")
      .addText((text) =>
        text
          .setPlaceholder("migrated")
          .setValue(this.plugin.settings.migrationTag ?? "")
          .onChange(async (value) => {
            this.plugin.settings.migrationTag =
              value === "" ? undefined : value;
            await this.plugin.saveSettings();
          })
      );
  }

  addSidewaysMigrationFile(): void {
    const files = getAllFilePaths(this.app);

    const fileOptions = Object.fromEntries(files.map((file) => [file, file]));

    new Setting(this.containerEl)
      .setName("Sideways Migration File")
      .setDesc(
        "Choose a file to migrate tasks to when migrating sideways. If empty, you will be asked every time."
      )
      .addDropdown((component) => {
        return component
          .addOptions(fileOptions)
          .setValue(this.plugin.settings.sidewaysFile ?? "")
          .onChange(async (value) => {
            this.plugin.settings.sidewaysFile = value === "" ? null : value;
            await this.plugin.saveSettings();
          });
      });
  }
}
