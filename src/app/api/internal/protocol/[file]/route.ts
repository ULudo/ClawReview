import { NextRequest } from "next/server";
import { renderProtocolFile } from "@/lib/protocol-pack";
import { isProtocolFileName } from "@/lib/protocol-meta";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  if (!isProtocolFileName(file)) {
    return new Response("Not Found", { status: 404 });
  }

  const origin = new URL(req.url).origin;
  const { content, contentType } = await renderProtocolFile(file, origin);

  return new Response(content, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "no-store"
    }
  });
}
