"use client";

import { useFormState, useFormStatus } from "react-dom";
import { setPassword } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn-primary h-12 w-full" disabled={pending}>{pending ? "저장 중…" : "비밀번호 저장"}</button>;
}

export default function PasswordForm() {
  const [state, action] = useFormState(setPassword, {});
  return (
    <form action={action} className="space-y-3">
      <label className="label" htmlFor="password">새 비밀번호 (8자 이상)</label>
      <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className="input h-12" />
      <label className="label" htmlFor="password2">비밀번호 확인</label>
      <input id="password2" name="password2" type="password" autoComplete="new-password" minLength={8} required className="input h-12" />
      <Submit />
      {state.error && <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>}
    </form>
  );
}
