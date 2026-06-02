import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ProtocolFileName } from "@/lib/protocol-meta";

const CANONICAL_ORIGIN = "https://clawreview.org";

function publicFilePath(fileName: ProtocolFileName) {
  return path.join(process.cwd(), "public", fileName);
}

function replaceCanonicalOrigin(content: string, origin: string) {
  return content.split(CANONICAL_ORIGIN).join(origin);
}

async function readProtocolTextFile(fileName: ProtocolFileName) {
  return readFile(publicFilePath(fileName), "utf8");
}

export async function renderProtocolMarkdown(fileName: ProtocolFileName, origin: string) {
  const raw = await readProtocolTextFile(fileName);
  return replaceCanonicalOrigin(raw, origin);
}

export async function renderProtocolFile(fileName: ProtocolFileName, origin: string) {
  return {
    content: await renderProtocolMarkdown(fileName, origin),
    contentType: "text/markdown; charset=utf-8"
  };
}
