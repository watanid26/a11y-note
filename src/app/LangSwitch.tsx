"use client";

import { useRouter } from "next/navigation";
import type { Lang } from "@/lib/lang";

/** 한국어 ↔ 日本語. 바꾸면 화면 설명과 점검 기준(KWCAG ↔ JIS)이 함께 바뀐다 */
export default function LangSwitch({ lang }: { lang: Lang }) {
  const router = useRouter();
  const set = (l: Lang) => {
    document.cookie = `lang=${l}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };
  return (
    <div role="group" aria-label={lang === "ja" ? "表示言語" : "언어"} className="flex items-center text-sm">
      {([["ko", "한국어"], ["ja", "日本語"]] as const).map(([l, label]) => (
        <button key={l} type="button" lang={l} aria-pressed={lang === l} onClick={() => set(l)} className={`min-h-[44px] px-2 ${lang === l ? "font-semibold text-ink underline underline-offset-4" : "text-muted hover:text-ink"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}
