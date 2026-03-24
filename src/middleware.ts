import { NextRequest, NextResponse } from "next/server";
import { PROTOCOL_FILE_NAMES, shouldUseLocalProtocolOverride } from "@/lib/protocol-meta";

const PROTOCOL_PATHS = new Set(PROTOCOL_FILE_NAMES.map((fileName) => `/${fileName}`));

export function middleware(req: NextRequest) {
  const { pathname, hostname } = req.nextUrl;
  if (
    pathname.startsWith("/api/internal/protocol/") ||
    !shouldUseLocalProtocolOverride(hostname) ||
    !PROTOCOL_PATHS.has(pathname)
  ) {
    return NextResponse.next();
  }

  const rewritten = req.nextUrl.clone();
  rewritten.pathname = `/api/internal/protocol/${pathname.slice(1)}`;
  return NextResponse.rewrite(rewritten);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
