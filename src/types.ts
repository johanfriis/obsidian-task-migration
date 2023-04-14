import { Pos, TFile } from "obsidian";
import { FileHasNoTasksHeading } from "./consts";

export type TaskSection =
  | {
      startLine: number;
      endLine: number;
    }
  | typeof FileHasNoTasksHeading;

export type DailyNotes = {
  currentNoteIndex: number;
  allDailyNotes: Record<string, TFile>;
  dailyNoteKeys: string[];
};

export type ListItem = {
  id?: number;
  parent: number;
  position: Pos;
};

export type ListItemNode = Required<Omit<ListItem, "task">> & {
  children: ListItemNode[];
} & {
  task?: string;
};
