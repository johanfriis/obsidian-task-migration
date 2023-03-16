import { App, PluginSettingTab, Setting } from "obsidian";
import ObsidianPluginStarter from "../main";
import { Settings } from "./Settings.types";

export const DEFAULT_SETTINGS: Settings = {
  someField: "",
};

export class ObsidianPluginStarterTab extends PluginSettingTab {
  plugin: ObsidianPluginStarter;

  constructor(app: App, plugin: ObsidianPluginStarter) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    this.addHeading();
    this.addSomeField();
  }

  addHeading(): void {
    this.containerEl.createEl("h2", {
      text: "Obsidian Plugin Starter Settings",
    });
  }

  addSomeElement(): void {
    new Setting(this.containerEl)
      .setName("Some Field")
      .setDesc("A field that does something useful")
      .addText((text) =>
        text
          .setPlaceholder("Placeholder")
          .setValue(this.plugin.settings.someField ?? "")
          .onChange(async (value) => {
            this.plugin.settings.someField = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
