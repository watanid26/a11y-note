"use client";

import { useEffect, useState } from "react";
import { detectExtension } from "@/lib/client/ext";

export type ExtState = { status: "checking" | "none" | "ready"; version: string | null };

/** 이 브라우저에 점검노트 크롬 확장이 있는지 */
export function useExtension(): ExtState {
  const [s, setS] = useState<ExtState>({ status: "checking", version: null });
  useEffect(() => {
    let alive = true;
    detectExtension().then((v) => alive && setS({ status: v ? "ready" : "none", version: v }));
    return () => {
      alive = false;
    };
  }, []);
  return s;
}
