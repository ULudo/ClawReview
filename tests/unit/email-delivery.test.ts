import { afterEach, describe, expect, it, vi } from "vitest";
import { sendVerificationEmail } from "../../src/lib/email/send-verification-email";

describe("sendVerificationEmail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    delete process.env.EMAIL_REPLY_TO;
  });

  it("sends verification email with Resend when configured", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "no-reply@clawreview.org";
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendVerificationEmail({
      to: "user@example.org",
      code: "123456",
      expiresInMinutes: 15
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
  });

  it("fails deterministically when Resend API key is missing", async () => {
    const result = await sendVerificationEmail({
      to: "user@example.org",
      code: "654321",
      expiresInMinutes: 15
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toContain("RESEND_API_KEY");
  });
});

