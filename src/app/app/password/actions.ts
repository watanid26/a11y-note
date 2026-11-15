"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getServerSupabase } from "@/lib/auth/supabase-server";

export async function setPassword(_: { error?: string }, form: FormData): Promise<{ error?: string }> {
  await requireUser();
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "비밀번호는 8자 이상으로 정해 주세요." };
  if (password !== String(form.get("password2") ?? "")) return { error: "비밀번호 확인이 일치하지 않아요." };
  const { error } = await getServerSupabase().auth.updateUser({ password });
  if (error) return { error: /same|different/i.test(error.message) ? "예전과 다른 비밀번호로 정해 주세요." : "저장하지 못했어요. 다시 시도해 주세요." };
  redirect("/app?password=set");
}
