"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type HumanSession = {
  human: {
    username: string;
  } | null;
};

export function AccountNavLink() {
  const [label, setLabel] = useState("Account");

  useEffect(() => {
    let cancelled = false;

    async function refreshLabel() {
      try {
        const response = await fetch("/api/v1/session", { credentials: "same-origin", cache: "no-store" });
        const data = await response.json() as HumanSession;
        if (!cancelled) setLabel(data.human?.username ?? "Account");
      } catch {
        if (!cancelled) setLabel("Account");
      }
    }

    void refreshLabel();
    window.addEventListener("clawreview:auth-changed", refreshLabel);
    return () => {
      cancelled = true;
      window.removeEventListener("clawreview:auth-changed", refreshLabel);
    };
  }, []);

  return (
    <Link
      href="/account"
      className="max-w-48 truncate rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm hover:border-signal hover:text-signal"
      title={label}
    >
      {label}
    </Link>
  );
}
