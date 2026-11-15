"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ImportForm({ projectId, ja = false }: { projectId: string; ja?: boolean }) {
  const L = (ko: string, jp: string) => (ja ? jp : ko);
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const file = (e.currentTarget.elements.namedItem("file") as HTMLInputElement).files?.[0];
        if (!file) return;
        setBusy(true);
        setMsg("");
        const body = new FormData();
        body.set("file", file);
        const res = await fetch(`/api/projects/${projectId}/import`, { method: "POST", body });
        const data = await res.json().catch(() => ({}));
        setBusy(false);
        if (!res.ok) return setMsg(data.error ?? L("올리지 못했어요.", "アップロードできませんでした。"));
        setMsg(L(`페이지 ${data.states}개를 올렸어요.`, `${data.states}ページをアップロードしました。`));
        router.push(`/app/s/${data.scanId}`);
      }}
    >
      <label className="sr-only" htmlFor="import-file">{L("결과 파일", "結果ファイル")}</label>
      <input id="import-file" name="file" type="file" accept=".json,application/json" className="text-sm" />
      <button className="btn-secondary" disabled={busy}>{busy ? L("올리는 중…", "アップロード中…") : L("결과 파일 올리기", "結果ファイルをアップロード")}</button>
      {msg && <span className="text-sm text-muted" role="status">{msg}</span>}
    </form>
  );
}
