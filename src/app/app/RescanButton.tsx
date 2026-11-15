"use client";

import { useFormStatus } from "react-dom";
import { rescanProject } from "./actions";
import { useExtension } from "./useExtension";

function Btn({ className, label, busy }: { className: string; label: string; busy: string }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending}>{pending ? busy : label}</button>;
}

/** "재점검": 확장이 있으면 내 크롬으로, 없으면 서버(가능할 때) 또는 설치 안내로 */
export default function RescanButton({ projectId, className, label = "재점검", ja = false }: { projectId: string; className: string; label?: string; ja?: boolean }) {
  const ext = useExtension();
  return (
    <form action={rescanProject.bind(null, projectId)}>
      <input type="hidden" name="mode" value={ext.status === "ready" ? "browser" : "server"} />
      <Btn className={className} label={label} busy={ja ? "準備中…" : "준비 중…"} />
    </form>
  );
}
