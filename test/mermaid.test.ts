import { describe, it, expect } from "vitest";
import { renderDiffPairs, RenderedRow } from "../src/render/render.js";
import { diffBlocks } from "../src/core/diff.js";
import { parseMarkdown, extractBlocks } from "../src/text/parse.js";
import { generateMultiFileHtml } from "../src/ui/template.js";
import { MERMAID_URL } from "../src/ui/mermaid.js";

function rows(left: string, right: string): RenderedRow[] {
  return renderDiffPairs(diffBlocks(extractBlocks(parseMarkdown(left)), extractBlocks(parseMarkdown(right))));
}

const fence = (body: string) => "```mermaid\n" + body + "\n```";
const flow = fence("flowchart LR\n  A[Write] --> B[Review]");
const flowEdited = fence("flowchart LR\n  A[Write] --> B[Review]\n  B --> C[Ship]");

function sideHtml(rendered: RenderedRow[], side: "left" | "right"): string {
  return rendered.map((r) => (side === "left" ? r.leftHtml : r.rightHtml)).join("");
}

describe("mermaid blocks", () => {
  it("wraps an unchanged diagram on both sides with its escaped source", () => {
    const rendered = rows(flow, flow);
    for (const side of ["left", "right"] as const) {
      const html = sideHtml(rendered, side);
      expect(html).toContain('<div class="mermaid-block" data-mermaid-source="flowchart LR\n  A[Write] --&gt; B[Review]">');
      expect(html).toContain('<div class="mermaid-image"></div>');
      expect(html).toContain('<div class="mermaid-code"><pre><code class="language-mermaid">');
    }
  });

  it("keeps each side's own source and the code diff for a changed diagram", () => {
    const rendered = rows("Intro\n\n" + flow, "Intro\n\n" + flowEdited);
    const left = sideHtml(rendered, "left");
    const right = sideHtml(rendered, "right");
    expect(left).toContain('data-mermaid-source="flowchart LR\n  A[Write] --&gt; B[Review]"');
    expect(right).toContain('data-mermaid-source="flowchart LR\n  A[Write] --&gt; B[Review]\n  B --&gt; C[Ship]"');
    expect(right).toMatch(/<div class="mermaid-code">[\s\S]*<ins>[\s\S]*Ship/);
  });

  it("wraps an added diagram on its own side only", () => {
    const rendered = rows("Intro", "Intro\n\n" + flow);
    const added = rendered.find((r) => r.status === "added")!;
    expect(added.rightHtml).toContain('<div class="mermaid-block"');
    expect(added.leftHtml).not.toContain("mermaid-block");
  });

  it("leaves other code blocks alone", () => {
    const rendered = rows("```js\nlet a = 1;\n```", "```js\nlet a = 2;\n```");
    expect(sideHtml(rendered, "left") + sideHtml(rendered, "right")).not.toContain("mermaid-block");
  });
});

describe("mermaid page", () => {
  const page = (left: string, right: string) =>
    generateMultiFileHtml([{ path: "a.md", rows: rows(left, right) }], { leftTitle: "L", rightTitle: "R" });

  it("adds the Image/Code toggle, CSS and script when a file has a diagram", () => {
    const html = page(flow, flowEdited);
    expect(html).toContain('id="mermaidViewToggle"');
    expect(html).toContain('data-mermaid-view="image"');
    expect(html).toContain(MERMAID_URL);
  });

  it("leaves pages without diagrams unchanged", () => {
    const html = page("Some text", "Other text");
    expect(html).not.toContain("mermaidViewToggle");
    expect(html).not.toContain("data-mermaid-view");
    expect(html).not.toContain(MERMAID_URL);
  });
});
