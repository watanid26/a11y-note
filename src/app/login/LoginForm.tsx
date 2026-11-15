"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { getBrowserSupabase } from "@/lib/auth/supabase-browser";
import {
  resendConfirm,
  sendPasswordSetup,
  signInPassword,
  signUpPassword,
  type AuthState,
} from "./actions";

type Mode = "login" | "signup" | "reset" | "link";

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary h-12 w-full text-base" disabled={pending}>
      {pending ? busy : label}
    </button>
  );
}

function Notice({ state }: { state: AuthState }) {
  if (state.error)
    return (
      <p
        role="alert"
        className="rounded-md bg-bad-soft px-3 py-2 text-sm text-bad"
      >
        {state.error}
      </p>
    );
  if (state.info)
    return (
      <p
        role="status"
        className="rounded-md bg-ok-soft px-3 py-2 text-sm text-ok"
      >
        {state.info}
      </p>
    );
  return null;
}

export default function LoginForm({
  next,
  supabaseUrl,
  supabaseAnonKey,
  ja = false,
}: {
  next: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  ja?: boolean;
}) {
  const t = (ko: string, jp: string) => (ja ? jp : ko);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [login, loginAction] = useFormState(signInPassword, {});
  const [signup, signupAction] = useFormState(signUpPassword, {});
  const [reset, resetAction] = useFormState(sendPasswordSetup, {});
  const [resend, resendAction] = useFormState(resendConfirm, {});
  const [link, setLink] = useState<AuthState & { sending?: boolean }>({});

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setLink({ sending: true });
    const supabase = getBrowserSupabase(supabaseUrl, supabaseAnonKey);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        shouldCreateUser: false,
      },
    });
    setLink(
      error
        ? { error: t("보내지 못했어요. 가입한 이메일이 맞는지 확인해 주세요.", "送信できませんでした。登録したメールアドレスか確認してください。") }
        : { info: t(`${email} 로 로그인 링크를 보냈어요.`, `${email} にログインリンクを送りました。`) },
    );
  }

  const emailField = (
    <>
      <label className="label" htmlFor="email">
        {t("이메일", "メールアドレス")}
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="name@company.com"
        className="input h-12"
      />
    </>
  );

  return (
    <div className="mt-6 space-y-4">
      {(mode === "login" || mode === "signup") && (
        <div
          role="tablist"
          aria-label={t("로그인 또는 가입", "ログインまたは新規登録")}
          className="grid grid-cols-2 rounded-lg bg-bg p-1"
        >
          {(
            [
              ["login", t("로그인", "ログイン")],
              ["signup", t("가입하기", "新規登録")],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              role="tab"
              aria-selected={mode === k}
              type="button"
              onClick={() => setMode(k)}
              className={`h-10 rounded-sm text-sm ${mode === k ? "bg-surface font-semibold" : "text-muted"}`}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {mode === "login" && (
        <div className="space-y-3">
          <form action={loginAction} className="space-y-3">
            <input type="hidden" name="next" value={next} />
            {emailField}
            <label className="label" htmlFor="password">
              {t("비밀번호", "パスワード")}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="input h-12"
            />
            <Submit label={t("로그인", "ログイン")} busy={t("확인 중…", "確認中…")} />
            <Notice state={login} />
          </form>
          {login.unconfirmed && (
            <form action={resendAction}>
              <input type="hidden" name="email" value={email} />
              <input type="hidden" name="next" value={next} />
              <button className="link text-sm">{t("가입 확인 메일 다시 받기", "確認メールをもう一度受け取る")}</button>
              <Notice state={resend} />
            </form>
          )}
          <div className="flex justify-between text-sm">
            <button
              type="button"
              className="link"
              onClick={() => setMode("reset")}
            >
              {t("비밀번호 찾기·처음 정하기", "パスワードを忘れた・はじめて設定する")}
            </button>
            <button
              type="button"
              className="text-muted hover:text-ink"
              onClick={() => setMode("link")}
            >
              {t("메일 링크로 로그인", "メールのリンクでログイン")}
            </button>
          </div>
        </div>
      )}

      {mode === "signup" && (
        <form action={signupAction} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          {emailField}
          <label className="label" htmlFor="password">
            {t("비밀번호 (8자 이상)", "パスワード（8文字以上）")}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className="input h-12"
          />
          <label className="label" htmlFor="password2">
            {t("비밀번호 확인", "パスワード（確認）")}
          </label>
          <input
            id="password2"
            name="password2"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className="input h-12"
          />
          <Submit label={t("가입하기", "新規登録")} busy={t("가입 중…", "登録中…")} />
          <p className="text-xs text-muted">
            {t("가입할 때만 메일 확인을 한 번 해요. 그다음부터는 이메일과 비밀번호로 바로 로그인해요.", "メールの確認は登録時の1回だけです。その後はメールアドレスとパスワードでログインできます。")}
          </p>
          <Notice state={signup} />
        </form>
      )}

      {mode === "reset" && (
        <form action={resetAction} className="space-y-3">
          <p className="text-sm text-muted">
            {t("비밀번호를 잊었거나, 예전에 메일 링크로만 로그인했다면 여기서 비밀번호를 정해요.", "パスワードを忘れたときや、これまでメールのリンクだけでログインしていた場合は、ここでパスワードを設定します。")}
          </p>
          {emailField}
          <Submit label={t("비밀번호 설정 메일 받기", "パスワード設定メールを受け取る")} busy={t("보내는 중…", "送信中…")} />
          <Notice state={reset} />
          <button
            type="button"
            className="link text-sm"
            onClick={() => setMode("login")}
          >
            {t("← 로그인으로", "← ログインへ")}
          </button>
        </form>
      )}

      {mode === "link" && (
        <form onSubmit={sendLink} className="space-y-3">
          <p className="text-sm text-muted">
            {t("비밀번호 없이, 메일로 받은 링크를 눌러 로그인해요.", "パスワードなしで、メールで届いたリンクからログインします。")}
          </p>
          {emailField}
          <button className="btn-secondary h-12 w-full" disabled={link.sending}>
            {link.sending ? t("보내는 중…", "送信中…") : t("로그인 링크 받기", "ログインリンクを受け取る")}
          </button>
          <Notice state={link} />
          <button
            type="button"
            className="link text-sm"
            onClick={() => setMode("login")}
          >
            {t("← 비밀번호로 로그인", "← パスワードでログイン")}
          </button>
        </form>
      )}
    </div>
  );
}
