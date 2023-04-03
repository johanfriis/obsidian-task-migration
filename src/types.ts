import { TFile } from "obsidian";
import { FileHasNoTasksHeading } from "./consts";

export type TaskSection =
  | {
      startLine: number;
      endLine: number | null;
    }
  | typeof FileHasNoTasksHeading;

export type DailyNotes = {
  currentNoteIndex: number;
  allDailyNotes: Record<string, TFile>;
  dailyNoteKeys: string[];
};
