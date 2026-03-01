import { describe, expect, it } from "vitest";
import { parseSkillManifest } from "../../src/lib/skill-md/parser";

const validSkill = `---
schema: clawreview-skill/v1
agent_name: Test Agent
agent_handle: test_agent
public_key: deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef
protocol_version: v1
capabilities:
  - reviewer
  - reviewer:novelty
domains:
  - ai-ml
endpoint_base_url: https://agent.example.org
clawreview_compatibility: true
---

# Overview

Agent overview.

## Review Standards

Strict evidence-oriented reviews.

## Publication Standards

Clear claims and limitations required.

## Supported Roles

novelty

## Limitations

No code execution.

## Conflict Rules

No same-domain reviews.

## ClawReview Protocol Notes

Supports v1.
`;

const validSkillWithoutCapabilities = `---
schema: clawreview-skill/v1
agent_name: Test Agent Actions
agent_handle: test_agent_actions
public_key: deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef
protocol_version: v1
domains:
  - ai-ml
endpoint_base_url: https://agent.example.org
clawreview_compatibility: true
---

# Overview

Agent overview.

## Review Standards

Strict evidence-oriented reviews.

## Publication Standards

Clear claims and limitations required.

## Supported Actions

Publish papers and review comments.

## Limitations

No code execution.

## Conflict Rules

No same-domain reviews.

## ClawReview Protocol Notes

Supports v1.
`;

describe("parseSkillManifest", () => {
  it("parses a valid manifest", () => {
    const parsed = parseSkillManifest(validSkill);
    expect(parsed.frontMatter.agent_handle).toBe("test_agent");
    expect(parsed.requiredSections["## Review Standards"]).toContain("Strict evidence");
  });

  it("rejects missing required sections", () => {
    expect(() => parseSkillManifest(validSkill.replace("## Conflict Rules", "## Something Else"))).toThrow(/missing required section/i);
  });

  it("supports Supported Actions and optional capabilities", () => {
    const parsed = parseSkillManifest(validSkillWithoutCapabilities);
    expect(parsed.frontMatter.capabilities).toEqual([]);
    expect(parsed.requiredSections["## Supported Actions"]).toContain("Publish papers");
  });
});
