import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
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
  capabilities: z.array(z.string().min(1)).default([]),
  domains: z.array(z.string().min(1)).min(1),
  endpoint_base_url: z.string().url().refine(isHttpsOrLocalDevHttp, "endpoint_base_url must use https (or http://localhost in dev mode)"),
  clawreview_compatibility: z.literal(true)
});

const REQUIRED_SECTIONS = [
  "# Overview",
  "## Review Standards",
  "## Publication Standards",
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

function supportedActionsHeading(body: string) {
  const normalized = body.replace(/\r\n/g, "\n");
  if (normalized.includes("\n## Supported Actions\n")) {
    return "## Supported Actions";
  }
  return "## Supported Roles";
}

function isLocalHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function isPrivateIpv4(ip: string) {
  const parts = ip.split(".").map((v) => Number(v));
  if (parts.length !== 4 || parts.some((v) => Number.isNaN(v) || v < 0 || v > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateIpv6(ip: string) {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local
  if (normalized.startsWith("fe80:")) return true; // link-local
  return false;
}

function isPrivateIp(ip: string) {
  const version = isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) return isPrivateIpv6(ip);
  return false;
}

async function assertSafeSkillMdUrl(urlText: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(urlText);
  } catch {
    throw new SkillManifestError("skill.md URL is invalid");
  }

  if (url.username || url.password) {
    throw new SkillManifestError("skill.md URL must not include credentials");
  }

  const isDevLocal = process.env.ALLOW_UNSIGNED_DEV?.toLowerCase() === "true" && url.protocol === "http:" && isLocalHost(url.hostname);
  if (!(url.protocol === "https:" || isDevLocal)) {
    throw new SkillManifestError("skill.md URL must use https (or localhost http in dev mode)");
  }

  if (isDevLocal) return;

  if (isLocalHost(url.hostname)) {
    throw new SkillManifestError("localhost skill.md URLs are not allowed outside local dev mode");
  }

  if (isIP(url.hostname)) {
    if (isPrivateIp(url.hostname)) {
      throw new SkillManifestError("skill.md URL must not target private or loopback IP addresses");
    }
    return;
  }

  let resolved: Array<{ address: string; family: number }>;
  try {
    resolved = (await lookup(url.hostname, { all: true })) as Array<{ address: string; family: number }>;
  } catch {
    throw new SkillManifestError("could not resolve skill.md host");
  }
  if (!resolved.length) {
    throw new SkillManifestError("skill.md host did not resolve to an IP");
  }
  if (resolved.some((entry) => isPrivateIp(entry.address))) {
    throw new SkillManifestError("skill.md host resolves to a private or loopback IP");
  }
}

export function parseSkillManifest(raw: string): ParsedSkillManifest {
  if (Buffer.byteLength(raw, "utf8") > MAX_SKILL_MD_BYTES) {
    throw new SkillManifestError(`skill.md exceeds max size of ${MAX_SKILL_MD_BYTES} bytes`);
  }

  const { frontMatterText, body } = splitFrontMatter(raw);
  const parsedYaml = parseYaml(frontMatterText);
  const frontMatter = skillFrontMatterSchema.parse(parsedYaml) as ParsedSkillFrontMatter;

  const requiredSections: Record<string, string> = {};
  const actionSectionHeading = supportedActionsHeading(body);
  requiredSections[actionSectionHeading] = extractSectionContent(body, actionSectionHeading);
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
  await assertSafeSkillMdUrl(skillMdUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    let currentUrl = skillMdUrl;
    let redirects = 0;
    // Validate every redirect hop to prevent SSRF pivoting.
    while (true) {
      const res = await fetch(currentUrl, {
        headers: {
          accept: "text/markdown,text/plain;q=0.9,*/*;q=0.1"
        },
        signal: controller.signal,
        cache: "no-store",
        redirect: "manual"
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) {
          throw new SkillManifestError("skill.md redirect response is missing Location header");
        }
        redirects += 1;
        if (redirects > 3) {
          throw new SkillManifestError("too many redirects while fetching skill.md");
        }
        currentUrl = new URL(location, currentUrl).toString();
        await assertSafeSkillMdUrl(currentUrl);
        continue;
      }

      if (!res.ok) {
        throw new SkillManifestError(`failed to fetch skill.md (${res.status})`);
      }
      const text = await res.text();
      return parseSkillManifest(text);
    }
  } catch (error) {
    if (error instanceof SkillManifestError) {
      throw error;
    }
    throw new SkillManifestError(error instanceof Error ? error.message : "failed to fetch skill.md");
  } finally {
    clearTimeout(timeout);
  }
}
