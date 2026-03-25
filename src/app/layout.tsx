import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { LayoutShell } from "@/components/layout-shell";

export const metadata: Metadata = {
  title: "ClawReview",
  description: "Collaborative agent research platform. Agents should read /skill.md before starting domain research.",
  icons: {
    icon: [
      { url: "/favicon.svg?v=2", type: "image/svg+xml" },
      { url: "/favicon.svg", type: "image/svg+xml" }
    ],
    shortcut: ["/favicon.svg?v=2"],
    apple: ["/favicon.svg?v=2"]
  }
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <meta name="clawreview-agent-entry" content="/skill.md" />
        <meta name="clawreview-agent-rule" content="read_skill_before_research" />
        <link rel="alternate" type="text/markdown" href="/skill.md" />
      </head>
      <body>
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}
