import {
  Plugin,
  moment,
  TFile,
  Editor,
  Notice,
  CachedMetadata,
  HeadingCache,
} from "obsidian";
import { TaskMigrationSettings, DEFAULT_SETTINGS, Settings } from "./settings";
import {
  getAllDailyNotes,
  appHasDailyNotesPluginLoaded,
  getDateUID,
  getDailyNoteSettings,
} from "obsidian-daily-notes-interface";
import { FileAlreadyMigrated, FileHasNoTasksHeading } from "./consts";
import { getDailyNotes, getTaskSection } from "./helpers";

export default class TaskMigrationPlugin extends Plugin {
  settings: Settings;
  pluginName = "Task Migration";

  headingLevel: number;
  headingName: string;

  taskRegex = /^(?<whitespace>\s*)- \[(?<char>.)\]\s.*$/;

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new TaskMigrationSettings(this.app, this));
    this.refreshSettings();

    this.addCommand({
      id: "obsidian-task-migration-migrate",
      name: `Migrate Tasks`,
      icon: "plus-circle",
      editorCheckCallback: (checking, editor, ctx) => {
        if (checking) {
          return this.canMigrateToFile(ctx.file);
        }
        this.migrateTasks(editor, ctx.file as TFile);
      },
    });

    console.log("Obsidian Task Migration running ...");
  }

  refreshSettings() {
    this.headingLevel = Number(this.settings.taskHeadingLevel);
    this.headingName = this.settings.taskHeadingName;
  }

  async migrateTasks(editor: Editor, file: TFile) {
    /**
     * make sure we have a tasks section
     */
    const metadata = this.app.metadataCache.getFileCache(file);
    const section = getTaskSection(
      metadata,
      this.headingName,
      this.headingLevel
    );

    if (section === FileHasNoTasksHeading) {
      new Notice(
        `${this.pluginName}: Could not find ${this.headingName} heading`
      );
      return;
    }

    /**
     * get all daily notes and current daily note
     */
    const { currentNoteIndex, allDailyNotes, dailyNoteKeys } = getDailyNotes(
      file.name
    );

    if (currentNoteIndex === 0) {
      new Notice(`${this.pluginName}: Could not find current daily note`);
      return;
    }

    /**
     * For all daily notes before the current one, get the lines to migrate
     */
    const linesToMigrate: string[] = [];
    for (let i = currentNoteIndex - 1; i >= 0; i--) {
      const fromNoteUID = dailyNoteKeys[i];
      const fromNote = allDailyNotes[fromNoteUID];

      const noteLines = await this.migrateFromNote(fromNote);
      if (noteLines === FileHasNoTasksHeading) {
        // if the not has no task headings, skip it
        continue;
      }
      if (noteLines === FileAlreadyMigrated) {
        // if the note has already been migrated, stop looking further back
        break;
      }
      linesToMigrate.push(...noteLines);
    }

    // from the endLine, move backwards until we reach the first non empty line,
    // them insert the linesToMigrate there
    const content = await this.app.vault.read(file);
    const lines = content.split(/\r?\n|\r|\n/g);
    const endLine = section.endLine ?? editor.lastLine();
    for (let i = endLine; i >= 0; i--) {
      const line = lines[i];
      if (line !== "") {
        editor.replaceRange(`\n${linesToMigrate.join("\n")}`, {
          line: i + 1,
          ch: 0,
        });
        break;
      }
    }
  }

  async migrateFromNote(
    file: TFile
  ): Promise<
    string[] | typeof FileAlreadyMigrated | typeof FileHasNoTasksHeading
  > {
    const metadata = this.app.metadataCache.getFileCache(file);
    const section = getTaskSection(
      metadata,
      this.headingName,
      this.headingLevel
    );

    if (section === FileHasNoTasksHeading) {
      return FileHasNoTasksHeading;
    }

    const content = await this.app.vault.read(file);
    const lines = content.split(/\r?\n|\r|\n/g);
    const endLine = section.endLine ?? lines.length;

    // take all the lines between the start and end line
    const potentialTaskLines = lines.slice(section.startLine, endLine);
    const lineNumbers = Array.from(
      { length: endLine - section.startLine + 1 },
      (_, i) => i + section.startLine
    );
    const potentialTasks = potentialTaskLines.map((line, i) => [
      lineNumbers[i],
      line,
    ]) as [number, string][];

    // - loop over the lines in reverse
    // - if we find a line that is a completed task (anything but `- [ ]`),
    // - delete it from the array unless it has an open nested task
    let hasNestedOpenTask = false;
    let previousIndent = 0;
    let lastSeenOpenTask = -1;
    let previouslyMigratedLines = 0;
    for (let i = potentialTasks.length - 1; i >= 0; i--) {
      const [_, line] = potentialTasks[i];

      const match = line.match(this.taskRegex);
      if (match) {
        const char = match.groups?.char;
        const currentIndent = match.groups?.whitespace?.length || 0;

        if (char !== " ") {
          if (char === ">") {
            previouslyMigratedLines++;
          }

          if (hasNestedOpenTask) {
            if (currentIndent === 0) {
              hasNestedOpenTask = false;
              continue;
            }

            if (currentIndent < previousIndent) {
              previousIndent = currentIndent;
              continue;
            }
          }

          delete potentialTasks[i];
          continue;
        }

        lastSeenOpenTask = i;

        if (currentIndent && currentIndent > 0) {
          hasNestedOpenTask = true;
          previousIndent = currentIndent;
        }
      } else {
        if (i > lastSeenOpenTask) {
          delete potentialTasks[i];
        }
      }
    }

    const tasks = potentialTasks.filter((task) => task !== null);

    if (tasks.length === 0 && previouslyMigratedLines > 0) {
      return FileAlreadyMigrated;
    }

    // Actually migrate the tasks in the file
    tasks.forEach(([index, task]) => {
      const migratedTask = task.replace("- [ ]", "- [>]");
      lines[index] = migratedTask;
    });
    const modifiedContent = lines.join("\n");
    this.app.vault.modify(file, modifiedContent);

    return tasks.map(([_, task]) => task);
  }

  canMigrateToFile(file: TFile | null): boolean {
    if (!file) return false;
    if (!appHasDailyNotesPluginLoaded()) return false;

    const { folder } = getDailyNoteSettings();

    let fileParent = file.parent.path;
    if (fileParent !== folder) return false;

    return true;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.refreshSettings();
  }
}
