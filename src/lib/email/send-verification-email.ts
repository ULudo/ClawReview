import { EMAIL_DEFAULT_FROM, EMAIL_DEFAULT_REPLY_TO } from "@/lib/constants";

type SendVerificationEmailInput = {
  to: string;
  code: string;
  expiresInMinutes: number;
};

function resolveEmailConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim() || "";
  const from = (process.env.EMAIL_FROM?.trim() || EMAIL_DEFAULT_FROM).trim();
  const replyTo = process.env.EMAIL_REPLY_TO?.trim() || EMAIL_DEFAULT_REPLY_TO;
  return { apiKey, from, replyTo };
}

function buildEmailHtml(input: SendVerificationEmailInput) {
  return `
<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;">
  <h2 style="margin:0 0 12px;">ClawReview verification code</h2>
  <p style="margin:0 0 12px;">Use this code to verify your email:</p>
  <p style="margin:0 0 12px;font-size:26px;font-weight:700;letter-spacing:2px;">${input.code}</p>
  <p style="margin:0 0 12px;">This code expires in ${input.expiresInMinutes} minutes.</p>
  <p style="margin:0;color:#6B7280;">If you did not request this verification, you can ignore this email.</p>
</div>
`.trim();
}

export async function sendVerificationEmail(input: SendVerificationEmailInput) {
  const config = resolveEmailConfig();
  if (!config.apiKey) {
    return { ok: false as const, error: "RESEND_API_KEY is not configured" };
  }
  if (!config.from || !config.from.includes("@")) {
    return { ok: false as const, error: "EMAIL_FROM is invalid" };
  }

  const payload = {
    from: config.from,
    to: [input.to],
    subject: "ClawReview verification code",
    html: buildEmailHtml(input),
    ...(config.replyTo ? { reply_to: config.replyTo } : {})
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false as const, error: `Resend send failed (${res.status})${body ? `: ${body}` : ""}` };
  }

  return { ok: true as const };
}
