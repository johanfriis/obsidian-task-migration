import { Plugin, moment, TFile, Editor, Notice } from "obsidian";
import { TaskMigrationSettings, DEFAULT_SETTINGS, Settings } from "./settings";
import {
  getAllDailyNotes,
  appHasDailyNotesPluginLoaded,
  getDateUID,
  getDailyNoteSettings,
} from "obsidian-daily-notes-interface";

const FileAlreadyMigrated = Symbol();

export default class TaskMigrationPlugin extends Plugin {
  settings: Settings;
  pluginName = "Task Migration";

  headingLevel: number;
  headingName: string;
  heading: string;
  headingRegex: RegExp;

  taskRegex = /\s*- \[ \].*/;
  migratedTaskRegex = /\s*- \[\>\].*/;

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new TaskMigrationSettings(this.app, this));

    this.headingLevel = Number(this.settings.taskHeadingLevel);
    this.headingName = this.settings.taskHeadingName;
    this.heading = `${"#".repeat(this.headingLevel)} ${this.headingName}`;
    this.headingRegex = new RegExp(`^#{1,${this.headingLevel}}\\s`);

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

  async migrateTasks(editor: Editor, file: TFile) {
    // get a list of all daily notes
    // find the current daily note in the list
    // loop over all previous daily notes
    // -> migrate tasks to the current note
    // if a daily note contains only migrated tasks, break loop
    //
    // The idea is that if we reach a daily note where all tasks are
    // already migrated, then there is no reason to continue looping
    // backwards.

    // before we do anything, make sure we are nested below the right heading
    // const headingLevel = Number(this.settings.taskHeadingLevel);
    // const headingName = this.settings.taskHeadingName;
    // const heading = `${"#".repeat(headingLevel)} ${headingName}`;
    // const headingRegex = new RegExp(`^#{1,${headingLevel}}\\s`);

    const content = await this.app.vault.read(file);
    const lines = content.split(/\r?\n|\r|\n/g);
    const currentLine = editor.getCursor().line;

    let insideWrongHeading = false;
    let foundHeadingLine = -1;
    for (let i = currentLine - 1; i >= 0; i--) {
      const line = lines[i];

      if (this.headingRegex.test(line) && line !== this.heading) {
        insideWrongHeading = true;
        break;
      }

      if (line === this.heading) {
        foundHeadingLine = i;
      }
    }

    if (insideWrongHeading) {
      new Notice(
        `${this.pluginName}: Not currently inside a ${this.headingName} heading`
      );
      return;
    }

    if (foundHeadingLine === -1) {
      new Notice(
        `${this.pluginName}: Could not find parent ${this.headingName} heading`
      );
      return;
    }

    const { format } = getDailyNoteSettings();

    // we have to override the return type as the types used by
    // obsidian-daily-notes-interface are outdated.
    const allDailyNotes = getAllDailyNotes() as Record<string, TFile>;
    const dailyNoteKeys = Object.keys(allDailyNotes).sort();

    const currentNoteDate = moment(file.name, format);
    const currentNoteUID = getDateUID(currentNoteDate, "day");
    const currentNoteIndex = dailyNoteKeys.indexOf(currentNoteUID);

    const todosToMigrate: string[] = [];

    for (let i = currentNoteIndex; i >= 0; i--) {
      const fromNoteUID = dailyNoteKeys[i];
      const fromNote = allDailyNotes[fromNoteUID];

      const todos = await this.migrateFromNote(fromNote);
      if (todos === FileAlreadyMigrated) {
        break;
      }
      todosToMigrate.push(...todos);
    }

    // TODO: hmm, how would I figure out where to insert the tasks I need to
    // come up with something that is more solid than this I want to know if
    // there are other tasks, and then insert them at the end of the list. If
    // there is a heading or content after the tasks header, I want to handle
    // the whitespace towards that content better.
    editor.replaceRange("\n\n", {
      line: foundHeadingLine + 1,
      ch: 0,
    });
    for (let i = 0; i < todosToMigrate.length; i++) {
      let todo = todosToMigrate[i];
      editor.replaceRange(todo + "\n", {
        line: foundHeadingLine + i + 2,
        ch: 0,
      });
    }
  }

  async migrateFromNote(
    file: TFile
  ): Promise<string[] | typeof FileAlreadyMigrated> {
    const content = await this.app.vault.read(file);
    const lines = content.split(/\r?\n|\r|\n/g);

    let tasks: [number, string][] = [];
    let migratedTasks: [number, string][] = [];

    let shouldCollect = false;
    for (const [index, line] of lines.entries()) {
      if (!shouldCollect && line === this.heading) {
        shouldCollect = true;
        continue;
      }

      if (shouldCollect && this.headingRegex.test(line)) {
        // we have reached the end of our tasks to collect
        shouldCollect = false;
        break;
      }

      if (shouldCollect && this.taskRegex.test(line)) {
        tasks.push([index, line]);
      }

      if (shouldCollect && this.migratedTaskRegex.test(line)) {
        migratedTasks.push([index, line]);
      }
    }

    if (migratedTasks.length > 0 && tasks.length === 0) {
      return FileAlreadyMigrated;
    }

    // Actually migrate the tasks in the file
    const modifiedLines = lines;
    tasks.forEach(([index, task]) => {
      const migratedTask = task.replace("- [ ]", "- [>]");
      modifiedLines[index] = migratedTask;
    });
    const modifiedContent = modifiedLines.join("\n");
    this.app.vault.modify(file, modifiedContent);

    return tasks.map(([_, todo]) => todo);
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
  }
}
