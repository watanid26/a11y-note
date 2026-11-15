/**
 * 교정 표시: 화면 캡처 위 빨간 상자와 같은 모양을 목록에서도 쓴다.
 * 확실한 문제 = 실선 빨간 상자, 확인할 것 = 점선 황색 상자, 판정 중 = 점 회색 상자.
 * 색만으로 구분하지 않도록 선 모양이 다르고, 화면 낭독기용 글자를 함께 둔다.
 */
const STYLE: Record<string, { cls: string; label: string; ja: string }> = {
  fail: { cls: "border-2 border-solid border-bad", label: "오류", ja: "問題" },
  review: { cls: "border-2 border-dashed border-warn", label: "오류 의심", ja: "問題の疑い" },
  pending: { cls: "border-2 border-dotted border-muted", label: "판정 중", ja: "判定中" },
  pass: { cls: "border-2 border-solid border-ok bg-ok", label: "오류 아님", ja: "問題なし" },
};

export default function ProofMark({ result, size = 14, ja = false, silent = false }: { result: string; size?: number; ja?: boolean; silent?: boolean }) {
  const s = STYLE[result] ?? STYLE.pending;
  return (
    <span className="inline-flex shrink-0 items-center">
      <span aria-hidden className={`inline-block rounded-[3px] ${s.cls}`} style={{ width: size, height: size }} />
      {!silent && <span className="sr-only">{ja ? s.ja : s.label}</span>}
    </span>
  );
}
