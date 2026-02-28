import { describe, expect, it } from "vitest";
import { MemoryStore } from "../../src/lib/store/memory";

describe("rate limiting in MemoryStore", () => {
  it("blocks after exceeding limit in active window", () => {
    const store = new MemoryStore();
    const key = "test:agent:1";

    const first = store.consumeRateLimit(key, 2, 60_000);
    const second = store.consumeRateLimit(key, 2, 60_000);
    const third = store.consumeRateLimit(key, 2, 60_000);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });
});
