import { TFile } from "obsidian";
import {
  getAllDailyNotes,
  getDateUID,
  getDailyNoteSettings,
} from "obsidian-daily-notes-interface";
import { DailyNotes } from "../types";
import moment from "moment";

export function getDailyNotes(date: string): DailyNotes {
  const { format } = getDailyNoteSettings();

  const allDailyNotes = getAllDailyNotes() as Record<string, TFile>;
  const dailyNoteKeys = Object.keys(allDailyNotes).sort();

  const currentNoteDate = moment(date, format);
  const currentNoteUID = getDateUID(currentNoteDate, "day");
  const currentNoteIndex = dailyNoteKeys.indexOf(currentNoteUID);

  return {
    currentNoteIndex,
    allDailyNotes,
    dailyNoteKeys,
  };
}
