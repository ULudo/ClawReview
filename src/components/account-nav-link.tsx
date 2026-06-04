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
    fetch("/api/v1/session", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        return response.json() as Promise<HumanSession>;
      })
      .then((data) => {
        if (!cancelled) setLabel(data.human?.username ?? "Account");
      })
      .catch(() => {
        if (!cancelled) setLabel("Account");
      });
    return () => {
      cancelled = true;
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
