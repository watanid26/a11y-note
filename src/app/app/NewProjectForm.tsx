"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createProject, type FormState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn-primary" disabled={pending}>{pending ? "만드는 중…" : "사이트 만들기"}</button>;
}

export default function NewProjectForm() {
  const [state, action] = useFormState<FormState, FormData>(createProject, {});
  return (
    <form action={action} className="card grid gap-4 p-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="clientName">대상 기관명 <span className="font-normal text-muted">(보고서 표지)</span></label>
        <input id="clientName" name="clientName" className="input" placeholder="예: 한국철도공사" />
      </div>
      <div>
        <label className="label" htmlFor="name">사이트 이름</label>
        <input id="name" name="name" required className="input" placeholder="예: OO시청 홈페이지 개편" />
      </div>
      <div>
        <label className="label" htmlFor="baseUrl">시작 주소</label>
        <input id="baseUrl" name="baseUrl" type="url" required className="input" placeholder="https://www.example.go.kr/" />
      </div>
      <div>
        <label className="label" htmlFor="targetEnvironment">점검 환경</label>
        <select id="targetEnvironment" name="targetEnvironment" className="input" defaultValue="production">
          <option value="production">운영 사이트</option>
          <option value="staging">스테이징·검수 사이트</option>
          <option value="development">개발 사이트</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="pack">점검 기준</label>
        <select id="pack" name="pack" className="input" defaultValue="kwcag22">
          <option value="kwcag22">KWCAG 2.2 (한국, 33개 항목)</option>
          <option value="jis2016">JIS X 8341-3:2016 AA (일본, 38개 달성기준)</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="maxPages">대표 페이지 최대 수</label>
        <input id="maxPages" name="maxPages" type="number" min={1} max={200} defaultValue={40} className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="auditorName">점검 수행 기관·담당팀 <span className="font-normal text-muted">(보고서 표지)</span></label>
        <input id="auditorName" name="auditorName" className="input" placeholder="예: OO웹에이전시 품질팀" />
      </div>
      {state.error && <p className="text-sm text-bad sm:col-span-2" role="alert">{state.error}</p>}
      <div className="sm:col-span-2"><Submit /></div>
    </form>
  );
}
