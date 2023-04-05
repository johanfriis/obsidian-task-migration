import { CachedMetadata, TFile } from "obsidian";
import { TaskSection } from "../types";
import { FileHasNoTasksHeading } from "../consts";

export function getTaskSection(
  metadata: CachedMetadata | null,
  name: string,
  level: number
): TaskSection {
  if (!metadata) {
    return FileHasNoTasksHeading;
  }

  if (!metadata?.headings) {
    return FileHasNoTasksHeading;
  }

  const targetHeader = metadata.headings.find(
    (heading) => heading.level === level && heading.heading === name
  );

  if (!targetHeader) {
    return FileHasNoTasksHeading;
  }

  const nextHeader = metadata.headings.find(
    (heading) =>
      heading.level === level &&
      heading.position.start.line > targetHeader.position.start.line
  );

  const startLine = targetHeader.position.start.line + 1;
  const endLine = (nextHeader?.position.start.line ?? Infinity) - 1;

  return {
    startLine,
    endLine,
  };
}
