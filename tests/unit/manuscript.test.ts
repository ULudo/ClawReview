import { describe, expect, it } from "vitest";
import {
  countManuscriptWords,
  countTextWords,
  extractReferencedAssetIds,
  findSemanticBlockCoverage,
  getManuscriptMetrics,
  getMissingSemanticBlocks,
  resolveAssetReference
} from "@/lib/manuscript";

describe("manuscript helpers", () => {
  it("excludes markdown image references from manuscript word count", () => {
    const source = [
      "# Paper",
      "",
      "This manuscript contains enough narrative text to count as words for the limit.",
      "",
      "![Figure 1](asset:asset_abc123)",
      "",
      "The figure reference above should not increase the counted manuscript words."
    ].join("\n");

    expect(countManuscriptWords(source)).toBe(countManuscriptWords(source.replace("![Figure 1](asset:asset_abc123)\n\n", "")));
  });

  it("extracts unique asset ids from markdown references", () => {
    const source = [
      "![Figure 1](asset:asset_abc123)",
      "[Full PNG](asset:asset_def456)",
      "![Figure 1 duplicate](asset:asset_abc123)"
    ].join("\n");

    expect(extractReferencedAssetIds(source)).toEqual(["asset_abc123", "asset_def456"]);
  });

  it("returns normalized manuscript metrics", () => {
    const metrics = getManuscriptMetrics("A short manuscript with words and ![Figure](asset:asset_xyz789)");

    expect(metrics.sourceChars).toBeGreaterThan(0);
    expect(metrics.wordCount).toBeGreaterThan(0);
    expect(metrics.referencedAssetIds).toEqual(["asset_xyz789"]);
  });

  it("resolves asset references only for asset-prefixed values", () => {
    expect(resolveAssetReference("asset:asset_123")).toBe("asset_123");
    expect(resolveAssetReference("https://example.com/a.png")).toBeNull();
  });

  it("counts abstract words independently of manuscript image rules", () => {
    expect(countTextWords("This abstract contains exactly nine meaningful words in total.")).toBe(9);
  });

  it("matches semantic paper blocks with flexible headings", () => {
    const source = [
      "# Title",
      "",
      "## Background and Motivation",
      "Context ".repeat(30),
      "",
      "## Related Work",
      "Prior work ".repeat(30),
      "",
      "## Proposed Approach",
      "Method ".repeat(30),
      "",
      "## Experiments and Results",
      "Evidence ".repeat(30),
      "",
      "## Limitations and Future Work",
      "Conclusion ".repeat(30)
    ].join("\n");

    expect(getMissingSemanticBlocks(source)).toHaveLength(0);
    expect(findSemanticBlockCoverage(source)).toHaveLength(5);
  });

  it("allows one heading to satisfy multiple semantic blocks when combined explicitly", () => {
    const source = [
      "# Title",
      "",
      "## Introduction and Related Work",
      "Context and prior work ".repeat(30),
      "",
      "## Method",
      "Method ".repeat(30),
      "",
      "## Results and Discussion",
      "Evidence ".repeat(30),
      "",
      "## Conclusion and Limitations",
      "Conclusion ".repeat(30)
    ].join("\n");

    const coverage = findSemanticBlockCoverage(source);
    const labels = coverage.map((entry) => entry.block.label);

    expect(getMissingSemanticBlocks(source)).toHaveLength(0);
    expect(labels).toContain("context or problem framing");
    expect(labels).toContain("relation to prior work");
    expect(labels).toContain("conclusion or limitations");
  });

  it("does not treat a top-level summary as a valid conclusion block by itself", () => {
    const source = [
      "# Title",
      "",
      "## Summary",
      "This is an executive summary ".repeat(30),
      "",
      "## Related Work",
      "Prior work ".repeat(30),
      "",
      "## Method",
      "Method ".repeat(30),
      "",
      "## Results",
      "Evidence ".repeat(30)
    ].join("\n");

    const missing = getMissingSemanticBlocks(source).map((entry) => entry.label);

    expect(missing).toContain("context or problem framing");
    expect(missing).toContain("conclusion or limitations");
  });
});
