import { Plugin, TFile, Editor, Notice } from "obsidian";
import { TaskMigrationSettings, DEFAULT_SETTINGS, Settings } from "./settings";
import {
  appHasDailyNotesPluginLoaded,
  getDailyNoteSettings,
} from "obsidian-daily-notes-interface";
import {
  FileAlreadyMigrated,
  FileHasNoTasksHeading,
  TASKS_TO_MIGRATE,
} from "./consts";
import {
  createBlockRef,
  filterAndFlattenItemTree,
  getAllFilePaths,
  getDailyNotes,
  getTaskSection,
  listItemsToTree,
} from "./helpers";
import { ChooserModal } from "./modules";
import { ListItem } from "./types";

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

  blockRefRegex = /\^[\da-fA-F]{6}$/;
  blockRefLinkRegex = /\[\[[^\]]*#(\^[\da-fA-F]{6})(\|[^\]]+)?\]\]$/;

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new TaskMigrationSettings(this.app, this));
    this.refreshSettings();

    this.addCommand({
      id: "obsidian-task-migration-migrate-forward",
      name: `Migrate Tasks Forward`,
      icon: "plus-circle",
      editorCheckCallback: (checking, editor, ctx) => {
        if (checking) {
          return this.canMigrateToFile(ctx.file);
        }

        this.migrateForward(editor, ctx.file as TFile).catch((error) => {
          if (error instanceof TaskMigrationError) {
            new Notice(`${this.manifest.name}: ${error.message}`);
          }
        });
      },
    });

    this.addCommand({
      id: "obsidian-task-migration-migrate-sideways",
      name: `Migrate Tasks Sideways`,
      icon: "arrow-right-circle",
      editorCallback: (_, ctx) => {
        this.migrateSideways(ctx.file as TFile).catch((error) => {
          if (error instanceof TaskMigrationError) {
            new Notice(`${this.manifest.name}: ${error.message}`);
          }
        });
      },
    });

    console.log("Obsidian Task Migration running ...");
  }

  refreshSettings() {
    this.headingLevel = Number(this.settings.taskHeadingLevel);
    this.headingName = this.settings.taskHeadingName;
  }

  async migrateForward(editor: Editor, file: TFile) {
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

      const noteLines = await this.migrateFromFile(fromNote);
      if (noteLines === FileHasNoTasksHeading) {
        // if the file has no task headings, skip it
        continue;
      }
      if (noteLines === FileAlreadyMigrated) {
        // if the file has already been migrated, stop looking further back
        break;
      }
      linesToMigrate.push(...noteLines);
    }

    await this.migrateToFile(editor, file, linesToMigrate);
  }

  async migrateSideways(file: TFile) {
    /**
     * Check that we have lines of tasks to migrate from this file
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
     * Get the sideways file or pop up a modal to ask for one.
     */
    let sidewaysFilePath = this.settings.sidewaysFile;
    if (sidewaysFilePath) {
      this.migrateToFileRaw(file, sidewaysFilePath);
    } else {
      const allFiles = getAllFilePaths(this.app);
      new ChooserModal(this.app, allFiles).start((targetFilePath) => {
        this.migrateToFileRaw(file, targetFilePath);
      });
    }
  }

  /**
   * Migrate lines to a file that is currently not loaded
   */
  async migrateToFileRaw(sourceFile: TFile, sidewaysFilePath: string) {
    // const linesToMigrate: string[] = ["- [ ] Task 1", "- [ ] Task 2"];
    const linesToMigrate = await this.migrateFromFile(sourceFile);

    if (linesToMigrate === FileHasNoTasksHeading) {
      // will never happen
      return;
    }

    if (linesToMigrate === FileAlreadyMigrated) {
      throw new TaskMigrationError(`No tasks to migrate`);
    }

    let sidewaysFile = this.app.vault.getAbstractFileByPath(
      sidewaysFilePath
    ) as TFile;

    /**
     * make sure we have a tasks section
     */
    const metadata = this.app.metadataCache.getFileCache(sidewaysFile);
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
     * Insert the new lines after the last task in the tasks section
     * or at the start of the tasks section if there are no tasks
     */
    const priorTasks = metadata?.listItems?.filter(
      (item) =>
        item.position.start.line > section.startLine &&
        item.position.start.line < section.endLine
    );

    // pick the highest line number
    const lastPriorTaskLine = priorTasks
      ?.map((item) => item.position.start.line)
      .sort((a, b) => b - a)[0];

    const insertLine = (lastPriorTaskLine ?? section.startLine) + 1;

    const content = await this.app.vault.read(sidewaysFile);
    const lines = content.split(/\r?\n|\r|\n/g);
    lines.splice(insertLine, 0, ...linesToMigrate);
    await this.app.vault.modify(sidewaysFile, lines.join("\n"));
  }

  async migrateToFile(editor: Editor, file: TFile, linesToMigrate: string[]) {
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

    if (linesToMigrate.length === 0) {
      return;
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

  async migrateFromFile(
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

    // select the tasks that are between the start and end lines
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

    const taskTree = listItemsToTree(potentialTasks as ListItem[]);
    const tasks = filterAndFlattenItemTree(taskTree);
    const topLevelTaskIds = taskTree.map((item) => item.id);

    // Actually migrate the tasks in the file
    const content = await this.app.vault.read(file);
    const lines = content.split(/\r?\n|\r|\n/g);

    let linesToMigrate: string[] = [];
    tasks.forEach((task) => {
      let line = lines[task.position.start.line];
      let lineToMigrate = line;

      // only tag and link tasks that are at the top level or if the user has opted to tag all lines
      if (
        this.settings.enableTaskLinkingAndTagging &&
        (topLevelTaskIds.includes(task.position.start.line) ||
          this.settings.tagAllLines)
      ) {
        let fileLink;
        let blockRef;

        // check if line ends with a link to a block reference ([[link#^blockref|alias]])
        const matchBlockRefLink = line.match(this.blockRefLinkRegex);

        if (matchBlockRefLink) {
          blockRef = matchBlockRefLink[0];
          fileLink = matchBlockRefLink[0];
          lineToMigrate = lineToMigrate
            .replace(this.blockRefLinkRegex, "")
            .trim();
        }

        // check if line ends with a block reference (a caret followed by a 6 character hex string)
        const matchBlockRef = line.match(this.blockRefRegex);

        if (matchBlockRef) {
          blockRef = matchBlockRef[0];
          lineToMigrate = lineToMigrate.replace(this.blockRefRegex, "").trim();
        }

        if (
          this.settings.migrationTag &&
          !line.includes(this.settings.migrationTag)
        ) {
          lineToMigrate = `${lineToMigrate} #${this.settings.migrationTag}`;
        }

        if (!blockRef) {
          blockRef = createBlockRef();
          // add block ref the the line we leave behind
          line = `${line} ^${blockRef}`;
        }

        if (!fileLink) {
          fileLink = this.app.fileManager.generateMarkdownLink(
            file,
            file.parent.path,
            `#${blockRef}`,
            this.settings.refLinkAlias
          );
        }

        lineToMigrate = `${lineToMigrate} ${fileLink}`;
      }

      linesToMigrate.push(lineToMigrate);
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
