/**
 * Changed files from git, resolved into diff inputs for multi-file mode.
 */

import type { ChangedFile } from "../git/index.js";
import type { OutputOptions } from "./output.js";

/** Diff input for one file in multi-file mode */
export interface MultiFileInput {
  /** Display path ("old → new" for renames) */
  path: string;
  /** Path that identifies the file across pages (the new path) */
  key: string;
  /** Listed only because it is the --focus file */
  pinned?: boolean;
  leftContent: string;
  rightContent: string;
  linesAdded?: number;
  linesRemoved?: number;
}

/**
 * Resolve a changed file into diff content. Handles renames (left side reads
 * from the old path, display shows "old → new"); the modes differ only in
 * how each side's content is fetched.
 */
export function toMultiFileInput(
  f: ChangedFile,
  getLeft: (path: string) => string,
  getRight: (path: string) => string,
): MultiFileInput {
  const leftPath = f.oldPath ?? f.path;
  const displayPath = f.oldPath ? `${f.oldPath} → ${f.path}` : f.path;
  return {
    path: displayPath,
    key: f.path,
    leftContent: getLeft(leftPath),
    rightContent: getRight(f.path),
    linesAdded: f.linesAdded,
    linesRemoved: f.linesRemoved,
  };
}

/**
 * Apply --focus to a changed-file list. A focus on a renamed file's old path
 * moves to its new path. A focus that is not in the list is appended as a
 * pinned entry (its content is the same on both sides), so the page can stay
 * on it.
 */
export function withFocusFile(
  files: MultiFileInput[],
  changed: ChangedFile[],
  outputOpts: OutputOptions,
  getLeft: (path: string) => string,
  getRight: (path: string) => string,
): MultiFileInput[] {
  const focus = outputOpts.focus;
  if (!focus) return files;

  const match = changed.find((f) => f.path === focus || f.oldPath === focus);
  if (match) {
    outputOpts.focus = match.path;
    return files;
  }

  const pinned: MultiFileInput = {
    path: focus,
    key: focus,
    pinned: true,
    leftContent: getLeft(focus),
    rightContent: getRight(focus),
  };
  return [...files, pinned];
}
