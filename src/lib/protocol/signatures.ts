import { createPublicKey, timingSafeEqual, verify } from "node:crypto";
import { sha256Hex } from "@/lib/utils";
import type { Agent } from "@/lib/types";

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeMaybeHexOrBase64(input: string): Buffer {
  const trimmed = input.trim();
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
    return Buffer.from(trimmed, "hex");
  }
  return Buffer.from(trimmed, "base64");
}

function createEd25519KeyObject(publicKey: string) {
  const trimmed = publicKey.trim();
  if (trimmed.includes("BEGIN PUBLIC KEY")) {
    return createPublicKey(trimmed);
  }

  const raw = decodeMaybeHexOrBase64(trimmed);
  if (raw.length !== 32) {
    throw new Error("Ed25519 public key must be PEM or raw 32-byte key (hex/base64)");
  }

  return createPublicKey({
    key: {
      kty: "OKP",
      crv: "Ed25519",
      x: base64UrlEncode(raw)
    },
    format: "jwk"
  });
}

function decodeSignature(signature: string): Buffer {
  return decodeMaybeHexOrBase64(signature);
}

export function verifyEd25519Signature(params: {
  publicKey: string;
  message: string;
  signature: string;
}): boolean {
  const key = createEd25519KeyObject(params.publicKey);
  const sig = decodeSignature(params.signature);
  return verify(null, Buffer.from(params.message, "utf8"), key, sig);
}

export interface SignedRequestHeaders {
  agentId: string;
  timestamp: string;
  nonce: string;
  signature: string;
}

export function parseSignedHeaders(headers: Headers): SignedRequestHeaders | null {
  const agentId = headers.get("x-agent-id");
  const timestamp = headers.get("x-timestamp");
  const nonce = headers.get("x-nonce");
  const signature = headers.get("x-signature");
  if (!agentId || !timestamp || !nonce || !signature) {
    return null;
  }
  return { agentId, timestamp, nonce, signature };
}

export function canonicalizeSignedRequest(input: {
  method: string;
  pathname: string;
  timestamp: string;
  nonce: string;
  bodyText: string;
}): string {
  const bodyHash = sha256Hex(input.bodyText || "");
  return [
    input.method.toUpperCase(),
    input.pathname,
    input.timestamp,
    input.nonce,
    bodyHash
  ].join("\n");
}

export function verifySignedRequest(params: {
  agent: Agent;
  method: string;
  pathname: string;
  headers: SignedRequestHeaders;
  bodyText: string;
}): boolean {
  const message = canonicalizeSignedRequest({
    method: params.method,
    pathname: params.pathname,
    timestamp: params.headers.timestamp,
    nonce: params.headers.nonce,
    bodyText: params.bodyText
  });
  return verifyEd25519Signature({
    publicKey: params.agent.publicKey,
    message,
    signature: params.headers.signature
  });
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
