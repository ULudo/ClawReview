import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { MAX_SKILL_MD_BYTES } from "@/lib/constants";
import type { ParsedSkillFrontMatter, ParsedSkillManifest } from "@/lib/types";
import { sha256Hex } from "@/lib/utils";

function isHttpsOrLocalDevHttp(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    if (process.env.ALLOW_UNSIGNED_DEV?.toLowerCase() === "true" && url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

const skillFrontMatterSchema = z.object({
  schema: z.literal("clawreview-skill/v1"),
  agent_name: z.string().min(1),
  agent_handle: z.string().regex(/^[a-zA-Z0-9_-]{2,40}$/),
  public_key: z.string().min(16),
  protocol_version: z.literal("v1"),
  capabilities: z.array(z.string().min(1)).min(1),
  domains: z.array(z.string().min(1)).min(1),
  endpoint_base_url: z.string().url().refine(isHttpsOrLocalDevHttp, "endpoint_base_url must use https (or http://localhost in dev mode)"),
  contact: z.string().min(1),
  clawreview_compatibility: z.literal(true)
});

const REQUIRED_SECTIONS = [
  "# Overview",
  "## Review Standards",
  "## Publication Standards",
  "## Supported Roles",
  "## Limitations",
  "## Conflict Rules",
  "## ClawReview Protocol Notes"
] as const;

export class SkillManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillManifestError";
  }
}

function splitFrontMatter(raw: string): { frontMatterText: string; body: string } {
  if (!raw.startsWith("---\n")) {
    throw new SkillManifestError("skill.md must start with YAML front matter");
  }
  const end = raw.indexOf("\n---\n", 4);
  if (end < 0) {
    throw new SkillManifestError("invalid YAML front matter delimiter");
  }
  const frontMatterText = raw.slice(4, end);
  const body = raw.slice(end + 5);
  return { frontMatterText, body };
}

function extractSectionContent(body: string, heading: string): string {
  const lines = body.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === heading);
  if (startIndex < 0) {
    throw new SkillManifestError(`missing required section: ${heading}`);
  }

  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("# ") || trimmed.startsWith("## ")) {
      endIndex = i;
      break;
    }
  }

  const content = lines.slice(startIndex + 1, endIndex).join("\n").trim();
  if ((heading === "## Review Standards" || heading === "## Publication Standards") && !content) {
    throw new SkillManifestError(`${heading} must not be empty`);
  }
  return content;
}

export function parseSkillManifest(raw: string): ParsedSkillManifest {
  if (Buffer.byteLength(raw, "utf8") > MAX_SKILL_MD_BYTES) {
    throw new SkillManifestError(`skill.md exceeds max size of ${MAX_SKILL_MD_BYTES} bytes`);
  }

  const { frontMatterText, body } = splitFrontMatter(raw);
  const parsedYaml = parseYaml(frontMatterText);
  const frontMatter = skillFrontMatterSchema.parse(parsedYaml) as ParsedSkillFrontMatter;

  const requiredSections: Record<string, string> = {};
  for (const heading of REQUIRED_SECTIONS) {
    requiredSections[heading] = extractSectionContent(body, heading);
  }

  return {
    frontMatter,
    body,
    requiredSections,
    raw,
    sha256: sha256Hex(raw)
  };
}

export async function fetchAndParseSkillManifest(skillMdUrl: string): Promise<ParsedSkillManifest> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(skillMdUrl, {
      headers: {
        accept: "text/markdown,text/plain;q=0.9,*/*;q=0.1"
      },
      signal: controller.signal,
      cache: "no-store"
    });
    if (!res.ok) {
      throw new SkillManifestError(`failed to fetch skill.md (${res.status})`);
    }
    const text = await res.text();
    return parseSkillManifest(text);
  } catch (error) {
    if (error instanceof SkillManifestError) {
      throw error;
    }
    throw new SkillManifestError(error instanceof Error ? error.message : "failed to fetch skill.md");
  } finally {
    clearTimeout(timeout);
  }
}
