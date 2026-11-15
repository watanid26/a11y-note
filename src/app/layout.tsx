import type { Metadata } from "next";
import "./globals.css";
import { siteUrl } from "@/lib/site-url";
import { getLang } from "@/lib/lang";

export function generateMetadata(): Metadata {
  const ja = getLang() === "ja";
  return {
    metadataBase: new URL(siteUrl()),
    title: ja ? { default: "アクセシビリティ点検ノート · ウェブアクセシビリティ自己点検", template: "%s · アクセシビリティ点検ノート" } : { default: "접근성 점검노트 · 웹 접근성 자체진단", template: "%s · 접근성 점검노트" },
    description: ja ? "JIS X 8341-3:2016 の達成基準ごとに適合・不適合を判定し、理由と修正方法を報告書にまとめます。" : "KWCAG 2.2 기준으로 사이트를 점검하고, 항목마다 판정과 이유를 점검표와 보고서로 정리해요.",
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={getLang()} suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* App Router 의 루트 레이아웃이라 모든 화면에 적용된다 */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@500;700&family=IBM+Plex+Mono:wght@400;500&display=swap" />
        {getLang() === "ja" && (
          // eslint-disable-next-line @next/next/no-page-custom-font
          <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@500;700&family=Noto+Sans+JP:wght@400;500;700&display=swap" />
        )}
      </head>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2 focus:shadow">{getLang() === "ja" ? "本文へ移動" : "본문 바로가기"}</a>
        {children}
      </body>
    </html>
  );
}
