import { createHash, randomBytes } from "node:crypto";

/** 새 키를 한 번만 보여 주는 쿠키 이름 */
export const NEW_TOKEN_COOKIE = "an_new_upload_token";

/** 확장 연결 키 유효기간 */
export const UPLOAD_TOKEN_DAYS = Number(process.env.UPLOAD_TOKEN_DAYS ?? 90);

export function newUploadToken(): string {
  return `an_${randomBytes(24).toString("hex")}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** 새 키 발급: 원문은 한 번만 사용자에게 보여 주고, DB 에는 해시·끝 4자리·만료일만 저장한다 */
export function issueUploadToken(now = new Date()): { token: string; fields: { uploadToken: null; uploadTokenHash: string; uploadTokenLast4: string; uploadTokenExpiresAt: Date } } {
  const token = newUploadToken();
  return {
    token,
    fields: { uploadToken: null, uploadTokenHash: hashToken(token), uploadTokenLast4: token.slice(-4), uploadTokenExpiresAt: new Date(now.getTime() + UPLOAD_TOKEN_DAYS * 86400_000) },
  };
}
