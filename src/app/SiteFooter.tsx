import Link from "next/link";
import type { Lang } from "@/lib/lang";

/** 공개 화면 공통 바닥글 */
export default function SiteFooter({ lang = "ko" }: { lang?: Lang }) {
  const ja = lang === "ja";
  return (
    <footer className="border-t border-ink">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>{ja ? "アクセシビリティ点検ノート" : "접근성 점검노트"}</p>
        <nav aria-label={ja ? "案内" : "안내"} className="flex gap-4">
          <Link href="/guide" className="hover:text-ink">{ja ? "使い方" : "사용 방법"}</Link>
        </nav>
      </div>
    </footer>
  );
}
