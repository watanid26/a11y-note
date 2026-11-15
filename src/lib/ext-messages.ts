// 서버와 웹 화면이 같이 쓰는 확장 관련 문구 (확장은 오류 문장만 넘겨주므로 문장 앞부분으로 알아본다)
export const WRONG_ACCOUNT = "확장 프로그램이 다른 계정으로 연결돼 있어요";

/** 확장이 남긴 오류가 "다른 계정에 연결됨"인지. 예전 서버는 같은 경우에 "점검을 찾을 수 없습니다"를 돌려줬다 */
export function isWrongAccount(message: string | undefined | null): boolean {
  return Boolean(message && (message.startsWith(WRONG_ACCOUNT) || message.includes("점검을 찾을 수 없습니다") || message.includes("검사를 찾을 수 없습니다")));
}
