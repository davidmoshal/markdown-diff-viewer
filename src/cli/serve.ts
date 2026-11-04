/**
 * --serve: a local HTTP server that re-runs md-diff for the commits picked in
 * the page header. Each request runs the CLI as a child process and returns
 * its HTML. The page loads the new comparison in the same tab, so browser
 * history steps back and forward through earlier comparisons.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { execFile } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { OptionValues } from "commander";
import { expandGitShortcut, getCommitInfo, getRecentMdCommits, isGitRepo, type CommitInfo } from "../git/index.js";
import type { RefOption, RefPicker } from "../ui/template.js";
import { logError, logInfo } from "./colors.js";
import { openInBrowser, type OutputOptions } from "./output.js";

/** Picker value for the working directory (right side only) */
export const WORKTREE = "worktree";

/** How many recent markdown commits the pickers offer */
const COMMIT_LIMIT = 100;

const CLI_PATH = fileURLToPath(new URL("./index.js", import.meta.url));

// ─── Commit pickers ──────────────────────────────────────────────────────────

/** Recent markdown commits plus HEAD and the given refs, newest first */
function commitChoices(refs: string[]): CommitInfo[] {
  const byHash = new Map<string, CommitInfo>();
  for (const commit of getRecentMdCommits(COMMIT_LIMIT)) byHash.set(commit.hash, commit);
  for (const ref of ["HEAD", ...refs]) {
    const commit = getCommitInfo(ref);
    if (commit) byHash.set(commit.hash, commit);
  }
  return [...byHash.values()].sort((a, b) => b.time - a.time);
}

function commitOption(commit: CommitInfo): RefOption {
  const refs = commit.refs ? ` (${commit.refs})` : "";
  return { value: commit.short, label: `${commit.short} ${commit.subject}${refs}` };
}

/**
 * Header pickers for a page that compares `left` with `right` (a commit, or
 * WORKTREE). Both sides list the same commits, including `listed` (the
 * starting commits of --serve); the right side also offers the working
 * directory.
 */
export function buildRefPicker(left: string, right: string, listed: string[]): RefPicker {
  const refs = right === WORKTREE ? [...listed, left] : [...listed, left, right];
  const options = commitChoices(refs).map(commitOption);
  const shortOf = (ref: string) => getCommitInfo(ref)?.short ?? ref;
  return {
    left: options,
    right: [{ value: WORKTREE, label: "working directory" }, ...options],
    leftValue: shortOf(left),
    rightValue: right === WORKTREE ? WORKTREE : shortOf(right),
  };
}

/** A file path the server passes to --focus: a relative .md path inside the repository */
export function isSafeMdPath(path: string): boolean {
  return path.endsWith(".md") && !path.startsWith("-") && !isAbsolute(path) && !path.split(/[\\/]/).includes("..");
}

// ─── Command line ────────────────────────────────────────────────────────────

/**
 * Starting sides for --serve, from the same arguments the git modes take.
 * The right side is a ref, or WORKTREE for the working directory.
 */
function serveSides(options: OptionValues, args: string[]): { left: string; right: string; file?: string } {
  if (options.git) {
    const [left, right, file] = options.git as string[];
    if (!right) {
      logError("Git mode requires two refs", "Usage: md-diff --serve --git <ref1> <ref2> [file]");
      process.exit(1);
    }
    return { left, right, file };
  }
  if (options.compare) return { left: options.compare as string, right: WORKTREE, file: args[0] };
  if (args.length === 0) return { left: "HEAD", right: WORKTREE };

  const shortcut = expandGitShortcut(args[0]);
  if (!shortcut) {
    logError("--serve compares git refs", "Usage: md-diff --serve [@<ref> | @~N | @~N..@~M | --git <ref1> <ref2>]");
    process.exit(1);
  }
  return { left: shortcut.ref1, right: shortcut.ref2 ?? WORKTREE, file: args[1] };
}

/** md-diff options that every run repeats: theme, match level (when given), settings file */
function forwardedArgs(options: OptionValues, matchGiven: boolean): string[] {
  const args = ["--theme", options.theme as string];
  if (matchGiven) args.push("--match", options.match as string);
  if (options.settings) args.push("--settings", resolve(options.settings as string));
  return args;
}

/** Start --serve from md-diff's parsed options and arguments */
export async function runServeMode(
  options: OptionValues,
  args: string[],
  outputOpts: OutputOptions,
  matchGiven: boolean,
): Promise<void> {
  if (!isGitRepo()) {
    logError("--serve needs a git repository");
    process.exit(1);
  }
  if (options.staged || options.pr) {
    logError("--serve does not support --staged or --pr");
    process.exit(1);
  }

  const { left, right, file } = serveSides(options, args);
  await serve({
    left,
    right,
    focus: outputOpts.focus ?? file,
    forwardArgs: forwardedArgs(options, matchGiven),
    open: !outputOpts.noOpen,
    inspect: outputOpts.inspect,
  });
}

// ─── Server ──────────────────────────────────────────────────────────────────

interface ServeOptions {
  /** Starting left ref */
  left: string;
  /** Starting right ref, or WORKTREE */
  right: string;
  /** File to show on the first page */
  focus?: string;
  /** md-diff options repeated on every run (theme, match level, settings) */
  forwardArgs: string[];
  open: boolean;
  inspect: boolean;
}

interface Start {
  left: string;
  right: string;
  /** Starting commits stay selectable even when they changed no markdown */
  refs: string[];
}

async function serve(opts: ServeOptions): Promise<void> {
  const left = getCommitInfo(opts.left);
  const right = opts.right === WORKTREE ? null : getCommitInfo(opts.right);
  if (!left || (opts.right !== WORKTREE && !right)) {
    logError(`Unknown commit "${left ? opts.right : opts.left}"`);
    process.exit(1);
  }
  const start: Start = {
    left: left.short,
    right: right?.short ?? WORKTREE,
    refs: right ? [left.short, right.short] : [left.short],
  };

  const server = createServer((req, res) => {
    handleRequest(req, res, start, opts.forwardArgs).catch((err: unknown) => {
      send(res, 500, err instanceof Error ? err.message : String(err));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}/?${pageQuery(start.left, start.right, opts.focus)}`;
  logInfo(`Serving ${url} (Ctrl+C to stop)`);
  if (opts.open) await openInBrowser(url, opts.inspect);
}

function pageQuery(left: string, right: string, file?: string): string {
  const params = new URLSearchParams({ left, right });
  if (file) params.set("file", file);
  return params.toString();
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, start: Start, forwardArgs: string[]) {
  // Answer only requests addressed to this server (guards against DNS rebinding)
  const host = req.headers.host;
  const port = req.socket.localPort;
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
    send(res, 403, "Forbidden");
    return;
  }

  const url = new URL(req.url ?? "/", `http://${host}`);
  if (req.method !== "GET" || url.pathname !== "/") {
    send(res, 404, "Not found");
    return;
  }

  const left = url.searchParams.get("left") ?? start.left;
  const right = url.searchParams.get("right") ?? start.right;
  const file = url.searchParams.get("file") || undefined;

  // Request values go onto the md-diff command line: accept only commits the pickers offer
  const offered = new Set(commitChoices(start.refs).map((c) => c.short));
  if (!offered.has(left) || (right !== WORKTREE && !offered.has(right))) {
    send(res, 400, "Unknown commit");
    return;
  }
  if (file && !isSafeMdPath(file)) {
    send(res, 400, "Invalid file");
    return;
  }

  const args = right === WORKTREE ? ["--compare", left] : ["--git", left, right];
  if (file) args.push(`--focus=${file}`);
  args.push(`--ref-picker=${start.refs.join(",")}`, "--quiet", "--no-open", "--out=-", ...forwardArgs);
  send(res, 200, await runCli(args), "text/html; charset=utf-8");
}

/** Run md-diff in a child process and return its stdout */
function runCli(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [CLI_PATH, ...args], { maxBuffer: 256 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message));
      else resolve(stdout);
    });
  });
}

function send(res: ServerResponse, status: number, body: string, type = "text/plain; charset=utf-8"): void {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}
