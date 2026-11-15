"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateProjectMetadata, type FormState } from "../../actions";

function Submit({ ja }: { ja: boolean }) {
  const { pending } = useFormStatus();
  return <button className="btn-primary" disabled={pending}>{pending ? (ja ? "保存中…" : "저장 중…") : ja ? "基本情報を保存" : "보고서 정보 저장"}</button>;
}

export default function ProjectMetaForm({ projectId, clientName, auditorName, targetEnvironment, ja = false }: { projectId: string; clientName: string | null; auditorName: string | null; targetEnvironment: string; ja?: boolean }) {
  const [state, action] = useFormState<FormState, FormData>(updateProjectMetadata.bind(null, projectId), {});
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="clientName">{ja ? "対象機関名" : "대상 기관명"}</label>
        <input id="clientName" name="clientName" className="input" defaultValue={clientName ?? ""} placeholder={ja ? "例：○○市" : "예: 한국철도공사"} />
      </div>
      <div>
        <label className="label" htmlFor="targetEnvironment">{ja ? "点検した環境" : "점검 환경"}</label>
        <select id="targetEnvironment" name="targetEnvironment" className="input" defaultValue={targetEnvironment || "production"}>
          <option value="production">{ja ? "本番サイト" : "운영 사이트"}</option>
          <option value="staging">{ja ? "ステージング・検収サイト" : "스테이징·검수 사이트"}</option>
          <option value="development">{ja ? "開発サイト" : "개발 사이트"}</option>
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="auditorName">{ja ? "点検した組織・担当チーム" : "점검 수행 기관·담당팀"}</label>
        <input id="auditorName" name="auditorName" className="input" defaultValue={auditorName ?? ""} placeholder={ja ? "例：○○アクセシビリティ品質チーム" : "예: ○○웹접근성 품질팀"} />
      </div>
      {state.error && <p className="text-sm text-bad sm:col-span-2" role="alert">{state.error}</p>}
      <div className="sm:col-span-2"><Submit ja={ja} /></div>
    </form>
  );
}
