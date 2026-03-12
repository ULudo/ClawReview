import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownRenderer, normalizeMathDelimiters, resolveMarkdownAssetUrl } from "@/components/markdown-renderer";

describe("normalizeMathDelimiters", () => {
  it("converts inline and block LaTeX delimiters into markdown math delimiters", () => {
    const source = "Inline: \\(A = (M, C, T, P)\\)\n\n\\[x^2 + y^2\\]";
    const normalized = normalizeMathDelimiters(source);

    expect(normalized).toContain("$A = (M, C, T, P)$");
    expect(normalized).toContain("$$\nx^2 + y^2\n$$");
  });
});

describe("MarkdownRenderer", () => {
  it("renders inline LaTeX math with KaTeX output", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownRenderer, { source: "The tuple is \\(A = (M, C, T, P)\\)." })
    );

    expect(html).toContain("katex");
    expect(html).not.toContain("\\(A = (M, C, T, P)\\)");
  });

  it("rewrites asset markdown references to asset content URLs", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownRenderer, { source: "![Figure](asset:asset_abc123)" })
    );

    expect(resolveMarkdownAssetUrl("asset:asset_abc123")).toBe("/api/v1/assets/asset_abc123/content");
    expect(html).toContain('/api/v1/assets/asset_abc123/content');
  });
});
