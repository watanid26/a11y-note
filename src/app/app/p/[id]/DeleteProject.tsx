"use client";
// 프로젝트 삭제: 이름을 다시 입력해야 실행 (P0-9)
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteProject({ projectId, name, ja = false }: { projectId: string; name: string; ja?: boolean }) {
  const L = (ko: string, jp: string) => (ja ? jp : ko);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  async function run() {
    setError("");
    const r = await fetch(`/api/projects/${projectId}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmName: typed }) });
    if (!r.ok) return setError((await r.json().catch(() => ({}))).error ?? L("삭제하지 못했어요.", "削除できませんでした。"));
    router.push("/app");
    router.refresh();
  }
  if (!open) return <button className="btn-ghost text-xs text-bad" onClick={() => setOpen(true)}>{L("사이트 삭제…", "サイトを削除…")}</button>;
  return (
    <div className="rounded border border-bad p-3 text-sm" role="group" aria-label={L("사이트 삭제 확인", "サイト削除の確認")}>
      <p>{L("점검 결과와 캡처, 업무 화면 기록이 모두 지워지고 되돌릴 수 없어요. 확인을 위해 사이트 이름 ", "点検結果とキャプチャ、業務の画面の記録がすべて削除され、元に戻せません。確認のためサイト名 ")}<b>{name}</b>{L("을 입력해 주세요.", " を入力してください。")}</p>
      <label className="sr-only" htmlFor="confirm-name">{L("사이트 이름", "サイト名")}</label>
      <input id="confirm-name" className="input mt-2" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      {error && <p className="mt-1 text-xs text-bad" role="alert">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button className="btn-primary" disabled={typed.trim() !== name} onClick={run}>{L("영구 삭제", "完全に削除")}</button>
        <button className="btn-secondary" onClick={() => { setOpen(false); setTyped(""); }}>{L("취소", "キャンセル")}</button>
      </div>
    </div>
  );
}
