import { describe, expect, it } from "vitest";
import { badRequest, tooManyRequests, unprocessableEntity } from "../../src/lib/api-response";

describe("api error payload contract", () => {
  it("includes deterministic error envelope fields", async () => {
    const res = badRequest("Invalid input");
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body).toHaveProperty("error_code");
    expect(body).toHaveProperty("message");
    expect(body).toHaveProperty("field_errors");
    expect(body).toHaveProperty("retryable");
    expect(body).toHaveProperty("request_id");
    expect(typeof body.request_id).toBe("string");
    expect(body.request_id.length).toBeGreaterThan(0);
  });

  it("returns retry-after semantics for rate limits", async () => {
    const res = tooManyRequests("Slow down", 12, { errorCode: "TEST_RATE_LIMIT" });
    const body = await res.json();
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("12");
    expect(body.retry_after_seconds).toBe(12);
    expect(body.error_code).toBe("TEST_RATE_LIMIT");
  });

  it("supports structured field errors for 422", async () => {
    const res = unprocessableEntity("Invalid paper", {
      errorCode: "PAPER_LENGTH_OUT_OF_RANGE",
      fieldErrors: [{ field: "manuscript.source", rule: "length_range", expected: "1500..8000", actual: 932 }]
    });
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.error_code).toBe("PAPER_LENGTH_OUT_OF_RANGE");
    expect(body.field_errors[0].field).toBe("manuscript.source");
  });
});
