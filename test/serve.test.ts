import { describe, it, expect } from "vitest";
import { isSafeMdPath } from "../src/cli/serve.js";
import { generateMultiFileHtml, type FileDiff, type RefPicker } from "../src/ui/template.js";

describe("isSafeMdPath", () => {
  it("accepts relative markdown paths", () => {
    expect(isSafeMdPath("README.md")).toBe(true);
    expect(isSafeMdPath("docs/guide/intro.md")).toBe(true);
  });

  it("rejects paths outside the repository", () => {
    expect(isSafeMdPath("/etc/notes.md")).toBe(false);
    expect(isSafeMdPath("../other/notes.md")).toBe(false);
    expect(isSafeMdPath("docs/../../notes.md")).toBe(false);
  });

  it("rejects non-markdown files and option-like values", () => {
    expect(isSafeMdPath("package.json")).toBe(false);
    expect(isSafeMdPath("--out=x.md")).toBe(false);
  });
});

describe("served page", () => {
  const files: FileDiff[] = [
    { path: "a.md", rows: [] },
    { path: "docs/old.md → docs/b.md", key: "docs/b.md", rows: [] },
    { path: "c.md", pinned: true, rows: [] },
  ];
  const refPicker: RefPicker = {
    left: [
      { value: "aaa1111", label: "aaa1111 fix <tags> & things" },
      { value: "bbb2222", label: "bbb2222 second" },
    ],
    right: [
      { value: "worktree", label: "working directory" },
      { value: "aaa1111", label: "aaa1111 fix <tags> & things" },
    ],
    leftValue: "bbb2222",
    rightValue: "worktree",
  };
  const page = (options: { focus?: string; picker?: RefPicker; list?: FileDiff[] }) =>
    generateMultiFileHtml(options.list ?? files, {
      leftTitle: "L",
      rightTitle: "R",
      refPicker: options.picker,
      focus: options.focus,
    });

  it("renders both pickers with the current commits selected", () => {
    const html = page({ picker: refPicker });
    expect(html).toContain('<select id="leftRef"');
    expect(html).toContain('<select id="rightRef"');
    expect(html).toContain('<option value="bbb2222" selected>');
    expect(html).toContain('<option value="worktree" selected>');
    // Commit subjects are escaped (the "<" can no longer open a tag)
    expect(html).toContain("aaa1111 fix &lt;tags> &amp; things");
    expect(html).not.toContain("<tags>");
  });

  it("keeps the plain titles without a picker", () => {
    const html = page({});
    expect(html).not.toContain('id="leftRef"');
  });

  it("opens on the focus file by key", () => {
    const html = page({ focus: "docs/b.md" });
    expect(html).toContain('data-focus-idx="1"');
    expect(html).toMatch(/class="file-item active[^"]*" data-file-idx="1"/);
    expect(html).toMatch(/class="file-diff" data-file-idx="0" style="display:none"/);
    expect(html).toMatch(/class="file-diff" data-file-idx="1">/);
  });

  it("opens on the first file when the focus is not listed", () => {
    expect(page({ focus: "missing.md" })).toContain('data-focus-idx="0"');
  });

  it("marks a pinned file as unchanged", () => {
    expect(page({})).toMatch(/data-path="c.md"[^>]*>\s*<span class="file-name">c.md<\/span><span class="file-unchanged">/);
  });

  it("shows the file list and an empty state for a served page without changes", () => {
    const html = page({ picker: refPicker, list: [] });
    expect(html).toContain('id="fileSidebar"');
    expect(html).toContain('class="empty-state"');
  });
});
