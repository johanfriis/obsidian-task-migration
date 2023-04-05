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
import {
  FileAlreadyMigrated,
  FileHasNoTasksHeading,
  TASKS_TO_MIGRATE,
} from "./consts";
import { getDailyNotes, getTaskSection } from "./helpers";

class TaskMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskMigrationError";
  }
}
export default class TaskMigrationPlugin extends Plugin {
  settings: Settings;

  headingLevel: number;
  headingName: string;

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
        try {
          this.migrateTasks(editor, ctx.file as TFile);
        } catch (error) {
          if (error instanceof TaskMigrationError) {
            new Notice(`${this.manifest.name}: ${error.message}`);
          }
        }
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
      throw new TaskMigrationError(
        `Could not find ${this.headingName} heading`
      );
    }

    /**
     * get all daily notes and current daily note
     */
    const { currentNoteIndex, allDailyNotes, dailyNoteKeys } = getDailyNotes(
      file.name
    );

    if (currentNoteIndex === 0) {
      throw new TaskMigrationError(`Could not find current daily note`);
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

    if (metadata?.listItems === undefined || metadata.listItems.length === 0) {
      return [];
    }

    // select the tasks that are metween the start and end lines
    const potentialTasks = metadata.listItems.filter((listItem) => {
      return (
        listItem.position.start.line >= section.startLine &&
        listItem.position.start.line <= section.endLine
      );
    });

    const taskTokens = potentialTasks.flatMap((listItem) =>
      listItem.task ? [listItem.task] : []
    );
    const hasTasksToMigrate = taskTokens.some((token) => {
      return TASKS_TO_MIGRATE.includes(token);
    });
    const hasTasksAlreadyMigrated = taskTokens.includes(">");

    // if all tasks have already been migrated, consider this the furthest back we need to go
    if (hasTasksAlreadyMigrated && !hasTasksToMigrate) {
      return FileAlreadyMigrated;
    }

    let lastSeenMigratableTask = -1;
    let previousTaskParent = -1;
    let hasNestedMigratableTask = false;

    for (let i = potentialTasks.length - 1; i >= 0; i--) {
      const listItem = potentialTasks[i];
      if (listItem.task) {
        const taskParent = listItem.parent;
        const taskMarker = listItem.task;

        if (!TASKS_TO_MIGRATE.includes(taskMarker)) {
          if (hasNestedMigratableTask) {
            if (taskParent < 0) {
              hasNestedMigratableTask = false;
              continue;
            }

            if (taskParent < previousTaskParent) {
              previousTaskParent = taskParent;
              continue;
            }
          }

          delete potentialTasks[i];
          continue;
        }

        lastSeenMigratableTask = i;

        if (taskParent && taskParent > 0) {
          hasNestedMigratableTask = true;
          previousTaskParent = taskParent;
        }
      } else {
        if (i > lastSeenMigratableTask) {
          delete potentialTasks[i];
        }
      }
    }
    const tasks = potentialTasks.filter((task) => task !== null);

    // Actually migrate the tasks in the file
    const content = await this.app.vault.read(file);
    const lines = content.split(/\r?\n|\r|\n/g);

    let linesToMigrate: string[] = [];
    tasks.forEach((task) => {
      const line = lines[task.position.start.line];
      linesToMigrate.push(line);
      lines[task.position.start.line] = line.replace("- [ ]", "- [>]");
    });
    const modifiedContent = lines.join("\n");
    this.app.vault.modify(file, modifiedContent);

    return linesToMigrate;
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
