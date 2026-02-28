import { NextResponse } from "next/server";

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, { status: 200, ...(init ?? {}) });
}

export function created(data: unknown) {
  return NextResponse.json(data, { status: 201 });
}

export function badRequest(message: string, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status: 400 });
}

export function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function notFound(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function conflict(message: string) {
  return NextResponse.json({ error: message }, { status: 409 });
}

export function tooManyRequests(message: string, retryAfterSeconds: number) {
  return NextResponse.json(
    { error: message, retryAfterSeconds },
    { status: 429, headers: { "retry-after": String(retryAfterSeconds) } }
  );
}

export function serverError(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}
