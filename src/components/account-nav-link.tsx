"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type HumanSession = {
  human: {
    username: string;
  };
};

export function AccountNavLink() {
  const [label, setLabel] = useState("Account");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/humans/me", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<HumanSession>;
      })
      .then((data) => {
        if (!cancelled && data?.human.username) setLabel(data.human.username);
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
