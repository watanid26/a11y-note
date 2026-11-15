"use server";
// 비밀번호 로그인: 가입할 때만 메일 확인 링크를 한 번 누르고, 그다음부터는 이메일 + 비밀번호로 바로 들어온다.
// 비밀번호를 잊었거나 예전에 링크로만 쓰던 계정은 "비밀번호 설정" 메일을 받아 새로 정한다.
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getServerSupabase } from "@/lib/auth/supabase-server";
import { sanitizeNextPath } from "@/lib/auth/redirect";
import { getClientIp, takeRateLimit } from "@/lib/security/rate-limit";
import { getLang } from "@/lib/lang";

/** 화면 언어에 맞춘 안내 문구 */
const m = (ko: string, ja: string) => (getLang() === "ja" ? ja : ko);

export type AuthState = { error?: string; info?: string; unconfirmed?: boolean };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function siteOrigin(): string {
  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ?? `${proto}://${h.get("host")}`;
}

function limited(kind: string): boolean {
  const ip = getClientIp(headers() as unknown as Headers);
  return !takeRateLimit({ key: `${kind}:${ip}`, limit: 10, windowMs: 60_000 }).allowed;
}

function read(form: FormData) {
  return {
    email: String(form.get("email") ?? "").trim().toLowerCase(),
    password: String(form.get("password") ?? ""),
    next: sanitizeNextPath(String(form.get("next") ?? "")),
  };
}

export async function signInPassword(_: AuthState, form: FormData): Promise<AuthState> {
  if (limited("pw-login")) return { error: m("잠시 후 다시 시도해 주세요.", "しばらくしてからもう一度お試しください。") };
  const { email, password, next } = read(form);
  if (!EMAIL.test(email) || !password) return { error: m("이메일과 비밀번호를 넣어 주세요.", "メールアドレスとパスワードを入れてください。") };
  const { error } = await getServerSupabase().auth.signInWithPassword({ email, password });
  if (error) {
    if (/not confirmed/i.test(error.message)) return { error: m("가입 확인 메일의 링크를 먼저 눌러 주세요. 메일이 없으면 아래에서 다시 받을 수 있어요.", "先に確認メールのリンクを押してください。メールが届いていなければ、下から再送できます。"), unconfirmed: true };
    return { error: m("이메일 또는 비밀번호가 맞지 않아요. 처음이면 '가입하기', 예전에 메일 링크로만 들어왔다면 '비밀번호 찾기'로 비밀번호를 정해 주세요.", "メールアドレスかパスワードが違います。はじめての方は「新規登録」、これまでメールのリンクだけで入っていた方は「パスワードを忘れた」からパスワードを設定してください。") };
  }
  redirect(next);
}

export async function signUpPassword(_: AuthState, form: FormData): Promise<AuthState> {
  if (limited("pw-signup")) return { error: m("잠시 후 다시 시도해 주세요.", "しばらくしてからもう一度お試しください。") };
  const { email, password, next } = read(form);
  if (!EMAIL.test(email)) return { error: m("이메일 주소를 확인해 주세요.", "メールアドレスを確認してください。") };
  if (password.length < 8) return { error: m("비밀번호는 8자 이상으로 정해 주세요.", "パスワードは8文字以上にしてください。") };
  if (password !== String(form.get("password2") ?? "")) return { error: m("비밀번호 확인이 일치하지 않아요.", "確認用のパスワードが一致しません。") };
  const { data, error } = await getServerSupabase().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) {
    if (/already|registered/i.test(error.message)) return { error: m("이미 가입된 이메일이에요. 로그인하거나, 비밀번호를 모르면 '비밀번호 찾기'를 눌러 주세요.", "すでに登録済みのメールアドレスです。ログインするか、パスワードが分からなければ「パスワードを忘れた」を押してください。") };
    if (/password/i.test(error.message)) return { error: m("비밀번호가 너무 쉬워요. 다른 비밀번호로 정해 주세요.", "パスワードが簡単すぎます。別のパスワードにしてください。") };
    return { error: m("가입하지 못했어요. 잠시 후 다시 시도해 주세요.", "登録できませんでした。しばらくしてからもう一度お試しください。") };
  }
  if (data.session) redirect(next);
  // 이미 가입된 이메일이면 Supabase 는 보안상 같은 답(신원 없음)을 준다 → 같은 안내로 답한다
  return { info: m(`${email} 로 가입 확인 메일을 보냈어요. 메일의 링크를 한 번만 누르면 끝이에요. 그다음부터는 이메일과 비밀번호로 바로 로그인해요.`, `${email} に確認メールを送りました。メールのリンクを一度押せば完了です。その後はメールアドレスとパスワードでログインできます。`) };
}

export async function sendPasswordSetup(_: AuthState, form: FormData): Promise<AuthState> {
  if (limited("pw-reset")) return { error: m("잠시 후 다시 시도해 주세요.", "しばらくしてからもう一度お試しください。") };
  const { email } = read(form);
  if (!EMAIL.test(email)) return { error: m("이메일 주소를 확인해 주세요.", "メールアドレスを確認してください。") };
  await getServerSupabase().auth.resetPasswordForEmail(email, { redirectTo: `${siteOrigin()}/auth/callback?next=/app/password` });
  return { info: m(`${email} 로 비밀번호 설정 메일을 보냈어요. 메일의 링크를 누르면 새 비밀번호를 정할 수 있어요.`, `${email} にパスワード設定メールを送りました。メールのリンクから新しいパスワードを設定できます。`) };
}

export async function resendConfirm(_: AuthState, form: FormData): Promise<AuthState> {
  if (limited("pw-resend")) return { error: m("잠시 후 다시 시도해 주세요.", "しばらくしてからもう一度お試しください。") };
  const { email, next } = read(form);
  if (!EMAIL.test(email)) return { error: m("이메일 주소를 확인해 주세요.", "メールアドレスを確認してください。") };
  await getServerSupabase().auth.resend({ type: "signup", email, options: { emailRedirectTo: `${siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}` } });
  return { info: m(`${email} 로 가입 확인 메일을 다시 보냈어요.`, `${email} に確認メールを再送しました。`) };
}
