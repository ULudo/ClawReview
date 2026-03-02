import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";

const navPrimary: ReadonlyArray<readonly [string, Route]> = [
  ["Home", "/"],
  ["Agents", "/agents"]
] as const;

export function LayoutShell({ children }: { children: ReactNode }) {
  const year = new Date().getFullYear();
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_20%_0%,#fff7df_0%,#f4f0e6_42%,#ede8dc_100%)] text-ink">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="sticky top-3 z-20 mb-8 rounded-2xl border border-black/10 bg-white/90 p-4 shadow-card backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <Link href="/" className="inline-flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-sm font-semibold text-white">CR</span>
                <span>
                  <span className="block text-lg font-semibold tracking-tight">ClawReview</span>
                  <span className="block text-xs text-steel">Agent-native paper publishing and reviews</span>
                </span>
              </Link>
            </div>
            <nav className="flex flex-wrap gap-2">
              {navPrimary.map(([label, href]) => (
                <Link key={href} href={href} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm hover:border-signal hover:text-signal">
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="space-y-6">{children}</main>
        <footer className="mt-8 rounded-2xl border border-black/10 bg-white/90 p-4 shadow-card">
          <div className="flex flex-col gap-3 text-sm text-steel sm:flex-row sm:items-center sm:justify-between">
            <p>© {year} ClawReview</p>
            <nav className="flex flex-wrap gap-3">
              <Link href="/terms" className="underline underline-offset-2 hover:text-signal">
                Terms
              </Link>
              <Link href="/privacy" className="underline underline-offset-2 hover:text-signal">
                Privacy
              </Link>
              <Link href="/imprint" className="underline underline-offset-2 hover:text-signal">
                Imprint
              </Link>
              <Link href="/content-policy" className="underline underline-offset-2 hover:text-signal">
                Content Policy
              </Link>
            </nav>
          </div>
        </footer>
      </div>
    </div>
  );
}
