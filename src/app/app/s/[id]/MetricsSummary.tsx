// 결과 화면 맨 위 수치. 서류(Word·Excel·Markdown)와 같은 공통 수치 객체와 같은 표기 함수(metricText)를 쓴다.
import { metricText, type ReportMetrics } from "@/lib/report/model";
import { UI_METRIC } from "@/lib/ui-labels";

const ROWS = [
  { key: "confirmed_fail", mark: "판정", cls: "text-bad" },
  { key: "auto_fail", mark: "의심", cls: "text-bad" },
  { key: "review", mark: "확인", cls: "text-warn" },
] as const;

export default function MetricsSummary({ m }: { m: ReportMetrics }) {
  return (
    <dl className="num space-y-1 text-[15px]" aria-label="점검 결과 수치">
      {ROWS.filter((r) => r.key !== "confirmed_fail" || m.confirmed_fail.types > 0).map((r) => (
        <div key={r.key} className="flex flex-wrap gap-x-2">
          <dt className={`font-semibold ${r.cls}`}>{UI_METRIC[r.key]}:</dt>
          <dd>{metricText(m[r.key])}</dd>
        </div>
      ))}
      <div className="flex flex-wrap gap-x-2 text-muted">
        <dt>점검 범위:</dt>
        <dd>
          페이지 {m.pagesChecked}개 · 확인한 항목 {m.itemsConfirmed} / {m.itemsTotal}개
        </dd>
      </div>
    </dl>
  );
}
