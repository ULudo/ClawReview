import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, { status: 200, ...(init ?? {}) });
}

export function created(data: unknown) {
  return NextResponse.json(data, { status: 201 });
}

export type ApiFieldError = {
  field: string;
  rule: string;
  expected?: string | number | boolean;
  actual?: unknown;
};

type ApiErrorOptions = {
  errorCode?: string;
  hint?: string;
  fieldErrors?: ApiFieldError[];
  retryable?: boolean;
  requestId?: string;
  retryAfterSeconds?: number;
};

function maybeZodFieldErrors(details?: unknown): ApiFieldError[] {
  if (!details || typeof details !== "object") return [];
  const flattened = details as { fieldErrors?: unknown };
  if (!flattened.fieldErrors || typeof flattened.fieldErrors !== "object") return [];

  const out: ApiFieldError[] = [];
  for (const [field, messages] of Object.entries(flattened.fieldErrors as Record<string, unknown>)) {
    if (!Array.isArray(messages) || messages.length === 0) continue;
    const first = messages.find((item) => typeof item === "string");
    if (!first) continue;
    out.push({
      field,
      rule: "validation",
      expected: String(first)
    });
  }
  return out;
}

function errorJson(status: number, message: string, details?: unknown, options?: ApiErrorOptions) {
  const retryAfterSeconds = options?.retryAfterSeconds ?? 0;
  const fieldErrors = options?.fieldErrors && options.fieldErrors.length > 0
    ? options.fieldErrors
    : maybeZodFieldErrors(details);

  const body = {
    error_code: options?.errorCode ?? "UNKNOWN_ERROR",
    message,
    hint: options?.hint,
    field_errors: fieldErrors,
    retryable: options?.retryable ?? status >= 500,
    request_id: options?.requestId ?? `req_${randomUUID()}`,
    retry_after_seconds: retryAfterSeconds
  };

  const headers: Record<string, string> = {};
  if (retryAfterSeconds > 0) {
    headers["retry-after"] = String(retryAfterSeconds);
  }
  return NextResponse.json(body, { status, headers });
}

export function badRequest(message: string, details?: unknown, options?: ApiErrorOptions) {
  return errorJson(400, message, details, { errorCode: "BAD_REQUEST", ...options });
}

export function unauthorized(message = "Unauthorized", options?: ApiErrorOptions) {
  return errorJson(401, message, undefined, { errorCode: "UNAUTHORIZED", ...options, retryable: false });
}

export function forbidden(message = "Forbidden", options?: ApiErrorOptions) {
  return errorJson(403, message, undefined, { errorCode: "FORBIDDEN", ...options, retryable: false });
}

export function notFound(message = "Not found", options?: ApiErrorOptions) {
  return errorJson(404, message, undefined, { errorCode: "NOT_FOUND", ...options, retryable: false });
}

export function conflict(message: string, options?: ApiErrorOptions) {
  return errorJson(409, message, undefined, { errorCode: "CONFLICT", ...options, retryable: false });
}

export function unprocessableEntity(message: string, options?: ApiErrorOptions) {
  return errorJson(422, message, undefined, { errorCode: "UNPROCESSABLE_ENTITY", ...options, retryable: false });
}

export function tooManyRequests(message: string, retryAfterSeconds: number, options?: ApiErrorOptions) {
  return errorJson(429, message, undefined, {
    errorCode: "RATE_LIMITED",
    ...options,
    retryAfterSeconds,
    retryable: true
  });
}

export function serverError(message: string, options?: ApiErrorOptions) {
  void message;
  return errorJson(500, "Internal server error", undefined, { errorCode: "INTERNAL_ERROR", ...options, retryable: true });
}
