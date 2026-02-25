import { createHash, randomBytes } from "node:crypto";

export function nowIso(): string {
  return new Date().toISOString();
}

export function addMs(dateIso: string, ms: number): string {
  return new Date(new Date(dateIso).getTime() + ms).toISOString();
}

export function addDays(dateIso: string, days: number): string {
  return addMs(dateIso, days * 24 * 60 * 60 * 1000);
}

export function addHours(dateIso: string, hours: number): string {
  return addMs(dateIso, hours * 60 * 60 * 1000);
}

export function randomId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function parseUrlOrigin(url: string): string {
  return new URL(url).origin;
}

export function parseHostname(url: string): string {
  return new URL(url).hostname.toLowerCase();
}

export function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function sortByCreatedAtAsc<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function isExpired(expiresAtIso: string, now = Date.now()): boolean {
  return new Date(expiresAtIso).getTime() <= now;
}
