import { describe, expect, it } from "vitest";
import { paperSubmissionRequestSchema } from "../../src/lib/schemas";

const longText = "This section explains the content in sufficient detail for review reproducibility and evidence tracking. ".repeat(4);

const validMarkdown = `# Sample Paper

## Introduction
${longText}

## Literature Review
${longText}

## Problem Statement
${longText}

## Method
${longText}

## Evaluation
${longText}

## Conclusion
${longText}
`;

const flexibleMarkdown = `# Sample Paper

## Background and Motivation
${longText}

## Related Work
${longText}

## Proposed Approach
${longText}

## Experiments and Results
${longText}

## Limitations and Future Work
${longText}
`;

const combinedHeadingMarkdown = `# Sample Paper

## Introduction and Related Work
${longText}${longText}

## Proposed Method
${longText}${longText}

## Results and Discussion
${longText}${longText}

## Conclusion and Limitations
${longText}${longText}
`;

describe("paperSubmissionRequestSchema", () => {
  it("accepts markdown paper with required section structure", () => {
    const parsed = paperSubmissionRequestSchema.safeParse({
      publisher_agent_id: "agent_1",
      title: "A Structured Test Paper",
      abstract: "This abstract is intentionally longer than eighty characters so that the validation passes correctly.",
      domains: ["ai-ml"],
      keywords: ["agents"],
      claim_types: ["theory"],
      language: "en",
      references: [],
      manuscript: {
        format: "markdown",
        source: validMarkdown
      }
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts markdown paper with flexible semantic headings", () => {
    const parsed = paperSubmissionRequestSchema.safeParse({
      publisher_agent_id: "agent_1",
      title: "A Structured Test Paper",
      abstract: "This abstract is intentionally longer than eighty characters so that the validation passes correctly.",
      domains: ["ai-ml"],
      keywords: ["agents"],
      claim_types: ["theory"],
      language: "en",
      references: [],
      manuscript: {
        format: "markdown",
        source: flexibleMarkdown
      }
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts markdown paper with combined semantic headings", () => {
    const parsed = paperSubmissionRequestSchema.safeParse({
      publisher_agent_id: "agent_1",
      title: "A Structured Test Paper",
      abstract: "This abstract is intentionally longer than eighty characters so that the validation passes correctly.",
      domains: ["ai-ml"],
      keywords: ["agents"],
      claim_types: ["theory"],
      language: "en",
      references: [],
      manuscript: {
        format: "markdown",
        source: combinedHeadingMarkdown
      }
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects markdown paper missing required headings", () => {
    const parsed = paperSubmissionRequestSchema.safeParse({
      publisher_agent_id: "agent_1",
      title: "A Structured Test Paper",
      abstract: "This abstract is intentionally longer than eighty characters so that the validation passes correctly.",
      domains: ["ai-ml"],
      keywords: ["agents"],
      claim_types: ["theory"],
      language: "en",
      references: [],
      manuscript: {
        format: "markdown",
        source: "## Introduction\nShort section"
      }
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects manuscript shorter than minimum length", () => {
    const parsed = paperSubmissionRequestSchema.safeParse({
      publisher_agent_id: "agent_1",
      title: "A Structured Test Paper",
      abstract: "This abstract is intentionally longer than eighty characters so that the validation passes correctly.",
      domains: ["ai-ml"],
      keywords: ["agents"],
      claim_types: ["theory"],
      language: "en",
      references: [],
      manuscript: {
        format: "markdown",
        source: "short"
      }
    });
    expect(parsed.success).toBe(false);
  });

  it("does not count image references toward manuscript word limits", () => {
    const parsed = paperSubmissionRequestSchema.safeParse({
      publisher_agent_id: "agent_1",
      title: "A Structured Test Paper",
      abstract: "This abstract is intentionally longer than eighty characters so that the validation passes correctly.",
      domains: ["ai-ml"],
      keywords: ["agents"],
      claim_types: ["theory"],
      language: "en",
      references: [],
      attachment_asset_ids: ["asset_123"],
      manuscript: {
        format: "markdown",
        source: `${validMarkdown}\n![Figure 1](asset:asset_123)\n`
      }
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects abstracts above 300 words", () => {
    const parsed = paperSubmissionRequestSchema.safeParse({
      publisher_agent_id: "agent_1",
      title: "A Structured Test Paper",
      abstract: "Abstract word ".repeat(301),
      domains: ["ai-ml"],
      keywords: ["agents"],
      claim_types: ["theory"],
      language: "en",
      references: [],
      manuscript: {
        format: "markdown",
        source: validMarkdown
      }
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects more than 16 attachment asset ids", () => {
    const parsed = paperSubmissionRequestSchema.safeParse({
      publisher_agent_id: "agent_1",
      title: "A Structured Test Paper",
      abstract: "This abstract is intentionally longer than eighty characters so that the validation passes correctly.",
      domains: ["ai-ml"],
      keywords: ["agents"],
      claim_types: ["theory"],
      language: "en",
      references: [],
      manuscript: {
        format: "markdown",
        source: validMarkdown
      },
      attachment_asset_ids: Array.from({ length: 17 }, (_, idx) => `asset_${idx}`)
    });
    expect(parsed.success).toBe(false);
  });
});
