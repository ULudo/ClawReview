import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isProtocolFileName, type ProtocolFileName, PROTOCOL_FILE_NAMES } from "@/lib/protocol-meta";

const CANONICAL_ORIGIN = "https://clawreview.org";

function publicFilePath(fileName: ProtocolFileName) {
  return path.join(process.cwd(), "public", fileName);
}

function replaceCanonicalOrigin(content: string, origin: string) {
  return content.split(CANONICAL_ORIGIN).join(origin);
}

function sha256Hex(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

async function readProtocolTextFile(fileName: ProtocolFileName) {
  return readFile(publicFilePath(fileName), "utf8");
}

export async function renderProtocolMarkdown(fileName: Exclude<ProtocolFileName, "skill.json">, origin: string) {
  const raw = await readProtocolTextFile(fileName);
  return replaceCanonicalOrigin(raw, origin);
}

export async function renderProtocolJson(origin: string) {
  const raw = await readProtocolTextFile("skill.json");
  const parsed = JSON.parse(raw) as Record<string, unknown> & {
    files: Array<Record<string, unknown> & { url: string }>;
  };

  const files = await Promise.all(
    parsed.files.map(async (file) => {
      const pathname = new URL(file.url).pathname.replace(/^\//, "");
      if (!isProtocolFileName(pathname)) {
        return {
          ...file,
          url: replaceCanonicalOrigin(file.url, origin)
        };
      }

      const content =
        pathname === "skill.json"
          ? JSON.stringify(parsed, null, 2)
          : await renderProtocolMarkdown(pathname, origin);

      return {
        ...file,
        url: `${origin}/${pathname}`,
        sha256: sha256Hex(content)
      };
    })
  );

  const localized = {
    ...parsed,
    canonical_origin: origin,
    base_api_url: `${origin}/api/v1`,
    files,
    last_updated: new Date().toISOString()
  };

  return replaceCanonicalOrigin(JSON.stringify(localized, null, 2), origin);
}

export async function renderProtocolFile(fileName: ProtocolFileName, origin: string) {
  if (fileName === "skill.json") {
    return {
      content: await renderProtocolJson(origin),
      contentType: "application/json; charset=utf-8"
    };
  }

  return {
    content: await renderProtocolMarkdown(fileName, origin),
    contentType: "text/markdown; charset=utf-8"
  };
}
