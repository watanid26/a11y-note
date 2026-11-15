import Link from "next/link";

/** 확장이 없을 때 보여 주는 안내 */
export default function ExtInstallCard({ compact = false, ja = false }: { compact?: boolean; ja?: boolean }) {
  return (
    <div className="border-l-4 border-brand bg-brand-soft p-5 text-left">
      <p className="text-lg font-semibold text-brand-ink">{ja ? "まずChrome拡張機能を入れてください" : "먼저 크롬 확장 프로그램을 설치해 주세요"}</p>
      <p className="mt-1 text-sm text-ink">
        {ja ? "点検の記録と結果は点検ノートに保存され、ページはお使いのChromeで開いて点検します。入れた後の接続設定は不要です。" : "점검 기록과 결과는 점검노트에 저장되고, 화면은 내 크롬에서 열어 점검해요. 설치한 다음에는 따로 연결할 필요가 없어요."}
      </p>
      {!compact && (
        <p className="mt-1 text-sm text-muted">{ja ? "入れたらこの画面でURLを入れるだけで自動的につながります。" : "설치하고 이 화면에서 사이트 주소를 넣으면 알아서 연결돼요."}</p>
      )}
      <Link href="/app/extension" className="btn-primary mt-3 inline-flex h-11 items-center px-5">{ja ? "インストール方法を見る" : "설치 방법 보기"}</Link>
    </div>
  );
}
