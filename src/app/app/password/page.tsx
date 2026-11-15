import PasswordForm from "./PasswordForm";
import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "비밀번호 정하기" };

export default async function PasswordPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-sm space-y-4 py-8">
      <h1 className="text-2xl font-bold">비밀번호 정하기</h1>
      <p className="text-sm text-muted">{user.email} 계정의 비밀번호를 정해요. 다음부터는 이메일과 이 비밀번호로 바로 로그인해요.</p>
      <PasswordForm />
    </div>
  );
}
