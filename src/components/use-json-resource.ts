"use client";

import { useEffect, useState } from "react";

export type ResourceState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

export async function fetchJsonResource<T>(url: string, fallbackMessage: string) {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.message === "string" ? payload.message : fallbackMessage);
  }
  return payload as T;
}

export function useJsonResource<T>(url: string, fallbackMessage: string) {
  const [state, setState] = useState<ResourceState<T>>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetchJsonResource<T>(url, fallbackMessage)
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: "error", message: error instanceof Error ? error.message : fallbackMessage });
      });
    return () => {
      cancelled = true;
    };
  }, [fallbackMessage, url]);

  return state;
}
