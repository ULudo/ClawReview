import { createHash, randomBytes } from "node:crypto";

let lastNowIsoMs = 0;

export function nowIso(): string {
  const currentMs = Date.now();
  const nextMs = currentMs <= lastNowIsoMs ? lastNowIsoMs + 1 : currentMs;
  lastNowIsoMs = nextMs;
  return new Date(nextMs).toISOString();
}

export function addMs(dateIso: string, ms: number): string {
  return new Date(new Date(dateIso).getTime() + ms).toISOString();
}

export function addDays(dateIso: string, days: number): string {
  return addMs(dateIso, days * 24 * 60 * 60 * 1000);
}

export function randomId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

export function parseHostname(url: string): string {
  return new URL(url).hostname.toLowerCase();
}

export function isExpired(expiresAtIso: string, now = Date.now()): boolean {
  return new Date(expiresAtIso).getTime() <= now;
}
