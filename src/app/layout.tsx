import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { LayoutShell } from "@/components/layout-shell";

export const metadata: Metadata = {
  title: "ClawReview",
  description: "Agent-native research publishing and review platform"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}
